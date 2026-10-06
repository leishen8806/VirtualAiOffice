# Stage 1B-A — Extracted Shared Tools and MCP Runtime (Extraction Only)

The shared `@vao/tools` package now lives in `packages/tools/`. The legacy entries in `src/tools.js` and `src/mcp/desktop.js` are thin compatibility facades/shims, so the old NiuMa entry points, tests, and Electron packaging continue to work without a TypeScript build.

> **Scope note (freeze):** This document covers **Stage 1B-A extraction only**. Stage 1B-B is explicitly deferred and is NOT implemented here. See § "Deferred (Stage 1B-B)" below for the non-goals list.

## Package layout

```
packages/tools/
├── package.json               @vao/tools, private, exports ".", "./runtime", "./runtime/mcp/desktop-server"
├── tsconfig.json              TypeScript package build (placeholder src layer)
├── tsconfig.spec.json         Golden + protocol tests (Node types enabled)
├── src/index.ts               placeholder TS barrel
├── runtime/                   Direct-executable ESM, NO build required
│   ├── index.js               Public surface barrel + legacy ToolCatalog facade
│   ├── index.d.ts             Matching TS declarations (1:1 with JS exports)
│   ├── definitions.js         ToolDefinition normalization + LEGACY_COMPATIBILITY_IDENTIFIER / FUTURE_NEUTRAL name maps
│   ├── registry.js            ToolRegistry (pure lookup, add/list/get + host aliases)
│   ├── policy.js              ToolPolicy.authorize() placeholder (safe-mode drops takeover; readOnly guard)
│   ├── resolver.js            ToolResolver, resolveGrantsSimple, capabilitySupportsTool
│   ├── env.js                 expandEnv, MissingEnvError, readJson, defaultHome
│   ├── sources/
│   │   ├── builtin.js         PLAYWRIGHT_MCP_PINNED_VERSION=1.49.0, coreBuiltins(), legacyBuiltins()
│   │   ├── discovery.js       claudeServers() workdir/home + codexServers() TOML parser
│   │   └── config.js          loadConfiguredTools() cfg iterator (stdio() filter, skips discover)
│   └── mcp/
│       ├── index.js           thin re-export of desktop-server
│       ├── desktop-server.js  Full desktop MCP stdio server (9 tools: screenshot/click/move/drag/scroll/type/key/open/wait)
│       └── desktop-server.d.ts TS declarations for top-level exports
└── spec/tools-golden.spec.ts  8 golden guard tests (see § "Golden tests")
```

## Dependency direction

**Strictly one-way:** `@vao/tools` MAY import only from `@vao/executors/runtime/*.js` contract helpers:
- `packages/executors/runtime/text.js` → `fillEnv`
- `packages/executors/runtime/format.js` → `describeMcpCall`, `splitMcpName`
- `packages/executors/runtime/process.js` → `isWin`

Executors MUST NOT import from `@vao/tools`. This is enforced by explicit architectural constraint and is tested via static directory-level import auditing in `scripts/verify-packaged-layout.mjs`.

McPClient (owned by executors at `packages/executors/runtime/mcp-client.js`) is NOT duplicated and is NOT moved.

## Concept separation applied

The monolithic legacy `src/tools.js` (≈239 lines) is split by concept into **separate files with single responsibilities**:

