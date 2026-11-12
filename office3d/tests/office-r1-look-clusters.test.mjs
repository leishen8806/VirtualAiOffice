import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { R1_CLUSTER_PLANTS, R1_PLANT_CLUSTERS, R1_LOW_PLANT_IDS } from '../office-vis2/r1-cluster-plan.js'
import { R1_LANDSCAPE } from '../office-vis2/r1-landscape-plan.js'
import { buildR1DenseGarden } from '../office-vis2/r1-dense-garden.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_PUBLIC_TRANSITIONS } from '../office-r1-navigation.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { plantFootprintSamples, insidePlantEnvelope } from './helpers/r1-plant-footprints.mjs'

const layout = createOfficeR1Layout(), rows = R1_CLUSTER_PLANTS
const distance = (x,z,b) => Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.z0-z,0,z-b.z1))
const groups = new Map(R1_PLANT_CLUSTERS.map(g => [g.id,g]))

test('LOOK R3 freezes every floor plant in a mixed-height group without losing registered plants or IDs', () => {
  assert.equal(rows.length,174); assert.equal(new Set(rows.map(r=>r.id)).size,174)
  assert.equal(rows.filter(r=>r.registered).length,35); assert.equal(rows.filter(r=>r.look).length,24)
  assert.equal(rows.filter(r=>!r.registered&&!r.look).length,115)
  assert.equal(R1_PLANT_CLUSTERS.flatMap(g=>g.plants).length,174)
  for(const group of R1_PLANT_CLUSTERS){
    const plants=group.plants.map(id=>rows.find(p=>p.id===id))
    assert.ok(plants.length>=3&&plants.length<=5,group.id)
    assert.ok(plants.some(p=>p.height>=1.8&&p.height<=2.4),group.id+' high')
    assert.ok(plants.some(p=>p.height<=.95),group.id+' low')
    assert.ok(plants.some(p=>p.height>.95&&p.height<1.8),group.id+' middle')
    assert.ok(new Set(plants.map(p=>p.species)).size>=2,group.id+' species')
    for(const p of plants){
      assert.equal(p.cluster,group.id)
      const gaps=plants.filter(q=>q!==p).map(q=>Math.hypot(p.x-q.x,p.z-q.z)-p.potR-q.potR)
      assert.ok(Math.min(...gaps)>=.15-1e-3,p.id+' pots overlap')
      assert.ok(Math.min(...gaps)<=.35+1e-3,p.id+' detached from group')
    }
  }
  assert.equal(rows.filter(p=>!groups.has(p.cluster)).length,0)
  assert.ok(R1_LOW_PLANT_IDS.length>=Math.ceil(rows.length*.6))
})

test('LOOK R3 all fifteen doors have two clear 2.5 m approach zones, including BACKWALL', () => {
  assert.equal(layout.r1.data.doors.length,15)
  const plants=[...rows,...R1_LANDSCAPE.troughs,...R1_LANDSCAPE.gardens]
  for(const d of layout.r1.data.doors){
    const x=d.xM-26,z=18-d.yM,h=d.lengthM/2+.6
    const box=d.facingLocal[0]?{x0:x-2.5,x1:x+2.5,z0:z-h,z1:z+h}:{x0:x-h,x1:x+h,z0:z-2.5,z1:z+2.5}
    for(const p of plants)for(const q of plantFootprintSamples(p))assert.ok(distance(q.x,q.z,box)>=q.r-1e-5,`${p.id} approach ${d.id}`)
  }
})

test('LOOK R3 continuous beds retain 64.8 m troughs, four >=8 m arcs, >=148 square metres, and 33 plaza plants', () => {
  assert.ok(R1_LANDSCAPE.troughs.reduce((n,r)=>n+r.length,0)>=64.8-1e-9)
  for(const row of R1_LANDSCAPE.troughs)assert.equal(row.height,.45)
  const arcs=R1_LANDSCAPE.gardens.filter(r=>r.shape==='arc');assert.equal(arcs.length,4)
  for(const r of arcs){assert.ok(r.length>=8);assert.ok(r.width>=1.2&&r.width<=1.8)}
  assert.ok(R1_LANDSCAPE.gardens.reduce((n,r)=>n+r.length*r.width,0)>=148)
  assert.equal(R1_LANDSCAPE.gardens.reduce((n,r)=>n+r.count,0),33)
})

test('LOOK R3 rendered crowns, continuous meshes and real collision proxies agree; public transitions remain clear', () => {
  const collision=createFurnitureCollision(),root=new THREE.Group(),quality={tier:'high'}
  const modules=[false,true].map(lookOnly=>buildR1DenseGarden({THREE,root,layout,collision,quality,lookOnly}))
  try {
    const records=modules.flatMap(m=>m.records),large=records.filter(r=>r.r&&r.bounds.max.y>=2-1e-5&&r.bounds.max.y<=2.5+1e-5&&r.bounds.max.x-r.bounds.min.x>=.9&&r.bounds.max.z-r.bounds.min.z>=.9)
    assert.ok(large.length>=24,`actual large crowns ${large.length}`)
    for(const m of modules)for(const r of m.records){
      const p=m.proxies.find(p=>p.name===r.id); assert.equal(p.isInstancedMesh,undefined);assert.ok(p.isMesh)
      const mesh=m.root.getObjectByName('r1-dense-pots'),positions=mesh.geometry.attributes.position
      for(let i=r.startVertex;i<r.startVertex+r.vertexCount;i++)assert.ok(insidePlantEnvelope(r,positions.getX(i),positions.getZ(i)),r.id+' rendered envelope')
      for(const q of plantFootprintSamples(r,.1))assert.ok(collision.navigationHit(q.x,q.z,.6),r.id+' actual collision')
    }
    for(const [id,path]of Object.entries(R1_PUBLIC_TRANSITIONS)){
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.005)
        for(let j=0;j<=n;j++)assert.equal(collision.navigationHit(a.x+(b.x-a.x)*j/n,a.z+(b.z-a.z)*j/n,.25),null,id+' local path')
      }
      assert.equal(collision.navigationHit(path.at(-1).x,path.at(-1).z,.6),null,id+' walk connection')
    }
  } finally {modules.forEach(m=>m.dispose())}
  assert.equal(collision.stats().bodies,0)
})
