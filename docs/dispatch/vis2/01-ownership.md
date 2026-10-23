# VIS2-T File Ownership

## Baseline

- B0: `9e8c4f99ea29166b173d40a762178b9933c972ca`
- Integration worktree: `E:\VirtualAIOffice\vis2-t-integrator`
- Runtime scene directory: `office3d/`
- Remote-main reference `f88ebc4a54dd8441d846aaee8f9b93d79fe1e747` is not present in this shallow Office3D snapshot. It is a comparison reference only, not a reset or runtime-version claim.

## Terra Integration

Exclusive ownership:

- `office3d/app.js`
- `office3d/env.js`
- `office3d/quality.js`
- `office3d/office-v2-modules.js`
- `office3d/office-v2-registry.js`
- `office3d/visual-flags.js`
- `office3d/office-visual.json`
- `office3d/campus-visual.json`
- `office3d/index.html` and its import map
- `office3d/warehouse-shell.js`
- global layout, navigation, camera, activation, disposal, and shared-entry wiring
- `office3d/server.mjs` only for the isolated read-only `GET /visual-flags` bridge
- `docs/dispatch/vis2/*`

## Codex

Exclusive ownership:

- `office3d/office-bar.js`
- `office3d/office-layout-v2-scene.js`
- `office3d/office-furniture-v2.js`
- Office-only visual assets explicitly registered in its change request.

## Claude

Exclusive ownership:

- `office3d/dr-campus-interior.js`
- Registered warehouse-private scene modules and warehouse-private visual assets.
- `office3d/dr-console-*` data and view modules.

`office3d/dr-campus-modules.js`, `office3d/dr-campus-registry.js`, and the warehouse total loader remain integration-owned. Claude submits a precise commit and file list for any private-module addition.

## Harness

Exclusive ownership:

- New `office3d/tests/vis2-*.test.mjs` tests.
- Test fixtures and independent QA reports.

Harness must not modify product source.

## Integration Rules

- Each owner changes only the files listed above and submits self-tested commits.
- Cross-boundary fixes return to the file owner. The integrator does not edit private asset modules for convenience.
- Integration order is public wiring, office sample, warehouse sample, then independent harness review.
- No one resets, cleans, stashes, or changes another worktree. Existing source-worktree changes remain registered in the baseline and untouched.
