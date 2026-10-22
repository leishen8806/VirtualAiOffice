# Office3D source snapshot — 2026-10-22

This branch preserves the existing VirtualAiOffice repository and adds the current Office3D project under `office3d/`. Source, tests, task cards, documentation, bundled libraries and 3D assets are copied without product-code changes. `workhours/` contains the existing sibling scheduling source required by Office3D imports.

## Excluded local material

Credentials, encrypted Telegram credentials, LAN access codes, root runtime JSON/configuration (except static roadmap/map data), chat histories, event ledgers, logs, backup folders and local artifacts are intentionally not uploaded. Operational state and machine configuration must be provisioned separately. This is a source snapshot, not a complete machine backup or a turnkey deployment.

No service was started, stopped or restarted. Tests and browser acceptance were not rerun for this archival upload. Existing feature acceptance and known incomplete integrations must not be inferred from this commit.

Known pending integration: O6O7 bar/display registration remains incomplete; the display atlas callback does not match the existing injected canvasTex callback contract. This snapshot does not fix it.

Bundled third-party asset/license files are retained as supplied. Asset licensing and redistribution permissions have not been independently audited.