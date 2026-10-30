// heartbeat-runs 的 updatedAt 是运行中的唯一活性时钟；agent.updatedAt 不会随运行推进。
export const STALL_MS = 90 * 60 * 1000

export function heartbeatAt(run) {
  return Date.parse(run?.updatedAt || run?.lastOutputAt || run?.finishedAt || run?.startedAt || run?.createdAt || '')
}

export function latestHeartbeatByAgent(runs = []) {
  const latest = new Map()
  for (const run of runs) {
    const previous = latest.get(run.agentId)
    if (!previous || heartbeatAt(run) > heartbeatAt(previous)) latest.set(run.agentId, run)
  }
  return latest
}

export function runStatus(run, now = Date.now()) {
  if (!run) return { kind: 'missing', ageMs: null }
  const ageMs = now - heartbeatAt(run)
  if (String(run.status || '').toLowerCase() !== 'running') return { kind: 'ended', ageMs }
  if (!Number.isFinite(ageMs) || ageMs > STALL_MS) return { kind: 'stalled', ageMs }
  return { kind: 'running', ageMs }
}
