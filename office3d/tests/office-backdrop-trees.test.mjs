import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {officeBackdropCanopy,buildOfficeBackdropTrees} from '../office-vis2/plants.js'
import {selectEnvironmentConflicts} from '../office-v3-modules.js'

function fixture(){
  const scene=new THREE.Scene(),root=new THREE.Group(),geometry=new THREE.IcosahedronGeometry(1,1)
  scene.add(root)
  const sources=[0x4f8a3c,0x5d9a44,0x3f7a39,0x6aa04f].map((color,m)=>{
    const im=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color}),2)
    im.userData={dynamic:true,list:[{m,x:m*4,y:3,z:-25,r:1.5,ph:.1},{m,x:m*4,y:3,z:-38,r:2,ph:.2}]};scene.add(im);return im
  })
  const writeWind=(shift=0)=>{for(const im of sources){im.userData.list.forEach((c,i)=>im.setMatrixAt(i,new THREE.Matrix4().makeScale(c.r,c.r,c.r).setPosition(c.x+shift,c.y,c.z)));im.instanceMatrix.needsUpdate=true}}
  writeWind()
  return{scene,root,geometry,sources,writeWind,dispose(){geometry.dispose();sources.forEach(m=>{m.material.dispose();m.dispose()})}}
}

test('three-dimensional leaf canopy is deterministic, finite, two-sided by material and bounded at both LODs',()=>{
  for(const low of[false,true]){
    const a=officeBackdropCanopy(THREE,low),b=officeBackdropCanopy(THREE,low)
    try{
      assert.equal(a.attributes.position.count/3,low?192:768)
      const hash=g=>createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).digest('hex')
      assert.equal(hash(a),hash(b))
      const p=a.attributes.position,n=a.attributes.normal,size=a.boundingBox.getSize(new THREE.Vector3())
      assert.ok(size.x>1.2&&size.y>1.2&&size.z>1.2,'volumetric canopy, not a whole-tree plane')
      for(let i=0;i<p.count;i++){
        assert.ok(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))<=.980001)
        assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5)
      }
      assert.equal(a.attributes.uv,undefined,'actual leaf silhouettes, no alpha billboard atlas')
    }finally{a.dispose();b.dispose()}
  }
})

test('owned canopy follows existing wind once per matrix version and restores latest near/far shared transforms',()=>{
  const f=fixture(),before=f.sources.map(m=>m.material),shared=f.geometry;let sharedReleased=0
  shared.addEventListener('dispose',()=>sharedReleased++)
  f.root.position.set(3,0,4)
  const value=buildOfficeBackdropTrees({...f,THREE,layout}),matrix=new THREE.Matrix4()
  try{
    assert.equal(value.summary().enabled,true);assert.equal(value.summary().clusters,8);assert.equal(value.summary().calls,1)
    assert.equal(f.root.children.length,1);assert.equal(value.root.children.length,1)
    assert.equal(value.root.children[0].material.color.getHex(),0xffffff)
    assert.equal(new Set(Array.from({length:4},(_,i)=>{const c=new THREE.Color();value.root.children[0].getColorAt(i*2,c);return c.getHex()})).size,4)
    for(const [i,source]of f.sources.entries()){
      assert.equal(source.material.uuid,before[i].uuid);assert.equal(source.geometry.uuid,shared.uuid);assert.equal(source.userData.qualityProxy,undefined)
      source.getMatrixAt(1,matrix);assert.equal(matrix.elements[14],-38);assert.ok(Math.abs(matrix.elements[0])<1e-5)
      const child=value.root.children[0];child.getMatrixAt(i*2,matrix)
      assert.equal(matrix.elements[12],i*4-3);assert.equal(matrix.elements[14],-29)
      child.getMatrixAt(i*2+1,matrix);assert.equal(matrix.elements[14],-42);assert.equal(matrix.elements[0],2)
      assert.equal(child.material.side,THREE.DoubleSide)
    }
    const replacement=Array.from(value.root.children[0].instanceMatrix.array),version=f.sources[0].instanceMatrix.version
    value.sync();assert.deepEqual(Array.from(value.root.children[0].instanceMatrix.array),replacement)
    assert.equal(f.sources[0].instanceMatrix.version,version,'second scene pass cannot remask/copy the tiny matrix')
    f.writeWind(.125);value.sync();value.root.children[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[12],-2.875)
    f.root.visible=false;f.writeWind(.25)
    f.sources[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[0],1.5,'hidden office: existing wind writer restores original crown')
    f.root.visible=true;value.sync();value.dispose();value.dispose()
    f.sources[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[12],.25);assert.equal(matrix.elements[0],1.5)
    assert.equal(f.root.children.length,0);assert.equal(sharedReleased,0)
  }finally{value.dispose();f.dispose()}
})

