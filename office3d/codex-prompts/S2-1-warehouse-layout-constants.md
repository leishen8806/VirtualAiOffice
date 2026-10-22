# S2-1-warehouse-layout-constants：DR 仓库的布局常量与几何测试 + 小地图边界 + 清除冲突棕榈树（**不改场景、不改 `app.js`**）

**建议执行者：Codex 5.6 Sol（新会话）。排期：必须在 S1-6（前厅集成与性能验收）验收通过之后再开工**——本任务会改小地图范围和环境棕榈树，会干扰 S1-6 正在取的基线（calls、小地图、截图）。**也不要与 T10b 同时改同一批文件**（T10b 改 `quality.js / merge.js / app.js` 的画质部分，本任务不碰它们，文件不重叠，但两个任务都做完前不要做 S2-2）。先读：`_common.md`、`S1-1-foyer-layout-constants.md`（**同类任务，沿用它的做法**）、**规格 = `docs/dr-warehouse-plan.md`（S2-0 + S2-0b 修订版）全文，尤其第 1、2、3、7、8、10 节**、`docs/dr-warehouse-checks.mjs`（里面已有一套 `WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / PROPOSED_MINI_BOUNDS / WAREHOUSE_FOCUS / WAREHOUSE_ITEMS`，**这就是要落进代码的数据**）、知识库 `E:\VirtualAIOffice\knowledge\项目\前厅与小镇规划.md` 第二十节及「（补）」（**董事会决定：允许扩大广场铺装与清除棕榈树；前提是仓库面积完整，主体不得小于 28×12 米 = 336 ㎡**）、`office-layout.js`、`env.js`（第 259–261 行棕榈树生成）、`tests/foyer-layout.test.mjs`、`tests/office-layout.test.mjs`。

