# S1-4-consumer-paths-queues：消费点的去程 / 队列 / 返回——纯函数与排队状态机（不接 app.js，不触发任何真实消费）

**建议执行者：Codex 5.6 Sol 或 Trae（边界清晰的纯逻辑 + 一个最小的 director 入口）；排在 S1-1 之后，可与 S1-3 并行（文件不重叠）。** 先读 `_common.md`，再读 `docs/foyer-plaza-plan.md` 第 1.2、1.3、3.1、3.2、7 节，`office-layout.js` 里 S1-1 新增的 `FOYER_TARGETS / FOYER_QUEUES / consumerQueue / foyerTrip / plazaTrip / foyerReturnTrip`（**不得改动它们**），`director.js` 的 `travel()`（约 398 行）与 T16c 的让路 / 看门狗机制，`tests/pedestrian-stress.test.mjs` 的写法。

**例外规则：** 允许新增 `foyer-paths.js`、`tests/foyer-paths.test.mjs`；允许修改 `director.js`（**只限第 3 节那一个最小入口**，不得改让路 / 看门狗 / 碰撞算法）、`README.md`。**不要改**：`app.js`（S1-3 正在改，S1-5 才接线）、`office-layout.js`、`ui.js`、`index.html`、`server.mjs`、`pedestrian-traffic.js`、所有业务模块、`town\`、Telegram / 密钥。纯前端逻辑，不需要重启服务。备份 `director.js` 到 `office3d-backup-s1-4`（办公室目录没有 Git）。**验证时不得向 Paperclip 发任何写请求**，不新增依赖、不联网。

## 本任务的边界（很重要）
- **只提供"怎么走、怎么排队"的能力，不决定"谁去、什么时候去"**（触发条件、午休时段、概率属于 S1-5 / 后续经济任务）。本任务交付后 **`app.js` 里没有任何调用**，场景里**没有任何人物会自己走向咖啡吧**。
- **不涉及钱**：没有余额、价格、扣款、「购买成功」、`DR`、`cion` 这些概念。函数和变量命名用 `visit / queue / dwell / consumer`，**不得出现 `buy / pay / purchase / wallet / balance / price`**（静态测试固定这一点）。
- **只读 S1-1 的数据，不写第二份坐标**：所有点位从 `office-layout.js` 导入。

## 要做的事
### 1. `foyer-paths.js`（纯函数 + 小状态机，不引用 THREE / DOM / `performance.now()` / `Math.random()`；时间和随机性都由调用方传入，便于确定性测试）
- **`createQueueBoard({ queues = FOYER_QUEUES })`**：为每个消费点（`A1 / A2 / desk / B0 / B1 / B2 / B3`）维护 6 个槽位。
  - `join(agentId, targetId)` → `{ ok:true, slot:0..5, point:{x,z} }` 或 `{ ok:false, reason:'full' | 'unknown_target' | 'already_queued' }`。**满员（6 人）不得临时生成第七个点**；同一人不能同时在两个队里；`targetId` 不在清单里返回 `unknown_target`，**不抛异常**。
  - `leave(agentId)`：释放槽位；**队列向前压缩**（后面的人每人前移一格，返回 `advance: [{ agentId, from, to, point }]` 供调用方生成"向前挪"的短路径）。
  - `head(targetId)`：队首（槽位 0）是谁；`occupancy(targetId)`；`snapshot()`（可序列化，用于测试和调试；不含任何个人数据以外的内容）。
  - 所有操作 **幂等且不丢人**：重复 `leave` 不报错；`join` 后 `leave` 再 `join` 回到队尾。
- **`visitPlan({ home, targetId, board, agentId })`**：生成一次完整的往返计划，返回
  `{ ok:true, targetId, go: [路点…], stand: {x,z}, back: [路点…], slot }` 或 `{ ok:false, reason }`。
  - `go`：`officeExit(home) → corridorPath → …` 复用 S1-1 的 `foyerTrip / plazaTrip`（**按目标在前厅还是广场选对应函数**），**终点改为队列里分配到的槽位点**（槽位 0 = 站位点，后面的人在槽位上等待，轮到后再前移）；
  - `back`：去程的反向，**最后回到 `officeExit(home)` 的门外点再进房间**（与 `loungeTrip` 的返回风格一致），**内部使用 `foyerReturnTrip`**；
  - 已满员时返回 `{ ok:false, reason:'full' }`，**不生成任何路点**；
  - 路点相邻重复点要去重；所有点都是有限数字。
- **`dwellMs(targetId, rng)`**：在站位点停留时长（咖啡吧 / 零食 / 摊位 90–240 秒，接待台 / 等候 30–90 秒，长椅 / 露天桌 120–360 秒；常量写在文件顶部，`rng` 是调用方给的 `() => [0,1)`）；纯函数，边界值（rng=0、rng→1）都要有测试。
- 导出一个常量表 `CONSUMER_TARGETS`：每个消费点的 `{ id, region:'foyer'|'plaza', kind:'stand'|'sit', dwell:[min,max] }`，**数据来自 `FOYER_TARGETS / FOYER_QUEUES` 的键，不重复写坐标**。

### 2. 与 T16 解死锁的关系（只验证，不改算法）
排队的人在队列里**站着不动**时，不能被 T16 的看门狗当成"卡住"而触发 `行动超时`，也不能阻挡别人通过主通道。先**读 `director.js` / `pedestrian-traffic.js` 弄清楚看门狗对"等待中"的处理**，在汇报里写明：现有机制下排队等待会不会被误判；**如果会，才允许在 `director.js` 里做最小修改**（第 3 节的入口里让"排队 / 停留"状态不被看门狗计时；**仍不得改让路和碰撞算法**），并加测试证明：停留 5 分钟的人**不**被看门狗判超时，而路径上真正卡住的人**仍然**会被判超时（原有 T16 测试一个字不改，全过）。

### 3. `director.js` 的最小入口（仅此一处，无 app.js 调用）
- 新增 `visitConsumer(v, plan, { onArrive, onDone })`（或同等命名）：用现有 `travel()` 走 `plan.go` 到队列槽位；到达站位点后停留（由调用方传入的时长），再用 `plan.back` 返回工位；**中途被打断**（上班时间结束 / 被召回 / 有任务 `waits`）时能**正常取消并回工位**，并且**无论哪种结束方式都调用 `board.leave`**（不能泄漏槽位）。
- **不重复实现走路**：复用 `travel()`；若 `travel()` 不能满足"在队列里等候后再前移"，允许在入口里用多段 `travel()` 串联，**不改 `travel()` 本身的行为**。
- 返回值与取消方法清楚写在 JSDoc 里；不触碰 `v.lounging` 等休息区状态（两套互不干扰；**若某人正在休息区或会议中，`visitConsumer` 返回 `false` 不执行**）。

## 测试（`tests/foyer-paths.test.mjs`；仿 `tests/pedestrian-stress.test.mjs` 的真实碰撞 / 简易人物模拟）
1. **队列状态机**：空队列 `join` 得槽位 0；依次 6 人得槽位 0–5；第 7 人 `full`；中间一人 `leave` 后后面的人压缩前移且 `advance` 正确；重复 `leave` / `join` 幂等；`already_queued`；`unknown_target`；7 个点各自独立。
2. **路径**：**25 位同事的 home × 7 个消费点**生成 `visitPlan`：`go` 终点是槽位点、`back` 回到 `officeExit(home)` 的门外点；逐段检查**不穿房间墙（门洞除外）、不穿 `blocksFloor` 摆件（含 S1-3 之后真实摆放的；此刻用 `FOYER_ITEMS` 矩形）、不进中央圆、不占主通道以外的禁区**；`go` 与 `back` 互为反向（去掉首尾后点集一致）。
3. **六人同点**：同一消费点 6 人同时 `join` 并走路（用真实碰撞 / 简易人物模拟，参考 T16b 的 harness），到齐后 **0 穿墙、0 重叠超过 `PERSON_GAP`、不堵主通道和门洞**；**三进三出**（3 人到站、3 人刚好离开并有人补位）重复 50 次不死锁、不丢人。
4. **200 个固定种子**：把"随机 N 个同事同时去随机消费点再返回"接入 T16b 同口径的 200 种子压力测试（**新增测试用例，不改现有的**）：0 个 `行动超时`、0 个槽位泄漏（测试结束 `snapshot()` 全空）、所有人都回到工位。
5. **看门狗**：见第 2 节两条证明。
6. **静态检查**：`foyer-paths.js` 与 `director.js` 的新增部分**不含** `buy / pay / purchase / wallet / balance / price / innerHTML / fetch( / Math.random( / performance.now(`（`director.js` 原有使用 `Math.random` 的地方除外，只检查**新增**行；用备份文件做差异）；`foyer-paths.js` 不 import 任何业务模块。
7. 既有行为不变：`consumerQueue / foyerTrip / plazaTrip / foyerReturnTrip` 的输出与改动前逐点一致；`loungeTrip / meetingTrip / officeExit` 不变。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（**不得放宽已有断言**，尤其 T16 的 200 种子压力测试、`foyer-layout`、`office-layout`、`pedestrian-*`）；`node --check foyer-paths.js`、`node --check director.js`。
- 汇报（按 `_common.md` §5）：每条要求做到没有；没做到的原因；**看门狗对排队等待的判定结论**（是否需要改 `director.js`，改了什么，证明）；`director.js` 的逐行差异清单；200 种子新用例的结果（耗时、最慢种子、最大排队长度）；**未验证项如实写**（例如「在真实 S1-3 场景里的真实碰撞下是否通过」：S1-3 完成前只能用规划矩形，**必须写明**，S1-6 再用真实碰撞复验）。
- 确认 **`app.js` 没有任何改动**、场景里没有人物会自己走向咖啡吧。
- **不要自己结束或重启进程。**
