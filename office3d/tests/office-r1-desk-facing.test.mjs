import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Furniture, R1_SEATED_PROFILES } from '../office-vis2/r1-furniture.js'
import { createFurnitureCollision } from '../furniture-collision.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { r1ReceptionCenter } from '../office-vis2/r1-lounge.js'
const hooks = registerHooks({ resolve(s,c,next) { return s === 'three' ? {url:new URL('../vendor/three/three.module.js',import.meta.url).href,shortCircuit:true}:next(s,c) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()
const models=['computerKeyboard','computerMouse','books','lampRoundTable','plantSmall1','computerScreen','table','chairModernCushion','bookcaseOpen','cabinetTelevision','chairRounded'];const extraAssets={};for(const name of models){const b=readFileSync(new URL('../assets/models/furniture/'+name+'.glb',import.meta.url));extraAssets[name]=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}
const bytes = readFileSync(new URL('../assets/models/furniture/desk.glb',import.meta.url))
const chairBytes=readFileSync(new URL('../assets/models/furniture/chairDesk.glb',import.meta.url))
const A = {furn:{...extraAssets,desk:(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene,chairDesk:(await new GLTFLoader().parseAsync(chairBytes.buffer.slice(chairBytes.byteOffset,chairBytes.byteOffset+chairBytes.byteLength),'')).scene}}

// Identify the broad vertical face pair by geometry, without a fixed board coordinate or triangle ID.
function boardCenter(group) {
  group.updateWorldMatrix(true,true)
  const planes = new Map()
  group.traverse(m=>{if(!m.isMesh)return;const g=m.geometry,p=g.attributes.position,ix=g.index
    for(let i=0;i<(ix?ix.count:p.count);i+=3){const vs=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(m.matrixWorld)),tri=new THREE.Triangle(...vs),n=tri.getNormal(new THREE.Vector3())
      if(Math.abs(n.y)>1e-6)continue
      const axis=Math.abs(n.x)>.99999?'x':Math.abs(n.z)>.99999?'z':null;if(!axis)continue
      const key=axis+':'+vs[0][axis].toFixed(6),box=planes.get(key)||new THREE.Box3();vs.forEach(v=>box.expandByPoint(v));planes.set(key,box)
    }
  })
  const faces=[...planes].map(([key,box])=>({axis:key[0],box,size:box.getSize(new THREE.Vector3()),center:box.getCenter(new THREE.Vector3())})).filter(f=>f.size.y>.3&&Math.max(f.size.x,f.size.z)>.8)
  const pairs=[];for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){const a=faces[i],b=faces[j],thin=Math.abs(a.center[a.axis]-b.center[a.axis]);if(a.axis===b.axis&&thin>1e-6&&thin<=.05&&Math.abs(a.size.y-b.size.y)<1e-6&&Math.abs(Math.max(a.size.x,a.size.z)-Math.max(b.size.x,b.size.z))<1e-6)pairs.push([a,b])}
  assert.equal(pairs.length,1,'one broad thin vertical board')
  return pairs[0][0].center.clone().add(pairs[0][1].center).multiplyScalar(.5)
}

test('R5: 78 desks have registered footprints, open undersides and far-side boards',()=>{
  const base=createOfficeR1Layout(),layout={...base,r1:{...base.r1,elements:base.r1.elements.filter(i=>['办公桌','办公椅'].includes(i.category))}},root=new THREE.Group(),collision=createFurnitureCollision(),models=[]
  const f=buildR1Furniture({THREE,root,layout,A,placeFurniture,makeScreenTexture:()=>({ctx:{},tex:new THREE.Texture()}),collision:{...collision,add(g,k){models.push(g);return collision.add(g,k)}}})
  const desks=layout.r1.elements.filter(i=>i.category==='办公桌'),chairs=layout.r1.elements.filter(i=>i.category==='办公椅'),rows=[]
  assert.equal(desks.length,78);assert.equal(chairs.length,78)
  const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<=.002,label+`: ${actual} vs ${expected}`)
  for(const item of desks){
    const nearest=chairs.filter(c=>Math.hypot(c.xM-item.xM,c.yM-item.yM)<=1.2);assert.equal(nearest.length,1,item.id)
    const world=r1ToWorld(item.xM,item.yM),chair=r1ToWorld(nearest[0].xM,nearest[0].yM),after=models.find(g=>g.userData.r1Id===item.id),before=placeFurniture(A,'desk',world.x,world.z,{scale:1,rotY:-item.yawDeg*Math.PI/180})
    before.group.scale.set(item.lengthM/before.size.x,item.heightM/before.size.y,item.widthM/before.size.z)
    const oldBox=new THREE.Box3().setFromObject(before.group),box=new THREE.Box3().setFromObject(after),board=boardCenter(after),out=new THREE.Vector3(world.x-board.x,0,world.z-board.z).normalize(),toChair=new THREE.Vector3(chair.x-world.x,0,chair.z-world.z).normalize(),angle=out.angleTo(toChair)*180/Math.PI
    assert.ok(angle<=10,item.id+' board at far side')
    const delta=Math.max(...['x','y','z'].flatMap(k=>[Math.abs(oldBox.min[k]-box.min[k]),Math.abs(oldBox.max[k]-box.max[k])]))
    assert.ok(delta<=.01,item.id+' registered box preserved')
    assert.equal(after.children.length,4)
    assert.equal(after.children[0].material.name,'wood');assert.notEqual(after.children[0].material.color.getHexString(),'9a7650')
    for(const [part,expected] of after.children.map((m,i)=>[m,[[1.4,.03,.7],[.025,.72,.7],[.025,.72,.7],[1.35,.4,.018]][i]])) {
      part.geometry.computeBoundingBox();const local=part.geometry.boundingBox.clone().translate(part.position),size=local.getSize(new THREE.Vector3())
      size.toArray().forEach((v,i)=>close(v,expected[i],part.name+' dimension'))
      assert.ok(local.min.y>=.72-1e-7 || local.max.x<=-.675+1e-7 || local.min.x>=.675-1e-7 || local.max.z<=-.282+1e-7,part.name+' outside clear underside')
    }
    close(after.children[0].position.y+.015,.75,'top height');close(after.children[3].position.z-.009,-.3,'back outer face inset')
    assert.ok(collision.hit(board.x,board.z),item.id+' real board collision')
    rows.push({id:item.id,chair:nearest[0].id,angle,delta,board:board.toArray(),before:oldBox,after:box})
  }
  console.log('R5_REAL_DESKS '+JSON.stringify(rows));f.dispose()
})
test('R4: data bytes frozen and non-R1 builder remains inert',()=>{
  assert.equal(createHash('sha256').update(readFileSync(new URL('../office-r1/data.js',import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),'ac78918393e78a943a884323e5db2bcd3cf61641e24bccc05428417cc6c084bf')
  for(const phase of ['L1','L2','L2B',undefined]){const root=new THREE.Group(),f=buildR1Furniture({THREE,root,layout:{plan1Phase:phase},A,placeFurniture,makeScreenTexture:()=>{throw Error('must not build outside R1')}});assert.equal(root.children.length,0);assert.equal(f.deskAt(0,0),null)}
})

test('R5: all desktop details stay on 78 footprints; 154 chair directions; adjusted chair keeps its base',()=>{
 const layout=createOfficeR1Layout(),root=new THREE.Group(),collision=createFurnitureCollision(),sources=[]
 const build=()=>buildR1Furniture({THREE,root,layout,A,placeFurniture,makeScreenTexture:()=>({ctx:{},tex:new THREE.Texture()}),collision:{add(g,k){sources.push(g);return collision.add(g,k)},remove:collision.remove}})
 const f=build();assert.equal(f.desktopItems.size,78);assert.equal(f.chairFacings.size,154)
 for(const [id,items] of f.desktopItems){assert.equal(items.length,4);assert.equal(new Set(items.map(i=>i.id.split('/')[1])).size,4);const box=f.itemBounds.get(id);for(const d of items)for(const axis of ['x','z']){assert.ok(d.bounds.min[axis]>=box.min[axis]-.001,d.id);assert.ok(d.bounds.max[axis]<=box.max[axis]+.001,d.id)}}
 const groups={}
 // OFFICE-R1-RECEP：接待台翻转后接待椅坐进凹面，椅心落在 11-CT-001 的登记占地框之内，
 // 「把椅心夹进桌子 AABB」这个最近点代理就退化成椅心本身（距离 0）。弧形台改按内半径弧面取最近点，
 // 断言强度不变：仍要求椅子朝向台面且距离 < 1 m。
 const arcFacing=(facing,p)=>{if(facing.category!=='弧形接待台'||facing.distance>1e-9)return facing
  const c=r1ToWorld(...r1ReceptionCenter),d=Math.hypot(p.x-c.x,p.z-c.z)
  const edge={x:c.x+(p.x-c.x)/d*1.8,z:c.z+(p.z-c.z)/d*1.8}
  return{...facing,edge,distance:Math.hypot(edge.x-p.x,edge.z-p.z)}}
 for(const [id,raw] of f.chairFacings){const item=layout.r1.elements.find(i=>i.id===id),p=r1ToWorld(item.xM,item.yM),source=sources.find(g=>g.userData.r1Id===id)
 const facing=arcFacing(raw,p),yaw=source?.rotation.y??raw.yaw
 const dot=(Math.sin(yaw)*(facing.edge.x-p.x)+Math.cos(yaw)*(facing.edge.z-p.z))/facing.distance;assert.ok(dot>.9,id);assert.ok(facing.distance<1,id);groups[facing.category]=(groups[facing.category]||0)+1}
 assert.deepEqual(groups,{'办公桌':78,'会议桌':14,'圆桌':34,'环形吧台':14,'协作桌':8,'咖啡台':5,'弧形接待台':1})
 for(const id of ['02-CH-013','02-CH-014','08-CH-023','08-CH-024','10-CH-001']){const row=layout.r1.elements.find(i=>i.id===id),actual=f.chairFacings.get(id).yaw,registered=row.facingLocal;assert.ok(Math.sin(actual)*registered[0]+Math.cos(actual)*registered[1]>.9,id+' already-facing chair preserved')}
 assert.equal(Object.keys(R1_SEATED_PROFILES).length,25)
 for(const station of layout.r1.workstations){
 const profile=f.seatedProfile(station.business_id);assert.ok(Object.isFrozen(profile));assert.ok(profile.seat>=-.04&&profile.seat<=.08);assert.ok(Number.isFinite(profile.handY)&&profile.handY>=.75&&profile.handY<=.85);assert.ok(profile.motions.length>=2&&profile.motions.some(n=>/^neutral_/.test(n)));assert.equal(new Set(profile.motions).size,profile.motions.length)
 const p=r1ToWorld(station.chairXM,station.chairYM),chair=f.chairAt(p.x,p.z),old=placeFurniture(A,'chairDesk',p.x,p.z,{scale:1,rotY:chair.rotation.y});old.group.scale.copy(chair.scale)
 const bounds=new THREE.Box3().setFromObject(chair),before=new THREE.Box3().setFromObject(old.group)
 for(const axis of ['x','z']){assert.ok(Math.abs(before.min[axis]-bounds.min[axis])<1e-6);assert.ok(Math.abs(before.max[axis]-bounds.max[axis])<1e-6)}
 assert.ok(Math.abs(before.min.y-bounds.min.y)<1e-6);assert.ok(Math.abs(bounds.max.y-before.max.y-profile.seat)<1e-6)
 assert.equal(chair.userData.seatAdjustment||0,profile.seat)
 }
 const signature=[...f.desktopItems].map(([id,items])=>[id,items.map(i=>[i.id,i.asset,i.bounds])]);const second=build();assert.deepEqual([...second.desktopItems].map(([id,items])=>[id,items.map(i=>[i.id,i.asset,i.bounds])]),signature)
 console.log('R5_CHAIR_GROUPS '+JSON.stringify(groups));f.dispose();second.dispose()
})
