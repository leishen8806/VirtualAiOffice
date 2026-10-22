const TZ = 'Asia/Phnom_Penh'
const FAMILY = { claude: 'claude', gpt: 'gpt', deepseek: 'deepseek', codex: 'gpt' }
const CATEGORY = {
  quota: { label: '额度', advice: '检查模型提供方额度或等待恢复时间。' },
  login: { label: '登录失效', advice: '在本机重新登录对应 CLI。' },
  upstream: { label: '上游抖动', advice: '上游模型繁忙或网络抖动，通常稍后自动恢复；持续出现再检查。' },
  worktree_lock: { label: '工作树抢锁', advice: '检查并清理冲突的 worktree 或 .git/config 锁。' },
  environment: { label: '环境', advice: '检查运行环境和工具安装。' },
  other: { label: '其他', advice: '查看最近一次运行的错误详情。' },
}
const MS_DAY = 86400000

function parts(value) {
  const date = value instanceof Date ? value : new Date(value)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date)
  const get = (type) => Number(p.find((x) => x.type === type)?.value || 0)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date)
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
  return { date, y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second'), dow, day: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}` }
}
function localDateAt(y, mo, d, h, mi) { return new Date(Date.UTC(y, mo - 1, d, h - 7, mi, 0)) }
function isoLocal(date) { const p = parts(date); return `${p.day}T${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:${String(p.s).padStart(2, '0')}+07:00` }
function modelFamily(agent = {}) {
  const model = String(agent.adapterConfig?.model || agent.model || '').toLowerCase()
  if (model.includes('deepseek')) return 'deepseek'
  if (model.includes('claude')) return 'claude'
  return 'gpt'
}
function runTime(run) { return Date.parse(run.finishedAt || run.updatedAt || run.startedAt || run.createdAt || 0) }
function errorText(run) { return [run.errorCode, run.error, run.errorMessage, run.message, run.failureReason, run.details?.error, run.details?.message].filter(Boolean).join(' ') }
const CAPACITY_SIGNAL = /at capacity|overloaded|capacity|try a different model|server is busy|rate limited temporarily/i
const QUOTA_SIGNAL = /session limit|usage limit|hit your .*limit|quota exceeded|insufficient quota|billing/i
function providerQuotaKind(run) {
  // errorCode 自带 quota 字样，不能把代码本身当作额度耗尽的文本证据。
  const text = errorText({ ...run, errorCode: null })
  if (CAPACITY_SIGNAL.test(text)) return 'upstream'
  if (QUOTA_SIGNAL.test(text)) return 'quota'
  return null
}
export function classifyFailure(run) {
  const code = String(run.errorCode || '').toLowerCase()
  const text = errorText(run).toLowerCase()
  if (code === 'provider_quota') return providerQuotaKind(run) || 'quota'
  if (/session limit|usage limit|hit your .*limit|quota/.test(text)) return 'quota'
  if (code === 'claude_auth_required' || /login required|authentication required|auth required/.test(text)) return 'login'
  if (code === 'claude_transient_upstream' || /econnreset|etimedout|timeout|network|temporar|upstream|503|502|429/.test(text)) return 'upstream'
  if (code === 'setup_failed' && /git worktree add|\.git[\\/]config|config\.lock|index\.lock|lock competition/.test(text)) return 'worktree_lock'
  if (code === 'setup_failed') return 'environment'
  return 'other'
}
export function parseResetAt(text, now = new Date()) {
  const match = String(text || '').match(/resets\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/i)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3].toLowerCase() === 'pm') hour += 12
  const current = parts(now)
  let at = localDateAt(current.y, current.mo, current.d, hour, Number(match[2]))
  if (at <= new Date(now)) at = new Date(at.getTime() + MS_DAY)
  return isoLocal(at)
}
function recoveryAt(run, now) { return parseResetAt(errorText(run), now) }
function nextStandup(now, schedule = {}) {
  const current = parts(now)
  const days = Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5, 6]
  for (let i = 0; i <= 7; i++) {
    const date = new Date(Date.UTC(current.y, current.mo - 1, current.d + i, 0, 0, 0))
    const p = parts(date)
    const at = localDateAt(p.y, p.mo, p.d, 8, 35)
    if (days.includes(p.dow) && at > new Date(now)) return { at: isoLocal(at), date: p.day, label: `${p.day} 08:35` }
  }
  return { at: null, date: null, label: '未知' }
}
// 被人取消 / 因改派取消 / 被控制面取消 / 被打断，不是故障，不算失败（否则失败率会被夸大几倍）
const NOT_FAILURE_STATUS = new Set(['cancelled', 'canceled', 'interrupted', 'succeeded', 'running', 'queued'])
const NOT_FAILURE_CODE = new Set(['cancelled', 'canceled', 'issue_reassigned', 'interrupted'])
export function isFailure(run) {
  const status = String(run.status || '').toLowerCase()
  if (['failed', 'timed_out', 'error'].includes(status)) return true
  if (NOT_FAILURE_STATUS.has(status)) return false
  return Boolean(run.errorCode) && !NOT_FAILURE_CODE.has(String(run.errorCode).toLowerCase())
}
function isSuccess(run) { return ['succeeded', 'success', 'completed'].includes(String(run.status || '').toLowerCase()) }
function quotaAdvice(families) {
  const names = ['claude', 'gpt', 'deepseek'].filter((family) => families.has(family))
  if (names.length > 1) {
    const labels = { claude: 'Claude 会话', gpt: 'OpenAI / Codex', deepseek: 'DeepSeek' }
    return `检查 ${names.map((family) => labels[family]).join('、')} 额度或等待恢复；若提示模型繁忙，稍后会自动重试。`
  }
  if (names[0] === 'claude') return '检查 Claude 会话额度或等待恢复时间。'
  if (names[0] === 'deepseek') return '检查 DeepSeek 额度或等待恢复；若提示模型繁忙，稍后会自动重试。'
  return '检查 OpenAI / Codex 额度或等待恢复；若提示模型繁忙，稍后会自动重试。'
}
export function buildHealth({ now = new Date(), agents = [], runs = [], schedule } = {}) {
  const current = new Date(now)
  const cutoff = current.getTime() - 24 * 3600000
  const recent = (Array.isArray(runs) ? runs : []).filter((run) => runTime(run) >= cutoff && runTime(run) <= current.getTime())
  const agentList = Array.isArray(agents) ? agents : []
  const agentById = new Map(agentList.map((agent) => [agent.id, agent]))
  const families = new Map(['claude', 'gpt', 'deepseek'].map((key) => [key, { family: key, runs: 0, failed: 0, failureRate: 0 }]))
  const byAgent = new Map()
  for (const agent of agentList) byAgent.set(agent.id, { agentId: agent.id, name: agent.name || agent.id || '未知', title: agent.title || '', family: modelFamily(agent), status: agent.status || 'unknown', runs24h: 0, succeeded: 0, failed: 0, lastFailure: null, failures: [] })
  for (const run of recent) {
    const agent = agentById.get(run.agentId) || { id: run.agentId, name: run.agentId || '未知', title: '', model: run.model }
    const row = byAgent.get(agent.id) || { agentId: agent.id, name: agent.name || agent.id || '未知', title: agent.title || '', family: modelFamily(agent), status: 'unknown', runs24h: 0, succeeded: 0, failed: 0, lastFailure: null, failures: [] }
    byAgent.set(agent.id, row)
    row.runs24h++
    const family = families.get(row.family) || families.get('gpt')
    family.runs++
    if (isSuccess(run)) { row.succeeded++; continue }
    if (!isFailure(run)) continue
    row.failed++; family.failed++
    const at = runTime(run)
    const failure = { at: new Date(at).toISOString(), category: classifyFailure(run), errorCode: run.errorCode || null, text: errorText(run), recoveryAt: recoveryAt(run, current) }
    if (String(run.errorCode || '').toLowerCase() === 'provider_quota' && !providerQuotaKind(run)) failure.ambiguous = true
    row.failures.push(failure)
    if (!row.lastFailure || at > Date.parse(row.lastFailure.at)) row.lastFailure = failure
  }
  for (const row of families.values()) row.failureRate = row.runs ? row.failed / row.runs : 0
  const incidentsByKey = new Map()
  for (const row of byAgent.values()) {
    for (const failure of row.failures) {
      if (Date.parse(failure.at) < current.getTime() - 2 * 3600000 || !['quota', 'login', 'worktree_lock'].includes(failure.category)) continue
      // 同一同事更晚的 running 表示已重新执行，可清除告警；取消不代表恢复。
      const recovered = recent.some((run) => run.agentId === row.agentId && (isSuccess(run) || String(run.status || '').toLowerCase() === 'running') && runTime(run) > Date.parse(failure.at))
      if (recovered) continue
      const key = `${failure.category}|${failure.recoveryAt || 'unknown'}`
      const category = failure.category
      const item = incidentsByKey.get(key) || { category, label: CATEGORY[category].label, agents: [], agentIds: [], recoveryAt: failure.recoveryAt, recoveryText: failure.recoveryAt || '未知', advice: CATEGORY[category].advice }
      if (!item.agentIds.includes(row.agentId)) { item.agents.push(row.name); item.agentIds.push(row.agentId) }
      incidentsByKey.set(key, item)
    }
  }
  const incidents = [...incidentsByKey.values()].map((item) => ({
    ...item,
    advice: item.category === 'quota' ? quotaAdvice(new Set(item.agentIds.map((id) => byAgent.get(id).family))) : item.advice,
    impact: `影响 ${item.agents.join('、')}`,
  }))
  const standup = nextStandup(current, schedule)
  const standupMs = standup.at ? Date.parse(standup.at) : Infinity
  const warning = incidents.some((item) => ['quota', 'login'].includes(item.category) && standupMs - current.getTime() <= 12 * 3600000 && (!item.recoveryAt || Date.parse(item.recoveryAt) > standupMs))
  const level = incidents.some((item) => item.category === 'login' || item.category === 'worktree_lock') ? 'bad' : incidents.length ? 'warn' : 'ok'
  return { at: current.toISOString(), level, text: level === 'ok' ? '运行健康' : warning ? '可能影响晨会' : `${incidents.length} 项运行风险`, families: [...families.values()], agents: [...byAgent.values()].map(({ failures, ...row }) => row), incidents, nextStandup: { ...standup, warning, warningText: warning ? '⚠ 可能影响 8:35 晨会' : '' } }
}
