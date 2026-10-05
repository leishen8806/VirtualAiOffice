# Stage 1A — Extracted Executor Runtime (Final Implementation)

The reusable executor implementation now lives in `packages/executors/runtime/` as direct ESM JavaScript. The legacy NiuMa worker entry points in `src/workers/` and `src/mcp/client.js` are compatibility re-exports, so legacy startup and tests do not need a TypeScript build.

## Public runtime

`packages/executors/runtime/index.js` exports the CLI workers, OpenAI-compatible worker, MCP client, parsers, process helpers, policy constants, and the `WORKER_TYPES` map. `packages/executors/runtime/index.d.ts` declares the **exact same public surface** as the JS module; a bidirectional guard test in the adapter-compliance suite fails if either side drifts.

Activity is produced in two layers:
- The **legacy enumerable** shape `{ kind, text }` is preserved **byte-for-byte** so the existing office display remains unchanged (Chinese labels, ordering, enumerability).
- The **canonical structured** payload is attached non-enumerably as `activity`, created at the source while the executor/tool name is still known — never by post-hoc Chinese-string parsing. The activity taxonomy is: `file.read`, `file.write`, `search`, `command.run`, `test.run`, `tool.call`, `message`, `thinking`, driven by the adapters below.

## Adapters

The TypeScript package `@vao/executors` exports three concrete adapters plus two normalization helpers re-exported from the legacy-backed module:

### Concrete adapters
- **`ClaudeCliAdapter`** (`claude-code`) — drives the shared `ClaudeCliWorker`. Subscription billing, vision on.
- **`CodexCliAdapter`** (`codex`) — drives the shared `CodexCliWorker`. Subscription billing, vision off.
- **`OpenAICompatAdapter`** (`openai-compatible`) — drives the shared `OpenAIWorker` for DeepSeek, relays, local servers, etc. Usage billing. **Vision support is NOT always true**: it derives strictly from `group.vision === true`, otherwise `canUseVision` reports `false`; an unconfigured default group reports `false`. A compliance guard asserts the three configurations (`false`, `true`, omitted) each produce the expected capability.

Every adapter:
1. Validates the `ExecutionSpec` (fields, absolute `workdir`, positive budget, capability vs access mismatch).
2. Resolves all `ToolGrant` entries **before** spawning a worker — if `spec.tools.length > 0` and `resolveTool` is absent or any grant returns undefined, `start()` rejects with `required tool grant could not be resolved: <id>` and no process or HTTP round-trip is started.
3. Passes `spec.workdir` per-attempt (not the worker constructor default) and enforces `access === 'read_only'` via adapter-specific flags (`--disallowedTools Write/Edit/...` for Claude; `-s read-only` for Codex; the OpenAI toolbox simply refuses write-tool calls).
4. Streams canonical activity (see mapping table below) via a non-enumerable `activity` property.
5. Maps the legacy parser session id onto `ExecutionResult.sessionRef` where the underlying CLI reports one.
6. Always resolves `ExecutionHandle.result` — never rejects; failures, cancellations and timeouts all become an `outcome` literal.
7. Reports token usage using a normalizer that accepts both legacy shapes (`usage.in / usage.out` from OpenAIWorker) and API-native shapes (`usage.input_tokens / usage.output_tokens` from Codex), plus the same normalizer unifies the cost from any `cost` number reported by the worker.
8. `cancel(executionId)` is idempotent; repeated aborts resolve without error and the result outcome is `cancelled`. A hard wall-clock budget reports outcome `timed_out`.

### Canonical activity mapping (structured, machine-readable)

| Source event | Canonical activity.type | Notes |
|---|---|---|
| **Claude**: `Read` | `file.read` | path workdir-relative via `shortPath` |
| **Claude**: `Write / Edit / MultiEdit / NotebookEdit` | `file.write` | |
| **Claude**: `Bash` | `command.run` or `test.run` | classified by `commandActivity()` (npm/pytest/vitest/go test etc.) |
| **Claude**: `Grep / Glob` | `search` | query = pattern or glob; optional path |
| **Claude**: `mcp__<server>.<tool>` | `tool.call` | |
| **Claude**: assistant text block | `message` | |
| **Claude**: thinking block | `thinking` | |
| **Codex**: `command_execution` | `command.run` or `test.run` | classified by `commandActivity()` |
| **Codex**: `file_change` | `file.write` | |
| **Codex**: `web_search` | `search` | |
| **Codex**: `mcp_tool_call` | `tool.call` | `server.tool` |
| **Codex**: `agent_message` | `message` | |
| **Codex**: `reasoning` | `thinking` | |
| **OpenAI compat**: `read_file` | `file.read` | |
| **OpenAI compat**: `write_file / edit_file` | `file.write` | |
| **OpenAI compat**: `search` | `search` | |
| **OpenAI compat**: `run_command` | `command.run` or `test.run` | classified by `commandActivity()` |
| **OpenAI compat**: `<server>__<tool>` (MCP) | `tool.call` | |
| **OpenAI compat**: assistant final message | `message` | (also emitted on the non-tool terminal turn — a fix applied during 1A review so the final report is visible as activity) |

### Normalization consolidation (legacy-backed adapter)
`mapLegacyActivity` and `mapLegacyResult` now live as named exports **inside** `legacy-backed.ts`. `activity-map.ts` and `result-map.ts` were **removed** (no duplication). `mapLegacyResult` accepts both token shapes (`usage.in/out` and `usage.input_tokens/output_tokens`) and falls back to `durationMs = Date.now() - started` when the worker omits it. The legacy runtime result object itself is **not mutated**.

