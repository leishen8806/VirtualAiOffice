import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillEnv } from '../../../packages/executors/runtime/text.js'
import { builtinTools as sharedBuiltins } from './builtins.js'
import { claudeServers, codexServers, stdio } from './discovery.js'
export { claudeServers, codexServers }
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ALL_TYPES = ['claude-cli', 'codex-cli', 'openai-api']
export function builtinTools() {
  return sharedBuiltins()
}
export class ToolCatalog {
  constructor(config = {}, { workdir = config.workdir || process.cwd(), home } = {}) {
    const cfg = config.tools || {}
    this.tools = new Map()
    const add = (id, def) => {
      if (!def || def.enabled === false) return
      const server = String(def.server || id).replace(/[^\w-]/g, '_')
      this.tools.set(id, {
        id,
        name: def.name || id,
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
    for (const [id, def] of Object.entries(builtinTools())) {
      const over = cfg[id]
      if (over === false) continue
      add(id, { ...def, ...(over && typeof over === 'object' ? over : {}), source: 'builtin' })
    }
    if (config.autonomy === 'safe') this.tools.delete('desktop')
    for (const [id, def] of Object.entries(cfg)) {
      if (id === 'discover' || this.tools.has(id) || builtinTools()[id] || !def || typeof def !== 'object') continue
      if (!stdio(def)) continue
      add(id, { ...def, source: 'config' })
    }
    if (cfg.discover !== false) {
      const found = [
        [claudeServers(workdir, home), 'claude-cli'],
        [codexServers(home ? path.join(home, '.codex') : undefined), 'codex-cli'],
      ]
      for (const [servers, type] of found) {
        for (const [name, def] of Object.entries(servers)) {
          const id = name.replace(/[^\w-]/g, '_')
          const have = [...this.tools.values()].find((t) => t.server === id)
          if (have) {
            if (have.source === 'installed' && !have.native.includes(type)) have.native.push(type)
            continue
          }
          const portable = stdio(def)
          add(id, {
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
  list() { return [...this.tools.values()] }
  get(id) { return this.tools.get(id) || null }
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
    return { command: t.command, args: t.args.map(String), env: Object.fromEntries(Object.entries(t.env).map(([k, v]) => [k, fillEnv(String(v))])) }
  }
}
