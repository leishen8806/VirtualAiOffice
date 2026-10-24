import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import * as barGeometry from '../office-bar-geometry.js'
import { buildOfficeIsland } from '../office-island.js'
import { displayBarObstacles } from '../display-staff-logic.js'
import { officeLeafGeometry, buildOfficeSamplePlants } from '../office-vis2/plants.js'
import { barSpec, barColliders, barGaps, barSeats, barLounges, validateIslandRings } from '../office-bar-geometry.js'
import { buildOfficeTeaBarSample } from '../office-vis2/bar.js'
import { islandAlignFixture, WEST_OPEN_FIXTURE } from '../office-vis2/align-fixture.js'
import { buildOpenFurnishing, planOpenFurnishing } from '../office-vis2/open-furnishing.js'
import { buildAlignOpenPreview } from '../office-vis2/align-preview.js'
import { buildOfficeBrandMarks } from '../office-vis2/brand.js'

const baseline = JSON.parse(readFileSync(new URL('../docs/v3-a2p-baseline-geometry.json', import.meta.url)))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const close = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 3e-6, `${message}: ${actual} / ${expected}`)
const overlaps = (a,b) => a.x1 > b.x0 && a.x0 < b.x1 && a.z1 > b.z0 && a.z0 < b.z1

const extended = JSON.parse(readFileSync(new URL('../docs/v3-a2p-r1-baseline.json', import.meta.url)))
function meshSnapshot(root) {
  root.updateMatrixWorld(true); const items=[]
  root.traverse(m=>{
    if(!m.isMesh)return
    const arrays={}
    for(const [key,a]of Object.entries({...m.geometry.attributes,index:m.geometry.index,instanceMatrix:m.instanceMatrix})) if(a) arrays[key]=hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))
    const material=JSON.parse(JSON.stringify(m.material.toJSON()).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'UUID'))
    items.push({name:m.name,arrays,world:m.matrixWorld.toArray(),count:m.count??null,material,visible:m.visible,castShadow:m.castShadow,receiveShadow:m.receiveShadow})
  })
  return items
}
test('R1 original Git 345cd39: all shared pure outputs remain byte-identical',()=>{
  assert.equal(extended.sourceSHA,baseline.sourceSHA)
  for(const [name, expected] of Object.entries(extended.functions)) assert.equal(JSON.stringify(name==='barSeatsLow'?barSeats(LAYOUT_V3,true):barGeometry[name](LAYOUT_V3)),JSON.stringify(expected),name)
})
for(const low of [false,true]) test(`R1 complete original island/sample/brand arrays and materials ${low?'low':'high'}`,()=>{
  const options={THREE,root:new THREE.Group(),layout:LAYOUT_V3,low,canvasTex:()=>new THREE.Texture(),assets:{logo:new THREE.Texture()}}
  const island=buildOfficeIsland(options),sample=buildOfficeTeaBarSample({...options,root:new THREE.Group()}),brand=buildOfficeBrandMarks({...options,root:new THREE.Group()})
  const plants=buildOfficeSamplePlants({...options,root:new THREE.Group()})
  try {
    const expected=extended.tiers[low?'low':'high']
    for(const [name,value]of Object.entries({island,sample,brand,plants})) assert.deepEqual(meshSnapshot(value.root),expected[name],name)
    for(const name of ['colliders','seats','lounges']) assert.deepEqual(island[name],expected[name],name)
  }finally{island.dispose();sample.dispose();brand.dispose();plants.dispose();options.assets.logo.dispose()}
})
test('R1 shared seats/obstacles and original island collisions follow the fixture without modifying input',()=>{
  const layout=islandAlignFixture(), before=JSON.stringify(layout), registered=[]
  const original=buildOfficeIsland({THREE,root:new THREE.Group(),layout,collision:{add:p=>registered.push(p),remove:()=>{}}})
  try {
    assert.deepEqual(original.colliders,barColliders(layout)); assert.equal(registered.length,12)
    for(let i=0;i<registered.length;i++) {
      const p=registered[i], b=original.colliders[i]
      p.updateMatrixWorld(); const actual=new THREE.Box3().setFromObject(p)
      close(actual.min.x,b.x0);close(actual.max.x,b.x1);close(actual.min.z,b.z0);close(actual.max.z,b.z1)
    }
    for(const seat of barSeats(layout)) assert.ok(Math.abs(Math.hypot(seat.x-2,seat.z+6)-4.2)<.071)
    const seatIds=new Set(barSeats(layout).map(s=>s.id)), boxes=displayBarObstacles(layout).filter(b=>seatIds.has(b.id))
    assert.equal(boxes.length,10)
    for(const b of boxes)for(const x of [b.x0,b.x1])for(const z of [b.z0,b.z1])assert.ok(Math.hypot(x-2,z+6)<6)
    for(const low of [false,true]) {
      const noSeats=islandAlignFixture();delete noSeats.bar.seats
      assert.equal(barSeats(noSeats,low).length,low?6:10)
      for(const p of barSeats(noSeats,low))close(Math.hypot(p.x-2,p.z+6),4.2)
    }
    assert.equal(JSON.stringify(layout),before)
  }finally{original.dispose()}
})
test('R1 sofa validation matches actual transformed vertices and rejects invalid ring variants',()=>{
  for(const radius of [5.8,5.45]) {
    const layout=islandAlignFixture(radius), before=JSON.stringify(layout), result=validateIslandRings(layout)
    assert.equal(result.ok,radius===5.45);assert.deepEqual(result.errors,radius===5.8?['SOFA_BEYOND_COLLISION']:[])
    const value=buildOfficeTeaBarSample({THREE,root:new THREE.Group(),layout})
    try {
      const mesh=value.root.getObjectByName('tea-bar-instanced-lounges'), v=new THREE.Vector3(), m=new THREE.Matrix4();let edge=0
      for(let j=0;j<mesh.count;j++) {mesh.getMatrixAt(j,m);for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
        v.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(m);edge=Math.max(edge,Math.hypot(v.x-2,v.z+6))
      }}
      close(edge,result.sofaOuterEdge,'measured curved backrest edge')
      const stools=value.root.getObjectByName('tea-bar-instanced-stools');let stoolInner=Infinity
      for(let j=0;j<stools.count;j++){stools.getMatrixAt(j,m);for(let i=0;i<stools.geometry.attributes.position.count;i++){
        if(stools.geometry.attributes.position.getY(i)<.76)continue
        v.fromBufferAttribute(stools.geometry.attributes.position,i).applyMatrix4(m);stoolInner=Math.min(stoolInner,Math.hypot(v.x-2,v.z+6))
      }}
      close(stoolInner-3.545,.375,'measured cushion to countertop gap')
      for(const sofa of value.lounges){close(Math.hypot(sofa.x-2,sofa.z+6),radius);close(Math.hypot(sofa.appX-2,sofa.appZ+6),radius-.55)}
      assert.deepEqual(value.lounges,barLounges(layout));assert.equal(JSON.stringify(layout),before)
      console.log('R1 measured sofa',radius,edge,result)
    }finally{value.dispose()}
  }
  const layout=islandAlignFixture(5.45);delete layout.bar.seats;layout.island.stoolRadius=3.8
  assert.ok(validateIslandRings(layout).errors.includes('STOOL_COUNTER_CLEARANCE'))
  layout.island.stoolRadius=5.1;assert.ok(validateIslandRings(layout).errors.includes('SEAT_RINGS_INTERSECT'))
  layout.bar.gaps=[{width:1.4}];assert.ok(validateIslandRings(layout).errors.includes('GAP_WIDTH'))
  layout.island.sofaOuter=NaN;assert.ok(validateIslandRings(layout).errors.includes('INVALID_RING'))
  assert.equal(validateIslandRings(null).ok,false)
  assert.equal(validateIslandRings({bar:{seats:[null]}}).ok,false)
  // 董事会新裁决 .30m 边缘净距；合成席位仅用于阈值测试。
  const boundary=islandAlignFixture(5.45);delete boundary.bar.seats;boundary.island.stoolRadius=3.545+.28+.30
  assert.equal(validateIslandRings(boundary).ok,true)
  boundary.island.stoolRadius-=.001;assert.ok(validateIslandRings(boundary).errors.includes('STOOL_COUNTER_CLEARANCE'))
  boundary.island.stoolRadius=3.545+.28+.25
  assert.ok(validateIslandRings(boundary).errors.includes('STOOL_COUNTER_CLEARANCE'),'explicit .25m edge clearance must fail')
  const actual=islandAlignFixture(), clearance=Math.min(...barSeats(actual).map(p=>Math.hypot(p.x-2,p.z+6)))-.28-3.545
  assert.ok(clearance>=.30);close(clearance,.375)
  console.log('A2 approved fixture edge clearance',clearance)
})
test('R1 leaves reuse independent front/back normals without cancellation at either quality',()=>{
  for(const segments of [3,7])for(const angle of [0,2.399,4.798]) {
    const g=officeLeafGeometry(THREE,angle,.32,segments), p=g.attributes.position,n=g.attributes.normal,index=g.index, half=p.count/2
    try {
      for(let i=0;i<half;i++) {
        for(const key of ['getX','getY','getZ'])close(p[key](i),p[key](i+half))
        const a=new THREE.Vector3().fromBufferAttribute(n,i),b=new THREE.Vector3().fromBufferAttribute(n,i+half)
        if(a.length()) {close(a.length(),1);close(a.dot(b),-1)}
      }
      for(let i=0;i<index.count;i+=3) {
        const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(i+2))
        const normal=b.sub(a).cross(c.sub(a)).normalize()
        assert.ok(Math.abs(normal.y)>.05)
        assert.ok(normal.dot(new THREE.Vector3().fromBufferAttribute(n,index.getX(i)))>0)
      }
    }finally{g.dispose()}
  }
})

