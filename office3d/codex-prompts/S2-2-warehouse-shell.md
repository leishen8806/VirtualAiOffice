# S2-2-warehouse-shell：DR 仓库建筑外壳、屋顶、门洞、月台与静态碰撞（约 1–1.5 小时）

**执行者：Codex（新会话）。小镇线 · 场景。改 `app.js`（同一时间只有这一个任务改它）。** **前置：S2-1 已验收通过**（`office-layout.js` 里有 `WAREHOUSE / DOCK / PARKING / WEST_WALK / SERVICE_PASSAGE / CAMPUS_PAVING / WAREHOUSE_ITEMS` 等常量；若不存在先停下汇报）。先读：`_common.md`、**`_lane-town.md`（隔离契约与热点所有权，本任务逐条遵守）**、`docs\dr-warehouse-plan.md`（S2-0b 修订版，**第 2、3、7 节**）、`docs\foyer-plaza-plan.md` 的渲染预算思路、`app.js` 里前厅 / 广场搭建部分（`foyer-<id>` 命名、`mergeStatic`、`userData.dynamic` 约定）、`quality.js` / `merge.js`（**只读**；T10b 正在改画质档启动，**别碰它们，但你的静态件必须能被它们正确合并 / 实例化**）。

**董事会 2026-10-21 决定（重要）：DR 仓库的产品角色是「用户物品库存 + 个人空间布置入口」。本任务只做建筑的外壳与入口，不做库存功能。** 商品供给指数面板**不在本任务**（降级为可选后续）。

**允许修改：** `app.js`（**新建筑写成独立模块 `warehouse-shell.js`，`app.js` 只留最小接线 ≤ 30 行并逐行列出**）、新增 `warehouse-shell.js`、`tests\warehouse-shell.test.mjs`、`README.md`。**不要改**：`server.mjs`、`ui.js`、`index.html`、`quality.js`、`merge.js`、`director.js`、`office-layout.js`、`env.js`、所有业务模块、`town\`。备份 `app.js` 到 `office3d-backup-s2-2`。**不需要重启服务**（纯前端）；**不得向 Paperclip 发任何请求。**

## 要做的事（几何严格取自 `office-layout.js` 常量，不写第二份数字）
1. **建筑外壳**：主体 `WAREHOUSE`（`x -42…-14, z 17…29`），墙高 5.5 m、墙厚 0.25 m、双坡屋顶（檐口 5.5 m、屋脊 7.0 m，**屋脊沿东西向**）；**东墙人行门**（`x=-14, z 24.5…26.5`，**仅视觉门、锁闭、不进入人物导航**）；**南墙三樘货门**（`x -40…-36`、`-31…-27`、`-22…-18`，高 4.2 m，**门洞用「卷帘门」平面 + 门框表现，不要做成真正的洞让人能走进去**）；**月台** `DOCK`（顶面高 0.8 m，含侧面踏步 / 护栏的简化表现）；**南侧停车区地面标线** `PARKING`（两个卡车泊位 + 一个作业车泊位的地面标线，**不放车辆**，车辆属于后续动画任务）；**西侧物流入口**门架 `LOGISTICS_GATE_ZONE`（门架 + 导视牌占位，不画连到公路的路）；**门牌** `warehouse_sign`（`DR 仓库`，Canvas 贴图，静态）。
2. **材质与色调**：沿用办公室的写实偏冷调与已有材质风格（先看 `app.js` 里前厅 / 广场的材质写法，**复用已有材质与贴图，不引入新外部资源**）；屋顶**不透明**（透明会增加绘制成本），屋顶对相机遮挡的实测留给 S2-7，但本任务要在汇报里给出**广场机位与前厅机位下屋顶是否遮挡的截图**。
3. **命名与可点击入口**：外壳各部件命名 `warehouse-<part>`（如 `warehouse-body`、`warehouse-roof`、`warehouse-dock`、`warehouse-door-east`、`warehouse-sign`）；**东墙人行门前放一个不可见的拾取区 `warehouse-entrance`**（`userData.warehouseEntrance = true`，供后续 A6 绑定「打开仓库面板」，**本任务只创建它，点击不做任何事**）。
4. **静态碰撞**：用现有 `furnitureCollision.add(group, name)` 注册**墙体、月台、门框、西侧绿化**（`west_green` 来自 `WAREHOUSE_ITEMS`）；**不得注册**：屋顶、卷帘门平面、地面标线、门牌、拾取区。**人物不能走进建筑内部**；`WEST_WALK`（广场西侧人行道）与 `SERVICE_PASSAGE` 保持净空（无任何碰撞体）。
5. **渲染预算（硬约束）**：同机位同画质、开启与改动前的**成对测量**：**DR 广场高档新增 ≤ +10 calls、低档 ≤ +4 calls（目标；硬上限 +15 / +6）、不新增任何光源**；做法：同材质静态网格 `mergeStatic`，重复件（护栏、踏步）用 `InstancedMesh`；**所有静态件不得标 `userData.dynamic`**（否则无法被画质档合并）；低档下不需要降级内容，但**不得增加三角形 > 2,000**。测量口径务必避开已知陷阱：页面聚焦、`?q=low|high&perf=1` 干净加载、在页面渲染循环里读 `renderer.info`（**不要手动 `render()`**）、等 6 秒以上并确认 `quality.summary()` 已有变体。
6. **不影响现有路径**：对 25 位同事 × 全部消费 / 等候目标的 `foyerTrip / plazaTrip` 路线与小橘公共路线，**逐段确认不进入新碰撞体**（复用 `docs\dr-warehouse-checks.mjs` 的路径检查思路，可直接调用它）；**T16 的 200 种子压力测试仍全绿**。

## 测试（`tests/warehouse-shell.test.mjs`；把可测逻辑拆成纯数据函数 `warehouseShellSpec()`，不依赖 THREE / DOM）
- `warehouseShellSpec()` 由 `office-layout.js` 常量生成部件清单（名称、外框、是否注册碰撞、是否 `dynamic`）：断言面积 ≥ 336 ㎡、部件外框全部落在 `CAMPUS_PAVING` 内、**不与 `PLAZA / ENVELOPE / FOYER_ITEMS / WAITING_SEATS` 重叠**、`WEST_WALK` 与 `SERVICE_PASSAGE` 内**无碰撞部件**、人行门 / 货门位置与规划一致、没有任何部件标 `dynamic`。
- 静态检查：`warehouse-shell.js` 不含 `innerHTML / eval / fetch / Math.random / performance.now`；`app.js` 新增行 ≤ 30 并无上述词；无 `buy / price / balance / wallet`。
- 既有测试（含 T16 压力、`foyer-*`、`office-layout`、`warehouse-layout`、`pedestrian-*`）**全过，不得放宽**。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check < app.js`、`< warehouse-shell.js`；`node docs/dr-warehouse-checks.mjs` 仍 `PASS`。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5，页面保持聚焦）：广场机位、前厅机位、仓库正面 / 南侧月台 / 东墙人行门近景各一张截图；**成对 calls 数据**（高 / 低）；**25 位同事走一趟上班路线 + 小橘走一圈，0 穿墙**；控制台 0 错误；小地图完整显示新建筑。
- 汇报「做到 / 没做到 / 未验证」且与磁盘一致：**`app.js` 的接线行逐行列出**；成对测量的口径说明；屋顶遮挡截图；**未验证项如实写**（白天光照、低端设备）。**不要自己重启服务。**
