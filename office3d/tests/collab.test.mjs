import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildCollab, workdayKeys, selectWindowDays, ledgerTodayKey, COLLAB_THRESHOLDS, COLLAB_KINDS, DISCLAIMER, NO_REVIEW_SOURCE, NOT_ENOUGH_NOTE, EMPTY_NOTE, GROUP_ORDER, GROUP_COLOR, ledgerDayFiles } from '../collab.mjs'

// 与 office-layout.js SEATS 同构的岗位集：id = agent.name（SEAT 键），group = 房间 id
const nodes = [
  { id: 'Lead', name: '技术负责人', group: 'product' },
  { id: 'Architect', name: '架构师', group: 'product' },
  { id: 'Backend1', name: '后端工程师 #1', group: 'eng' },
  { id: 'Reviewer2', name: '代码审查员 #2', group: 'quality' },
  { id: 'KnowledgeKeeper', name: '知识库管理员', group: 'kb' },
  { id: 'board', name: '董事会', group: 'board' },
]
const ev = (id, kind, from, to, ref) => ({ id, at: '2026-10-19T08:00:00+07:00', kind, from, to, ref, text: 'SECRET-BODY-' + id })
const window1 = { kind: 'all', workdays: ['2026-10-19'], from: '2026-10-19', to: '2026-10-19', workdayCount: 1 }
const build = (records, extra = {}) => buildCollab({ records, nodes, window: window1, ...extra })

test('协作定义：to 为空不成边；庆祝/上报不构成边', () => {
  const r = build([
    ev('a', 'celebrate', 'Lead', null, 'CMP-1'), // 对全体庆祝：不成边
    ev('b', 'speak', 'Lead', null, 'CMP-1'), // 对全体发言：不成边
    ev('c', 'report', 'Lead', null, 'CMP-1'), // report 但 to 空：不成边
    ev('d', 'submit_to_board', 'Lead', 'board', 'CMP-1'), // 上报：不计
    ev('e', 'board_decision', 'board', 'Lead', 'CMP-1'), // 决定：不计
  ])
  assert.equal(r.edges.length, 0)
  assert.equal(r.metrics.isolated.includes('Lead'), true)
  assert.match(r.notes.join(''), /对全体 \/ 庆祝发言未构成边/)
})

test('协作定义：闲聊/无 ref 的发言不算，lounge 不算', () => {
  const r = build([
    ev('a', 'speak', 'Lead', 'Backend1', null), // 无 ref：不算
    ev('b', 'speak', 'Lead', 'Backend1', 'lounge'), // lounge：不算
    ev('c', 'speak', 'Lead', 'Backend1', 'LOUNGE'), // 大小写不敏感
    ev('d', 'speak', 'Lead', 'Backend1', 'CMP-9'), // 有 ref：算
  ])
  assert.equal(r.edges.length, 1)
  assert.equal(r.edges[0].speak, 1)
  assert.equal(r.edges[0].count, 1)
})

test('有向边计数与分项；方向相反是两条边', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'CMP-1'),
    ev('2', 'dispatch', 'Lead', 'Backend1', 'CMP-2'),
    ev('3', 'report', 'Backend1', 'Lead', 'CMP-1'),
    ev('4', 'report', 'Backend1', 'Lead', 'CMP-3'),
    ev('5', 'speak', 'Lead', 'Reviewer2', 'CMP-5'),
    ev('6', 'speak', 'Lead', 'Reviewer2', 'CMP-6'),
    ev('7', 'speak', 'Lead', 'Reviewer2', null),
  ])
  assert.equal(r.edges.length, 3)
  const lb = r.edges.find((e) => e.from === 'Lead' && e.to === 'Backend1')
  const bl = r.edges.find((e) => e.from === 'Backend1' && e.to === 'Lead')
  const lr = r.edges.find((e) => e.from === 'Lead' && e.to === 'Reviewer2')
  assert.deepEqual(lb, { from: 'Lead', to: 'Backend1', count: 2, dispatch: 2, report: 0, speak: 0 })
  assert.deepEqual(bl, { from: 'Backend1', to: 'Lead', count: 2, dispatch: 0, report: 2, speak: 0 })
  assert.deepEqual(lr, { from: 'Lead', to: 'Reviewer2', count: 2, dispatch: 0, report: 0, speak: 2 })
})

