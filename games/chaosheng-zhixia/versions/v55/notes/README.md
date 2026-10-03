# 潮声之下 · 深渊潜航 —— 手机版（Android）

把同一份网页游戏封装成 **Android APK**：横屏 + 沉浸全屏 + 触控键位，装到手机上双击即玩。
不需要 Android Studio，不需要 Gradle，一条命令出包。

- 产物：`dist/潮声之下_手机版_1.0.0.apk`（约 32 MB，Android 7.0 / API 24 及以上，仅横屏）
- 游戏本体：`app/assets/www/`（`index.html` + `assets/`，由 `npm run sync` 从工作区同步并打移动补丁）
- 外壳：`app/src/com/chaosheng/tide/`（两个 Java 文件，纯平台 API，不用 AndroidX）

> iOS 需要 macOS + Xcode 才能出包，本工程不覆盖；网页版本身在 iOS Safari 上可直接玩。

---

## 1. 架构（与桌面版同思路）

```
MainActivity（横屏 + 沉浸全屏 + 屏幕常亮）
   └─ 启动 AssetServer：监听 127.0.0.1:19123，把 assets/www 以 http 提供
        └─ WebView.loadUrl("http://127.0.0.1:19123/")
```

**为什么不直接 `file:///android_asset/www/index.html`？** 与桌面版踩过的坑完全一致：

1. 游戏资源按「站点根 + 相对路径」加载，`file://` 下可能被同源策略拦掉 → 白屏；
2. 游戏内 `netConnect()` 明确要求 `location.protocol` 是 `http/https`，否则联机入口直接报错；
3. `http` 源下 localStorage / WebGL 贴图 / WebAudio 行为与浏览器一致，**存档 origin 稳定**。

**端口固定 19123**（不是随机端口）：Android WebView 的 localStorage 是按 origin 隔离的，
端口一变存档就"丢"了。19123 被占用时依次退 8123、随机端口（极少发生）。

`AssetServer` 的细节：
- 支持 `GET/HEAD`，`Range` 不需要（游戏没有大媒体拖动需求）；
- 能 `openFd` 的资源用 `Content-Length` 发送；压缩存储的大文件（如 52 MB 的 `packed49.js`）
  走 **chunked 流式传输**，不会把整个文件读进内存（低配机型 OOM 风险）；
- 禁止 `..` 路径穿越；`/diagnostics` 路由到诊断页。

---

## 2. 键位分布（这是手机版的重点）

游戏自带完整的触控层（`html.is-touch` 分支），本工程**没有改造它的布局逻辑**，
只做了三处按实测数据修正（见 `scripts/sync-mobile.mjs` 注入的补丁）：

| 问题（实测发现） | 修正 |
| --- | --- |
| 「下潜」内联定位 `right:142,bottom:84` 与「切武器」`right:150,bottom:72` **重叠 36×36px** | 下潜改为与普攻同一水平行：`right:150,bottom:12`，48×48 |
| 游戏中顶部 HUD 实测高 **95px**，右上技能列从 `top:64` 开始 → 「护幕」被 HUD 压住 | 技能列整体下移到 `top:104/152/200/248` |
| 矮屏（≤430px 高，如 16:9）装不下「HUD(95) + 竖列 4×48 + 右下普攻(76)」 | 矮屏自动改 **2×2 方阵**（`top:104/154`，`right:10/62`） |

### 实测坐标（874×394 CSS 视口，20:9 机型，游戏进行中量取）

| 按键 | 尺寸 | 距右 | 距底 | 作用 |
| --- | --- | --- | --- | --- |
| 普攻 | 64×64 | 12 | 12 | 最大、最贴右下角 —— 右拇指自然落点 |
| 下潜 | 48×48 | 150 | 12 | 与普攻同一水平行，左移一列 |
| 跳跃 | 52×52 | 80 | 80 | 普攻斜上方 |
| 切武器 | 48×48 | 150 | 72 | 跳跃左侧一列 |
| 闪避 | 50×50 | 146 | 140 | 再上一档（拇指上挑） |
| 护幕 / 超频 | 46×46 | 10 | 244 / 194 | 右上 2×2 方阵（矮屏）或竖列（高屏） |
| 视角 / 装备库 | 46×46 | 62 | 244 / 194 | 同上 |
| 暂停 | 44×44 | 10 | 340（即顶部） | 右上角，压在 HUD 空白处（游戏原设计，保留） |
| 拾取 | 88×44 | 居中 | 12 | 仅在有掉落时出现 |

- 左手区（左半屏 50%×78%）是**动态摇杆**：手指按下才出现摇杆底座与摇杆头 → 不挡视线；
  左下角另有 3 格武器槽与技能条，给左手拇指够得着的位置。
