import { expandEnv } from './env.js'
import { legacyBuiltins } from './sources/builtin.js'
import { claudeServers, codexServers, stdio } from './sources/discovery.js'
import { loadConfiguredTools } from './sources/config.js'

const ALL_TYPES = ['claude-cli', 'codex-cli', 'openai-api']

/**
 * 旧版 ToolCatalog 兼容性门面。
 * 单一事实来源：
 *   - 内置：legacyBuiltins()（注入 niuma_browser / niuma_desktop + 中文 keywords + 旧 id desktop）
 *   - 发现：claudeServers / codexServers（逐字搬）
 *   - 配置：loadConfiguredTools
 *   - 环境展开：expandEnv（Stage 1B-A 是 lenient 版本，和 Legacy fillEnv 等价）
 *
 * ARCHITECTURE BOUNDARY (Stage 1B):
 * packages/tools/runtime MUST NOT import packages/executors. Executor-owned
 * helpers describeMcpCall / splitMcpCall are NOT exported from @vao/tools;
 * the Legacy src/tools.js facade re-exports them from executors separately.
 * No fillEnv import from executors/text.js — local env.js expandEnv used.
 */
export class ToolCatalog {
  constructor(config = {}, { workdir = config.workdir || process.cwd(), home } = {}) {
    const cfg = config.tools || {}
    this.tools = new Map()
    const add = (id, def) => {
      if (!def || def.enabled === false) return
      const server = String(def.server || id).replace(/[^\w-]/g, '_')
      this.tools.set(id, {
        id,
        name: def.name || def.title || id,
        description: def.description || `插件 ${id}`,
        keywords: def.keywords || [],
        server,
        command: def.command,
        args: def.args || [],
        env: def.env || {},
        native: def.native || [],
        types: def.types || ALL_TYPES,
        vision: !!def.vision,
        takesOver: !!def.takesOver,
        source: def.source || 'config',
      })
    }
    const builtinObj = legacyBuiltins()
    for (const [id, def] of Object.entries(builtinObj)) {
      const over = cfg[id]
      if (over === false) continue
      add(id, { ...def, ...(over && typeof over === 'object' ? over : {}), source: 'builtin' })
    }
    if (config.autonomy === 'safe') this.tools.delete('desktop')
    for (const def of loadConfiguredTools(cfg)) {
      const id = def.id
      if (this.tools.has(id) || builtinObj[id] || !stdio(def)) continue
      add(id, { ...def, source: 'config' })
    }
    if (cfg.discover !== false) {
      const found = [
        [claudeServers(workdir, home), 'claude-cli'],
        [codexServers(home ? `${home}/.codex` : undefined), 'codex-cli'],
      ]
      for (const [servers, type] of found) {
        for (const [name, def] of Object.entries(servers || {})) {
          const id = name.replace(/[^\w-]/g, '_')
          const have = [...this.tools.values()].find((t) => t.server === id)
          if (have) {
            if (have.source === 'installed' && !have.native.includes(type)) have.native.push(type)
            continue
          }
          const portable = stdio(def)
          add(id, {
            id,
            name,
            description: `主人自己装在 ${type === 'claude-cli' ? 'Claude Code' : 'Codex'} 里的插件「${name}」`,
            server: id,
            command: portable ? def.command : undefined,
            args: Array.isArray(def.args) ? def.args.map(String) : [],
            env: def.env && typeof def.env === 'object' ? def.env : {},
            native: [type],
            types: portable ? ALL_TYPES : [type],
            source: 'installed',
          })
        }
      }
    }
  }

  list() {
    return [...this.tools.values()]
  }

  get(id) {
    return this.tools.get(id) || null
  }

  resolve(refs) {
    const list = Array.isArray(refs) ? refs : refs ? [refs] : []
    const out = []
    for (const r of list) {
      const s = String(r || '').trim().toLowerCase()
      if (!s) continue
      const t = this.list().find((x) => x.id.toLowerCase() === s || x.name.toLowerCase() === s || x.server.toLowerCase() === s)
      if (t && !out.includes(t.id)) out.push(t.id)
    }
    return out
  }

  supports(group, id) {
    const t = this.get(id)
    if (!t || !group) return false
    if (!t.types.includes(group.type)) return false
    if (t.native.includes(group.type)) return true
    if (!t.command) return false
    if (t.vision && group.type !== 'claude-cli' && !group.cfg?.vision) return false
    return true
  }

  guess(text) {
    const s = String(text || '').toLowerCase()
    return this.list()
      .filter((t) => t.keywords.some((k) => s.includes(String(k).toLowerCase())))
      .map((t) => t.id)
  }

  spec(id) {
    const t = this.get(id)
    if (!t?.command) return null
    // Use LOCAL expandEnv from env.js (Stage 1B-A LENIENT — missing ${VAR} → '').
    // Matches Legacy fillEnv semantics. NO executors/text.js import here.
    return { command: t.command, args: t.args.map(String), env: Object.fromEntries(Object.entries(t.env).map(([k, v]) => [k, expandEnv(String(v))])) }
  }
}

export { legacyBuiltins as builtinTools, claudeServers, codexServers }
// IMPORTANT: format helpers (describeMcpCall, splitMcpCall) are EXECUTOR-OWNED.
// They are re-exported for Legacy compatibility from src/tools.js facade, not
// from the shared @vao/tools runtime.
export { parseKeys, winVk, WIN_VK, KEY_ALIASES, MODS, WIN_EXTENDED, createDesktopServer, startDesktopServer, desktopPlatform, desktopToolsList, desktopMcp, default } from './mcp/desktop-server.js'
export { PLAYWRIGHT_MCP_PINNED_VERSION, PLAYWRIGHT_MCP_PINNED_SPEC, coreBuiltins, LEGACY_COMPAT_OUT } from './sources/builtin.js'
export { ToolRegistry } from './registry.js'
export { ToolPolicy, authorizeToolDefinitionAuthorize } from './policy.js'
export { ToolResolver, resolveGrantsSimple, capabilitySupportsTool, ALL_TYPES } from './resolver.js'
export { normalizeToolDefinition, LEGACY_COMPATIBILITY_IDENTIFIER, FUTURE_NEUTRAL } from './definitions.js'
export { expandEnv, MissingEnvError, readJson } from './env.js'
