// Vehicle part shapes adapted from origin/feat/dr-b4-vehicles @ e341e9e8f625166ed377e67bda1f29486dba6a3c.
// Only silhouettes are reused: WH-R1 controls every footprint; no legacy lane, dock, turn or motion data.
import { WH_R1_DATA, WH_R1_ASSIGNMENT } from './wh-r1/data.js'
import { WH_R1_FLOOR_Y, whToWorld } from './wh-r1-layout.js'

const assigned = new Set(WH_R1_ASSIGNMENT.filter(row => row.card === 'I5').map(row => row.id))
export const WH_R1_VEHICLES = Object.freeze(WH_R1_DATA.elements.filter(row => assigned.has(row.id)))
export const WH_R1_SWEEPS = Object.freeze(WH_R1_DATA.integrityAudit.routes.filter(row => /^(TR|FL)/.test(row.id)))
export const WH_R1_LEVELS = Object.freeze({ dock: 'UNKNOWN', cargoFloor: 'UNKNOWN', entranceStep: 'UNKNOWN', sources: Object.freeze(['WH-SITE-DOCK-U01', 'WH-SITE-ACCESS-U01']) })
export const WH_R1_DOCK_MARKS = Object.freeze(WH_R1_DATA.doors.filter(row => ['01', '06'].includes(row.regionId)).map(row => Object.freeze({ doorId: row.id, sourceTag: row.sourceTag, ...whToWorld(row.xM, row.yM), widthM: row.lengthM, depthM: 1, level: 'UNKNOWN', displayOnly: 'DESIGN_ASSUMPTION' })))

function forkliftParts() {
  const parts=[],add=(part,x,y,z,sx,sy,sz,color,shape='box')=>parts.push({part,x,y,z,sx,sy,sz,color,shape})
  add('counterweight',0,.57,-.89,1.05,.66,.96,0xe4a844)
  add('chassis',0,.33,-.60,1.1,.20,1.6,0x34404a)
  add('seat',0,.91,-.62,.48,.16,.42,0x242b30)
  add('seat-back',0,1.17,-.84,.48,.46,.12,0x242b30)
  add('console',0,1.13,-.12,.48,.15,.20,0x34404a)
  for(const x of [-.45,.45]) {
    for(const z of [-1.14,.05])add('guard-post',x,1.34,z,.07,1.45,.07,0x34404a)
    add('mast',x,1.77,.15,.10,3.26,.10,0x34404a)
    for(const z of [-1.03,-.10])add('wheel',x,.23,z,.20,.46,.46,0x242b30,'wheel')
  }
  add('overhead-guard',0,2.04,-.55,1.04,.12,1.4,0xe4a844)
  for(const x of [-.28,.28])add('fork',x,.12,.8,.13,.08,1.2,0x34404a)
  add('carriage',0,.58,.20,1.0,.58,.08,0x34404a)
  return parts
}

function truckParts() {
  const parts=[],add=(part,x,y,z,sx,sy,sz,color,shape='box')=>parts.push({part,x,y,z,sx,sy,sz,color,shape})
  add('cargo-box',0,1.85,-1.05,2.55,2.6,6.9,0xf2f4f5)
  add('cab',0,1.18,3.45,2.45,1.50,2.1,0xf2f4f5)
  add('cab-roof',0,2.02,3.29,2.45,.18,1.78,0xf2f4f5)
  add('windscreen',0,1.61,4.46,2.02,.62,.04,0x426979)
  add('bumper',0,.58,4.42,2.5,.16,.16,0x34404a)
  add('grille',0,.95,4.475,1.1,.25,.03,0x26333a)
  for(const x of [-1.24,1.24]) {
    add('side-window',x,1.65,3.45,.02,.55,1.35,0x426979)
    for(const z of [-3.05,-1.35,3.05]) {
      add('wheel',x*.94,.41,z,.20,.82,.82,0x242b30,'wheel')
      add('wheel-arch-top',x,.91,z,.07,.12,1.03,0x34404a)
      for(const d of [-.48,.48])add('wheel-arch-side',x,.68,z+d,.07,.46,.10,0x34404a)
    }
  }
  for(const x of [-.595,.595]) {
    add('rear-door',x,1.86,-4.48,1.17,2.35,.04,0xdce2df)
    add('rear-lock',x,1.87,-4.495,.045,2.05,.01,0x627079)
    add('rear-handle',x,1.45,-4.495,.22,.045,.01,0x627079)
    add('tail-light',x*1.65,.60,-4.49,.22,.14,.02,0xd05242)
    add('head-light',x*1.65,1.0,4.48,.24,.16,.04,0xffe6ad)
  }
  return parts
}


