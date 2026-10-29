import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { buildR1Shell, r1FrontHeight, r1FenceSpec, r1FenceHeight, r1FenceSigns } from '../office-vis2/r1-shell.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Doors } from '../office-vis2/r1-doors.js'
import { createFurnitureCollision } from '../furniture-collision.js'
const near = (a,b,t=.001) => assert.ok(Math.abs(a-b)<=t, `${a} != ${b}`)
function scene(check) {
 const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillText(){},clearRect(){}})})}
 const root=new THREE.Group(),layout=createOfficeR1Layout(),collision=createFurnitureCollision();let shell
 try {shell=buildR1Shell({THREE,root,layout,collision});root.updateMatrixWorld(true);return check({root,layout,collision,shell})}finally{shell?.dispose();globalThis.document=old}
}
function points(mesh,i=0){
 const matrix=mesh.matrixWorld.clone(),instance=new THREE.Matrix4(),proxy=new THREE.Mesh(mesh.geometry)
 if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);matrix.multiply(instance);if(mesh.morphTexture)mesh.getMorphAt(i,proxy)}
 return Array.from({length:mesh.geometry.attributes.position.count},(_,j)=>proxy.getVertexPosition(j,new THREE.Vector3()).applyMatrix4(matrix))
}
function triangles(mesh,i=0){const p=points(mesh,i),index=mesh.geometry.index;return Array.from({length:(index?.count||p.length)/3},(_,j)=>new THREE.Triangle(...[0,1,2].map(k=>p[index?index.getX(j*3+k):j*3+k])))}
const visibleFence = root => root.children[0].children.filter(m=>m.name.startsWith('r1-fence-'))

test('FENCE R2 modern copper fins and strips retain the wall band and approved smooth profile',()=>scene(({root,layout})=>{
 const proxy=root.getObjectByName('r1-collision-front'),footprint=triangles(proxy).filter(t=>[t.a,t.b,t.c].every(p=>Math.abs(p.y)<1e-8)),metal=root.getObjectByName('r1-fence-metal')
 assert.equal(proxy.visible,false);assert.ok(proxy.isMesh&&!proxy.isInstancedMesh)
 assert.equal(visibleFence(root).length,5)
 for(const name of ['r1-front-slope-wall','r1-fence-bars','r1-fence-rails','r1-fence-posts'])assert.equal(root.getObjectByName(name),undefined)
 for(const mesh of visibleFence(root)){assert.equal(mesh.userData.wallIds.length,6);assert.equal(new Set(mesh.userData.faceIds).size,12)}
 for(let i=0;i<metal.count;i++){
  const row=metal.userData.parts[i],p=points(metal,i);if(row.kind==='cap')continue
  for(const v of p){const flat=new THREE.Vector3(v.x,0,v.z),gap=Math.min(...footprint.map(t=>t.closestPointToPoint(flat,new THREE.Vector3()).distanceTo(flat)));assert.ok(gap<=.001,`${row.kind}/${i}: band ${gap}`);assert.ok(v.x<=-2+.001||v.x>=6-.001)}
  for(let j=0;j<p.length;j++){
   const top=metal.geometry.attributes.position.getY(j)>.5,H=r1FenceHeight(p[j].x+26,layout.r1.data.walls)
   if(row.kind==='fin')near(p[j].y,top?H-.04:.3)
   if(row.kind==='top')near(p[j].y,top?H:H-.04)
   if(row.kind==='bottom')near(p[j].y,top?.345:.315)
  }
 }
 for(const path of [0,1]){const rows=metal.userData.parts.filter(r=>r.kind==='fin'&&r.path===path);for(let i=1;i<rows.length;i++){const gap=rows[i].distance-rows[i-1].distance;assert.ok(gap>=.16&&gap<=.20)}}
 assert.equal(metal.material.color.getHexString(),'9a7b52');assert.equal(metal.material.metalness,.75);assert.equal(metal.material.roughness,.32);assert.equal(metal.material.transparent,false)
 assert.equal(root.getObjectByName('r1-fence-stone').material.color.getHexString(),'bdb3a3')
 for(const x of [0,56])near(r1FenceHeight(x,layout.r1.data.walls),3)
 for(const x of [21,24,32,35])near(r1FenceHeight(x,layout.r1.data.walls),1.2)
 for(let x=0;x<=56;x+=.125)near(r1FenceHeight(x,layout.r1.data.walls),r1FenceHeight(56-x,layout.r1.data.walls),1e-9)
 assert.ok(Object.isFrozen(r1FenceSpec))
 const wallLines=layout.r1.data.walls.filter(w=>/^00-W-00[5-9]$|^00-W-010$/.test(w.id)).flatMap(w=>w.geometry.points.slice(1).map((p,i)=>new THREE.Line3(new THREE.Vector3(w.geometry.points[i][0]-26,0,18-w.geometry.points[i][1]),new THREE.Vector3(p[0]-26,0,18-p[1]))))
 for(const p of points(root.getObjectByName('r1-fence-planters'))){p.y=0;const gap=Math.min(...wallLines.map(l=>l.closestPointToPoint(p,true,new THREE.Vector3()).distanceTo(p)));assert.ok(gap>=.2-.001&&gap<=.8+.001, 'planter band '+gap)}

}))

