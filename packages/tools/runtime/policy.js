/**
 * ToolPolicy（最小占位。
 * 授权判定占位：授权判定：readOnlySafe 只读 Execution 必须显式 true；safe mode 下 takesOver 拒绝授权。
 * 旧 Coordinator/1B-B 再引入严格。fail-closed 详细授权策略（含环境/视觉）。
 */
export function authorizeToolDefinitionAuthorize(def, ctx = {}) {
  if (!def) return { ok: false, code: 'TOOL_NOT_FOUND' }
  if (!def.enabled) return { ok: false, code: 'TOOL_NOT_AUTHORIZED' }
  if (ctx.autonomy === 'safe' && def.takesOver) return { ok: false, code: 'TOOL_NOT_AUTHORIZED' }
  if (ctx.access === 'read_only' && !def.readOnlySafe) return { ok: false, code: 'TOOL_NOT_READ_ONLY_SAFE' }
  if (ctx.access === 'read_only' && def.takesOver) return { ok: false, code: 'TOOL_NOT_READ_ONLY_SAFE' }
  return { ok: true }
}

export class ToolPolicy {
  constructor(opts = {}) {
    this.opts = opts
  }
  authorize(def, ctx) {
    return authorizeToolDefinitionAuthorize(def, ctx)
  }
}
