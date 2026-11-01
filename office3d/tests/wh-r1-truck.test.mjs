import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { buildWhR1Vehicles, WH_R1_VEHICLES } from '../dr-wh-r1-vehicles.js'
import { WH_R1_FLOOR_Y, whToWorld } from '../wh-r1-layout.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const truckRows=WH_R1_VEHICLES.filter(row=>row.category==='厢式货车')
const truckCenter=row=>{const p=whToWorld(row.xM,row.yM);return new THREE.Vector3(p.x,WH_R1_FLOOR_Y+row.zM+row.heightM/2,p.z)}

function setup(tier='high') {
  const text=[],ctx={fillRect(){},fillText(s){text.push(s)}}
  const quality={tier},env={night:0},root=new THREE.Group(),collision=createFurnitureCollision()
  root.position.y=-WH_R1_FLOOR_Y
  const v=buildWhR1Vehicles({THREE,root,quality,env,collision,canvasTex:(w,h,draw)=>{draw(ctx);return new THREE.Texture()}})
  const camera=new THREE.PerspectiveCamera();camera.position.copy(truckCenter(truckRows[0])).setY(3)
  return {v,quality,env,root,collision,camera,text}
}

test('TR-1 detailed physical vertices, proxies and all 23 registered poses remain inside I5 envelopes',()=>{
  const {v,collision}=setup(),detail=v.root.getObjectByName('wh-r1-truck-detail'),lamps=v.root.getObjectByName('wh-r1-truck-lamps')
  for(const mesh of [detail,lamps]){
    const p=mesh.geometry.attributes.position
    for(let i=0;i<p.count;i++){
      assert.ok(Math.abs(p.getX(i))<=4.000001);assert.ok(Math.abs(p.getZ(i))<=1.500001)
      assert.ok(p.getY(i)>=-0.000001&&p.getY(i)<=3.400001)
    }
  }
  detail.geometry.computeBoundingBox()
  const b=detail.geometry.boundingBox
  for(const [a,target] of [['x',8],['y',3.4],['z',3.0]])assert.ok(Math.abs(b.max[a]-b.min[a]-target)<.000001)
  for(const r of WH_R1_VEHICLES){
    const m=v.root.getObjectByName(`wh-r1-vehicle-proxy-${r.id}`),p=whToWorld(r.xM,r.yM)
    assert.deepEqual(m.position.toArray(),[p.x,r.zM+r.heightM/2,p.z]);assert.equal(m.rotation.y,r.yawDeg*Math.PI/180)
    assert.deepEqual([m.geometry.parameters.width,m.geometry.parameters.height,m.geometry.parameters.depth],[r.lengthM,r.heightM,r.widthM])
    assert.equal(m.isInstancedMesh,undefined);assert.equal(collision.hit(p.x+Math.cos(m.rotation.y)*(r.lengthM/2-.01),p.z-Math.sin(m.rotation.y)*(r.lengthM/2-.01))?.group.userData.whR1Id,r.id)
  }
  assert.equal(collision.stats().bodies,23);v.dispose();assert.equal(collision.stats().bodies,0)
})

test('TR-2/4 shared logo and fleet atlas retains nine distinct IDs and 示意 on bright labels',()=>{
  const {v,text}=setup(),a=v.root.getObjectByName('wh-r1-truck-livery')
  assert.equal(a.userData.logo,'assets/logo.png');assert.equal(a.userData.fleet.length,9)
  assert.deepEqual(a.userData.fleet.map(f=>f.number),Array.from({length:9},(_,i)=>`DL-0${i+1}`))
  for(const f of a.userData.fleet){assert.ok(text.includes(f.number));assert.ok(text.includes(f.id+' · 示意'))}
  assert.equal(a.material.toneMapped,false);assert.equal(v.root.getObjectByName('wh-r1-vehicle-labels').material.toneMapped,false)
  const roofLabel=v.root.getObjectByName('wh-r1-vehicle-labels').geometry.attributes.normal
  for(let i=0;i<roofLabel.count;i++)assert.equal(roofLabel.getY(i),1)
  assert.ok(!a.material.transparent);assert.equal(v.root.userData.trucks.mirrorsBeyondEnvelope,.25)
  const parts=v.root.userData.trucks.parts
  for(const name of ['windscreen','A-pillar','door-handle','mirror','step','wiper','grille','headlamp','indicator','foglamp','frame-rail','fuel-tank','battery-box','side-guard','rear-underrun','mudflap','tyre','rim','cargo-rib','corner-post','roof-rail','closed-rear-door','locking-rod','hinge','rear-handle','rear-lamp','side-marker','reflector'])assert.ok(parts.some(p=>p.name===name),name)
  assert.equal(parts.filter(p=>p.name==='tyre').length,6);assert.equal(parts.filter(p=>p.name==='closed-rear-door').length,2)
  v.dispose()
})

