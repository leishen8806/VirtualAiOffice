# S1-3b-restore-central-reception：董事会决定——保留中轴上的原前台（恢复被 S1-3 拆除的旧接待台与绕行）

**建议执行者：Codex 5.6 Sol（与 S1-3 同一位最合适，熟悉这批改动）。** 先读 `_common.md`、`S1-3-foyer-scene-build.md`（本任务是对它第 3 节的**部分撤销**）、`docs/foyer-plaza-plan.md` 第 1.4、2.3 节。

## 董事会决定与影响（请先理解）
- **决定：** 董事会要求**保留原来在"欢迎光临"后面、主竖走道（x=2）上的前台**。S1-3 按规划把它拆了并把 `RECEPTION` 改成东侧边界，**现在要恢复**。
- **不冲突的地方：** 旧前台占 `x≈-0.75…4.75, z=3.8…6.5`，**在前厅（z=8…13）北侧的竖走道里**；前厅与广场的 4 米无家具主通道（`MAIN_AISLE`，x 0…4）约束的是 **z ≥ 8**。所以**前厅与广场的全部规划摆件不需要改动**。
- **要付出的代价（已知并接受）：** 人物经过该前台时要沿用旧的绕行（`bypassX = -2`），这是 T16 之前就验证过的行为；T16 的让路 / 看门狗在这个场景下已通过 200 种子压力测试。
- **东侧那个新接待台（`reception_desk`，8.5…14.5 × 8.5…9.5）保留，但定位改为「服务台」**：继续作为消费点 `desk` 的排队目标和 S1-5 的面板 / 交办箱所在区域；**界面显示名称从「东侧接待台」改成「前厅服务台」**（`FOYER_ITEMS` 的 `name` 字段与 `FOYER_ZONES` 里相关说明、`REGION_FOCUS` 的 label、README 同步改文字；**`id` 一律不改**，因此不会影响 `desk` 队列和测试键）。

## 例外规则
允许修改：`app.js`（只限旧前台恢复与 Logo 位置，见下）、`office-layout.js`（只限 `RECEPTION` 与 `corridorPath()` 绕行分支、两处名称文字）、`tests/office-layout.test.mjs`、`tests/pedestrian-stress.test.mjs`、`tests/foyer-layout.test.mjs`、`tests/foyer-scene.test.mjs`、`docs/foyer-plaza-checks.mjs`、`foyer-scene-spec.js`（若涉及）、`README.md`、`docs/foyer-plaza-plan.md`（第 1.4、2.3 节在末尾追加「董事会决定（2026-10-20）：保留中轴前台」并说明，**不要改写原有内容**）。**不要改**：`server.mjs`、`ui.js`、`index.html`、`director.js`、`quality.js`、`merge.js`、`env.js`、所有业务模块。备份当前 `app.js`、`office-layout.js` 与上述测试到 `office3d-backup-s1-3b`。**S1-3 的 `office3d-backup-s1-3\` 里保存了 S1-3 之前的旧代码，可作为恢复依据**（`app.js` 约 573–606 行的前台组，`office-layout.js` 的 `RECEPTION` 与 `corridorPath` 绕行分支）。纯前端改动，不需要重启服务；不联网、不装依赖、不向 Paperclip 写。

## 要做的事
1. **恢复旧前台实体**：从备份把 `entrance-reception` 前台组（含 `receptionCounter` 碰撞注册、前台部件、`reception-brand-logo`、台面铭牌）**原样搬回** `app.js`，位置 `RECEPTION.x / z / width`。**不要重写，不要「改良」**，保持与拆除前逐像素相同的外观。
2. **恢复 `RECEPTION` 与绕行**：
   - `office-layout.js`：`RECEPTION = { x: CORRIDOR_X, z: 5.5, width: 5.5, z0: 3.8, z1: 6.5, bypassX: -2 }`（值与备份一致）；`corridorPath()` 的绕行分支恢复（加注释：`// 董事会决定：保留中轴前台（2026-10-20）`）；**`FOYER_RECEPTION`（东侧服务台）保持不变且与 `RECEPTION` 脱钩**（不再用它推导 `RECEPTION`）；
   - 其余导出（`FOYER_*`、`MINI_BOUNDS`、`foyerTrip` 等）**一概不动**。
