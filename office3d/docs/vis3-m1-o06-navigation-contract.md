# Office V3 Navigation Consumer Contract

This document records the shared navigation contract consumed by the Office runtime.
Routes use finite `{ x, z }` world-coordinate waypoints. A route must be non-empty
when movement is requested; an actor already at its destination is the only
legitimate no-movement condition.

| Member | Consumers | Parameters / result | V1 / V2 / V3 behavior | Geometry and failure semantics | Regression coverage |
| --- | --- | --- | --- | --- | --- |
| `officeExit` | `director.goHome`, `arrive`, all route planners | `home -> route` | V1 legacy, V2/V3 layout-specific | Uses the assigned room door; missing door rejects route creation | exit portion of 1,375-route matrix |
| `corridorPath` / `publicPath` | director commute, office/meeting/board routes | `from, to -> route` | V1 legacy; V2/V3 use layout corridors | Finite points only; V3 routes through side corridors and foyer hub | commute, office, meeting, board matrix |
| `officeTrip` | director peer actions | `home, targetHome, stand -> route` | V1 legacy, V2/V3 layout-specific | Includes departure, public route, arrival door, final stand | 625 V3 workstation pairs; V2 regression |
| `meetingTrip` | meeting scheduler and `app.js` seat `pathFn` | `home, meetingSeat -> route` | V1 legacy; V2/V3 layout-specific | V3 enters `review`/`plan` through real doors; malformed access metadata rejects factory creation | 350 V3 combinations and 14-seat door checks |
| `boardTrip` / `BOARD_DOOR` | director board action | `home, stand -> route`; complete doorway object | V1 fallback; V2/V3 layout-specific | V3 uses board west door `outside` and `inside`; no legacy `viaZ` | 25 V3 board routes and director action |
| `loungeTrip` / `LOUNGE_SEATS` | lounge actions | `home, loungeSeat -> route` | V1 legacy; V2/V3 layout-specific | V3 enters through the matching east/west bar opening, stays clear of bar colliders, planter and reception | 150 V3 combinations and 25 explicit direct-path fixtures |
| `consumerTrip`, `foyerTrip`, `plazaTrip` | visitor plan adapters | `home, targetId, optionalStand -> route` | V1 legacy; V2/V3 layout-specific | V3 covers A1/A2, desk, B0-B3 and waiting targets; unknown target rejects | 200 V3 consumer routes |
| `consumerAdvance` | `director.visitConsumer` | `targetId, from, to -> non-empty route` | V1 legacy; V2/V3 layout-specific | V3 returns finite short movement between queue slots; it never returns an empty override | contract fixture, real two-visitor advance |
| `consumerDeparture` | visitor return sequence | `targetId, stand, back -> route` | V1 legacy; V2/V3 layout-specific | V3 preserves the previously validated reversed route; invalid inputs reject | real visitor return test |
| `consumerQueues` / `consumerTargets` | queue board and plan adapter | target-to-slots / target position | V3 only extension | Slots are outside reception, service bar and plaza fixtures; queue compaction retains identity order | all target queue contracts |
| `ENTRANCE.gate`, `ENTRANCE.inner` | director commute | complete entrance metadata | V1/V2 existing; V3 explicit | Missing entrance metadata fails navigation construction | arrival/departure regression and mutation |

## V3 queue geometry

- `A1` and `A2`: south side of the service bar, with horizontal forward movement.
- `desk`: south side of the reception desk, with northbound queue slots.
- `B0` through `B3`: plaza-side cart and kiosk queues.
- `waiting`: four fixed points inside the V3 waiting area, used by the runtime
  `createWaitingBoard` / `waitingPlan` adapter.

`director.visitConsumer` treats invalid movement routes as a one-time fail-closed
visit abort. It does not retain a queued visit that would retry an invalid route on
every update.

## Version compatibility

V1 and V2 keep their existing factory branches and `foyer-paths.js` behavior.
V3 adds complete navigation members rather than defining placeholders that suppress
those legacy fallbacks.
