// T12：协作关系图（「谁和谁在配合」，纯函数可测部分）。
// 数据只来自事件账本（events/YYYY-MM-DD.jsonl 的字段 id, at, kind, from, to, ref, text）。
// 「协作」定义：对每个有向对 (from → to)，统计窗口内的：
//   - 派单：kind = dispatch（from 派给 to）
//   - 交接 / 汇报：kind = report 且 to 非空（from 向 to 汇报）
//   - 互动发言：kind = speak 且 to 非空且 ref 非空（与某个任务相关的、对某位同事说的话）——
//     休息区闲聊、八卦（无 ref 或 lounge）一律不算
// 事件里 to 为空的（庆祝、对全体发言）不构成边；celebrate / submit_to_board / board_decision 不计。
// 账本目前没有的两类信号（评审通过 / 退回、阻塞解除）：buildEvents 当前不产生这两类事件，
// 本模块不自行解析活动流、不推断，图里不含这两类（作为后续任务列出）。
// 全部数字只反映有记录的协作事件，不代表工作量或贡献。
// 入参的 from / to 已由调用方从 agent uuid 映射成岗位 id（如 'Lead' / 'board'）；不在岗位名单里的端点不构成边。
// T12b：窗口 = 最近 N 个上班日（含今天，若今天是上班日；今天的数据是截至现在的未完成一天）。
// 「上班日数」口径：普通日子按账本文件的日期键计入；今天这个未完成的日子按「有至少一条账本事件」计入，
// 今天没有任何账本事件时不计入——不要把空的今天算成一个上班日，否则会冲淡数据（见 partialToday / workdayCount）。
import fs from 'node:fs'
import path from 'node:path'

export const COLLAB_KINDS = ['dispatch', 'report', 'speak']
export const DISCLAIMER = '仅反映有记录的协作事件，不代表工作量或贡献'
export const NO_REVIEW_SOURCE = '评审通过 / 退回暂无事件来源，本版图不含这两类'
export const NOT_ENOUGH_NOTE = '数据不足，仅供参考'
export const EMPTY_NOTE = '账本里还没有足够的协作记录'
// T12b：派生指标阈值，页面与测试都从接口返回的 thresholds（浅拷贝自这里）读取，不另写死。
export const COLLAB_THRESHOLDS = Object.freeze({ oneToOneShare: 0.8, minOutForOneToOne: 5 })
const DAY = 86400000

// 金边 +07 的日期键（与 account 账本分文件口径一致）
const dateKey = (ms) => new Date(Number(ms) + 7 * 3600000).toISOString().slice(0, 10)
// 今天的金边日期键（未完成的一天）
export const ledgerTodayKey = (nowMs = Date.now()) => dateKey(nowMs)

// 最近 n 个「上班日」（按作息 duty.days 的星期集合，金边 +07；与 T9 workload 的 workdays 口径一致）。
// T12b：从今天（金边 00:00）开始往回数——今天是上班日则包含今天（数据截至现在的未完成一天）；
// 今天不是上班日则从最近一个上班日算起。最多尝试 370 天；dutyDays 非法或缺省时退化为周一至周五。
export function workdayKeys(nowMs, n, dutyDays) {
  const dayset = Array.isArray(dutyDays) && dutyDays.length ? dutyDays : [1, 2, 3, 4, 5]
  const out = []
  for (let ms = Date.parse(dateKey(nowMs) + 'T00:00:00+07:00'), i = 0; out.length < n && i < 370; ms -= DAY, i++) {
    const d = dateKey(ms)
    if (dayset.includes(new Date(`${d}T12:00:00+07:00`).getUTCDay())) out.unshift(d)
  }
  return out
}

// T12b：窗口选择（server.mjs 的 GET /collab 用；纯函数可测）。
// allDays = 账本实际拥有的日期键（升序，金边；账本只在有事件时才建文件，见 events-ledger.mjs）；
// dutyDays 为作息星期集合，传 null / 空数组表示无作息 → 退化为账本最近 n 天。
// 返回 { workdays, workdayCount, partialToday }：
// - workdays = 最近 n 个上班日里账本实际有的日期（含今天——若今天是上班日且今天有至少一条账本事件）
// - workdayCount = 计入的上班日数；今天没有账本事件时不计入，避免空的今天冲淡数据
// - partialToday = 窗口是否含未完成的今天（今天有至少一条账本事件且属于窗口）
export function selectWindowDays({ allDays = [], nowMs = Date.now(), n, dutyDays = null }) {
  const present = new Set(allDays)
  const cand = Array.isArray(dutyDays) && dutyDays.length ? workdayKeys(nowMs, n, dutyDays) : allDays.slice(-n)
  const workdays = cand.filter((d) => present.has(d))
  const today = ledgerTodayKey(nowMs)
  return { workdays, workdayCount: workdays.length, partialToday: workdays.includes(today) }
}

