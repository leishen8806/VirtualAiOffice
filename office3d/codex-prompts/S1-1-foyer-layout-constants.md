# S1-1-foyer-layout-constants：前厅与 DR 广场的布局常量、可达点、排队点和纯路径函数（**只加数据和纯函数，不动场景**）

**建议执行者：Codex 5.6 Sol（需要空间推理和几何检查）。** 先读 `_common.md`，再读 `docs/foyer-plaza-plan.md`（T19 的规划，**这就是本任务的规格**：第 1 节坐标表、1.3 排队点、2.3 新旧对照、3.1 路径合同），以及 `docs/foyer-plaza-checks.mjs`。**不要与 T21（小橘）、T17b 以外改 `app.js` / `office-layout.js` 的任务同时进行；T21 先完成。**

**本任务的例外规则：** 允许修改 `office-layout.js`、`docs/foyer-plaza-checks.mjs`（改成从 `office-layout.js` 导入数据，见第 3 节）、新增 `tests/foyer-layout.test.mjs`、`README.md`。**不要改** `app.js`（**唯一例外**：第 4 节的小地图适配，若确有必要，改动 ≤ 5 行并在汇报里逐行列出）、`index.html`、`ui.js`、`director.js`、`server.mjs`、所有业务模块、渲染材质 / 光源。纯前端数据，不需要重启服务。备份到 `office3d-backup-s1-1`（办公室目录没有 Git）。

## 与规划有一处**刻意的偏差**（请照这里做，并在汇报里确认）
规划 2.3 写的是「`RECEPTION` 改成东侧边界、`bypassX` 和 `corridorPath()` 的绕行分支删除」。但**现在场景里的旧接待台还在主走道里**（`app.js` 用 `RECEPTION.x / z / width` 摆放前台模型并注册碰撞，要到 S1-3 才会搬走）。如果 S1-1 先把 `RECEPTION` 改了或把绕行分支删了：旧前台模型会被甩到新位置，或人物会径直穿过还摆在走道里的旧前台。所以：
- **`RECEPTION` 和 `corridorPath()` 的绕行分支在本任务里原样保留**（加注释：`// S1-3 搬走旧前台时一并删除`）；
- **新增** `FOYER_RECEPTION`（东侧接待台的新边界）等全部新常量，**只是新增，不改既有导出的值**；
- 旧前台的删除（`RECEPTION`、`bypassX`、绕行分支、`tests/office-layout.test.mjs` 里的「必须绕行」断言）作为 **S1-3 的一部分**，我会写进 S1-3 的提示词。

## 要做的事
1. **新增常量（单一事实来源，全部是 0.5 的倍数，数值严格取自规划）**：
   - `FOYER_ZONES`：规划 1.1 的 12 个分区（`id / name / x0 x1 z0 z1 / center / 说明`）；
   - `FOYER_ITEMS`：规划 1.2 的 **27 个摆件**（`id / zone / name / x0 x1 z0 z1 / center / size / facing / blocksFloor`，其中壁挂公告板标 `blocksFloor: false`），朝向用世界坐标枚举 `N / S / E / W / ALL / NONE`（北 `-z`、南 `+z`、西 `-x`、东 `+x`）；
   - `FOYER_TARGETS`：27 个具名**可达点**（`itemId → {x,z}`，规划 1.2 的「可达点」列）；
   - `FOYER_QUEUES`：规划 1.3 的 **7 条六人队列**（`A1`、`A2`、`desk`（接待台）、`B0`、`B1`、`B2`、`B3`，每条 6 个点，**点序即先后顺序**，间距 ≥ 1 米）；
   - `FOYER_RECEPTION`：东侧接待台边界 `{x0:8.5,x1:14.5,z0:8.5,z1:9.5}`、`CENTRAL_CIRCLE = {cx:2, cz:23, r:4}`、`MAIN_AISLE = {x0:0, x1:4}`（前厅和广场共用的 4 米无家具通道）。
   - 规划里**没有**写清楚的数值（例如每个分区的 `center` 如果表里没给）按规则从边界推导，**不要自己编**；推导不出的在汇报里列出来问。
