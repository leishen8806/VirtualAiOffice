import * as THREE from './vendor/three/three.module.js'
import { chunkPlan, defaultBuildingHeight, geoToWorld, qualitySample } from './town-3d-core.mjs'

const canvas = document.querySelector('#town3dCanvas')
if (!canvas) throw new Error('town3d canvas missing')
const quality = new URLSearchParams(location.search).get('q') === 'low' ? 'low' : 'high'
const captureMode = new URLSearchParams(location.search).get('capture') === '1'
const status = document.querySelector('#town3dStatus')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5))
renderer.setSize(innerWidth, innerHeight - 86, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xcfe2e7)
const camera = new THREE.PerspectiveCamera(46, innerWidth / Math.max(1, innerHeight - 86), 0.1, 3000)
camera.position.set(180, 150, 220)
const target = new THREE.Vector3(0, 0, 0)
scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x6b5a49, 1.2))
const sun = new THREE.DirectionalLight(0xfff4dd, 1.7); sun.position.set(120, 260, 80); scene.add(sun)
const worldGroup = new THREE.Group(); scene.add(worldGroup)
const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0xe5dccb, roughness: 1 }),
  building: new THREE.MeshStandardMaterial({ color: 0xf2eee5, roughness: .9 }),
  water: new THREE.MeshStandardMaterial({ color: 0x4c9eb1, roughness: .26, metalness: .08, transparent: true, opacity: .86 }),
  road: new THREE.LineBasicMaterial({ color: 0x8b8378, transparent: true, opacity: .75 }),
  green: new THREE.MeshStandardMaterial({ color: 0x8eb17d, roughness: 1 }),
  markerOffice: new THREE.MeshStandardMaterial({ color: 0x346ba5, roughness: .55 }),
  markerWarehouse: new THREE.MeshStandardMaterial({ color: 0xb66b36, roughness: .55 }),
}
const origin = { lat: 11.57, lon: 104.905 }
const pointWorld = (p) => geoToWorld(p[1], p[0], 10)
function fitCamera() { camera.position.set(180, quality === 'low' ? 190 : 150, 220); camera.lookAt(target) }
function mergedBoxes(items) {
  const positions = [], indices = []; let vertex = 0
  for (const item of items) {
    const [x0, z0, x1, z1] = item.bboxWorld
    const w = Math.max(.35, x1 - x0), d = Math.max(.35, z1 - z0), h = Math.max(1, item.heightWorld)
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2
    const v = [[x-w/2,0,z-d/2],[x+w/2,0,z-d/2],[x+w/2,0,z+d/2],[x-w/2,0,z+d/2],[x-w/2,h,z-d/2],[x+w/2,h,z-d/2],[x+w/2,h,z+d/2],[x-w/2,h,z+d/2]]
    for (const p of v) positions.push(...p)
    for (const tri of [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]]) indices.push(...tri.map(i=>i+vertex))
    vertex += 8
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); g.setIndex(indices); g.computeVertexNormals(); return g
}
function mergedPolygons(items, y, material, close = true) {
  const positions = [], indices = []; let vertex = 0
  for (const item of items) {
    const pts = item.geometry.map(pointWorld); if (pts.length < 3) continue
    for (const p of pts) positions.push(p.x, y, p.z)
    for (let i=1;i<pts.length-(close?1:0);i++) indices.push(vertex, vertex+i, vertex+i+1)
    vertex += pts.length
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setIndex(indices); g.computeVertexNormals(); const m = new THREE.Mesh(g,material); worldGroup.add(m); return m
}
function addRoads(data) {
  const pts=[]; for(const road of data.roads){const line=road.line||[];for(let i=1;i<line.length;i++){const a=pointWorld([line[i-1][1],line[i-1][0]]),b=pointWorld([line[i][1],line[i][0]]);pts.push(a.x,.03,a.z,b.x,.03,b.z)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));worldGroup.add(new THREE.LineSegments(g,mat.road))
}
function marker(lat,lon,height,material,label){const p=geoToWorld(lat,lon);const m=new THREE.Mesh(new THREE.BoxGeometry(8,height,8),material);m.position.set(p.x,height/2,p.z);m.name=label;worldGroup.add(m);}
async function boot(){
  const res=await fetch('/town-3d-data.json'); if(!res.ok) throw new Error(`town-3d-data ${res.status}`); const data=await res.json()
  const buildings=data.buildings.map(b=>{const [lon0,lat0,lon1,lat1]=b.bbox;const a=geoToWorld(lat0,lon0),z=geoToWorld(lat1,lon1);return {...b,bboxWorld:[Math.min(a.x,z.x),Math.min(a.z,z.z),Math.max(a.x,z.x),Math.max(a.z,z.z)],heightWorld:b.height/10}})
  const sampled=qualitySample(buildings,quality); const chunks=chunkPlan(sampled); scene.userData.buildings = sampled.length; for(const chunk of chunks) worldGroup.add(new THREE.Mesh(mergedBoxes(chunk.items),mat.building))
  mergedPolygons(data.water,.02,mat.water); mergedPolygons(data.green,.04,mat.green); addRoads(data)
  marker(11.5536458,104.9318027,24,mat.markerOffice,'智序工场·办公室'); marker(11.5337037,104.9725248,24,mat.markerWarehouse,'DR 仓配服务中心')
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1100,900),mat.ground); floor.rotation.x=-Math.PI/2; floor.position.y=-.02; worldGroup.add(floor); fitCamera()
  status.textContent=`3D ${quality}｜建筑 ${sampled.length}/${buildings.length}｜分块 ${chunks.length}｜calls – / tris –`
  animate()
}
let dragging=false,lastX=0,lastY=0,theta=.72,phi=.72,radius=320
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)})
canvas.addEventListener('pointerup',()=>{dragging=false})
canvas.addEventListener('pointermove',e=>{if(!dragging)return;theta+=(e.clientX-lastX)*.005;phi=Math.max(.35,Math.min(1.35,phi+(e.clientY-lastY)*.005));lastX=e.clientX;lastY=e.clientY})
canvas.addEventListener('wheel',e=>{radius=Math.max(120,Math.min(700,radius+e.deltaY*.25))},{passive:true})
function animate(){if(!captureMode)requestAnimationFrame(animate);const x=Math.cos(theta)*Math.cos(phi)*radius,y=Math.sin(phi)*radius,z=Math.sin(theta)*Math.cos(phi)*radius;camera.position.set(x,y,z);camera.lookAt(target);renderer.render(scene,camera);const i=renderer.info.render;if(status)status.textContent=`3D ${quality}｜建筑 ${scene.userData.buildings||'—'}｜calls ${i.calls} / tris ${i.triangles}`}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight-86,false);camera.aspect=innerWidth/Math.max(1,innerHeight-86);camera.updateProjectionMatrix()})
boot().catch(e=>{status.textContent=`3D 数据未载入：${e.message}`})