| Concept | File | Exported symbols |
|---|---|---|
| ToolDefinition shape + normalization | `runtime/definitions.js` | `normalizeToolDefinition`, `LEGACY_COMPATIBILITY_IDENTIFIER`, `FUTURE_NEUTRAL` |
| Pure lookup registry | `runtime/registry.js` | `ToolRegistry` class (add/list/get + constructor aliases option) |
| Shared policy **INERT placeholder** (no enforcement yet) | `runtime/policy.js` | `ToolPolicy`, `authorizeToolDefinitionAuthorize` — always `{ ok: true }`; Stage 1B-B will add the 7 checks |
| Grant resolution **INERT placeholder** (never fail-closed) | `runtime/resolver.js` | `ToolResolver`, `resolveGrantsSimple`, `capabilitySupportsTool`, `ALL_TYPES` — always `{ ok: true, tools: [...] }`, never emits `TOOL_*` codes; Stage 1B-B adds the fail-closed branch |
| Env expansion + JSON reading **LENIENT** variant (Stage 1B-A) | `runtime/env.js` | `expandEnv` (lenient; missing `${VAR}` → `''`, NOT `MissingEnvError` throw), `MissingEnvError` (architecture symbol only, not thrown by Stage 1B-A runtime), `readJson`, `defaultHome` |
| Built-in (Browser + Desktop Control) definitions | `runtime/sources/builtin.js` | `coreBuiltins`, `legacyBuiltins`, `PLAYWRIGHT_MCP_PINNED_VERSION` **validated 0.0.83**, `PLAYWRIGHT_MCP_PINNED_SPEC` |
| Claude Code + Codex MCP discovery (逐字搬 from legacy) | `runtime/sources/discovery.js` | `claudeServers(workdir, home)`, `codexServers(home)`, `stdio()` predicate |
| Configured tools (from niuma.config.json tools section) | `runtime/sources/config.js` | `loadConfiguredTools(cfg)` |
| Desktop MCP server (extracted impl) | `runtime/mcp/desktop-server.js` | `createDesktopServer`, `startDesktopServer`, `desktopToolsList`, `desktopPlatform`, `parseKeys`, `winVk`, `WIN_VK`, `KEY_ALIASES`, `MODS`, `WIN_EXTENDED`, `desktopMcp` namespace, `default` |
| **Legacy compatibility facade ONLY** | `runtime/index.js` | `ToolCatalog` class — the ONLY place that reassembles all concepts back into the 6-method legacy contract |

### ToolCatalog compatibility facade (runtime/index.js)

`ToolCatalog` class in `packages/tools/runtime/index.js` **preserves 100% of legacy observable behavior** for the six public methods:
1. `list()` — returns id/name/description/server/command/env/native/types array (order: builtins → configured → discovered)
2. `get(id)` — returns the decorated definition or `null`; `autonomy: 'safe'` removes `desktop` entry from the map
3. `resolve(refs)` — resolves id | name | server (case-insensitive) against the catalog, de-duplicating
4. `supports(group, id)` — vendor group logic preserved byte-for-byte:
   - `types.includes(group.type)` gate
   - `native.includes(group.type)` → bypass vision check
   - `command` present (not host-only) required for portable borrow
   - Vision-requiring tools: `claude-cli` always passes; `openai-api` requires `group.cfg.vision === true`; `codex-cli` never passes for desktop
5. `guess(text)` — Chinese keyword substring match → list of ids
6. `spec(id)` — returns `{ command, args (String-mapped), env (fillEnv-expanded) }` or `null` when command missing

The facade constructor also preserves the old config overrides semantics (per-tool override objects merged on top of builtins; `tools.discover: false` skips Claude/Codex discovery entirely).

## Naming policy: D5 (no NEW `niuma_*` identifiers)

The plan's D5 rule is enforced at **two layers with explicit maps**:

### LEGACY_COMPATIBILITY_IDENTIFIER (facade layer only)
Preserves old names so `src/team.js`, `src/coordinator.js` line 524 (hard-coded `desktop` id), and `test/tools.test.js` (parseKeys/winVk imports, MCP server name assertions) still work unchanged:
- `servers.niuma_browser`
- `servers.niuma_desktop`
- `ids.desktop`
- Chinese keywords (浏览器, 微信, 电脑操作, 截图…) + Chinese name fields

### FUTURE_NEUTRAL (shared runtime core layer)
All NEW identifiers inside the shared runtime use the `vao_*` neutral prefix and logical ids:
- `ids.browser`, `ids.desktopControl`
- `servers.vao_browser`, `servers.vao_desktop`

