import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { runAlive, runBusy, shouldBlockCancel } from '../run-liveness.mjs'

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

test('a descendant with at least one second of CPU growth marks a run busy', () => {
  const previous = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 10 }))
  const current = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 11 }))
  assert.deepEqual(runBusy(run, previous, current), { busy: true, busyName: 'node.exe' })
})

test('a descendant with less than one second of CPU growth is not busy', () => {
  const previous = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 10 }))
  const current = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 10.999 }))
  assert.deepEqual(runBusy(run, previous, current), { busy: false, busyName: null })
})

test('conhost CPU growth does not mark a run busy', () => {
  const previous = table([[101, 100, 'conhost.exe']]).map((row) => ({ ...row, cpuSeconds: 10 }))
  const current = table([[101, 100, 'conhost.exe']]).map((row) => ({ ...row, cpuSeconds: 20 }))
  assert.deepEqual(runBusy(run, previous, current), { busy: false, busyName: null })
})

test('busy descendants are detected while the outer shell remains alive', () => {
  const previous = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 1 }))
  const current = table([[101, 100, 'node.exe']]).map((row) => ({ ...row, cpuSeconds: 2 }))
  assert.deepEqual(runBusy(run, previous, current), { busy: true, busyName: 'node.exe' })
})

test('busy descendants are detected after the outer shell exits', () => {
  const previous = table([[101, 100, 'chrome-headless-shell.exe']]).map((row) => ({ ...row, cpuSeconds: 1 }))
  const current = table([[101, 100, 'chrome-headless-shell.exe']]).map((row) => ({ ...row, cpuSeconds: 2 }))
  assert.equal(runAlive(run, current, () => false).via, 'descendant')
  assert.deepEqual(runBusy(run, previous, current), { busy: true, busyName: 'chrome-headless-shell.exe' })
})

test('a descendant created before the run is not considered busy', () => {
  const previous = table([[101, 100, 'node.exe', '2026-10-28T07:59:59.999Z']]).map((row) => ({ ...row, cpuSeconds: 1 }))
  const current = table([[101, 100, 'node.exe', '2026-10-28T07:59:59.999Z']]).map((row) => ({ ...row, cpuSeconds: 20 }))
  assert.deepEqual(runBusy(run, previous, current), { busy: false, busyName: null })
})

test('a missing prior process table does not mark a run busy', () => {
  assert.deepEqual(runBusy(run, null, table([[101, 100, 'node.exe']])), { busy: false, busyName: null })
})

test('the panel status distinguishes residual, busy, stalled, and running runs', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  const match = source.match(/\/\* RUN_STATUS_START \*\/([\s\S]*?)\/\* RUN_STATUS_END \*\//)
  assert.ok(match, 'app.js must expose the panel status decision as a testable pure function')
  const context = { STALL_MS: 5 * 60_000 }
  vm.runInNewContext(match[1], context)
  const status = context.runStatus
  assert.equal(status({ alive: false }, 6 * 60_000).kind, 'residual')
  assert.equal(status({ alive: true, busy: true, busyName: 'node.exe' }, 6 * 60_000).kind, 'busy')
  assert.equal(status({ alive: true, busy: true, busyName: 'node.exe' }, 60 * 60_000).kind, 'stall')
  assert.equal(status({ alive: true, busy: false }, 60_000).kind, 'running')
})

test('server wires non-blocking liveness and refuses only orphan-producing cancels', () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const source = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8')
  assert.match(source, /import \{ readProcessTable, readProcessTables, runAlive, runBusy, shouldBlockCancel \} from '\.\/run-liveness\.mjs'/)
  assert.match(source, /const processTables = await readProcessTables\(\{ wait: false \}\)/)
  assert.match(source, /busy: busy\.busy, busyName: busy\.busyName/)
  assert.match(source, /if \(shouldBlockCancel\(liveness\)\) \{[\s\S]*?status: 409/)
})
