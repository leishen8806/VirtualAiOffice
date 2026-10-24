# Codex 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

| 顺序 | 卡片 | 分支 | 状态 |
|---|---|---|---|
| **1** | `OF-R3-restore-files-dropped-by-merge.md`（恢复 `66bca48` 合并时丢失的 43 个 main 文件；阻断合并 main） | `integration/office-evidence-20261023`，从 `345cd39` 继续；并合入 `feat/v3-align-sample` | **立即开始，暂停 V3-A2** |
| 2 | `V3-A2-align-shell-open-islands-bar.md` + `V3-A2-ADDENDUM-sample-base-and-island-rules.md`（格局对齐第 2 步） | `feat/v3-align-scene` | OF-R3 推送后继续；新建该分支时须包含 OF-R3 的恢复提交 |

说明：

- 若 V3-A2 已有进行中的修改，先在其分支提交到一个可编译、可测试的停点，**不要与 OF-R3 混在同一提交**。
- inbox 中其余卡片（OF-R1、OF-R2、V3-A2P、V3-A2P-R1）均已交付并完成复审，无需再做。
