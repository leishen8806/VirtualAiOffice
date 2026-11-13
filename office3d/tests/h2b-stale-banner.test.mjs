import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { staleView } from '../ui.js'

test('H2b stale banner reports server age without disabling writes', () => {
  assert.deepEqual(staleView(), { active: false, text: '' })
  assert.deepEqual(staleView({ active: true, ageMs: 125000, reason: 'UPSTREAM_UNAVAILABLE' }), { active: true, text: '数据来自 2 分钟前 · Paperclip 暂不可用' })
  assert.deepEqual(staleView({ active: true, ageMs: 1860000, reason: 'STALE_DATA' }), { active: true, text: '数据已过期 31 分钟' })
  assert.deepEqual(staleView({ active: true, reason: 'UPSTREAM_UNAVAILABLE' }), { active: true, text: '数据来自 时间未知 · Paperclip 暂不可用' })
})

test('H2b hook stays client-only and fail-closed', () => {
  const ui = fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /id="staleBanner"[^>]*role="status"/)
  assert.match(ui, /export function staleView\(stale\)/)
  assert.match(ui, /dispatchBtn'\)\.disabled = !!s\.lan/)
  assert.match(ui, /if \(state\?\.lan\) modal\.querySelectorAll/)
  assert.doesNotMatch(ui, /if \(staleView\(state\?\.stale\)\.active\)/)
  assert.match(app, /detailDispatch'\)\.disabled = document\.body\.classList\.contains\('lan'\)/)
  assert.doesNotMatch(app, /detailDispatch'\)\.disabled = .*latestState\?\.stale\?\.active/)
  assert.doesNotMatch([ui, app, html].join('\n'), /\/state\?stale|stale\/state/)
})

test('successful review actions hide stale rows until the next state drops them', () => {
  const ui = fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  assert.match(ui, /const hiddenReviews = new Set\(\)/)
  assert.match(ui, /hiddenReviews\.add\(String\(issueId\)\)/)
  assert.match(ui, /if \(w\.kind === 'review' && hiddenReviews\.has\(String\(w\.issueId\)\)\) continue/)
  assert.match(ui, /for \(const issueId of hiddenReviews\) if \(!waitingReviews\.has\(issueId\)\) hiddenReviews\.delete\(issueId\)/)
})
