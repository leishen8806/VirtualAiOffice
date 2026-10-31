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


export function buildWhR1Vehicles({ THREE, root, collision, canvasTex, quality, env }) {
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
      ctx.fillStyle = '#23323b'; ctx.fillRect(0, 0, cellW * cols, cellH * rows); ctx.fillStyle = '#ffffe8'; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      labels.forEach((r, i) => ctx.fillText(r.text, (i % cols + .5) * cellW, (Math.floor(i / cols) + .5) * cellH, cellW - 14))
    })
    const pos = [], uv = [], index = []
    labels.forEach((r, i) => { const n = pos.length / 3, u0 = i % cols / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows
      pos.push(r.x - r.width / 2, r.y, r.z + r.depth / 2, r.x + r.width / 2, r.y, r.z + r.depth / 2, r.x + r.width / 2, r.y, r.z - r.depth / 2, r.x - r.width / 2, r.y, r.z - r.depth / 2)
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1); index.push(n, n + 1, n + 2, n, n + 2, n + 3)
    })
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); mesh.name = 'wh-r1-vehicle-labels'; mesh.userData = { noMerge: true, labels }; group.add(mesh); meshes.push(mesh)
  }
  group.userData = { noMerge: true, registerIds: WH_R1_VEHICLES.map(r => r.id), levels: WH_R1_LEVELS, docks: WH_R1_DOCK_MARKS, sweeps: WH_R1_SWEEPS, motion: 'NONE — static drawing objects only', shapeStatus: 'DESIGN_ASSUMPTION' }
  const appearance = truckAppearance(THREE, group, meshes, batches, canvasTex, quality, env)
  let disposed = false
  return { root: group, records: WH_R1_VEHICLES, levels: WH_R1_LEVELS,
    onFrame: appearance.onFrame,
    dispose() { if (disposed) return; disposed = true; appearance.dispose(); proxies.forEach(p => { collision?.remove(p); p.geometry.dispose(); p.material.dispose() }); meshes.forEach(m => { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); if (m.isInstancedMesh) m.dispose() }); group.removeFromParent() } }
}

// Solid, complementary screen-door coverage avoids alpha sorting and double surfaces during LOD changes.
function truckFade(THREE, mesh, values) {
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(values), 1)
  mesh.geometry.setAttribute('truckFade', fade)
  mesh.material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float truckFade; varying float vTruckFade;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTruckFade = truckFade;')
    shader.fragmentShader = 'varying float vTruckFade;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat screenDoor = mod(dot(floor(gl_FragCoord.xy), vec2(13.0,7.0)),17.0)/17.0;\nif(vTruckFade >= 0.0 ? screenDoor >= vTruckFade : screenDoor < -vTruckFade-1.0) discard;')
  }
  mesh.material.customProgramCacheKey = () => 'wh-truck-screen-door-v1'
  return fade
}

