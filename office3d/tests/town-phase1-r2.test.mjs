import assert from 'node:assert/strict'
import test from 'node:test'
import { readTrialResult, trialAccessStatus } from '../town/phase1-r2-readonly.mjs'

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
