import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1DenseGarden, r1DensePlan } from '../office-vis2/r1-dense-garden.js'
import { r1DoorPlan } from '../office-vis2/r1-doors.js'
import { r1LookPlantPositions } from '../office-vis2/r1-look.js'
import { createFurnitureCollision } from '../furniture-collision.js'
const hooks=registerHooks({resolve(s,c,next){return s==='three'?{url:new URL('../vendor/three/three.module.js',import.meta.url).href,shortCircuit:true}:next(s,c)}})
const {GLTFLoader}=await import('../vendor/three/jsm/loaders/GLTFLoader.js');hooks.deregister()
const bytes=readFileSync(new URL('../assets/models/furniture/pottedPlant.glb',import.meta.url)),A={furn:{pottedPlant:(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene}}
const sofaEnds=[[145,174],[184,215],[-35,-4],[6,35],[115,135],[45,65]].flatMap(a=>a.map(d=>({x:2+Math.cos(d*Math.PI/180)*6.6,z:-4.1-Math.sin(d*Math.PI/180)*6.6})))
const layout=createOfficeR1Layout(),limits={'01':2,'02':4,'03':4,'04':12,'05':2,'06':12,'07':30,'08':12,'09':2,'10':6,'11':6,'12':6,'13':2}
const segment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)}
const distance=(x,z,b)=>Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.z0-z,0,z-b.z1))
const chairBoxes=layout.r1.elements.filter(e=>e.category==='办公椅').map(c=>{const desk=layout.r1.elements.filter(e=>e.category==='办公桌').sort((a,b)=>Math.hypot(a.xM-c.xM,a.yM-c.yM)-Math.hypot(b.xM-c.xM,b.yM-c.yM))[0],side=Math.abs(desk.xM-c.xM)>.5,hx=side?.3:.31,hz=side?.31:.3;return{id:c.id,x0:c.xM-26-hx,x1:c.xM-26+hx,z0:18-c.yM-hz,z1:18-c.yM+hz}})
const reserved=layout.r1.elements.filter(e=>['08-T-011','08-T-012','08-T-013'].includes(e.id)).map(e=>({id:e.id,x0:e.xM-26-e.lengthM/2,x1:e.xM-26+e.lengthM/2,z0:18-e.yM-e.widthM/2,z1:18-e.yM+e.widthM/2}))
const doors=r1DoorPlan(layout).map(d=>{const hx=(d.vertical?d.thickness:d.width)/2,hz=(d.vertical?d.width:d.thickness)/2;return{id:d.id,x0:Math.min(d.closed.x,d.open.x)-hx,x1:Math.max(d.closed.x,d.open.x)+hx,z0:Math.min(d.closed.z,d.open.z)-hz,z1:Math.max(d.closed.z,d.open.z)+hz}})
const samples=row=>row.wall?Array.from({length:25},(_,i)=>({x:row.x+(row.w>.3?(i/24-.5)*row.w:0),z:row.z+(row.d>.3?(i/24-.5)*row.d:0),r:.15})):[{x:row.x,z:row.z,r:row.r??row.w/2}]

test('LOOK R2 high and low density, all zone quotas, passage and sofa groups, four plant forms',()=>{
 for(const low of [false,true]){const p=r1DensePlan(layout,low),counts={}; for(const z of layout.regions.filter(r=>r.id!=='14')){const inside=(x,zp)=>x>=z.x0&&x<=z.x1&&zp>=z.z0&&zp<=z.z1;const actual=layout.r1.elements.filter(e=>e.category==='植物总成'&&e.regionId===z.id&&inside(e.xM-26,18-e.yM)).length+r1LookPlantPositions.filter(p=>p[1]===z.id&&inside(p[2],p[3])).length+p.plants.filter(p=>p.zone===z.id&&inside(p.x,p.z)).length;assert.ok(actual>=Math.ceil(limits[z.id]*(low?.6:1)),z.id+' actual in-zone count '+actual)}for(const zone of Object.keys(limits)){counts[zone]=layout.r1.elements.filter(r=>r.category==='植物总成'&&r.regionId===zone).length+r1LookPlantPositions.filter(r=>r[1]===zone).length+p.plants.filter(r=>r.zone===zone).length;assert.ok(counts[zone]>=Math.ceil(limits[zone]*(low?.6:1)),zone)}assert.ok(Object.values(counts).reduce((a,b)=>a+b,0)>=150*(low?.6:1));assert.ok(p.plants.filter(r=>r.role==='passage').length>=Math.ceil(8*(low?.6:1)));assert.ok(p.plants.filter(r=>r.role==='sofa-group').length>=Math.ceil(16*(low?.6:1)));for(const row of p.plants.filter(r=>r.role==='sofa-group'))assert.ok(Math.min(...sofaEnds.map(e=>Math.hypot(row.x-e.x,row.z-e.z)))<=1.501,row.id+' sofa end group');assert.equal(new Set(p.plants.map(r=>r.kind)).size,3);assert.ok(p.troughs.reduce((n,r)=>n+r.length,0)>=60*(low?.6:1));for(const row of p.troughs){assert.equal(Math.min(row.w,row.d),.3);assert.equal(row.height,.35)}}
})

