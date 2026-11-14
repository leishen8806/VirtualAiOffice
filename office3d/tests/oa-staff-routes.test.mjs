import test from 'node:test'
import assert from 'node:assert/strict'
import { createOaStaffRoutes } from '../oa-staff-routes.mjs'

function fixture(enabled = true) {
  let calls = 0
  const sync = {
    canViewAttendance: identity => identity?.id === 'board',
    syncAll: async () => { calls++; return { enabled, unavailable: calls > 1 } },
    snapshot: () => ({ members: [{ id: 'm1' }], departments: [{ id: 'd1' }], attendance: [{ employeeId: 'm1', status: 'WORKING' }], updatedAt: '2026-11-14T04:00:00Z' }),
  }
  const routes = createOaStaffRoutes({ enabled, sync, assignWorkstations: (members, slots) => members.map(member => ({ ...member, workstation: slots[member.departmentId] || null })) })
  return { routes, sync, get calls() { return calls } }
}

test('disabled routes make no OA request', async () => {
  const f = fixture(false)
  const reply = await f.routes.handle({ path: '/oa/staff/members' })
  assert.equal(reply.status, 404)
  assert.equal(f.calls, 0)
})

test('read routes and attendance permission are bounded', async () => {
  const f = fixture()
  assert.equal((await f.routes.handle({ path: '/oa/staff/members' })).status, 200)
  assert.equal((await f.routes.handle({ path: '/oa/staff/workstations' })).body.items[0].workstation, null)
  assert.equal((await f.routes.handle({ path: '/oa/staff/attendance', identity: { id: 'guest' } })).status, 403)
  const board = await f.routes.handle({ path: '/oa/staff/attendance', identity: { id: 'board' } })
  assert.equal(board.status, 200)
  assert.equal(board.body.unavailable, true)
  assert.equal(board.body.message, 'OA 暂不可用')
  assert.equal((await f.routes.handle({ method: 'POST', path: '/oa/staff/members' })).status, 405)
})
