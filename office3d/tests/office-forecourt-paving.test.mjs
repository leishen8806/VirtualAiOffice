import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {appendOfficePlazaPaving} from '../office-vis2/completion.js'
import {createSampleBatch} from '../office-vis2/batch.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {createFurnitureCollision} from '../furniture-collision.js'

test('forecourt stone joints are deterministic, contained, below the circular paving and absent from legacy',()=>{
  const before=JSON.stringify(layout)
  for(const data of[layout,LAYOUT_V3])for(const low of[false,true]){
    const root=new THREE.Group(),batch=createSampleBatch(THREE),joints=[]
    const recorder={add(g,color,p,...rest){if(color==='#C0B7A8')joints.push({position:[...p],parameters:g.parameters});batch.add(g,color,p,...rest)}}
    appendOfficePlazaPaving({THREE,batch:recorder,layout:data,low});const built=batch.build(root,'paving')
    try{
      assert.equal(joints.length,data===layout?51:0)
      for(const {position:[x,y,z],parameters:{width:w,height:d}}of joints){
        assert.equal(y,.0815);assert.ok(y>.08&&y<.09)
        assert.ok(x-w/2>=data.site.x0&&x+w/2<=data.site.x1)
        assert.ok(z-d/2>=data.envelope.z1&&z+d/2<=data.site.z1)
        assert.ok(w===.014||d===.014)
      }
      if(data===layout){
        const ray=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(built.mesh)
        assert.ok(Math.abs(ray(-27.25,15.25)[0].point.y-.0815)<1e-6)
        const center=ray(2.75,21)
        assert.ok(Math.abs(center[0].point.y-.09)<1e-6,'the old circular surface occludes the joints, with no coplanar overlap')
        assert.ok(center.some(h=>Math.abs(h.point.y-.0815)<1e-6))
        assert.ok(built.triangles()<1200)
      }
    }finally{built.dispose();built.dispose();assert.equal(root.children.length,0)}
  }
  assert.equal(JSON.stringify(layout),before)
})

test('actual shell keeps its existing batches, doorway, business coordinates and collision ownership',()=>{
  for(const low of[false,true]){
    const root=new THREE.Group(),world=createFurnitureCollision(),shell=buildOfficeAlignedShell({THREE,root,layout,low,search:'?officeSample=1',collision:world})
    const released=new Set(),resources=new Set()
    try{
      assert.ok(shell.finishSpec);assert.equal(layout.doors.south.width,6);assert.equal(Object.keys(layout.seats).length,25)
      const names=root.children.filter(m=>m.isMesh&&m.visible).map(m=>m.name)
      assert.equal(names.filter(n=>n==='office-aligned-plaza-paving').length,1)
      assert.deepEqual(names,low?['office3-ground','office-aligned-frames-and-inlays','office-aligned-plaza-paving','office-warm-practical-diffusers']:['office3-ground','office-aligned-frames-and-inlays','office-aligned-clear-glass','office-aligned-plaza-paving','office-whole-floor-foliage','office-warm-practical-diffusers'])
      for(const m of root.children)if(m.isMesh&&m.name.startsWith('office-aligned-'))for(const r of[m.geometry,m.material]){resources.add(r.uuid);r.addEventListener('dispose',()=>released.add(r.uuid))}
      assert.equal(world.hit(2,12)===null,true)
    }finally{shell.dispose();shell.dispose()}
    assert.deepEqual([...released].sort(),[...resources].sort());assert.equal(root.children.length,0);assert.equal(world.stats().bodies,0)
  }
})
