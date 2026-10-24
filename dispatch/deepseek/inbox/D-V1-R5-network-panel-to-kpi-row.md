---
id: D-V1-R5
base: vis-align/console-v1 @ 5a12251505f8661830e6a9abe8cbb7b9ed70e6d6
branch: vis-align/console-v1
evidence: evidence/vis-align-console-v1
scope:
  - office3d/dr-console.html
  - office3d/dr-console.js
  - office3d/tests/dr-console-static.test.mjs
  - office3d/tests/dr-console-layout.test.mjs
  - dispatch/deepseek/outbox/D-V1-R5-report.md
budget: 4h
---
# D-V1-R5：物流网络面板移出主图、放到 KPI 行右侧（董事会决定，硬性要求）+ 1024 段规则生效

**顺序**：本卡优先于 `VIS3-TEST-FIX3`。若 FIX3 已开工，先把它做到一个可提交的停点并推送，再做本卡。
在 `vis-align/console-v1` 上从 `5a12251` **继续追加提交**，不改写已审提交、不 force push。

## 董事会决定

D-V1 已返工 4 轮，剩余问题全部集中在"物流网络面板放在哪里"。只要面板留在主图（`.hero`）内、高度超过约 20%，就一定会压住 W3 标题牌；"地图可读"与"W3 标题牌完整"在几何上无法同时满足。**董事会选定方案 A：按参考图，把物流网络面板移出主图，放到 KPI 行右侧。** 本卡不再接受"面板留在主图内、只调高度"的方案。若执行中发现确实做不到，**先停下提交说明**，不要自行换方案。

## Q-V1 复审结论（5a12251）

已解决、请保留：桌面侧栏完全不透明，侧栏区不再出现参考图菜单；窄屏 `background-position: -62px center`，左缘无菜单，W1、W2 标题牌完整；主图裁剪 `[0,150,1672,652]` 与 INDEX 一致。

未通过：
1. **1024 段规则不生效**：第 27 行 `@media(min-width:768px) and (max-width:1024px){.panorama{background-position:left center}}` 被第 39–40 行同级的 `@media(min-width:768px){.panorama{…background-position:center}}` 覆盖（后写者生效）。1024 下实测计算值仍为 `50% 50%`，W1 标题牌只露出",015 m²"。新增测试只用正则查样式文本，查不出来。
2. **W3 标题牌被面板压住**（1920、1366），相对 R3 回退。
3. **≥1600 时 KPI 行收窄到 76% 后右侧空出约 455 px**，面板没有移上来。

## 要做

1. **面板移出主图**：把物流网络面板（`.networkPanel` 及其地图）从 `.hero` 中移出，放到 KPI 行右侧，与参考图一致：
   - ≥1600：KPI 行约占 76%，面板占右侧约 24%，面板顶部与 KPI 行顶部对齐，向下延伸、覆盖主图区顶部约 20% 高（可用网格跨行，或让面板绝对定位在 dashboard 层，覆盖在主图右上角之上——两种都可以，但面板在 DOM 上不能再是 `.hero` 的后代）；
   - 1366、1024：同样结构；若 8 张 KPI 卡放不下，KPI 改为 2 行 × 4 列，面板跨这两行；
   - <768：保持现状（面板在主图下方）。
2. **1024 段规则生效**：把 1024 段的 `.panorama` 规则移到第 39–40 行那段之后，或合并进同一个媒体查询块并删除冲突声明。
3. **测试**：
   - 静态测试：断言 HTML 中 `.networkPanel` 不在 `<section class="hero">` 内；断言 1024 段规则在文档中位于覆盖它的 `min-width:768px` 规则之后（或冲突声明已删除）。
   - 新增 `tests/dr-console-layout.test.mjs`（若环境没有浏览器就在报告中写 `NOT_RUN`，不要伪造）：用 Playwright 只读打开页面，在 1920×1080、1366×768、1024×768 下用 `getBoundingClientRect` / `getComputedStyle` 做**几何验收**（见下表）。所有数值写进报告。

## 几何验收（执行者没有图像目视能力，以下全部可用数值判断）

坐标以 `.hero` 的包围盒为 100%。参考图中 W3 标题牌区域约为 **x 69–84%、y 20–40%**；W1 标题牌区域约为 **x 13–30%、y 7–25%**。

| 项 | 1920 | 1366 | 1024 |
|---|---|---|---|
| `.networkPanel` 与 W3 标题牌区域相交面积 | 0 | 0 | 0 |
| `.networkPanel` 不是 `.hero` 的后代 | 是 | 是 | 是 |
| KPI 行右边缘与面板左边缘的间距 | ≤ 16 px | ≤ 16 px | ≤ 16 px |
| 地图 SVG 渲染高度 | ≥ 150 px | ≥ 120 px | ≥ 100 px |
| 地图城市标签计算字号 | ≥ 11 px | ≥ 10 px | ≥ 10 px |
| `.panorama` 计算 `background-position-x` | 50% | 50% | `0%`（左对齐生效） |
| W1 标题牌区域是否被侧栏 `aside` 覆盖超过一半 | 否 | 否 | 否 |
| KPI 卡数量、横向溢出 | 8、无 | 8、无 | 8、无 |

另外 600×900、390×844 下确认与 R4 一致：主图左缘无参考图菜单（`background-position-x` = −62 px），面板在主图下方。

## 不做

不改主图素材与 INDEX；不改实景窗与 4 个监控窗；不改 `dr-console-map.js` 的投影与地理数据（只改容器位置与尺寸）；不改 demo 规则、共享模拟、三维；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。测试与浏览器运行带资源上限（`--max-old-space-size`、单页面依次运行、用完即关）。

## 交付

- 推送后告诉派发人：源码分支、证据分支完整 SHA；改动文件与行数。
- 报告 `dispatch/deepseek/outbox/D-V1-R5-report.md`：做到 / 没做到 / 未验证；**上表每一格的实测数值**；布局实现方式（网格跨行或叠加定位）及理由。
- 截图（本次 SHA 新采集）：1920、1366、1024、600、390 全页；1920 与参考图同比例并排。
- 测试：定向 `dr-console-static` 与 `dr-console-layout`（或其 `NOT_RUN` 说明），全量 `tests/*.test.mjs`；失败按名称与 `5a12251` 比较，不得新增。
- 完成后停下，等待 Q-V1 独立复审。
