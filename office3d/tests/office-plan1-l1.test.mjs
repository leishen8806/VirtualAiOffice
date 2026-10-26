import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, resolveOfficeLayout, workHome } from '../office-layout.js'
import { OFFICE_PLAN1_REGIONS, OFFICE_PLAN1_SEATS, OFFICE_PLAN1_WALLS, officePlan1Reception, officePlan1SouthHeight } from '../office-plan1-layout.js'
import { buildOfficeShellV3, buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { buildOfficeAlignedShell } from '../office-vis2/shell-finish.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { buildOfficePlazaHost } from '../office-vis2/plaza-host.js'
import { receptionBackdrop } from '../office-vis2/foyer.js'
import { buildOfficeBrandMarks } from '../office-vis2/brand.js'
import { buildOfficeVis2Frontage } from '../office-vis2/frontage.js'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const pointInPolygon = (point, polygon) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}
const lineCrosses = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return abC * abD < -1e-8 && cdA * cdB < -1e-8
}
const segmentHitsBox = (a, b, box) => {
  let lo = 0, hi = 1
  for (const axis of ['x', 'z']) {
    const delta = b[axis] - a[axis]
    if (Math.abs(delta) < 1e-10) { if (a[axis] <= box[axis + '0'] || a[axis] >= box[axis + '1']) return false; continue }
    const p = (box[axis + '0'] - a[axis]) / delta, q = (box[axis + '1'] - a[axis]) / delta
    lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q))
    if (lo >= hi) return false
  }
  return hi > 0 && lo < 1
}
const workstationBox = station => {
  const halfX = Math.abs(Math.cos(station.yaw)) * .7 + Math.abs(Math.sin(station.yaw)) * .35
  const halfZ = Math.abs(Math.sin(station.yaw)) * .7 + Math.abs(Math.cos(station.yaw)) * .35
  return { x0: station.x - halfX, x1: station.x + halfX, z0: station.z - halfZ, z1: station.z + halfZ }
}

test('L1 is selected only by the exact ALIGN sample query and preserves every frozen fallback', () => {
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1'), LAYOUT_V3_ALIGN_SAMPLE)
  for (const search of ['', '?layout=2', '?layout=3', '?layout=3&align=1', '?layout=3&align=1&officeSample=0', '?layout=3&officeSample=1']) {
    assert.notEqual(resolveOfficeLayout(search), LAYOUT_V3_ALIGN_SAMPLE, search)
  }
  assert.equal(LAYOUT_V1, resolveOfficeLayout(''))
  assert.equal(LAYOUT_V2, resolveOfficeLayout('?layout=2'))
  assert.equal(LAYOUT_V3, resolveOfficeLayout('?layout=3'))
  assert.equal(LAYOUT_V3_ALIGN, resolveOfficeLayout('?layout=3&align=1'))
  assert.equal(LAYOUT_V3_ALIGN_SAMPLE.plan1Phase, 'L1')
})

test('L1 carries the approved 48x36 shell, 13 regions, curved product footprint and six-metre gate', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE
  assert.deepEqual(layout.envelope, { x0: -22, x1: 26, z0: -18, z1: 18 })
  assert.equal(layout.regions.length, 13)
  assert.deepEqual(layout.doors.south, { x0: -1, x1: 5, z: 18, width: 6, height: 3.5 })
  const product = layout.regions.find(region => region.id === 'product-eng-knowledge')
  assert.equal('rect' in product, false)
  assert.equal(product.footprint.length, 28)
  assert.deepEqual(layout.regions, OFFICE_PLAN1_REGIONS)
  const shell = buildOfficeShellV3Spec(layout)
  assert.equal(shell.outer.length, 31)
  assert.ok(shell.outer.some(wall => wall.a && wall.a.x !== wall.b.x && wall.a.z !== wall.b.z), 'entrance uses chorded arcs')
})

