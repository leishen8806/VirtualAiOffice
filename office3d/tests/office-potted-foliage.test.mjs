import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import {createOfficePottedFoliage} from '../office-vis2/plants.js'
import {createFurnitureCollision} from '../furniture-collision.js'
import {officeV3Modules} from '../office-v3-modules.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'

// 只读测试夹具：解码已登记、无图片的固定GLB，不调用下载器或执行资产内容。
function sourceFixture(){
  const b=readFileSync(new URL('../assets/models/furniture/pottedPlant.glb',import.meta.url))
  assert.equal(createHash('sha256').update(b).digest('hex'),'5b760eda2766f75fda36b2c5df652a1662f82981ef64cd8fa7fe7bcd386b3a15')
  const jsonLength=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+jsonLength).toString()),bin=28+jsonLength
  const attr=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],Ctor={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array}[a.componentType];assert.ok(!v.byteStride);return new THREE.BufferAttribute(new Ctor(b.buffer,b.byteOffset+bin+(v.byteOffset||0)+(a.byteOffset||0),a.count*n).slice(),n)}
  const materials=j.materials.map(m=>{const v=new THREE.MeshStandardMaterial();v.name=m.name;return v}),geometries=[]
  const nodes=j.nodes.map(node=>{const group=new THREE.Group();group.name=node.name;if(node.translation)group.position.fromArray(node.translation);if(node.rotation)group.quaternion.fromArray(node.rotation);if(node.scale)group.scale.fromArray(node.scale);if(node.mesh!==undefined)for(const p of j.meshes[node.mesh].primitives){const g=new THREE.BufferGeometry();g.setAttribute('position',attr(p.attributes.POSITION));if(p.attributes.NORMAL!==undefined)g.setAttribute('normal',attr(p.attributes.NORMAL));g.setIndex(attr(p.indices));const a=j.accessors[p.attributes.POSITION];g.boundingBox=new THREE.Box3(new THREE.Vector3().fromArray(a.min),new THREE.Vector3().fromArray(a.max));geometries.push(g);group.add(new THREE.Mesh(g,materials[p.material]))}return group})
  j.nodes.forEach((n,i)=>(n.children||[]).forEach(child=>nodes[i].add(nodes[child])))
  const root=new THREE.Group();for(const n of j.scenes[j.scene||0].nodes)root.add(nodes[n])
  return{root,geometries,materials,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}}
}
const bounds=root=>new THREE.Box3().setFromObject(root)
const placed=source=>{const inner=source.clone(true),box=bounds(inner),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());inner.position.set(-c.x,-box.min.y,-c.z);const root=new THREE.Group();root.add(inner);root.scale.set(.6/size.x,1.3/size.y,.6/size.z);return root}

test('registered plant is refined volumetrically at both tiers without changing any source or actual envelope',()=>{
  const f=sourceFixture(),box=bounds(f.root),before=f.geometries.map(g=>Array.from(g.attributes.position.array));let sharedDisposed=0,leafBounds
  f.root.traverse(m=>{if(m.isMesh&&m.material.name==='plant')leafBounds=m.geometry.boundingBox.clone()})
  f.geometries.forEach(g=>g.addEventListener('dispose',()=>sharedDisposed++))
  try{for(const low of[false,true]){
    const value=createOfficePottedFoliage(THREE,f.root,low),parts=[],resources=[]
    try{
      assert.equal(value.enabled,true);assert.deepEqual(bounds(value.source),box)
      value.source.traverse(m=>{if(m.isMesh&&m.name.startsWith('office-owned-potted-foliage-'))parts.push(m)})
      assert.equal(parts.length,3);let triangles=0
      for(const m of parts){triangles+=m.geometry.attributes.position.count/3;assert.equal(m.material.transparent,false);assert.equal(m.material.map,null);assert.equal(m.material.name,'plant');resources.push(m.geometry,m.material);const n=m.geometry.attributes.normal,p=m.geometry.attributes.position;for(let i=0;i<n.count;i++){
        assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5)
        for(const [axis,get]of[['x','getX'],['y','getY'],['z','getZ']])assert.ok(p[get](i)>=leafBounds.min[axis]-1e-7&&p[get](i)<=leafBounds.max[axis]+1e-7,'actual vertices remain within the original GLTF envelope')
      }}
      assert.equal(triangles,low?336:704)
      assert.ok(parts.every(m=>m.material.side===THREE.DoubleSide))
      const released=new Set();resources.forEach(r=>r.addEventListener('dispose',()=>released.add(r.uuid)))
      value.dispose();value.dispose();assert.equal(released.size,6);assert.equal(sharedDisposed,0)
    }finally{value.dispose()}
  }
  assert.deepEqual(f.geometries.map(g=>Array.from(g.attributes.position.array)),before);assert.deepEqual(bounds(f.root),box)
  }finally{f.dispose()}
})

