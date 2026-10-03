#!/usr/bin/env node
/**
 * 同步游戏本体到 desktop/game/
 *
 * 只复制「运行必需」的文件：主 HTML、assets/、诊断页、人物预览、使用说明，
 * 外加一张实机图作为启动画面背景。测试脚本（test_*.cjs）与美术预览图不进包。
 *
 * 用法：npm run sync
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');          // desktop/
const SOURCE = path.resolve(PROJECT, '..');             // 游戏工作区
const DEST = path.join(PROJECT, 'game');
const GAME_ENTRY = process.env.CHASHENG_ENTRY || '潮声之下_深渊潜航3D_v22.html';

const ITEMS = [
  { from: GAME_ENTRY, to: GAME_ENTRY, required: true },
  { from: 'assets', to: 'assets', dir: true, required: true },
  { from: '联机诊断.html', to: '联机诊断.html' },
  { from: '人物预览.html', to: '人物预览.html' },
  { from: '使用说明.txt', to: '使用说明.txt' },
  /* 桌面版自己的说明（菜单「帮助 → 操作说明」打开的就是这份），随游戏目录一起进包 */
  { from: '使用说明_桌面版.txt', to: '桌面版说明.txt', fromProject: true },
  /* 启动画面背景：换任意一张 16:10 实机图即可（splash/splash.html 用 cover 裁切） */
  { from: '场景实机_v50.png', to: path.join(PROJECT, 'splash', 'art.png'), optional: true },
];

function human(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)}${units[i]}`;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

/** 递归复制（自己实现，避免个别环境对 fs.cpSync 的封装差异） */
function copyTree(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      copyTree(path.join(from, entry.name), path.join(to, entry.name));
    }
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

/** 清空目标目录（逐文件删除；个别环境会拦截整目录删除，失败也不影响覆盖复制） */
function cleanDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let failed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        failed += cleanDir(full);
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      } else {
        fs.unlinkSync(full);
      }
    } catch {
      failed += 1;
    }
  }
  return failed;
}

function main() {
  if (!fs.existsSync(path.join(SOURCE, GAME_ENTRY))) {
    console.error(`✗ 找不到游戏主文件：${path.join(SOURCE, GAME_ENTRY)}`);
    console.error('  如文件名有变化，请设置环境变量 CHASHENG_ENTRY 或在 scripts/sync-game.mjs 里改 GAME_ENTRY。');
    process.exit(1);
  }

  const stale = cleanDir(DEST);
  fs.mkdirSync(DEST, { recursive: true });
  if (stale) console.log(`· 有 ${stale} 项旧文件未能删除（不影响，本次会被同名文件覆盖）`);

  let missing = 0;
  for (const item of ITEMS) {
    const from = item.fromProject ? path.join(PROJECT, item.from) : path.join(SOURCE, item.from);
    const to = item.to.startsWith(PROJECT) ? item.to : path.join(DEST, item.to);
    if (!fs.existsSync(from)) {
      if (item.required) {
        console.error(`✗ 缺少必需文件：${item.from}`);
        missing += 1;
      } else {
        console.log(`· 跳过（可选，不存在）：${item.from}`);
      }
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    copyTree(from, to);
    console.log(`✓ ${item.from} → ${path.relative(PROJECT, to)}`);
  }
  if (missing) process.exit(1);

  const files = walk(DEST);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  console.log(`\n同步完成：${files.length} 个文件，${human(bytes)} → ${path.relative(PROJECT, DEST)}`);
  console.log('下一步：npm start（开发运行）或 npm run dist（生成安装包）');
}

main();
