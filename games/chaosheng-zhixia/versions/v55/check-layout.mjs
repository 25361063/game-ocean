#!/usr/bin/env node
/**
 * 手机版键位分布校验（Electron 无头窗口 + 触屏伪装）
 *
 * 做什么：
 *   1) 用真实游戏页面 + 触屏伪装（ontouchstart / maxTouchPoints），让游戏走 html.is-touch 分支；
 *   2) 在多种机型横屏尺寸下（16:9 到 21:9、平板）量出所有触控键、技能栏、摇杆区、小地图的矩形；
 *   3) 检查三件事：按键之间是否重叠、是否越出可用区域、是否压住顶部 HUD / 小地图；
 *   4) 静态检查：每个触控键的定位是否都带 env(safe-area-inset-*)（刘海/圆角屏安全边距）；
 *   5) 每个尺寸出一张截图，和人眼看到的键位对照。
 *
 * 用法：npm run check:layout        （结果在 mobile/layout-check/）
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const WWW = path.join(PROJECT, 'app', 'assets', 'www');
const OUT = path.join(PROJECT, 'layout-check');

/* 借用桌面版工程里的 Electron 与内置服务器（已验证可用） */
const DESKTOP = path.resolve(PROJECT, '..', 'desktop');
const electronPath = require(path.join(DESKTOP, 'node_modules', 'electron'));
const { startLocalServer } = require(path.join(DESKTOP, 'src', 'local-server.js'));
const { app, BrowserWindow } = require('electron');

/* 无独显/远程会话的机器（CI、虚拟机）需要软件渲染：
     set TIDE_SOFTWARE_GL=1 && npm run check:layout            */
if (process.env.TIDE_SOFTWARE_GL === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('no-sandbox');
}

/* 机型：横屏 CSS 视口（物理分辨率 ÷ devicePixelRatio），覆盖常见与极端比例 */
const DEVICES = [
  { name: '16:9 老机型', width: 640, height: 360, note: '720×1280 / dpr2' },
  { name: '16:9 主流', width: 854, height: 480, note: '1920×1080 / dpr2.25' },
  { name: '18:9', width: 810, height: 405, note: '1440×2880 / dpr1.78' },
  { name: '19.5:9 长屏', width: 832, height: 384, note: '1080×2340 / dpr2.81' },
  { name: '20:9 长屏', width: 873, height: 393, note: '1080×2400 / dpr2.75' },
  { name: '21:9 超长', width: 914, height: 411, note: '1080×2520 / dpr2.6' },
  { name: '平板', width: 1280, height: 800, note: '1600×2560 / dpr2' },
  { name: '窄高（竖屏误锁）', width: 640, height: 900, note: '异常方向，仅看是否崩坏' },
];

/* 需要纳入重叠检查的触控/UI 元素 */
const MEASURE_JS = `(() => {
  const sel = {
    buttons: '.tbtn',
    touchUI: '#touchUI',
    joyZone: '#joyZone',
    joyBase: '#joyBase',
    skillBar: '#skillBar',
    weaponSlots: '#weaponSlots',
    minimap: '#minimap',
    minimapWrap: '#minimapWrap',
    hudTop: '.top',
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      id: el.id || el.className,
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 8),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0',
    };
  };
  const out = { viewport: { w: innerWidth, h: innerHeight }, dpr: devicePixelRatio, groups: {} };
  for (const [key, s] of Object.entries(sel)) {
    out.groups[key] = [...document.querySelectorAll(s)].map(rectOf).filter((r) => r.visible);
  }
  out.isTouch = document.documentElement.classList.contains('is-touch');
  return out;
})()`;

function overlaps(a, b, tol = 2) {
  const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return ix > tol && iy > tol ? { ix, iy } : null;
}

/** 本机 localhost 偶发 ERR_FAILED(-2)，加载带重试 */
async function loadWithRetry(win, url, attempts = 3, progress = console.log) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await win.loadURL(url);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      progress(`  （载入失败 ${(err.message || '').split('\n')[0]}，重试 ${i}/${attempts - 1}）`);
      await new Promise((r) => setTimeout(r, 900));
    }
  }
}

