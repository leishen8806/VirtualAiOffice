import test from 'node:test'
import assert from 'node:assert/strict'
import { LAYOUT_V2, createOfficeNavigation, roomSegments, workHome } from '../office-layout.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'
import * as THREE from '../vendor/three/three.module.js'
import { createDirector } from '../director.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { PERSON_GAP } from '../pedestrian-traffic.js'
import { createCatNavigation } from '../cat-play.js'
import { createQueueBoard } from '../foyer-paths.js'

const inside = (p, b, pad = 0) => p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.z >= b.z0 - pad && p.z <= b.z1 + pad

test('O5 bar seats and radial approaches clear all 12 collision segments at person radius .26', () => {
  assert.equal(LAYOUT_V2.bar.segments.length, 12)
  for (const seat of LAYOUT_V2.bar.seats) {
    const dx = seat.x - 2, dz = seat.z + 1, length = Math.hypot(dx, dz)
    for (let r = length; r <= 7; r += .05) {
      const point = { x: 2 + dx / length * r, z: -1 + dz / length * r }
      assert.equal(LAYOUT_V2.bar.segments.some(box => inside(point, box, .26)), false, seat.id)
    }
  }
  for (const direction of [-1, 1]) for (let x = 0; x <= 5; x += .05) {
    const point = { x: 2 + direction * x, z: -1 }
    assert.equal(LAYOUT_V2.bar.segments.some(box => inside(point, box, .26)), false, 'east/west opening')
  }
})

const walls = LAYOUT_V2.regions.flatMap(room => roomSegments(room).map(s => {
  const vertical = s.side === 'west' || s.side === 'east'
  const fixed = vertical ? s.side === 'west' ? room.x0 : room.x1 : s.side === 'north' ? room.z0 : room.z1
  return vertical ? { x0: fixed - .07, x1: fixed + .07, z0: s.lo, z1: s.hi } : { x0: s.lo, x1: s.hi, z0: fixed - .07, z1: fixed + .07 }
}))
const obstacles = [...walls, ...LAYOUT_V2.bar.segments, LAYOUT_V2.frontDesk]
function audit(from, path, label) {
  for (const to of path) {
    const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .05)
    for (let i = 0; i <= count; i++) {
      const p = { x: from.x + (to.x - from.x) * i / (count || 1), z: from.z + (to.z - from.z) * i / (count || 1) }
      assert.equal(obstacles.some(b => inside(p, b, .22)), false, `${label}: ${JSON.stringify({from,to,p})}`)
    }
    from = to
  }
}

test('O5 all 25 seats reach reception, both meeting rooms, every coffee seat and south exit', () => {
  const nav = createOfficeNavigation(LAYOUT_V2), spec = officeFurnitureV2Spec(LAYOUT_V2)
  for (const [name, seat] of Object.entries(LAYOUT_V2.seats)) {
    const home = workHome(seat), exit = nav.officeExit(home)
    audit(home, exit, `${name}/exit`)
    for (const target of [nav.ENTRANCE.inner, nav.ENTRANCE.gate.at(-1), {x:8,z:14}]) audit(home, [...exit,...nav.corridorPath(exit.at(-1),target)], `${name}/public`)
    for (const meeting of spec.meetings) for (const chair of meeting.seats) audit(home,nav.meetingTrip(home,chair),`${name}/meeting-${chair.room}`)
    for (const chair of [...nav.LOUNGE_SEATS,...nav.COFFEE_SEATS]) audit(home, nav.loungeTrip(home,chair), `${name}/leisure-${chair.id}`)
  }
})

test('O5 a blocked room doorway fails reachability and north visual door never enters navigation', () => {
  const mutated = structuredClone(LAYOUT_V2)
  mutated.regions.find(r=>r.id==='product').doors[0].width=0
  assert.throws(()=>createOfficeNavigation(mutated).officeExit(workHome(mutated.seats.Lead)),/没有可用门洞/)
  assert.throws(()=>createOfficeNavigation(LAYOUT_V2).corridorPath({x:2,z:-8},{x:2,z:-19}),/北门锁闭/)
})

