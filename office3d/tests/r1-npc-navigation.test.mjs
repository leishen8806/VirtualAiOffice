import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Plaza } from '../office-vis2/r1-plaza.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { r1NpcStations, createR1Npcs } from '../office-r1-npc.js'
import { createR1Navigation } from '../office-r1-navigation.js'

test('vendors occupy the empty operator aisle, with the real counter, cabinet and posts still blocking', () => {
  const layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  const plaza = buildR1Plaza({ THREE, root: new THREE.Group(), layout, collision })
  for (const s of r1NpcStations(layout.r1).filter(s => s.post === 'plaza-kiosk' && s.anchor !== '14-KS-001')) {
    const row = layout.r1.elements.find(e => e.id === s.anchor)
    const yaw = Math.atan2(-row.facingLocal[0], row.facingLocal[1]), dx = s.x - (row.xM - 26), dz = s.z - (18 - row.yM)
    const local = { x: dx * Math.cos(yaw) - dz * Math.sin(yaw), z: dx * Math.sin(yaw) + dz * Math.cos(yaw) }
    assert.ok(Math.abs(local.x) < .8 && local.z >= 0 && local.z <= .3, `${s.id}: ${JSON.stringify(local)}`)
    assert.equal(collision.navigationHit(s.x, s.z, .3), null, s.id)
    for (const [x,z] of [[0,-.8],[0,.9],[-1.15,-1.15],[1.15,1.15]]) {
      assert.ok(collision.navigationHit(row.xM-26+x*Math.cos(yaw)+z*Math.sin(yaw),18-row.yM-x*Math.sin(yaw)+z*Math.cos(yaw),.3), `${s.id} obstacle ${x},${z}`)
    }
  }
  plaza.dispose()
})

const person = () => ({group:new THREE.Group(),pose:{seed:.4,sit:0,walk:0,phase:0,yaw:0,talk:0},solve(){}})
test('guard follows navigation detours and stops for a newly blocked segment; yaw and displacement are continuous', () => {
  const layout = createOfficeR1Layout(), collision = createFurnitureCollision(), navCalls=[]
  let blocked=false
  const navigation={prepared:()=>true,plan(a,b){navCalls.push([a,b]);return [a,{x:a.x+2,z:a.z}, {x:a.x+2,z:b.z},b]},clear(){return !blocked},query(){return null}}
  const npcs=createR1Npcs({THREE,scene:new THREE.Scene(),layout:layout.r1,createPerson:person,collision,navigation,document:null})
  const m=npcs.members.find(m=>m.station.post==='security'), start=m.char.group.position.clone()
  let distance=0
  for(let i=0;i<2400;i++){
    const prev=m.char.group.position.clone(),yaw=m.char.group.rotation.y
    npcs.update(1/30,i/30)
    const moved=prev.distanceTo(m.char.group.position);distance+=moved
    assert.ok(moved<=.5/30+1e-6,'no teleport')
    assert.ok(Math.abs(Math.atan2(Math.sin(m.char.group.rotation.y-yaw),Math.cos(m.char.group.rotation.y-yaw)))<=Math.PI/2/30+1e-6,'no snapped turn')
    if(i===1200)blocked=true
    if(i>1200)assert.equal(moved,0,'closed passage stops guard')
  }
  assert.ok(navCalls.length>0,'must actually call navigation')
  assert.ok(distance>1 && start.distanceTo(m.char.group.position)>0,'must patrol, not just remain still')
})

test('guard completes patrols around real wall and planter meshes without a single capsule overlap', async () => {
  const layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  for (const [id,x,z,w,d] of [['wall',8.4,16.8,.2,2],['planter',9.4,14.9,.8,.8]]) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,1,d));mesh.position.set(x,.5,z);mesh.userData.r1Id=id;collision.add(mesh,id)
  }
  const navigation=createR1Navigation({site:{x0:4,x1:13,z0:11,z1:22},regions:[],seats:{},r1:{workstations:[],elements:[]}}).attach(collision)
  await navigation.prepare()
  const npcs=createR1Npcs({THREE,scene:new THREE.Scene(),layout:layout.r1,createPerson:person,collision,navigation,document:null})
  const m=npcs.members.find(m=>m.station.post==='security')
  let detour=false
  for(let i=0;i<5400;i++) {
    npcs.update(1/30,i/30)
    const p=m.char.group.position
    assert.equal(collision.navigationHit(p.x,p.z,.6),null,`frame ${i}`)
    if(m.walker.path.length>1)detour=true
  }
  assert.ok(detour,'real geometry must produce a detour')
  assert.ok(m.walker.arrivals>=3,`completed patrol legs: ${m.walker.arrivals}`)
})
