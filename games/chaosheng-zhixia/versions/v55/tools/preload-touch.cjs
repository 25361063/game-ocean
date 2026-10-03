'use strict';
/**
 * 触屏伪装预加载脚本（只给 check-layout.mjs 的测试窗口用）。
 * 在页面脚本执行之前注入，让游戏自己的 detectTouch() 判定为触屏设备，
 * 从而渲染真实的手机版 HUD（html.is-touch 分支）。
 */

try {
  Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
} catch { window.ontouchstart = null; }

try {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
} catch { /* ignore */ }

try {
  Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
} catch { /* ignore */ }

window.__TIDE_TOUCH_SPOOFED__ = true;
