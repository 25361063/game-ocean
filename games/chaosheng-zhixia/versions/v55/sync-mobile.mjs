#!/usr/bin/env node
/**
 * 把网页版游戏同步成手机版资产：mobile/app/assets/www/
 *
 * 与桌面版 sync-game.mjs 的区别：
 *   1) 主文件改名为 index.html（ASCII 路径，Android assets 与本地服务器 URL 都更稳）；
 *   2) 注入移动端补丁（viewport-fit=cover、触控/滚动行为），原始游戏文件不动；
 *   3) 只带必要文件，诊断页改名 diagnostics.html 由内置服务器路由。
 *
 * 用法：npm run sync
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const SOURCE = path.resolve(PROJECT, '..');
const WWW = path.join(PROJECT, 'app', 'assets', 'www');

const GAME_ENTRY = process.env.CHASHENG_ENTRY || '潮声之下_深渊潜航3D_v22.html';

/* 注意：viewport-fit=cover 是 env(safe-area-inset-*) 生效的前提，
   没有它，刘海/圆角处的按键会贴到屏幕边缘甚至被遮住。 */
const MOBILE_PATCH_CSS = `
<!-- ===== 手机版补丁（由 mobile/scripts/sync-mobile.mjs 注入；请勿手改 game/ 里的源文件） ===== -->
<style id="tide-mobile-patch">
  /* 1) 全屏手势：禁掉滚动回弹与长按高亮，避免误触与拖拽选中 */
  html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent;}
  body{-webkit-user-select:none;user-select:none;}
  canvas{touch-action:none;}
  /* 2) 触控按键在刘海屏/圆角屏上的最小安全边距（env 为 0 时退回 4px，保证不贴边） */
  .tbtn{min-width:44px;min-height:44px;}
  /* 3) 游戏中顶部 HUD 实测高度 ≈95px（check:layout 在真实对局里量出来的），
        右上技能列必须整体落在它下方，否则「髓瓷护幕」会被 HUD 压住 */
  #btnShield{top:calc(104px + env(safe-area-inset-top)) !important;}
  #btnOverdrive{top:calc(152px + env(safe-area-inset-top)) !important;}
  #btnCam{top:calc(200px + env(safe-area-inset-top)) !important;}
  #btnShop{top:calc(248px + env(safe-area-inset-top)) !important;}
  /* 4) 矮屏（横屏高度 ≤430px，如 16:9 机型）：HUD(95) + 竖列(4×48) + 右下普攻(76) 在 360px 高度里放不下，
        改成 2×2 方阵：仍在 HUD 之下，与右下动作键、闪避键互不遮挡 */
  @media (max-height:430px){
    #btnShield{top:calc(104px + env(safe-area-inset-top)) !important;right:calc(10px + env(safe-area-inset-right)) !important;}
    #btnOverdrive{top:calc(154px + env(safe-area-inset-top)) !important;right:calc(10px + env(safe-area-inset-right)) !important;}
    #btnCam{top:calc(104px + env(safe-area-inset-top)) !important;right:calc(62px + env(safe-area-inset-right)) !important;}
    #btnShop{top:calc(154px + env(safe-area-inset-top)) !important;right:calc(62px + env(safe-area-inset-right)) !important;}
  }
  /* 5) 键位修正：原「下潜」内联定位 (right:142px,bottom:84px) 与「切武器」(right:150,bottom:72)
        重叠 36×36px（check:layout 实测）。改为与普攻同一水平行、左移一列，
        形成右侧拇指弧线：底行 = 普攻 / 下潜，上行 = 跳跃 / 切武器，再上 = 闪避 */
  #btnSink{
    right:calc(150px + env(safe-area-inset-right)) !important;
    bottom:calc(12px + env(safe-area-inset-bottom)) !important;
    width:48px !important;height:48px !important;
  }
</style>
`;

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let failures = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        failures += cleanDir(full);
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      } else {
        fs.unlinkSync(full);
      }
    } catch {
      failures += 1;
    }
  }
  return failures;
}

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

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function human(bytes) {
  const units = ['B', 'KB', 'MB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)}${units[i]}`;
}

/** 打移动补丁：viewport-fit=cover + 注入移动 CSS */
function patchHtml(html) {
  let out = html;
  const viewportRe = /<meta\s+name="viewport"\s+content="([^"]*)"\s*>/i;
  if (viewportRe.test(out)) {
    out = out.replace(viewportRe, (match, content) => {
      const parts = content.split(',').map((s) => s.trim()).filter((s) => s && !/^viewport-fit/i.test(s));
      parts.push('viewport-fit=cover');
      return `<meta name="viewport" content="${parts.join(',')}">`;
    });
  } else {
    out = out.replace(/<head>/i, '<head>\n<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">');
  }
  if (!/<\/head>/i.test(out)) throw new Error('index.html 里找不到 </head>，无法注入移动补丁');
  out = out.replace(/<\/head>/i, `${MOBILE_PATCH_CSS}</head>`);
  return out;
}

function main() {
  const entry = path.join(SOURCE, GAME_ENTRY);
  if (!fs.existsSync(entry)) {
    console.error(`✗ 找不到游戏主文件：${entry}`);
    console.error('  文件名变化时设置环境变量 CHASHENG_ENTRY，或改 scripts/sync-mobile.mjs。');
    process.exit(1);
  }

  const stale = cleanDir(WWW);
  fs.mkdirSync(WWW, { recursive: true });

  /* 1) 主页面 → index.html（打补丁） */
  const patched = patchHtml(fs.readFileSync(entry, 'utf8'));
  fs.writeFileSync(path.join(WWW, 'index.html'), patched, 'utf8');
  console.log(`✓ ${GAME_ENTRY} → www/index.html（已注入 viewport-fit=cover 与移动端 CSS）`);

  /* 2) 资源目录 */
  const assetsSrc = path.join(SOURCE, 'assets');
  if (!fs.existsSync(assetsSrc)) { console.error('✗ 缺少 assets/'); process.exit(1); }
  copyTree(assetsSrc, path.join(WWW, 'assets'));
  console.log('✓ assets/ → www/assets/');

  /* 3) 诊断页（内置服务器 /diagnostics 路由到它） */
  const diag = path.join(SOURCE, '联机诊断.html');
  if (fs.existsSync(diag)) {
    fs.copyFileSync(diag, path.join(WWW, 'diagnostics.html'));
    console.log('✓ 联机诊断.html → www/diagnostics.html');
  }

  /* 4) 桌面版说明也带上，便于在网页里查看（可选） */
  const help = path.join(PROJECT, '使用说明_手机版.txt');
  if (fs.existsSync(help)) {
    fs.copyFileSync(help, path.join(WWW, 'help.txt'));
    console.log('✓ 使用说明_手机版.txt → www/help.txt');
  }

  const files = walk(WWW);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  if (stale) console.log(`· ${stale} 项残留未能删除（不影响，会被同名覆盖）`);
  console.log(`\n同步完成：${files.length} 个文件，${human(bytes)} → mobile/app/assets/www/`);
  console.log('下一步：npm run build:apk（首次先 npm run fetch-toolchain）');
}

main();
