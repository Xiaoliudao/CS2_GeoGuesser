# 真实题目采集

题目只能来自你本人在合法安装并运行的 CS2 中捕获的截图。不要提交 AI 图、地图名水印、HUD 中泄露位置的信息或来源不清楚的网页图片。

## 一次采集

1. 启动 CS2，本地加载目标地图。
2. 走到题目位置并调整视角。
3. 打开控制台运行 `getpos`，复制其中的 `setpos_exact X Y Z;setang_exact PITCH YAW ROLL`，然后不要再移动。
4. 立即截取至少 640×360 的画面，确保截图和坐标来自同一位置。
5. 先确保 `npm run radar:extract` 已生成与当前 CS2 build 对应的 `content/generated/map-overviews.json`，然后执行：

```bash
npm run question:import -- --image "D:\captures\capture.png" --map nuke --getpos "setpos_exact 1 2 -600;setang_exact 0 90 0"
```

脚本会校验截图、自动选择楼层、把世界坐标转换为归一化雷达点、转换 WebP、打印 QA 预览地址并上传 R2。上传成功后才会更新 `content/question-manifest.json` 与 Worker-only TypeScript 清单。

## QA 与人工覆盖

`/dev/question-editor` 只在开发构建中存在。默认 marker 是自动换算结果。点击雷达会显示一个明确的 manual override；这适用于确认原始 overview 有特殊偏移等少数情况，不应替代 `getpos`。

需要覆盖时先用 dry-run 验证：

```bash
npm run question:import -- --dry-run --image "D:\captures\capture.png" --map nuke --getpos "..." --override-layer lower --override-point "0.42,0.61"
```

去掉 `--dry-run` 才会上传并登记。清单中的 `coordinateSource` 会记录 `manual-override`，便于复核。

## 失败即停止

- 没有本地真实 CS2：`REAL CS2 INSTALLATION REQUIRED`
- 没有官方 CLI：`SOURCE2VIEWER_CLI_REQUIRED`
- 没有对应 metadata：`REAL RADAR METADATA REQUIRED`
- R2 未认证或上传失败：`R2_UPLOAD_FAILED`，生产清单保持不变
- 题库为空：大厅停留等待，Ready 返回 `NO_QUESTIONS_AVAILABLE`