test('L1 hides legacy plaza objects until L3 so no outside object enters the office envelope', () => {
  const root = new THREE.Group(), registered = []
  const host = buildOfficePlazaHost({ THREE, root, layout: LAYOUT_V3_ALIGN_SAMPLE, search: '?officeSample=1', collision: { add: value => registered.push(value), remove() {} } })
  assert.deepEqual(host.placements, [])
  assert.equal(root.children.length, 0)
  assert.equal(registered.length, 0)
  for (const item of host.placements) assert.ok(item.bounds.z0 >= LAYOUT_V3_ALIGN_SAMPLE.envelope.z1, item.id)
  host.dispose()
})

test('R3 continuous south slopes have actual geometry, 0.1m caps and the existing camera cutaway', () => {
  const layout=LAYOUT_V3_ALIGN_SAMPLE, root=new THREE.Group(), shell=buildOfficeShellV3({THREE,root,layout})
  assert.deepEqual(layout.walls,OFFICE_PLAN1_WALLS)
  assert.deepEqual(layout.walls.outerSolid,{height:4.5,thickness:.18,capHeight:.1,finish:'#F4F1EA'})
  assert.equal(shell.windows,null)
  assert.equal(shell.facade.mesh.material.color.getHexString().toUpperCase(),'F4F1EA')
  const p=shell.facade.mesh.geometry.attributes.position
  // Downward ray samples the actual cap surface, not just the input profile.
  const measure=(x)=>{
    const state=shell.facade.states.find(s=>!['north','west','east'].includes(s.segment.side)&&x>=Math.min(s.segment.a.x,s.segment.b.x)-1e-5&&x<=Math.max(s.segment.a.x,s.segment.b.x)+1e-5)
    assert.ok(state,`south segment at ${x}`)
    const {a,b}=state.segment,z=a.z+(b.z-a.z)*(x-a.x)/(b.x-a.x)
    shell.facade.mesh.updateMatrixWorld(true)
    const hit=new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0)).intersectObject(shell.facade.mesh)[0]
    assert.ok(hit,`physical surface at ${x}`);return hit.point.y
  }
  for(const x of [-22,-15.2,-10,-4,8,14,19.2,26]){
    const expected=officePlan1SouthHeight(layout,x)
    assert.ok(Math.abs(measure(x)-expected-.1)<1e-4,`sloped wall/cap at ${x}`)
    assert.ok(Math.abs(officePlan1SouthHeight(layout,4-x)-expected)<1e-8)
  }
  const before=Array.from(p.array)
  for(const position of [{x:2,y:1.65,z:28},{x:-9.4,y:2.09,z:26.3},{x:2,y:66,z:43}]){
    shell.onFrame(1,{camera:{position}});assert.deepEqual(Array.from(p.array),before,'exterior near and 58-degree overview preserve heights')
  }
  for(const position of [{x:2,y:1.65,z:10},{x:2,y:1.65,z:60}]){
    shell.onFrame(1,{camera:{position}})
    assert.ok(Math.abs(measure(-3)-1)<1e-5,'low camera south height .9 plus cap .1')
  }
  shell.onFrame(1,{camera:{position:{x:2,y:1.65,z:28}}});assert.deepEqual(Array.from(p.array),before)
  for(const state of shell.facade.states.filter(s=>['north','east','west'].includes(s.segment.side)))assert.deepEqual(state.current,[4.5,4.5])
  shell.dispose();shell.dispose()
})