for (const low of [false, true]) test(`V3-A2P baseline 345cd39 ${low ? 'low' : 'high'} preserves every geometry array, instance and collider`, () => {
  assert.equal(baseline.sourceSHA, '345cd39f7dddebf4e4e61e146af7a283cd415088')
  const value = buildOfficeTeaBarSample({ THREE, root: new THREE.Group(), layout: LAYOUT_V3, low }), meshes = {}
  try {
    value.root.updateMatrixWorld(true)
    value.root.traverse(m => {
      if (!m.isMesh) return
      const arrays = {}
      for (const [key, attribute] of Object.entries({ ...m.geometry.attributes, index: m.geometry.index, instanceMatrix: m.instanceMatrix })) {
        if (attribute) arrays[key] = hash(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))
      }
      meshes[m.name] = { arrays, matrixWorld: m.matrixWorld.toArray(), count: m.count ?? null }
    })
    const expected = baseline.tiers[low ? 'low' : 'high']
    assert.deepEqual(meshes, expected.meshes)
    assert.deepEqual(value.colliders, expected.colliders)
    assert.deepEqual(value.seats, expected.seats); assert.deepEqual(value.lounges, expected.lounges)
    assert.deepEqual(value.summary(), expected.summary)
  } finally { value.dispose() }
})

