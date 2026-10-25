import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {bindOfficeFurnitureSurfaces} from '../office-vis2/batch.js'
import {createOfficeVis2Controller} from '../office-vis2/sample.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN} from '../office-layout.js'
import {mergeOfficeStatic} from '../office-v2-registry.js'

const compile=m=>{const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>'};m.onBeforeCompile(shader);return shader}
const fixture=()=>({map:new THREE.CanvasTexture({width:2048,height:1024}),oak:new THREE.Texture(),fabric:new THREE.Texture()})

test('furniture overlay preserves original atlas and callbacks, uses approved material colors and restores without disposing shared assets',()=>{
  const a=fixture(),material=new THREE.MeshStandardMaterial({map:a.map,vertexColors:true}),callback=shader=>{shader.uniforms.existing={value:42}}
  material.onBeforeCompile=callback;const key=material.customProgramCacheKey;let released=0
  for(const value of[material,a.map,a.oak,a.fabric])value.addEventListener('dispose',()=>released++)
  const bound=bindOfficeFurnitureSurfaces(THREE,[material,material],a)
  try{
    assert.equal(bound.count,1);const shader=compile(material)
    assert.equal(shader.uniforms.existing.value,42)
    assert.equal(shader.uniforms.officeFurnitureOak.value.uuid,a.oak.uuid);assert.equal(shader.uniforms.officeFurnitureFabric.value.uuid,a.fabric.uuid)
    assert.equal(shader.uniforms.officeFurnitureWoodColor.value.getHexString(),'c49a6c')
    assert.equal(shader.uniforms.officeFurnitureFabricColor.value.getHexString(),'506a5a')
    assert.ok(shader.fragmentShader.includes('length(vColor.rgb-officeFurnitureWoodColor)'))
    const white=new THREE.Color('#ffffff'),wood=shader.uniforms.officeFurnitureWoodColor.value,fabric=shader.uniforms.officeFurnitureFabricColor.value
    for(const color of[wood,fabric])assert.ok(Math.hypot(white.r-color.r,white.g-color.g,white.b-color.b)>.01,'white screen vertices never match either material mask')
    assert.ok(shader.fragmentShader.includes('roughnessFactor = .64'));assert.ok(shader.fragmentShader.includes('roughnessFactor = .96'))
    assert.equal(material.map.uuid,a.map.uuid);assert.equal(material.roughness,1)
    const duplicate=bindOfficeFurnitureSurfaces(THREE,[material],a);assert.equal(duplicate.count,0);duplicate.dispose()
    assert.equal(material.onBeforeCompile===callback,false)
    bound.dispose();bound.dispose();assert.equal(material.onBeforeCompile===callback,true);assert.equal(material.customProgramCacheKey===key,true);assert.equal(released,0)
  }finally{bound.dispose();material.dispose();for(const r of[a.map,a.oak,a.fabric])r.dispose()}
})

test('surface overlays leave original merged geometry, vertex colors, atlas UVs and draw batching intact',()=>{
  const root=new THREE.Group(),a=fixture(),material=new THREE.MeshStandardMaterial({map:a.map,vertexColors:true}),source=[]
  for(let i=0;i<2;i++){const g=new THREE.BoxGeometry(1,1,1),m=new THREE.Mesh(g,material);source.push(g);m.position.x=i*2;root.add(m)}
  const bound=bindOfficeFurnitureSurfaces(THREE,[material],a),merged=mergeOfficeStatic(THREE,root),mesh=root.children[0],position=Array.from(mesh.geometry.attributes.position.array),uv=Array.from(mesh.geometry.attributes.uv.array)
  try{
    assert.equal(merged.added,1);assert.equal(merged.removed,2);assert.equal(mesh.material.uuid,material.uuid)
    assert.ok(compile(mesh.material).uniforms.officeFurnitureOak)
    bound.dispose();assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),position);assert.deepEqual(Array.from(mesh.geometry.attributes.uv.array),uv)
  }finally{bound.dispose();merged.dispose();source.forEach(g=>g.dispose());material.dispose();for(const r of[a.map,a.oak,a.fabric])r.dispose()}
})

test('missing textures and unrelated materials stay untouched and later shader owners are not overwritten',()=>{
  const a=fixture(),valid=new THREE.MeshStandardMaterial({map:a.map,vertexColors:true}),other=new THREE.MeshBasicMaterial(),previous=valid.onBeforeCompile
  try{
    for(const assets of[null,{}, {oak:a.oak}]){const x=bindOfficeFurnitureSurfaces(THREE,[valid,other],assets);assert.equal(x.count,0);x.dispose();assert.equal(valid.onBeforeCompile===previous,true)}
    const x=bindOfficeFurnitureSurfaces(THREE,[valid,other],a),later=()=>{};valid.onBeforeCompile=later;x.dispose();assert.equal(valid.onBeforeCompile===later,true)
  }finally{valid.dispose();other.dispose();for(const r of[a.map,a.oak,a.fabric])r.dispose()}
})

test('real controller enables only high ALIGN, restores material before releasing textures, and reopens without another asset loader',async()=>{
  for(const layout of[LAYOUT_V3,LAYOUT_V3_ALIGN])for(const low of[false,true]){
    const a=fixture(),material=new THREE.MeshStandardMaterial({map:a.map,vertexColors:true}),previous=material.onBeforeCompile,root=new THREE.Group();let created=0,disposed=0
    const loader={async loadAsync(){created++;const t=new THREE.Texture();t.addEventListener('dispose',()=>{disposed++;assert.equal(material.onBeforeCompile===previous,true,'restore atlas material before releasing shared sampler assets')});return t}}
    const ctl=createOfficeVis2Controller({THREE,root,layout,low,textureLoader:loader,get:id=>id==='furniture3'?{surfaceMaterials:[material]}:undefined})
    try{
      for(let i=0;i<3;i++){
        assert.equal(await ctl.setConfig({enabled:true}),true)
        assert.equal(!!compile(material).uniforms.officeFurnitureOak,layout.variant==='align'&&!low)
        await ctl.setConfig(null);assert.equal(material.onBeforeCompile===previous,true);assert.equal(root.children.length,0)
      }
      assert.equal(created,12);assert.equal(disposed,12)
    }finally{ctl.dispose();material.dispose();for(const r of[a.map,a.oak,a.fabric])r.dispose()}
  }
})
