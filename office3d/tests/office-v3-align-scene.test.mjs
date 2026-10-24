import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import {LAYOUT_V3,LAYOUT_V3_ALIGN as ALIGN,resolveOfficeLayout} from '../office-layout.js'
import {buildOfficeShellV3Spec} from '../office-layout-v3-scene.js'
import {officeShellFinishSpec} from '../office-vis2/shell-finish.js'
import {buildOfficeAlignedZones} from '../office-vis2/zone-finish.js'
import {alignDoorAprons,alignPassages,alignFloorSpec} from '../office-vis2/align-zones.js'
import {buildOfficeSampleHost} from '../office-vis2/host.js'
import {barSpec,barGaps,barColliders,validateIslandRings} from '../office-bar-geometry.js'
import {startOfficeV3} from '../office-v3-modules.js'
import {createFurnitureCollision} from '../furniture-collision.js'

const close=(a,b)=>assert.ok(Math.abs(a-b)<3e-6,`${a} != ${b}`)
const overlaps=(a,b)=>a.x1>b.x0+1e-6&&a.x0<b.x1-1e-6&&a.z1>b.z0+1e-6&&a.z0<b.z1-1e-6
const distance=(b,x,z)=>Math.hypot(Math.max(b.x0-x,0,x-b.x1),Math.max(b.z0-z,0,z-b.z1))
const hash=b=>createHash('sha256').update(b).digest('hex')
const canvasTex=(w,h,draw)=>{draw(new Proxy({measureText:t=>({width:String(t).length*8})},{get:(o,k)=>k in o?o[k]:()=>{}}),w,h);return new THREE.Texture()}
const textureLoader={loadAsync:async()=>new THREE.Texture()}

test('ALIGN walls have exactly one data-owned 1.5m opening in each of seven enclosed rooms',()=>{
  const spec=buildOfficeShellV3Spec(ALIGN),finish=officeShellFinishSpec(ALIGN,spec)
  assert.equal(new Set(spec.inner.map(s=>s.room.id)).size,7)
  for(const r of ALIGN.regions){
    const parts=spec.inner.filter(s=>s.room.id===r.id)
    if(!r.walled){assert.equal(parts.length,0);assert.equal(finish.wholeFloor.details.filter(p=>p.owner===r.id&&['wall-slat','ceiling-edge'].includes(p.kind)).length,0);continue}
    assert.equal(r.doors.length,1);const d=r.doors[0];close(d.width,1.5)
    for(const side of ['north','south','west','east']){
      const vertical=['west','east'].includes(side),lo=vertical?r.z0:r.x0,hi=vertical?r.z1:r.x1
      const actual=parts.filter(p=>p.side===side).map(p=>[p.lo,p.hi])
      assert.deepEqual(actual,side===d.side?[[lo,d.at-.75],[d.at+.75,hi]]:[[lo,hi]])
    }
  }
  assert.equal(finish.solid.filter(p=>p.kind==='door-header').length,7)
  assert.deepEqual(spec.outer,buildOfficeShellV3Spec(LAYOUT_V3).outer)
})

test('ALIGN floors use kind palette, a 6..10m band and non-overlapping union of every rectangular path',()=>{
  const f=alignFloorSpec(ALIGN)
  assert.equal(f.ring.inner,6);assert.equal(f.ring.outer,10)
  for(const kind of ['open','display','room'])assert.equal(new Set(f.regions.filter(r=>r.kind===kind).map(r=>r.color)).size,1)
  for(let i=0;i<f.corridors.length;i++)for(let j=i+1;j<f.corridors.length;j++)assert.equal(overlaps(f.corridors[i],f.corridors[j]),false)
  for(const p of alignPassages(ALIGN)){
    const e=ALIGN.envelope,b={x0:Math.max(p.x0,e.x0),x1:Math.min(p.x1,e.x1),z0:Math.max(p.z0,e.z0),z1:Math.min(p.z1,e.z1)}
    const covered=f.corridors.reduce((n,c)=>n+Math.max(0,Math.min(b.x1,c.x1)-Math.max(b.x0,c.x0))*Math.max(0,Math.min(b.z1,c.z1)-Math.max(b.z0,c.z0)),0)
    close(covered,(b.x1-b.x0)*(b.z1-b.z0))
  }
})

for(const low of [false,true])test(`ALIGN actual furnishing vertices, collision registration and cleanup ${low?'low':'high'}`,()=>{
  const root=new THREE.Group(),collision=createFurnitureCollision(),v=buildOfficeAlignedZones({THREE,root,layout:ALIGN,low,collision})
  try{
    assert.equal(v.furnishings.length,8);assert.equal(collision.stats().bodies,v.obstacles().length);assert.ok(v.obstacles().length>20)
    const forbidden=[...alignPassages(ALIGN),...alignDoorAprons(ALIGN)],pos=new THREE.Vector3()
    for(const f of v.furnishings)for(const p of f.placements){
      const box=new THREE.Box3(),a=f.root.geometry.attributes.position
      for(let i=p.vertices.start;i<p.vertices.start+p.vertices.count;i++)box.expandByPoint(pos.fromBufferAttribute(a,i))
      const b={x0:box.min.x,x1:box.max.x,z0:box.min.z,z1:box.max.z}
      for(const k of Object.keys(b))close(b[k],p.bounds[k])
      for(const c of forbidden)assert.equal(overlaps(b,c),false,`${p.id} intersects passage/door`)
      for(const [,x,z]of Object.values(ALIGN.seats))assert.ok(distance(b,x,z)>=1.6-1e-6,p.id+' workstation')
      assert.ok(distance(b,ALIGN.ring.center.x,ALIGN.ring.center.z)>=10-1e-6,p.id+' ring')
      assert.ok(v.obstacles().some(o=>o.id===p.id))
    }
    for(const id of ['creative','dining','leisure'])assert.ok(v.furnishings.find(f=>f.region===id).placements.some(p=>p.kind==='round-table'))
  }finally{v.dispose();v.dispose();assert.equal(root.children.length,0);assert.equal(collision.stats().bodies,0)}
})