// ── 布局（浏览器端 collab-graph.js 也会用到；与 office-layout.js 的房间分组和颜色保持一致）──
const GROUP_LABEL = { product: '产品与设计', eng: '工程', quality: '质量与安全', drlife: 'Dr.life+', ops: '运维', kb: '知识库', board: '董事会' }
export const GROUP_ORDER = ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'board']
export const GROUP_COLOR = { product: '#8b6cff', eng: '#28b4d6', quality: '#e8963a', drlife: '#b69a64', ops: '#3fbf8f', kb: '#6c8cff', board: '#ffb020' }
export const groupLabel = (g) => GROUP_LABEL[g] || g

// 岗位名 → 房间分组（与 office-layout.js 的 SEATS 键值一致，镜像过来以便服务端与 Node 测试引用；
// office-layout.js 是浏览器 ES 模块，Node 无法按 ESM 解析 .js。修改时须与 SEATS 保持同步）
export const SEAT_GROUPS = {
  Lead: 'product', PM: 'product', Architect: 'product', UIUX: 'product',
  FrontendSenior: 'eng', Frontend1: 'eng', Frontend2: 'eng', BackendSenior: 'eng', Backend1: 'eng', Backend2: 'eng',
  QAAutomation: 'quality', Reviewer1: 'quality', Reviewer2: 'quality', SecurityReviewer: 'quality',
  GoSenior: 'drlife', Go1: 'drlife', Go2: 'drlife', DBEngineer: 'drlife',
  LedgerAuditor: 'drlife', ReactSenior: 'drlife', React1: 'drlife', Localizer: 'drlife',
  OpsLead: 'ops', OpsEngineer: 'ops', KnowledgeKeeper: 'kb',
}

