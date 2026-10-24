# V3 Align Layout R1

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
outer radius `10m`. Stool and sofa outer radii remain `4.2m` and `5.8m`.

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
`83ecc1b`; only R1 door and `walled` fields are intentionally different.
