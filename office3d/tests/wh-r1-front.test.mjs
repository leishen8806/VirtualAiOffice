import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import {WH_R1_DATA,WH_R1_ASSIGNMENT} from '../wh-r1/data.js'
import {WH_R1_FLOOR_Y,whToWorld} from '../wh-r1-layout.js'
import {buildWhR1Front,WH_R1_FRONT,WH_R1_FRONT_SEATS,whR1FacingFromRear} from '../dr-wh-r1-front.js'
import {createCampusRegistry} from '../dr-campus-registry.js'
import {createFurnitureCollision} from '../furniture-collision.js'

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<=.005,`${message}: ${a} / ${b}`)
const source=id=>WH_R1_DATA.elements.find(r=>r.id===id)
const I6=WH_R1_ASSIGNMENT.filter(a=>a.card==='I6').map(a=>a.id)
const texture=()=>new THREE.Texture()
const H01=WH_R1_DATA.bodyProfiles.find(p=>p.id==='H01').height_mm/1000

// Same measurement helper the approved I4 test uses: union every instance box per
// register id, and additionally per assembly id so a parent is measured through its children.
function rendered(root){
  root.updateMatrixWorld(true);const result=new Map(),matrix=new THREE.Matrix4()
  root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.collisionProxy||!mesh.userData.instanceToRegisterId)return;mesh.geometry.computeBoundingBox()
    mesh.userData.instanceToRegisterId.forEach((id,i)=>{mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix)
      for(const key of [id,mesh.userData.assemblyIds?.[i]].filter(Boolean)){if(!result.has(key))result.set(key,new THREE.Box3());result.get(key).union(box)}
    })
  });return result
}
const expectedBox=row=>{const p=whToWorld(row.xM,row.yM)
  return new THREE.Box3(new THREE.Vector3(-row.lengthM/2,0,-row.widthM/2),new THREE.Vector3(row.lengthM/2,row.heightM,row.widthM/2))
    .applyMatrix4(new THREE.Matrix4().makeRotationY(row.yawDeg*Math.PI/180)).translate(new THREE.Vector3(p.x,WH_R1_FLOOR_Y+row.zM,p.z))}

test('I6-4 the card covers exactly the 259 records the I1 assignment table gives it',()=>{
  assert.equal(I6.length,259)
  assert.equal(WH_R1_FRONT.length,259)
  assert.deepEqual(WH_R1_FRONT.map(r=>r.id),I6)
  const counts={}
  for(const r of WH_R1_FRONT)counts[r.category]=(counts[r.category]||0)+1
  assert.deepEqual(counts,{椅子子件:108,椅子:32,显示终端:22,绿植总成:17,冠幅:17,盆器:17,树干:17,工作台:12,休闲椅:4,展示样品占位:3,检修控制区:3,展示柜:2,设备柜:2,调度大屏:1,展示岛:1,展示背景面:1})
  // every I6 record sits in a front zone 07-11
  assert.deepEqual([...new Set(WH_R1_FRONT.map(r=>r.regionId))].sort(),['07','08','09','10','11'])
  // the front zones also hold objects owned by other cards; I6 must render none of them.
  const owner=new Map(WH_R1_ASSIGNMENT.map(a=>[a.id,a.card]))
  const foreign=WH_R1_DATA.elements.filter(r=>['07','08','09','10','11'].includes(r.regionId)&&owner.get(r.id)!=='I6')
  const byCard={}
  for(const r of foreign){const k=`${owner.get(r.id)}|${r.category}`;byCard[k]=(byCard[k]||0)+1}
  assert.deepEqual(byCard,{'I2|墙体':15,'I2|门总成':9,'I2|门扇占位':9,'I5|搬运设备占位':3})
  const ids=new Set(WH_R1_FRONT.map(r=>r.id))
  for(const r of foreign)assert.equal(ids.has(r.id),false,`${r.id} belongs to ${owner.get(r.id)}`)
  // The three I5 handling-equipment placeholders share the exact centres of the three I6
  // maintenance bays: I6 draws the bay marking, I5 draws the equipment standing in it.
  for(const n of ['001','002','003']){
    const bay=source(`WH-11-BAY-${n}`),eq=source(`WH-11-EQ-${n}`)
    assert.equal(owner.get(eq.id),'I5');assert.equal(owner.get(bay.id),'I6')
    near(bay.xM,eq.xM,`bay ${n} shares x`);near(bay.yM,eq.yM,`bay ${n} shares y`)
    assert.ok(eq.lengthM<bay.lengthM&&eq.widthM<bay.widthM,`equipment ${n} fits inside its bay`)
  }
})

