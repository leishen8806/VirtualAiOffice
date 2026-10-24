# Trae 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。

| 顺序 | 卡片 / 事项 | 分支 | 状态 |
|---|---|---|---|
| **1** | `W-V1-R3-dock-numbers-forklift.md`（月台门号 / 叉车） | `integration/vis2-dr-rc1` | **立即开始** |
| 2 | `W-RC-R3-rack-cell-test-polish.md`（货架测试补强） | `integration/vis2-dr-rc1` | 其后 |
| 3 | **合入 OF-R3 恢复提交**（见下） | `feat/v3-align`，从 `fb1e899` 继续 | 派发人告知 OF-R3 通过版本后再做；W-V1-R3 / W-RC-R3 已推送时可随时插入 |

## 第 3 项：把 OF-R3 恢复提交合入 `feat/v3-align`

- 背景：OF-R1 的合并提交 `66bca48` 丢失了 main 上 43 个文件（含 `docs/visuals/target-office.png`、仓库组件 `dr-vis2-rack-cell` / `dr-vis2-dispatch-suite` 及其测试、QA 证据、DS-2～DS-6 回执）。`feat/v3-align` 从 `66bca48` 派生，同样缺这 43 个文件，合入 main 时会把它们删掉。清单见 `dispatch/codex/inbox/OF-R3-restore-files.txt`。
- Codex 正在 `integration/office-evidence-20261023` 上做恢复提交（卡 OF-R3）。**等派发人告知 OF-R3 的复审通过版本后**：
  1. 在 `feat/v3-align` 上从 `fb1e899` merge `integration/office-evidence-20261023` 的通过版本（只追加，不 force push）；
  2. 有冲突就停下并报告，不要自行取舍；
  3. 验收：
     - `git diff --name-status origin/main HEAD` 中不再出现清单里的任何 `D`；
     - 43 个文件与 `origin/main` 逐字节相同；
     - `node docs/v3-layout-align-check.mjs` 通过；
     - 定向测试 `office-v3-align-data` + `office-v3-meeting-navigation` + `office-v3-region-focus` + `office-layout-v3` + `dr-vis2-rack-cell` + `dr-vis2-dispatch-suite` 全部通过（带 `--max-old-space-size=1024 --test-concurrency=1`）；
  4. 推送后告诉派发人完整 SHA，回执写在 `dispatch/trae/outbox/V3-A1-MERGE-OF-R3-report.md`。

## 说明

- V3-A1-R2（`fb1e899`）已通过复审，无需再做。
- 不同分支的工作不要混在同一提交。若 W-V1-R3 有进行中的修改，先在其分支提交到可编译、可测试的停点，再切换。
- 格局对齐第 3 步（25 个工位与路线回归）要等 Codex 的 V3-A2 交付后再发卡。
- inbox 中其余卡片（V3-A1、V3-A1-R1、V3-A1-R2、V3-F1、V3-L1、V3-L1-R2、V3-L1-R3、W-RC-R1、W-RC-R2、W-V1-R1、W-V1-R2）均已交付并完成复审，无需再做。
