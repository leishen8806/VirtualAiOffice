import { WH_R1_ASSIGNMENT, WH_R1_DATA } from './wh-r1/data.js'
import { whToWorld } from './wh-r1-layout.js'

export function buildWhR1InspectorIndex({ data = WH_R1_DATA, assignment = WH_R1_ASSIGNMENT } = {}) {
  const records = new Map(data.elements.map(row => [row.id, row]))
  const assigned = new Map(assignment.map(row => [row.id, row.card]))
  const missing = data.elements.filter(row => !assigned.has(row.id)).map(row => row.id)
  return { records, assigned, coverage: assigned.size, total: data.elements.length, missing }
}

export function buildWhR1Inspector({ THREE, root, data = WH_R1_DATA, assignment = WH_R1_ASSIGNMENT } = {}) {
  const index = buildWhR1InspectorIndex({ data, assignment })
  const proxies = new Map()
  const state = { enabled: false, coverage: index.coverage, total: index.total, missing: index.missing }
  const detail = id => {
    const row = index.records.get(id)
    if (!row) return null
    return { id: row.id, category: row.category, dimensionsM: { length: row.lengthM, width: row.widthM, height: row.heightM }, coordinatesM: { x: row.xM, y: row.yM, z: row.zM || 0, yawDeg: row.yawDeg || 0 }, useScope: row.regionId, status: row.unknown ? 'UNKNOWN' : row.status, card: index.assigned.get(id) || null, unknown: !!row.unknown }
  }
  const enablePicking = ids => {
    state.enabled = !!(THREE && root)
    for (const id of ids || []) {
      if (proxies.has(id) || !THREE || !root || !index.records.has(id)) continue
      const row = index.records.get(id), geometry = new THREE.BoxGeometry(Math.max(.02, row.lengthM || .1), Math.max(.02, row.heightM || .1), Math.max(.02, row.widthM || .1))
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `wh-r1-pick-${id}`; mesh.userData = { whR1Id: id, noMerge: true, pickProxy: true }; mesh.visible = true
      const p = whToWorld(row.xM || 0, row.yM || 0); mesh.position.set(p.x, (row.zM || 0) + (row.heightM || .1) / 2, p.z); mesh.rotation.y = (row.yawDeg || 0) * Math.PI / 180
      root.add(mesh); proxies.set(id, mesh)
    }
    return state
  }
  const disablePicking = () => { for (const mesh of proxies.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose() } proxies.clear(); state.enabled = false }
  const selectById = id => { disablePicking(); const value = detail(id); if (value) enablePicking([id]); return value }
  const pickRay = input => {
    if (!THREE || !root) return null
    const ray = input?.ray || input
    const candidates = [...index.records.keys()]
    for (const id of candidates) {
      const row = index.records.get(id), p = whToWorld(row.xM || 0, row.yM || 0), halfX = Math.max(.01, (row.lengthM || .1) / 2), halfZ = Math.max(.01, (row.widthM || .1) / 2), y = (row.zM || 0) + (row.heightM || .1) / 2
      if (Math.abs(ray.direction.y) < 1e-6) continue
      const t = (y - ray.origin.y) / ray.direction.y
      if (t < 0) continue
      const x = ray.origin.x + ray.direction.x * t, z = ray.origin.z + ray.direction.z * t
      if (Math.abs(x - p.x) <= halfX && Math.abs(z - p.z) <= halfZ) return selectById(id)
    }
    return null
  }
  if (root) { root.userData.whR1Inspector = { coverage: index.coverage, total: index.total, missing: index.missing, lazy: true, pickEnabled: false }; root.userData.noMerge = true }
  return { ...index, state, inspect: detail, selectById, pickRay, enablePicking, disablePicking, dispose: disablePicking }
}
