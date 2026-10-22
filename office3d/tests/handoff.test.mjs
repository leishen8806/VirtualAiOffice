// T14 断点交接包自检：交接包解析 + 四种触发 + 提醒 / 转交动作，用模拟的 Paperclip（不会真的发任何评论）。
// 运行：node --test tests/handoff.test.mjs
// 动作全部默认关闭：handoff.json 不存在或 enabled:false 时一概不写；损坏视为关闭并在 /state 提示。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHandoff, parseHandoff, parseHandoffComments, detectTriggers, handoffStale, MARK, FORWARD_MARK, DEFAULT_CFG } from '../handoff.mjs'

const iso = (s) => new Date(Date.parse(s)).toISOString()
// 完整交接包模板（六个字段 + 对象版本）
const HANDS = (version = 'a1b2c3', extra = '') =>
  `【交接包】对象版本：${version}\n已完成：AC-1 ｜ AC-2（证据在评论里）\n未完成：AC-3\n下一步：node ./scripts/go.mjs\n阻塞与解除条件：无\n工作位置：e:/worktrees/t1\n不要重做：字体尺寸已验证${extra ? '\n' + extra : ''}`
const FIELD_6 = ['已完成', '未完成', '下一步', '阻塞与解除条件', '工作位置', '不要重做']

function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hof-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let time = Date.parse(options.now || '2026-10-19T08:30:00+07:00'), n = 0
  const issues = {}, runs = [], writes = [], notices = []
  const agents = [
    { id: 'a1', name: '前任', status: 'idle' },
    { id: 'a2', name: '现任', status: 'idle' },
    { id: 'ap', name: '休假的', status: 'paused' },
  ]
  const add = (id, extra = {}) => {
    const i = { id, identifier: id, title: '普通任务', description: '', status: 'in_progress', updatedAt: '2026-10-18T08:30:00+07:00', assigneeAgentId: 'a1', comments: [], ...extra }
    issues[id] = i; return i
  }
  const comment = (issue, { authorAgentId = 'a1', authorUserId = null, body, at }) => issue.comments.push({ id: 'c' + ++n, authorAgentId, authorUserId, body, createdAt: iso(at) })
  const failRun = (issueId, status = 'failed', finishedAt = '2026-10-19T01:00:00+07:00') => runs.push({ id: 'r' + ++n, issueId, status, errorCode: status === 'cancelled' ? 'cancelled' : 'tool_use_error', finishedAt: iso(finishedAt) })
  const get = async (p) => {
    if (p === `/api/companies/C/issues`) return structuredClone(Object.values(issues))
    if (p.startsWith('/api/companies/C/heartbeat-runs')) return structuredClone(runs)
    const m = p.match(/^\/api\/issues\/([^/]+)(\/comments)?$/)
    if (m) { const i = issues[m[1]]; assert.ok(i, '未模拟任务 ' + p); return structuredClone(m[2] ? i.comments : i) }
    throw new Error('未模拟 GET ' + p)
  }
  const send = async (method, p, body) => {
    writes.push({ method, p, body: structuredClone(body) })
    const m = p.match(/^\/api\/issues\/([^/]+)\/comments$/)
    if (method === 'POST' && m) { issues[m[1]].comments.push({ id: 'c' + ++n, authorAgentId: 'system', body: body.body, createdAt: new Date(time).toISOString() }); return {} }
    throw new Error('未模拟写 ' + method + ' ' + p)
  }
  const redact = (s) => String(s ?? '').replace(/9\d{3}/g, '〔数字已隐藏〕') // 简单脱敏：四位数开头 9 的打码（测试用）
  const factory = (extra = {}) => createHandoff({
    dir, company: 'C', get, send, notify: async (s) => notices.push(s), dutyOn: () => options.on !== false,
    now: () => time, agents: () => agents, redactText: redact, spreadMs: 0, isMoney: options.isMoney, log: () => {}, ...extra,
  })
  const enable = () => fs.writeFileSync(path.join(dir, 'handoff.json'), JSON.stringify({ enabled: true }))
  const advance = (h) => { time += h * 3600000 }
  return { dir, file: path.join(dir, 'handoff.json'), issues, add, comment, failRun, run: runs, get, send, writes, notices, agents, factory, enable, advance }
}

