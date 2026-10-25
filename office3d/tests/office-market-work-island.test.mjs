import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN_SAMPLE,LAYOUT_V3_ALIGN,LAYOUT_V3,LAYOUT_V2} from '../office-layout.js'
import {marketSamplePlan,marketSampleBounds} from '../office-vis2/furniture-sample.js'
import {buildOfficeDisplayFinish} from '../office-vis2/display-finish.js'
import {displayRoster,displayRoute,displayFrame,displaySchedule,displayFurnitureBounds} from '../display-staff-logic.js'
import {createFurnitureCollision} from '../furniture-collision.js'
import {marketFurnitureFixture} from './helpers/market-furniture.mjs'

const layout={...LAYOUT_V3_ALIGN_SAMPLE,version:2,displayAdapter:'v3'},hash=b=>createHash('sha256').update(b).digest('hex')
const close=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} vs ${b}`)

test('market has exactly four facing workstations, three original simulated identities and one empty chair',()=>{
  const plan=marketSamplePlan(layout),people=displayRoster({...layout,marketSample:true}).filter(p=>p.department==='market')
  assert.equal(plan.stations.length,4);assert.equal(plan.stations.filter(s=>s.personId).length,3)
  assert.deepEqual(people.map(p=>p.id),['sim-market-1','sim-market-2','sim-market-3'])
  assert.equal(plan.stations[3].personId,null);assert.equal(plan.stations[3].chairId,'market-empty-chair')
  for(const s of plan.stations){assert.equal(s.home.z,s.z);close(s.home.x-s.x,Math.sin(s.yaw));assert.ok(Math.abs(s.yaw)===Math.PI/2)}
  const room=layout.regions.find(r=>r.id==='market'),b=plan.groupBounds
  assert.ok(b.x0-room.x0-.14>=1.2);assert.ok(room.x1-.14-b.x1>=1.2)
  assert.ok(b.z0-room.z0-.14>=1.2);assert.ok(room.z1-.14-b.z1>=1.2)
  assert.equal(room.doors[0].width,1.5);assert.ok(plan.art.length>=2&&plan.art.length<=3);assert.ok(plan.plants.length<=2)
  assert.ok(b.x0-(plan.cabinet.x+plan.cabinet.d/2)>=1.2,'west cabinet clears the chair aisle')
  assert.equal(plan.table,undefined);assert.equal(plan.visitors,undefined)
})

test('sample-off and stable layouts keep their display geometry, roster and routes',()=>{
  for(const l of [LAYOUT_V2,{...LAYOUT_V3,version:2,displayAdapter:'v3',corridors:{...LAYOUT_V3.corridors,north:LAYOUT_V3.corridors.westNorthCross,south:LAYOUT_V3.corridors.eastSouthCross}},{...LAYOUT_V3_ALIGN,version:2,displayAdapter:'v3'}]){
    assert.equal(marketSamplePlan(l),null)
    const roster=displayRoster(l),withMarker=displayRoster({...l,marketSample:true});assert.deepEqual(withMarker,roster)
    for(const p of roster)assert.deepEqual(displayRoute(l,p),displayRoute({...l,marketSample:true},p))
  }
  assert.equal(Object.keys(LAYOUT_V3_ALIGN_SAMPLE.seats).length,25)
})

test('actual host placement builds four desks/chairs and measured screen fits without disposing shared source assets',()=>{
  for(const low of [false,true]){
    const fixture=marketFurnitureFixture(),calls=[],world=createFurnitureCollision(),root=new THREE.Group(),sharedDisposed=[]
    for(const [name,group]of Object.entries(fixture.A.furn))group.traverse(m=>{if(m.isMesh)m.geometry.addEventListener('dispose',()=>sharedDisposed.push(name))})
    const value=buildOfficeDisplayFinish({THREE,root,layout,low,search:'?officeSample=1',collision:world,...fixture,placeFurniture(...args){calls.push(args);return fixture.placeFurniture(...args)}})
    try{
      assert.equal(value.finish.fallback,undefined)
      for(const name of ['desk','chairDesk','computerScreen','computerKeyboard','computerMouse'])assert.equal(calls.filter(c=>c[1]===name).length,4,name)
      const s=value.finish.sample;assert.equal(s.parts.filter(p=>p.kind==='work-desk').length,4);assert.equal(s.parts.filter(p=>p.kind==='work-chair').length,4)
      assert.equal(s.parts.filter(p=>p.kind==='wall-art').length,3);assert.equal(s.parts.filter(p=>p.kind==='wall-cabinet').length,1)
      assert.ok(s.bounds.filter(b=>b.id.startsWith('market-desk-')).every(b=>Math.abs(b.y0)<2e-5&&b.y1>1.1))
      const planned=marketSampleBounds(s)
      for(const b of s.bounds){const p=planned.find(p=>p.id===b.id);assert.ok(p,b.id);assert.ok(p.x0<=b.x0+2e-5&&p.x1>=b.x1-2e-5&&p.z0<=b.z0+2e-5&&p.z1>=b.z1-2e-5,b.id)}
      const art=s.bounds.filter(b=>b.id.startsWith('market-wall-art'))
      for(const b of art){close(b.z0,layout.envelope.z0+.05);assert.ok(b.z1-layout.envelope.z0>=.12);assert.ok(b.y0>=.2&&b.y1<=2.4)}
      assert.deepEqual(displayFurnitureBounds(value.displayLayout).filter(b=>!b.id.startsWith('sim-service')&&!b.id.startsWith('sim-aftersales')&&!b.id.startsWith('sim-marketing')),s.bounds)
      assert.equal(value.summary().calls,1);assert.equal(world.stats().bodies,1)
      value.dispose();value.dispose();assert.equal(world.stats().bodies,0);assert.equal(sharedDisposed.length,0);assert.equal(root.children.length,0)
    }finally{value.dispose();fixture.dispose()}
  }
})

test('three unchanged rooms retain every finished vertex attribute and all nine simulated identities',()=>{
  const fixture=marketFurnitureFixture(),before=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout:{...LAYOUT_V3_ALIGN,version:2,displayAdapter:'v3'},search:'?officeSample=1'}),after=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout,search:'?officeSample=1',...fixture})
  try{
    const unchanged=after.finish.parts.filter(p=>p.id!=='market'&&!p.id.startsWith('sim-market-'))
    for(const id of ['service','aftersales','marketing'])assert.ok(unchanged.some(p=>p.id===id),id)
    for(const part of unchanged){
      const old=before.finish.parts.find(p=>p.id===part.id&&p.kind===part.kind);assert.ok(old);assert.equal(part.count,old.count)
      for(const [name,a]of Object.entries(after.root.children[0].geometry.attributes)){
        const b=before.root.children[0].geometry.attributes[name],size=a.itemSize
        assert.equal(hash(a.array.slice(part.start*size,(part.start+part.count)*size)),hash(b.array.slice(old.start*size,(old.start+old.count)*size)),part.id+'/'+name)
      }
    }
    const old=displayRoster({...LAYOUT_V3_ALIGN,version:2,displayAdapter:'v3'})
    for(const p of displayRoster(after.displayLayout).filter(p=>p.department!=='market')){assert.deepEqual(p,old.find(o=>o.id===p.id));assert.deepEqual(displayRoute(after.displayLayout,p),displayRoute({...LAYOUT_V3_ALIGN,version:2,displayAdapter:'v3'},p))}
    const roster=displayRoster(after.displayLayout),routes=new Map(roster.map(p=>[p.id,displayRoute(after.displayLayout,p)])),schedule=displaySchedule(roster,routes,0)
    assert.equal(displayFrame(roster,routes,schedule,0).length,12)
  }finally{before.dispose();after.dispose();fixture.dispose()}
})
