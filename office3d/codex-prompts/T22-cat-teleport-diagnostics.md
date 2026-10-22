# T22-cat-teleport-diagnostics：小橘「瞬间移动」——已定位根因（睡桌路线为空 → 直接飞过去）+ 修复 + 常开诊断记录

**建议执行者：Codex 5.6 Sol。** 先读 `_common.md`、`T21-cat-pathing-fix.md`（T21 已验收：路线由 `office-layout.js` 派生、离线 0 穿墙 / 0 穿桌）、`fun.js` 里小橘的部分（约 108–310 行：`C` 状态、`goTo`、`hopTo`、`nextPlan`、`updateCat`）、`cat-play.js`（`catRoute / catSegmentSafe / catDeskAnchor / catDeskTopPoint / updateCatPlay`）。

**例外规则：** 只允许修改 `fun.js`、`cat-play.js`、新增 `tests/cat-teleport.test.mjs`、`README.md`（加一小节）。**不要改** `app.js`、`office-layout.js`、`director.js`、`quality.js`、`server.mjs`、任何业务模块。备份 `fun.js`、`cat-play.js` 到 `office3d-backup-t22`（办公室目录没有 Git）。纯前端，不需要重启服务；**不得向 Paperclip 发任何写请求**，不联网、不装依赖。

## 已定位的根因（2026-10-20，董事会补充现场：小橘从「质量与安全」室瞬移进「Dr.life+ 工作室」）
**这不是跳桌的 1.7 米位移，是跨房间。** 我用离线脚本（`catRoute` + `SEATS` / `workHome`）复现了完整因果链，你**必须先复现并确认**，再修：
1. `fun.js` 的「睡在空闲同事桌上」计划（约 201 行 `nextPlan` 第 3 项，以及约 489 行的另一处同类调用）写的是 `goTo(anchor, …)`，**没有传 `toDeskHome = v.home`**。
2. 此时 `catRoute(from, anchor, { fromDeskHome, toDeskHome: null })` 对「房间内部的 anchor」没有走房门的语义路线，`refineRoute` 里 `detour()`（A*，范围 ±4 米、上限 18000 次）找不到路 → **返回空数组 `[]`**。
3. `updateCat` 里 `const p = C.path[0]; if (!p) { … g.then() }`：**路径为空被当成「已经到达」，立刻执行 `then()`**，也就是 `hopTo(deskTop(...) + 0.01, 0.45, top)`——而 `hopTo` 是从**猫当前位置**直线插值到那张桌面，**没有任何距离或可达性检查**。于是猫在 0.45 秒内跨过整个房间 / 墙飞进目标工位。
4. **离线证据**（`office3d` 当前代码；我的脚本放在 scratchpad，你要自己重写复现）：
   - 4 个工位的 anchor 从**任何**公共点都算不出路线：**UIUX（产品与设计，anchor (-17,-8)）、SecurityReviewer（质量与安全，(-11.5,4.5)）、DBEngineer（Dr.life+ 工作室，(20,2.5)）、Localizer（Dr.life+ 工作室，(20,6)）**；
   - 公共点 → 工位 anchor：**64 / 400 条为空**（现行写法）；工位桌 → 另一个工位桌：**96 / 600 条为空**；
   - **同样的路线加上 `toDeskHome` 后：0 / 1000 条为空。** 也就是说修复的关键很可能只是把 `v.home` 传给 `goTo` 的 `toDeskHome`（`goTo` 本来就支持这个参数）。
5. 董事会看到的现象（质量与安全室 → Dr.life+ 工作室）与此完全吻合：猫在质量室的桌上（睡在 SecurityReviewer 的桌上），随机计划选中睡在 DBEngineer / Localizer 的桌上，路径为空，立刻跳过去。

**因此本任务优先级：**①修根因（路径与到达判断，见下）；②**空路径绝不能当作「到达」**；③跳跃距离上限（防御性）；④常开诊断记录。下面「已知嫌疑点」里的 1–5 仍要逐个交代，但**根因已经是上面这条**，不要再花时间去证明别的。

## 背景（董事会反馈 + 我的核查结论）
- 董事会反馈：**「小橘会瞬间移动」**。我在 2026-10-20 用 `window.__office.step(0.05)` 手动模拟了约 480 秒（正常模式 + 逗猫模式），逐步检查位移，**没有复现**超过 0.3 米 / 步的跳变；复现不出来，所以需要**常开的证据记录**加**对已知嫌疑点的加固**。
- **已知嫌疑点（要逐个验证或排除，不能凭推断就当成原因）：**
  1. **跳桌 / 跳下桌的位移太大太快**：`hopTo(y, 0.45, point)` 在 0.45 秒内把猫从桌面（`catDeskTopPoint = home + (-0.58, -0.72)`）送到 `catDeskAnchor = home + (1, 0)`，约 1.7 米；在低画质档（帧率被限制到约 10 帧）下只有 4–5 帧，看起来就是闪现。同事开始干活 / 离开 / 回来会触发 `C.target = null; C.until = 0` 把猫赶下桌，这种触发比较常见。
  2. **跳跃是 x、z 的直线插值，不检查碰撞也不检查路线安全**：可能越过隔断玻璃或桌板（`hop.point` 只有起点和终点，没有经过 `catSegmentSafe`）。
  3. **`goTo` 在跳跃中途被调用会把 `C.hop` 置空**，猫可能停在半空再突然落地（`updateCat` 里 `if (cat.position.y > 0.05) { hopTo(0); return }`）。
  4. **每次加载页面猫都重新从 `cat.position.set(2, 0, 4)` 出生**（页面刷新后看起来像"突然出现在门口"）。这是已知行为，不算缺陷，但要在诊断记录里能区分（标出"刚出生"）。
  5. **`dt` 已在 `app.js` 的 `clock.delta()` 里限制为 ≤ 0.1 秒**，所以大 `dt` 一步走很远**不是**原因（我已确认，不要再去改它）。

