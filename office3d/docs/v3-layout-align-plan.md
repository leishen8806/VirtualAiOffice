# V3 Align Layout R1

> 2026-10-25 O1 校准覆盖下文历史 R1 的 board / review / plan 坐标、market 门向及岛心。当前数据以本文末尾 O1 补充和同名 JSON 为准；原 R1 记录保留。

`LAYOUT_V3_ALIGN` remains an opt-in V3 variant selected only by
`?layout=3&align=1`. The default `?layout=3` contract remains `LAYOUT_V3`.

## Approved Geometry

R1 restores every program-region outer frame to plan A from `83ecc1b`.
`west-open` is 19.5m x 10m (195m2). The 25 real workstations, 12 display seats,
and 14 meeting seats retain their approved coordinates.

| Type | Regions | Walls / doors |
| --- | --- | --- |
| `room` | board, plan, review | walled; one 1.5m door each |
| walled `display` | market, service, aftersales, marketing | walled; one 1.5m door each |
| open | kb, product, eng, west-open, drlife | no walls and no doors |
| display-only | creative, dining, leisure | no walls and no doors |

| Walled region | Door |
| --- | --- |
| market | east at z=-15 |
| board | east at z=-15 |
| service | west at z=-15 |
| plan B | south at x=-24 |
| review A | south at x=-13.5 |
| aftersales | east at z=8.5 |
| marketing | north at x=28 |

## Island And Circulation

The island has three concentric contracts: service counter outer radius `3.5m`
(`island.barOuter`), collision outer radius `6m` (`bar.radius`), and public ring
outer radius `10m`. Stool and sofa center radii are `4.2m` and `5.45m`.
Difference from plan A: sofa center `5.8m -> 5.45m` (Board ruling
2026-10-24), because its `0.35m` backrest outer edge otherwise exceeded the
`6m` collision boundary.

ALIGN pathfinding uses only walled regions, front-of-house fixtures, the island,
and `±0.8m` real-workstation footprints as obstacles. Non-walled regions are
traversable. The restored west transfer declarations are all at least `1.2m`
wide; `westNorthCross` and `northMeetingBuffer` use the legal `-4.5..-3`
band, while `westOpenLink` uses the east edge of the open island.

`meetingAccess` is retained as a data contract for V3 consumers: `northZ=-3.75`,
`westSpineX=-7.55`, `eastSpineX=22.25`, `westMiddleZ=.5`,
`eastMiddleZ=1`, and `eastSouthZ=4.25`. Every value is outside a walled room.

## Source Of Truth

[`v3-layout-align-plan.json`](./v3-layout-align-plan.json) contains the
machine-readable plan. Its checker verifies JSON-to-runtime equality and compares
all approved coordinates, kinds, workers, display seats, and island geometry to
`83ecc1b`; only R1 door / `walled` fields and the Board-approved sofa center
radius are intentionally different.

## O1 北侧会议区与中央空间校准（2026-10-25）

以 `23099888463b892cb973a4715cce6bd1c3b21c42` 为本次修改前版本。在已授权的整楼视觉对齐范围内，将原西侧第二排的两间会议室移至北侧，保留稳定 room id、A=8 / B=6 容量、25 个真实工位和 12 个展示席位的全部原坐标与身份。实体尺寸是按概念图比例与现有空间校准的建模值，不是施工测量。

| 区域 | 当前 x | 当前 z | 门 |
|---|---|---|---|
| market | −28…−20 | −18…−12 | south，x=−25.5，1.5m |
| board | −20…−10 | −18…−12 | south，x=−11.5，1.5m |
| review A | −10…−5 | −18…−13 | south，x=−7.5，1.5m |
| plan B | −5…0 | −18…−13 | south，x=−2.5，1.5m |

会议与决策区为 10×6m；小会议室各 5×5m。市场与会议区现在相邻，市场门转向南侧，避免门开到相邻会议室内。北门继续是锁闭视觉门。其他分区、外框、南门 6×3.5m 和 4m 内部中轴不变。

岛台、吧凳、休闲座、爱心榕树、品牌及碰撞/环道同源移动：圆心 `(2,−6)→(2,−3)`，保持岛台直径 12m、公共环道外径 20m / 宽 4m、服务台外半径 3.5m、碰撞半径 6m。小会议室外框与完整环道不重叠；前台与岛台仍在 x=2 中轴。

两间北侧会议室采用直径 1.5m 圆桌。绘制椅子、实际 wing 座位、会议路线统一消费 `meetingSeatPoints` 的 14 个点与 yaw。座位落 0.1m 网格，结构坐标与门中心落 0.5m 网格；室内路线沿椅背外侧绕行，最后径向进座。已实际建成的会议室占据原装饰 north-nook 的空间，因此不再叠加八个装饰椅子。

原装饰 north-nook 和 917 实例阴影的精确回归改用从上述修改前提交实际加载导出的只读数据夹具 `tests/fixtures/office-align-2309988.json`，保留原断言；新布局另有真实 GLB 家具与墙面碰撞测试，不用旧样板通过替代新布局检查。JSON 检查脚本只对上述三间会议区与岛心给出精确新值，其他历史坐标、工位、展示席位、半径和容量检查不放宽。

本次还没有达到概念图的全部格局：概念图右侧两组小洽谈空间呈前后关系，本候选为在现有尺寸和 8/6 业务席位容量下形成的左右相邻会议室；西侧释放空间的家具密度仍需 O2 完善。不能因此声称整楼 1:1 通过。
