import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V1, LAYOUT_V2, LAYOUT_V3, LAYOUT_V3_ALIGN, LAYOUT_V3_ALIGN_SAMPLE, resolveOfficeLayout, createOfficeNavigation, workHome, roomSegments } from '../office-layout.js'
import { FACING_SEATS, FACING_ISLAND_BOUNDS as island } from '../office-vis2/furniture-sample.js'
import { officeFurnitureV2Spec, workstationDesktop } from '../office-furniture-v2.js'
import { alignZoneObstaclePlan, planWorkstationIslands } from '../office-vis2/align-zones.js'
import { buildOpenFurnishing } from '../office-vis2/open-furnishing.js'
import { buildOfficeDisplayFinish } from '../office-vis2/display-finish.js'
import { displayRoster, displayRoute, displayFurnitureBounds } from '../display-staff-logic.js'
import { barSeats } from '../office-bar-geometry.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import before from './fixtures/office-o1o2-r1-ebd884f.json' with { type: 'json' }
import { marketFurnitureFixture } from './helpers/market-furniture.mjs'

const sample=LAYOUT_V3_ALIGN_SAMPLE, sampleL1={...sample,plan1Phase:'L1'}, hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const overlap=(a,b)=>a.x1>b.x0&&a.x0<b.x1&&a.z1>b.z0&&a.z0<b.z1
const gap=(a,b)=>Math.hypot(Math.max(a.x0-b.x1,b.x0-a.x1,0),Math.max(a.z0-b.z1,b.z0-a.z1,0))
// 独立线段/盒相交检查；不调用生产路径的 clear()，端点安全不能代替整段安全。
function hit(a,b,box,pad=0){
  let lo=0,hi=1
  for(const axis of ['x','z']){
    const d=b[axis]-a[axis],min=box[axis+'0']-pad,max=box[axis+'1']+pad
    if(Math.abs(d)<1e-12){if(a[axis]<=min||a[axis]>=max)return false;continue}
    const u=(min-a[axis])/d,v=(max-a[axis])/d
    lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>=hi)return false
  }
  return hi>0&&lo<1
}
function matrix(layout,extended=false){
  const nav=createOfficeNavigation(layout),homes=Object.entries(layout.seats).map(([id,s])=>[id,workHome(s)]),meet=officeFurnitureV2Spec(layout).meetings.flatMap(r=>r.seats)
  return homes.flatMap(([id,h])=>[
    ['exit',null,()=>nav.officeExit(h)],['board',null,()=>nav.boardTrip(h,layout.boss.stand)],...(extended?[['entrance',null,()=>nav.corridorPath(h,nav.ENTRANCE.inner)]]:[]),
    ...homes.map(([target,t])=>['office:'+target,target,()=>nav.officeTrip(h,t,t)]),...nav.LOUNGE_SEATS.map((s,i)=>['lounge:'+i,null,()=>nav.loungeTrip(h,s)]),...meet.map((s,i)=>['meet:'+i,null,()=>nav.meetingTrip(h,s)]),
    ...(extended?barSeats(layout).map((s,i)=>['stool:'+i,null,()=>nav.corridorPath(h,s)]):[]),...Object.keys(nav.consumerQueues).map(k=>['consumer:'+k,null,()=>nav.consumerTrip(h,k,nav.consumerQueues[k][0])]),
  ].map(([kind,target,run])=>({id,kind,target,route:run()})))
}

test('OFFICE-PLAN-1 sample is explicit while all four fallback layouts remain frozen',()=>{
  assert.equal(resolveOfficeLayout('?layout=3&align=1&officeSample=1&l2b=0'),sample)
  for(const suffix of ['', '&officeSample=0','&officeSample=true','&officeSample=1&officeSample=1'])assert.equal(resolveOfficeLayout('?layout=3&align=1'+suffix),LAYOUT_V3_ALIGN)
  assert.equal(resolveOfficeLayout('?layout=3&officeSample=1'),LAYOUT_V3)
  assert.equal(resolveOfficeLayout('?layout=2&officeSample=1'),LAYOUT_V2)
  const snapshots=['20e60b44562b4516a126bdde7326260d25fcd02408739c8d47982c9a3b3dbdea','4e6d413d8413fccbeec637bdc6b0169f0b73c1f14d51f99901afc5e1187fe033','5a379cbaccf9720d3b2024963cfbd11b4867d6beab53f67729b992c6747723ff','bf4bb23ee0f4218cd7d5f2dfc4369c53e20ed3c0d11afbec28818c7cbc58690f']
  for(const [i,l]of [LAYOUT_V1,LAYOUT_V2,LAYOUT_V3,LAYOUT_V3_ALIGN].entries()){
    assert.equal(hash(l),snapshots[i]);for(const [,x,z]of Object.values(l.seats||l.SEATS))assert.deepEqual(workHome(['unused',x,z]),{x,z:z+1,yaw:0})
  }
  assert.deepEqual(new Set(Object.keys(sample.seats)),new Set(Object.keys(LAYOUT_V3_ALIGN.seats)));assert.equal(Object.keys(sample.seats).length,25)
  assert.equal(sampleL1.plan1Phase,'L1');assert.equal(sample.regions.length,13);assert.equal(sample.doors.south.width,6)
})

