/**
 * ToolPolicy (Stage 1B-A placeholder).
 *
 * Stage 1B-A is extraction only. Legacy Coordinator/executor paths use the
 * pre-existing autonomy / vision routing inside ToolCatalog facade / supports()
 * and do NOT go through this layer.
 *
 * ACTIVE ENFORCEMENT — fail-closed ToolGrant resolution, readOnlySafe drops,
 * safe-mode takeover rejection, TOOL_NOT_AUTHORIZED / TOOL_NOT_READ_ONLY_SAFE /
 * TOOL_* orchestration failure codes — belongs EXCLUSIVELY to Stage 1B-B and is
 * deliberately NOT performed here.
 *
 * The present module: (a) reserves the symbol locations for the future strict
 * policy layer; (b) returns inert { ok: true } for any current call so
 * downstream callers can attach the shim without behavioral change today.
 */
export function authorizeToolDefinitionAuthorize(def, ctx = {}) {
  // Stage 1B-A: always pass — Stage 1B-B introduces the 7 checks.
  // Parameters accepted only so the future strict signature can slot in without
  // import-site churn at that point.
  void def
  void ctx
  return { ok: true }
}

export class ToolPolicy {
  constructor(opts = {}) {
    // reserved for Stage 1B-B options (e.g. default access, autonomy rules)
    this.opts = opts
  }
  authorize(def, ctx) {
    return authorizeToolDefinitionAuthorize(def, ctx)
  }
}
