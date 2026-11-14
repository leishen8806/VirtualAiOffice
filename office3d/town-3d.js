import * as THREE from './vendor/three/three.module.js'
import { GLTFLoader } from './vendor/three/jsm/loaders/GLTFLoader.js'
import { chunkPlan, defaultBuildingHeight, geoToWorld, groundPlan, landmarkProfile, polygonShape, polygonWorldPoint, qualitySample, roadTier, waterContainsPoint, waterContainsSegment } from './town-3d-core.js'
import { setLoading, finishLoading } from './dr-loading.js'

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
  progress(value, step) { setLoading(step, value / 100) },
  done() { if (!loader) return; loader.setAttribute('aria-busy','false'); const ms = prefersReducedMotion || quality === 'low' ? 0 : 1800; finishLoading({ reduceMotion: !ms, pushCamera: duration => { const start = performance.now(); const base = quality === 'low' ? 250 : 320; const tick = now => { const t = Math.min(1, (now - start) / Math.max(1, duration)); const eased = t * (2 - t); camera.position.y = base - eased * 55; if (t < 1) requestAnimationFrame(tick) }; requestAnimationFrame(tick) } }) },
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
if (captureMode) window.__town3d.camera = camera
const mat = {
  ground: new THREE.MeshStandardMaterial({ color: 0xe5dccb, roughness: 1 }),
  building: new THREE.MeshStandardMaterial({ color: 0xf2eee5, roughness: .9 }),
  water: new THREE.MeshStandardMaterial({ color: 0x4c9eb1, roughness: .26, metalness: .08, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  roadMajor: new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 1, side: THREE.DoubleSide }),
  roadSecondary: new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1, side: THREE.DoubleSide }),
  roadLocal: new THREE.MeshStandardMaterial({ color: 0xb6afa5, roughness: 1, side: THREE.DoubleSide }),
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
    const shape = polygonShape(THREE, item, (point) => polygonWorldPoint(THREE, point))
    if (!shape) continue
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, y, 0)
    const attr = geometry.getAttribute('position')
    for (let i = 0; i < attr.count; i++) positions.push(attr.getX(i), attr.getY(i), attr.getZ(i))
    const index = geometry.getIndex()
    if (index) for (let i = 0; i < index.count; i += 3) indices.push(vertex + index.getX(i), vertex + index.getX(i + 1), vertex + index.getX(i + 2))
    else for (let i = 0; i < attr.count; i += 3) indices.push(vertex + i, vertex + i + 1, vertex + i + 2)
    vertex += attr.count
    geometry.dispose()
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals()
  const m = new THREE.Mesh(g, material); worldGroup.add(m); return m
}
function mergedRoads(data) {
  const groups = new Map(['major', 'secondary', 'local'].map((tier) => [tier, { positions: [], indices: [], vertex: 0 }]))
  for (const road of data.roads) for (let i = 1; i < (road.line || []).length; i++) {
    const p0 = road.line[i - 1], p1 = road.line[i]
    const inside = p => Array.isArray(p) && p.length >= 2 && p[0] >= 104.9 && p[0] <= 104.985 && p[1] >= 11.52 && p[1] <= 11.59
    if (!inside(p0) || !inside(p1)) continue
    if (waterContainsPoint([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], data.water) || waterContainsSegment(p0, p1, data.water)) continue
    const a = pointWorld(p0), b = pointWorld(p1)
    if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) continue
    const tier = roadTier(road.type), group = groups.get(tier)
    const width = tier === 'major' ? 2.8 : tier === 'secondary' ? 1.6 : .8
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1, nx = -dz / len * width / 2, nz = dx / len * width / 2
    const y = tier === 'major' ? .07 : tier === 'secondary' ? .06 : .05
    group.positions.push(a.x - nx, y, a.z - nz, a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz)
    group.indices.push(group.vertex, group.vertex + 1, group.vertex + 2, group.vertex, group.vertex + 2, group.vertex + 3); group.vertex += 4
  }
  for (const [tier, group] of groups) {
    if (!group.positions.length) continue
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3)); geometry.setIndex(group.indices); geometry.computeVertexNormals()
    const material = tier === 'major' ? mat.roadMajor : tier === 'secondary' ? mat.roadSecondary : mat.roadLocal
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `town-roads-${tier}`; worldGroup.add(mesh)
  }
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
function marker(lat,lon,height,material,label,model){const p=geoToWorld(lat,lon),profile=landmarkProfile(label),group=new THREE.Group();group.name=label;group.position.set(p.x,model ? -.02 : 0,p.z);const add=(geometry,y)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;group.add(mesh)};if(model)group.add(model.clone(true));else if(profile==='stadium'){add(new THREE.CylinderGeometry(5,5,1.5,16),.75);const ring=new THREE.Mesh(new THREE.TorusGeometry(4,.65,5,20),material);ring.rotation.x=Math.PI/2;ring.position.y=1.7;group.add(ring)}else if(profile==='spire'){add(new THREE.BoxGeometry(8,1.2,8),.6);add(new THREE.CylinderGeometry(1.8,3.2,height*.5,8),1.2+height*.25);add(new THREE.ConeGeometry(3.1,height*.38,8),1.2+height*.69)}else{add(new THREE.BoxGeometry(8,height*.58,8),height*.29);add(new THREE.BoxGeometry(5,height*.36,5),height*.76)}worldGroup.add(group);const el=document.createElement('div');el.className='town3d-label';el.textContent=label;el.dataset.world=`${p.x},${height},${p.z}`;document.body.append(el);return group}
async function boot(){
  loaderApi.progress(8, '下载城市数据…')
  const [res, mapRes] = await Promise.all([fetch('/town/3d-data/town-3d-data.json'), fetch('/town/map')]); if(!res.ok) throw new Error(`town-3d-data ${res.status}`); const data=await res.json(); const mapData=mapRes.ok ? await mapRes.json() : null; loaderApi.progress(30, '城市数据已载入，准备生成建筑…')
  const monument = mapData?.layers?.landmarks?.find(item => item.name === 'Independence Monument')
  const monumentModel = await new GLTFLoader().loadAsync('./assets/models/landmarks/independence-monument.glb').then(result => result.scene).catch(error => { console.warn('Independence Monument model unavailable; using the town placeholder', error); return null })
  const buildings=data.buildings.map(b=>{const [lon0,lat0,lon1,lat1]=(b.bbox||[]).map(Number); if(![lon0,lat0,lon1,lat1].every(Number.isFinite)) return null; const a=geoToWorld(lat0,lon0),z=geoToWorld(lat1,lon1); return {...b,bboxWorld:[Math.min(a.x,z.x),Math.min(a.z,z.z),Math.max(a.x,z.x),Math.max(a.z,z.z)],heightWorld:Number(b.height)/10}}).filter(Boolean).filter(building => building.id !== monument?.osm)
  const sampled=qualitySample(buildings,quality); const chunks=chunkPlan(sampled); scene.userData.buildings = sampled.length; loaderApi.progress(40, `生成建筑（${chunks.length} 个分块）…`)
  worldGroup.clear();
  chunks.forEach((chunk, index) => { worldGroup.add(new THREE.Mesh(extrudedBuildings(chunk.items, quality === 'low'),mat.building)); loaderApi.progress(40 + Math.round((index + 1) / Math.max(1, chunks.length) * 45), `生成建筑（${index + 1}/${chunks.length}）…`) })
  mergedPolygons(data.water,.02,mat.water)
  // Some OSM green-area relations are incomplete open rings; skip only the
  // oversized malformed spans so they cannot triangulate into city-wide strips.
  mergedPolygons(data.green,.04,mat.green)
  addRoads(data)
  marker(11.5536458,104.9318027,24,mat.markerOffice,'智序工场·办公室'); marker(11.5337037,104.9725248,24,mat.markerWarehouse,'DR 仓配服务中心')
  const landmarks = (mapData?.layers?.landmarks || []).map(item => [item.name, item.lat, item.lon]).filter(([, lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
  landmarks.forEach(([label,lat,lon])=>marker(lat,lon,label === 'Independence Monument' ? 25.47 : 10,mat.markerWarehouse,label,label === 'Independence Monument' ? monumentModel : null))
  const landmarkList=document.querySelector('#town3dLandmarkList'); if (landmarkList) landmarkList.remove()
  const ground=groundPlan(buildings),floor=new THREE.Mesh(new THREE.PlaneGeometry(ground.width,ground.depth),mat.ground); floor.name='town-ground'; floor.rotation.x=-Math.PI/2; floor.position.set(ground.x,-.02,ground.z); worldGroup.add(floor); fitCamera()
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