test('V3-A2P align fixture uses separate counter/collision radii and authoritative seat coordinates', () => {
  const layout = islandAlignFixture(), original = JSON.stringify(LAYOUT_V3), root = new THREE.Group(), registered = new Set()
  const value = buildOfficeTeaBarSample({ THREE, root, layout, collision: { add: m => registered.add(m), remove: m => registered.delete(m) } })
  try {
    assert.equal(barSpec(layout).counterRadius, 3.5); assert.equal(barSpec(layout).collisionRadius, 6)
    assert.equal(barSpec({bar: {radius: 4}}).radius, 4)
    const g = value.root.getObjectByName('tea-bar-body-top-equipment').geometry, p = g.attributes.position
    const radii = (lo,hi) => Array.from({length:p.count},(_,i)=>i).filter(i=>p.getY(i)>lo && p.getY(i)<hi).map(i=>Math.hypot(p.getX(i)-2,p.getZ(i)+6))
    close(Math.max(...radii(.079,.081)), 3.5, 'actual fascia vertex radius')
    close(Math.max(...radii(1.049,1.051)), 3.545, 'countertop retains 45mm overhang')
    close(Math.max(...value.colliders.map(b=>Math.max(Math.abs(b.z0+6),Math.abs(b.z1+6)))), 6)
    assert.deepEqual(value.colliders, barColliders(layout)); assert.equal(registered.size, 12)
    for (const gap of barGaps(layout)) {
      close(Math.abs(gap.x-2), 6); assert.ok(gap.z1-gap.z0 >= 1.5)
      for (let x=-4; x<=8; x+=.1) for (const z of [-6.749,-6,-5.251]) assert.equal(value.colliders.some(b=>x>b.x0&&x<b.x1&&z>b.z0&&z<b.z1), false)
    }
    assert.deepEqual(value.seats.map(({id,x,z})=>({id,x,z})), layout.bar.seats)
    for (const seat of value.seats) assert.ok(Math.abs(Math.hypot(seat.x-2,seat.z+6)-4.2)<.071, 'approved coordinates retain 0.1m rounding')
    for (const sofa of value.lounges) close(Math.hypot(sofa.x-2,sofa.z+6),5.8)
    const brandOptions={THREE,assets:{logo:new THREE.Texture()},canvasTex:()=>new THREE.Texture()}
    const oldBrand=buildOfficeBrandMarks({...brandOptions,root:new THREE.Group(),layout:LAYOUT_V3}), newBrand=buildOfficeBrandMarks({...brandOptions,root:new THREE.Group(),layout})
    try {
      assert.deepEqual(newBrand.marks,oldBrand.marks,'logo stays on counter, not collision perimeter')
      for(const old of oldBrand.root.children.filter(m=>m.isMesh)) {
        const next=newBrand.root.getObjectByName(old.name)
        for(const key of ['position','normal','uv']) assert.deepEqual(next.geometry.attributes[key].array,old.geometry.attributes[key].array)
      }
    } finally { oldBrand.dispose();newBrand.dispose();brandOptions.assets.logo.dispose() }
    value.root.updateMatrixWorld(true)
    for (const [name, expected] of Object.entries(baseline.tiers.high.meshes).filter(([name])=>name.startsWith('heart-banyan'))) {
      const mesh = value.root.getObjectByName(name)
      for (const [key,digest] of Object.entries(expected.arrays)) { const a=key==='instanceMatrix' ? mesh.instanceMatrix : key==='index' ? mesh.geometry.index : mesh.geometry.attributes[key]; assert.equal(hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),digest) }
    }
    assert.equal(JSON.stringify(LAYOUT_V3),original)
  } finally { value.dispose(); value.dispose(); assert.equal(registered.size,0); assert.equal(root.children.length,0) }
})

