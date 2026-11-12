import layout from './fixtures/office-align-2309988.json' with { type: 'json' }
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeNavigation } from '../office-layout.js'
import { alignZoneObstaclePlan, alignPassages, alignDoorAprons, buildAlignZones } from '../office-vis2/align-zones.js'
import { createFurnitureCollision } from '../furniture-collision.js'

const overlap=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
const gap=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0))

test('north nook derives two decorative four-chair table groups from unused board/axis space without changing layout',()=>{
  const before=JSON.stringify(layout),nook=alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook').plan
  assert.deepEqual(nook,alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook').plan)
  assert.deepEqual(nook.skipped,[]);assert.equal(nook.groups.length,2)
  assert.equal(nook.placements.filter(p=>p.kind==='round-table').length,2)
  assert.equal(nook.placements.filter(p=>p.kind==='chair').length,8)
  assert.ok(gap(nook.groups[0].groupBounds,nook.groups[1].groupBounds)>=1.2)
  const board=layout.regions.find(r=>r.id==='board')
  for(const p of nook.placements){
    assert.equal(p.workstationIds,undefined)
    assert.ok(p.bounds.x0>=board.x1+.3&&p.bounds.x1<=layout.doors.north.x0-.3)
    assert.ok(p.bounds.z0>=layout.envelope.z0+.3&&p.bounds.z1<=board.z1-.3)
    for(const b of [...alignPassages(layout),...alignDoorAprons(layout),...layout.regions.filter(r=>r.walled)])assert.equal(overlap(p.bounds,b),false)
    const c=layout.ring.center
    assert.ok(Math.hypot(Math.max(p.bounds.x0-c.x,0,c.x-p.bounds.x1),Math.max(p.bounds.z0-c.z,0,c.z-p.bounds.z1))>=layout.ring.outer)
    for(const other of nook.placements)if(p!==other)assert.equal(overlap(p.bounds,other.bounds),false)
  }
  assert.equal(JSON.stringify(layout),before);assert.equal(Object.keys(layout.seats).length,25);assert.equal(layout.displaySeats.length,12)
})

test('north nook actual geometry is covered by its navigation boxes at both tiers and registrations are released',()=>{
  const planned=alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook').plan
  for(const low of [false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),ground=new THREE.Mesh(new THREE.BoxGeometry(60,.08,48))
    ground.position.y=.04
    const zones=buildAlignZones({THREE,root,layout,low,collision:world,get:id=>id==='shell3'?{ground}:undefined})
    try{
      const f=zones.furnishings.find(f=>f.region==='north-nook'),pos=f.root.geometry.attributes.position
      assert.equal(f.summary().calls,1);assert.ok(f.summary().triangles<4000)
      const box=new THREE.Box3().setFromObject(f.root)
      assert.ok(Math.abs(box.min.y-new THREE.Box3().setFromObject(ground).max.y)<1e-6,'legs must rest on the actual floor')
      for(const p of f.placements){
        const source=planned.placements.find(s=>'north-nook-'+s.id===p.id)
        assert.ok(source)
        for(let i=p.vertices.start;i<p.vertices.start+p.vertices.count;i++){
          assert.ok(pos.getX(i)>=source.bounds.x0-1e-5&&pos.getX(i)<=source.bounds.x1+1e-5)
          assert.ok(pos.getZ(i)>=source.bounds.z0-1e-5&&pos.getZ(i)<=source.bounds.z1+1e-5)
        }
        assert.ok(zones.obstacles().some(b=>b.id===p.id))
      }
    }finally{zones.dispose();zones.dispose();ground.geometry.dispose();ground.material.dispose()}
    assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
  }
})

test('public north-to-board circulation avoids the same nook footprints, including swept 0.28m body radius',()=>{
  const nav=createOfficeNavigation(layout),from={x:2,z:-16},to={x:-7.75,z:-10.9}
  const route=nav.corridorPath(from,to),boxes=alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook').plan.placements.map(p=>p.bounds)
  assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to)
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025))
    for(let j=0;j<=steps;j++)for(const box of boxes){const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;assert.ok(Math.hypot(Math.max(box.x0-x,0,x-box.x1),Math.max(box.z0-z,0,z-box.z1))>=.28-1e-6)}
  }
})
