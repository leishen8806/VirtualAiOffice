import assert from 'node:assert/strict'
import test from 'node:test'
import { createQualityPolicy, initialQuality, qualityStartupPlan, takeQualityWork } from '../quality.js'

test('启动只构建当前需要的变体并只编译当前档位', () => {
  assert.deepEqual(qualityStartupPlan({ tier: 'low', source: 'url' }), { current: 'low', variants: ['low'], compile: ['low'], deferred: [], source: 'url' })
  assert.deepEqual(qualityStartupPlan({ tier: 'medium', source: 'storage' }).variants, ['medium'])
  assert.deepEqual(qualityStartupPlan({ tier: 'high', source: 'wall' }).variants, [])
  assert.deepEqual(qualityStartupPlan({ tier: 'medium', source: 'warmup' }).compile, ['medium'])
})

test('空闲阶段只补尚未构建的档位', () => {
  assert.deepEqual(qualityStartupPlan({ tier: 'low', idle: true }).deferred, ['medium'])
  assert.deepEqual(qualityStartupPlan({ tier: 'medium', idle: true }).deferred, ['low'])
  assert.deepEqual(qualityStartupPlan({ tier: 'high', idle: true }).deferred, ['low', 'medium'])
})

test('空闲调度在单步预算耗尽后保留余下工作', () => {
  const queue = ['low', 'medium', 'high'], done = []
  let time = 0
  const count = takeQualityWork(queue, item => { done.push(item); time += 9 }, { budgetMs: 8, now: () => time, timeRemaining: () => 8 })
  assert.equal(count, 1)
  assert.deepEqual(done, ['low'])
  assert.deepEqual(queue, ['medium', 'high'])
})

test('构建和编译造成的慢帧不进入预热统计', () => {
  const policy = createQualityPolicy({ selection: initialQuality(), signals: { cores: 16, memory: 16, gpu: 'discrete' } })
  for (const time of [0, 800, 1600]) policy.observe(800, time, false)
  for (let time = 1700; time < 7700; time += 16) policy.observe(16, time)
  policy.observe(16, 7700)
  assert.equal(policy.tier, 'high')
  assert.equal(policy.source, 'auto')
})
