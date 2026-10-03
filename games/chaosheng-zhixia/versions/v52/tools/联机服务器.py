#!/usr/bin/env python3
"""潮声之下联机服务：aiohttp HTTP + WebSocket，Python 3.10+。"""
import argparse
import asyncio
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import socket
import sys
import uuid

try:
    from aiohttp import web, WSMsgType
except ImportError:
    print('缺少 aiohttp，请使用 启动联机.bat，或 python -m pip install -r requirements.txt')
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parent
GAME = ROOT / '潮声之下_深渊潜航3D_v22.html'
VERSION = '3.1-coop-stages'
log = logging.getLogger('tide')
RELAY = {'state', 'world', 'dmg', 'kill', 'hello', 'start', 'pickup', 'mission', 'exit_request', 'stage_exit'}


class Hub:
    def __init__(self):
        self.rooms = {}
        self.lock = asyncio.Lock()
        self.connections = set()

    async def send(self, ws, msg):
        if ws.closed:
            return
        try:
            await asyncio.wait_for(ws.send_json(msg), 5)
        except (ConnectionError, RuntimeError, asyncio.TimeoutError):
            await ws.close()

    async def members(self, room):
        peers = self.rooms.get(room, {})
        ids = list(peers)
        msg = {'t': 'members', 'room': room, 'members': ids, 'host': ids[0] if ids else None}
        await asyncio.gather(*(self.send(ws, msg) for ws in list(peers.values())))

    async def websocket(self, request):
        ws = web.WebSocketResponse(heartbeat=20, max_msg_size=2 * 1024 * 1024, compress=False)
        await ws.prepare(request)
        self.connections.add(ws)
        ident, room = uuid.uuid4().hex, None
        log.info('WebSocket 接通 peer=%s id=%s', request.remote, ident[:8])
        try:
            async for frame in ws:
                if frame.type == WSMsgType.ERROR:
                    log.warning('WebSocket 错误 %s', ws.exception())
                    break
                if frame.type != WSMsgType.TEXT:
                    continue
                try:
                    msg = json.loads(frame.data)
                except ValueError:
                    await self.send(ws, {'t': 'error', 'message': '消息不是有效 JSON'})
                    continue
                if not isinstance(msg, dict):
                    continue
                kind = msg.get('t')
                if kind == 'ping':
                    await self.send(ws, {'t': 'pong'})
                elif kind == 'join':
                    name = msg.get('room')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 48:
                        await self.send(ws, {'t': 'error', 'message': '房间号须为 1—48 个字符'})
                        continue
                    name = name.strip().upper()
                    async with self.lock:
                        if room is not None:
                            await self.send(ws, {'t': 'error', 'message': '已在房间中，请断开后再加入'})
                        elif len(self.rooms.get(name, {})) >= 2:
                            await self.send(ws, {'t': 'error', 'message': '房间已满（最多两人）'})
                        else:
                            room = name
                            self.rooms.setdefault(room, {})[ident] = ws
                            await self.send(ws, {'t': 'joined', 'room': room, 'idx': ident, 'protocol': 2, 'version': VERSION})
                            await self.members(room)
                            log.info('加入房间 %s id=%s', room, ident[:8])
                elif kind in RELAY:
                    if room is None:
                        await self.send(ws, {'t': 'error', 'message': '请先加入房间'})
                        continue
                    msg['idx'] = ident
                    recipients = [p for key, p in self.rooms.get(room, {}).items() if key != ident]
                    await asyncio.gather(*(self.send(p, msg) for p in recipients))
        finally:
            self.connections.discard(ws)
            async with self.lock:
                if room in self.rooms:
                    peers = self.rooms[room]
                    peers.pop(ident, None)
                    await asyncio.gather(*(self.send(p, {'t': 'left', 'idx': ident}) for p in list(peers.values())))
                    await self.members(room)
                    if not peers:
                        del self.rooms[room]
            log.info('连接关闭 id=%s room=%s code=%s', ident[:8], room, ws.close_code)
        return ws


def make_app():
    hub = Hub()
    app = web.Application()

    async def game(request):
        return web.FileResponse(GAME, headers={'Cache-Control': 'no-store'})

    async def health(request):
        return web.json_response({'service': 'tide-coop', 'version': VERSION, 'protocol': 2, 'teamStages': True, 'websocket': '/ws'}, headers={'Cache-Control': 'no-store'})

    async def diagnostic(request):
        return web.FileResponse(ROOT / '联机诊断.html', headers={'Cache-Control': 'no-store'})

    async def characters(request):
        return web.FileResponse(ROOT / '人物预览.html', headers={'Cache-Control': 'no-store'})

    async def shutdown(app):
        await asyncio.gather(*(ws.close(code=1001, message=b'Server shutdown') for ws in list(hub.connections)))

    app.router.add_get('/', game)
    app.router.add_get('/' + GAME.name, game)
    app.router.add_get('/health', health)
    app.router.add_get('/diagnostics', diagnostic)
    app.router.add_get('/characters', characters)
    app.router.add_get('/ws', hub.websocket)
    app.on_shutdown.append(shutdown)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port', nargs='?', type=int, default=8123)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('端口范围为 1—65535')
    handler = RotatingFileHandler(ROOT / '联机运行.log', maxBytes=1024*1024, backupCount=2, encoding='utf-8')
    logging.basicConfig(level=logging.INFO, handlers=[handler, logging.StreamHandler()], format='%(asctime)s %(levelname)s %(message)s')
    addresses = set()
    try:
        addresses.update(socket.gethostbyname_ex(socket.gethostname())[2])
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(('8.8.8.8', 80))
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    print('潮声之下 · aiohttp 联机服务器 ' + VERSION, flush=True)
    print('Python: ' + sys.executable, flush=True)
    print('本机打开: http://127.0.0.1:' + str(args.port), flush=True)
    for ip in sorted(addresses):
        if not ip.startswith('127.'):
            print('另一台设备打开: http://' + ip + ':' + str(args.port), flush=True)
    print('地址末尾加 /diagnostics 可测试 HTTP、WebSocket、加入房间和心跳。', flush=True)
    print('另一台不通时，核对该 Python 的 TCP 防火墙规则及当前网络类型。', flush=True)
    try:
        web.run_app(make_app(), host='0.0.0.0', port=args.port, print=None)
    except OSError as exc:
        log.error('启动失败：%s。可运行 启动联机.bat 8124 换端口。', exc)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
