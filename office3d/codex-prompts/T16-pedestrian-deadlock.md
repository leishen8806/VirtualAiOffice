# T16-pedestrian-deadlock：同事走位被卡死（面对面堵在窄通道 / 门口），要有「解死锁」机制

先读 `_common.md`。**本任务的例外规则：** 允许修改 `pedestrian-traffic.js`、`director.js`（**只限**避让 / 排队 / 解死锁相关，不改动作阶段、事件类型、对话逻辑）、`office-layout.js`（**只限**路径函数 `officeExit` / `officeTrip` / `corridorPath` / `meetingTrip` / `loungeTrip` 里的路径点，**不得改房间、门、座位、走道的坐标和尺寸**）、`tests/pedestrian-traffic.test.mjs` 和新增 `tests/pedestrian-deadlock.test.mjs`、`README.md`。**不要改** `server.mjs` 和所有 `*.mjs` 业务模块、渲染材质、光源。纯前端，不需要重启服务，验收时 Ctrl+F5。备份到 `office3d-backup-deadlock`（办公室目录没有 Git）；在当前版本上改，不要用旧备份覆盖。**不要与 T10 / 其他改 `app.js` 的任务同时进行。**

## 现象（我已在页面里复现，不是猜测）
董事会反馈：「任务行动会被卡住」，并给了一张截图——**三个人挤在工程办公室门口的走廊上，谁也不动**。我在 `http://office.localhost:3200/` 用页面自带的 `window.__office` 做压力测试，**第一轮就复现了**：

```js
// 复现脚本（页面控制台，页面加载完、上班时间里执行）
const o = window.__office, vs = [...o.views.entries()].filter(([,v]) => !v.away), ids = vs.map(x => x[0])
const rnd = (a) => a[Math.floor(Math.random() * a.length)]
const t = Date.now(), used = new Set()
for (let i = 0; i < 12; i++) { const a = rnd(ids), b = rnd(ids); if (a === b || used.has(a)) continue; used.add(a)
  o.enqueue({ id: 'st' + t + i, at: new Date().toISOString(), kind: i % 3 === 0 ? 'dispatch' : 'speak', from: a, to: b, text: '压力' + i }) }
let last = '', same = 0
for (let k = 0; k < 3000; k++) { o.step(0.1, 5); const act = vs.filter(([,v]) => v.act)
  if (!act.length && k > 10) break
  const sig = act.map(([,v]) => v.name + v.char.group.position.x.toFixed(1) + v.char.group.position.z.toFixed(1) + v.act.phase).join('|')
  if (sig === last) { if (++same === 80) { console.log('卡死', act.map(([,v]) => [v.name, v.char.group.position.x.toFixed(2), v.char.group.position.z.toFixed(2), v.act.phase, v.act.i])); break } } else same = 0; last = sig }
```
实测输出：**SR（SecurityReviewer，质量室）停在 (-11.5, 5.34)、DBE（数据库工程师，Dr.life+）停在 (-11.76, 5.8)，两人阶段都是 `walk`，连续 8 秒（模拟时间）位置不变。** 质量室东墙 x=-11，房内右侧通道在 x≈-12（`officeExit` 的 `room.x1 - 1`），宽度约 1 米：一个人正沿这条通道出门，另一个人正沿同一条通道进来找他，**面对面**，`pedestrian-traffic.js` 里「会车双方各向自己的右侧挪步」在 1 米宽的通道里没有地方挪，就互相等死了。门口三人拥堵是同一类问题的变体（门宽 2 米，三人从不同方向同时到门口）。

## 要求
1. **解死锁（核心）**：在 `pedestrian-traffic.js` / `director.js` 里加通用机制——一个正在走的人，如果连续 ≥ 1.5 秒（可调常量）**位置几乎不动且被另一个人挡住**，就进入「让路」：
   - 选择让路方要**确定性**（不要随机，避免两人同时让或同时不让）：优先级按「正在离开 > 正在进入 / 访客」「事件 `at` 更早的优先通行」「同一时刻则按 agent id 排序」，**低优先级的一方**退回到自己路径上的上一个路点（或最近的宽阔处：走廊 / 门外 / 房间中央）停下等待，直到对方通过或最多等待 6 秒；
   - 让路时**不得穿墙、不得穿家具、不得叠人**（沿用现有 `furnitureCollision` 与 `PERSON_GAP`）；让路中的人状态显示为 `queued`（「等候通行」，已有阶段），不要新增阶段名；
   - 等待超时后重新出发；**同一个人在同一次行动里最多让路 3 次**，3 次后还堵就**绕行或放弃这一次互访**：该行动记为完成（回到自己工位），**不得永远卡住，也不得让整个行动队列停摆**。
