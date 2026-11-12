import test from 'node:test';
import assert from 'node:assert/strict';
import { createOaStaffSync, assignWorkstations } from '../oa-staff-sync.mjs';

const base = 'http://127.0.0.1:4392';
const departments = Array.from({ length: 5 }, (_, i) => ({ id: `dept_${i + 1}`, name: `测试部门${i + 1}`, status: 'ACTIVE', updatedAt: '2026-11-11T10:00:00.000Z' }));
const members = Array.from({ length: 20 }, (_, i) => ({ id: `test_employee_${String(i + 1).padStart(2, '0')}`, name: `测试员工${i + 1}`, departmentId: departments[i % 5].id, department: departments[i % 5].name, positionId: `position_${(i % 5) + 1}`, position: `测试岗位${(i % 5) + 1}`, employmentStatus: 'ACTIVE', updatedAt: '2026-11-11T10:00:00.000Z' }));
const attendance = members.map((member, i) => ({ employeeId: member.id, status: ['WORKING', 'OFF_WORK', 'LEAVE', 'OUT_OF_OFFICE', 'BUSINESS_TRIP'][i % 5], statusUpdatedAt: '2026-11-11T10:00:00.000Z' }));
const tasks = new Map();
const fakeFetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.pathname.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  if (url.pathname.endsWith('/members')) return new Response(JSON.stringify({ items: members }), { status: 200 });
  if (url.pathname.endsWith('/departments')) return new Response(JSON.stringify({ items: departments }), { status: 200 });
  if (url.pathname.endsWith('/attendance/status')) return new Response(JSON.stringify({ items: attendance }), { status: 200 });
  if (url.pathname.endsWith('/approvals')) return new Response(JSON.stringify({ items: [{ id: 'approval_1', title: '测试审批', fields: { internal: 'hidden' } }] }), { status: 200 });
  if (url.pathname.endsWith('/tasks') && options.method === 'POST') {
    const body = JSON.parse(options.body);
    const existing = tasks.get(body.externalId);
    if (existing) return new Response(JSON.stringify({ created: false, task: existing }), { status: 200 });
    const task = { ...body, id: `task_${tasks.size + 1}` };
    tasks.set(body.externalId, task);
    return new Response(JSON.stringify({ created: true, task }), { status: 201 });
  }
  if (url.pathname.endsWith('/tasks')) return new Response(JSON.stringify({ total: tasks.size, page: 0, pageSize: 200, items: [...tasks.values()] }), { status: 200 });
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
};

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
