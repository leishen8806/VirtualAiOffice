import test from 'node:test'
import assert from 'node:assert/strict'
import { daysText, pctText, isStale, carouselPage, paginate, shouldShowBrief } from '../wall.js'

const storage = (initial = {}) => ({
  data: { ...initial },
  getItem(k) { return this.data[k] ?? null },
  setItem(k, v) { this.data[k] = String(v) },
})

test('empty values stay readable', () => {
  assert.equal(pctText(null), '0%')
  assert.equal(daysText(null), '日期未知')
  assert.equal(carouselPage(0, 0), 0)
})

test('milestone dates distinguish overdue, just expired, and future', () => {
  assert.equal(daysText(0, true), '刚过期')
  assert.equal(daysText(-3, true), '超期 3 天')
  assert.equal(daysText(4), '还有 4 天')
})

test('long decision lists can be paged without invalid indexes', () => {
  assert.equal(carouselPage(17, 4), 1)
  assert.equal(carouselPage(-1, 4), 3)
})

test('twelve milestones are retained across four-row pages', () => {
  const milestones = Array.from({ length: 12 }, (_, i) => ({ id: `M${i + 1}` }))
  const pages = paginate(milestones, 4)
  assert.equal(pages.length, 3)
  assert.deepEqual(pages.flat().map((m) => m.id), milestones.map((m) => m.id))
  assert.equal(pages.every((page) => page.length <= 4), true)
})

test('stale data is based on the last successful pull', () => {
  assert.equal(isStale(600001, 1), false)
  assert.equal(isStale(600002, 1), true)
  assert.equal(isStale(1, 0), true)
})

test('a standup brief is shown once per day', () => {
  const s = storage()
  const done = { state: 'done' }
  assert.equal(shouldShowBrief('2026-10-18', done, s), true)
  s.setItem('office3d.wall.brief.2026-10-18', '1')
  assert.equal(shouldShowBrief('2026-10-18', done, s), false)
  assert.equal(shouldShowBrief('2026-10-19', done, s), true)
  assert.equal(shouldShowBrief('2026-10-19', { state: 'running' }, s), false)
})

test('missing data does not trigger a brief', () => {
  assert.equal(shouldShowBrief('2026-10-18', null, storage()), false)
  assert.equal(shouldShowBrief('2026-10-18', { state: 'awaiting', items: [] }, storage()), true)
})
