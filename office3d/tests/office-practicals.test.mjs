import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {officePracticalSpec,wholeFloorSpec} from '../office-vis2/whole-floor.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {createFurnitureCollision} from '../furniture-collision.js'

test('warm practicals derive from seven enclosed rooms, connect to real ceiling bands and clear standing volume',()=>{
  const before=JSON.stringify(layout),spec=officePracticalSpec(layout)
  assert.deepEqual(spec,officePracticalSpec(layout));assert.equal(spec.globes.length,11)
  assert.deepEqual(officePracticalSpec(LAYOUT_V3),{supports:[],globes:[]})
  assert.equal(new Set(spec.globes.map(p=>p.owner)).size,7)
  for(const room of layout.regions.filter(r=>r.walled)){
    const beam=spec.supports.find(p=>p.owner===room.id&&p.kind==='pendant-beam')
    assert.ok(beam)
    if(beam.w>beam.d){assert.ok(Math.abs(beam.x-beam.w/2-room.x0-.12)<1e-6);assert.ok(Math.abs(beam.x+beam.w/2-room.x1+.12)<1e-6)}
    else {assert.ok(Math.abs(beam.z-beam.d/2-room.z0-.12)<1e-6);assert.ok(Math.abs(beam.z+beam.d/2-room.z1+.12)<1e-6)}
    for(const g of spec.globes.filter(p=>p.owner===room.id)){
      assert.ok(g.x-g.radius>room.x0+.2&&g.x+g.radius<room.x1-.2)
      assert.ok(g.z-g.radius>room.z0+.2&&g.z+g.radius<room.z1-.2)
      assert.ok(g.y-g.radius>=2.15)
      const parts=spec.supports.filter(p=>p.owner===room.id&&p.x===g.x&&p.z===g.z)
      const cord=parts.find(p=>p.kind==='pendant-cord'),cap=parts.find(p=>p.kind==='pendant-canopy'),socket=parts.find(p=>p.kind==='pendant-socket')
      assert.ok(cord.y+cord.h/2>=cap.y-cap.h/2)
      assert.ok(cap.y+cap.h/2>=beam.y-beam.h/2)
      assert.ok(cord.y-cord.h/2<=socket.y+socket.h/2)
      assert.ok(socket.y-socket.h/2<g.y+g.radius)
    }
  }
  const details=wholeFloorSpec(layout).details
  assert.equal(details.filter(p=>p.kind.startsWith('pendant-')).length,40)
  assert.equal(JSON.stringify(layout),before);assert.equal(Object.keys(layout.seats).length,25);assert.equal(layout.displaySeats.length,12)
})

test('actual warm diffusers are one owned batch at both tiers, with no new lights, textures or collision changes',()=>{
  for(const low of[false,true]){
    const scene=new THREE.Scene(),root=new THREE.Group(),environment=new THREE.Texture(),world=createFurnitureCollision()
    const light=new THREE.AmbientLight('#ffffff',.2);scene.add(light,root);scene.environment=environment
    const shell=buildOfficeAlignedShell({THREE,scene,root,layout,low,search:'?officeSample=1',collision:world}),released=new Set()
    try{
      const meshes=[];root.traverse(m=>{if(m.name==='office-warm-practical-diffusers')meshes.push(m)})
      assert.equal(meshes.length,1);const mesh=meshes[0],g=mesh.geometry,m=mesh.material
      assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false)
      assert.equal(mesh.userData.dynamic,true)
      assert.ok(m.emissive.r>m.emissive.b&&m.emissiveIntensity===.45)
      assert.equal(m.map,null);assert.equal(m.emissiveMap,null)
      assert.equal(scene.environment.uuid,environment.uuid)
      const lights=[];scene.traverse(o=>{if(o.isLight)lights.push(o.uuid)});assert.deepEqual(lights,[light.uuid])
      const globes=officePracticalSpec(layout).globes,strips=shell.finishSpec.solid.filter(p=>p.kind==='light-recess')
      assert.equal(g.attributes.position.count/3,globes.length*(low?80:168)+strips.length*12)
      const p=g.attributes.position,vertices=(low?80:168)*3
      for(const [index,globe]of globes.entries())for(let i=index*vertices;i<(index+1)*vertices;i++){
        assert.ok(Math.hypot(p.getX(i)-globe.x,p.getY(i)-globe.y,p.getZ(i)-globe.z)<=globe.radius+2e-6)
        assert.ok(p.getY(i)>2.15)
      }
      for(const r of[g,m])r.addEventListener('dispose',()=>released.add(r.uuid))
    }finally{shell.dispose();shell.dispose();environment.dispose()}
    assert.equal(released.size,2);assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
  }
})

test('closed, damaged and legacy sample paths retain the original non-luminous shell',()=>{
  for(const current of[layout,LAYOUT_V3])for(const search of['','?officeSample=0','?officeSample=broken','?officeSample=1&officeSample=1']){
    const root=new THREE.Group(),shell=buildOfficeAlignedShell({THREE,root,layout:current,low:false,search})
    try{assert.equal(root.getObjectByName('office-warm-practical-diffusers'),undefined)}finally{shell.dispose()}
    assert.equal(root.children.length,0)
  }
})
