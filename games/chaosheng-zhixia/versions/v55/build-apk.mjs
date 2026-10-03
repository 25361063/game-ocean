#!/usr/bin/env node
/**
 * 一键构建 Android APK（不依赖 Android Studio / Gradle）
 *
 * 流程（每一步都可单独复现，便于排查）：
 *   1) aapt2 compile 编译 res/（图标、字符串、主题）
 *   2) aapt2 link    生成 base.apk（含 AndroidManifest、resources.arsc、assets/www）
 *   3) javac         编译 Java（对照 android.jar）
 *   4) d8            把 class 编译成 classes.dex
 *   5) 组装 + zipalign（resources.arsc 必须"不压缩 + 4 字节对齐"，targetSdk 30+ 的硬性要求）
 *   6) apksigner     用调试证书签名（可直接侧载安装）
 *
 * 用法：
 *   npm run fetch-toolchain    # 首次：下载 JDK + Android 平台/构建工具
 *   npm run sync               # 同步游戏资产
 *   npm run build:apk          # 出 dist/潮声之下_手机版_1.0.0.apk
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const APP = path.join(PROJECT, 'app');
const DIST = path.join(PROJECT, 'dist');
const TOOLCHAIN = process.env.ANDROID_TOOLCHAIN_DIR
  ? path.resolve(process.env.ANDROID_TOOLCHAIN_DIR)
  : path.join(PROJECT, '.toolchain');

/* ★ 重要：aapt2 / javac 等工具**不支持含中文的路径**（实测：同一条命令换成 ASCII 路径立刻成功）。
   本工程常放在中文目录下，所以这里自动把构建内容搬到一个 ASCII 临时目录再编译，
   产物最后拷回 mobile/dist/。可用 TIDE_BUILD_STAGE 指定位置。 */
const isAscii = (p) => /^[\x20-\x7E]+$/.test(p);
const STAGE = isAscii(PROJECT)
  ? PROJECT
  : (process.env.TIDE_BUILD_STAGE || path.join(os.tmpdir(), 'tide-android-build'));

const BUILD = path.join(STAGE, 'build');
const STAGE_APP = path.join(STAGE, 'app');
const ANDROID_JAR = path.join(STAGE, 'jar', 'android.jar');

const PACKAGE = 'com.chaosheng.tide';
const APP_LABEL = '潮声之下';
const VERSION = '1.0.0';
const MIN_SDK = '24';
const TARGET_SDK = '34';

const TOOLS = {
  java: path.join(TOOLCHAIN, 'jdk17', 'bin', 'java.exe'),
  javac: path.join(TOOLCHAIN, 'jdk17', 'bin', 'javac.exe'),
  keytool: path.join(TOOLCHAIN, 'jdk17', 'bin', 'keytool.exe'),
  javaHome: path.join(TOOLCHAIN, 'jdk17'),
  androidJarSrc: path.join(TOOLCHAIN, 'platform-34', 'android.jar'),
  aapt2: path.join(TOOLCHAIN, 'build-tools-34', 'aapt2.exe'),
  zipalign: path.join(TOOLCHAIN, 'build-tools-34', 'zipalign.exe'),
  sevenZip: path.join(PROJECT, '..', 'desktop', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
  /* d8 / apksigner 官方只提供 .bat 包装，而新版 Node 不允许直接 spawn .bat/.cmd（CVE-2024-27980 之后），
     所以这里直接调 java + jar —— 等价、更稳，也不受路径里空格与中文影响 */
  d8Jar: path.join(TOOLCHAIN, 'build-tools-34', 'lib', 'd8.jar'),
  apksignerJar: path.join(TOOLCHAIN, 'build-tools-34', 'lib', 'apksigner.jar'),
};

const KS_PASS = 'android';
const KS_ALIAS = 'androiddebugkey';

function step(title) {
  console.log(`\n▶ ${title}`);
}

/** cmd 可以是字符串，也可以是 [exe, ...固定参数] 数组（例如 java -jar xxx.jar） */
function run(cmdOrChain, args, options = {}) {
  const chain = Array.isArray(cmdOrChain) ? cmdOrChain : [cmdOrChain];
  const cmd = chain[0];
  const finalArgs = [...chain.slice(1), ...args];
  const { quiet, ...rest } = options;
  try {
    const out = execFileSync(cmd, finalArgs, {
      encoding: 'utf8',
      /* 大输出命令（7za 解包/打包上万个条目）用 ignore，避免输出缓冲相关问题 */
      stdio: quiet ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JAVA_HOME: TOOLS.javaHome, NODE_OPTIONS: '' },
      ...rest,
    });
    return out || '';
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    console.error(`✗ 命令失败：${path.basename(cmd)}`);
    if (err.message) console.error('   ' + err.message.split('\n')[0]);
    if (stdout.trim()) console.error(stdout.trim().split('\n').slice(-25).join('\n'));
    if (stderr.trim()) console.error(stderr.trim().split('\n').slice(-25).join('\n'));
    throw new Error('构建中断');
  }
}

