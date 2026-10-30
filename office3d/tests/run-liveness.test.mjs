import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STALL_MS, latestHeartbeatByAgent, runStatus } from '../run-liveness.mjs'

const now = Date.parse('2026-10-30T03:00:00.000Z')

test('uses the advancing heartbeat-run timestamp, not a stale agent timestamp', () => {
  const heartbeat = { agentId: 'Frontend1', status: 'running', updatedAt: '2026-10-30T02:42:15.863Z' }
  assert.equal(runStatus(heartbeat, now).kind, 'running')
})

test('allows known long checks but reports a running heartbeat with no progress for 90 minutes', () => {
  assert.equal(STALL_MS, 90 * 60 * 1000)
  assert.equal(runStatus({ status: 'running', updatedAt: '2026-10-30T01:29:59.999Z' }, now).kind, 'stalled')
})

test('reports an ended latest heartbeat even if an agent record still says running', () => {
  const latest = latestHeartbeatByAgent([
    { agentId: 'Frontend1', status: 'running', updatedAt: '2026-10-30T02:10:00.000Z' },
    { agentId: 'Frontend1', status: 'cancelled', updatedAt: '2026-10-30T02:50:00.000Z' },
  ])
  assert.equal(runStatus(latest.get('Frontend1'), now).kind, 'ended')
})
