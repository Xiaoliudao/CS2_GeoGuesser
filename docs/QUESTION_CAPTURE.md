# Windows 真实题目采集与批量导入

题目必须来自你本人合法安装并运行的 CS2。不要使用 AI 图、带地图名水印的图片、会泄露位置的 HUD，或来源不清楚的网页截图。

## 1. 同步真实雷达

在 PowerShell 进入项目目录并执行：

```powershell
npm run radar:sync
```

脚本优先使用本机 CS2 与官方 ValveResourceFormat `Source2Viewer-CLI`。本机没有 CLI 时，它会回退到 `MurkyYT/cs2-map-icons` 的公开、从 CS2 depot 提取的雷达与原始 overview；它不是网站运行时依赖。同步会校验地图名、overview 数值、图片尺寸和 SHA-256，并生成 `content/generated/map-overviews.json`。

存在 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 时会上传到 R2；没有时只生成待上传的真实资源，不会失败。可用 `--provider local-cs2` 或 `--provider github-extracted` 强制指定来源，用 `--no-upload` 禁止上传。

## 2. 在 CS2 中采集

1. 启动 CS2，开启开发者控制台并本地加载目标地图。
2. 走到题目位置并调整视角，画面中不要出现地图名或位置提示。
3. 在控制台执行 `getposcopy_exact`。命令会把包含 `setpos_exact` 与 `setang_exact` 的精确坐标复制到 Windows 剪贴板。
4. 不要移动，立即截图，分辨率至少 640×360。
5. 在项目的 `content\inbox` 中按地图目录放入同名文件。例如：

```text
content\inbox\Mirage\mirage-001.png
content\inbox\Mirage\mirage-001.txt
```

`mirage-001.txt` 内容：

```text
map=mirage
setpos_exact -123.750000 456.125000 64.000000;
setang_exact -8.250000 179.500000 0.000000
```

也接受 `map: mirage`、`de_mirage`、额外空白、换行和负小数。支持地图：mirage、inferno、ancient、nuke、anubis、dust2、train、overpass。

导入器会递归扫描所有子目录，并且图片只与同目录、同 basename 的 `.txt` 配对。目录名只用于人工整理：`Mirage` / `mirage` / `MIRAGE` 会规范化为 `mirage`，`Dust2` / `Dust II` / `dust2` 会规范化为 `dust2`；答案仍以 metadata 的 `map=` 为准。目录与 metadata 不一致时会以 `FOLDER_MAP_MISMATCH` 拒绝导入。

## 3. 先 dry-run，再批量导入

```powershell
npm run questions:import-inbox -- --dry-run
```

dry-run 不上传 R2、不修改生产 D1。它会保留相对目录结构，把原始截图复制到被 Git 忽略的 `public\__dev_assets__\questions`，并生成包含 `relativeSourcePath` 和 SHA-256 的本地 QA manifest。确认每项的 map、world position、自动楼层和雷达点后，先启动开发服务器：

```powershell
npm run dev
```

打开：

```text
http://127.0.0.1:5173/dev/question-editor
```

选择 `PREVIEW QUESTION`，直接核对真实截图、`public\__dev_assets__\radars` 中的真实同步雷达、AUTO marker、世界坐标和视角。页面明确分开显示 `AUTOMATIC POINT`、`MANUAL OVERRIDE` 与 `FINAL ANSWER`。

- 移动 marker 后点击 `SAVE OVERRIDE`：保存到 `content\generated\question-overrides.json`，刷新仍保留；原 worldPosition 和 automaticPoint 不变。
- 点击 `RESET TO AUTOMATIC`：删除该 preview 的持久化覆盖，final answer 恢复 automaticPoint。
- 点击 `PUBLISH QUESTION`：批准当前 final answer，生成 opaque ID 和 `content\generated\prepared-questions` 中的 WebP，并尝试上传 R2。

日常批量发布所有通过 dry-run 且尚未发布的题目：

```powershell
npm run questions:publish
```

该命令先通过 source preview ID 与截图 SHA-256 跳过已发布题目，再把新题上传到 R2 并插入 D1。重复运行时不会重复上传或创建 D1 row；发布后新比赛立即可用，不需要 build、Worker deploy 或 GitHub push。

如果本机没有 Cloudflare 认证，状态会变成 `PUBLISH PENDING`，不会丢失 QA 结果，也不会提前污染生产题库。需要上传时使用浏览器 OAuth，不要把 token 写入本地文件：

```powershell
npx wrangler login
npm run questions:publish-pending -- --dry-run
npm run questions:publish-pending
```

上传成功并确认 R2 对象存在后，工具会插入 D1 row 并递增 catalog version；状态立即变为 `PUBLISHED`。不需要 build 或 deploy。大厅会从 D1 显示真实 enabled question 数量；少于 5 道时使用实际可用轮数。

也可以不用编辑器，在确认 dry-run 输出后直接运行上述 `questions:publish`。旧的一步式导入命令仍保留：

```powershell
npm run questions:import-inbox
```

脚本按文件逐项处理，某项失败不会阻止后面的文件。它会输出 `Imported / Prepared / Skipped / Failed` 汇总，并用 `MISSING_METADATA`、`INVALID_MAP`、`INVALID_POSITION`、`MISSING_OVERVIEW` 等明确错误码定位问题。

- 有 Cloudflare 凭据：转 WebP、上传并确认 R2，成功后插入 D1，并把源图片哈希写入 `content/imported/records.json`。
- 无 Cloudflare 凭据：生成 opaque UUID WebP 和忽略提交的 pending manifest，输出 `R2_UPLOAD_PENDING`，不污染生产题库；以后在有凭据的环境重跑即可完成上传。
- 已导入或已 pending 的同一源图片 SHA-256 会跳过，避免重复题目。

## 4. 开发 QA 安全边界

`/dev/question-editor`、preview manifest、inbox 截图、世界坐标和视角只用于开发。PUBLISHED 题目由 development API server-side 查询 D1。`public/__dev_assets__` 被 Git 忽略，Vite 的生产构建明确禁用 public 目录复制；生产 gameplay 只使用 `/media/...` 的 Worker D1→R2 路由，不会发布本地 preview 数据。

单张导入命令 `npm run question:import` 仍保留给特殊人工覆盖流程；日常采集请使用 inbox 批处理。
