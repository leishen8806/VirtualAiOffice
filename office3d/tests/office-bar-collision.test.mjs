import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {barLounges} from '../office-bar-geometry.js'
import {buildOfficeTeaBarSample} from '../office-vis2/bar.js'
import {buildOfficeSampleHost} from '../office-vis2/host.js'
import {createFurnitureCollision} from '../furniture-collision.js'
import {createOfficeV2Registry} from '../office-v2-registry.js'

const textureLoader={loadAsync:async()=>new THREE.Texture()}
for(const low of[false,true])test(`ALIGN ${low?'low':'high'} actual counter/stools/pool block movement while every sofa has its own reachable seat body`,()=>{
 const root=new THREE.Group(),world=createFurnitureCollision(),bar=buildOfficeTeaBarSample({THREE,root,layout,low,collision:world})
 try{
  assert.equal(world.stats().bodies,18);assert.equal(bar.summary().colliders,18)
  assert.equal(bar.root.userData.bar.plantCollision,true)
  const c=layout.bar.center
  for(const a of [Math.PI/3,Math.PI/2,Math.PI*2/3,Math.PI*4/3,Math.PI*1.5])for(const r of[2.2,2.8,3.4])assert.equal(world.hit(c.x+Math.cos(a)*r,c.z+Math.sin(a)*r)?.kind,'officeBar')
  assert.equal(world.hit(c.x,c.z)?.kind,'officeTreePool')
  for(const seat of bar.seats)assert.equal(world.hit(seat.x,seat.z)?.kind,'officeBarStool')
  for(const seat of barLounges(layout)){
   const body=world.seatBody(seat);assert.ok(body);assert.equal(world.hit(seat.x,seat.z)?.kind,'officeBarSofa')
   const ignore=new Set([body]);assert.equal(world.hit(seat.x,seat.z,ignore),null)
   const approach={x:seat.appX,z:seat.appZ};assert.ok(world.route(approach,seat,ignore));assert.ok(world.route(seat,approach,ignore))
   const other=barLounges(layout).find(s=>s.id!==seat.id);assert.equal(world.hit(other.x,other.z,ignore)?.kind,'officeBarSofa','target-seat exemption never disables another sofa')
  }
  for(const x of[c.x-4,c.x+4])assert.equal(world.hit(x,c.z),null,'both existing openings remain clear')
  const start={x:c.x+1.6,z:c.z},end={x:c.x-1.6,z:c.z},path=world.route(start,end)
  assert.ok(path,'preparation area remains usable around the protected tree pool')
  let from=start
  for(const to of path){const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.04));for(let i=1;i<=steps;i++)assert.equal(world.hit(from.x+(to.x-from.x)*i/steps,from.z+(to.z-from.z)*i/steps),null,'preparation route cannot cut through pool or counter');from=to}
  assert.equal(bar.summary().calls,6)
 }finally{bar.dispose();bar.dispose()}
 assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
})

test('ALIGN host swaps one collision set, restores legacy on close/failure and cannot resurrect bodies after disposal',async()=>{
 const root=new THREE.Group(),world=createFurnitureCollision(),sentinel=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());sentinel.position.set(100,1,100);world.add(sentinel,'other')
 let fail=false
 const loader={loadAsync:async()=>{if(fail)throw Error('test missing visual asset');return new THREE.Texture()}}
 const host=buildOfficeSampleHost({THREE,root,layout,collision:world,search:'?officeSample=1',textureLoader:loader})
 try{
  assert.equal(await host.ready,true);assert.equal(world.stats().bodies,19)
  for(let i=0;i<3;i++){
   assert.equal(await host.setConfig({enabled:false}),false);assert.equal(world.stats().bodies,65)
   assert.equal(await host.setConfig({enabled:true}),true);assert.equal(world.stats().bodies,19)
  }
  fail=true;assert.equal(await host.setConfig({enabled:true}),false);assert.equal(host.status,'fallback');assert.equal(world.stats().bodies,65)
  host.dispose();host.dispose();assert.equal(world.stats().bodies,1);assert.equal(root.children.length,0)
  assert.equal(await host.setConfig({enabled:true}),false);assert.equal(world.stats().bodies,1)
 }finally{host.dispose();world.remove(sentinel);sentinel.geometry.dispose();sentinel.material.dispose()}
})

test('partially registered physical collision cleans borrowed geometry and root when registration fails',()=>{
 const root=new THREE.Group(),world=createFurnitureCollision();let added=0
 const collision={...world,add(mesh,kind){if(++added===3)throw Error('test collision registration failure');return world.add(mesh,kind)}}
 assert.throws(()=>buildOfficeTeaBarSample({THREE,root,layout,collision}),/test collision registration failure/)
 assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
})

test('disposing the host during pending visual loading leaves no legacy or physical collision registrations',async()=>{
 const root=new THREE.Group(),world=createFurnitureCollision();let release,started
 const gate=new Promise(resolve=>{release=resolve}),loading=new Promise(resolve=>{started=resolve})
 const loader={loadAsync:async()=>{started();await gate;return new THREE.Texture()}}
 const host=buildOfficeSampleHost({THREE,root,layout,collision:world,search:'?officeSample=1',textureLoader:loader})
 try{
  await loading;assert.equal(world.stats().bodies,64);host.dispose();assert.equal(world.stats().bodies,0)
  release();assert.equal(await host.ready,false);assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
 }finally{release();host.dispose()}
})

test('real registry forwards asynchronous sample registration instead of leaving an unprotected island',async()=>{
 const scene=new THREE.Scene(),world=createFurnitureCollision(),registry=createOfficeV2Registry({THREE,scene,quality:{tier:'high'},layout,rootName:'office3-root'})
 registry.register('island',buildOfficeSampleHost);registry.buildAll({collision:world,search:'?officeSample=1',textureLoader})
 const host=registry.get('island')
 try{
  assert.equal(await host.ready,true);assert.equal(world.stats().bodies,18)
  assert.equal(world.hit(layout.bar.center.x,layout.bar.center.z)?.kind,'officeTreePool')
  assert.equal(world.hit(layout.bar.center.x,layout.bar.center.z+2.8)?.kind,'officeBar')
  for(const seat of barLounges(layout))assert.ok(world.seatBody(seat))
  for(let i=0;i<3;i++){await host.setConfig({enabled:false});assert.equal(world.stats().bodies,64);await host.setConfig({enabled:true});assert.equal(world.stats().bodies,18)}
 }finally{registry.dispose();registry.dispose()}
 assert.equal(world.stats().bodies,0);assert.equal(scene.children.length,0)
})

test('registry removes cancelled pending registrations and rejects late additions after disposal',()=>{
 const scene=new THREE.Scene(),world=createFurnitureCollision(),registry=createOfficeV2Registry({THREE,scene,quality:{tier:'high'},layout});let handle
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial())
 registry.register('cancelled',({collision})=>{handle=collision;collision.add(mesh,'cancelled');collision.remove(mesh);return{dispose(){mesh.geometry.dispose();mesh.material.dispose()}}})
 registry.buildAll({collision:world});assert.equal(world.stats().bodies,0);registry.dispose();handle.add(mesh,'late');assert.equal(world.stats().bodies,0)
})
