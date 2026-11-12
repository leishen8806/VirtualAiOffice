import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {officeBackdropCanopy,buildOfficeBackdropTrees,officeLeafGeometry,appendOfficeGardenBed} from '../office-vis2/plants.js'
import {bindOfficeLeafNormalPass} from '../office-vis2/leaf-pass.js'
import {buildHeartBanyan} from '../office-heart-banyan.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'

const close=(a,b,message)=>assert.ok(Math.abs(a-b)<2e-6,`${message}: ${a}/${b}`)
const point=(g,i)=>new THREE.Vector3().fromBufferAttribute(g.attributes.position,i)

test('one-triangle leaf covers the exact old clipped quad with the same normal, color, volume and visible bounds',()=>{
  for(const low of [false,true]){
    const old=officeBackdropCanopy(THREE,low),next=officeBackdropCanopy(THREE,low,true)
    try{
      assert.equal(next.attributes.position.count*2,old.attributes.position.count)
      assert.deepEqual(next.boundingBox,old.boundingBox);assert.deepEqual(next.boundingSphere,old.boundingSphere)
      for(let leaf=0;leaf<(low?32:128);leaf++){
        const p=point(next,leaf*3),u=point(next,leaf*3+1).sub(p).multiplyScalar(.5),v=point(next,leaf*3+2).sub(p).multiplyScalar(.5)
        for(const [oldIndex,x,y] of [[0,0,0],[1,1,0],[2,1,1],[5,0,1]]){
          const a=point(old,leaf*6+oldIndex),b=p.clone().addScaledVector(u,x).addScaledVector(v,y)
          for(const axis of ['x','y','z'])close(a[axis],b[axis],'same visible quad')
          assert.ok(b.length()<=.980003)
        }
        for(const axis of ['getX','getY','getZ']){
          close(old.attributes.normal[axis](leaf*6),next.attributes.normal[axis](leaf*3),'leaf normal')
          assert.equal(old.attributes.color[axis](leaf*6),next.attributes.color[axis](leaf*3))
        }
        for(let x=0;x<=1;x+=.1)for(let y=0;y<=1;y+=.1)if((x*2-1)**2+(y*2-1)**2<=1)assert.ok(x/2+y/2<=1,'complete oval lies in the oversized triangle')
      }
    }finally{old.dispose();next.dispose()}
  }
})

test('banyan submission optimization preserves all 1000 cluster transforms, colors, trunk, pool and actual crown bounds',()=>{
  const a=buildHeartBanyan({THREE,root:new THREE.Group()}),b=buildHeartBanyan({THREE,root:new THREE.Group(),leafTriangles:true})
  try{
    const x=a.root.getObjectByName('heart-banyan-small-leaf-clusters'),y=b.root.getObjectByName('heart-banyan-small-leaf-clusters')
    assert.equal(x.count,1000);assert.equal(y.count,x.count);assert.equal(y.geometry.attributes.position.count*2,x.geometry.attributes.position.count)
    assert.deepEqual(y.instanceMatrix.array,x.instanceMatrix.array);assert.deepEqual(y.instanceColor.array,x.instanceColor.array)
    assert.deepEqual(y.boundingBox,x.boundingBox);assert.deepEqual(y.boundingSphere,x.boundingSphere)
    for(const name of ['heart-banyan-pool','heart-banyan-trunk-and-branches']){
      const old=a.root.getObjectByName(name).geometry,next=b.root.getObjectByName(name).geometry
      for(const attr of ['position','normal','color'])assert.deepEqual(next.attributes[attr].array,old.attributes[attr].array)
    }
    assert.equal(a.summary().triangles-b.summary().triangles,3000)
  }finally{a.dispose();b.dispose()}
})

test('leaf-owned normal pass retains alpha cutout, outputs view normals before lighting and never edits the shared override',()=>{
  const material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(new THREE.BufferGeometry(),material),shared=new THREE.MeshNormalMaterial(),before=THREE.ShaderLib.normal.fragmentShader
  let called=0;mesh.onBeforeRender=()=>called++
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif (vViewPosition.x > 99999.0) discard;')}
  bindOfficeLeafNormalPass(mesh)
  try{
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader}
    material.onBeforeCompile(shader)
    assert.equal(material.allowOverride,false);assert.equal(shared.allowOverride,true)
    assert.ok(shader.fragmentShader.indexOf('discard;')<shader.fragmentShader.indexOf('if (officeLeafNormalPass)'))
    assert.ok(shader.fragmentShader.indexOf('return;')<shader.fragmentShader.indexOf('#include <lights_physical_fragment>'))
    mesh.onBeforeRender(null,{overrideMaterial:shared});assert.equal(shader.uniforms.officeLeafNormalPass.value,true)
    mesh.onBeforeRender(null,{overrideMaterial:null});assert.equal(shader.uniforms.officeLeafNormalPass.value,false)
    assert.equal(called,2);assert.equal(THREE.ShaderLib.normal.fragmentShader,before)
  }finally{material.dispose();mesh.geometry.dispose();shared.dispose()}
})