3. **Logo 与背墙**：S1-3 可能把品牌 Logo 挪到了服务台正面。**恢复后：中轴前台保留 Logo；服务台正面不再放第二个大 Logo**（可以留一个很小的「服务台」字样铭牌，Canvas 贴图，无品牌图），避免两个"前台"抢戏。`entrance-slogan`、欢迎地毯、背墙大 Logo 圆形标识保持现状。
4. **测试恢复到 S1-3 之前的口径（只恢复，不新增放宽）**：
   - `tests/office-layout.test.mjs`：恢复「中轴前台必须绕行」断言（对照 `office3d-backup-s1-3\tests\office-layout.test.mjs`）；
   - `tests/pedestrian-stress.test.mjs`：前台碰撞体改回中轴位置（`x 2±2.75, z 3.8…6.5`），并**保留** S1-3 新增的前厅 / 服务台碰撞体；T16 历史种子 53 / 81 / 91 / 161 与 200 个种子**全部重跑并全绿**；
   - `tests/foyer-layout.test.mjs`：`RECEPTION` 断言改为旧值，`FOYER_RECEPTION` 仍为 8.5…14.5 × 8.5…9.5；**新增一条**：中轴前台（`RECEPTION` 矩形）与 `FOYER_ITEMS` 所有摆件、`MAIN_AISLE`（z ≥ 8 部分）、27 个目标点、42 个队列点**互不相交**；
   - `tests/foyer-scene.test.mjs` / `foyer-scene-spec.js`：服务台名称更新；中轴前台**不属于** 27 项（它是既有实体），确认旧前台**在**碰撞注册里、27 项的数据不受影响；
   - `docs/foyer-plaza-checks.mjs`：仍全 PASS（输出 `items=27 targets=27 queues=7 queueSlots=42 result=PASS`）。
5. **路径回归**：`consumerTrip / foyerTrip / plazaTrip / foyerReturnTrip`（S1-1 的函数）经 `corridorPath` 走到 `(2,12)` 时，**从北侧房间出来的人会按绕行经过前台**，南侧到前厅 / 广场的人不受影响；对 **25 位同事 × 7 个消费点** 重新逐段检查：不穿房间墙（门洞除外）、不穿旧前台矩形、不穿 `blocksFloor` 摆件、不进中央圆；`loungeTrip / meetingTrip / officeExit` 与 S1-3 之前**逐点一致**（和备份对比）。
6. **小橘（T21）**：重跑 T21 的离线路线检查脚本，确认恢复前台后猫的公共路线仍 0 穿墙 / 0 穿家具（旧前台是它之前就避开的对象，应该无变化；如有变化写进汇报）。

## 验收（缺一不通过）
- `node --test tests/*.test.mjs` 全过（**不得放宽已有断言**；恢复旧断言不算放宽）；`node --input-type=module --check < app.js`、`< office-layout.js`；`node docs/foyer-plaza-checks.mjs` 全 PASS。
- **浏览器实测**（`http://office.localhost:3200/`，Ctrl+F5）：
  1. 截图：中轴前台与「欢迎光临」地毯（正面 + 贴近视角），确认与恢复前（备份 / 之前的截图）外观一致；前厅俯视，确认服务台、公告墙、休息区、等候沙发都在、**没有与前台重叠**；
  2. 让一位在北侧房间的同事走一遍上班路线 / 去前厅，确认**绕前台而不穿前台**，3 分钟内 0 次 `行动超时`；
  3. 小地图与 `wallGo`、搜索（「接待」仍能找到并跳转，显示名称为服务台相关文字）正常；
  4. 控制台 0 错误；新增 / 恢复后 calls 对比：**恢复旧前台不应让 calls 超出 S1-3 的预算线**（高 +60 / 低 +15，写出实测）。
- 汇报：每条做到没有；没做到的原因；**从备份恢复了哪些代码（文件 + 行范围）**；服务台改名清单；对 S1-4 / S1-5 的影响（**应当为零**：路径函数与队列坐标未改；如有，列出）；未验证项如实写。
- **不要自己结束或重启进程；不改 `server.mjs`。**