test('stable 1375 routes and closed ALIGN 1650 routes preserve their complete c41b7c5 hashes',()=>{
  const stable=matrix(LAYOUT_V3),closed=matrix(LAYOUT_V3_ALIGN,true)
  assert.equal(stable.length,1375);assert.equal(hash(stable.map(p=>p.route)),'a80676e72d616ab7ade9d6c4bd50618e27da856a46e6f39425146f6367995cd7')
  assert.equal(closed.length,1650);assert.equal(hash(closed),'b4cb1ea1659e209ef8252417c852fa67bdfa5b71d20ccb2a6b84f6dfdaac6a26')
})

test('OFFICE-PLAN-1 sample computes its complete finite route matrix',()=>{
  const next=matrix(sample,true)
  assert.equal(next.length,1500)
  for(const r of next)assert.ok(r.route.length&&r.route.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),`${r.id}/${r.kind}`)
})

test('all 25 relocated workstations keep chair anchors and measured monitor fits',()=>{
  const workstations=officeFurnitureV2Spec(sample).workstations
  assert.equal(workstations.length,25)
  for(const s of workstations){
    const home=workHome(sample.seats[s.name]),desktop=workstationDesktop(s),fit=desktop.fit
    assert.equal(s.chair.x,home.x);assert.equal(s.chair.z,home.z);assert.equal(s.chair.yaw,home.yaw)
    assert.ok(Number.isFinite(desktop.keyboard.x)&&Number.isFinite(desktop.keyboard.z))
    const direction=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(fit.pitch,fit.yaw,0,'YXZ'))
    assert.ok(direction.dot(new THREE.Vector3(...fit.normal))>1-1e-10)
    const offset=new THREE.Vector3(fit.center.x-fit.glassCenter.x,fit.center.y-fit.glassCenter.y,fit.center.z-fit.glassCenter.z)
    assert.ok(Math.abs(offset.length()-.0015)<1e-9)
    const stand=createOfficeNavigation(sampleL1).standAt(workHome(sampleL1.seats[s.name]))
    assert.ok(Math.abs(Math.hypot(stand.x-home.x,stand.z-home.z)-1.15)<1e-9,'visitor stands outside the occupied chair')
  }
})

test('L2 changes only the four approved existing-seat exit offsets',()=>{
  const exceptions=new Set(['PM','Frontend1','BackendSenior','UIUX']), l1=createOfficeNavigation(sampleL1), l2=createOfficeNavigation(sample)
  for(const [id,seat] of Object.entries(sample.seats)){
    const home=workHome(seat),a=l1.standAt(workHome(sampleL1.seats[id])),b=l2.standAt(home)
    assert.ok(Math.abs(Math.hypot(a.x-home.x,a.z-home.z)-1.15)<1e-9,`${id} L1`)
    assert.ok(Math.abs(Math.hypot(b.x-home.x,b.z-home.z)-(exceptions.has(id)?.6:1.15))<1e-9,`${id} L2`)
    assert.deepEqual(sample.seats[id],sampleL1.seats[id],`${id} seat fields`)
    if(!exceptions.has(id))assert.deepEqual(b,a,`${id} exit point`)
    else assert.notDeepEqual(b,a,`${id} approved L2 exception`)
  }
})

test('OFFICE-PLAN-1 keeps every business identity exactly once',()=>{
  const names=officeFurnitureV2Spec(sample).workstations.map(item=>item.name)
  assert.equal(names.length,25);assert.equal(new Set(names).size,25);assert.deepEqual(new Set(names),new Set(Object.keys(LAYOUT_V3_ALIGN.seats)))
})

