import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import {WH_R1_DATA,WH_R1_ASSIGNMENT} from '../wh-r1/data.js'
import {WH_R1_FLOOR_Y,whToWorld} from '../wh-r1-layout.js'
import {buildWhR1Workflow,WH_R1_CONVEYOR_PATH} from '../dr-wh-r1-workflow.js'
import {buildWhR1Shell} from '../dr-wh-r1-shell.js'
import {buildWhR1Racks} from '../dr-wh-r1-racks.js'
import {createCampusRegistry} from '../dr-campus-registry.js'
import {createFurnitureCollision} from '../furniture-collision.js'

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<=.005,`${message}: ${a} / ${b}`)
const source=id=>WH_R1_DATA.elements.find(r=>r.id===id)
function rendered(root){
  root.updateMatrixWorld(true);const result=new Map(),matrix=new THREE.Matrix4()
  root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.collisionProxy||!mesh.userData.instanceToRegisterId)return;mesh.geometry.computeBoundingBox()
    mesh.userData.instanceToRegisterId.forEach((id,i)=>{mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix)
      for(const key of [id,mesh.userData.assemblyIds?.[i]].filter(Boolean)){if(!result.has(key))result.set(key,new THREE.Box3());result.get(key).union(box)}
    })
  });return result
}
const texture=()=>new THREE.Texture()

test('I4 floor offset lands racks without changing 464 registered planar dimensions; I2 embed stays 10mm',()=>{
  const root=new THREE.Group(),shell=buildWhR1Shell({THREE,root,quality:{tier:'high'}}),racks=buildWhR1Racks({THREE,root,canvasTex:texture});root.updateMatrixWorld(true)
  near(root.getObjectByName('wh-r1-building-floor').position.y,WH_R1_FLOOR_Y,'floor')
  const walls=[];root.traverse(m=>{if(m.name.startsWith('wh-r1-wall-'))walls.push(m)})
  assert.equal(walls.length,34);for(const m of walls)near(new THREE.Box3().setFromObject(m).min.y-WH_R1_FLOOR_Y,-.01,m.name)
  const rows=rendered(root),ids=WH_R1_DATA.elements.filter(r=>['货架立柱框占位','货架横梁占位','托盘占位子件','架端防撞占位','货架格控制体'].includes(r.category))
  assert.equal(ids.length,464)
  for(const r of ids){const box=rows.get(r.id),p=whToWorld(r.xM,r.yM),c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());near(c.x,p.x,r.id);near(c.z,p.z,r.id);near(s.x,r.lengthM,r.id);near(s.z,r.widthM,r.id);near(box.min.y,WH_R1_FLOOR_Y+r.zM,r.id)}
  racks.dispose();shell.dispose()
})

