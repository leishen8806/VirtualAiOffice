// T14：断点交接包 —— 被打断、转阻塞、换人、长停留时，程序识别【交接包】模板、提醒补写、在新负责人上岗时转交前任交接包。
// 只读判断，不推断；不改状态、不改负责人、不替任何人写交接包内容；不向 Paperclip 发任何会改变任务状态 / 负责人 / 依赖的请求，
// 唯一允许的写入是带标记的评论（【交接巡检】提醒补写、【交接包转交】转交前任交接包）。
// 总开关：handoff.json 的 enabled:false 为默认；文件不存在按关闭处理；损坏视为关闭并在 /state 提示，不崩溃。
// 决策口径：T1 中断复用 health.mjs 的 isFailure（cancelled 不算）；T2 状态变为 blocked（上一轮不是），时间取 blockedTransitionAt
//   （真实任务常为 null，回退到扫描首次见到 blocked 的确认时刻）；T3 换人用上一轮扫描记录的负责人（第一次见到的任务不算换人）；
//   T4 长停留 24 小时无新评论 / 新运行（忽略程序自己的标记评论）。评论 / 运行按任务更新时间缓存，只读 GET。
// 脱敏：所有输出文字走 wall.mjs 的 redactText；评论正文超长只保留字段前 300 字。
import fs from 'node:fs'
import path from 'node:path'
import { MONEY_RE } from './standup.mjs' // 资金类口径：复用 standup.mjs 的，不复制
import { isFailure } from './health.mjs' // T1 中断口径：复用（cancelled 不算失败）

export const MARK = '【交接巡检】' // 缺交接包时的提醒评论首行标记
export const FORWARD_MARK = '【交接包转交】' // 换人时转交前任交接包的评论首行标记
export const DEFAULT_CFG = Object.freeze({
  enabled: false,
  maxPerScan: 6, // 每轮最多处理的任务数
  perAgentPerHour: 3, // 每个岗位 1 小时内最多收到 3 条巡检评论
  reminderDelayMs: 24 * 3600000, // 同一任务同一触发 24 小时最多提醒一条
  idleMs: 24 * 3600000, // T4 长停留阈值
  fieldMaxLen: 300, // 单个字段最多保留字数
})
const ACTIVE = new Set(['in_progress', 'blocked', 'todo']) // 有负责人且未结束的任务才看
const ENDED = new Set(['done', 'cancelled'])
const FIELD_KEYS = ['done', 'todo', 'next', 'block', 'location', 'no_redo']
const FIELD = { done: '已完成', todo: '未完成', next: '下一步', block: '阻塞与解除条件', location: '工作位置', no_redo: '不要重做' }
const FIELD_RE = /^\s*(已完成|未完成|下一步|阻塞与解除条件|工作位置|不要重做)\s*[：:]\s*(.*)$/
const HANDS_HEAD = /^\s*【交接包】\s*(?:对象版本\s*[：:]\s*(.+))?$/ // 交接包首行：可带「对象版本：…」
const EV_LINE = /【验收证据】[：:]*\s*对象版本[：:]*\s*([^\n\r]+)/ // 与 T15 同口径：新鲜度提示只做字符串比较
const isMineMark = (c) => String(c.body || '').startsWith(MARK) || String(c.body || '').startsWith(FORWARD_MARK)
const clip = (s, n, redact = (x) => x) => redact(String(s || '')).replace(/\s+/g, ' ').trim().slice(0, n)
// T14b：T4 长停留的「按计划等待」豁免。ENDED_STATUS = 依赖「已结束」口径（与 blocked.mjs 的 ended 一致，另名避免与任务状态 ENDED 混淆）；
// MONITOR_STALE_MS = 监控 nextCheckAt 已过去满 2 小时仍无动作 → 应当触发（计划好的唤醒没生效）。
// fmtHhMm：detail 里的「监控应在 hh:mm 检查」用金边时间（+07，与评论里「13:00 开工」等口径一致）。
const ENDED_STATUS = new Set(['done', 'cancelled'])
const MONITOR_STALE_MS = 2 * 3600000
const HHMM = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false, hour: '2-digit', minute: '2-digit' })
const fmtHhMm = (ms) => HHMM.format(new Date(ms))
const answeredCard = (x) => ['answered', 'done', 'cancelled', 'resolved'].includes(String((x && (x.status ?? x.state)) || '').toLowerCase())

