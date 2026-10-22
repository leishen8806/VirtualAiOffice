# R3-2-layout-v3-data：`LAYOUT_V3` 纯数据 + `?layout=3` 解析 + 检查（不改场景；约 1–1.5 小时）

**执行者：Codex（会话一，办公区产线）。** **前置：R3-1 已验收。** 董事会 2026-10-22：**按概念图 `参考\智序工场-办公区改造概念.png` 的尺寸与设计提示词完整执行；拆除所有影响设计的事物；图上不明确的按推荐默认值执行并记入决策日志，不停下来问。** 本卡把 R3-1 规划里的坐标落成**纯数据**，不创建任何场景对象。

先读：`_common.md`、R3-1 在 `docs\office-redesign-plan.md` 里的 rev3 一节与 `docs\office-rev3-decision-log.md`、`docs\office-redesign-checks-v3.mjs`、`office-layout.js`（`LAYOUT_V2`、`resolveOfficeLayout`、`regionFocus`、`seats`、`displaySeats`）。

## 要做的事
1. `office-layout.js` 新增 `LAYOUT_V3`（结构与 `LAYOUT_V2` 对应：`version:3`、`envelope / axis / regions / rooms / seats / displaySeats / corridors / passages / bar / frontDesk / serviceBar / waitingArc / doors / boss / boardTable / meetingSeats / regionFocus / miniBounds / plaza`，另新增 `ring`（4 m 环形通道）、`island`（吧岛 Ø12 的分解）、`plaza`（Ø18 圆形广场：圆心、半径、台阶、花带、餐车 / 小货亭 / 阳伞座椅 / 路灯 / 长椅位置）、`greenBuffer`（2.5 m）、`wallHeight`（4.5 m，局部 6 m 的位置）、`cameraDefaults`）。**所有数字来自 R3-1。网格规则（2026-10-22 规划者裁决，取代「所有坐标落 0.5 m 网格」）分两层：① 结构类坐标（区域外框、墙、门、走廊、环形通道 / 吧岛 / 广场的半径与圆心）**必须落 0.5 m 网格**；R3-1 里少数偏离网格的结构值（如 `14.2`、`24.2`、`29.8`）**就近取整到 0.5 m**（概念图尺寸本是「约」值，误差 ≤ 0.3 m 可接受），**逐项记入决策日志 D3-18**（原值 → 新值 → 影响）；② 家具、席位、道具类坐标（前台、服务吧、桌椅、吧凳、广场设施、展示席位）**放宽到 0.1 m 网格，不强制取整**，保持 R3-1 的值（如前台 `z=8.8`、服务吧 `z=8.3`），前提是检查脚本里的净距（0.52 m）、可达性与碰撞检查全部通过。**取整后必须同步更新 `docs\office-redesign-plan.md` 的 rev3 一节与 `docs\office-redesign-checks-v3.mjs`（把「全部 0.5 m 网格」检查改成上述两层规则，并新增一条变异：把一个结构坐标改成 14.2 必须让检查失败），重跑 6 + 1 种变异确认都失败；结构值取整后若引起任何净距 / 可达 / 重叠检查失败，先停下写明，不要自行放宽检查。** 原有 13 个区域 id 保持不变（搜索 / 聚焦 / 席位映射依赖它们），新增三类功能区用新 id（`leisure`、`creative`、`dining`）。**
2. `resolveOfficeLayout(search)` 增加 `?layout=3` → `LAYOUT_V3`；`?layout=2` → `LAYOUT_V2`（不变）；默认仍是布局一。**未知 / 重复参数、与其它版本同时出现时的行为写测试**（沿用 rev2 的规则）。
3. 检查：`docs\office-redesign-checks-v3.mjs` 改为**直接读 `LAYOUT_V3`** 验证（R3-1 里验证的是推导坐标，这里验证落地数据）；规则同 R3-1（区域在外框内、互不重叠、通道不被占用、席位数 25 + 12、环宽 ≥ 4 m、门净宽 ≥ 1.5 m、前厅与广场只相切 / 门洞、可达图）；变异测试（至少 5 条会失败）继续有效。
4. 测试：`tests\office-layout-v3.test.mjs`（数据形状、网格、id 不变、25 席位映射与 `SEATS` 兼容、新区域 id 唯一、`resolveOfficeLayout` 行为）；**`LAYOUT_V2` 与布局一的全部既有测试不得改断言**；全量 `node --max-old-space-size=2048 --test --test-timeout=60000` 全过。
5. **不改 `app.js` 与任何场景模块；默认页面与 `?layout=2` 逐数据不变**（路由快照零新增）。

备份 `office-layout.js` 与相关测试到上一级目录 `office3d-backup-r3-2`；不读取或打印密钥，不重启服务。「做到 / 没做到 / 未验证」，**停下等我验收**。
