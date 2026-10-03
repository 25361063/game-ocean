import asyncio
import importlib.util
import unittest
from pathlib import Path
from aiohttp import ClientSession, web

spec = importlib.util.spec_from_file_location('tide_server', Path(__file__).with_name('联机服务器.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class NetworkTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.runner = web.AppRunner(server.make_app())
        await self.runner.setup()
        site = web.TCPSite(self.runner, '127.0.0.1', 0)
        await site.start()
        self.base = 'http://127.0.0.1:' + str(site._server.sockets[0].getsockname()[1])
        self.client = ClientSession()

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()

    async def recv(self, ws):
        return await asyncio.wait_for(ws.receive_json(), 3)

    async def join(self, room):
        ws = await self.client.ws_connect(self.base + '/ws')
        await ws.send_json({'t': 'join', 'room': room})
        return ws

    async def test_http_and_file_isolation(self):
        async with self.client.get(self.base + '/health') as r:
            self.assertEqual((await r.json())['service'], 'tide-coop')
        async with self.client.get(self.base + '/') as r:
            self.assertEqual(await r.read(), server.GAME.read_bytes())
        for path in ['/联机服务器.py', '/.venv/pyvenv.cfg', '/requirements.txt', '/联机运行.log']:
            async with self.client.get(self.base + path) as r:
                self.assertEqual(r.status, 404)
        async with self.client.get(self.base + '/diagnostics') as r:
            self.assertEqual(r.status, 200)

    async def test_rooms_relay_capacity_and_host_transfer(self):
        a = await self.join(' test ')
        aid = (await self.recv(a))['idx']
        self.assertEqual((await self.recv(a))['host'], aid)
        b = await self.join('TEST')
        bid = (await self.recv(b))['idx']
        self.assertEqual(len((await self.recv(b))['members']), 2)
        self.assertEqual(len((await self.recv(a))['members']), 2)
        c = await self.join('TEST')
        self.assertEqual((await self.recv(c))['t'], 'error')
        await c.close()
        other = await self.join('OTHER')
        await self.recv(other)
        await self.recv(other)
        for kind in server.RELAY:
            await a.send_json({'t': kind, 'idx': 'spoofed', 'payload': '中' * 40000})
            msg = await self.recv(b)
            self.assertEqual(msg['idx'], aid)
            self.assertEqual(msg['t'], kind)
            self.assertEqual(len(msg['payload']), 40000)
        await other.send_json({'t': 'ping'})
        self.assertEqual((await self.recv(other))['t'], 'pong')
        await a.close()
        self.assertEqual((await self.recv(b))['t'], 'left')
        self.assertEqual((await self.recv(b))['host'], bid)
        d = await self.join('TEST')
        self.assertEqual((await self.recv(d))['t'], 'joined')
        self.assertEqual(len((await self.recv(d))['members']), 2)
        await b.close()
        await d.close()
        await other.close()

    async def test_bad_messages_and_unjoined_peer(self):
        ws = await self.client.ws_connect(self.base + '/ws')
        await ws.send_str('not json')
        self.assertEqual((await self.recv(ws))['t'], 'error')
        await ws.send_json({'t': 'join', 'room': []})
        self.assertEqual((await self.recv(ws))['t'], 'error')
        await ws.send_json({'t': 'state'})
        self.assertEqual((await self.recv(ws))['t'], 'error')
        await ws.send_json({'t': 'ping'})
        self.assertEqual((await self.recv(ws))['t'], 'pong')
        await ws.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
