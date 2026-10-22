// replay.js 纯函数测试。
// replay.js 是浏览器模块（.js，目录无 package.json，Node 默认按 CJS 解释），
// 因此用「读源码 → data: URL 动态 import」的方式在 Node 里作为 ESM 加载，与浏览器行为一致。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../replay.js', import.meta.url), 'utf8')
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
const {
  GAP_MAX_MS,
  TOTAL_MAX_MS,
  sampleEvents,
  compressTimeline,
  planReplay,
  countKinds,
  kindColor,
  KIND_LABEL,
  trackSegments,
  seekIndex,
  hhmm,
  phShiftDay,
} = mod

const T = '2026-10-19T'
const iso = (h, m) => `${T}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`
const ev = (id, atIso, kind = 'speak', extra = {}) => Object.assign({ id, at: atIso, kind, from: 'u1', text: 'x' }, extra)

test('时间压缩：真实空档压到 ≤2 秒，总长 ≤90 秒', () => {
  const a = ev('a', iso(9, 0))
  const b = ev('b', iso(12, 0)) // 相隔 3 小时
  const c = compressTimeline([a, b])
  const gap = c.events[1].start - c.events[0].end
  assert.equal(gap, GAP_MAX_MS) // 3 小时被压成 2 秒
  assert.ok(c.durationMs <= TOTAL_MAX_MS)
  assert.equal(c.durationMs, 1400 + GAP_MAX_MS + 1400)
})

test('整日回放总长 ≤90 秒（140 条关键事件也压得住）', () => {
  const base = Date.parse('2026-10-19T09:00:00+07:00')
  const many = Array.from({ length: 140 }, (_, i) => ev('m' + i, new Date(base + i * 300000).toISOString(), 'report'))
  const c = compressTimeline(many)
  assert.ok(c.durationMs <= TOTAL_MAX_MS)
  // 相邻事件的显示空档（含事件间隔）不超过 2 秒
  for (let i = 1; i < c.events.length; i++) {
    assert.ok(c.events[i].start - c.events[i - 1].end <= GAP_MAX_MS + 1e-6)
  }
})

test('抽样：>300 条时 speak 按时间窗合并，dispatch/report/celebrate 一条不丢', () => {
  const base = Date.parse('2026-10-19T09:00:00+07:00')
  const speaks = Array.from({ length: 360 }, (_, i) => ev('s' + i, new Date(base + i * 60000).toISOString(), 'speak')) // 每分钟一条，跨度 6 小时
  const crit = [
    { id: 'c1', at: new Date(base + 3 * 60000).toISOString(), kind: 'dispatch' },
    { id: 'c2', at: new Date(base + 5 * 60000).toISOString(), kind: 'report' },
    { id: 'c3', at: new Date(base + 9 * 60000).toISOString(), kind: 'celebrate' },
    { id: 'c4', at: new Date(base + 100 * 60000).toISOString(), kind: 'celebrate' },
  ]
  const all = crit.concat(speaks)
  const s = sampleEvents(all)
  assert.equal(s.sampled, true)
  assert.equal(s.speakTotal, 360)
  assert.ok(s.speakKept < s.speakTotal)
  assert.ok(s.dropped > 0)
  // 关键事件全保留
  for (const k of ['dispatch', 'report', 'celebrate']) assert.equal(s.critical[k], k === 'celebrate' ? 2 : 1)
  const ids = new Set(s.list.map((e) => e.id))
  for (const c of crit) assert.ok(ids.has(c.id), `${c.kind} 不能被抽样丢掉`)
  // 关键事件合计 = 抽样后剩下的关键事件数
  const keptCrit = s.list.filter((e) => e.kind !== 'speak')
  assert.equal(keptCrit.length, crit.length)
})

test('planReplay：统计数字等于账本计数，不因抽样改变', () => {
  const base = Date.parse('2026-10-19T09:00:00+07:00')
  const all = [
    ev('s1', new Date(base).toISOString(), 'speak'),
    ev('s2', new Date(base + 60000).toISOString(), 'speak'),
    ev('d1', new Date(base + 120000).toISOString(), 'dispatch'),
    ev('r1', new Date(base + 300000).toISOString(), 'report'),
    ev('c1', new Date(base + 2600000).toISOString(), 'celebrate'),
  ]
  const plan = planReplay(all)
  const expect = countKinds(all)
  assert.deepEqual(plan.counts, expect)
  assert.equal(plan.total, all.length)
  assert.equal(plan.firstAt, all[0].at)
  assert.equal(plan.lastAt, all[4].at)
  assert.equal(plan.data.length, all.length) // 5 条没到抽样阈值
})

test('时间轴着色：类型颜色不同，灰色 = 空档分段', () => {
  const a = ev('a', iso(9, 0))
  const b = ev('b', iso(12, 0))
  const plan = planReplay([a, b]) // 3 小时空档 → zones 至少 1 段
  const segs = trackSegments(plan)
  const colors = new Set(segs.map((s) => s.color))
  assert.ok(colors.has('#3a3f47'), '空档应该标灰色')
  assert.equal(colors.size, 2) // 事件色 + 灰色
  assert.ok(segs.every((s, i) => i === 0 || segs[i - 1].from <= s.from), '分段按时间排序')
  // 各类型颜色两两不同
  const kc = ['dispatch', 'report', 'celebrate', 'speak'].map((k) => kindColor(k))
  assert.equal(new Set(kc).size, 4)
  for (const k of Object.keys(KIND_LABEL)) assert.ok(kindColor(k))
})

test('跳转定位：seekIndex 返回播放游标位置', () => {
  const plan = planReplay([ev('a', iso(9, 0)), ev('b', iso(9, 10))])
  assert.equal(seekIndex(plan, 0), 0)
  assert.equal(seekIndex(plan, plan.durationMs / 2), plan.data.findIndex((e) => e.end > plan.durationMs / 2))
  assert.equal(seekIndex(plan, plan.durationMs), plan.data.length) // 播完 = 末尾
})

test('hhmm / phShiftDay：金边时间显示与日期偏移', () => {
  assert.equal(hhmm('2026-10-19T09:05:00+07:00'), '09:05')
  assert.equal(hhmm(''), '')
  assert.equal(phShiftDay('2026-10-19', -1), '2026-10-18')
  assert.equal(phShiftDay('2026-10-19', 1), '2026-10-20')
})

test('单事件边界：没有空档、总长 = 单条时长', () => {
  const c = compressTimeline([ev('one', iso(9, 0))])
  assert.equal(c.events.length, 1)
  assert.equal(c.zones.length, 0)
  assert.equal(c.durationMs, 1400)
})