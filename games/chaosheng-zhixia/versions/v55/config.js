'use strict';
/**
 * 集中配置：改窗口尺寸、标题、端口、启动画面时长，只动这一个文件。
 */

module.exports = {
  /* 窗口标题（固定不变，不会跟着网页 <title> 跑） */
  APP_TITLE: '潮声之下 · 深渊潜航 桌面版',

  /* 游戏主文件（相对 game/ 目录）。文件名带版本号，升级游戏时改这里即可 */
  GAME_ENTRY: '潮声之下_深渊潜航3D_v22.html',

  /* 内置服务器端口。与「启动联机.bat」一致：本机既是主机也是客户端 */
  PORT_PREFERRED: 8123,

  /* 联机中继版本信息：必须与游戏内 /health 校验一致（service=tide-coop, protocol=2） */
  RELAY_VERSION: '3.1-coop-stages-desktop',
  RELAY_PROTOCOL: 2,

  /* 窗口：1440×900 是 16:10，接近游戏截图比例；最小尺寸保证 HUD 不重叠 */
  WINDOW: {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#04070c',   // 与游戏 --bg 同色，加载瞬间不闪白
    startFullscreen: false,       // true = 启动即全屏（F11 仍可切换）
  },

  /* 启动画面 */
  SPLASH: {
    width: 480,
    height: 300,
    minDurationMs: 1200,   // 至少显示这么久，避免一闪而过
    maxDurationMs: 6000,   // 兜底上限：无论如何都会关掉
  },

  /* 冒烟自检（npm run smoke）等待多久再截图 —— 要够人物贴图加载完 */
  SMOKE_WAIT_MS: 12000,
};