test('TR-3 LOD hysteresis and complementary fade do not move vehicles, tyres, doors or collision',()=>{
  const {v,camera,quality,env}=setup(),detail=v.root.getObjectByName('wh-r1-truck-detail')
  const snapshot=()=>v.root.children.filter(m=>(m.isInstancedMesh&&m.name!=='wh-r1-truck-detail')||m.userData.collisionProxy).map(m=>m.isInstancedMesh?Array.from(m.instanceMatrix.array):[...m.position.toArray(),...m.quaternion.toArray()])
  const before=snapshot(),center=truckCenter(truckRows[0])
  const at=d=>{camera.position.copy(center).add(new THREE.Vector3(0,d,0));v.onFrame(.1,{camera});return v.root.userData.trucks.state[0]}
  assert.equal(at(31).near,true);for(let i=0;i<10;i++)assert.equal(at(35).near,true)
  assert.equal(at(39).near,true);assert.equal(at(41).near,false)
  for(let i=0;i<10;i++)assert.equal(at(35).near,false)
  assert.equal(at(31).near,true);assert.ok(detail.visible)
  const old=at(31).blend;assert.ok(at(41).blend<old)
  quality.tier='low';at(1);assert.equal(detail.visible,false)
  const lamps=v.root.getObjectByName('wh-r1-truck-lamps'),original=lamps.material
  lamps.material=new THREE.MeshLambertMaterial({vertexColors:true,emissive:0xffffff});original.dispose()
  env.night=1;v.onFrame(.1,{camera});assert.equal(v.root.getObjectByName('wh-r1-truck-lamps').material.emissiveIntensity,1.6)
  assert.equal(lamps.material.polygonOffset,true);assert.equal(lamps.material.polygonOffsetFactor,-1);assert.equal(lamps.material.polygonOffsetUnits,-1)
  env.night=0;v.onFrame(.1,{camera});assert.equal(v.root.getObjectByName('wh-r1-truck-lamps').material.emissiveIntensity,0)
  assert.deepEqual(snapshot(),before);assert.equal(v.routes,undefined);assert.equal(v.root.userData.trucks.rearDoors,'CLOSED')
  const lights=[];v.root.traverse(o=>{if(o.isLight)lights.push(o)});assert.equal(lights.length,0)
  assert.equal(v.root.userData.motion,'NONE — static drawing objects only');v.dispose()
})

test('TR-5 added worst-case geometry remains within two-pass high and single-pass low budgets',()=>{
  const {v}=setup(),tri=m=>(m.geometry.index?.count||m.geometry.attributes.position.count)/3*(m.count||1)
  const detail=v.root.getObjectByName('wh-r1-truck-detail'),lamps=v.root.getObjectByName('wh-r1-truck-lamps'),livery=v.root.getObjectByName('wh-r1-truck-livery')
  assert.ok(2*(tri(detail)+tri(lamps)+tri(livery))<=45000)
  assert.ok(tri(lamps)+tri(livery)<=12000)
  assert.equal([detail,lamps,livery].length*2,6);assert.ok([lamps,livery].length<=3)
  assert.ok(detail.material.onBeforeCompile.toString().includes('screenDoor'))
  v.dispose()
})

