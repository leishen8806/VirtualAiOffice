import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN} from '../office-layout.js'
import {warmOfficeArchitecture} from '../office-vis2/batch.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {buildOfficeAlignedZones} from '../office-vis2/zone-finish.js'
import {createOfficeV2Registry} from '../office-v2-registry.js'
import {createFurnitureCollision} from '../furniture-collision.js'

test('architectural IBL preserves the original hook and base material, is indirect-only and idempotent',()=>{
  const material=new THREE.MeshStandardMaterial({color:'#D9D3C6',roughness:.74,metalness:.08}),environment=new THREE.Texture()
  material.envMap=environment;let released=0,calls=0;environment.addEventListener('dispose',()=>released++)
  const renderer={},before={color:material.color.getHex(),roughness:material.roughness,metalness:material.metalness,emissive:material.emissive.getHex(),map:material.envMap.uuid}
  material.onBeforeCompile=function(shader,received){assert.equal(this===material,true);assert.equal(received===renderer,true);calls++;shader.uniforms.original={value:7};shader.fragmentShader+='\n// original hook retained'}
  material.customProgramCacheKey=()=> 'prior-key'
  try{
    warmOfficeArchitecture(material);const compile=material.onBeforeCompile,key=material.customProgramCacheKey()
    warmOfficeArchitecture(material);assert.equal(compile===material.onBeforeCompile,true);assert.equal(material.customProgramCacheKey(),key);assert.notEqual(key,'prior-key')
    const shader={uniforms:{},fragmentShader:'#include <lights_fragment_maps>\n#include <lights_fragment_end>'}
    material.onBeforeCompile(shader,renderer)
    assert.equal(calls,1);assert.equal(shader.uniforms.original.value,7);assert.ok(shader.fragmentShader.includes('original hook retained'))
    assert.ok(shader.fragmentShader.includes('#ifdef USE_ENVMAP'));assert.ok(shader.fragmentShader.includes('* 1.2;'));assert.equal(shader.fragmentShader.includes('* 1.8;'),false)
    assert.ok(shader.fragmentShader.indexOf('iblIrradiance = mix')>shader.fragmentShader.indexOf('#include <lights_fragment_maps>'))
    assert.ok(shader.fragmentShader.indexOf('radiance = mix')<shader.fragmentShader.indexOf('#include <lights_fragment_end>'))
    assert.equal(shader.fragmentShader.includes('emissive'),false);assert.deepEqual(Object.keys(shader.uniforms),['original'])
    assert.deepEqual({color:material.color.getHex(),roughness:material.roughness,metalness:material.metalness,emissive:material.emissive.getHex(),map:material.envMap.uuid},before)
  }finally{material.dispose();assert.equal(released,0);environment.dispose()}
})

test('actual registry warms three rendered interior batches and all their owned source furnishings only in explicit high ALIGN',()=>{
  for(const layout of[LAYOUT_V3,LAYOUT_V3_ALIGN])for(const low of[false,true])for(const search of['','?officeSample=0','?officeSample=1&officeSample=1','?officeSample=1']){
    const scene=new THREE.Scene(),environment=new THREE.Texture(),world=createFurnitureCollision(),sentinel=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial())
    scene.environment=environment;scene.environmentIntensity=.0576;scene.add(sentinel);let sharedReleased=0;environment.addEventListener('dispose',()=>sharedReleased++)
    const registry=createOfficeV2Registry({THREE,scene,layout,quality:{tier:low?'low':'high'}})
    registry.register('shell3',buildOfficeAlignedShell);registry.register('zones',buildOfficeAlignedZones)
    const expected=layout===LAYOUT_V3_ALIGN&&!low&&search==='?officeSample=1',owned=new Map(),disposed=new Map()
    try{
      // 这里只核对样板自有登记；旧外壳关闭路径的清理残留不由材质测试宣称修复。
      registry.buildAll({layout,search,collision:layout===LAYOUT_V3_ALIGN&&search==='?officeSample=1'?world:undefined})
      const found=[];registry.root.traverse(m=>{if(m.isMesh&&m.material?.userData.officeArchitectureWarmth){found.push(m);owned.set(m.material.uuid,m.material)}})
      assert.equal(owned.size,expected?3:0)
      for(const f of registry.get('zones').furnishings||[]){assert.equal(!!f.root.material.userData.officeArchitectureWarmth,expected);if(expected)owned.set(f.root.material.uuid,f.root.material)}
      if(expected){
        assert.ok(found.some(m=>m.name.includes('merged-batch')),'floor remains in the real registry merge')
        assert.equal(registry.get('shell3').ground.material.userData.officeArchitectureWarmth,true)
        for(const material of owned.values())material.addEventListener('dispose',()=>disposed.set(material.uuid,(disposed.get(material.uuid)||0)+1))
      }
      registry.root.traverse(m=>{if(m.isMesh&&/clear-glass|foliage|diffusers/.test(m.name))assert.equal(!!m.material.userData.officeArchitectureWarmth,false)})
      assert.equal(scene.environment.uuid,environment.uuid);assert.equal(scene.environmentIntensity,.0576)
      assert.equal(!!sentinel.material.userData.officeArchitectureWarmth,false)
    }finally{
      registry.dispose();registry.dispose()
      for(const id of owned.keys())assert.equal(disposed.get(id),1)
      assert.equal(world.stats().bodies,0);assert.deepEqual(scene.children.map(o=>o.uuid),[sentinel.uuid]);assert.equal(sharedReleased,0)
      sentinel.geometry.dispose();sentinel.material.dispose();environment.dispose()
    }
  }
})
