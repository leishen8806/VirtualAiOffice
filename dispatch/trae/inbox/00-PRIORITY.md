# Trae 当前执行顺序（董事会 2026-10-24 指定）

本文件只规定**顺序**，各卡内容以对应卡片为准。新指定会覆盖本文件。**请先读本文件，再按顺序执行；每次推送后都要把完整 SHA 告诉派发人。**

| 顺序 | 卡片 / 事项 | 分支 | 状态 |
|---|---|---|---|
| **1** | `W-V1-R4-forklift-mast-front.md`（叉车门架移到车头，约 30 分钟） | `integration/vis2-dr-rc1`，从 `a1df093` 继续 | **立即开始** |
| 2 | `W-RC-R4-pallet-height-guard.md`（补回托盘高度守护、清单精确匹配、文档同步，约 45 分钟） | `integration/vis2-dr-rc1`，接在 W-V1-R4 之后，另起一个提交 | 其后 |
| 3 | **把 OF-R3 恢复提交合入 `feat/v3-align`**（见下） | `feat/v3-align`，从 `fb1e899` 继续 | 其后（OF-R3 已通过） |
| 4 | `V3-A3-align-routes-and-display.md`（格局对齐第 3 步：新格局真人路线、展示部门与展示人员） | 新建 `feat/v3-align-routes`，从 `feat/v3-align-scene` @ `befaa45` | 1–3 完成后开始 |

## 第 3 项：把 OF-R3 恢复提交合入 `feat/v3-align`

- OF-R3 已通过复审：恢复提交 **`e20363148819a775c8cdc66b5eb53a3d2e406bcb`**（`integration/office-evidence-20261023` @ `ba92f46` 中包含）。
- 在 `feat/v3-align` 上从 `fb1e899` merge `e203631`。只追加提交；有冲突就停下报告。
- 验收：
  - `git diff --name-status origin/main HEAD` 中没有任何 `D`；
  - 清单 43 个文件与 `origin/main` 逐字节相同（清单见 `dispatch/codex/inbox/OF-R3-restore-files.txt`）；
  - `node docs/v3-layout-align-check.mjs` 通过；
  - 定向测试 `office-v3-align-data` + `office-v3-meeting-navigation` + `office-v3-region-focus` + `office-layout-v3` + `dr-vis2-rack-cell` + `dr-vis2-dispatch-suite` 全部通过（带 `--max-old-space-size=1024 --test-concurrency=1`）。
- 回执写在 `dispatch/trae/outbox/V3-A1-MERGE-OF-R3-report.md`。

## 说明

- 已通过复审、无需再做：V3-A1、V3-A1-R1、V3-A1-R2（`fb1e899`）、W-V1-R3（`fe34549`）、W-RC-R3（`a1df093`），以及 inbox 中其余较早的卡片。
- 不同分支的工作不要混在同一提交。
- V3-A3 期间，Codex 在 `feat/v3-align-scene` 上改 `office-furniture-v2.js`（V3-A2-R1），请不要改这个文件。
