# VIS2-T-R3 Shared Scene Contract

## Fixed Baseline And Scope

- Source baseline: `9e8c4f99ea29166b173d40a762178b9933c972ca`
- R3 entry candidate: `11680792f67f40efb1f1f15c4ba0f09591079636`
- R3 branch: `integration/vis2-dr-rc1`
- Runtime observation: `E:\VirtualAIOffice\paperclip-ops\office3d` is separately
  running and is not asserted to be this candidate.

R3 retains the completed S2-17 dock, vehicle, inbound-inspection, exterior entrance,
and plaza implementation. It does not rebuild those objects.

## Finished Floor And Shared Visual Rules

- `CAMPUS_FINISHED_FLOOR_Y = -0.54` is derived from the actual
  `campus-building-floor` `PlaneGeometry` position: `offset 0.06 - 0.60`.
  The plane has no thickness, so this is its rendered finished surface rather than a
  mesh-center estimate.
- The rack-cell receives this value as `baseY`; all its local y values remain
  measured from finished floor. No second warehouse floor is created.
- The building ground uses its own material; the shared structure material is not
  changed. The initial ground color is `#C9C6BE`, not a lighting acceptance claim.
- Roof meshes are semantic `transparent-roof` resources and hidden in cutaway
  overview. Functional-zone specifications are selection-only and do not create
  opaque overview blocks. There is no public glass-partition mesh at this baseline;
  future real glass must use `transparent-glass`, never roof or guide material.
- When `vis2RackCell` builds, old rack frames, cargo, shuttle base, rails, and
  shuttle vehicle are disabled. Stations, receiving/shipping doors, and labels stay.

## Module And Resource Contract

Factories use:

```text
factory({ THREE, root, layout, quality, now, canvasTex, baseY, ...shared })
  -> { onFrame?, summary?, dispose? }
```

- `buildAll` is idempotent. `onFrame` stops when the registry root, ancestor, or
  document is hidden. `dispose` is idempotent and removes the registry root.
- A module owns only resources it creates: geometry, material, texture, listener,
  and subscription. It must not dispose shared renderer, scene, layout, camera,
  feature flags, or another module's root.
- `canvasTex(width, height, draw)` calls `draw(ctx2d, width, height)`. Canvas
  textures must be disposed by their creator.
- High/medium/low quality are controlled by the shared policy. Private meshes set
  `qualityProxy` only when they implement their own quality path; low tier must not
  leave empty meshes or create a second animation clock.
- `shuttleFrame` is authoritative: `position` is world z and `lift` moves only the
  carrier/load, not chassis, rails, or wheels. The host passes frame state through
  `setShuttle`; private modules do not create timers, RAF, fetches, or business data.

## Boundaries, Assets, And Flags

- Stable operational IDs remain `W1`, `W2`, `W3`; stable zone and walkable IDs stay
  defined by `office-layout.js`.
- Exterior: `frontPlaza`, `parking`, `logisticsGate`. Interior: `visitor`,
  `showcase`, `dispatch`, `officeMeeting`. The reception threshold is building
  `z=30`; `frontBridge`, `visitorHall`, `showcaseHall`, and `serviceAxis` are
  protected walkable boundaries.
- Future logo/brand modules must load only assets registered in
  `assets/ASSET_LEDGER.md`, provide a visible fallback, own their own texture
  disposal, and preserve the `模拟演示` label.
- Campus visuals require both `campus-visual.json` with literal `enabled: true` and
  `?campus=1`. Missing, malformed, or unavailable configuration is off. Disabled
  mode must not construct new heavy assets, loops, or business requests.

## Dependency Manifest

```text
included:
  2879124 (A) -> f7d782a -> 7b35a26 (A-FIX1)

blocked, not integrated:
  A-FIX2: no remote branch or commit was available after origin --prune
  410707d (B) -> f9d296e (B1)
```

B/B1 remain blocked by the recorded P1 items: the proposed dispatch opening does not
preserve `serviceAxis`, and they have no `baseY` contract. They also need selective
replacement rules for legacy interior screen/furniture, collision/hotspot bounds,
snapshot texture ownership, branding asset fallback, and independent review evidence.
No unreviewed control room, reception, screen, floor, brand mesh, collision object,
or hotspot is registered by R3.

## Fixed-Camera Verification

Use `CAMPUS_FOCUS` target `[-124, 0, 6]`, radius `68`, desktop FOV `38`, medium
quality DPR `1.25`, exposure `0.85`, and identical weather/simulation slice. Compare
the ground close-up, rack/rail clearance, cutaway roof, docks/trucks, and entry/plaza
without changing global lighting. Browser verification remains blocked until a
non-production isolated service fixture and browser runner are supplied.
