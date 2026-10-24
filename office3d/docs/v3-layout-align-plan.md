# V3 格局与概念图对齐方案（R2）

状态：第一阶段方案，未实施。基线为 `66bca480e580efb92300f2d955231889751cf7be`；机器可读坐标、25 个工位与 12 个展示席见 [v3-layout-align-plan.json](v3-layout-align-plan.json)，俯视图见 [SVG](v3-layout-align-plan.svg)。

## 已确认的格局

场地固定为 `x=-28..32,z=-18..30`。四角 `market/service/aftersales/marketing` 是四间独立展示办公室，各 3 席；不安排真实工位。`board/review/plan` 是三间独立会议决策室：分别为 10×6、10×6、8×6 m，门洞都朝向相邻公共连接带，A/B 保持 8/6 席。

西侧开放岛分为 `ops` 与 `quality`，东侧开放岛分为 `kb`、`product`、`eng`，均只用地面、矮柜和桌岛区分，不建全高内墙。`creative/dining/leisure` 是独立展示区；它们不与开放岛重叠，也不放真实座位。知识区保留为北侧中右的独立开放区，KnowledgeKeeper 位于其中。

中央岛中心 `(2,-6)`：服务台 `counterRadius=3.5`；整个岛的碰撞外沿 `r=6`；吧凳/沙发环半径 `4.2/5.8`；`r=6..10` 为 4m 主环路。前厅 `-6..10,4..12` 与环路在 `(2,4)` 切点相接，开口为入口轴 `x=0..4`，宽 4m；二者不重叠，人物由该切点进入环路。

## 导航与交接

三间会议室保留 `meetingAccess` 及各自门洞；开放岛低柜不得占用横向连接带、东西环路或 4m 前厅开口。实施必须重算 `officeExit/corridorPath/officeTrip/meetingTrip/loungeTrip/consumerTrip`，复跑 O-06 FIX3 的 1,375 条路线、14 会议席、访客排队与休息路线。`?layout=2` 保持回退不动。

Trae 负责 `office-layout.js`、家具坐标、V3 导航与回归。Codex 负责 `office-vis2/bar.js`、`office-heart-banyan.js`、`office-bar-geometry.js` 的岛台、开口、树池、座位和碰撞统一。建议顺序：布局/门洞与路线图（2h）→ 外壳/开放岛/吧岛（4h）→ 25 工位与路线回归（4h）→ 样板接线、机位和性能验收（3h）。

风险：`r=6` 会改变 O-06 休息路径，低柜必须纳入碰撞；实施前仍须由董事会确认开放岛的视觉密度与四角展示办公间的陈设尺度。
