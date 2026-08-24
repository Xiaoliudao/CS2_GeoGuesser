# 资源来源与权利记录

## 雷达 provider

| Provider | 来源 | 获取方式 | 记录 |
|---|---|---|---|
| `local-cs2`（优先） | 用户本机 Steam 安装的 Counter-Strike 2 | 官方 ValveResourceFormat `Source2Viewer-CLI` 从 `pak01_dir.vpk` 提取 | CS2 build ID、源/输出 SHA-256、尺寸、同步时间 |
| `github-extracted`（回退） | [`MurkyYT/cs2-map-icons`](https://github.com/MurkyYT/cs2-map-icons) | 只从固定 HTTPS origin 下载仓库索引所列的 depot-extracted 雷达及原始 overview | 仓库 URL、索引哈希 build ID、每个源 URL、源/输出 SHA-256、尺寸、同步时间 |

两个 provider 都输出同一种 server-side registry：`content/generated/map-overviews.json`。生产客户端只通过 `/media/radars/...` 获取 R2 中的 WebP，不会在运行时连接 GitHub provider。同步器对支持的 8 张地图使用精确文件名匹配，避免误选 Ancient 等地图的旧版本变体。

## 题目来源

题目截图只能由项目运营者在合法运行 CS2 时自行捕获，并与同一时刻的 `getposcopy_exact` 输出成对放入 `content/inbox`。源截图、大型生成 WebP 和 pending 清单都不提交 Git；生产 manifest 只在 R2 上传成功后更新。`content/imported/records.json` 仅记录文件名、SHA-256、opaque ID、地图和时间，不包含图片。

## 归属

ValveResourceFormat / Source 2 Viewer 的代码采用 MIT License：Powered by Source 2 Viewer。工具只在开发或 CI 内容同步阶段运行，不随网站部署。

Counter-Strike、Counter-Strike 2、Steam、游戏资源和商标属于 Valve Corporation。工具许可证或公开提取仓库不会改变游戏内容的所有权；部署运营者负责确认其对素材使用与分发拥有适当权限。
