import * as THREE from './vendor/three/three.module.js'
import { chunkPlan, defaultBuildingHeight, geoToWorld, qualitySample } from './town-3d-core.mjs'

const canvas = document.querySelector('#town3dCanvas')
if (!canvas) throw new Error('town3d canvas missing')
const quality = new URLSearchParams(location.search).get('q') === 'low' ? 'low' : 'high'
const captureMode = new URLSearchParams(location.search).get('capture') === '1'
const status = document.querySelector('#town3dStatus')
const loader = document.querySelector('#town3dLoader')
const loaderStep = document.querySelector('#town3dLoaderStep')
const loaderProgress = document.querySelector('#town3dLoaderProgress')
const loaderError = document.querySelector('#town3dLoaderError')
const loaderActions = loader?.querySelector('.town3d-loader-actions')
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const loaderApi = window.town3dLoader = {
  progress(value, step) { if (loaderProgress) loaderProgress.value = value; if (loaderStep) loaderStep.textContent = step },
  done() { if (!loader) return; loader.setAttribute('aria-busy','false'); loader.classList.add('is-leaving'); const ms = prefersReducedMotion || quality === 'low' ? 0 : 1800; const start = performance.now(); const tick = now => { const t = Math.min(1, (now - start) / Math.max(1, ms)); const eased = t * (2 - t); const base = quality === 'low' ? 250 : 320; const y = quality === 'low' || prefersReducedMotion ? 0 : eased * 55; camera.position.y = base - y; if (t < 1) requestAnimationFrame(tick); }; if (ms) requestAnimationFrame(tick); setTimeout(() => loader.remove(), 650) },
  fail(error) { if (!loader) return; loader.setAttribute('aria-busy','false'); loaderError.hidden = false; loaderError.textContent = `加载失败：${error?.message || error}`; loaderActions.hidden = false; loaderProgress.value = 0; loaderStep.textContent = '无法完成城市数据加载'; }
}
document.querySelector('#town3dRetry')?.addEventListener('click', () => location.reload())
document.querySelector('#town3dBack2d')?.addEventListener('click', () => { location.href = 'town.html' })
loader?.addEventListener('pointerdown', () => { loaderApi.done() }, { once: true })
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5))
renderer.setSize(innerWidth, innerHeight - 86, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xcfe2e7)
const camera = new THREE.PerspectiveCamera(46, innerWidth / Math.max(1, innerHeight - 86), 0.1, 3000)
camera.position.set(180, 150, 220)
// Keep the camera aimed at street level; aiming above the city makes the first
// frame look empty even though the geometry is loaded.
const target = new THREE.Vector3(360, 10, 120)
scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x6b5a49, 1.2))
const sun = new THREE.DirectionalLight(0xfff4dd, 1.7); sun.position.set(120, 260, 80); scene.add(sun)
const worldGroup = new THREE.Group(); scene.add(worldGroup)
window.__town3d = { scene, worldGroup, renderer }
const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0xe5dccb, roughness: 1 }),
  building: new THREE.MeshStandardMaterial({ color: 0xf2eee5, roughness: .9 }),
  water: new THREE.MeshStandardMaterial({ color: 0x4c9eb1, roughness: .26, metalness: .08, transparent: true, opacity: .86, side: THREE.DoubleSide }),
  road: new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1, transparent: true, opacity: .9, side: THREE.DoubleSide }),
  green: new THREE.MeshStandardMaterial({ color: 0x8eb17d, roughness: 1 }),
  markerOffice: new THREE.MeshStandardMaterial({ color: 0x346ba5, roughness: .55 }),
  markerWarehouse: new THREE.MeshStandardMaterial({ color: 0xb66b36, roughness: .55 }),
}
const origin = { lat: 11.57, lon: 104.905 }
const pointWorld = (p) => geoToWorld(p[1], p[0], 10)
function fitCamera() { camera.position.set(260, quality === 'low' ? 250 : 210, 340); camera.lookAt(target) }
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
function mergedPolygons(items, y, material) {
  const positions = [], indices = []; let vertex = 0
  for (const item of items) {
    const pts = item.geometry.map(pointWorld).map(p => new THREE.Vector2(p.x, p.z)).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)); if (pts.length < 3) continue
    for (const p of pts) positions.push(p.x, y, p.y)
    for (const tri of THREE.ShapeUtils.triangulateShape(pts, [])) indices.push(vertex + tri[0], vertex + tri[1], vertex + tri[2])
    vertex += pts.length
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setIndex(indices); g.computeVertexNormals(); const m = new THREE.Mesh(g,material); worldGroup.add(m); return m
}
function mergedRoads(data) {
  const positions = [], indices = []; let vertex = 0
  for (const road of data.roads) for (let i = 1; i < (road.line || []).length; i++) {
    const p0 = road.line[i - 1], p1 = road.line[i]
    const inside = p => Array.isArray(p) && p.length >= 2 && p[0] >= 104.9 && p[0] <= 104.985 && p[1] >= 11.52 && p[1] <= 11.59
    if (!inside(p0) || !inside(p1)) continue
    const a = pointWorld([p0[1], p0[0]]), b = pointWorld([p1[1], p1[0]])
    if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) continue
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, w = road.primary ? 1.8 : .75, nx = -dz / len * w / 2, nz = dx / len * w / 2
    positions.push(a.x - nx, .03, a.z - nz, a.x + nx, .03, a.z + nz, b.x + nx, .03, b.z + nz, b.x - nx, .03, b.z - nz)
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3); vertex += 4
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); worldGroup.add(new THREE.Mesh(g, mat.road))
}
function extrudedBuildings(items, simplified = false) {
  const positions = [], indices = []; let vertex = 0
  for (const item of items) {
    const h = Number.isFinite(item.heightWorld) ? Math.max(1, item.heightWorld) : 6, pts = simplified ? null : (item.geometry || []).map(pointWorld).map(p => new THREE.Vector2(p.x, p.z)).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    const triangulated = pts && pts.length >= 3 ? THREE.ShapeUtils.triangulateShape(pts, []) : []
    const area = pts && pts.length >= 3 ? Math.abs(pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p.x * q.y - q.x * p.y }, 0)) / 2 : 0
    const triArea = triangulated.reduce((sum, tri) => { const a = pts[tri[0]], b = pts[tri[1]], c = pts[tri[2]]; return sum + Math.abs((b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y))/2 }, 0)
    // OSM clips can contain self-intersecting rings; a bbox is safer than a
    // giant fan of crossed triangles for those individual buildings.
    if (!pts || pts.length < 3 || !triangulated.length || !area || triArea < area * .55 || triArea > area * 1.45) {
    const [x0, z0, x1, z1] = item.bboxWorld.map(Number), w = Math.max(.35, x1 - x0), d = Math.max(.35, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2
      const v = [[x-w/2,0,z-d/2],[x+w/2,0,z-d/2],[x+w/2,0,z+d/2],[x-w/2,0,z+d/2],[x-w/2,h,z-d/2],[x+w/2,h,z-d/2],[x+w/2,h,z+d/2],[x-w/2,h,z+d/2]]
      for (const p of v) positions.push(...p)
      for (const tri of [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]]) indices.push(...tri.map(i => i + vertex)); vertex += 8; continue
    }
    for (const p of pts) positions.push(p.x, 0, p.y)
    for (const p of pts) positions.push(p.x, h, p.y)
    for (const tri of triangulated) indices.push(vertex + tri[0], vertex + tri[1], vertex + tri[2], vertex + pts.length + tri[2], vertex + pts.length + tri[1], vertex + pts.length + tri[0])
    for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; indices.push(vertex + i, vertex + j, vertex + pts.length + j, vertex + i, vertex + pts.length + j, vertex + pts.length + i) }
    vertex += pts.length * 2
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g
}
function addRoads(data) { mergedRoads(data) }
function marker(lat,lon,height,material,label){const p=geoToWorld(lat,lon);const m=new THREE.Mesh(new THREE.BoxGeometry(8,height,8),material);m.position.set(p.x,height/2,p.z);m.name=label;worldGroup.add(m); const el=document.createElement('div'); el.className='town3d-label'; el.textContent=label; el.dataset.world=`${p.x},${height},${p.z}`; document.body.append(el); return m }
async function boot(){
  loaderApi.progress(8, '下载城市数据…')
  const res=await fetch('/town-3d-data.json'); if(!res.ok) throw new Error(`town-3d-data ${res.status}`); const data=await res.json(); loaderApi.progress(30, '城市数据已载入，准备生成建筑…')
  const buildings=data.buildings.map(b=>{const [lon0,lat0,lon1,lat1]=(b.bbox||[]).map(Number); if(![lon0,lat0,lon1,lat1].every(Number.isFinite)) return null; const a=geoToWorld(lat0,lon0),z=geoToWorld(lat1,lon1); return {...b,bboxWorld:[Math.min(a.x,z.x),Math.min(a.z,z.z),Math.max(a.x,z.x),Math.max(a.z,z.z)],heightWorld:Number(b.height)/10}}).filter(Boolean)
  const sampled=qualitySample(buildings,quality); const chunks=chunkPlan(sampled); scene.userData.buildings = sampled.length; loaderApi.progress(40, `生成建筑（${chunks.length} 个分块）…`)
  worldGroup.clear();
  chunks.forEach((chunk, index) => { worldGroup.add(new THREE.Mesh(extrudedBuildings(chunk.items, quality === 'low'),mat.building)); loaderApi.progress(40 + Math.round((index + 1) / Math.max(1, chunks.length) * 45), `生成建筑（${index + 1}/${chunks.length}）…`) })
  mergedPolygons(data.water,.02,mat.water); mergedPolygons(data.green,.04,mat.green); addRoads(data)
  marker(11.5536458,104.9318027,24,mat.markerOffice,'智序工场·办公室'); marker(11.5337037,104.9725248,24,mat.markerWarehouse,'DR 仓配服务中心')
  const landmarks=[['王宫',11.5627,104.9303],['独立纪念碑',11.5561,104.9176],['中央市场',11.5681,104.9215],['塔仔山寺',11.5759,104.9234],['国家博物馆',11.5657,104.9272],['奥林匹克体育场',11.5514,104.9143],['洞里萨河滨',11.5745,104.9277],['金边港',11.578,104.933],['夜市',11.571,104.925],['俄罗斯市场',11.547,104.916],['机场方向',11.528,104.969],['东部物流走廊',11.535,104.974],['铁桥',11.548,104.934],['学校',11.56,104.946],['医院',11.558,104.955],['公园',11.566,104.944],['体育场',11.55,104.946],['寺院',11.579,104.95],['老城',11.57,104.915],['南城',11.545,104.935],['三河交汇',11.565,104.94],['西市',11.56,104.9],['北门',11.588,104.93],['仓配入口',11.534,104.968]]
  landmarks.forEach(([label,lat,lon])=>marker(lat,lon,10,mat.markerWarehouse,label))
  const landmarkList=document.querySelector('#town3dLandmarkList'); if (landmarkList) landmarkList.remove()
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1100,900),mat.ground); floor.rotation.x=-Math.PI/2; floor.position.y=-.02; worldGroup.add(floor); fitCamera()
  status.textContent=`3D ${quality}｜建筑 ${sampled.length}/${buildings.length}｜分块 ${chunks.length}（${Object.keys(data.chunks||{}).length} 数据块）｜calls – / tris –`; loaderApi.progress(95, '画出第一帧…')
  loaderApi.progress(100, '场景就绪'); loaderApi.done()
  animate()
}
let dragging=false,lastX=0,lastY=0,theta=.72,phi=.72,radius=320
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)})
canvas.addEventListener('pointerup',()=>{dragging=false})
canvas.addEventListener('pointermove',e=>{if(!dragging)return;theta+=(e.clientX-lastX)*.005;phi=Math.max(.35,Math.min(1.35,phi+(e.clientY-lastY)*.005));lastX=e.clientX;lastY=e.clientY})
canvas.addEventListener('wheel',e=>{radius=Math.max(120,Math.min(700,radius+e.deltaY*.25))},{passive:true})
function animate(){if(!captureMode)requestAnimationFrame(animate);const x=Math.cos(theta)*Math.cos(phi)*radius,y=Math.sin(phi)*radius,z=Math.sin(theta)*Math.cos(phi)*radius;camera.position.set(x,y,z);camera.lookAt(target);renderer.render(scene,camera);const i=renderer.info.render;if(status)status.textContent=`3D ${quality}｜建筑 ${scene.userData.buildings||'—'}｜calls ${i.calls} / tris ${i.triangles}`;for(const el of document.querySelectorAll('.town3d-label')){const [wx,wy,wz]=el.dataset.world.split(',').map(Number),p=new THREE.Vector3(wx,wy,wz).project(camera);el.style.transform=`translate(${(p.x*.5+.5)*innerWidth}px,${(-p.y*.5+.5)*(innerHeight-86)}px)`;el.hidden=p.z<0||p.z>1}}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight-86,false);camera.aspect=innerWidth/Math.max(1,innerHeight-86);camera.updateProjectionMatrix()})
boot().catch(e=>{status.textContent=`3D 数据未载入：${e.message}`; loaderApi.fail(e)})
