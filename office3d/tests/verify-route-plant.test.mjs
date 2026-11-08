import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

test('route plant verifier reports no current-route collisions', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const probe = path.join(root, 'tools', 'verify', 'qv1-route-plant-probe.mjs')
  const run = spawnSync(process.execPath, [probe], { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), '')
})
