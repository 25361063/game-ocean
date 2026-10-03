#!/usr/bin/env node
/**
 * 内置服务器 + 联机中继自检（不需要图形界面，几秒出结果）
 *
 * 覆盖：
 *   · 沙盒 /health 契约（service=tide-coop、protocol=2、teamStages）
 *   · 静态资源：游戏首页、assets/*.js、诊断页、人物预览
 *   · 路径穿越防护、未知路由 404
 *   · WebSocket：join → joined/members → 消息转发（带 idx）→ ping/pong → 离开广播 → 房间满
 *
 * 用法：npm test
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const { startLocalServer } = require(path.join(PROJECT, 'src', 'local-server.js'));
const { GAME_ENTRY, RELAY_VERSION, RELAY_PROTOCOL } = require(path.join(PROJECT, 'src', 'config.js'));

const GAME_DIR = path.join(PROJECT, 'game');
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 消息收集器：WebSocket 帧可能在同一批里连着到达，
 * 必须先把消息存下来再断言，不能“先收一条、挂监听、再等下一条”。
 */
function collect(ws) {
  const log = [];
  const waiters = new Set();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    log.push(msg);
    for (const w of [...waiters]) {
      if (w.predicate(msg)) {
        waiters.delete(w);
        clearTimeout(w.timer);
        w.resolve(msg);
      }
    }
  });
  return {
    log,
    find: (predicate) => log.find(predicate),
    wait(predicate, timeout = 4000) {
      const hit = log.find(predicate);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { predicate, resolve };
        w.timer = setTimeout(() => { waiters.delete(w); reject(new Error('等待消息超时')); }, timeout);
        waiters.add(w);
      });
    },
  };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function main() {
  const server = await startLocalServer({
    gameDir: GAME_DIR,
    entryFile: GAME_ENTRY,
    log: () => {},
    preferredPort: 0,
    bind: 'local',
    relayVersion: RELAY_VERSION,
    relayProtocol: RELAY_PROTOCOL,
  });
  const base = server.url;
  console.log(`内置服务器就绪：${base}\n`);

  /* ---------- HTTP ---------- */
  const healthRes = await fetch(base + 'health');
  const health = await healthRes.json();
  check('/health 契约正确',
    healthRes.ok && health.service === 'tide-coop' && health.protocol === RELAY_PROTOCOL && health.teamStages === true,
    JSON.stringify(health));

  const home = await fetch(base);
  const homeText = await home.text();
  check('首页返回游戏本体',
    home.ok && homeText.includes('潮声之下') && homeText.includes('assets/vitruvian/packed49.js'),
    `${Math.round(homeText.length / 1024)}KB / content-type=${home.headers.get('content-type')}`);

  const direct = await fetch(base + encodeURIComponent(GAME_ENTRY));
  check('可直接访问游戏文件名', direct.ok);

  const asset = await fetch(base + 'assets/vitruvian/GLTFLoader.js');
  check('assets 脚本类型正确',
    asset.ok && (asset.headers.get('content-type') || '').includes('javascript'),
    asset.headers.get('content-type'));

  const diag = await fetch(base + 'diagnostics');
  check('/diagnostics 路由指向诊断页', diag.ok && (await diag.text()).includes('联机诊断'));

  const chars = await fetch(base + 'characters');
  check('/characters 路由指向人物预览', chars.ok);

  const traversed = await fetch(base + '%2e%2e%2fpackage.json');
  check('路径穿越被拦截', [403, 404].includes(traversed.status), 'HTTP ' + traversed.status);

  const missing = await fetch(base + 'nope.txt');
  check('未知资源 404', missing.status === 404);

  /* ---------- WebSocket / 中继 ---------- */
  const wsUrl = base.replace('http://', 'ws://') + 'ws';
  const a = await connect(wsUrl);
  const ca = collect(a);
  a.send(JSON.stringify({ t: 'join', room: 'selftest' }));
  const joinedA = await ca.wait((m) => m.t === 'joined');
  check('房主加入房间', joinedA.room === 'SELFTEST' && joinedA.protocol === RELAY_PROTOCOL && !!joinedA.idx);

  const b = await connect(wsUrl);
  const cb = collect(b);
  b.send(JSON.stringify({ t: 'join', room: 'SELFTEST' }));
  const joinedB = await cb.wait((m) => m.t === 'joined');
  const membersB = await cb.wait((m) => m.t === 'members' && m.members.length === 2);
  check('第二人加入后人数=2 且房主为房主',
    membersB.members.length === 2 && membersB.host === joinedA.idx && joinedB.idx !== joinedA.idx,
    JSON.stringify(membersB.members.map((x) => x.slice(0, 4))));

  a.send(JSON.stringify({ t: 'state', x: 12, y: 34 }));
  const relayed = await cb.wait((m) => m.t === 'state');
  check('游戏状态消息转发且回填 idx',
    relayed.x === 12 && relayed.y === 34 && relayed.idx === joinedA.idx);

  b.send(JSON.stringify({ t: 'ping' }));
  const pong = await cb.wait((m) => m.t === 'pong');
  check('心跳 ping → pong', pong.t === 'pong');

  b.send(JSON.stringify({ t: 'world' }));
  const worldOnA = await ca.wait((m) => m.t === 'world');
  check('反向转发（客机 → 房主）', worldOnA.idx === joinedB.idx);

  const c = await connect(wsUrl);
  const cc = collect(c);
  c.send(JSON.stringify({ t: 'join', room: 'SELFTEST' }));
  const full = await cc.wait((m) => m.t === 'error');
  check('房间满时拒绝第三人', /房间已满/.test(full.message), full.message);

  b.close();
  const left = await ca.wait((m) => m.t === 'left');
  check('断开广播 left', left.idx === joinedB.idx);

  const membersAfter = await ca.wait((m) => m.t === 'members' && m.members.length === 1);
  check('断开后人数回到 1', membersAfter.members.length === 1);

  a.close();
  c.close();

  /* ---------- 收尾 ---------- */
  await wait(150);
  const stats = server.relay.stats();
  check('中继房间已释放', stats.rooms === 0 && stats.players === 0, JSON.stringify(stats));

  /* 关闭服务器：带超时兜底，避免个别平台在 socket 半关闭时卡住不退 */
  await Promise.race([server.close(), wait(2000)]);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n自检结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join('、'));
    process.exit(1);
  }
  console.log('内置服务器与联机中继工作正常。');
  process.exit(0);
}

main().catch((err) => {
  console.error('自检异常：' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
