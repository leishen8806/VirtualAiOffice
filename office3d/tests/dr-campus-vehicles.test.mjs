import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import { CAMPUS,CAMPUS_BUILDING,CAMPUS_DOCKS,CAMPUS_ZONES,CAMPUS_SHUTTLE_STRIP } from '../office-layout.js'
import { campusModules } from '../dr-campus-modules.js'
import { buildCampusMotion } from '../dr-campus-motion.js'
import { B4_PLAN,forkliftParts,truckParts,buildCampusVehicleMarkings } from '../dr-campus-vehicles.js'
import { B3_WORKSTATION_PLAN,buildCampusWorkstations } from '../dr-campus-workstations.js'
import { forkliftPath,forkliftPose,createDemoCampusEventSource } from '../dr-campus-motion-logic.js'
const layout={campus:CAMPUS,building:CAMPUS_BUILDING,zones:CAMPUS_ZONES,shuttle:CAMPUS_SHUTTLE_STRIP}
const EPS=2e-5 // 实例矩阵 Float32 的世界坐标误差；不放宽 0.05m 设计门槛。
const close=(a,b)=>assert.ok(Math.abs(a-b)<=EPS,`${a} ≈ ${b}`)
const overlap=(a,b)=>a.min.x<b.max.x-EPS&&a.max.x>b.min.x+EPS&&a.min.z<b.max.z-EPS&&a.max.z>b.min.z+EPS
const rectBox=p=>new THREE.Box3(new THREE.Vector3(p.x0,-1,p.z0),new THREE.Vector3(p.x1,5,p.z1))
const noop=()=>{},ctx=new Proxy({measureText:()=>({width:10}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(t,p)=>p in t?t[p]:noop,set:(t,p,v)=>(t[p]=v,true)})
const canvasTex=(w,h,draw)=>{draw(ctx,w,h);return new THREE.Texture()}
function boxes(root,predicate=()=>true){
  root.updateMatrixWorld(true);const list=[]
  root.traverse(mesh=>{if(!mesh.isMesh||!predicate(mesh))return;mesh.geometry.computeBoundingBox()
    if(mesh.isInstancedMesh)for(let i=0;i<mesh.count;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);list.push({name:mesh.name,index:i,part:mesh.userData.parts?.[i],box:mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld.clone().multiply(m))})}
    else if(mesh.userData.labelRanges)for(const r of mesh.userData.labelRanges){const box=new THREE.Box3();for(let i=r.start;i<r.start+r.count;i++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));list.push({name:mesh.name+':'+r.id,box})}
    else list.push({name:mesh.name,box:new THREE.Box3().setFromObject(mesh)})
  });return list
}
function fixtures(){
  const root=new THREE.Group(),built=campusModules.filter(([id])=>['shell','vis2Rack','workstations','racks','yard-docks'].includes(id)).map(([,build])=>build({THREE,root,layout,quality:{tier:'high'},canvasTex}))
  const obstacles=boxes(root,m=>/^(campus-wall|campus-door|campus-racks-support|campus-rack-labels|vis2-rack-|vis2-pallet|vis2-carton|vis2-film|b3-)/.test(m.name)&&!m.name.includes('stage-marks'))
  return {root,obstacles,dispose(){built.forEach(m=>m.dispose?.())}}
}
const diskGap=(p,b)=>Math.hypot(Math.max(b.min.x-p.x,p.x-b.max.x,0),Math.max(b.min.z-p.z,p.z-b.max.z,0))-p.radius

test('B4 approved parking, L04, main lane and relocated stage are exact real scene boxes',()=>{
  const root=new THREE.Group(),a=buildCampusVehicleMarkings({THREE,root,canvasTex}),b=buildCampusWorkstations({THREE,root,quality:{tier:'high'}})
  const all=boxes(root),parts=all.filter(p=>p.part)
  assert.equal(B4_PLAN.parking.length,4)
  B4_PLAN.parking.forEach((r,i)=>{close(r.x0,-98+i*4.3);close(r.x1-r.x0,3.8);close(r.z0,21);close(r.z1-r.z0,2.1);const actual=new THREE.Box3();parts.filter(p=>p.part.name===r.id).forEach(p=>actual.union(p.box));close(actual.min.x,r.x0);close(actual.max.x,r.x1);close(actual.min.z,r.z0);close(actual.max.z,r.z1)})
  assert.deepEqual(B4_PLAN.main,{id:'F-MAIN',x0:-164,x1:-105.3,z0:-4.25,z1:-.75})
  const walk=parts.find(p=>p.part.name==='L04-surface').box;close(walk.min.x,-167);close(walk.max.x,-116);close(walk.min.z,29);close(walk.max.z,30.8)
  assert.deepEqual(B3_WORKSTATION_PLAN.staging,{id:'Q-STAGE-01',kind:'inspection-staging',x0:-136.7,x1:-128.7,z0:-10.3,z1:-4.3})
  const stage=all.filter(p=>p.name==='b3-stage-marks'),bound=new THREE.Box3();stage.forEach(p=>bound.union(p.box));assert.ok(bound.min.z>=-10.3-EPS&&bound.max.z<=-4.3+EPS)
  for(const pallet of all.filter(p=>p.name==='b3-stage-pallets'))assert.ok(rectBox(B3_WORKSTATION_PLAN.staging).containsBox(pallet.box))
  const f=fixtures();for(const r of B4_PLAN.parking)for(const o of f.obstacles)assert.equal(overlap(rectBox(r),o.box),false,`${r.id}/${o.name}`)
  for(const o of f.obstacles){const d=Math.hypot(Math.max(walk.min.x-o.box.max.x,o.box.min.x-walk.max.x,0),Math.max(walk.min.z-o.box.max.z,o.box.min.z-walk.max.z,0));if(!o.name.startsWith('campus-wall'))assert.ok(d>=1-EPS,`L04/${o.name} ${d}`)}
  f.dispose();a.dispose();b.dispose()
})

