'use strict';
/**
 * 应用菜单。所有动作都通过 api 回调交给主进程执行，
 * 想增删菜单项只改这个文件即可（窗口标题/图标/菜单是可自定义项）。
 */

const { app } = require('electron');
const CONFIG = require('./config');

function buildMenu(api) {
  const isMac = process.platform === 'darwin';

  const template = [
    {
      label: '游戏',
      submenu: [
        { label: '重新载入页面', accelerator: 'F5', click: () => api.reload() },
        { label: '全屏切换', accelerator: 'F11', click: () => api.toggleFullscreen() },
        { type: 'separator' },
        { label: '显示 / 隐藏菜单栏', accelerator: 'Alt+M', click: () => api.toggleMenuBar() },
        { type: 'separator' },
        { label: '退出', accelerator: isMac ? 'Cmd+Q' : 'Alt+F4', click: () => api.quit() },
      ],
    },
    {
      label: '联机',
      submenu: [
        { label: '服务器与局域网地址…', click: () => api.showServerInfo() },
        { label: '复制局域网地址', click: () => api.copyLanUrl() },
        { label: '打开联机诊断页', click: () => api.openDiagnostics() },
        { type: 'separator' },
        { label: '作为客机连接主机…', click: () => api.connectAsGuest() },
        { label: '返回本地单机模式', click: () => api.backToLocal() },
        { type: 'separator' },
        { label: `重启联机服务（${CONFIG.PORT_PREFERRED} 端口）`, click: () => api.restartServer() },
      ],
    },
    {
      label: '存档',
      submenu: [
        { label: '打开存档目录', click: () => api.openSaveDir() },
        { type: 'separator' },
        { label: '导出存档…', click: () => api.exportSave() },
        { label: '导入存档…', click: () => api.importSave() },
        { type: 'separator' },
        { label: '清除本机存档…', click: () => api.clearSave() },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小（100%）', accelerator: 'CmdOrCtrl+0', click: () => api.setZoom(1) },
        { label: '放大（125%）', click: () => api.setZoom(1.25) },
        { label: '放大（150%）', click: () => api.setZoom(1.5) },
        { label: '缩小（85%）', click: () => api.setZoom(0.85) },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', click: () => api.toggleDevTools() },
        { label: '打开日志目录', click: () => api.openLogDir() },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '桌面版操作说明', click: () => api.openHelp() },
        { label: '打开游戏文件目录', click: () => api.openGameDir() },
        { type: 'separator' },
        { label: '关于桌面版', click: () => api.showAbout() },
      ],
    },
  ];

  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { label: '关于 ' + app.name, click: () => api.showAbout() },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    });
  }

  return template;
}

module.exports = { buildMenu };
