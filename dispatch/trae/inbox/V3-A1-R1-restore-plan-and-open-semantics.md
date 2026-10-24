---
id: V3-A1-R1
base: feat/v3-align @ 10618704276b442429a3df1a9a3833b3c79f5f16
branch: feat/v3-align
scope:
  - office3d/office-layout.js
  - office3d/office-v3-public-path.js
  - office3d/tests/office-v3-align-data.test.mjs
  - office3d/docs/v3-layout-align-plan.md
  - office3d/docs/v3-layout-align-plan.json
  - office3d/docs/v3-layout-align-plan.svg
  - office3d/docs/v3-layout-align-check.mjs
  - dispatch/trae/outbox/V3-A1-R1-report.md
budget: 3h
---
# V3-A1-R1：恢复方案甲坐标、吧台碰撞字段、开放区语义、走廊数据与示意图

Q-V1 复审 V3-A1（`10618704`）的结论是**需返工**。并行变体隔离、`LAYOUT_V1/V2/V3` 回归、`resolveOfficeLayout`、门外净空、board 东门、`regionFocus`、测试（定向 19/19，`office-*` 失败集与基线相同）都已通过，**保持不变**。需要修的是下面 5 项。

在 `feat/v3-align` 上从 `10618704` 继续**追加提交**；不 force push、不推 `main`、不合并其他分支。

## 1（P1）区域外框恢复为已批准的方案甲

已批准方案甲为仓库 `plan/v3-layout-align` @ `83ecc1b` 的 `office3d/docs/v3-layout-align-plan.json`，可用 `git show 83ecc1b:office3d/docs/v3-layout-align-plan.json` 读取。现实现有 6 个区域偏离方案，且回执未说明：

| 区域 | 方案甲（必须恢复） | 现实现 |
|---|---|---|
| plan | `-28..-20, -11.5..-5.5` | `-10.5..-4.5` |
| review | `-18.5..-8.5, -11.5..-5.5` | `-10.5..-4.5` |
| west-open | `-28..-8.5, -4.5..5.5` | `-3..7` |
| aftersales | `-28..-20, 5.5..11.5` | `8.5..11.5`（进深减半） |
| leisure | `-18.5..-10.5, 5.5..11.5` | `8.5..11.5`（面积减半） |
| dining | `23..32, -1.5..3.5` | `23..30.5` |
| marketing | `24..32, 5.5..11.5` | `24..30.5` |

这些偏移没有必要：board 已改东门，plan/review 北侧与 board/market 之间的 0.5 m 缝不再是任何门的出口，按"实心夹缝"处理即可（不作通道、不开门）。

**门洞建议**（审查员已用方案甲坐标验证：门外直行净空量到第一个有墙区域、场地边界或工位占地，结果都 ≥ 1.5 m）：

| 区域 | 门 | 门外净空 |
|---|---|---|
| market | east @ z −15 | 1.50 m |
| board | east @ z −15 | 22 m |
| service | west @ z −15 | 8.7 m |
| plan B | south @ x −24（方案原门） | 10.9 m |
| review A | south @ x −13.5（方案原门） | 17 m |
| aftersales | east @ z 8.5 | 到边界 |
| marketing | north @ x 28 | 17 m |

如果坚持要偏离方案坐标，必须在回执中逐项写明理由，并**停下等待董事会批准**，不能直接提交。

## 2（P1）吧台碰撞字段按补充说明

`LAYOUT_V3_ALIGN.bar.radius` 改为 **6**（碰撞外沿）；`island.barOuter: 3.5`、`island.stoolRadius: 4.2`、`island.sofaOuter: 5.8`、`bar.seats`、`bar.gaps` 与顶层 `ring: { inner: 6, outer: 10 }` 保持不变。Codex 的 V3-A2P 已按这组字段名读取（服务台读 `island.barOuter`，碰撞读 `bar.radius`），并已通过复审。测试断言 `bar.radius === 6` 且 `island.barOuter === 3.5`。

## 3（P1）开放区不是房间：加类型与"有墙"标志

1. 每个区域加 `kind`，取值与方案甲相同：`room`（board / plan / review）、`display`、`open`（kb / product / eng / west-open / drlife），另加 `walled: true | false`。
2. **只有** board、plan、review 与四角展示室 market / service / aftersales / marketing 为 `walled: true`，各有一个 1.5 m 门洞。其余区域 `walled: false`、`doors: []`：
   - `open` 区：kb / product / eng / west-open / drlife；
   - 展示区：creative / dining / leisure。
3. `office-v3-public-path.js`（只在带 `publicPathNodes` 的变体上生效，**稳定 V3 的图必须逐字不变**）：
   - 障碍只用 `walled` 区域、前台 / 服务吧 / 等候弧，以及每个真实工位的占地（座位点 ±0.8 m 方框，或已有的桌面占地数据）；
   - `walled: false` 的区域可以通行。