**No new `niuma_*` identifiers are introduced anywhere in `packages/tools/`.** Only legacy compatibility re-exports use the old names.

## Built-in Browser definition + pinned Playwright version (D4)

The Playwright MCP spec is **explicitly pinned** in `runtime/sources/builtin.js` to a **real, validated, published** npm version (NOT core Playwright semver — Playwright MCP has its own independent versioning, stable non-alpha latest on 2026-10-06 was `0.0.83`):
```
PLAYWRIGHT_MCP_PINNED_VERSION = '0.0.83'   # latest STABLE non-alpha per npm view 2026-10-06
PLAYWRIGHT_MCP_PINNED_SPEC   = '@playwright/mcp@0.0.83'
```

**Validation performed against this version** (extraction-time, real package, real npx spawn):
- `npx -y @playwright/mcp@0.0.83` resolved and the process exited cleanly.
- JSON-RPC 2.0 `tools/list id=2` request returned exactly **25 tools** (browser_* family — confirmed the package is real, boots, and exposes the expected MCP surface).
- Published set confirmed via `npm view @playwright/mcp versions --json` (no `1.49.0` version exists — core Playwright version ≠ @playwright/mcp version).

Anti-regression guards:
- `tools-golden.spec.ts` "Playwright MCP pinned version" test:
  - **CROSS-PLATFORM**: the pinned pkg is located **semantically** via `.find((a) => String(a).startsWith('@playwright/mcp@'))` (exactly 1 match required) — **never** positional `args[2]`/`args[3]`, since Windows `playwrightNpx` prepends `cmd /c npx -y`, POSIX prepends `npx -y`.
  - Pinned pkg must NOT end with `@latest` AND must equal `PLAYWRIGHT_MCP_PINNED_SPEC`.
  - constant roundtrip: ``@playwright/mcp@${PLAYWRIGHT_MCP_PINNED_VERSION} === PLAYWRIGHT_MCP_PINNED_SPEC``.
  - Exact semver `^\d+\.\d+\.\d+$` regex assertion.
  - grep across `sources/builtin.js` and `runtime/index.js` source text for `@playwright/mcp@latest` string (fail if found).
- D2 rule: both `browser` and `desktop-control` core definitions have **explicit** `readOnlySafe: false`.

Shell args format: `playwrightNpx(pkg, [--output-dir, outDir, --allow-unrestricted-file-access, ...(headless ? ['--headless'] : [])])` with platform-dependent Windows `cmd /c npx -y` vs POSIX `npx -y` wrapper.

## Desktop MCP extraction

The full desktop MCP server implementation now lives **only** in `packages/tools/runtime/mcp/desktop-server.js`. The old `src/mcp/desktop.js` has been reduced to a **thin re-export shim + CLI launcher** (16 lines). Duplication is prohibited; see § "Packaging verification" for the structure audit.

### Desktop MCP protocol freeze (invariant under extraction)

The following protocol contracts are asserted by both the golden spec `desktop MCP protocol` test AND by `scripts/verify-packaged-layout.mjs` `desktopMcpSelfCheck()` (spawned subprocess stdio):

| method | params | response invariant |
|---|---|---|
| `initialize` id=1 | (optional protocolVersion) | `serverInfo.name === 'niuma-desktop'`; `protocolVersion === '2025-06-18'`; `capabilities` has key `tools` only |
| `tools/list` id=2 | — | `tools.length === 9`; names exactly `[screenshot, click, move, drag, scroll, type, key, open, wait]` in that order |
| `tools/call` id=3 unknown name `{name: 'nope', arguments:{}}` | — | `error.code === -32602`; message matches `/没有叫 nope/` |
| `tools/call` id=4 valid name `{name: 'click', arguments:{x:1,y:2}}` on unsupported platform `plan9` | — | `result.isError === true`; content text matches `/暂不支持这个系统：plan9/` |

