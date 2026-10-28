import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { runAlive, shouldBlockCancel } from '../run-liveness.mjs'

const startedAt = '2026-10-28T08:00:00.000Z'
const run = { processPid: 100, processStartedAt: startedAt }
const table = (rows) => rows.map(([pid, parentPid, name, createdAt = '2026-10-28T08:01:00.000Z']) => ({ pid, parentPid, name, createdAt }))

test('root process is alive through its pid', () => {
  assert.deepEqual(runAlive(run, table([[100, 1, 'node.exe']]), () => true), {
    alive: true, via: 'pid', descendants: [],
  })
})

test('a live child keeps a run alive after its shell exits', () => {
  const liveness = runAlive(run, table([[14480, 100, 'claude.exe']]), () => false)
  assert.equal(liveness.alive, true)
  assert.equal(liveness.via, 'descendant')
  assert.deepEqual(liveness.descendants, [{ pid: 14480, name: 'claude.exe' }])
  assert.equal(shouldBlockCancel(liveness), true)
})

test('a live grandchild keeps a run alive', () => {
  const liveness = runAlive(run, table([[101, 100, 'cmd.exe'], [102, 101, 'claude.exe']]), () => false)
  assert.equal(liveness.alive, true)
  assert.equal(liveness.via, 'descendant')
  assert.deepEqual(liveness.descendants, [{ pid: 101, name: 'cmd.exe' }, { pid: 102, name: 'claude.exe' }])
})

test('a dead process tree is not alive and may be cancelled', () => {
  const liveness = runAlive(run, [], () => false)
  assert.deepEqual(liveness, { alive: false, via: null, descendants: [] })
  assert.equal(shouldBlockCancel(liveness), false)
})

test('a descendant older than the run is ignored to avoid pid reuse', () => {
  const liveness = runAlive(run, table([[14480, 100, 'claude.exe', '2026-10-28T07:59:59.999Z']]), () => false)
  assert.deepEqual(liveness, { alive: false, via: null, descendants: [] })
})

test('a missing process table preserves the prior pid check', () => {
  assert.deepEqual(runAlive(run, null, () => true), { alive: true, via: 'pid', descendants: [] })
  assert.deepEqual(runAlive(run, null, () => false), { alive: false, via: null, descendants: [] })
})

test('server wires non-blocking liveness and refuses only orphan-producing cancels', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const source = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8')
  assert.match(source, /import \{ readProcessTable, runAlive, shouldBlockCancel \} from '\.\/run-liveness\.mjs'/)
  assert.match(source, /const processTable = await readProcessTable\(\{ wait: false \}\)/)
  assert.match(source, /alive: liveness\.alive, via: liveness\.via/)
  assert.match(source, /if \(shouldBlockCancel\(liveness\)\) \{[\s\S]*?status: 409/)
})
