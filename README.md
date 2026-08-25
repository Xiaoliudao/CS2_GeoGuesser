# CS2 Map Guesser

CS2 Map Guesser 是一个双人实时 Counter-Strike 2 地图位置竞猜游戏。

玩家会看到一张真实的 CS2 游戏截图，需要先判断地图和楼层，再在 2D radar 上标出截图对应的位置。双方根据地图判断、位置准确度和答题速度获得分数。

## 在线试玩

无需安装，直接访问：

[CS2 Map Guesser – Guess Counter-Strike 2 Locations](https://cs2-map-guesser.457214526y.workers.dev/)

## 游戏玩法

1. 创建一个房间并把房间代码分享给另一位玩家。
2. 双方进入房间并点击 Ready。
3. 查看游戏截图，选择地图和楼层，然后在 radar 上标记位置。
4. 提交答案；地图、楼层、位置准确度和答题速度都会影响得分。

## 本地运行

### Requirements

- Node.js 20.19+
- npm

### Install

```bash
npm install
```

### Start

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

部分在线数据功能可能需要额外的本地环境配置。

### 本地题库管理

开发服务器启动后，可以打开本地题目编辑器：

```text
http://127.0.0.1:5173/dev/question-editor
```

新增题目时，在 `content/inbox/<Map>/` 中放入一张截图和一个同名的 `.txt` 文件，例如：

```text
content/inbox/Mirage/mirage-01.jpg
content/inbox/Mirage/mirage-01.txt
```

metadata 文件至少需要包含地图和 CS2 控制台坐标：

```text
map=mirage
setpos_exact -2331.545654 -477.949829 -63.248474;
setang_exact -13.700989 -145.679047 0.000000
```

然后生成本地预览：

```bash
npm run questions:import-inbox -- --dry-run
```

刷新题目编辑器后，即可检查截图、调整答案位置并保存修改。部分发布功能可能需要额外的本地环境配置。

## 开发检查

```bash
npm run typecheck
npm test
npm run build
```

Built with React and TypeScript.

## Disclaimer

CS2 Map Guesser 是一个非官方社区项目，与 Valve Corporation 无隶属或官方合作关系。

Counter-Strike、Counter-Strike 2 及相关游戏素材的权利归其各自权利人所有。
