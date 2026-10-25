import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3_ALIGN as layout} from '../office-layout.js'
import {buildOfficeAlignedShell} from '../office-vis2/shell-finish.js'
import {buildOfficeTeaBarSample} from '../office-vis2/bar.js'
import {barSeats,barLounges,barColliders} from '../office-bar-geometry.js'

const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} vs ${b}`)
for(const low of [false,true])test(`ALIGN ${low?'low':'high'} bar furniture rests on actual shell floor without moving seats or colliders`,()=>{
 const root=new THREE.Group(),shell=buildOfficeAlignedShell({THREE,root,layout,low,search:'?officeSample=1'}),bar=buildOfficeTeaBarSample({THREE,root,layout,low})
 root.updateMatrixWorld(true)
 try{
  const floorAt=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(shell.ground)[0].point.y
  const stools=root.getObjectByName('tea-bar-instanced-stools'),p=stools.geometry.attributes.position,m=new THREE.Matrix4(),v=new THREE.Vector3()
  assert.equal(stools.count,10)
  for(let i=0;i<stools.count;i++){
   stools.getMatrixAt(i,m);m.premultiply(stools.matrixWorld);const origin=new THREE.Vector3().setFromMatrixPosition(m),ys=[]
   for(let j=0;j<p.count;j++)if(p.getY(j)<.16&&Math.hypot(p.getX(j),p.getZ(j))>.15)ys.push(v.fromBufferAttribute(p,j).applyMatrix4(m).y)
   assert.ok(ys.length>50);close(Math.min(...ys),floorAt(origin.x,origin.z),'base bottom');close(Math.max(...ys)-Math.min(...ys),.04,'visible base thickness')
  }
  const sofas=root.getObjectByName('tea-bar-instanced-lounges'),q=sofas.geometry.attributes.position
  assert.equal(sofas.count,6)
  for(let i=0;i<sofas.count;i++){
   sofas.getMatrixAt(i,m);m.premultiply(sofas.matrixWorld)
   for(const x of [-.52,.52])for(const z of [-.15,.15]){
    const ys=[];for(let j=0;j<q.count;j++)if(Math.abs(q.getX(j)-x)<.036&&Math.abs(q.getZ(j)-z)<.036&&q.getY(j)<.231)ys.push(q.getY(j))
    assert.ok(ys.length>=36,'a complete support box exists at each foot');close(Math.min(...ys),.08,'foot bottom');close(Math.max(...ys),.23,'foot meets underside of wooden frame')
    const foot=new THREE.Vector3(x,.08,z).applyMatrix4(m);close(foot.y,floorAt(foot.x,foot.z),'world-space foot contact')
   }
  }
  for(const mesh of [stools,sofas]){
   const q=mesh.geometry.attributes.position
   for(let j=0;j<q.count;j++)if(q.getY(j)<.231&&mesh===sofas)assert.ok(Math.abs(q.getX(j))<=.635001&&Math.abs(q.getZ(j))<=.200001,'supports stay inside old base footprint')
  }
  const body=root.getObjectByName('tea-bar-body-top-equipment'),x=layout.bar.center.x+1.5,z=layout.bar.center.z
  const hit=new THREE.Raycaster(new THREE.Vector3(x,.2,z),new THREE.Vector3(0,-1,0)).intersectObject(body)[0]
  assert.ok(hit);close(hit.point.y-floorAt(x,z),.002,'inner preparation paving is visible above floor')
  assert.deepEqual(bar.colliders,barColliders(layout));assert.deepEqual(bar.lounges,barLounges(layout))
  assert.deepEqual(bar.seats.map(({id,x,z,yaw})=>({id,x,z,yaw})),barSeats(layout,low).map(({id,x,z,yaw})=>({id,x,z,yaw})))
  assert.equal(bar.summary().calls,6)
 }finally{bar.dispose();shell.dispose()}
 assert.equal(root.children.length,0)
})
