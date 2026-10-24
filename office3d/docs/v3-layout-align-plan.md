# V3 格局与概念图对齐方案（R3）

状态：推荐方案，未实施。坐标、25 工位与 12 展示席见 [JSON](v3-layout-align-plan.json)，自检见 [脚本](v3-layout-align-check.mjs)，俯视图见 [SVG](v3-layout-align-plan.svg)。

## 左侧两个方案

| 方案 | 会议处理 | 左侧开放岛 | 席位 | 取舍 |
| --- | --- | --- | --- | --- |
| **甲，推荐** | board `-18.5..-8.5,-18..-12`；plan `-28..-20,-11.5..-5.5`；review `-18.5..-8.5,-11.5..-5.5`，三门均向南、宽 1.5m | `west-open=-28..-8.5,-4.5..5.5`，195m²，19.5×10m；ops/quality 仅用地面、矮柜和桌岛分组 | A=8、B=6，合计 14 | 满足左岛面积和最短边，完整保留会议功能与独立房间。 |
| 乙，备选 | board/review 同甲；plan 改为 `-20..-8.5,-4.5..1.5` 的开放会议角，1.2m 矮隔断，无全高墙 | `west-open=-28..-8.5,-4.5..5.5` 扣除会议角后 120m² | A=8；B 最多 6 但不具独立房间条件 | 视觉更开放，但未达到 140m²，且会议私密性、声学和 B 路线合同需重新定义，故不推荐。 |

推荐甲写入 JSON：`west-open` 容纳 OpsLead、OpsEngineer 和四名质量/安全人员；ops/quality 是 `deskGroup` 而非物理房间。四角 `market/service/aftersales/marketing` 仍为独立展示室，各 3 席，不放真实工位。右侧 `kb/product/eng`、`drlife`、`creative/dining/leisure`、前厅和广场沿用 R2；`creative/dining/leisure` 均为展示，不与开放区重叠。

## 吧岛、空洞与导航

岛中心 `(2,-6)`：台面 `r=3.5`，碰撞外沿 `r=6`，吧凳/沙发 `r=4.2/5.8`，主环路 `r=6..10`。前厅 `-6..10,4..12` 在 `(2,4)` 与环路相切，`x=0..4` 是 4m 无重叠入口轴。

2m 半径空洞检查在 `z<12` 仅列出：`-8.5..-8,7.5..10.5`（1.5m²，leisure 外侧连通余量）；`-6.5..-0.5,-18..-14.5` 与 `4.5..10.5,-18..-14.5`（各 9.5m²，北侧会议带与相邻展示室间入口缓冲）。三块均禁止放工位/房间，实施时明确为走廊或景观缓冲。

甲实施需更新：`meetingAccess` 的 plan/review 坐标与南门；`meetingTrip/boardTrip` 的进门折点；14 会议席座位点；`officeExit/corridorPath/officeTrip/loungeTrip/consumerTrip`；O-06 FIX3 的 1,375 条路线、访客排队和休息区避让断言。乙还需新增开放会议角的声学/占用合同。`?layout=2` 不动。

Trae 负责布局、家具、导航和回归；Codex 负责岛台/碰撞与样板。未获董事会确认前不实施。