async function main() {
  if (!fs.existsSync(path.join(WWW, 'index.html'))) {
    console.error('✗ 还没同步手机版资产，请先执行：npm run sync');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  /* 静态检查：触控键定位是否都带安全区 env() */
  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const cssBlock = html.slice(0, html.indexOf('</style>'));
  const staticIssues = [];
  if (!/viewport-fit=cover/.test(html)) staticIssues.push('viewport 缺少 viewport-fit=cover（env(safe-area-inset-*) 会恒为 0）');
  const btnRules = [...cssBlock.matchAll(/#(btn[A-Za-z]+)\s*\{([^}]*)\}/g)];
  for (const [, id, body] of btnRules) {
    if (!/(right|left)[^;]{0,60}env\(safe-area-inset-/.test(body) && !/(top|bottom)[^;]{0,60}env\(safe-area-inset-/.test(body)) {
      staticIssues.push(`#${id} 的定位没有使用 env(safe-area-inset-*)，刘海/圆角屏可能被遮挡`);
    }
  }
  console.log(`静态检查：触控键规则 ${btnRules.length} 条，问题 ${staticIssues.length} 项`);
  staticIssues.forEach((s) => console.log('  ⚠️ ' + s));

  /* 启动内置服务器托管手机版资产 */
  const server = await startLocalServer({
    gameDir: WWW,
    entryFile: 'index.html',
    log: () => {},
    preferredPort: 0,
    bind: 'local',
    relayVersion: 'mobile-layout-check',
    relayProtocol: 2,
  });

  await app.whenReady();
  const reports = [];
  const progressFile = path.join(OUT, 'layout-progress.log');
  const progress = (line) => {
    const text = `[${new Date().toISOString()}] ${line}`;
    console.log(line);
    try { fs.appendFileSync(progressFile, text + '\n'); } catch { /* ignore */ }
  };
  try { fs.writeFileSync(progressFile, ''); } catch { /* ignore */ }

  /* 只开一个窗口，逐个尺寸改大小 —— 反复新建窗口在这类环境里会中途被杀，
     而网页布局本来就是响应式的，改尺寸后自动重排（顺便更快：游戏只加载一次）。 */
  const win = new BrowserWindow({
    width: DEVICES[0].width,
    height: DEVICES[0].height,
    useContentSize: true,
    show: true,
    frame: false,
    backgroundColor: '#04070c',
    webPreferences: {
      preload: path.join(__dirname, 'preload-touch.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  await loadWithRetry(win, server.url, 3, progress);
  progress('页面载入完成，等待首帧与人物资产…');
  await new Promise((r) => setTimeout(r, 9000));

  /* 尽量进入一局游戏：这样截图里能看到真实 HUD + 触控键，
     重叠检查也才包含顶部 HUD / 小地图（它们在主菜单里根本不存在）。 */
  const enterRun = `(() => {
    const out = { started: false, state: null, storyClicks: 0, deployClicks: 0 };
    const clickBy = (re) => {
      const b = [...document.querySelectorAll('button')].find((x) => re.test(x.textContent || ''));
      if (!b) return false;
      b.click();
      return true;
    };
    try { if (window.__D3D && typeof window.__D3D.start === 'function') { window.__D3D.start(); out.started = true; } } catch (e) { out.error = String(e); }
    for (let i = 0; i < 10; i++) {
      let modal = false;
      try { const g = window.__D3D && window.__D3D.get(); modal = !!(g && g.story && g.story.modal); } catch (e) { /* ignore */ }
      if (modal) {
        if (clickBy(/跳过|继续|展开|知道了|确定/)) out.storyClicks++;
        continue;
      }
      if (clickBy(/准备下潜|从深度|开始|出击/)) { out.deployClicks++; continue; }
      break;
    }
    try { out.state = window.__D3D ? window.__D3D.state() : null; } catch (e) { /* ignore */ }
    return out;
  })()`;
  const entered = await win.webContents.executeJavaScript(enterRun, true).catch((err) => ({ error: String(err) }));
  progress('进入游戏尝试：' + JSON.stringify(entered));
  await new Promise((r) => setTimeout(r, 4000));

  /* 开场剧情有好几页且会挡住 HUD，截图前把它推完（Space 键与「继续/跳过」按钮都试） */
  const storyState = `(() => { try { const g = window.__D3D && window.__D3D.get(); return g && g.story ? !!g.story.modal : false; } catch (e) { return false; } })()`;
  const advanceStory = `(() => {
    /* 游戏内部很多控件绑的是 pointerdown（不是 click），
       所以这里要按真实触屏顺序派发 pointerdown → pointerup → click */
    const fire = (el) => {
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), pointerId: 1, pointerType: 'touch', isPrimary: true };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    };
    const b = [...document.querySelectorAll('button')].find((x) => /跳过|继续|展开|知道了|确定/.test(x.textContent || ''));
    if (b) { fire(b); return 'button'; }
    const panel = document.querySelector('.story-panel,.story,#storyPanel,#storyModal');
    if (panel) { fire(panel); return 'panel'; }
    const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true });
    window.dispatchEvent(ev);
    return 'space';
  })()`;
  for (let i = 0; i < 30; i += 1) {
    const modal = await win.webContents.executeJavaScript(storyState, true).catch(() => false);
    if (!modal) break;
    await win.webContents.executeJavaScript(advanceStory, true).catch(() => null);
    await new Promise((r) => setTimeout(r, 420));
  }
  const stillModal = await win.webContents.executeJavaScript(storyState, true).catch(() => true);
  const stateNow = await win.webContents.executeJavaScript('(()=>{try{return window.__D3D?window.__D3D.state():null}catch(e){return null}})()', true).catch(() => null);
  progress(`剧情推进结束：modal=${stillModal} state=${stateNow}`);

  for (const device of DEVICES) {
    progress(`▶ ${device.name} ${device.width}×${device.height} 开始`);
    const report = { device, issues: [] };
    try {
      win.setContentSize(device.width, device.height);
      /* 等一次重排 + 一帧渲染 */
      await new Promise((r) => setTimeout(r, 1200));

      const data = await win.webContents.executeJavaScript(MEASURE_JS, true).catch((err) => ({ error: String(err) }));
      Object.assign(report, data);

      if (data.error) {
        report.issues.push('测量失败：' + data.error);
      } else {
        const buttons = data.groups.buttons || [];
        if (!data.isTouch) report.issues.push('触屏伪装失败：html.is-touch 未生效（游戏没走手机版 HUD）');
        if (buttons.length < 8) report.issues.push(`触控键数量偏少（${buttons.length} 个），可能未渲染完成`);

        /* 1) 按键两两重叠 */
        for (let i = 0; i < buttons.length; i += 1) {
          for (let j = i + 1; j < buttons.length; j += 1) {
            const hit = overlaps(buttons[i], buttons[j], 2);
            if (hit) report.issues.push(`按键重叠：${buttons[i].label || buttons[i].id} × ${buttons[j].label || buttons[j].id}（重叠 ${hit.ix}×${hit.iy}px）`);
          }
        }
        /* 2) 越界 / 贴边不足 */
        for (const b of buttons) {
          if (b.x < 0 || b.y < 0 || b.right > data.viewport.w || b.bottom > data.viewport.h) {
            report.issues.push(`按键越界：${b.label || b.id} (${b.x},${b.y},${b.right},${b.bottom})`);
          } else {
            const margin = Math.min(b.x, b.y, data.viewport.w - b.right, data.viewport.h - b.bottom);
            if (margin < 6 && b.id !== 'btnPause') report.issues.push(`按键离屏幕边缘仅 ${margin}px：${b.label || b.id}（圆角屏易误触/被遮）`);
          }
        }
        /* 3) 压住顶部 HUD 或小地图 */
        const hud = (data.groups.hudTop || [])[0];
        const mini = (data.groups.minimapWrap || data.groups.minimap || [])[0];
        for (const b of buttons) {
          if (b.id === 'btnPause') continue;
          if (hud && overlaps(hud, b, 4)) {
            report.issues.push(`按键压住顶部 HUD：${b.label || b.id}（HUD 底 y=${hud.bottom}，按键顶 y=${b.y}）`);
          }
          if (mini && overlaps(mini, b, 4)) report.issues.push(`按键压住小地图：${b.label || b.id}`);
        }
        /* 4) 触控键尺寸是否符合拇指可点（≥44px） */
        for (const b of buttons) {
          if (b.id === 'btnPickup') continue;
          if (Math.min(b.w, b.h) < 44) report.issues.push(`按键偏小（${b.w}×${b.h}）：${b.label || b.id}，建议 ≥44px`);
        }
        report.hudRect = hud || null;
        report.minimapRect = mini || null;
      }

      /* 截图前把占满屏幕的剧情/菜单弹层临时隐藏，方便人眼直接看清键位分布
         （只影响截图，不影响上面的几何测量；#touchUI 含 .tbtn，不会被隐藏） */
      await win.webContents.executeJavaScript(`(() => {
        let n = 0;
        document.querySelectorAll('div,section').forEach((d) => {
          const cs = getComputedStyle(d);
          if (cs.position !== 'fixed' || cs.display === 'none') return;
          if (d.querySelector('.tbtn')) return;
          if (d.offsetWidth > innerWidth * 0.55 && d.offsetHeight > innerHeight * 0.45) { d.style.display = 'none'; n += 1; }
        });
        return n;
      })()`, true).catch(() => 0);
      await new Promise((r) => setTimeout(r, 350));

      const image = await win.webContents.capturePage();
      const shot = path.join(OUT, `layout-${device.width}x${device.height}.png`);
      fs.writeFileSync(shot, image.toPNG());
      report.screenshot = path.relative(PROJECT, shot);
    } catch (err) {
      report.issues.push('本机尺寸执行失败：' + (err && err.message ? err.message.split('\n')[0] : String(err)));
    }
    reports.push(report);
    fs.writeFileSync(path.join(OUT, 'layout-report.json'), JSON.stringify({
      generatedAt: new Date().toISOString(), staticIssues, devices: reports,
    }, null, 2), 'utf8');

    const tag = report.issues.length ? `⚠️ ${report.issues.length} 项` : '✓ 通过';
    progress(`${device.name.padEnd(18)} ${String(device.width).padStart(4)}×${String(device.height).padEnd(4)} ${tag}  (按键 ${report.groups && report.groups.buttons ? report.groups.buttons.length : 0} 个)`);
    report.issues.forEach((s) => progress('     · ' + s));
  }

  try { win.destroy(); } catch { /* ignore */ }
  await server.close();
  const total = reports.reduce((n, r) => n + r.issues.length, 0);
  progress(`\n结果：${reports.length} 种尺寸，共 ${total} 项问题；明细见 layout-check/layout-report.json`);
  app.exit(total + staticIssues.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('校验脚本异常：' + (err && err.stack ? err.stack : err));
  app.exit(2);
});
