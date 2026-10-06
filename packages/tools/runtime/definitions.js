const ALL_TYPES = ['claude-cli', 'codex-cli', 'openai-api']

export const LEGACY_COMPATIBILITY_IDENTIFIER = Object.freeze({
  servers: Object.freeze({ niuma_browser: 'niuma_browser', niuma_desktop: 'niuma_desktop' }),
  ids: Object.freeze({ desktop: 'desktop' }),
})

export const FUTURE_NEUTRAL = Object.freeze({
  ids: Object.freeze({ browser: 'browser', desktopControl: 'desktop-control' }),
  servers: Object.freeze({ vao_browser: 'vao_browser', vao_desktop: 'vao_desktop' }),
})

/**
 * 规范化一个 ToolDefinition 成共享包的形状。这是一个纯函数，不做磁盘 IO。
 * 分类：D2 默认 readOnlySafe:false；同名 hostBound 去重；enabled 默认 true。
 */
export function normalizeToolDefinition(raw, { origin = { kind: 'config' }, defaultServerFromId = true } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || raw.key || '').trim()
  if (!id) return null
  const r = raw
  const env = r.env && typeof r.env === 'object' && !Array.isArray(r.env) ? Object.assign({}, r.env) : {}
  const hostBound = Array.isArray(r.hostBound) ? [...new Set(r.hostBound.map(String))] : []
  const native = Array.isArray(r.native) ? r.native.map(String) : []
  const typesV = Array.isArray(r.types) && r.types.length ? [...new Set(r.types.map(String))] : ALL_TYPES.slice()
  const portable = typeof r.command === 'string' && (!r.type || r.type === 'stdio')
  const server = String(r.server || (defaultServerFromId ? id : '')).replace(/[^\w-]/g, '_')
  return Object.freeze({
    id,
    title: String(r.title || r.name || id),
    description: String(r.description || `插件 ${id}`),
    keywords: Array.isArray(r.keywords) ? Object.freeze(r.keywords.map(String)) : Object.freeze([]),
    server,
    command: portable ? String(r.command) : undefined,
    args: Array.isArray(r.args) ? Object.freeze(r.args.map(String)) : Object.freeze([]),
    env: Object.freeze(env),
    requires: Array.isArray(r.requires)
      ? Object.freeze(r.requires.filter((x) => x === 'vision' || x === 'mcp').map(String))
      : Object.freeze(r.vision ? ['vision'] : []),
    readOnlySafe: r.readOnlySafe === true,
    takesOver: r.takesOver === true,
    exclusive: r.exclusive === true,
    origin: Object.freeze(Object.assign({}, origin, r.origin ? (typeof r.origin === 'object' ? r.origin : {}) : {})),
    hostBound: Object.freeze(hostBound),
    native: Object.freeze(native),
    types: Object.freeze(typesV),
    portable,
    vision: r.vision === true,
    enabled: r.enabled !== false,
    source: String(r.source || origin.kind || 'config'),
  })
}