test('TR-7 measured cab, gap, two-axle chassis and mirror-only exception follow R2 proportions',()=>{
 const {v}=setup(),data=v.root.userData.trucks,parts=data.parts
 const all=n=>parts.filter(p=>p.name===n),one=n=>all(n)[0],span=(p,a)=>p.bounds[1][a]-p.bounds[0][a],near=(a,b)=>assert.ok(Math.abs(a-b)<.00002,`${a} != ${b}`)
 const cab=one('cab-shell'),box=one('cargo-panel'),axles=all('axle'),tyres=all('tyre')
 near(span(cab,0),2);near(box.bounds[0][0]-cab.bounds[1][0],.2);near(span(box,0),5.8)
 near(span(cab,2),2.26);near(cab.bounds[1][1],2.8);near(one('roof-rail').bounds[1][1],3.4);near(one('sill').bounds[0][1],1.05)
 assert.equal(axles.length,2);const center=p=>p.bounds[0].map((x,i)=>(x+p.bounds[1][i])/2)
 near(center(axles[0])[0]+4,1.2);near(center(axles[1])[0]-center(axles[0])[0],4.6);near(4-center(axles[1])[0],2.2)
 assert.equal(tyres.length,6);for(const tyre of tyres){near(span(tyre,0),.9);near(span(tyre,1),.9);near(tyre.bounds[0][1],0);assert.ok(tyre.count/3>=48)}
 assert.equal(tyres.filter(p=>center(p)[0]<0).length,2);assert.equal(tyres.filter(p=>center(p)[0]>0).length,4)
 for(const p of parts){const b=p.bounds;if(b[0][2]<-1.250001||b[1][2]>1.250001){assert.ok(/^mirror/.test(p.name),p.name);assert.ok(b[0][2]>=-1.550001&&b[1][2]<=1.550001)}}
 // Inspect the actual mesh's front plane, not just the declared slope parameter.
 const g=v.root.getObjectByName('wh-r1-truck-detail').geometry,n=g.attributes.normal,slopes=[]
 for(let i=cab.start;i<cab.start+cab.count;i++)if(n.getX(i)<-.9&&n.getY(i)>.1&&n.getY(i)<.3&&Math.abs(n.getZ(i))<.00001)slopes.push(Math.atan2(n.getY(i),-n.getX(i))*180/Math.PI)
 assert.ok(slopes.length>0);for(const angle of slopes)assert.ok(angle>=8&&angle<=10,String(angle))
 assert.equal(data.dimensions.bevelRadius,.18);v.dispose()
})

test('TR-3 actual detail submission shrinks per active truck and disappears at far/low while IDs retain fixed poses',()=>{
 const {v,camera,quality}=setup(),m=v.root.getObjectByName('wh-r1-truck-detail'),fleet=v.root.userData.trucks.fleet,mat=new THREE.Matrix4()
 const centers=[truckCenter(truckRows[0]),truckCenter(truckRows.at(-1))]
 const locations=[centers[0].clone().setY(3),centers[0].clone().lerp(centers[1],.5).setY(60),centers[1].clone().setY(3)]
 for(const location of locations){
  camera.position.copy(location);for(let i=0;i<12;i++)v.onFrame(.1,{camera})
  assert.equal(m.count,m.userData.instanceToRegisterId.length)
  m.userData.instanceToRegisterId.forEach((id,i)=>{const f=fleet.find(f=>f.id===id);m.getMatrixAt(i,mat);const expected=new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.x,f.zM,f.z);mat.elements.forEach((x,j)=>assert.ok(Math.abs(x-expected.elements[j])<.00001))})
  if(location.y===60){assert.equal(m.count,0);assert.equal(m.visible,false)}else assert.ok(m.count>0&&m.count<9)
 }
 quality.tier='low';v.onFrame(.1,{camera});assert.equal(m.count,0);v.dispose()
})