test('kinds 筛选：只选派单时汇报/互动边被过滤，count 只按所选类型', () => {
  const records = [
    ev('1', 'dispatch', 'Lead', 'Backend1', 'CMP-1'),
    ev('2', 'report', 'Backend1', 'Lead', 'CMP-2'),
    ev('3', 'speak', 'Lead', 'Reviewer2', 'CMP-3'),
  ]
  const r = build(records, { kinds: ['dispatch'] })
  assert.equal(r.edges.length, 1)
  assert.deepEqual(r.edges[0], { from: 'Lead', to: 'Backend1', count: 1, dispatch: 1, report: 0, speak: 0 })
  const r2 = build(records, { kinds: ['report', 'speak'] })
  assert.equal(r2.edges.length, 2)
  assert.equal(r2.edges.find((e) => e.from === 'Backend1').count, 1)
})

test('窗口切换：按金边上班日从今天往回数，含今天（T12b）', () => {
  const now = Date.parse('2026-10-29T12:00:00+07:00') // 周四；今天 10-29 是上班日 → 窗口含今天
  assert.deepEqual(workdayKeys(now, 3, [0, 1, 2, 3, 4, 5, 6]), ['2026-10-27', '2026-10-28', '2026-10-29'])
  // 周一至五：跳过周六日（10-24 / 10-25）
  assert.deepEqual(workdayKeys(now, 3, [1, 2, 3, 4, 5]), ['2026-10-27', '2026-10-28', '2026-10-29'])
  // 缺省（无作息）退化为周一至周五，最后一天 = 今天
  assert.equal(workdayKeys(now, 3).at(-1), '2026-10-29')
  // 全周上班时窗口含周末日期
  assert.deepEqual(workdayKeys(Date.parse('2026-10-29T12:00:00+07:00'), 5, [0, 1, 2, 3, 4, 5, 6]), ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
})

test('少于 3 个上班日：notes 顶部标数据不足', () => {
  for (const n of [1, 2]) {
    const r = buildCollab({ records: [ev('a', 'dispatch', 'Lead', 'Backend1', 'CMP-1')], nodes, window: { kind: 'all', workdays: ['2026-10-19'], from: '2026-10-19', to: '2026-10-19', workdayCount: n } })
    assert.equal(r.notes[0], NOT_ENOUGH_NOTE)
    assert.match(r.notes[1], /数据自 2026-10-19 起，共 \d 个上班日/)
  }
  const ok = buildCollab({ records: [ev('a', 'dispatch', 'Lead', 'Backend1', 'CMP-1')], nodes, window: { kind: '7', workdays: ['a', 'b', 'c'], from: '2026-10-17', to: '2026-10-19', workdayCount: 3 } })
  assert.equal(ok.notes.includes(NOT_ENOUGH_NOTE), false)
})

test('孤立岗位：窗口内没有任何边的岗位列出，不去隐藏', () => {
  const r = build([
    ev('a', 'dispatch', 'Lead', 'Backend1', 'CMP-1'),
    ev('b', 'report', 'Backend1', 'Lead', 'CMP-2'),
  ])
  assert.equal(r.metrics.isolated.includes('Architect'), true)
  assert.equal(r.metrics.isolated.includes('KnowledgeKeeper'), true)
  assert.equal(r.metrics.isolated.includes('Lead'), false)
  assert.equal(r.metrics.isolated.includes('board'), true) // 没有边也有 board 节点
})

test('汇聚点：入边次数最多的前 3 位（只标数量，不评价）', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('2', 'dispatch', 'Architect', 'Backend1', 'C'),
    ev('3', 'dispatch', 'Lead', 'Reviewer2', 'C'),
    ev('4', 'report', 'Backend1', 'Lead', 'C'),
    ev('5', 'report', 'Reviewer2', 'Lead', 'C'),
    ev('6', 'report', 'Lead', 'board', 'C'),
    ev('7', 'report', 'Architect', 'board', 'C'),
    ev('8', 'report', 'KnowledgeKeeper', 'board', 'C'),
  ])
  const names = r.metrics.hubs.map((h) => h.id)
  assert.deepEqual(names, ['board', 'Lead', 'Backend1']) // 入边 3/2/2
  const hub = r.metrics.hubs.find((h) => h.id === 'board')
  assert.equal(hub.inCount, 3)
})