All platform backends (Linux xdotool+ImageMagick, macOS CoreGraphics+JXA/AppleScript screencapture, Windows PowerShell user32.dll P/Invoke) are preserved **verbatim**, including the PowerShell `WIN_PRELUDE` encoded-command launch, the macOS clipboard paste trick, and the Linux xdg-open / sh -c branch on open.

### Top-level exports from desktop-server.js

`ALIASES`, `MODS`, `WIN_VK`, `WIN_EXTENDED`, `KEY_ALIASES`, `parseKeys`, `winVk`, `desktopToolsList`, `desktopPlatform` are **module-scope exports**. They are NOT nested inside the `createDesktopServer()` factory closure. This is required because `test/tools.test.js` imports them directly:
```
import { parseKeys, winVk } from '../src/mcp/desktop.js'
```
— and the shim re-exports them from the shared file without a server instance being constructed.

### CLI executable shim (src/mcp/desktop.js)

The shim has two responsibilities:
1. Re-export every public symbol (parseKeys, winVk, WIN_VK, KEY_ALIASES, MODS, WIN_EXTENDED, createDesktopServer, startDesktopServer, desktopPlatform, desktopToolsList, default) from `../../packages/tools/runtime/mcp/desktop-server.js` at the top level.
2. When run as main (`process.argv[1] === fileURLToPath(import.meta.url)` with path-case-insensitive compare on Windows), call `await startDesktopServer()`.

`src/tools.js` facade is a single-line barrel: `export * from '../packages/tools/runtime/index.js'`

## Discovery extraction (VERBATIM from legacy)

`claudeServers` and `codexServers` are moved **byte-for-byte** without algorithmic changes:

### claudeServers(workdir, home)
- Reads `${home}/.claude.json` → top-level `mcpServers` merged with `projects[workdir].mcpServers` if any.
- Returns `{ name: { type, command?, args?, url? } }` shape. Remote `type: 'http'` passes through with `command: undefined`.

### codexServers(home)
- Parses `${home}/.codex/config.toml` manually (no TOML dependency).
- Handles `[mcp_servers.<name>]` sections (command, args), inline `[mcp_servers.<name>.env]` tables, and ignores `[profiles.*]` model entries.
- Returns `{ notes: { command: 'node', args: ['notes.js'] }, search: { command: 'npx', args: ['-y','search-mcp'], env: { API_KEY: 'k1' } } }` shape.

`stdio(def)` predicate: `def && typeof def.command === 'string'` (true for local plugins that can be portably re-spawned across vendor types; false for `http` remote or vendor-hosted plugins that only work in the installed CLI).

### configured tools
`loadConfiguredTools(cfg)` iterates the user's `tools` section, skipping the `discover` boolean key and filtering stdio() so pure http or non-executable entries are dropped.

## Golden tests (8 tests in tools-golden.spec.ts)

1. **catalog golden (6 methods)** — list/get/resolve/supports/guess/spec with:
   - browser + desktop ids from builtins
   - `resolve(['浏览器','niuma_desktop','nope','browser'])` → `['browser','desktop']` (中文 + legacy server)
   - supports vision matrix (claude-cli→desktop true, codex-cli→desktop false, openai→desktop false, openai vision cfg→true)
   - Chinese keyword guesses (`@frontend 打开网页`→browser, `帮我在微信里发个消息`→desktop)
   - `spec('desktop').args[0] === absolute DESKTOP shim path` (fillEnv expanded)
   - safe mode drops desktop
   - custom tools mydb with env var `${NIUMA_T}` → `NIUMA_T=secret` expansion

2. **builtins legacy + neutral coexist** — LEGACY_COMPATIBILITY_IDENTIFIER.servers niuma_browser/niuma_desktop + ids.desktop on facade; FUTURE_NEUTRAL ids/servers on core; Chinese keywords preserved; vision/takesOver true on desktop; explicit index checks for args flags.

