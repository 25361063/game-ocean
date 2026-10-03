'use strict';
/**
 * 联机中继（/ws）：把 联机服务器.py 的 Hub 逻辑原样搬到 Node，
 * 于是打包后的桌面程序自己就能当主机 —— 不需要 Python，也不需要 启动联机.bat。
 *
 * 协议与 Python 版保持一致（protocol=2）：
 *   join {room} → joined {room, idx, protocol, version} + members {members[], host}
 *   转发 state/world/dmg/kill/hello/start/pickup/mission/exit_request/stage_exit（附带发送者 idx）
 *   ping → pong；离房广播 left + members
 * 房间上限两人，与游戏内「1/2 人」显示一致。
 */

const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const RELAY_KINDS = new Set([
  'state', 'world', 'dmg', 'kill', 'hello', 'start',
  'pickup', 'mission', 'exit_request', 'stage_exit',
]);
const MAX_ROOM_PLAYERS = 2;

class Relay {
  constructor({ log = () => {}, version = 'unknown', protocol = 2 } = {}) {
    this.log = log;
    this.version = version;
    this.protocol = protocol;
    this.rooms = new Map();     // room -> Map<id, ws>
    this.sockets = new Set();

    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
      maxPayload: 2 * 1024 * 1024,
      clientTracking: false,
    });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  handleUpgrade(req, socket, head) {
    try {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    } catch (err) {
      this.log('[ws] 升级失败 ' + err.message);
      try { socket.destroy(); } catch { /* ignore */ }
    }
  }

  send(ws, msg) {
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      this.log('[ws] 发送失败 ' + err.message);
      try { ws.terminate(); } catch { /* ignore */ }
    }
  }

  members(room) {
    const peers = this.rooms.get(room);
    if (!peers) return;
    const ids = [...peers.keys()];
    const msg = { t: 'members', room, members: ids, host: ids[0] || null };
    for (const ws of peers.values()) this.send(ws, msg);
  }

  sendToRoom(room, msg, exceptId) {
    const peers = this.rooms.get(room);
    if (!peers) return;
    for (const [peerId, ws] of peers) {
      if (peerId === exceptId) continue;
      this.send(ws, msg);
    }
  }

  onConnection(ws, req) {
    const id = crypto.randomUUID().replace(/-/g, '');
    let room = null;
    this.sockets.add(ws);
    this.log(`[ws] 接通 ${req && req.socket ? req.socket.remoteAddress : '?'} id=${id.slice(0, 8)}`);

    ws.on('message', (raw) => {
      const text = Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : raw.toString('utf8');
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        this.send(ws, { t: 'error', message: '消息不是有效 JSON' });
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      const kind = msg.t;

      if (kind === 'ping') { this.send(ws, { t: 'pong' }); return; }

      if (kind === 'join') {
        const name = typeof msg.room === 'string' ? msg.room.trim() : '';
        if (!name || name.length > 48) {
          this.send(ws, { t: 'error', message: '房间号须为 1—48 个字符' });
          return;
        }
        const roomName = name.toUpperCase();
        if (room) { this.send(ws, { t: 'error', message: '已在房间中，请断开后再加入' }); return; }
        const peers = this.rooms.get(roomName) || new Map();
        if (peers.size >= MAX_ROOM_PLAYERS) {
          this.send(ws, { t: 'error', message: '房间已满（最多两人）' });
          return;
        }
        peers.set(id, ws);
        this.rooms.set(roomName, peers);
        room = roomName;
        this.send(ws, { t: 'joined', room: roomName, idx: id, protocol: this.protocol, version: this.version });
        this.members(roomName);
        this.log(`[ws] 加入房间 ${roomName} id=${id.slice(0, 8)} 人数=${peers.size}`);
        return;
      }

      if (RELAY_KINDS.has(kind)) {
        if (!room) { this.send(ws, { t: 'error', message: '请先加入房间' }); return; }
        this.sendToRoom(room, { ...msg, idx: id }, id);
        return;
      }

      this.log('[ws] 未识别的消息类型 ' + String(kind));
    });

    ws.on('close', (code) => {
      this.sockets.delete(ws);
      if (room && this.rooms.has(room)) {
        const peers = this.rooms.get(room);
        peers.delete(id);
        this.sendToRoom(room, { t: 'left', idx: id });
        if (peers.size) this.members(room);
        else this.rooms.delete(room);
        this.log(`[ws] 离开房间 ${room} id=${id.slice(0, 8)} 关闭码=${code}`);
      }
    });

    ws.on('error', (err) => this.log('[ws] 错误 ' + err.message));
  }

  stats() {
    let players = 0;
    for (const peers of this.rooms.values()) players += peers.size;
    return { rooms: this.rooms.size, players, sockets: this.sockets.size };
  }

  close() {
    for (const ws of this.sockets) {
      try { ws.close(1001, 'Server shutdown'); } catch { /* ignore */ }
    }
    this.sockets.clear();
    this.rooms.clear();
    try { this.wss.close(); } catch { /* ignore */ }
  }
}

module.exports = { Relay, RELAY_KINDS, MAX_ROOM_PLAYERS };
