import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {buildOfficeAlignedShell,officeShellFinishSpec} from '../office-vis2/shell-finish.js'

function fixture(data=layout,low=false,search='?officeSample=1'){
  const root=new THREE.Group(),shell=buildOfficeAlignedShell({THREE,root,layout:data,low,search})
  root.updateMatrixWorld(true)
  return{root,shell,frames:root.getObjectByName('office-aligned-frames-and-inlays'),dispose:()=>shell.dispose()}
}

test('shadow LOD retains all visible box matrices, colours, source spec and original active geometry',()=>{
  const f=fixture(),box=new THREE.BoxGeometry(1,1,1)
  try{
    const m=f.frames,s=f.shell.finishSpec.solid,state=m.userData.officeShadow
    assert.ok(state);assert.equal(state.total,917);assert.equal(state.casters,383)
    assert.equal(m.count,state.total);assert.equal(state.sourceIndices.length,s.length);assert.equal(new Set(state.sourceIndices).size,s.length)
    assert.deepEqual(f.shell.finishSpec.solid,officeShellFinishSpec(layout,f.shell.spec).solid)
    for(const key of['position','normal','uv'])assert.deepEqual(Array.from(m.geometry.attributes[key].array),Array.from(box.attributes[key].array))
    assert.deepEqual(Array.from(m.geometry.index.array.slice(0,36)),Array.from(box.index.array))
    assert.equal(m.geometry.index.count,180);assert.deepEqual(m.geometry.drawRange,{start:0,count:36})
    const matrix=new THREE.Matrix4(),colour=new THREE.Color(),kinds=new Set()
    for(let i=0;i<m.count;i++){
      const p=s[state.sourceIndices[i]];m.getMatrixAt(i,matrix)
      const expected=new THREE.Matrix4().makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)
      matrix.elements.forEach((v,j)=>assert.ok(Math.abs(v-expected.elements[j])<1e-5))
      m.getColorAt(i,colour);const wanted=new THREE.Color(p.color)
      for(const c of['r','g','b'])assert.ok(Math.abs(colour[c]-wanted[c])<1e-7)
      if(i<state.casters)kinds.add(p.kind)
    }
    for(const kind of['plinth','sill','header','mullion','north-wall-panel','door-header','entrance-header','desk-cabinet','desk-panel','ceiling-edge','ceiling-soffit','pendant-beam'])assert.ok(kinds.has(kind),'retain primary shadow '+kind)
    for(const kind of['floor-joint','desk-handle','desk-book','shelf-book','wall-slat','light-recess','meeting-paper'])assert.equal(kinds.has(kind),false)
    assert.equal(m.castShadow,true);assert.equal(m.receiveShadow,true)
  }finally{box.dispose();f.dispose()}
})

test('box face-group cache uses the installed BoxGeometry normals and cannot reverse a face',()=>{
  const g=new THREE.BoxGeometry(1,1,1)
  try{
    const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
    assert.equal(g.groups.length,6)
    for(let i=0;i<6;i++){
      assert.equal(g.groups[i].start,i*6);assert.equal(g.groups[i].count,6)
      const n=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,g.index.getX(i*6))
      assert.deepEqual(n.toArray(),axes[i])
    }
  }finally{g.dispose()}
})

test('directional shadow face selection preserves native full-box ray depths from every octant and transformed root',()=>{
  const f=fixture(),referenceGeometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial(),candidate=new THREE.Mesh(f.frames.geometry,material),reference=new THREE.Mesh(referenceGeometry,material)
  let hits=0
  try{
    assert.ok(f.frames.userData.officeShadow)
    const directions=Array.from({length:8},(_,mask)=>new THREE.Vector3(mask&1?5:-5,mask&2?6:-6,mask&4?7:-7)).concat([new THREE.Vector3(0,-6,0),new THREE.Vector3(6,0,0)])
    for(const transformed of[false,true]){
      f.root.position.set(transformed?3:0,transformed?2:0,transformed?-4:0);f.root.rotation.y=transformed?.37:0;f.root.scale.set(transformed?-1.1:1,transformed?.9:1,transformed?1.3:1);f.root.updateMatrixWorld(true)
      candidate.matrixAutoUpdate=reference.matrixAutoUpdate=false;candidate.matrix.copy(f.frames.matrixWorld);reference.matrix.copy(f.frames.matrixWorld);candidate.updateMatrixWorld(true);reference.updateMatrixWorld(true)
      const centre=new THREE.Vector3().setFromMatrixPosition(f.frames.matrixWorld)
      for(const direction of directions)for(const side of[THREE.FrontSide,THREE.BackSide]){
        const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.copy(centre).add(direction);camera.lookAt(centre);camera.updateMatrixWorld(true)
        material.side=side
        f.frames.onBeforeShadow(null,f.frames,null,camera,f.frames.geometry,{side})
        assert.equal(f.frames.count,383);assert.equal(f.frames.geometry.drawRange.count,18)
        const forward=camera.getWorldDirection(new THREE.Vector3()),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion)
        for(const x of[-.4,-.2,0,.2,.4])for(const y of[-.4,-.2,0,.2,.4]){
          const origin=camera.position.clone().addScaledVector(right,x).addScaledVector(up,y),ray=new THREE.Raycaster(origin,forward,0,30)
          const old=ray.intersectObject(reference)[0],value=ray.intersectObject(candidate)[0]
          assert.equal(!!value,!!old)
          if(old){hits++;assert.ok(Math.abs(value.distance-old.distance)<1e-6);assert.ok(value.point.distanceTo(old.point)<1e-6)}
        }
        f.frames.onAfterShadow();assert.equal(f.frames.count,917);assert.deepEqual(f.frames.geometry.drawRange,{start:0,count:36})
      }
    }
    assert.ok(hits>500,'actual front/back depth samples, not only callback counters')
  }finally{referenceGeometry.dispose();material.dispose();f.dispose()}
})

test('perspective/double-sided shadows use full faces and interrupted shadow state restores before ordinary or normal rendering',()=>{
  const f=fixture()
  try{
    const m=f.frames
    assert.ok(m.userData.officeShadow)
    for(const [camera,side,count]of[[new THREE.PerspectiveCamera(),THREE.BackSide,36],[new THREE.OrthographicCamera(),THREE.DoubleSide,36],[new THREE.OrthographicCamera(),THREE.BackSide,18]]){
      camera.position.set(4,6,5);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
      m.onBeforeShadow(null,m,null,camera,m.geometry,{side});assert.equal(m.geometry.drawRange.count,count);assert.equal(m.count,383)
      // Simulate a missing after-shadow callback: the next main/GTAO pass must still contain every instance.
      m.onBeforeRender();assert.equal(m.count,917);assert.deepEqual(m.geometry.drawRange,{start:0,count:36})
      m.onAfterShadow();assert.equal(m.count,917)
    }
  }finally{f.dispose()}
})

test('shadow optimisation is absent from low, legacy and closed paths',()=>{
  for(const [data,low,search]of[[layout,true,'?officeSample=1'],[LAYOUT_V3,false,'?officeSample=1'],[layout,false,'']]){
    const f=fixture(data,low,search)
    try{
      if(f.frames){assert.equal(f.frames.userData.officeShadow,undefined);assert.equal(f.frames.geometry.index.count,36);assert.equal(f.frames.onBeforeShadow,THREE.Object3D.prototype.onBeforeShadow)}
      else assert.equal(search,'')
    }finally{f.dispose()}
    assert.equal(f.root.children.length,0)
  }
})
