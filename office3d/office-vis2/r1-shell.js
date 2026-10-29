import { buildR1Site, r1World } from './r1-site.js'
import { buildR1Zones } from './r1-zones.js'

const frontIds = new Set(['00-W-005', '00-W-006', '00-W-007', '00-W-008', '00-W-009', '00-W-010'])
const localPoint = ([x, y]) => r1World([x, y])
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const r1Glazing = Object.freeze({ interiorOpacity: .2, exteriorOpacity: .5, exteriorRoughness: .65, interiorBand: .3, exteriorBand: .8, frameWidth: .04, maxFrameSpacing: 1.5 })

export const r1CornerSpec = Object.freeze({
  southeast: Object.freeze({ center: [24.3, 32.5], radius: 1.5, from: [24.3, 31], to: [25.8, 32.5] }),
  southwest: Object.freeze({ center: [31.7, 32.5], radius: 1.5, from: [30.2, 32.5], to: [31.7, 31] }),
})

const leftFront = points => points.filter(([x]) => x <= 21)
const frontLength = points => points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0)

// The profile follows accumulated front-arc length, not the local x coordinate.
export function r1FrontHeight(localX, walls) {
  if (localX >= 21 && localX <= 35) return 1.2
  const left = leftFront(walls.filter(wall => ['00-W-005', '00-W-006'].includes(wall.id)).flatMap(wall => wall.geometry.points.slice(wall.id === '00-W-005' ? 0 : 1)))
  const length = frontLength(left)
  const mirroredX = localX > 35 ? 56 - localX : localX
  let walked = 0
  for (let i = 1; i < left.length; i++) {
    const [a, b] = [left[i - 1], left[i]]
    if (mirroredX <= b[0] + 1e-9) {
      walked += distance(a, [mirroredX, a[1] + (b[1] - a[1]) * (mirroredX - a[0]) / (b[0] - a[0])])
      return 4.5 - 3.3 * walked / length
    }
    walked += distance(a, b)
  }
  return 1.2
}

const boxInstance = (THREE, x0, x1, z0, z1, height, thickness, vertical = false) => {
  const matrix = new THREE.Matrix4()
  const w = vertical ? thickness : Math.hypot(x1 - x0, z1 - z0)
  const d = vertical ? Math.hypot(x1 - x0, z1 - z0) : thickness
  const angle = Math.atan2(z1 - z0, x1 - x0)
  matrix.compose(new THREE.Vector3((x0 + x1) / 2, height / 2, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle), new THREE.Vector3(w, height, d))
  return matrix
}

const addInstanced = (THREE, root, name, entries, material) => {
  if (!entries.length) return null
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length)
  entries.forEach((entry, index) => mesh.setMatrixAt(index, entry.matrix))
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = name
  mesh.userData.dynamic = true
  mesh.userData.wallIds = entries.map(entry => entry.id)
  // 带门洞的墙被切成多段，每段一个实例；partIds 让每个实例还能单独定位，wallIds 仍然是台账用的墙 ID。
  mesh.userData.partIds = entries.map(entry => entry.partId ?? entry.id)
  mesh.userData.faceIds = entries.flatMap(entry => entry.faceIds)
  root.add(mesh)
  return mesh
}

const groupFaces = faces => faces.reduce((groups, face) => {
  ;(groups[face.wallId] ||= []).push(face)
  return groups
}, {})

function joinedSurfaces(THREE, parts) {
  const vertices = [], normals = [], ranges = []
  for (const { id, geometry } of parts) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry, start = vertices.length / 3
    vertices.push(...source.attributes.position.array); normals.push(...source.attributes.normal.array)
    ranges.push({ id, start, count: source.attributes.position.count }); if (source !== geometry) source.dispose(); geometry.dispose()
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return { geometry, ranges }
}

