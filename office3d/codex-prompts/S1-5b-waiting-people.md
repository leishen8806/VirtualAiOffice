# S1-5b-waiting-people：「有待回答事项的同事」走去前厅等候沙发（等候区人物）

**建议执行者：Codex 5.6 Sol（新会话）。前置条件：S1-5 已由董事会侧验收通过（`app.js` 同一时间只能一个任务改）。** 这是从 S1-5 第 7 项拆出来的：S1-5 的执行者正确地发现，S1-4b 的 `visitConsumer` 规则（**有 `waits` 的人不能开始访问**、`updateVisits` 里 **出现 `waits` 就召回**）与「有真实待回答事项的同事走去等候区」直接冲突；`foyer-paths.js` 的 `visitPlan` 也只认 7 个消费队列；`waiting_sofa` 没有座位容量数据。本任务把这几处**最小地补齐**，并接线到 `app.js`。先读：`S1-5-foyer-dynamic-panels.md`（第 7 项与 `foyer-panels.js` 的 `selectWaitingPeople`）、`S1-4b-director-visit-consumer.md`、`foyer-paths.js`、`director.js`（`visitConsumer / updateVisits / returnVisit / startVisitReturn`）、`office-layout.js`（`FOYER_ITEMS` 的 `waiting_sofa`：x 16…21、z 10…11、朝北；`FOYER_TARGETS.waiting_sofa = (18.5, 11.5)`）、`app.js` 里 `waits` 相关的现有表现（「有人在等你」气泡 / 画面，**先读清楚再动**）。