test('ALIGN host on/off uses the same 6m collision boundary, unchanged 3.5m counter and 1.5m openings',async()=>{
  assert.equal(barSpec(ALIGN).counterRadius,3.5);assert.equal(barSpec(ALIGN).radius,6)
  for(const g of barGaps(ALIGN))assert.ok(g.width>=1.5)
  for(const search of ['', '?officeSample=1']){
    const host=buildOfficeSampleHost({THREE,root:new THREE.Group(),layout:ALIGN,search,canvasTex,textureLoader})
    try{await host.ready;assert.deepEqual(host.colliders,barColliders(ALIGN));if(search)assert.equal(host.status,'open')}
    finally{host.dispose()}
  }
  assert.deepEqual(validateIslandRings(ALIGN).errors,['SOFA_BEYOND_COLLISION'])
})

test('ALIGN real registry consumes resolved layout, exposes obstacles and marks display modules pending',async()=>{
  const scene=new THREE.Scene(),layout=resolveOfficeLayout('?layout=3&align=1'),registered=[]
  const r=startOfficeV3({THREE,scene,layout,quality:{tier:'high'},collision:{add:(p,kind)=>registered.push({p,kind}),remove:()=>{}},canvasTex})
  try{
    assert.equal(r.get('shell3').spec.inner[0].room,layout.regions.find(r=>r.id==='market'))
    assert.equal(r.get('zones').floor.regions.length,15);assert.ok(r.get('zones').obstacles().length>0)
    assert.equal(r.get('displayDepartments').pending,true);assert.equal(r.get('displayStaff').pending,true)
    assert.deepEqual(r.summary().skipped,[])
    assert.equal(registered.filter(p=>p.kind==='office3-align-furnishing').length,r.get('zones').obstacles().length)
  }finally{r.dispose()}
})

// Captured from Git f0f4632 objects, not from the candidate. Full registry without furniture asset fixture;
// the real GLTF workstation meshes are additionally compared in the offline browser evidence.
const BASE={ 'high-false':'dbe2369232851037f28e5e00af9a871c1ed0f28b50452b6a5dcdfed4d2671544', 'high-true':'cdb489b336c5b93ba7e6105c73fad2f080b79846b49f764a337329f3eff6cd8d', 'low-false':'24f2d5430d9b24f263a4201078d8977d7978acaa093fa76eaa79b99b7068e226', 'low-true':'eef066c9709d8fdc470fe28b4006ae5519865947f73e28f025b1bcf7c795be08' }
for(const tier of ['high','low'])for(const sample of [false,true])test(`stable V3 complete registry mesh/collision hash against f0f4632 ${tier}/${sample}`,async()=>{
  const scene=new THREE.Scene(),collisions=[],r=startOfficeV3({THREE,scene,layout:LAYOUT_V3,quality:{tier},search:sample?'?officeSample=1':'',canvasTex,textureLoader,collision:{add:p=>{p.updateWorldMatrix(true,true);const b=new THREE.Box3().setFromObject(p);collisions.push([b.min.toArray(),b.max.toArray()])},remove:()=>{}}})
  try{
    await r.get('island').ready;scene.updateMatrixWorld(true);const meshes=[]
    scene.traverse(m=>{if(!m.isMesh)return;const arrays={};for(const[k,a]of Object.entries({...m.geometry.attributes,index:m.geometry.index,instanceMatrix:m.instanceMatrix,instanceColor:m.instanceColor}))if(a)arrays[k]=hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));meshes.push({name:m.name,arrays,world:m.matrixWorld.toArray(),count:m.count??null,material:JSON.parse(JSON.stringify(m.material.toJSON()).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,'UUID')),visible:m.visible,castShadow:m.castShadow,receiveShadow:m.receiveShadow})})
    assert.equal(hash(JSON.stringify({meshes,collisions})),BASE[tier+'-'+sample]);assert.deepEqual(r.summary().skipped,[])
  }finally{r.dispose()}
})

test('app wiring remains a single line with the two resolved-layout arguments',()=>{
  const lines=readFileSync(new URL('../app.js',import.meta.url),'utf8').split('\n'),line=lines[962]
  assert.ok(line.includes('selectEnvironmentConflicts(environmentRoots, OFFICE_LAYOUT)'))
  assert.ok(line.includes('layout: OFFICE_LAYOUT'));assert.equal(line.includes('LAYOUT_V3'),false)
})

test('registry missing layout falls back to stable V3 without enabling ALIGN',()=>{
  const r=startOfficeV3({THREE,scene:new THREE.Scene(),quality:{tier:'low'},canvasTex})
  try{assert.equal(r.get('shell3').spec.envelope,LAYOUT_V3.envelope);assert.equal(typeof r.get('zones').obstacles,'undefined')}
  finally{r.dispose()}
})
