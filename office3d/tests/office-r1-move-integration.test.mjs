import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { R1_LANDSCAPE } from '../office-vis2/r1-landscape-plan.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_PUBLIC_TRANSITIONS } from '../office-r1-navigation.js'

test('LOOK R3 freezes the regrouped plant plan while retaining the MOVE stool and local path', () => {
  const plan = structuredClone(R1_LANDSCAPE), plant = plan.plants.find(p => p.id === 'DENSE-CORE-3')
  assert.deepEqual([plant.x, plant.z], [6.54, -6.9])
  const layout = createOfficeR1Layout(), zone = layout.regions.find(r => r.id === '07')
  assert.ok(plant.x - plant.r >= zone.x0 && plant.x + plant.r <= zone.x1)
  assert.ok(plant.z - plant.r >= zone.z0 && plant.z + plant.r <= zone.z1)
  assert.equal(createHash('sha256').update(JSON.stringify(plan)).digest('hex'), '6ed84c4ce7d42df865c7e3b4404d014f06e0e127f94676c0fbef541887831b22')
  const seat = layout.r1.elements.find(e => e.id === '07-CH-014')
  assert.deepEqual([seat.xM, seat.yM], [23.9, 22.1])
  const path = R1_PUBLIC_TRANSITIONS[seat.id]
  assert.deepEqual(path[0], {x: -2.1, z: -4.1})
  assert.ok(path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-path[i].x,p.z-path[i].z),0) <= 3.5)
})

import * as THREE from '../vendor/three/three.module.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { createR1Director } from '../office-r1-director.js'
import { R1_SEAT_TRANSITIONS } from '../office-r1-navigation.js'

test('R8 Architect traverses the frozen body corridor in both directions and restores the chair', async () => {
  const home = {x:6.03,z:-17.8,yaw:-Math.PI/2}, c=createFurnitureCollision()
  const layout={site:{x0:2,x1:10,z0:-23,z1:-14},regions:[],seats:{Architect:['04',6.84,-17.8,0,home]},r1:{workstations:[{business_id:'Architect',chair_id:'04-CH-003',desk_id:'04-T-003'}],elements:[]}}
  function box(id,x,z,w,d,h=1){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));mesh.position.set(x,h/2,z);mesh.userData.r1Id=id;c.add(mesh,'fixture');return mesh}
  box('04-T-003',6.84,-17.8,.7,1.4,.75)
  const chair=box('04-CH-003',6.03,-17.8,.4,.4)
  box('04-CH-004',6.03,-19.2,.4,.4)
  box('TROUGH-9',4.52,-17.4,.3,2.4,.35)
  box('04-DC-BIN-001',6,-16.6,.415386974,.468248486,.855732)
  let motion={dx:0,dz:0,yaw:0}
  const furniture={chairFacings:new Map(),chairMotion:()=>motion,moveChair(id,dx,dz,yaw){const changed=dx!==motion.dx||dz!==motion.dz||yaw!==motion.yaw;motion={dx,dz,yaw};c.poseNavigationBody(chair,home,dx,dz,yaw);return changed}}
  const v={name:'Architect',home,char:{group:new THREE.Group(),pose:{sit:1,phase:0}}}
  const director=createR1Director({views:new Map([['Architect',v]]),layout,furnitureCollision:c,r1Furniture:furniture,r1Doors:{records:[]}});await director.ready
  let arrived=false,returned=false,sawLocal=false,sawReturn=false,repositioned=false,nextRequested=false,previous={...home}
  director.visitConsumer(v,{ok:true,stand:{x:5.6,z:-21.5}},{onArrive(){arrived=true}})
  for(let i=0;i<9000&&!returned;i++){
    director.update(1/30)
    const phase=v.act?.phase,pos=v.r1Position||home
    assert.ok(Math.hypot(pos.x-previous.x,pos.z-previous.z)<=.051,'standing departure must not teleport back to the workstation');previous={...pos}
    if(['workstation-local','return-workstation-local'].includes(phase)){
      sawLocal ||= phase==='workstation-local';sawReturn ||= phase==='return-workstation-local'
      assert.equal(director.navigation.query(pos,'Architect',.25),null)
      assert.equal(c.navigationHit(pos.x,pos.z,.24,null,[director.navigation.bodyFor('04-CH-003')]),null)
    }
    if(phase==='walk')assert.equal(director.navigation.query(pos,'Architect'),null)
    if(arrived&&!nextRequested){nextRequested=true;director.visitConsumer(v,{ok:true,stand:{x:8,z:-21.5}},{onArrive(){repositioned=true}})}
    if(repositioned&&!v.act&&!returned)director.travel(v,[],home,false,()=>{returned=true})
  }
  assert.ok(arrived&&returned&&sawLocal&&sawReturn)
  assert.deepEqual(director.navigation.loungeTrip(home,{x:5.6,z:-21.5})[0],director.navigation.parameters.get('Architect').walkPoint)
  assert.ok(Object.values(motion).every(value => value === 0))
  assert.deepEqual([R1_SEAT_TRANSITIONS.Backend1.distance,R1_SEAT_TRANSITIONS.Backend1.degrees],[.67,50])
  assert.deepEqual([R1_SEAT_TRANSITIONS.Backend2.distance,R1_SEAT_TRANSITIONS.Backend2.degrees],[.67,-50])
})


