#!/usr/bin/env node
/**
 * 下载并解压 Android 打包工具链到 mobile/.toolchain/（不依赖 Android Studio、不依赖 Gradle）
 *
 * 组件（都可从国内可达的源获取；dl.google.com 在本机实测可用）：
 *   · OpenJDK 17            —— javac / keytool（华为云镜像）
 *   · Android platform 34   —— android.jar，编译期 API（dl.google.com）
 *   · Android build-tools 34—— aapt2 / d8 / zipalign / apksigner（dl.google.com）
 *   · platform-tools        —— adb，真机安装与日志（dl.google.com）
 *
 * 用法：npm run fetch-toolchain    （首次约 315MB，之后会跳过已存在的组件）
 * 可选：set ANDROID_TOOLCHAIN_DIR=D:\android-toolchain  自定义存放位置
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const ROOT = process.env.ANDROID_TOOLCHAIN_DIR
  ? path.resolve(process.env.ANDROID_TOOLCHAIN_DIR)
  : path.join(PROJECT, '.toolchain');
const CACHE = path.join(ROOT, 'cache');

const MIRROR_ANDROID = 'https://mirrors.cloud.tencent.com/AndroidSDK/';
const MIRROR_GOOGLE = 'https://dl.google.com/android/repository/';

/* urls 按顺序尝试：国内镜像优先，官方源兜底（本机实测 dl.google.com 时通时断） */
const ITEMS = [
  {
    name: 'jdk17',
    label: 'OpenJDK 17',
    urls: [
      'https://mirrors.huaweicloud.com/openjdk/17.0.2/openjdk-17.0.2_windows-x64_bin.zip',
      'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip',
    ],
    size: 186216309,
    expectDir: /^jdk-17/,
  },
  {
    name: 'platform-34',
    label: 'Android platform 34 (android.jar)',
    urls: [MIRROR_ANDROID + 'platform-34-ext7_r01.zip', MIRROR_GOOGLE + 'platform-34-ext7_r01.zip'],
    size: 63180660,
    expectDir: /^android-\d+/,     // 解压后是 android-34/
    marker: 'android.jar',         // 用于判断是否已就绪（避免半成品被误判为完成）
  },
  {
    name: 'build-tools-34',
    label: 'Android build-tools 34 (aapt2/d8/zipalign/apksigner)',
    urls: [MIRROR_ANDROID + 'build-tools_r34-windows.zip', MIRROR_GOOGLE + 'build-tools_r34-windows.zip'],
    size: 58253258,
    expectDir: /^android-\d+/,     // 这个包解压后是平铺的，走回退逻辑
    marker: 'aapt2.exe',
  },
  {
    name: 'platform-tools',
    label: 'platform-tools (adb)',
    urls: [MIRROR_ANDROID + 'platform-tools-latest-windows.zip', MIRROR_GOOGLE + 'platform-tools-latest-windows.zip'],
    size: 8044989,
    expectDir: /^platform-tools$/,
    marker: 'adb.exe',
  },
];

function sevenZip() {
  const candidates = [
    path.join(PROJECT, '..', 'desktop', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(ROOT, '7za.exe'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('找不到 7za：请先在 desktop/ 里执行 npm install（脚本借用它的 7zip-bin 解压）');
}

/** 流式下载到磁盘（边下边落盘，进度可见；单个源失败自动换源重试） */
async function downloadFrom(urls, dest, expectedSize) {
  let lastError = null;
  for (const url of urls) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const total = Number(res.headers.get('content-length') || expectedSize || 0);
        let received = 0;
        let lastLog = 0;
        const out = fs.createWriteStream(dest);
        for await (const chunk of res.body) {
          out.write(chunk);
          received += chunk.length;
          if (received - lastLog > 8 * 1048576) {
            lastLog = received;
            process.stdout.write(`\r   ${human(received)}${total ? ` / ${human(total)} (${Math.round((received / total) * 100)}%)` : ''}      `);
          }
        }
        await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });
        if (expectedSize && received !== expectedSize) throw new Error(`大小不符：${received} ≠ ${expectedSize}`);
        process.stdout.write(`\r   ${human(received)} 完成${' '.repeat(24)}\n`);
        return received;
      } catch (err) {
        lastError = err;
        try { fs.unlinkSync(dest); } catch { /* ignore */ }
        if (attempt < 2) console.log(`   重试（${err.message}）…`);
      }
    }
    console.log(`   源不可用：${url}`);
  }
  throw lastError || new Error('下载失败');
}

