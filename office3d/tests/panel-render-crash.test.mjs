import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function poll()')
const end = source.indexOf('\nfunction resize', start)
if (start < 0 || end < 0) throw new Error('poll function not found')
const pollSource = source.slice(start, end)

function fixture({ fetchError = null, applyErrors = ['seat measurement failed'] } = {}) {
  const elements = {
    loading: { classList: { add() {} } },
    conn: { className: 'dot live' },
    connText: { textContent: '实时 · 每 3 秒刷新' },
    err: { style: { display: 'none' }, textContent: '' },
  }
  let applyCalls = 0
  const context = {
    fetch: async () => {
      if (fetchError) throw new Error(fetchError)
      return { ok: true, status: 200, json: async () => ({ agents: [{ id: 'one' }] }) }
    },
    applyState: () => {
      const message = applyErrors[applyCalls++]
      if (message) throw new Error(message)
    },
    $: id => elements[id],
    setText: (id, value) => { elements[id].textContent = value },
    snapshot() {}, mergeStatic() {}, scene: {}, sceneQuality: {}, startupQualityPlan: { current: 'low' }, applyQuality() {}, qualityMetrics: {}, performance: { now: () => 0 }, APP_STARTED: 0, qualityStartupPlan: () => ({ deferred: [] }), window: {}, takeQualityWork() {}, setTimeout() {}, console,
  }
  vm.runInNewContext(`${pollSource}\nthis.poll = poll`, context)
  context.poll.merged = true
  return { context, elements, get applyCalls() { return applyCalls } }
}

test('PANEL-RENDER-CRASH keeps the data connection live when rendering fails and retries next poll', async () => {
  const f = fixture()
  await f.context.poll()
  assert.equal(f.elements.conn.className, 'dot live')
  assert.notEqual(f.elements.connText.textContent, '断开')
  assert.match(f.elements.err.textContent, /^画面更新出错：seat measurement failed$/)
  assert.doesNotMatch(f.elements.err.textContent, /Paperclip|3100/)
  await f.context.poll()
  assert.equal(f.applyCalls, 2)
  assert.equal(f.elements.err.style.display, 'none')
  assert.equal(f.elements.connText.textContent, '实时 · 每 3 秒刷新')
})

test('PANEL-RENDER-CRASH reserves the Paperclip disconnected message for fetch failures', async () => {
  const f = fixture({ fetchError: 'network down', applyErrors: [] })
  await f.context.poll()
  assert.equal(f.elements.conn.className, 'dot off')
  assert.equal(f.elements.connText.textContent, '断开')
  assert.match(f.elements.err.textContent, /^读取 Paperclip 数据失败：network down/)
})
