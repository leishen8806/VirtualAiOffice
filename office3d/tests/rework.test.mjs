// T13 有边界的返工自检：评论解析 + 巡检动作，用模拟的 Paperclip（不会真的发任何评论）。
// 运行：node --test tests/rework.test.mjs
// 口径（流程第 6 节）：提交验收之后被退回才算一轮；轮次按同一原因累计；第 3 轮（可调）停下升级。
// 动作全部默认关闭：rework.json 不存在或 enabled:false 时一概不写；损坏视为关闭并在 /state 提示。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRework, parseReworkComments, isCappedView, MARK } from '../rework.mjs'

const iso = (s) => new Date(Date.parse(s)).toISOString()
const back = (round, line = 'R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图') => ({ authorAgentId: 'r', body: `【第 ${round} 轮退回】${line}`, createdAt: iso(`2026-10-19T0${round}:00:00Z`) })

function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewtest-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let time = Date.parse('2026-10-19T08:30:00+07:00'), n = 0
  const issues = {}, writes = [], notices = []
  const add = (id, extra = {}) => { const i = { id, identifier: id, title: '普通任务', description: '', status: 'in_progress', updatedAt: '2026-10-18T08:30:00+07:00', comments: [], ...extra }; issues[id] = i; return i }
  const ISSUE = add('CMP-1')
  const review = (issue, body, at) => { issue.comments.push({ id: 'c' + ++n, authorAgentId: 'reviewer', body, createdAt: new Date(Date.parse(at)).toISOString() }); issue.updatedAt = new Date(Date.parse(at)).toISOString() }
  const get = async (p) => {
    if (p.endsWith('/companies/C/issues')) return structuredClone(Object.values(issues))
    const m = p.match(/^\/api\/issues\/([^/]+)(\/comments)?$/)
    if (m) { const i = issues[m[1]]; assert.ok(i, p); return structuredClone(m[2] ? i.comments : i) }
    throw new Error('未模拟 GET ' + p)
  }
  const send = async (method, p, body) => {
    writes.push({ method, p, body: structuredClone(body) })
    const m = p.match(/^\/api\/issues\/([^/]+)\/comments$/)
    if (method === 'POST' && m) { issues[m[1]].comments.push({ id: 'c' + ++n, authorAgentId: 'system', body: body.body, createdAt: new Date(time).toISOString() }); return {} }
    throw new Error('未模拟写 ' + method + ' ' + p)
  }
  const factory = (extra = {}) => createRework({ dir, company: 'C', get, send, notify: async (s) => notices.push(s), dutyOn: () => options.on !== false, now: () => time, log: () => {}, ...extra })
  const enable = () => fs.writeFileSync(path.join(dir, 'rework.json'), JSON.stringify({ enabled: true }))
  const advance = (h) => { time += h * 3600000 }
  return { dir, file: path.join(dir, 'rework.json'), add, ISSUE, review, get, send, writes, notices, factory, enable, advance }
}

// ───── 纯函数：三类评论解析 ─────
test('三类评论解析：全角括号、第二轮、修复、复验，分别抽出轮次与 R 项状态', () => {
  const s = parseReworkComments([
    { authorAgentId: 'r', body: '【第二轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字体大小不对 ｜ 复现 / 证据：截图已附', createdAt: iso('2026-10-19T01:00:00Z') },
    { authorAgentId: 'w', body: '【第 2 轮修复】R1 ｜ 修复：改小字号 ｜ 复验：人工点击 ｜ 状态：已修', createdAt: iso('2026-10-19T02:00:00Z') },
    { authorAgentId: 'r', body: '【第 2 轮复验】R1 通过', createdAt: iso('2026-10-19T03:00:00Z') },
  ])
  assert.equal(s.rounds, 2)
  assert.deepEqual(s.items, [{ r: 'R1', status: 'verified', failRounds: [] }])
  assert.equal(s.openItems, 0)
  assert.equal(s.warned, true, '第 2 轮恰好是预警轮')
  assert.equal(s.capped, false)
  assert.deepEqual(s.formatIssues, [])
})

