# T16b-deadlock-stress-test：补上 T16 要求但没做的「固定种子随机压力测试」，并清理测试里的遗留代码

先读 `_common.md` 和 `T16-pedestrian-deadlock.md` 的「测试」一节。T16 的机制（让路 / 看门狗 / 次数上限）我已验收：浏览器里 5 轮 × 12 个并发事件没有卡死、没有触发看门狗。**但 T16 明确要求、而你没有做的两项还缺**，本任务只补这两项，**不要改 `director.js`、`pedestrian-traffic.js`、`office-layout.js` 的任何逻辑**（除非压力测试发现了真实的卡死，见第 1 节末尾）。

**例外规则：** 只允许修改 `tests/pedestrian-deadlock.test.mjs`、新增 `tests/pedestrian-stress.test.mjs`、`README.md`（T16 章节补一句）。备份到 `office3d-backup-deadlock-stress`（办公室目录没有 Git）。不需要重启服务。

## 1. 固定种子随机压力测试（`tests/pedestrian-stress.test.mjs`）
- 用真实的 `office-layout.js`（房间、门、座位、`officeTrip` / `officeExit` / `loungeTrip` / `meetingTrip`）和真实的 `createDirector` + `createPedestrianTraffic`（带 `furnitureCollision` 的真实家具碰撞，如果测试里能构造就用真实的；不能就在汇报里写明用了什么替身、为什么，并保证门洞、房墙、通道宽度和真实布局一致）。
- **≥ 200 个种子**（用你自己实现的小型确定性伪随机数，例如 mulberry32，种子 1…200），每个种子造 **12 个并发事件**：随机的「某人去找某人」（`speak` / `dispatch`）、其中混入 2–3 个去休息区、1–2 个去会议室（评审室 / 计划室）、1 个去董事会。同一个种子重复运行结果必须一致。
- 每个种子跑到所有行动结束或 **2500 步（每步 0.1 秒）** 为止。统计并断言：
  - **「连续 80 步位置不动、且仍有行动在进行」的次数 = 0**（这是我在页面里复现过的卡死判据）；
  - 2500 步内没有完成的种子数 = 0；
  - **看门狗触发（`stats().timeouts`）= 0**（触发了就是机制没挡住，要报告是哪个种子、哪几个人、坐标）；
  - 任意两个正在走的人水平距离 ≥ `PERSON_GAP` 的 90%（统计最小间距，写进汇报）；
  - 没有人穿过房墙（沿用 `office-partitions.js` / `office-layout.js` 的墙段做判定）。
- 汇报里给出：种子数、事件总数、平均 / 最长完成步数、让路总次数（`stats().yields`）、放弃次数、看门狗触发数、最小人员间距。
- **旧代码对照**：把 `office3d-backup-deadlock/` 里的 `director.js` 和 `pedestrian-traffic.js` 复制到一个临时目录（不要覆盖当前文件），用同样的 200 个种子跑一遍，**写出旧代码下卡死的种子数**（预期 ≥ 1；我在页面里用随机事件一次就复现过）。如果旧代码一个都没卡死，说明压力测试不够狠——加大并发（例如 20 个事件）或加入「同时让多人去同一间办公室」的场景，直到旧代码能复现为止，并把最终参数写进测试。
- **如果新代码在这 200 个种子里发现了真实卡死**：不要隐藏、不要放宽阈值。贴出种子、人名、坐标、阶段，**停下来汇报**，由我决定是否再开修复任务。

## 2. 清理 `tests/pedestrian-deadlock.test.mjs`
`runPair()` 里有一段被注释掉的废弃代码（`/* for (let i = 0; ... d.stats().active ... */`）和一个没有使用的 `d`（`createDirector(... narrowFurniture)`）。删除废弃代码，让测试只保留真正在跑的那一个导演实例；**不得放宽任何断言**。同时给「面对面窄通道」测试补一条**对照说明**：在注释里写明它在旧代码（`office3d-backup-deadlock/director.js`）下的实际结果（卡死 / 不卡死），并**真实跑一次旧代码**来确认，把结果写进汇报。

## 验收
- `node --test tests/*.test.mjs` 全过（不得放宽已有断言）；压力测试总耗时写进汇报（应 < 30 秒，太慢就减少每个种子的步数上限但不减少种子数，并说明）。
- 汇报：每条做到没有；旧代码对照的真实数字；**没有改动任何运行时逻辑**这一点要明确写出。
