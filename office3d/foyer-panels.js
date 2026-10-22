const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g

const text = (value, limit = 120) => [...String(value ?? '').replace(controls, '')].slice(0, limit).join('')
const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0
const empty = (value) => ({ empty: true, text: value, lines: [value] })

export function attendancePanel(state) {
  const duty = state?.world?.duty, agents = state?.agents
  if (!duty || typeof duty.on !== 'boolean' || !Array.isArray(agents)) return empty('出勤数据同步中')
  const paused = agents.filter(a => a?.status === 'paused').length
  const error = agents.filter(a => a?.status === 'error').length
  const available = agents.filter(a => a && !['paused', 'error'].includes(a.status)).length
  const on = duty.on ? agents.filter(a => ['idle', 'running'].includes(a?.status)).length : 0
  const off = duty.on ? 0 : available
  return {
    empty: false,
    at: text(state?.at, 40),
    onDuty: duty.on,
    on,
    off,
    paused,
    error,
    lines: [duty.on ? `在岗 ${on} 人` : `已下班 ${off} 人`, `暂停 ${paused} · 异常 ${error}`],
  }
}

export function selectWaitingPeople(waiting, seats = 4) {
  const limit = Number.isFinite(Number(seats)) ? Math.max(0, Math.floor(Number(seats))) : 0
  if (!limit) return []
  const seen = new Set(), out = []
  for (const item of Array.isArray(waiting) ? waiting : []) {
    const id = typeof item?.agentId === 'string' ? item.agentId.trim() : ''
    if (item?.kind !== 'question' || !id || seen.has(id)) continue
    seen.add(id); out.push(id)
    if (out.length >= limit) break
  }
  return out
}

export function pendingPanel(state) {
  const waiting = Array.isArray(state?.waiting) ? state.waiting : []
  const counts = {
    question: waiting.filter(item => item?.kind === 'question').length,
    review: waiting.filter(item => item?.kind === 'review').length,
    approval: count(state?.pendingApprovals),
  }
  const total = counts.question + counts.review + counts.approval
  const waitingCount = selectWaitingPeople(waiting).length
  return {
    empty: total === 0,
    counts,
    text: total ? `待回答 ${counts.question} · 待验收 ${counts.review} · 待审批 ${counts.approval}` : '当前没有待处理事项',
    waitingText: waitingCount ? `等候中 ${waitingCount} 人` : '当前没有待处理事项',
  }
}

export function standupPanel(state) {
  const standup = state?.standup
  if (!standup || typeof standup !== 'object') return empty('今天还没有晨会结果')
  const candidates = Array.isArray(standup.candidates) ? standup.candidates : []
  const passed = candidates.filter(item => item?.outcome === 'DISPATCHED').length
  const dropped = (Array.isArray(standup.dropped) ? standup.dropped.length : 0) + candidates.filter(item => item?.outcome && item.outcome !== 'DISPATCHED').length
  const note = text(standup.note, 48).trim()
  const status = text(standup.state, 24) || '同步中'
  return { empty: false, status, counts: { passed, dropped }, note, lines: [`晨会 ${status}`, `通过 ${passed} · 剔除 ${dropped}`, ...(note ? [note] : [])] }
}

export function milestonePanel(data) {
  const source = Array.isArray(data) ? data : data?.milestones
  if (!Array.isArray(source) || !source.length) return empty('尚未配置里程碑')
  const items = source.map(item => ({
    project: text(item?.name, 48) || '未命名项目',
    next: text(item?.next?.name, 56) || '暂无下一里程碑',
    due: /^\d{4}-\d{2}-\d{2}/.test(String(item?.next?.due || '')) ? String(item.next.due).slice(0, 10) : '',
    percent: Math.round(Math.max(0, Math.min(1, Number.isFinite(Number(item?.percent)) ? Number(item.percent) : 0)) * 100),
  }))
  return { empty: false, items, lines: items.map(item => `${item.project} ${item.percent}% · ${item.next}${item.due ? ` · ${item.due}` : ''}`) }
}

export function wrapAnnouncement(value, columns = 14, maxLines = 3) {
  const chars = [...text(value, 120)], width = Math.max(1, Math.floor(columns)), rows = Math.max(1, Math.floor(maxLines)), lines = []
  for (const raw of chars.join('').split('\n')) {
    const part = [...raw]
    if (!part.length && lines.length < rows) lines.push('')
    while (part.length && lines.length < rows) lines.push(part.splice(0, width).join(''))
    if (lines.length >= rows) break
  }
  const used = lines.reduce((n, line) => n + [...line].length, 0)
  if (used < chars.filter(char => char !== '\n').length && lines.length) lines[lines.length - 1] = [...lines.at(-1)].slice(0, Math.max(0, width - 1)).join('') + '…'
  return lines
}

export function announcementPanel(foyer) {
  const value = text(foyer?.announcement?.text, 120).trim()
  if (!value) return empty('今天还没有公告')
  return { empty: false, text: value, count: [...value].length, at: text(foyer?.announcement?.at, 40), lines: wrapAnnouncement(value) }
}

function relativeTime(value, now) {
  const at = Date.parse(value), diff = Number.isFinite(at) ? Math.max(0, Number(now) - at) : NaN
  if (!Number.isFinite(diff)) return '时间未知'
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 48 * 3600_000) return '昨天'
  return `${Math.floor(diff / (24 * 3600_000))} 天前`
}

export function visitorPanel(foyer, now = Date.now()) {
  if (foyer?.enabled === false) return empty('尚无访客记录')
  const visitors = foyer?.visitors
  if (!visitors || typeof visitors !== 'object') return empty('尚无访客记录')
  const kinds = [['lan', '局域网'], ['wall', '大屏']]
  const lines = kinds.flatMap(([key, label]) => {
    const visits = count(visitors?.[key]?.visits)
    return visits ? [`${label}访问 ${visits} 次 · ${relativeTime(visitors[key].lastAt, now)}`] : []
  })
  return lines.length ? { empty: false, lines, text: lines.join('；') } : empty('尚无访客记录')
}

export function panelAccess(mode) {
  const local = mode === 'local'
  return { announce: local, handoff: local, taskPanel: local }
}
