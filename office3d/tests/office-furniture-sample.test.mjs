import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout,workHome} from '../office-layout.js'
import {alignPassages,planWorkstationIslands} from '../office-vis2/align-zones.js'
import {buildOpenFurnishing} from '../office-vis2/open-furnishing.js'
import {buildOfficeDisplayFinish} from '../office-vis2/display-finish.js'
import {buildDisplayDepartments} from '../display-departments.js'
import {displayRoster,displayRoute} from '../display-staff-logic.js'
import {createFurnitureCollision} from '../furniture-collision.js'
import before from './fixtures/office-o1o2-r1-ebd884f.json' with {type:'json'}

const gap=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0))
const overlaps=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
const displayLayout={...layout,version:2,displayAdapter:'v3'}

test('O1O2-R1 keeps all 25 real IDs, homes and display identities, the door, bar and plaza frozen',()=>{
  assert.deepEqual(layout.seats,before.seats)
  assert.deepEqual(Object.fromEntries(Object.entries(layout.seats).map(([id,s])=>[id,workHome(s)])),before.homes)
  assert.equal(Object.keys(layout.seats).length,25)
  assert.deepEqual(layout.displaySeats,before.displaySeats)
  for(const key of['bar','island','plaza'])assert.deepEqual(layout[key],before[key])
  assert.deepEqual(layout.doors.south,before.door)
})

test('O1O2-R1 samples exactly one real desk group with a shared storage bridge and returns',()=>{
  const plans=layout.regions.map(area=>planWorkstationIslands(layout,area)),sample=plans.flatMap(p=>p.placements).filter(p=>p.sample)
  assert.equal(new Set(sample.map(p=>p.workstationIds.join('/'))).size,1)
  assert.equal(sample[0].workstationIds.join('/'),'OpsLead/OpsEngineer')
  assert.equal(sample.filter(p=>p.kind==='cabinet').length,1)
  const bridge=sample.find(p=>p.kind==='cabinet');assert.ok(Math.abs(bridge.w-2.02)<1e-9);assert.equal(bridge.height,.8)
  assert.equal(sample.filter(p=>p.kind==='planter-cabinet').length,2)
  const groups=plans.flatMap(p=>p.groups),g=groups.find(g=>g.workstationIds.join('/')==='OpsLead/OpsEngineer')
  for(const p of sample){assert.equal(overlaps(p.bounds,g.useSpace),false);for(const c of alignPassages(layout))assert.equal(overlaps(p.bounds,c),false)}
  for(const other of groups)if(other!==g)assert.ok(gap(g.groupBounds,other.groupBounds)>=1.2-1e-9)
  assert.ok(g.groupBounds.x0-layout.envelope.x0>=1.2)
  assert.ok(g.groupBounds.z0-layout.corridors.westNorthCross.z1>=1.2)
  assert.ok(g.useSpace.z1-g.useSpace.z0>=.9)
  for(const low of[false,true]){
    const root=new THREE.Group(),plan=planWorkstationIslands(layout,layout.regions.find(r=>r.id==='west-open'))
    const built=buildOpenFurnishing({THREE,root,plan,low})
    try{
      for(const p of built.placements){
        const box=new THREE.Box3(),pos=built.root.geometry.attributes.position
        for(let i=p.vertices.start;i<p.vertices.start+p.vertices.count;i++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,i))
        const collider=built.colliders.find(b=>b.id===p.id)
        assert.ok(Math.abs(collider.x0-box.min.x)<1e-6&&Math.abs(collider.x1-box.max.x)<1e-6)
        assert.ok(Math.abs(collider.z0-box.min.z)<1e-6&&Math.abs(collider.z1-box.max.z)<1e-6)
        if(p.sample)assert.equal(overlaps(collider,g.useSpace),false,'actual geometry clears chair use space')
      }
    }finally{built.dispose()}
  }
})

test('O1O2-R1 market has one shared table and three static visitor chairs, with owned exact collision geometry',()=>{
  const people=displayRoster(displayLayout),snapshot=JSON.stringify(displayLayout)
  for(const low of[false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),other=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial())
    other.position.set(100,.5,100);world.add(other,'other-module')
    const value=buildOfficeDisplayFinish({THREE,root,layout:displayLayout,low,search:'?officeSample=1',collision:world})
    try{
      const sample=value.finish.sample,room=layout.regions.find(r=>r.id===sample.room),mesh=value.root.children[0],pos=mesh.geometry.attributes.position
      assert.equal(sample.room,'market');assert.equal(sample.visitors.length,3)
      assert.equal(sample.parts.filter(p=>p.kind==='shared-table').length,1)
      assert.equal(value.summary().calls,1);assert.equal(value.summary().sharedTables,1)
      assert.equal(value.summary().desks,12);assert.equal(value.summary().visitorChairs,3)
      assert.equal(world.stats().bodies,2)
      for(const part of sample.parts){
        const actual=new THREE.Box3()
        for(let i=part.start;i<part.start+part.count;i++)actual.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,i))
        const b=sample.bounds.find(b=>b.id===part.id)
        assert.ok(Math.abs(b.x0-actual.min.x)<1e-6&&Math.abs(b.x1-actual.max.x)<1e-6)
        assert.ok(b.x0>room.x0+.14&&b.x1<room.x1-.14&&b.z0>room.z0+.14&&b.z1<room.z1-.14)
      }
      assert.ok(Math.min(...sample.bounds.map(b=>b.z0))-(room.z0+.14)>=1.2)
      const front=Math.max(...people.filter(p=>p.department==='market').map(p=>p.home.z+.26))
      assert.ok(room.z1-.14-front>=1.2)
      assert.equal(world.hit(-24,-15.2)?.kind,'officeDisplayRoomSample','the new tabletop has real collision')
      for(const p of people.filter(p=>p.department==='market')){
        const route=displayRoute(displayLayout,p)
        for(const path of[route.go,route.back])for(let i=1;i<path.length;i++){
          const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.02))
          for(let j=0;j<=n;j++)assert.equal(world.hit(a.x+(b.x-a.x)*j/n,a.z+(b.z-a.z)*j/n),null,'existing actor paths clear the actual sample geometry')
        }
      }
      value.dispose();value.dispose();assert.equal(world.stats().bodies,1);assert.equal(world.hit(100,100)?.group?.uuid,other.uuid)
      assert.equal(root.children.length,0)
    }finally{value.dispose();world.remove(other);other.geometry.dispose();other.material.dispose()}
  }
  assert.equal(JSON.stringify(displayLayout),snapshot)
  assert.equal(displayRoster(displayLayout).length,12)
})

test('O1O2-R1 sample collision failure falls back without retaining a body or a second room mesh',()=>{
  const world=createFurnitureCollision(),root=new THREE.Group(),collision={...world,add(body,kind){world.add(body,kind);throw new Error('registration failed')}}
  const value=buildOfficeDisplayFinish({THREE,root,layout:displayLayout,search:'?officeSample=1',collision})
  const original=buildDisplayDepartments({THREE,root:new THREE.Group(),layout:displayLayout})
  try{
    assert.equal(value.finish.fallback,true);assert.equal(world.stats().bodies,0)
    for(const key of Object.keys(original.root.children[0].geometry.attributes))assert.deepEqual(value.root.children[0].geometry.attributes[key].array,original.root.children[0].geometry.attributes[key].array)
    assert.equal(root.children.length,1)
  }finally{value.dispose();original.dispose()}
})
