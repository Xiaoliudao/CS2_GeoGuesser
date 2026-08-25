# CS2 Map Guesser Multiplayer

双人实时 CS2 地图定位游戏。React 客户端通过 WebSocket 连接 Cloudflare Worker 和本地 SQLite-backed Durable Object；动态题目元数据来自 Cloudflare D1，雷达和题目截图来自 R2。

本仓库不包含 AI 生成的题图、手绘雷达或第三方镜像素材。题库为空时大厅会明确显示 `NO REAL QUESTIONS AVAILABLE`，服务端也会拒绝开始游戏。

## 本地运行

要求 Node.js 20.19+。

```bash
npm install
npx wrangler login
npm run dev
```

地址为 `http://127.0.0.1:5173`。正常开发时 Worker/React/Durable Object 在本地运行，只有 `QUESTIONS_DB` D1 和 `GAME_ASSETS` R2 使用远端 binding。验证命令：

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

脚本优先从本机 CS2 使用官方 ValveResourceFormat `Source2Viewer-CLI` 提取；不可用时回退到公开的 depot-extracted provider。它会保留来源 URL/build ID、原始与输出 SHA-256、尺寸和同步时间，并把同一批真实 WebP 复制到被 Git 忽略的 `public/__dev_assets__/radars`，供本地 QA 使用。有 Cloudflare 环境凭据时自动上传 R2，没有凭据时仍可完整进行本地验证。

2. 在自己运行的 CS2 中截图并执行 `getposcopy_exact`，把同名截图和 `.txt` 放入 `content/inbox`：

```text
content/inbox/mirage-01.jpg
content/inbox/mirage-01.txt
```

3. 生成本地 QA preview：

```bash
npm run questions:import-inbox -- --dry-run
```

4. 启动开发服务器并打开 QA 页面：

```bash
npm run dev
```

打开 `http://127.0.0.1:5173/dev/question-editor`，直接检查真实截图、真实本地雷达、世界坐标、视角与自动 marker。移动 marker 后点击 `SAVE OVERRIDE` 会把人工点保存到 `content/generated/question-overrides.json`；刷新页面仍会恢复。`RESET TO AUTOMATIC` 会删除这项覆盖。

5. 点击 `PUBLISH QUESTION` 批准并发布。若本机已有 Wrangler OAuth 或 Cloudflare 环境凭据，流程会上传 R2、确认对象存在、插入 D1 并递增 catalog version。它不会修改 Worker 源码、build 或 deploy。没有认证时 QA 结果和 WebP 保存在本地，不会丢失。可运行：

```bash
npx wrangler login
npm run questions:publish-pending -- --dry-run
npm run questions:publish-pending
```

也可以继续使用 `npm run questions:import-inbox` 批量批准；它和页面共享同一个 final-point 规则。只有 R2 对象确认成功且 D1 row 插入成功后，题目才会变成 `PUBLISHED`。

常用 D1 管理命令：

```bash
npm run questions:list
npm run questions:disable -- <question-id>
npm run questions:enable -- <question-id>
npm run questions:update -- <question-id> <x> <y>
npm run questions:export
```

### 线上 Question Editor

生产部署后打开：

```text
https://cs2-map-guesser.457214526y.workers.dev/admin/question-editor
```

`/admin/*` 由 Cloudflare Access 保护，只允许当前 Cloudflare account 的成员登录；Worker 还会独立校验 `Cf-Access-Jwt-Assertion` 的签名、issuer 和 audience。页面可以上传 JPEG/PNG/WebP 真实截图（最大 12 MB），答案既可直接点击真实 radar，也可粘贴 `setpos_exact ...; setang_exact ...`。坐标模式会自动选择楼层、换算 radar point，并把 world position、view angle 和 automatic point 写入 D1；Worker 会使用 radar sync 生成的 overview registry 独立重新计算，不能由浏览器伪造。页面也可以修改已有坐标并启用或禁用题目。浏览器只使用相对 `/admin/api/*` 和 `/media/*` URL，永远不会获得 R2、D1 或 Cloudflare 凭据。

GitHub Actions 会幂等创建该 Access application，并把 `ACCESS_AUD`、`ACCESS_TEAM_DOMAIN` 作为 Worker secrets 批量写入。GitHub Environment `Cloudflare` 中的 API token 除 Workers、D1、R2 部署权限外，还需：

- `Access: Apps and Policies Write`
- `Access: Organizations, Identity Providers, and Groups Read`（首次尚未创建 Zero Trust organization 时需要 Write）

完整 Windows 操作见 [题目采集指南](docs/QUESTION_CAPTURE.md) 和 [资源来源记录](docs/ASSET_SOURCES.md)。

本项目使用 ValveResourceFormat / Source 2 Viewer 读取用户本机安装的 CS2 资源：Powered by Source 2 Viewer. ValveResourceFormat 源代码采用 MIT License；提取的 Valve 游戏素材仍归其权利人所有。

## 坐标与楼层

协议提交 `{ mapId, layerId, point: { x, y } }`。服务端验证地图与层的组合。Nuke 和当前具有多层 overview 的 Train 使用从 `verticalsections` 提取的真实高度区间选择 `upper` / `lower`，不会用硬编码的猜测阈值。

计分：地图错误 0；地图正确 200；楼层也正确时按归一化欧氏距离最多再得 800。进行中的公开状态只包含 opaque 题目 ID 和相对媒体 URL；答案从 D1 读取后只快照在 Durable Object 私有状态中，回合结束后才公开正确地图、楼层和点。legacy manifest 不会打入 Worker 或客户端 bundle。

## Cloudflare

`wrangler.jsonc` 定义：

- Worker `cs2-map-guesser`
- Durable Object binding `GAME_ROOM`
- R2 binding `GAME_ASSETS`，bucket `cs2-map-guesser-assets`
- D1 binding `QUESTIONS_DB`，database `cs2-map-guesser-db`
- `/api/*`、`/admin/api/*`、`/ws/*`、`/media/*` Worker-first 路由

首次配置：

```bash
npx wrangler login
npm run db:migrate:remote
npm run questions:migrate-to-d1
npm run assets:upload
npm run deploy
```

CI 可改用权限最小化的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。不要把凭据提交到仓库。

## 主要文件

```text
scripts/content/radar-sync.ts          本机优先、公开真实提取源回退的雷达同步
scripts/content/question-import.ts     截图、getpos、坐标、R2、D1
scripts/content/questions-import-inbox.ts  递归 inbox 验证、预览 manifest、去重
scripts/content/questions-publish-pending.ts  批量发布所有已验证的新题或旧 pending 题目
scripts/content/questions-d1-cli.ts    D1 migration/list/enable/disable/update/export
scripts/content/assets-upload.ts       SHA-256 增量 R2 上传
src/shared/radarCoordinates.ts         world → radar 与楼层选择
src/worker/index.ts                    D1 元数据与 D1→R2 媒体路由
src/worker/questions/QuestionRepository.ts  server-only D1 repository
content/question-manifest.json         legacy 一次性迁移输入，不用于 production runtime
```
