# V3 ALIGN Routes

`?layout=3&align=1` uses the ALIGN-only public graph. It rebuilds the 31 open-zone furnishing boxes from `alignZoneObstaclePlan()` without a THREE dependency, adds the 25 desk clearances and the 64 bar collision segments, and uses a nearby clear anchor when a route begins or ends at a desk.

The A3 matrix verifies 1,650 routes from all 25 workstations to the entrance, boardroom, other workstations, 14 meeting seats, six lounge seats, ten bar stools, and eight consumer queues. The planned furnishing bounds conservatively cover the rendered registry obstacles; the route graph therefore does not require THREE or a live registry.

Stable `?layout=3` remains on the pre-existing graph. The A3 route test snapshots its complete supported route matrix hash as `e9fe5c4f07f63bb1945b453c75a0ffbd18e57e9590c5646f429dbb674f9bcce2` to prevent accidental changes.

Display department signs are placed on the inside face of the actual door wall for all four door directions. Synthetic display staff routes remain inside their display room until the final 1.5 m door apron.