/**
 * 解析一条评论正文里的【交接包】模板（纯函数，可单测）。
 * 返回 { has, version, fields, missing: [缺的字段名], complete }；缺任何一个字段视为不完整。
 */
export function parseHandoff(body, opts = {}) {
  const maxLen = Number(opts.fieldMaxLen) || DEFAULT_CFG.fieldMaxLen
  const redact = typeof opts.redactText === 'function' ? opts.redactText : (x) => x
  const lines = String(body || '').split(/\r?\n/)
  const hi = lines.findIndex((l) => /^\s*【交接包】/.test(l))
  if (hi < 0) return { has: false, version: null, fields: {}, missing: FIELD_KEYS.map((k) => FIELD[k]), complete: false }
  const head = lines[hi].match(HANDS_HEAD)
  const version = head && head[1] ? String(head[1]).trim() : null
  const fields = {}
  for (let li = hi; li < lines.length; li++) {
    const m = lines[li].match(FIELD_RE)
    if (m) {
      const k = Object.keys(FIELD).find((kk) => FIELD[kk] === m[1])
      if (k != null && !(k in fields)) fields[k] = clip(m[2], maxLen, redact)
    }
  }
  const missing = FIELD_KEYS.filter((k) => !(k in fields)).map((k) => FIELD[k])
  return { has: true, version, fields, missing, complete: missing.length === 0 }
}

/** 从一个任务的评论里取最近的【交接包】（纯函数）。输出已脱敏；字段前 300 字。
 * 程序自己的【交接巡检】评论不含交接包，不认；【交接包转交】评论里转贴了前任交接包内容，认（它就是交接包本身）。 */
export function parseHandoffComments(comments, opts = {}) {
  const list = Array.isArray(comments) ? comments : []
  const ordered = list
    .filter((c) => !String(c.body || '').startsWith(MARK))
    .filter((c) => String(c.body || '').split(/\r?\n/).some((l) => /^\s*【交接包】/.test(l)))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
  const c = ordered[0]
  if (!c) return { has: false, version: null, at: null, fields: {}, missing: FIELD_KEYS.map((k) => FIELD[k]), complete: false }
  const p = parseHandoff(c.body, opts)
  return { has: true, at: c.createdAt || null, version: p.version, fields: p.fields, missing: p.missing, complete: p.complete }
}

/**
 * T14b：T4 长停留的「按计划等待」判定（纯函数，只用 issue 对象上已有的字段，绝不新增 Paperclip 请求）。
 * 顺序：monitor_scheduled → waiting_dependency → waiting_board，任一命中就返回那条 skip 原因（其余照常评估以补齐 gaps）。
 * 字段在列表接口里取不到 = 不跳过，在 gaps 里写明缺哪个字段 / 为什么无法判断。
 * 监控 nextCheckAt 已过去 ≥2 小时仍无动作 → 返回 staleAt>0（由调用方触发「长停留」，detail 写「监控应在 hh:mm 检查，至今无动作」）。
 * @returns {{ skip: null|'monitor_scheduled'|'waiting_dependency'|'waiting_board', staleAt: number, gaps: string[] }}
 */
