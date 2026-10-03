'use strict';
/**
 * 预加载脚本：只暴露一个极小的桥接对象 window.desktopApp，不开放 Node 能力。
 * 游戏本体不需要它也能跑（保持网页版零改动）；它用于「连接主机」窗口与
 * 页面内的桌面版状态查询（例如 F12 控制台里 desktopApp.getInfo()）。
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('app:info'),
  submitPrompt: (value) => ipcRenderer.send('prompt:submit', String(value == null ? '' : value)),
  cancelPrompt: () => ipcRenderer.send('prompt:cancel'),
};

try {
  contextBridge.exposeInMainWorld('desktopApp', api);
} catch (err) {
  // contextIsolation 关闭时（自定义配置）退化为直接挂载
  // eslint-disable-next-line no-undef
  window.desktopApp = api;
}
