import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_L2B, LAYOUT_V3_ALIGN_SAMPLE, createOfficeNavigation, resolveOfficeLayout, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import { makeOfficePlan1L2BLayout, officePlan1InnerWalls } from '../office-plan1-layout.js'
import { buildOfficeShellV3Spec } from '../office-layout-v3-scene.js'
import { plan1FurniturePlan } from '../office-vis2/plan1-furniture.js'

const hooks = registerHooks({ resolve(specifier, context, next) {
  return specifier === 'three'
    ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true }
    : next(specifier, context)
} })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

const segmentDistance = (a, b, c, d) => {
  const cross = (p, q, r) => (q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x)
  const on = (p,q,r) => q.x>=Math.min(p.x,r.x)-1e-9&&q.x<=Math.max(p.x,r.x)+1e-9&&q.z>=Math.min(p.z,r.z)-1e-9&&q.z<=Math.max(p.z,r.z)+1e-9
  const values=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)]
  if(values[0]*values[1]<0&&values[2]*values[3]<0||Math.abs(values[0])<1e-9&&on(a,c,b)||Math.abs(values[1])<1e-9&&on(a,d,b)||Math.abs(values[2])<1e-9&&on(c,a,d)||Math.abs(values[3])<1e-9&&on(c,b,d))return 0
  const point=(p,x,y)=>{const dx=y.x-x.x,dz=y.z-x.z,t=dx*dx+dz*dz?Math.max(0,Math.min(1,((p.x-x.x)*dx+(p.z-x.z)*dz)/(dx*dx+dz*dz))):0;return Math.hypot(p.x-x.x-t*dx,p.z-x.z-t*dz)}
  return Math.min(point(a,c,d),point(b,c,d),point(c,a,b),point(d,a,b))
}
const hitsBox = (a,b,box) => {
  const inside=p=>p.x>box.x0+1e-8&&p.x<box.x1-1e-8&&p.z>box.z0+1e-8&&p.z<box.z1-1e-8
  if(inside(a)||inside(b))return true
  const c=[{x:box.x0,z:box.z0},{x:box.x1,z:box.z0},{x:box.x1,z:box.z1},{x:box.x0,z:box.z1}]
  return c.some((p,i)=>segmentDistance(a,b,p,c[(i+1)%4])<1e-8)
}
const bounds2 = (x,z,w,d) => ({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2})
const routeKey = r => `${r.id}/${r.kind}/${r.key}`
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const withoutFacingYaw = seats => Object.fromEntries(Object.entries(seats).map(([id,[region,x,z,yaw,home]])=>[id,[region,x,z,0,{...home,yaw:0}]]))
const routesFor = layout => {
  const nav=createOfficeNavigation(layout), spec=officeFurnitureV2Spec(layout), routes=[]
  for(const [id,seat] of Object.entries(layout.seats)) {
    const home=workHome(seat), add=(kind,key,run,target=null)=>routes.push({id,kind,key,points:run(),target})
    add('exit','',()=>nav.officeExit(home));add('board','',()=>nav.boardTrip(home,layout.boss.stand))
    for(const [name,target] of Object.entries(layout.seats))add('office',name,()=>nav.officeTrip(home,workHome(target),workHome(target)),name)
    for(const [i,target] of nav.LOUNGE_SEATS.entries())add('lounge',String(i),()=>nav.loungeTrip(home,target))
    for(const room of spec.meetings)for(const [i,target] of room.seats.entries())add('meeting',`${room.id}:${i}`,()=>nav.meetingTrip(home,target),{room:room.id,index:i,seat:target})
    for(const [name,targets] of Object.entries(nav.consumerQueues))for(const [i,target] of targets.entries())add(`consumer-${name}`,String(i),()=>nav.consumerTrip(home,name,target))
  }
  return routes
}
const assetBox = (models,name,seat,w,h,d) => {
  const f=placeFurniture({furn:models},name,seat.x,seat.z,{scale:1,rotY:(seat.yaw||0)+Math.PI})
  f.group.scale.set(w/f.size.x,h/f.size.y,d/f.size.z);f.group.updateMatrixWorld(true)
  const b=new THREE.Box3().setFromObject(f.group)
  return {x0:b.min.x,x1:b.max.x,z0:b.min.z,z1:b.max.z}
}
const tableBox = (models,room) => {
  const f=placeFurniture({furn:models},'table',room.x,room.z,{scale:1})
  f.group.scale.set(1/f.size.x,.76/f.size.y,1/f.size.z);f.group.updateMatrixWorld(true)
  const box=new THREE.Box3().setFromObject(f.group),disk=new THREE.Mesh(new THREE.CylinderGeometry(room.w/2,room.w/2,.055,32))
  disk.position.set(room.x,.79,room.z);disk.updateMatrixWorld(true);box.expandByObject(disk)
  return {x0:box.min.x,x1:box.max.x,z0:box.min.z,z1:box.max.z}
}
const roomClearance = (box,room) => Math.min(box.x0-room.x0,room.x1-box.x1,box.z0-room.z0,room.z1-box.z1)

