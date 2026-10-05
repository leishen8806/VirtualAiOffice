import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}
export function claudeServers(workdir, home = os.homedir()) {
  const out = {}
  const j = readJson(path.join(home, '.claude.json'))
  Object.assign(out, j?.mcpServers || {})
  const proj = j?.projects?.[workdir] || j?.projects?.[path.resolve(workdir)]
  Object.assign(out, proj?.mcpServers || {})
  const mcp = readJson(path.join(workdir, '.mcp.json'))
  const approved = new Set(proj?.enabledMcpjsonServers || [])
  for (const [name, def] of Object.entries(mcp?.mcpServers || {})) {
    if (approved.has(name) || proj?.enableAllProjectMcpServers) out[name] = def
  }
  return out
}
export function codexServers(home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')) {
  let text
  try { text = fs.readFileSync(path.join(home, 'config.toml'), 'utf8') } catch { return {} }
  const out = {}
  let cur = null
  let sub = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const head = line.match(/^\[\s*mcp_servers\.("?)([^".\]]+)\1(?:\.(\w+))?\s*\]$/)
    if (head) {
      cur = out[head[2]] ||= {}
      sub = head[3] || null
      if (sub) cur[sub] ||= {}
      continue
    }
    if (line.startsWith('[')) { cur = null; continue }
    if (!cur) continue
    const kv = line.match(/^("?)([\w-]+)\1\s*=\s*(.+)$/)
    if (!kv) continue
    let value
    try { value = JSON.parse(kv[3].replace(/^'([^']*)'$/, (_, s) => JSON.stringify(s))) }
    catch {
      const t = kv[3].match(/^\{(.*)\}$/)
      if (t) {
        value = {}
        for (const m of t[1].matchAll(/("?)([\w-]+)\1\s*=\s*"([^"]*)"/g)) value[m[2]] = m[3]
      } else continue
    }
    if (sub) cur[sub][kv[2]] = value
    else cur[kv[2]] = value
  }
  return out
}
export const stdio = (def) => def && typeof def.command === 'string' && (!def.type || def.type === 'stdio')