test('market work-island actors use their side aisles without crossing desks, chairs, cabinet or walls',()=>{
  const dl={...sample,version:2,displayAdapter:'v3',marketSample:true},people=displayRoster(dl),room=dl.regions.find(r=>r.id==='market'),obstacles=displayFurnitureBounds(dl)
  assert.equal(people.length,12)
  for(const p of people.filter(p=>p.department==='market')){
    assert.equal(p.yaw,p.id==='sim-market-3'?Math.PI/2:-Math.PI/2);const rt=displayRoute(dl,p);assert.equal(rt.side,'west')
    for(const route of [rt.go,rt.back])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i]
      for(const box of obstacles){
        // 唯一豁免是本人起身/落座的0.7m段，不豁免途中或别人的椅子。
        if(box.id===p.id+'-chair'&&(i===1||i===route.length-1)&&[a,b].some(q=>q.x===p.home.x&&q.z===p.home.z)){assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=.700001);continue}
        assert.equal(hit(a,b,box,.22-1e-6),false,`${p.id}/${i}/${box.id}`)
      }
      if(a.z<=room.z1&&b.z<=room.z1){assert.ok(Math.min(a.x,b.x)>=room.x0+.22);assert.ok(Math.max(a.x,b.x)<=room.x1-.22)}
      for(const w of roomSegments(room)){
        const v=w.side==='west'||w.side==='east',fixed=w.side==='west'?room.x0:w.side==='east'?room.x1:w.side==='north'?room.z0:room.z1
        const wall=v?{x0:fixed-.07,x1:fixed+.07,z0:w.lo,z1:w.hi}:{x0:w.lo,x1:w.hi,z0:fixed-.07,z1:fixed+.07}
        assert.equal(hit(a,b,wall,.22-1e-6),false,`${p.id} wall ${w.side}`)
      }
    }
  }
  for(const p of people.filter(p=>p.department!=='market')){
    const region=dl.regions.find(r=>r.id===p.department)
    assert.ok(p.desk.x>region.x0&&p.desk.x<region.x1&&p.desk.z>region.z0&&p.desk.z<region.z1,p.id)
  }
})

test('market work-island actual geometry and route bounds agree; owned collisions unregister and failure restores old pose',()=>{
  for(const low of [false,true]){
    const dl={...sample,version:2,displayAdapter:'v3'},root=new THREE.Group(),world=createFurnitureCollision(),fixture=marketFurnitureFixture()
    const value=buildOfficeDisplayFinish({THREE,root,layout:dl,search:'?officeSample=1',low,collision:world,...fixture})
    const previous=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout:{...LAYOUT_V3_ALIGN,version:2,displayAdapter:'v3'},search:'?officeSample=1',low})
    try{
      assert.equal(value.finish.fallback,undefined);assert.equal(value.summary().calls,1)
      assert.equal(value.displayLayout.marketSample,true);assert.equal(value.finish.sample.bounds.length,15)
      assert.equal(value.summary().sharedTables,0);assert.equal(value.summary().visitorChairs,0);assert.equal(value.summary().marketWorkstations,4)
      const actual=value.finish.sample.bounds,planned=displayFurnitureBounds(value.displayLayout)
      for(const b of actual){const p=planned.find(p=>p.id===b.id);assert.ok(p,b.id);for(const key of ['x0','x1','z0','z1'])assert.ok(Math.abs(b[key]-p[key])<2e-5,`${b.id}/${key}`)}
      // 靠墙矮柜和画板不是工作岛；岛本身含全部四椅，四面仍须有1.2m净距。
      const room=sample.regions.find(r=>r.id==='market'),islandParts=new Set(value.finish.sample.parts.filter(p=>['work-desk','work-chair','divider'].includes(p.kind)).map(p=>p.id))
      const all=actual.filter(b=>islandParts.has(b.id)).reduce((a,b)=>({x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)}))
      for(const d of [all.x0-room.x0-.14,room.x1-.14-all.x1,all.z0-room.z0-.14,room.z1-.14-all.z1])assert.ok(d>=1.2-1e-5)
      value.dispose();value.dispose();assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
    }finally{value.dispose();previous.dispose();fixture.dispose()}
    const failureFixture=marketFurnitureFixture()
    const failed=buildOfficeDisplayFinish({THREE,root:new THREE.Group(),layout:dl,search:'?officeSample=1',low,...failureFixture,collision:{add(){throw Error('expected failure')},remove(){}}})
    try{assert.equal(failed.finish.fallback,true);assert.equal(failed.finish.reason,'expected failure');assert.equal(failed.displayLayout,undefined);assert.equal(displayRoster(dl).find(p=>p.id==='sim-market-1').yaw,dl.displaySeats.find(p=>p.id==='market-1').yaw)}finally{failed.dispose();failureFixture.dispose()}
  }
})