function thickPathsGeometry(THREE, paths, thickness, heightAt = () => 2.7) {
  const positions = [], indices = []
  const add = (a, b, c, d) => indices.push(a, b, c, a, c, d)
  for (const path of paths) {
    if (path.points.length < 2) continue
    const nodes = path.points.map(localPoint)
    const offsets = nodes.map((point, index) => {
      const before = nodes[Math.max(0, index - 1)], after = nodes[Math.min(nodes.length - 1, index + 1)]
      const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1
      return { x: -dz / length * thickness / 2, z: dx / length * thickness / 2 }
    })
    const base = positions.length / 3
    nodes.forEach((point, index) => {
      const { x, z } = offsets[index], [localX, localY] = path.points[index]
      const outerHeight = heightAt([localX + x, localY]), innerHeight = heightAt([localX - x, localY])
      positions.push(point.x + x, 0, point.z + z, point.x - x, 0, point.z - z, point.x + x, outerHeight, point.z + z, point.x - x, innerHeight, point.z - z)
    })
    for (let index = 0; index < nodes.length - 1; index++) {
      const a = base + index * 4, b = a + 4
      add(a, b, b + 2, a + 2) // outer
      add(a + 1, a + 3, b + 3, b + 1) // inner
      add(a + 2, b + 2, b + 3, a + 3) // top
      add(a, a + 1, b + 1, b) // bottom
    }
    const first = base, last = base + (nodes.length - 1) * 4
    add(first, first + 2, first + 3, first + 1)
    add(last, last + 1, last + 3, last + 2)
  }
  const geometry = new THREE.BufferGeometry()
  const normals = []
  for (let index = 0; index < positions.length; index += 12) {
    const a = new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2])
    const b = new THREE.Vector3(positions[index + 3], positions[index + 4], positions[index + 5])
    const c = new THREE.Vector3(positions[index + 6], positions[index + 7], positions[index + 8])
    const normal = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize()
    for (let vertex = 0; vertex < 4; vertex++) normals.push(normal.x, normal.y, normal.z)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  return geometry
}

function frontGeometry(THREE, walls) {
  const byId = Object.fromEntries(walls.filter(wall => frontIds.has(wall.id)).map(wall => [wall.id, wall]))
  const join = ids => ids.flatMap((id, index) => byId[id].geometry.points.slice(index ? 1 : 0))
  const paths = [{ points: join(['00-W-005', '00-W-006', '00-W-009']) }, { points: join(['00-W-010', '00-W-007', '00-W-008']) }]
  return { paths, geometry: thickPathsGeometry(THREE, paths, .2, point => r1FrontHeight(point[0], walls)), ids: [...frontIds] }
}


export const r1FenceSpec = Object.freeze({ baseHeight: .3, thickness: .2, finWidth: .012, finDepth: .06, spacing: .18, bottomRailHeight: .03, bottomRailDepth: .07, topRailHeight: .04, topRailDepth: .08, pillarZ: 18.15, planterGap: .02, seed: 7 })
export const r1FenceSigns = Object.freeze([
  Object.freeze({ text: '吴哥远望启新程', localX: 24.25, y: 2.1, width: .38, height: 2.4, vertical: true }),
  Object.freeze({ text: '湄水长流通四海', localX: 31.75, y: 2.1, width: .38, height: 2.4, vertical: true }),
  Object.freeze({ text: '智序工场', localX: 28, y: 3.8, width: 2.2, height: .34, vertical: false }),
])
export function r1FenceHeight(localX, walls) {
  const t = Math.max(0, Math.min(1, (r1FrontHeight(localX, walls) - 1.2) / 3.3))
  return 1.2 + 1.8 * t * t * (3 - 2 * t)
}