test('R1 opposing walkers back out of an aisle with no passing width, without overlapping', async () => {
  const c=createFurnitureCollision(),layout={site:{x0:-6,x1:6,z0:-5,z1:5},regions:[],seats:{},r1:{workstations:[],elements:[]}},views=new Map(),chairs=new Map(),motions=new Map()
  function box(id,x,z,w,d){const m=new THREE.Mesh(new THREE.BoxGeometry(w,1,d));m.position.set(x,.5,z);m.userData.r1Id=id;c.add(m,'fixture');return m}
  box('upper',0,.75,4,.2);box('lower',0,-.75,4,.2)
  for(const [name,x,z,startX]of [['A',-4,3,-1],['B',4,-3,1]]){
    const home={x,z,yaw:0};layout.seats[name]=['test',x,z-.81,0,home];layout.r1.workstations.push({business_id:name,chair_id:name+'-chair',desk_id:name+'-desk'})
    box(name+'-desk',x,z-.81,1.4,.7);chairs.set(name+'-chair',{mesh:box(name+'-chair',x,z,.4,.4),home});motions.set(name+'-chair',{dx:0,dz:0,yaw:0})
    views.set(name,{name,home,r1Position:{x:startX,z:0},r1AwayFromDesk:true,r1Standing:true,char:{group:new THREE.Group(),pose:{sit:0,phase:0}}})
  }
  const f={chairFacings:new Map(),chairMotion:id=>motions.get(id),moveChair(id,dx,dz,yaw){const old=motions.get(id),{mesh,home}=chairs.get(id);motions.set(id,{dx,dz,yaw});c.poseNavigationBody(mesh,home,dx,dz,yaw);return old.dx!==dx||old.dz!==dz||old.yaw!==yaw}}
  const d=createR1Director({views,layout,furnitureCollision:c,r1Furniture:f,r1Doors:{records:[]}});await d.ready
  const done=new Set();for(const [name,v]of views)d.visitConsumer(v,{ok:true,stand:{x:name==='A'?3:-3,z:0}},{onArrive(){done.add(name)}})
  for(let frame=0;frame<1800&&done.size<2;frame++){
    d.update(1/30);const [a,b]=[...views.values()].map(v=>v.r1Position||v.home)
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.5-1e-7)
    for(const v of views.values())if(v.act?.phase==='walk')assert.equal(d.navigation.query(v.r1Position,v.name),null)
  }
  assert.equal(done.size,2)
  const [a,b]=[...views.values()],first=R1_PUBLIC_TRANSITIONS['07-CH-013'][0],second=R1_PUBLIC_TRANSITIONS['07-CH-014'][0]
  assert.equal(d.travel(a,[],{...first,id:'07-CH-013'},true),true)
  assert.equal(d.travel(b,[],{...second,id:'07-CH-014'},true),false,'a neighbour cannot reserve a seat across the occupied local corridor')
})

for (const fixture of [
  {label:'same row',zone:'06',site:{x0:-27,x1:-18,z0:-1,z1:10},gate:{x:-20,z:8},people:[['Reviewer1',-22.76,5.4,-Math.PI/2],['SecurityReviewer',-22.76,2.6,-Math.PI/2]]},
  {label:'opposing rows',zone:'04',site:{x0:8,x1:18,z0:-23,z1:-14},gate:{x:16,z:-15},people:[['BackendSenior',10.57,-19.2,-Math.PI/2],['FrontendSenior',12.89,-17.8,Math.PI/2]]},
]) test(`${fixture.label} returns keep an open chair from sealing the earlier return path`, async () => {
  const l = {site:fixture.site, regions:[],seats:{},r1:{workstations:[],elements:[]}}
  const c = createFurnitureCollision(), views = new Map(), chairs = new Map(), motions = new Map()
  function box(c,id,x,z,w,d){const m=new THREE.Mesh(new THREE.BoxGeometry(w,1,d));m.position.set(x,.5,z);m.userData.r1Id=id;c.add(m,'fixture');return m}
  for (const [name, x, z, yaw] of fixture.people) {
    const home = { x, z, yaw }, deskX = x - Math.sin(yaw) * .81
    l.seats[name] = [fixture.zone, deskX, z, 0, home]
    l.r1.workstations.push({ business_id: name, desk_id: name + '-desk', chair_id: name + '-chair' })
    box(c, name + '-desk', deskX, z, .7, 1.4)
    chairs.set(name + '-chair', { mesh: box(c, name + '-chair', home.x, z, .4, .4), home })
    motions.set(name + '-chair', { dx: 0, dz: 0, yaw: 0 })
    const group = new THREE.Group(); group.visible = false
    views.set(name, { name, home, away: true, r1AwayFromDesk: true, char: { group, pose: { sit: 0, phase: 0 } } })
  }
  const furniture = { chairFacings: new Map(), chairMotion: id => motions.get(id), moveChair(id, dx, dz, yaw) {
    const before = motions.get(id), changed = before.dx !== dx || before.dz !== dz || before.yaw !== yaw
    motions.set(id, { dx, dz, yaw }); const { mesh, home } = chairs.get(id); c.poseNavigationBody(mesh, home, dx, dz, yaw); return changed
  } }
  const d = createR1Director({ views, layout: l, furnitureCollision: c, r1Furniture: furniture, r1Doors: { records: [] } }); await d.ready
  d.navigation.ENTRANCE.gate[1] = fixture.gate
  for (const v of views.values()) d.arrive(v)
  let bothActive = false
  for (let frame = 0; frame < 9000 && [...views.values()].some(v => v.away || v.act); frame++) {
    d.update(1 / 30)
    bothActive ||= [...views.values()].every(v => !v.away && v.act?.phase !== 'queued' && v.act)
  }
  assert.equal(bothActive, false)
  assert.ok([...views.values()].every(v => !v.away && !v.act && !v.r1AwayFromDesk))
  assert.equal(d.history.length, 2)
  for (const motion of motions.values()) assert.ok(Object.values(motion).every(value => value === 0))
})

