# Trae 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

| 顺序 | 卡片 | 状态 |
|---|---|---|
| **1** | `V3-A1-R1-restore-plan-and-open-semantics.md`（V3-A1 返工：恢复方案甲坐标、`bar.radius: 6`、开放区语义、走廊数据、示意图） | **立即开始** |
| 2 | `W-V1-R3-dock-numbers-forklift.md`（月台门号 / 叉车） | V3-A1-R1 推送后再做 |
| 3 | `W-RC-R3-rack-cell-test-polish.md`（货架测试补强） | 其后 |

说明：

- V3-A1-R1 在 `feat/v3-align` 上从 `10618704` 继续追加；W-V1-R3 / W-RC-R3 仍在 `integration/vis2-dr-rc1`。两条分支互不合并。
- 若 W-V1-R3 已有进行中的修改，先在其分支提交到一个可编译、可测试的停点，**不要与 V3-A1-R1 混在同一分支或同一提交**。
- `V3-A1-align-layout-data.md` 与 `V3-A1-ADDENDUM-island-fields.md` 仍是本步的基础要求，R1 只列需要返工的部分。
- inbox 中其余卡片（V3-A1、V3-F1、V3-L1、V3-L1-R2、V3-L1-R3、W-RC-R1、W-RC-R2、W-V1-R1、W-V1-R2）均已交付并完成复审，无需再做。
