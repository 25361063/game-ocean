#!/usr/bin/env node
/**
 * 打包前清理 dist/（带重试与"改名兜底"）
 *
 * 为什么需要它：
 *   electron-builder 在打包前会 emptyDir(dist/win-unpacked)。如果上一次构建残留的文件
 *   正被杀毒软件扫描/加锁（100MB+ 的 exe 与 zip 尤其明显），删除会失败，
 *   electron-builder 只会不断重试 —— 表现为构建"卡在 copying Electron 不动"。
 *   实测本机（卡巴斯基）上一次打包后的几分钟内，再次打包几乎必然卡住。
 *
 *   本脚本先尝试正常递归删除；删不掉的就把整个 dist 改名让路（Windows 下改名通常仍能成功），
 *   这样 electron-builder 拿到一个干净的输出目录，不会再卡。
 *
 * 用法：npm run clean   （已内置在 pack / dist / dist:* 里，无需手动调用）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const DIST = path.join(PROJECT, 'dist');

/** 递归删除，返回"删不掉的文件"列表；目录本身删不掉也记录 */
function purge(dir, failures = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return failures;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) purge(full, failures);
    else {
      try {
        fs.unlinkSync(full);
      } catch {
        failures.push(full);
      }
    }
  }
  try {
    fs.rmdirSync(dir);
  } catch {
    failures.push(dir);
  }
  return failures;
}

function treeSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try { total += fs.statSync(full).size; } catch { /* ignore */ }
      }
    }
  };
  try { walk(dir); } catch { /* ignore */ }
  return total;
}

function human(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(0) + 'MB' : Math.round(bytes / 1024) + 'KB';
}

if (!fs.existsSync(DIST)) {
  console.log('dist/ 不存在，无需清理');
  process.exit(0);
}

const before = treeSize(DIST);
const failures = purge(DIST);

if (failures.length === 0 && !fs.existsSync(DIST)) {
  console.log(`✓ 已清理 dist/（释放 ${human(before)}）`);
  process.exit(0);
}

/* 有文件被占用：把整个目录改名让路，打包照常进行 */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const parked = `${DIST}.locked-${stamp}`;
try {
  fs.renameSync(DIST, parked);
  console.log(`⚠️ 有 ${failures.length} 项被占用（多半是杀毒软件正在扫描），已改名让路：`);
  console.log(`   ${path.relative(PROJECT, parked)}`);
  console.log('   打包可以继续；确认新包没问题后，手动删除该目录即可。');
  console.log('   若经常出现：把项目目录加入杀软排除项，或先把上一次的产物移到别处。');
  process.exit(0);
} catch (err) {
  console.error(`✗ dist/ 无法清理也无法改名：${err.code || err.message}`);
  console.error('  请关闭正在占用 dist/ 的程序（杀软的扫描进程、资源管理器预览、正在运行的游戏），再重试。');
  if (failures.length) {
    console.error('  被占用示例：');
    for (const f of failures.slice(0, 5)) console.error('    · ' + path.relative(PROJECT, f));
  }
  process.exit(1);
}
