import test from 'node:test'
import assert from 'node:assert/strict'
import { keepFullscreenAwake } from '../screen-awake.js'

const flush = () => new Promise(resolve => setImmediate(resolve))
function setup(request) {
  const doc = new EventTarget()
  Object.assign(doc, { fullscreenElement: null, visibilityState: 'visible', documentElement: { dataset: {} }, defaultView: new EventTarget() })
  const locks = [], calls = []
  const nav = { wakeLock: { request: request || (async type => {
    calls.push(type)
    const lock = new EventTarget(); lock.released = false
    lock.release = async () => { lock.released = true; lock.dispatchEvent(new Event('release')) }
    locks.push(lock); return lock
  }) } }
  const stop = keepFullscreenAwake({ doc, nav })
  const full = value => { doc.fullscreenElement = value ? {} : null; doc.dispatchEvent(new Event('fullscreenchange')) }
  return { doc, nav, locks, calls, stop, full }
}
test('仅全屏请求常亮，退出后释放', async () => {
  const f = setup(); assert.equal(f.calls.length, 0)
  f.full(true); await flush(); assert.deepEqual(f.calls, ['screen']); assert.equal(f.doc.documentElement.dataset.screenAwake, 'active')
  f.full(false); await flush(); assert.equal(f.locks[0].released, true); assert.equal(f.doc.documentElement.dataset.screenAwake, 'off'); await f.stop()
})
test('页面隐藏释放，回到全屏页面重新申请', async () => {
  const f = setup(); f.full(true); await flush()
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange')); await flush(); assert.ok(f.locks[0].released)
  f.doc.visibilityState = 'visible'; f.doc.dispatchEvent(new Event('visibilitychange')); await flush(); assert.equal(f.calls.length, 2); await f.stop()
})
test('重复事件不重复请求，待请求期间退出不能留下常亮', async () => {
  let resolve, calls = 0
  const lock = new EventTarget(); lock.release = async () => { lock.released = true }
  const f = setup(() => { calls++; return new Promise(r => { resolve = r }) })
  f.full(true); f.full(true); assert.equal(calls, 1); f.full(false); resolve(lock); await flush(); assert.ok(lock.released); await f.stop()
})
test('不支持、被拒绝均明确提示，不让页面崩溃', async () => {
  const f = setup(); delete f.nav.wakeLock; f.full(true); await flush(); assert.equal(f.doc.documentElement.dataset.screenAwake, 'unsupported'); await f.stop()
  const g = setup(async () => { throw Error('denied') }); g.full(true); await flush(); assert.equal(g.doc.documentElement.dataset.screenAwake, 'denied'); await g.stop()
})
test('系统主动释放时显示未保持，不循环争抢锁', async () => {
  const f = setup(); f.full(true); await flush(); await f.locks[0].release(); assert.equal(f.doc.documentElement.dataset.screenAwake, 'released'); assert.equal(f.calls.length, 1); await f.stop()
})
test('清理后不再请求', async () => {
  const f = setup(); await f.stop(); f.full(true); await flush(); assert.equal(f.calls.length, 0)
})