function pressureWorld() {
  const world = createFurnitureCollision(), chairs = new Map()
  const box = (b, kind) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.x1-b.x0, 1.8, b.z1-b.z0)); mesh.position.set((b.x0+b.x1)/2,.9,(b.z0+b.z1)/2); world.add(mesh,kind); return mesh }
  obstacles.forEach(b=>box(b,'officeWall'))
  for(const [name,[,x,z]] of Object.entries(LAYOUT_V2.seats)) {
    box({x0:x-.7,x1:x+.7,z0:z-.35,z1:z+.35},'desk')
    chairs.set(name,box({x0:x-.31,x1:x+.31,z0:z+.7,z1:z+1.3},'chair'))
  }
  for(const m of officeFurnitureV2Spec(LAYOUT_V2).meetings) box({x0:m.x-m.w/2,x1:m.x+m.w/2,z0:m.z-m.d/2,z1:m.z+m.d/2},'meetingTable')
  return {world,chairs}
}
const stressWorld = pressureWorld()

test('O5 cat follows the selected layout around bar, room doors and plaza without cutting walls', () => {
  const cat=createCatNavigation(LAYOUT_V2,stressWorld.world)
  let from={x:2,z:4}
  for(const to of [{x:2,z:6},{x:-22.5,z:-8},{x:2,z:-17},{x:35.5,z:-8},{x:2,z:23},{x:-5,z:-1}]) {
    const route=cat.catRoute(from,to);assert.ok(route?.length,JSON.stringify({from,to}))
    audit(from,route,'cat');let a=from
    for(const b of route){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05));for(let i=0;i<=n;i++)assert.equal(stressWorld.world.hit(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n),null);a=b}
    from=to
  }
  assert.equal(cat.isCatGroundPoint({x:2,z:-18.1}),false)
})

