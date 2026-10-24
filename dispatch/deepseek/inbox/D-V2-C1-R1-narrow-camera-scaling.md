---
id: D-V2-C1-R1
base: vis-align/console-v1 @ 16c8364647da42f952f013fffb1f2d304334c845
branch: vis-align/console-v1
evidence: evidence/vis-align-console-v1
scope:
  - office3d/dr-console.html
  - office3d/tests/dr-console-layout.test.mjs
  - office3d/tests/dr-console-static.test.mjs
  - dispatch/deepseek/outbox/D-V2-C1-R1-report.md
budget: 1h
---
# D-V2-C1-R1：窄屏监控窗被旧百分比规则放大——删除旧规则并补测试

Q-V1 复审 D-V2-C1（`16c8364`）的结论是**需小返工**。素材、INDEX、文案、像素比对，以及 1920 / 1366 / 1024 三个视口的显示都已通过，**保持不变**。

在 `vis-align/console-v1` 上从 `16c8364` **继续追加提交**；不改写已审提交，不 force push。

## 问题（P1，本次引入的回归）

在 600 与 390 视口下，5 个窗口只显示裁剪图的**约 2%**，放大 9–17 倍，成为一片模糊色块（审查员截图 `videoGrid-600.png`）。

审查员计算的可见图像比例（窗口内实际可见的图像面积 ÷ 图像面积）：

| 视口 | 园区实景 | D1 | D3 | 入口 | W1 |
|---|---|---|---|---|---|
| 1920 / 1366 / 1024 | 0.54–0.74 | 0.62–0.91 | 0.62–0.91 | 0.72–0.94 | 0.72–0.94 |
| 600 / 390 | **0.014** | **0.020** | **0.020** | **0.023** | **0.021** |

原因：`office3d/dr-console.html` 第 26–34 行有不在任何媒体查询里的旧规则。它们原本用于从 1672×941 整图中按百分比抠出画面，现在作用在 124 px 宽的裁剪图上：

- `.sitePanel .sceneThumb{background-size:619.26% 1147.56%;background-position:98.43% 64.03%}`
- `.videoGrid .sceneThumb:nth-child(1){background-size:760% 648.97%;…}`，以及 `nth-child(2)`、`(3)`、`(4)` 的同类规则

本次只在 `@media(min-width:768px)` 里改成了 `cover`，所以窄屏仍走旧规则。另外，第 20 行 `.videoGrid .sceneThumb:nth-child(2..4){background-position:…}` 的旧位置值也是为整图准备的。

## 要做

1. 删除上述旧的百分比 `background-size` / `background-position` 规则（`.sitePanel .sceneThumb` 与 `.videoGrid .sceneThumb:nth-child(n)` 两组，含第 20 行的位置值）。让 `background-size: cover; background-position: center` 在**所有宽度**下生效（可以从 `@media(min-width:768px)` 中移出）。
2. 不改其他布局、首屏主图、KPI、物流网络面板、侧栏；1920 / 1366 / 1024 的窗口尺寸与显示保持不变。
3. 可选（不强制）：园区实景窗在 1920 下宽高比约 4.0，裁剪图是 2.24，用 cover 会裁掉上下约 44%，DR 门楼顶部看不到。可改为 `background-position: center 35%`；如果改，回执里附前后截图。

## 测试

在 `tests/dr-console-layout.test.mjs` 的 `D-V2-C1 像素比对 + 五窗口尺寸/背景` 中，对 1920 / 1366 / 1024 / 600 / 390 五个视口、5 个窗口逐一断言：

- 计算后的 `background-size` 为 `cover`；
- **可见图像比例 ≥ 0.5**：按元素尺寸与图片原始尺寸计算（cover 时缩放系数 s = max(元素宽 / 图宽, 元素高 / 图高)，可见比例 =（元素宽 × 元素高）÷（图宽 × s × 图高 × s））；
- `background-image` 指向正确文件（已有）。

在 `tests/dr-console-static.test.mjs` 中加断言：页面里不再出现针对 `.sitePanel .sceneThumb` 或 `.videoGrid .sceneThumb:nth-child` 的百分比 `background-size`。

**变异检查**：临时恢复第 26–34 行的旧规则，新断言应当失败；回执写明失败信息，然后撤销该临时改动（不提交）。

## 不做

不改素材文件、INDEX、`dr-console-map.js`、`dr-console.js`；不下载、不生成、不 AI 放大素材；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。浏览器测试带资源上限，单页面依次运行、用完即关。

## 交付

- 推送后告诉派发人：源码分支、证据分支的完整 SHA。
- 回执 `dispatch/deepseek/outbox/D-V2-C1-R1-report.md`：做到 / 没做到 / 未验证；删除的规则清单；5 个视口 × 5 个窗口的可见比例表；变异检查的输出。
- 截图（本次 SHA 新采集）：600 与 390 全页；两个视口下的园区实景窗与视频监控面板局部；1920 的视频监控面板局部（证明桌面端未变）。
- 测试：定向 `dr-console-static` + `dr-console-layout`；全量测试仅在内存充足时运行。
- 完成后停下，等待 Q-V1 复审。之后按 `00-PRIORITY.md` 继续做 `VIS3-TEST-FIX3`。
