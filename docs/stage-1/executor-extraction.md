# Stage 1A — Extracted Executor Runtime

The reusable executor implementation now lives in `packages/executors/runtime/` as direct ESM JavaScript. The legacy NiuMa worker entry points in `src/workers/` and `src/mcp/client.js` are compatibility re-exports, so legacy startup and tests do not need a TypeScript build.

## Public runtime

`packages/executors/runtime/index.js` exports the CLI workers, OpenAI-compatible worker, MCP client, parsers, process helpers, policy constants, and the `WORKER_TYPES` map. `activity` is attached non-enumerably to legacy `{ kind, text }` activity objects so the existing office display remains unchanged while adapters can emit structured events.

## Adapters

The TypeScript package exports `ClaudeCliAdapter`, `CodexCliAdapter`, and `OpenAICompatAdapter` through `@vao/executors`. DeepSeek and other compatible providers use `OpenAICompatAdapter` configuration. Tool grants remain generic and are resolved by the caller.

Each adapter validates an execution spec, passes `workdir` and cancellation to the shared worker, preserves parser session ids as `sessionRef`, streams structured activity, and always resolves a terminal result.

## Packaging

Electron copies `packages/executors/runtime/` once to `core/packages/executors/runtime/`. The packaged-layout check imports that copied runtime and verifies the legacy worker entries are shims.