function walk(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, acc);
    else if (!filter || filter(full)) acc.push(full);
  }
  return acc;
}

function human(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + 'MB' : Math.round(bytes / 1024) + 'KB';
}

function ensureToolchain() {
  const missing = Object.entries(TOOLS)
    .filter(([k]) => k !== 'javaHome' && k !== 'androidJarSrc')
    .filter(([k, p]) => !(k === 'androidJarSrc') && !fs.existsSync(p))
    .map(([k, p]) => `${k} (${p})`);
  if (!fs.existsSync(TOOLS.androidJarSrc)) missing.push('androidJar (' + TOOLS.androidJarSrc + ')');
  if (missing.length) {
    console.error('✗ 工具链不完整，请先执行：npm run fetch-toolchain');
    missing.forEach((m) => console.error('   缺少 ' + m));
    process.exit(1);
  }
  const www = path.join(APP, 'assets', 'www', 'index.html');
  if (!fs.existsSync(www)) {
    console.error('✗ 游戏资产还没同步，请先执行：npm run sync');
    process.exit(1);
  }
}

/** 硬链接优先（同盘几乎零成本），失败退回复制 */
function linkOrCopy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    if (fs.existsSync(to)) fs.unlinkSync(to);
    fs.linkSync(from, to);
    return 'link';
  } catch {
    fs.copyFileSync(from, to);
    return 'copy';
  }
}

function copyTree(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      copyTree(path.join(from, entry.name), path.join(to, entry.name));
    }
  } else {
    linkOrCopy(from, to);
  }
}

/** 把需要编译的东西搬进 ASCII 目录（中文路径下 aapt2/javac 会报"找不到目录"） */
function prepareStage() {
  if (STAGE === PROJECT) {
    console.log(`· 工程路径已是 ASCII，直接原地构建`);
    return;
  }
  console.log(`· 工程路径含非 ASCII 字符，构建搬到：${STAGE}`);
  removeDir(STAGE);
  fs.mkdirSync(STAGE, { recursive: true });
  copyTree(path.join(APP, 'res'), path.join(STAGE_APP, 'res'));
  copyTree(path.join(APP, 'src'), path.join(STAGE_APP, 'src'));
  copyTree(path.join(APP, 'assets'), path.join(STAGE_APP, 'assets'));
  linkOrCopy(path.join(APP, 'AndroidManifest.xml'), path.join(STAGE_APP, 'AndroidManifest.xml'));
  linkOrCopy(TOOLS.androidJarSrc, ANDROID_JAR);
  console.log(`  已就绪（res/src/assets + android.jar）`);
}

/* 注意：不要用 fs.rmSync 删大目录 —— 本环境里它被安全外壳接管（转回收站），
   对上百 MB / 上万文件的目录会长时间卡住。自己递归删最稳。 */
function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDir(full);
    } else {
      try { fs.unlinkSync(full); } catch { /* 个别文件被占用就跳过 */ }
    }
  }
  try { fs.rmdirSync(dir); } catch { /* ignore */ }
}

function freshDir(dir) {
  removeDir(dir);
  fs.mkdirSync(dir, { recursive: true });
}