test('R3 reception wall, passable paired doors, pillars and collision volumes use the same geometry',()=>{
  const layout=LAYOUT_V3_ALIGN_SAMPLE,data=officePlan1Reception(layout),root=new THREE.Group(),registered=new Set()
  const other={};registered.add(other)
  const shell=buildOfficeShellV3({THREE,root,layout,collision:{add:p=>registered.add(p),remove:p=>registered.delete(p)}})
  assert.deepEqual(data.doors.map(d=>[d.x0,d.x1,d.height]),[[-2.6,0,2.7],[4,6.6,2.7]])
  assert.deepEqual([data.wall.x0,data.wall.x1,data.wall.height],[0,4,3])
  assert.equal(data.centerX,2)
  for(const c of data.columns){assert.ok(Math.abs(c.x1-c.x0-.8)<1e-8);assert.equal(c.height,3.6)}
  assert.ok(Math.abs(data.columns[0].x0+data.columns[1].x1-4)<1e-8)
  assert.equal(shell.reception.transparent.mesh.material.opacity,.35)
  assert.equal(shell.reception.proxies.length,data.blockers.length)
  shell.reception.proxies.forEach((mesh,i)=>{
    mesh.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),spec=data.blockers[i]
    for(const axis of ['x','z']){assert.ok(Math.abs(box.min[axis]-spec[axis+'0'])<1e-6);assert.ok(Math.abs(box.max[axis]-spec[axis+'1'])<1e-6)}
    assert.ok(Math.abs(box.max.y-spec.height)<1e-6)
  })
  for(const d of data.doors)for(const p of data.blockers)assert.equal(segmentHitsBox({x:(d.x0+d.x1)/2,z:6.5},{x:(d.x0+d.x1)/2,z:10},{x0:p.x0-.28,x1:p.x1+.28,z0:p.z0-.28,z1:p.z1+.28}),false)
  assert.deepEqual(layout.walls.gatePost,{width:.3,depth:.3,height:2.4,color:'#B89B64'})
  shell.dispose();shell.dispose();assert.deepEqual([...registered],[other])
  const rebuilt=buildOfficeShellV3({THREE,root,layout,collision:{add:p=>registered.add(p),remove:p=>registered.delete(p)}})
  rebuilt.dispose();assert.deepEqual([...registered],[other]);assert.equal(root.children.length,0)
})

test('R3 reception logo and lettering attach to the new solid wall, inside its height',()=>{
  const layout=LAYOUT_V3_ALIGN_SAMPLE, root=new THREE.Group(), backdrop=receptionBackdrop(layout.frontDesk,layout)
  assert.equal(backdrop.grille.faceZ,8.57);assert.equal(backdrop.top,3)
  const brands=buildOfficeBrandMarks({THREE,root,layout}), mark=brands.marks.find(m=>m.id==='reception-wall')
  assert.equal(mark.x,2);assert.equal(mark.yaw,0);assert.ok(Math.abs(mark.z-8.608)<1e-8)
  assert.ok(mark.y+mark.height/2+.07<backdrop.top)
  const frontage=buildOfficeVis2Frontage({THREE,root,layout,includeEnclosure:false,canvasTex:()=>new THREE.Texture()})
  const label=root.getObjectByName('vis2-reception-wayfinding'),p=label.geometry.attributes.position,n=label.geometry.attributes.normal
  for(let i=0;i<4;i++){assert.ok(Math.abs(p.getZ(i)-8.572)<1e-5);assert.ok(p.getY(i)<3);assert.equal(n.getZ(i),1)}
  brands.dispose();frontage.dispose();assert.equal(root.children.length,0)
})

