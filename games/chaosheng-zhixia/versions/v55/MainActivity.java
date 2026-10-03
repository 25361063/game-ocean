package com.chaosheng.tide;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * 潮声之下 · 手机版主界面。
 *
 * 设计要点：
 *  1) 横屏 + 沉浸全屏（隐藏状态栏/导航栏，刘海区可用），屏幕常亮；
 *  2) 游戏通过内置 AssetServer 以 http://127.0.0.1:固定端口/ 提供，
 *     保证 localStorage 存档不会因为端口变化而丢失；
 *  3) 手机的键位/触控层由游戏自身的 html.is-touch 分支提供（左摇杆 + 右侧动作键 + 右上技能列），
 *     本类不做任何按键覆盖，只负责窗口环境；
 *  4) 联机：手机作为客机连接桌面主机（返回键 → 连接主机…），
 *     与桌面版「联机 → 作为客机连接主机」等价；不实现手机当主机。
 */
public class MainActivity extends Activity implements AssetServer.Hooks {

    private static final String TAG = "TideMobile";
    private static final String WEB_TAG = "TideWeb";
    private static final String PREF = "tide-prefs";
    private static final String KEY_LAST_HOST = "lastHost";
    private static final String KEY_FIRST_RUN = "firstRunDone";

    private WebView web;
    private AssetServer server;
    private String localUrl;
    private boolean showingGuest;
    private long backPressedAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyImmersive();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#04070C"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#04070C"));
        configureWebView();
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        /* 内置静态服务器（对应桌面版 src/local-server.js） */
        try {
            server = new AssetServer(getAssets(), "www", this);
            int port = server.start();
            localUrl = server.url();
            Log.i(TAG, "内置服务器就绪 " + localUrl + "（端口固定以保证存档 origin 稳定）");
        } catch (Exception e) {
            Log.e(TAG, "内置服务器启动失败：" + e.getMessage(), e);
            Toast.makeText(this, "内置服务器启动失败：" + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        if (localUrl != null) web.loadUrl(localUrl);

        maybeShowFirstRunHint();
    }

    /* ===================== WebView 配置 ===================== */

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);               // localStorage：游戏存档
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // 音效不被"需手势"策略拦住
        s.setAllowFileAccess(false);                // 我们只走 http://127.0.0.1，不需要 file 权限
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);  // 真机可用 chrome://inspect 调试
        }

        web.setLongClickable(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { return true; }   // 禁掉长按选择菜单
        });
        web.setHapticFeedbackEnabled(false);

        final Uri local = Uri.parse(localUrl != null ? localUrl : "http://127.0.0.1/");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                boolean sameHost = host.equals(local.getHost()) || host.equals("127.0.0.1") || host.equals("localhost");
                if (sameHost) return false;                       // 站内导航（含 /diagnostics）
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));  // 站外交给系统浏览器
                } catch (Exception e) {
                    Log.w(TAG, "无法打开外部链接：" + uri);
                }
                return true;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return shouldOverrideUrlLoading(view, newUrlRequest(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "页面载入完成 " + url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i(WEB_TAG, message.message() + " @" + message.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                /* 游戏只用 WebAudio；不授予摄像头/麦克风等敏感权限 */
                request.deny();
            }
        });
    }

    @SuppressWarnings("deprecation")
    private static WebResourceRequest newUrlRequest(final String url) {
        return new WebResourceRequest() {
            @Override public Uri getUrl() { return Uri.parse(url); }
            @Override public boolean isForMainFrame() { return true; }
            @Override public boolean isRedirect() { return false; }
            @Override public boolean hasGesture() { return false; }
            @Override public String getMethod() { return "GET"; }
            @Override public java.util.Map<String, String> getRequestHeaders() { return new java.util.HashMap<String, String>(); }
        };
    }

    /* ===================== 沉浸全屏 ===================== */

    private void applyImmersive() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();   // 弹过对话框后重新吃掉系统栏
    }

    /* ===================== 返回键 = 原生菜单 ===================== */

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        showMenu();
    }

    private void showMenu() {
        final String[] items = showingGuest
                ? new String[]{"继续游戏", "换一台主机…", "回到单机", "退出游戏"}
                : new String[]{"继续游戏", "连接主机（联机）…", "重新载入", "退出游戏"};
        new AlertDialog.Builder(this)
                .setTitle("潮声之下 · 手机版")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String label = items[which];
                        if ("继续游戏".equals(label)) return;
                        if ("连接主机（联机）…".equals(label) || "换一台主机…".equals(label)) { askHost(); return; }
                        if ("回到单机".equals(label)) { backToLocal(); return; }
                        if ("重新载入".equals(label)) { web.reload(); return; }
                        if ("退出游戏".equals(label)) { finish(); }
                    }
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private void backToLocal() {
        showingGuest = false;
        if (localUrl != null) web.loadUrl(localUrl);
        toast("已回到单机模式");
    }

    private void askHost() {
        final SharedPreferences prefs = getSharedPreferences(PREF, MODE_PRIVATE);
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setHint("例如 192.168.1.20:8123");
        input.setText(prefs.getString(KEY_LAST_HOST, ""));
        input.setSelectAllOnFocus(true);

        new AlertDialog.Builder(this)
                .setTitle("连接主机")
                .setMessage("填桌面版「联机 → 服务器与局域网地址…」里显示的局域网地址。\n"
                        + "两台设备需在同一网络，主机端允许了防火墙。")
                .setView(input)
                .setPositiveButton("连接", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String raw = input.getText().toString().trim();
                        if (raw.length() == 0) { toast("请输入主机地址"); return; }
                        if (!raw.matches("[A-Za-z0-9._-]+(:\\d{1,5})?")) { toast("格式应为 IP 或 主机名[:端口]"); return; }
                        String host = raw.contains(":") ? raw : raw + ":8123";
                        prefs.edit().putString(KEY_LAST_HOST, raw).apply();
                        String url = "http://" + host + "/";
                        showingGuest = true;
                        web.loadUrl(url);
                        toast("正在连接 " + url);
                    }
                })
                .setNegativeButton("取消", null)
                .show();
    }

    /* ===================== AssetServer.Hooks ===================== */

    /** 玩家在游戏里点了联机，而当前页面是自己的单机地址 → 引导去连桌面主机 */
    @Override
    public void onLocalHealthRequest() {
        if (showingGuest) return;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (isFinishing()) return;
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("手机版如何联机")
                        .setMessage("手机版不充当联机主机。请让电脑运行桌面版（潮声之下 桌面版）并查看\n"
                                + "「联机 → 服务器与局域网地址…」，然后在这里填入那台电脑的局域网地址。")
                        .setPositiveButton("现在连接", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface dialog, int which) { askHost(); }
                        })
                        .setNegativeButton("稍后", null)
                        .show();
            }
        });
    }

    private void maybeShowFirstRunHint() {
        SharedPreferences prefs = getSharedPreferences(PREF, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_FIRST_RUN, false)) return;
        prefs.edit().putBoolean(KEY_FIRST_RUN, true).apply();
        new AlertDialog.Builder(this)
                .setTitle("操作提示")
                .setMessage("· 左手边滑动屏幕 = 移动，右手边滑动 = 转视角\n"
                        + "· 右下角是普攻 / 跳跃 / 闪避 / 下潜 / 切武器，右上角是技能与装备库\n"
                        + "· 按手机返回键 = 打开菜单（联机、重新载入、退出）\n"
                        + "· 建议横屏握持并关闭系统自动旋转锁定")
                .setPositiveButton("开始游戏", null)
                .show();
    }

    /* ===================== 生命周期 ===================== */

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        applyImmersive();
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }
}
