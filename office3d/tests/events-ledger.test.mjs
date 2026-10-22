import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEventsLedger, parseReplayDate, computeGaps, countKinds } from '../events-ledger.mjs'
import { redactText } from '../wall.mjs'

const TZ = 'Asia/Phnom_Penh'
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'))
const ev = (id, at, kind = 'speak', extra = {}) => ({ id, at, kind, ...extra })
const names = () => ({ u1: '小林', u2: '阿峰' })

function ledgerIn(dir, clock) {
  return createEventsLedger({ redactText, dir, now: () => clock.t, tz: TZ, names })
}

test('账本：按 id 去重，同一事件重复投递只落一行', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T01:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  const e = ev('ev-1', new Date(clock.t).toISOString(), 'speak', { text: '你好' })
  const r1 = l.ingest([e])
  const r2 = l.ingest([e, e, { ...e, id: 'ev-2' }])
  assert.equal(r1.written, 1)
  assert.equal(r2.written, 1)
  const day = l.readDay('2026-10-19')
  assert.equal(day.records.length, 2)
})

test('账本：跨日分文件（金边日界：23:30 与次日 00:30 进不同文件）', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  l.ingest([
    ev('a', '2026-10-19T23:30:00+07:00', 'speak', { text: '夜里' }),
    ev('b', '2026-10-20T00:30:00+07:00', 'speak', { text: '凌晨' }),
  ])
  assert.equal(l.readDay('2026-10-19').records.length, 1)
  assert.equal(l.readDay('2026-10-20').records.length, 1)
  assert.equal(fs.existsSync(path.join(dir, 'events', '2026-10-19.jsonl')), true)
  assert.equal(fs.existsSync(path.join(dir, 'events', '2026-10-20.jsonl')), true)
})

test('账本：损坏行跳过并计数，不崩溃', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  const f = path.join(dir, 'events', '2026-10-19.jsonl')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, '{"id":"ok1","at":"2026-10-19T10:00:00+07:00","kind":"speak","text":"好"}\n不是有效 JSON\n{"id":"ok2","at":"2026-10-19T11:00:00+07:00","kind":"report","text":"好"}\n{"id":123,"at":"x"}\n', 'utf8')
  const day = l.readDay('2026-10-19')
  assert.equal(day.records.length, 2)
  assert.equal(day.records[0].id, 'ok1')
  assert.ok(l.view().corrupt >= 2)
})

test('账本：30 天清理只删超期文件', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  for (const d of ['2026-09-01', '2026-10-15', '2026-10-18']) {
    const f = path.join(dir, 'events', d + '.jsonl')
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, '{"id":"' + d + '","at":"' + d + 'T10:00:00+07:00","kind":"speak","text":"x"}\n', 'utf8')
  }
  const removed = l.cleanup()
  assert.equal(removed, 1) // 2026-09-01（早于 30 天前）被删；10-15/10-18 保留
  assert.equal(l.readDay('2026-09-01').records.length, 0)
  assert.equal(l.readDay('2026-10-15').records.length, 1)
})

test('账本：单日 5000 条上限，超限停止追加并在 view 里提示 capped', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  const at = new Date(clock.t).toISOString()
  const many = Array.from({ length: 5001 }, (_, i) => ev('e' + i, at, 'speak', { text: 't' + i }))
  const r1 = l.ingest(many)
  assert.equal(r1.written, 5000)
  assert.equal(r1.skipped, 1)
  const v = l.view()
  assert.equal(v.count, 5000)
  assert.equal(v.capped, true)
  const r2 = l.ingest([ev('extra', at, 'speak', { text: 'x' })])
  assert.equal(r2.written, 0) // 今天已超限，不再写
})

test('账本：脱敏（金额 / IP / 邮箱 / 链接 / 长串）', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  const text = '联系 https://example.com/x 或 a@b.com，IP 192.168.1.10，费用 $1,234 与 5000 美元，密钥 abcdefghijabcdefghijabcdefghij1234567abc'
  l.ingest([ev('d1', new Date(clock.t).toISOString(), 'speak', { text })])
  const raw = fs.readFileSync(path.join(dir, 'events', '2026-10-19.jsonl'), 'utf8')
  assert.ok(!raw.includes('example.com'))
  assert.ok(!raw.includes('a@b.com'))
  assert.ok(!raw.includes('192.168.1.10'))
  assert.ok(!raw.includes('$1,234'))
  assert.ok(!raw.includes('abcdefghijabcdefghijabcdefghij1234567abc'))
  assert.ok(raw.includes('〔链接〕') && raw.includes('〔邮箱〕') && raw.includes('〔地址〕') && raw.includes('〔金额〕') && raw.includes('〔密文〕'))
})

