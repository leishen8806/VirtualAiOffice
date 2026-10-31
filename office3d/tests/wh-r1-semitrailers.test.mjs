import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {SEMITRAILER_SIZE,validateTruckBays,truckLod} from '../dr-wh-r1-semitrailers.js'

const base=new URL('../assets/compact/wh-trucks/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base)))
function glb(row){const compressed=fs.readFileSync(new URL(row.file,base));assert.equal(createHash('sha256').update(compressed).digest('hex'),row.sha256);const data=gunzipSync(compressed);assert.equal(data.readUInt32LE(0),0x46546c67);assert.equal(data.readUInt32LE(4),2);const jsonLength=data.readUInt32LE(12);return {json:JSON.parse(data.subarray(20,20+jsonLength).toString()),binary:data.subarray(28+jsonLength)}}

test('B1 baked GLBs, dimensions, nine-truck budgets and image bytes are measured from the assets',()=>{
 for(const [file,hash] of Object.entries(manifest.sourceHashes)){const bytes=fs.readFileSync(new URL('../../'+file,import.meta.url));const text=file.endsWith('.js')||file.endsWith('.mjs');const normalized=text?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes;assert.equal(createHash('sha256').update(normalized).digest('hex'),hash,'rebuild required: '+file);if(text)assert.equal(createHash('sha256').update(normalized.replace(/\n/g,'\r\n').replace(/\r\n/g,'\n')).digest('hex'),hash,'CRLF checkout: '+file)}
 let total=0,imageBytes=0
 for(const row of manifest.rows){
  const {json,binary}=glb(row);let triangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
  for(const mesh of json.meshes)for(const p of mesh.primitives){const a=json.accessors[p.attributes.POSITION],v=json.bufferViews[a.bufferView];triangles+=(p.indices!==undefined?json.accessors[p.indices].count:a.count)/3;assert.equal(a.componentType,5126)
    for(let i=0;i<a.count;i++)for(let c=0;c<3;c++){const x=binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+c*4);assert(Number.isFinite(x));min[c]=Math.min(min[c],x);max[c]=Math.max(max[c],x)}
  }
  assert(Math.abs(min[0]+1.275)<1e-5);assert(Math.abs(max[0]-1.275)<1e-5);assert(Math.abs(min[2]+8.25)<1e-5);assert(Math.abs(max[2]-8.25)<1e-5);assert(max[1]<=4.00001);assert(min[1]>=-1e-5)
  assert.equal(triangles,row.triangles);assert.equal(json.meshes.length,row.calls);assert(triangles*9<=(row.tier==='near'?70000:15000));assert(row.calls<=(row.tier==='near'?14:3))
  for(const image of json.images||[]){assert(!image.uri,'all textures embedded');imageBytes+=json.bufferViews[image.bufferView].byteLength}total+=row.bytes
  assert.equal(json.animations?.length||0,0)
 }
 assert(total<=3*1024*1024);assert(imageBytes<=4*1024*1024);assert.equal(SEMITRAILER_SIZE.level,'UNKNOWN')
})
test('B1 five axles and recognisable tractor / refrigerated trailer details remain in authored model',()=>{
 const r=manifest.rows[0],names=new Set(r.parts.map(p=>p.name))
 for(const name of ['cab-lower','cab-roof','A-pillar','windscreen','seat-back','steering-wheel','roof-airfoil','roof-horn','main-mirror','entry-step','fifth-wheel','refrigeration-unit','support-leg','spare-tyre','rear-lock-bar','rear-hinge','rear-impact-bar'])assert(names.has(name),name)
 assert.equal(r.parts.filter(p=>p.name==='axle').length,5);assert.equal(r.parts.filter(p=>p.name==='rounded-tyre').length,18);assert.equal(r.parts.filter(p=>p.name==='rear-lock-bar').length,4)
 const cab=r.parts.find(p=>p.name==='cab-lower'),trailer=r.parts.find(p=>p.name==='refrigerated-body');assert(cab.bounds[0][2]>trailer.bounds[1][2]);assert(cab.bounds[1][0]<trailer.bounds[1][0])
})
test('B1 bay adapter rejects missing doors, duplicate identity and invalid geometry without inventing world coordinates',()=>{
 const b={id:'different-site-truck',dockDoor:'dock-77',fleetNumber:7,x:-500,y:2,z:815,yaw:Math.PI};assert.doesNotThrow(()=>validateTruckBays([b]));assert.doesNotThrow(()=>validateTruckBays([]))
 for(const patch of [{x:NaN},{fleetNumber:10},{dockDoor:''},{yaw:undefined}])assert.throws(()=>validateTruckBays([{...b,...patch}]))
 assert.throws(()=>validateTruckBays([b,b]));assert.deepEqual(b,{id:'different-site-truck',dockDoor:'dock-77',fleetNumber:7,x:-500,y:2,z:815,yaw:Math.PI})
})
test('B1 all LOD thresholds have hysteresis and low quality never chooses high mesh',()=>{
 assert.equal(truckLod(37,0),0);assert.equal(truckLod(37,1),1);assert.equal(truckLod(90,1),1);assert.equal(truckLod(90,2),2)
 assert.equal(truckLod(70,1,true),1);assert.equal(truckLod(70,2,true),2)
 for(let d=0;d<200;d++)assert(truckLod(d,0,true)>=1)
})
test('B1 runtime cannot import offline authoring or register itself into the existing page',()=>{
 const source=fs.readFileSync(new URL('../dr-wh-r1-semitrailers.js',import.meta.url),'utf8')
 assert(!/scripts\/wh-r1-trucks|new THREE\.(Box|Cylinder|Lathe|Extrude)Geometry/.test(source))
 for(const file of ['dr-campus-registry.js','app.js','dr-wh-r1-vehicles.js'])assert(!fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').includes('dr-wh-r1-semitrailers'))
})