function idleWait(issue, now) {
  const parseMs = (d) => { const t = Date.parse(d || ''); return Number.isFinite(t) && t >= 0 ? t : 0 }
  const gaps = []
  let skip = null
  let staleAt = 0
  // ① 监控：monitorNextCheckAt 在未来；或 executionState.monitor.status==='scheduled' 且 nextCheckAt 在未来、timeoutAt 未到（timeoutAt 缺失按未到处理）
  const mnca = parseMs(issue.monitorNextCheckAt)
  const mon = issue.executionState != null && typeof issue.executionState === 'object' ? issue.executionState.monitor : null
  const mNext = parseMs(mon && mon.nextCheckAt)
  const mTimeout = parseMs(mon && mon.timeoutAt)
  const monitorAt = Math.max(mnca, mNext)
  if (mnca > now || (mon && mon.status === 'scheduled' && mNext > now && (mTimeout === 0 || mTimeout > now))) skip = 'monitor_scheduled'
  else if (monitorAt > 0 && now - monitorAt >= MONITOR_STALE_MS) staleAt = monitorAt // 规则 2：计划好的唤醒没生效
  // ② 依赖：blockedBy 里有非 done / cancelled，或 blockerAttention.unresolvedBlockerCount > 0
  const bb = issue.blockedBy
  const ba = issue.blockerAttention
  const uc = ba && (ba.unresolvedBlockerCount ?? ba.unresolvedCount)
  if (Array.isArray(bb)) {
    const open = bb.some((b) => { const s = typeof b === 'string' ? b : String((b && (b.status ?? b.state)) || ''); return !ENDED_STATUS.has(s.toLowerCase()) })
    if (!skip && open) skip = 'waiting_dependency'
  } else if (bb !== undefined) gaps.push('blockedBy 形状异常（非数组），无法判断是否在等依赖')
  else gaps.push('blockedBy 不在列表接口' + (typeof uc === 'number' ? '（依赖判定仅依据 blockerAttention）' : ''))
  if (typeof uc === 'number') { if (!skip && uc > 0) skip = 'waiting_dependency' }
  else if (!Array.isArray(bb) && bb === undefined) gaps.push('blockerAttention.unresolvedBlockerCount 不在列表接口，无法判断是否在等依赖')
  // ③ 交互卡：待回答的 ask_user_questions / 确认卡（pendingInteractionCount / waitingForBoard / needsUserInput 亦可判定）；取不到 → 不跳过 + gaps 写明
  const q = Array.isArray(issue.ask_user_questions) ? issue.ask_user_questions : Array.isArray(issue.askUserQuestions) ? issue.askUserQuestions : null
  if (q) { if (!skip && q.some((x) => !answeredCard(x))) skip = 'waiting_board' }
  else if (typeof issue.pendingInteractionCount === 'number' || typeof issue.unansweredInteractionCount === 'number') {
    if (!skip && ((issue.pendingInteractionCount || 0) > 0 || (issue.unansweredInteractionCount || 0) > 0)) skip = 'waiting_board'
  } else if (typeof issue.waitingForBoard === 'boolean' || typeof issue.needsUserInput === 'boolean') {
    if (!skip && (issue.waitingForBoard === true || issue.needsUserInput === true)) skip = 'waiting_board'
  } else gaps.push('无法判断是否在等董事会（列表接口没有待回答交互卡字段）')
  return { skip, staleAt, gaps }
}

/**
 * 四种触发（纯函数，只读判断不推断）。
 * issue: { id, identifier, status, assigneeAgentId, assigneeUserId, blockedTransitionAt, updatedAt }
 * prev:   上一轮扫描记录 { owner, status }，没有就是第一次见到。
 * 返回 { triggers:[{type,label,at,detail}], lastActionAt, idleSkip, gaps }；type: interrupted|blocked|handed|idle。
 * idleSkip / gaps 为 T14b 新增：T4 长停留被判「按计划等待」时 idleSkip 给出原因（monitor_scheduled / waiting_dependency / waiting_board），
 * gaps 列出字段缺失或无法判断的说明（blockedBy 不在列表接口、无法判断是否在等董事会等）。
 */
