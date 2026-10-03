#!/usr/bin/env node
/**
 * 预取 electron-builder 需要的辅助二进制到本地缓存（国内网络墙 GitHub 时的救命脚本）。
 *
 * 解决的三个问题：
 *   1) electron-builder 默认从 github.com 下载 winCodeSign / nsis / nsis-resources，国内常失败；
 *   2) winCodeSign 压缩包里带有 macOS 符号链接，Windows 上解压会报
 *      “Cannot create symbolic link : 客户端没有所需的特权”，导致构建中断；
 *   3) 反复失败会浪费大量等待时间。
 *
 * 做法：从镜像直接下载 7z，用自己的 7za 解压（已存在的目录跳过），
 * 解压到 electron-builder 期望的缓存路径后，打包时会直接复用，不再联网。
 *
 * 用法：
 *   npm run prepare-binaries
 *   set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
 *   set ELECTRON_BUILDER_CACHE=D:\cache\electron-builder     # 可选，自定义缓存目录
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');

const MIRROR = (process.env.ELECTRON_BUILDER_BINARIES_MIRROR
  || 'https://npmmirror.com/mirrors/electron-builder-binaries/').replace(/\/?$/, '/');

const CACHE_ROOT = process.env.ELECTRON_BUILDER_CACHE
  || (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache')
    : path.join(os.homedir(), 'Library', 'Caches', 'electron-builder'));

/* 与 electron-builder 25.x 的实际需求保持一致 */
const ITEMS = [
  { name: 'winCodeSign', version: '2.6.0', exclude: ['darwin', 'linux'], note: '图标/版本信息改写（rcedit）、签名工具' },
  { name: 'nsis', version: '3.0.4.1', note: 'NSIS 安装包编译器' },
  { name: 'nsis-resources', version: '3.4.1', note: 'NSIS 插件资源' },
];

function sevenZip() {
  const candidates = [
    path.join(PROJECT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(PROJECT, 'node_modules', '7zip-bin', 'mac', '7za'),
    path.join(PROJECT, 'node_modules', '7zip-bin', 'linux', 'x64', '7za'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('找不到 7za（应随 7zip-bin 一起安装）。请先 npm install。');
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function human(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
}

async function main() {
  const work = path.join(CACHE_ROOT, 'nsis-3.0.4.1');
  const z7 = sevenZip();
  console.log(`缓存目录：${CACHE_ROOT}`);
  console.log(`镜像：${MIRROR}`);
  console.log(`7za：${z7}\n`);

  fs.mkdirSync(CACHE_ROOT, { recursive: true });

  for (const item of ITEMS) {
    const dirName = `${item.name}-${item.version}`;
    const target = path.join(CACHE_ROOT, item.name, dirName);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      console.log(`✓ ${dirName} 已存在，跳过（${item.note}）`);
      continue;
    }
    const url = `${MIRROR}${dirName}/${dirName}.7z`;
    const archive = path.join(CACHE_ROOT, item.name, `${dirName}.7z`);
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    process.stdout.write(`· 下载 ${dirName} … `);
    try {
      const size = await download(url, archive);
      console.log(human(size));
    } catch (err) {
      console.log(`失败：${err.message}`);
      console.log(`  可手动下载 ${url} 后解压到 ${target}`);
      process.exitCode = 1;
      continue;
    }
    const args = ['x', archive, `-o${target}`, '-y', '-bd'];
    for (const ex of item.exclude || []) args.push(`-x!${ex}`);
    try {
      execFileSync(z7, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      console.log(`✓ 解压完成 → ${target}`);
    } catch (err) {
      // 符号链接等非致命错误：只要主要文件在就算成功
      const files = fs.existsSync(target) ? fs.readdirSync(target).length : 0;
      if (files > 3) console.log(`✓ 解压完成（忽略 ${files} 项中的少量符号链接警告）→ ${target}`);
      else {
        console.log(`✗ 解压失败：${(err.stderr || '').toString().slice(0, 300)}`);
        process.exitCode = 1;
      }
    }
    try { fs.unlinkSync(archive); } catch { /* 留着也无妨 */ }
  }

  console.log('\n完成。接着执行：npm run dist');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
