import test from 'node:test';
import assert from 'node:assert/strict';
import { createOaStaffSync, assignWorkstations } from '../oa-staff-sync.mjs';

const base = 'http://127.0.0.1:4392';
const fakeFetch = globalThis.fetch;

test('feature is disabled by default', async () => {
  const sync = createOaStaffSync();
  assert.deepEqual(await sync.syncAll(), { enabled: false });
});

test('fake OA sync maps members, departments and attendance', async () => {
  const sync = createOaStaffSync({ enabled: true, baseUrl: base, fetchImpl: fakeFetch });
  const result = await sync.syncAll({ updatedAfter: '2026-11-11T00:00:00.000Z' });
  assert.equal(result.health.status, 200);
  assert.equal(result.members.body.items.length, 20);
  assert.equal(result.departments.body.items.length, 5);
  assert.equal(result.attendance.body.items.length, 20);
  assert.equal(new Set(sync.state.attendance.map((x) => x.status)).size, 5);
});

test('approvals never expose fields and duplicate task is idempotent', async () => {
  const sync = createOaStaffSync({ enabled: true, baseUrl: base, fetchImpl: fakeFetch, boardActorId: 'board' });
  await sync.syncAll();
  const approvals = await sync.listApprovals();
  assert.equal('fields' in approvals.body.items[0], false);
  const task = { externalId: 'oa-test-idem-1', title: '测试任务', assigneeId: 'test_employee_01', collaboratorIds: ['test_employee_02'] };
  const first = await sync.createTask(task);
  const second = await sync.createTask(task);
  assert.equal(first.status, 201); assert.equal(first.body.created, true);
  assert.equal(second.status, 200); assert.equal(second.body.created, false);
});

test('attendance visibility and department workstation assignment', async () => {
  const sync = createOaStaffSync({ enabled: true, baseUrl: base, fetchImpl: fakeFetch, boardActorId: 'board', adminIds: [] });
  await sync.syncAttendance();
  assert.equal(sync.visibleAttendance({ id: 'guest' }).length, 0);
  assert.equal(sync.visibleAttendance({ id: 'board' }).length, 20);
  const assigned = assignWorkstations([{ id: 'a', departmentId: 'd1' }, { id: 'b', departmentId: 'd1' }], { d1: ['desk-1', 'desk-2'] });
  assert.deepEqual(assigned.map((x) => x.workstation), ['desk-1', 'desk-2']);
});
