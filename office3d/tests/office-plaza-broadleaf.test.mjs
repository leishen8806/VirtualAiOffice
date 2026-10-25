import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {appendOfficePlaza} from '../office-vis2/plaza.js'
import {createSampleBatch} from '../office-vis2/batch.js'

test('plaza broadleaf crowns have irregular three-dimensional leaf pitch and rooted solid branches in the existing tree bounds',()=>{
  for(const low of[false,true]){
    const root=new THREE.Group(),batch=createSampleBatch(THREE),leafBatch=low?batch:createSampleBatch(THREE),branches=[],pitch=[]
    const wrap=target=>({triangles:target.triangles,add(g,color,position,...rest){
      const p=g.attributes.position
      if(g.type==='CylinderGeometry'&&g.parameters.radiusTop===.025&&g.parameters.radiusBottom===.045){
        const n=g.parameters.radialSegments,center=row=>{
          const v=new THREE.Vector3()
          for(let i=0;i<n;i++)v.add(new THREE.Vector3().fromBufferAttribute(p,row*(n+1)+i))
          return v.multiplyScalar(1/n).add(new THREE.Vector3(...position))
        }
        branches.push({start:center(1),end:center(0)})
      }
      if(['#476641','#7A8C53'].includes(color)&&g.type==='BufferGeometry'&&[9,18].includes(p.count))pitch.push(p.getY(6)-p.getY(0))
      target.add(g,color,position,...rest)
    }})
    const placements=appendOfficePlaza({THREE,batch:wrap(batch),leafBatch:low?undefined:wrap(leafBatch),layout,low})
    const solid=batch.build(root,'solid'),foliage=low?null:leafBatch.build(root,'leaves')
    try{
      const trees=placements.filter(p=>p.kind==='trees')
      assert.equal(trees.length,8);assert.equal(branches.length,low?32:24);assert.equal(pitch.length,low?2432:2112)
      assert.ok(Math.min(...pitch)<-.12);assert.ok(Math.max(...pitch)>.15)
      assert.ok(new Set(pitch.map(n=>n.toFixed(3))).size>20,'leaf tips no longer share one parallel sloping layer')
      for(const {start,end}of branches){
        assert.ok(Math.abs(start.y-(.11+2.35*.85))<1e-5)
        assert.ok(trees.some(t=>Math.hypot(start.x-t.x,start.z-t.z)<1e-5),'each branch joins its own real trunk')
        assert.ok(end.y>start.y)
        assert.ok(trees.some(({bounds:b})=>end.x>b.x0&&end.x<b.x1&&end.z>b.z0&&end.z<b.z1&&end.y<b.y1))
      }
      const triangles=solid.triangles()+(foliage?.triangles()||0)
      assert.ok(triangles<=(low?26900:20620),'prior total plaza triangle limits are retained')
    }finally{foliage?.dispose();solid.dispose();assert.equal(root.children.length,0)}
  }
})