// ───── 纯函数：交接包解析 ─────
test('解析完整交接包：全角冒号 / 半角冒号 / 前后空白，六字段齐全', () => {
  const full = '【交接包】对象版本：abc123\n已完成：A ｜ B\n未完成：C\n下一步：改配置\n阻塞与解除条件：无\n工作位置：e:/w/t\n不要重做：排版'
  const p = parseHandoff(full, { fieldMaxLen: 300, redactText: (x) => x })
  assert.equal(p.has, true)
  assert.equal(p.version, 'abc123')
  assert.equal(p.complete, true)
  assert.deepEqual(p.missing, [])
  assert.deepEqual(Object.keys(p.fields), ['done', 'todo', 'next', 'block', 'location', 'no_redo'])
  const half = '【交接包】对象版本：abc123\n已完成: A\n未完成: B\n下一步: C\n阻塞与解除条件: 无\n工作位置: e:/w\n不要重做: Z'
  assert.equal(parseHandoff(half, { redactText: (x) => x }).complete, true)
  const messy = '【交接包】对象版本：abc123\n  已完成  ：A  \n未完成：B\n下一步：C\n阻塞与解除条件：无\n工作位置：e:/w\n不要重做：Z'
  assert.equal(parseHandoff(messy, { redactText: (x) => x }).complete, true)
})

test('解析缺字段：缺任何一个都视为不完整并列出缺哪些；正文没有交接包返回 has:false', () => {
  const p = parseHandoff('【交接包】对象版本：abc\n已完成：A\n未完成：B', { redactText: (x) => x })
  assert.equal(p.has, true)
  assert.equal(p.complete, false)
  assert.deepEqual(p.missing, ['下一步', '阻塞与解除条件', '工作位置', '不要重做'])
  const none = parseHandoff('同事：我修好了', { redactText: (x) => x })
  assert.equal(none.has, false)
  assert.equal(none.complete, false)
  assert.deepEqual(none.missing, FIELD_6)
})

test('多个交接包取最近一个（按评论时间倒序）；程序自己的【交接巡检】不算交接包', () => {
  const old = { authorAgentId: 'a1', body: '旧版\n' + HANDS('old'), createdAt: iso('2026-10-18T01:00:00Z') }
  const fresh = { authorAgentId: 'a2', body: '新版\n' + HANDS('new'), createdAt: iso('2026-10-19T01:00:00Z') }
  const p = parseHandoffComments([old, fresh], { redactText: (x) => x, fieldMaxLen: 300 })
  assert.equal(p.has, true)
  assert.equal(p.version, 'new')
  assert.equal(p.complete, true)
  const mine = [
    { authorAgentId: 'system', body: `${MARK}\n请补写交接包`, createdAt: iso('2026-10-19T02:00:00Z') },
    { authorAgentId: 'a1', body: HANDS('x'), createdAt: iso('2026-10-18T02:00:00Z') },
  ]
  const p2 = parseHandoffComments(mine, { redactText: (x) => x, fieldMaxLen: 300 })
  assert.equal(p2.has, true)
  assert.equal(p2.version, 'x', '【交接巡检】评论不算交接包，仍能取到真实交接包')
})

test('字段超长只保留前 300 字；输出前先走 redactText 脱敏', () => {
  const long = '【交接包】对象版本：abc\n已完成：' + '长'.repeat(500)
  const p = parseHandoff(long, { fieldMaxLen: 300, redactText: (x) => x })
  assert.equal(p.fields.done.length, 300)
  assert.equal(p.fields.done, '长'.repeat(300))
  const redactic = '【交接包】对象版本：abc\n已完成：工号 9888 已处理'
  const redacted = parseHandoff(redactic, { fieldMaxLen: 300, redactText: (s) => s.replace(/9888/g, '〔脱敏〕') })
  assert.equal(redacted.fields.done, '工号 〔脱敏〕 已处理')
})