**例外规则：**
- **允许修改**：`office-layout.js`（**只新增**导出，以及把 `MINI_BOUNDS` 按第 3 节扩展；**不改任何已有导出的值**，`PLAZA / ENVELOPE / ENTRANCE / FOYER_* / WAITING_* / RECEPTION / CORRIDORS / CORRIDOR_X` 等一概不动）、`env.js`（**只限**棕榈树「生成后移除」的条件，见第 4 节；**不得改变任何随机数的消耗顺序**）、`docs/dr-warehouse-checks.mjs`（改成**从 `office-layout.js` 导入数据**，不再自带第二份坐标）、`docs/dr-warehouse-plan.md`（只在末尾追加「S2-1 实施记录」，不改原文）、新增 `tests/warehouse-layout.test.mjs`、`tests/warehouse-env.test.mjs`、`README.md`。
- **允许对既有测试做最小调整的只有一处**：`tests/foyer-layout.test.mjs`（或其它）里断言 `MINI_BOUNDS.z1 === PLAZA.z1 + 2` 的用例——董事会决定使小地图下界外扩，该断言必须改成新口径；**逐条列出你改了哪几条断言和理由，不得放宽其它任何断言**。
- **不要改**：`app.js`、`ui.js`、`index.html`、`quality.js`、`merge.js`、`director.js`、`foyer-*.js`、`cat-play.js`、`fun.js`、`server.mjs`、所有业务模块、`tenancy\`、`town*`。**不注册任何碰撞、不新增任何场景对象**（那是 S2-2 以后）。
- 备份将改的文件到 `office3d-backup-s2-1`（办公室目录没有 Git）。纯前端数据，**不需要重启服务**；**不得向 Paperclip 发任何请求**，不联网、不装依赖。

## 本任务的边界
- **只落地「数据 + 检查」**：交付后页面上**没有任何视觉变化**，唯二例外是 ① 小地图画布范围变大（地图边框外扩，广场西南多出一片空地）② 西南角一棵棕榈树消失（`(-46,30)`）。**必须在浏览器里逐一确认这两处之外零差异**（见验收）。
- **不新增 `REGION_FOCUS.warehouse` / `WALL_SPOTS`**：仓库这个时候还没有建筑，加了会让区域按钮和搜索跳到一块空地；这些放到 **S2-6**。`WAREHOUSE_FOCUS` 只作为导出常量存在，不接线。
- **不改 `PLAZA`**（`x -10…14, z 16…30`）及其中央圆、摊位、咖啡车、`FOYER_QUEUES`、`WAITING_SEATS`：「扩大广场」只落实为**园区铺装边界** `CAMPUS_PAVING`（`x -46…-10, z 13…35.5`，覆盖仓库、月台、泊位、物流入口和两条 4 米通道）。**铺装本身不在本任务绘制**（`env.js` 现有铺装已覆盖 `x -56…56, z -40…48`，S2-2 再决定是否另画分区标识）。

## 要做的事
### 1. `office-layout.js`：新增导出（全部 0.5 的倍数，数值严格取自规划，**不要自己编**）
`WAREHOUSE = { x0:-42, x1:-14, z0:17, z1:29 }`、`DOCK = { x0:-42, x1:-14, z0:29, z1:31.5 }`、`PARKING = { x0:-42, x1:-14, z0:31.5, z1:35.5 }`、`WEST_WALK`（广场西侧人行道，`x -14…-10, z 16…35.5`）、`SERVICE_PASSAGE`（仓库—前厅服务通道，`x -44…-10, z 13…17`）、`CAMPUS_PAVING = { x0:-46, x1:-10, z0:13, z1:35.5 }`、`LOGISTICS_GATE_ZONE`（`x -46…-44, z 30…35`）、`WAREHOUSE_FOCUS = { label:'DR 仓库', t:[-28,0,23], r:26 }`、`WAREHOUSE_ITEMS`（**22 项**，字段 `id / name / x0 x1 z0 z1 / center / size / yaw / blocksFloor / personAccessible`，**`personAccessible` 全为 `false`**，id 与规划第 3 节一致）。**`Object.freeze` 它们**。**面积断言要写进代码注释**：`WAREHOUSE` 面积 = 336 ㎡（董事会决定：不得压缩）。
### 2. 间距与不冲突（常量层面的不变量，由测试固定）
- 仓库东墙到广场西缘 `PLAZA.x0 - WAREHOUSE.x1 = 4`；仓库北墙到前厅南墙 `WAREHOUSE.z0 - ENVELOPE.z1 = 4`；`WEST_WALK` 宽 4、`SERVICE_PASSAGE` 深 4，**全程无 `blocksFloor` 摆件**（`WAREHOUSE_ITEMS` 里只有 `west_green` 这类明确位于通道之外的才允许 `blocksFloor:true`，逐项核对）；
- 22 项互不重叠（边相接允许）、**全部落在 `CAMPUS_PAVING` 内**、**不与** `PLAZA`、`ENVELOPE`、`FOYER_ITEMS`（27 项）、`FOYER_QUEUES`（42 个排队点）、`WAITING_SEATS`（4 个）重叠；
- **人物与小猫路径零相交**：对 25 位同事 × 全部消费 / 等候目标的 `foyerTrip / plazaTrip`（沿用现有函数，只读）与 `cat-play.js` 的 `catRoute` 公共路线，逐段检查不进入 `WAREHOUSE / DOCK / PARKING / WEST_WALK(外侧) / SERVICE_PASSAGE` 以外的新禁区（规划里已有同样的检查，**搬进测试**）；`corridorPath` 仍在仓库以北。
### 3. 小地图边界
`MINI_BOUNDS` 改为：`x0 = CAMPUS_PAVING.x0 - 2 (= -48)`、`z1 = CAMPUS_PAVING.z1 + 2 (= 37.5)`，`x1`、`z0` **保持现值**。推导式写在常量上（用 `CAMPUS_PAVING` 计算，不要写死字面量）。**先读 `app.js` 的 `miniView / miniXY / drawMini` 确认它是按 `MINI_BOUNDS` 等比缩放并居中的（S1-1 已改成等比）**，在浏览器里实际看小地图：整体不变形、点击跳转坐标换算正确（点前厅、点广场、点新增的西南空地各一次）；**如果显示或点击有问题，停下来汇报，不要自己改 `app.js`**。
### 4. `env.js`：棕榈树
规划已用 `app.js` 的种子复现 `env.js` 的随机序列：扩大后的园区铺装内有 3 个名义点 `(-28,18)`、`(-46,30)`、`(-12,30)`（均带固定随机偏移），其中 `(-28,18)` 与 `(-12,30)` **已被现有特例移除**，只需**新增移除 `(-46,30)`**。做法：只把现有的移除条件扩展为包含 `(x === -46 && z === 30)`，**仍然先调用 `palm(...)` 再 `scene.remove(tree)`**，保持 `rnd()` 的消耗次数与顺序完全不变，使其它树、云、远景糖棕的位置**不变**。
**证明不变（必须做）**：改动**之前**，在浏览器里（当前页面、当前 `env.js`）遍历 `scene` 里属于环境的对象（树 / 棕榈 / 云 / 路灯 / 城市），导出 `[name 或 uuid 顺序号, type, 世界坐标]` 的快照，存到 `office3d-backup-s2-1\env-before.json`；改动之后同法再导出 `env-after.json`；**逐对象比较，除 `(-46,30)` 那棵之外必须逐位相同**（浮点用 1e-9 容差）。把比较脚本放在 `tools\env-snapshot-compare.mjs`（可选，纯 Node，不依赖浏览器；浏览器端导出用页面里粘贴的 snippet，放进 `docs/`）。
### 5. 检查脚本改为单一事实来源
`docs/dr-warehouse-checks.mjs` 改成**从 `office-layout.js` 导入**上面的常量（删除脚本里自带的那份坐标），输出必须与现在**完全一致**（`SUMMARY items=22 personSegments=18250 catSegments=43 conflicts=0 result=PASS`），两个变异测试（`DR_WAREHOUSE_CHECK_MUTATE=shallow|overlap`）仍各能 `FAIL`。

## 测试
- **`tests/warehouse-layout.test.mjs`（用 `office-layout.js` 的真实导出，不复制数字）**：`WAREHOUSE` 面积 = 336 且宽 ≥ 28、深 ≥ 12；`DOCK` 面积 ≥ 70、`PARKING` 面积 ≥ 112；全部坐标是 0.5 的倍数；22 项的 id 集合与规划第 3 节一致；字段完整；`personAccessible` 全 `false`；互不重叠、全在 `CAMPUS_PAVING` 内；与 `PLAZA / ENVELOPE / FOYER_ITEMS / FOYER_QUEUES / WAITING_SEATS` 无重叠；间距 4 / 4 / 4 / 4（东墙、北墙、人行道宽、服务通道深）；路径逐段不相交（25 位同事 × 全部目标 + 猫的公共路线）；`MINI_BOUNDS` 完整包含 `CAMPUS_PAVING` 且外延 2 米、`x1 / z0` 未变；**两类变异**：① `WAREHOUSE.z1` 改成 28.5 时面积断言必须失败 ② 把某摆件挪进 `PLAZA` 时重叠断言必须失败（用在测试里构造副本数据的方式，**不修改真实常量**）；既有导出（`PLAZA / ENVELOPE / ENTRANCE / RECEPTION / FOYER_* / WAITING_*`）与改动前逐项相等（用快照或备份对比）。
- **`tests/warehouse-env.test.mjs`**：静态检查 `env.js`：棕榈树移除条件包含 `(-46, 30)` 与既有两处；**`palm(` 调用次数与 `rnd()` 调用点数量不变**（与备份比较）；`env.js` 没有新增任何 `Math.random(` / `fetch(` / `innerHTML`。
- 既有全部测试不得放宽（**当前基线以 `node --test tests/*.test.mjs` 实际为准**，M5-2 / M2-A 在途的测试若有失败与本任务无关，需在汇报里写明并给出失败测试名）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs`（本任务相关测试全过；外部在途失败要单独说明）；`node --input-type=module --check < office-layout.js`、`< env.js`；`node docs/dr-warehouse-checks.mjs` 全 PASS 且两个变异测试各 `FAIL`。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5，**页面保持聚焦**）：① 小地图截图：整体不变形，西南多出一片空地，点击前厅 / 广场 / 西南空地跳转位置正确；② 西南角那棵棕榈树消失，**其它环境（树、云、远景、路灯、城市）与改动前逐位一致**（`env-before / env-after` 比较结果贴出）；③ **场景其它部分零视觉变化**（前厅、广场、办公室各一张前后对照截图）；④ 搜索「仓库」**不应**出现新区域（因为没有加 `REGION_FOCUS.warehouse`），区域按钮数量不变；⑤ 控制台 0 错误。
- 汇报（按 `_common.md` §5）：每条做到没有；没做到的原因；**改了哪几条既有断言及理由**；`env.js` 的逐行差异（应只有移除条件一处）；`env-before / after` 比较结论；**未验证项如实写**；确认**没有改 `app.js`、没有新增场景对象、没有注册碰撞**。
- **不要自己结束或重启进程；不改 `server.mjs`。**
