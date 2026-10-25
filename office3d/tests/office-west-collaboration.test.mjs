import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout,LAYOUT_V3,createOfficeNavigation,workHome} from '../office-layout.js'
import {alignZoneObstaclePlan,alignDoorAprons,alignPassages,buildAlignZones} from '../office-vis2/align-zones.js'
import {officeFurnitureV2Spec} from '../office-furniture-v2.js'
import {createFurnitureCollision} from '../furniture-collision.js'
import before from './fixtures/office-align-2309988.json' with {type:'json'}

const overlaps=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
const gap=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0))
const plan=()=>alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook').plan

test('two west conversation groups reuse released space without new business desks or blocked circulation',()=>{
  const p=plan();assert.deepEqual(p,plan());assert.deepEqual(p.skipped,[]);assert.equal(p.groups.length,2)
  assert.equal(p.placements.filter(p=>p.kind==='chair').length,8);assert.equal(p.placements.filter(p=>p.kind==='round-table').length,2)
  assert.ok(gap(p.groups[0].groupBounds,p.groups[1].groupBounds)>=1.2-1e-9)
  for(const g of p.groups){
    assert.ok(g.groupBounds.x0>=-28&&g.groupBounds.x1<=-8.5&&g.groupBounds.z0>=-12&&g.groupBounds.z1<=-4.5)
    for(const b of [...layout.rooms,...alignPassages(layout),...alignDoorAprons(layout)])assert.equal(overlaps(g.groupBounds,b),false)
    for(const[,x,z]of Object.values(layout.seats))assert.ok(gap(g.groupBounds,{x0:x-.8,x1:x+.8,z0:z-.8,z1:z+.8})>=1.2)
  }
  assert.ok(p.placements.every(p=>p.workstationIds===undefined&&['chair','round-table'].includes(p.kind)))
  assert.deepEqual(layout.seats,before.seats);assert.deepEqual(layout.displaySeats,before.displaySeats)
})

test('horizontal eight-seat decision table clears the mapped boss desk and keeps warm-room furniture data-owned',()=>{
  const f=officeFurnitureV2Spec(layout),old=officeFurnitureV2Spec(LAYOUT_V3)
  assert.equal(f.board.w,3.6);assert.equal(f.board.d,1.4);assert.equal(f.board.x,layout.boardTable.x);assert.equal(f.board.z,layout.boardTable.z)
  assert.equal(f.boardSeats.length,8);assert.equal(new Set(f.boardSeats.map(s=>s.z)).size,2)
  for(const s of f.boardSeats){assert.ok(Math.abs(s.x*10-Math.round(s.x*10))<1e-8);assert.ok(Math.abs(s.z*10-Math.round(s.z*10))<1e-8);assert.equal(s.yaw,s.z<f.board.z?Math.PI:0)}
  const boss={x0:f.boss.desk.x-.7,x1:f.boss.desk.x+.7,z0:f.boss.desk.z-.35,z1:f.boss.desk.z+.35}
  const group={x0:Math.min(f.board.x-f.board.w/2,...f.boardSeats.map(s=>s.x-.31)),x1:Math.max(f.board.x+f.board.w/2,...f.boardSeats.map(s=>s.x+.31)),z0:Math.min(f.board.z-f.board.d/2,...f.boardSeats.map(s=>s.z-.3)),z1:Math.max(f.board.z+f.board.d/2,...f.boardSeats.map(s=>s.z+.3))}
  assert.ok(gap(group,boss)>=1.2);assert.deepEqual(layout.boss,{region:'board',desk:{x:-18,z:-15},stand:{x:-18,z:-13}});assert.deepEqual(LAYOUT_V3.boss,before.boss)
  assert.equal(old.board.w,1.4);assert.equal(old.board.d,3.6);assert.deepEqual(old.board,{...LAYOUT_V3.boardTable,w:1.4,d:3.6,screen:old.board.screen})
})

test('actual west furniture vertices remain in planned bounds and release only their own colliders',()=>{
  for(const low of[false,true])for(let cycle=0;cycle<3;cycle++){
    const root=new THREE.Group(),world=createFurnitureCollision(),sentinel=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial())
    sentinel.position.set(100,1,100);world.add(sentinel,'other-module')
    const zones=buildAlignZones({THREE,root,layout,low,collision:world})
    try{
      const f=zones.furnishings.find(f=>f.region==='north-nook');assert.ok(f);assert.equal(f.summary().calls,1);assert.ok(f.summary().triangles<4000)
      const p=f.root.geometry.attributes.position,planned=plan()
      for(const m of f.placements){const b=planned.placements.find(v=>'north-nook-'+v.id===m.id).bounds;for(let i=m.vertices.start;i<m.vertices.start+m.vertices.count;i++){assert.ok(p.getX(i)>=b.x0-1e-5&&p.getX(i)<=b.x1+1e-5);assert.ok(p.getZ(i)>=b.z0-1e-5&&p.getZ(i)<=b.z1+1e-5)}}
    }finally{zones.dispose();zones.dispose()}
    assert.equal(root.children.length,0);assert.equal(world.stats().bodies,1);world.remove(sentinel);sentinel.geometry.dispose();sentinel.material.dispose()
  }
})

test('all 625 real workstation routes keep 0.28m swept clearance from both west conversation groups',()=>{
  const nav=createOfficeNavigation(layout),homes=Object.values(layout.seats).map(workHome),boxes=plan().placements.map(p=>p.bounds)
  for(const from of homes)for(const to of homes){const path=nav.officeTrip(from,to,to);for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05))
    for(let j=0;j<=n;j++){const p={x0:a.x+(b.x-a.x)*j/n,x1:a.x+(b.x-a.x)*j/n,z0:a.z+(b.z-a.z)*j/n,z1:a.z+(b.z-a.z)*j/n};for(const box of boxes)assert.ok(gap(p,box)>=.28-1e-6)}
  }}
})
