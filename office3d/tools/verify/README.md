# Office3D verification tools

These scripts are the checked-in copies of the Q-V1 verification tools. They
run against a local static office3d directory and do not connect to 3200,
3100, Paperclip, or any external service.

## Performance gate

From the repository root:

```text
npm run verify:perf -- --place "drlife-warehouse&whr1=1"
npm run verify:perf -- --place drlife-office --q low
```

The default command measures both high and low tiers. Warehouse budgets are a
hard gate; office results are reported but do not fail CI. Exit codes are 0
(within budget), 1 (warehouse over budget), and 2 (unable to measure or page
errors).

The runner uses Playwright's bundled Chromium first. On Windows, if that
binary is unavailable, set `VERIFY_CHROME` to the local Chrome executable:

```powershell
$env:VERIFY_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
```

`budgets.json` is the single source for thresholds. `qv1-cost.mjs` and
`qv1-route-plant-probe.mjs` remain standalone diagnostics; the latter is also
covered by `tests/verify-route-plant.test.mjs`.