test('masked legacy crowns submit zero instances only during owned visible renders; all counts and callbacks restore',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),g=new THREE.IcosahedronGeometry(1,1),colors=[0x4f8a3c,0x5d9a44,0x3f7a39,0x6aa04f],sources=[],original=[],seen=[];scene.add(root)
  for(let m=0;m<4;m++){
    const s=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:colors[m]}),2)
    s.userData={dynamic:true,list:[0,1].map(i=>({m,x:m*4,y:3,z:-25-i,r:1.5,ph:.1}))}
    for(let i=0;i<2;i++)s.setMatrixAt(i,new THREE.Matrix4().makeScale(1.5,1.5,1.5).setPosition(m*4,3,-25-i));s.instanceMatrix.needsUpdate=true
    for(const phase of ['Render','Shadow'])for(const moment of ['Before','After'])s['on'+moment+phase]=function(){seen.push(this.count)}
    sources.push(s);original.push([s.onBeforeRender,s.onAfterRender,s.onBeforeShadow,s.onAfterShadow]);scene.add(s)
  }
  const value=buildOfficeBackdropTrees({THREE,scene,root,layout})
  try{
    assert.equal(value.summary().enabled,true)
    for(const s of sources)for(const phase of ['Render','Shadow']){
      s['onBefore'+phase]();assert.equal(s.count,0);s['onAfter'+phase]();assert.equal(s.count,2)
    }
    assert.ok(seen.every(n=>n===2),'other callbacks observe the original instance count')
    root.visible=false
    for(const s of sources){s.onBeforeRender();assert.equal(s.count,2);s.onAfterRender()}
    root.visible=true
    const changed=()=>{};sources[0].onAfterRender=changed;sources[0].onBeforeRender();assert.equal(sources[0].count,2,'foreign callback replacement fails closed')
    sources[0].count=0 // 其他调用方主动隐藏，退出不能把它误认成自己的临时 count。
    sources[1].onBeforeShadow();assert.equal(sources[1].count,0,'simulate renderer failure before its after-hook')
    value.dispose();value.dispose()
    assert.equal(sources[0].onAfterRender,changed)
    for(let i=0;i<sources.length;i++){
      assert.equal(sources[i].count,i===0?0:2);assert.equal(sources[i].onBeforeRender,original[i][0]);assert.equal(sources[i].onBeforeShadow,original[i][2]);assert.equal(sources[i].geometry.uuid,g.uuid)
    }
    assert.equal(root.children.length,0)
  }finally{value.dispose();g.dispose();sources.forEach(s=>{s.material.dispose();s.dispose()})}
})

test('low garden keeps all original paired vertices, normals and plants while halving leaf indices in the same batch',()=>{
  const leaves=[],bed={x:3,z:4,w:4.2,d:1.8},seed=9
  const batch={add(g,color,position){if(g.type==='BufferGeometry'&&g.attributes.position.count===18)leaves.push({p:Array.from(g.attributes.position.array),n:Array.from(g.attributes.normal.array),indices:Array.from(g.index.array),color,position});g.dispose()}}
  appendOfficeGardenBed({THREE,batch,bed,low:true,seed})
  assert.equal(leaves.length,Math.max(5,Math.round(bed.w*bed.d*1.5))*3)
  const fract=n=>n-Math.floor(n)
  for(let i=0;i<leaves.length;i++){
    const plant=Math.floor(i/3),j=i%3,old=officeLeafGeometry(THREE,plant*2.399+seed+j*2.399,.23+fract(plant*.43+j*.27)*.18,2)
    try{
      old.scale(1,.65+(plant%3)*.18,1);assert.deepEqual(leaves[i].p,Array.from(old.attributes.position.array));assert.deepEqual(leaves[i].n,Array.from(old.attributes.normal.array));assert.equal(leaves[i].indices.length,old.index.count/2)
      for(let k=0;k<leaves[i].indices.length;k+=3){const vertices=leaves[i].indices.slice(k,k+3).map(id=>new THREE.Vector3().fromArray(leaves[i].p,id*3)),normal=new THREE.Triangle(...vertices).getNormal(new THREE.Vector3());assert.ok(new THREE.Triangle(...vertices).getArea()>1e-8);for(const id of leaves[i].indices.slice(k,k+3))assert.ok(normal.dot(new THREE.Vector3().fromArray(leaves[i].n,id*3))>0)}
    }finally{old.dispose()}
  }
})