// ───── 纯函数：四种触发 ─────
function mkIssue(extra = {}) { return { id: 'is-1', identifier: 'CMP-1', status: 'in_progress', assigneeAgentId: 'a1', updatedAt: '2026-10-18T00:00:00Z', ...extra } }

test('T1 运行中断：failed / timed_out 算，cancelled 不算（复用 isFailure）', () => {
  const now = Date.parse('2026-10-19T00:00:00+07:00')
  const mk = (status) => ({ status, finishedAt: iso('2026-10-18T01:00:00Z') })
  const failed = detectTriggers({ issue: mkIssue(), runs: [mk('failed')], comments: [], prev: {}, now })
  assert.deepEqual(failed.triggers.map((t) => t.type), ['interrupted'])
  const to = detectTriggers({ issue: mkIssue(), runs: [mk('timed_out')], comments: [], prev: {}, now })
  assert.deepEqual(to.triggers.map((t) => t.type), ['interrupted'])
  const cancelled = detectTriggers({ issue: mkIssue(), runs: [mk('cancelled')], comments: [], prev: {}, now })
  assert.deepEqual(cancelled.triggers, [], 'cancelled 不算中断')
  const none = detectTriggers({ issue: mkIssue(), runs: [], comments: [], prev: {}, now })
  assert.deepEqual(none.triggers, [])
})

test('T2 转阻塞：上一轮不是 blocked 才算；T3 换人：第一次见到的任务不算', () => {
  const now = Date.parse('2026-10-19T00:00:00+07:00')
  const blocked = detectTriggers({ issue: mkIssue({ status: 'blocked', blockedTransitionAt: '2026-10-18T12:00:00Z' }), runs: [], comments: [], prev: { owner: 'a1', status: 'in_progress' }, now })
  assert.deepEqual(blocked.triggers.map((t) => [t.type, t.at]), [['blocked', '2026-10-18T12:00:00Z']])
  const stayed = detectTriggers({ issue: mkIssue({ status: 'blocked' }), runs: [], comments: [], prev: { owner: 'a1', status: 'blocked' }, now })
  assert.deepEqual(stayed.triggers, [], '持续阻塞不算新触发')
  const handed = detectTriggers({ issue: mkIssue({ assigneeAgentId: 'a2', updatedAt: '2026-10-18T13:00:00Z' }), runs: [], comments: [], prev: { owner: 'a1', status: 'in_progress' }, now })
  assert.deepEqual(handed.triggers.map((t) => t.type), ['handed'])
  const first = detectTriggers({ issue: mkIssue({ assigneeAgentId: 'a2' }), runs: [], comments: [], prev: { owner: null, status: null }, now })
  assert.deepEqual(first.triggers, [], '第一次见到的任务不算换人')
})

