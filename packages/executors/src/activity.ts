/**
 * Structured activity reported by an executor while it works. Canonical data, not display text:
 * the office UI turns these into bubbles ("改 src/a.ts") in the viewer's language.
 *
 * Paths are relative to the execution workdir when possible.
 */
export type ExecutionActivity =
  | { readonly type: 'file.read'; readonly path: string }
  | { readonly type: 'file.write'; readonly path: string }
  | { readonly type: 'search'; readonly query: string; readonly path?: string }
  | { readonly type: 'command.run'; readonly command: string }
  | { readonly type: 'test.run'; readonly command: string }
  /** A tool outside the categories above, e.g. an MCP tool or a web fetch. */
  | { readonly type: 'tool.call'; readonly tool: string; readonly target?: string }
  | { readonly type: 'message'; readonly text: string }
  | { readonly type: 'thinking' }

export type ExecutionActivityType = ExecutionActivity['type']

/** Events streamed by a running execution. `at` is an ISO-8601 timestamp. */
export type ExecutorEvent =
  | { readonly kind: 'activity'; readonly at: string; readonly activity: ExecutionActivity }
  /** Liveness signal for long silent work (and for human-in-the-loop executors). */
  | { readonly kind: 'heartbeat'; readonly at: string }
  | { readonly kind: 'usage'; readonly at: string; readonly tokensIn: number; readonly tokensOut: number; readonly costUsd?: number }

const TEST_COMMAND = /(^|\s|\/)(npm|pnpm|yarn)\s+(run\s+)?test\b|\b(pytest|vitest|jest|mocha|go\s+test|cargo\s+test|node\s+--test)\b/

/** Classify a shell command: test runs get their own activity type so QA Lab can show them. */
export function commandActivity(command: string): ExecutionActivity {
  const c = command.trim()
  return TEST_COMMAND.test(c) ? { type: 'test.run', command: c } : { type: 'command.run', command: c }
}
