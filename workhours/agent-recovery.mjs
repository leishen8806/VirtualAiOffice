const NETWORK_DISCONNECT_SIGNAL = /socket connection was closed|socket hang up|econnreset|econnrefused|epipe|etimedout|fetch failed|network error|connection.*(?:closed|reset)/i
const QUOTA_SIGNAL = /quota|usage limit|session limit|billing/i
const FAILURE_STATUS = new Set(['failed', 'error', 'timed_out'])
const SUCCESS_STATUS = new Set(['succeeded', 'success', 'completed'])

const rows = (value) => Array.isArray(value) ? value : Array.isArray(value?.runs) ? value.runs : []
const finishedAt = (run) => Date.parse(run?.finishedAt || '')
const runText = (run) => [run?.error, run?.errorMessage, run?.message, run?.failureReason, run?.details?.error, run?.details?.message].filter(Boolean).join(' ')
const isClaude = (agent) => String(agent?.adapterType || '').toLowerCase() === 'claude_local' || String(agent?.adapterConfig?.model || agent?.model || '').toLowerCase().includes('claude')
const safePreview = (value) => String(value || '').replace(/\s+/g, ' ').replace(/(bearer\s+)\S+/ig, '$1[redacted]').replace(/([?&](?:token|key|secret|password)=)[^&\s]+/ig, '$1[redacted]').replace(/:\/\/[^@\s/]+@/g, '://[redacted]@').replace(/\b(?:sk|ghp|xoxb)-[A-Za-z0-9_-]+\b/g, '[redacted]').slice(0, 120)

export function createAgentRecovery({ api = 'http://127.0.0.1:3100', company, now = () => new Date(), fetchFn = fetch, log = () => {} } = {}) {
  const call = async (method, target) => {
    const response = await fetchFn(api + target, { method, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: method === 'POST' ? '{}' : undefined, signal: AbortSignal.timeout(15000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${target} -> ${response.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text) : null
  }
  const recentRuns = async (agentId) => rows(await call('GET', `/api/companies/${company}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}&limit=20`))
  const hasClaudeSuccess = async (agent, agents, failureMs) => {
    for (const peer of agents) {
      if (peer.id === agent.id || !isClaude(peer)) continue
      const success = (await recentRuns(peer.id)).some((run) => SUCCESS_STATUS.has(String(run.status || '').toLowerCase()) && finishedAt(run) > failureMs && finishedAt(run) <= failureMs + 30 * 60_000)
      if (success) return true
    }
    return false
  }
  return async function recoverErrors({ agents = [], state, dryRun = false, day } = {}) {
    try {
      const attempts = state.errorRecoveryAttempts ||= {}
      const manual = (agent, reason, message) => {
        if (state.errorRecoveryManualDay?.[agent.id]?.[reason] === day) return
        log(`需人工：${agent.name} ${message}`)
        if (!dryRun) {
          state.errorRecoveryManualDay ||= {}
          ;(state.errorRecoveryManualDay[agent.id] ||= {})[reason] = day
        }
      }
      for (const agent of agents) {
        if (agent.status !== 'error') continue
        const failure = (await recentRuns(agent.id)).filter((run) => FAILURE_STATUS.has(String(run.status || '').toLowerCase())).sort((a, b) => finishedAt(b) - finishedAt(a))[0]
        if (!failure) continue
        const code = String(failure.errorCode || '').toLowerCase(), text = runText(failure)
        if (code === 'setup_failed' || code.includes('quota') || QUOTA_SIGNAL.test(text)) continue
        if (code !== 'claude_transient_upstream' && !NETWORK_DISCONNECT_SIGNAL.test(text)) continue
        const failureMs = finishedAt(failure)
        if (!Number.isFinite(failureMs) || now().getTime() - failureMs < 2 * 60_000) continue
        const count = attempts[agent.id]?.day === day ? attempts[agent.id].count : 0
        if (count >= 3) { manual(agent, 'limit', '当天已自动清错 3 次'); continue }
        let basis = code === 'claude_transient_upstream' ? '上游暂时错误' : '网络断开文字'
        if (code === 'claude_auth_required') {
          if (!await hasClaudeSuccess(agent, agents, failureMs)) { manual(agent, 'auth', '可能真的登录失效'); continue }
          basis += '，且另一位 Claude 同事随后成功'
        }
        if (dryRun) { log(`演练：将会清除 ${agent.name} 的错误（${code || '无错误码'}；${basis}）`); continue }
        await call('POST', `/api/agents/${agent.id}/clear-error`)
        attempts[agent.id] = { day, count: count + 1 }
        log(`自动清错：${agent.name}；${code || '无错误码'}；${safePreview(text)}；依据：${basis}；当天第 ${count + 1} 次`)
      }
    } catch (error) {
      log(`自动清错出错：${safePreview(error.message || error)}；本 tick 停止清错，继续保存作息状态`)
    }
  }
}
