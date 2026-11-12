import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildReadOnlyResult } from '../town/phase1-r1-readonly.mjs'

const input = JSON.parse(await readFile(new URL('../town/phase1-r1-input.json', import.meta.url), 'utf8'))
const config = JSON.parse(await readFile(new URL('../town/town-config.json', import.meta.url), 'utf8'))

test('R1 builds a 30-role synthetic read-only result without a ledger', () => {
  const result = buildReadOnlyResult(input, config)
  assert.equal(result.roleCount, 30)
  assert.equal(result.includedCount, 23)
  assert.equal(result.excludedCount, 7)
  assert.deepEqual(result.excludedJobs.map(({ agent }) => agent), ['Go1', 'Go2', 'Backend2', 'OpsEngineer', 'GoSenior', 'GoSenior2', 'Reviewer3'])
  assert.equal(result.ledger, null)
  assert.equal(result.realData, false)
  assert.ok(Number.isInteger(result.totals.payrollCents))
})
