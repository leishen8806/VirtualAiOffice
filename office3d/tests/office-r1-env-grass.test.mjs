import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_R1,LAYOUT_V3_ALIGN,LAYOUT_V3_ALIGN_L2B,LAYOUT_V3_ALIGN_SAMPLE,LAYOUT_V3} from '../office-layout.js'
import {selectEnvironmentConflicts} from '../office-v3-modules.js'

// env.js:106-117 的真实外围地面：2,400 m 草地（y=-0.62）与 112 x 88 m 旧铺装（y=-0.6, z=4），两者都没有名字、也没有缓存包围盒
function environment(){
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400)),paving=new THREE.Mesh(new THREE.PlaneGeometry(112,88))
  grass.rotation.x=paving.rotation.x=-Math.PI/2;grass.position.set(0,-.62,0);paving.position.set(0,-.6,4)
  const label=object=>object===grass?'grass':object===paving?'paving':String(object.name||object.type)
  return{grass,paving,roots:[grass,paving],label,dispose(){for(const m of[grass,paving]){m.geometry.dispose();m.material.dispose()}}}
}

test('R1 demolition measures uncached geometry before deciding: the 2,400 m world grass survives, the old 112 x 88 m paving still goes',()=>{
  const env=environment()
  try{
    assert.equal(LAYOUT_V3_R1.variant,'r1');assert.equal(LAYOUT_V3_R1.r1Phase,'R1')
    assert.equal(env.grass.geometry.boundingBox,null);assert.equal(env.paving.geometry.boundingBox,null)
    const removed=selectEnvironmentConflicts(env.roots,LAYOUT_V3_R1)
    assert.deepEqual(removed.map(env.label),['paving'])
    assert.equal(removed.includes(env.grass),false,'外围草坪是全局地面，R1 不能把它当成局部冲突删掉')
    assert.ok(env.grass.geometry.boundingBox,'R1 要和 align 一样先量再判，而不是没有包围盒就判冲突')
  }finally{env.dispose()}
})

test('R1 guard changes nothing for the other entries: align/L2B/sample still remove only the paving, legacy v3 keeps its unmeasured verdict',()=>{
  for(const [name,layout,expected] of [['align',LAYOUT_V3_ALIGN,['paving']],['L2B',LAYOUT_V3_ALIGN_L2B,['paving']],['sample',LAYOUT_V3_ALIGN_SAMPLE,['paving']],['v3',LAYOUT_V3,['grass','paving']]]){
    const env=environment()
    try{
      assert.deepEqual(selectEnvironmentConflicts(env.roots,layout).map(env.label),expected,name)
    }finally{env.dispose()}
  }
})

test('R1 still demolishes the local clutter it is meant to clear and keeps what align keeps',()=>{
  const env=environment(),trees=new THREE.Group(),named=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400)),sky=new THREE.Mesh(new THREE.PlaneGeometry(10,10)),outside=new THREE.Mesh(new THREE.PlaneGeometry(20,20))
  named.name='ground';sky.name='city-background';outside.position.set(600,0,600)
  trees.position.set(10,0,10)
  try{
    const removed=selectEnvironmentConflicts([...env.roots,trees,named,sky,outside],LAYOUT_V3_R1)
    assert.deepEqual(removed.map(o=>o===trees?'trees':env.label(o)),['paving','trees'])
  }finally{env.dispose();for(const m of[named,sky,outside]){m.geometry.dispose();m.material.dispose()}}
})
