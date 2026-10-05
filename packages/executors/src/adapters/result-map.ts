import type { ExecutionResult } from '../contract.js'

export function mapLegacyResult(value: any, started = Date.now()): ExecutionResult {
  const usage = value?.usage || {}
  return {
    outcome: value?.outcome || (value?.ok ? 'succeeded' : 'failed'),
    summary: String(value?.text || ''),
    ...(value?.error ? { error: String(value.error) } : {}),
    ...(value?.sessionId ? { sessionRef: String(value.sessionId) } : {}),
    ...(value?.cost != null ? { costUsd: Number(value.cost) } : {}),
    ...(usage.in != null ? { tokensIn: Number(usage.in) } : {}),
    ...(usage.out != null ? { tokensOut: Number(usage.out) } : {}),
    durationMs: Number(value?.durationMs || Date.now() - started),
  }
}