test('FENCE real collision retains all 618 samples and blocks exterior-to-interior movement every 0.25m',()=>scene(({layout,collision,root})=>{
 let samples=0,pushes=0
 for(const wall of layout.r1.data.walls)for(let i=1;i<wall.geometry.points.length;i++){
  const a=wall.geometry.points[i-1],b=wall.geometry.points[i]
  for(const t of [.25,.5,.75]){assert.ok(collision.hit(a[0]+(b[0]-a[0])*t-26,18-a[1]-(b[1]-a[1])*t));samples++}
 }
 assert.equal(samples,618)
 for(const ids of [['00-W-005','00-W-006','00-W-009'],['00-W-010','00-W-007','00-W-008']]){
  const path=ids.flatMap((id,i)=>layout.r1.data.walls.find(w=>w.id===id).geometry.points.slice(i?1:0)),segs=[];let total=0
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);segs.push({a,b,l,s:total});total+=l}
  for(let d=.25;d<total-.1;d+=.25){const s=segs.find(s=>d<=s.s+s.l),t=(d-s.s)/s.l,x=s.a[0]+(s.b[0]-s.a[0])*t-26,z=18-s.a[1]-(s.b[1]-s.a[1])*t,nx=(s.b[1]-s.a[1])/s.l,nz=(s.b[0]-s.a[0])/s.l,p={x:x+nx*.6,z:z+nz*.6};collision.move(p,-nx*1.2,-nz*1.2);assert.ok((p.x-x)*nx+(p.z-z)*nz>=0,`${ids[0]} @ ${d}`);pushes++}
 }
 assert.ok(pushes>=198)
 const p={x:2,z:19};collision.move(p,0,-2);near(p.z,17,.00001)
 assert.equal(collision.hit(2,18),null)
 assert.equal(collision.hit(-2,18)?.group.name,'r1-collision-front')
}))

test('FENCE all 13 door sweeps have zero intersections with expanded rendered fence geometry',()=>scene(({root,layout})=>{
 const obstacles=visibleFence(root).flatMap(m=>Array.from({length:m.count||1},(_,i)=>{const p=points(m,i);return {name:m.name,box:new THREE.Box3().setFromPoints(p),triangles:triangles(m,i)}}))
 const doors=buildR1Doors({THREE,root,layout})
 for(const row of doors.records)for(let step=0;step<=24;step++){
  const p=doors.positionAt(row,step/24),box=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(p.x,row.height/2,p.z),new THREE.Vector3(row.vertical?row.thickness:row.width,row.height,row.vertical?row.width:row.thickness)).expandByScalar(-.000001)
  for(const o of obstacles)if(box.intersectsBox(o.box))assert.ok(!o.triangles.some(t=>box.intersectsTriangle(t)),`${row.id}@${step}: ${o.name}`)
 }
 doors.dispose()
}))