- 所有按键定位都带 `env(safe-area-inset-*)`，配合补丁注入的 `viewport-fit=cover`，
  刘海屏 / 圆角屏会自动让开（静态检查 10 条规则 0 问题）。
- 全部按键 ≥44px（可点性下限），实测 0 项重叠、0 项越界。

### 自动校验（改完键位一定要跑）

```bash
npm run check:layout          # 无独显/虚拟机：set TIDE_SOFTWARE_GL=1 && npm run check:layout
```

它会用 Electron 打开**真实游戏页面**（隐藏窗口 + 触屏伪装 `ontouchstart`/`maxTouchPoints`），
在 **8 种机型横屏尺寸**（640×360 → 914×411 → 平板 1280×800 → 异常竖屏）下：

1. `__D3D.start()` 真正开一局，让游戏内 HUD 出现；
2. 量出所有触控键、技能栏、摇杆区、小地图的矩形；
3. 检查：按键两两重叠 / 越出屏幕 / 贴边 <6px / 压住顶部 HUD / 压住小地图 / 按键 <44px；
4. 每档出一张截图（`layout-check/layout-<宽>x<高>.png`，截图前会临时隐藏剧情弹层方便看清键位）。

当前结果：**8 种尺寸 0 项问题**，明细见 `layout-check/layout-report.json`。

---

## 3. 构建步骤

### 3.1 一次性准备：下载工具链（约 315 MB）

```bash
cd mobile
npm run fetch-toolchain
```

下载并解压到 `mobile/.toolchain/`：

| 组件 | 来源 | 用途 |
| --- | --- | --- |
| OpenJDK 17 | 华为云镜像 | `javac` / `java` / `keytool` |
| Android platform 34 | 腾讯云镜像（回退 dl.google.com） | `android.jar`（编译期 API） |
| Android build-tools 34 | 同上 | `aapt2` / `zipalign` / `d8.jar` / `apksigner.jar` |
| platform-tools | 同上 | `adb`（真机安装与日志） |

> 下载源按「国内镜像 → 官方源」顺序自动回退，并且**流式落盘**（进度可见）。
> `.toolchain/cache/` 里是压缩包缓存（约 300 MB），确认不再重装后可删；`.toolchain/*` 解压结果别删。

### 3.2 同步游戏 + 校验键位

```bash
npm run sync           # 游戏 → app/assets/www（注入 viewport-fit=cover 与移动端 CSS 补丁）
npm run check:layout   # 8 种机型尺寸的键位检查 + 截图
```

### 3.3 出 APK

```bash
npm run build:apk      # = npm run sync && node scripts/build-apk.mjs
```

构建流水线（全在脚本里，可逐步复现）：

```
aapt2 compile res/ → res.zip
aapt2 link（-I android.jar --manifest -R res.zip -A assets）→ base.apk
javac（-bootclasspath android.jar）→ class
java -cp d8.jar com.android.tools.r8.D8 → classes.dex
解包 base.apk + 放入 classes.dex → 7za 重打包（resources.arsc 保持不压缩）
zipalign -p 4 → apksigner sign（调试证书）→ dist/潮声之下_手机版_1.0.0.apk
```

打包完会自检并打印：包名 / 版本 / min-target SDK / 应用名 / 启动 Activity / 签名方案 / 资产是否打包。

### 3.4 装到手机

```bash
.toolchain/platform-tools/adb.exe install -r dist/潮声之下_手机版_1.0.0.apk
.toolchain/platform-tools/adb.exe logcat -s TideMobile TideWeb TideAssetServer   # 看日志
```

也可以把 APK 拷进手机，用文件管理器直接点装（需允许"安装未知来源应用"）。

**首次启动检查清单**

1. 是否横屏全屏、没有状态栏/导航栏遮挡；
2. 主菜单能否点「准备下潜」进游戏（触控点击是否有效）；
3. 左下摇杆能否移动、右半屏拖动能否转视角；
4. 右下普攻/跳跃/闪避/下潜/切武器是否都能按到、互不重叠；
5. 音量：进游戏后应有音效（WebAudio）；
6. 退出再进，存档是否保留（元晶/解锁进度）；
7. 联机：见下一节。

---

## 4. 联机（手机当客机，桌面版当主机）

手机版**不实现联机服务器**（Java 侧没有 `/ws` 中继），设计上与桌面版的"客机模式"对齐：

1. 电脑上打开**桌面版**（`潮声之下 桌面版.exe`）或运行 `启动联机.bat`；
2. 电脑上查看地址：桌面版菜单「联机 → 服务器与局域网地址…」；
3. 手机上：**按返回键 → 菜单 → 连接主机（联机）…** → 填 `192.168.x.x:8123` → 连接；
   此后手机加载的就是电脑那一份游戏，两端输入相同房间号即可；