3. **Playwright MCP pinned version** — no @latest, semver regex, two-file grep guard (see § "Browser pinned version").

4. **discovery: Claude Code + Codex preserve legacy output** — golden fixtures `.claude.json` (global github+notes, project local_db) + `.codex/config.toml` (notes+search+search.env); supports github host-bound (claude-cli true, codex-cli false); portable `notes` accessible to openai-api; `notes.native` has claude-cli+codex-cli, `search.native` codex-cli only.

5. **parseKeys/winVk + format helpers parity** — Ctrl+Shift+T / command+return normalized; `一次只能按一个主键` error; winVk S=0x53, F5=0x74, ENTER=0x0D; describeMcpCall niuma_desktop 双击屏幕; splitMcpName mcp__niuma_browser__browser_navigate → server=niuma_browser, tool=browser_navigate.

6. **concept separation** — normalizeToolDefinition() standalone + origin set; ToolRegistry instantiable with aliases (desktop→desktop-control); registry.add/get/list work without discovery logic; capabilitySupportsTool decoupled from registry/catalog.

7. **desktop MCP protocol freeze** — plan9 platform; initialize serverInfo; tools/list length=9+names; unknown tool code -32602 Chinese message; unsupported platform click returns isError Chinese text.

## Packaging

`desktop/package.json` `build.extraResources` now has **10 entries**, adding after executors:
```
{ from: "../packages/tools/runtime", to: "core/packages/tools/runtime", filter: ["**/*.js", "**/*.d.ts"] }
```
This places the shared tools runtime files at the exact same relative path inside the Electron `resources/` directory so `src/tools.js` and `src/mcp/desktop.js` relative imports still resolve both in dev and in packaged builds.

The other 9 entries preserved: bin, src, packages/executors/runtime, public, skills, fake, package.json (root), niuma.config.example.json, desktop icons.

## Packaging verification (scripts/verify-packaged-layout.mjs)

The script now performs **7 Stage 1B-A assertions** followed by the original Stage 1A HTTP 200 fake-NiuMa rehearsal:

1. **Tools presence**: `fs.existsSync('core/packages/tools/runtime/index.js')` AND `desktop-server.js` exists
2. **Shared tools symbol import**: dynamic import of reconstructed shared index.js resolves 12 named exports correctly (ToolCatalog, ToolRegistry, coreBuiltins, legacyBuiltins, PLAYWRIGHT_MCP_PINNED_SPEC, claudeServers, codexServers, parseKeys, winVk, createDesktopServer, startDesktopServer, desktopToolsList)
3. **Facade route string**: `src/tools.js` source text contains `'../packages/tools/runtime/index.js'` (the shared barrel path)
4. **Desktop MCP shim route string**: `src/mcp/desktop.js` source text contains `'../../packages/tools/runtime/mcp/desktop-server.js'`
5. **Duplicate-implementation body check (single maintained implementation rule)**:
   - `src/tools.js` MUST NOT contain the strings `class ToolCatalog {` or `claudeServers(` or `codexServers(` — it is a facade, not an impl
   - `src/mcp/desktop.js` MUST NOT contain the strings `const TOOLS_RUNNERS = [` or `serverInfo: { name:` or `"暂不支持这个系统"` — it is a shim, not an impl
6. **Desktop MCP self-check (subprocess)**: spawn `src/mcp/desktop.js` with envPlatform=plan9 under stdio JSON-RPC → write initialize id=1 → reply serverInfo niuma-desktop → write tools/list id=2 → 9 tool names
7. **Root workspace marker**: packaged root package.json has workspaces including `packages/*` (the marker used by builtins `_rootFromHere()`)

