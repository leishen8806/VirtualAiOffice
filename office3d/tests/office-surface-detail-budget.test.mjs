import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout,LAYOUT_V3} from '../office-layout.js'
import {buildOfficeShellV3Spec} from '../office-layout-v3-scene.js'
import {officeShellFinishSpec,buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import * as detail from '../office-vis2/whole-floor.js'
import {createSampleBatch} from '../office-vis2/batch.js'

test('moved detail batch retains 174 full-volume books, 75 exact top surfaces and no band boxes',()=>{
  const shellRoot=new THREE.Group(),shell=buildOfficeAlignedShell({THREE,root:shellRoot,layout,search:'?officeSample=1'})
  try{assert.equal(shellRoot.getObjectByName('office-aligned-frames-and-inlays').count,732,'printed and flat details no longer submit separate solid box instances')}finally{shell.dispose()}
  const root=new THREE.Group(),batch=createSampleBatch(THREE),spec=officeShellFinishSpec(layout,buildOfficeShellV3Spec(layout))
  detail.appendOfficeSurfaceDetails({THREE,batch,details:spec.solid});const built=batch.build(root,'surface-probe')
  try{
    assert.equal(spec.solid.filter(p=>p.kind==='shelf-book').length,174);assert.equal(spec.solid.filter(p=>p.kind==='shelf-spine').length,0)
    assert.equal(built.triangles(),174*12+75*2)
    const {position:p,normal:n,sampleSurface:s,sampleUv:uv}=built.mesh.geometry.attributes
    let printed=0
    for(let i=0;i<p.count;i++)if(s.getZ(i)>5){printed++;assert.ok(n.getZ(i)>.99);const h=s.getZ(i)-5;assert.ok(h>.35&&h<.47);assert.ok(uv.getY(i)>=-1e-6&&uv.getY(i)<=h+1e-6);assert.ok(Math.abs(uv.getX(i))<.05)}
    assert.equal(printed,174*6,'two front triangles per book; all five other faces remain solid')
  }finally{built.dispose()}
  assert.equal(root.children.length,0)
})

test('flat replacements keep original top elevation, footprint, upward normal and owned cleanup',()=>{
  const spec=officeShellFinishSpec(layout,buildOfficeShellV3Spec(layout))
  for(const kind of['floor-joint','desk-group-inlay','desk-group-rug','meeting-paper','meeting-folder']){
    const p=spec.solid.find(p=>p.kind===kind),root=new THREE.Group(),batch=createSampleBatch(THREE)
    detail.appendOfficeSurfaceDetails({THREE,batch,details:[p]});const built=batch.build(root,'flat-probe')
    try{
      assert.equal(built.triangles(),2);root.updateMatrixWorld(true)
      const b=new THREE.Box3().setFromObject(built.mesh),ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+1,p.z),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(built.mesh)[0]
      assert.ok(hit);assert.ok(Math.abs(hit.point.y-p.y-p.h/2)<3e-6);assert.ok(hit.face.normal.y>.99)
      for(const [actual,expected]of[[b.min.x,p.x-p.w/2],[b.max.x,p.x+p.w/2],[b.min.z,p.z-p.d/2],[b.max.z,p.z+p.d/2]])assert.ok(Math.abs(actual-expected)<3e-6)
    }finally{built.dispose()}
    assert.equal(root.children.length,0)
  }
  assert.equal(detail.wholeFloorSpec(LAYOUT_V3).referenceFinish,false)
})

test('book spine paint is front-face scoped with a distinct program key and leaves other material contracts intact',()=>{
  const root=new THREE.Group(),batch=createSampleBatch(THREE);batch.add(new THREE.BoxGeometry(.08,.4,.29),'#58705C')
  const value=batch.build(root,'paint-probe'),material=value.mesh.material
  const compile=()=>{const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>'};material.onBeforeCompile(shader);return shader}
  try{
    const before=compile(),key=material.customProgramCacheKey();assert.equal(before.fragmentShader.includes('height * .18'),false)
    material.userData.officeBookSpines=true;const after=compile()
    assert.notEqual(material.customProgramCacheKey(),key);assert.ok(after.fragmentShader.includes('height * .18'));assert.ok(after.fragmentShader.includes('height * .8'))
    assert.ok(after.fragmentShader.includes('step(.0285, abs(materialUv.x))'));assert.ok(after.fragmentShader.includes('surfaceParams.z > 5.0'))
    assert.ok(after.fragmentShader.includes('surfaceParams.z > 3.5 && surfaceParams.z < 4.5'));assert.ok(after.fragmentShader.includes('vis2Textured && surfaceParams.z < 4.5'))
    for(const text of['roughnessFactor = surfaceParams.x;','metalnessFactor = surfaceParams.y;'])assert.ok(after.fragmentShader.includes(text))
  }finally{value.dispose()}
})
