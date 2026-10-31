# WH-R1 tractor / refrigerated semitrailer — B1

Offline only: `node scripts/wh-r1-trucks/build.mjs [installed-playwright-module]`.
Uses the existing Chrome, local Three r185 and PERF-LOAD-2 GLTFExporter; no install or download.
Generates three self-contained gzip GLBs and a geometry / hash manifest in `office3d/assets/compact/wh-trucks/`.
JavaScript source fingerprints normalize CRLF to LF; binary asset hashes use the original bytes.
The logo input is the repository's `office3d/assets/logo.png`. Other textures are deterministic canvas drawings.

Local model axis: +Z points forward; ground Y=0; envelope 2.55 × 4.0 × 16.5 m.
18 tyres on 5 axles: tractor front single / rear dual, trailer three dual axles. No animations.
Levels, loading-bridge height and dock interface remain UNKNOWN.

`loadWhR1Semitrailers({root,renderer,bays,quality,env})` accepts world-space bay records:
`{id, fleetNumber: 1..9, dockDoor, x, y, z, yaw}` (radians).
Call `update(camera)` and `dispose()`; changing quality.tier or env.night is supported.
Bay inputs are snapshotted; rebuild the module if SITE changes them. No built-in world positions.
The module is deliberately NOT called from the current warehouse registry. B2 will connect SITE's accepted table.
No collision objects are registered in B1; SITE/B2 must register the accepted 16.5 m envelopes.

Near / medium / far have separate exported geometries and hysteresis. High mixed LOD uses at most 14 material batches.
Low uses one fleet-wide medium/far choice from the nearest bay so mixed distances cannot double its three-call limit.
Only vehicle materials use the private RoomEnvironment PMREM; scene.environment is never assigned here.

RoomEnvironment provenance: https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/jsm/environments/RoomEnvironment.js
Version r185, MIT. Previously authorized local copy, with import redirected to local three.module.js and license header.
SHA-256: 3f55a8cd2a0c576650bb9a21f9003177442e1e9b8c95732976c46c1805ffa7b5.

Evidence preview is outside the repository. It calls the actual env.js daylight/night formulas, at application exposure 0.85,
with existing warehouse sky/hemisphere/fill lights. Preview numbers are truck module increments, not whole-page approval.