test('R4 sliding leaves expose 0.45m each, leave 1.7m clear and park against separate north-side tracks',()=>{
  const layout=LAYOUT_V3_ALIGN_SAMPLE,root=new THREE.Group(),shell=buildOfficeShellV3({THREE,root,layout}),data=shell.reception.data
  assert.equal(data.leaves.length,4)
  for(const d of data.doors){
    assert.ok(Math.abs(d.clearX1-d.clearX0-1.7)<1e-8)
    const leaves=data.leaves.filter(p=>p.id.startsWith(d.id))
    for(const p of leaves){
      assert.ok(Math.abs(p.x1-p.x0-1.3)<1e-8);assert.equal(p.height,2.7)
      assert.ok(Math.abs(Math.min(p.x1,d.x1)-Math.max(p.x0,d.x0)-.45)<1e-8)
      const surface=p.surface==='wall'?data.wall:data.columns[d.id==='west'?0:1]
      assert.ok(Math.abs(surface.z0-p.z1-.03)<1e-8);assert.ok(surface.z0-p.z0<=.08+1e-8)
      for(const block of [data.wall,...data.columns])assert.equal(p.x0<block.x1&&p.x1>block.x0&&p.z0<block.z1&&p.z1>block.z0,false)
      // Ray through the visible glass opening, away from frames and the handle.
      const x=(Math.max(p.x0,d.x0)+Math.min(p.x1,d.x1))/2
      shell.reception.transparent.mesh.updateMatrixWorld(true)
      const hits=new THREE.Raycaster(new THREE.Vector3(x,1.8,10),new THREE.Vector3(0,0,-1)).intersectObject(shell.reception.transparent.mesh)
      assert.ok(hits.length>0,`${p.id} actual glass visible from south`)
      assert.ok(hits[0].point.z>=p.z0&&hits[0].point.z<=p.z1)
    }
    shell.reception.opaque.mesh.updateMatrixWorld(true)
    const trackHit=new THREE.Raycaster(new THREE.Vector3((d.x0+d.x1)/2,2.77,10),new THREE.Vector3(0,0,-1)).intersectObject(shell.reception.opaque.mesh)
    assert.ok(trackHit.length>0,'actual rail box above passage')
  }
  shell.dispose()
})

test('R5 warm reflective glass shares one material and inward 0.07m frames preserve all R4 blockers',()=>{
  const root=new THREE.Group(),shell=buildOfficeShellV3({THREE,root,layout:LAYOUT_V3_ALIGN_SAMPLE}),{data,transparent,opaque}=shell.reception
  assert.equal(hash(data.blockers),'f1b6e0f370af6f2c34f5a5358381a22e015c6b8dd91419dd9f6665650fc2a09f')
  assert.equal(data.spec.leafFrameWidth,.07);assert.equal(transparent.mesh.material.opacity,.35)
  assert.equal(transparent.mesh.material.userData.officeArchitectureWarmth,true)
  const color=new THREE.Color('#E8E0D0'),g=transparent.mesh.geometry
  for(let i=0;i<g.attributes.position.count;i++){
    assert.ok(Math.abs(g.attributes.sampleSurface.getX(i)-.12)<1e-6)
    assert.ok(Math.abs(g.attributes.color.getX(i)-color.r)<1e-6)
    assert.ok(Math.abs(g.attributes.color.getY(i)-color.g)<1e-6)
    assert.ok(Math.abs(g.attributes.color.getZ(i)-color.b)<1e-6)
  }
  opaque.mesh.updateMatrixWorld(true)
  for(const p of data.leaves){
    const d=data.doors.find(d=>p.id.startsWith(d.id)),cx=(Math.max(p.x0,d.x0)+Math.min(p.x1,d.x1))/2
    const frameAt=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1)).intersectObject(opaque.mesh).some(h=>h.point.z>=p.z0-1e-6&&h.point.z<=p.z1+1e-6)
    for(const edge of [.06,.08]){
      assert.equal(frameAt(cx,edge),edge<.07,'bottom frame physical width')
      assert.equal(frameAt(cx,p.height-edge),edge<.07,'top frame physical width')
      const x=p.id.endsWith('-0')?p.x1-edge:p.x0+edge
      assert.equal(frameAt(x,1.8),edge<.07,'exposed vertical frame physical width')
    }
  }
  shell.dispose()
})

