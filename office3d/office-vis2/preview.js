import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 as layout } from '../office-layout.js'
import { buildOfficeIsland } from '../office-island.js'
import { createOfficeVis2Controller } from './sample.js'
import { initialQuality, cappedDpr, renderLimit } from '../quality.js'
import { buildOfficePreviewContext, disposePreviewAssets } from './preview-context.js'

const scene = new THREE.Scene(), root = new THREE.Group(), renderer = new THREE.WebGLRenderer({ antialias: true })
scene.background = new THREE.Color('#F4F1EA'); scene.add(root)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.prepend(renderer.domElement)
const hemi = new THREE.HemisphereLight('#edf1eb', '#857764', 1.1), key = new THREE.DirectionalLight('#fff2df', 2.4)
key.position.set(-12, 25, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -18; key.shadow.camera.right = 18; key.shadow.camera.top = 20; key.shadow.camera.bottom = -20; key.shadow.normalBias = .03; key.target.position.set(2, 0, -2); scene.add(hemi, key, key.target)
const camera = new THREE.PerspectiveCamera(42, 1, .1, 150)
const groundMaterial = new THREE.MeshStandardMaterial({ color: '#E8DECD', roughness: .9 }), groundGeometry = new THREE.PlaneGeometry(24, 30), ground = new THREE.Mesh(groundGeometry, groundMaterial)
ground.rotation.x = -Math.PI / 2; ground.position.set(2, -.04, -2); ground.receiveShadow = true; scene.add(ground)
let tier = initialQuality({ search: location.search }).tier
let legacy, controller, low = tier === 'low', view = 'overview', disposed = false, enabled = false, probing = false, probeEpoch = 0
let officeContext = null, previewAssets = null, contextLoading = false, contextEpoch = 0
const poses = Object.freeze({ overview: [[2, 25, 31], [2, .3, -2]], eye: [[2, 1.65, 14], [2, 1.7, -6]], reception: [[2, 2.1, 13.5], [2, 1.35, 8.1]], bar: [[11, 7, 3], [2, 1.15, -6]], barBrand: [[2, 1.7, 2.8], [2, .56, -2.47]], treeFront: [[2, 1.9, 2], [2, 2.1, -6]], treeSide: [[10, 3, -6], [2, 2, -6]] })
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
function draw() {
  if (disposed || document.hidden) return
  officeContext?.onFrame(camera)
  renderer.render(scene, camera)
  const s = enabled ? controller.summary() : legacy.summary()
  document.querySelector('#metrics').textContent = `${enabled ? 'VIS2-O 样板' : 'B0 原岛台'} · ${tier} · 模块 ${s.calls} calls / ${Math.round(s.triangles)} 三角形 · 整页 ${renderer.info.render.calls} calls（含当前阴影）`
}
function setView(name) { view = name; if (officeContext) officeContext.root.visible = name === 'officeOverview'; const pose = name === 'officeOverview' ? [[2, 42, 45], [2, 0, -4]] : poses[name]; camera.position.set(...pose[0]); camera.lookAt(...pose[1]); draw() }
function clearContext() { contextEpoch++; officeContext?.dispose(); officeContext = null; if (previewAssets) disposePreviewAssets(previewAssets.A); previewAssets = null }
function mountContext() { officeContext = buildOfficePreviewContext({ THREE, root, layout, low, ...previewAssets, canvasTex }) }
async function showOffice() {
  if (contextLoading || disposed) return
  if (officeContext) { setView('officeOverview'); return }
  if (!enabled) await enter()
  if (!enabled) return
  const epoch = ++contextEpoch; contextLoading = true
  document.querySelector('#status').textContent = '正在复用既有办公室家具…'
  try {
    const { loadAssets, placeFurniture } = await import('../assets3d.js'), A = await loadAssets()
    if (disposed || epoch !== contextEpoch || !enabled) { disposePreviewAssets(A); return }
    previewAssets = { A, placeFurniture }; mountContext(); setView('officeOverview')
    document.querySelector('#status').textContent = '办公全貌预览 · 既有工位布局 · 无业务接口'
  } catch { clearContext(); document.querySelector('#status').textContent = '办公室环境未载入 · 保留中央样板'; setView('overview') }
  finally { contextLoading = false }
}
async function enter() {
  document.querySelector('#status').textContent = '正在载入已登记材质…'
  const ok = await controller.setConfig({ enabled: true }); if (disposed) return
  enabled = ok; legacy.root.visible = !ok
  document.querySelector('#status').textContent = ok ? '样板已开启 · 模拟展示，无业务操作' : '样板未开启 · 已恢复原办公室'
  draw()
}
async function exit() { enabled = false; probeEpoch++; clearContext(); await controller.setConfig(null); legacy.root.visible = true; document.querySelector('#status').textContent = '关闭 · 原办公室样板'; if (view === 'officeOverview') setView('overview'); else draw() }
async function rebuild() {
  const reopen = enabled; controller?.dispose(); legacy?.dispose()
  const contextOpen = !!officeContext; officeContext?.dispose(); officeContext = null
  low = tier === 'low'; renderer.shadowMap.enabled = !low
  key.castShadow = !low
  const shadowSize = tier === 'high' ? 2048 : 1024
  if (key.shadow.mapSize.x !== shadowSize) { key.shadow.map?.dispose(); key.shadow.map = null; key.shadow.mapSize.set(shadowSize, shadowSize) }
  legacy = buildOfficeIsland({ THREE, root, layout, low }); controller = createOfficeVis2Controller({ THREE, root, layout, low, canvasTex })
  enabled = false; if (reopen) await enter(); else draw()
  if (contextOpen && previewAssets && enabled) { mountContext(); setView(view) }
  else if (!enabled && previewAssets) { clearContext(); if (view === 'officeOverview') setView('overview') }
}
function resize() { renderer.setPixelRatio(cappedDpr(tier, devicePixelRatio, innerWidth, innerHeight)); renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); draw() }
async function probe() {
  if (probing || disposed || document.hidden) return null
  probing = true; const version = ++probeEpoch, intervals = [], renderTimes = []; let previous
  try {
    for (let i = 0; i < 1000 && intervals.length < 120 && !disposed && !document.hidden && version === probeEpoch; i++) {
      const time = await new Promise(resolve => { const timeout = setTimeout(() => resolve(null), 500); requestAnimationFrame(t => { clearTimeout(timeout); resolve(t) }) })
      if (time === null) break
      const limit = renderLimit({ tier, active: true, hidden: document.hidden })
      if (previous !== undefined && time - previous < 1000 / limit - .5) continue
      if (previous !== undefined) intervals.push(time - previous); previous = time
      const started = performance.now(); draw(); renderTimes.push(performance.now() - started)
    }
    intervals.sort((a, b) => a - b); renderTimes.sort((a, b) => a - b)
    const result = { samples: intervals.length, medianMs: intervals[Math.floor(intervals.length * .5)] || null, p95Ms: intervals[Math.floor(intervals.length * .95)] || null, renderCpuMedianMs: renderTimes[Math.floor(renderTimes.length * .5)] || null, renderCpuP95Ms: renderTimes[Math.floor(renderTimes.length * .95)] || null, resolution: [innerWidth, innerHeight], dpr: renderer.getPixelRatio(), quality: tier, userAgent: navigator.userAgent }
    window.__vis2.lastProbe = result; return result
  } finally { probing = false }
}
const click = event => { const b = event.target.closest('button'); if (!b) return; if (b.dataset.view) setView(b.dataset.view); if (b.id === 'office') showOffice(); if (b.id === 'enter') enter(); if (b.id === 'exit') exit(); if (b.id === 'tier') { tier = ({ high: 'medium', medium: 'low', low: 'high' })[tier]; probeEpoch++; rebuild().then(resize) } if (b.id === 'probe') probe() }
const visibility = () => { probeEpoch++; if (!document.hidden) draw() }
const dispose = () => { if (disposed) return; disposed = true; probeEpoch++; clearContext(); controller.dispose(); legacy.dispose(); groundGeometry.dispose(); groundMaterial.dispose(); key.shadow.map?.dispose(); renderer.dispose(); removeEventListener('resize', resize); document.removeEventListener('click', click); document.removeEventListener('visibilitychange', visibility) }
await rebuild(); setView(view); resize(); addEventListener('resize', resize); document.addEventListener('click', click); document.addEventListener('visibilitychange', visibility)
document.querySelector('#tier').textContent = '循环画质档位'
addEventListener('pagehide', e => { if (!e.persisted) dispose() })
window.__vis2 = { renderer, scene, root, camera, poses, setView, enter, exit, showOffice, probe, summary: () => controller.summary(), mapping: () => controller.mapping, contextSeats: () => officeContext?.seats || [], mode: () => enabled ? 'open' : 'closed' }
const query = new URLSearchParams(location.search); if (query.getAll('vis2').length === 1 && query.get('vis2') === '1') await enter()