test('一对一依赖：恰好 5 次且恰好 80% 命中；次数不足不标（T12b）', () => {
  const r = build([
    // Lead 出边 5 条：4 条给 Backend1、1 条给 Reviewer2 → 恰好 5 次且恰好 80% → 命中
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'), ev('2', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('3', 'dispatch', 'Lead', 'Backend1', 'C'), ev('4', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('5', 'dispatch', 'Lead', 'Reviewer2', 'C'),
    // Architect 只有 1 条出边给 KnowledgeKeeper → 100% 但次数不足 5 → 不标
    ev('6', 'dispatch', 'Architect', 'KnowledgeKeeper', 'C'),
    // Backend1 只有 1 条出边 → 次数不足 → 不标
    ev('7', 'report', 'Backend1', 'Lead', 'C'),
  ])
  const ot = r.metrics.oneToOne
  // 阈值随接口下达（buildCollab 结果带 thresholds；页面从 data.thresholds 读）
  assert.deepEqual(r.thresholds, { oneToOneShare: 0.8, minOutForOneToOne: 5 })
  assert.equal(COLLAB_THRESHOLDS.oneToOneShare, 0.8)
  assert.equal(COLLAB_THRESHOLDS.minOutForOneToOne, 5)
  const lead = ot.find((x) => x.id === 'Lead')
  assert.equal(lead.partner, 'Backend1')
  assert.equal(lead.share, 0.8) // 恰好 80% 的边界
  assert.ok(!ot.some((x) => x.id === 'Architect')) // 只有 1 条出边：不标
  assert.ok(!ot.some((x) => x.id === 'Backend1')) // 只有 1 条出边：不标
  assert.ok(!ot.some((x) => x.id === 'Reviewer2'))
})

test('一对一依赖：4 次且 100% 不命中（出边次数低于最低门槛）', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'), ev('2', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('3', 'dispatch', 'Lead', 'Backend1', 'C'), ev('4', 'dispatch', 'Lead', 'Backend1', 'C'),
  ]) // 4 次全给同一对象：share=100% 但 < 5 次
  assert.equal(r.metrics.oneToOne.filter((x) => x.id === 'Lead').length, 0)
})

test('一对一依赖：5 次但 79% 不命中（低于比例门槛）', () => {
  const rs = []
  for (let i = 0; i < 79; i++) rs.push(ev('b' + i, 'dispatch', 'Lead', 'Backend1', 'C'))
  for (let i = 0; i < 21; i++) rs.push(ev('o' + i, 'dispatch', 'Lead', 'Reviewer2', 'C'))
  const r = build(rs) // 出边 100 次，最多 79 次给同一对象 → 79% < 80%
  assert.equal(r.metrics.oneToOne.filter((x) => x.id === 'Lead').length, 0)
})

test('一对一依赖：10 次分散给多人不命中', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'), ev('2', 'dispatch', 'Lead', 'Backend1', 'C'), ev('3', 'dispatch', 'Lead', 'Backend1', 'C'), ev('4', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('5', 'dispatch', 'Lead', 'Reviewer2', 'C'), ev('6', 'dispatch', 'Lead', 'Reviewer2', 'C'), ev('7', 'dispatch', 'Lead', 'Reviewer2', 'C'),
    ev('8', 'dispatch', 'Lead', 'Architect', 'C'), ev('9', 'dispatch', 'Lead', 'Architect', 'C'),
    ev('10', 'dispatch', 'Lead', 'KnowledgeKeeper', 'C'),
  ]) // 10 次分散：最多 4/10 = 40%
  assert.equal(r.metrics.oneToOne.filter((x) => x.id === 'Lead').length, 0)
})