**例外规则：** 允许修改 `office-layout.js`（**只新增** `WAITING_SEATS` 等导出，**不改任何已有导出的值**）、`foyer-paths.js`（**向后兼容地**新增 `waitingPlan` 等，**不改已验收行为**）、`director.js`（**只扩展** `visitConsumer` 的 `mode:'waiting'` 分支，**不改让路 / 碰撞 / 解死锁 / 其它 phase**）、`app.js`（只限等候人物的接线）、`foyer-panels.js`（S1-5 已有，只允许小改）、新增 `tests/foyer-waiting.test.mjs`、`README.md`。**不要改**：`server.mjs`、`ui.js`、`index.html`、`pedestrian-traffic.js`、所有业务模块、`tenancy\`、`town*`。备份上述将改的文件到 `office3d-backup-s1-5b`。**不得向 Paperclip 发任何写请求**；**不为测试制造任务 / 提问卡**（当前**真实存在**待董事会回答的事项，例如某位同事在等你回答；用它实测，没有就写「未验证」）。不联网、不装依赖。纯前端，不需要重启服务。

## 本任务的边界
- **只有真实的待回答状态才会触发**：`/state.waiting[]` 里 `kind==='question'` 且有 `agentId`；**没有真实等待就没有人走、没有任何等待动画**。不得因为「展示效果」伪造。
- **零 token / 无写路径**：不发评论、不建任务、不改 Paperclip 任何状态；命名里不得出现 `buy / pay / purchase / wallet / balance / price`。
- 不改现有「有人在等你」气泡 / 画面的表现；人走到沙发后，气泡仍跟着人（同一个人物对象），**不得出现同一个人同时在工位和沙发**。

## 要做的事
1. **座位容量数据（`office-layout.js`，只新增）**：`WAITING_SEATS`——**4 个**等候位点，沿 `waiting_sofa` 前方（朝向沙发，世界坐标：沙发 z 10…11 朝北，人站 / 坐在 z≈11.5 一侧）依次排开，**相邻 ≥ 1.0 米**、**0.5 的倍数或明确推导**、**不进入** `MAIN_AISLE`（x 0…4）、门洞、中央圆、`desk` 队列的 6 个点、`blocksFloor` 摆件；每个点带朝向 `yaw`（面向沙发 / 面向入口，二选一并写明理由）。导出 `WAITING_CAPACITY = WAITING_SEATS.length`。**不修改** `FOYER_ITEMS` 里 `waiting_sofa` 的现有字段与 `FOYER_TARGETS`。扩充 `tests/foyer-layout.test.mjs` 的新增用例（不改旧断言）：新点全部在可走区域、互不重叠、与既有 42 个队列点和 27 个摆件不冲突。
2. **路径（`foyer-paths.js`，新增）**：
   - `createWaitingBoard()`：基于现有 `createQueueBoard({ queues: { waiting: WAITING_SEATS } })` 的薄封装（容量 4，满员第 5 人返回 `full`，其余语义同队列板）；
   - `waitingPlan({ home, agentId, board })` → `{ ok, targetId:'waiting', go, stand, back, slot, yaw }`：去程用 `foyerTrip(home, 'waiting_sofa')` 的合法路线并把终点换成分配到的座位点；返回路线为去程反向，**最后回到 `officeExit(home)` 的门外点再进房间**；满员 / 重复 / 未知返回 `{ok:false, reason}`，**不抛异常**；
   - **不得改变** `visitPlan / dwellMs / CONSUMER_TARGETS / consumerAdvance / consumerDeparture` 的既有行为与输出。
3. **`director.js`**：扩展 `visitConsumer(v, plan, options)`，新增 `options.mode === 'waiting'`：
   - 开始条件：**允许** `v.waits?.length > 0`（这是它存在的原因），但**仍要求** `!v.act && !v.lounging && !v.away && !v.leaving && !v.visiting`，且 `v.waits` 里**至少有一条真实的 question**；不满足返回 `false` 且**状态不变**；
   - **不按 `dwellMs` 计时**，改为由调用方的 `options.shouldStay()`（每帧廉价判断，返回 `true` 继续等）决定；`shouldStay()` 变 `false`（该等待条目消失 / 问题已回答）→ 沿 `plan.back` **走回工位**；另设**硬上限 10 分钟**（`options.maxMs`，默认 600000，用累计 `dt`），超时就走回并 `onAbort('timeout')`；
   - **召回规则对 `waiting` 模式例外**：`updateVisits` 里的 `visit.v.waits?.length → 'recalled'` **不对 waiting 模式生效**；其它打断（下班 `offDuty`、`away / leaving`、被董事会事件选中、`cancelVisit`）**仍然有效**并**必须释放座位**；
   - **到座后的看门狗**：沿用 S1-4b 的做法（到站结束当前 act，由 visit 自己累计等待时间，**不会被 45 秒 `ACTION_TIMEOUT` 复位**）；
   - **坐姿（可选）**：如果复用现有休息区沙发的「入座 / 起身」姿态（`pose.sit` 等）成本很低，可以让等候的人**坐在沙发上**；否则**站在座位点朝向沙发等候**也可以，**在汇报里写明选哪个与理由**；无论哪个，**起身走回工位不能瞬移 / 穿模**。
   - `stats()` 里 `visits / visitAborts` 的口径保持，新增 `waitingVisits`（可选）。
4. **`app.js` 接线（只限等候人物）**：
   - 每次 `/state` 刷新（**不新增轮询**）后：只在**上班时间**，用 `selectWaitingPeople(lastWorld.waiting, WAITING_CAPACITY)` 选出人；对每个选中、当前空闲（`!v.act && !v.lounging && !v.away && !v.leaving && !v.arriving && !voteSeated.has(v) && 不在会议`）的同事，创建 `waitingPlan` 并 `director.visitConsumer(v, plan, { mode:'waiting', board, agentId, shouldStay: () => <该 waiting 条目仍存在>, onDone, onAbort })`；
   - **休息区随机选人 / `goLounge` / `lifeTick` 不得选中 `v.visiting` 的人**（S1-4b 汇报的接线点，之前**没人引用 `v.visiting`**，这里补上，**并给 `goLounge` 等已有判断加上 `!v.visiting`**）；
   - 反过来：正在休息区 / 开会 / 投票 / 有事件动作的人**不去**（等他们空闲后再去；条目仍在就会去）；
   - 条目消失（被回答、被关闭）→ `shouldStay()` 为 `false` → 走回工位；
   - 页面隐藏后再恢复（`live` 门控）：**不要补播**走路动画——如果恢复时条目仍在且人不在座位，就直接在座位点出现（按现有「不在前台看着就直接坐好」的做法）；条目已消失就直接回工位；
   - **下班（`offDuty`）整体收尾**走现有逻辑，visit 必须被干净取消、座位释放。
5. **文档**：`README.md` 的 S1-4 / S1-5 一节补充「等候区人物」的规则与已知限制。

## 测试（`tests/foyer-waiting.test.mjs`，用真实碰撞 harness，仿 `tests/foyer-visit.test.mjs`）
- 座位板：4 个座位依次分配、第 5 人 `full`、离开后后面不会乱（等候不需要前移，座位固定）；重复 / 未知；快照清空。
- `waitingPlan`：25 个工位各一次，路线合法（不穿墙 / 不穿摆件 / 不进中央圆 / 不占主通道），终点是座位点，返回回到 `officeExit(home)` 门外点。
- `visitConsumer(mode:'waiting')`：有 `waits` 的人**能**开始；无 question 的 `waits`、有 `act`、在休息区、`away` 的人返回 `false` 且无副作用；`shouldStay()` 变 `false` 后**走回工位**并 `onDone`；**10 分钟硬上限**超时走回；**45 秒看门狗不复位**（用 `dt` 推进 5 分钟）；下班 / 事件打断释放座位。
- 4 个人同时等候不堵主通道 / 门洞；第 5 个等待的人**不会走**（停在工位，条目仍显示在面板数量里）。
- **200 个固定种子**（T16b 口径，新增用例）：随机 0–4 人同时进入 / 退出等候状态，混入既有的消费点访问，**0 个 `行动超时`、0 个座位 / 槽位泄漏、所有人回到工位**。
- 静态检查：新增行无 `buy / pay / purchase / wallet / balance / price / innerHTML / fetch( / Math.random( / performance.now(`（对 `director.js` 用备份差异）；`goLounge` 等已加 `!v.visiting`（grep 断言）。
- 既有全部测试（含 T16 压力、`foyer-visit`、`foyer-paths`、`foyer-layout`、`foyer-panels`）不得放宽，全过。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check` 对所有改动的 `.js`。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5）：
  1. **用真实的待回答事项**：先 `GET /state` 看 `waiting[]`，如果当前有 `kind:'question'`（例如某位同事在等董事会回答），截图并录下该同事**走去前厅等候沙发**、等候中、以及你**不去回答也不制造任务**的情况下观察 ≥ 2 分钟（用 `window.__office.step()` 推进或实际等待）；**没有真实待回答事项就如实写「未验证」，不要伪造**；
  2. 浏览器控制台 0 错误；确认同一个人不会同时出现在工位和沙发；气泡跟随人物；
  3. 用 `step` 模拟「条目消失」（只在页面内存里模拟 `lastWorld.waiting` 变化，**不写 Paperclip**），确认人走回工位不瞬移；
  4. 休息区随机选人在访问期间不选中该人（读 `lifeTick` 的调用点证明）；
  5. 画质切到 `low` 复测一遍走路与回座。
- 汇报（按 `_common.md` §5）：每条做到没有；没做到的原因；`WAITING_SEATS` 的坐标与选 yaw 的理由；坐姿选择与理由；`director.js` / `foyer-paths.js` / `office-layout.js` 的**逐行差异清单**；200 种子新用例结果；**未验证项如实写**。
- **不要自己结束或重启进程；不改 `server.mjs`。**