test('R6 bronze frames, horizontal push bars and rail share the actual colour without new draw batches',()=>{
  const root=new THREE.Group(),shell=buildOfficeShellV3({THREE,root,layout:LAYOUT_V3_ALIGN_SAMPLE}),{data,opaque,transparent}=shell.reception
  const bronze=new THREE.Color('#705735'),mesh=opaque.mesh;mesh.updateMatrixWorld(true)
  assert.equal(data.spec.doorFrameColor,'#705735');assert.equal(transparent.mesh.material.opacity,.35)
  const surface=(x,y,z0,z1)=>{
    const hit=new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1)).intersectObject(mesh).find(h=>h.point.z>=z0-1e-6&&h.point.z<=z1+1e-6)
    assert.ok(hit,'actual bronze surface');const c=mesh.geometry.attributes.color,i=hit.face.a
    for(const [component,value] of [['X',bronze.r],['Y',bronze.g],['Z',bronze.b]])assert.ok(Math.abs(c['get'+component](i)-value)<1e-6)
    assert.ok(Math.abs(mesh.geometry.attributes.sampleSurface.getY(i)-.25)<1e-6)
  }
  for(const p of data.leaves){
    const d=data.doors.find(d=>p.id.startsWith(d.id)),cx=(Math.max(p.x0,d.x0)+Math.min(p.x1,d.x1))/2
    surface(cx,.035,p.z0,p.z1);surface(cx,2.665,p.z0,p.z1)
    surface(p.id.endsWith('-0')?p.x1-.035:p.x0+.035,1.8,p.z0,p.z1)
    for(const dx of [-.08,0,.08])surface(cx+dx,1.05,p.z1-.02,p.z1)
    const noHandle=new THREE.Raycaster(new THREE.Vector3(cx,1.11,10),new THREE.Vector3(0,0,-1)).intersectObject(mesh).filter(h=>h.point.z>=p.z0&&h.point.z<=p.z1)
    assert.equal(noHandle.length,0,'horizontal bar stays within 1.02..1.08m, no old vertical handle')
  }
  for(const d of data.doors)surface((d.x0+d.x1)/2,2.77,8,8.5)
  assert.equal(opaque.mesh.children.length,0);assert.equal(transparent.mesh.children.length,0)
  assert.equal(Array.isArray(opaque.mesh.material),false);assert.equal(Array.isArray(transparent.mesh.material),false)
  assert.equal(opaque.mesh.geometry.groups.length,0);assert.equal(transparent.mesh.geometry.groups.length,0)
  shell.dispose()
})

test('R5 both L1 lettering planes centre on x=2 and frozen non-sample signage stays byte-identical',()=>{
  for(const [layout,expected] of [[LAYOUT_V3_ALIGN_SAMPLE,null],[LAYOUT_V3,'400b73744d8aac4cd0b6734bb9f8d0264863d0bc6ce4b3e15f6db03dad6c2506'],[LAYOUT_V3_ALIGN,'6c40435d6204abb17ff1375d45dacd29b7990a75ccd125c0bfd9f81f5033731f']]){
    const root=new THREE.Group(),f=buildOfficeVis2Frontage({THREE,root,layout,includeEnclosure:false,canvasTex:()=>new THREE.Texture()}),label=root.getObjectByName('vis2-reception-wayfinding')
    label.updateWorldMatrix(true,false)
    const p=label.geometry.attributes.position,n=label.geometry.attributes.normal,uv=label.geometry.attributes.uv
    if(expected)assert.equal(hash({p:Array.from(p.array),position:label.position.toArray(),uv:Array.from(uv.array)}),expected)
    else{
      for(const start of [0,4]){
        const points=Array.from({length:4},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,start+i).applyMatrix4(label.matrixWorld))
        assert.ok(Math.abs(points.reduce((sum,v)=>sum+v.x,0)/4-2)<.00001)
        if(start===4){
          for(const v of points){assert.ok(v.x>=-1&&v.x<=5);assert.ok(v.z>18);assert.ok(Math.abs(v.y-.117)<1e-6)}
          assert.ok(p.getZ(4)<p.getZ(6),'top of south-facing text points north');assert.ok(uv.getY(4)>uv.getY(6));assert.ok(n.getY(4)>.999)
        }
      }
    }
    f.dispose();assert.equal(root.children.length,0)
  }
})

