// Telegram bot 接入向导 + 人员绑定的服务器部分。
// 用途（purpose）三类：
//   office     办公室通知 bot：待审批 / 待回答 / 待验收 / 回答没送到 / 运行出错 / 每日战报
//   paperclip  Paperclip 通知 bot：任务完成、派发、董事会决定
//   support    将来的客服 bot：只接入、配置好名字和命令，**不收也不回任何客户消息**（客服角色和已审核问答准备好之前保持停用）
// 令牌：创建 bot 仍然只能在 BotFather 里做；董事会把令牌粘贴到页面里，Claude 和 agent 都看不到。
//   office / paperclip：Windows DPAPI（当前 Windows 账户才能解开）加密存本地，明文只在内存里；不写日志、不回显、不进 Git。
//   support：只存进 Paperclip 密钥库，本进程不留。
// 人员：苏晨（董事会）+ 自定义人员名册。每个人在每个 bot 上各自绑定自己的 Telegram 账号：
//   董事会在页面里给某个人生成一次性链接（15 分钟、用一次）→ 对方点 Start → 页面弹出对方的昵称让董事会「确认」才生效。
// 通知按人分发：每人可选收哪几类、静音时段（金边时间；静音期间不推，结束时补一条汇总）。
// 快捷操作（默认关，董事会成员且单独打开才有）：只有「已读」「叫醒任务」「验收非资金类任务（二次确认）」；
//   审批、回答问题、取消任务、资金类任务一律不能经 Telegram。按钮一次性、30 分钟过期，并核对点击者就是绑定的账号；每次操作写审计记录。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

const PURPOSES = {
  office: { label: '办公室通知', name: '智序工场 · 办公室通知', desc: '智序工场（DR.LIFE+）办公室的通知：待审批、待回答、待验收、运行出错、每日战报。处理请回办公室页面。' },
  paperclip: { label: 'Paperclip 通知', name: '智序工场 · 任务通知', desc: '智序工场 Paperclip 的任务通知：任务完成、派发、董事会决定。' },
  support: { label: '客服（将来）', name: 'DR.LIFE+ 客服', desc: 'DR.LIFE+ 客服。' },
}
export const CATS = { office: ['approval', 'question', 'review', 'undelivered', 'error', 'daily', 'committee'], paperclip: ['done', 'dispatch', 'decision'] }
export const CAT_LABEL = { approval: '待审批', question: '待回答', review: '待验收', undelivered: '回答没送到', error: '运行出错', daily: '每日战报', committee: '委员会决议', done: '任务完成', dispatch: '任务派发', decision: '董事会决定' }
const DEFAULT_OFF = new Set(['dispatch']) // 派发太吵，默认不推
const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/
const COMMANDS = [{ command: 'start', description: '绑定（需要办公室页面里的一次性链接）' }, { command: 'status', description: '现在有几件事等你处理' }, { command: 'stop', description: '取消订阅' }]
const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const HM = /^([01]\d|2[0-3]):[0-5]\d$/

function ps(script, input) { // 通过 stdin 传入内容（不放进命令行参数，避免出现在进程列表里）
  return new Promise((resolve, reject) => {
    const p = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000 }, (e, out) => (e ? reject(new Error('本机加密调用失败')) : resolve(String(out).trim())))
    p.stdin.end(input, 'utf8')
  })
}
const protect = (plain) => ps('$t=[Console]::In.ReadToEnd().Trim(); ConvertTo-SecureString $t -AsPlainText -Force | ConvertFrom-SecureString', plain)
const unprotect = (blob) => ps('$s=[Console]::In.ReadToEnd().Trim(); $ss=ConvertTo-SecureString $s; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))', blob)

