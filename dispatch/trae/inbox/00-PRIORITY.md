# Trae 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

| 顺序 | 卡片 | 状态 |
|---|---|---|
| **1** | `V3-A1-align-layout-data.md`（格局对齐实施第 1 步） | **立即开始** |
| 2 | `W-V1-R3-dock-numbers-forklift.md`（月台门号 / 叉车） | V3-A1 推送后再做 |
| 3 | `W-RC-R3-rack-cell-test-polish.md`（货架测试补强） | 其后 |

**V3-A1 必读补充**：`V3-A1-ADDENDUM-island-fields.md`（吧台岛字段名沿用现有 `island.*` / `bar.*`）。

说明：

- 若 W-V1-R3 已有未提交的进行中修改，先在其分支提交到一个可编译、可测试的停点（或妥善保存），**不要与 V3-A1 混在同一分支或同一提交**，然后切换到 V3-A1。
- V3-A1 在新分支 `feat/v3-align` 上进行；W-V1-R3 / W-RC-R3 仍在 `integration/vis2-dr-rc1`。两条分支互不合并。
- inbox 中其余卡片（V3-F1、V3-L1、V3-L1-R2、V3-L1-R3、W-RC-R1、W-RC-R2、W-V1-R1、W-V1-R2）均已交付并完成复审，无需再做。
