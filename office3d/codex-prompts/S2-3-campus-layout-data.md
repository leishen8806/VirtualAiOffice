# S2-3-campus-layout-data：DR 仓配服务中心园区的布局常量与静态规划测试（纯数据，不改 app.js，约 1 小时）

**执行者：Trae（新会话，纯数据 + 测试）。小镇线 · 数据。** 先读：`_common.md`、`_lane-main.md`、`_lane-town.md`、**`docs\dr-campus-plan.md`（S2-0c 已验收并冻结的园区施工基线；坐标、分区、动线以它为准）**、`docs\dr-campus-checks.mjs`（可复用其检查思路，**不改它**）、`office-layout.js`（O2 之后的版本，**只新增导出**）。参考图：`E:\VirtualAIOffice\knowledge\项目\参考\智序小镇·DR仓配服务中心概念图.png`。

**前提说明（董事会 2026-10-21 已确认全部四项）：** 本卡按 S2-0c 推荐方案实现：完整园区 `x=-174…-72, z=-26…42`（6936㎡）、主建筑 `x=-168…-80, z=-18…30`、旧 28×12 外壳将在 S2-9 并入 `highRack` 作为内部模块、前广场与接待展示区 v1 只做参观外观。若董事会后续改变这些取舍，以新的指示为准。

**允许修改：** `office-layout.js`（**只新增导出，现有导出的值与顺序一字不变**）、新增 `tests\campus-layout.test.mjs`、`tests\fixtures\office-layout.pre-s2-3.js`（改动前基线的拷贝，用作「现有导出不变」的比对，**不要让测试依赖备份目录**）；`README.md` 追加一节「仓配园区布局常量（S2-3）」。**不要改** `app.js`、`server.mjs`、`ui.js`、`env.js`、`warehouse-shell.js`、`town\`、`docs\dr-campus-*`。备份 `office-layout.js` 到 `office3d-backup-s2-3`（**必须备份**）。

## 要做的事
1. 在 `office-layout.js` 新增**深冻结**导出：`CAMPUS`（外框 + 面积 + 西路缓冲）、`CAMPUS_BUILDING`（主建筑外框，面积 4224㎡）、`CAMPUS_ZONES`（14 个分区：`receiving / inspection / highRack / picking / packing / shipping / dispatch / visitor / showcase / officeMeeting / maintenance / frontPlaza / parking / logisticsGate`，每项含 `id、name（中文，带「示意」标识的名称写在 label 字段）、x0 x1 z0 z1、kind（building / outdoor）、v1（'visible' / 'mark' / 'reserved'）、ref（参考图业态）`）、`CAMPUS_SHUTTLE_STRIP`（`x=-148…-144, z=-8…6`，仅展示动画位）、`CAMPUS_FLOWS`（客户 / 货物 / 平台服务三条折线，含 `type: 'walk' | 'mark'`）、`CAMPUS_FOCUS`（焦点 `[-124,0,6]`、半径 68，标签「DR 仓配服务中心（示意）」）、`CAMPUS_MINI_BOUNDS`（`x0=-178,x1=24,z0=-28,z1=44`，**只作为导出，本卡不替换现有 `MINI_BOUNDS`**）。数值逐项取自规划文档。
2. **旧仓库常量保持不动**（`WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / LOGISTICS_GATE_ZONE / WAREHOUSE_ITEMS / WAREHOUSE_FOCUS` 等一字不改，迁移留给 S2-9）。
3. **文案红线**：分区名称、标签只用示意名，不得出现真实商户 / 客户 / 地址 / 面积 / 订单；不涉及 DR 币。

## 测试（`tests\campus-layout.test.mjs`）
- **现有导出零变化**：对照 `tests\fixtures\office-layout.pre-s2-3.js`，逐项比对所有旧导出的值（函数比 `String()`），并断言新文件以旧文件内容开头（只新增）。
- 园区：面积 ≥ 6500㎡；主建筑 ≥ 4000㎡（4224）；14 个分区 id 唯一、互不重叠（边界接触不算）、全部在园区外框内；与西路 `x≈-64` 之间有 ≥ 8 m 缓冲；**与 `ENVELOPE`、`LAYOUT_V2.envelope`、`PLAZA`、`FOYER_ITEMS`、`WAITING_SEATS`、A4 预留区（`x=70,z=-30` 周边）无重叠**；所有坐标落在 0.5 m 网格；三条动线折线点都在园区内、`walk` 段落在已声明的可通行空间内、货物流线按「收货 → 质检 → 入库 → 拣货 → 包装 → 发货」顺序经过相应分区；穿梭机展示带完整落在 `highRack` 内；深冻结；变异用例（把某分区挪出外框 / 与邻区重叠）必须被检出。
- 静态检查：新增代码不含 `document / window / fetch / Math.random / Date.now`；无 `buy / purchase / price / balance / wallet` 与真实商户名。
- `node --input-type=module --check < office-layout.js`；全量测试全过，**不得放宽既有断言**。

## 汇报
「做到 / 没做到 / 未验证」，与磁盘一致；贴 14 个分区表与动线表、旧导出对比结果。**不要重启任何进程。**