export function createTelegram({ dir, log = console.log, createPaperclipSecret, actions }) {
  // actions（由 server.mjs 提供）：info(issueId) → {identifier,title,status,money,agentChain}；wake(issueId, who)；review(issueId, who)
  const FILE = path.join(dir, 'telegram.json')
  const AUDIT = path.join(dir, 'telegram-audit.log')
  const tokFile = (p) => path.join(dir, `telegram-${p}.dpapi`)
  let db = { bots: {}, seen: { office: [], paperclip: [] }, people: [] }
  try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) } } catch {}
  db.people = (db.people || []).filter((x) => x.id !== 'p-dawang') // 董事会 2026-10-17 取消了大旺：老数据里的他一并清掉
  if (!db.people.length) db.people = [{ id: 'p-suchen', name: '苏晨', role: '董事会', board: true, quick: false, notify: {}, quiet: null }]
  for (const b of Object.values(db.bots)) { b.binds = b.binds || {}; b.pending = Array.isArray(b.pending) ? b.pending : []; b.chats = b.chats || [] } // 旧版本数据迁移
  const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1))
  const audit = (o) => { try { fs.appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n') } catch {} }
  const tokens = {} // 明文只在内存里
  const polling = {}
  const nonces = new Map() // 快捷按钮：callback_data 里只放随机串，真正的动作存在服务器内存里

  const scrub = (s, tok) => String(s || '').split(tok || '\u0000').join('***')
  async function tg(token, method, body, timeoutMs = 25000) {
    let r
    try {
      r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) { throw new Error('连不上 Telegram：' + scrub(e.message, token)) }
    const j = await r.json().catch(() => ({}))
    if (!j.ok) throw new Error(`Telegram：${scrub(j.description, token) || r.status}`)
    return j.result
  }
  async function loadToken(p) {
    if (tokens[p]) return tokens[p]
    if (!fs.existsSync(tokFile(p))) return null
    try { tokens[p] = await unprotect(fs.readFileSync(tokFile(p), 'utf8')) } catch { return null }
    return tokens[p]
  }
  const person = (id) => db.people.find((x) => x.id === id)
  const wants = (pe, cat) => (pe.notify && pe.notify[cat] !== undefined ? pe.notify[cat] !== false : !DEFAULT_OFF.has(cat))
  const phnomHM = () => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); const [h, m] = f.split(':').map(Number); return h * 60 + m }
  const inQuiet = (pe) => {
    if (!pe.quiet) return false
    const [fh, fm] = pe.quiet.from.split(':').map(Number), [th, tm] = pe.quiet.to.split(':').map(Number)
    const a = fh * 60 + fm, b = th * 60 + tm, n = phnomHM()
    return a <= b ? n >= a && n < b : n >= a || n < b
  }

  // ───────── 快捷按钮 ─────────
  function nonce(payload) {
    if (nonces.size > 500) for (const [k, v] of nonces) if (v.until < Date.now()) nonces.delete(k)
    const key = crypto.randomBytes(6).toString('hex')
    nonces.set(key, { ...payload, until: Date.now() + 30 * 60000 })
    return 'q:' + key
  }
  const canQuick = (pe) => Boolean(pe && pe.board && pe.quick)
  function keyboard(chat, pe, kind, issueId) { // 只给「董事会成员且打开了快捷操作」的人带按钮
    if (!canQuick(pe) || !kind) return undefined
    const mk = (action, text) => ({ text, callback_data: nonce({ action, chatId: chat.id, personId: pe.id, issueId }) })
    const row = []
    if (kind === 'review') row.push(mk('review_ask', '验收通过…'))
    if (kind === 'undelivered') row.push(mk('wake', '叫醒它继续'))
    row.push(mk('ack', '已读'))
    return { inline_keyboard: [row] }
  }

  // ───────── 收消息：绑定、/status、/stop、按钮 ─────────
  async function pollLoop(p) {
    if (polling[p]) return
    polling[p] = true
    let offset = db.bots[p].offset || 0
    const token = await loadToken(p)
    if (!token) { polling[p] = false; return }
    while (db.bots[p] && db.bots[p].enabled && tokens[p] === token) {
      try {
        const ups = await tg(token, 'getUpdates', { offset, timeout: 20, allowed_updates: ['message', 'callback_query'] }, 35000)
        for (const u of ups) { offset = u.update_id + 1; await handle(p, token, u).catch((e) => log(`[telegram] ${p} 处理消息出错：${e.message}`)) }
        if (ups.length) { db.bots[p].offset = offset; save() }
      } catch (e) {
        if (/Conflict/i.test(e.message)) { log(`[telegram] ${p}：这个 bot 在别处也在收消息（getUpdates 冲突），先停 60 秒`); await new Promise((r) => setTimeout(r, 60000)) }
        else await new Promise((r) => setTimeout(r, 8000))
      }
    }
    polling[p] = false
  }
  async function handle(p, token, u) {
    if (u.callback_query) return handleButton(p, token, u.callback_query)
    const m = u.message
    if (!m || !m.chat || m.chat.type !== 'private' || typeof m.text !== 'string') return // 只处理私聊文字
    const bot = db.bots[p], chatId = m.chat.id, text = m.text.trim()
    const sub = bot.chats.find((c) => c.id === chatId)
    const reply = (t) => tg(token, 'sendMessage', { chat_id: chatId, text: t }).catch(() => {})
    if (/^\/start(@\w+)?(\s|$)/.test(text)) {
      const code = text.split(/\s+/)[1] || ''
      const b = code && bot.binds[code]
      if (b && Date.now() < b.until && person(b.personId)) {
        delete bot.binds[code] // 一次性
        const name = clip([m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || String(chatId), 40)
        bot.pending = bot.pending.filter((x) => x.chatId !== chatId).concat([{ chatId, name, username: m.from?.username || null, personId: b.personId, at: new Date().toISOString() }]).slice(-10)
        save()
        log(`[telegram] ${p}：收到 ${person(b.personId).name} 的绑定申请，等董事会在页面确认`)
        return reply(`已收到「${person(b.personId).name}」的绑定申请。请等董事会在办公室页面点「确认」，确认后这里会通知你。`)
      }
      if (sub) return reply(`你已经绑定了${sub.personId && person(sub.personId) ? '（' + person(sub.personId).name + '）' : ''}。发 /status 看现在有几件事等你处理，发 /stop 取消订阅。`)
      return reply('需要办公室页面里为你生成的一次性链接才能绑定（15 分钟有效，用一次就失效）。')
    }
    if (!sub) return // 没绑定的人：不回应
    if (/^\/stop(@\w+)?$/.test(text)) { bot.chats = bot.chats.filter((c) => c.id !== chatId); save(); return reply('已取消订阅。') }
    if (/^\/status(@\w+)?$/.test(text)) return reply(lastSummary ? lastSummary() : '暂时取不到。')
  }
  async function handleButton(p, token, cq) {
    const bot = db.bots[p]
    const answer = (text, alert = false) => tg(token, 'answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {})
    const msg = cq.message
    const edit = (text, markup) => tg(token, 'editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text: clip(text, 3800), reply_markup: markup || { inline_keyboard: [] } }).catch(() => {})
    if (!msg || !msg.chat || msg.chat.type !== 'private' || !String(cq.data || '').startsWith('q:')) return answer('不支持的操作')
    const key = cq.data.slice(2), n = nonces.get(key)
    if (!n || n.until < Date.now()) { nonces.delete(key); return answer('这个按钮已过期，请回办公室页面处理', true) }
    const chat = bot.chats.find((c) => c.id === msg.chat.id), pe = chat && person(chat.personId)
    // 点击者必须就是绑定的那个账号（私聊里 chat.id == 用户 id），并且这个人仍然是董事会成员且开着快捷操作
    if (!chat || !pe || !canQuick(pe) || n.chatId !== chat.id || n.personId !== pe.id || cq.from.id !== chat.id) { audit({ person: pe && pe.name, action: n.action, issue: n.issueId, result: 'denied' }); return answer('没有权限', true) }
    nonces.delete(key) // 一次性
    try {
      if (n.action === 'ack') { await answer('已读'); return tg(token, 'editMessageReplyMarkup', { chat_id: msg.chat.id, message_id: msg.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {}) }
      if (!actions) return answer('服务器没有开放这个操作', true)
      const info = await actions.info(n.issueId)
      if (n.action === 'wake') {
        await actions.wake(n.issueId, pe.name); audit({ person: pe.name, action: 'wake', issue: info.identifier, result: 'ok' })
        await answer('已叫醒'); return edit(`📮 ${info.identifier} 已叫醒（${pe.name}，经 Telegram）`)
      }
      if (n.action === 'review_ask' || n.action === 'review_yes') {
        // 资金类、或者还在 agent 审查链里的任务：一律回电脑；任务已经不在待验收：不动
        if (info.money) { audit({ person: pe.name, action: n.action, issue: info.identifier, result: 'refused-money' }); await answer('资金类任务请回电脑验收', true); return edit(`⛔ ${info.identifier} 是资金类任务，请回办公室页面验收。`) }
        if (info.agentChain) { audit({ person: pe.name, action: n.action, issue: info.identifier, result: 'refused-chain' }); await answer('还在审查链里，请回电脑处理', true); return edit(`⛔ ${info.identifier} 还在 agent 审查链里，请回办公室页面处理。`) }
        if (info.status !== 'in_review') { await answer('这个任务已经不在待验收了', true); return edit(`${info.identifier} 当前状态是「${info.status}」，没有再动。`) }
        if (n.action === 'review_ask') {
          await answer('再确认一次')
          const yes = nonce({ action: 'review_yes', chatId: chat.id, personId: pe.id, issueId: n.issueId }), no = nonce({ action: 'ack', chatId: chat.id, personId: pe.id, issueId: n.issueId })
          return edit(`确认验收通过？\n${info.identifier} ${clip(info.title, 80)}\n\n验收通过会把任务标为「已完成」，负责人不会再继续做。`, { inline_keyboard: [[{ text: '确认验收通过', callback_data: yes }, { text: '取消', callback_data: no }]] })
        }
        await actions.review(n.issueId, pe.name); audit({ person: pe.name, action: 'review_accept', issue: info.identifier, result: 'ok' })
        await answer('已验收'); return edit(`✅ ${info.identifier} 已验收通过（${pe.name}，经 Telegram）`)
      }
      return answer('不支持的操作')
    } catch (e) { audit({ person: pe.name, action: n.action, issue: n.issueId, result: 'error: ' + clip(e.message, 100) }); return answer('没有成功：' + clip(e.message, 100), true) }
  }

  // ───────── 发送（按人分发） ─────────
  async function route(p, cat, text, kind, issueId) {
    const bot = db.bots[p]
    if (!bot || !bot.enabled || !bot.chats.length) return 0
    const token = await loadToken(p)
    if (!token) return 0
    let n = 0
    for (const c of bot.chats) {
      const pe = c.personId ? person(c.personId) : null
      if (pe) { if (!wants(pe, cat)) continue; if (inQuiet(pe)) { pe.digest = true; continue } }
      else if (DEFAULT_OFF.has(cat)) continue // 还没归属到人的老订阅：按默认
      try { await tg(token, 'sendMessage', { chat_id: c.id, text: clip(text, 3800), disable_web_page_preview: true, reply_markup: keyboard(c, pe, kind, issueId) }); n++ } catch (e) { log(`[telegram] ${p} 发送失败：${e.message}`) }
    }
    return n
  }
  async function direct(p, chatId, text) { const token = await loadToken(p); if (!token) return; await tg(token, 'sendMessage', { chat_id: chatId, text }).catch(() => {}) }

  // ───────── 从办公室数据产生通知 ─────────
  let lastSummary = null
  let primed = false
  let lastDuty = null
  const seenSet = (p) => new Set(db.seen[p] || [])
  function remember(p, keys) { db.seen[p] = [...keys, ...(db.seen[p] || [])].slice(0, 600) }
  async function onState(s, extra = {}) {
    const agentName = (id) => (s.names && s.names[id]) || (s.agents.find((a) => a.id === id) || {}).name || ''
    lastSummary = () => `🛡️ 待审批 ${(s.approvals || []).length} · ❓ 待回答/验收 ${(s.waiting || []).length} · 🏃 执行中 ${s.agents.filter((a) => a.liveRun).length}\n（处理请回办公室页面）`
    // 静音结束：补一条汇总
    for (const pe of db.people) if (pe.digest && !inQuiet(pe)) {
      pe.digest = false; save()
      if (primed && (s.approvals || []).length + (s.waiting || []).length > 0) for (const [p, b] of Object.entries(db.bots)) { const c = b.chats.find((x) => x.personId === pe.id); if (c && b.enabled && p === 'office') await direct(p, c.id, '🔔 静音结束，现在的情况：\n' + lastSummary()) }
    }
    const items = []
    const projectOf = (id) => ((s.projects || []).find((x) => x.id === id) || {}).name || ''
    const HOW = '\n\n— 处理：回办公室页面（右侧「等你处理」）'
    for (const a of s.approvals || []) items.push([`ap:${a.id}`, 'approval', `🛡️ 待审批\n${clip(a.title, 90)}\n发起：${agentName(a.agentId) || '系统'}${a.summary ? '\n\n说明：' + clip(a.summary, 420) : ''}${HOW}`])
    for (const w of s.waiting || []) {
      const k = `w:${w.kind}:${w.issueId || w.id}:${w.interactionId || ''}`
      const cat = w.kind === 'review' ? 'review' : w.kind === 'undelivered' ? 'undelivered' : 'question'
      const lab = { question: '❓ 待回答', review: '✅ 待验收', undelivered: '📮 回答没送到' }[w.kind] || '待处理'
      const text = async () => { // 只在要真正发送时才去取详情（不是每 3 秒都取）
        let t = `${lab}${projectOf(w.projectId) ? ' · 项目：' + projectOf(w.projectId) : ''}\n${w.id} ${clip(w.title, 90)}${w.agentId ? '\n负责人：' + agentName(w.agentId) : ''}`
        const opts = (list) => list.map((o, oi) => `\n  ${'ABCDEFGH'[oi] || oi + 1}. ${clip(o.label, 70)}${o.description ? ' — ' + clip(o.description, 100) : ''}`).join('')
        if (w.kind === 'question') {
          const qs = (w.ask && w.ask.questions) || []
          if (qs.length) t += '\n' + qs.map((q, qi) => `\n问题 ${qi + 1}：${clip(q.prompt, 180)}${opts(q.options || [])}`).join('')
          else if (w.confirm) t += `\n\n${clip(w.confirm.prompt, 220)}${opts(w.confirm.options || [])}`
          else if (w.verdicts) t += `\n\n${clip(w.verdicts.prompt, 140)}\n` + w.verdicts.items.map((o) => `  · ${clip(o.label, 40)}：${clip(o.description, 100)}`).join('\n') + '\n（这是给审查员的审查表，现在不需要你操作）'
        } else if (actions) {
          try { const i = await actions.info(w.issueId); if (i.desc) t += `\n\n任务说明：${clip(i.desc, 300)}`; if (i.lastComment) t += `\n\n${agentName(w.agentId) || '负责人'}的汇报：${clip(i.lastComment, 420)}`; if (i.money) t += '\n\n⚠ 涉及账务 / 资金类：Telegram 里不能验收，请回电脑。' } catch {}
        }
        return t + HOW
      }
      items.push([k, cat, text, cat === 'review' || cat === 'undelivered' ? cat : null, w.issueId])
    }
    for (const a of s.agents) if (a.status === 'error' && a.lastRun) items.push([`err:${a.id}:${a.lastRun.at}`, 'error', `⚠️ ${agentName(a.id)} 出错：${clip(a.lastRun.error || a.lastRun.status, 80)}`])
    const seen = seenSet('office')
    const fresh = items.filter(([k]) => !seen.has(k))
    for (const it of fresh) if (typeof it[2] === 'function') it[2] = await it[2]() // 把要发的通知补全成带内容的文字
    if (primed && fresh.length) await sendBatch('office', fresh)
    if (fresh.length) { remember('office', fresh.map(([k]) => k)); save() }
    const on = s.world && s.world.duty ? s.world.duty.on : null
    if (primed && lastDuty === true && on === false && extra.daily) {
      const d = extra.daily()
      await route('office', 'daily', `📊 今日战报 ${d.date}\n完成任务 ${d.done.length} · 运行 ${d.runs.total}（失败 ${d.runs.failed}）· 评论 ${d.comments} · 董事会审批 ${d.decisions.approved + d.decisions.rejected}`)
    }
    lastDuty = on
    const evs = (s.events || []).filter((e) => ['celebrate', 'dispatch', 'board_decision'].includes(e.kind))
    const seenP = seenSet('paperclip')
    const freshE = evs.filter((e) => !seenP.has(e.id))
    if (primed && freshE.length) await sendBatch('paperclip', freshE.map((e) => { const cat = { celebrate: 'done', dispatch: 'dispatch', board_decision: 'decision' }[e.kind]; return [e.id, cat, `${{ celebrate: '🎉', dispatch: '📌', board_decision: '🧑‍⚖️' }[e.kind]} ${clip(e.text, 120)}${e.kind === 'dispatch' ? '\n' + agentName(e.from) + ' → ' + agentName(e.to) : ''}`] }))
    if (freshE.length) { remember('paperclip', freshE.map((e) => e.id)); save() }
    primed = true
  }
  async function sendBatch(p, items) { // items: [key, cat, text, kind?, issueId?]
    if (!db.bots[p] || !db.bots[p].enabled) return
    if (items.length > 5) { // 一次太多：每个类别合成一条，没有按钮
      const by = {}
      for (const it of items) (by[it[1]] = by[it[1]] || []).push(it[2].split('\n')[0])
      for (const [cat, lines] of Object.entries(by)) await route(p, cat, `${CAT_LABEL[cat]}：有 ${lines.length} 条新通知\n` + lines.slice(0, 6).map((t) => '· ' + t).join('\n') + (lines.length > 6 ? '\n…' : ''))
      return
    }
    for (const [, cat, text, kind, issueId] of items) await route(p, cat, text, kind, issueId)
  }

  // ───────── 向导操作 ─────────
  const need = (c, m) => { if (!c) throw Object.assign(new Error(m), { status: 400 }) }
  const botView = (p) => {
    const def = PURPOSES[p], b = db.bots[p]
    const links = {}
    if (b) for (const [code, x] of Object.entries(b.binds)) if (Date.now() < x.until) links[x.personId] = `https://t.me/${b.username}?start=${code}`
    return { label: def.label, connected: Boolean(b), username: b && b.username, botName: b && b.botName, enabled: Boolean(b && b.enabled), storedIn: b ? b.storedIn : null,
      chats: b ? b.chats.map((c) => ({ id: c.id, name: c.name, username: c.username || null, personId: c.personId || null })) : [],
      pending: b ? b.pending.map((x) => ({ chatId: x.chatId, name: x.name, username: x.username, personId: x.personId })) : [], links }
  }
  const peopleView = () => db.people.map((pe) => ({ id: pe.id, name: pe.name, role: pe.role, board: pe.board, quick: Boolean(pe.quick), quiet: pe.quiet, notify: Object.fromEntries(Object.values(CATS).flat().map((c) => [c, wants(pe, c)])) }))
  const view = () => ({ bots: Object.fromEntries(Object.keys(PURPOSES).map((p) => [p, botView(p)])), people: peopleView(), cats: CATS, catLabel: CAT_LABEL })

  return {
    view, onState,
    notifyCommittee: (text) => route('office', 'committee', text),
    async connect(p, token, takeover = false) {
      need(PURPOSES[p], '用途不对')
      need(typeof token === 'string' && TOKEN_RE.test(token.trim()), '令牌格式不对：应该像 123456789:AAxxxxxxxx…（在 BotFather 创建 bot 后给你的那一长串）')
      token = token.trim()
      need(process.platform === 'win32' || p === 'support', '本机加密只支持 Windows')
      const me = await tg(token, 'getMe')
      need(me.is_bot, '这不是 bot 的令牌')
      for (const [q, b] of Object.entries(db.bots)) need(q === p || b.id !== me.id, `这个 bot（@${me.username}）已经用作「${PURPOSES[q].label}」，一个 bot 只能有一个用途`)
      if (p !== 'support') {
        // 这个 bot 如果已经设了 webhook，说明别的服务正在用它：接管会让那个服务收不到消息，必须董事会明确勾选「接管」
        const wh = await tg(token, 'getWebhookInfo').catch(() => ({}))
        need(!wh.url || takeover, `这个 bot（@${me.username}）已经设了 webhook，说明别的服务正在使用它。接管会清掉 webhook，那个服务就收不到消息了。确认要接管，请勾选「我确认接管」后再试`)
        await tg(token, 'deleteWebhook', { drop_pending_updates: false })
      }
      const def = PURPOSES[p]
      const cfg = [['名称', tg(token, 'setMyName', { name: def.name })], ['简介', tg(token, 'setMyDescription', { description: def.desc })], ['命令', tg(token, 'setMyCommands', { commands: p === 'support' ? [] : COMMANDS })]]
      const warns = []
      for (const [label, pr] of cfg) await pr.catch((e) => warns.push(`${label}：${e.message}`))
      let storedIn
      if (p === 'support') {
        need(createPaperclipSecret, '密钥库接口不可用')
        await createPaperclipSecret(`telegram/${me.username}`, token, `Telegram 客服 bot @${me.username} 的令牌（客服角色接入前不启用）`)
        storedIn = 'Paperclip 密钥库'
      } else {
        fs.writeFileSync(tokFile(p), await protect(token))
        tokens[p] = token
        storedIn = '本机（Windows 账户加密）'
      }
      const old = db.bots[p]
      db.bots[p] = { id: me.id, username: me.username, botName: me.first_name, enabled: p !== 'support', chats: old && old.id === me.id ? old.chats : [], binds: {}, pending: [], storedIn, offset: 0, at: new Date().toISOString() }
      save()
      if (p !== 'support') pollLoop(p)
      log(`[telegram] ${p} 已接入 @${me.username}（${storedIn}）`)
      return { username: me.username, warns }
    },
    // 给某个人在某个 bot 上生成一次性绑定链接（15 分钟、用一次）
    bindLink(p, personId) {
      const b = db.bots[p]
      need(b && p !== 'support', '这个 bot 还没接入')
      need(person(personId), '没有这个人')
      for (const [code, x] of Object.entries(b.binds)) if (x.personId === personId || Date.now() >= x.until) delete b.binds[code]
      b.binds[crypto.randomBytes(5).toString('hex')] = { personId, until: Date.now() + 15 * 60000 }
      save()
    },
    // 董事会确认（或拒绝）对方的绑定申请
    async confirm(p, chatId, accept) {
      const b = db.bots[p]
      need(b, '这个 bot 还没接入')
      const x = b.pending.find((y) => y.chatId === chatId)
      need(x, '没有这条申请（可能已过期或已处理）')
      b.pending = b.pending.filter((y) => y !== x)
      const pe = person(x.personId)
      need(pe, '这个人已经被删除')
      if (!accept) { save(); await direct(p, x.chatId, '绑定申请没有通过。'); return }
      b.chats = b.chats.filter((c) => c.id !== x.chatId && c.personId !== pe.id) // 一人一个 bot 一个聊天；这个账号之前的订阅归并过来
      b.chats.push({ id: x.chatId, name: x.name, username: x.username, personId: pe.id, at: new Date().toISOString() })
      save()
      audit({ person: pe.name, action: 'bind', bot: p, tgName: x.name, result: 'confirmed' })
      await direct(p, x.chatId, `✅ 已绑定为「${pe.name}」。以后「${PURPOSES[p].label}」的通知会发到这里。发 /status 看现在有几件事等你处理，发 /stop 取消订阅。`)
    },
    assign(p, chatId, personId) { // 把已有的、没归属的订阅直接指定给某个人
      const b = db.bots[p]
      need(b, '这个 bot 还没接入')
      const c = b.chats.find((x) => x.id === chatId)
      need(c, '没有这个订阅')
      need(person(personId), '没有这个人')
      b.chats = b.chats.filter((x) => x === c || x.personId !== personId)
      c.personId = personId
      save()
      audit({ person: person(personId).name, action: 'assign', bot: p, tgName: c.name, result: 'ok' })
    },
    unbind(p, chatId) { const b = db.bots[p]; need(b, '这个 bot 还没接入'); b.chats = b.chats.filter((c) => c.id !== chatId); save() },
    addPerson(name, role) {
      name = clip(name, 20).replace(/[<>"]/g, ''); role = clip(role, 20).replace(/[<>"]/g, '')
      need(name, '请填名字')
      need(!db.people.some((x) => x.name === name), '已经有同名的人')
      db.people.push({ id: 'p-' + crypto.randomBytes(4).toString('hex'), name, role: role || '人员', board: false, quick: false, notify: {}, quiet: null })
      save()
    },
    removePerson(id) {
      const pe = person(id)
      need(pe && !pe.board, '找不到，或者董事会成员不能删')
      db.people = db.people.filter((x) => x !== pe)
      for (const b of Object.values(db.bots)) { b.chats = b.chats.map((c) => (c.personId === id ? { ...c, personId: null } : c)); for (const [k, x] of Object.entries(b.binds)) if (x.personId === id) delete b.binds[k] }
      save()
    },
    updatePerson(id, patch) { // patch: {notify:{cat:bool}, quiet:{from,to}|null, quick:bool}
      const pe = person(id)
      need(pe, '没有这个人')
      if (patch.notify && typeof patch.notify === 'object') for (const [c, v] of Object.entries(patch.notify)) if (CAT_LABEL[c]) pe.notify[c] = Boolean(v)
      if ('quiet' in patch) {
        if (patch.quiet === null) pe.quiet = null
        else { need(patch.quiet && HM.test(patch.quiet.from) && HM.test(patch.quiet.to) && patch.quiet.from !== patch.quiet.to, '静音时间格式不对（HH:MM，起止不同）'); pe.quiet = { from: patch.quiet.from, to: patch.quiet.to } }
      }
      if ('quick' in patch) { need(!patch.quick || pe.board, '快捷操作只对董事会成员开放'); pe.quick = Boolean(patch.quick); audit({ person: pe.name, action: 'quick_toggle', result: pe.quick ? 'on' : 'off' }) }
      save()
    },
    // 重发当前还在等你处理的通知（用新格式，带项目、问题原文、选项）：忘掉「已经发过」的记录，下一轮刷新（约 3 秒）就会重新发出
    resend() {
      db.seen.office = (db.seen.office || []).filter((k) => !(k.startsWith('w:') || k.startsWith('ap:')))
      save()
    },
    async test(p) {
      need(db.bots[p] && p !== 'support', '还没接入')
      need(db.bots[p].chats.length, '还没有人订阅：先给某个人生成绑定链接，对方点 Start 并由你确认')
      const token = await loadToken(p)
      let n = 0
      for (const c of db.bots[p].chats) { try { await tg(token, 'sendMessage', { chat_id: c.id, text: `✅ 测试消息：${PURPOSES[p].label}工作正常${c.personId && person(c.personId) ? '（' + person(c.personId).name + '）' : ''}。` }); n++ } catch (e) { log(`[telegram] ${p} 测试发送失败：${e.message}`) } }
      need(n, '发送失败（看服务器终端的 [telegram] 日志）')
      return { sent: n }
    },
    setEnabled(p, on) {
      const b = db.bots[p]
      need(b && p !== 'support', '还没接入')
      b.enabled = Boolean(on)
      save()
      if (b.enabled) pollLoop(p)
    },
    async remove(p) { // 解除接入：删本机令牌和订阅；support 的令牌在 Paperclip 密钥库里，要在密钥页面自己删
      const b = db.bots[p]
      need(b, '还没接入')
      b.enabled = false
      delete tokens[p]
      try { fs.unlinkSync(tokFile(p)) } catch {}
      delete db.bots[p]
      save()
    },
    start() { for (const p of Object.keys(db.bots)) if (p !== 'support' && db.bots[p].enabled) pollLoop(p) },
  }
}
