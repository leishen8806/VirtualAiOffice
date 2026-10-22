// T13：有边界的返工 —— 只识别、只提示、只在超限时发一次巡检评论；不改状态、不改负责人、不取消、不切换派发权。
// 数据只来自任务评论（模板 流程/模板/返工记录.md 的三类注释）：退回、修复、复验；标题行容忍全角/半角括号、
// 「第 2 轮」「第二轮」、前后空白。无法解析的格式不猜测，记为「格式不全」并给出原因。
// T13b：只认「评论里真正的标题行」——被【…】/[…] 括起、出现在行首（允许 ≤6 字符的 Markdown 前缀：空白、#、>、*、-、数字序号）。
// 正文里「提到 / 引用」的（如"CMP-295 第 2 轮退回…""附【第 2 轮修复】"）一律不算，只计入 ignoredMentions（只给数量），不悄悄丢掉。
// 什么算一轮返工（流程第 6 节）：提交验收之后被评审员、委员或董事会退回，或执行者提交第 N 轮修复，均算到该轮；提交前自检不算。
// 程序自己的评论（标记 【返工巡检】）不参与计数。资金类任务同样识别与显示，但不发评论，只通知董事会。
// 阈值来自 rework.json（可调，文件不存在按关闭处理）；状态保存在 rework.json，原子写入，损坏视为关闭不崩溃。
import fs from 'node:fs'
import path from 'node:path'
import { MONEY_RE } from './standup.mjs' // 资金类口径：复用 standup.mjs 的，不复制

export const MARK = '【返工巡检】'
export const DEFAULT_CFG = { enabled: false, capRound: 3, warnRound: 2, repeatItemRounds: 2, maxPerScan: 6 }
const ACTIVE = new Set(['in_progress', 'in_review', 'todo', 'blocked'])
const ended = (s) => ['done', 'cancelled'].includes(s)