2. **`REGION_FOCUS` 增加 3 个焦点**：`foyer_A1`（咖啡吧）、`foyer_A2`（自助零食）、`foyer_desk`（接待与等候），`t` 取分区中心，`r` 取 12–14，`label` 取中文名。`ui.js` 里的搜索和区域列表是自动从 `REGION_FOCUS` 读的，**不要改 `ui.js`**；确认新增三项会自动出现在搜索里（写进汇报），并检查**不影响已有的区域按钮和 `wallGo` 的 key**（`tests/office-layout.test.mjs` 对 `REGION_FOCUS` 的断言要么原样通过，要么只做「增加三项」的最小调整并写明）。
3. **新增纯路径函数**（规划 3.1，复用已有函数，**不得改动它们**）：
   - `foyerTrip(home, targetId)`：`officeExit(home) → corridorPath(…, {x:2,z:12}) → 目标的排队点 / 可达点`；
   - `plazaTrip(home, targetId)`：先到 `(2,12)`，再 `(2,13.5) → (2,16.5)`（沿用 `ENTRANCE.gate`）进入广场，最后沿目标侧的队列进入；
   - `consumerQueue(targetId, occupied)`：从规划的固定六点里选**最前的空位**；**满员返回 `null`**（不临时生成第七个点）；
   - `foyerReturnTrip(...)`：返回路径 = 去程的反向，最后回到 `officeExit(home)` 的门外点再进房间（和 `loungeTrip` 的返回风格一致）。
   这些函数**只返回路点数组**，不访问 `THREE`、不访问 DOM、不读 `performance.now()`。
4. **小地图边界**：`MINI_BOUNDS.z1` 从 15 改成 `PLAZA.z1 + 2`（= 32）。小地图（`app.js` 的 `drawMini` / `miniXY`）是按 `MINI_BOUNDS` 映射的：**先读代码确认**映射是等比缩放还是拉伸，**在浏览器里实际看一眼**小地图（画布大小固定，z 范围变大后可能变扁 / 变形、或点击跳转的坐标换算变了）。如果显示或点击换算有问题，允许改 `app.js` 里**与小地图映射直接相关的最多 5 行**（例如改成按长宽比等比缩放并居中），**逐行列在汇报里**；没有问题就不要碰 `app.js`。
5. **`docs/foyer-plaza-checks.mjs` 改成从 `office-layout.js` 导入数据**（不再写死 27 个摆件的数字），这样规划脚本和代码是同一个事实来源；脚本输出必须与现在完全一致（`SUMMARY items=27 targets=27 queues=7 queueSlots=42 result=PASS`）。
6. **不改动的东西**：`RECEPTION`、`corridorPath`、`ENTRANCE`、`CORRIDOR_X`、`LOUNGE_*`、`PLAZA`、`officeExit`、`officeTrip`、`meetingTrip`、`loungeTrip`、座位、房间、门、`BOSS` 的任何值；`app.js` 的场景。

## 测试（`tests/foyer-layout.test.mjs`，**用 `office-layout.js` 里的真实数据**，不要复制数字）
- 全部坐标、尺寸、可达点、队列点是 0.5 的倍数；27 个摆件互不重叠（边相接允许）；`MAIN_AISLE` 和门洞内无 `blocksFloor` 摆件；`CENTRAL_CIRCLE` 内无摆件；每个摆件恰有一个可达点且落在可走区域（不在任何摆件内、不在房间内部、不穿墙）；
- 队列：每条 6 个点、点序固定、相邻间距 ≥ 1、与 `PERSON_GAP` 比较有余量、不占 `MAIN_AISLE` / 门洞 / 中央圆；
- `consumerQueue`：空队列取第 1 个点、占用后取下一个、占满返回 `null`、占用集合里有无关点不影响；
- `foyerTrip` / `plazaTrip` / `foyerReturnTrip`：对 **25 位同事的 home × 全部 7 个消费目标** 生成路径，逐段检查**不穿房间墙（门洞除外）、不穿 `blocksFloor` 摆件、不进中央圆、不进 `MAIN_AISLE` 以外的禁区**；去程终点是排队点或可达点，返回路径回到 `officeExit(home)` 的门外点；
- 既有行为不变：`RECEPTION` / `corridorPath` / `loungeTrip` 的现有测试原样通过；`REGION_FOCUS` 既有键不变、新增 3 键；`MINI_BOUNDS.z1 === PLAZA.z1 + 2`；
- 规划脚本 `node docs/foyer-plaza-checks.mjs` 仍然全 PASS，并且**对它做一次变异测试**（把某个摆件挪成与另一个重叠）能报 FAIL，汇报里贴结果。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（不得放宽已有断言，**特别是 T16 的 200 个种子压力测试和 `office-layout` / 行人动线测试**）；`node --input-type=module --check < office-layout.js`；如改了 `app.js` 也要检查。
- 浏览器实测（`http://office.localhost:3200/`，Ctrl+F5）：小地图显示正常（截图），点击小地图跳转位置正确（点前厅、点广场各一次），搜索框输入「咖啡」「接待」能找到新增的区域并跳转，其余区域按钮和 `wallGo` 各 key 不受影响，控制台 0 错误；**场景里没有任何视觉变化**（本任务不动场景）。
- 汇报：每条做到没有；没做到的原因；**规划里数值不全而你不得不推导的地方**；偏差确认（旧前台原样保留）；`app.js` 是否改动及逐行清单。