test('退回缺「对应 AC」或「复现 / 证据」记为格式不全；R 编号重排不猜；中文轮次不猜', () => {
  const missing = parseReworkComments([
    { authorAgentId: 'r', body: '【第一轮退回】R1 ｜ 问题：x ｜ 复现：z', createdAt: iso('2026-10-19T01:00:00Z') }, // 缺「对应 AC」
    { authorAgentId: 'r', body: '【第二轮退回】R2 ｜ 对应 AC-1 ｜ 问题：y', createdAt: iso('2026-10-19T02:00:00Z') }, // 缺「复现 / 证据」
  ])
  assert.deepEqual(missing.formatIssues, ['R1 缺「对应 AC」', 'R2 缺「复现 / 证据」'])
  const order = parseReworkComments([{ authorAgentId: 'r', body: '【第 2 轮退回】R2 ｜ 对应 AC-2 ｜ 问题：c ｜ 复现：v\nR1 ｜ 对应 AC-1 ｜ 问题：d ｜ 复现：u', createdAt: iso('2026-10-19T03:00:00Z') }])
  assert.deepEqual(order.formatIssues, ['R 编号重排'])
  assert.equal(order.rounds, 2)
  const good = parseReworkComments([{ authorAgentId: 'r', body: '【第二十三轮退回】R1 ｜ 对应 AC-1 ｜ 问题：a ｜ 复现：b', createdAt: iso('2026-10-19T04:00:00Z') }])
  assert.equal(good.rounds, 23)
  const bad = parseReworkComments([{ authorAgentId: 'r', body: '【第 三三 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：a ｜ 复现：b', createdAt: iso('2026-10-19T05:00:00Z') }])
  assert.equal(bad.rounds, 0)
  assert.deepEqual(bad.formatIssues, ['轮次无法解析'])
})

test('程序自己的评论（含【返工巡检】标记）不计数；轮次 1/2/3 预警与超限', () => {
  const s = parseReworkComments([
    { authorAgentId: 'system', body: `${MARK}\n已退回到第 3 轮，未关闭 R 项：R1（未修）。\n按流程请 Lead 与董事会决定：继续 / 拆分 / 换人 / 取消。`, createdAt: iso('2026-10-19T00:30:00Z') },
    back(1), back(2),
  ])
  assert.equal(s.rounds, 2, '【返工巡检】评论不参与计数')
  assert.equal(s.warned, true)
  assert.equal(s.capped, false)
  const t3 = parseReworkComments([back(1), back(2), back(3)])
  assert.equal(t3.rounds, 3); assert.equal(t3.capped, true); assert.equal(t3.warned, false)
})

test('同一 R 项在 ≥2 个轮次复验都未通过 → repeatedItems', () => {
  const c = [
    back(1),
    { authorAgentId: 'w', body: '【第 1 轮修复】R1 ｜ 修复：x ｜ 复验：y ｜ 状态：已修', createdAt: iso('2026-10-19T01:30:00Z') },
    { authorAgentId: 'r', body: '【第 1 轮复验】R1 未通过', createdAt: iso('2026-10-19T02:00:00Z') },
    back(2),
    { authorAgentId: 'w', body: '【第 2 轮修复】R1 ｜ 修复：x ｜ 复验：y ｜ 状态：已修', createdAt: iso('2026-10-19T02:30:00Z') },
    { authorAgentId: 'r', body: '【第 2 轮复验】R1 未通过', createdAt: iso('2026-10-19T03:00:00Z') },
  ]
  const s = parseReworkComments(c)
  assert.deepEqual(s.repeatedItems, ['R1'])
  assert.equal(s.items[0].status, 'failed')
  assert.deepEqual(s.items[0].failRounds, [1, 2])
})

// ───── 纯函数：是否超限的判定 ─────
test('isCapped：已结束的任务不算超限；读不到视图按未超限', () => {
  assert.equal(isCappedView({ tasks: [{ issueId: 'x', capped: true, status: 'done' }] }, 'x'), false)
  assert.equal(isCappedView({ tasks: [{ issueId: 'x', capped: true, status: 'cancelled' }] }, 'x'), false)
  assert.equal(isCappedView({ tasks: [{ issueId: 'x', capped: true, status: 'in_review' }] }, 'x'), true)
  assert.equal(isCappedView({ tasks: [{ issueId: 'x', capped: true, status: 'in_review' }] }, 'y'), false)
  assert.equal(isCappedView(null, 'x'), false)
  assert.equal(isCappedView(undefined, 'x'), false)
})

