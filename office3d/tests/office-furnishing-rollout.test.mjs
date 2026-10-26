import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN_SAMPLE,roomSegments}from'../office-layout.js'
import{buildOfficeDisplayFinish}from'../office-vis2/display-finish.js'
import{displayRoster,displayRoute,displayFurnitureBounds}from'../display-staff-logic.js'
import{createFurnitureCollision}from'../furniture-collision.js'
import{marketFurnitureFixture}from'./helpers/market-furniture.mjs'
const layout={...LAYOUT_V3_ALIGN_SAMPLE,version:2,displayAdapter:'v3'}
function hit(a,b,box,pad=.22-1e-6){let lo=0,hi=1;for(const axis of['x','z']){const v=b[axis]-a[axis],min=box[axis+'0']-pad,max=box[axis+'1']+pad;if(Math.abs(v)<1e-12){if(a[axis]<=min||a[axis]>=max)return false;continue}const u=(min-a[axis])/v,w=(max-a[axis])/v;lo=Math.max(lo,Math.min(u,w));hi=Math.min(hi,Math.max(u,w));if(lo>=hi)return false}return hi>0&&lo<1}
test('four approved facing display islands fit walls, preserve doors and keep wall art off door openings',()=>{
 for(const low of[false,true]){const fixture=marketFurnitureFixture(),v=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout,low,search:'?officeSample=1',...fixture});try{
  assert.equal(v.finish.fallback,undefined)
  for(const plan of v.finish.samples){const r=layout.regions.find(r=>r.id===plan.room),b=plan.groupBounds
   for(const d of[b.x0-r.x0-.14,r.x1-.14-b.x1,b.z0-r.z0-.14,r.z1-.14-b.z1])assert.ok(d>=1.2-1e-6,plan.room)
   assert.equal(plan.stations.length,4);assert.equal(plan.stations.filter(s=>s.personId).length,3);assert.equal(r.doors[0].width,1.5)
   for(const art of plan.bounds.filter(b=>b.id.includes('wall-art')))if(r.doors[0].side==='north'){const door=r.doors[0];assert.ok(art.x1<=door.at-door.width/2||art.x0>=door.at+door.width/2)}
   for(const p of plan.parts)assert.ok(plan.bounds.some(b=>b.id===p.id))
  }
 }finally{v.dispose();fixture.dispose()}}
})
test('all twelve go/return polylines avoid actual desks, chairs, cabinets, plants and wall segments',()=>{
 const fixture=marketFurnitureFixture(),v=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout,search:'?officeSample=1',...fixture});try{
  const people=displayRoster(v.displayLayout),boxes=displayFurnitureBounds(v.displayLayout);assert.equal(people.length,12)
  for(const p of people){const r=layout.regions.find(r=>r.id===p.department),rt=displayRoute(v.displayLayout,p),walls=roomSegments(r).map(w=>{const vertical=['east','west'].includes(w.side),c=w.side==='west'?r.x0:w.side==='east'?r.x1:w.side==='north'?r.z0:r.z1;return{id:w.side+'-wall',...(vertical?{x0:c-.07,x1:c+.07,z0:w.lo,z1:w.hi}:{x0:w.lo,x1:w.hi,z0:c-.07,z1:c+.07})}})
   for(const line of[rt.go,rt.back])for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];for(const box of[...boxes,...walls]){if(box.id===p.id+'-chair'&&(i===1||i===line.length-1)&&[a,b].some(q=>q.x===p.home.x&&q.z===p.home.z)){assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=.700001);continue}assert.equal(hit(a,b,box),false,`${p.id}/${i}/${box.id}`)}}
  }
 }finally{v.dispose();fixture.dispose()}
})
test('market east actor crosses at the southern aisle centre and turns squarely onto the original door axis',()=>{
 const dl={...layout,displayWorkIslands:true},p=displayRoster(dl).find(p=>p.id==='sim-market-3'),rt=displayRoute(dl,p),room=layout.regions.find(r=>r.id==='market'),centre=(-13.5+room.z1-.14)/2
 const crossing=rt.go.slice(1).map((b,i)=>[rt.go[i],b]).filter(([a,b])=>a.x>-23&&b.x<-25)
 assert.equal(crossing.length,1);assert.equal(crossing[0][0].z,centre);assert.equal(crossing[0][1].z,centre);assert.ok(room.z1-.14-centre>.6)
 assert.deepEqual(rt.back,rt.go.toReversed())
 const bad=[{x:-21.4,z:-15},{x:-25.5,z:-12.6}],desk=displayFurnitureBounds(dl).find(b=>b.id==='market-desk-4');assert.equal(hit(...bad,desk),true,'a shortcut through the desk must be rejected by the independent segment check')
})

test('a failure registering the second room removes only already-created owned proxies and keeps foreign collisions',()=>{
 const fixture=marketFurnitureFixture(),world=createFurnitureCollision(),foreign=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());foreign.position.set(100,.5,100);world.add(foreign,'foreign');let adds=0
 const v=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout,search:'?officeSample=1',...fixture,collision:{...world,add(m,k){if(++adds===2)throw Error('second-room-failure');return world.add(m,k)}}})
 try{assert.equal(v.finish.fallback,true);assert.equal(v.finish.reason,'second-room-failure');assert.equal(v.displayLayout,undefined);assert.equal(world.stats().bodies,1);assert.equal(world.hit(100,100)?.group.uuid,foreign.uuid);v.dispose();v.dispose();assert.equal(world.stats().bodies,1)}finally{v.dispose();fixture.dispose();world.remove(foreign);foreign.geometry.dispose();foreign.material.dispose()}
})