test('quality changes reuse at most two owned canopy geometries and release only owned resources',()=>{
  const f=fixture(),quality={tier:'high'},value=buildOfficeBackdropTrees({...f,THREE,layout,quality}),geometries=new Set(),materials=new Set(),released=new Set()
  try{
    for(const tier of['high','low','high','low','high']){
      quality.tier=tier;f.writeWind(.1);value.sync()
      for(const mesh of value.root.children){
        geometries.add(mesh.geometry);materials.add(mesh.material)
        assert.equal(mesh.material.type,tier==='low'?'MeshLambertMaterial':'MeshStandardMaterial')
        assert.equal(mesh.geometry.attributes.position.count/3,tier==='low'?192:768)
        assert.equal(mesh.userData.qualityProxy,true)
      }
    }
    assert.equal(geometries.size,2);assert.equal(materials.size,2)
    for(const r of[...geometries,...materials])r.addEventListener('dispose',()=>released.add(r.uuid))
    value.dispose();value.dispose();assert.equal(released.size,4);assert.equal(f.root.children.length,0)
    const reopened=buildOfficeBackdropTrees({...f,THREE,layout,quality});assert.equal(reopened.summary().enabled,true);reopened.dispose()
  }finally{value.dispose();f.dispose()}
})

test('unknown/malformed/duplicate source cohorts fail closed without mutating shared geometry or transforms',()=>{
  const f=fixture(),first=buildOfficeBackdropTrees({...f,THREE,layout}),masked=Array.from(f.sources[0].instanceMatrix.array)
  try{
    const duplicate=buildOfficeBackdropTrees({...f,THREE,layout})
    assert.equal(duplicate.summary().enabled,false);assert.equal(f.root.children.length,1);duplicate.dispose()
    assert.deepEqual(Array.from(f.sources[0].instanceMatrix.array),masked)
    first.dispose();f.sources[0].userData.list[0].ph=NaN
    const before=Array.from(f.sources[0].instanceMatrix.array),invalid=buildOfficeBackdropTrees({...f,THREE,layout})
    assert.equal(invalid.summary().enabled,false);assert.equal(f.root.children.length,0);invalid.dispose()
    assert.deepEqual(Array.from(f.sources[0].instanceMatrix.array),before)
  }finally{first.dispose();f.dispose()}
})

test('partial material allocation failure restores originals and releases partially constructed owned assets',()=>{
  const f=fixture();let released=0
  const broken={...THREE,InstancedMesh:class{constructor(){throw Error('fixture mesh allocation')}},MeshStandardMaterial:class extends THREE.MeshStandardMaterial{constructor(options){super(options);this.addEventListener('dispose',()=>released++)}}}
  try{
    const before=f.sources.map(m=>Array.from(m.instanceMatrix.array)),value=buildOfficeBackdropTrees({...f,THREE:broken,layout})
    assert.equal(value.summary().enabled,false);assert.ok(value.summary().reason.includes('fixture mesh allocation'));assert.equal(released,1);assert.equal(f.root.children.length,0)
    assert.deepEqual(f.sources.map(m=>Array.from(m.instanceMatrix.array)),before)
    const retry=buildOfficeBackdropTrees({...f,THREE,layout});assert.equal(retry.summary().enabled,true);retry.dispose()
  }finally{f.dispose()}
})

test('ALIGN demolition measures uncached geometry before deciding: preserve world terrain, remove old office paving',()=>{
  const world=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400)),oldPaving=new THREE.Mesh(new THREE.PlaneGeometry(112,88))
  world.rotation.x=oldPaving.rotation.x=-Math.PI/2;world.position.set(0,-.62,0);oldPaving.position.set(0,-.6,4)
  try{
    assert.equal(world.geometry.boundingBox,null);assert.equal(oldPaving.geometry.boundingBox,null)
    const removed=selectEnvironmentConflicts([world,oldPaving],layout)
    assert.equal(removed.includes(world),false);assert.equal(removed.includes(oldPaving),true)
    assert.ok(world.geometry.boundingBox)
  }finally{for(const m of[world,oldPaving]){m.geometry.dispose();m.material.dispose()}}
})
