package com.chaosheng.tide;

import android.content.res.AssetManager;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Map;

/**
 * 手机版内置静态服务器（对应桌面版的 src/local-server.js）。
 *
 * 为什么手机也要内置服务器，而不是直接 file:///android_asset/www/index.html：
 *   1) 游戏资源按「站点根 + 相对路径」加载，file:// 下部分请求会被同源策略拦掉 → 白屏；
 *   2) 游戏内 netConnect() 明确要求 location.protocol 是 http/https，file:// 下联机入口直接失效；
 *   3) http 源下 localStorage、WebGL 贴图、WebAudio 的行为与浏览器一致，存档稳定。
 *
 * 端口策略（重要）：**固定端口**，否则每次启动 origin 变化会导致 localStorage 存档丢失。
 *   优先 19123（避开桌面版主机常用的 8123），被占用时退 8123，再退随机端口。
 */
public class AssetServer {

    public interface Hooks {
        /** 页面在自己家的地址上请求 /health（说明玩家点了游戏内的联机入口） */
        void onLocalHealthRequest();
    }

    private static final String TAG = "TideAssetServer";
    private static final Map<String, String> MIME = new HashMap<String, String>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("js", "text/javascript; charset=utf-8");
        MIME.put("mjs", "text/javascript; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
        MIME.put("wav", "audio/wav");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("mp4", "video/mp4");
        MIME.put("glb", "model/gltf-binary");
        MIME.put("txt", "text/plain; charset=utf-8");
        MIME.put("ttf", "font/ttf");
    }

    private final AssetManager assets;
    private final String root;          // "www"
    private final Hooks hooks;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile boolean running;
    private volatile long lastHealthHint;

    public AssetServer(AssetManager assets, String root, Hooks hooks) {
        this.assets = assets;
        this.root = root;
        this.hooks = hooks;
    }

    public int start() throws IOException {
        int[] candidates = {19123, 8123, 0};
        IOException last = null;
        for (int port : candidates) {
            try {
                serverSocket = new ServerSocket(port, 32, InetAddress.getByName("127.0.0.1"));
                break;
            } catch (IOException e) {
                last = e;
                Log.w(TAG, "端口 " + port + " 绑定失败：" + e.getMessage());
            }
        }
        if (serverSocket == null) throw (last != null ? last : new IOException("无法绑定本地端口"));
        running = true;
        acceptThread = new Thread(new Runnable() {
            @Override public void run() { acceptLoop(); }
        }, "tide-asset-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();
        return port();
    }

    public int port() { return serverSocket == null ? -1 : serverSocket.getLocalPort(); }

    public String url() { return "http://127.0.0.1:" + port() + "/"; }

    public void stop() {
        running = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) { }
        serverSocket = null;
    }

    private void acceptLoop() {
        while (running) {
            Socket client = null;
            try {
                client = serverSocket.accept();
            } catch (IOException e) {
                if (running) Log.w(TAG, "accept 失败：" + e.getMessage());
                break;
            }
            final Socket socket = client;
            Thread worker = new Thread(new Runnable() {
                @Override public void run() { handle(socket); }
            }, "tide-asset-conn");
            worker.setDaemon(true);
            worker.start();
        }
    }

