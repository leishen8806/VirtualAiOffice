---
id: V3-A1-R2
base: feat/v3-align @ f0f4632b0a4f77350fd87a66df5e10ef62f63d5b
branch: feat/v3-align
scope:
  - office3d/office-layout.js（只改 LAYOUT_V3_ALIGN 的 island.sofaOuter）
  - office3d/tests/office-v3-align-data.test.mjs
  - office3d/docs/v3-layout-align-plan.md
  - office3d/docs/v3-layout-align-plan.json
  - office3d/docs/v3-layout-align-plan.svg
  - office3d/docs/v3-layout-align-check.mjs
  - dispatch/trae/outbox/V3-A1-R2-report.md
budget: 30min
---
# V3-A1-R2：吧台岛沙发中心半径 5.8 → 5.45（董事会 2026-10-24 裁决）

## 背景

V3-A1-R1（`f0f4632`）已通过复审。Codex 在 V3-A2P-R1 中加入的检查函数 `validateIslandRings`，对 `LAYOUT_V3_ALIGN` 报出 `SOFA_BEYOND_COLLISION`：沙发中心在 5.8 m 时，弧形靠背外沿实测 **6.147 m**，超出碰撞外沿 `bar.radius = 6`。贴着碰撞边走的人物会穿过沙发靠背。

董事会裁决：沙发中心半径改为 **5.45 m**，此时靠背外沿 5.80 m，在 6 m 碰撞以内；吧台岛仍为直径 12 m，4 m 环形通道不变。

在 `feat/v3-align` 上从 `f0f4632` **追加一个提交**；不 force push、不推 `main`、不合并其他分支。

## 要做

1. `office-layout.js`：**只改** `V3_ALIGN_LAYOUT.island.sofaOuter`，从 `5.8` 改为 `5.45`。
   - **不要改**稳定 `V3_LAYOUT.island.sofaOuter`（第 422 行，仍为 5.8）；
   - 其他吧台字段（`bar.radius 6`、`barOuter 3.5`、`stoolRadius 4.2`、`ring 6..10`）不变。
2. `tests/office-v3-align-data.test.mjs`：
   - 第 85 行断言改为 `5.45`；
   - 新增断言：稳定 `LAYOUT_V3.island.sofaOuter === 5.8`，不受影响；
   - 新增断言：`5.45 + 0.35 ≤ bar.radius`，即沙发靠背外沿约 5.80 m，在碰撞外沿之内。
3. 方案文档：
   - `v3-layout-align-plan.json` 的 `island.sofaOuter` 改为 5.45；
   - `v3-layout-align-plan.md` 的吧台岛说明同步修改，并写一行"与方案甲的差异：沙发中心 5.8 → 5.45（董事会 2026-10-24 裁决，原因：靠背外沿越过 6 m 碰撞）"；
   - `v3-layout-align-plan.svg` 的沙发环同步修改。
4. `v3-layout-align-check.mjs`：与 `83ecc1b` 方案比对时，把 `island.sofaOuter`（方案中为 `sofaRadius: 5.8`）加入**允许差异清单**，并注明裁决日期与理由；其他字段仍须逐项一致。运行输出中列出这条允许差异。

## 验收

- 检查脚本通过，并在输出中列出"允许差异：island.sofaOuter 5.8 → 5.45（董事会裁决）"。
- 定向测试 `office-v3-align-data` + `office-v3-meeting-navigation` + `office-v3-region-focus` + `office-layout-v3` 全部通过。
- `LAYOUT_V1 / V2 / V3` 与 `f0f4632` 逐字段相同。

## 不做

不改其他布局数据、门洞、走廊、工位；不改公共路径、导航、`app.js`；不推 `main`、不 force push、不部署、不启停服务；报告不含密钥、IP、本机路径或账号。

## 交付

- 推送后把完整 SHA 告诉派发人。
- 回执 `dispatch/trae/outbox/V3-A1-R2-report.md`：改动行、检查脚本输出、测试真实输出末尾。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-v3-meeting-navigation.test.mjs tests/office-v3-region-focus.test.mjs tests/office-layout-v3.test.mjs`。
- 完成后停下，等待 Q-V1 复审；之后按 `00-PRIORITY.md` 继续 W-V1-R3。