test('O5 all 25 people commute out and return, with no scheduler or collision exemption changes', () => {
  const nav=createOfficeNavigation(LAYOUT_V2), all=Object.entries(LAYOUT_V2.seats).map(([name,seat])=>actor(name,workHome(seat))),views=new Map(all.map(v=>[v.id,v]))
  globalThis.document??={createElement:()=>({remove(){},querySelector:()=>({})})}
  const d=createDirector({layout:LAYOUT_V2,views,board:{},layer:{appendChild(){}},project:{tmp:new THREE.Vector3(),fn(){}},furnitureCollision:stressWorld.world})
  for(const v of all){
    assert.equal(d.goHome(v,()=>{v.away=true}),true)
    for(let i=0;i<2000&&v.act;i++)d.update(.1)
    assert.equal(v.act,null,v.id+'/leave');assert.equal(d.stats().timeouts,0)
    v.away=false;assert.equal(d.arrive(v),true)
    for(let i=0;i<2000&&v.act;i++)d.update(.1)
    assert.equal(v.act,null,v.id+'/arrive');assert.equal(d.stats().timeouts,0)
    assert.ok(Math.hypot(v.char.group.position.x-v.home.x,v.char.group.position.z-v.home.z)<.01)
    audit(v.home,[...nav.officeExit(v.home),...nav.corridorPath(nav.officeExit(v.home).at(-1),nav.ENTRANCE.inner),...nav.ENTRANCE.gate],v.id+'/commute')
  }
})
function actor(id,home) {
  const group=new THREE.Group();group.position.set(home.x,0,home.z)
  return {id,name:id,home,stand:createOfficeNavigation(LAYOUT_V2).standAt(home),via:[],chair:stressWorld.chairs.get(id),char:{group,body:{head:new THREE.Object3D()},pose:{sit:1,walk:0,carry:0,type:0,lounge:0,phase:0,yaw:0,pitch:0,talk:0}},act:null}
}
function pressure(seed,count) {
  let random=seed
  const rnd=()=>{let t=random+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}
  const rows=Object.entries(LAYOUT_V2.seats).map(([name,seat])=>[name,workHome(seat)])
  if(count===37) rows.push(...LAYOUT_V2.displaySeats.map(s=>[s.id,{x:s.x,z:s.z,yaw:0}]))
  for(let i=rows.length-1;i;i--){const j=Math.floor(rnd()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]]}
  const views=new Map(rows.map(([id,home])=>[id,actor(id,home)])), all=[...views.values()], nav=createOfficeNavigation(LAYOUT_V2)
  globalThis.document??={createElement:()=>({className:'',innerHTML:'',remove(){},querySelector:()=>({textContent:''})})}
  const d=createDirector({layout:LAYOUT_V2,views,board:{},layer:{appendChild(){}},project:{tmp:new THREE.Vector3(),fn(){}},furnitureCollision:stressWorld.world})
  const meeting=officeFurnitureV2Spec(LAYOUT_V2).meetings
  d.travel(all[0],nav.loungeTrip(all[0].home,nav.COFFEE_SEATS[seed%10]),nav.COFFEE_SEATS[seed%10],true)
  for(let i=1;i<3;i++){const seat=meeting[i-1].seats[seed%meeting[i-1].seats.length];d.travel(all[i],nav.meetingTrip(all[i].home,seat),seat,false)}
  for(let i=3;i<12;i++)d.enqueue({kind:'dispatch',from:all[i].id,to:all[12+i%10].id,at:`2026-10-21T00:00:${String(i).padStart(2,'0')}Z`,text:'x'})
  const still=new Uint16Array(all.length), stuck=[];let minGap=Infinity,watchdogs=0,wallCrossings=0,step=0
  for(;step<6000;step++){
    const before=all.map(v=>({x:v.char.group.position.x,z:v.char.group.position.z}))
    d.update(.1)
    for(let i=0;i<all.length;i++) {
      const p=all[i].char.group.position, old=before[i], moved=Math.hypot(p.x-old.x,p.z-old.z)
      if(all[i].act?.phase==='walk'&&moved<1e-8)still[i]++;else still[i]=0
      if(still[i]===80){watchdogs++;stuck.push({name:all[i].id,p:p.toArray(),point:all[i].act.pts[all[i].act.i],phase:all[i].act.phase,yielding:all[i].act.yielding,returning:all[i].act.returningHome})}
      if(moved>.001) {
        for(const b of [...walls,...LAYOUT_V2.bar.segments]) {
          const n=Math.ceil(moved/.05)
          for(let j=1;j<=n;j++)if(inside({x:old.x+(p.x-old.x)*j/n,z:old.z+(p.z-old.z)*j/n},b)){wallCrossings++;break}
        }
      }
    }
    const walking=all.filter(v=>v.act?.phase==='walk')
    for(const v of walking)for(const other of all)if(v!==other)minGap=Math.min(minGap,v.char.group.position.distanceTo(other.char.group.position))
    if(!d.stats().active&&!d.stats().queued)break
  }
  return {seed,count,steps:step+1,watchdogs,wallCrossings,minGap,stuck,complete:!d.stats().active&&!d.stats().queued,...d.stats(),unfinished:all.filter(v=>v.act).map(v=>({name:v.id,phase:v.act.phase,p:v.char.group.position.toArray(),point:v.act.pts?.[v.act.i]}))}
}
test('O5 layout2 25/37 people, 200 fixed seeds retain .52 gap and never cross walls or trigger watchdog', () => {
  const results=[]
  for(const count of [25,37])for(let seed=1;seed<=200;seed++){
    const result=pressure(seed,count);results.push(result)
  }
  console.log('O5_STRESS '+JSON.stringify([25,37].map(count=>{const rows=results.filter(r=>r.count===count);return {count,seeds:rows.length,timeouts:rows.reduce((n,r)=>n+r.timeouts,0),watchdogs:rows.reduce((n,r)=>n+r.watchdogs,0),wallCrossings:rows.reduce((n,r)=>n+r.wallCrossings,0),minGap:Math.min(...rows.map(r=>r.minGap)),longestSteps:Math.max(...rows.map(r=>r.steps))}})))
  const failures=results.filter(r=>r.watchdogs||r.wallCrossings||r.timeouts||!r.complete||r.minGap<PERSON_GAP*.9)
  assert.deepEqual(failures,[])
})

