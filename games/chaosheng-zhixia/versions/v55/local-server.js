'use strict';
/**
 * 内置本地服务器：静态文件 + /health + /ws 中继 + 诊断页路由。
 *
 * 为什么要内置服务器，而不是直接 loadFile('xxx.html')？
 *   1) 游戏用 <script src="assets/...">、fetch('/health') 等以「站点根目录」为基准的地址，
 *      file:// 下这批请求会被 CORS / 同源策略拦掉 —— 白屏的头号原因；
 *   2) 游戏代码里 netConnect() 明确要求 location.protocol 为 http/https，
 *      否则拒绝联机（"请先运行 Python 服务器"）；
 *   3) http 源下 localStorage、WebGL 贴图、AudioContext 行为与浏览器完全一致，
 *      存档跨版本可继续沿用。
 * 服务器只监听本机/局域网，不连外网，随应用启动和退出。
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Relay } = require('./relay');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** 把 URL 路径安全地映射到游戏目录内；越界返回 null（防目录穿越） */
function safeJoin(root, pathname) {
  const decoded = pathname.replace(/^\/+/, '');
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, decoded);
  const prefix = path.resolve(root) + path.sep;
  if (full !== path.resolve(root) && !full.startsWith(prefix)) return null;
  return full;
}

function lanAddresses(port) {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      out.push({ iface: name, address: info.address, url: `http://${info.address}:${port}/` });
    }
  }
  return out;
}

async function sendFile(req, res, filePath, { log }) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 · 找不到资源：' + path.basename(filePath));
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 · 目录不可直接访问');
    return;
  }

  const headers = {
    'Content-Type': mimeOf(filePath),
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };

  /* 单段 Range 支持：音视频拖动与后续大资源下载都能用 */
  const range = req.headers.range;
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [s, e] = range.replace('bytes=', '').split('-');
    if (s) start = Number(s);
    if (e) end = Math.min(Number(e), stat.size - 1);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;

  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', (err) => {
    log?.(`[server] 读取失败 ${filePath} ${err.message}`);
    res.destroy();
  });
  stream.pipe(res);
}

/**
 * 启动内置服务器。端口策略：
 *   1) 0.0.0.0:8123 —— 与「启动联机.bat」同一约定，开局即可局域网联机；
 *   2) 127.0.0.1:8123 —— 8123 被占用（例如 Python 服务器还开着）时退回本机；
 *   3) 127.0.0.1:随机 —— 上面都不行时保证单机能玩。
 * @returns {Promise<{url:string, port:number, host:string, lanBound:boolean, lan:Array, relay:Relay, close:Function}>}
 */
async function startLocalServer({
  gameDir,
  entryFile,
  log = () => {},
  preferredPort = 8123,
  relayVersion,
  relayProtocol,
  bind = 'lan',           // 'lan' = 允许局域网；'local' = 仅本机（自动化测试用）
}) {
  const relay = new Relay({ log, version: relayVersion, protocol: relayProtocol });

  const handler = async (req, res) => {
    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      pathname = '/';
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('405 · 仅支持 GET/HEAD');
      return;
    }

    if (pathname === '/health') {
      const body = JSON.stringify({
        service: 'tide-coop',
        version: relayVersion,
        protocol: relayProtocol,
        teamStages: true,
        websocket: '/ws',
        host: 'chaosheng-desktop',
      });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    let filePath;
    if (pathname === '/' || pathname === '/index.html' || pathname === '/' + entryFile) {
      filePath = path.join(gameDir, entryFile);
    } else if (pathname === '/diagnostics' || pathname === '/diagnostics.html') {
      filePath = path.join(gameDir, '联机诊断.html');
    } else if (pathname === '/characters' || pathname === '/characters.html') {
      filePath = path.join(gameDir, '人物预览.html');
    } else {
      filePath = safeJoin(gameDir, pathname);
    }
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 · 非法路径');
      return;
    }
    await sendFile(req, res, filePath, { log });
  };

  const server = http.createServer(handler);
  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch { /* ignore */ }
    if (pathname === '/ws') relay.handleUpgrade(req, socket, head);
    else {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });
  server.on('clientError', (err, socket) => {
    if (err.code === 'ECONNRESET' || !socket.writable) return;
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  const attempts = bind === 'local'
    ? [{ host: '127.0.0.1', port: preferredPort, lanBound: false }]
    : [
      { host: '0.0.0.0', port: preferredPort, lanBound: true },
      { host: '127.0.0.1', port: preferredPort, lanBound: false },
      { host: '127.0.0.1', port: 0, lanBound: false },
    ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
        const onListening = () => { server.removeListener('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(attempt.port, attempt.host);
      });
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : attempt.port;
      const info = {
        url: `http://127.0.0.1:${port}/`,
        port,
        host: attempt.host,
        lanBound: attempt.lanBound,
        lan: attempt.lanBound ? lanAddresses(port) : [],
        relay,
        close: () => new Promise((resolve) => {
          relay.close();
          try { server.close(() => resolve()); } catch { resolve(); }
        }),
      };
      log(`[server] 已启动 http://${attempt.host}:${port} 根目录=${gameDir}`);
      for (const item of info.lan) log(`[server] 局域网入口 ${item.url}（${item.iface}）`);
      if (!attempt.lanBound) log('[server] 提示：8123 端口的局域网监听失败，本次仅本机可访问。');
      return info;
    } catch (err) {
      lastError = err;
      log(`[server] ${attempt.host}:${attempt.port} 监听失败：${err.code || err.message}，尝试下一个方案`);
    }
  }
  throw new Error('内置服务器无法启动：' + (lastError ? (lastError.code || lastError.message) : '未知错误'));
}

module.exports = { startLocalServer, MIME, safeJoin, lanAddresses };
