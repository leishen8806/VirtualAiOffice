import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout, LAYOUT_V3} from '../office-layout.js'
import {officeLeafGeometry,appendOfficeGardenBed} from '../office-vis2/plants.js'
import {createSampleBatch} from '../office-vis2/batch.js'
import {appendOfficePlaza} from '../office-vis2/plaza.js'
import {buildOfficePlazaHost} from '../office-vis2/plaza-host.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {createFurnitureCollision} from '../furniture-collision.js'

test('outline leaves preserve every original front vertex and conservative bounds with one quarter of the triangles',()=>{
  for(const segments of[2,3,7])for(const angle of[0,.731,2.7]){
    const old=officeLeafGeometry(THREE,angle,.32,segments),leaf=officeLeafGeometry(THREE,angle,.32,segments,true)
    try{
      assert.deepEqual(Array.from(leaf.attributes.position.array),Array.from(old.attributes.position.array.slice(0,old.attributes.position.array.length/2)))
      old.computeBoundingBox();leaf.computeBoundingBox();assert.deepEqual(leaf.boundingBox,old.boundingBox)
      assert.equal(leaf.index.count,old.index.count/4);assert.equal(leaf.userData.officeLeafOutline,true)
      const p=leaf.attributes.position,n=leaf.attributes.normal
      for(let i=0;i<n.array.length;i++)assert.ok(Math.abs(n.array[i]+old.attributes.normal.array[i])<1e-6,'retain the original smooth leaf normals with upward winding')
      for(let i=0;i<leaf.index.count;i+=3){
        const ids=Array.from(leaf.index.array.slice(i,i+3)),points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id))
        assert.ok(new THREE.Triangle(...points).getArea()>1e-8)
        const face=new THREE.Triangle(...points).getNormal(new THREE.Vector3())
        assert.ok(ids.every(id=>face.dot(new THREE.Vector3().fromBufferAttribute(n,id))>0))
        for(const id of ids)assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(n,id).length()-1)<1e-5)
      }
    }finally{old.dispose();leaf.dispose()}
  }
})

test('garden split retains plant density, colours, placement and non-leaf geometry while reducing only leaf topology',()=>{
  const bed={x:3,z:4,w:4.2,d:1.8},runs=[]
  for(const split of[false,true]){
    const root=new THREE.Group(),batch=createSampleBatch(THREE),leafBatch=split?createSampleBatch(THREE):batch,leaves=[],petals=[]
    const record=target=>({add(g,color,position,...args){
      if(g.type==='BufferGeometry'&&g.index&&g.attributes.position.count===(split?9:18))leaves.push({points:Array.from(g.attributes.position.array.slice(0,27)),color,position:[...position],args})
      if(g.type==='CircleGeometry'&&g.parameters.radius===.045&&g.parameters.segments===5){petals.push({points:Array.from(g.attributes.position.array),color,position:[...position],args});assert.equal(g.index.count,split?9:15)}
      target.add(g,color,position,...args)
    }})
    const main=record(batch),other=split?record(leafBatch):main
    appendOfficeGardenBed({THREE,batch:main,leafBatch:other,bed,seed:9,organic:true})
    const built=batch.build(root,'solid'),foliage=split?leafBatch.build(root,'foliage'):null
    try{runs.push({leaves,petals,triangles:built.triangles()+(foliage?.triangles()||0),leafTriangles:foliage?.triangles()||0})}
    finally{foliage?.dispose();built.dispose();assert.equal(root.children.length,0)}
  }
  assert.equal(runs[0].leaves.length,Math.round(bed.w*bed.d*3)*5)
  assert.deepEqual(runs[1].leaves,runs[0].leaves)
  assert.ok(runs[0].petals.length>0);assert.deepEqual(runs[1].petals,runs[0].petals)
  assert.equal(runs[1].leafTriangles,runs[0].leaves.length*2)
  assert.equal(runs[1].triangles,runs[0].triangles-runs[0].leaves.length*6-runs[0].petals.length*2)
})

