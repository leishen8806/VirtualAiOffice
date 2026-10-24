---
id: V3-L1
base: integration/office-evidence-20261023 @ 66bca480e580efb92300f2d955231889751cf7be
branch: plan/v3-layout-align
scope:
  - office3d/docs/v3-layout-align-plan.md
  - dispatch/trae/outbox/V3-L1-report.md
budget: 4h
---
# V3-L1：办公室 V3 格局与参考图对齐——**第一阶段：只出坐标方案，不改代码**

**本卡只交方案文档，交付后停下，等董事会确认后再另发实施卡。** 方案文档放新分支 `plan/v3-layout-align`（从 `66bca48` 切出），不改任何源码。

## 背景

参考图：仓库 `main` 分支的 `docs/visuals/target-office.png`（《智序工场·办公区改造概念》，1055×1491，SHA-256 前缀 `97f74fff`；取用：`git show origin/main:docs/visuals/target-office.png > target-office.png`），含尺寸表与四张室内特写。董事会 2026-10-22 决定 V3 按概念尺寸重建；场地 60×48 m 与 Ø18 广场已对上，但 Q-V1 对 `66bca48`（整楼细化，`?layout=3&officeSample=1`）的视觉验收发现**格局**与参考图差距大：

| # | 参考图 | 当前 V3 |
|---|---|---|
| G1 | 四角四间独立展示办公室（市场 / 客服 / 售后 / 营销）；左侧"运营·质量与安全"、右侧"D.life 工坊"及"产品·工程·知识"为**成片开放办公岛**（单区约 14×10 m）；上方"会议与决策" | 16 个房间，每间约 8–10 × 5–7.5 m：market、board、review、plan、ops、quality、aftersales、leisure、kb、service、product、eng、creative、dining、drlife、marketing。左右两侧被切成十余个小房间 |
| G2 | 中央茶水吧岛直径约 12 m，外圈座位，环形主通道宽约 4 m | 吧台 `bar.radius` 3.5 m（直径 7 m） |
| G3 | 开放办公区 6–8 人一组的桌岛 | 25 个真实工位分散在多个小房间 |

参考尺寸表（建议值）：总占地约 60×48、DR 广场直径约 18、前厅接待约 16×8、中央茶水吧岛直径约 12、环形主通道宽约 4、开放办公区单区约 14×10、会议洽谈室约 10×6、D.life 工坊约 10×7、休闲展示区约 8×6、角部独立办公室约 8×6、绿化缓冲带宽约 2.5、层高 4.5（局部 6）。

## 硬约束（董事会既定）

- **25 个真实工位**的 ID、绑定与业务映射不变（只允许移动坐标）；12 个展示座位不变；不新增真实工位。
- 休闲展示 / 创意讨论 / 餐饮休憩区属展示与生活线，不加真实座位。
- O-06 FIX3 导航合同（`tests/office-v3-meeting-navigation.test.mjs`：入口、走廊、办公室、休息区、访客排队、1,375 条路线）必须在新格局下仍然成立。
- `?layout=2` 保持为回退，不动。

## 要交的方案文档（`office3d/docs/v3-layout-align-plan.md`，≤ 3500 字，长表可附 JSON）

1. **区域方案表**：新格局下每个区域的 id、名称、矩形坐标（x0, x1, z0, z1）、是否开放办公 / 独立房间 / 展示，与参考图一一对应；说明哪些现有房间合并、拆除、保留。
2. **工位迁移表**：25 个真实工位逐个列出旧坐标 → 新坐标、所属区域、朝向；桌岛分组（每组人数）。
3. **中央吧台岛**：吧台半径从 3.5 m 调到约 6 m 的方案，以及外圈座位、环形通道 4 m 的几何；列出受影响的文件——注意 Codex 的办公室样板（`office-vis2/bar.js`、`office-heart-banyan.js`、`office-bar-geometry.js` 的碰撞与开口）依赖现有半径，需要 Codex 配合，写明交接点。
4. **导航影响**：哪些门洞、走廊、公共通道需要改；FIX3 合同中哪些断言会受影响、如何保持。
5. **影响文件清单与分工建议**：共享布局 / 家具 / 导航（Trae）与办公室样板（Codex）各自要改的文件，建议的实施拆卡顺序与预计工时。
6. **风险与待董事会决定的问题**：例如参考图中无法同时满足的尺寸、四角办公室是否需要真实工位等。
7. 一张俯视示意图（可用 SVG 或代码生成的 PNG，放在方案旁），标出新区域与工位位置；**不需要做 3D**。

## 不做

不改任何源码、布局数据、测试；不合并 main、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

推送 `plan/v3-layout-align` 后把完整 SHA 告诉派发人；`dispatch/trae/outbox/V3-L1-report.md` 简述方案要点与待决问题。停下，等待 Q-V1 审阅与董事会确认。