test('B4 five approved turning disks clear actual B1-B3 Box3 and truck bays by at least 0.05m',()=>{
  const f=fixtures(),obstacles=[...f.obstacles,...CAMPUS_DOCKS.map(d=>({name:d.id,box:rectBox(d.bay)}))]
  assert.deepEqual(B4_PLAN.turns.map(p=>[p.x,p.z,p.radius]),[[-143.75,-15.42,2.25],[-143.75,-3,2.25],[-118,-2.5,2.25],[-112,-2.5,2.25],[-106,-2.5,2.25]])
  const minima=B4_PLAN.turns.map(p=>{const sorted=obstacles.map(o=>({name:o.name,distance:diskGap(p,o.box)})).sort((a,b)=>a.distance-b.distance);assert.ok(sorted[0].distance>=.05-EPS,`${p.id}/${sorted[0].name}: ${sorted[0].distance}`);return {id:p.id,...sorted[0]}})
  console.log('B4 turn clearances',JSON.stringify(minima))
  assert.ok(obstacles.some(o=>diskGap({...B4_PLAN.turns[0],z:-15.5},o.box)<.05-EPS),'north-circle mutation caught')
  f.dispose()
})

test('B4 forklift and truck exact envelopes include forks, wheels and new detail, no duplicate fleet',()=>{
  const root=new THREE.Group(),motion=buildCampusMotion({THREE,root,layout,quality:{tier:'high'},search:'?campusMotion=0'})
  const all=boxes(root)
  for(let i=0;i<4;i++){const b=new THREE.Box3();all.filter(p=>p.part?.kind==='forklift'&&p.part.index===i).forEach(p=>b.union(p.box));close(b.max.x-b.min.x,2.8);close(b.max.z-b.min.z,1.1);close(b.min.y,-.54);close(b.max.y+.54,3.4);assert.ok(rectBox(B4_PLAN.parking[i]).containsBox(b))}
  for(let i=0;i<8;i++){const b=new THREE.Box3();all.filter(p=>p.part?.kind==='truck'&&p.part.index===i).forEach(p=>b.union(p.box));const size=b.getSize(new THREE.Vector3());close(Math.max(size.x,size.z),9);close(Math.min(size.x,size.z),2.55);close(b.min.y,-.54)}
  for(const name of ['mast','fork','overhead-guard','wheel','seat'])assert.ok(forkliftParts().some(p=>p.part===name))
  for(const name of ['windscreen','cab','rear-door','wheel-arch-top'])assert.ok(truckParts().some(p=>p.part===name))
  motion.dispose()
})

test('B4 all-time swept forklift envelopes stay indoors, outside bays and real workstations on both complete cycles',()=>{
  const f=fixtures(),bays=CAMPUS_DOCKS.map(d=>({name:d.id,box:rectBox(d.bay)}))
  const hull=new THREE.Box3(new THREE.Vector3(-.55,-.54,-1.4),new THREE.Vector3(.55,2.86,1.4))
  let checks=0
  for(const index of [0,3]){
    const path=forkliftPath(layout,index),period=forkliftPose(path,0).period
    // 直行段端点 Box3 的并集覆盖整段；转向用车身外接圆覆盖任意角度，不仅抽帧。
    for(let i=0;i<path.length-1;i++){
      const p=path[i],to=path[i+1],previous=path[i===0?path.length-2:i-1].heading
      const fromMatrix=new THREE.Matrix4().makeRotationY(p.heading);fromMatrix.setPosition(p.x,0,p.z)
      const toMatrix=fromMatrix.clone().setPosition(to.x,0,to.z),sweep=hull.clone().applyMatrix4(fromMatrix).union(hull.clone().applyMatrix4(toMatrix))
      assert.ok(sweep.min.x>=-167.72-EPS&&sweep.max.x<=-80.28+EPS&&sweep.min.z>=-17.72-EPS&&sweep.max.z<=29.72+EPS)
      for(const o of [...bays,...f.obstacles]){
        assert.equal(overlap(sweep,o.box),false,`segment ${index}/${i}/${o.name}`)
        if(Math.abs(Math.atan2(Math.sin(p.heading-previous),Math.cos(p.heading-previous)))>1e-6)assert.ok(diskGap({...p,radius:Math.hypot(1.4,.55)},o.box)>=-EPS,`rotation ${index}/${i}/${o.name}`)
      }
    }
    for(let t=0;t<=period*2+40;t+=40){const p=forkliftPose(path,t),m=new THREE.Matrix4().makeRotationY(p.angle);m.setPosition(p.x,0,p.z);const b=hull.clone().applyMatrix4(m)
      assert.ok(b.min.x>=-167.72-EPS&&b.max.x<=-80.28+EPS&&b.min.z>=-17.72-EPS&&b.max.z<=29.72+EPS,`indoor ${index} ${t}`)
      for(const o of [...bays,...f.obstacles])assert.equal(overlap(b,o.box),false,`path ${index} t=${t} ${o.name} [${p.x},${p.z}]`)
      checks++
    }
  }
  console.log('B4 swept envelope 40ms samples',checks)
  f.dispose()
})

