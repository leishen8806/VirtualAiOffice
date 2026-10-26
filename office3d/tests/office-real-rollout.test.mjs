import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import{LAYOUT_V3_ALIGN_SAMPLE as layout,LAYOUT_V3_ALIGN,LAYOUT_V1,LAYOUT_V2,LAYOUT_V3,workHome,createOfficeNavigation,roomSegments}from'../office-layout.js'
import{officeFurnitureV2Spec,workstationDesktop}from'../office-furniture-v2.js'
import{FACING_SEATS,facingIslandGroups}from'../office-vis2/furniture-sample.js'
import{alignZoneObstaclePlan}from'../office-vis2/align-zones.js'
import{buildOpenFurnishing}from'../office-vis2/open-furnishing.js'
import approved from './fixtures/office-r2-approved-seats.json' with{type:'json'}
import frozen from './fixtures/office-r2-frozen-seats.json' with{type:'json'}
import{createHash}from'node:crypto'
import{wholeFloorSpec}from'../office-vis2/whole-floor.js'
const close=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} vs ${b}`)
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export function segmentHit(a,b,box,pad=.22-1e-6){if(box.radius!==undefined){const x=b.x-a.x,z=b.z-a.z,d=x*x+z*z,t=d?Math.max(0,Math.min(1,((box.x-a.x)*x+(box.z-a.z)*z)/d)):0;return Math.hypot(a.x+x*t-box.x,a.z+z*t-box.z)<box.radius+pad}if(box.yaw!==undefined){const c=Math.cos(box.yaw),s=Math.sin(box.yaw),local=p=>({x:(p.x-box.x)*c-(p.z-box.z)*s,z:(p.x-box.x)*s+(p.z-box.z)*c});return segmentHit(local(a),local(b),{x0:-.31,x1:.31,z0:-.3,z1:.3},pad)}let lo=0,hi=1;for(const axis of['x','z']){const d=b[axis]-a[axis],mn=box[axis+'0']-pad,mx=box[axis+'1']+pad;if(Math.abs(d)<1e-12){if(a[axis]<=mn||a[axis]>=mx)return false;continue}const u=(mn-a[axis])/d,v=(mx-a[axis])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>=hi)return false}return hi>0&&lo<1}
export function rolloutRoutes(l=layout){const nav=createOfficeNavigation(l),spec=officeFurnitureV2Spec(l),homes=Object.entries(l.seats).map(([id,s])=>[id,workHome(s)]);return homes.filter(([id])=>approved[id]).flatMap(([id,h])=>[
 ['exit',null,nav.officeExit(h)],['entrance',null,nav.corridorPath(h,nav.ENTRANCE.inner)],['board',null,nav.boardTrip(h,l.boss.stand)],
 ...homes.map(([target,t])=>['office:'+target,null,nav.officeTrip(h,t,nav.standAt(t))]),
 ...spec.meetings.flatMap(t=>t.seats.map((seat,i)=>['meeting:'+t.id+':'+i,seat,nav.meetingTrip(h,seat)])),
 ...nav.LOUNGE_SEATS.map((seat,i)=>['lounge:'+i,seat,nav.loungeTrip(h,seat)]),
 ...Object.keys(nav.consumerQueues).map(k=>['consumer:'+k,null,nav.consumerTrip(h,k,nav.consumerQueues[k][0])]),
 ].map(([kind,seat,route])=>({id,kind,seat,route,home:h}))) }
test('the exact approved eighteen positions and homes apply only in the sample, retaining every identity and seven frozen seats',()=>{
 assert.equal(Object.keys(approved).length,18);assert.equal(Object.keys(layout.seats).length,25);assert.deepEqual(Object.keys(layout.seats),Object.keys(LAYOUT_V3_ALIGN.seats))
 for(const[id,p]of Object.entries(approved)){assert.deepEqual(layout.seats[id],p.desk);assert.deepEqual(workHome(layout.seats[id]),p.home);assert.equal(layout.seats[id][0],LAYOUT_V3_ALIGN.seats[id][0])}
 for(const[id,p]of Object.entries(frozen)){assert.ok(!approved[id]);assert.deepEqual(layout.seats[id],p.desk);assert.deepEqual(workHome(layout.seats[id]),p.home)}
 const snapshots=['20e60b44562b4516a126bdde7326260d25fcd02408739c8d47982c9a3b3dbdea','4e6d413d8413fccbeec637bdc6b0169f0b73c1f14d51f99901afc5e1187fe033','5a379cbaccf9720d3b2024963cfbd11b4867d6beab53f67729b992c6747723ff','bf4bb23ee0f4218cd7d5f2dfc4369c53e20ed3c0d11afbec28818c7cbc58690f']
 for(const[i,l]of[LAYOUT_V1,LAYOUT_V2,LAYOUT_V3,LAYOUT_V3_ALIGN].entries())assert.equal(hash(l),snapshots[i])
 for(const p of officeFurnitureV2Spec(layout).workstations){const h=workHome(layout.seats[p.name]);assert.equal(p.chair.x,h.x);assert.equal(p.chair.z,h.z);assert.equal(p.chair.yaw,h.yaw);if(approved[p.name])assert.equal(workstationDesktop(p).yaw,h.yaw)}
})
test('five facing islands reuse the approved template and measured D.life accessories leave at least 1.2m',()=>{
 assert.deepEqual(facingIslandGroups(layout).map(g=>g.ids.length),[4,4,6,4,4])
 for(const low of[false,true]){const plan=alignZoneObstaclePlan(layout).find(p=>p.id==='drlife').plan,v=buildOpenFurnishing({THREE,root:new THREE.Group(),plan,low});try{
  const groups=v.groups.map(g=>{const members=v.placements.filter(p=>g.memberIds.includes(p.id));return{...g,b:{x0:Math.min(...members.map(p=>p.bounds.x0)),x1:Math.max(...members.map(p=>p.bounds.x1)),z0:Math.min(...members.map(p=>p.bounds.z0)),z1:Math.max(...members.map(p=>p.bounds.z1))}}})
  assert.equal(groups.length,2);const gap=groups[1].b.x0-groups[0].b.x1;assert.ok(gap>=1.2,`${low}/${gap}`)
  close(gap,1.24);assert.equal(v.placements.filter(p=>p.kind==='desk-divider').length,2)
 }finally{v.dispose()}}
})
test('all eighteen route sets and their returns clear every desk island, accessory, chair and wall segment',()=>{
 const routes=rolloutRoutes(),spec=officeFurnitureV2Spec(layout),groups=facingIslandGroups(layout),furniture=alignZoneObstaclePlan(layout).flatMap(p=>p.plan.placements.map(p=>({...p.bounds,id:p.id})))
 const meetings=spec.meetings.flatMap(t=>[{id:t.id+'-table',x:t.x,z:t.z,radius:t.w/2},...t.seats.map((p,i)=>({id:'meeting:'+t.id+':'+i,seat:p,x:p.x,z:p.z,yaw:p.yaw,x0:p.x-.31,x1:p.x+.31,z0:p.z-.3,z1:p.z+.3}))])
 const board=[{id:'board-table',x0:spec.board.x-spec.board.w/2,x1:spec.board.x+spec.board.w/2,z0:spec.board.z-spec.board.d/2,z1:spec.board.z+spec.board.d/2},...spec.boardSeats.map((p,i)=>({id:'board-chair-'+i,x:p.x,z:p.z,yaw:p.yaw,x0:p.x-.31,x1:p.x+.31,z0:p.z-.3,z1:p.z+.3}))]
 const desks=spec.workstations.map(p=>({...p.desk,id:p.name+'-desk'})),chairs=spec.workstations.map(p=>({...p.chair,id:p.name+'-chair'})),walls=layout.regions.filter(r=>r.walled).flatMap(r=>roomSegments(r).map(w=>{const v=['east','west'].includes(w.side),c=w.side==='west'?r.x0:w.side==='east'?r.x1:w.side==='north'?r.z0:r.z1;return{id:r.id+'-'+w.side,...(v?{x0:c-.07,x1:c+.07,z0:w.lo,z1:w.hi}:{x0:w.lo,x1:w.hi,z0:c-.07,z1:c+.07})}}))
 assert.ok(routes.length>900)
 for(const row of routes)for(const line of[row.route,row.route.toReversed()])for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],own=[a,b].some(p=>p.x===row.home.x&&p.z===row.home.z)&&(i===1||i===line.length-1)&&Math.hypot(a.x-b.x,a.z-b.z)<=.900001
  for(const g of groups){if(own&&g.ids.includes(row.id))continue;assert.equal(segmentHit(a,b,g.bounds),false,`${row.id}/${row.kind}/${i}/${g.id}`)}
  for(const box of[...furniture,...desks,...chairs,...walls,...meetings,...board]){if(own&&box.id===row.id+'-chair')continue;if(box.id===row.kind&&[a,b].some(p=>p.x===row.seat?.x&&p.z===row.seat?.z)&&(i===1||i===line.length-1)){assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<=.950001,'assigned meeting chair radial approach is finite');continue}assert.equal(segmentHit(a,b,box),false,`${row.id}/${row.kind}/${i}/${box.id}`)}
 }
})

test('north meeting and nook proportions stay usable while wall art and bookcase trim share the sample finish',()=>{
 const details=wholeFloorSpec(layout).details,north=details.filter(p=>p.kind.startsWith('north-reference-'))
 assert.equal(north.filter(p=>p.kind==='north-reference-frame').length,3)
 assert.equal(north.filter(p=>p.kind==='north-reference-shelf-trim').length,2)
 assert.equal(wholeFloorSpec(LAYOUT_V3_ALIGN).details.some(p=>p.kind.startsWith('north-reference-')),false)
 for(const p of north.filter(p=>p.kind==='north-reference-frame')){const room=layout.regions.find(r=>r.id===p.owner);assert.ok(p.x-p.w/2>room.x0&&p.x+p.w/2<room.x1);assert.ok(p.y-p.h/2>=1.3&&p.y+p.h/2<=2.4);assert.ok(p.z+p.d/2-room.z0>=.12)}
 const spec=officeFurnitureV2Spec(layout);assert.deepEqual(spec.meetings.map(t=>[t.w,t.d]),[[1.5,1.5],[1.5,1.5]])
 const nook=alignZoneObstaclePlan(layout).find(p=>p.id==='north-nook');assert.equal(nook.plan.groups.length,2);assert.ok(nook.plan.placements.filter(p=>p.kind==='round-table').every(p=>p.w===1&&p.height===.8))
 assert.ok(spec.shelves.every(p=>p.h===2.65&&p.y===.126))
})

test('segment checks reject bad shortcuts even when endpoints clear the desk island, round table or wall',()=>{
 const g=facingIslandGroups(layout).find(g=>g.id==='product'),x=(g.bounds.x0+g.bounds.x1)/2,a={x,z:g.bounds.z0-1},b={x,z:g.bounds.z1+1}
 assert.equal(segmentHit(a,a,g.bounds),false);assert.equal(segmentHit(b,b,g.bounds),false);assert.equal(segmentHit(a,b,g.bounds),true)
 const circle={x:0,z:0,radius:.75};assert.equal(segmentHit({x:-2,z:0},{x:2,z:0},circle),true)
 const wall={x0:-.07,x1:.07,z0:-1,z1:1};assert.equal(segmentHit({x:-1,z:0},{x:1,z:0},wall),true)
})