function buildFrontFence(THREE, shell, front, faces, walls, opaque, collision) {
  const spec = r1FenceSpec, height = x => r1FenceHeight(x + 26, walls)
  const bronze = new THREE.MeshStandardMaterial({ color: '#9A7B52', metalness: .75, roughness: .32 })
  const stone = new THREE.MeshStandardMaterial({ color: '#BDB3A3', roughness: .85 })
  const plants = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85, flatShading: true })
  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 })
  const metalRows = [], stoneParts = [], planterParts = [], shrubs = [], proxies = [], meshes = [], boxes = []
  const matrix = (x, y, z, w, h, d, dx = 1, dz = 0) => new THREE.Matrix4().set(dx*w,0,-dz*d,x,0,h,0,y,dz*w,0,dx*d,z,0,0,0,1)
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0)
  const proxy = (name, geometry) => { const m = new THREE.Mesh(geometry, opaque); m.name = name; m.visible = false; m.userData = { dynamic: true, wallIds: front.ids, faceIds: faces }; shell.add(m); proxies.push(m) }
  const stoneBox = (id, x, y, z, w, h, d, collide = false) => {
    const geometry = unit.clone().applyMatrix4(matrix(x,y,z,w,h,d)); stoneParts.push({ id, geometry })
    boxes.push({ id, min: [x-w/2,y,z-d/2], max: [x+w/2,y+h,z+d/2] })
    if (collide) proxy('r1-collision-'+id, geometry.clone())
  }
  // Crop only the visible fence: the original closed front collision profile stays intact.
  const cropped = front.paths.map((path, side) => ({ points: path.points.filter(([x]) => side === 0 ? x < 24 : x > 32).map(p => [...p]) }))
  cropped[0].points.push([24,0]); cropped[1].points.unshift([32,0])
  stoneParts.push({ id: 'plinth', geometry: thickPathsGeometry(THREE, cropped, .2, () => .3) })
  const corners = [-1,1].flatMap(x => [-1,1].flatMap(z => [0,1].map(y => ({x,y,z}))))
  const metalBox = (kind, p, w, h, d, bottom, top, extra = {}) => {
    const m = matrix(p.x,bottom,p.z,w,h,d,p.dx,p.dz), tilt = corners.map(c => {
      if (!top) return 0
      const x = p.x + p.dx*w*c.x/2 - p.dz*d*c.z/2
      const target = c.y ? top(x) : kind === 'top' ? top(x)-h : bottom
      return (target - bottom - c.y*h) / h
    })
    metalRows.push({ kind, matrix:m, tilt, ...extra })
  }
  let seed=spec.seed; const random=()=> (seed=seed*16807%2147483647)/2147483647
  const greens=['#3F7A3A','#4E8B41','#2F6B3A','#5C9447','#6FA052']
  for (const [side,path] of cropped.entries()) {
    const nodes=path.points.map(localPoint), segments=[]; let length=0
    for(let i=1;i<nodes.length;i++){const a=nodes[i-1],b=nodes[i],span=Math.hypot(b.x-a.x,b.z-a.z);segments.push({a,b,span,start:length,dx:(b.x-a.x)/span,dz:(b.z-a.z)/span});length+=span}
    const at = distance => {const s=segments.find(s=>distance<=s.start+s.span+1e-9)||segments.at(-1);return {...s,x:s.a.x+s.dx*(distance-s.start),z:s.a.z+s.dz*(distance-s.start)}}
    const count=Math.round((length-.04)/spec.spacing)
    for(let i=0;i<=count;i++){const distance=.02+i*(length-.04)/count,p=at(distance);metalBox('fin',p,spec.finWidth,height(p.x)-.34,spec.finDepth,.3,x=>height(x)-.04,{path:side,distance})}
    for(const s of segments){const p={...s,x:(s.a.x+s.b.x)/2,z:(s.a.z+s.b.z)/2};metalBox('bottom',p,s.span,.03,.07,.315,null,{path:side});metalBox('top',p,s.span,.04,.08,height(p.x)-.04,height,{path:side})}
    // Offset a continuous path outwards; retain a 20 mm gap at the gate-pillar outer edge.
    const bedPath=path.points.map(p=>[...p]); if(side===0)bedPath.at(-1)[0]-=.02;else bedPath[0][0]+=.02
    const bedNodes=bedPath.map(localPoint), offset=bedNodes.map((p,i)=>{const a=bedNodes[Math.max(0,i-1)],b=bedNodes[Math.min(i+1,bedNodes.length-1)],l=Math.hypot(b.x-a.x,b.z-a.z);return {x:-(b.z-a.z)/l,z:(b.x-a.x)/l}})
    const shifted={points:bedPath.map(([x,y],i)=>[x+offset[i].x*.5,y-offset[i].z*.5])}
    const body=thickPathsGeometry(THREE,[shifted],.6,()=>.42), soil=thickPathsGeometry(THREE,[shifted],.5,()=>.02).translate(0,.42,0)
    for(const [id,geometry,color] of [['planter-'+side,body,'#8E877C'],['soil-'+side,soil,'#4A3A2C']]){
      const source=geometry.index?geometry.toNonIndexed():geometry, c=new THREE.Color(color), colors=new Float32Array(source.attributes.position.count*3)
      for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b}
      source.setAttribute('color',new THREE.BufferAttribute(colors,3));planterParts.push({id,geometry:source});if(source!==geometry)geometry.dispose()
    }
    // Ordinary Mesh segments keep the curved planter solid for the capsule collision library.
    const shiftedNodes=shifted.points.map(localPoint)
    for(let i=1;i<shiftedNodes.length;i++){const a=shiftedNodes[i-1],b=shiftedNodes[i],l=Math.hypot(b.x-a.x,b.z-a.z),m=matrix((a.x+b.x)/2,0,(a.z+b.z)/2,l,.42,.6,(b.x-a.x)/l,(b.z-a.z)/l);proxy(`fence-planter-${side}-${i}`,unit.clone().applyMatrix4(m))}
    for(let distance=.3;distance<length-.5;distance+=.5+random()*.25){const p=at(distance),r=.26+random()*.16,off=.5+(random()-.5)*.12,m=new THREE.Matrix4().compose(new THREE.Vector3(p.x-p.dz*off,.44+r*.55,p.z+p.dx*off),new THREE.Quaternion().setFromEuler(new THREE.Euler(random(),random()*6,random())),new THREE.Vector3(r,r*(.75+random()*.3),r));shrubs.push({matrix:m,color:greens[Math.floor(random()*greens.length)]})}
  }
  for(const x of [-1.75,5.75]){stoneBox('fence-pillar-'+x,x,0,spec.pillarZ,.5,3.6,.5,true);metalBox('cap',{x,z:spec.pillarZ,dx:1,dz:0},.62,.12,.62,4,null)}
  stoneBox('fence-lintel',2,3.6,spec.pillarZ,8,.4,.5)
  const joined = joinedSurfaces(THREE,stoneParts), stoneMesh = new THREE.Mesh(joined.geometry,stone)
  stoneMesh.name='r1-fence-stone';stoneMesh.userData.ranges=joined.ranges;stoneMesh.userData.boxes=boxes;meshes.push(stoneMesh)
  // Eight corner offsets cut both faces of each top strip to the smooth profile in one batch.
  const position=unit.attributes.position;unit.morphTargetsRelative=true
  unit.morphAttributes.position=corners.map(c=>{const values=new Float32Array(position.count*3);for(let i=0;i<position.count;i++)if(Math.sign(position.getX(i))===c.x&&Math.sign(position.getZ(i))===c.z&&Math.round(position.getY(i))===c.y)values[i*3+1]=1;return new THREE.Float32BufferAttribute(values,3)})
  const metal=new THREE.InstancedMesh(unit,bronze,metalRows.length);metal.name='r1-fence-metal';metalRows.forEach((r,i)=>{metal.setMatrixAt(i,r.matrix);metal.setMorphAt(i,{morphTargetInfluences:r.tilt})});metal.morphTexture.needsUpdate=true;metal.userData.parts=metalRows.map(({matrix,...r})=>r);meshes.push(metal)
  const planterGeometry=new THREE.BufferGeometry()
  for(const attr of ['position','normal','color']){const values=[];for(const row of planterParts)values.push(...row.geometry.attributes[attr].array);planterGeometry.setAttribute(attr,new THREE.Float32BufferAttribute(values,3))}
  planterParts.forEach(p=>p.geometry.dispose());const planter=new THREE.Mesh(planterGeometry,concrete);planter.name='r1-fence-planters';meshes.push(planter)
  const leaves=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),plants,shrubs.length);leaves.name='r1-fence-shrubs';shrubs.forEach((r,i)=>{leaves.setMatrixAt(i,r.matrix);leaves.setColorAt(i,new THREE.Color(r.color))});meshes.push(leaves)
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const ctx=canvas.getContext('2d'),rects=[[0,0,256,1600],[256,0,256,1600],[512,0,1536,240]],pos=[],uv=[],normal=[],indices=[]
  r1FenceSigns.forEach((sign,i)=>{
    const [x,y,w,h]=rects[i];ctx.fillStyle='#3A2E26';ctx.fillRect?.(x,y,w,h);ctx.strokeStyle='#B8955A';ctx.lineWidth=8;ctx.strokeRect?.(x+8,y+8,w-16,h-16);ctx.fillStyle='#E2C07A';ctx.font=`bold ${sign.vertical?190:180}px "KaiTi", "STKaiti", "Kaiti SC", serif`;ctx.textAlign='center';ctx.textBaseline='middle'
    ;[...sign.text].forEach((ch,j)=>ctx.fillText(ch,sign.vertical?x+w/2:x+w*(j+.5)/sign.text.length,sign.vertical?y+h*(j+.5)/sign.text.length:y+h/2))
    const cx=sign.localX-26,cy=sign.y,z=spec.pillarZ+.251,b=pos.length/3;pos.push(cx-sign.width/2,cy-sign.height/2,z,cx+sign.width/2,cy-sign.height/2,z,cx+sign.width/2,cy+sign.height/2,z,cx-sign.width/2,cy+sign.height/2,z);normal.push(0,0,1,0,0,1,0,0,1,0,0,1);uv.push(x/2048,1-(y+h)/2048,(x+w)/2048,1-(y+h)/2048,(x+w)/2048,1-y/2048,x/2048,1-y/2048);indices.push(b,b+1,b+2,b,b+2,b+3)
  })
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8
  const signGeometry=new THREE.BufferGeometry();signGeometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));signGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));signGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));signGeometry.setIndex(indices)
  const signMaterial=new THREE.MeshStandardMaterial({map:texture,metalness:.35,roughness:.5}),signs=new THREE.Mesh(signGeometry,signMaterial);signs.name='r1-fence-signs';signs.userData.signs=r1FenceSigns;meshes.push(signs)
  for(const mesh of meshes){Object.assign(mesh.userData,{dynamic:true,wallIds:front.ids,faceIds:faces});mesh.castShadow=true;mesh.receiveShadow=true;shell.add(mesh)}
  return {proxies, dispose(){proxies.forEach(p=>{collision?.remove?.(p);p.geometry.dispose();p.removeFromParent()});meshes.forEach(m=>{m.geometry.dispose();if(m.isInstancedMesh)m.dispose()});for(const m of [bronze,stone,plants,concrete,signMaterial])m.dispose();texture.dispose()}}
}

