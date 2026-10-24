---
id: D-V2-C1
base: vis-align/console-v1 @ 9b783e6e0e868a935485b829fc58a821961786ac
branch: vis-align/console-v1
evidence: evidence/vis-align-console-v1
scope:
  - office3d/dr-console.html
  - office3d/assets/demo/
  - office3d/tests/dr-console-static.test.mjs
  - office3d/tests/dr-console-layout.test.mjs
  - dispatch/deepseek/outbox/D-V2-C1-report.md
budget: 3h
---
# D-V2-C1：中控台园区实景窗与 4 个监控窗——从参考整图裁局部

**顺序**：排在 `VIS3-TEST-FIX3` 之后；若 FIX3 尚未开工，可先做本卡（两卡没有文件交叉）。
在 `vis-align/console-v1` 上从 `9b783e6` **继续追加提交**，不改写已审提交、不 force push。

## 背景

D-V1 首屏样板已于 `9b783e6` 验收通过（桌面与窄屏）。剩下的是实景窗与 4 个监控窗：目前 `.camera-overview`、`.camera-d1`、`.camera-d3`、`.camera-entry`、`.camera-w1` 用的 `dr-cam-*.webp` 五个文件**逐字节相同**，都是仓配剖面概念图，不是对应画面。董事会决定：从参考整图裁出对应局部。

## 素材来源与裁剪框（审查员已逐一放大核对）

来源：`office3d/assets/demo/dr-campus-reference.jpg`（《DR智慧仓配中心全景仪表盘6.0》整图，1672×941，SHA-256 `950d40ab45ed2536857096edd08e5beb54503c3ad29d6f02991da070ee35b61e`）。

裁剪框为 `[x0, y0, x1, y1]`（像素，x1 / y1 不含），均已**避开**参考图里印的面板标题、地点文字与圆角边框：

| 槽位（CSS 类） | 参考图中的画面 | 裁剪框 | 尺寸 |
|---|---|---|---|
| `camera-overview`（园区实景视角） | 园区大门、DR 门楼、白色货车 | `[1416, 534, 1660, 643]` | 244×109 |
| `camera-d1`（D1 月台） | 月台内白色货车 | `[1392, 708, 1516, 768]` | 124×60 |
| `camera-d3`（D3 月台） | 月台作业区、叉车 | `[1528, 708, 1652, 768]` | 124×60 |
| `camera-entry`（园区入口） | 入口道闸、厂房 | `[1392, 802, 1516, 872]` | 124×70 |
| `camera-w1`（W1 存储区） | 高位货架通道 | `[1528, 802, 1652, 872]` | 124×70 |

说明：参考图中的监控小图本身只有约 124 像素宽，放大显示会偏软，这是素材限制，**不要**用插值以外的方式"增强"或生成新内容。

## 要做

1. 按上表从 `dr-campus-reference.jpg` 裁出 5 个文件，命名 `dr-cam-site.jpg`、`dr-cam-d1.jpg`、`dr-cam-d3.jpg`、`dr-cam-entry.jpg`、`dr-cam-w1.jpg`（JPEG 质量 ≥ 90，不缩放、不改色）。
2. 五个 `.camera-*` 类改用新文件；显示方式改为 `background-size: cover; background-position: center`（不再 `contain`），在 1920 / 1366 / 1024 / 600 / 390 下都不留空边。
3. 不再使用的 `dr-cam-*.webp` 从目录删除（若仍被引用则保留并说明）；`assets/demo/INDEX.json` 为 5 个新文件逐个登记：`source`（参考整图）、`crop`、`size`、`usage`、`sha256`。
4. 每个窗口保留可见的演示标识：把文字中的"模拟占位"改为"设计参考 · 非实时"（例如"D1 月台 · 设计参考 · 非实时"），不得让人误以为是实时监控。
5. 测试：
   - 静态：五个 `.camera-*` 背景各指向不同文件；INDEX 中五个文件的 SHA-256 与实际文件一致、彼此不同、均不等于剖面图 `41e5ecbb…`；INDEX 覆盖目录内全部文件。
   - 几何 / 像素（`dr-console-layout.test.mjs`，无浏览器时 NOT_RUN）：在浏览器 canvas 中按 INDEX 的 `crop` 从参考整图重新裁出，与对应文件逐像素比较，平均绝对差 < 4（JPEG 重编码误差）、框整体平移 4 px 后差值明显变大（证明位置正确）；五个窗口在 5 种视口下都有非零尺寸且计算出的 `background-image` 正确。

## 不做

不改首屏主图、KPI、物流网络面板、侧栏与已通过的布局；不改 `dr-console-map.js`；不下载、不生成、不 AI 放大任何素材；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。浏览器测试带资源上限，单页面依次运行、用完即关。

## 交付

- 推送后告诉派发人：源码分支、证据分支完整 SHA；改动文件与行数。
- 报告 `dispatch/deepseek/outbox/D-V2-C1-report.md`：做到 / 没做到 / 未验证；五个文件的裁剪框、尺寸、SHA-256；像素比对结果。
- 截图（本次 SHA 新采集）：1920、1366、600 全页；1920 下园区实景窗与视频监控面板局部（DPR 2）。
- 测试：定向 `dr-console-static` + `dr-console-layout`；全量仅在内存充足时运行，失败按名称与 `9b783e6` 比较，不得新增。
- 完成后停下，等待 Q-V1 独立复审。
