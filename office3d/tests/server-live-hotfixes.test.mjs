import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createMemory } from '../memory.mjs'
import { createWorkload } from '../workload.mjs'

// 2026-10-30 线上 3200 的三处热修入库：有界缓存与优雅退出（server.mjs）、工作量视图缓存（workload.mjs）、
// 记忆库启动巡检失败不拖垮服务（memory.mjs）。

const serverSource = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')

test('HF-1 /state 轮询用到的四个任务级缓存都有上限，不会随看板历史无限增长', () => {
  for (const cache of ['blockedTypeCache', 'issueCache', 'interactionCache', 'policyCache']) {
    assert.doesNotMatch(serverSource, new RegExp(`\\b${cache}\\.set\\(`), `${cache} 不应再直接 set`)
    assert.match(serverSource, new RegExp(`boundedCacheSet\\(${cache}, `), `${cache} 应经 boundedCacheSet 写入`)
  }
  const bounded = serverSource.match(/function boundedCacheSet\(cache, key, value, limit\) \{[\s\S]*?\n\}/)
  assert.ok(bounded, '缺少 boundedCacheSet')
  const boundedCacheSet = new Function(`${bounded[0]}; return boundedCacheSet`)()
  const cache = new Map()
  for (let i = 0; i < 10; i++) boundedCacheSet(cache, `k${i}`, i, 3)
  assert.deepEqual([...cache.keys()], ['k7', 'k8', 'k9'])
  boundedCacheSet(cache, 'k7', 70, 3)
  assert.deepEqual([...cache.entries()], [['k8', 8], ['k9', 9], ['k7', 70]], '再次写入同一键应移到最新')
})

test('HF-2 收到 SIGINT / SIGTERM / pm2 shutdown 时先关监听端口再退出，避免旧进程占着 3200', () => {
  assert.match(serverSource, /const server = http\s*\n?\s*\.createServer/)
  assert.match(serverSource, /server\.close\(\(\) => process\.exit\(0\)\)/)
  assert.match(serverSource, /setTimeout\(\(\) => process\.exit\(1\), 5000\)\.unref\(\)/)
  for (const signal of ['SIGINT', 'SIGTERM']) assert.match(serverSource, new RegExp(`process\\.once\\('${signal}', shutdown\\)`))
  assert.match(serverSource, /message === 'shutdown'/)
})

test('HF-3 /state 响应按访问范围分别缓存 1 秒', () => {
  assert.match(serverSource, /const cacheKey = wallScope \? 'wall' : lanUser \? 'lan' : 'local'/)
  assert.match(serverSource, /Date\.now\(\) - cached\.at < 1000/)
})

test('HF-4 工作量视图 60 秒内复用、返回独立副本，采集后失效', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workload-hotfix-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.writeFileSync(path.join(dir, 'workload.json'), JSON.stringify({ enabled: true }))
  const workhoursFile = path.join(dir, 'hours.json')
  fs.writeFileSync(workhoursFile, JSON.stringify({ timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }))
  let ms = Date.parse('2026-10-29T10:00:00+07:00'), statsCalls = 0
  const w = createWorkload({ dir, company: 'c', workhoursFile, get: async () => [], stats: () => { statsCalls++; return { runs: {}, done: {}, comments: {} } }, dutyOn: () => true, notify: async () => {}, now: () => ms })
  t.after(() => w.stop())
  const first = w.view(), callsAfterFirst = statsCalls
  assert.ok(!first.error, `视图不应走错误分支：${first.error}`)
  first.suggestionCount = 999
  const second = w.view()
  assert.equal(statsCalls, callsAfterFirst, '60 秒内不应重新计算')
  assert.notEqual(second, first); assert.notEqual(second.suggestionCount, 999, '缓存值不能被调用方改坏')
  ms += 60001
  w.view()
  assert.ok(statsCalls > callsAfterFirst, '超过 60 秒应重新计算')
})

test('HF-5 记忆库启动巡检抛错时服务继续启动，并给出可读提示', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-hotfix-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const kb = path.join(dir, 'knowledge'); fs.mkdirSync(path.join(kb, '记忆', '项目'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'memory.json'), JSON.stringify({ enabled: true, reviewIssue: null }))
  fs.writeFileSync(path.join(kb, '记忆', '项目', 'x.md'), '---\ntitle: x\n---\n')
  const readFile = p => { if (p.endsWith('.md')) throw new Error('EIO simulated'); return fs.readFileSync(p, 'utf8') }
  const mem = createMemory({ dir, kbDir: kb, company: 'c', get: async () => [], send: async () => {}, dutyOn: () => true, now: () => Date.parse('2026-10-30T09:00:00+07:00'), readFile })
  t.after(() => mem.stop())
  assert.doesNotThrow(() => mem.start())
})
