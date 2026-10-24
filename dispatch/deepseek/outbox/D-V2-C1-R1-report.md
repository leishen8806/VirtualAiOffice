# D-V2-C1-R1 交付回执（harness → 派发人，待 Q-V1 复审）

- 源码分支：`vis-align/console-v1` @ **`0ec39c1c0e5e9ee567e204f3d015b25e60c428bb`**
- 证据分支：`evidence/vis-align-console-v1` @ **`3cb716c69731b9e8a42bfca7e5ceba8b5428f04b`**
- 基线：`16c8364647da42f952f013fffb1f2d304334c845`（追加 1 个提交，未改写历史、未 force push）

## 改动文件

| 文件 | 变更 |
|---|---|
| `office3d/dr-console.html` | 删除旧整图百分比抠图规则（`.sitePanel .sceneThumb` 619.26% 与 `.videoGrid .sceneThumb:nth-child(1..4)` 760%/696.67%，及第 20 行 nth-child 位置值）；基础 `.sceneThumb` 兜底改 `cover/center` |
| `office3d/tests/dr-console-static.test.mjs` | 新增断言：页面不再出现针对 sitePanel/videoGrid 的百分比 `background-size` |
| `office3d/tests/dr-console-layout.test.mjs` | 五视口 × 五窗口新增：`background-size === cover`、可见图像比例 ≥ 0.5 |

## 删除的规则清单

- `.sitePanel .sceneThumb{background-size:619.26% 1147.56%;background-position:98.43% 64.03%}`
- `.videoGrid .sceneThumb:nth-child(1){background-size:760% 648.97%;background-position:75.76% 49%}`
- `.videoGrid .sceneThumb:nth-child(2){background-size:760% 648.97%;background-position:94.35% 47%}`
- `.videoGrid .sceneThumb:nth-child(3){background-size:696.67% 627.33%;background-position:59.35% 60.68%}`
- `.videoGrid .sceneThumb:nth-child(4){background-size:760% 627.33%;background-position:12.4% 35.4%}`
- `.videoGrid .sceneThumb:nth-child(2){background-position:100% 43%}`、`nth-child(3){65% 74%}`、`nth-child(4){20% 32%}`（第 20 行旧位置）
- 基础 `.sceneThumb{background-size:430% 530%;background-position:100% 68%}` → `cover; center`

## 可见图像比例（元素面积 ÷ 图面积×s²，s=cover 缩放系数）

| 视口 | 园区实景 | D1 | D3 | 入口 | W1 |
|---|---|---|---|---|---|
| 1920×1080 | 0.56 | 0.62 | 0.62 | 0.72 | 0.72 |
| 1366×768 | 0.54 | 0.91 | 0.91 | 0.94 | 0.94 |
| 1024×768 | 0.73 | 0.66 | 0.66 | 0.77 | 0.77 |
| 600×900 | 0.78 | 0.87 | 0.87 | 0.74 | 0.74 |
| 390×844 | 0.80 | 0.72 | 0.72 | 0.84 | 0.84 |

（修复前 600/390 为 0.014–0.023，现全部 ≥0.54，符合 ≥0.5。）

## 变异检查

临时恢复上述旧百分比规则后：
- 静态：`not ok 7 - D-V2-C1-R1 无旧百分比 background-size（监控窗不再放大）`（失败 ✓）
- 布局：`not ok 3 - D-V2-C1 像素比对 + 五窗口尺寸/背景`，`600x900 overview background-size 应为 cover（实测 619.26% 1147.56%）`（失败 ✓）

随后已撤销该临时改动（未提交），当前静态 7/7、布局 3/3 通过。

## 测试

- 定向：`dr-console-static`（7/7）+ `dr-console-layout`（3/3，含 Playwright 几何/像素/比例验收，非 NOT_RUN）。
- 全量：未跑（时间/内存，卡标注仅在内存充足时运行）。

## 做到 / 没做到 / 未验证

- **做到**：删除旧百分比规则、全宽度 cover+center、静态+可见比例+cover 断言、变异检查。
- **没做到**：可选项「园区实景窗 1920 下改 `background-position: center 35%`（避免 DR 门楼顶部被裁）」未做——保持 cover 默认 center，桌面端视觉与 16c8364 一致（Q-V1 已通过桌面端）。
- **未验证**：窄屏监控窗修复后的视觉清晰度（可见比例 ≥0.5 已达标，但素材仅约 124px 宽的客观模糊仍在），需 Q-V1 目视。

## 位置

本回执在源码分支 `dispatch/deepseek/outbox/D-V2-C1-R1-report.md`。
