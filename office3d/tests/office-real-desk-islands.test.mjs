import test from 'node:test'
import assert from 'node:assert/strict'
import {LAYOUT_V3_ALIGN as layout,createOfficeNavigation,workHome} from '../office-layout.js'
import {planWorkstationIslands,alignZoneObstaclePlan,alignPassages} from '../office-vis2/align-zones.js'
import * as THREE from '../vendor/three/three.module.js'
import {createSampleBatch} from '../office-vis2/batch.js'
import {appendOfficePlaza} from '../office-vis2/plaza.js'
import {buildOfficePlazaHost} from '../office-vis2/plaza-host.js'

const overlap=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
const distance=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0))
test('25 real seats are grouped exactly once without adding decorative desks or blocking chair access',()=>{
  const groups=[],ids=[]
  for(const area of layout.regions){
    const plan=planWorkstationIslands(layout,area)
    groups.push(...plan.groups)
    for(const g of plan.groups){
      ids.push(...g.workstationIds)
      assert.ok(g.memberIds.length>0)
      for(const p of plan.placements.filter(p=>p.groupId===g.id)){
        assert.equal(overlap(p.bounds,g.useSpace),false,p.id+' chair use space')
        for(const c of alignPassages(layout))assert.equal(overlap(p.bounds,c),false,p.id+' passage')
      }
    }
  }
  assert.deepEqual(ids.sort(),Object.keys(layout.seats).sort())
  assert.equal(new Set(ids).size,25)
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)assert.ok(distance(groups[i].groupBounds,groups[j].groupBounds)>=1.2-1e-9,'group aisle >=1.2m')
  for(const {id,plan}of alignZoneObstaclePlan(layout))if(!['creative','dining','leisure','north-nook'].includes(id)){
    assert.ok(plan.placements.every(p=>['desk-divider','planter-cabinet'].includes(p.kind)||(id==='west-open'&&p.kind==='cabinet'&&p.sample==='west-desk-island'&&p.workstationIds.join('/')==='OpsLead/OpsEngineer')))
    assert.equal(plan.placements.filter(p=>p.kind==='cabinet').length,id==='west-open'?1:0)
    assert.ok(plan.groups.every(g=>g.workstationIds.length>0))
  }
})

test('all 625 real desk transfers keep swept centers clear of the new island accessories',()=>{
  const nav=createOfficeNavigation(layout),homes=Object.values(layout.seats).map(workHome)
  const blockers=alignZoneObstaclePlan(layout).flatMap(({plan})=>plan.placements.filter(p=>p.workstationIds).map(p=>p.bounds))
  for(const home of homes)for(const target of homes){
    const route=nav.officeTrip(home,target,target)
    assert.ok(route.length)
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05))
      for(let j=0;j<=steps;j++){
        const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps
        for(const p of blockers)assert.ok(Math.hypot(Math.max(p.x0-x,0,x-p.x1),Math.max(p.z0-z,0,z-p.z1))>=.28-1e-6,`route ${home.x},${home.z} to ${target.x},${target.z} lacks 0.28m accessory clearance at ${x},${z}`)
      }
    }
  }
})

test('ALIGN plaza gardens keep the circular plaza, facilities and central entrance clear in both tiers',()=>{
  for(const low of [false,true]){
    const root=new THREE.Group(),batch=createSampleBatch(THREE),items=appendOfficePlaza({THREE,root,batch,layout,low}),built=batch.build(root,'garden-check')
    try{
      const gardens=items.filter(p=>p.kind==='garden');assert.equal(gardens.length,4)
      for(const g of gardens){
        assert.equal(overlap(g.bounds,{x0:0,x1:4,z0:12,z1:34}),false)
        assert.ok(Math.hypot(Math.max(g.bounds.x0-2,0,2-g.bounds.x1),Math.max(g.bounds.z0-21,0,21-g.bounds.z1))>=9.28)
        for(const other of items)if(other!==g)assert.equal(overlap(g.bounds,other.bounds),false,g.id+'/'+other.id)
      }
      const positions=built.mesh.geometry.attributes.position
      for(let i=0;i<positions.count;i++)assert.ok(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)))
    }finally{built.dispose()}
    const live=new Set(),host=buildOfficePlazaHost({THREE,root,layout,search:'?officeSample=1',low,collision:{add:p=>live.add(p),remove:p=>live.delete(p)}})
    assert.equal(live.size,host.placements.length);host.dispose();host.dispose();assert.equal(live.size,0);assert.equal(root.children.length,0)
  }
})
