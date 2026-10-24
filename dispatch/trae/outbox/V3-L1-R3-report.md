# V3-L1-R3 西侧开放岛方案回执

基线：`plan/v3-layout-align @ 77dca3000d99ea4a5ce7271c46f043259f2b9220`。

## 两个左侧方案与推荐

| 方案 | 会议房间 | 左侧岛 | 会议席位 | 结论 |
| --- | --- | --- | --- | --- |
| 甲，推荐 | board、plan、review 均独立；plan/review 进入北侧会议带第二排 | `west-open` 195m²，19.5×10m | A8 + B6 = 14 | 满足 ≥140m²、最短边 ≥10m，保留三间独立房间。 |
| 乙，备选 | plan 改开放会议角，1.2m 矮隔断 | 有效开放岛 120m² | A8 + B 最多6 | 不达面积要求，且 B 的私密性、声学、占用与路线合同需要重做。 |

JSON 与 SVG 采用甲。board 为 `-18.5..-8.5,-18..-12`，plan 为 `-28..-20,-11.5..-5.5`，review 为 `-18.5..-8.5,-11.5..-5.5`；三门向南、宽 1.5m。左侧完整开放岛为 `-28..-8.5,-4.5..5.5`。

## 自检

```text
PLAN regions=17 area=1433.5m² workers=25 displaySeats=12
PLAN island counter=3.5 collision=6 ring=6..10
PLAN overlap=0 workers=25 displaySeats=12
PLAN open-components kb+product+eng:210m²/19.5x16.5m, west-open:195m²/19.5x10m, drlife:73.5m²/10.5x7m
PLAN west-open=195m²/19.5x10m meetingSeats=14/14
PLAN ring-near board:2.09m, kb:2.09m, review:0.50m, product:0.50m, west-open:0.61m, creative:1.42m, foyer:0.00m, leisure:6.99m, drlife:5.21m, plaza:8.00m
PLAN blank>=4 1130.50m²@-28..32,-18..30; 112.00m²@-4..8,-12..0
PLAN wide-void(z<12) 1.50m²@-8.5..-8,7.5..10.5; 9.50m²@-6.5..-0.5,-18..-14.5; 9.50m²@4.5..10.5,-18..-14.5
PLAN PASS
```

`wide-void` 的三块都已在方案标为走廊/景观缓冲，不放工位、房间或展示席。原有零重叠、25 名称一一对应、12 展示席与环路距离检查均保留。

## 导航影响清单

- 更新 plan/review 的 `meetingAccess` 及南门坐标。
- 更新 `meetingTrip`、`boardTrip`、14 个会议席的进门折点和座位终点。
- 复核 `officeExit`、`corridorPath`、`officeTrip`、`loungeTrip`、`consumerTrip`。
- 复跑 O-06 FIX3：1,375 条路线、14 会议席、访客队列与休息区避让。
- 若董事会选择乙，另新增开放会议角的声学、占用、无门洞会议路线合同。

## SVG

R3 SVG 采用 R2 显式像素映射，重画 `west-open`、plan/review；工作站点放在标签外，避免遮挡。Chrome headless `1000×760` 渲染控制台错误 0；PNG 证据留在审查资产目录，不进入源码历史。

## 改动与范围

| 文件 | 内容 |
| --- | --- |
| `office3d/docs/v3-layout-align-plan.md` | 甲/乙比较、推荐、空洞和导航影响。 |
| `office3d/docs/v3-layout-align-plan.json` | 推荐甲的区域、会议席位、工位 deskGroup。 |
| `office3d/docs/v3-layout-align-check.mjs` | 开放岛连通面积、宽空洞与会议席位检查。 |
| `office3d/docs/v3-layout-align-plan.svg` | R3 左侧开放岛俯视图。 |
| `dispatch/trae/outbox/V3-L1-R3-report.md` | 本回执。 |

未改任何源码、布局数据、测试、场景、服务或运行配置；未实施、未部署、未启停服务、未合并 main、未 force push。
