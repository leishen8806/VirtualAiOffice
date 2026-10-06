import { normalizeToolDefinition } from './definitions.js'

/**
 * ToolRegistry：定义查找。查找支持 id / 宿主别名（Legacy 通过 aliases 注入 desktop→desktop-control）。
 * 不含发现、不含策略。
 */
export class ToolRegistry {
  constructor(options = {}) {
    this.#aliases = Object.fromEntries(Object.entries(options.aliases || {}).map(([k, v]) => [String(k).toLowerCase(), String(v)]))
    this.#defs = new Map()
  }

  /** 注册；若 id 相同则后者覆盖（配置/内置优先于发现，按调用顺序保证）。 */
  add(def) {
    const n = normalizeToolDefinition(def)
    if (!n) return null
    this.#defs.set(n.id, n)
    return n
  }

  list(predicate = null) {
    const all = [...this.#defs.values()].filter((d) => d.enabled)
    if (!predicate) return all
    return all.filter(predicate)
  }

  get(id) {
    const key = String(id || '').toLowerCase()
    const byAlias = this.#aliases[key]
    const target = byAlias || key
    if (this.#defs.has(target)) return this.#defs.get(target)
    for (const d of this.#defs.values()) if (d.id.toLowerCase() === key) return d
    return null
  }

  /** 旧门面 resolve：接受 tool.id / server 名 / name 中文名 / 别名。找不到静默不返回。 */
  lookupAll(refs, { preferExact = true } = {}) {
    const list = Array.isArray(refs) ? refs : refs ? [refs] : []
    const out = []
    for (const raw of list) {
      const s = String(raw || '').trim().toLowerCase()
      if (!s) continue
      const byAlias = this.#aliases[s]
      let match = (preferExact && byAlias ? this.get(byAlias) : null) || this.get(s)
      if (!match) match = this.list().find((d) => d.server.toLowerCase() === s || d.title.toLowerCase() === s)
      if (match && !out.some((x) => x.id === match.id)) out.push(match)
    }
    return out
  }

  #aliases
  #defs
}
