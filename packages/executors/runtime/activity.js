const TYPES = { tool: 'tool.call', say: 'message', think: 'thinking', warn: 'message' }

/** Preserve legacy enumerable fields while attaching the Stage 1A activity payload. */
export function legacyActivity(kind, text, extra = {}) {
  const value = kind === 'tool' ? { type: 'tool.call', tool: text, ...extra } : { type: TYPES[kind] || 'message', ...(kind === 'think' ? {} : { text }), ...extra }
  const out = { kind, text }
  Object.defineProperty(out, 'activity', { value, enumerable: false })
  return out
}