export function buildWhR1Vehicles({ THREE, root, collision, canvasTex }) {
  const group = new THREE.Group(); group.name = 'wh-r1-vehicles'; group.position.y = WH_R1_FLOOR_Y; group.userData.noMerge = true; root.add(group)
  const batches = { boxes: [], wheels: [] }, meshes = [], proxies = [], labels = []
  const templates = { truck: truckParts(), forklift: forkliftParts() }
  const bounds = Object.fromEntries(Object.entries(templates).map(([key, rows]) => [key, {
    x0: Math.min(...rows.map(p => p.x - p.sx / 2)), x1: Math.max(...rows.map(p => p.x + p.sx / 2)),
    y0: Math.min(...rows.map(p => p.y - p.sy / 2)), y1: Math.max(...rows.map(p => p.y + p.sy / 2)),
    z0: Math.min(...rows.map(p => p.z - p.sz / 2)), z1: Math.max(...rows.map(p => p.z + p.sz / 2)),
  }]))
  for (const row of WH_R1_VEHICLES) {
    const key = row.category === '厢式货车' ? 'truck' : 'forklift', b = bounds[key], p = whToWorld(row.xM, row.yM), yaw = row.yawDeg * Math.PI / 180
    const sx = row.lengthM / (b.z1 - b.z0), sy = row.heightM / (b.y1 - b.y0), sz = row.widthM / (b.x1 - b.x0)
    for (const part of templates[key]) {
      // The old model's long Z axis becomes WH-R1's registered long X axis; the cab faces away from the receiving doors.
      const x = -(part.z - (b.z0 + b.z1) / 2) * sx, z = (part.x - (b.x0 + b.x1) / 2) * sz
      batches[part.shape === 'wheel' ? 'wheels' : 'boxes'].push({ id: row.id, part: part.part,
        x: p.x + x * Math.cos(yaw) + z * Math.sin(yaw), y: row.zM + (part.y - b.y0) * sy, z: p.z - x * Math.sin(yaw) + z * Math.cos(yaw),
        size: [part.sz * sx, part.sy * sy, part.sx * sz], yaw, color: part.color })
    }
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(row.lengthM, row.heightM, row.widthM), new THREE.MeshBasicMaterial({ visible: false }))
    proxy.name = `wh-r1-vehicle-proxy-${row.id}`; proxy.position.set(p.x, row.zM + row.heightM / 2, p.z); proxy.rotation.y = yaw
    proxy.userData = { whR1Id: row.id, collisionProxy: true, noMerge: true }; group.add(proxy); collision?.add(proxy, row.category); proxies.push(proxy)
    labels.push({ id: row.id, text: `${row.id} · 示意`, x: p.x, z: p.z, y: row.zM + row.heightM + .02, width: 2.6, depth: .42 })
  }
  const dummy = new THREE.Object3D()
  for (const [kind, rows] of Object.entries(batches)) {
    const geometry = kind === 'boxes' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(.5, .5, 1, 12).rotateX(Math.PI / 2)
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, metalness: .15 })
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length); mesh.name = `wh-r1-vehicles-${kind}`
    mesh.userData = { noMerge: true, instanceToRegisterId: rows.map(r => r.id), parts: rows.map(r => r.part), designStatus: 'DESIGN_ASSUMPTION' }
    rows.forEach((r, i) => { dummy.position.set(r.x, r.y, r.z); dummy.rotation.set(0, r.yaw, 0); dummy.scale.set(...r.size); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(r.color)) })
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; group.add(mesh); meshes.push(mesh)
  }

  // Sweep polygons are inspection overlays, not routes supplied to any moving object.
  const positions = [], colors = [], ranges = []
  const polygon = (id, points, color, y = .012) => {
    const start = positions.length / 3, c = new THREE.Color(color), cx = points.reduce((s, p) => s + p.x, 0) / points.length, cz = points.reduce((s, p) => s + p.z, 0) / points.length
    points.forEach((p, i) => { const q = points[(i + 1) % points.length]; positions.push(cx, y, cz, p.x, y, p.z, q.x, y, q.z); for (let j = 0; j < 3; j++) colors.push(c.r, c.g, c.b) })
    ranges.push({ id, start, count: positions.length / 3 - start })
  }
  for (const row of WH_R1_SWEEPS) {
    const a = whToWorld(...row.points_m[0]), b = whToWorld(...row.points_m[1]), angle = Math.atan2(b.z - a.z, b.x - a.x), r = row.swept_radius_mm / 1000, points = []
    for (const [p, start] of [[b, angle - Math.PI / 2], [a, angle + Math.PI / 2]]) for (let i = 0; i <= 16; i++) points.push({ x: p.x + r * Math.cos(start + i * Math.PI / 16), z: p.z + r * Math.sin(start + i * Math.PI / 16) })
    polygon(row.id, points, row.status === 'BLOCKED' ? '#dc513e' : '#dcad48')
    labels.push({ id: row.id, text: `${row.id} ${row.status === 'BLOCKED' ? '阻塞' : '局部静态余量'} ${row.min_clearance_mm.toFixed(0)} mm`, x: a.x, z: a.z - .6, y: .025, width: 4.5, depth: .55 })
  }
  for (const dock of WH_R1_DOCK_MARKS) {
    // Flat annotation only: neither the graphic's 1m depth nor its render offset is a dock elevation.
    polygon(dock.doorId, [{ x: dock.x - dock.widthM / 2, z: dock.z + .1 }, { x: dock.x + dock.widthM / 2, z: dock.z + .1 }, { x: dock.x + dock.widthM / 2, z: dock.z + 1.1 }, { x: dock.x - dock.widthM / 2, z: dock.z + 1.1 }], '#577fa0', .014)
    labels.push({ id: dock.doorId, text: `月台 ${dock.sourceTag} · 高差 UNKNOWN`, x: dock.x, z: dock.z + .6, y: .028, width: dock.widthM, depth: .45 })
  }
  const sweepGeometry = new THREE.BufferGeometry(); sweepGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); sweepGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const sweep = new THREE.Mesh(sweepGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }))
  sweep.name = 'wh-r1-vehicle-inspection-overlays'; sweep.userData = { noMerge: true, ranges, readOnly: true, levels: WH_R1_LEVELS }; group.add(sweep); meshes.push(sweep)
  labels.push({ id: 'WH-SITE-DOCK-U01', text: '月台 / 车厢 / 台阶高差 UNKNOWN · 无完整车辆进出验证', x: -153, z: -21, y: .025, width: 19, depth: .8 })
  if (canvasTex) {
    const cellW = 768, cellH = 80, cols = 4, rows = Math.ceil(labels.length / cols)
    const texture = canvasTex(cellW * cols, cellH * rows, (ctx) => {
      ctx.fillStyle = '#23323b'; ctx.fillRect(0, 0, cellW * cols, cellH * rows); ctx.fillStyle = '#ffe7b1'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      labels.forEach((r, i) => ctx.fillText(r.text, (i % cols + .5) * cellW, (Math.floor(i / cols) + .5) * cellH, cellW - 14))
    })
    const pos = [], uv = [], index = []
    labels.forEach((r, i) => { const n = pos.length / 3, u0 = i % cols / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows
      pos.push(r.x - r.width / 2, r.y, r.z + r.depth / 2, r.x + r.width / 2, r.y, r.z + r.depth / 2, r.x + r.width / 2, r.y, r.z - r.depth / 2, r.x - r.width / 2, r.y, r.z - r.depth / 2)
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1); index.push(n, n + 1, n + 2, n, n + 2, n + 3)
    })
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index)
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })); mesh.name = 'wh-r1-vehicle-labels'; mesh.userData = { noMerge: true, labels }; group.add(mesh); meshes.push(mesh)
  }
  group.userData = { noMerge: true, registerIds: WH_R1_VEHICLES.map(r => r.id), levels: WH_R1_LEVELS, docks: WH_R1_DOCK_MARKS, sweeps: WH_R1_SWEEPS, motion: 'NONE — static drawing objects only', shapeStatus: 'DESIGN_ASSUMPTION' }
  let disposed = false
  return { root: group, records: WH_R1_VEHICLES, levels: WH_R1_LEVELS,
    dispose() { if (disposed) return; disposed = true; proxies.forEach(p => { collision?.remove(p); p.geometry.dispose(); p.material.dispose() }); meshes.forEach(m => { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); if (m.isInstancedMesh) m.dispose() }); group.removeFromParent() } }
}