test('R4 facade shares internal strip edges and continuous normals while preserving every R3 height knot',()=>{
  const layout=LAYOUT_V3_ALIGN_SAMPLE,root=new THREE.Group(),shell=buildOfficeShellV3({THREE,root,layout})
  assert.deepEqual(layout.walls.southProfile,[{x:-22,h:4.5},{x:-15.2,h:4.5},{x:-4,h:1.2},{x:8,h:1.2},{x:19.2,h:4.5},{x:26,h:4.5}])
  const facade=shell.facade,g=facade.mesh.geometry,indices=g.index.array,edges=new Map(),normals=g.attributes.normal
  for(let i=0;i<indices.length;i+=3)for(const [a,b]of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]){const key=[a,b].sort((a,b)=>a-b).join('/');edges.set(key,(edges.get(key)||0)+1)}
  const wings=facade.strips.filter(s=>s.segments>1);assert.equal(wings.length,8)
  for(const strip of wings)for(let i=1;i<strip.rows.length-1;i++){
    const row=strip.rows[i]
    for(let j=1;j<row.length;j++)assert.equal(edges.get([row[j-1],row[j]].sort((a,b)=>a-b).join('/')),2,'internal cross-section shared by adjacent faces')
    for(const index of row){const length=Math.hypot(normals.getX(index),normals.getY(index),normals.getZ(index));assert.ok(Math.abs(length-1)<1e-6)}
  }
  assert.equal(facade.chains.length,5,'three outer planes plus two continuous wings, no per-segment end faces')
  for(const state of facade.states.filter(s=>s.segment.side==='curve'))for(const [i,p] of [state.segment.a,state.segment.b].entries())assert.equal(state.heights[i],officePlan1SouthHeight(layout,p.x))
  shell.dispose()
})

test('L1 sample keeps the owned solid facade visible and emits only finite finish geometry', () => {
  const root = new THREE.Group(), shell = buildOfficeAlignedShell({ THREE, root, layout: LAYOUT_V3_ALIGN_SAMPLE, search: '?officeSample=1', low: false })
  assert.equal(shell.walls.visible, true)
  assert.equal(shell.walls.userData.dynamic, true, 'facade stays outside static merge so cutaway can update it')
  const finish = root.getObjectByName('office-aligned-frames-and-inlays'), matrix = new THREE.Matrix4()
  assert.ok(finish)
  for (let index = 0; index < finish.count; index++) {
    finish.getMatrixAt(index, matrix)
    assert.ok(matrix.elements.every(Number.isFinite), `finish matrix ${index}`)
  }
  shell.dispose()
})

test('all 25 approved identities, desks and chair homes occur once and remain in their assigned regions', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, ids = Object.keys(layout.seats)
  assert.equal(ids.length, 25)
  assert.equal(new Set(ids).size, 25)
  assert.equal(hash(layout.seats), 'ace9a3ceb9b0969c244823f0c66dbf0aedd049966fed28741c0b0001a85b7bbb')
  assert.deepEqual(layout.seats, OFFICE_PLAN1_SEATS)
  for (const [id, seat] of Object.entries(layout.seats)) {
    const region = layout.regions.find(item => item.id === seat[0]), home = workHome(seat)
    assert.ok(region, `${id} region`)
    const contains = point => region.footprint ? pointInPolygon(point, region.footprint) : point.x > region.x0 && point.x < region.x1 && point.z > region.z0 && point.z < region.z1
    assert.ok(contains({ x: seat[1], z: seat[2] }), `${id} desk`)
    assert.ok(contains(home), `${id} home`)
  }
})

