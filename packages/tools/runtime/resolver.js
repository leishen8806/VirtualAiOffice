/**
 * ToolResolver / resolveGrantsSimple (Stage 1B-A inert placeholders).
 *
 * Stage 1B-A is extraction-only. Legacy consumers route through
 * ToolCatalog facade (list/get/supports/spec) and do NOT use this resolver.
 *
 * Stage 1B-B introduces the full fail-closed flow:
 *   1. ToolGrant id → registry.get(id) present?
 *   2. enabled
 *   3. command (not host-only)
 *   4. readOnlySafe vs access mode
 *   5. requires vs host capability
 *   6. env expansion without missing vars
 *   7. ToolPolicy.authorize() pass
 * plus structured TOOL_* failure codes returned via the ok=false branch.
 *
 * Those are NOT implemented here. This module:
 *   - reserves the export shape so the barrel index.d.ts stays stable;
 *   - returns an INERT lenient best-effort list of tool specs without fail
 *     codes, without TOOL_ENV_MISSING / TOOL_NOT_FOUND, so it cannot drop
 *     requests early even with edge-case inputs;
 *   - keeps capabilitySupportsTool() verbatim since that helper is used today
 *     by the concept-separation golden test and is pure vision/types routing
 *     (NOT authorization / fail-closed).
 */

const ALL_TYPES = ['claude-cli', 'codex-cli', 'openai-api']

export function resolveGrantsSimple(registry, grants, ctx = {}) {
  void ctx
  const tools = []
  const ids = []
  for (const g of grants || []) {
    const id = typeof g === 'string' ? g : g?.id
    if (!id || ids.includes(id)) continue
    ids.push(id)
    const d = registry?.get?.(id)
    if (!d || !d.command) continue
    try {
      tools.push({
        id: d.id,
        server: d.server,
        title: d.title,
        description: d.description,
        delivery: 'inject',
        command: d.command,
        args: [...(d.args || [])],
        env: Object.fromEntries(Object.entries(d.env || {}).map(([k, v]) => {
          try {
            return [k, String(v ?? '')]
          } catch { return [k, ''] }
        })),
        requires: [...(d.requires || [])],
        readOnlySafe: !!d.readOnlySafe,
        takesOver: !!d.takesOver,
        exclusive: !!d.exclusive,
        hostBinding: { hostBound: [...(d.hostBound || [])] },
      })
    } catch {
      // Stage 1B-A: swallow — no orchestration failures here.
    }
  }
  // Stage 1B-A never reports failures — Stage 1B-B introduces the
  // structured ok=false + failures[] branch.
  return { ok: true, tools }
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
  if (t.portable === false) return false
  if (!t.command) return false
  if (t.vision && group.type !== 'claude-cli' && !group.cfg?.vision) return false
  return true
}

export { ALL_TYPES }