test('T4 长停留：in_progress 且 24 小时无新评论 / 新运行；程序自己的标记评论不算动作', () => {
  const now = Date.parse('2026-10-19T00:00:00+07:00')
  const old = iso('2026-10-17T00:00:00Z') // 48 小时前
  const idle = detectTriggers({ issue: mkIssue(), runs: [], comments: [{ body: '干活', createdAt: old }], prev: {}, now, idleMs: 24 * 3600000 })
  assert.deepEqual(idle.triggers.map((t) => t.type), ['idle'])
  const fresh = detectTriggers({ issue: mkIssue(), runs: [], comments: [{ body: '刚干了活', createdAt: iso('2026-10-18T23:00:00Z') }], prev: {}, now })
  assert.deepEqual(fresh.triggers, [], '有近评论不算长停留')
  const onlyMine = detectTriggers({ issue: mkIssue({ updatedAt: old }), runs: [], comments: [{ body: `${MARK}\n请补交接包`, createdAt: old }], prev: {}, now })
  assert.deepEqual(onlyMine.triggers.map((t) => t.type), ['idle'], '程序自己的评论不算动作（仅剩程序评论时按任务更新时间判断）')
  const viaRun = detectTriggers({ issue: mkIssue(), runs: [{ status: 'succeeded', finishedAt: old }], comments: [], prev: {}, now })
  assert.deepEqual(viaRun.triggers.map((t) => t.type), ['idle'], '最晚活动时间取评论与运行的最大值')
  const done = detectTriggers({ issue: mkIssue({ status: 'done' }), runs: [{ status: 'failed', finishedAt: iso('2026-10-18T01:00:00Z') }], prev: {}, now })
  assert.deepEqual(done.triggers, [], '已结束任务不算')
  // 兼容 statusOf 的 commentTimes（字符串数组）
  const strArr = detectTriggers({ issue: mkIssue(), runs: [], comments: [old, iso('2026-10-10T00:00:00Z')], prev: {}, now })
  assert.deepEqual(strArr.triggers.map((t) => t.type), ['idle'])
})

// ───── T14b：T4 长停留的「按计划等待」豁免 ─────
// 基线：now = 2026-10-19T00:00:00+07:00（= 2026-10-18T17:00:00Z）。
// mkOld 的 updatedAt = 2026-10-15T00:00:00Z → 距 now 89 小时，稳定超过 24h 阈值（mkIssue 默认 17 小时，不够进 T4 分支）。
const T14B_NOW = Date.parse('2026-10-19T00:00:00+07:00')
const mkOld = (extra = {}) => mkIssue({ updatedAt: '2026-10-15T00:00:00Z', ...extra })