test('L1 route matrix is finite and no segment cuts a wall, another workstation or the solid tea-bar core', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, nav = createOfficeNavigation(layout), homes = Object.entries(layout.seats).map(([id, seat]) => [id, workHome(seat)])
  const furniture = officeFurnitureV2Spec(layout), meetings = furniture.meetings.flatMap(room => room.seats)
  const walls = buildOfficeShellV3Spec(layout).inner.filter(wall => wall.a)
  const desks = new Map(furniture.workstations.map(station => [station.name, workstationBox(station)]))
  const routes = []
  for (const [id, home] of homes) {
    routes.push([id, null, 'exit', nav.officeExit(home)], [id, null, 'board', nav.boardTrip(home, layout.boss.stand)])
    for (const [target, targetHome] of homes) routes.push([id, target, 'office', nav.officeTrip(home, targetHome, targetHome)])
    for (const seat of nav.LOUNGE_SEATS) routes.push([id, null, 'lounge', nav.loungeTrip(home, seat)])
    for (const seat of meetings) routes.push([id, null, 'meeting', nav.meetingTrip(home, seat)])
    for (const key of Object.keys(nav.consumerQueues)) for(const target of nav.consumerQueues[key]) routes.push([id, null, 'consumer', nav.consumerTrip(home, key, target)])
  }
  assert.equal(routes.length, 1825)
  for (const [id, target, kind, route] of routes) {
    assert.ok(route.length >= 1 && route.every(point => Number.isFinite(point.x) && Number.isFinite(point.z)), `${id}/${kind} finite`)
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i]
      for(const p of officePlan1Reception(layout).blockers) assert.equal(segmentHitsBox(a,b,{x0:p.x0-.28,x1:p.x1+.28,z0:p.z0-.28,z1:p.z1+.28}),false,`${id}/${kind}/${i} reception ${p.kind}`)
      if((a.z-8.5)*(b.z-8.5)<0){const x=a.x+(b.x-a.x)*(8.5-a.z)/(b.z-a.z);if(x>-6.6&&x<8.6)assert.ok(officePlan1Reception(layout).doors.some(d=>x>=d.clearX0+.28&&x<=d.clearX1-.28),`${id}/${kind} must cross the sliding-door clear passage`)}
      for (const wall of walls) assert.equal(lineCrosses(a, b, wall.a, wall.b), false, `${id}->${target || kind}/${kind}/${i} wall ${wall.room?.id || wall.side}`)
      for (const [other, box] of desks) if (other !== id && other !== target) assert.equal(segmentHitsBox(a, b, box), false, `${id}/${kind}/${i} desk ${other}`)
      if (kind !== 'lounge') {
        const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
        const t = length2 ? Math.max(0, Math.min(1, ((layout.bar.center.x - a.x) * dx + (layout.bar.center.z - a.z) * dz) / length2)) : 0
        assert.ok(Math.hypot(a.x + t * dx - layout.bar.center.x, a.z + t * dz - layout.bar.center.z) >= layout.bar.radius - 1e-6, `${id}/${kind}/${i} bar core`)
      }
    }
  }
})

test('four display rooms and their twelve simulated identities move with the approved regions', () => {
  const layout = LAYOUT_V3_ALIGN_SAMPLE, expected = { market: [-18.6, -14.1], service: [22.85, -14.1], aftersales: [-18.6, 12], marketing: [22.6, 12] }
  assert.equal(layout.displaySeats.length, 12)
  for (const [region, [x, z]] of Object.entries(expected)) {
    const seats = layout.displaySeats.filter(seat => seat.region === region)
    assert.equal(seats.length, 3)
    assert.deepEqual(seats.map(seat => seat.x), [x - .4, x - .4, x + .4])
    assert.deepEqual(seats.map(seat => seat.z), [z - .8, z + .8, z - .8])
    assert.deepEqual(seats.map(seat => seat.yaw), [-Math.PI/2, -Math.PI/2, Math.PI/2])
  }
})
