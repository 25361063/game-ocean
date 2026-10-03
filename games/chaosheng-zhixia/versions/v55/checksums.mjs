#!/usr/bin/env node
/**
 * 生成发布校验文件：dist/SHA256SUMS.txt
 *
 * 用途：
 *   1) 传给杀软的“误报申诉”需要提供文件的 SHA-256；
 *   2) 用户下载后可以自己核对，确认文件没被替换/损坏；
 *   3) 若某个产物被杀软静默删除，比对清单能立刻发现（清单里有、目录里没有）。
 *
 * 用法：npm run checksums
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const DIST = path.join(PROJECT, 'dist');

const SKIP = new Set(['SHA256SUMS.txt', 'builder-debug.yml']);

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function human(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)}${units[i]}`;
}

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error('✗ 还没有 dist/ 目录，先打包：npm run dist');
    process.exit(1);
  }
  const files = fs.readdirSync(DIST)
    .filter((f) => !SKIP.has(f) && !f.endsWith('.blockmap') && !f.endsWith('.nsis.7z'))
    .map((f) => path.join(DIST, f))
    .filter((f) => fs.statSync(f).isFile());

  if (!files.length) {
    console.error('✗ dist/ 里没有可发布的文件（安装包可能已被杀软删除，重新 npm run dist）');
    process.exit(1);
  }

  const lines = [`# 潮声之下 桌面版 · 发布校验清单`, `# 生成时间：${new Date().toISOString()}`, ''];
  for (const file of files.sort()) {
    const digest = await sha256(file);
    const size = fs.statSync(file).size;
    lines.push(`${digest}  *${path.basename(file)}`);
    console.log(`✓ ${path.basename(file)}  ${human(size)}  ${digest.slice(0, 16)}…`);
  }
  lines.push('');
  lines.push('# 校验方法（PowerShell）：');
  lines.push('#   Get-FileHash .\\潮声之下_安装包_1.0.0.exe -Algorithm SHA256');

  fs.writeFileSync(path.join(DIST, 'SHA256SUMS.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(`\n已写入 ${path.relative(PROJECT, path.join(DIST, 'SHA256SUMS.txt'))}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
