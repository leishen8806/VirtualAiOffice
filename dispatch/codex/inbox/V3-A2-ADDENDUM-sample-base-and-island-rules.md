# V3-A2 补充说明（董事会 2026-10-24 裁决，必读）

适用于 `V3-A2-align-shell-open-islands-bar.md`。

1. **样板通过版本**：V3-A2P-R1 已通过 Q-V1 复审，版本为 `feat/v3-align-sample` @ **`3c0ffff989a2a60ef610139cd4b50ed22dfe70c2`**。V3-A2 合入的就是这个版本。
2. **吧凳与台面的净距门槛**：A2P-R1 中 `validateIslandRings` 的 `STOOL_COUNTER_CLEARANCE` 门槛（坐垫边缘到台面边缘 ≥ 0.45 m）是审查员写卡时定得过严。董事会裁决改为**坐垫边缘到台面边缘 ≥ 0.30 m**；方案值的实测净距是 0.375 m，吧凳中心到台面外沿 0.655 m，属于正常吧台尺度。
   - 请在 V3-A2 中修改该门槛及对应测试：
     - 方案值 0.375 m 应通过；
     - 用一个 0.25 m 的合成样例证明门槛仍然有效。
3. **沙发中心半径**：已发小卡 `V3-A1-R2` 给 Trae，把 `LAYOUT_V3_ALIGN.island.sofaOuter` 改为 **5.45**（靠背外沿约 5.80 m，在 6 m 碰撞以内）。
   - V3-A1-R2 通过复审后，派发人会告诉你 `feat/v3-align` 的新 SHA，请把它 merge 进 `feat/v3-align-scene`；
   - 届时 `validateIslandRings(LAYOUT_V3_ALIGN)` 应返回 `ok: true`，并写进报告；
   - 在此之前，以 `f0f4632` 的数据工作即可，报告中如实写出当时检查函数的输出。
4. **碰撞盒斜向外凸（复审观察）**：`barColliders` 用 12 个轴对齐方框近似一圈，碰撞外沿为 6 时，方框角最远到 **7.01 m**，在斜向会伸进 4 m 环形通道约 1 m。
   - 请在 V3-A2 中只对 ALIGN 改进（例如增加分段数，或改用环形扇区判定），使碰撞最远点 ≤ 6.3 m；
   - 稳定 V3 的 `barColliders` 输出必须逐字节不变。