## 要做的事
### 1. 常开的「位移异常」诊断记录（轻量、默认开启、不影响性能）
- 在 `updateCat` 里每帧记录上一帧位置，若**单帧位移 > 0.6 米**（正常走路速度 `SPEED = 0.75 m/s`，`dt ≤ 0.1` 时每帧最多 0.075 米；跳跃每帧约 0.2–0.4 米；所以 0.6 米以上一定异常），记一条诊断事件：`{ at: Date.now(), dist, from:{x,y,z}, to:{x,y,z}, mode, why, hop:boolean, hopPhase:k, afterHop:boolean, playMode, tier（画质档，取自 window.__office.quality?.tier，取不到写 null）, frameMs, dt, sinceSpawnMs }`。
- 环形缓冲，**最多 50 条**；通过 `fun.catDiag()` 读出（返回数组的**拷贝**），`fun.catDiagClear()` 清空；**同时**在控制台用 `console.warn('[cat] 位移异常 …')` 打印一条精简文本（**限流：同一原因 10 秒内最多一条**），方便你直接在控制台看到。
- **不写入 localStorage、不上传、不发送任何网络请求**；记录里不得含个人信息（同事名字不要写进去，只写 `why` 里已有的文字时去掉名字，或只记模式）。
- 记录的开销要小：每帧只做一次 `hypot` 和一次比较，**异常才构造对象**。

### 2. 修根因 + 跳跃安全化（只改"怎么走 / 怎么跳"，不改"为什么去"和"去哪"）
- **根因修复（必须）**：所有「去某位同事桌旁」的 `goTo` 调用（睡桌、被赶下桌后接下一个计划、以及 `afterHop` 里保存的 `toDeskHome`）**都传 `toDeskHome = 目标同事的 home`**；`catRoute` 对「目标是房间内部点」且没有传 `toDeskHome` 的情况，也要有兜底（用目标点所在房间推导门，或明确返回 `null` 表示不可达，而不是返回空数组）。
- **空路径不是到达**：`goTo` 拿到空路径 / `null` 时，**取消这次计划**（不执行 `then()`，不跳跃），把猫保持在原地 idle 3 秒，并在诊断记录里记一条 `reason:'route_empty'`（含目标 anchor 与起点）；`updateCat` 里 `if (!p)` 的分支只在 **路径确实走完且猫已在 `goal` 的 0.3 米内** 时才调用 `then()`，否则视为失败。
- **跳跃起点检查**：`hopTo(..., point)` 前断言「猫当前位置到 `point` 的水平距离 ≤ 1.2 米」，超过就**拒绝跳跃并改为走路**（走不到就取消计划），**任何情况下都不允许一次跳跃跨过房间 / 墙**。

- **距离上限**：`hopTo` 的水平位移 **> 1.0 米**时不再用 0.45 秒直跳；改成**先走到起跳点附近再跳**（在桌旁的 `catDeskAnchor` 附近起跳 / 落地，使水平位移 ≤ 1.0 米），无法满足时**才**用走路过去代替跳跃（猫走到桌边 → 原地上跳 `y` 的动画，水平位移由走路完成）。**猫的最终位置、睡觉位置、`catDeskTopPoint` 都不变。**
- **时长与水平速度上限**：任何跳跃的水平速度 ≤ 2.5 m/s（`dur ≥ dist / 2.5`，且 `dur ≥ 0.45`）；垂直弧度保持 `Math.sin(k·π)·0.35`。
- **跳跃路径安全**：跳跃开始前用 `catSegmentSafe(起点, 终点)` 检查直线；**不安全就改用 `catRoute` 的走路路线**（先走过去再原地跳 `y`），不要穿隔断玻璃 / 桌板 / 墙。
- **打断安全**：`goTo` 在 `C.hop` 进行中被调用时，**不要把跳跃丢掉**：让跳跃先完成（或把猫落到最近的安全地面点——取跳跃终点或起点中 `isCatGroundPoint` 为真的那个），再接新的路线；确保任何时候 `cat.position.y > 0.05` 且不在跳跃中的状态**最多持续 0.6 秒**，之后必定落地。
- **出生**：`cat.position.set(2, 0, 4)` 保持；标记 `spawnAt = performance.now()`，诊断记录里用 `sinceSpawnMs` 区分「刚出生」。