test('real high-tier plaza split preserves all placement and collider bounds and releases both batches',()=>{
  const oldBatch=createSampleBatch(THREE),before=appendOfficePlaza({THREE,batch:oldBatch,layout}),old=oldBatch.build(new THREE.Group(),'old')
  const root=new THREE.Group(),world=createFurnitureCollision(),value=buildOfficePlazaHost({THREE,root,layout,search:'?officeSample=1',collision:world}),released=new Set()
  try{
    const clean=items=>items.map(({triangles,interaction,...rest})=>rest)
    assert.deepEqual(clean(value.placements),clean(before))
    const foliage=root.getObjectByName('office-plaza-foliage'),solid=root.getObjectByName('office-plaza-props')
    assert.ok(foliage);assert.equal(foliage.material.side,THREE.DoubleSide);assert.equal(foliage.userData.dynamic,true)
    assert.equal(solid.material.side,THREE.FrontSide);assert.equal(foliage.castShadow,false)
    assert.ok((solid.geometry.attributes.position.count+foliage.geometry.attributes.position.count)/3<old.triangles())
    assert.equal(world.stats().bodies,before.length)
    for(const m of[foliage,solid])for(const resource of[m.geometry,m.material])resource.addEventListener('dispose',()=>released.add(resource.uuid))
  }finally{old.dispose();value.dispose();value.dispose()}
  assert.equal(released.size,4);assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
})

test('high shell owns its leaf batch; low, legacy and closed paths do not allocate additional foliage batches',()=>{
  for(const [data,low,search]of[[layout,true,'?officeSample=1'],[LAYOUT_V3,false,'?officeSample=1'],[layout,false,'']]){
    const root=new THREE.Group(),world=createFurnitureCollision(),v=buildOfficePlazaHost({THREE,root,layout:data,low,search,collision:world})
    try{assert.equal(root.getObjectByName('office-plaza-foliage'),undefined)}finally{v.dispose()}
    assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
  }
  for(const low of[false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),v=buildOfficeAlignedShell({THREE,root,layout,low,search:'?officeSample=1',collision:world})
    try{const m=root.getObjectByName('office-whole-floor-foliage');assert.equal(!!m,!low);if(m){assert.equal(m.material.side,THREE.DoubleSide);assert.equal(m.userData.dynamic,true)}}
    finally{v.dispose();v.dispose()}
    assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
  }
})

test('host registration failure releases foliage and prototype materials without leaving proxies',()=>{
  const root=new THREE.Group(),world=createFurnitureCollision(),made=new Set(),released=new Set()
  const T={...THREE,MeshStandardMaterial:class extends THREE.MeshStandardMaterial{constructor(options){super(options);made.add(this.uuid);this.addEventListener('dispose',()=>released.add(this.uuid))}}}
  let count=0
  const collision={...world,add(mesh,kind){if(++count===2)throw Error('fixture registration failure');world.add(mesh,kind)}}
  assert.throws(()=>buildOfficePlazaHost({THREE:T,root,layout,search:'?officeSample=1',collision}),/fixture registration failure/)
  assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0);assert.deepEqual([...released].sort(),[...made].sort())
})

test('sample-batch mesh allocation failure releases its new material and geometry',()=>{
  for(const poses of[undefined,[{x:0,z:0}]]){
    let geometries=0,materials=0
    const T={...THREE,BufferGeometry:class extends THREE.BufferGeometry{constructor(){super();this.addEventListener('dispose',()=>geometries++)}},MeshStandardMaterial:class extends THREE.MeshStandardMaterial{constructor(options){super(options);this.addEventListener('dispose',()=>materials++)}},Mesh:class{constructor(){throw Error('fixture mesh allocation')}},InstancedMesh:class{constructor(){throw Error('fixture mesh allocation')}}}
    const root=new THREE.Group(),batch=createSampleBatch(T);batch.add(new THREE.BoxGeometry(1,1,1),'#ffffff')
    assert.throws(()=>batch.build(root,'failed',poses),/fixture mesh allocation/)
    assert.equal(geometries,1);assert.equal(materials,1);assert.equal(root.children.length,0)
  }
})