test('dedicated proxy preserves real cached collision triangles, box and capsule hits through deferred registration',()=>{
  const f=sourceFixture()
  try{for(const low of[false,true]){
    const value=createOfficePottedFoliage(THREE,f.root,low),a=placed(f.root),b=placed(value.source),wa=createFurnitureCollision(),wb=createFurnitureCollision()
    a.position.set(3,0,-4);b.position.copy(a.position)
    const pending=value.collisionProxy(b)
    wa.add(a,'pottedPlant');wb.add(pending,'pottedPlant')
    const ba=wa.hit(3,-4),bb=wb.hit(3,-4);assert.ok(ba&&bb)
    assert.deepEqual(bb.box,ba.box);assert.deepEqual(bb.triangles.map(t=>[t.a.toArray(),t.b.toArray(),t.c.toArray()]),ba.triangles.map(t=>[t.a.toArray(),t.b.toArray(),t.c.toArray()]))
    for(let x=2.4;x<=3.6;x+=.1)for(let z=-4.6;z<=-3.4;z+=.1)assert.equal(!!wa.hit(x,z),!!wb.hit(x,z))
    assert.equal(wa.stats().triangles,wb.stats().triangles);wb.remove(pending);assert.equal(wb.stats().bodies,0)
    value.dispose()
  }}finally{f.dispose()}
})

test('unknown source and partial material failures retain the original asset and release only owned resources',()=>{
  const f=sourceFixture();let leaf
  f.root.traverse(m=>{if(m.isMesh&&m.material.name==='plant')leaf=m})
  try{
    const prior=leaf.geometry,changed=prior.clone();leaf.geometry=changed;changed.setIndex(null)
    const unknown=createOfficePottedFoliage(THREE,f.root);assert.equal(unknown.enabled,false);assert.equal(unknown.source.uuid,f.root.uuid);unknown.dispose();leaf.geometry=prior;changed.dispose()
    let created=0,released=0
    const broken={...THREE,MeshStandardMaterial:class extends THREE.MeshStandardMaterial{constructor(p){if(++created===2)throw Error('fixture material failure');super(p);this.addEventListener('dispose',()=>released++)}}}
    const fail=createOfficePottedFoliage(broken,f.root);assert.equal(fail.enabled,false);assert.equal(fail.source.uuid,f.root.uuid);assert.equal(released,1);assert.equal(bounds(f.root).isEmpty(),false)
  }finally{f.dispose()}
})

test('real ALIGN furniture factory releases all its registrations while preserving another module collider',()=>{
  const f=sourceFixture(),world=createFurnitureCollision(),scene=new THREE.Scene(),root=new THREE.Group(),other=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()),resources=[]
  other.position.set(100,1,100);world.add(other,'other-module');scene.add(root)
  const names=['desk','chairDesk','computerScreen','computerKeyboard','computerMouse','table','chairModernCushion','bookcaseOpen','books'],furn={pottedPlant:f.root}
  for(const name of names){const g=new THREE.BoxGeometry(1,1,1);g.translate(0,.5,0);const m=new THREE.MeshStandardMaterial({name:'wood'}),group=new THREE.Group();group.add(new THREE.Mesh(g,m));furn[name]=group;resources.push(g,m)}
  const context=()=>new Proxy({canvas:{width:256,height:144},measureText:t=>({width:String(t).length*8})},{get:(o,k)=>k in o?o[k]:()=>{}})
  const canvasTex=(w,h,draw)=>{const c=context();draw(c,w,h);return new THREE.CanvasTexture({width:w,height:h,getContext:()=>c})}
  const placeFurniture=(A,name,x,z,{y=0,rotY=0})=>{const inner=A.furn[name].clone(true),box=bounds(inner),size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());inner.position.set(-c.x,-box.min.y,-c.z);const group=new THREE.Group();group.add(inner);group.position.set(x,y,z);group.rotation.y=rotY;return{group,size}}
  const factory=officeV3Modules.find(([id])=>id==='furniture3')[1]
  try{for(const low of[false,true]){
    const before=world.stats(),value=factory({THREE,root,scene,layout,low,search:'?officeSample=1',A:{furn},placeFurniture,collision:world,canvasTex,makeScreenTexture:()=>({ctx:context(),tex:new THREE.Texture()})})
    assert.ok(world.stats().bodies>before.bodies+25)
    assert.equal(value.plantPlacements.length,5)
    const moved=value.plantPlacements.filter(p=>p.z!==p.fromZ)
    assert.equal(moved.length,3)
    for(const p of moved){assert.equal(p.fromZ,11.8);assert.equal(p.z,11.4);assert.ok(p.z+.3<=layout.envelope.z1-.15)}
    for(const p of value.plantPlacements.filter(p=>p.z===p.fromZ))assert.equal(p.z,-16.8)
    value.dispose();value.dispose();assert.equal(world.stats().bodies,before.bodies);assert.equal(world.stats().triangles,before.triangles);assert.equal(root.children.length,0)
    assert.equal(world.hit(100,100).kind,'other-module')
  }}finally{world.remove(other);other.geometry.dispose();other.material.dispose();f.dispose();resources.forEach(r=>r.dispose())}
})