test('I6-1 every one of the 259 records renders at its registered footprint, size and base elevation',()=>{
  for(const tier of ['high','low']){
    const root=new THREE.Group(),value=buildWhR1Front({THREE,root,quality:{tier},canvasTex:texture}),boxes=rendered(root)
    assert.deepEqual(root.getObjectByName('wh-r1-front').userData.registerIds,I6)
    for(const id of I6){const row=source(id),box=boxes.get(id)
      assert.ok(box,`${tier} ${id} not rendered`)
      const want=expectedBox(row)
      for(const axis of ['x','y','z']){near(box.min[axis],want.min[axis],`${tier} ${id} min ${axis}`);near(box.max[axis],want.max[axis],`${tier} ${id} max ${axis}`)}
      near(box.min.y,WH_R1_FLOOR_Y+row.zM,`${tier} ${id} base above floor`)
    }
    value.dispose()
  }
})

test('I6-1 floor-seated records rest on the WH-R1 floor datum, not on y=0',()=>{
  const root=new THREE.Group(),value=buildWhR1Front({THREE,root,canvasTex:texture}),boxes=rendered(root)
  const grounded=WH_R1_FRONT.filter(r=>r.zM===0)
  assert.ok(grounded.length>=60)
  for(const r of grounded){const base=boxes.get(r.id).min.y-WH_R1_FLOOR_Y
    assert.ok(base>=-.02&&base<=.005,`${r.id} base vs floor: ${base}`)}
  value.dispose()
})

test('I6-2 console, office and maintenance seats face their desk; the four reception chairs keep the drawing conflict',()=>{
  const root=new THREE.Group(),value=buildWhR1Front({THREE,root,canvasTex:texture})
  const seats=root.getObjectByName('wh-r1-front').userData.orientations
  assert.equal(seats.length,36)
  assert.deepEqual(WH_R1_FRONT_SEATS.map(s=>s.id),seats.map(s=>s.id))
  const tables=WH_R1_FRONT.filter(r=>r.category==='工作台')
  const nearestTable=chair=>tables.reduce((best,t)=>{const d=Math.hypot(t.xM-chair.xM,t.yM-chair.yM);return d<best.d?{t,d}:best},{t:null,d:Infinity}).t
  const dot=(seat,target)=>{const a=whToWorld(seat.xM,seat.yM),b=whToWorld(target.xM,target.yM),{yaw}=seats.find(s=>s.id===seat.id)
    return -Math.sin(yaw)*(b.x-a.x)-Math.cos(yaw)*(b.z-a.z)}
  // 6 dispatch console seats + 24 office seats + 2 maintenance seats all look at their desk
  const facing=WH_R1_FRONT.filter(r=>r.category==='椅子')
  assert.equal(facing.length,32)
  for(const chair of facing)assert.ok(dot(chair,nearestTable(chair))>0,`${chair.id} dot ${dot(chair,nearestTable(chair))}`)
  // The 4 reception lounge chairs are registered with the backrest between seat and tea table,
  // so each pair sits back to back and cannot face its own table. Drawing data is read-only
  // (wh-r1/data.js), so the conflict is preserved and asserted, never corrected here.
  const lounge=WH_R1_FRONT.filter(r=>r.category==='休闲椅')
  assert.equal(lounge.length,4)
  for(const chair of lounge)near(dot(chair,nearestTable(chair)),-1.15,`${chair.id} preserved outward facing`)
  assert.deepEqual(value.conflicts.map(c=>c.id),['WH-08-CH-001','WH-08-CH-002','WH-08-CH-003','WH-08-CH-004'])
  const markers=root.getObjectByName('wh-r1-front-markers').userData.instanceToRegisterId
  for(const id of ['WH-08-CH-001','WH-08-CH-002','WH-08-CH-003','WH-08-CH-004'])assert.ok(markers.includes(`${id}-facing-conflict`),id)
  value.dispose()
})

