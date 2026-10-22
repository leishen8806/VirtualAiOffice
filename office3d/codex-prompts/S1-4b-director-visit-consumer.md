# S1-4b-director-visit-consumer：`director.visitConsumer`（去程 → 排队 → 停留 → 返回）+ 看门狗对排队 / 停留的处理 + 压力测试

**工作目录：** `E:\VirtualAIOffice\paperclip-ops\office3d`

**建议执行者：Codex 5.6 Sol。** 这是原 `S1-4-consumer-paths-queues.md` 的**第二步**：第一步（`foyer-paths.js` 与 `tests/foyer-paths.test.mjs`，Trae 完成并已验收）**不要重写**。先读：`S1-4-consumer-paths-queues.md`（第 2、3 节与测试第 3、4、5 项是本任务的规格）、`foyer-paths.js`（已有 API：`createQueueBoard({queues})` → `join / leave / head / occupancy / snapshot`；`visitPlan({home,targetId,board,agentId})` → `{ok,targetId,go,stand,back,slot}` 或 `{ok:false,reason}`；`dwellMs(targetId,rng)`；`CONSUMER_TARGETS`）、`director.js`（**重点：`travel()` 约 398 行、`step`/动作循环约 226–330 行、`resetTimedOut` 约 60 行、`ACTION_TIMEOUT`、`MAX_WALKERS = 3`、`returnHome`、让路与 `abandon`）、`pedestrian-traffic.js`、`tests/pedestrian-stress.test.mjs`（T16b 的 200 种子 harness）、`tests/pedestrian-deadlock.test.mjs`。

**例外规则：** 允许修改 `director.js`（**只限新增 `visitConsumer` 及它需要的最小辅助逻辑**，**不得改让路 / 碰撞 / 解死锁 / 现有各 phase 的行为**；现有测试不得放宽）、新增 `tests/foyer-visit.test.mjs`、`README.md`（S1-4 一节补充第二步）。可以对 `foyer-paths.js` 做**极小的、向后兼容的补充**（例如导出辅助函数），**不得改变已验收的行为**，改了就在汇报里逐行列出。**不要改**：`app.js`（S1-5 才接线）、`office-layout.js`、`ui.js`、`index.html`、`server.mjs`、`pedestrian-traffic.js`（除非证明必须，**必须先停下来汇报**）、所有业务模块。备份 `director.js`、`README.md` 到 `office3d-backup-s1-4b`（办公室目录没有 Git）。纯前端逻辑，不需要重启服务；**不得向 Paperclip 发任何写请求**，不联网、不装依赖。

## 本任务的边界（沿用 S1-4 的约束）
- **只提供能力，不决定「谁去、什么时候去」**；交付后 **`app.js` 没有任何调用**，场景里**没有人会自己走向咖啡吧**。
- **不涉及钱**：函数 / 变量 / 文案里不得出现 `buy / pay / purchase / wallet / balance / price`（静态测试固定，对**新增行**做差异检查）。
- 不新增 `Math.random` / `performance.now()`（`director.js` 原有的不管）；随机性由调用方传入的 `rng`、时间由 `director` 现有的 `dt` 累计。

## 已知的设计陷阱（我读代码发现的，**务必先验证再设计**）
1. **`resetTimedOut`（45 秒看门狗）会把「停留」当成卡住。** `director.js` 里 `if (act.phaseT > ACTION_TIMEOUT) { resetTimedOut(act); return }`：任何动作**在同一个 phase 里停留超过 `ACTION_TIMEOUT`**（约 45 秒）就会被**瞬间复位到自己的工位**。而咖啡吧 / 摊位的停留是 **90–240 秒**。所以 **不能把「到站 → 停留 → 返回」做成一个持续的 act 并让它停在某个 phase 里**。可选做法（**你要先读代码确认再选，并在汇报里写明选择与理由**）：
   - **做法 A（推荐，改动最小）**：到站后**结束当前 act**（`finish`），由 `visitConsumer` 自己用**调度器**（按 `dt` 累计的计时，不用 `setTimeout`）管理停留；停留期间该同事 `v.act = null`、`v.away`/`v.visiting`（新增一个**只属于 visit 的标志**，不要复用 `lounging`）标记；时间到再发起返回的 `travel`。**必须保证停留期间其它系统不会把这个人当成「空闲可调度」**（先读 `app.js` 的 `lifeTick`、`goLounge`、事件派发里对 `v.act / v.lounging / v.away` 的判断，**只读**，列出依赖点；本任务不改 `app.js`，所以 `visitConsumer` 要通过现有字段让他们「看起来忙」，如果做不到就在汇报里明确写出 S1-5 要补的接线）。
   - **做法 B**：新增一个**不受 `ACTION_TIMEOUT` 约束的 `dwell` phase**（`phaseT` 不累计），**但**只允许在 `visitConsumer` 创建的 act 上使用，并有**自己的上限**（`dwellMs` 的最大值 + 10 秒余量）。风险更大，要证明不影响其它 act 的看门狗。
