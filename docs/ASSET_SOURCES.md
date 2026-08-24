# 资源来源与权利记录

## 生产资源

| 类型 | 来源 | 获取方式 | 仓库存储 |
|---|---|---|---|
| Radar | 用户本机 Steam 安装的 Counter-Strike 2 | 官方 ValveResourceFormat `Source2Viewer-CLI` 从 `pak01_dir.vpk` 提取 | 不提交；生成 WebP 后上传 R2 |
| Overview metadata | 同一本机 CS2 build 的 `resource/overviews` | 同上 | `content/generated/map-overviews.json`，含 build ID 与提取时间 |
| Question screenshot | 用户本人运行 CS2 时截图 | `question:import` | 不提交；WebP 上传 R2 |
| Question metadata | 截图同时记录的 `getpos` 输出 | 世界坐标自动换算 | Worker-only 清单；客户端不可获取原始坐标 |

旧的手绘 SVG 雷达与 AI 生成题图已从 `public/` 删除，且有测试阻止 registry 再指回这些路径。

## 工具归属

ValveResourceFormat / Source 2 Viewer 的代码为 MIT License。按项目要求注明：Powered by Source 2 Viewer. 工具只在开发者机器上运行，不随网站部署。

Counter-Strike、Counter-Strike 2、Steam、游戏资源和商标属于 Valve Corporation。ValveResourceFormat 的开源许可证不改变所提取游戏内容的所有权；部署前由运营者确认其对素材使用和分发具有适当权限。

## 仅用于实现验证的公开参考

实现坐标测试时参考了社区仓库 `MurkyYT/cs2-map-icons` 中公开的 overview 数值（Mirage `pos_x/pos_y/scale` 与 Nuke `verticalsections`）。生产构建不会下载、镜像或提供该仓库的图片；实际 metadata 必须来自本机当前 CS2 安装。