// 门洞把一段直墙切成若干实体段；没有 openings 的墙照旧返回原来的一段，端点逐值不变。
export function wallSolidSpans(points, openings) {
  if (!openings?.length) return [points]
  const start = points[0], end = points.at(-1)
  const along = ([x, y]) => (x - start[0]) * (end[0] - start[0]) + (y - start[1]) * (end[1] - start[1])
  const sorted = [...openings].sort((a, b) => along(a.fromM) - along(b.fromM))
  const spans = []
  let cursor = start
  for (const opening of sorted) {
    if (along(opening.fromM) - along(cursor) > 1e-9) spans.push([cursor, opening.fromM])
    cursor = opening.toM
  }
  if (along(end) - along(cursor) > 1e-9) spans.push([cursor, end])
  return spans
}

export function r1WallPlan(layout) {
  const walls = layout.r1.data.walls
  const faceIds = groupFaces(layout.r1.data.wallFaces)
  const straight = []
  for (const wall of walls) {
    if (frontIds.has(wall.id)) continue
    let points = wall.geometry.points
    if (wall.id === '00-W-021') points = [[15.6, 31], [24.3, 31]]
    if (wall.id === '00-W-016') points = [[30.2, 32.5], [30.2, 43]]
    const spans = wallSolidSpans(points, wall.geometry.openings)
    spans.forEach((span, index) => straight.push({ id: wall.id, partId: spans.length > 1 ? `${wall.id}-P${index + 1}` : wall.id, exterior: wall.geometry.exterior, height: wall.geometry.height, thickness: wall.geometry.thickness, points: span, faceIds: (faceIds[wall.id] || []).map(face => face.id) }))
  }
  return { straight, front: walls.filter(wall => frontIds.has(wall.id)), faces: faceIds }
}