export function detectTriggers({ issue = {}, runs = [], comments = [], prev = {}, now = Date.now(), idleMs = DEFAULT_CFG.idleMs }) {
  const triggers = []
  const gaps = []
  let idleSkip = null
  const end = (d) => Date.parse(d || '')
  const endOr0 = (d) => { const t = end(d); return Number.isFinite(t) ? t : 0 }
  const items = Array.isArray(comments) ? comments : [] // 兼容 [{body,createdAt}] 与由 createdAt 组成的字符串数组（statusOf 的 commentTimes 缓存，已剔除程序评论）
  const others = items.filter((c) => typeof c === 'string' || !isMineMark(c)) // 忽略程序自己的标记评论（任务卡 §1 T4）
  const latestRunAt = (Array.isArray(runs) ? runs : []).reduce((m, r) => Math.max(m, endOr0(r.finishedAt || r.updatedAt || r.createdAt)), 0)
  const latestCommentAt = others.reduce((m, c) => Math.max(m, endOr0(typeof c === 'string' ? c : c.createdAt)), 0)
  const updatedAtMs = endOr0(issue.updatedAt)
  const lastActionAt = Math.max(latestRunAt, latestCommentAt) || 0 // 只算真实的评论 / 运行，程序自己的标记评论不算动作
  if (!ENDED.has(issue.status)) {
    // T1 运行中断：最近一次运行是 failed / timed_out（cancelled 不算，复用 isFailure）
    const latest = [...(Array.isArray(runs) ? runs : [])].sort((a, b) => endOr0(b.finishedAt || b.updatedAt || b.createdAt) - endOr0(a.finishedAt || a.updatedAt || a.createdAt))[0]
    if (latest && isFailure(latest)) triggers.push({ type: 'interrupted', label: '运行中断', at: latest.finishedAt || latest.updatedAt || latest.createdAt || null, detail: `最近一次运行 ${String(latest.status || '失败').toLowerCase()}` })
    // T2 转阻塞：任务状态变为 blocked（上一轮扫描不是 blocked）；时间取 blockedTransitionAt，真实数据常为 null，由 factory 回退到确认时刻
    if (issue.status === 'blocked' && prev.status != null && prev.status !== 'blocked') triggers.push({ type: 'blocked', label: '转阻塞', at: issue.blockedTransitionAt || null, detail: '任务刚进入阻塞' })
    // T3 换人：上一轮见过的负责人变了（第一次见到的任务不算换人）
    if (prev.owner != null && prev.owner !== issue.assigneeAgentId) triggers.push({ type: 'handed', label: '换人', at: issue.updatedAt || null, detail: '任务换了负责人' })
    // T4 长停留：in_progress 且 24 小时内没有任何新评论和新运行；
    // 没有任何真实评论 / 运行记录时回退到任务的 updatedAt（只有程序自己的标记评论不算有动作）
    // T14b：先看是否「按计划等待」而得豁免（监控已排期 / 等依赖 / 等董事会）；监控过期满 2 小时仍无动作则触发并写明几点该检查
    if (issue.status === 'in_progress') {
      const anchor = lastActionAt || updatedAtMs
      if (anchor > 0 && now - anchor >= idleMs) {
        const wait = idleWait(issue, now)
        if (wait.gaps.length) gaps.push(...wait.gaps)
        if (wait.skip) idleSkip = wait.skip
        else if (wait.staleAt > 0) triggers.push({ type: 'idle', label: '长停留', at: new Date(lastActionAt || updatedAtMs).toISOString(), detail: `监控应在 ${fmtHhMm(wait.staleAt)} 检查，至今无动作` })
        else triggers.push({ type: 'idle', label: '长停留', at: new Date(lastActionAt || updatedAtMs).toISOString(), detail: `${Math.floor((now - anchor) / 3600000)} 小时无新动作` })
      }
    }
  }
  return { triggers, lastActionAt, idleSkip, gaps }
}

/** 新鲜度提示（§4，只比较字符串，不读仓库不执行 git）：交接包对象版本与之后出现的【验收证据】对象版本不同 → 可能过期 */
export function handoffStale(handoffVersion, comments = []) {
  if (!handoffVersion) return false
  const ev = []
  for (const c of Array.isArray(comments) ? comments : []) { const m = String(c.body || '').match(EV_LINE); if (m) ev.push({ at: c.createdAt || null, version: String(m[1]).trim() }) }
  return ev.some((x) => x.version && x.version !== handoffVersion)
}

