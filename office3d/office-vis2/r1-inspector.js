import { r1ToWorld } from '../office-r1-layout.js'
import { R1_DATA } from '../office-r1/data.js'

export function buildOfficeR1InspectorIndex({ layout } = {}) {
  const rows = R1_DATA.elements || layout?.r1?.elements || [], records = new Map(rows.map(row => [row.id, row]))
  const assigned = new Map(rows.map(row => [row.id, 'I7']))
  return { records, assigned, coverage: assigned.size, total: rows.length, missing: rows.filter(row => !assigned.has(row.id)).map(row => row.id) }
}

export function buildOfficeR1Inspector({ THREE, root, layout } = {}) {
  const index = buildOfficeR1InspectorIndex({ layout }), state = { enabled: false, coverage: index.coverage, total: index.total, missing: index.missing }
  const detail = id => { const row = index.records.get(id); if (!row) return null; return { id: row.id, category: row.category, dimensionsM: { length: row.lengthM ?? null, width: row.widthM ?? null, height: row.heightM ?? null }, coordinatesM: { x: row.xM ?? null, y: row.yM ?? null, z: row.zM ?? 0, yawDeg: row.yawDeg ?? 0 }, useScope: row.regionId, status: row.unknown ? 'UNKNOWN' : row.status, unknown: !!row.unknown } }
  const proxies = new Map()
  const enablePicking = ids => { state.enabled = !!(THREE && root); for (const id of ids || []) { const row = index.records.get(id); if (!row || proxies.has(id) || !THREE || !root) continue; const g = new THREE.BoxGeometry(Math.max(.02, row.lengthM || .1), Math.max(.02, row.heightM || .1), Math.max(.02, row.widthM || .1)); const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }); const mesh = new THREE.Mesh(g, m); mesh.name = `office-r1-pick-${id}`; mesh.userData = { officeR1Id: id, noMerge: true, pickProxy: true }; const p = r1ToWorld(row.xM || 0, row.yM || 0); mesh.position.set(p.x, (row.zM || 0) + (row.heightM || .1) / 2, p.z); mesh.rotation.y = -(row.yawDeg || 0) * Math.PI / 180; root.add(mesh); proxies.set(id, mesh) } return state }
  const disablePicking = () => { for (const mesh of proxies.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose() } proxies.clear(); state.enabled = false }
  const selectById = id => { const value = detail(id); if (value) enablePicking([id]); return value }
  const pickRay = ray => {
    if (!ray) return null
    let best = null
    for (const [id, row] of index.records) {
      const p = r1ToWorld(row.xM || 0, row.yM || 0), y = (row.zM || 0) + (row.heightM || .1) / 2
      if (Math.abs(ray.direction.y) < 1e-6) continue
      const t = (y - ray.origin.y) / ray.direction.y; if (t < 0) continue
      const x = ray.origin.x + ray.direction.x * t, z = ray.origin.z + ray.direction.z * t, hx = Math.max(.01, (row.lengthM || .1) / 2), hz = Math.max(.01, (row.widthM || .1) / 2)
      if (Math.abs(x - p.x) <= hx && Math.abs(z - p.z) <= hz && (!best || t < best.t)) best = { t, id }
    }
    return best ? selectById(best.id) : null
  }
  if (root) { root.userData.officeR1Inspector = { coverage: index.coverage, total: index.total, missing: index.missing, lazy: true, pickEnabled: false }; root.userData.noMerge = true }
  return { ...index, state, inspect: detail, selectById, pickRay, enablePicking, disablePicking, dispose: disablePicking }
}