// ───── createRework：巡检动作 ─────
test('总开关默认关闭且文件不存在：一概不写、不通知、不留文件', async (t) => {
  const w = setup(t)
  const rw = w.factory()
  assert.deepEqual(await rw.run(), {
    ran: false,
    reason: '总开关已关闭',
  })
  assert.equal(w.writes.length, 0)
  assert.equal(w.notices.length, 0)
  assert.equal(fs.existsSync(w.file), false)
})

test('超限：只发一次巡检评论 + 通知董事会一次；预警只显示；重复不再发', async (t) => {
  const w = setup(t); w.enable()
  w.review(w.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 1, '发一条评论')
  assert.match(w.writes[0].body.body, /【返工巡检】/)
  assert.match(w.writes[0].body.body, /第 3 轮/)
  assert.equal(w.notices.length, 1)
  assert.match(w.notices[0], /CMP-1/)
  const v = rw.view()
  assert.equal(v.cappedCount, 1)
  assert.equal(v.tasks[0].status, 'in_progress')
  assert.equal(v.tasks[0].rounds, 3)
  assert.equal(typeof v.tasks[0].sentAt, 'string', '已记录发送时间')
  assert.equal(typeof v.nextAt, 'string')
  // 24 小时内不重复（同一任务只做一次）
  w.advance(1)
  await rw.run()
  assert.equal(w.writes.length, 1)
  assert.equal(w.notices.length, 1)
  // 预警任务（第 2 轮）只显示，不发不通知
  const w2 = setup(t); w2.enable()
  w2.review(w2.ISSUE, '【第 2 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw2 = w2.factory()
  await rw2.run()
  assert.equal(w2.writes.length, 0)
  assert.equal(w2.notices.length, 0)
  assert.equal(rw2.view().warnCount, 1)
  const wt = rw2.view().tasks[0]
  assert.equal(wt.warned, true); assert.equal(wt.capped, false)
})

test('资金类：同样识别与显示，但不发评论，只通知董事会一次', async (t) => {
  const w = setup(t); w.enable()
  w.ISSUE.title = '提现流水账务对账'
  w.review(w.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 0, '资金类不发评论')
  assert.equal(w.notices.length, 1)
  assert.match(w.notices[0], /资金类/)
  assert.equal(rw.view().tasks[0].money, true)
  assert.equal(typeof rw.view().tasks[0].notifiedAt, 'string')
  assert.equal(rw.view().tasks[0].sentAt, null)
  await rw.run()
  assert.equal(w.notices.length, 1, '只通知一次')
})

test('每轮最多 6 个任务；多出来的留到下一轮；已结束任务不进超限数', async (t) => {
  const w = setup(t); w.enable()
  for (let k = 2; k <= 8; k++) {
    const i = w.add(`CMP-${k}`)
    i.updatedAt = `2026-10-1${k}T00:0${k}:00Z`
    w.review(i, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', `2026-10-1${k}T00:01:00Z`)
  }
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 6, '每轮最多 6 个')
  await rw.run()
  assert.equal(w.writes.length, 7, '剩余的下一轮处理（CMP-2..CMP-8 共 7 个超限任务）')
  const ended = setup(t); ended.enable()
  ended.ISSUE.status = 'cancelled'
  ended.review(ended.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw2 = ended.factory()
  await rw2.run()
  assert.equal(ended.writes.length, 0, '已结束不算超限、不动作')
  assert.equal(rw2.view().cappedCount, 0)
})

test('热关闭：文件改 enabled:false 后不再动作；重启（新实例）保留已发记录不重复发', async (t) => {
  const w = setup(t); w.enable()
  w.review(w.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 1)
  const stored = JSON.parse(fs.readFileSync(w.file)); stored.enabled = false; fs.writeFileSync(w.file, JSON.stringify(stored)) // 热关闭：只翻转开关，不丢状态
  w.advance(1)
  await rw.run()
  assert.equal(w.writes.length, 1, '热关闭后不再写')
  assert.equal(rw.view().enabled, false)
  const stored2 = JSON.parse(fs.readFileSync(w.file)); stored2.enabled = true; fs.writeFileSync(w.file, JSON.stringify(stored2))
  const rw2 = w.factory() // 模拟重启：同一目录新实例
  assert.equal(rw2.view().tasks[0].sentAt != null, true, '重启保留已发记录')
  await rw2.run()
  assert.equal(w.writes.length, 1, '重启后不会重复发')
})

test('rework.json 损坏按关闭处理并在 /state 提示，不崩溃、不覆盖损坏文件', async (t) => {
  const w = setup(t)
  fs.writeFileSync(w.file, '{坏')
  const rw = w.factory()
  assert.equal(rw.view().corrupt, true)
  assert.equal(rw.view().enabled, false)
  assert.deepEqual(await rw.run(), { ran: false, reason: '总开关已关闭' })
  assert.equal(fs.readFileSync(w.file, 'utf8'), '{坏', '不覆盖损坏文件')
  assert.equal(w.writes.length, 0)
})

test('定时巡检：重启后等 5 分钟，之后每 30 分钟扫一次，上班时间才扫', async (t) => {
  const w = setup(t); w.enable()
  const rw = w.factory()
  w.review(w.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  assert.equal((await rw.tick()).ran, false, '重启后等 5 分钟')
  assert.equal(w.writes.length, 0)
  w.advance(6 / 60) // +6 分钟
  assert.equal((await rw.tick()).ran, true)
  assert.equal(w.writes.length, 1)
  w.advance(29 / 60) // 仍未到 30 分钟
  assert.equal((await rw.tick()).ran, false, '未到巡检时间')
  w.advance(2 / 60) // 已过 30 分钟
  assert.equal((await rw.tick()).ran, true)
  const off = setup(t, { on: false }); off.enable()
  off.review(off.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rwf = off.factory()
  off.advance(6 / 60)
  assert.equal((await rwf.tick()).ran, false, '非上班时间不扫')
})

test('只读视图：不含评论正文，记录只留最近 10 条', async (t) => {
  const w = setup(t); w.enable()
  w.review(w.ISSUE, '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：字太小 ｜ 复现 / 证据：截图', '2026-10-19T08:00:00+07:00')
  const rw = w.factory()
  await rw.run()
  const v = rw.view()
  assert.equal(JSON.stringify(v).includes('复现 / 证据'), false, '不含评论正文')
  assert.deepEqual(Object.keys(v).sort(), ['cappedCount', 'corrupt', 'enabled', 'lastAt', 'nextAt', 'records', 'tasks', 'thresholds', 'warnCount'])
  assert.equal(v.thresholds.capRound, 3)
  assert.equal(v.records.length, 1)
  assert.equal(v.records[0].ident, 'CMP-1')
})

// ───── T13b：只认「评论里真正的标题行」，正文「提到 / 引用」不算 ─────
test('T13b 误报：正文里提到别的任务 / 引用模板，都不算退回（真实误报片段）', () => {
  const s = parseReworkComments([{
    authorAgentId: 'r',
    body: [
      '…CMP-295 第 2 轮退回的 R6、R7 我已就地裁定…',
      '…若它逾时或第 3 轮退回，由我就地书面放行…',
      'CMP-297 04:23:59Z 第 3 轮退回 R5 / R7。董事会已接受…',
      'CMP-278 附【第 2 轮修复】+【验收证据】+ 提交号',
      '用「【第 3 轮退回】R… ｜ 对应 AC-x ｜ 问题 ｜ 复现」编号',
    ].join('\n'),
    createdAt: iso('2026-10-19T10:00:00Z'),
  }])
  assert.equal(s.rounds, 0, '提到 / 引用不算退回')
  assert.equal(s.capped, false)
  assert.equal(s.ignoredMentions, 5, '正好 5 处被排除的提到')
  assert.deepEqual(s.items, [])
})

test('T13b 真退回：行首标题 + R 项 → 正常计数', () => {
  const s = parseReworkComments([{
    authorAgentId: 'r',
    body: '【第 3 轮退回】复核结论：REQUEST_CHANGES ｜ 审查…\nR5 ｜ 对应 AC-1 ｜ 问题：样式不符 ｜ 复现：截图',
    createdAt: iso('2026-10-19T10:00:00Z'),
  }])
  assert.equal(s.rounds, 3)
  assert.equal(s.capped, true)
  assert.deepEqual(s.items, [{ r: 'R5', status: 'open', failRounds: [] }])
})

test('T13b Markdown 前缀：## / ** / > 前缀的标题行都识别；行中间的提到不算', () => {
  const s = parseReworkComments([
    { authorAgentId: 'r', body: '## 【第 2 轮退回】\nR1 ｜ 对应 AC-1 ｜ 问题：x ｜ 复现：y', createdAt: iso('2026-10-19T01:00:00Z') },
    { authorAgentId: 'r', body: '**【第 2 轮退回】**\nR1 ｜ 对应 AC-1 ｜ 问题：x ｜ 复现：y', createdAt: iso('2026-10-19T02:00:00Z') },
    { authorAgentId: 'r', body: '> 【第 2 轮退回】\nR1 ｜ 对应 AC-1 ｜ 问题：x ｜ 复现：y', createdAt: iso('2026-10-19T03:00:00Z') },
    { authorAgentId: 'r', body: '引言提到【第 3 轮退回】R…', createdAt: iso('2026-10-19T04:00:00Z') },
  ])
  assert.equal(s.rounds, 2, '三条带前缀的标题行都是第 2 轮；行中间的提到不算')
  assert.equal(s.warned, true)
  assert.equal(s.capped, false)
  assert.equal(s.ignoredMentions, 1, '行中间的【第 3 轮退回】被排除')
})

test('T13b 同评论多个标题行：R 项归属最近的一个标题行（编号不回跨段重排）', () => {
  const s = parseReworkComments([{
    authorAgentId: 'r',
    body: '【第 1 轮退回】\nR2 ｜ 对应 AC-2 ｜ 问题：a ｜ 复现：x\n【第 2 轮退回】\nR1 ｜ 对应 AC-1 ｜ 问题：b ｜ 复现：y',
    createdAt: iso('2026-10-19T10:00:00Z'),
  }])
  assert.equal(s.rounds, 2)
  assert.deepEqual(s.formatIssues, [], '跨段 R2→R1 不构成同一退回内的编号重排')
  assert.deepEqual(s.items, [
    { r: 'R1', status: 'open', failRounds: [] },
    { r: 'R2', status: 'open', failRounds: [] },
  ])
})

test('T13b 退回标题行无任何 R 项：不计入轮次，标格式不全', () => {
  const s = parseReworkComments([{
    authorAgentId: 'r',
    body: '【第 3 轮退回】复核结论：REQUEST_CHANGES\n请补充证据。',
    createdAt: iso('2026-10-19T10:00:00Z'),
  }])
  assert.equal(s.rounds, 0, '退回缺 R 项不计轮次，防止引用模板误报')
  assert.deepEqual(s.formatIssues, ['退回缺 R 项'])
  assert.equal(s.capped, false)
})

test('T13b 端到端：任务只有「提到」文字（真实误报片段），开启总开关不动作', async (t) => {
  const w = setup(t); w.enable()
  w.review(w.ISSUE, '…CMP-295 第 2 轮退回的 R6、R7 我已就地裁定…\n若它逾时或第 3 轮退回，由我就地书面放行…', '2026-10-19T08:00:00+07:00')
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 0, '不发评论')
  assert.equal(w.notices.length, 0, '不通知董事会')
  assert.equal(rw.view().cappedCount, 0, '不判超限')
  assert.equal(rw.view().tasks[0].ignoredMentions, 2, '过滤生效：2 处提到被排除，视图里可看')
})
// ───── T13c：修复评论也代表返工轮次 ─────
test('T13c 只有修复评论也计轮次，括注不吞轮次数字', () => {
  const s = parseReworkComments([
    { authorAgentId: 'r', body: '【第 1 轮修复】R4 ｜ 修复：补齐样式 ｜ 状态：已修', createdAt: iso('2026-10-19T01:00:00Z') },
    { authorAgentId: 'r', body: '【第 2 轮修复】R5 ｜ 已修正 ｜ 复验：截图', createdAt: iso('2026-10-19T02:00:00Z') },
    { authorAgentId: 'r', body: '【第 3 轮修复（董事会例外已批准）】仅修订执行单', createdAt: iso('2026-10-19T03:00:00Z') },
  ])
  assert.equal(s.rounds, 3)
  assert.equal(s.roundsSource, 'fix')
  assert.equal(s.capped, true)
  assert.deepEqual(s.items, [
    { r: 'R4', status: 'fixed', failRounds: [] },
    { r: 'R5', status: 'fixed', failRounds: [] },
  ])
  assert.ok(s.formatIssues.includes('修复缺 R 项'))
})

test('T13c 退回与修复取较大轮次，并记录来源', () => {
  const both = parseReworkComments([
    { authorAgentId: 'r', body: '【第 2 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：x ｜ 复现 / 证据：y', createdAt: iso('2026-10-19T01:00:00Z') },
    { authorAgentId: 'r', body: '【第 3 轮修复】R1 ｜ 修复：x ｜ 状态：已修', createdAt: iso('2026-10-19T02:00:00Z') },
  ])
  assert.equal(both.rounds, 3); assert.equal(both.roundsSource, 'both')
  const ret = parseReworkComments([
    { authorAgentId: 'r', body: '【第 3 轮退回】R1 ｜ 对应 AC-1 ｜ 问题：x ｜ 复现 / 证据：y', createdAt: iso('2026-10-19T01:00:00Z') },
    { authorAgentId: 'r', body: '【第 2 轮修复】R1 ｜ 修复：x ｜ 状态：已修', createdAt: iso('2026-10-19T02:00:00Z') },
  ])
  assert.equal(ret.rounds, 3); assert.equal(ret.roundsSource, 'both')
})

test('T13c 修复行状态判定与缺状态提示', () => {
  const s = parseReworkComments([{
    authorAgentId: 'r', body: '【第 1 轮修复】\nR1 ｜ 修复：a ｜ 状态：已修\nR2 ｜ 已修正\nR3 ｜ 未修：原因\nR4 ｜ 修订说明', createdAt: iso('2026-10-19T01:00:00Z'),
  }])
  assert.deepEqual(s.items, [
    { r: 'R1', status: 'fixed', failRounds: [] },
    { r: 'R2', status: 'fixed', failRounds: [] },
    { r: 'R3', status: 'open', failRounds: [] },
    { r: 'R4', status: 'open', failRounds: [] },
  ])
  assert.equal(s.formatIssues.filter((x) => x === '修复缺状态').length, 1)
})

test('T13c 修复评论建立没有退回记录的 R 项，并保留缺 R 项问题', () => {
  const s = parseReworkComments([{ authorAgentId: 'r', body: '【第 2 轮修复】R7 ｜ 已修复', createdAt: iso('2026-10-19T01:00:00Z') }])
  assert.deepEqual(s.items, [{ r: 'R7', status: 'fixed', failRounds: [] }])
  assert.ok(s.formatIssues.includes('修复缺 R 项') === false)
  assert.equal(s.roundsSource, 'fix')
})

test('T13c 只有修复评论的端到端巡检使用修复依据且只发一次', async (t) => {
  const w = setup(t); w.enable(); w.ISSUE.status = 'in_review'
  w.review(w.ISSUE, '【第 1 轮修复】R1 ｜ 修复：a ｜ 状态：已修', '2026-10-19T08:00:00+07:00')
  w.review(w.ISSUE, '【第 2 轮修复】R1 ｜ 已修正 ｜ 复验：b', '2026-10-19T08:01:00+07:00')
  w.review(w.ISSUE, '【第 3 轮修复】R1 ｜ 未修：c', '2026-10-19T08:02:00+07:00')
  const rw = w.factory()
  await rw.run()
  assert.equal(w.writes.length, 1)
  assert.equal(w.notices.length, 1)
  assert.match(w.writes[0].body.body, /已进行到第 3 轮返工（依据：修复评论）/)
  await rw.run()
  assert.equal(w.writes.length, 1)
  assert.equal(w.notices.length, 1)
})
