import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as layout,createOfficeNavigation,workHome} from '../office-layout.js'
import {buildOfficeFoyerFurniture,receptionBackdrop} from '../office-vis2/foyer.js'
import {createFurnitureCollision} from '../furniture-collision.js'

test('front/back meeting rooms retain full site dimensions, ring width and physical entry clearance',()=>{
  assert.deepEqual(layout.envelope,LAYOUT_V3.envelope);assert.deepEqual(layout.site,LAYOUT_V3.site)
  const a=layout.regions.find(r=>r.id==='review'),b=layout.regions.find(r=>r.id==='plan')
  assert.equal(a.x0,b.x0);assert.equal(a.x1,b.x1);assert.equal(a.z1,b.z0)
  for(const r of[a,b]){assert.equal(r.x1-r.x0,5);assert.equal(r.z1-r.z0,5);assert.equal(r.doors[0].side,'east');assert.equal(r.doors[0].width,1.5)}
  assert.deepEqual(layout.meetingSeats,{A:8,B:6});assert.equal(layout.ring.width,4)
  assert.ok(layout.doors.south.z-layout.frontDesk.z1>=1.2)
  assert.ok(receptionBackdrop(layout.frontDesk).z0>=layout.ring.center.z+layout.ring.outer)
  assert.equal(layout.frontDesk.center.x,layout.axis.x);assert.equal(layout.island.center.x,layout.axis.x);assert.equal(layout.plaza.center.x,layout.axis.x)
})

test('reception targets and queue slots follow the actual furniture while stable V3 coordinates remain exact',()=>{
  const current=createOfficeNavigation(layout),old=createOfficeNavigation(LAYOUT_V3)
  assert.deepEqual(current.consumerTargets.desk,{x:2,z:11.7});assert.deepEqual(current.consumerTargets.A1,{x:-3.2,z:7.7});assert.deepEqual(current.consumerTargets.A2,{x:-5.2,z:7.7});assert.deepEqual(current.consumerTargets.waiting,{x:6.5,z:7.6})
  assert.deepEqual(current.consumerQueues.desk,[11.7,12.55,13.4,14.25].map(z=>({x:2,z})))
  assert.deepEqual(old.consumerTargets,{A1:{x:-3.2,z:6.5},A2:{x:-5.2,z:6.5},desk:{x:2,z:10.5},B0:{x:-8.5,z:19},B1:{x:11.5,z:18},B2:{x:11.5,z:21},B3:{x:11.5,z:24},waiting:{x:6.5,z:6.4}})
  assert.deepEqual(old.consumerQueues.desk,[10.5,11.35,12.2,13.05].map(z=>({x:2,z})))
  for(const id of['A1','A2','waiting'])assert.ok(current.consumerQueues[id].every(p=>p.z===current.consumerTargets[id].z))
})

test('actual counter and sofa triangles clear all 200 consumer approaches and every initial queue slot',()=>{
  const root=new THREE.Group(),world=createFurnitureCollision(),foyer=buildOfficeFoyerFurniture({THREE,root,layout}),registered=[]
  foyer.root.position.y=.092;root.updateMatrixWorld(true)
  // 这是额外几何探针，不把样板未登记的前厅网格冒充生产碰撞登记；展开实例后检查真实面。
  foyer.root.traverse(m=>{
    if(!m.isMesh)return
    if(m.isInstancedMesh){for(let i=0;i<m.count;i++){const proxy=new THREE.Mesh(m.geometry,m.material),matrix=new THREE.Matrix4();m.getMatrixAt(i,matrix);proxy.matrixAutoUpdate=false;proxy.matrix.copy(m.matrixWorld).multiply(matrix);proxy.matrixWorld.copy(proxy.matrix);world.add(proxy,'foyer-geometry-probe');registered.push(proxy)}}
    else{world.add(m,'foyer-geometry-probe');registered.push(m)}
  })
  try{
    const nav=createOfficeNavigation(layout),homes=Object.values(layout.seats).map(workHome),paths=[]
    for(const home of homes)for(const[id,target]of Object.entries(nav.consumerTargets))paths.push({id,path:nav.consumerTrip(home,id,target)})
    assert.equal(paths.length,200)
    for(const[id,slots]of Object.entries(nav.consumerQueues))for(const slot of slots)paths.push({id,path:nav.consumerTrip(homes[0],id,slot)})
    for(const{id,path}of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05));for(let j=0;j<=n;j++){
      const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n,hit=world.hit(x,z)
      assert.equal(!!hit,false,`${id} route intersects actual foyer geometry at ${x},${z}`)
    }}
  }finally{for(const p of registered)world.remove(p);foyer.dispose();foyer.dispose()}
  assert.equal(world.stats().bodies,0);assert.equal(root.children.length,0)
})