test('FENCE R2 section dimensions, atlas strings, pillar position and disposal stay explicit',()=>scene(({root,shell})=>{
 const metal=root.getObjectByName('r1-fence-metal'),matrix=new THREE.Matrix4()
 for(let i=0;i<metal.count;i++){metal.getMatrixAt(i,matrix);const r=metal.userData.parts[i],w=new THREE.Vector3().setFromMatrixColumn(matrix,0).length(),h=new THREE.Vector3().setFromMatrixColumn(matrix,1).length(),d=new THREE.Vector3().setFromMatrixColumn(matrix,2).length();if(r.kind==='fin'){near(w,.012,1e-7);near(d,.06,1e-7)}if(r.kind==='bottom'){near(h,.03);near(d,.07)}if(r.kind==='top'){near(h,.04);near(d,.08)}if(r.kind==='cap'){near(w,.62);near(h,.12);near(d,.62);near(matrix.elements[13],4);near(matrix.elements[14],18.15)}}
 const stone=root.getObjectByName('r1-fence-stone'),p=points(stone)
 for(const r of stone.userData.ranges){const vs=p.slice(r.start,r.start+r.count),b=new THREE.Box3().setFromPoints(vs),size=b.getSize(new THREE.Vector3());if(r.id.startsWith('fence-pillar')){near(size.x,.5);near(size.y,3.6);near(size.z,.5);near(b.min.y,0,.005);near(b.min.z,17.9);near(b.max.z,18.4)}if(r.id==='fence-lintel'){near(size.x,8);near(size.y,.4);near(size.z,.5);near(b.min.y,3.6)}if(r.id==='plinth'){near(b.min.y,0,.005);near(b.max.y,.3)}}
 const signs=root.getObjectByName('r1-fence-signs');assert.equal(signs.material.map.isCanvasTexture,true);assert.equal(signs.geometry.index.count,18)
 assert.deepEqual(r1FenceSigns.map(s=>[s.text,s.localX]),[['吴哥远望启新程',24.25],['湄水长流通四海',31.75],['智序工场',28]])
 for(const p of points(signs))near(p.z,18.401,.00001)
 for(let i=0;i<signs.geometry.attributes.normal.count;i++)assert.equal(signs.geometry.attributes.normal.getZ(i),1)
 const planter=root.getObjectByName('r1-fence-planters'),bp=new THREE.Box3().setFromPoints(points(planter));near(bp.min.y,0,.005);near(bp.max.y,.44)
 for(const p of points(planter))assert.ok(p.x<=-2.02+.000001||p.x>=6.02-.000001)
 const disposed=[];metal.geometry.addEventListener('dispose',()=>disposed.push('geometry'));metal.material.addEventListener('dispose',()=>disposed.push('material'));shell.dispose();assert.deepEqual(disposed,['geometry','material'])
}))

test('FENCE R4 real 101-phase main gate: boundary contact only, 30mm sliding gap and lintel clearance',()=>scene(({root,layout})=>{
 const stone=root.getObjectByName('r1-fence-stone'),obstacles=stone.userData.boxes.map(r=>({id:r.id,box:new THREE.Box3(new THREE.Vector3(...r.min),new THREE.Vector3(...r.max))})),doors=buildR1Doors({THREE,root,layout})
 let contacts=0,sliding=0
 doors.doors.setAll('closed');doors.onFrame(2);doors.doors.setAll('open')
 for(let step=0;step<=100;step++){
  if(step)doors.onFrame(step===100?2:.012);root.updateMatrixWorld(true)
  for(const mesh of doors.root.children)if(mesh.isInstancedMesh)for(let i=0;i<mesh.count;i++){
   if(!/^11-D-001-LF/.test(mesh.userData.itemIds[i]))continue
   const b=new THREE.Box3().setFromPoints(points(mesh,i))
   for(const {id,box} of obstacles){
    const overlap=['x','y','z'].map(k=>Math.min(b.max[k],box.max[k])-Math.max(b.min[k],box.min[k])),gaps=['x','y','z'].map(k=>Math.max(0,b.min[k]-box.max[k],box.min[k]-b.max[k]))
    assert.ok(!overlap.every(v=>v>1e-6),`${id}/${step}: positive volume`)
    if(id==='fence-lintel'){assert.ok(gaps[1]>=.03-1e-6);continue}
    if(overlap[0]>.001){assert.ok(gaps[2]>=.03-1e-6);sliding++}
    if(gaps.every(v=>v<=1e-6)){const plane=id.endsWith('-1.75')?-1.5:5.5;near(Math.max(b.min.x,box.min.x),plane,1e-6);near(Math.min(b.max.x,box.max.x),plane,1e-6);contacts++}
   }
  }
 }
 assert.equal(contacts,32);assert.ok(sliding>0);doors.dispose()
}))

test('FENCE planters/pillars use real solid collision; seeded foliage repeats byte-for-byte',()=>scene(({root,collision})=>{
 for(const x of [-1.75,5.75])assert.ok(collision.hit(x,18.35))
 for(const x of [-3,7])assert.ok(collision.hit(x,18.6))
 const before=root.getObjectByName('r1-fence-shrubs').instanceMatrix.array.slice()
 scene(({root:again})=>assert.deepEqual(again.getObjectByName('r1-fence-shrubs').instanceMatrix.array,before))
}))
