const TEST_COMMAND = /(^|\s|\/)(npm|pnpm|yarn)\s+(run\s+)?test\b|\b(pytest|vitest|jest|mocha|go\s+test|cargo\s+test|node\s+--test)\b/

/**
 * Preserve legacy enumerable shape {kind, text} exactly for the office UI.
 *
 * The non-enumerable canonical `activity` payload is attached ONLY when the caller
 * supplies `extra.activity` explicitly with machine-readable data. Display-only
 * bubbles (warnings, todo-list labels, localized plugin-preparation strings, …)
 * must NOT be reconstructed from localized `kind`/`text` — callers that omit
 * `extra.activity` get no structured ExecutorEvent for that line.
 */
export function legacyActivity(kind, text, extra = {}) {
  const out = { kind, text }
  if (extra && extra.activity !== undefined) {
    Object.defineProperty(out, 'activity', { value: extra.activity, enumerable: false })
  }
  return out
}

export function commandActivity(command) {
  const c = String(command || '').trim()
  return TEST_COMMAND.test(c) ? { type: 'test.run', command: c } : { type: 'command.run', command: c }
}
