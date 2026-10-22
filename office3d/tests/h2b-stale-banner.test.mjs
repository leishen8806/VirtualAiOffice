import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { staleView } from '../ui.js'

test('H2b stale banner uses server age and disables writes', () => {
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
  assert.match(ui, /staleView\(state\?\.stale\)\.active/)
  assert.match(ui, /dispatchBtn'\)\.disabled = !!s\.lan \|\| stale\.active/)
  assert.match(app, /detailDispatch'\)\.disabled = .*latestState\?\.stale\?\.active/)
  assert.doesNotMatch([ui, app, html].join('\n'), /\/state\?stale|stale\/state/)
})