test('I4 real merged high/low scenes retain all 155 workflow IDs, bounds, elevations and eight chair directions',async()=>{
  const code=readFileSync(new URL('../merge.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('../vendor/three/three.module.js',import.meta.url).href}'`)
  const {mergeStatic}=await import(`data:text/javascript,${encodeURIComponent(code)}`),prior=globalThis.location
  try{globalThis.location={search:'?place=drlife-warehouse&whr1=1'}
    for(const tier of ['high','low']){
      const scene=new THREE.Scene(),registry=createCampusRegistry({THREE,scene,quality:{tier},layout:{}});registry.buildAll({quality:{tier},canvasTex:texture});mergeStatic(scene)
      assert.deepEqual(registry.summary().skipped,[]);assert.deepEqual(registry.summary().modules,['wh-r1-shell','wh-r1-zones','wh-r1-racks','wh-r1-workflow'])
      const root=scene.getObjectByName('wh-r1-workflow'),boxes=rendered(root),ids=WH_R1_ASSIGNMENT.filter(a=>a.card==='I4').map(a=>a.id)
      assert.equal(ids.length,155);assert.deepEqual(root.userData.registerIds,ids)
      for(const id of ids){const row=source(id),box=boxes.get(id);assert.ok(box,id);near(box.min.y,WH_R1_FLOOR_Y+row.zM,id)
        if(row.category==='待解决交叉点')continue
        const p=whToWorld(row.xM,row.yM),expected=new THREE.Box3(new THREE.Vector3(-row.lengthM/2,0,-row.widthM/2),new THREE.Vector3(row.lengthM/2,row.heightM,row.widthM/2)).applyMatrix4(new THREE.Matrix4().makeRotationY(row.yawDeg*Math.PI/180)).translate(new THREE.Vector3(p.x,WH_R1_FLOOR_Y+row.zM,p.z))
        for(const axis of ['x','y','z']){near(box.min[axis],expected.min[axis],id+' min '+axis);near(box.max[axis],expected.max[axis],id+' max '+axis)}
      }
      assert.equal(root.userData.orientations.length,8)
      for(const r of root.userData.orientations){const chair=source(r.id),table=source(r.id.replace('-CH-','-TB-')),a=whToWorld(chair.xM,chair.yM),b=whToWorld(table.xM,table.yM);assert.ok(-Math.sin(r.yaw)*(b.x-a.x)-Math.cos(r.yaw)*(b.z-a.z)>0,r.id)}
      registry.dispose();assert.equal(scene.getObjectByName('wh-r1-workflow'),undefined)
    }
  }finally{globalThis.location=prior}
})

test('I4 retains exact drawing conflicts and the two occupied chair envelopes',()=>{
  const eq=source('WH-04-EQ-002'),cv=source('WH-04-CV-001');near((eq.yM+eq.lengthM/2)-(cv.yM-cv.widthM/2),.204,'EQ overlap')
  const cross=source('WH-05-CV-005')
  for(const id of ['WH-05-CH-003','WH-05-CH-004']){const chair=source(id);near(chair.yM-chair.widthM/2-(cross.yM+cross.widthM/2),.15,'static gap');near(cross.yM+cross.widthM/2-(chair.yM-.5),.05,'occupied overlap')}
  const p05=WH_R1_DATA.integrityAudit.routes.find(r=>r.id==='P05');assert.equal(p05.status,'BLOCKED');assert.equal(p05.min_clearance_mm,-450);assert.deepEqual(p05.nearest_ids,['WH-04-CV-003'])
  const root=new THREE.Group(),value=buildWhR1Workflow({THREE,root}),markers=root.getObjectByName('wh-r1-workflow-markers').userData.instanceToRegisterId
  for(const id of ['conflict-EQ-002','P05-BLOCKED','WH-05-CH-003-use','WH-05-CH-004-use','WH-05-CH-003-overlap','WH-05-CH-004-overlap'])assert.ok(markers.includes(id));value.dispose()
})

test('I4 conveyor joins, 1200 moving frames, hidden pause, stationary footprint and disposal',()=>{
  const rows=WH_R1_DATA.elements.filter(r=>r.category==='输送线模块'),path=WH_R1_CONVEYOR_PATH
  assert.equal(rows.length,10);assert.equal(path.length,11)
  rows.forEach((row,i)=>{const a=row.yawDeg*Math.PI/180;for(const [end,sign]of [[i,-1],[i+1,1]]){const p=whToWorld(row.xM+sign*Math.cos(a)*row.lengthM/2,row.yM+sign*Math.sin(a)*row.lengthM/2);near(path[end].x,p.x,row.id);near(path[end].z,p.z,row.id)}})
  const root=new THREE.Group(),value=buildWhR1Workflow({THREE,root,quality:{tier:'high'},canvasTex:texture}),matrix=new THREE.Matrix4(),pos=new THREE.Vector3()
  for(let frame=0;frame<1200;frame++){value.onFrame(.1);for(let i=0;i<value.cargo.count;i++){value.cargo.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix)
    assert.ok(rows.some(row=>{const p=whToWorld(row.xM,row.yM),a=row.yawDeg*Math.PI/180,dx=pos.x-p.x,dz=pos.z-p.z;return Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<=row.lengthM/2+.001&&Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<.001}));near(pos.y-.09,.9,'cargo belt height')
  }}
  const before=Array.from(value.cargo.instanceMatrix.array),doc=globalThis.document
  try{globalThis.document={hidden:true};value.onFrame(100);assert.deepEqual(Array.from(value.cargo.instanceMatrix.array),before)}finally{globalThis.document=doc}
  let disposed=0;value.cargo.geometry.addEventListener('dispose',()=>disposed++);value.dispose();value.dispose();assert.equal(disposed,1);assert.equal(root.children.length,0)
})

test('I4 actual collision in a floor-zero test scene blocks solids and keeps P01/P04 clear',()=>{
  // The shared collider's standing capsule uses floor zero; translate the entire scene, never an individual proxy.
  const root=new THREE.Group();root.position.y=-WH_R1_FLOOR_Y
  const collision=createFurnitureCollision(),value=buildWhR1Workflow({THREE,root,collision})
  for(const r of value.records.filter(r=>['低位拣选架总成','墙边短架','工作台','拣选长工作台','输送线模块','工艺设备占位','地面托盘载荷占位','盆器'].includes(r.category))){const p=whToWorld(r.xM,r.yM),a=r.yawDeg*Math.PI/180
    const x=p.x+Math.cos(a)*(r.lengthM/2-.01),z=p.z-Math.sin(a)*(r.lengthM/2-.01);assert.ok(collision.hit(x,z),r.id)
  }
  for(const id of ['P01','P04']){const route=WH_R1_DATA.routes.find(r=>r.id===id),a=whToWorld(...route.points[0]),b=whToWorld(...route.points[1]);for(let i=0;i<=100;i++)assert.equal(collision.hit(a.x+(b.x-a.x)*i/100,a.z+(b.z-a.z)*i/100),null,id)}
  value.dispose();assert.equal(collision.stats().bodies,0)
})

test('I4 a throwing workflow frame is isolated by the real registry and does not stop other modules',()=>{
  const prior=globalThis.location;globalThis.location={search:''}
  try{const scene=new THREE.Scene(),registry=createCampusRegistry({THREE,scene,quality:{tier:'high'},layout:{}});let ticks=0
    registry.register('workflow',buildWhR1Workflow);registry.register('observer',()=>({onFrame(){ticks++}}));registry.buildAll()
    scene.getObjectByName('wh-r1-workflow-cargo').setMatrixAt=()=>{throw Error('injected frame failure')}
    registry.onFrame(.1);registry.onFrame(.1);assert.equal(ticks,2);registry.dispose()
  }finally{globalThis.location=prior}
})