test('O5 200 seeds also cover commute, board, foyer/plaza consumer returns and cat routes', () => {
  globalThis.document??={createElement:()=>({className:'',innerHTML:'',remove(){},querySelector:()=>({textContent:''})})}
  const nav=createOfficeNavigation(LAYOUT_V2), cat=createCatNavigation(LAYOUT_V2,stressWorld.world), names=Object.keys(LAYOUT_V2.seats)
  const summary={seeds:200,commute:0,board:0,foyer:0,plaza:0,cat:0,timeouts:0,watchdogs:0,wallCrossings:0}
  for(let seed=1;seed<=200;seed++) {
    const name=names[seed%names.length],v=actor(name,workHome(LAYOUT_V2.seats[name])),boss=actor('board',{x:-24.5,z:-15.5,yaw:Math.PI});boss.stand=LAYOUT_V2.boss.stand
    const d=createDirector({layout:LAYOUT_V2,views:new Map([[v.id,v]]),board:{board:boss},layer:{appendChild(){}},project:{tmp:new THREE.Vector3(),fn(){}},furnitureCollision:stressWorld.world})
    const pump=()=>{let still=0;for(let step=0;step<3000&&(d.stats().active||d.stats().queued||d.stats().visits);step++){
      const p={x:v.char.group.position.x,z:v.char.group.position.z};d.update(.1);const next=v.char.group.position,moved=Math.hypot(p.x-next.x,p.z-next.z)
      if(v.act?.phase==='walk'&&moved<1e-8)still++;else still=0
      if(still===80)summary.watchdogs++
      if(moved>.001&&moved<1)for(const wall of walls)for(let i=1,n=Math.ceil(moved/.05);i<=n;i++)if(inside({x:p.x+(next.x-p.x)*i/n,z:p.z+(next.z-p.z)*i/n},wall)){summary.wallCrossings++;break}
    }assert.equal(d.stats().active,0,`${seed}/${v.act?.phase}`);assert.equal(d.stats().queued,0);assert.equal(d.stats().visits,0)}
    assert.equal(d.goHome(v),true);pump();assert.equal(d.arrive(v),true);pump();summary.commute++
    d.enqueue({kind:'dispatch',from:v.id,to:'board',text:'x',at:'2026-10-21T00:00:00Z'});pump();summary.board++
    for(const [id,key] of [['A1','foyer'],['B0','plaza']]) {
      const go=nav.consumerTrip(v.home,id),stand=go.at(-1),board=createQueueBoard({queues:{[id]:[stand]}});assert.equal(board.join(v.id,id).ok,true)
      const plan={ok:true,targetId:id,go,stand,back:go.toReversed(),slot:0}
      assert.equal(d.visitConsumer(v,plan,{board,agentId:v.id,dwellMs:200}),true);pump();summary[key]++
      assert.ok(Math.hypot(v.char.group.position.x-v.home.x,v.char.group.position.z-v.home.z)<.01)
    }
    const from=seed%2?{x:2,z:23}:{x:2,z:-17},to={x:LAYOUT_V2.regions[seed%13].doors[0].at,z:seed%13<8?-8:6},route=cat.catRoute(from,to)
    assert.ok(route?.length);audit(from,route,'cat seed '+seed);summary.cat++
    summary.timeouts+=d.stats().timeouts
  }
  console.log('O5_SCENARIOS '+JSON.stringify(summary));assert.equal(summary.timeouts,0);assert.equal(summary.watchdogs,0);assert.equal(summary.wallCrossings,0)
})
