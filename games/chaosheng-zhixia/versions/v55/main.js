'use strict';
/**
 * 潮声之下 · 桌面版主进程
 *
 * 职责一览：
 *  1) 启动内置本地服务器（静态资源 + /health + /ws 中继），再把窗口指向 http://127.0.0.1:端口/
 *  2) 窗口 / 启动画面 / 菜单 / 快捷键 / 全屏 / 缩放 / 指针锁与权限
 *  3) 存档导出导入、联机地址提示、客机模式、日志落盘
 *  4) 崩溃兜底：白屏、渲染进程崩溃、载入失败都给可读提示而不是黑屏
 */

const { app, BrowserWindow, Menu, ipcMain, shell, dialog, session, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const CONFIG = require('./config');
const { startLocalServer } = require('./local-server');
const { buildMenu } = require('./menu');

/* ============================ 启动参数 ============================ */
const ARGV = process.argv.slice(1);
const IS_DEV = !app.isPackaged;
const DEV_MODE = ARGV.includes('--dev');
const SMOKE = ARGV.some((a) => a === '--smoke' || a.startsWith('--smoke='));

function flagValue(name) {
  const hit = ARGV.find((a) => a === name || a.startsWith(name + '='));
  if (!hit) return null;
  const i = hit.indexOf('=');
  return i === -1 ? '' : hit.slice(i + 1);
}

/* 必须在 app ready 前设置的 Chromium 开关 */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // 音效不因“无手势”被拦
app.commandLine.appendSwitch('ignore-gpu-blocklist');                       // 避免独显被误判成软件渲染
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('lang', 'zh-CN');
if (process.platform === 'win32') app.commandLine.appendSwitch('force_high_performance_gpu');
/* 显卡驱动异常的兜底：启动时加 --disable-gpu 走软件渲染，仍可进游戏（帧率低） */

/* ============================ 路径与日志 ============================ */
const GAME_DIR = IS_DEV ? path.join(__dirname, '..', 'game') : path.join(process.resourcesPath, 'game');
const ICON_PATH = (() => {
  const p = path.join(__dirname, '..', 'build', 'icon.ico');
  return fs.existsSync(p) ? p : undefined;
})();
const USER_DATA = app.getPath('userData');
const LOG_DIR = path.join(USER_DATA, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'main.log');
const STATE_FILE = path.join(USER_DATA, 'window-state.json');
const rendererLogs = [];

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}`;
  if (IS_DEV || DEV_MODE || SMOKE) console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const st = fs.statSync(LOG_FILE, { throwIfNoEntry: false });
    if (st && st.size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'main.1.log'));
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* 日志失败不影响游戏 */ }
}

/* ============================ 运行时状态 ============================ */
let mainWindow = null;
let splashWindow = null;
let splashShownAt = 0;
let promptWindow = null;
let promptResolve = null;
let serverInfo = null;
let serverRestarting = false;
let currentMode = 'local';          // local | guest | fallback
let guestUrl = null;
let targetUrl = null;               // 当前页面来源，用于同源判断
let menuBarVisible = true;
let reloadGuard = 0;
let desktopToastShown = false;

/* ============================ 工具函数 ============================ */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function isInternalUrl(url) {
  if (!targetUrl) return false;
  try {
    const a = new URL(url);
    const b = new URL(targetUrl);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function linkTargetOf() {
  return currentMode === 'guest' && guestUrl ? guestUrl : (serverInfo ? serverInfo.url : null);
}

function describeServer() {
  if (!serverInfo) return '内置服务器未运行。';
  const lines = [`本机地址：${serverInfo.url}`];
  if (serverInfo.lan.length) {
    lines.push('局域网地址（另一台设备用浏览器打开，或本应用「联机 → 作为客机连接主机」）：');
    for (const item of serverInfo.lan) lines.push(`  · ${item.url}（${item.iface}）`);
  } else {
    lines.push('局域网地址：无（端口 8123 被占用，本次仅本机可玩；可关闭占用程序后「联机 → 重启联机服务」）');
  }
  lines.push(`当前模式：${currentMode === 'guest' ? '客机（连到 ' + guestUrl + '）' : currentMode === 'fallback' ? '兼容模式（file://，联机不可用）' : '本地主机'}`);
  return lines.join('\n');
}

/* ============================ 窗口状态记忆 ============================ */
function loadWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const out = {};
    if (Number.isFinite(raw.width) && raw.width >= CONFIG.WINDOW.minWidth) out.width = Math.round(raw.width);
    if (Number.isFinite(raw.height) && raw.height >= CONFIG.WINDOW.minHeight) out.height = Math.round(raw.height);
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) { out.x = Math.round(raw.x); out.y = Math.round(raw.y); }
    if (raw.maximized) out.maximized = true;
    return out;
  } catch {
    return {};
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getNormalBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }, null, 2), 'utf8');
  } catch (err) {
    log('[state] 保存窗口状态失败 ' + err.message);
  }
}

/** 窗口若落在已拔掉的显示器上，回退到主屏居中 */
function usableBounds(state) {
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) return state;
  const { screen } = require('electron');
  const inside = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return state.x >= a.x - 40 && state.y >= a.y - 40 && state.x < a.x + a.width && state.y < a.y + a.height;
  });
  if (!inside) { delete state.x; delete state.y; }
  return state;
}

/* ============================ 启动画面 ============================ */
function createSplashWindow() {
  splashShownAt = Date.now();
  splashWindow = new BrowserWindow({
    width: CONFIG.SPLASH.width,
    height: CONFIG.SPLASH.height,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: CONFIG.APP_TITLE,
    backgroundColor: CONFIG.WINDOW.backgroundColor,
    icon: ICON_PATH,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, '..', 'splash', 'splash.html')).catch((err) => log('[splash] 载入失败 ' + err.message));
  splashWindow.once('ready-to-show', () => { if (splashWindow) splashWindow.show(); });
  splashWindow.on('closed', () => { splashWindow = null; });
  /* 兜底：无论发生什么，最多 CONFIG.SPLASH.maxDurationMs 之后关掉启动画面 */
  setTimeout(() => closeSplash(), CONFIG.SPLASH.maxDurationMs);
}

function closeSplash() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const elapsed = Date.now() - splashShownAt;
  const remain = Math.max(0, CONFIG.SPLASH.minDurationMs - elapsed);
  setTimeout(() => { try { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close(); } catch { /* ignore */ } }, remain);
}

/* ============================ 权限（指针锁 / 全屏 / 音频） ============================ */
function setupPermissions() {
  const allowed = new Set([
    'pointerLock',      // 第一人称视角必用
    'fullscreen',
    'clipboard-read',
    'clipboard-sanitized-write',
    'media',            // 预留：音视频设备（游戏目前只用 WebAudio）
  ]);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const ok = allowed.has(permission);
    if (!ok) log('[perm] 拒绝 ' + permission);
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

/* ============================ 主窗口 ============================ */
function createMainWindow() {
  const state = usableBounds(loadWindowState());

  mainWindow = new BrowserWindow({
    width: state.width || CONFIG.WINDOW.width,
    height: state.height || CONFIG.WINDOW.height,
    x: state.x,
    y: state.y,
    minWidth: CONFIG.WINDOW.minWidth,
    minHeight: CONFIG.WINDOW.minHeight,
    title: CONFIG.APP_TITLE,
    show: false,
    backgroundColor: CONFIG.WINDOW.backgroundColor,
    autoHideMenuBar: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false,
      webgl: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (state.maximized) mainWindow.maximize();
  if (CONFIG.WINDOW.startFullscreen) mainWindow.setFullScreen(true);

  /* 窗口标题固定，不跟随网页 document.title 变化 */
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => {
    if (SMOKE) {
      mainWindow.show();
    } else {
      mainWindow.show();
      mainWindow.focus();
      closeSplash();
    }
  });

  mainWindow.on('close', () => saveWindowState());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('responsive', () => log('[win] 渲染进程恢复响应'));
  mainWindow.on('unresponsive', () => {
    log('[win] 渲染进程无响应');
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: '游戏无响应',
      message: '画面可能卡住（常见于切换独显 / 断开外接显示器）。',
      detail: '选择「重新载入」会重开当前页面；存档保存在本机，不会丢失。',
      buttons: ['继续等待', '重新载入'],
      defaultId: 1,
      cancelId: 0,
    });
    if (choice === 1) reloadGame();
  });

  const wc = mainWindow.webContents;

  /* 新窗口 / 外部链接：站内放行，站外交给系统浏览器 */
  wc.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    log('[nav] 拦截新窗口 ' + url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
    log('[nav] 拦截跳转 ' + url);
  });

  /* 渲染层日志：warning/error 落盘，便于定位白屏 */
  wc.on('console-message', (_event, level, message, line, sourceId) => {
    rendererLogs.push({ level, message, line, sourceId, time: Date.now() });
    if (rendererLogs.length > 500) rendererLogs.shift();
    if (level >= 2) log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  wc.on('did-finish-load', () => {
    log('[page] 载入完成 ' + wc.getURL());
    closeSplash();
    /* 首次进入时给一句提示：桌面版已自带联机服务，不必再运行 启动联机.bat */
    if (!desktopToastShown && !SMOKE && currentMode !== 'fallback' && serverInfo) {
      desktopToastShown = true;
      setTimeout(() => toastInGame('桌面版就绪 · 联机已内置：两端输入相同房间号即可'), 2200);
    }
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log(`[page] 载入失败 ${errorCode} ${errorDescription} ${validatedURL}`);
    if (!isMainFrame) return;
    /* 自检模式下不弹阻塞对话框：交给 loadGame 的重试逻辑处理 */
    if (SMOKE) return;
    if (reloadGuard > 2) return;
    reloadGuard += 1;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: '页面载入失败',
      message: `无法载入游戏页面（${errorCode} ${errorDescription}）`,
      detail: '常见原因是内置服务器端口被占用或游戏文件不完整。\n'
        + '可尝试：「联机 → 重启联机服务」，或用「存档 → 打开存档目录」旁的日志目录查看 main.log。',
      buttons: ['重试', '退出'],
      defaultId: 0,
    });
    if (choice === 0) reloadGame();
    else app.quit();
  });

  wc.on('render-process-gone', (_event, details) => {
    log('[crash] 渲染进程退出 ' + JSON.stringify(details));
    if (reloadGuard > 2) {
      dialog.showErrorBox('游戏进程反复崩溃', '请查看日志目录中的 main.log，并在启动参数里加 --disable-gpu 后重试。');
      return;
    }
    reloadGuard += 1;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: '游戏进程已退出',
      message: '渲染进程意外结束（' + details.reason + '）。',
      detail: '存档不会丢失。若反复出现，可能是显卡驱动问题。',
      buttons: ['重新载入', '退出'],
      defaultId: 0,
    });
    if (choice === 0) reloadGame();
    else app.quit();
  });

  /* 桌面快捷键；不占用游戏自己的按键（WASD/空格/Esc 等一律放行） */
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { event.preventDefault(); toggleFullscreen(); return; }
    if (input.key === 'F12') { event.preventDefault(); mainWindow.webContents.toggleDevTools(); return; }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
      reloadGame();
    }
  });

  mainWindow.setMenu(Menu.buildFromTemplate(buildMenu(menuApi)));
  applyMenuBar();
  return mainWindow;
}

function applyMenuBar() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (menuBarVisible) {
    mainWindow.setAutoHideMenuBar(false);
    mainWindow.setMenuBarVisibility(true);
  } else {
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  }
}

/* ============================ 载入游戏 ============================ */
async function loadGame(retries = 2) {
  if (!mainWindow) return;
  const base = linkTargetOf();
  if (!base) throw new Error('内置服务器未就绪');
  targetUrl = base;
  const url = base + (base.includes('?') ? '&' : '?') + 'v=' + Date.now();
  log('[page] 载入 ' + url);
  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    /* 偶发 ERR_FAILED / conexion 竞态：自动重试，别把用户甩到错误弹窗 */
    if (retries > 0) {
      log(`[page] 载入失败（${err.message}），${800}ms 后重试，剩余 ${retries} 次`);
      await wait(800);
      return loadGame(retries - 1);
    }
    throw err;
  }
}

function reloadGame() {
  reloadGuard = 0;
  loadGame().catch((err) => {
    log('[page] 重新载入失败 ' + err.message);
    dialog.showErrorBox('重新载入失败', err.message);
  });
}

function toggleFullscreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
}

function setZoom(factor) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const f = Math.min(2, Math.max(0.5, Number(factor) || 1));
  mainWindow.webContents.setZoomFactor(f);
  log('[view] 缩放 ' + f);
}

/* ============================ 联机相关 ============================ */
async function probeHealth(baseUrl, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + 'health', { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.service !== 'tide-coop' || data.protocol !== CONFIG.RELAY_PROTOCOL) {
      return { ok: false, reason: '对方地址不是兼容的潮声之下联机服务器' };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? '连接超时（检查 IP、端口、防火墙）' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function promptForAddress(defaultValue) {
  return new Promise((resolve) => {
    if (promptWindow && !promptWindow.isDestroyed()) { promptWindow.focus(); resolve(null); return; }
    promptResolve = resolve;
    promptWindow = new BrowserWindow({
      width: 430,
      height: 226,
      parent: mainWindow || undefined,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: '连接主机',
      backgroundColor: CONFIG.WINDOW.backgroundColor,
      icon: ICON_PATH,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    promptWindow.setMenuBarVisibility(false);
    promptWindow.loadFile(path.join(__dirname, 'prompt.html'), { query: { initial: defaultValue || '' } })
      .catch((err) => log('[prompt] 载入失败 ' + err.message));
    promptWindow.once('ready-to-show', () => promptWindow && promptWindow.show());
    promptWindow.on('closed', () => {
      promptWindow = null;
      if (promptResolve) { const r = promptResolve; promptResolve = null; r(null); }
    });
  });
}

async function showServerInfoDialog() {
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '联机状态',
    message: '潮声之下 · 联机服务（内置）',
    detail: describeServer()
      + `\n\n服务版本：${CONFIG.RELAY_VERSION}（协议 ${CONFIG.RELAY_PROTOCOL}）`
      + `\n中继房间：${serverInfo ? JSON.stringify(serverInfo.relay.stats()) : '未运行'}`,
    buttons: ['知道了'],
    noLink: true,
  });
}

function toastInGame(text) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const code = `(() => { try { if (typeof toast === 'function') { toast(${JSON.stringify(text)}); return true; } } catch (e) {} return false; })()`;
  mainWindow.webContents.executeJavaScript(code, true).catch(() => {});
}

async function copyLanUrl() {
  const url = serverInfo && serverInfo.lan.length ? serverInfo.lan[0].url : (serverInfo ? serverInfo.url : '');
  if (!url) { dialog.showErrorBox('暂无地址', '内置服务器未运行。'); return; }
  clipboard.writeText(url);
  toastInGame('已复制联机地址：' + url);
  log('[net] 复制地址 ' + url);
}

function openInApp(route) {
  const base = linkTargetOf();
  if (!base) return;
  mainWindow.loadURL(base + route).catch((err) => log('[nav] 打开 ' + route + ' 失败 ' + err.message));
}

async function connectAsGuest() {
  const hint = serverInfo && serverInfo.lan.length ? serverInfo.lan[0].address + ':' + serverInfo.port : '192.168.1.20:8123';
  const addr = await promptForAddress(hint);
  if (!addr) return;
  const hostPart = addr.includes(':') ? addr : addr + ':' + CONFIG.PORT_PREFERRED;
  const base = 'http://' + hostPart + '/';
  const probe = await probeHealth(base);
  if (!probe.ok) {
    dialog.showErrorBox('无法连接主机', `地址：${base}\n原因：${probe.reason}\n\n请确认主机端已打开本应用（或已运行 启动联机.bat），且两台设备在同一网络。`);
    return;
  }
  guestUrl = base;
  currentMode = 'guest';
  log('[net] 切换为客机 ' + base);
  await loadGame();
  toastInGame('已连接主机 ' + base);
}

async function backToLocal() {
  if (!serverInfo) return;
  currentMode = 'local';
  guestUrl = null;
  await loadGame();
  toastInGame('已返回本地单机模式');
}

async function restartLocalServer() {
  if (serverRestarting) return;
  serverRestarting = true;
  try {
    if (serverInfo) await serverInfo.close();
    serverInfo = await startLocalServer({
      gameDir: GAME_DIR,
      entryFile: CONFIG.GAME_ENTRY,
      log,
      preferredPort: CONFIG.PORT_PREFERRED,
      relayVersion: CONFIG.RELAY_VERSION,
      relayProtocol: CONFIG.RELAY_PROTOCOL,
    });
    currentMode = 'local';
    guestUrl = null;
    await loadGame();
    await showServerInfoDialog();
  } catch (err) {
    dialog.showErrorBox('联机服务启动失败', err.message);
  } finally {
    serverRestarting = false;
  }
}

/* ============================ 存档 ============================ */
async function readLocalStorage() {
  const code = `(() => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
    } catch (e) { return { __error: String(e) }; }
    return out;
  })()`;
  return mainWindow.webContents.executeJavaScript(code, true);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function exportSave() {
  try {
    const data = await readLocalStorage();
    if (data && data.__error) { dialog.showErrorBox('读取存档失败', data.__error); return; }
    const count = Object.keys(data).length;
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '导出存档',
      defaultPath: path.join(app.getPath('documents'), `潮声之下存档_${stamp()}.json`),
      filters: [{ name: '存档 JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return;
    const payload = {
      app: '潮声之下',
      kind: 'save-export',
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      origin: targetUrl,
      data,
    };
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    log(`[save] 导出 ${count} 项 → ${res.filePath}`);
    dialog.showMessageBox(mainWindow, { type: 'info', message: '导出完成', detail: `${count} 项存档已写入：\n${res.filePath}`, buttons: ['好'] });
  } catch (err) {
    dialog.showErrorBox('导出失败', err.message);
  }
}

async function importSave() {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '导入存档',
      properties: ['openFile'],
      filters: [{ name: '存档 JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths.length) return;
    const raw = fs.readFileSync(res.filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    const data = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : (typeof parsed === 'object' ? parsed : null);
    if (!data) { dialog.showErrorBox('导入失败', '文件格式不是本应用导出的存档。'); return; }
    const entries = Object.entries(data).filter(([, v]) => typeof v === 'string');
    const confirm = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      title: '导入存档',
      message: `将写入 ${entries.length} 项存档并重新载入游戏，当前进度会被覆盖。`,
      buttons: ['导入并重载', '取消'],
      defaultId: 0,
      cancelId: 1,
    });
    if (confirm !== 0) return;
    const code = `(() => {
      const data = ${JSON.stringify(Object.fromEntries(entries))};
      let n = 0;
      try { for (const [k, v] of Object.entries(data)) { localStorage.setItem(k, v); n++; } } catch (e) { return { ok: false, error: String(e) }; }
      return { ok: true, count: n };
    })()`;
    const result = await mainWindow.webContents.executeJavaScript(code, true);
    log('[save] 导入 ' + JSON.stringify(result));
    reloadGame();
  } catch (err) {
    dialog.showErrorBox('导入失败', err.message);
  }
}

async function clearSave() {
  const confirm = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    title: '清除存档',
    message: '⚠️ 将清空本机的游戏存档与设置（元晶、解锁、词条、最高纪录全部归零），且无法撤销。',
    detail: '建议先「存档 → 导出存档」备份。',
    buttons: ['我已知晓，清空', '取消'],
    defaultId: 1,
    cancelId: 1,
  });
  if (confirm !== 0) return;
  try {
    await session.defaultSession.clearStorageData({ storages: ['localstorage', 'indexdb', 'websql', 'cachestorage', 'shadercache'] });
    log('[save] 已清空本机存档');
    reloadGame();
  } catch (err) {
    dialog.showErrorBox('清除失败', err.message);
  }
}

/* ============================ 帮助 / 关于 ============================ */
async function openGameFile(rel) {
  const target = path.join(GAME_DIR, rel);
  if (!fs.existsSync(target)) { shell.openPath(GAME_DIR); return; }
  await shell.openPath(target);
}

async function showAbout() {
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '桌面版说明',
    message: `${CONFIG.APP_TITLE} · 桌面版 v${app.getVersion()}`,
    detail: [
      '这是把网页版游戏封装成的独立桌面程序：双击即玩，无需浏览器、无需安装 Python 或启动脚本。',
      '',
      `游戏本体：${CONFIG.GAME_ENTRY}`,
      `内置服务器：${serverInfo ? serverInfo.url : '未运行'}`,
      `运行模式：${currentMode === 'fallback' ? '兼容模式（file://）' : currentMode === 'guest' ? '客机' : '本地主机'}`,
      '',
      '快捷键：F11 全屏 · F5 重载 · F12 开发者工具 · Alt+M 菜单栏',
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      `日志目录：${LOG_DIR}`,
    ].join('\n'),
    buttons: ['好'],
    noLink: true,
  });
}

/* ============================ 菜单回调 ============================ */
const menuApi = {
  reload: () => reloadGame(),
  toggleFullscreen: () => toggleFullscreen(),
  toggleMenuBar: () => { menuBarVisible = !menuBarVisible; applyMenuBar(); },
  quit: () => { app.quit(); },
  openHelp: () => openGameFile('桌面版说明.txt'),
  openGameDir: () => shell.openPath(GAME_DIR),
  showServerInfo: () => showServerInfoDialog(),
  copyLanUrl: () => copyLanUrl(),
  openDiagnostics: () => openInApp('diagnostics'),
  connectAsGuest: () => connectAsGuest().catch((err) => dialog.showErrorBox('连接失败', err.message)),
  backToLocal: () => backToLocal().catch((err) => dialog.showErrorBox('切换失败', err.message)),
  restartServer: () => restartLocalServer(),
  openSaveDir: () => shell.openPath(USER_DATA),
  exportSave: () => exportSave(),
  importSave: () => importSave(),
  clearSave: () => clearSave(),
  setZoom: (f) => setZoom(f),
  toggleDevTools: () => mainWindow && mainWindow.webContents.toggleDevTools(),
  openLogDir: () => shell.openPath(LOG_DIR),
  showAbout: () => showAbout(),
};

/* ============================ IPC ============================ */
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  mode: currentMode,
  server: serverInfo ? { url: serverInfo.url, port: serverInfo.port, lan: serverInfo.lan, lanBound: serverInfo.lanBound } : null,
  userData: USER_DATA,
  logDir: LOG_DIR,
}));
ipcMain.on('prompt:submit', (_event, value) => {
  if (!promptResolve) return;
  const resolve = promptResolve;
  promptResolve = null;
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.close();
  resolve(typeof value === 'string' ? value : null);
});
ipcMain.on('prompt:cancel', () => {
  if (!promptResolve) return;
  const resolve = promptResolve;
  promptResolve = null;
  if (promptWindow && !promptWindow.isDestroyed()) promptWindow.close();
  resolve(null);
});

/* ============================ 冒烟自检（npm run smoke） ============================ */
function smokeProbe() {
  const info = {
    userAgent: navigator.userAgent,
    protocol: location.protocol,
    host: location.host,
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    desktopBridge: typeof window.desktopApp,
    hasLogicModule: !!globalThis.__D3D_LOGIC,
    hasGameExport: !!globalThis.__D3D,
    runtimeErrors: globalThis.__D3D_RUNTIME_ERRORS || [],
    scriptSrcCount: document.querySelectorAll('script[src]').length,
    canvases: [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, id: c.id || null })),
    loadOverlay: (() => {
      const note = document.getElementById('loadNote');
      const title = document.getElementById('loadTitle');
      const msg = document.getElementById('loadMsg');
      return {
        visible: note ? !note.classList.contains('hidden') : null,
        title: title ? title.textContent : null,
        message: msg ? msg.textContent : null,
      };
    })(),
    webgl: (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { ok: false, reason: '无 WebGL 上下文' };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          ok: true,
          version: gl.getParameter(gl.VERSION),
          vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
          renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          contextLost: gl.isContextLost(),
        };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    })(),
    audio: {
      AudioContext: typeof (window.AudioContext || window.webkitAudioContext),
      state: (() => { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const s = ac.state; ac.close(); return s; } catch (e) { return 'error: ' + e.message; } })(),
    },
    storage: (() => { try { return { ok: true, keys: localStorage.length }; } catch (e) { return { ok: false, error: String(e) }; } })(),
    fetchedAssets: (() => {
      try {
        return performance.getEntriesByType('resource')
          .filter((e) => /\.(js|png|jpg|wav|json)(\?|$)/i.test(e.name))
          .map((e) => ({ name: e.name.replace(location.origin + '/', ''), ms: Math.round(e.duration), size: e.transferSize }));
      } catch { return []; }
    })(),
  };
  return info;
}

async function runSmoke() {
  const outArg = flagValue('--smoke');
  const outDir = outArg ? path.resolve(outArg) : path.join(app.getAppPath(), 'smoke');
  log('[smoke] 等待 ' + CONFIG.SMOKE_WAIT_MS + 'ms 后截图');
  await wait(CONFIG.SMOKE_WAIT_MS);

  const wc = mainWindow.webContents;
  const js = (code) => wc.executeJavaScript(code, true).catch((err) => ({ __error: String(err) }));

  const report = {
    generatedAt: new Date().toISOString(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    mode: currentMode,
    server: serverInfo ? { url: serverInfo.url, port: serverInfo.port, lanBound: serverInfo.lanBound, lan: serverInfo.lan } : null,
    page: null,
    interactions: {},
    rendererConsole: rendererLogs,
  };

  try {
    report.page = await js('(' + smokeProbe.toString() + ')()');
  } catch (err) {
    report.page = { probeError: String(err) };
  }

  /* ---- 截图 1：进来时的主菜单（证明渲染管线正常） ---- */
  try {
    const image = await wc.capturePage();
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'smoke-shot.png'), image.toPNG());
  } catch (err) {
    log('[smoke] 截图失败 ' + err.message);
  }

  /* ---- 交互 0：埋真实事件探针（只统计 isTrusted，证明输入来自系统而非脚本） ---- */
  await js(`(() => {
    const desc = (el) => el ? (el.tagName || '').toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '') : null;
    window.__smokeTrusted = { pointerdown: 0, click: 0, keydown: 0, onTarget: 0, onTargetLabel: null, lastTarget: null, lastClient: null };
    const isTarget = (el) => el && el.closest && el.closest('button') && /准备下潜|开始|出击/.test(el.closest('button').textContent || '');
    addEventListener('pointerdown', (e) => {
      if (!e.isTrusted) return;
      window.__smokeTrusted.pointerdown++;
      window.__smokeTrusted.lastTarget = desc(e.target);
      window.__smokeTrusted.lastClient = { x: e.clientX, y: e.clientY };
      if (isTarget(e.target)) {
        window.__smokeTrusted.onTarget++;
        window.__smokeTrusted.onTargetLabel = (e.target.closest('button').textContent || '').trim().slice(0, 12);
      }
    }, true);
    addEventListener('click', (e) => { if (e.isTrusted) window.__smokeTrusted.click++; }, true);
    addEventListener('keydown', (e) => { if (e.isTrusted) window.__smokeTrusted.keydown++; }, true);
    return true;
  })()`);

  /* ---- 交互 0.5：关掉开场剧情遮罩（它会吞掉 M 键与主菜单点击，导致自检时好时坏） ---- */
  const storyState = () => js(`(()=>{try{
    const g = window.__D3D && window.__D3D.get();
    return g && g.story ? { modal: !!g.story.modal, echo: g.story.echo } : null;
  }catch(e){ return null; }})()`);
  const findAdvanceButton = () => js(`(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/跳过|继续|知道了|确定|展开/.test(x.textContent||''));
    if(!b) return null;
    const r=b.getBoundingClientRect();
    return {label:(b.textContent||'').trim().slice(0,10), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
  })()`);
  let introCleared = false;
  for (let i = 0; i < 12; i += 1) {
    const st = await storyState();
    if (!st || !st.modal) { introCleared = true; break; }
    const btn = await findAdvanceButton();
    if (btn && Number.isFinite(btn.x)) {
      wc.sendInputEvent({ type: 'mouseMove', x: btn.x, y: btn.y });
      wc.sendInputEvent({ type: 'mouseDown', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
    } else {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
    }
    await wait(420);
  }
  report.interactions.intro = { cleared: introCleared, finalState: await storyState() };

  /* ---- 交互 1：真实键盘事件（M 键切换小地图展开） ---- */
  const readMinimap = () => js('(()=>{try{return window.__D3D?window.__D3D.minimap().expanded:null}catch(e){return "err:"+e.message}})()');
  const mBefore = await readMinimap();
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'M' });
  wc.sendInputEvent({ type: 'char', keyCode: 'M' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'M' });
  await wait(400);
  const mAfter = await readMinimap();
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'M' });
  wc.sendInputEvent({ type: 'char', keyCode: 'M' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'M' });
  await wait(400);
  const mRestored = await readMinimap();
  const trustedAfterKeys = await js('window.__smokeTrusted || null');
  const toggleWorked = typeof mBefore === 'boolean' && mAfter === !mBefore && mRestored === mBefore;
  report.interactions.keyboard = {
    key: 'M',
    minimapBefore: mBefore,
    minimapAfter: mAfter,
    minimapRestored: mRestored,
    /* 桌面壳的硬保证：真实按键（isTrusted）已送进页面并被游戏的 window 监听器收到 */
    trustedEvents: trustedAfterKeys,
    trustedKeysDelivered: !!(trustedAfterKeys && trustedAfterKeys.keydown > 0),
    /* 游戏内部反应（附加证据；开场剧情弹窗激活时 M 会被游戏主动忽略，属预期行为） */
    gameReacted: toggleWorked,
    ok: !!(trustedAfterKeys && trustedAfterKeys.keydown > 0),
  };

  /* ---- 交互 2：真实鼠标点击（命中检测 + 界面推进） ---- */
  const viewFingerprint = `(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
    const title = document.querySelector('h1,h2,.title,.panel-title');
    return {
      visibleButtons: btns.length,
      firstButtons: btns.slice(0, 3).map((b) => (b.textContent || '').trim().slice(0, 12)),
      heading: title ? (title.textContent || '').trim().slice(0, 24) : null,
      textLength: (document.body.innerText || '').length,
    };
  })()`;
  /* 选点击目标：优先“能被命中的游戏按钮”，否则退化为视口中心点命中测试。
     两种情况下都用 elementFromPoint 预判落点元素，事后与真实事件的 target 比对。 */
  const target = await js(`(()=>{
    const desc = (el) => el ? (el.tagName || '').toLowerCase()
      + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '') : null;
    const btns = [...document.querySelectorAll('button')].filter(b => /准备下潜|开始|出击/.test(b.textContent || ''));
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) continue;
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === b || b.contains(hit))) {
        return { kind: 'button', label: (b.textContent || '').trim().slice(0, 16), x, y, predictedTarget: desc(hit) };
      }
    }
    const x = Math.round(innerWidth / 2), y = Math.round(innerHeight / 2);
    const hit = document.elementFromPoint(x, y);
    return { kind: 'point', label: '视口中心', x, y, predictedTarget: desc(hit) };
  })()`);
  const before = await js(viewFingerprint);
  const stateBefore = await js('(()=>{try{return window.__D3D?window.__D3D.state():null}catch(e){return null}})()');
  if (target && !target.__error && Number.isFinite(target.x)) {
    /* sendInputEvent 用的是「窗口坐标」（含标题栏/菜单栏），而元素矩形是「视口坐标」，
       两者相差一个框高。先点视口中心做一次标定，拿到偏移后再点真正想点的控件。 */
    mainWindow.focus();
    wc.focus();
    await wait(200);
    const center = await js('({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) })');
    const sendClick = async (x, y) => {
      wc.sendInputEvent({ type: 'mouseMove', x, y });
      await wait(100);
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      await wait(60);
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    };
    await sendClick(center.x, center.y);
    await wait(350);
    const afterCal = await js('window.__smokeTrusted || null');
    const client = afterCal && afterCal.lastClient;
    const delta = client && Number.isFinite(client.x) && Number.isFinite(client.y)
      ? { x: client.x - center.x, y: client.y - center.y }
      : { x: 0, y: 0 };
    report.interactions.mouseCalibration = {
      sentAt: center,
      receivedAt: client,
      frameOffset: delta,
      /* 偏移为 0 也是正常结果（坐标本就是视口坐标）；只要求收到事件且偏移在合理范围内 */
      ok: !!(client && Number.isFinite(client.x) && Math.abs(delta.x) < 200 && Math.abs(delta.y) < 200),
    };

    const clickTarget = async () => {
      await sendClick(target.x + delta.x, target.y + delta.y);
    };
    await clickTarget();
    await wait(1600);
    let after = await js(viewFingerprint);
    let changed = !!(before && after && !before.__error && !after.__error
      && (before.visibleButtons !== after.visibleButtons
        || before.heading !== after.heading
        || before.textLength !== after.textLength
        || JSON.stringify(before.firstButtons) !== JSON.stringify(after.firstButtons)));
    let trusted = await js('window.__smokeTrusted || null');
    let hitTarget = !!(trusted && (trusted.onTarget > 0 || trusted.lastTarget === target.predictedTarget));
    if (!hitTarget) {
      /* 布局/焦点偶发变化时重试一次 */
      mainWindow.focus();
      wc.focus();
      await wait(150);
      await clickTarget();
      await wait(1600);
      after = await js(viewFingerprint);
      changed = !!(before && after && !before.__error && !after.__error
        && (before.visibleButtons !== after.visibleButtons
          || before.heading !== after.heading
          || before.textLength !== after.textLength
          || JSON.stringify(before.firstButtons) !== JSON.stringify(after.firstButtons)));
      trusted = await js('window.__smokeTrusted || null');
      hitTarget = !!(trusted && (trusted.onTarget > 0 || trusted.lastTarget === target.predictedTarget));
    }
    const stateAfter = await js('(()=>{try{return window.__D3D?window.__D3D.state():null}catch(e){return null}})()');
    const snapshot = await js('(()=>{try{return window.__D3D?window.__D3D.get():null}catch(e){return null}})()');
    report.interactions.mouse = {
      target: target.label,
      kind: target.kind,
      at: { x: target.x + delta.x, y: target.y + delta.y },
      predictedTarget: target.predictedTarget,
      trustedEvents: trusted,
      trustedClickDelivered: !!(trusted && trusted.pointerdown > 0 && trusted.click > 0),
      hitIntendedControl: hitTarget,
      gameAdvanced: changed,
      viewBefore: before,
      viewAfter: after,
      gameStateBefore: stateBefore,
      gameStateAfter: stateAfter,
      ok: !!(trusted && trusted.pointerdown > 0) && hitTarget,
      snapshot: snapshot && {
        state: snapshot.state, level: snapshot.level, modeId: snapshot.modeId, roleId: snapshot.roleId,
        hp: snapshot.hp, maxHp: snapshot.maxHp, monsterCount: snapshot.monsters,
      },
    };
    try {
      const shot = await wc.capturePage();
      fs.writeFileSync(path.join(outDir, 'smoke-shot-ingame.png'), shot.toPNG());
    } catch { /* ignore */ }
  } else {
    report.interactions.mouse = { ok: false, reason: '主菜单未找到可点击按钮', target };
  }

  /* ---- 交互 3：指针锁 / 输入模块能力 ---- */
  report.interactions.inputApi = await js(`(()=>{
    const c=document.querySelector('canvas');
    return {
      pointerLockApi: typeof (c && c.requestPointerLock),
      pointerLocked: !!document.pointerLockElement,
      hasInputModule: !!globalThis.__D3D_INPUT,
      gamepadsApi: typeof navigator.getGamepads,
      fullscreenApi: typeof document.documentElement.requestFullscreen,
      desktopBridge: typeof window.desktopApp,
    };
  })()`);

  report.runtimeErrorsAfterInteraction = await js('globalThis.__D3D_RUNTIME_ERRORS || []');

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'smoke-report.json'), JSON.stringify(report, null, 2), 'utf8');
    log('[smoke] 结果写入 ' + outDir);
  } catch (err) {
    log('[smoke] 报告写入失败 ' + err.message);
  }
  setTimeout(() => app.exit(0), 200);
}

/* ============================ 应用生命周期 ============================ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    log('=== 启动 潮声之下 桌面版 v' + app.getVersion() + ' ===');
    log(`[env] dev=${IS_DEV} gameDir=${GAME_DIR} entry=${CONFIG.GAME_ENTRY} userData=${USER_DATA}`);
    setupPermissions();

    if (!SMOKE) createSplashWindow();

    /* 1) 先起内置服务器，再开窗口 —— 避免首次加载找不到地址导致白屏 */
    try {
      serverInfo = await startLocalServer({
        gameDir: GAME_DIR,
        entryFile: CONFIG.GAME_ENTRY,
        log,
        preferredPort: CONFIG.PORT_PREFERRED,
        relayVersion: CONFIG.RELAY_VERSION,
        relayProtocol: CONFIG.RELAY_PROTOCOL,
      });
      currentMode = 'local';
    } catch (err) {
      log('[server] 启动失败 ' + err.message);
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: '内置服务器启动失败',
        message: err.message,
        detail: '将尝试以兼容模式（file://）直接打开游戏文件：单机可玩，但联机功能不可用，部分浏览器接口可能受限。',
        buttons: ['兼容模式继续', '退出'],
        defaultId: 0,
      });
      if (choice === 1) { app.quit(); return; }
      currentMode = 'fallback';
      targetUrl = 'file://' + path.join(GAME_DIR, CONFIG.GAME_ENTRY).replace(/\\/g, '/');
    }

    createMainWindow();

    try {
      if (currentMode === 'fallback') {
        log('[page] 兼容模式载入 file://');
        await mainWindow.loadFile(path.join(GAME_DIR, CONFIG.GAME_ENTRY));
      } else {
        await loadGame();
      }
    } catch (err) {
      log('[page] 首次载入失败 ' + err.message);
      dialog.showErrorBox('载入失败', err.message);
    }

    if (SMOKE) runSmoke();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async (event) => {
    saveWindowState();
    if (serverInfo) {
      event.preventDefault();
      const info = serverInfo;
      serverInfo = null;
      try { await info.close(); } catch { /* ignore */ }
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}
