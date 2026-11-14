import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createStateTiming } from '../state-timing.mjs'

test('计时开关关闭时不写文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-timing-'))
  const file = path.join(dir, 'timings.log')
  const timing = createStateTiming({ enabled: false, file })
  const run = timing.start()
  await run.measure('ignored', async () => 1)
  run.finish()
  assert.equal(fs.existsSync(file), false)
})

test('计时开关打开时记录阶段、并发计数并轮转', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-timing-'))
  const file = path.join(dir, 'timings.log')
  const timing = createStateTiming({ enabled: true, file, maxBytes: 200, now: () => '2026-11-14T09:00:00.000Z' })
  const endState = timing.request('/state')
  const endAct = timing.request('/act')
  const run = timing.start()
  await run.measure('healthReport', async () => 1)
  run.record('fileWrite.stateSnapshot', { ms: 2, count: 1 })
  endState(); endAct()
  run.finish()
  timing.record('serialize', { ms: 1, bytes: 42 })
  timing.close()
  assert.ok(fs.existsSync(file))
  assert.ok(fs.existsSync(file + '.1'))
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(rows.every(row => !JSON.stringify(row).includes('timings.log')))
  assert.ok(rows.some(row => row.stages?.some(stage => stage.name === 'serialize')))
})