test('I6-2 seat yaw comes from the registered backrest and agrees with facingLocal on all 36 seats',()=>{
  // facingLocal is a rear-pointing vector for seats: world facing = (-fx, fy).
  // Derive yaw from the registered BASE/BACK geometry and cross-check that mapping.
  for(const seat of WH_R1_FRONT.filter(r=>['椅子','休闲椅'].includes(r.category))){
    const back=source(`${seat.id}-BACK`),s=whToWorld(seat.xM,seat.yM),b=whToWorld(back.xM,back.yM)
    const dx=s.x-b.x,dz=s.z-b.z,n=Math.hypot(dx,dz)
    const geom=whR1FacingFromRear(seat)
    near(geom.x,dx/n,`${seat.id} facing x`);near(geom.z,dz/n,`${seat.id} facing z`)
    const [fx,fy]=seat.facingLocal
    near(geom.x,-fx,`${seat.id} facingLocal x`);near(geom.z,fy,`${seat.id} facingLocal z`)
    const {yaw}=WH_R1_FRONT_SEATS.find(s2=>s2.id===seat.id)
    near(-Math.sin(yaw),geom.x,`${seat.id} yaw x`);near(-Math.cos(yaw),geom.z,`${seat.id} yaw z`)
  }
})

test('I6-3 the 17 indoor planters are layered pot/trunk/crown and every crown intrusion is recorded',()=>{
  const root=new THREE.Group(),value=buildWhR1Front({THREE,root,canvasTex:texture}),boxes=rendered(root)
  const planters=WH_R1_FRONT.filter(r=>r.category==='绿植总成')
  assert.equal(planters.length,17)
  assert.equal(value.planting.length,17)
  for(const pl of planters){
    const pot=source(`${pl.id}-POT`),trunk=source(`${pl.id}-TRUNK`),crown=source(`${pl.id}-CROWN`)
    // three separately registered layers, each with its own base elevation and height
    near(pot.zM,0,`${pl.id} pot base`);near(pot.zM+pot.heightM,.55,`${pl.id} pot top`)
    near(trunk.zM,.4,`${pl.id} trunk base`);near(trunk.zM+trunk.heightM,2.1,`${pl.id} trunk top`)
    near(crown.zM,.9,`${pl.id} crown base`);near(crown.zM+crown.heightM,2.1,`${pl.id} crown top`)
    // each layer is its own collision body; the assembly row itself is reference only
    assert.equal(pl.collisionRole,'assembly_reference_only')
    for(const part of [pot,trunk,crown])assert.equal(part.collisionRole,'physical_proxy')
    // the assembly box is the union of the three layers
    const box=boxes.get(pl.id),want=expectedBox(pl)
    for(const axis of ['x','y','z']){near(box.min[axis],want.min[axis],`${pl.id} min ${axis}`);near(box.max[axis],want.max[axis],`${pl.id} max ${axis}`)}
    const record=value.planting.find(p=>p.id===pl.id)
    assert.deepEqual(record.layers,[pot.id,trunk.id,crown.id])
    assert.deepEqual(record.spans.map(s=>[s.category,s.baseM,s.topM]),[['盆器',0,.55],['树干',.4,2.1],['冠幅',.9,2.1]])
    // every crown starts at 0.9 m and so cuts into the H01 1.75 m head band by 0.85 m
    assert.equal(record.headBandIntrusionM,.85)
  }
  // All 17 crowns are exceptions; the drawing is read-only here, so they are recorded, not moved.
  assert.equal(value.planting.filter(p=>p.headBandIntrusionM>0).length,17)
  near(H01,1.75,'H01 head height')
  value.dispose()
})

