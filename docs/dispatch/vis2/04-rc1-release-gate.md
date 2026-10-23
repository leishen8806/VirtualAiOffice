# VIS2-DR-RC1 Release Gate

## Candidate Scope

This branch starts at `8cd651938d86e913d8ad081bba9a8de559652fdd` and contains:

- The existing public warehouse ground, cutaway roof, selection-only zone treatment,
  S2-17 loading docks, vehicles, inbound inspection, exterior entrance, and plaza.
- Claude A at `2879124f4f89f64721a0c328bd4d052c25bd6934`, already included by the
  R2 baseline.
- Claude A-FIX1 dependency pair:
  - `f7d782a7517b8959732ffcfbd23a5d626990fb5e`
  - `7b35a26d719a01b735caa3c76b7b2761ee3ff10f`
- Integration compatibility wiring that disables old rack, rail, and shuttle visuals
  while retaining stations, doors, and stable rack labels.

## Dependency Graph

```text
2879124 (A)
├─ f7d782a → 7b35a26 (A-FIX1, included)
└─ 410707d → f9d296e (B → B1, blocked and not included)
```

`7b35a26` depends on the implementation in `f7d782a`; both are applied. The
early A import is not applied a second time.

## Gate Decision

### Eligible

- A-FIX1 component tests and the RC replacement adapter pass together.
- The old `campus-racks-static`, `campus-shuttle-static`, and
  `campus-shuttle-vehicle` visuals are not built when `vis2RackCell` succeeds.
- Existing labels, station geometry, receiving doors, shipping doors, stable zone
  IDs, original motion state, feature flags, and simulation labels remain.
- The original visual path is retained if the private A module cannot build.

### Blocked

Claude B/B1 are intentionally excluded. The A-FIX1 read-only contract audit reports
two unaddressed P1 blockers:

1. The B dispatch south-wall glass and door opening do not align with
   `CAMPUS_WALKABLE.serviceAxis`; the proposed door does not provide the required
   service-path passage.
2. B/B1 have no `baseY` contract, while the public floor plane and existing visual
   objects use different vertical reference values.

Additional B/B1 P2 items remain: furniture overlap with public walkable regions,
snapshot version semantics, texture redraw/disposal ownership, and the need to
replace legacy interior screen/furniture selectively rather than stack duplicate
objects.

The current rack-cell `baseY=0` is an existing-object compatibility baseline, not a
confirmed finished-floor elevation. It is a release risk that needs fixed-camera
browser verification before visual acceptance.

## Verification

Source-level RC verification:

```powershell
node --max-old-space-size=2048 --test --test-timeout=60000 --test-concurrency=2 `
  tests/dr-vis2-rack-cell.test.mjs tests/dr-campus-racks.test.mjs tests/dr-campus-shuttle.test.mjs
```

Expected: `28 pass / 0 fail`.

Full-suite command:

```powershell
node --max-old-space-size=2048 --test --test-timeout=60000 tests/*.test.mjs
```

Browser smoke remains not run for this candidate: the isolated worktree intentionally
does not contain the local service identity/configuration or a local Playwright
installation. Do not substitute the separately running `paperclip-ops` service as
candidate evidence.

## Reproducible Preview Prerequisites

Use a disposable, non-production local service fixture that supplies only a test
company identity and disabled LAN/wall settings. Keep both
`office3d/office-visual.json` and `office3d/campus-visual.json` false for baseline
verification. For campus visual verification, set only the campus flag to literal
`true`, then open:

```text
http://127.0.0.1:<isolated-port>/?campus=1
```

Record browser version, GPU, viewport, DPR, quality tier, camera, feature-flag state,
simulation slice, console errors, network requests, draw calls, and triangles.