2. **`MAX_WALKERS = 3` 与 `queued` 等待**：`travel()` 创建的 act 先进 `queued`，要等同时走路的人数 < 3。**排队的人站在队里不应占用 walker 名额**（否则 6 个人排队会把整个办公室的走动堵死）。到站后必须**释放名额**（做法 A 自然满足）。
3. **槽位前移**：队首离开后，`board.leave()` 返回的 `advance` 里每个人要**向前挪一格**。**挪动是短路径走路**（`travel` 到新槽位点），不能瞬移；**队里的人在原地时不能被当成卡住**，也不能挡住主通道。
4. **打断**：上班时间结束（`offDuty`）、同事有新任务 / 被召回（`v.waits`、被事件选中）、页面被隐藏又恢复、该同事被董事会事件选为发言人——**任何一种都必须干净退出**：从队里 `leave`、走 / 传回工位（用 `foyerReturnTrip` 的返回路径，**不能瞬移**，除非是下班的整体收尾动画走原有逻辑）、**无论怎样结束都调用 `board.leave(agentId)`**（槽位绝不泄漏）。
5. **不与休息区 / 会议互相干扰**：`v.lounging`、在会议 / 投票中、`v.act` 非空、`v.away` 时，`visitConsumer` **返回 `false` 且不改任何状态**；反过来，访问进行中，`goLounge` 等**不得**再选中此人（见陷阱 1 的依赖点）。

## 要做的事
1. **`director.visitConsumer(v, plan, { board, agentId, dwellMs, onArrive, onDone, onAbort })`**：
   - 返回 `true`（已开始）或 `false`（不能开始，**状态不变**）；不重复实现走路，**复用 `travel()`**（多段串联允许）；
   - 流程：`go` 路径走到**排队槽位**（槽位 0 = 站位点）；**排到队首（槽位 0）才开始计停留时间**；停留 `dwellMs` 后 `board.leave` → 后面的人前移 → 走 `back` 回工位 → `onDone`；
   - 被打断（陷阱 4）走 `onAbort(reason)`，**槽位已释放、人已在回工位的路上或已回到工位**；
   - 提供取消方法（例如 `director.cancelVisit(v)`），幂等；`stats()` 增加 `visits`（进行中数量）、`visitAborts`（可选，不破坏现有字段）。
2. **看门狗**：按陷阱 1 选做法并实现；**证明**：停留 5 分钟的人**不被** `resetTimedOut`；路上真卡住的人**仍然**会被判超时（原有 T16 测试一个字不改，全过）。
3. **新增测试 `tests/foyer-visit.test.mjs`**（用 `tests/pedestrian-stress.test.mjs` 的真实碰撞 / 人物 harness，**不要另起一套**；此刻 S1-3 / S1-3b 之后的真实家具已经在，**用真实碰撞体**，包含中轴前台与前厅服务台）：
   - **六人同点**：同一消费点 6 人同时去，到齐后 **0 穿墙、0 重叠超过 `PERSON_GAP`、不堵主通道和门洞**；第 7 人 `visitConsumer` 前 `visitPlan` 已是 `full`，不会开始；
   - **三进三出**（3 人到站、3 人刚好离开并有人补位）**重复 50 次**，不死锁、不丢人、不泄漏槽位；
   - **200 个固定种子**（T16b 同口径，**新增用例不改现有的**）：随机 N 个同事同时去随机消费点再返回：**0 个 `行动超时`、0 个槽位泄漏（结束时 `board.snapshot()` 全空）、所有人都回到工位**；报告最慢种子、总耗时、最大排队长度、`yields / abandons` 计数；
   - **看门狗**：停留 5 分钟（用 `dt` 推进）不被复位；路上堵死仍被复位（用现有测试构造法）；
   - **打断**：下班（`offDuty`）、被召回、同事有新事件、队首被取消、队中间的人被取消：每种后槽位释放、人回到工位、其余人正确前移；
   - **互斥**：休息区 / 会议 / `v.act` 非空时返回 `false` 且无副作用；访问中 `goLounge` 类选择不会选中（若做不到，测试写成「已文档化的 S1-5 接线点」并在汇报里说明）；
   - **静态检查**：`director.js` 新增行不含 `buy / pay / purchase / wallet / balance / price / innerHTML / fetch( / Math.random( / performance.now(`（用备份做差异）；`foyer-paths.js` 仍然纯净。
4. 既有行为不变：`foyer-paths.js` 已验收的行为、`consumerQueue / foyerTrip / plazaTrip / foyerReturnTrip` 输出、`loungeTrip / meetingTrip / officeExit` 输出、T16 / T16b / T16c 全部测试**原样通过**。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（当前基线 **471 项**，新增测试后总数合理；**不得放宽或删除已有断言**）；`node --check director.js`、`node --input-type=module --check < director.js`。
- 汇报（按 `_common.md` §5）：每条要求做到没有；没做到的原因；**陷阱 1–5 各自的结论**（**已验证存在 / 已规避 / 不成立 / 留给 S1-5**，附证据，不要含糊）；**做法 A 还是 B 及理由**；`director.js` 的逐行差异清单；200 种子新用例结果（耗时、最慢种子、最大排队长度、`yields / abandons`、`timeouts` 必须为 0）；**S1-5 需要的接线点清单**（`app.js` 里哪些判断依赖 `v.act / lounging / away`，要补什么）；**未验证项如实写**（例如真实浏览器里多人同时排队的视觉表现：本任务不接线，所以只能离线验证，**必须写明**，S1-6 再复验）。
- 确认 **`app.js` 没有任何改动**、场景里没有人物会自己走向咖啡吧。
- **不要自己结束或重启进程；不改 `server.mjs`。**
