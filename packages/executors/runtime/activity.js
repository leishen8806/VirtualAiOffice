const TYPES = { tool: 'tool.call', say: 'message', think: 'thinking', warn: 'message' }
const TEST_COMMAND = /(^|\s|\/)(npm|pnpm|yarn)\s+(run\s+)?test\b|\b(pytest|vitest|jest|mocha|go\s+test|cargo\s+test|node\s+--test)\b/

/** Preserve legacy enumerable fields while attaching the Stage 1A activity payload. */
export function legacyActivity(kind, text, extra = {}) {
  const value = extra.activity || (kind === 'tool' ? { type: 'tool.call', tool: text, ...extra } : { type: TYPES[kind] || 'message', ...(kind === 'think' ? {} : { text }), ...extra })
  const out = { kind, text }
  Object.defineProperty(out, 'activity', { value, enumerable: false })
  return out
}

export function commandActivity(command) {
  const c = String(command || '').trim()
  return TEST_COMMAND.test(c) ? { type: 'test.run', command: c } : { type: 'command.run', command: c }
}
