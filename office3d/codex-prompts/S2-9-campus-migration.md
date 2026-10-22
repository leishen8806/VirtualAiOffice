# S2-9-campus-migration：旧仓库迁出、并入 W1 内部模块与环境重排（取代 O9；改 office-layout / env / warehouse-shell，独占 app.js，约 1.5 小时，风险高）

**执行者：Codex（新会话）。** **前置：S2-3、S2-4、S2-5 已验收；O3（办公区外壳）已验收；O8 已验收。** 先读：`_common.md`、`_lane-town.md`、**`docs\dr-campus-plan.md` 第 3、6 节**、`docs\office-redesign-plan.md`（办公区 rev2 外框 `x=-34…38, z=-18…16` 与旧仓库区的关系）、`warehouse-shell.js` 与 `tests\warehouse-shell.test.mjs`、`docs\dr-warehouse-checks.mjs`、`office-layout.js`、`env.js`、`tools\env-snapshot-compare.mjs`。

**董事会 2026-10-21 已确认：旧 28×12 m 仓库外壳并入新中心，作为高位货架区的内部模块，去掉它独立的外墙和屋顶；旧址 `x=-46…-10, z=13…35.5` 迁出后改绿化和活动草坪预留，不建永久设施，也不动 DR 广场。** 本卡取代 `O9-campus-migration.md`。

**允许修改：** `office-layout.js`（旧仓库常量的迁移，**逐项列出并说明测试同步**）、`env.js`（只扩展既有特例，**保持随机数消费顺序不变**）、`warehouse-shell.js`（拆出可复用内部模块，**保留碰撞命名、薄件偏移规则、门牌材质**）、`dr-campus-*.js`（并入 W1 的登记）、`app.js`（接线 ≤ 20 行）、相关测试与 `docs\dr-warehouse-checks.mjs` 的同步（**不得放宽**）；README 一节。备份全部将改文件到 `office3d-backup-s2-9`。

## 要做的事
1. **内部模块化**：把旧 `warehouse-shell.js` 的 28×12 m 外壳拆为「内部货架 / 门牌 / 月台语言」模块，放入 `highRack` 内建议位 `x=-144…-116, z=-8…4`（以 S2-3 常量为准），**去掉独立外墙与屋顶**；`warehouse-entrance` 拾取区与 `warehouse-*` 命名保留（为后续仓库面板 A6 保留接线点）。
2. **常量迁移**：`WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / LOGISTICS_GATE_ZONE / WAREHOUSE_ITEMS / WAREHOUSE_FOCUS` 由新园区常量驱动（或保留导出名但指向新位置，**说明选择并同步所有引用与测试**）；`MINI_BOUNDS`、相机焦点同步；**`PLAZA`、O1 的 `LAYOUT_V2`、前厅、等候座位一律不动**。
3. **旧址处置**：`x=-46…-10, z=13…35.5`（与 O1 办公区 `z≤16` 的重叠部分由办公区外壳覆盖，**不得出现两套地面共面 z-fighting**）改为绿化 / 活动草坪预留：草地 + 少量树（**沿用 `env.js` 的特例机制，不改随机序列**），**不建永久设施**；旧环境铺装中仓库相关的特例（被移除的三棵棕榈等）恢复或重排，**列清单**并用 `env-snapshot-compare` 核对「仅出现预期差异」。
4. **环境扩展**：园区范围的铺装 / 树 / 路灯 / 远景处理按 S2-4 汇报的「被隐藏对象清单」正式迁移（`?campus=1` 的临时隐藏改为 `env.js` 内的确定性特例），随机数序列不变。
5. **回归**：25 人（含 layout1 与 layout2）、小橘、前厅与广场消费路线对**旧仓库位置不再有碰撞体**（旧路线检查可简化），对新园区**不新增目的地**；T16b 200 种子仍全过；`dr-warehouse-checks` 与新 `dr-campus-checks` 全 `PASS`；成对 calls 不超过 S2-0c 总预算（**高档 ≤ +12 calls / ≤ 48k 三角形，低档 ≤ +5 / ≤ 15k**，与 S2-4…S2-8 累计一致）。

## 测试与验收
- 仓库布局 / 外壳 / 检查脚本同步更新且全过；`env-snapshot-compare` 仅预期差异（逐项列出）；旧址无遗留碰撞体；薄件偏移规则回归；默认页面（无 `?campus=1`）下，**旧址已是草坪、旧仓库不再出现**——**这是对默认布局的有意变更，逐项说明并等董事会验收**。
- 浏览器：广场、办公区、旧址草坪、园区、跨路视角各一张；小地图完整；控制台 0 错误；`?campus=1` 与默认两种状态都验证。
- 汇报「做到 / 没做到 / 未验证」，与磁盘一致；**逐行列出 `app.js` 与 `office-layout.js` 的改动**。**不要自己重启服务。**