4. 想回到单机：返回键 → 菜单 → 回到单机。

细节：
- 若在单机模式下点了游戏内的联机入口，手机版会弹原生提示并直接给出"现在连接"入口
  （实现方式：`AssetServer` 收到 `/health` 请求时回调 Activity）；
- 连过的主机会记在偏好里（`SharedPreferences`），下次直接回填；
- 客机模式的存档 origin 是主机的地址，与单机存档互相独立（正常现象）。

---

## 5. 自定义

| 想改什么 | 改哪里 |
| --- | --- |
| 应用名 | `app/res/values/strings.xml` 的 `app_name`（默认「潮声之下」） |
| 包名 | `app/AndroidManifest.xml` 里的 `package`（改完同步改 `build-apk.mjs` 的 `PACKAGE` 常量；同一包名不同签名无法覆盖安装，需先卸载） |
| 版本号 | `scripts/build-apk.mjs` 的 `VERSION`，同时更新 manifest 的 `versionCode/versionName` |
| 图标 | `npm run icons`（读 `../desktop/build/icon.png`，生成 5 档 mipmap；换图用 `--source`） |
| 横屏/竖屏 | manifest 里 `android:screenOrientation`：`sensorLandscape`（默认）/ `portrait` / `fullSensor` |
| 按键位置/大小 | `scripts/sync-mobile.mjs` 里的 `MOBILE_PATCH_CSS`（**只在这里改，别改游戏源文件**） |
| 最低支持系统 | `MIN_SDK`（当前 24 = Android 7.0；调低需同时确认 WebView 版本要求） |
| 正式签名 | 替换 `build-apk.mjs` 里的 `keytool`/`apksigner` 参数为你自己的 `.jks`（**路径也必须是 ASCII**） |

---

## 6. 常见问题（都是这套流程真实踩过的）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `aapt2 ... error: failed to open directory: 系统找不到指定的文件` | **aapt2/javac 不支持含中文的路径** | 本工程已自动把构建搬到 ASCII 临时目录（`%TEMP%\tide-android-build`）；也可用 `TIDE_BUILD_STAGE` 指定，或把工程放到纯英文路径 |
| `d8.bat` / `apksigner.bat` 调用失败 | 新版 Node 禁止直接 spawn `.bat/.cmd` | 脚本已改为 `java -cp d8.jar` / `java -jar apksigner.jar`，不再碰 `.bat` |
| 构建"卡在复制资产/删除旧目录"很久 | 本机安全外壳会把 `fs.rmSync` 转成回收站操作，大目录会卡住 | 脚本用自实现的递归删除 `removeDir()`，不用 `fs.rmSync` |
| 解压 SDK 包时进程假死 | 7za 输出管道没人读、条目过多时阻塞 | 脚本对 7za 使用 `stdio: 'ignore'` |
| 安装时提示 `INSTALL_PARSE_FAILED` | `resources.arsc` 被压缩（targetSdk 30+ 不允许） | 脚本会检测并强制"不压缩 + zipalign 4 字节对齐"，日志里会打印 `resources.arsc：未压缩（正确）` |
| 白屏 / 一直转圈 | www 没同步、或资源 404 | `npm run sync`；真机看 `adb logcat -s TideWeb`（游戏自身的报错也会打进去） |
| 进游戏很慢（首次 3—8 秒） | 52 MB 的人物模型脚本要经 http 传给 WebView | 正常；`adb logcat` 里能看到 `TideAssetServer` 的请求日志 |
| 存档没了 | 本地服务器端口变了（被占用退到随机端口） | 一般不会发生；日志里会打印实际端口。保持 19123 未被占用最稳 |
| 点「联机」没反应 | 手机版不是联机主机 | 用返回键菜单 → 连接主机；或看弹窗提示 |
| 触控键位置不合适 | 机型特殊（折叠屏/超宽屏） | 跑 `npm run check:layout` 看报告，在 `sync-mobile.mjs` 的补丁 CSS 里调完再 `npm run build:apk` |
| 想验证能不能装 | 无真机时 | `aapt2 dump badging` + `apksigner verify -v`（脚本已自动执行）；有条件再过一遍"首启检查清单" |

---

## 7. 命令速查

| 命令 | 作用 |
| --- | --- |
| `npm run fetch-toolchain` | 下载 JDK + Android SDK 组件到 `.toolchain/` |
| `npm run icons` | 生成 Android 启动图标（需 Python + Pillow） |
| `npm run sync` | 同步游戏到 `app/assets/www` 并注入移动补丁 |
| `npm run check:layout` | 8 种机型键位校验 + 截图（`layout-check/`） |
| `npm run build:apk` | 出 `dist/潮声之下_手机版_1.0.0.apk` |
| `npm run apk` | 只重跑构建（跳过 sync） |