test('OFFICE-L2B B1: isolated boundaries, frozen L1/L2, unchanged non-meeting routes and centered meeting routes', async t => {
  const l2Before=structuredClone(LAYOUT_V3_ALIGN_SAMPLE), l2b=LAYOUT_V3_ALIGN_L2B
  assert.deepEqual(makeOfficePlan1L2BLayout(LAYOUT_V3_ALIGN), l2b)
  assert.deepEqual(LAYOUT_V3_ALIGN_SAMPLE,l2Before)
  assert.equal(LAYOUT_V3_ALIGN_L2B.plan1Phase,'L2B')
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1'),LAYOUT_V3_ALIGN_L2B)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=1'),LAYOUT_V3_ALIGN_L2B)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=1&l2b=1'),LAYOUT_V3_ALIGN_SAMPLE)
  assert.equal(resolveOfficeLayout('?layout=3&align=1&l2b=1'),LAYOUT_V3_ALIGN)
  assert.deepEqual([l2b.site.z0,l2b.envelope.z0,l2b.greenBuffer.z0,l2b.miniBounds.z0,l2b.doors.north.z],[-19,-19,-19,-21,-19])
  assert.deepEqual(l2b.regions.filter(r=>['market','board','review','product-eng-knowledge','service'].includes(r.id)).map(r=>[r.id,r.z0]),[['market',-19],['board',-19],['review',-19],['product-eng-knowledge',-19],['service',-19]])
  assert.deepEqual(l2b.regions.filter(r=>['review','plan'].includes(r.id)).map(r=>[r.id,r.z0,r.z1]),[['review',-19,-14.8],['plan',-14.4,-10.2]])
  assert.deepEqual(withoutFacingYaw(l2b.seats),withoutFacingYaw(LAYOUT_V3_ALIGN_SAMPLE.seats),'L2B seat data differs from frozen L2 only in the approved facing fields')
  assert.equal(hash(l2b.seats),'61b151046f0c5b428b81b0d7eb0f185cdf6c5452e8862800a8bd5fe717f765b3','approved L2B-only facing exception hash')
  assert.equal(l2b.passages.entranceSpine,undefined,'the empty band gets no new navigation edge')

  const b1Fixture=structuredClone(l2b);b1Fixture.plan1Phase='L2'
  const before=routesFor(LAYOUT_V3_ALIGN_SAMPLE), after=routesFor(b1Fixture), beforeMap=new Map(before.map(r=>[routeKey(r),r]))
  assert.equal(before.length,1825);assert.equal(after.length,1825)
  for(const route of after) {
    assert.ok(route.points.length&&route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),`${routeKey(route)} finite`)
    const old=beforeMap.get(routeKey(route))
    assert.ok(old,`${routeKey(route)} exists in L2`)
    if(route.kind!=='meeting')assert.deepEqual(route.points,old.points,`${routeKey(route)} unchanged`)
  }
  const meetings=officeFurnitureV2Spec(b1Fixture).meetings, expected={A:{z:-16.9,delta:-.8,r:.96,d:1.2},B:{z:-12.3,delta:-.3,r:.86,d:1}}
  assert.deepEqual(meetings.map(r=>[r.id,r.seats.length]),[['A',4],['B',4]])
  for(const room of meetings) {
    const spec=expected[room.id], prior=officeFurnitureV2Spec(LAYOUT_V3_ALIGN_SAMPLE).meetings.find(r=>r.id===room.id)
    assert.equal(room.x,-3.3);assert.ok(Math.abs(room.z-spec.z)<1e-9);assert.equal(room.w,spec.d)
    for(let i=0;i<4;i++) {
      const seat=room.seats[i], old=prior.seats[i]
      assert.ok(Math.abs(Math.hypot(seat.x-room.x,seat.z-room.z)-spec.r)<1e-9)
      assert.ok(Math.abs((seat.z-old.z)-spec.delta)<1e-9,`${room.id}/${i} shift`)
      assert.equal(seat.yaw,old.yaw)
    }
    for(const route of after.filter(r=>r.kind==='meeting'&&r.target.room===room.id)) {
      const end=route.points.at(-1), seat=room.seats[route.target.index]
      assert.ok(Math.hypot(end.x-seat.x,end.z-seat.z)<=.001,`${routeKey(route)} endpoint`)
    }
  }
  const changed=after.filter(r=>JSON.stringify(r.points)!==JSON.stringify(beforeMap.get(routeKey(r)).points))
  assert.equal(changed.length,200);assert.ok(changed.every(r=>r.kind==='meeting'))
  t.diagnostic(`B1-3 routes: total=${after.length}, changedMeeting=${changed.length}, unchangedNonMeeting=${after.length-changed.length}`)

  const models={}
  for(const name of ['chairModernCushion','table','chairDesk']) {
    const bytes=fs.readFileSync(new URL(`../assets/models/furniture/${name}.glb`,import.meta.url))
    models[name]=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene
  }
  const spec=officeFurnitureV2Spec(b1Fixture), furniture=plan1FurniturePlan(b1Fixture).map(p=>({id:p.id,bounds:p.bounds}))
  for(const [id,seat] of Object.entries(l2b.seats)) {
    const [,x,z,yaw,home]=seat,w=Math.abs(Math.cos(yaw))*1.4+Math.abs(Math.sin(yaw))*.7,d=Math.abs(Math.sin(yaw))*1.4+Math.abs(Math.cos(yaw))*.7
    furniture.push({id:`${id}-desk`,owner:id,bounds:bounds2(x,z,w,d)},{id:`${id}-chair`,owner:id,bounds:bounds2(home.x,home.z,.62,.6)})
  }
  furniture.push({id:'board-table',bounds:bounds2(spec.board.x,spec.board.z,spec.board.w,spec.board.d)})
  for(const room of spec.meetings) {
    furniture.push({id:`meeting-table-${room.id}`,bounds:tableBox(models,room)})
    for(const [index,seat] of room.seats.entries())furniture.push({id:`meeting-chair-${room.id}-${index}`,room:room.id,index,bounds:assetBox(models,'chairModernCushion',seat,.62,1.04,.6)})
  }
  furniture.push({id:'boss-desk',bounds:bounds2(spec.boss.desk.x,spec.boss.desk.z,1.4,.7)})
  furniture.push({id:'boss-chair',bounds:assetBox(models,'chairDesk',spec.boss.chair,.62,1.04,.6)})
  for(const seat of spec.boardSeats)furniture.push({id:'board-chair',bounds:assetBox(models,'chairModernCushion',seat,.62,1.04,.6)})

  const walls=[...officePlan1InnerWalls(b1Fixture).filter(w=>w.a&&w.b),...buildOfficeShellV3Spec(b1Fixture).outer.filter(w=>w.a&&w.b)]
  const crossings=[]
  for(const route of after)for(let i=1;i<route.points.length;i++) {
    const a=route.points[i-1],b=route.points[i]
    for(const wall of walls)if(segmentDistance(a,b,wall.a,wall.b)<1e-8)crossings.push({route:routeKey(route),obstacle:`wall-${wall.room?.id||wall.side}`})
    for(const item of furniture) {
      if(item.owner===route.id)continue
      if(item.room===route.target?.room&&item.index===route.target?.index)continue
      if(hitsBox(a,b,item.bounds))crossings.push({route:routeKey(route),obstacle:item.id})
    }
  }
  assert.deepEqual(crossings,[])
  const band=[-19,-18], meetingRoomBounds={A:{x0:-5.6,x1:-1,z0:-19,z1:-14.8},B:{x0:-5.6,x1:-1,z0:-14.4,z1:-10.2}}
  const nonMeetingInBand=furniture.filter(item=>item.bounds.z0<band[1]&&item.bounds.z1>band[0]&&!item.id.startsWith('meeting-chair-A-')&&!item.id.startsWith('meeting-chair-B-')&&!item.id.startsWith('meeting-table-A')&&!item.id.startsWith('meeting-table-B'))
  assert.deepEqual(nonMeetingInBand,[],'only meeting-room furniture may occupy the strip')
  const roomEvidence=[]
  for(const room of spec.meetings) {
    const bounds=meetingRoomBounds[room.id], table=tableBox(models,room), chairs=room.seats.map(seat=>assetBox(models,'chairModernCushion',seat,.62,1.04,.6))
    for(const [i,box] of [table,...chairs].entries()) {
      const clearance=roomClearance(box,bounds)
      assert.ok(clearance>=-1e-6,`${room.id}/${i===0?'table':`chair-${i-1}`} outside new room bounds by ${(-clearance).toFixed(4)}m`)
      roomEvidence.push({room:room.id,item:i===0?'table':`chair-${i-1}`,box,minWallClearance:clearance})
    }
  }
  assert.ok(Object.values(l2b.seats).every(([, ,z])=>z>=-18),'workstation people remain outside the band')
  assert.ok(l2b.displaySeats.every(seat=>seat.z>=-18),'display people remain outside the band')
  assert.deepEqual(l2b.passages,LAYOUT_V3_ALIGN_SAMPLE.passages,'no passage entry added')
  assert.deepEqual(l2b.corridors,LAYOUT_V3_ALIGN_SAMPLE.corridors,'no corridor edge added')
  assert.ok(l2b.publicPathNodes.every(p=>p.z>=-18),'no new public-path node in the strip')
  assert.ok(roomEvidence.length===10)
  t.diagnostic(`B1-4 real Box3 room containment and minimum wall clearances: ${JSON.stringify(roomEvidence)}`)
})