test('I6-3 no crown or planter sits inside a declared route corridor, so the head-band exception blocks no route',()=>{
  // Oriented footprint vs corridor: all I6 yaws are 0/±90/180, so world half extents only swap.
  const half=r=>Math.abs(Math.abs(r.yawDeg)-90)<1e-9?[r.widthM/2,r.lengthM/2]:[r.lengthM/2,r.widthM/2]
  const gap=(c,hx,hz,a,b)=>{let min=Infinity
    for(let i=0;i<=2000;i++){const t=i/2000,px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t
      min=Math.min(min,Math.hypot(Math.max(0,Math.abs(px-c.x)-hx),Math.max(0,Math.abs(pz-c.z)-hz)))}
    return min}
  const planting=WH_R1_FRONT.filter(r=>['绿植总成','盆器','树干','冠幅'].includes(r.category))
  assert.equal(planting.length,68)
  let tightest={id:null,clear:Infinity}
  for(const route of WH_R1_DATA.routes){const pts=route.points.map(p=>whToWorld(p[0],p[1]))
    for(const r of planting){const c=whToWorld(r.xM,r.yM),[hx,hz]=half(r)
      let min=Infinity
      for(let i=0;i<pts.length-1;i++)min=Math.min(min,gap(c,hx,hz,pts[i],pts[i+1]))
      const clear=min-route.radius_m
      const vertical=Math.min(r.zM+r.heightM,route.z_span[1])-Math.max(r.zM,route.z_span[0])
      if(vertical>0&&clear<tightest.clear)tightest={id:`${r.id} vs ${route.id}`,clear}
      assert.ok(clear>0,`${r.id} intrudes ${route.id} corridor by ${-clear} m`)}}
  // keep the real margin visible in the log so a later layout change cannot silently eat it
  assert.ok(tightest.clear>=1,`tightest planter/route clearance ${tightest.id} = ${tightest.clear} m`)
})

test('I6-1 panel fronts sit on the thin axis and face into their own zone',()=>{
  const root=new THREE.Group(),value=buildWhR1Front({THREE,root,canvasTex:texture})
  root.updateMatrixWorld(true)
  const centre=r=>{const[x0,x1,z0,z1]=WH_R1_DATA.zones.find(z=>z.id===r.regionId).worldBboxXZ
    return{x:(x0+x1)/2,z:(z0+z1)/2}}
  // 展示柜 is 1.5 m deep x 3 m long, so its glass belongs on the local-x face, not local-z.
  const glass=root.getObjectByName('wh-r1-front-glass'),matrix=new THREE.Matrix4(),pos=new THREE.Vector3()
  assert.deepEqual(glass.userData.instanceToRegisterId,['WH-09-CB-001','WH-09-CB-002'])
  glass.userData.instanceToRegisterId.forEach((id,i)=>{
    const row=source(id),p=whToWorld(row.xM,row.yM),c=centre(row)
    glass.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix)
    assert.ok(Math.abs(pos.x-p.x)>.6,`${id} glass must be offset along x, got ${pos.x-p.x}`)
    near(pos.z,p.z,`${id} glass centred in z`)
    assert.ok(Math.sign(pos.x-p.x)===Math.sign(c.x-p.x),`${id} glass must face the zone interior`)
  })
  // the dispatch wall and showcase backdrop are thin in z, so their screens face along z toward the room
  const screens=root.getObjectByName('wh-r1-front-screens'),p3=screens.geometry.attributes.position
  for(const id of ['WH-07-SC-001','WH-09-SC-001']){
    const row=source(id),p=whToWorld(row.xM,row.yM),c=centre(row),want=Math.sign(c.z-p.z)
    let found=0
    for(let j=0;j<p3.count;j++){pos.fromBufferAttribute(p3,j)
      if(Math.abs(pos.x-p.x)<=row.lengthM/2+.01&&Math.abs(pos.z-p.z-want*(row.widthM/2+.001))<1e-4)found++}
    assert.equal(found,4,`${id} needs one screen quad on its room-facing z side`)
  }
  value.dispose()
})

