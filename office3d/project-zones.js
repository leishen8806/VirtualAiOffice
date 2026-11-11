export const ROUTEFIT_ZONE = Object.freeze({
  routefit: Object.freeze(['Lead2', 'PM', 'Architect', 'BackendSenior', 'Backend1', 'DBEngineer', 'ReactSenior', 'React1', 'React2', 'Frontend1', 'UIUX', 'Localizer', 'LedgerAuditor', 'QAAutomation', 'OpsEngineer', 'Reviewer1', 'Reviewer2', 'SecurityReviewer', 'FrontendSenior', 'Frontend2', 'Backend2']),
  platform: Object.freeze(['Lead', 'KnowledgeKeeper', 'OpsLead', 'Reviewer3', 'SecurityReviewer2']),
  paused: Object.freeze(['GoSenior', 'GoSenior2', 'Go1', 'Go2']),
  groups: Object.freeze({
    'driver-client': Object.freeze(['ReactSenior', 'React1', 'React2', 'Frontend1']),
    client: Object.freeze(['UIUX', 'Localizer', 'FrontendSenior', 'Frontend2']),
    'admin-backend': Object.freeze(['Lead2', 'PM', 'Architect', 'Backend2']),
    server: Object.freeze(['BackendSenior', 'Backend1', 'OpsEngineer']),
    database: Object.freeze(['DBEngineer', 'LedgerAuditor']),
    'test-review-coordination': Object.freeze(['QAAutomation', 'Reviewer1', 'Reviewer2', 'SecurityReviewer']),
  }),
  wing: Object.freeze({ x0: 28, x1: 46, z0: -6, z1: 6, door: Object.freeze({ x: 27.2, z: 0, width: 3.2 }), emptySeats: 2 }),
})

export function routefitSeatAssignments(names, oldSeats) {
  const result = { ...oldSeats }
  const slots = names.length ? names : ROUTEFIT_ZONE.routefit
  slots.forEach((name, i) => {
    const col = i % 7, row = Math.floor(i / 7)
    const x = 30.1 + col * 2.45, z = -3.6 + row * 3.6, yaw = col % 2 ? 0 : Math.PI
    result[name] = ['routefit', x, z, yaw, { x, z: z + 1.1, yaw }]
  })
  return result
}

// The wing has one real doorway; keep a deterministic orthogonal route for the
// inspector and for callers that need to hand a worker into the existing grid.
export function routefitWingNavigation() {
  const { x0, z0, door } = ROUTEFIT_ZONE.wing
  const doorway = { x: x0 - 0.8, z: door.z }
  return Object.freeze({
    doorway,
    inside: { x: x0 + 0.8, z: door.z },
    route(from, to) {
      const via = { x: doorway.x, z: from.z }
      const enter = { x: x0 + 0.8, z: from.z }
      return [via, { x: doorway.x, z: door.z }, { x: x0 + 0.8, z: door.z }, enter, { x: enter.x, z: to.z }, { x: to.x, z: to.z }]
    },
  })
}

export function buildRoutefitZone({ THREE, scene, quality }) {
  const root = new THREE.Group(); root.name = 'routefit-wing-zone'
  const wall = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.9 })
  const floor = new THREE.MeshStandardMaterial({ color: 0xd7d0c5, roughness: 0.95 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xb69a64, roughness: 0.4, metalness: 0.3 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.6 })
  const accent = new THREE.MeshStandardMaterial({ color: 0x2d7f7a, roughness: 0.7 })
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); root.add(m); return m }
  const { x0, x1, z0, z1, door } = ROUTEFIT_ZONE.wing
  box(x1 - x0, 0.08, z1 - z0, floor, (x0 + x1) / 2, 0.02, (z0 + z1) / 2)
  box(x1 - x0, 2.5, 0.12, wall, (x0 + x1) / 2, 1.25, z0)
  box(x1 - x0, 2.5, 0.12, wall, (x0 + x1) / 2, 1.25, z1)
  box(0.12, 2.5, z1 - z0, wall, x1, 1.25, (z0 + z1) / 2)
  box(0.12, 2.5, Math.max(0, (z1 - z0 - door.width) / 2), wall, x0, 1.25, z0 + (z1 - z0) / 4 - door.width / 4)
  box(0.12, 2.5, Math.max(0, (z1 - z0 - door.width) / 2), wall, x0, 1.25, z1 - (z1 - z0) / 4 + door.width / 4)
  box(0.08, 2.4, 0.08, gold, x0, 1.2, door.z - door.width / 2)
  box(0.08, 2.4, 0.08, gold, x0, 1.2, door.z + door.width / 2)
  for (let i = 0; i < 2; i++) box(1.3, 0.74, 0.7, dark, 30 + i * 2.4, 0.38, 4.4)
  box(3.2, 0.12, 1.2, accent, 37, 0.78, -0.5)
  box(0.06, 0.9, 0.06, gold, 37, 1.25, -0.5)
  box(0.9, 1.1, 0.04, dark, 37, 1.75, -0.5)
  box(2.1, 0.05, 1.1, gold, 37, 0.82, 2.6)
  box(0.06, 1.6, 0.06, dark, 37, 1.6, 2.6)
  box(2.6, 0.9, 0.08, dark, 28.8, 2.4, -5.75)
  const sign = box(4.2, 0.8, 0.05, dark, 37, 2.3, 5.88)
  sign.userData.routefitSign = 'Dr.RouteFit 项目区 / Project Zone'
  scene.add(root)
  let last = 0
  async function refresh() {
    if (Date.now() - last < 60000) return
    last = Date.now()
    try {
      const response = await fetch('/zone/routefit', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      root.userData.routefitSummary = await response.json()
    } catch (error) {
      root.userData.routefitSummary = { unavailable: true, reason: error.message }
    }
  }
  refresh()
  return { root, refresh, bounds: { x0, x1, z0, z1 }, budget: quality?.tier === 'low' ? { calls: 8, triangles: 1200 } : { calls: 18, triangles: 60000 } }
}
