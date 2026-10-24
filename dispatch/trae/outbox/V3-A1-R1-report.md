# V3-A1-R1 回执

基线：`feat/v3-align @ 10618704276b442429a3df1a9a3833b3c79f5f16`。

## 做到

1. 恢复方案甲外框：15 个程序区域逐项恢复为 `83ecc1b` 的批准坐标；25 个工位、12 个展示席和 14 个会议席保留批准位置。
2. 纠正吧岛字段：`bar.radius=6` 为碰撞外沿；`island.barOuter=3.5`、`stoolRadius=4.2`、`sofaOuter=5.8`、环路 `6..10` 均保持。
3. 增加 `kind` 与 `walled`：仅 board、plan、review 和四角展示室有墙且各有一扇 1.5m 门；开放区与 creative/dining/leisure 无墙、无门。
4. ALIGN 专用公共路径只将有墙区域、前台/服务吧/等候弧、吧岛及 25 个 `+/-0.8m` 工位占地作为障碍。稳定 V3 不带 `publicPathNodes`，路径图保持原有节点集合。
5. 更新 JSON、Markdown、SVG 与自检脚本。自检同时验证 JSON 对运行时和对 `83ecc1b` 的坐标/类型/工位/展示席/岛台一致性。

## 走廊与通行字段

| 键 | R1 值 | 使用与理由 |
| --- | --- | --- |
| `westNorthCross` | `-28..-8.5, -4.5..-3` | V3 展示适配器北侧带；不落入有墙区域，宽 1.5m。 |
| `westMiddleCross` | `-8.3..-6.8, -5.5..5.5` | 西侧开放岛东缘纵向连接，宽 1.5m。 |
| `westSouthCross` | `-19.5..-9, 5.8..7.3` | 西南展示缓冲带，宽 1.5m。 |
| `eastNorthCross` | `20.5..24, -12..-10.5` | 知识区/服务展示区之间，宽 1.5m。 |
| `eastMiddleCross` | `20.5..23, -1.5..3.5` | 产品/工程与展示带之间，宽 2.5m。 |
| `eastSouthCross` | `10.5..12, 5..12` | D.life 西侧纵向连接，宽 1.5m。 |
| `entranceAxis`, `entranceSpine`, `westLoop`, `eastLoop`, `centralRing` | 继承稳定 V3 | 仍是前厅入口及岛台环路合同；无有墙区域重叠。 |
| `northMeetingBuffer` | `-28..-8.5, -4.5..-3` | 会议南侧合法转接带，宽 1.5m。 |
| `westOpenLink` | `-8.3..-6.8, -5.5..5.5` | 取西侧开放岛东缘，不再声明旧外框。 |
| `meetingAccess` | `northZ=-3.75`, `westSpineX=-7.55`, `eastSpineX=22.25`, `westMiddleZ=.5`, `eastMiddleZ=1`, `eastSouthZ=4.25` | V3 会议通行数据合同；各点均不在有墙区域中。 |

## L3/R1 验证

- 方案甲比对：`V3 align plan matches runtime and approved 83ecc1b coordinates`
- 门洞与直行净空：7 个有墙区域全部满足 `>=1.2m`，量至有墙区域、场地边界或工位占地。
- 开放岛：`(-18.25,-5)` 至 `(-18.25,5)` 公共路径长度不超过 `13.3m`；内部点和 6 个工位出口均可到达入口。
- SVG：按 `1m=14px` 标注全部门洞、3.5/6/10m 三圈、25 工位、12 展示席、14 会议席、前厅及广场。

## 测试

通过：

```text
node docs/v3-layout-align-check.mjs
V3 align plan matches runtime and approved 83ecc1b coordinates

node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-v3-align-data.test.mjs tests/office-v3-meeting-navigation.test.mjs tests/office-layout-v3.test.mjs
23 passed, 0 failed
```

完整串行命令结果：`166 passed, 4 failed`。在 `9f881d0` 基线执行同一命令为 `160 passed, 4 failed`；失败名称一致，均是隔离工作树缺失历史备份 `app.js` 的夹具依赖：

```text
O4 app wiring stays within its own 20-line budget and layout1 data is identical
tests/office-layout-v2.test.mjs
O6O7 production wiring contains no business, network, warehouse or wall-clock reads
O4b retains the original budgets without O4 line exemptions and adds at most 10 app lines
```

## 没做到

- 无。

## 未验证

- 未修改 `app.js` 或 `index.html`；未进行浏览器 UI 验收。