test('T14b 监控已排期未过期：monitorNextCheckAt 在未来 → 不触发 idle，skip:monitor_scheduled', () => {
  const d = detectTriggers({ issue: mkOld({ monitorNextCheckAt: '2026-10-19T06:00:00Z' }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(d.triggers, [])
  assert.equal(d.idleSkip, 'monitor_scheduled')
  // executionState.monitor.status==='scheduled' 且 nextCheckAt 在未来、timeoutAt 未到 → 同样豁免
  const viaState = detectTriggers({
    issue: mkOld({ executionState: { status: 'idle', monitor: { kind: 'external_service', status: 'scheduled', nextCheckAt: '2026-10-19T06:00:00Z', timeoutAt: '2026-10-20T00:00:00Z', maxAttempts: 4 } } }),
    runs: [], comments: [], prev: {}, now: T14B_NOW,
  })
  assert.deepEqual(viaState.triggers, [])
  assert.equal(viaState.idleSkip, 'monitor_scheduled')
})

test('T14b 监控已过期 3 小时仍无动作 → 触发 idle，detail 写「监控应在 hh:mm 检查，至今无动作」', () => {
  const d = detectTriggers({ issue: mkOld({ monitorNextCheckAt: '2026-10-18T14:00:00Z' }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(d.triggers.map((t) => t.type), ['idle'])
  assert.equal(d.idleSkip, null)
  assert.equal(d.triggers[0].detail, '监控应在 21:00 检查，至今无动作') // 14:00Z + 07:00 = 21:00
})

test('T14b 监控刚过期未满 2 小时：不豁免也不特殊提示，按原 T4 逻辑触发', () => {
  const d = detectTriggers({ issue: mkOld({ monitorNextCheckAt: '2026-10-18T16:00:00Z' }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(d.triggers.map((t) => t.type), ['idle'])
  assert.equal(d.idleSkip, null)
  assert.match(d.triggers[0].detail, /小时无新动作/)
})

test('T14b 等依赖：blockedBy 有未完成 / blockerAttention.unresolvedBlockerCount>0 → 不触发；依赖完成后 24h 无动作 → 触发', () => {
  const byDep = detectTriggers({ issue: mkOld({ blockedBy: [{ identifier: 'CMP-99', status: 'todo' }] }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(byDep.triggers, [])
  assert.equal(byDep.idleSkip, 'waiting_dependency')
  const byAttention = detectTriggers({ issue: mkOld({ blockerAttention: { state: 'waiting', unresolvedBlockerCount: 2 } }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(byAttention.triggers, [])
  assert.equal(byAttention.idleSkip, 'waiting_dependency')
  const cleared = detectTriggers({ issue: mkOld({ blockedBy: [{ status: 'done' }, { status: 'cancelled' }], blockerAttention: { state: 'none', unresolvedBlockerCount: 0 } }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(cleared.triggers.map((t) => t.type), ['idle'])
  assert.equal(cleared.idleSkip, null)
})

test('T14b 等董事会：有待回答交互卡 → 不触发 skip:waiting_board；取不到交互信息 → 触发但 gaps 写明无法判断', () => {
  const waiting = detectTriggers({ issue: mkOld({ ask_user_questions: [{ status: 'pending', question: '请董事会选方案' }] }), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(waiting.triggers, [])
  assert.equal(waiting.idleSkip, 'waiting_board')
  const unknown = detectTriggers({ issue: mkOld(), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(unknown.triggers.map((t) => t.type), ['idle'])
  assert.equal(unknown.idleSkip, null)
  assert.ok(unknown.gaps.some((g) => g.includes('无法判断是否在等董事会')), 'gaps 写明无法判断是否在等董事会')
})

test('T14b 无监控无依赖无交互卡 24h 无动作 → 触发（原行为不变），gaps 写明 blockedBy 缺字段', () => {
  const d = detectTriggers({ issue: mkOld(), runs: [], comments: [], prev: {}, now: T14B_NOW })
  assert.deepEqual(d.triggers.map((t) => t.type), ['idle'])
  assert.equal(d.idleSkip, null)
  assert.ok(d.gaps.some((g) => g.includes('blockedBy 不在列表接口')), '列表接口缺 blockedBy → 在 gaps 说明')
})

test('T14b 端到端：三类等待任务开启总开关不发评论不通知；真卡住仍提醒一次', async (t) => {
  const w = setup(t, { now: '2026-10-19T08:30:00+07:00' })
  w.add('CMP-1', { monitorNextCheckAt: '2026-10-19T12:00:00Z' }) // 监控在未来 → 等监控
  w.add('CMP-2', { blockedBy: [{ identifier: 'CMP-9', status: 'todo' }] }) // 等依赖
  w.add('CMP-3', { ask_user_questions: [{ status: 'pending' }] }) // 等董事会
  w.add('CMP-4') // 真卡住：无监控 / 无依赖 / 无交互卡
  w.enable()
  const hf = w.factory()
  await hf.run()
  assert.equal(w.writes.length, 1, '只有真卡住的任务发提醒')
  assert.equal(w.writes[0].p, '/api/issues/CMP-4/comments')
  assert.match(w.writes[0].body.body, /长停留/)
  assert.equal(w.notices.length, 0, '不通知董事会')
  const p = await hf.preview()
  const by = Object.fromEntries(p.items.map((x) => [x.ident, x]))
  assert.equal(by['CMP-1'].skip, 'monitor_scheduled')
  assert.equal(by['CMP-2'].skip, 'waiting_dependency')
  assert.equal(by['CMP-3'].skip, 'waiting_board')
  assert.equal(by['CMP-4'].triggers.some((x) => x.type === 'idle'), true)
  assert.ok((by['CMP-1'].gaps || []).some((g) => g.includes('blockedBy 不在列表接口')), '列表接口缺 blockedBy → preview 透出 gaps')
})

test('版本过期提示：只比较字符串，不读仓库不执行 git', () => {
  assert.equal(handoffStale(null, []), false)
  assert.equal(handoffStale('abc', []), false)
  assert.equal(handoffStale('abc', [{ body: '【验收证据】对象版本：abc', createdAt: iso('2026-10-18T01:00:00Z') }]), false)
  assert.equal(handoffStale('abc', [{ body: '【验收证据】对象版本：xyz', createdAt: iso('2026-10-18T01:00:00Z') }]), true)
  assert.equal(handoffStale('abc', [{ body: '【验收证据】对象版本：abc' }, { body: '【验收证据】对象版本：xyz' }]), true)
})

// ───── createHandoff：动作 ─────
test('总开关默认关闭且文件不存在：一概不写、不通知、不留文件', async (t) => {
  const w = setup(t)
  const hf = w.factory()
  assert.deepEqual(await hf.run(), { ran: false, reason: '总开关已关闭' })
  assert.equal(w.writes.length, 0)
  assert.equal(w.notices.length, 0)
  assert.equal(fs.existsSync(w.file), false)
  // enabled:false 的文件同样一概不写
  fs.writeFileSync(w.file, JSON.stringify({ enabled: false }))
  const hf2 = w.factory()
  assert.deepEqual(await hf2.run(), { ran: false, reason: '总开关已关闭' })
  assert.equal(w.writes.length, 0)
  assert.equal(fs.readFileSync(w.file, 'utf8').includes('"tasks"'), false)
})

test('T1 触发发一条【交接巡检】提醒；已有完整交接包不发', async (t) => {
  const w = setup(t)
  w.add('CMP-1') // owner a1，无交接包
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  const r = await hf.run()
  assert.equal(r.ran, true)
  assert.equal(r.processed, 1)
  assert.equal(w.writes.length, 1)
  assert.equal(w.writes[0].p, '/api/issues/CMP-1/comments')
  assert.equal(w.writes[0].body.body.startsWith(MARK), true)
  assert.match(w.writes[0].body.body, /运行中断/)
  const complete = w.add('CMP-2')
  complete.comments.push({ id: 'cx', authorAgentId: 'a1', body: HANDS(), createdAt: iso('2026-10-18T00:00:00Z') })
  w.failRun('CMP-2')
  const r2 = await hf.run()
  assert.equal(r2.processed, 0, '有完整交接包就不提醒')
  assert.equal(w.writes.length, 1)
})

test('T4 长停留只在上班时间提醒；T1/T2/T3 提醒不受上班时间限制', async (t) => {
  // 关闭后先运行一次制造基线：非失效任务更新 prevOwner
  const w = setup(t, { now: '2026-10-19T08:30:00+07:00' })
  w.add('CMP-1') // in_progress
  w.comment(w.issues['CMP-1'], { body: '最后动作', at: '2026-10-17T08:00:00+07:00' }) // 48h 前 → idle 触发
  w.enable()
  const hf = w.factory() // dutyOn: () => options.on !== false → true
  w.advance(1) // 时间线后移，让 idle 稳定（评论 48h 前，now 已经是我们基线+1h）
  const r = await hf.run()
  assert.equal(r.processed, 1)
  assert.equal(w.writes.length, 1)
  assert.match(w.writes[0].body.body, /长停留/)
  // 非上班时间（dutyOn=false）：新任务 idle 不提醒
  const w2 = setup(t, { on: false })
  w2.add('CMP-2')
  w2.comment(w2.issues['CMP-2'], { body: '最后动作', at: '2026-10-17T08:00:00+07:00' })
  w2.failRun('CMP-2') // 同时有 T1 中断
  w2.enable()
  const hf2 = w2.factory()
  const r2 = await hf2.run()
  assert.equal(r2.processed, 1)
  const bodies = w2.writes.map((x) => x.body.body)
  assert.equal(bodies.some((b) => b.includes('运行中断')), true, 'T1 非上班时间也提醒')
  assert.equal(bodies.some((b) => b.includes('长停留')), false, 'T4 非上班时间不提醒')
  assert.equal(w2.writes.length, 1)
})

test('换人（T3）：有完整交接包时转交并保留字段结构；无完整包时写明缺项和前任评论时间', async (t) => {
  // 第一轮建立 prevOwner=a1（无触发器，只刷新快照）
  const w = setup(t)
  w.add('CMP-1')
  w.comment(w.issues['CMP-1'], { body: '开始干活', at: '2026-10-18T09:00:00+07:00' })
  w.enable()
  const hf = w.factory()
  await hf.run()
  assert.equal(w.writes.length, 0)
  // 换人 + 前任留了完整交接包
  w.issues['CMP-1'].assigneeAgentId = 'a2'
  w.issues['CMP-1'].updatedAt = iso('2026-10-19T01:00:00+07:00')
  w.comment(w.issues['CMP-1'], { authorAgentId: 'a1', body: HANDS('abc123'), at: '2026-10-18T18:00:00+07:00' })
  await hf.run()
  assert.equal(w.writes.length, 1)
  assert.equal(w.writes[0].body.body.startsWith(FORWARD_MARK), true)
  assert.match(w.writes[0].body.body, /对象版本：abc123/)
  assert.match(w.writes[0].body.body, /已完成：AC-1/)
  assert.match(w.writes[0].body.body, /不要重做：字体/)
  assert.match(w.writes[0].body.body, /前任/)
  assert.ok(w.writes[0].body.body.length <= 1500)
})

test('换人只转交一次（同一次换人不重复），但再次换人（新前任）会再转交', async (t) => {
  const w = setup(t)
  const it = w.add('CMP-1')
  it.comments.push({ id: 'c0', authorAgentId: 'a1', body: HANDS('v1'), createdAt: iso('2026-10-18T09:00:00+07:00') })
  w.enable()
  const hf = w.factory()
  await hf.run() // 首次：无换人触发器，只快照 prevOwner=a1
  assert.equal(w.writes.length, 0)
  w.issues['CMP-1'].assigneeAgentId = 'a2'
  w.issues['CMP-1'].updatedAt = iso('2026-10-19T01:00:00+07:00')
  await hf.run() // 换人 a1→a2：转交一次
  assert.equal(w.writes.length, 1)
  await hf.run() // 状态没再变：不重复转交
  assert.equal(w.writes.length, 1)
  // 再换 a2→a1（不同前任）：再转交一次
  w.issues['CMP-1'].assigneeAgentId = 'a1'
  w.issues['CMP-1'].updatedAt = iso('2026-10-19T02:00:00+07:00')
  await hf.run()
  assert.equal(w.writes.length, 2)
})

test('资金类任务：不自动发评论（含换人转交），只通知董事会一次', async (t) => {
  const w = setup(t)
  const it = w.add('CMP-1', { title: '账务对账', assigneeAgentId: 'a1' })
  it.comments.push({ id: 'c0', authorAgentId: 'a1', body: HANDS('v1'), createdAt: iso('2026-10-18T09:00:00+07:00') })
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  const r = await hf.run()
  assert.equal(w.writes.length, 0, '资金类只显示不评论')
  assert.equal(w.notices.length, 1)
  assert.match(w.notices[0], /账务对账/)
  assert.match(w.notices[0], /资金类/)
  await hf.run()
  assert.equal(w.notices.length, 1, '通知董事会一次')
})

test('冷却：同一任务同一触发 24 小时内最多一条提醒', async (t) => {
  const w = setup(t)
  w.add('CMP-1')
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  await hf.run()
  assert.equal(w.writes.length, 1)
  w.advance(1) // 1 小时后
  await hf.run()
  assert.equal(w.writes.length, 1, '未过 24h 不重复提醒')
  w.advance(24) // 再过 24 小时
  await hf.run()
  assert.equal(w.writes.length, 2, '过 24h 可再次提醒')
})

test('每轮最多处理 6 个任务', async (t) => {
  const w = setup(t)
  for (let k = 1; k <= 7; k++) { const id = 'CMP-' + k; w.add(id, { assigneeAgentId: 'a' + (k % 3 + (k === 7 ? 2 : 0) || 'a1'), updatedAt: iso(`2026-10-18T0${k}:00:00+07:00`) }); w.failRun(id) }
  w.agents.length = 0
  for (let k = 1; k <= 7; k++) w.agents.push({ id: 'a' + k, name: 'A' + k, status: 'idle' })
  Object.values(w.issues).forEach((it) => { it.assigneeAgentId = 'a' + parseInt(it.identifier.slice(4)) })
  w.enable()
  const hf = w.factory()
  const r = await hf.run()
  assert.equal(r.processed, 6)
  assert.equal(w.writes.length, 6)
})

test('每个岗位 1 小时内最多收到 3 条巡检评论', async (t) => {
  const w = setup(t)
  for (let k = 1; k <= 4; k++) { w.add('CMP-' + k, { assigneeAgentId: 'a1' }); w.failRun('CMP-' + k) }
  w.enable()
  const hf = w.factory()
  const r = await hf.run()
  assert.equal(r.processed, 3)
  assert.equal(w.writes.length, 3)
})

test('paused 负责人跳过，不发提醒也不转交', async (t) => {
  const w = setup(t)
  w.add('CMP-1', { assigneeAgentId: 'ap' })
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  const r = await hf.run()
  assert.equal(r.processed, 0)
  assert.equal(w.writes.length, 0)
})

test('handoff.json 损坏不崩溃：视为关闭、/state 提示 corrupt、重启后保留状态', async (t) => {
  const w = setup(t)
  fs.writeFileSync(w.file, '{not-json')
  const hf = w.factory()
  assert.equal(hf.view().corrupt, true)
  assert.deepEqual(await hf.run(), { ran: false, reason: '总开关已关闭' })
  assert.equal(w.writes.length, 0)
  assert.equal(w.notices.length, 0)
  // 修好文件后重建（模拟重启）：状态延续，不崩溃
  fs.writeFileSync(w.file, JSON.stringify({ enabled: true }))
  w.add('CMP-1')
  w.comment(w.issues['CMP-1'], { body: '开始', at: '2026-10-18T09:00:00+07:00' })
  w.failRun('CMP-1')
  const hf2 = w.factory()
  assert.equal(hf2.view().corrupt, false)
  await hf2.run()
  assert.equal(w.writes.length, 1)
  // 再重建：remindedAt 保留，不再重复提醒（冷却生效）
  w.advance(1)
  const hf3 = w.factory()
  await hf3.run()
  assert.equal(w.writes.length, 1, '重启后冷却状态保留')
})

test('preview 只读：不发送、不写盘；返回触发项清单', async (t) => {
  const w = setup(t)
  w.add('CMP-1')
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  const p = await hf.preview()
  assert.equal(p.enabled, true)
  assert.equal(p.corrupt, false)
  assert.equal(p.items.length, 1)
  assert.equal(p.items[0].ident, 'CMP-1')
  assert.deepEqual(p.items[0].triggers.map((x) => x.type), ['interrupted'])
  assert.equal(p.items[0].handoff.complete, false)
  assert.equal(w.writes.length, 0)
  const raw = JSON.parse(fs.readFileSync(w.file, 'utf8'))
  assert.equal((raw.tasks || {}).CMP, undefined, 'preview 不写盘')
})

test('view 摘要：missingCount / forwardedCount / records 只含脱敏元数据，不含评论正文', async (t) => {
  const w = setup(t)
  w.add('CMP-1') // 无交接包评论 → 缺交接包；但带完整违规提示字段不发? 发 T1 提醒
  w.failRun('CMP-1')
  w.enable()
  const hf = w.factory()
  await hf.run()
  const v = hf.view()
  assert.equal(v.enabled, true)
  assert.equal(v.missingCount, 1)
  assert.equal(v.forwardedCount, 0)
  assert.equal(v.records.length > 0, true)
  const json = JSON.stringify(v)
  assert.equal(json.includes('AC-1'), false, '不泄露评论正文')
})