export function loadConfiguredTools(cfg = {}) {
  if (!cfg || typeof cfg !== 'object') return []
  const out = []
  for (const [id, def] of Object.entries(cfg)) {
    if (id === 'discover' || !def || typeof def !== 'object') continue
    const portable = typeof def.command === 'string' && (!def.type || def.type === 'stdio')
    if (!portable) continue
    out.push({ id, ...def, source: 'config' })
  }
  return out
}
