import { expandEnv, MissingEnvError } from './env.js'

const ALL_TYPES = ['claude-cli', 'codex-cli', 'openai-api']
/**
 * ToolResolver（占位，最小实现，仅需保留接口符合契约（解析 ToolGrant[]→ResolvedToolSpec[]）。
 *
 * Stage 1B-B 会把 §6 完整 fail-closed 引入（ToolNotFound→完整七项检查）；此仅用于新核心默认值，
 * 未被 Legacy 门面不走这里。
 */
export function resolveGrantsSimple(registry, grants, ctx = {}) {
  const tools = []
  const failures = []
  for (const g of grants) {
    const id = typeof g === 'string' ? g : g?.id
    if (!id) continue
    const d = registry.get(id)
    if (!d) { failures.push({ grantId: id, code: 'TOOL_NOT_FOUND' }); continue }
    if (!d.command) { failures.push({ grantId: id, code: 'TOOL_NOT_SUPPORTED', detail: 'no command' }); continue }
    try {
      const env = Object.fromEntries(Object.entries(d.env || {}).map(([k, v]) => [k, expandEnv(String(v))]))
      tools.push({
        id: d.id,
        server: d.server,
        title: d.title,
        description: d.description,
        delivery: 'inject',
        command: d.command,
        args: [...d.args],
        env,
        requires: [...(d.requires || [])],
        readOnlySafe: !!d.readOnlySafe,
        takesOver: !!d.takesOver,
        exclusive: !!d.exclusive,
        hostBinding: { hostBound: [...(d.hostBound || [])] },
      })
    } catch (e) {
      if (e instanceof MissingEnvError) failures.push({ grantId: id, code: 'TOOL_ENV_MISSING', detail: e.envName })
      else failures.push({ grantId: id, code: 'TOOL_NOT_SUPPORTED', detail: String(e.message || e) })
    }
  }
  return failures.length ? { ok: false, failures } : { ok: true, tools }
}

export class ToolResolver {
  constructor(registry, policy = null, options = {}) {
    this.registry = registry
    this.policy = policy
    this.options = options
  }
  resolve(grants, ctx = {}) {
    return resolveGrantsSimple(this.registry, grants, ctx)
  }
}

export function capabilitySupportsTool(group, t) {
  if (!t || !group) return false
  if (!t.types?.includes?.(group.type)) return false
  if (t.native?.includes?.(group.type)) return true
  if (!t.command) { }
  if (t.portable === false) return false
  if (!t.command) return false
  if (t.vision && group.type !== 'claude-cli' && !group.cfg?.vision) return false
  return true
}

export { ALL_TYPES }