function build() {
  ensureToolchain();
  prepareStage();
  freshDir(BUILD);
  fs.mkdirSync(DIST, { recursive: true });

  const RES = path.join(STAGE_APP, 'res');
  const MANIFEST = path.join(STAGE_APP, 'AndroidManifest.xml');
  const ASSETS = path.join(STAGE_APP, 'assets');
  const SRC = path.join(STAGE_APP, 'src');

  /* 1) 编译资源 */
  step('aapt2 compile：编译 res/');
  const resZip = path.join(BUILD, 'res.zip');
  run(TOOLS.aapt2, ['compile', '--dir', RES, '-o', resZip]);
  console.log('   ' + human(fs.statSync(resZip).size));

  /* 2) 链接资源 + 清单 + assets */
  step('aapt2 link：生成基础 APK（含 assets/www）');
  const baseApk = path.join(BUILD, 'base.apk');
  run(TOOLS.aapt2, [
    'link',
    '-o', baseApk,
    '-I', ANDROID_JAR,
    '--manifest', MANIFEST,
    '-R', resZip,
    '-A', ASSETS,
    '--min-sdk-version', MIN_SDK,
    '--target-sdk-version', TARGET_SDK,
    '--version-code', '1',
    '--version-name', VERSION,
    '--auto-add-overlay',
  ]);
  console.log('   ' + human(fs.statSync(baseApk).size));

  /* 3) 编译 Java */
  step('javac：编译 Java 源码');
  const classesDir = path.join(BUILD, 'classes');
  fs.mkdirSync(classesDir, { recursive: true });
  const sources = walk(SRC, (f) => f.endsWith('.java'));
  run(TOOLS.javac, [
    '-source', '8', '-target', '8',
    '-encoding', 'UTF-8',
    '-nowarn',
    '-bootclasspath', ANDROID_JAR,
    '-classpath', ANDROID_JAR,
    '-d', classesDir,
    ...sources,
  ]);
  console.log(`   ${sources.length} 个源文件 → ${walk(classesDir, (f) => f.endsWith('.class')).length} 个 class`);

  /* 4) d8 → classes.dex */
  step('d8：生成 classes.dex');
  const dexDir = path.join(BUILD, 'dex');
  fs.mkdirSync(dexDir, { recursive: true });
  const classFiles = walk(classesDir, (f) => f.endsWith('.class'));
  run([TOOLS.java, '-cp', TOOLS.d8Jar, 'com.android.tools.r8.D8'], [
    '--release',
    '--min-api', MIN_SDK,
    '--lib', ANDROID_JAR,
    '--output', dexDir,
    ...classFiles,
  ]);
  const dex = path.join(dexDir, 'classes.dex');
  if (!fs.existsSync(dex)) throw new Error('d8 未生成 classes.dex');
  console.log('   ' + human(fs.statSync(dex).size));

  /* 5) 组装 APK：解包 base.apk → 放 classes.dex → 重新打包 */
  step('组装 APK（解包 base.apk，加入 classes.dex 后重打包）');
  const staging = path.join(BUILD, 'apk');
  fs.mkdirSync(staging, { recursive: true });
  run(TOOLS.sevenZip, ['x', baseApk, `-o${staging}`, '-y', '-bd'], { quiet: true });
  fs.copyFileSync(dex, path.join(staging, 'classes.dex'));

  const unsigned = path.join(BUILD, 'unsigned.apk');
  run(TOOLS.sevenZip, ['a', '-tzip', '-mx9', '-r', unsigned, '*'], { cwd: staging, quiet: true });
  run(TOOLS.sevenZip, ['a', '-tzip', '-mx0', unsigned, 'resources.arsc'], { cwd: staging, quiet: true });
  const listing = run(TOOLS.sevenZip, ['l', '-slt', unsigned]);
  const arscBlock = listing.split(/\r?\n\r?\n/).find((block) => /Path = .*resources\.arsc/.test(block)) || '';
  const arscStored = /Method = Store/.test(arscBlock);
  console.log(`   resources.arsc：${arscStored ? '未压缩（正确）' : '被压缩了（会有安装失败风险）'}`);
  if (!arscStored) {
    console.log('   改用全量不压缩模式重新打包…');
    fs.rmSync(unsigned, { force: true });
    run(TOOLS.sevenZip, ['a', '-tzip', '-mx0', '-r', unsigned, '*'], { cwd: staging, quiet: true });
  }

  /* 6) 对齐 + 签名 */
  step('zipalign + apksigner');
  const aligned = path.join(BUILD, 'aligned.apk');
  run(TOOLS.zipalign, ['-f', '-p', '4', unsigned, aligned]);
  run(TOOLS.zipalign, ['-c', '-v', '4', aligned]);

  /* 调试证书放在 ASCII 目录里（keytool 同样不支持中文路径），并在工具链目录留一份以便复用同一签名 */
  const keystore = path.join(STAGE, 'debug.keystore');
  const keystoreSeed = path.join(TOOLCHAIN, 'debug.keystore');
  if (!fs.existsSync(keystore) && fs.existsSync(keystoreSeed)) {
    fs.copyFileSync(keystoreSeed, keystore);
    console.log('   复用已有调试证书');
  }
  if (!fs.existsSync(keystore)) {
    console.log('   生成调试证书（仅用于侧载安装；上架应用商店请换自己的正式证书）');
    run(TOOLS.keytool, [
      '-genkeypair',
      '-keystore', keystore,
      '-alias', KS_ALIAS,
      '-storepass', KS_PASS,
      '-keypass', KS_PASS,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-dname', 'CN=Chaosheng Tide,OU=Mobile,O=Chaosheng,L=Shenzhen,C=CN',
    ]);
    try { fs.copyFileSync(keystore, keystoreSeed); } catch { /* 留着也行 */ }
  }

  const apkName = `${APP_LABEL}_手机版_${VERSION}.apk`;
  const stagedApk = path.join(BUILD, apkName);
  run([TOOLS.java, '-jar', TOOLS.apksignerJar], [
    'sign',
    '--ks', keystore,
    '--ks-key-alias', KS_ALIAS,
    '--ks-pass', `pass:${KS_PASS}`,
    '--key-pass', `pass:${KS_PASS}`,
    '--v1-signing-enabled', 'true',
    '--v2-signing-enabled', 'true',
    '--out', stagedApk,
    aligned,
  ]);
  const outApk = path.join(DIST, apkName);
  fs.copyFileSync(stagedApk, outApk);

  /* 7) 自检 */
  step('自检');
  const verify = run([TOOLS.java, '-jar', TOOLS.apksignerJar], ['verify', '--print-certs', '-v', stagedApk]);
  const badging = run(TOOLS.aapt2, ['dump', 'badging', stagedApk]);
  const grab = (re) => (badging.match(re) || [null, '?'])[1];
  console.log('   包名         : ' + grab(/package: name='([^']+)'/));
  console.log('   版本         : ' + grab(/versionName='([^']+)'/) + '（code ' + grab(/versionCode='([^']+)'/) + '）');
  console.log('   min/target   : ' + grab(/sdkVersion:'([^']+)'/) + ' / ' + grab(/targetSdkVersion:'([^']+)'/));
  console.log('   应用名       : ' + grab(/application-label:'([^']+)'/));
  console.log('   启动 Activity: ' + grab(/launchable-activity: name='([^']+)'/));
  const verifyLines = verify.split(/\r?\n/).filter((l) => /scheme|Verified|Signer/.test(l)).slice(0, 6);
  verifyLines.forEach((l) => console.log('   ' + l.trim()));
  /* 7-Zip 的列表按平台分隔符显示路径，所以正反斜杠都要认 */
  const assetsListing = run(TOOLS.sevenZip, ['l', stagedApk]);
  const assetsInApk = /assets[\\/]www[\\/]index\.html/i.test(assetsListing);
  const assetCount = (assetsListing.match(/assets[\\/]www[\\/]/gi) || []).length;
  console.log('   游戏资产     : ' + (assetsInApk ? `已打包（assets/www 下 ${assetCount} 个文件）` : '⚠️ 未找到 assets/www/index.html'));

  console.log(`\n✓ 构建完成：dist/${apkName}  ${human(fs.statSync(outApk).size)}`);
  console.log('  安装：手机开 USB 调试后 adb install -r "' + apkName + '"（或拷进手机直接用文件管理器点装）');
}

try {
  build();
} catch (err) {
  console.error('\n构建失败：' + err.message);
  process.exit(1);
}
