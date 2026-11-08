import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

test('route plant verifier reports no current-route collisions', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const probe = path.join(root, 'tools', 'verify', 'qv1-route-plant-probe.mjs')
  const run = spawnSync(process.execPath, [probe], { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout.trim(), '')
})

test('route plant verifier reports an injected route collision', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const probe = path.join(root, 'tools', 'verify', 'qv1-route-plant-probe.mjs')
  const source = fs.readFileSync(probe, 'utf8')
  const injected = source.replace(
    'const layout = createOfficeR1Layout()',
    "const base = createOfficeR1Layout(); const plant = r1DensePlan(base).plants[0]; const layout = { ...base, r1: { ...base.r1, routes: base.r1.routes.map((route, index) => index === 0 ? { ...route, points_m: [[plant.x + 26, 18 - plant.z], [plant.x + 26 + .1, 18 - plant.z]] } : route) } }"
  )
  const file = path.join(root, 'tools', 'verify', '.tmp-route-probe.mjs')
  fs.writeFileSync(file, injected)
  const run = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8' })
  fs.unlinkSync(file)
  assert.equal(run.status, 0, run.stderr)
  assert.notEqual(run.stdout.trim(), '')
})
