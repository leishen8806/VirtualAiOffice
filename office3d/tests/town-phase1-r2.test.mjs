import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readTrialResult, trialAccessStatus } from '../town/phase1-r2-readonly.mjs'

const config = JSON.parse(await readFile(new URL('../town/town-config.json', import.meta.url), 'utf8'))
const input = JSON.parse(await readFile(new URL('../town/phase1-r2-input.json', import.meta.url), 'utf8'))

test('R2 reads participation from input state and exposes high/mid/low synthetic coefficients', () => {
  const result = readTrialResult()
  assert.equal(result.schema, 'town-econ-phase1-r2-result')
  assert.equal(result.includedCount, 24)
  assert.equal(result.excludedCount, 6)
  assert.equal(result.realData, false)
  assert.equal(result.jobs.some((job) => job.agent === 'Backend2'), true)
  assert.ok(new Set(result.jobs.map((job) => job.payslip.coefficient.value)).size >= 3)
  assert.equal(result.ledger, null)
})

test('R2 trial access is local-only', () => {
  assert.equal(trialAccessStatus({}), 200)
  assert.equal(trialAccessStatus({ lanUser: true }), 403)
  assert.equal(trialAccessStatus({ wallScope: true }), 403)
})

test('R2 active sample roles have their declared tier in config', () => {
  const active = input.jobs.filter((job) => job.state === 'active')
  const missing = active.filter((job) => !config.tiers[config.roles[job.agent]]).map((job) => job.agent)
  assert.deepEqual(missing, [], `未登记岗位：${missing.join('、')}`)
  for (const job of active) assert.equal(config.roles[job.agent], job.tier, job.agent)
})
