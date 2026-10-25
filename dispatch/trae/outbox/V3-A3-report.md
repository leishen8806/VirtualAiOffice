# V3-A3 Report

## Baseline and Scope

- Branch: `feat/v3-align-routes`
- Baseline: `main @ 932c3a2ec4233dd0607133962dea64c8f3534248`
- OF-R3 was intentionally not merged.
- `app.js`, room/door/seat coordinates, and furniture source modules were not modified.

## Delivered

- Added ALIGN-only public-route blockers for 25 desk clearances and the deterministic 31-item open-furnishing plan.
- Added a pure-data `alignZoneObstaclePlan()` export. Its conservative planned bounds cover every renderer-registered furnishing obstacle.
- Kept stable V3 path behavior unchanged and locked its supported-route matrix hash:
  `e9fe5c4f07f63bb1945b453c75a0ffbd18e57e9590c5646f429dbb674f9bcce2`.
- Removed ALIGN display-module pending states.
- Added four-direction department door signage and ALIGN display-staff room-to-door-apron routes.
- Updated the VIS2 source manifest for the revised `align-zones.js`.

## Verification

- Focused suite: 64/64 passed.
  - Includes the 1,650-route ALIGN matrix.
  - Includes the FIX3 1,375-route V3 matrix.
  - Includes stable V3 registry mesh/collision hashes in all four quality/sample combinations.
- Full command:

  ```powershell
  node --max-old-space-size=1024 --test --test-timeout=60000 --test-concurrency=1 tests/office-*.test.mjs
  ```

  Result: 198 passed, 4 failed. All failures are unchanged isolated-worktree fixture dependencies:
  - `office3d-backup-o4/resume-20261021/app.js`
  - `office3d-backup-o2/office-layout.js`
  - `office3d-backup-o6o7/resume-20261022/app.js`
  - `office3d-backup-nav-1d/app.js`

## Final Audit

- `git diff --check` passed.
- Final file scope is reviewed against `932c3a2`; no `app.js` change is included.
- No browser run was required: neither `ui.js` nor `index.html` changed.