test('I6-5 solids collide, control zones do not, and all 12 declared routes stay clear',()=>{
  // The shared collider's standing capsule uses floor zero; translate the scene, never a proxy.
  const root=new THREE.Group();root.position.y=-WH_R1_FLOOR_Y
  const collision=createFurnitureCollision(),value=buildWhR1Front({THREE,root,collision,canvasTex:texture})
  const solids=WH_R1_FRONT.filter(r=>r.collisionRole==='physical_proxy'&&r.category!=='显示终端')
  assert.ok(solids.length>=100)
  for(const r of solids){const p=whToWorld(r.xM,r.yM),a=r.yawDeg*Math.PI/180
    const x=p.x+Math.cos(a)*(r.lengthM/2-.02),z=p.z-Math.sin(a)*(r.lengthM/2-.02)
    assert.ok(collision.hit(x,z),`${r.id} should collide`)}
  // 检修控制区 is nonphysical_control: marked on the floor, never a collision body
  for(const r of WH_R1_FRONT.filter(r=>r.category==='检修控制区')){
    assert.equal(r.collisionRole,'nonphysical_control')
    const p=whToWorld(r.xM,r.yM);assert.equal(collision.hit(p.x,p.z),null,`${r.id} must not collide`)}
  for(const route of WH_R1_DATA.routes){const pts=route.points.map(p=>whToWorld(p[0],p[1]))
    for(let i=0;i<pts.length-1;i++)for(let s=0;s<=200;s++){
      const x=pts[i].x+(pts[i+1].x-pts[i].x)*s/200,z=pts[i].z+(pts[i+1].z-pts[i].z)*s/200
      assert.equal(collision.hit(x,z),null,`${route.id} blocked at ${x},${z}`)}}
  value.dispose();assert.equal(collision.stats().bodies,0)
})

test('I6-7 the real registry builds wh-r1-front only under whr1=1 and leaves the campus list untouched',async()=>{
  const code=readFileSync(new URL('../merge.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../vendor/three/three.module.js',import.meta.url).href}'`)
  const {mergeStatic}=await import(`data:text/javascript,${encodeURIComponent(code)}`),prior=globalThis.location
  try{
    globalThis.location={search:'?place=drlife-warehouse&whr1=1'}
    for(const tier of ['high','low']){
      const scene=new THREE.Scene(),registry=createCampusRegistry({THREE,scene,quality:{tier},layout:{}})
      registry.buildAll({quality:{tier},canvasTex:texture});mergeStatic(scene)
      assert.deepEqual(registry.summary().skipped,[])
      assert.deepEqual(registry.summary().modules,['wh-r1-shell','wh-r1-zones','wh-r1-site','wh-r1-racks','wh-r1-workflow','wh-r1-vehicles','wh-r1-front','wh-r1-validation','wh-r1-inspector'])
      const boxes=rendered(scene.getObjectByName('wh-r1-front'))
      for(const id of I6){const row=source(id),box=boxes.get(id),want=expectedBox(row)
        assert.ok(box,`${tier} merged ${id}`)
        for(const axis of ['x','y','z']){near(box.min[axis],want.min[axis],`${tier} merged ${id} min ${axis}`);near(box.max[axis],want.max[axis],`${tier} merged ${id} max ${axis}`)}}
      registry.dispose();assert.equal(scene.getObjectByName('wh-r1-front'),undefined)
    }
    // no whr1 switch: the front module must not appear and registration stays caller-driven
    globalThis.location={search:''}
    const scene=new THREE.Scene(),registry=createCampusRegistry({THREE,scene,quality:{tier:'high'},layout:{}})
    registry.buildAll({quality:{tier:'high'},canvasTex:texture})
    assert.deepEqual(registry.summary().modules,[])
    assert.equal(scene.getObjectByName('wh-r1-front'),undefined)
    registry.dispose()
  }finally{globalThis.location=prior}
})

test('I6-5 the module batches its 259 records into a bounded number of draw calls and disposes cleanly',()=>{
  const root=new THREE.Group(),value=buildWhR1Front({THREE,root,quality:{tier:'high'},canvasTex:texture})
  const drawn=[];root.traverse(m=>{if(m.isMesh&&!m.userData.collisionProxy)drawn.push(m)})
  assert.ok(drawn.length<=12,`front module draw calls: ${drawn.length}`)
  for(const m of drawn)assert.ok(m.isInstancedMesh||m.name==='wh-r1-front-screens',m.name)
  let disposed=0
  for(const m of drawn)m.geometry.addEventListener('dispose',()=>disposed++)
  value.dispose();value.dispose()
  assert.equal(disposed,drawn.length)
  assert.equal(root.children.length,0)
})
