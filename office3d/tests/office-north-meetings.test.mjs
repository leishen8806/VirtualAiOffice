import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import previous from './fixtures/office-align-2309988.json' with {type:'json'}
import {LAYOUT_V3_ALIGN as layout,createOfficeNavigation,workHome} from '../office-layout.js'
import {officeFurnitureV2Spec} from '../office-furniture-v2.js'
import {officeV3Modules} from '../office-v3-modules.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {alignZoneObstaclePlan} from '../office-vis2/align-zones.js'
import {createFurnitureCollision} from '../furniture-collision.js'

// 读取已登记的静态 GLB 几何，不使用网络加载器、图片解码或执行包内文件。
function models(){
  const names=['desk','chairDesk','computerScreen','computerKeyboard','computerMouse','table','chairModernCushion','bookcaseOpen','books','pottedPlant'],geometries=[],materials=[]
  const furn=Object.fromEntries(names.map(name=>{
    const b=readFileSync(new URL(`../assets/models/furniture/${name}.glb`,import.meta.url)),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length)),bin=28+length
    const attr=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],Ctor={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array}[a.componentType];assert.ok(!v.byteStride);return new THREE.BufferAttribute(new Ctor(b.buffer,b.byteOffset+bin+(v.byteOffset||0)+(a.byteOffset||0),a.count*n).slice(),n)}
    const mats=j.materials.map(m=>{const material=new THREE.MeshStandardMaterial();material.name=m.name;materials.push(material);return material})
    const nodes=j.nodes.map(n=>{const group=new THREE.Group();if(n.translation)group.position.fromArray(n.translation);if(n.rotation)group.quaternion.fromArray(n.rotation);if(n.scale)group.scale.fromArray(n.scale);if(n.mesh!==undefined)for(const p of j.meshes[n.mesh].primitives){const g=new THREE.BufferGeometry();for(const[key,value]of Object.entries(p.attributes)){const target={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[key];if(target)g.setAttribute(target,attr(value))}if(p.indices!==undefined)g.setIndex(attr(p.indices));g.computeBoundingBox();geometries.push(g);group.add(new THREE.Mesh(g,mats[p.material]))}return group})
    j.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>nodes[i].add(nodes[c])));const root=new THREE.Group();for(const n of j.scenes[j.scene||0].nodes)root.add(nodes[n]);return[name,root]
  }))
  return{furn,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
function placeFurniture(A,name,x,z,{y=0,rotY=0,scale=1}){
  const inner=A.furn[name].clone(true),box=new THREE.Box3().setFromObject(inner),c=box.getCenter(new THREE.Vector3());inner.position.set(-c.x,-box.min.y,-c.z)
  const group=new THREE.Group();group.add(inner);group.scale.setScalar(scale);group.position.set(x,y,z);group.rotation.y=rotY;return{group,size:box.getSize(new THREE.Vector3()).multiplyScalar(scale)}
}
const ctx=()=>({canvas:{},fillRect(){},fillText(){},drawImage(){}})

test('north-room correction retains all business identities and real desk coordinates, four corners and full ring',()=>{
  assert.deepEqual(layout.seats,previous.seats);assert.deepEqual(layout.displaySeats,previous.displaySeats)
  assert.equal(Object.keys(layout.seats).length,25);assert.equal(layout.displaySeats.length,12)
  assert.deepEqual(layout.meetingSeats,{A:8,B:6});assert.equal(layout.rooms.length,7)
  for(const[id,b]of Object.entries({board:[-20,-10,-18,-12],review:[-10,-5,-18,-13],plan:[-5,0,-18,-13]})){
    const r=layout.regions.find(r=>r.id===id);assert.deepEqual([r.x0,r.x1,r.z0,r.z1],b)
  }
  assert.deepEqual(layout.island.center,{x:2,z:-3});assert.deepEqual(layout.bar.center,layout.island.center);assert.deepEqual(layout.ring.center,layout.island.center)
  assert.equal(layout.ring.width,4);assert.equal(layout.island.diameter,12);assert.equal(layout.bar.radius,6)
  for(const r of layout.rooms){const c=layout.ring.center;assert.ok(Math.hypot(Math.max(r.x0-c.x,0,c.x-r.x1),Math.max(r.z0-c.z,0,c.z-r.z1))>=10)}
  const nook=alignZoneObstaclePlan(layout).find(e=>e.id==='north-nook');assert.equal(nook.plan.groups.length,2)
  for(const p of nook.plan.placements){assert.ok(p.bounds.z0>=-12&&p.bounds.z1<=-4.5&&p.bounds.x0>=-28&&p.bounds.x1<=-8.5,'decorative seats use the released west area');for(const r of layout.rooms)assert.ok(p.bounds.x1<=r.x0||p.bounds.x0>=r.x1||p.bounds.z1<=r.z0||p.bounds.z0>=r.z1,'no duplicates inside meeting rooms')}
  for(const id of ['market','service','aftersales','marketing'])assert.deepEqual(layout.regions.find(r=>r.id===id).walled,true)
})

test('rendered meeting seats and routing targets share exact coordinates, yaw and capacity',()=>{
  const spec=officeFurnitureV2Spec(layout)
  for(const room of spec.meetings){
    assert.equal(room.round,true);assert.equal(room.w,1.5);assert.equal(room.d,1.5)
    assert.deepEqual(room.seats,layout.meetingSeatPoints[room.id]);assert.equal(room.seats.length,layout.meetingSeats[room.id])
    for(const s of room.seats){assert.ok(Math.abs(s.x*10-Math.round(s.x*10))<1e-8);assert.ok(Math.abs(s.z*10-Math.round(s.z*10))<1e-8)}
  }
})

test('actual registered GLB furniture clears fourteen meeting and twenty-five board-arrival routes at both quality tiers',()=>{
  const A=models()
  try{for(const low of[false,true]){
    const root=new THREE.Group(),scene=new THREE.Scene(),world=createFurnitureCollision();scene.add(root)
    const shell=buildOfficeAlignedShell({THREE,root,scene,layout,low,search:'?officeSample=1',collision:world})
    const factory=officeV3Modules.find(([id])=>id==='furniture3')[1]
    const furniture=factory({THREE,root,scene,A,layout,low,search:'?officeSample=1',collision:world,placeFurniture,canvasTex:()=>({image:{getContext:ctx},dispose(){}}),makeScreenTexture:()=>({ctx:ctx(),tex:{dispose(){}}})})
    try{
      const nav=createOfficeNavigation(layout),home=workHome(layout.seats.Lead)
      assert.equal(furniture.wing.seats.length,14)
      for(const seat of furniture.wing.seats){
        const target=world.seatBody(seat);assert.ok(target,`actual chair for ${seat.room}/${seat.x}/${seat.z}`)
        const room=layout.regions.find(r=>r.id===(seat.room==='A'?'review':'plan')),route=nav.meetingTrip(home,seat)
        for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025));for(let j=1;j<=n;j++){
          const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n
          if(x<room.x0||x>room.x1||z<room.z0||z>room.z1)continue
          const hit=world.hit(x,z,target);assert.equal(hit?.kind??null,null,`${seat.room} route hits ${hit?.kind} at ${x},${z}`)
        }}
      }
      const boardRoom=layout.regions.find(r=>r.id==='board')
      for(const seat of furniture.spec.boardSeats){
        const body=world.seatBody(seat);assert.ok(body,'real board chair')
        const b=new THREE.Box3().setFromObject(body)
        assert.ok(b.min.x>=boardRoom.x0+.28&&b.max.x<=boardRoom.x1-.28&&b.min.z>=boardRoom.z0+.28&&b.max.z<=boardRoom.z1-.28,'board chairs do not intersect walls')
      }
      for(const home of Object.values(layout.seats).map(workHome)){
        const route=nav.boardTrip(home,layout.boss.stand)
        for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025));for(let j=1;j<=n;j++){
          const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n
          if(x<boardRoom.x0||x>boardRoom.x1||z<boardRoom.z0||z>boardRoom.z1)continue
          const hit=world.hit(x,z);assert.equal(hit?.kind??null,null,`board approach hits ${hit?.kind} at ${x},${z}`)
        }}
      }
    }finally{furniture.dispose();shell.dispose()}
    assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
  }}finally{A.dispose()}
})