test('一对一依赖：低于 80% 不提示', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'), ev('2', 'dispatch', 'Lead', 'Backend1', 'C'), ev('3', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('4', 'dispatch', 'Lead', 'Reviewer2', 'C'), ev('5', 'dispatch', 'Lead', 'Architect', 'C'), ev('6', 'dispatch', 'Lead', 'KnowledgeKeeper', 'C'),
  ]) // 3/6 = 50% < 80%
  assert.equal(r.metrics.oneToOne.filter((x) => x.id === 'Lead').length, 0)
})

test('空账本：无边、全员孤立、空状态说明', () => {
  const r = build([], { window: { kind: '14', workdays: [], from: null, to: null, workdayCount: 0 } })
  assert.equal(r.edges.length, 0)
  assert.equal(r.metrics.isolated.length, nodes.length)
  assert.equal(r.notes.includes(EMPTY_NOTE), true)
  assert.equal(r.empty, true)
})

test('节点度与次数：入/出分开，含 board 端点数', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('2', 'dispatch', 'Lead', 'Backend1', 'C'),
    ev('3', 'report', 'Lead', 'board', 'C'),
    ev('4', 'report', 'Backend1', 'Lead', 'C'),
  ])
  const lead = r.nodes.find((n) => n.id === 'Lead')
  assert.equal(lead.degreeOut, 2) // Backend1 + board
  assert.equal(lead.degreeIn, 1)
  assert.equal(lead.outCount, 3)
  assert.equal(lead.inCount, 1)
  const bk = r.nodes.find((n) => n.id === 'Backend1')
  assert.equal(bk.degreeIn, 1)
  assert.equal(bk.inCount, 2)
  const bd = r.nodes.find((n) => n.id === 'board')
  assert.equal(bd.degreeIn, 1)
  assert.equal(bd.inCount, 1)
})

test('输出里不含事件正文；跨岗位未知端点不构成边', () => {
  const r = build([
    ev('1', 'dispatch', 'Lead', 'Backend1', 'CMP-1'),
    ev('2', 'report', 'GhostAgent', 'Lead', 'CMP-2'), // 端点不在岗位名单
    ev('3', 'dispatch', 'Lead', 'GhostAgent', 'CMP-3'),
  ])
  const json = JSON.stringify(r)
  assert.equal(json.includes('SECRET-BODY'), false)
  assert.equal(r.edges.length, 1)
  assert.match(r.notes.join(''), /涉及未就座岗位/)
})