test('V3-A2P absent seats use island ring fields; explicit seats remain authoritative at both qualities', () => {
  for (const low of [false,true]) {
    const layout=islandAlignFixture(); delete layout.bar.seats
    const value=buildOfficeTeaBarSample({THREE,root:new THREE.Group(),layout,low})
    try { for(const p of value.seats) close(Math.hypot(p.x-2,p.z+6),4.2) } finally { value.dispose() }
    layout.bar.seats=[{id:'fixture-seat',x:4,z:-3,yaw:.75}]
    const explicit=buildOfficeTeaBarSample({THREE,root:new THREE.Group(),layout,low})
    try { assert.equal(explicit.seats.length,1); assert.equal(explicit.seats[0].x,4); assert.equal(explicit.seats[0].yaw,.75) } finally { explicit.dispose() }
  }
})

test('V3-A2P open furnishing actual vertices preserve workstations, corridors and pairwise clearance within budget', () => {
  const original=JSON.stringify(WEST_OPEN_FIXTURE), results=[]
  assert.deepEqual(planOpenFurnishing(WEST_OPEN_FIXTURE),planOpenFurnishing(WEST_OPEN_FIXTURE))
  for(const low of [false,true]) {
    const root=new THREE.Group(), a=buildOpenFurnishing({THREE,root,low,...WEST_OPEN_FIXTURE})
    try {
      assert.deepEqual(a.skipped,['shared-table-2','green-edge-3','green-edge-4']); assert.equal(a.placements.length,6)
      assert.deepEqual([...new Set(a.placements.map(p=>p.kind))].sort(),['cabinet','partition','plant','table'])
      const positions=a.root.geometry.attributes.position
      for(const p of a.placements) {
        const b=p.bounds, area=WEST_OPEN_FIXTURE.area
        assert.ok(b.x0>=area.x0&&b.x1<=area.x1&&b.z0>=area.z0&&b.z1<=area.z1)
        if(p.kind==='partition') assert.ok(b.y1<=1.2)
        const measured=new THREE.Box3()
        for(let i=p.vertices.start;i<p.vertices.start+p.vertices.count;i++) measured.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,i))
        for(const [key,val] of Object.entries({x0:measured.min.x,x1:measured.max.x,z0:measured.min.z,z1:measured.max.z,y0:measured.min.y,y1:measured.max.y})) close(val,b[key],p.id+key)
        for(const c of a.corridors) { assert.ok(Math.min(c.x1-c.x0,c.z1-c.z0)>=1.2); assert.equal(overlaps(b,c),false) }
        for(const w of WEST_OPEN_FIXTURE.workstations) assert.ok(Math.hypot(Math.max(b.x0-w.x,0,w.x-b.x1),Math.max(b.z0-w.z,0,w.z-b.z1))>=w.radius+.6-3e-6,p.id+' / '+w.name)
        for(const q of a.placements.filter(q=>q.id!==p.id)) { assert.equal(overlaps(b,q.bounds),false); if (p.groupId !== q.groupId) assert.ok(Math.max(q.bounds.x0-b.x1,b.x0-q.bounds.x1,q.bounds.z0-b.z1,b.z0-q.bounds.z1)>=1.2-3e-6) }
      }
      assert.equal(a.groups.length,3)
      for (const group of a.groups) {
        const members = a.placements.filter(p => group.memberIds.includes(p.id)), b = group.groupBounds
        assert.equal(members.length,group.memberIds.length)
        if (members.some(p=>p.kind==='table')) {
          assert.ok(members.some(p=>p.kind==='cabinet') && members.some(p=>p.kind==='partition'))
          assert.ok(group.useSpace.z1-group.useSpace.z0 >= .6-1e-9)
          for(const p of members) assert.equal(overlaps(p.bounds,group.useSpace),false)
        }
        for (const p of members) assert.ok(p.bounds.x0>=b.x0-3e-6 && p.bounds.x1<=b.x1+3e-6 && p.bounds.z0>=b.z0-3e-6 && p.bounds.z1<=b.z1+3e-6)
        for(const c of a.corridors) assert.equal(overlaps(b,c),false)
        for(const w of WEST_OPEN_FIXTURE.workstations) assert.ok(Math.hypot(Math.max(b.x0-w.x,0,w.x-b.x1),Math.max(b.z0-w.z,0,w.z-b.z1))>=w.radius+.6-3e-6)
        for(const q of a.groups.filter(q=>q.id!==group.id)) assert.ok(Math.max(q.groupBounds.x0-b.x1,b.x0-q.groupBounds.x1,q.groupBounds.z0-b.z1,b.z0-q.groupBounds.z1)>=1.2-3e-6)
      }
      for(const p of a.placements) assert.equal(a.groups.filter(g=>g.memberIds.includes(p.id)).length,1)
      assert.equal(a.colliders.length,a.placements.length); assert.equal(root.children.length,1)
      assert.ok(a.summary().calls<=2); assert.ok(a.summary().triangles<=8000); results.push(a.summary())
    } finally { a.dispose(); a.dispose(); assert.equal(root.children.length,0) }
  }
  assert.ok(results[1].triangles<results[0].triangles); assert.equal(JSON.stringify(WEST_OPEN_FIXTURE),original)
  console.log('V3-A2P furnishing',JSON.stringify(results))
})

test('V3-A2P rejects narrow routes and missing clearance; crowded area skips instead of overlap; preview disposes', () => {
  assert.throws(()=>planOpenFurnishing({...WEST_OPEN_FIXTURE,corridors:[{x0:0,x1:1,z0:0,z1:2}]}),TypeError)
  assert.throws(()=>planOpenFurnishing({...WEST_OPEN_FIXTURE,workstations:[{x:0,z:0,radius:0}]}),TypeError)
  const crowded=planOpenFurnishing({...WEST_OPEN_FIXTURE,corridors:[WEST_OPEN_FIXTURE.area]})
  assert.equal(crowded.placements.length,0); assert.equal(crowded.skipped.length,6)
  const root=new THREE.Group(), view=buildAlignOpenPreview({THREE,root,low:false})
  view.dispose(); view.dispose(); assert.equal(root.children.length,0)
})