function truckAppearance(T, group, meshes, batches, canvasTex, quality, env) {
  const trucks = WH_R1_VEHICLES.filter(r => r.category === '厢式货车')
  const fleet = trucks.map((r, i) => ({ id:r.id, number:`DL-${String(i+1).padStart(2,'0')}`, ...whToWorld(r.xM,r.yM), yaw:r.yawDeg*Math.PI/180, zM:r.zM }))
  const solid = [], lamps = [], parts = []
  const put = (name,g,color,target=solid) => {
    g.computeBoundingBox();const b=g.boundingBox
    parts.push({name,bounds:[b.min.toArray(),b.max.toArray()],light:target===lamps,start:target.reduce((n,p)=>n+p.attributes.position.count,0),count:g.index?g.index.count:g.attributes.position.count})
    const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose()
    const c=new T.Color(color),colors=new Float32Array(flat.attributes.position.count*3)
    for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b}
    flat.setAttribute('color',new T.BufferAttribute(colors,3));target.push(flat)
  }
  const add = (name,x,y,z,sx,sy,sz,color,shape='box',angle=0,target=solid) => {
    const g=shape==='wheel'?new T.CylinderGeometry(.5,.5,1,name==='hub'?6:24,1,name==='tyre').rotateX(Math.PI/2):new T.BoxGeometry(1,1,1)
    g.scale(sx,sy,sz);g.rotateZ(angle);g.translate(x,y,z);put(name,g,color,target)
  }
  const white=0xf5f3ed,navy=0x283e4b,metal=0xa9b3b9,dark=0x292c30,glass=0x284957
  // Front is -X. The 2m cab, 0.2m service gap and 5.8m box fill the registered 8m length.
  add('cargo-panel',1.1,2.205,0,5.8,2.29,2.5,white)
  const slope=Math.tan(6*Math.PI/180),front=y=>-3.88+(y-1.18)*slope
  const cab=new T.Shape();cab.moveTo(front(1.18),1.18);cab.lineTo(-2.12,1.18);cab.lineTo(-2.12,2.68);cab.lineTo(front(2.68),2.68);cab.closePath()
  const cabGeometry=new T.ExtrudeGeometry(cab,{depth:2.02,steps:1,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:2,curveSegments:2}).translate(0,0,-1.01)
  cabGeometry.computeBoundingBox();const cabBox=cabGeometry.boundingBox;cabGeometry.translate(-cabBox.min.x,0,0).scale(2/(cabBox.max.x-cabBox.min.x),1,1).translate(-4,0,0)
  put('cab-shell',cabGeometry,white)
  // Windshield lies on the sloping front plane, between the rounded roof and the belt line.
  const faceX=y=>front(y)-.12
  add('windscreen',faceX(2.12)-.008,2.12,0,.018,.88,1.98,glass,'box',-6*Math.PI/180)
  for(const z of [-1.035,1.035])add('A-pillar',faceX(2.12)-.014,2.12,z,.025,.92,.055,white,'box',-6*Math.PI/180)
  add('sunvisor',faceX(2.58)-.015,2.58,0,.09,.055,2.03,navy)
  add('bumper',-3.93,.64,0,.14,.26,2.26,metal)
  add('front-apron',-3.86,.965,0,.24,.38,2.26,white)
  add('grille',faceX(1.43)+.010,1.43,0,.022,.34,1.2,dark,'box',-6*Math.PI/180)
  for(const y of [1.30,1.40,1.50,1.60])add('grille-slat',Math.max(-3.995,faceX(y)-.005),y,0,.01,.025,1.16,metal)
  for(const z of [-.5,.5])add('wiper',faceX(1.81)-.03,1.81,z,.025,.025,.66,dark)
  for(const sign of [-1,1]){
    const z=sign*1.132
    add('side-window',-2.85,2.15,z,1.13,.78,.012,glass)
    for(const x of [-3.52,-2.18])add('door-seam',x,1.94,z,.014,1.47,.014,navy)
    add('door-seam',-2.85,1.21,z,1.34,.016,.014,navy)
    add('door-handle',-2.30,1.69,sign*1.145,.20,.035,.035,navy)
    for(const y of [.62,.86])add('step',-2.12,y,sign*1.06,.22,.07,.22,metal)
    add('mirror-arm',-3.62,2.16,sign*1.25,.045,.045,.30,navy)
    add('mirror',-3.59,2.07,sign*1.43,.12,.38,.14,dark)
    add('mirror-glass',-3.525,2.07,sign*1.43,.012,.32,.11,metal)
    add('side-guard',-.45,.52,sign*1.19,2.95,.09,.055,metal)
    for(const x of [-1.6,.8])add('guard-hanger',x,.74,sign*1.19,.055,.4,.055,navy)
    for(const x of [-2.8,1.8]){
      // Half-ring wheel arches leave the wheel silhouette open instead of filling it with a box.
      const arch=new T.RingGeometry(.50,.56,24,1,0,Math.PI);if(sign<0)arch.rotateY(Math.PI);arch.translate(x,.45,sign*1.24);put('fender',arch,navy)
      add('mudflap',x+.55,.30,sign*1.14,.035,.58,.18,dark)
    }
    for(let x=-1.5;x<3.8;x+=.65){const rib=new T.PlaneGeometry(.018,2.22);if(sign<0)rib.rotateY(Math.PI);put('cargo-rib',rib.translate(x,2.20,sign*1.25),0xd0d6d5)}
    for(const x of [-1.775,3.925])add('corner-post',x,2.225,sign*1.205,.05,2.35,.09,metal)
    add('roof-rail',1.1,3.375,sign*1.205,5.8,.05,.09,metal)
    add('sill',1.1,1.075,sign*1.205,5.8,.05,.09,navy)
  }
  for(const z of [-.69,.69])add('frame-rail',0,.71,z,7.8,.22,.10,navy)
  add('fuel-tank',-.65,.67,-1.00,1.2,.48,.40,metal)
  for(const x of [-1.05,-.25])add('tank-strap',x,.67,-1.205,.045,.46,.015,navy)
  add('battery-box',-.65,.67,1.00,.90,.46,.40,navy)
  for(const x of [-2.8,1.8]){
    add('axle',x,.45,0,.13,.13,2.20,navy)
    for(const sign of [-1,1]){
      for(const z of x<0?[sign*1.10]:[sign*.89,sign*1.12])add('tyre',x,.45,z,.90,.90,.22,dark,'wheel')
      const z=sign*(x<0?1.215:1.235)
      // Annular sidewall exposes a recessed rim, not a silver disc pasted over the tyre.
      const wall=new T.RingGeometry(.27,.45,24);if(sign<0)wall.rotateY(Math.PI);put('tyre-sidewall',wall.translate(x,.45,z),dark)
      add('rim',x,.45,z-sign*.025,.54,.54,.035,metal,'wheel')
      add('hub',x,.45,z-sign*.015,.20,.20,.055,navy,'wheel')
      // Six square bolt heads at this scale share the same material batch.
      for(let a=0;a<6;a++){const bolt=new T.PlaneGeometry(.028,.028);if(sign<0)bolt.rotateY(Math.PI);put('lug',bolt.translate(x+.17*Math.cos(a*Math.PI/3),.45+.17*Math.sin(a*Math.PI/3),z),metal)}
    }
  }
  for(const z of [-.61,.61]){
    add('closed-rear-door',3.967,2.21,z,.04,2.23,1.20,white)
    add('locking-rod',3.995,2.21,z,.01,2.10,.03,metal)
    add('rear-handle',3.995,1.60,z,.01,.04,.24,navy)
    for(const y of [1.24,2.21,3.19])add('hinge',3.995,y,Math.sign(z)*1.15,.01,.065,.15,metal)
  }
  add('rear-underrun',3.9,.43,0,.12,.12,2.36,metal)
  for(let i=0;i<10;i++)put('reflector',new T.PlaneGeometry(.18,.065).rotateY(Math.PI/2).translate(3.965,.83,-1.05+i*.23),i%2?0xd54336:0xf1f1dc)
  const lamp=(n,x,y,z,sx,sy,sz,c)=>add(n,x,y,z,sx,sy,sz,c,'box',0,lamps)
  for(const z of [-.88,.88]){
    lamp('headlamp',-3.987,.99,z,.02,.18,.30,0xffebbe)
    lamp('indicator',-3.999,.65,z,.002,.07,.22,0xffa42d)
    lamp('foglamp',-3.999,.62,z*.65,.002,.07,.14,0xffebbe)
    lamp('rear-lamp',3.995,.95,z,.01,.12,.30,0xe22e20)
    lamp('rear-marker',3.995,3.25,z,.01,.06,.09,0xe22e20)
    for(const x of [-1.6,1.1,3.7])lamp('side-marker',x,1.10,z>0?1.2495:-1.2495,.09,.05,.001,0xffa42d)
  }
  const merge = list => {
    const g=new T.BufferGeometry()
    for(const key of ['position','normal','uv','color']){const values=list.flatMap(p=>Array.from(p.attributes[key].array));g.setAttribute(key,new T.Float32BufferAttribute(values,list[0].attributes[key].itemSize))}
    list.forEach(p=>p.dispose());return g
  }
  const matrices=fleet.map(f=>new T.Matrix4().makeRotationY(f.yaw).setPosition(f.x,f.zM,f.z))
  const instance=(name,geometry,material)=>{
    const m=new T.InstancedMesh(geometry,material,9);m.name=name;m.userData={noMerge:true,instanceToRegisterId:fleet.map(f=>f.id),parts:parts.map(p=>p.name),designStatus:'DESIGN_ASSUMPTION'}
    matrices.forEach((matrix,i)=>m.setMatrixAt(i,matrix));group.add(m);meshes.push(m);return m
  }
  const detail=instance('wh-r1-truck-detail',merge(solid),new T.MeshStandardMaterial({vertexColors:true,roughness:.52,metalness:.25}))
  const detailFade=truckFade(T,detail,Array(9).fill(0));detail.visible=false
  const baseFades=['boxes','wheels'].map(kind=>({mesh:group.getObjectByName(`wh-r1-vehicles-${kind}`),rows:batches[kind]})).map(x=>({...x,fade:truckFade(T,x.mesh,x.rows.map(()=>-1))}))
  const light=instance('wh-r1-truck-lamps',merge(lamps),new T.MeshStandardMaterial({vertexColors:true,roughness:.3,emissive:0xffffff,emissiveIntensity:0,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}))
  const lampShader=s=>{s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif')}
  light.material.onBeforeCompile=lampShader; light.material.customProgramCacheKey=()=> 'wh-truck-lamp-colors-v1'
  // Reattach the color hook if the quality policy replaces Standard with Lambert.
  let atlas, image, alive=true
  if(canvasTex){
    let ctx
    atlas=canvasTex(2048,1024,c=>{
      ctx=c;c.fillStyle='#193747';c.fillRect(0,0,2048,1024);c.fillStyle='#f5e7c5';c.textAlign='center';c.textBaseline='middle'
      c.font='bold 74px Arial';c.fillText('Dr.life+',512,400);c.font='28px Arial';c.fillText('DELIVERY  /  LOGISTICS',512,475)
      fleet.forEach((f,i)=>{const y=i*102;c.fillStyle='#d6bd86';c.fillRect(1050,y+4,966,65);c.fillStyle='#193747';c.font='bold 48px Arial';c.fillText(f.number,1536,y+38);c.fillStyle='#ffffe8';c.font='bold 26px Arial';c.fillText(f.id+' · 示意',1536,y+87)})
    })
    atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8
    if(ctx && typeof Image!=='undefined'){
      image=new Image();image.onload=()=>{if(!alive)return;ctx.drawImage(image,175,40,674,325);atlas.needsUpdate=true;group.userData.logoLoaded=true};image.src='./assets/logo.png'
    }
    const pos=[],uv=[],index=[]
    const panel=(f,x,y,z,w,h,axis,cell)=>{
      const points=axis==='side'?[[-w/2,-h/2,0],[w/2,-h/2,0],[w/2,h/2,0],[-w/2,h/2,0]]:[[0,-h/2,w/2],[0,-h/2,-w/2],[0,h/2,-w/2],[0,h/2,w/2]]
      if(axis==='side'&&z<0)points.forEach(p=>p[0]*=-1)
      if(axis==='end'&&x<0)points.forEach(p=>p[2]*=-1)
      const n=pos.length/3,m=matrices[f],q=new T.Vector3();for(const a of points){q.set(x+a[0],y+a[1],z+a[2]).applyMatrix4(m);pos.push(q.x,q.y,q.z)}
      const [u0,v0,u1,v1]=cell;uv.push(u0,v0,u1,v0,u1,v1,u0,v1);index.push(n,n+1,n+2,n,n+2,n+3)
    }
    fleet.forEach((f,i)=>{
      const logo=[0,.5,.5,1],number=[.6953125,1-(69+i*102)/1024,.8046875,1-(4+i*102)/1024],idCell=[.625,1-(101+i*102)/1024,.875,1-(73+i*102)/1024]
      for(const z of [-1.25,1.25]){panel(i,1.1,2.20,z,3.5,1.6,'side',logo);panel(i,1.1,3.15,z,2.6,.16,'side',idCell)}
      panel(i,3.989,2.22,0,1.5,.75,'end',logo)
      panel(i,-4,.64,0,.70,.19,'end',number)
      for(const z of [-1.141,1.141])panel(i,-2.85,1.50,z,.69,.19,'side',number)
    })
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals()
    const m=new T.Mesh(g,new T.MeshBasicMaterial({map:atlas,side:T.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));m.name='wh-r1-truck-livery';m.userData={noMerge:true,fleet,logo:'assets/logo.png'};group.add(m);meshes.push(m)
  }
  const state=fleet.map(()=>({near:false,blend:0})),position=new T.Vector3()
  group.userData.trucks={fleet,parts,lod:{enter:32,exit:40,fadeSeconds:.45},mirrorsBeyondEnvelope:.25,dimensions:{cabLength:2,gap:.2,cargoLength:5.8,cabWidth:2.26,cabTop:2.8,cargoTop:3.4,cargoFloor:1.05,frontSlopeDeg:6,bevelRadius:.12,wheelbase:4.6,frontOverhang:1.2,rearOverhang:2.2,tyreDiameter:.9,tyreSegments:24},rearDoors:'CLOSED',lights:'EMISSIVE_ONLY'}
  return {
    onFrame(dt,{camera}={}){
      const low=quality?.tier==='low',night=Math.max(0,Math.min(1,(env||globalThis.__office?.env3d)?.night||0))
      light.material.emissiveIntensity=night*1.6
      if(light.material.onBeforeCompile!==lampShader){light.material.polygonOffset=true;light.material.polygonOffsetFactor=-1;light.material.polygonOffsetUnits=-1;light.material.onBeforeCompile=lampShader;light.material.customProgramCacheKey=()=> 'wh-truck-lamp-colors-v1';light.material.needsUpdate=true}
      if(camera){camera.getWorldPosition(position);fleet.forEach((f,i)=>{const s=state[i],d=position.distanceTo(new T.Vector3(f.x,WH_R1_FLOOR_Y+1.7,f.z));s.near=!low&&(s.near?d<40:d<32);s.blend=low?0:T.MathUtils.clamp(s.blend+(s.near?1:-1)*Math.min(.1,dt)/.45,0,1)})}
      // Compact only visible detail instances: fragment discard alone still submits all nine trucks.
      let active=0;const activeIds=[]
      state.forEach((s,i)=>{if(s.blend>0){detail.setMatrixAt(active,matrices[i]);detailFade.setX(active,s.blend);activeIds.push(fleet[i].id);active++}})
      detail.count=active;detail.visible=active>0;detail.userData.instanceToRegisterId=activeIds;detail.instanceMatrix.needsUpdate=true;detailFade.needsUpdate=true;detail.boundingSphere=null
      for(const b of baseFades){b.rows.forEach((r,i)=>{const j=fleet.findIndex(f=>f.id===r.id);b.fade.setX(i,-1-(j<0?0:state[j].blend))});b.fade.needsUpdate=true}
      group.userData.trucks.state=state.map(s=>({...s}));group.userData.trucks.night=night
    },
    dispose(){alive=false;if(image)image.onload=null}
  }
}
