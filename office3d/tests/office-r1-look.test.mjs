import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout, buildR1Site } from '../office-vis2/r1-site.js'
import { R1_CLUSTER_PLANTS, R1_LOW_PLANT_IDS } from '../office-vis2/r1-cluster-plan.js'
import { r1MarbleTexture, r1LookPlantPositions } from '../office-vis2/r1-look.js'
import { buildR1Plants } from '../office-vis2/r1-plants.js'
import { buildR1Lights, r1LightingPlan } from '../office-vis2/r1-lights.js'
import { r1DoorPlan } from '../office-vis2/r1-doors.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const hooks = registerHooks({ resolve(s, c, next) { return s === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(s, c) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js'); hooks.deregister()
const bytes = readFileSync(new URL('../assets/models/furniture/pottedPlant.glb', import.meta.url))
const A = { furn: { pottedPlant: (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene } }
const layout = createOfficeR1Layout(), near = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} != ${b}`)
const segment = (x,z,a,b) => { const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))); return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz) }
const triangles = root => { let count=0; root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)}); return count }

test('LOOK marble has deterministic veins and 1.2 m joints, world UVs and unchanged floor elevation', () => {
  const a=r1MarbleTexture(THREE),b=r1MarbleTexture(THREE)
  assert.deepEqual(a.image.data,b.image.data); assert.equal(a.colorSpace,THREE.SRGBColorSpace)
  const data=a.image.data,pixel=(x,y)=>data[(y*512+x)*4]
  assert.ok(pixel(0,125)<pixel(120,125));assert.equal(pixel(0,125),pixel(256,125))
  const root=new THREE.Group(),site=buildR1Site({THREE,root,layout}),p=site.floor.geometry.attributes.position,uv=site.floor.geometry.attributes.uv
  near(site.floor.material.roughness,.3);near(new THREE.Box3().setFromObject(site.floor).max.y,0)
  for(let i=0;i<p.count;i++){near(uv.getX(i),(p.getX(i)+site.floor.position.x)/2.4);near(uv.getY(i),(p.getZ(i)+site.floor.position.z)/2.4)}
  near(site.inlay.mesh.userData.center.x,2);near(site.inlay.mesh.userData.center.z,-4.1)
  for(const r of [5.9,8.7])assert.ok(site.inlay.mesh.userData.rings.some(row=>Math.abs((row[0]+row[1])/2-r)<1e-9&&row[2]==='#B99467'))
  near(new THREE.Box3().setFromObject(site.inlay.mesh).max.y,.004)
  let disposed=0;site.floor.material.map.addEventListener('dispose',()=>disposed++);site.dispose();assert.equal(disposed,1);assert.equal(root.children.length,0);a.dispose();b.dispose()
})

test('LOOK wall strips touch the solid band; bar accents retain the entry; floor wash uses the existing batch without hanging lights', () => {
  const root=new THREE.Group(),env={indoorLevel:1,night:1},module=buildR1Lights({THREE,root,layout,env}),plan=module.plan
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o)})
  assert.equal(meshes.length,3);assert.equal(plan.accents.filter(r=>r.kind==='floor-wash').length,17)
  assert.ok(plan.accents.some(r=>r.id.startsWith('bar-counter')));assert.ok(plan.accents.some(r=>r.id.startsWith('bar-foot')))
  for(const row of [...plan.fixtures,...plan.accents]){
    const bottom=row.position[1]-row.size[1]/2
    assert.ok(bottom<1.6||bottom>2.38,row.id+' suspended')
    if(row.kind==='bar-strip')assert.ok(row.position[2]>=-4.1||Math.abs(row.position[0]-2)>.75,row.id+' bar entrance')
  }
  for(const row of plan.fixtures.filter(r=>r.kind==='glass-strip'&&r.position[1]<3))near(row.position[1],2.4)
  for(const level of [0,.2,1,0]){env.indoorLevel=env.night=level;module.onFrame();assert.ok(module.root.children.every(g=>g.visible===(level>0)))}
  module.dispose();assert.equal(root.children.length,0)
})

test('LOOK adds 12 atrium and 12 corner plants from six approved tropical species, with ordinary collision meshes and retained registered plant IDs', () => {
  assert.equal(r1LookPlantPositions.length,24);assert.equal(r1LookPlantPositions.filter(r=>r[1]==='07').length,12)
  for(const zone of ['04','06','08','10','11','12'])assert.equal(r1LookPlantPositions.filter(r=>r[1]===zone).length,2)
  for(const low of [false,true]){
    const root=new THREE.Group(),collision=createFurnitureCollision(),plants=buildR1Plants({THREE,root,layout,A,low,collision})
    assert.equal(plants.records.length,35);assert.equal(plants.look.records.length,R1_CLUSTER_PLANTS.filter(p=>p.look&&(!low||R1_LOW_PLANT_IDS.includes(p.id))).length);assert.equal(collision.stats().bodies,35 + plants.look.records.length + plants.dense.proxies.length)
    for(const record of plants.look.records){
      assert.ok(collision.hit(record.position.x,record.position.z))
      const tier=plants.look.root.getObjectByName(low?'r1-dense-low':'r1-dense-high')
      for(const [name,start,count] of [['r1-dense-pots',record.startVertex,record.vertexCount],['r1-tropical-leaves',record.leafStart,record.leafCount]]) {
        const v=tier.getObjectByName(name).geometry.attributes.position
        for(let i=start;i<start+count;i++)assert.ok(Math.hypot(v.getX(i)-record.position.x,v.getZ(i)-record.position.z)<=record.r+1e-5,record.id)
      }
    }
    assert.ok(plants.look.proxies.every(p=>p.isMesh&&!p.isInstancedMesh));assert.equal(plants.look.root.children.length,1)
    assert.equal(new Set([...plants.look.records,...plants.dense.records.filter(r=>r.r)].map(r=>r.species)).size,6)
    plants.dispose();plants.dispose();assert.equal(collision.stats().bodies,0);assert.equal(root.children.length,0)
  }
})

test('LOOK full plant envelopes clear all 17 swept routes, all door travel envelopes and the approved fountain by 0.3 m', () => {
  const doors=r1DoorPlan(layout)
  for(const [id,,x,z] of r1LookPlantPositions){
    const r=R1_CLUSTER_PLANTS.find(p=>p.id===id).r
    for(const route of layout.r1.routes){
      const points=route.points_m.map(([x,y])=>[x-26,18-y]),radius=layout.r1.data.bodyProfiles[route.body_profile].radius_m
      for(let i=1;i<points.length;i++)assert.ok(segment(x,z,points[i-1],points[i])-radius-r>=.3,`${id} ${route.id}`)
    }
    for(const d of doors){
      const hx=(d.vertical?d.thickness:d.width)/2,hz=(d.vertical?d.width:d.thickness)/2
      const dx=Math.max(Math.min(d.closed.x,d.open.x)-hx-x,0,x-Math.max(d.closed.x,d.open.x)-hx),dz=Math.max(Math.min(d.closed.z,d.open.z)-hz-z,0,z-Math.max(d.closed.z,d.open.z)-hz)
      assert.ok(Math.hypot(dx,dz)-r>=.3,`${id} ${d.id}`)
    }
    assert.ok(Math.hypot(x-2,z-28)-4.15-r>=.3,id)
  }
})

test('LOOK original 24-plant geometry stays inside its 60k triangle budget and does not create real lights', () => {
  for(const low of [false,true]){
    const root=new THREE.Group(),site=buildR1Site({THREE,root,layout}),plants=buildR1Plants({THREE,root,layout,A,low})
    const addition=triangles(plants.look.root)+triangles(site.inlay.mesh)+r1LightingPlan(layout).accents.length*12
    assert.ok(addition<=60000,`${low?'low':'high'} ${addition}`)
    let lights=0;root.traverse(o=>{if(o.isLight)lights++});assert.equal(lights,0)
    plants.dispose();site.dispose()
  }
})

test('LOOK keeps source register, exposure defaults, brightness control and legacy fill intact', () => {
  const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')
  // Hash LF-normalized text so the Windows CRLF checkout and Linux CI agree (same as office-r1-plaza-fan.test.mjs).
  assert.equal(createHash('sha256').update(source('office-r1/data.js').replace(/\r\n/g,'\n'),'utf8').digest('hex'),'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf')
  assert.ok(source('app.js').includes("const BRIGHT = [['柔和', 0.85], ['标准', 1.0], ['明亮', 1.2]]"))
  assert.ok(source('app.js').includes('renderer.toneMappingExposure = 0.85'))
  assert.ok(source('app.js').includes('renderer.toneMappingExposure = BRIGHT[brightIdx][1]'))
  assert.match(source('app.js'),/0xffe6c8 : 0xa9bfff, OFFICE_LAYOUT.r1Phase === 'R1' \? .22 : .35/)
  assert.match(source('env.js'),/if \(r1Mode\) \{\s+sun.color.setHex\(0xffb072\).lerp/)
  const root=new THREE.Group();buildR1Plants({THREE,root,layout:{r1Phase:'L2B'},A});buildR1Lights({THREE,root,layout:{r1Phase:'L2B'}});assert.equal(root.children.length,0)
})