// 汇总「协作」：输入账本事件记录数组（from/to 已映射成岗位 id）+ 岗位列表 + 窗口信息 + 类型筛选，
// 输出节点（含度 / 入出边次数）、有向边（count 与分项）、派生指标（孤立 / 汇聚点 / 一对一依赖）与数据缺口说明。
// kinds 只允许 COLLAB_KINDS 的子集；edges[n].count = 所选类型的分项之和，未选类型的边被过滤掉。
// window = { kind:'7'|'14'|'all', workdays:[...], from, to, workdayCount }；无窗口时 notes 只有免责与缺口提示。
export function buildCollab({ records = [], nodes = [], window = null, kinds = COLLAB_KINDS }) {
  const sel = new Set(kinds.filter((k) => COLLAB_KINDS.includes(k)))
  const emptyNodes = Array.from(sel).length === 0
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const edgeMap = new Map() // from|to -> { from, to, dispatch, report, speak }
  let skippedNoRef = 0 // speak 无 ref（闲聊 / 八卦）不计
  let skippedEmptyTo = 0 // to 为空不成边
  let skippedUnknown = 0 // 端点不在岗位名单
  for (const r of records) {
    if (!r || typeof r.from !== 'string' || !r.from || typeof r.to !== 'string' || !r.to) { if (r) skippedEmptyTo++; continue }
    if (!nodeById.has(r.from) || !nodeById.has(r.to)) { skippedUnknown++; continue }
    if (r.kind === 'speak' && (!r.ref || /lounge/i.test(String(r.ref)))) { skippedNoRef++; continue } // 无 ref 或 lounge 的发言是闲聊 / 八卦，不算
    if (!COLLAB_KINDS.includes(r.kind)) continue // celebrate / submit_to_board / board_decision 不计
    const key = r.from + '|' + r.to
    let e = edgeMap.get(key)
    if (!e) { e = { from: r.from, to: r.to, dispatch: 0, report: 0, speak: 0 }; edgeMap.set(key, e) }
    e[r.kind]++
  }
  const edges = []
  for (const e of edgeMap.values()) {
    const count = (sel.has('dispatch') ? e.dispatch : 0) + (sel.has('report') ? e.report : 0) + (sel.has('speak') ? e.speak : 0)
    if (count > 0) edges.push({ from: e.from, to: e.to, count, dispatch: e.dispatch, report: e.report, speak: e.speak })
  }
  edges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0))

  // 节点指标：入 / 出边次数（汇总次数）与入 / 出度（协作对象数，入 / 出分开）
  const inCount = new Map(), outCount = new Map(), inPartners = new Map(), outPartners = new Map()
  for (const e of edges) {
    inCount.set(e.to, (inCount.get(e.to) || 0) + e.count)
    outCount.set(e.from, (outCount.get(e.from) || 0) + e.count)
    let ip = inPartners.get(e.to); if (!ip) { ip = new Set(); inPartners.set(e.to, ip) }
    let op = outPartners.get(e.from); if (!op) { op = new Set(); outPartners.set(e.from, op) }
    ip.add(e.from); op.add(e.to)
  }
  const nodeRows = nodes.map((n) => ({
    id: n.id, name: n.name, group: n.group,
    inCount: inCount.get(n.id) || 0, outCount: outCount.get(n.id) || 0,
    degreeIn: inPartners.get(n.id)?.size || 0, degreeOut: outPartners.get(n.id)?.size || 0,
  }))

  // 派生指标
  const isolated = nodes.filter((n) => !inCount.has(n.id) && !outCount.has(n.id)).map((n) => n.id)
  const hubs = nodeRows.filter((r) => r.inCount > 0).sort((a, b) => b.inCount - a.inCount || b.outCount - a.outCount || (a.id < b.id ? -1 : 1)).slice(0, 3).map((r) => ({ id: r.id, inCount: r.inCount }))
  // 一对一依赖：T12b 起必须同时满足 ① 出边总次数 ≥ minOutForOneToOne；② 出边里 ≥ oneToOneShare 指向同一对象。
  // 任一条件不满足就不标；阈值来自 COLLAB_THRESHOLDS（随接口返回给页面，页面与测试不另写死）。
  const oneToOne = []
  for (const r of nodeRows) {
    if (r.outCount < COLLAB_THRESHOLDS.minOutForOneToOne) continue
    const mine = edges.filter((e) => e.from === r.id)
    let best = 0, partner = null
    for (const e of mine) if (e.count > best) { best = e.count; partner = e.to }
    const share = best / r.outCount
    if (share >= COLLAB_THRESHOLDS.oneToOneShare) oneToOne.push({ id: r.id, partner, share: Math.round(share * 1000) / 1000 })
  }
  oneToOne.sort((a, b) => (a.id < b.id ? -1 : 1))

  // 数据缺口说明（口径写清楚，页面原样显示）
  const notes = []
  if (window) {
    if (window.workdayCount < 3) notes.push(NOT_ENOUGH_NOTE)
    if (window.workdayCount > 0 && window.from) notes.push(`数据自 ${window.from} 起，共 ${window.workdayCount} 个上班日`)
    else if (window.workdayCount === 0) notes.push(EMPTY_NOTE)
  }
  if (skippedNoRef) notes.push(`${skippedNoRef} 条无任务的互动发言未计入`)
  if (skippedEmptyTo) notes.push(`${skippedEmptyTo} 条对全体 / 庆祝发言未构成边`)
  if (skippedUnknown) notes.push(`${skippedUnknown} 条事件涉及未就座岗位，未计入`)
  notes.push(DISCLAIMER, NO_REVIEW_SOURCE)

  return {
    window,
    nodes: nodeRows,
    edges,
    metrics: { isolated, hubs, oneToOne },
    // T12b：随响应下发阈值，页面展示 / 测试均从此处读，不写死两处
    thresholds: { ...COLLAB_THRESHOLDS },
    notes,
    empty: emptyNodes || edges.length === 0,
  }
}

// ── 账本读取辅助（只读，供 server.mjs 的 GET /collab 使用）──
const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/
export function ledgerDayFiles(dir) {
  let out = []
  try { out = fs.readdirSync(path.join(dir, 'events')).map((n) => { const m = n.match(DAY_RE); return m ? m[1] : null }).filter(Boolean).sort() } catch {}
  return out
}