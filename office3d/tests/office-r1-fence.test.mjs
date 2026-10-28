import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { buildR1Shell, r1FrontHeight, r1FenceSpec } from '../office-vis2/r1-shell.js'
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

test('FENCE profile-cut instanced ironwork stays within the original closed wall footprint and doorway',()=>scene(({root,layout})=>{
 const proxy=root.getObjectByName('r1-collision-front'), footprint=triangles(proxy).filter(t=>[t.a,t.b,t.c].every(p=>Math.abs(p.y)<1e-8))
 assert.equal(proxy.visible,false);assert.ok(proxy.isMesh&&!proxy.isInstancedMesh)
 const meshes=visibleFence(root);assert.equal(meshes.length,4);assert.equal(root.getObjectByName('r1-front-slope-wall'),undefined)
 for(const mesh of meshes){
  assert.equal(mesh.userData.wallIds.length,6);assert.equal(new Set(mesh.userData.faceIds).size,12)
  assert.equal(mesh.isInstancedMesh===true,mesh.name!=='r1-fence-base')
  for(let i=0;i<(mesh.count||1);i++){
   const p=points(mesh,i)
   for(const v of p){
    const flat=new THREE.Vector3(v.x,0,v.z),min=Math.min(...footprint.map(t=>t.closestPointToPoint(flat,new THREE.Vector3()).distanceTo(flat)))
    assert.ok(min<=.001,`${mesh.name}/${i}: footprint ${min}`)
    assert.ok(v.x<=-1.5+.001 || v.x>=5.5-.001,`${mesh.name}/${i}: doorway ${v.x}`)
   }
   if(mesh.name==='r1-fence-base'){near(Math.min(...p.map(v=>v.y)),0,.005);near(Math.max(...p.map(v=>v.y)),.3)}
   if(/bars|posts/.test(mesh.name))for(let j=0;j<p.length;j++){
    if(mesh.geometry.attributes.position.getY(j)>.5)near(p[j].y,r1FrontHeight(p[j].x+26,layout.r1.data.walls))
    else near(p[j].y,.3)
   }
  }
 }
 const iron=root.getObjectByName('r1-fence-bars').material
 assert.equal(iron.color.getHexString(),'2e2f31');assert.equal(iron.metalness,.6);assert.equal(iron.roughness,.45);assert.equal(iron.transparent,false)
 for(const kind of ['bars','posts'])for(const path of [0,1]){
  const mesh=root.getObjectByName('r1-fence-'+kind),rows=mesh.userData.parts.filter(p=>p.path===path)
  for(let i=1;i<rows.length;i++){const gap=rows[i].distance-rows[i-1].distance;assert.ok(gap<=(kind==='bars'?.15:3));if(kind==='bars')assert.ok(gap>=.1)}
 }
 assert.ok(Object.isFrozen(r1FenceSpec))
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

test('FENCE rail spacing, section sizes, end planes and iron batch resource cleanup are fixed',()=>scene(({root,layout,shell})=>{
 const bars=root.getObjectByName('r1-fence-bars'),posts=root.getObjectByName('r1-fence-posts'),rails=root.getObjectByName('r1-fence-rails'),matrix=new THREE.Matrix4()
 for(const [mesh,width] of [[bars,.025],[posts,.1]])for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);near(new THREE.Vector3().setFromMatrixColumn(matrix,0).length(),width,1e-7);near(new THREE.Vector3().setFromMatrixColumn(matrix,2).length(),width,1e-7)}
 for(let i=0;i<rails.count;i+=4){
  const heights=[]
  for(let j=0;j<4;j++){rails.getMatrixAt(i+j,matrix);near(new THREE.Vector3().setFromMatrixColumn(matrix,1).length(),.05,1e-7);near(new THREE.Vector3().setFromMatrixColumn(matrix,2).length(),.03,1e-7);heights.push(matrix.elements[13]+.025)}
  near(heights[0],.4);near(heights[3],r1FrontHeight(matrix.elements[12]+26,layout.r1.data.walls)-.05)
  for(let j=1;j<4;j++)assert.ok(heights[j]-heights[j-1]<=1.5+.000001)
 }
 for(const path of [0,1]){
  const indexes=posts.userData.parts.flatMap((r,i)=>r.path===path?[i]:[]),first=points(posts,indexes[0]),last=points(posts,indexes.at(-1))
  // End-plane contact, not a post centred across the opening.
  if(path===0){near(Math.max(...last.map(p=>p.x)),-1.5);assert.ok(first.some(p=>p.x<-25.99))}
  else{near(Math.min(...first.map(p=>p.x)),5.5);assert.ok(last.some(p=>p.x>29.99))}
 }
 const disposed=[];bars.geometry.addEventListener('dispose',()=>disposed.push('geometry'));bars.material.addEventListener('dispose',()=>disposed.push('material'));shell.dispose();assert.deepEqual(disposed,['geometry','material'])
}))
