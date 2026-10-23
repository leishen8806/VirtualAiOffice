# VIS3-DATA-001 Baseline And Ownership

- Repository: `git@github.com:leishen8806/VirtualAiOffice.git`
- Feature branch: `feature/vis3-dr-data-001`
- Full baseline SHA: `e988a864b1804bc12b9ca8257e1bca156ce55574`
- Isolated worktree: `E:\VirtualAIOffice\vis3-dr-data-001`
- Observed local runtime: `E:\VirtualAIOffice\paperclip-ops\office3d`; it is not
  assumed to run this branch.

## Existing Contracts Reused

- `office3d/dr-console-data.js`: deterministic demo snapshot only. It does not
  represent verified operational data.
- `office3d/command-view-live.mjs`: authorization, source validation, source-age,
  and exact company-boundary patterns.
- `office3d/dr-console-map.js`: existing visual map remains UI-owned and unchanged.

## VIS3 Owned Files

- `office3d/dr-overview-data.mjs`
- `office3d/tests/dr-overview-data.test.mjs`
- `office3d/tests/fixtures/dr-overview-live.json`
- `office3d/docs/dr-overview-data-contract.md`
- `docs/dispatch/vis3/00-baseline.md`

The task does not modify `dr-console-*`, Three.js scene builders, Office V2 modules,
dashboard UI, `server.mjs`, authentication, Paperclip writes, approval, payment, or
inventory operations. A later UI consumer must use the documented read-only interface
and remain in its own ownership boundary.
