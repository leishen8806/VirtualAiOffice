import { r1ToWorld } from '../office-r1-layout.js'

// Parking/track choice is a design assumption; registered closed geometry stays authoritative.
export function r1DoorPlan(layout) {
  return layout.r1.elements.filter(row => row.category === '门扇').map(row => {
    const door = layout.r1.data.doors.find(item => item.id === row.parentId), vertical = !!door.facingLocal[0], first = row.id.endsWith('LF1')
    const closed = r1ToWorld(row.xM, row.yM), center = r1ToWorld(door.xM, door.yM), axis = vertical ? 'z' : 'x', normal = vertical ? 'x' : 'z'
    let direction = (first ? -1 : 1) * (vertical ? -1 : 1)
    if (door.id === '11-D-002') direction = -1
    if (door.id === '11-D-003') direction = 1
    const stacked = ['11-D-002', '11-D-003'].includes(door.id)
    const normalSign = vertical ? (['12-D-001', '13-D-001'].includes(door.id) ? -1 : 1) : (door.id === '11-D-001' ? -1 : door.id === '00-D-001' ? -1 : door.id.startsWith('11-') ? -1 : 1)
    const offset = (.16 + (stacked && !first ? .08 : 0)) * normalSign
    const open = { ...closed, [normal]: closed[normal] + offset, [axis]: center[axis] + direction * (door.lengthM / 2 + row.lengthM / 2) }
    // Front side walls protrude 50 mm into the parking span; retain 10 mm clearance and 6.88 m clear opening (target 6.8 m).
    if (door.id === '11-D-001') open[axis] -= direction * .06
    return { id: row.id, doorId: door.id, status: 'DESIGN_ASSUMPTION', closed, open, axis, normal, offset, direction, width: row.lengthM, height: row.heightM, thickness: row.widthM, vertical }
  })
}

export function buildR1Doors({ THREE, root, layout }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-doors'; group.userData.dynamic = true
  const records = r1DoorPlan(layout), byId = new Map(records.map(row => [row.id, row])), motion = new Map(records.map(row => [row.id, { progress: 1, target: 1 }]))
  const tracks = layout.r1.data.doors.flatMap(door => { const pair = records.filter(row => row.doorId === door.id); return ['11-D-002', '11-D-003'].includes(door.id) ? pair.map(row => [row]) : [pair] })
  const geometry = new THREE.BoxGeometry(1, 1, 1), glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#dce9e7', transparent: true, opacity: .28, depthWrite: false, roughness: .15 }), metalMaterial = new THREE.MeshStandardMaterial({ color: '#705735', metalness: .55, roughness: .45 })
  const glass = new THREE.InstancedMesh(geometry, glassMaterial, records.length), metal = new THREE.InstancedMesh(geometry, metalMaterial, records.length * 4 + tracks.length)
  glass.name = 'r1-door-glass'; metal.name = 'r1-door-metal'; glass.userData.itemIds = records.map(row => row.id); metal.userData.itemIds = records.flatMap(row => Array(4).fill(row.id)).concat(tracks.map(pair => pair[0].doorId))
  const transform = new THREE.Object3D(), positionAt = (row, p) => ({ ...row.closed, [row.normal]: row.closed[row.normal] + row.offset * Math.min(1, p * 5), [row.axis]: row.closed[row.axis] + (row.open[row.axis] - row.closed[row.axis]) * Math.max(0, (p - .2) / .8) })
  const box = (mesh, index, row, p, along, y, width, height, thickness) => {
    transform.position.set(p.x + (row.vertical ? 0 : along), y, p.z + (row.vertical ? along : 0)); transform.rotation.set(0, 0, 0)
    transform.scale.set(row.vertical ? thickness : width, height, row.vertical ? width : thickness); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix)
  }
  const update = () => {
    records.forEach((row, index) => {
      const p = positionAt(row, motion.get(row.id).progress), trim = .035
      box(glass, index, row, p, 0, row.height / 2, row.width - trim * 2, row.height - trim * 2, .012)
      box(metal, index * 4, row, p, -row.width / 2 + trim / 2, row.height / 2, trim, row.height, row.thickness)
      box(metal, index * 4 + 1, row, p, row.width / 2 - trim / 2, row.height / 2, trim, row.height, row.thickness)
      box(metal, index * 4 + 2, row, p, 0, trim / 2, row.width - trim * 2, trim, row.thickness)
      box(metal, index * 4 + 3, row, p, 0, row.height - trim / 2, row.width - trim * 2, trim, row.thickness)
    })
    glass.instanceMatrix.needsUpdate = true; metal.instanceMatrix.needsUpdate = true; glass.computeBoundingSphere(); metal.computeBoundingSphere()
  }
  tracks.forEach((pair, index) => {
    const row = pair[0], a = Math.min(...pair.flatMap(r => [r.closed[r.axis], r.open[r.axis]])) - row.width / 2, b = Math.max(...pair.flatMap(r => [r.closed[r.axis], r.open[r.axis]])) + row.width / 2
    const p = { ...row.open, [row.axis]: (a + b) / 2 }
    box(metal, records.length * 4 + index, row, p, 0, row.height + .06, b - a, .08, .08)
  })
  update(); group.add(glass, metal); root.add(group); let disposed = false
  const set = (id, value) => { if (!['open', 'closed'].includes(value)) throw new Error('Door state must be open or closed'); if (!byId.has(id)) throw new Error(`Unknown R1 leaf: ${id}`); if (!disposed) motion.get(id).target = value === 'open' ? 1 : 0 }
  return { root: group, records, positionAt, doors: { ids: Object.freeze(records.map(row => row.id)), state(id) { const row = motion.get(id); return row ? { state: row.progress === 1 ? 'open' : row.progress === 0 ? 'closed' : 'moving', target: row.target ? 'open' : 'closed', progress: row.progress } : null }, set, setAll(value) { records.forEach(row => set(row.id, value)) } },
    onFrame(dt) { if (disposed || globalThis.document?.hidden || !group.visible || !Number.isFinite(dt) || dt <= 0) return; let changed = false; for (const row of motion.values()) { if (row.progress === row.target) continue; const step = dt / 1.2; row.progress = row.target > row.progress ? Math.min(row.target, row.progress + step) : Math.max(row.target, row.progress - step); changed = true } if (changed) update() },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); glass.dispose(); metal.dispose(); geometry.dispose(); glassMaterial.dispose(); metalMaterial.dispose() } }
}