### Fail-closed ToolGrant resolution
`toolConfig()` inside the legacy-backed adapter runs **before** `worker.run()` is scheduled and throws `required tool grant could not be resolved: <id>` whenever:
- `spec.tools.length > 0` but no `resolveTool` callback was provided, OR
- any individual `resolveTool(grant)` returns `undefined/null`.

Six targeted regression tests cover: no resolver, resolver returning undefined, partial failure in a multi-tool list, all-tools-resolve, empty-tools list skipping the check, and *rejection-before-worker-spawn* verified by confirming a process-side capture file was never written.

## Compliance suite
`packages/executors/spec/adapter-compliance.spec.ts` runs the **real** adapter classes (not a stub) against:
- a temporary inline Node fake-CLI script acting as Claude/Codex subprocess
- an ephemeral in-process fake HTTP server acting as the OpenAI-compatible endpoint

For each of the three adapter kinds the suite asserts **14 compliance checks**:
1. valid `ExecutionSpec` starts → handle has `events[AsyncIterable]` and `result[Promise]`
2. `ExecutionHandle.result` always resolves within 15s (never rejects)
3. event stream terminates on its own (deadline-guarded against infinite iteration)
4. `cancel()` is idempotent — three parallel cancels succeed together
5. cancelled execution → `outcome === 'cancelled'`
6. hard budget exceeded → `outcome === 'timed_out'`
7. `read_only` is enforced: Claude emits `--disallowedTools` with write tools blocked; Codex emits `-s read-only`
8. `spec.workdir` wins over constructor default: the subprocess `cwd` equals the spec workdir
9. canonical structured activity types listed above are emitted in at least one run
10. session id → `sessionRef` (Claude/Codex report; OpenAI undefined is fine)
11. `ToolGrant` resolution rejects before worker launch with correct message format
12. token usage normalization matches expected totals across both shapes
13. cost normalization matches `total_cost_usd` where reported (Claude)
14. declared capabilities match configuration exactly, including `canUseVision` derived strictly from the group option, not hardcoded.

The package test count increased from a baseline of **56 → 110 tests** after Stage 1A review fixes landed.

## JS ↔ d.ts consistency guard
A standalone sub-suite under `FIX 4` imports the actual runtime ESM module and the corresponding `runtime/index.d.ts` text, then separately asserts:
- JS has no symbol missing from d.ts
- d.ts declares no symbol missing from JS
- exact sorted-set equality in both directions

The regex matches `export [declare] (class|const|function) NAME` lines in the d.ts and `Object.keys(runtime)` from the live module.

## Packaging
`desktop/package.json` `build.extraResources` copies:
```
../bin    → core/bin
../src    → core/src
../packages/executors/runtime (**/*.js, **/*.d.ts) → core/packages/executors/runtime
../public → core/public
../skills → core/skills
../fake   → core/fake
../package.json → core/package.json
../niuma.config.example.json → core/niuma.config.example.json
```

`scripts/verify-packaged-layout.mjs` reconstructs the `core/` tree in `os.tmpdir()` from the **declared** `extraResources` list, then verifies all of the following without requiring Electron:
1. `core/src` exists
2. `core/bin` exists
3. `core/fake` exists
4. `core/packages/executors/runtime` exists
5. legacy shims `core/src/workers/{base,cli,openai}.js` each contain `../../packages/executors/runtime/index.js`
6. `core/src/workers/` contains **exactly** the three shim files; any additional `.js` implementation file is treated as a duplicate-runtime-layout failure
7. starts `node core/bin/niuma.js --fake --port <free-port>` as a child process
8. polls `/health` (root route HTTP 200) until readiness within 15 s
9. asserts the response status is 200
10. `SIGTERM`s the child and waits for `close`.

A root npm script `verify:packaged-layout` runs it, and `.github/workflows/ci.yml` already exercises it on both `ubuntu-latest` and `windows-latest` through `npm run test:all` = `npm test && npm run test:packages && npm run verify:packaged-layout`.

## Differences from the frozen Stage 1A plan
1. **Review item scope of activity normalization**: The plan talked about activity+result normalization; during implementation it became clear that `activity-map.ts` and `result-map.ts` were thin wrappers used only by `legacy-backed.ts`, so consolidation moved both helpers **into** that one file and deleted the two satellite files. The original plan had only mentioned "consolidate", not "delete satellite files" — doing both produced a strictly smaller public surface with no duplication.
2. **OpenAI final-message activity emission**: Original runtime code returned `finish({ok:true, text})` on the terminal assistant turn *before* emitting a `message` activity, so the final report never showed as structured activity even though all non-terminal turns did. The review required canonical activity coverage, so the emit order was swapped (`onActivity(message)` first, then `finish()` return). Legacy `{kind,text}` display is unaffected because the same text still reaches the summary string independently.
3. **Compliance harness fresh-per-test for HTTP-backed adapters**: The plan implicitly assumed one shared fake API sufficed for all 14 checks. In practice the fake server must alternate "tool call round" vs "final answer" responses based on a per-request counter, so sharing a single API server across 14 sequential sub-tests produced stale state. The implementation spins up a **dedicated fresh fake API + new adapter instance** per HTTP-sensitive sub-test (checks 3, 6, 9, 12 for the OpenAI kind). No change was needed for Claude/Codex adapters since the inline fake script per invocation is already stateless.
