# V3-L1-R2 格局方案修订回执

基线：`plan/v3-layout-align @ 1131157ffbaff6a164576d199bf1c256b9f9a57a`。

## 董事会答复落地

1. JSON 固定 `counterRadius=3.5`、`collisionRadius=6`、吧凳/沙发半径 `4.2/5.8`、主环路 `r=6..10`。
2. `board=-18.5..-8.5,-18..-12`、`review=-28..-18,-10.5..-4.5`、`plan=-16.5..-8.5,-10.5..-4.5`；三室均独立、无重叠，门洞为 board 向南、review 向东、plan 向西，均宽 1.5m。
3. 四角 `market/service/aftersales/marketing` 均为 `display`，各 3 席，共 12；真实工位集合不含它们。
4. `creative/dining/leisure` 均为独立 `display`，不含真实工位；东侧 `product/eng` 收至 `z=-1.5`，与前两者只贴边不重叠。

## Q-V1 修正

| ID | 处理 |
| --- | --- |
| L1-01 | 东侧拆为 `product`、`eng`、独立北侧 `kb`；KnowledgeKeeper 调至 `(14.5,-15)`，位于 kb。 |
| L1-02 | 三会议室给出新外框、门洞与方向；西岛移至 `z=-3..4`，Ops/Quality 工位不再落入 review/plan。 |
| L1-03 | 原知识室区域 `12.5..20.5,-18..-12` 明确为开放 `kb`。 |
| L1-04 | SVG 改为显式像素坐标，含全部区域 id、25 蓝点、12 紫点及 r=3.5/6/10。Chrome 已渲染核验。 |
| L1-05 | 前厅 `z=4` 与外环在 `(2,4)` 相切；`x=0..4` 是 4m 无重叠开口，作为前厅至环路入口轴。 |

## 自检

命令：

```text
node --max-old-space-size=1024 docs/v3-layout-align-check.mjs
```

完整输出：

```text
PLAN regions=18 area=1350.5m² workers=25 displaySeats=12
PLAN island counter=3.5 collision=6 ring=6..10
PLAN overlap=0 workers=25 displaySeats=12
PLAN ring-near board:2.09m, kb:2.09m, plan:0.50m, product:0.50m, quality:2.85m, creative:1.42m, foyer:0.00m, leisure:6.99m, drlife:5.21m, plaza:8.00m
PLAN blank>=4 1213.50m²@-28..32,-18..30; 112.00m²@-4..8,-12..0 (预期为环路外连接带、绿化/景观余量；实施前转为走廊或缓冲带)
PLAN PASS
```

第一个空白块是外围景观/连接带的单一连通包络，不是未解释的可用室内区；第二块是中央岛南北外侧连接余量。两者均不放工位、房间或展示席，实施卡必须明确为走廊/景观缓冲。

## Chrome 证据

Chrome headless 以 `1000×760, DPR=1` 直接渲染 SVG，控制台错误为 0；PNG 证据：`review-artifacts/V3-L1-R2/v3-layout-align-plan.png`，不进入源码历史。XML 解析亦通过。

## 改动

| 文件 | 内容 |
| --- | --- |
| `office3d/docs/v3-layout-align-plan.md` | 修订后的精简方案、会议房间和前厅/环路说明。 |
| `office3d/docs/v3-layout-align-plan.json` | 18 区域、25 真实工位、12 展示席、吧岛半径与开口。 |
| `office3d/docs/v3-layout-align-check.mjs` | 无依赖只读自检。 |
| `office3d/docs/v3-layout-align-plan.svg` | 显式像素映射的俯视图。 |
| `dispatch/trae/outbox/V3-L1-R2-report.md` | 本回执。 |

## 没做到

- 未改任何源码、布局数据、测试、场景、服务或运行配置。
- 未实施方案、未合并 main、未 force push、未部署或启停服务。
