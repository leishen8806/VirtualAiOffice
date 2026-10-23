# VIS2-T-R1 Public Foundation

## Scope

This public-foundation candidate changes only integration-owned warehouse files:

- `office3d/dr-campus-shell.js`
- `office3d/dr-campus-registry.js`
- `office3d/dr-campus-modules.js`
- `docs/dispatch/vis2/00-baseline.json`
- `docs/dispatch/vis2/01-ownership.md`

S2-17 sample-zone assets remain intact: receiving dock, trucks, inbound inspection,
front plaza, and the external building entrance. This candidate does not rebuild them.

## W0 Evidence Matrix

The comparison camera is fixed to `CAMPUS_FOCUS`: target `[-124, 0, 6]`, radius
`68`, desktop FOV `38`, with the baseline medium tier (DPR `1.25`). Lighting,
dynamic fog, exposure `0.85`, and the deterministic simulation slice must remain
fixed during capture.

| Variant | Ground | Roof / overlays | Required evidence | Current state |
| --- | --- | --- | --- | --- |
| A | baseline | baseline | overview, ground close-up, rack visibility, renderer calls | blocked: isolated browser runtime prerequisites absent |
| B | independent building ground | baseline | same camera and renderer record | static contract verified; browser capture blocked |
| C | baseline | semantic roof/guide split | same camera and renderer record | static contract verified; browser capture blocked |
| D | independent building ground | semantic roof/guide split | same camera and renderer record | static contract verified; browser capture blocked |

No color or performance claim is inferred from the source-level checks. Browser
capture becomes eligible only with an isolated fixture for the runtime prerequisites
listed in `00-baseline.json`.

## Public Rendering Changes

- `campus-building-floor` has its own `MeshStandardMaterial`; it no longer uses the
  shared structural material. `#C9C6BE` is the initial design input, not an
  acceptance color claim.
- Roof meshes are in the `transparent-roof` semantic group and stay hidden for the
  overview cutaway. They are retained for a focused view through `setCutaway(false)`.
- Zone specifications retain their stable ID and bounds but are selection-only.
  Normal overview rendering has no functional-area placeholder volumes.
- Static merge batches visible content by semantic `batchGroup`, preserves source
  names in `userData.sourceIds`, and skips invisible roof meshes. It does not turn
  every transparent object into one global transparent batch.
- The baseline has no real-glass partition mesh. A future private reception module
  must mark actual glass with its own `transparent-glass` batch group; it must not
  reuse roof or guide materials.
- The external sign is intentionally small and always says `DR 仓配 · 模拟演示`.

## Legacy Replacement Table

| Old object | R1 action | Successor |
| --- | --- | --- |
| `campus-interior-static` | stopped by removing the legacy module from the total loader | Claude's registered private interior module |
| `campus-dispatch-simulation` | stopped with the legacy module | Claude's registered private screen module, which must retain a simulation watermark |
| `campus-zone-*` volume meshes | selection-only specifications; no normal-render mesh | private objects positioned by the existing stable zone IDs |
| large `campus-sign` board | replaced by the compact, persistent simulation sign | public shell sign |

No collision, click target, camera route, or business identifier is redefined here.
Private replacement modules must register their own visual roots while reusing
`CAMPUS_ZONES`, `CAMPUS_WALKABLE`, and existing stable IDs.

## Independent Verification

Run after isolated runtime fixtures are available:

```powershell
node --max-old-space-size=2048 --test --test-timeout=60000 tests/*.test.mjs
```

Capture the four variants above using the same device, GPU, browser version,
viewport, DPR, camera target, quality tier, and simulation slice. Record
`renderer.info.render.calls` and `renderer.info.render.triangles` beside each
capture. Do not compare variants with different fog, exposure, or data states.