4. 共享代码中按 `regions[].doors[0]` 取门的地方（会议导航、展示人员等），只对 ALIGN 生效；无门区域在 ALIGN 下不得抛错。如需改到卡片范围外的文件，先停下告知派发人，不要擅自扩大范围。

## 4（P2）走廊、通道与会议出入线按最终区域重算

审查员发现以下字段与区域矛盾：

- `corridors.westMiddleCross`、`passages.northMeetingBuffer` 落在会议室内（以现坐标算）；
- `corridors.westSouthCross` 落在 west-open 内；
- `passages.westOpenLink` 仍为旧外框；
- `corridors.westNorthCross` 是 0.5 m 夹缝，`office-v3-modules.js` 把它当作展示人员的 `north` 走道；
- `corridors.eastMiddleCross` 与 product / eng 重叠；
- `meetingAccess.northZ = -5` 横穿会议室。

恢复方案甲坐标后，对 `corridors`、`passages`、`meetingAccess` 的**每个键**，在回执中给一张表：新值（或删除）、被哪些代码读取、为什么这样取。规则：

- 不与任何 `walled` 区域重叠，宽度 ≥ 1.2 m（0.5 m 夹缝不得作为走廊）；
- 穿过 `open` 区时，离任何工位点 ≥ 0.6 m；
- 现有代码在 ALIGN 下会读取的键（例如 `westNorthCross`、`eastSouthCross`）必须有合法值，不能留旧值。

## 5（P2）方案文档、JSON、检查脚本与示意图

1. `v3-layout-align-plan.json` 恢复方案甲的结构（`site`、`island`、`meetingRooms`，以及带 `kind` 的 `regions`、`workstations`、`displaySeats`），再加上 R1 新增的 `walled` 与 `doors`。
2. `v3-layout-align-check.mjs` 做两层比对：
   - JSON 与 `LAYOUT_V3_ALIGN` 一致；
   - JSON 与 `83ecc1b` 方案逐项比对，**只允许**门洞、`walled` 和 R1 新增字段有差异；任何坐标偏差都报失败并列出。
3. `v3-layout-align-plan.md` 写清：区域类型、门洞表、吧岛三圈（3.5 / 6 / 10）、与方案甲的差异（应只有门洞）。
4. `v3-layout-align-plan.svg` 按比例绘制（例如 1 m = 14 px），要求：
   - 画出全部门洞；
   - 吧岛三圈分别画在 3.5 / 6 / 10 m；
   - 25 个工位、12 个展示席、14 个会议席分别用不同点样式；
   - 有墙区域与开放区样式区分；
   - 画出前厅与广场；标签不被点遮挡。

## 测试（补充到 `tests/office-v3-align-data.test.mjs`，不启动浏览器）

- 15 个区域外框与 `83ecc1b` 方案逐一相同；`kind` 与方案相同；`walled` 与门洞数量符合第 3 项。
- `bar.radius === 6`、`island.barOuter === 3.5`。
- 门外直行净空 ≥ 1.2 m：量到第一个有墙区域、场地边界或工位占地。
- west-open 内部点（如 `(-18.25, 2)` 与 6 个工位前方点）可作为公共路径端点；`(-18.25, -5)` 到 `(-18.25, 5)` 的路线长度 ≤ 13.3 m（直线 10 m 的 1.33 倍）。
- `corridors`、`passages`、`meetingAccess` 满足第 4 项规则。
- 原有断言全部保留：零重叠、25 / 12 / 14、入口可达每个门 / 工位 / 会议席 / 休息席、`regionFocus`、回归（`LAYOUT_V1/V2/V3` 与 `resolveOfficeLayout` 不变）、FIX3 `office-v3-meeting-navigation` 全部通过。

## 不做

- 不改 `app.js`、`director.js`、家具 / 外壳 / 样板 / 吧台几何与碰撞；
- 不改 `LAYOUT_V3`；
- 不改 FIX3 的 1,375 条路线断言；
- 不合并 `main` 或 `feat/v3-align-sample`；
- 不部署、不启停服务；
- 报告不含密钥、IP、本机路径或账号。

## 交付

- 推送 `feat/v3-align` 后把完整 SHA 告诉派发人。
- 回执 `dispatch/trae/outbox/V3-A1-R1-report.md` 写明：
  - 做到 / 没做到 / 未验证；
  - 5 项逐项处理；
  - 与 `83ecc1b` 的比对输出（应只有门洞差异）；
  - 第 4 项的键值表；
  - 测试真实输出末尾。
- 测试带资源上限：`node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-*.test.mjs`。失败按名称与 `9f881d0` 比较，不得新增。
- 完成后停下，等待 Q-V1 复审。