test('LOOK R2 supplemental envelopes leave route corridors, full door sweeps, all workstation chairs and fountain clear',()=>{
 const p=r1DensePlan(layout)
 for(const row of [...p.plants,...p.troughs,...p.gardens])for(const q of samples(row)){
  for(const route of layout.r1.routes){const pts=route.points_m.map(([x,y])=>[x-26,18-y]),radius=layout.r1.data.bodyProfiles[route.body_profile].radius_m;for(let i=1;i<pts.length;i++)assert.ok(segment(q.x,q.z,pts[i-1],pts[i])-q.r-radius>=.3-1e-6,`${row.id} route ${route.id}`)}
  for(const d of doors)assert.ok(distance(q.x,q.z,d)-q.r>=.3-1e-6,`${row.id} door ${d.id}`)
  for(const c of chairBoxes)assert.ok(distance(q.x,q.z,c)-q.r>=.9-1e-6,`${row.id} chair ${c.id}`)
  for(const b of reserved)assert.ok(distance(q.x,q.z,b)-q.r>=.6-1e-6,`${row.id} reserved desk/sign ${b.id}`)
  assert.ok(Math.hypot(q.x-2,q.z-28)-q.r-4.15>=(row.id.startsWith('GARDEN')?.6:.3)-1e-6,row.id+' fountain')
 }
})

test('LOOK R2 real leaf geometry stays inside certified envelopes; actual collision queries and tier switches do not leak bodies',()=>{
 const root=new THREE.Group(),collision=createFurnitureCollision(),quality={tier:'high'},module=buildR1DenseGarden({THREE,root,layout,A,collision,quality})
 for(const tier of ['high','low','high']){quality.tier=tier;module.onFrame();const low=tier==='low',p=r1DensePlan(layout,low);assert.equal(collision.stats().bodies,p.plants.length+p.troughs.length+p.gardens.length);assert.equal(module.records.length,collision.stats().bodies)
 for(const r of module.records){assert.ok(collision.hit(r.x,r.z),r.id+' actual collider');assert.ok(module.proxies.find(p=>p.name===r.id).isMesh);assert.ok(!module.proxies.find(p=>p.name===r.id).isInstancedMesh);const mesh=module.root.getObjectByName(`r1-dense-${tier}`).getObjectByName('r1-dense-'+r.batch),vertices=mesh.geometry.attributes.position;for(let i=r.startVertex;i<r.startVertex+r.vertexCount;i++){const x=vertices.getX(i)-r.x,z=vertices.getZ(i)-r.z;if(r.wall){assert.ok(Math.abs(x)<=r.w/2+1e-5&&Math.abs(z)<=r.d/2+1e-5,r.id+' vertex envelope')}else assert.ok(Math.hypot(x,z)<=(r.r??r.w/2)+1e-5,r.id+' vertex disk')}
 if(r.r){const leaf=module.root.getObjectByName('r1-dense-'+tier).getObjectByName('r1-tropical-leaves').geometry.attributes.position;for(let i=r.leafStart;i<r.leafStart+r.leafCount;i++)assert.ok(Math.hypot(leaf.getX(i)-r.x,leaf.getZ(i)-r.z)<=r.r+1e-5,r.id+' actual atlas leaf envelope');assert.ok(r.bounds.max.y<=r.height+1e-5);assert.ok(r.bounds.min.y>=-1e-5)}}
 let triangles=0,calls=0;module.root.traverseVisible(m=>{if(m.isMesh){calls++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.equal(m.castShadow,false);assert.notEqual(m.geometry.type,'SphereGeometry')}});assert.equal(calls,3);assert.ok(triangles<190000,`${tier}: ${triangles}`)
 const beds=module.records.filter(r=>r.kind==='flowerbed');assert.ok(beds.reduce((n,r)=>n+r.area,0)>=120*(low?.6:1));assert.equal(new Set(beds.map(r=>r.flowerColor)).size,4)
 }
 module.dispose();module.dispose();assert.equal(collision.stats().bodies,0);assert.equal(root.children.length,0)
 const legacy=new THREE.Group();buildR1DenseGarden({THREE,root:legacy,layout:{r1Phase:'L2B'},A,collision});assert.equal(legacy.children.length,0)
})

test('LOOK R2 tropical diversity, deterministic variation, approved atlas, and legacy asset exclusion',()=>{
 const sets=[]
 for(const low of [false,true]){
  const root=new THREE.Group(),dense=buildR1DenseGarden({THREE,root,layout,low}),look=buildR1DenseGarden({THREE,root,layout,low,lookOnly:true})
  const rows=[...dense.records.filter(r=>r.r),...look.records],counts={}
  for(const r of rows){counts[r.species]=(counts[r.species]||0)+1;assert.ok(r.scale>=.85&&r.scale<=1.15);assert.ok(r.yaw>=0&&r.yaw<Math.PI*2)}
  assert.equal(Object.keys(counts).length,6);for(const n of Object.values(counts))assert.ok(n/rows.length<=.3)
  assert.equal(new Set(dense.records.filter(r=>r.kind==='flowerbed').map(r=>r.species)).size,4)
  assert.ok(rows.filter(r=>r.species==='散尾葵'||r.species==='虎尾兰').every(r=>r.leafCount===0))
  assert.ok(rows.filter(r=>['龟背竹','琴叶榕','发财树','花叶绿萝'].includes(r.species)).every(r=>r.leafCount>0))
  root.traverse(o=>{if(o.name==='r1-tropical-leaves'){assert.equal(o.material.alphaTest,.45);assert.equal(o.material.transparent,false)}})
  sets.push(new Map(rows.map(r=>[r.id,{species:r.species,yaw:r.yaw,scale:r.scale,height:r.height}])))
  dense.dispose();look.dispose()
 }
 for(const[id,s]of sets[1])assert.deepEqual(s,sets[0].get(id))
 const source=readFileSync(new URL('../office-vis2/r1-dense-garden.js',import.meta.url),'utf8')
 assert.doesNotMatch(source,/pottedPlant|createOfficePottedFoliage|SphereGeometry/)
})
