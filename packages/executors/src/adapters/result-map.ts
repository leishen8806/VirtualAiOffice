import type { ExecutionResult } from '../contract.js'

export function mapLegacyResult(value: any, started = Date.now()): ExecutionResult {
  const usage = value?.usage || {}
  const input = usage.in ?? usage.input_tokens
  const output = usage.out ?? usage.output_tokens
  const outcome = value?.outcome || (value?.ok ? 'succeeded' : value?.error === '被叫停' ? 'cancelled' : 'failed')
  return {
    outcome,
    summary: String(value?.text || ''),
    ...(value?.error ? { error: String(value.error) } : {}),
    ...(value?.sessionId ? { sessionRef: String(value.sessionId) } : {}),
    ...(value?.cost != null ? { costUsd: Number(value.cost) } : {}),
    ...(input != null ? { tokensIn: Number(input) } : {}),
    ...(output != null ? { tokensOut: Number(output) } : {}),
    durationMs: Number(value?.durationMs || Date.now() - started),
  }
}