test('R3 four detail groups use rounded tyres, attached equipment and side/rear IDs without roof stripes',()=>{
 const {v}=setup(),parts=v.root.userData.trucks.parts,all=n=>parts.filter(p=>p.name===n),one=n=>all(n)[0],center=p=>p.bounds[0].map((x,i)=>(x+p.bounds[1][i])/2)
 const mesh=v.root.getObjectByName('wh-r1-truck-detail'),p=mesh.geometry.attributes.position,surface=mesh.geometry.attributes.truckSurface
 assert.equal(all('windscreen-highlight').length,1);assert.equal(all('wiper').length,2);assert.equal(all('front-fascia').length,1);assert.equal(all('bumper-seam').length,1)
 for(const n of ['headlamp','indicator'])for(const light of all(n)){
  const f=one('front-fascia').bounds
  assert.ok(light.bounds[0][1]>=f[0][1]&&light.bounds[1][1]<=f[1][1]);assert.ok(light.bounds[0][2]>=f[0][2]&&light.bounds[1][2]<=f[1][2])
 }
 for(const tyre of all('tyre')){
  const c=center(tyre),sections=new Map()
  for(let i=tyre.start;i<tyre.start+tyre.count;i++){
   const a=Math.round((p.getZ(i)-c[2])*1000),r=Math.hypot(p.getX(i)-c[0],p.getY(i)-c[1]);sections.set(a,Math.max(sections.get(a)||0,r))
   assert.ok(Math.abs(surface.getX(i)-.92)<1e-6);assert.equal(surface.getY(i),0)
  }
  assert.equal(sections.size,4);assert.ok(sections.get(-100)<sections.get(-70));assert.ok(sections.get(100)<sections.get(70));assert.ok(Math.abs(sections.get(70)-.45)<1e-6)
 }
 assert.equal(all('rim-spoke').length,24)
 for(const sign of [-1,1]){
  const pair=all('tyre').filter(t=>center(t)[0]>0&&Math.sign(center(t)[2])===sign).sort((a,b)=>a.bounds[0][2]-b.bounds[0][2])
  assert.ok(Math.abs(pair[1].bounds[0][2]-pair[0].bounds[1][2]-.05)<1e-6)
  assert.equal(all('side-guard').filter(p=>Math.sign(center(p)[2])===sign).length,2)
 }
 for(const b of all('equipment-hanger')){
  assert.ok(all('frame-rail').some(r=>[0,1,2].every(a=>Math.min(b.bounds[1][a],r.bounds[1][a])>Math.max(b.bounds[0][a],r.bounds[0][a]))))
  assert.ok([...all('fuel-tank'),...all('battery-box')].some(r=>[0,1,2].every(a=>Math.min(b.bounds[1][a],r.bounds[1][a])>Math.max(b.bounds[0][a],r.bounds[0][a]))))
 }
 for(const b of all('guard-hanger'))assert.ok(b.bounds[1][1]>=one('sill').bounds[0][1])
 for(const n of ['rear-lamp','rear-indicator','reverse-lamp'])assert.equal(all(n).length,2)
 for(const door of all('closed-rear-door')){assert.ok(one('rear-top-rail').bounds[0][1]<=door.bounds[1][1]);assert.ok(one('rear-bottom-rail').bounds[1][1]>=door.bounds[0][1])}
 assert.equal(all('rear-underrun').length,1);assert.equal(all('rear-underrun-bracket').length,2);assert.equal(all('hinge').length,6)
 const cargo=one('cargo-panel'),colors=mesh.geometry.attributes.color
 assert.equal(cargo.count,30);for(let i=cargo.start;i<cargo.start+cargo.count;i++)assert.ok(mesh.geometry.attributes.normal.getX(i)<.5,'No rear body face may cover closed-door hardware')
 for(let i=cargo.start;i<cargo.start+cargo.count;i++)assert.deepEqual([colors.getX(i),colors.getY(i),colors.getZ(i)],[1,1,1])
 assert.equal(all('cargo-rib').length,32)
 const ids=v.root.getObjectByName('wh-r1-truck-livery').userData.idPlates
 assert.equal(ids.length,27)
 for(const truck of WH_R1_VEHICLES.filter(r=>r.category==='厢式货车')){
  const rows=ids.filter(r=>r.id===truck.id);assert.equal(rows.length,3)
  assert.equal(rows.filter(r=>r.axis==='side'&&r.local[0]===3&&r.local[1]===3.19).length,2)
  assert.equal(rows.filter(r=>r.axis==='end'&&r.local[0]===4).length,1)
  assert.ok(!v.root.getObjectByName('wh-r1-vehicle-labels').userData.labels.some(r=>r.id===truck.id))
 }
 v.dispose()
})
