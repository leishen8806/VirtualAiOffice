# O9-campus-migration：仓配园区迁到西路对侧（改 office-layout / env / 小地图，独占 app.js，约 1.5 小时）

> **【2026-10-21 夜：本卡已被 S2-9-campus-migration.md 取代，请勿再派发。】**（董事会已确认园区四项取舍；旧外壳并入高位货架区、旧址改绿化草坪。）

> **【rev2 修订，2026-10-21 夜，董事会已确认，以本块为准，覆盖下文与之冲突的位置、尺寸、前置】** 依据：`docs\office-redesign-plan.md`（**O1-rev2，按董事会效果图 `参考\2026年10月21日 11_16_22.png`**）。董事会确认四项：① 推荐外框 **`x=-34…38, z=-18…16`（72×34 m，2448㎡，+42.7%）**；② 北门（`x=-1…5, z=-18`）先作**视觉门，锁闭，不进导航**；③ Dr.life+ 工作室 **`x=9…27, z=7…13`（108㎡）**；④ **中轴前台居中，访客从两侧绕行**。**前置改为：O1-rev2 已验收（已验收）**。入口、前台、中庭、吧台、北门同在 `x=2` 轴线；吧台圆心 `(2,-1)`；**不再有「东侧入口脊柱」**，改为南北各 4 m 宽的中轴门户 + 半径 6–8 m、净宽 2 m 的**圆形通行环**（人物绕行，不穿吧台）。
> **本卡特别说明：** 仓配园区另案（见 `S2-0c-dr-campus-plan.md` 与董事会 2026-10-21 夜提供的**概念图 `参考\智序小镇·DR仓配服务中心概念图.png`**）；O1-rev2 只保留西侧道路对面的「仓配园区（另案）」标示，**具体坐标以 S2-0c 验收版本为准**。办公区外框已变为 `x=-34…38, z=-18…16`，**原仓库位置 `x=-46…-10, z=13…35.5` 与新办公区南缘 `z=16`、广场的关系**以 rev2 为准处置（绿化 / 活动草坪预留，不改 `PLAZA`）。

**执行者：Codex（新会话）。** 先读：`_common.md`、`_lane-town.md`、**`docs\dr-campus-plan.md`（S2-0c 已验收版本，位置、面积、迁移方案以它为准）**、`docs\office-redesign-plan.md` 第 9 节、`warehouse-shell.js`、`office-layout.js`、`env.js`、`tools\env-snapshot-compare.mjs`。**通则见 `O2-layout-v2-data.md`。** **前置：S2-0c 已验收；O8 已验收（`app.js` 独占）。** 迁出后原位置 `x=-46…-10, z=13…35.5` 按 O1 第 9 节处置（绿化 / 活动草坪预留，**不改 `PLAZA`**）。仓库外壳模块保持不变，只由新常量驱动；layout1 与 layout2 同时受益。

**允许修改：** `office-layout.js`（仓配常量与小地图边界）、`env.js`（树木 / 铺装既有特例，**只扩展，保持随机数消费顺序不变**）、`warehouse-shell.js`（只改位置驱动，不改几何与偏移规则）、`app.js`（接线 ≤ 20 行）、相关测试与 `docs\dr-warehouse-checks.mjs` 的同步。备份到 `office3d-backup-o9`。

## 要做的事
1. 按 S2-0c 的最终坐标迁移 `WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / LOGISTICS_GATE_ZONE / WAREHOUSE_ITEMS / WAREHOUSE_FOCUS`；**保留 336㎡ 主体、月台、停车、物流门与 S2-2b 的薄件偏移规则**；跨公路连接仅视觉 / 地面标识。
2. 环境：新园区所需的铺装 / 树 / 路灯 / 城市建筑调整（**列清单**，随机数序列不变），原位置绿化处理。
3. 小地图、相机聚焦（`WAREHOUSE_FOCUS`）、搜索入口、碰撞全部随之迁移；`warehouse-entrance` 拾取区保留。

## 测试与验收
- 仓库布局 / 外壳 / 检查脚本同步更新且全过；`env-snapshot-compare` 仅出现预期差异；人物与小橘路线（layout1 与 layout2）逐段 0 进入新碰撞体；`PLAZA` 不变；成对 calls 不超过 S2-0c 预算。
- 浏览器：广场、办公区、仓配园区、跨路视角各一张；小地图完整显示；控制台 0 错误。