2. **兜底看门狗**：任何一个行动阶段（`walk` / `queued` / `rise` / `turn` 等）如果**超过 45 秒（可调）没有完成**，强制结束：该人物传送回到自己的 home 工位并清掉 `act`，在控制台记一条 `console.warn('[director] 行动超时，已复位')`（只记人名和阶段，不记其它内容），这样即使有未知的死锁，也不会永久卡住。看门狗**不得**用于掩盖正常的长路程（走到西翼会议室最长约 60 米，按走速换算后要小于超时，写出你的计算）。
3. **减少窄通道对头**：评估 `officeExit` / `officeTrip` 里「出门」和「进门」共用房内右侧通道（`room.x1 - 1`）的问题。允许你把**进入**和**离开**的房内路点错开（例如进门走另一侧或沿桌后通道），前提是**所有路点仍在房内、不穿家具、不改任何房间 / 座位坐标**，并通过现有 `tests/office-layout.test.mjs` 与 `tests/pedestrian-traffic.test.mjs` 的全部断言（**不得放宽已有断言**）。如果你判断只靠解死锁就够，不改路径，写明理由。
4. **门口多人**：门洞宽 2 米、`PERSON_GAP = 0.52`。三人同时到同一扇门时，要有序通过（先到先过，后到的在门外 ≥1 米处排队，不堵住走廊横向通行线 z = -2.5 / -1.5）。写测试固定这个行为。
5. 不改变：人物速度、动作动画、对话气泡、休息区 / 会议室 / 投票会 / 晨会走位逻辑、`director.enqueue` 的事件格式。

## 测试
- `tests/pedestrian-deadlock.test.mjs`（Node，不依赖浏览器，用现有行人动线测试里的纯函数 / 模拟器方式）：
  - **复现用例**：两人在 1 米通道里面对面——旧代码下卡死（先写出旧行为的失败断言，确认它在改动前失败），新代码下 6 秒内至少一人让路、另一人通过，**两人最终都到达目的地**。
  - 三人同时到同一扇门（来自房内两个方向 + 走廊一个方向）：全部在 N 秒内通过，没有位置重叠（任意两人水平距离 ≥ `PERSON_GAP` 的 90%），没有穿墙。
  - **确定性**：同一输入重复运行 20 次结果相同（无随机让路）。
  - 让路次数上限 3 次、超时看门狗复位：构造一个永远过不去的人为死锁，断言行动在 45 秒（模拟时间）内被强制结束且人物回到 home。
  - **随机压力**：固定种子的伪随机事件（≥ 200 个种子 × 每个种子 12 个并发事件），统计「连续 80 步位置不动且仍有行动在进行」的次数，**必须为 0**；同时统计平均完成时间和最长完成时间，写进汇报（和改前对比，改前至少有一次卡死）。
- 现有全部测试保持通过。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check < 文件.js`（所有改过的浏览器模块；不要用 `node --check x.js`）。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5，上班时间；下班时同事不在，先用 `?q=high` 并等到他们上班）：把上面的复现脚本跑 **至少 30 次**（每次重新生成随机事件，等行动全部结束再跑下一次），**一次卡死都不能出现**；贴 30 次的统计（最长完成步数、让路发生次数、看门狗触发次数——看门狗触发应为 0，触发了要解释原因）。
- 手工造「三人堵工程办公室门口」：让工程室的 2 位同事和走廊外的 1 位同事同时往同一扇门走，截图并说明通过顺序。
- 不退化：25 位同事各就各位、互访、去休息区、去会议室 / 评审室投票会入座、董事会找苏晨、点地面走路、小地图、搜索跳转、`wallGo` 各 key；控制台无报错，且**无 `行动超时` 警告**（有就说明原因）。
- 汇报：每条要求做到没有；没做到的原因；看门狗超时值的推算；**真实长时间运行（一整天）未验证**要如实写。