### 3. 不要做的事
- 不改小橘的**行为选择**（去董事会、睡桌子、溜达、躲雨、看夜景、被逗时的反应都保持）、不改 `SPEED`、不改 T18 逗猫的交互、不改 T21 的路线派生与目的地数据（`CAT_DESTINATIONS`、`catRoamPoints` 等）。
- 不在 `app.js` 里加任何东西（`window.__office.fun` 已经暴露，新方法直接挂在 `fun` 上）。

## 测试（`tests/cat-teleport.test.mjs`；`fun.js` 依赖 THREE / DOM，所以把可测逻辑拆成纯函数放在 `cat-play.js`，例如 `planHop(from, to, {segmentSafe})`、`classifyJump(prev, next, {dtMax})`、`createCatDiagBuffer(cap)`；新增导出，**不改现有导出的行为**）
- `planHop`：水平位移 ≤ 1.0 米 → 直接跳且 `dur ≥ max(0.45, dist/2.5)`；> 1.0 米 → 返回「先走到起跳点」的计划（走路路点 + 原地跳），**最终点不变**；`segmentSafe` 为假 → 返回走路计划，**绝不返回穿过不安全线段的直跳**；对 25 个工位的 `catDeskTopPoint ↔ catDeskAnchor`、休息区、后窗台全部覆盖，**逐一断言水平速度 ≤ 2.5 m/s**。
- `classifyJump`：正常走路帧（0.075 m）、跳跃帧（≤ 0.4 m）、异常帧（> 0.6 m）、第一帧（无上一帧）、`dt = 0` 各一例。
- 诊断缓冲：环形上限 50、`catDiag()` 返回拷贝（外部修改不影响内部）、清空、限流（同原因 10 秒内最多一条控制台输出，可用传入的时钟测试）、**记录里不含同事名字**（用含名字的 `why` 做用例，断言输出已处理）。
- **根因回归（必须有，且修复前应当失败）**：对 `SEATS` 全部 25 个工位，用与 `fun.js` 睡桌计划**相同的调用形态**（起点取 `catRoamPoints()`、`CAT_DESTINATIONS` 各点，以及 25 个工位 anchor 本身；目标是每个工位的 `catDeskAnchor`，`toDeskHome` 为该工位 home）断言：**路线非空、末点距 anchor ≤ 0.3 米**；再断言**不传 `toDeskHome` 时要么返回 `null`（不可达），要么非空，绝不返回空数组**；并断言 UIUX / SecurityReviewer / DBEngineer / Localizer 四个工位在修复后可达。**把修复前的失败输出（空路线条数）贴进汇报。**
- **跨房间跳跃回归**：把猫放在 SecurityReviewer 的桌上，让计划选中 DBEngineer 的桌，用 `step` 推进，断言**任何一步水平位移 ≤ 0.35 米**，并且猫最终是**走进** Dr.life+ 工作室的门再跳上桌，而不是飞过去。
- **离线模拟回归（沿用 T21 的做法）**：对 `catRoute` 派生的全部公共路线与 25 条工位路线，用纯数据模拟「走路 + 跳桌 + 跳下 + 被赶下桌」各一遍（不依赖 THREE），断言：**每步位移 ≤ 0.35 米（走路 ≤ 0.075）、无穿墙 / 穿桌、`y > 0.05` 的状态最长 0.6 秒、打断（跳跃中途 `goTo`）后最终落地且路线继续**。
- 静态检查：新增代码无 `innerHTML / fetch( / localStorage / XMLHttpRequest`；`fun.js` 对 `app.js` 无新依赖。
- 既有测试（含 `tests/cat-pathing.test.mjs`、`tests/cat-play.test.mjs`、T16 压力测试）**不得放宽，全过**。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过；`node --input-type=module --check < fun.js`、`< cat-play.js`。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5；**注意**：浏览器面板不聚焦时页面不渲染，用 `window.__office.step(0.05, n)` 手动推进模拟）：
  1. 用 `step` 推进 ≥ 20 分钟模拟时间（分多次，每次 < 30 秒真实时间），其中**强制触发各类场景**：睡桌后让该同事开始干活被赶下桌、`catToggle(true)` 逗猫、夜晚 / 下班去后窗台（`ctx.offDuty`）、下雨躲沙发；**每一步检查位移**，汇报最大单步位移、`catDiag()` 条数（目标 0 条；有则逐条解释）；
  2. 把画质切到「低」（帧率受限）再复测一遍跳桌，确认跳跃视觉上连续（用 `step(0.1, n)` 模拟 10 帧 / 秒）；
  3. 控制台 0 错误；确认没有大量 `[cat]` 警告刷屏。
- 汇报：每条要求做到没有；没做到的原因；**逐个说明五个嫌疑点**的结论（**已复现 / 已加固 / 已排除 / 无法判断**，各写证据，不要含糊）；诊断记录的字段清单与限流行为；跳跃改动前后的最大水平速度对比；**未验证项如实写**（例如真实低端设备上的表现）。
- **不要自己结束或重启进程；不改 `server.mjs`、`app.js`。**
