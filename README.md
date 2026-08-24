# CS2 Map Guesser Multiplayer

双人实时 CS2 地图定位游戏。React 客户端通过 WebSocket 连接 Cloudflare Worker 和 SQLite-backed Durable Object；雷达和题目截图从私有写入、公开只读的 R2 bucket 提供。

本仓库不包含 AI 生成的题图、手绘雷达或第三方镜像素材。题库为空时大厅会明确显示 `NO REAL QUESTIONS AVAILABLE`，服务端也会拒绝开始游戏。

## 本地运行

要求 Node.js 20.19+。

```bash
npm install
npm run dev
```

地址为 `http://127.0.0.1:5173`。验证命令：

```bash
npm run typecheck
npm test
npm run build
npm run smoke:e2e
```

## 真实内容工作流

1. 安装官方 ValveResourceFormat 的 `Source2Viewer-CLI`，把可执行文件加入 `PATH`，或设置 `SOURCE2VIEWER_CLI`。
2. 保持本机 CS2 为最新版本。脚本会从 Steam 自动寻找安装，也可设置 `CS2_PATH`。
3. 提取 overview 元数据与雷达并转换为 WebP：

```bash
npm run radar:extract
npm run assets:upload -- --radars
```

4. 在自己运行的 CS2 中截图并执行 `getpos`，然后导入：

```bash
npm run question:import -- --image "D:\captures\mirage-01.png" --map mirage --getpos "setpos_exact -100 200 64;setang_exact 3 90 0"
```

导入器先用真实 overview 的 `pos_x`、`pos_y`、`scale`、`rotate`、图片尺寸和垂直分层计算坐标，再打印仅开发环境可访问的 QA URL。只有截图上传 R2 成功后，题目才写入 Worker-only 清单。完整说明见 [题目采集指南](docs/QUESTION_CAPTURE.md) 和 [资源来源记录](docs/ASSET_SOURCES.md)。

本项目使用 ValveResourceFormat / Source 2 Viewer 读取用户本机安装的 CS2 资源：Powered by Source 2 Viewer. ValveResourceFormat 源代码采用 MIT License；提取的 Valve 游戏素材仍归其权利人所有。

## 坐标与楼层

协议提交 `{ mapId, layerId, point: { x, y } }`。服务端验证地图与层的组合。Nuke 和当前具有多层 overview 的 Train 使用从 `verticalsections` 提取的真实高度区间选择 `upper` / `lower`，不会用硬编码的猜测阈值。

计分：地图错误 0；地图正确 200；楼层也正确时按归一化欧氏距离最多再得 800。进行中的公开状态只包含 opaque 题目 ID 和媒体 URL；答案、世界坐标和视角只保存在 Worker bundle 中，回合结束后才公开正确地图、楼层和点。

## Cloudflare

`wrangler.jsonc` 定义：

- Worker `cs2-map-guesser`
- Durable Object binding `GAME_ROOM`
- R2 binding `GAME_ASSETS`，bucket `cs2-map-guesser-assets`
- `/api/*`、`/ws/*`、`/media/*` Worker-first 路由

首次配置：

```bash
npx wrangler login
npx wrangler r2 bucket create cs2-map-guesser-assets
npm run assets:upload
npm run deploy
```

CI 可改用权限最小化的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。不要把凭据提交到仓库。

## 主要文件

```text
scripts/content/radar-extract.ts       本地 VPK 提取与 WebP 转换
scripts/content/question-import.ts     截图、getpos、坐标、R2、清单
scripts/content/assets-upload.ts       SHA-256 增量 R2 上传
src/shared/radarCoordinates.ts         world → radar 与楼层选择
src/worker/index.ts                    R2 媒体路由
src/worker/game/questions.ts           Worker-only 题库
content/question-manifest.json         真实题目来源清单
```
