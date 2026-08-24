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

1. 同步真实 overview 元数据与雷达并转换为 WebP：

```bash
npm run radar:sync
```

脚本优先从本机 CS2 使用官方 ValveResourceFormat `Source2Viewer-CLI` 提取；不可用时回退到公开的 depot-extracted provider。它会保留来源 URL/build ID、原始与输出 SHA-256、尺寸和同步时间。有 Cloudflare 环境凭据时自动上传 R2，没有凭据时生成本地待上传资源。

2. 在自己运行的 CS2 中截图并执行 `getposcopy_exact`，把同名截图和 `.txt` 放入 `content/inbox`，先验证后批量导入：

```bash
npm run questions:import-inbox -- --dry-run
npm run questions:import-inbox
```

导入器逐项校验同名文件、地图与精确坐标，用真实 overview 的 `pos_x`、`pos_y`、`scale`、`rotate`、图片尺寸和垂直分层计算坐标，并按源图片 SHA-256 去重。只有截图上传 R2 成功后，题目才写入 Worker-only 清单；无凭据时会安全生成 pending 资产供以后重跑。完整 Windows 操作见 [题目采集指南](docs/QUESTION_CAPTURE.md) 和 [资源来源记录](docs/ASSET_SOURCES.md)。

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
scripts/content/radar-sync.ts          本机优先、公开真实提取源回退的雷达同步
scripts/content/question-import.ts     截图、getpos、坐标、R2、清单
scripts/content/questions-import-inbox.ts  inbox 批量验证、去重、pending/导入
scripts/content/assets-upload.ts       SHA-256 增量 R2 上传
src/shared/radarCoordinates.ts         world → radar 与楼层选择
src/worker/index.ts                    R2 媒体路由
src/worker/game/questions.ts           Worker-only 题库
content/question-manifest.json         真实题目来源清单
```
