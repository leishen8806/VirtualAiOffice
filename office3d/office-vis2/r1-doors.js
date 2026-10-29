import { r1ToWorld } from '../office-r1-layout.js'

// Parking/track choice is a design assumption; registered closed geometry stays authoritative.
export function r1DoorPlan(layout) {
  return layout.r1.elements.filter(row => row.category === '门扇').map(row => {
    const door = layout.r1.data.doors.find(item => item.id === row.parentId), vertical = !!door.facingLocal[0], first = row.id.endsWith('LF1')
    const closed = r1ToWorld(row.xM, row.yM), center = r1ToWorld(door.xM, door.yM), axis = vertical ? 'z' : 'x', normal = vertical ? 'x' : 'z'
    // 董事会偏离新增的平移门把叠放方向与停靠侧写进门记录（office-r1-layout.js）；登记门的判断原样保留。
    const boardStack = Number.isFinite(door.stackDirection) ? door.stackDirection : null
    let direction = (first ? -1 : 1) * (vertical ? -1 : 1)
    if (door.id === '11-D-002') direction = -1
    if (door.id === '11-D-003') direction = 1
    if (boardStack !== null) direction = boardStack
    const stacked = boardStack !== null || ['11-D-002', '11-D-003'].includes(door.id)
    const normalSign = boardStack !== null ? door.parkNormalSign : vertical ? (['12-D-001', '13-D-001'].includes(door.id) ? -1 : 1) : (door.id === '11-D-001' ? -1 : door.id === '00-D-001' ? -1 : door.id.startsWith('11-') ? -1 : 1)
    const offset = (.16 + (stacked && !first ? .08 : 0)) * normalSign
    const open = { ...closed, [normal]: closed[normal] + offset, [axis]: center[axis] + direction * (door.lengthM / 2 + row.lengthM / 2) }
    // Front side walls protrude 50 mm into the parking span; retain 10 mm clearance and 6.88 m clear opening (target 6.8 m).
    if (door.id === '11-D-001') open[axis] -= direction * .06
    return { id: row.id, doorId: door.id, status: 'DESIGN_ASSUMPTION', closed, open, axis, normal, offset, direction, stacked, width: row.lengthM, height: row.heightM, thickness: row.widthM, vertical }
  })
}

export function buildR1Doors({ THREE, root, layout }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-doors'; group.userData.dynamic = true
  const records = r1DoorPlan(layout), byId = new Map(records.map(row => [row.id, row])), motion = new Map(records.map(row => [row.id, { progress: 1, target: 1 }]))
  const tracks = layout.r1.data.doors.flatMap(door => { const pair = records.filter(row => row.doorId === door.id); return pair[0]?.stacked ? pair.map(row => [row]) : [pair] })
  const spans = tracks.map(pair => {
    const row = pair[0], ends = pair.flatMap(leaf => [leaf.closed[leaf.axis], leaf.open[leaf.axis]])
    return { row, a: Math.min(...ends) - row.width / 2, b: Math.max(...ends) + row.width / 2 }
  })
  // 轨道两端的托杆：只有在偏离表里登记了 trackPosts 的门（大门 11-D-001）才有，其余 14 樘门不变。
  const posts = spans.flatMap(({ row, a, b }) => {
    const spec = layout.r1.data.doors.find(door => door.id === row.doorId)?.trackPosts
    return spec ? [a + spec.insetM, b - spec.insetM].map((at, end) => ({ row, spec, at, id: `${row.doorId}:track-post-${end ? 'b' : 'a'}` })) : []
  })
  const geometry = new THREE.BoxGeometry(1, 1, 1), glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#dce9e7', transparent: true, opacity: .28, depthWrite: false, roughness: .15 }), metalMaterial = new THREE.MeshStandardMaterial({ color: '#705735', metalness: .55, roughness: .45 })
  const glass = new THREE.InstancedMesh(geometry, glassMaterial, records.length), metal = new THREE.InstancedMesh(geometry, metalMaterial, records.length * 4 + tracks.length + posts.length)
  glass.name = 'r1-door-glass'; metal.name = 'r1-door-metal'; glass.userData.itemIds = records.map(row => row.id); metal.userData.itemIds = records.flatMap(row => Array(4).fill(row.id)).concat(tracks.map(pair => pair[0].doorId), posts.map(post => post.id))
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
  spans.forEach(({ row, a, b }, index) => {
    const p = { ...row.open, [row.axis]: (a + b) / 2 }
    box(metal, records.length * 4 + index, row, p, 0, row.height + .06, b - a, .08, .08)
  })
  // 托杆顶到轨道底（轨道中心 = 门扇高 + 0.06，截面 0.08），底落在栅栏底座顶；沿法向让开门扇停靠面。
  posts.forEach(({ row, spec, at }, index) => {
    const top = row.height + .06 - .04
    const p = { ...row.open, [row.axis]: at, [row.normal]: row.open[row.normal] + spec.normalSign * (.04 + spec.sizeM / 2) }
    box(metal, records.length * 4 + tracks.length + index, row, p, 0, (spec.baseM + top) / 2, spec.sizeM, top - spec.baseM, spec.sizeM)
  })
  update(); group.add(glass, metal); root.add(group); let disposed = false
  const set = (id, value) => { if (!['open', 'closed'].includes(value)) throw new Error('Door state must be open or closed'); if (!byId.has(id)) throw new Error(`Unknown R1 leaf: ${id}`); if (!disposed) motion.get(id).target = value === 'open' ? 1 : 0 }
  return { root: group, records, positionAt, doors: { ids: Object.freeze(records.map(row => row.id)), state(id) { const row = motion.get(id); return row ? { state: row.progress === 1 ? 'open' : row.progress === 0 ? 'closed' : 'moving', target: row.target ? 'open' : 'closed', progress: row.progress } : null }, set, setAll(value) { records.forEach(row => set(row.id, value)) } },
    onFrame(dt) { if (disposed || globalThis.document?.hidden || !group.visible || !Number.isFinite(dt) || dt <= 0) return; let changed = false; for (const row of motion.values()) { if (row.progress === row.target) continue; const step = dt / 1.2; row.progress = row.target > row.progress ? Math.min(row.target, row.progress + step) : Math.max(row.target, row.progress - step); changed = true } if (changed) update() },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); glass.dispose(); metal.dispose(); geometry.dispose(); glassMaterial.dispose(); metalMaterial.dispose() } }
}