function human(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
}

/** 递归找某个文件名，用于判断组件是否真的解压就绪 */
function walkFind(dir, filename, depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return false;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return true;
    if (entry.isDirectory() && walkFind(full, filename, depth + 1)) return true;
  }
  return false;
}

/** 解压后把顶层目录规整成 ROOT/<name>/…（marker 直接位于该目录下） */
function extract(z7, archive, target, expectDir, marker) {
  const staging = target + '.tmp';
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  /* 注意：stdio 必须丢弃 7za 的输出。用它写 pipe 而没人读时，
     像 platform 包（1 万多个文件）会因输出缓冲写满而**死锁**——这个坑踩过一次。 */
  execFileSync(z7, ['x', archive, `-o${staging}`, '-y', '-bd'], { stdio: 'ignore' });
  const entries = fs.readdirSync(staging, { withFileTypes: true }).filter((e) => e.isDirectory());
  let source = staging;
  if (entries.length === 1 && expectDir.test(entries[0].name)) {
    source = path.join(staging, entries[0].name);
  } else if (entries.length > 1) {
    const match = entries.find((e) => expectDir.test(e.name));
    if (match) source = path.join(staging, match.name);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(source, target);
  /* 有些包（如 platform 的 android-34/）会在里面再套一层，把它拍平，
     保证 build-apk.mjs 里的路径是固定的 */
  if (marker && !walkFind(target, marker, 0) && entries.length <= 1) {
    const inner = fs.readdirSync(target, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (inner.length === 1) {
      const innerPath = path.join(target, inner[0].name);
      if (walkFind(innerPath, marker, 0)) {
        for (const entry of fs.readdirSync(innerPath)) {
          fs.renameSync(path.join(innerPath, entry), path.join(target, entry));
        }
        fs.rmdirSync(innerPath);
      }
    }
  }
  fs.rmSync(staging, { recursive: true, force: true });
}

async function main() {
  const z7 = sevenZip();
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`工具链目录：${ROOT}\n`);

  for (const item of ITEMS) {
    const target = path.join(ROOT, item.name);
    /* 只认"拍平后"的路径：marker 直接位于 target 下才算就绪 */
    const ready = item.marker
      ? fs.existsSync(path.join(target, item.marker))
      : (fs.existsSync(target) && fs.readdirSync(target).length > 0);
    if (ready) {
      console.log(`✓ ${item.label} 已存在，跳过`);
      continue;
    }
    const archive = path.join(CACHE, `${item.name}.zip`);
    if (!fs.existsSync(archive) || fs.statSync(archive).size !== item.size) {
      process.stdout.write(`· 下载 ${item.label} …\n`);
      try {
        const size = await downloadFrom(item.urls, archive, item.size);
        console.log(`  已缓存 ${path.relative(PROJECT, archive)}（${human(size)}）`);
      } catch (err) {
        console.log(`失败：${err.message}`);
        console.log(`  可手动下载后放到 ${archive} 再重跑`);
        process.exitCode = 1;
        continue;
      }
    } else {
      console.log(`· ${item.label} 压缩包已在缓存中`);
    }
    process.stdout.write(`  解压 ${item.name} … `);
    try {
      extract(z7, archive, target, item.expectDir, item.marker);
      console.log('完成');
    } catch (err) {
      console.log('失败：' + (err.stderr ? err.stderr.toString().slice(0, 200) : err.message));
      process.exitCode = 1;
    }
  }

  /* 结果自检 */
  const java = path.join(ROOT, 'jdk17', 'bin', 'javac.exe');
  const androidJar = path.join(ROOT, 'platform-34', 'android.jar');
  const aapt2 = path.join(ROOT, 'build-tools-34', 'aapt2.exe');
  const d8 = path.join(ROOT, 'build-tools-34', 'd8.bat');
  const apksigner = path.join(ROOT, 'build-tools-34', 'apksigner.bat');
  const ok = [java, androidJar, aapt2, d8, apksigner].every((p) => fs.existsSync(p));
  console.log('\n工具链自检：');
  for (const [label, p] of [['javac', java], ['android.jar', androidJar], ['aapt2', aapt2], ['d8', d8], ['apksigner', apksigner]]) {
    console.log(`  ${fs.existsSync(p) ? '✓' : '✗'} ${label}`);
  }
  if (!ok) {
    console.error('\n工具链不完整，请重跑本脚本或检查网络。');
    process.exit(1);
  }
  console.log('\n完成。接着：npm run build:apk');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
