# VIS2-T-R2 B0 And Claude A Intake

## B0 Integration Identity

- Repository: `git@github.com:leishen8806/VirtualAiOffice.git`
- Source B0: `9e8c4f99ea29166b173d40a762178b9933c972ca`
- Integration branch: `vis2/terra-integration`
- R2 entry candidate: `f3506f280fdd458d05629c904f33f480834c619e`
- Integration scene directory: `E:\VirtualAIOffice\vis2-t-integrator\office3d`
- Observed local service: `E:\VirtualAIOffice\paperclip-ops\office3d\server.mjs`

The observed service is a different local working directory. It is not evidence that
the R2 candidate is running. No production configuration or customer data is copied
into this integration worktree.

## Shared Contract

- World coordinates use Three.js units: x/z form the floor plane and y points up.
- Zone and walkable identifiers are fixed in `office3d/office-layout.js`; the
  `highRack`, `receiving`, `inspection`, `frontPlaza`, `visitorHall`, and
  `frontBridge` IDs are retained.
- Factories use `factory({ THREE, root, layout, now, ...shared })` and may return
  `onFrame`, `summary`, and an idempotent `dispose`.
- `createCampusRegistry` owns the root, invokes `buildAll` once, stops frame updates
  while hidden or inactive, and disposes module-owned resources before removing the
  root.
- Modules own only their own geometry, materials, textures, timers, and listeners.
  Shared layout, the renderer, camera, environment, and registry root remain
  integration-owned.
- The reception interior is bounded by the `z=30` building edge. `frontPlaza`,
  `parking`, and `logisticsGate` remain exterior; `visitor`, `showcase`, `dispatch`,
  and `officeMeeting` remain interior.
- The default feature state is off. Campus visuals require both
  `campus-visual.json` with literal `enabled: true` and `?campus=1`. Invalid or
  missing configuration remains off.

## Claude A Intake

Reviewed candidate: `2879124f4f89f64721a0c328bd4d052c25bd6934`.

The candidate adds only a private rack-cell module, isolated preview, isolated test,
and module documentation. Its isolated test passed `10/10`. It is based on a
separate snapshot history, so it is imported only after this document is committed
and with an explicit replacement adapter:

- Replace old rack frames, pallets, cartons, rails, and shuttle geometry.
- Retain old station, receiving-door, shipping-door, and label objects.
- Keep stable zone IDs and the existing shuttle state source.
- Do not import or wire Claude B until its exact module contract and isolated tests
  are supplied and pass in its own worktree.

## R2 Replacement Adapter

The integration adapter registers `vis2Rack` before the old support modules:

- `dr-campus-racks.js` receives `replaceRackCell: true`; it keeps the inspection,
  picking, packing, receiving-door, shipping-door, and rack-label objects, while
  omitting old rack frames, cartons, pallets, and the shuttle-strip base.
- `dr-campus-shuttle.js` detects the registered `vis2RackCell`. It keeps the
  existing deterministic event source, visibility pause behavior, and `onFrame`
  lifecycle, but does not construct old rails or the old shuttle mesh. It passes the
  existing `shuttleFrame` position and lift to `setShuttle`.
- If the private cell fails to build, registry isolation leaves no cell on the root;
  both support modules use their original visual paths. No extra render loop, timer,
  business request, or interaction identifier is added.

Verified source-level integration probe:

```text
modules: shell, vis2Rack, racks, motion, shuttle
old campus-racks-static: absent
old campus-shuttle-static: absent
old campus-shuttle-vehicle: absent
campus-rack-labels: retained
registry dispose: scene children = 0
```