const curvePoints = (center, start, end, count = 12) => {
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]), a1 = Math.atan2(end[1] - center[1], end[0] - center[0])
  let delta = a1 - a0
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = a0 + delta * index / count
    return [center[0] + 1.5 * Math.cos(angle), center[1] + 1.5 * Math.sin(angle)]
  })
}

const doorAxis = door => door.facingLocal[0] ? 'vertical' : 'horizontal'
const doorFrameEntries = (THREE, door) => {
  const { x, z } = localPoint([door.xM, door.yM]), span = door.lengthM, height = door.heightM, vertical = doorAxis(door) === 'vertical'
  const box = (w, h, d, px, py, pz) => ({ id: door.id, faceIds: [], matrix: new THREE.Matrix4().makeScale(w, h, d).setPosition(px, py, pz) })
  return vertical
    ? [box(.1, height, .1, x, height / 2, z - span / 2), box(.1, height, .1, x, height / 2, z + span / 2), box(.1, .1, span, x, height - .05, z)]
    : [box(.1, height, .1, x - span / 2, height / 2, z), box(.1, height, .1, x + span / 2, height / 2, z), box(span, .1, .1, x, height - .05, z)]
}

export function buildR1Shell({ THREE, root, layout, collision }) {
  const shell = new THREE.Group()
  shell.name = 'r1-shell-root'
  // mergeStatic honours dynamic ancestors; this retains the wall/face ledger after the app-wide merge.
  shell.userData.dynamic = true
  const opaque = new THREE.MeshStandardMaterial({ color: '#DED4C5', roughness: .78 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#DDE8EA', transparent: true, opacity: .24, roughness: .12, depthWrite: false })
  const innerGlassMaterial = new THREE.MeshPhysicalMaterial({ color: '#DDE8EA', transparent: true, opacity: r1Glazing.interiorOpacity, roughness: .12, depthWrite: false })
  const outerGlassMaterial = new THREE.MeshPhysicalMaterial({ color: '#9AAEB7', transparent: true, opacity: r1Glazing.exteriorOpacity, roughness: r1Glazing.exteriorRoughness, depthWrite: false })
  const bandMaterial = new THREE.MeshStandardMaterial({ color: '#EAE8E0', roughness: .8 })
  const frame = new THREE.MeshStandardMaterial({ color: '#705735', roughness: .45, metalness: .55 })
  const plan = r1WallPlan(layout), outerGlass = [], innerSolid = [], lowGlass = []
  for (const entry of plan.straight) {
    const [start, end] = entry.points.map(localPoint)
    const item = { ...entry, matrix: boxInstance(THREE, start.x, end.x, start.z, end.z, entry.height, entry.thickness) }
    if (entry.exterior) outerGlass.push(item)
    else if (entry.height === 1.2) lowGlass.push(item)
    else innerSolid.push(item)
  }
  const exteriorFrames = outerGlass.flatMap(entry => {
    const [start, end] = entry.points.map(localPoint), height = entry.height
    const upright = (point, index) => ({ id: `${entry.id}-frame-${index}`, faceIds: entry.faceIds, matrix: new THREE.Matrix4().makeScale(.05, height, .05).setPosition(point.x, height / 2, point.z) })
    return [upright(start, 0), upright(end, 1),
      { id: `${entry.id}-frame-base`, faceIds: entry.faceIds, matrix: boxInstance(THREE, start.x, end.x, start.z, end.z, .05, .05) },
      { id: `${entry.id}-frame-top`, faceIds: entry.faceIds, matrix: new THREE.Matrix4().copy(boxInstance(THREE, start.x, end.x, start.z, end.z, .05, .05)).premultiply(new THREE.Matrix4().makeTranslation(0, height - .05, 0)) }]
  })
  const partitions = innerSolid.filter(entry => entry.id !== '00-W-036'), tops = [], partitionFrames = []
  const layer = (entry, base, height) => { const [a, b] = entry.points.map(localPoint); return { ...entry, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, height, entry.thickness).premultiply(new THREE.Matrix4().makeTranslation(0, base, 0)) } }
  for (const entry of [...outerGlass, ...partitions]) {
    const height = entry.exterior ? r1Glazing.exteriorBand : r1Glazing.interiorBand
    tops.push({ id: entry.partId ?? entry.id, wallId: entry.id, geometry: new THREE.BoxGeometry(1, 1, 1).applyMatrix4(layer(entry, entry.height - height, height).matrix) })
  }
  for (const entry of partitions) {
    const [a, b] = entry.points.map(localPoint), length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, count = Math.ceil(length / r1Glazing.maxFrameSpacing), width = r1Glazing.frameWidth
    for (let index = 0; index <= count; index++) {
      // Clip endpoint uprights at the wall-end plane; no new solid projects beyond the original wall.
      const lo = Math.max(0, index / count * length - width / 2), hi = Math.min(length, index / count * length + width / 2)
      partitionFrames.push({ id: entry.id, faceIds: entry.faceIds, matrix: boxInstance(THREE, a.x + dx * lo, a.x + dx * hi, a.z + dz * lo, a.z + dz * hi, entry.height - r1Glazing.interiorBand, width) })
    }
    partitionFrames.push({ id: entry.id, faceIds: entry.faceIds, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, width, width) })
  }
  const walls = [
    addInstanced(THREE, shell, 'r1-exterior-glass', outerGlass.map(entry => layer(entry, 0, entry.height - r1Glazing.exteriorBand)), outerGlassMaterial),
    addInstanced(THREE, shell, 'r1-exterior-frames', exteriorFrames, frame),
    addInstanced(THREE, shell, 'r1-interior-walls', innerSolid.filter(entry => entry.id === '00-W-036'), opaque),
    addInstanced(THREE, shell, 'r1-interior-glass', partitions.map(entry => layer(entry, 0, entry.height - r1Glazing.interiorBand)), innerGlassMaterial),
    addInstanced(THREE, shell, 'r1-low-glass', lowGlass, glass),
  ].filter(Boolean)
  const front = frontGeometry(THREE, plan.front)
  const frontWall = new THREE.Mesh(front.geometry, opaque)
  frontWall.name = 'r1-collision-front'; frontWall.visible = false; frontWall.userData.dynamic = true; frontWall.userData.wallIds = front.ids; frontWall.userData.faceIds = plan.front.flatMap(wall => plan.faces[wall.id].map(face => face.id)); shell.add(frontWall)
  const fence = buildFrontFence(THREE, shell, front, frontWall.userData.faceIds, plan.front, opaque, collision)
  const cornerPaths = [
    { points: curvePoints(r1CornerSpec.southeast.center, r1CornerSpec.southeast.from, r1CornerSpec.southeast.to) },
    { points: curvePoints(r1CornerSpec.southwest.center, r1CornerSpec.southwest.from, r1CornerSpec.southwest.to) },
  ]
  const cornerGeometry = thickPathsGeometry(THREE, cornerPaths, .1, () => 2.7 - r1Glazing.interiorBand)
  const cornerWall = new THREE.Mesh(cornerGeometry, innerGlassMaterial)
  cornerWall.name = 'r1-corner-walls'; cornerWall.userData.dynamic = true; cornerWall.userData.wallIds = ['00-W-021', '00-W-016']; cornerWall.userData.faceIds = [...plan.faces['00-W-021'], ...plan.faces['00-W-016']].map(face => face.id); shell.add(cornerWall)
  cornerPaths.forEach((path, index) => {
    const id = cornerWall.userData.wallIds[index], faceIds = plan.faces[id].map(face => face.id)
    tops.push({ id, wallId: id, geometry: thickPathsGeometry(THREE, [path], .1, () => r1Glazing.interiorBand).translate(0, 2.7 - r1Glazing.interiorBand, 0) })
    const points = path.points.map(localPoint), width = r1Glazing.frameWidth
    for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; partitionFrames.push({ id, faceIds, matrix: boxInstance(THREE, a.x, b.x, a.z, b.z, width, width) }) }
    for (const i of [0, 6, 12]) {
      const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(12, i + 1)], length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length, lo = i === 0 ? 0 : -width / 2, hi = i === 12 ? 0 : width / 2
      partitionFrames.push({ id, faceIds, matrix: boxInstance(THREE, p.x + lo * dx, p.x + hi * dx, p.z + lo * dz, p.z + hi * dz, 2.7 - r1Glazing.interiorBand, width) })
    }
  })
  const bands = joinedSurfaces(THREE, tops), topBands = new THREE.Mesh(bands.geometry, bandMaterial)
  topBands.name = 'r1-top-bands'; topBands.userData = { dynamic: true, wallIds: tops.map(row => row.wallId), partIds: tops.map(row => row.id), faceIds: tops.flatMap(row => plan.faces[row.wallId].map(face => face.id)), ranges: bands.ranges }; shell.add(topBands)
  const innerFrames = addInstanced(THREE, shell, 'r1-interior-frames', partitionFrames, frame)
  addInstanced(THREE, shell, 'r1-door-frames', layout.r1.data.doors.flatMap(door => doorFrameEntries(THREE, door)), frame)
  const site = buildR1Site({ THREE, root: shell, layout })
  const zones = buildR1Zones({ THREE, root: shell, layout })
  const collisions = []
  for (const entry of [...outerGlass, ...innerSolid, ...lowGlass]) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), opaque)
    proxy.name = `r1-collision-${entry.partId ?? entry.id}`; proxy.visible = false; proxy.userData.dynamic = true; entry.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale)
    shell.add(proxy); collision?.add?.(proxy, 'r1-wall'); collisions.push(proxy)
  }
  const cornerProxy = new THREE.Mesh(thickPathsGeometry(THREE, cornerPaths, .1), opaque)
  cornerProxy.name = 'r1-collision-corners'; cornerProxy.visible = false; cornerProxy.userData = { dynamic: true, wallIds: cornerWall.userData.wallIds, faceIds: cornerWall.userData.faceIds }; shell.add(cornerProxy)
  for (const collider of [frontWall, cornerProxy]) { collision?.add?.(collider, 'r1-wall'); collisions.push(collider) }
  for (const proxy of fence.proxies) collision?.add?.(proxy, 'r1-wall')
  root.add(shell)
  const allWallIds = [...new Set([...plan.straight.map(entry => entry.id), ...front.ids, '00-W-021', '00-W-016'])]
  return {
    root: shell,
    ground: site.floor,
    walls: { userData: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id) } },
    wallLedger: { wallIds: allWallIds, faceIds: layout.r1.data.wallFaces.map(face => face.id), doorIds: layout.r1.data.doors.map(door => door.id) },
    onFrame() {},
    dispose() { collisions.forEach(proxy => { collision?.remove?.(proxy); if (proxy.name.startsWith('r1-collision-')) proxy.removeFromParent() }); site.dispose(); zones.dispose(); fence.dispose(); front.geometry.dispose(); cornerGeometry.dispose(); cornerProxy.geometry.dispose(); bands.geometry.dispose(); innerFrames.geometry.dispose(); innerGlassMaterial.dispose(); outerGlassMaterial.dispose(); bandMaterial.dispose(); opaque.dispose(); glass.dispose(); frame.dispose(); shell.removeFromParent() },
  }
}
