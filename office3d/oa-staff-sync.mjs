const DEFAULT_BASE = 'http://127.0.0.1:4392';
const OFFICIAL_BASE = 'https://api.workline.ink';
const TEST_TENANT = 'tenant_oa_api_test_20261112';

function stripFields(value) {
  if (Array.isArray(value)) return value.map(stripFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'fields').map(([k, v]) => [k, stripFields(v)]));
}

function safeError(error) {
  const text = String(error?.message || error).replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>');
  return text.replace(/[A-Za-z0-9_-]{24,}/g, '<redacted>');
}

export function assignWorkstations(members, slotsByDepartment = {}) {
  const used = new Map();
  return members.map((member) => {
    const slots = slotsByDepartment[member.departmentId] || slotsByDepartment[member.department] || [];
    const index = used.get(member.departmentId || member.department) || 0;
    used.set(member.departmentId || member.department, index + 1);
    return { ...member, workstation: slots[index] ?? null };
  });
}

export function createOaStaffSync({
  enabled = false,
  baseUrl = DEFAULT_BASE,
  apiKey,
  apiKeyFile,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  boardActorId = 'board',
  adminIds = [],
  allowExternalWrites = false,
  auditLog = () => {}
} = {}) {
  const state = { members: [], departments: [], attendance: [], tasks: new Map(), writes: [] };
  const hourMs = 60 * 60 * 1000;
  const normalizedBase = String(baseUrl).replace(/\/$/, '');
  const localFake = normalizedBase === DEFAULT_BASE;
  const official = normalizedBase === OFFICIAL_BASE;
  const allowedBase = localFake || official;
  let cache = { at: 0, updatedAfter: null, result: null };
  let lastSuccessAt = null;
  async function key() {
    if (apiKey) return apiKey;
    if (apiKeyFile) {
      const { readFile } = await import('node:fs/promises');
      const parsed = JSON.parse(await readFile(apiKeyFile, 'utf8'));
      return parsed.apiKey || parsed.API_KEY || parsed.key;
    }
    return undefined;
  }
  async function request(path, options = {}) {
    if (!enabled) return { disabled: true };
    if (!allowedBase) throw new Error('OA 地址不在允许白名单');
    const headers = { accept: 'application/json', ...(options.headers || {}) };
    const token = await key();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${baseUrl}${path}`, { ...options, headers });
    const body = await response.json();
    if (!response.ok) throw new Error(`OA ${response.status}: ${body?.error || response.statusText}`);
    if (official) {
      const tenantId = body?.tenantId || body?.tenant?.id || body?.meta?.tenantId;
      if (tenantId !== TEST_TENANT) throw new Error('OA 租户不匹配');
    }
    return { status: response.status, body };
  }
  async function safeGet(path) {
    try { return await request(path); } catch (error) { return { error: safeError(error) }; }
  }
  async function syncMembers({ updatedAfter } = {}) {
    const query = updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : '';
    const result = await safeGet(`/api/external/v1/members${query}`);
    if (result.body?.items) state.members = result.body.items;
    return result;
  }
  async function syncDepartments() {
    const result = await safeGet('/api/external/v1/departments');
    if (result.body?.items) state.departments = result.body.items;
    return result;
  }
  async function syncAttendance() {
    const result = await safeGet('/api/external/v1/attendance/status');
    if (result.body?.items) state.attendance = result.body.items.map((item) => ({ employeeId: item.employeeId, status: item.status, statusUpdatedAt: item.statusUpdatedAt }));
    return result;
  }
  async function syncAll({ updatedAfter } = {}) {
    if (!enabled) return { enabled: false };
    if (!allowedBase) return { enabled: true, unavailable: true, error: 'OA 地址不在允许白名单' };
    const requestedAfter = updatedAfter || lastSuccessAt;
    if (cache.result && now() - cache.at < 60 * 1000 && (!updatedAfter || cache.updatedAfter === updatedAfter)) return cache.result;
    const result = { enabled: true, health: await safeGet('/api/external/v1/health'), members: await syncMembers({ updatedAfter: requestedAfter }), departments: await syncDepartments(), attendance: await syncAttendance() };
    const failed = Object.values(result).some((item) => item?.error);
    if (!failed) {
      lastSuccessAt = new Date(now()).toISOString();
      cache = { at: now(), updatedAfter: requestedAfter, result };
    } else {
      result.unavailable = true;
      result.fallback = true;
      result.oaUnavailable = 'OA 暂不可用';
    }
    return result;
  }
  async function listTasks() { const result = await safeGet('/api/external/v1/tasks?page=0&pageSize=200'); return result; }
  async function listApprovals() { const result = await safeGet('/api/external/v1/approvals?page=0&pageSize=200'); if (result.body) result.body = stripFields(result.body); return result; }
  async function createTask(input) {
    if (!enabled) return { enabled: false };
    if (!allowExternalWrites && !/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)) throw new Error('OA external writes are disabled outside the local fake OA');
    const cutoff = now() - hourMs;
    state.writes = state.writes.filter((entry) => entry.at >= cutoff);
    if (state.writes.filter((entry) => entry.assigneeId === input.assigneeId).length >= 5) throw new Error('OA task rate limit exceeded');
    const body = { ...input, source: 'virtual-ai-office' };
    const result = await request('/api/external/v1/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    state.writes.push({ assigneeId: input.assigneeId, at: now() });
    auditLog({ action: 'oa.task.create', externalId: input.externalId, assigneeId: input.assigneeId, status: result.status });
    return result;
  }
  function canViewAttendance(identity) {
    return Boolean(identity && (identity.id === boardActorId || adminIds.includes(identity.id)));
  }
  function visibleAttendance(identity) { return canViewAttendance(identity) ? state.attendance.map(({ employeeId, status, statusUpdatedAt }) => ({ employeeId, status, statusUpdatedAt })) : []; }
  function snapshot() {
    return { members: state.members, departments: state.departments, attendance: visibleAttendance({ id: boardActorId }), updatedAt: lastSuccessAt };
  }
  return { state, syncMembers, syncDepartments, syncAttendance, syncAll, snapshot, listTasks, listApprovals, createTask, canViewAttendance, visibleAttendance, assignWorkstations: (members, slots) => assignWorkstations(members, slots) };
}

export { DEFAULT_BASE, OFFICIAL_BASE, TEST_TENANT, stripFields };