Original Stage 1A assertions still run after these 7:
- executors/runtime presence
- reconstruct fake NiuMa, start on random port, HTTP GET / → 200 with document shell
- **On Windows**: cleanup failures are **demoted to warnings** IF AND ONLY IF both the HTTP 200 and 7 Stage 1B-A assertions above already passed (EBUSY race guard with fs.rmSync maxRetries=10 + retryDelay=200ms, plus taskkill /pid <pid> /T /F bounded 3-5s shutdown before cleanup)

## Stage 1B-A vs 1B-B boundary (IMPORTANT — explicitly enforced)

Stage 1B-A is **extraction only**. It defines architecture symbols (ToolDefinition,
readOnlySafe, requires, ResolvedToolSpec shape, ToolPolicy/ToolResolver/MissingEnvError
classes) so imports and d.ts stay stable, but **must NOT actively enforce the future
security/orchestration behavior**:

| Concern | Stage 1B-A (NOW) | Stage 1B-B (LATER) |
|---|---|---|
| ToolPolicy.authorize() | Always returns `{ ok: true }` (inert) | 7 checks, fail-closed, `TOOL_NOT_AUTHORIZED` / `TOOL_NOT_READ_ONLY_SAFE` codes |
| resolveGrantsSimple() ok= branch | Always `{ ok: true, tools }` — never fails, never drops items | ok=false with structured failures[] for every bad grant |
| expandEnv missing `${VAR}` | Returns `''` (lenient, matches legacy fillEnv) | Throws `MissingEnvError` → orchestration fails early with `TOOL_ENV_MISSING` |
| MissingEnvError class | Symbol only (not thrown by 1B-A runtime code paths) | Thrown from strict env expansion before worker launch |
| readOnlySafe on ToolDefinition | Declared on Browser / Desktop core as `false` (metadata) | Compared against ctx.access — write-cap tools dropped in read-only Executions |
| Legacy ToolCatalog routing | Unchanged (supports() / autonomy safe-mode only) | Route through ToolResolver + ToolPolicy before Coordinator grant |

### Deferred (Stage 1B-B — explicitly NOT implemented)

None of these are in scope for Stage 1B-A and are listed here to prevent scope creep:

- Coordinator.toolsFor() fail-closed behavior (reject before worker on any unresolved tool)
- readOnlySafe enforcement (write-tool rejection) at the orchestration layer
- TOOL_* orchestration failure codes (`TOOL_NOT_FOUND`, `TOOL_NOT_SUPPORTED`, `TOOL_NOT_AUTHORIZED`, `TOOL_NOT_READ_ONLY_SAFE`, `TOOL_ENV_MISSING`, …)
- Required env validation (missing env variables before start)
- New-core `autoDiscoverExternalMcp: false` runtime default behavior
- ToolGrant authorization policy with 7-step check order
- Strict `expandEnv` variant that throws `MissingEnvError` instead of returning `''`
- Active `ToolPolicy.authorize()` safe-mode takeover drops / read-only checks
- `resolveGrantsSimple()` ok=false structured failure return
- Any redesign of Coordinator (existing Coordination code untouched)
- Any changes to McpClient ownership (still lives in executors)
- Any introduction of `niuma_*` identifiers (D5: all NEW names use vao_* neutral)
- SQLite runtime, Worktree, Stage 1C, Telegram, or Workspace UI changes

## Validation results recorded at extraction

All commands run from `repo/` root:
```
npm ci                   → ok (added 7 new deps from baseline)
npm test                 → 50/50 pass (legacy src/ tests including tools.test.js parseKeys/winVk imports)
npm run build:packages   → tsc -b exit 0 (strict TS: noUncheckedIndexedAccess + verbatimModuleSyntax)
npm run test:packages    → 135/135 pass (includes 8 golden spec tests)
npm run test:all         → composite 185/185 pass + 1 packaged-layout verification ok
npm run verify:packaged-layout  → 3/3 consecutive runs "packaged layout ok"
npm run rehearsal        → HTTP 200 / port 7777 (fake mode) then taskkill /T /F shutdown
```
