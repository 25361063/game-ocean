#!/usr/bin/env python3
"""潮声之下 · WiFi 联机中继服务器（零依赖）
用法：python 联机服务器.py [端口]
默认端口 8123（同时提供 HTTP 文件服务 + WebSocket 房间中继）
同一 WiFi 下的设备访问 http://<主机IP>:8123 即可联机
"""
import socket, threading, base64, hashlib, struct, json, os, sys, time, urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
GAME_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------- 文件服务 ----------
MIME = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript',
        '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain',
        '.epub':'application/octet-stream','.json':'application/json','.ico':'image/x-icon'}

def serve_file(conn, path):
    safe = urllib.parse.unquote(path).lstrip('/').split('?',1)[0].split('#',1)[0]
    fp = os.path.join(GAME_DIR, safe) if safe else os.path.join(GAME_DIR, '潮声之下_深渊潜航3D_v22.html')
    if not os.path.isfile(fp):
        if safe.endswith('/') or safe == '':
            fp = os.path.join(GAME_DIR, '潮声之下_深渊潜航3D_v22.html')
        else:
            conn.send(b'HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n'); return
    ext = os.path.splitext(fp)[1].lower()
    ct = MIME.get(ext, 'application/octet-stream')
    with open(fp, 'rb') as f: data = f.read()
    conn.send(f'HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {len(data)}\r\nAccess-Control-Allow-Origin: *\r\n\r\n'.encode() + data)

# ---------- WebSocket ----------
rooms = {}  # room_id -> [ws_state, ...]
lock = threading.Lock()

def ws_send(conn, data, opcode=1):
    if isinstance(data, str): data = data.encode('utf-8')
    mask_bit = 0
    length = len(data)
    if length < 126: header = struct.pack('>BB', 0x80|opcode, mask_bit<<7|length)
    elif length < 65536: header = struct.pack('>BBH', 0x80|opcode, mask_bit<<7|126, length)
    else: header = struct.pack('>BBQ', 0x80|opcode, mask_bit<<7|127, length)
    try: conn.send(header + data)
    except: pass

def ws_recv(conn):
    try:
        b = conn.recv(2)
        if len(b) < 2: return None
        opcode = b[0] & 0x0F
        masked = b[1] & 0x80
        length = b[1] & 0x7F
        if length == 126:
            b = conn.recv(2); length = struct.unpack('>H', b)[0]
        elif length == 127:
            b = conn.recv(8); length = struct.unpack('>Q', b)[0]
        mask = conn.recv(4) if masked else b'\x00\x00\x00\x00'
        data = b''
        while len(data) < length:
            chunk = conn.recv(length - len(data))
            if not chunk: return None
            data += chunk
        if masked: data = bytes(d ^ mask[i%4] for i,d in enumerate(data))
        if opcode == 8: return None  # close
        if opcode == 9: ws_send(conn, b'', 10); return ''  # ping→pong
        return data.decode('utf-8') if opcode == 1 else data
    except: return None

def ws_handshake(conn, request):
    key = ''
    # v43fix: needle 由码点构建，规避任何源码字面量编码问题
    needle = ''.join(chr(c) for c in [83,101,99,45,87,101,98,83,111,99,107,101,116,45,75,101,121,58]).lower()
    for line in request.split('\r\n'):
        lo = line.lower()
        if lo.find(needle) >= 0:
            key = line.split(':',1)[1].strip()
    if not key:
        return False
    accept = base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
    conn.send(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n').encode())
    return True

def relay_room(room_id):
    with lock:
        conns = rooms.get(room_id, [])
    while True:
        time.sleep(0.016)
        with lock:
            msgs = [c.pop('pending',[]) for c in rooms.get(room_id,[])]
            conns = rooms.get(room_id,[])
        # relay: each client's pending → all others
        for idx, msg_list in enumerate(msgs):
            for msg in msg_list:
                for j, c in enumerate(conns):
                    if j != idx and c.get('alive'):
                        ws_send(c['conn'], msg)

def handle_ws(conn, request):
    if not ws_handshake(conn, request): conn.close(); return
    room_id = None; idx = -1
    relay_thread = None
    try:
        while True:
            data = ws_recv(conn)
            if data is None: break
            if not data: continue
            try: msg = json.loads(data)
            except: continue
            t = msg.get('t','')
            if t == 'join':
                room_id = msg.get('room','default')
                with lock:
                    if room_id not in rooms: rooms[room_id] = []
                    rooms[room_id].append({'conn':conn,'alive':True,'pending':[]})
                    idx = len(rooms[room_id]) - 1
                ws_send(conn, json.dumps({'t':'joined','room':room_id,'idx':idx}))
                print('[net] room', room_id, 'member', idx)
                if relay_thread is None:
                    relay_thread = threading.Thread(target=relay_room, args=(room_id,), daemon=True)
                    relay_thread.start()
            elif t == 'state':
                with lock:
                    conns = rooms.get(room_id,[])
                    if idx < len(conns):
                        conns[idx].setdefault('pending',[]).append(data)
            elif t == 'ping':
                ws_send(conn, json.dumps({'t':'pong'}))
    except: pass
    finally:
        with lock:
            if room_id and room_id in rooms:
                rooms[room_id] = [c for c in rooms[room_id] if c['conn'] != conn]

# ---------- HTTP → WebSocket 升级分发 ----------
def handle_client(conn):
    try:
        _handle_client(conn)
    except Exception:
        import traceback
        traceback.print_exc()
        try: conn.close()
        except: pass

def _handle_client(conn):
    conn.settimeout(5)
    request = b''
    try:
        while b'\r\n\r\n' not in request:
            chunk = conn.recv(4096)
            if not chunk: conn.close(); return
            request += chunk
            if len(request) > 65536: break
    except: conn.close(); return
    req_str = request.decode('utf-8', errors='replace')
    first_line = req_str.split('\r\n')[0]
    path = first_line.split(' ')[1] if ' ' in first_line else '/'
    if 'upgrade: websocket' in req_str.lower():
        conn.settimeout(None)
        handle_ws(conn, req_str)
    else:
        conn.settimeout(10)
        serve_file(conn, path)
    try: conn.close()
    except: pass

def main():
    print(f"潮声之下 · WiFi 联机服务器")
    print(f"  游戏目录: {GAME_DIR}")
    print(f"  端口: {PORT}")
    # 获取本机 IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close()
    except: ip = '127.0.0.1'
    print(f"\n  本机 IP: {ip}")
    print(f"  本机游玩: http://127.0.0.1:{PORT}")
    print(f"  联机设备: http://{ip}:{PORT}")
    print(f"\n  两台设备都打开上面的联机地址 → 主页开联机模式 → 输入相同房间号")
    print(f"  Ctrl+C 停止\n")
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', PORT))
    server.listen(8)
    try:
        while True:
            conn, addr = server.accept()
            threading.Thread(target=handle_client, args=(conn,), daemon=True).start()
    except KeyboardInterrupt:
        print('\n服务器已停止')

if __name__ == '__main__':
    main()