export function createHandoff({ dir, company, get, send, notify, dutyOn, now = Date.now, agents, isMoney = (i) => MONEY_RE.test(`${i.title || ''}\n${i.description || ''}`), redactText, spreadMs = 3000, log = console.log }) {
  const file = path.join(dir, 'handoff.json')
  const notBefore = now() + 300000 // 重启后第一次扫描等 5 分钟，留交接窗口
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
  const redact = typeof redactText === 'function' ? redactText : (x) => String(x ?? '')
  let db = { ...DEFAULT_CFG, corrupt: false, tasks: {}, records: [], lastAt: null, nextAt: notBefore }
  const load = () => {
    let raw
    try { raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null } catch (e) {
      db = { ...DEFAULT_CFG, corrupt: true, tasks: {}, records: [], lastAt: null, nextAt: notBefore }
      log(`[handoff] 配置损坏，按关闭处理：${e.message}`); return
    }
    if (raw == null) return
    db = { ...DEFAULT_CFG, ...raw, corrupt: false, tasks: raw.tasks || {}, records: raw.records || [], lastAt: raw.lastAt || null, nextAt: Math.max(raw.nextAt || 0, notBefore) }
  }
  load()
  let busy = false
  function onDuty() { try { return Boolean(dutyOn && dutyOn()) } catch { return false } }
  const save = () => {
    const tmp = file + '.tmp' // 原子写入：先写临时再改名；损坏时 load 视为关闭
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1))
    fs.renameSync(tmp, file)
  }
  const record = (it, action) => { db.records.push({ at: new Date(now()).toISOString(), ident: it.ident, action }); db.records = db.records.slice(-50); save() }
  const asList = (r) => (Array.isArray(r) ? r : r?.issues || r?.comments || [])

  async function context() {
    const [issues, runs, agentList] = await Promise.all([
      asList(await get(`/api/companies/${company}/issues`)),
      asList(await get(`/api/companies/${company}/heartbeat-runs?limit=1000`)),
      typeof agents === 'function' ? asList(await agents()) : [],
    ])
    const runsByIssue = new Map()
    for (const r of runs) {
      const rid = r.issueId || r.contextSnapshot?.issueId || r.context?.issueId
      if (!rid) continue
      if (!runsByIssue.has(rid)) runsByIssue.set(rid, [])
      runsByIssue.get(rid).push(r)
    }
    return { issues, runs, runsByIssue, agents: new Map(agentList.map((a) => [a.id, a])) }
  }

  // 单个任务的缓存快照：评论 / 运行按任务更新时间缓存（fingerprint），省掉每轮全量 GET
  // persist=false（preview）只读：不写 db.tasks、不落盘，只用缓存里的 prevOwner/prevStatus。
  async function statusOf(i, runsByIssue, ctx, persist = true) {
    const id = i.id
    const cached = db.tasks[id]
    const lastRunAt = (runsByIssue.get(id) || []).reduce((m, r) => Math.max(m, Date.parse(r.finishedAt || r.updatedAt || r.createdAt || 0) || 0), 0)
    const fingerprint = `${i.updatedAt || ''}|${i.status}|${i.assigneeAgentId || ''}|${lastRunAt}`
    if (cached && cached.fingerprint === fingerprint) return cached
    const cs = asList(await get(`/api/issues/${id}/comments`))
    const p = parseHandoffComments(cs, { fieldMaxLen: db.fieldMaxLen, redactText: redact })
    const st = {
      issueId: id, ident: i.identifier, title: String(i.title || '').slice(0, 80), status: i.status,
      ownerId: i.assigneeAgentId || null, ownerUserId: i.assigneeUserId || null, money: Boolean(isMoney(i)),
      handoff: { has: p.has, complete: p.complete, missing: p.missing, version: p.version, at: p.at },
      stale: handoffStale(p.version, cs),
      lastCommentAt: cs.reduce((m, c) => Math.max(m, Date.parse(c.createdAt || 0) || 0), 0),
      commentTimes: cs.filter((c) => !isMineMark(c)).map((c) => c.createdAt).sort(), // 忽略程序自己的标记评论；T4 / preview 复用，省一次 GET
      remindedAt: cached?.remindedAt || null, // 缺交接包提醒
      notifiedAt: cached?.notifiedAt || null, // 资金类：不评论只通知董事会一次
      forwardedAt: cached?.forwardedAt || null, // 换人转交时间
      handedFrom: cached?.handedFrom ?? null, // 上次转交时的前任负责人（同一次换人只转交一次）
      firstSeenAt: cached?.firstSeenAt || new Date(now()).toISOString(),
      parsedAt: new Date(now()).toISOString(),
      prevOwner: cached?.prevOwner ?? null,
      prevStatus: cached?.prevStatus ?? null,
    }
    if (!persist) return st
    db.tasks[id] = { ...st, fingerprint }
    save()
    return db.tasks[id]
  }

  const ownerOk = (owner) => owner && !['paused', 'terminated', 'pending_approval'].includes(owner.status)

  const triggerAt = (t, i, st) =>
    t.type === 'blocked' ? (t.at || st.firstSeenAt)
      : t.type === 'handed' ? (t.at || i.updatedAt || st.firstSeenAt)
        : (t.at || st.firstSeenAt)

  // 只读预览：本轮会怎么处理（不发送、不写盘）
  async function preview() {
    if (!busy) load()
    const ctx = await context()
    const on = onDuty()
    const items = []
    for (const i of ctx.issues) {
      if (!ACTIVE.has(i.status) || i.assigneeUserId) continue
      let st
      try { st = await statusOf(i, ctx.runsByIssue, ctx, false) } catch (e) { log(`[handoff] 读任务 ${i.identifier} 失败：${e.message}`); continue }
      const det = detectTriggers({ issue: i, runs: ctx.runsByIssue.get(i.id) || [], comments: st.commentTimes || [], prev: { owner: st?.prevOwner, status: st?.prevStatus }, now: now(), idleMs: db.idleMs })
      if (det.triggers.length === 0 && det.idleSkip == null) continue // T14b：被豁免的等待任务也要出现在 preview，带 skip 原因
      const owner = ctx.agents.get(i.assigneeAgentId)
      items.push({
        issueId: i.id, ident: i.identifier, title: st.title, status: i.status,
        owner: owner ? clip(owner.name, 40, redact) : '–', ownerId: i.assigneeAgentId,
        money: st.money,
        triggers: det.triggers.map((t) => ({ type: t.type, label: t.label, at: triggerAt(t, i, st), detail: t.detail })).sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0)),
        skip: det.idleSkip || null,
        gaps: det.gaps && det.gaps.length ? det.gaps : [],
        handoff: st.handoff, stale: Boolean(st.stale),
        remindedAt: st.remindedAt, notifiedAt: st.notifiedAt, forwardedAt: st.forwardedAt,
        since: st.firstSeenAt,
      })
    }
    items.sort((a, b) => (a.since || '').localeCompare(b.since || ''))
    return { at: new Date(now()).toISOString(), enabled: db.enabled, corrupt: Boolean(db.corrupt), dutyOn: on, items }
  }

  /** tick / 手动扫描：发送提醒或转交评论（受总开关、每轮 6 项、每岗位 1 小时 3 条限制），T1/T2/T4 只在上班时间 */
  async function run(manual = false) {
    if (busy) return { ran: false, reason: '巡检正在进行' }
    busy = true
    try {
      const raw = readCfg()
      const enabled = raw ? raw.enabled !== false : false
      if (!enabled) return { ran: false, reason: '总开关已关闭' }
      if (!manual && now() < notBefore) return { ran: false, reason: '重启后等待 5 分钟' }
      if (!manual && db.nextAt != null && now() < db.nextAt) return { ran: false, reason: '未到巡检时间' }
      // 任务卡 §3：只有 T4（长停留）限定上班时间提醒；T1/T2/T3 提醒与转交不受时间限制（手动扫描同样不受限）。
      const ctx = await context()
      const candidates = []
      const seen = new Set()
      for (const i of ctx.issues) {
        if (!ACTIVE.has(i.status) || i.assigneeUserId || seen.has(i.id)) continue
        seen.add(i.id)
        let st
        try { st = await statusOf(i, ctx.runsByIssue, ctx) } catch (e) { log(`[handoff] 读任务 ${i.identifier} 失败：${e.message}`); continue }
        const before = st.prevOwner // 上一轮扫描的负责人（换人转交要用它当「前任」），先在覆盖前记下
        const cs = asList(await get(`/api/issues/${i.id}/comments`))
        const det = detectTriggers({ issue: i, runs: ctx.runsByIssue.get(i.id) || [], comments: cs, prev: { owner: st.prevOwner, status: st.prevStatus }, now: now(), idleMs: db.idleMs })
        if (det.triggers.length === 0) {
          const snap = { ...st, prevOwner: i.assigneeAgentId, prevStatus: i.status }
          if (det.idleSkip != null || (det.gaps && det.gaps.length)) { snap.idleSkip = det.idleSkip || null; snap.gaps = det.gaps || [] } // T14b：被豁免的等待任务不发评论，但把原因 / 字段缺口带给治理中心
          db.tasks[i.id] = snap; save(); continue // 刷新快照，避免误报换人
        }
        // 把本轮检测到的触发与负责人名记进快照：治理中心「交接」分区 / /state 展示「触发类型、经过多久、负责人」用，不含动作记录
        db.tasks[i.id].triggers = det.triggers.map((t) => ({ type: t.type, label: t.label, at: triggerAt(t, i, st), detail: t.detail })).sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0))
        db.tasks[i.id].owner = (() => { const ag = ctx.agents.get(i.assigneeAgentId); return ag ? clip(ag.name, 40, redact) : '–' })()
        candidates.push({ i, st, det, cs, before })
        // 记录本次观察到的负责人 / 状态，保证下一轮 T2 / T3 判断连续
        const s2 = db.tasks[i.id]
        s2.prevOwner = i.assigneeAgentId
        s2.prevStatus = i.status
        save()
      }
      candidates.sort((a, b) => Date.parse(a.st.firstSeenAt || 0) - Date.parse(b.st.firstSeenAt || 0))
      let processed = 0
      const sentByAgent = new Map()
      for (const { i, st, det, cs, before } of candidates) {
        if (processed >= db.maxPerScan) break // 每轮最多处理 maxPerScan 个任务
        const nowMs = now()
        const owner = ctx.agents.get(i.assigneeAgentId)
        const fore = before ? ctx.agents.get(before) : null
        const p = parseHandoffComments(cs, { fieldMaxLen: db.fieldMaxLen, redactText: redact })
        let acted = false // 一个任务本轮最多发出一动作（转交或提醒），避免重复打扰
        for (const t of det.triggers) {
          if (acted) break
          // 资金类：任何触发（含换人转交）都不自动评论，只在治理中心显示 + 通知董事会一次（与负责人状态、每岗每小时条数无关）
          if (st.money) {
            if (st.notifiedAt) continue
            const labels = det.triggers.map((x) => x.label).join('、')
            db.tasks[i.id].notifiedAt = new Date(nowMs).toISOString(); save()
            await notify(`${MARK} ${i.identifier} ${clip(i.title, 100, redact)}：${labels}，评论里还没有完整交接包${p.has ? `（缺：${p.missing.join('、')}）` : '（完全没有）'}。资金类不发巡检 / 转交评论，请 Lead 与董事会关注。`)
            record({ ident: i.identifier }, '缺交接包通知（资金类）')
            await spread()
            processed++; acted = true
            continue
          }
          // 换人转交：同一次换人只转交一次（handedFrom 记住上次转交时的前任）；新负责人不在岗就不打扰
          if (t.type === 'handed') {
            if (st.handedFrom === before && st.forwardedAt) continue
            if (!ownerOk(owner)) continue
            db.tasks[i.id].forwardedAt = new Date(nowMs).toISOString(); db.tasks[i.id].handedFrom = before; save()
            await send('POST', `/api/issues/${i.id}/comments`, { body: forwardBody({ fore, p, cs, prevOwnerId: before }) })
            record({ ident: i.identifier }, '换人：已转交前任交接包')
            await spread()
            processed++; acted = true
            continue
          }
          // T4 长停留只在上班时间提醒（任务卡 §3）
          if (t.type === 'idle' && !onDuty()) continue
          // 缺交接包提醒（T1 / T2 / T4）：已有完整交接包就无需提醒
          if (p.has && p.complete) continue
          const cooled = !st.remindedAt || nowMs - Date.parse(st.remindedAt) >= db.reminderDelayMs
          if (!cooled) continue
          if (!ownerOk(owner)) continue
          const sent = sentByAgent.get(owner.id) || []
          const recent = sent.filter((x) => nowMs - x < 3600000)
          if (recent.length >= db.perAgentPerHour) continue // 每岗位 1 小时内最多 3 条
          db.tasks[i.id].remindedAt = new Date(nowMs).toISOString(); save()
          await send('POST', `/api/issues/${i.id}/comments`, { body: `${MARK}\n这个任务出现了「${t.label}」${t.detail ? `（${t.detail}）` : ''}，接手的同事需要现场情况：评论里还没有完整交接包${p.has ? `（缺：${p.missing.join('、')}）` : `（完全没有，请查任务卡和评论重建）`}。\n请按模板补写交接包：【交接包】对象版本：… ＋ 已完成 / 未完成 / 下一步 / 阻塞与解除条件 / 工作位置 / 不要重做，六个字段缺一不可。` })
          sentByAgent.set(owner.id, [...recent, nowMs])
          record({ ident: i.identifier }, `${t.label}：已提醒补写交接包`)
          await spread()
          processed++; acted = true
        }
      }
      db.lastAt = new Date(now()).toISOString(); db.nextAt = now() + 30 * 60000; save()
      return { ran: true, processed }
    } catch (e) { log(`[handoff] ${e.message}`); return { ran: false, reason: String(e.message || e) } } finally { busy = false }
    function spread() { return new Promise((ok) => setTimeout(ok, spreadMs)) } // 评论之间留间隔，避免同一账号并发
  }

  // 转交正文：前任最近的完整交接包（脱敏、≤1500 字、保留字段结构）；没有完整包就写缺什么并列出前任最近 3 条评论时间（不贴正文）
  // 注意：只能用调用方捕获的 prevOwnerId（run() 里的 before），不能用 st.prevOwner —— 后者在 run() 中已被刷新为现任。
  function forwardBody({ fore, p, cs, prevOwnerId }) {
    const prevName = fore ? clip(fore.name, 40, redact) : '已不在岗的同事'
    const head = `${FORWARD_MARK}\n这个任务换了负责人（此前是 ${prevName}）。这是前任留下的交接包，请先核对对象版本再继续：`
    if (p.has && p.complete) {
      const lines = [`【交接包】${p.version != null ? `对象版本：${redact(String(p.version))}` : '(没有写对象版本)'}`]
      for (const k of FIELD_KEYS) lines.push(`${FIELD[k]}：${redact(String(p.fields?.[k] ?? ''))}`)
      return (head + '\n' + lines.join('\n')).slice(0, 1500)
    }
    const mine = (Array.isArray(cs) ? cs : []).filter((c) => prevOwnerId != null && c.authorAgentId === prevOwnerId && !isMineMark(c))
    const times = mine.slice(-3).map((c) => { const t = c.createdAt; return t ? new Date(t).toLocaleString('zh-CN', { timeZone: 'Asia/Phnom_Penh', hour12: false }) : '时间未知' })
    return (head + `\n前任没有留下完整交接包${p.has ? `（缺：${p.missing.join('、')}）` : '（完全没有）'}，他最近 3 条评论时间：${times.join('；') || '—'}。请先核对任务卡、评论和对象版本重建现场，再补写完整交接包。`).slice(0, 1500)
  }

  const timer = { ref: null }
  return {
    preview,
    run: () => run(true),
    tick: () => run(false),
    start() { if (timer.ref) return; timer.ref = setInterval(() => { run(false).catch(() => {}) }, 30 * 60000); timer.ref.unref() },
    view() {
      const cfg = readCfg()
      const items = Object.values(db.tasks || {}).map(({ fingerprint, commentTimes, ...t }) => t).filter((t) => t.issueId).slice(-100)
      return {
        enabled: cfg ? cfg.enabled !== false : false, corrupt: Boolean(db.corrupt),
        lastAt: db.lastAt, nextAt: new Date(Math.max(db.nextAt || 0, notBefore)).toISOString(),
        missingCount: items.filter((t) => !(t.handoff && t.handoff.complete)).length,
        forwardedCount: items.filter((t) => t.forwardedAt).length,
        items, records: (db.records || []).slice(-10).reverse(),
      }
    },
  }
}