# Trae 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

| 顺序 | 卡片 | 分支 | 状态 |
|---|---|---|---|
| **1** | `V3-A1-R2-sofa-radius-545.md`（`LAYOUT_V3_ALIGN` 沙发中心 5.8 → 5.45，约 30 分钟） | `feat/v3-align`，从 `f0f4632` 继续 | **立即开始** |
| 2 | `W-V1-R3-dock-numbers-forklift.md`（月台门号 / 叉车） | `integration/vis2-dr-rc1` | V3-A1-R2 推送后再做 |
| 3 | `W-RC-R3-rack-cell-test-polish.md`（货架测试补强） | `integration/vis2-dr-rc1` | 其后 |

说明：

- 若 W-V1-R3 已有进行中的修改，先在其分支提交到一个可编译、可测试的停点，**不要与 V3-A1-R2 混在同一分支或同一提交**。
- 格局对齐第 3 步（25 工位与路线回归）要等 Codex 的 V3-A2 交付后再发卡。
- inbox 中其余卡片（V3-A1、V3-A1-R1、V3-F1、V3-L1、V3-L1-R2、V3-L1-R3、W-RC-R1、W-RC-R2、W-V1-R1、W-V1-R2）均已交付并完成复审，无需再做。
