import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { WH_R1_DATA, WH_R1_ASSIGNMENT } from '../wh-r1/data.js'
import { WH_R1_FLOOR_Y, whToWorld } from '../wh-r1-layout.js'
import { buildWhR1Vehicles, WH_R1_VEHICLES, WH_R1_SWEEPS, WH_R1_LEVELS, WH_R1_DOCK_MARKS } from '../dr-wh-r1-vehicles.js'
import { createCampusRegistry } from '../dr-campus-registry.js'
import { createFurnitureCollision } from '../furniture-collision.js'
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<.00002,`${m}: ${a} != ${b}`)
const texture=()=>new THREE.Texture()
function boxes(root){
 root.updateMatrixWorld(true);const result=new Map(),matrix=new THREE.Matrix4()
 root.traverse(m=>{if(!m.isInstancedMesh||!m.userData.instanceToRegisterId)return;m.geometry.computeBoundingBox();m.userData.instanceToRegisterId.forEach((id,i)=>{m.getMatrixAt(i,matrix);const box=m.geometry.boundingBox.clone().applyMatrix4(matrix.clone().premultiply(m.matrixWorld));if(!result.has(id))result.set(id,new THREE.Box3());result.get(id).union(box)})});return result
}
test('I5 keeps all nine trucks and fourteen equipment records without changing source values',()=>{
 const ids=new Set(WH_R1_ASSIGNMENT.filter(r=>r.card==='I5').map(r=>r.id))
 assert.deepEqual(WH_R1_VEHICLES,WH_R1_DATA.elements.filter(r=>ids.has(r.id)))
 assert.equal(WH_R1_VEHICLES.filter(r=>r.category==='厢式货车').length,9);assert.equal(WH_R1_VEHICLES.filter(r=>r.category==='搬运设备占位').length,14)
 assert.equal(WH_R1_VEHICLES.find(r=>r.id==='WH-01-VH-005').yawDeg,0)
 assert.equal(WH_R1_VEHICLES.filter(r=>r.regionId==='06'&&r.category==='厢式货车').length,4)
})
test('I5 high and low actual full merge retain every ID, registered envelope, orientation and ground height',async()=>{
 const code=readFileSync(new URL('../merge.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../vendor/three/three.module.js',import.meta.url).href}'`)
 const {mergeStatic}=await import(`data:text/javascript,${encodeURIComponent(code)}`),prior=globalThis.location
 try{globalThis.location={search:'?place=drlife-warehouse&whr1=1'}
  for(const tier of ['high','low']){
   const scene=new THREE.Scene(),registry=createCampusRegistry({THREE,scene,quality:{tier},layout:{}});registry.buildAll({quality:{tier},canvasTex:texture});mergeStatic(scene);if(tier==='low')mergeStatic(scene)
   assert.deepEqual(registry.summary().skipped,[]);assert.equal(registry.summary().modules.at(-1),'wh-r1-vehicles')
   const root=scene.getObjectByName('wh-r1-vehicles'),rendered=boxes(root);assert.equal(rendered.size,23)
   for(const r of WH_R1_VEHICLES){
    const p=whToWorld(r.xM,r.yM),b=rendered.get(r.id),expected=new THREE.Box3(new THREE.Vector3(-r.lengthM/2,0,-r.widthM/2),new THREE.Vector3(r.lengthM/2,r.heightM,r.widthM/2)).applyMatrix4(new THREE.Matrix4().makeRotationY(r.yawDeg*Math.PI/180)).translate(new THREE.Vector3(p.x,WH_R1_FLOOR_Y+r.zM,p.z))
    for(const axis of ['x','y','z']){near(b.min[axis],expected.min[axis],r.id+' min '+axis);near(b.max[axis],expected.max[axis],r.id+' max '+axis)}
    const proxy=root.getObjectByName('wh-r1-vehicle-proxy-'+r.id);near(proxy.rotation.y,r.yawDeg*Math.PI/180,r.id+' yaw');assert.ok(!proxy.isInstancedMesh)
   }
   const m=root.getObjectByName('wh-r1-vehicles-boxes');assert.ok(m.instanceColor);assert.ok(m.userData.parts.includes('fork'));assert.ok(m.userData.parts.includes('windscreen'))
   assert.equal(root.getObjectByName('wh-r1-vehicle-labels').userData.labels.filter(r=>r.text.includes('UNKNOWN')).length,10)
   registry.dispose();assert.equal(scene.getObjectByName('wh-r1-vehicles'),undefined)
  }
 }finally{globalThis.location=prior}
})
test('I5 seven round-ended sweeps preserve blocked and conditional values without inventing a drive route',()=>{
 assert.deepEqual(WH_R1_SWEEPS,WH_R1_DATA.integrityAudit.routes.filter(r=>/^(TR|FL)/.test(r.id)))
 assert.deepEqual(WH_R1_SWEEPS.map(r=>r.id),['TR01','TR02','TR03','TR04','FL01','FL02','FL03'])
 for(const r of WH_R1_SWEEPS.slice(0,2)){assert.equal(r.status,'BLOCKED');assert.equal(r.min_clearance_mm,-1250);assert.equal(r.swept_radius_mm,1250);assert.deepEqual(r.nearest_ids,['WH-01-VH-005'])}
 assert.deepEqual(WH_R1_SWEEPS.slice(2,4).map(r=>[r.status,r.min_clearance_mm]),[['CONDITIONAL_STATIC_CLEAR',350],['CONDITIONAL_STATIC_CLEAR',115]])
 const root=new THREE.Group(),value=buildWhR1Vehicles({THREE,root}),overlay=value.root.getObjectByName('wh-r1-vehicle-inspection-overlays'),pos=overlay.geometry.attributes.position
 for(const range of overlay.userData.ranges.filter(r=>/^(TR|FL)/.test(r.id))){const row=WH_R1_SWEEPS.find(r=>r.id===range.id),a=whToWorld(...row.points_m[0]),b=whToWorld(...row.points_m[1]),r=row.swept_radius_mm/1000,x=[],z=[];for(let i=range.start;i<range.start+range.count;i++){x.push(pos.getX(i));z.push(pos.getZ(i))}near(Math.max(...x)-Math.min(...x),2*r,row.id+' width');near(Math.max(...z)-Math.min(...z),Math.abs(a.z-b.z)+2*r,row.id+' round ends')}
 assert.equal(value.onFrame,undefined);assert.equal(value.routes,undefined);assert.equal(value.root.userData.motion,'NONE — static drawing objects only')
 const source=readFileSync(new URL('../dr-wh-r1-vehicles.js',import.meta.url),'utf8');assert.doesNotMatch(source,/CAMPUS_VEHICLE_ROUTES|B4_PLAN|pathPoint|requestAnimationFrame|setInterval/)
 value.dispose()
})
test('I5 unknown dock, cargo floor and entrance step elevations stay unknown; only nine flat door annotations exist',()=>{
 assert.deepEqual(WH_R1_LEVELS,{dock:'UNKNOWN',cargoFloor:'UNKNOWN',entranceStep:'UNKNOWN',sources:['WH-SITE-DOCK-U01','WH-SITE-ACCESS-U01']})
 assert.equal(WH_R1_DOCK_MARKS.length,9)
 for(const mark of WH_R1_DOCK_MARKS){const door=WH_R1_DATA.doors.find(r=>r.id===mark.doorId);assert.deepEqual({x:mark.x,z:mark.z},whToWorld(door.xM,door.yM));assert.equal(mark.widthM,door.lengthM);assert.equal(mark.level,'UNKNOWN');assert.equal(mark.displayOnly,'DESIGN_ASSUMPTION');assert.equal(mark.height,undefined)}
 assert.deepEqual(WH_R1_DOCK_MARKS.slice(5).map(r=>r.sourceTag),['05','06','UNKNOWN','08'])
})
test('I5 real collision blocks each individual vehicle and releases only its own proxies',()=>{
 const root=new THREE.Group();root.position.y=-WH_R1_FLOOR_Y;const collision=createFurnitureCollision(),v=buildWhR1Vehicles({THREE,root,collision})
 assert.equal(collision.stats().bodies,23)
 for(const r of WH_R1_VEHICLES){const p=whToWorld(r.xM,r.yM),yaw=r.yawDeg*Math.PI/180;const hit=collision.hit(p.x+Math.cos(yaw)*(r.lengthM/2-.01),p.z-Math.sin(yaw)*(r.lengthM/2-.01));assert.equal(hit?.group.userData.whR1Id,r.id,r.id)}
 v.dispose();v.dispose();assert.equal(collision.stats().bodies,0);assert.equal(root.children.length,0)
})
test('I5 non-WH registry preserves registration order and does not build vehicle data',()=>{
 const prior=globalThis.location
 try{for(const search of ['','?place=drlife-warehouse','?campus=1','?whr1=0','?whr1=1&whr1=1']){globalThis.location={search};const scene=new THREE.Scene(),r=createCampusRegistry({THREE,scene,quality:{tier:'high'},layout:{}});for(const name of ['shell','yard','racks','motion'])r.register(name,()=>({}));r.buildAll();assert.deepEqual(r.summary().modules,['shell','yard','racks','motion']);assert.equal(scene.getObjectByName('wh-r1-vehicles'),undefined);r.dispose()}}finally{globalThis.location=prior}
 const manifest=JSON.parse(readFileSync(new URL('../wh-r1/MANIFEST.json',import.meta.url)));const code=readFileSync(new URL('../dr-wh-r1-vehicles.js',import.meta.url),'utf8').replace(/\r\n/g,'\n')
 assert.equal(manifest.runtimeModules['dr-wh-r1-vehicles.js'].sha256,createHash('sha256').update(code).digest('hex'))
})
