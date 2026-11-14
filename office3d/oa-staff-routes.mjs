export function createOaStaffRoutes({ enabled, sync, assignWorkstations }) {
  const paths = new Set(['/oa/staff/members', '/oa/staff/departments', '/oa/staff/workstations', '/oa/staff/attendance'])
  const json = (status, body) => ({ status, body })
  return {
    paths,
    async handle({ method = 'GET', path, identity = null } = {}) {
      if (!paths.has(path)) return null
      if (method !== 'GET') return json(405, { error: '不支持' })
      if (!enabled) return json(404, { enabled: false, error: 'OA 未开启' })
      if (path === '/oa/staff/attendance' && !sync.canViewAttendance(identity)) return json(403, { error: '仅董事会可查看在岗状态' })
      const result = await sync.syncAll()
      const common = { enabled: true, updatedAt: sync.snapshot().updatedAt, ...(result.unavailable ? { unavailable: true, message: 'OA 暂不可用' } : {}) }
      const snapshot = sync.snapshot()
      if (path === '/oa/staff/members') return json(200, { ...common, items: snapshot.members })
      if (path === '/oa/staff/departments') return json(200, { ...common, items: snapshot.departments })
      if (path === '/oa/staff/workstations') return json(200, { ...common, items: assignWorkstations(snapshot.members, {}) })
      return json(200, { ...common, items: snapshot.attendance })
    },
  }
}