test('免责与口径固定出现在 notes；分组定义与办公室一致', () => {
  const r = build([ev('a', 'dispatch', 'Lead', 'Backend1', 'C')])
  assert.ok(r.notes.includes(DISCLAIMER))
  assert.ok(r.notes.includes(NO_REVIEW_SOURCE))
  assert.deepEqual(COLLAB_KINDS, ['dispatch', 'report', 'speak'])
  assert.deepEqual(GROUP_ORDER, ['product', 'eng', 'quality', 'drlife', 'ops', 'kb', 'board'])
  for (const g of GROUP_ORDER) assert.match(GROUP_COLOR[g], /^#[0-9a-f]{6}$/)
})

test('ledgerDayFiles：只列账本日期文件并排序（金边日期键）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-'))
  try {
    fs.mkdirSync(path.join(dir, 'events'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'events', '2026-10-20.jsonl'), '')
    fs.writeFileSync(path.join(dir, 'events', '2026-10-19.jsonl'), '')
    fs.writeFileSync(path.join(dir, 'events', 'README.txt'), '')
    assert.deepEqual(ledgerDayFiles(dir), ['2026-10-19', '2026-10-20'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ── T12b 修订 1：窗口含今天（selectWindowDays / ledgerTodayKey）──
test('T12b 窗口含今天：今天是上班日且今天有账本事件 → workdays 含今天、partialToday=true', () => {
  const allDays = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'] // 10-29 周四（今天）有账本事件
  const now = Date.parse('2026-10-29T12:00:00+07:00')
  const s = selectWindowDays({ allDays, nowMs: now, n: 3, dutyDays: [1, 2, 3, 4, 5] })
  assert.deepEqual(s.workdays, ['2026-10-27', '2026-10-28', '2026-10-29'])
  assert.equal(s.workdayCount, 3)
  assert.equal(s.partialToday, true)
})

test('T12b 窗口含今天：今天不是上班日（周日）→ 窗口不含今天、partialToday=false', () => {
  const allDays = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'] // 10-31 是周六、全在账本
  const now = Date.parse('2026-11-01T12:00:00+07:00') // 今天 11-01 是周日
  const s = selectWindowDays({ allDays, nowMs: now, n: 3, dutyDays: [1, 2, 3, 4, 5] })
  assert.deepEqual(s.workdays, ['2026-10-28', '2026-10-29', '2026-10-30']) // 最近 3 个上班日
  assert.equal(s.workdayCount, 3)
  assert.equal(s.partialToday, false)
})

test('T12b 窗口含今天：今天是上班日但今天无账本事件 → 今天不计入、partialToday=false', () => {
  const allDays = ['2026-10-26', '2026-10-27', '2026-10-28'] // 账本没有 10-29（今天）文件
  const now = Date.parse('2026-10-29T12:00:00+07:00')
  const s = selectWindowDays({ allDays, nowMs: now, n: 3, dutyDays: [1, 2, 3, 4, 5] })
  assert.deepEqual(s.workdays, ['2026-10-27', '2026-10-28']) // 空的今天不计入，避免冲淡数据
  assert.equal(s.workdayCount, 2)
  assert.equal(s.partialToday, false)
})

test('T12b 窗口含今天：N=7 / N=14 边界都含今天且数量正确', () => {
  const allDays = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']
  const now = Date.parse('2026-10-29T12:00:00+07:00')
  const s7 = selectWindowDays({ allDays, nowMs: now, n: 7, dutyDays: [1, 2, 3, 4, 5] })
  assert.equal(s7.workdayCount, 7)
  assert.deepEqual(s7.workdays, ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
  assert.equal(s7.partialToday, true)
  const s14 = selectWindowDays({ allDays, nowMs: now, n: 14, dutyDays: [1, 2, 3, 4, 5] })
  assert.equal(s14.workdayCount, 12) // 14 窗口中的上班日里账本实际有的：10-14..10-29 共 12 个工作日（10-12/13 不在账本）
  assert.equal(s14.partialToday, true)
})

test('T12b 窗口含今天：duty 含周末（days 0..6）时窗口含周末日期', () => {
  const allDays = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'] // 10-25 是周日
  const now = Date.parse('2026-10-29T12:00:00+07:00')
  const s = selectWindowDays({ allDays, nowMs: now, n: 5, dutyDays: [0, 1, 2, 3, 4, 5, 6] })
  assert.deepEqual(s.workdays, ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
  assert.equal(s.workdayCount, 5)
  assert.equal(s.partialToday, true)
})

test('T12b 窗口含今天：无作息（dutyDays=null）退化为账本最近 n 天', () => {
  const allDays = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']
  const now = Date.parse('2026-10-29T12:00:00+07:00')
  const s = selectWindowDays({ allDays, nowMs: now, n: 3, dutyDays: null })
  assert.deepEqual(s.workdays, ['2026-10-27', '2026-10-28', '2026-10-29'])
  assert.equal(s.workdayCount, 3)
  assert.equal(s.partialToday, true) // 退化分支同样含今天（前提是今天有账本事件）
})

test('T12b 金边日界：UTC 17:00 之后属于金边次日（ledgerTodayKey）', () => {
  assert.equal(ledgerTodayKey(Date.parse('2026-10-29T16:59:59Z')), '2026-10-29') // UTC 16:59:59 = 金边 23:59:59 当天
  assert.equal(ledgerTodayKey(Date.parse('2026-10-29T17:00:00Z')), '2026-10-30') // UTC 17:00 = 金边次日 00:00
  assert.equal(ledgerTodayKey(Date.parse('2026-10-30T12:00:00+07:00')), '2026-10-30')
})