test('账本：text 截断到 120 字', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  l.ingest([ev('t1', new Date(clock.t).toISOString(), 'speak', { text: '啊'.repeat(220) })])
  const day = l.readDay('2026-10-19')
  assert.ok(day.records[0].text.length <= 120)
})

test('账本：enabled:false 时不写', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  fs.writeFileSync(path.join(dir, 'events-ledger.json'), JSON.stringify({ enabled: false }), 'utf8')
  const l = ledgerIn(dir, clock)
  const r = l.ingest([ev('e1', new Date(clock.t).toISOString(), 'speak', { text: 'x' })])
  assert.equal(r.written, 0)
  assert.equal(l.view().enabled, false)
  assert.equal(fs.existsSync(path.join(dir, 'events')), false)
})

test('账本：readDay 用 names 把 agent id 映射成显示名', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  l.ingest([ev('m1', new Date(clock.t).toISOString(), 'dispatch', { from: 'u1', to: 'u2', text: '派给你' })])
  const day = l.readDay('2026-10-19')
  assert.equal(day.records[0].from.name, '小林')
  assert.equal(day.records[0].to.name, '阿峰')
  assert.equal(day.records[0].from.id, 'u1')
})

test('账本：回放可用起点 = 第一条事件时间', () => {
  const dir = mk(), clock = { t: Date.parse('2026-10-19T12:00:00+07:00') }
  const l = ledgerIn(dir, clock)
  assert.equal(l.view().since, null)
  l.ingest([ev('f1', '2026-10-19T08:05:00+07:00', 'speak', { text: '早' })])
  const v = l.view()
  assert.equal(v.since, '2026-10-19 08:05')
  assert.ok(v.firstAt)
})

test('parseReplayDate：合法通过、非法 400、缺省为今天', () => {
  assert.equal(parseReplayDate('2026-10-19', TZ), '2026-10-19')
  assert.equal(parseReplayDate(null, TZ), parseReplayDate(undefined, TZ))
  assert.match(parseReplayDate(null, TZ), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(parseReplayDate('2026-13-01', TZ), null)
  assert.equal(parseReplayDate('2026-02-30', TZ), null)
  assert.equal(parseReplayDate('2026-2-1', TZ), null)
  assert.equal(parseReplayDate('today', TZ), null)
})

const DUTY = { timezone: TZ, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
const rAt = (iso) => ({ at: iso })

test('computeGaps：只标上班时段内 > 30 分钟的空档', () => {
  const records = [
    rAt('2026-10-14T09:10:00+07:00'), // 周三
    rAt('2026-10-14T09:50:00+07:00'), // 40 分钟，上班时段 → 标
    rAt('2026-10-14T10:20:00+07:00'), // 正好 30 分钟（>30 才算）→ 不标
    rAt('2026-10-14T14:20:00+07:00'), // 240 分钟，中点 12:20 上班时段 → 标
    rAt('2026-10-14T14:40:00+07:00'), // 20 分钟 → 不标
    rAt('2026-10-14T17:00:00+07:00'), // 140 分钟，中点 15:50 上班时段 → 标
    rAt('2026-10-15T09:30:00+07:00'), // 跨夜，中点不在上班时段 → 不标
  ]
  const gaps = computeGaps(records, DUTY)
  assert.equal(gaps.length, 3)
  assert.deepEqual(gaps.map((g) => g.minutes), [40, 240, 140])
  assert.equal(computeGaps([records[0]], DUTY).length, 0)
})

test('countKinds：按类型统计分量', () => {
  const c = countKinds([
    { kind: 'dispatch' }, { kind: 'report' }, { kind: 'celebrate' }, { kind: 'speak' }, { kind: 'speak' },
    { kind: 'submit_to_board' }, { kind: 'board_decision' }, { kind: 'unknown_kind' },
  ])
  assert.deepEqual(c, { dispatch: 1, report: 1, celebrate: 1, speak: 2, submit_to_board: 1, board_decision: 1 })
})