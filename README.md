# game-ocean 🌊🎮

一组**可直接在浏览器中运行**的 HTML5 网页游戏合集。所有游戏均为本地化资源构建，双击打开 HTML 即可游玩，运行时无需联网。

## 游戏一览

| 游戏 | 玩法类型 | 入口 | 说明 |
| --- | --- | --- | --- |
| **潮声之下 · 星髓远征** | 第一人称深海探索 / 局内构筑 / 巨兽战斗 | [`games/chaosheng-zhixia/`](games/chaosheng-zhixia/) | 主项目。20 关连续闯关 + 无尽深渊模式，含联机与移动端适配 |
| **骑士大战恶犬 dzw** | 手机横屏网页小游戏 | [`games/knight/`](games/knight/) | 单文件小游戏 |
| **海风骑行 · 一只鹈鹕的周日** | 休闲网页小游戏 | [`games/pelican-ride/`](games/pelican-ride/) | 单文件小游戏 |

## 仓库结构

```
game-ocean/
├─ README.md                    本文件：总览与导航
├─ .gitignore / .gitattributes  忽略规则与属性声明
├─ docs/                        📄 文档
│  ├─ CHANGELOG.md              全版本更新日志（v3 → v58）
│  ├─ 使用说明.md               运行与操作说明
│  ├─ 星髓_全文校订笔记.md       世界观/剧情校订记录
│  ├─ 资源来源与许可.md          第三方美术资源来源与许可证
│  └─ dev-notes/                开发计划与优化日志
├─ games/                       🎮 各游戏源码
│  ├─ chaosheng-zhixia/         潮声之下（主项目）
│  │  ├─ index.html             当前主线版本（v58 触控战斗版）
│  │  ├─ single-file.html       v58 自包含单文件版（可离线分发）
│  │  ├─ assets/                美术与脚本资源
│  │  ├─ tools/                 联机服务器、自动化测试、构建脚本
│  │  ├─ notes/                 当前版本更新说明
│  │  ├─ versions/              历史版本快照（v3 – v57）
│  │  ├─ screenshots/           截图，按版本归档
│  │  └─ dev-workspace/         早期开发脚本与工作区
│  ├─ knight/                   骑士大战恶犬
│  └─ pelican-ride/             海风骑行
└─ reference/                   📚 参考资料
```

## 快速开始

**潮声之下**（主项目）：

```bash
# 用现代浏览器（Chrome / Edge）直接打开
games/chaosheng-zhixia/index.html
```

如需局域网联机，见 `games/chaosheng-zhixia/tools/`（`联机服务器.py` + `启动联机.bat`）。

**其它小游戏**：直接打开对应目录下的 `index.html`。

## 命名与组织约定

- 每个游戏一个目录，入口统一命名 `index.html`。
- 主游戏的历史版本放在 `versions/vNN/`，每个版本目录内含该版本的主页面、资源与更新说明。
- 截图统一收敛到 `screenshots/vNN/`，不散落在源码目录中。
- 文档集中在 `docs/`，构建产物、依赖与缓存不入库。

## 许可与第三方资源

本仓库中第三方美术资源的来源与许可证见 [`docs/资源来源与许可.md`](docs/资源来源与许可.md)。
各游戏自身的授权方式请另行确认（仓库暂未声明统一 LICENSE）。
