import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

test('performance verifier waits for all 25 people and records blocked counters', () => {
  const source = fs.readFileSync(path.join(root, 'tools', 'verify', 'qv1-measure.mjs'), 'utf8')
  for (const key of ['views', 'replaced', 'visible', 'atSeat']) assert.match(source, new RegExp(`people\\.${key}`))
  assert.match(source, /Date\.now\(\) - t0 < 300000/)
  assert.match(source, /blockedOn/)
  assert.match(source, /process\.exitCode = 2/)
})

test('office high budget is the current 1.2M triangle ceiling', () => {
  const budgets = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'verify', 'budgets.json'), 'utf8'))
  assert.deepEqual(budgets.office.high, { calls: 300, triangles: 1200000 })
})

test('warehouse readiness does not wait for office people counters', () => {
  const source = fs.readFileSync(path.join(root, 'tools', 'verify', 'qv1-measure.mjs'), 'utf8')
  assert.match(source, /const peopleReady = place !== 'drlife-office' \|\| \(lastState\.people\.views >= 25/)
  const ci = fs.readFileSync(path.join(root, '..', '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(ci, /Office performance report \(local-only; CI skipped\)/)
  assert.match(ci, /if:\s*\$\{\{ false \}\}/)
})