test('B4 production animation uses approved paths, reaches parking, and reuses geometry on pause/dispose',()=>{
  let time=0;const root=new THREE.Group(),source=createDemoCampusEventSource({now:()=>time}),motion=buildCampusMotion({THREE,root,layout,quality:{tier:'high'},eventSource:source})
  const meshes=root.getObjectByName('campus-motion').children.filter(x=>x.isMesh),ids=meshes.map(x=>[x.geometry.uuid,x.material.uuid]);motion.onFrame(0)
  for(time=100;time<=12000;time+=100)motion.onFrame(.1)
  const live=boxes(root).filter(p=>p.part?.kind==='forklift'&&p.part.index===0),hull=new THREE.Box3();live.forEach(p=>hull.union(p.box));const expected=forkliftPose(forkliftPath(layout),motion.summary().animationMs);close(hull.getCenter(new THREE.Vector3()).x,expected.x);close(hull.getCenter(new THREE.Vector3()).z,expected.z)
  const values=meshes.map(x=>Array.from(x.instanceMatrix.array));motion.setPaused(true);for(let i=0;i<20;i++){time+=100;motion.onFrame(.1)}assert.deepEqual(meshes.map(x=>Array.from(x.instanceMatrix.array)),values);assert.deepEqual(meshes.map(x=>[x.geometry.uuid,x.material.uuid]),ids)
  motion.dispose();motion.dispose();assert.equal(root.children.length,0)
})

test('B4 split labels remain four physical plaques with one atlas and one draw batch',()=>{
  const f=fixtures(),mesh=f.root.getObjectByName('campus-rack-labels')
  assert.equal(mesh.userData.labelRanges.length,4);assert.equal(mesh.geometry.groups.length,0);assert.ok(mesh.material.map)
  const all=boxes(f.root,m=>m===mesh);assert.equal(all.length,4)
  for(const p of all){close(p.box.max.x-p.box.min.x,1.6);close(p.box.min.z,-4.9)}
  for(const x of [-118,-112,-106])assert.equal(all.some(p=>p.box.min.x<=x+.55&&p.box.max.x>=x-.55),false)
  f.dispose()
})

test('B4 full-width main and receiving lanes, shipping route and L04 clear actual operations',()=>{
  const f=fixtures(),stage=rectBox(B3_WORKSTATION_PLAN.staging),bays=CAMPUS_DOCKS.map(d=>({name:d.id,box:rectBox(d.bay)}))
  const lanes=[B4_PLAN.main,B4_PLAN.receiving]
  const points=B4_PLAN.shipping
  for(let i=0;i<points.length-1;i++){const [x,z]=points[i],[xx,zz]=points[i+1];lanes.push({id:`SHP-${i}`,x0:Math.min(x,xx)-(x===xx?1.75:0),x1:Math.max(x,xx)+(x===xx?1.75:0),z0:Math.min(z,zz)-(z===zz?1.75:0),z1:Math.max(z,zz)+(z===zz?1.75:0)})}
  for(const lane of lanes){const b=rectBox(lane);for(const o of [...f.obstacles,...bays,{name:'Q-STAGE-01',box:stage}])assert.equal(overlap(b,o.box),false,`${lane.id}/${o.name}`)}
  close(B4_PLAN.main.z0-B3_WORKSTATION_PLAN.staging.z1,.05)
  close(B3_WORKSTATION_PLAN.pickingRacks[0].z0-B4_PLAN.main.z1,.05)
  close(B3_WORKSTATION_PLAN.staging.z0-B3_WORKSTATION_PLAN.qualityTables[3].z1,2)
  const walk=rectBox(B4_PLAN.visitor)
  for(const lane of lanes)assert.equal(overlap(walk,rectBox(lane)),false)
  for(const dock of CAMPUS_DOCKS)assert.equal(overlap(walk,rectBox(dock.bay)),false)
  f.dispose()
})