// 中文数字 → 阿拉伯（只支持 一..九、十、十几、几十、几十几；其它组合解析不出按「格式不全」，不猜）
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const cnNum = (s) => {
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  if (s.length === 2 && s[0] === '十') return CN[s[1]] == null ? null : 10 + CN[s[1]] // 十一..十九
  if (s.length === 2 && s[1] === '十') return CN[s[0]] == null ? null : CN[s[0]] * 10 // 二十..九十
  if (s.length === 3 && s[1] === '十') return CN[s[0]] == null || CN[s[2]] == null ? null : CN[s[0]] * 10 + CN[s[2]] // 二十三
  if (s.length === 1) return CN[s] ?? null
  return null
}
// 正文任意位置的「第 N 轮退回 / 修复 / 复验」字样：只用于统计被排除的「提到 / 引用」数量，不构成标题
const HEADER = /第\s*(\d+|[一二三四五六七八九十]+)\s*轮\s*(退回|修复|复验)/
// T13b 真正的标题行：行首（可带 ≤6 字符 Markdown 前缀：空白、#、>、*、-、.、数字序号等）后紧跟
// 被全/半角括号【…】/[…] 包住的「第 N 轮 退回 / 修复 / 复验」。正文中间的「第 3 轮退回」「【第 3 轮修复】」不匹配。
const TITLE_LINE = /^([#>*\-.)、\d\s]{0,6})[【\[]第\s*(\d+|[一二三四五六七八九十]+)\s*轮\s*(退回|修复|复验)(?:（[^）\r\n]*）|\([^\)\r\n]*\))?[】\]]/
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// 只看 agent 评审员和董事会写的评论；程序自己的（含 【返工巡检】 标记）不计数
const authored = (c) => (c.authorAgentId || c.authorUserId) && !String(c.body || '').includes(MARK)

/**
 * 解析一个任务的评论数组，输出返工状态（纯函数，可单测）。
 * cfg: { capRound, warnRound, repeatItemRounds }
 * 返回 { rounds, roundsSource, items:[{r,status,failRounds}], openItems, repeatedItems:[...], formatIssues:[...], ignoredMentions, warned, capped }
 * status: open 未修 / fixed 已修待复验 / verified 复验通过 / failed 复验未通过
 * ignoredMentions: 被排除的「提到 / 引用」标题的条数（正文里出现、但不在行首的「第 N 轮×」字样），只给数量。
 */
export function parseReworkComments(comments, cfg = DEFAULT_CFG) {
  const capRound = Number(cfg?.capRound) || DEFAULT_CFG.capRound
  const warnRound = Number(cfg?.warnRound) ?? DEFAULT_CFG.warnRound
  const repeatItemRounds = Number(cfg?.repeatItemRounds) || DEFAULT_CFG.repeatItemRounds
  const state = new Map() // R编号 -> { num, status, question, firstRound, verifiedRound, failRounds:Set }
  const formatIssues = []
  let rounds = 0
  let returnRounds = 0
  let fixRounds = 0
  let ignoredMentions = 0 // T13b：正文里「提到 / 引用」但不在行首的标题片段数量（不进 rounds，只计数）
  const ordered = (Array.isArray(comments) ? comments : [])
    .filter((c) => authored(c)) // T13b：标题行过滤在循环内做，这里只保留作者写的评论
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
  for (const c of ordered) {
    const body = String(c.body || '')
    const lines = body.split('\n')
    // T13b：只认「标题行」——位于行首（可带 ≤6 字符 Markdown 前缀）且被【…】/[…] 括起。
    // 一条评论可以有多个标题行，每个标题行各自处理。
    const heads = []
    for (let li = 0; li < lines.length; li++) {
      const m = lines[li].match(TITLE_LINE)
      if (!m) continue
      const n = cnNum(m[2])
      if (n == null || !Number.isFinite(n)) { formatIssues.push('轮次无法解析'); continue }
      heads.push({ li, n, kind: m[3] })
    }
    // 正文里被「提到 / 引用」的标题字面（如"若它逾时或第 3 轮退回""CMP-278 附【第 2 轮修复】"）——不算，只计数
    const rawMentions = (body.match(new RegExp(HEADER.source, 'g')) || []).length
    ignoredMentions += Math.max(0, rawMentions - heads.length)
    if (!heads.length) continue // 没有标题行的评论不参与计数
    // 同一条评论里每个标题行各自处理；R 项只归属于它上面最近的一个标题行
    for (let hi = 0; hi < heads.length; hi++) {
      const h = heads[hi]
      const seg = lines.slice(h.li, hi + 1 < heads.length ? heads[hi + 1].li : lines.length).join('\n')
      const n = h.n
      const inherit = (num) => {
        const prev = state.get(num)
        return [prev?.status || 'open', prev]
      }
      if (h.kind === '退回') {
        const nums = [], problems = []
        for (const rm of seg.matchAll(/R\s*(\d+)\s*[|｜]\s*(.*)/g)) {
          const num = Number(rm[1]), line = rm[2].trim()
          if (!Number.isFinite(num)) continue
          nums.push(num); problems.push({ num, q: clip(line, 80) })
          if (!/对应\s*AC/.test(line)) formatIssues.push(`R${num} 缺「对应 AC」`)
          if (!/(复现|证据)/.test(line)) formatIssues.push(`R${num} 缺「复现 / 证据」`)
          const prev = state.get(num)
          if (prev && prev.verifiedRound != null && n > prev.verifiedRound) formatIssues.push(`R${num} 编号复用（第 ${prev.verifiedRound} 轮已复验通过又退回）`)
          if (prev && prev.question && prev.question !== clip(line, 80)) formatIssues.push(`R${num} 编号复用（问题与第 ${prev.firstRound} 轮不同）`)
        }
        // 编号重排：同一次退回里编号不是严格递增（R2 在 R1 前等）
        for (let k = 1; k < nums.length; k++) { if (nums[k] <= nums[k - 1]) { formatIssues.push('R 编号重排'); break } }
        // T13b：退回标题行之后必须能解析出至少一个「R<数字> ｜ …」条目，否则是引用模板一类，不算真实退回
        if (nums.length === 0) { formatIssues.push('退回缺 R 项'); continue }
        returnRounds = Math.max(returnRounds, n)
        rounds = Math.max(returnRounds, fixRounds)
        for (const p of problems) {
          const prev = state.get(p.num)
          state.set(p.num, { num: p.num, status: 'open', question: p.q, firstRound: prev?.firstRound || n, verifiedRound: prev?.verifiedRound ?? null, failRounds: prev?.failRounds || new Set() })
        }
      } else if (h.kind === '修复') {
        fixRounds = Math.max(fixRounds, n)
        rounds = Math.max(returnRounds, fixRounds)
        const repairs = [...seg.matchAll(/R\s*(\d+)\s*[|｜]\s*(.*)/g)]
        if (repairs.length === 0) formatIssues.push('修复缺 R 项')
        for (const rm of repairs) {
          const num = Number(rm[1]), line = String(rm[2]).trim()
          if (!Number.isFinite(num)) continue
          const explicit = line.match(/状态\s*[：:]\s*(已修|未修)/)
          const status = explicit ? (explicit[1] === '已修' ? 'fixed' : 'open') : /未修/.test(line) ? 'open' : /已修正|已修复|已修/.test(line) ? 'fixed' : 'open'
          if (!explicit && status === 'open' && !/未修/.test(line)) formatIssues.push('修复缺状态')
          const [, prev] = inherit(num)
          state.set(num, { num, status, question: prev?.question || null, firstRound: prev?.firstRound || n, verifiedRound: prev?.verifiedRound ?? null, failRounds: prev?.failRounds || new Set() })
        }
      } else { // 复验
        for (const rm of seg.matchAll(/R\s*(\d+)\s*(通过|未通过)/g)) {
          const num = Number(rm[1]), pass = rm[2] === '通过'
          if (!Number.isFinite(num)) continue
          const prev = state.get(num)
          const failRounds = new Set(prev?.failRounds || [])
          if (!pass) failRounds.add(n)
          state.set(num, { num, status: pass ? 'verified' : 'failed', question: prev?.question || null, firstRound: prev?.firstRound || n, verifiedRound: pass ? n : prev?.verifiedRound ?? null, failRounds })
        }
      }
    }
  }
  const items = [...state.values()].sort((a, b) => a.num - b.num).map((it) => ({ r: `R${it.num}`, status: it.status, failRounds: [...it.failRounds].sort((a, b) => a - b) }))
  const openItems = items.filter((x) => x.status !== 'verified').length
  const repeatedItems = items.filter((x) => x.failRounds.length >= repeatItemRounds).map((x) => x.r)
  const roundsSource = returnRounds && fixRounds ? 'both' : returnRounds ? 'return' : fixRounds ? 'fix' : null
  return { rounds, roundsSource, items, openItems, repeatedItems, formatIssues, ignoredMentions, warned: rounds === warnRound, capped: rounds >= capRound }
}

/** 由 createRework.view() 的结果判断某任务是否返工超限（读不到就按未超限，不能卡死晨会 / 验收） */
export function isCappedView(view, issueId) {
  try {
    const t = (view && Array.isArray(view.tasks) ? view.tasks : []).find((x) => x.issueId === issueId)
    return Boolean(t?.capped && t?.status && !ended(t.status))
  } catch { return false }
}

export function createRework({ dir, company, get, send, notify, dutyOn, now = Date.now, log = console.log }) {
  const file = path.join(dir, 'rework.json')
  const notBefore = now() + 300000 // 重启后第一次扫描等 5 分钟，留交接窗口
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
  let db = { ...DEFAULT_CFG, corrupt: false, tasks: {}, records: [], lastAt: null, nextAt: notBefore }
  const load = () => {
    let raw
    try { raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null } catch (e) { db = { ...DEFAULT_CFG, corrupt: true, tasks: {}, records: [], lastAt: null, nextAt: notBefore }; log(`[rework] 配置损坏，按关闭处理：${e.message}`); return }
    if (raw == null) return // 没有文件：保持默认（关闭）
    db = { ...DEFAULT_CFG, ...raw, corrupt: false, tasks: raw.tasks || {}, records: raw.records || [], lastAt: raw.lastAt || null, nextAt: Math.max(raw.nextAt || 0, notBefore) }
  }
  load()
  let busy = false
  function onDuty() { try { return Boolean(dutyOn && dutyOn()) } catch { return false } }
  // enabled 总开关以文件实时值为准（热关闭 / 损坏视为关闭）；resume 时不清零已发记录
  const save = () => {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1))
    fs.renameSync(tmp, file)
  }
  const record = (it, action) => { db.records.push({ at: new Date(now()).toISOString(), ident: it.ident, action }); db.records = db.records.slice(-50); save() }
  const asList = (r) => (Array.isArray(r) ? r : r?.issues || r?.comments || [])

  // 评论按任务更新时间缓存：任务的 updatedAt 变了才重新拉评论，省掉每次全量 GET
  async function statusOf(i) {
    const id = i.id
    const cached = db.tasks[id]
    if (cached && cached.fingerprint === `${i.updatedAt}|${i.status}`) return cached
    const cs = asList(await get(`/api/issues/${id}/comments`)).map((c) => ({ authorAgentId: c.authorAgentId, authorUserId: c.authorUserId, body: c.body, createdAt: c.createdAt }))
    const parsed = parseReworkComments(cs, db)
    const money = MONEY_RE.test(`${i.title}\n${i.description || ''}`)
    // R 项状态: open 未修 / fixed 已修待复验 / verified 复验通过 / failed 复验未通过
    const kind = (x) => (x.status === 'verified' ? '通过' : x.status === 'fixed' ? '已修待复验' : x.status === 'failed' ? '未通过' : '未修')
    const st = {
      issueId: id, ident: i.identifier, title: clip(i.title, 80), status: i.status, money,
      rounds: parsed.rounds, roundsSource: parsed.roundsSource, items: parsed.items, openItems: parsed.openItems, repeatedItems: parsed.repeatedItems,
      ignoredMentions: parsed.ignoredMentions,
      kindLine: parsed.items.slice(0, 10).map((x) => `${x.r}（${kind(x)}）`).join('、').slice(0, 400),
      formatIssues: parsed.formatIssues.slice(0, 20), warned: parsed.warned, capped: parsed.capped,
      parsedAt: new Date(now()).toISOString(),
    }
    db.tasks[id] = { ...st, fingerprint: `${i.updatedAt}|${i.status}`, sentAt: cached?.sentAt || null, sentMs: cached?.sentMs || null, notifiedAt: cached?.notifiedAt || null, since: cached?.since || new Date(now()).toISOString() }
    save()
    return db.tasks[id]
  }

  async function context() {
    return asList(await get(`/api/companies/${company}/issues`))
  }

  async function run(manual = false) {
    if (busy) return { ran: false, reason: '巡检正在进行' }
    busy = true
    try {
      const raw = readCfg()
      const enabled = raw ? raw.enabled !== false : false
      if (!enabled) return { ran: false, reason: '总开关已关闭' }
      if (!manual && now() < notBefore) return { ran: false, reason: '重启后等待 5 分钟' }
      if (!manual && db.nextAt != null && now() < db.nextAt) return { ran: false, reason: '未到巡检时间' }
      if (!manual && !onDuty()) return { ran: false, reason: '非上班时间' }
      const issues = await context()
      const candidates = issues.filter((i) => ACTIVE.has(i.status))
      candidates.sort((a, b) => Date.parse(a.updatedAt || 0) - Date.parse(b.updatedAt || 0))
      let processed = 0
      for (const i of candidates) {
        if (processed >= db.maxPerScan) break
        let st
        try { st = await statusOf(i) } catch (e) { log(`[rework] 读任务 ${i.identifier} 失败：${e.message}`); continue }
        if (!st.capped || ended(st.status)) continue
        const nowMs = now()
        if (st.sentAt) continue // 只做一次：同一任务发过巡检评论以后不再重复（也保证了 24 小时内最多一条）
        const openLine = st.items.slice(0, 10).map((x) => `${x.r}（${x.status === 'verified' ? '通过' : x.status === 'fixed' ? '已修待复验' : x.status === 'failed' ? '未通过' : '未修'}）`).join('、').slice(0, 400)
        if (st.money) {
          // 资金类不发评论，只通知董事会一次
          if (!st.notifiedAt) {
            db.tasks[i.id].notifiedAt = new Date(nowMs).toISOString(); save()
            await notify(`${MARK} ${st.ident} ${st.title}：已进行到第 ${st.rounds} 轮返工（依据：${st.roundsSource === 'both' ? '退回 / 修复评论' : st.roundsSource === 'fix' ? '修复评论' : '退回评论'}），未关闭 R 项 ${st.openItems} 个（资金类）。按流程请 Lead 与董事会决定：继续 / 拆分 / 换人 / 取消。`)
            record(st, '超限通知（资金类）')
          }
          continue
        }
        // 普通任务：发一条巡检评论（只此一次）+ 通知董事会
        db.tasks[i.id].sentAt = new Date(nowMs).toISOString(); db.tasks[i.id].sentMs = nowMs; save()
        await send('POST', `/api/issues/${i.id}/comments`, {
          body: `${MARK}\n已进行到第 ${st.rounds} 轮返工（依据：${st.roundsSource === 'both' ? '退回 / 修复评论' : st.roundsSource === 'fix' ? '修复评论' : '退回评论'}），未关闭 R 项：${openLine}。\n按流程请 Lead 与董事会决定：继续 / 拆分 / 换人 / 取消；在决定前请不要再自行提交验收。`,
        })
        await notify(`${MARK} ${st.ident} ${st.title}：已进行到第 ${st.rounds} 轮返工（依据：${st.roundsSource === 'both' ? '退回 / 修复评论' : st.roundsSource === 'fix' ? '修复评论' : '退回评论'}），未关闭 R 项 ${st.openItems} 个。按流程请 Lead 与董事会决定。`)
        record(st, '超限：已发巡检评论并通知董事会')
        processed++
      }
      db.lastAt = new Date(now()).toISOString(); db.nextAt = now() + 30 * 60000; save()
      return { ran: true, processed }
    } catch (e) { log(`[rework] ${e.message}`); return { ran: false, reason: String(e.message || e) } } finally { busy = false }
  }

  const timer = { ref: null }
  return {
    isCapped: (issueId) => isCappedView(view(), issueId),
    run: () => run(true),
    tick: () => run(false),
    start() { if (timer.ref) return; timer.ref = setInterval(() => { run(false).catch(() => {}) }, 30 * 60000); timer.ref.unref() },
    view() {
      const cfg = readCfg() // enabled 总开关以文件实时值为准：热关闭 / 损坏 => 关闭
      const ts = Object.values(db.tasks || {}).map(({ fingerprint, ...t }) => ({ id: t.ident, ...t }))
      const capped = ts.filter((t) => t.capped && t.status && !ended(t.status))
      const warned = ts.filter((t) => t.warned && t.status && !ended(t.status))
      return {
        enabled: cfg ? cfg.enabled !== false : false, corrupt: Boolean(db.corrupt),
        thresholds: { capRound: db.capRound, warnRound: db.warnRound, repeatItemRounds: db.repeatItemRounds, maxPerScan: db.maxPerScan },
        lastAt: db.lastAt, nextAt: new Date(Math.max(db.nextAt || 0, notBefore)).toISOString(),
        cappedCount: capped.length, warnCount: warned.length,
        tasks: ts.slice(0, 100),
        records: (db.records || []).slice(-10).reverse(),
      }
    },
  }
}