    private void handle(Socket socket) {
        try {
            socket.setSoTimeout(20000);
            InputStream in = socket.getInputStream();
            OutputStream out = new BufferedOutputStream(socket.getOutputStream(), 64 * 1024);

            String requestLine = readLine(in);
            if (requestLine == null) { socket.close(); return; }
            String[] parts = requestLine.split(" ");
            String method = parts.length > 0 ? parts[0] : "GET";
            String target = parts.length > 1 ? parts[1] : "/";

            /* 吃掉请求头（本服务器只关心请求行） */
            String line;
            while ((line = readLine(in)) != null && line.length() > 0) { /* skip */ }

            String pathname = target;
            int q = pathname.indexOf('?');
            if (q >= 0) pathname = pathname.substring(0, q);
            pathname = urlDecode(pathname);

            if ("/health".equals(pathname)) {
                /* 手机版自己不是联机主机：明确回 404，并提示玩家去连桌面主机 */
                byte[] body = "{\"service\":\"tide-local\",\"message\":\"手机版请连接桌面主机\"}".getBytes("UTF-8");
                writeHead(out, 404, "application/json; charset=utf-8", body.length);
                if (!"HEAD".equals(method)) out.write(body);
                out.flush();
                maybeNotifyHealth();
                socket.close();
                return;
            }

            String assetPath = resolve(pathname);
            if (assetPath == null) {
                byte[] body = "403 非法路径".getBytes("UTF-8");
                writeHead(out, 403, "text/plain; charset=utf-8", body.length);
                out.write(body);
                out.flush();
                socket.close();
                return;
            }

            String full = root + "/" + assetPath;
            long plainLength = -1;
            boolean sizeKnown = true;
            try {
                plainLength = assets.openFd(full).getLength();
            } catch (Exception ignored) {
                /* 压缩存储的资源无法 openFd：改用 chunked 流式发送，
                   避免把 50MB 级的脚本一次性读进内存（低配机型会 OOM） */
                sizeKnown = false;
            }

            if (sizeKnown) {
                writeHead(out, 200, mimeOf(assetPath), (int) plainLength, false);
                if ("HEAD".equals(method)) { out.flush(); socket.close(); return; }
                InputStream asset = assets.open(full, AssetManager.ACCESS_STREAMING);
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = asset.read(buffer)) > 0) out.write(buffer, 0, n);
                asset.close();
            } else {
                InputStream probe = null;
                try {
                    probe = assets.open(full, AssetManager.ACCESS_STREAMING);
                } catch (Exception e) {
                    byte[] body = ("404 找不到资源：" + assetPath).getBytes("UTF-8");
                    writeHead(out, 404, "text/plain; charset=utf-8", body.length, false);
                    out.write(body);
                    out.flush();
                    socket.close();
                    return;
                }
                writeHead(out, 200, mimeOf(assetPath), -1, true);
                if ("HEAD".equals(method)) { probe.close(); out.flush(); socket.close(); return; }
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = probe.read(buffer)) > 0) {
                    out.write((Integer.toHexString(n) + "\r\n").getBytes("US-ASCII"));
                    out.write(buffer, 0, n);
                    out.write('\r');
                    out.write('\n');
                }
                probe.close();
                out.write("0\r\n\r\n".getBytes("US-ASCII"));
            }
            out.flush();
            socket.close();
        } catch (Exception e) {
            Log.w(TAG, "处理请求异常：" + e.getMessage());
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    private void maybeNotifyHealth() {
        long now = System.currentTimeMillis();
        if (now - lastHealthHint < 5000) return;   // 防抖：游戏会连续探几次
        lastHealthHint = now;
        if (hooks != null) hooks.onLocalHealthRequest();
    }

    /** "/" → index.html；其余按路径映射；禁止 .. 穿越 */
    private String resolve(String pathname) {
        String p = pathname == null ? "/" : pathname;
        while (p.startsWith("/")) p = p.substring(1);
        if (p.length() == 0) return "index.html";
        if (p.endsWith("/")) return null;
        String lower = p.toLowerCase();
        if (lower.equals("diagnostics")) return "diagnostics.html";
        if (p.contains("..") || p.contains("\\") || p.startsWith(".")) return null;
        return p;
    }

    private void writeHead(OutputStream out, int code, String mime, int length, boolean chunked) throws IOException {
        String status = code == 200 ? "200 OK" : code == 404 ? "404 Not Found" : code == 403 ? "403 Forbidden" : "500 Error";
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(status).append("\r\n");
        sb.append("Content-Type: ").append(mime).append("\r\n");
        if (chunked) sb.append("Transfer-Encoding: chunked\r\n");
        else sb.append("Content-Length: ").append(length).append("\r\n");
        sb.append("Cache-Control: no-store\r\n");
        sb.append("Connection: close\r\n\r\n");
        out.write(sb.toString().getBytes("UTF-8"));
    }

    private void writeHead(OutputStream out, int code, String mime, int length) throws IOException {
        writeHead(out, code, mime, length, false);
    }

    private String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0) return "application/octet-stream";
        String ext = path.substring(dot + 1).toLowerCase();
        String mime = MIME.get(ext);
        return mime != null ? mime : "application/octet-stream";
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') bos.write(c);
            if (bos.size() > 8192) break;
        }
        if (c == -1 && bos.size() == 0) return null;
        return new String(bos.toByteArray(), "UTF-8");
    }

    private static String urlDecode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }
}
