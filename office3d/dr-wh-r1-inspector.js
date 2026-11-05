import { WH_R1_ASSIGNMENT, WH_R1_DATA } from './wh-r1/data.js'

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
  const enablePicking = ids => {
    state.enabled = true
    for (const id of ids || []) {
      if (proxies.has(id) || !THREE || !root || !index.records.has(id)) continue
      const row = index.records.get(id), geometry = new THREE.BoxGeometry(Math.max(.02, row.lengthM || .1), Math.max(.02, row.heightM || .1), Math.max(.02, row.widthM || .1))
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `wh-r1-pick-${id}`; mesh.userData = { whR1Id: id, noMerge: true, pickProxy: true }; mesh.visible = false
      root.add(mesh); proxies.set(id, mesh)
    }
    return state
  }
  const disablePicking = () => { for (const mesh of proxies.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose() } proxies.clear(); state.enabled = false }
  if (root) { root.userData.whR1Inspector = { coverage: index.coverage, total: index.total, missing: index.missing, lazy: true, pickEnabled: false }; root.userData.noMerge = true }
  return { ...index, state, inspect: id => index.records.get(id) || null, enablePicking, disablePicking, dispose: disablePicking }
}
