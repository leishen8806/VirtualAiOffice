import * as THREE from './vendor/three/three.module.js'
import { LAYOUT_V2 as layout, roomSegments } from './office-layout.js'
import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'
import { barSpec } from './office-bar-geometry.js'
import { buildOfficeBar } from './office-bar.js'
import { buildDisplayDepartments } from './display-departments.js'
import { buildDisplayStaff } from './display-staff.js'
import { displayConfig } from './display-staff-logic.js'
import { displayBatch } from './display-staff-mesh.js'

const $ = id => document.getElementById(id)
const stage = $('stage'), scene = new THREE.Scene(), root = new THREE.Group()
const spec = barSpec(layout), target = new THREE.Vector3(spec.center.x, 0, spec.center.z)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = false
stage.append(renderer.domElement); scene.add(root)
const camera = new THREE.PerspectiveCamera(42, 1, .1, 220)
scene.add(new THREE.HemisphereLight(T.nameplate, T.trim, 1.5))
const light = new THREE.DirectionalLight(T.nameplate, 1.3); light.position.set(-10, 20, 8); scene.add(light)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(layout.envelope.width, layout.envelope.depth), new THREE.MeshStandardMaterial({ color: T.exteriorWall }))
floor.rotation.x = -Math.PI / 2; floor.position.set((layout.envelope.x0 + layout.envelope.x1) / 2, -.025, (layout.envelope.z0 + layout.envelope.z1) / 2)
scene.add(floor)
const walls = []
for (const room of layout.regions) for (const segment of roomSegments(room)) {
  const vertical = ['west', 'east'].includes(segment.side)
  const g = new THREE.BoxGeometry(vertical ? .12 : segment.hi - segment.lo, .6, vertical ? segment.hi - segment.lo : .12).toNonIndexed()
  g.translate(vertical ? (segment.side === 'west' ? room.x0 : room.x1) : (segment.lo + segment.hi) / 2, .3,
    vertical ? (segment.lo + segment.hi) / 2 : (segment.side === 'north' ? room.z0 : room.z1))
  walls.push(g)
}
scene.add(displayBatch(THREE, walls, new THREE.MeshStandardMaterial({ color: T.glass, roughness: T.glassRoughness })))
let bar, furniture, staff, time = 0, previous = null, paused = false, sampling = null, resizeTimer
let az = 0, el = 1.08, radius = 72, drag = null
$('enabled').checked = displayConfig(null, location.search).enabled
const preview = { renderer, scene, camera, readings: [], ready: false }
window.__displayStaffPreview = preview
function orbit() {
  camera.position.set(target.x + radius * Math.cos(el) * Math.sin(az), radius * Math.sin(el), target.z + radius * Math.cos(el) * Math.cos(az))
  camera.lookAt(target)
}
function build() {
  bar?.dispose(); furniture?.dispose(); staff?.dispose()
  const low = $('tier').value === 'low'
  bar = buildOfficeBar({ THREE, root, layout, low })
  furniture = buildDisplayDepartments({ THREE, root, layout, low })
  staff = buildDisplayStaff({ THREE, root, layout, low, config: { enabled: $('enabled').checked }, now: () => time })
  Object.assign(preview, { staff, furniture, bar, ready: true })
}
function resize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight)
  camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix()
}
function fail() { $('error').hidden = false; $('error').textContent = '展示预览不可用，请检查静态资源。' }
try { build(); orbit(); resize() } catch { fail() }
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 100) })
$('enabled').onchange = () => staff?.setEnabled($('enabled').checked)
$('tier').onchange = () => { sampling = null; try { build() } catch { fail() } }
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme === 'dark'
  document.documentElement.dataset.theme = dark ? 'light' : 'dark'; $('theme').textContent = dark ? '深色主题' : '浅色主题'
}
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '继续' : '暂停' }
$('reset').onclick = () => { time = 0; staff?.update() }
$('view').onchange = () => {
  const id = $('view').value, region = layout.regions.find(r => r.id === id)
  target.set(region ? (region.x0 + region.x1) / 2 : spec.center.x, 0, region ? (region.z0 + region.z1) / 2 : spec.center.z)
  el = id === 'all' ? 1.08 : .8; radius = region ? 16 : id === 'bar' ? 24 : 72; az = 0
  orbit()
}
$('measure').onclick = () => {
  if (!staff || sampling) return
  sampling = { step: 0, values: [], enabled: $('enabled').checked, low: $('tier').value === 'low' }
}
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; renderer.domElement.setPointerCapture(e.pointerId) })
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  drag.moved ||= Math.abs(dx) + Math.abs(dy) > 2
  az -= dx * .006; el = Math.max(.2, Math.min(1.5, el + dy * .006)); drag.x = e.clientX; drag.y = e.clientY; orbit()
})
renderer.domElement.addEventListener('pointerup', e => {
  if (drag && !drag.moved) {
    const box = renderer.domElement.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((e.clientX - box.left) / box.width * 2 - 1, 1 - (e.clientY - box.top) / box.height * 2), camera)
    const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    const region = point && furniture.regions.find(r => point.x >= r.bounds.x0 && point.x <= r.bounds.x1 && point.z >= r.bounds.z0 && point.z <= r.bounds.z1)
    if (region) $('detail').textContent = `${region.title} · ${region.kind} · ${region.description}`
  }
  drag = null
})
renderer.domElement.addEventListener('pointercancel', () => { drag = null })
renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); radius = Math.max(10, Math.min(130, radius + e.deltaY * .035)); orbit() }, { passive: false })
function frame(stamp) {
  requestAnimationFrame(frame)
  const dt = previous === null ? 0 : Math.min(.1, Math.max(0, (stamp - previous) / 1000)); previous = stamp
  if (document.hidden || !preview.ready) return
  if (!paused && !sampling) time += dt * 1000 * Number($('speed').value)
  staff.update()
  const summary = staff.summary()
  if (summary.failure) { fail(); return }
  if (sampling) staff.root.visible = sampling.step !== 1
  scene.background = new THREE.Color(document.documentElement.dataset.theme === 'dark' ? '#292721' : T.exteriorWall)
  renderer.render(scene, camera)
  const reading = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  preview.time = time; preview.current = reading
  if (sampling) {
    sampling.values.push(reading); sampling.step++
    if (sampling.step === 3) {
      const [on, off, restored] = sampling.values
      preview.readings.push({ enabled: sampling.enabled, low: sampling.low, on, off, restored,
        delta: { calls: on.calls - off.calls, triangles: on.triangles - off.triangles } })
      sampling = null; staff.root.visible = true
      if (preview.readings.length > 12) preview.readings.shift()
    }
  }
  $('metrics').textContent = `场景 calls ${reading.calls} · 三角形 ${reading.triangles} ｜ 家具 ${furniture.summary().calls} calls ｜ 人物 ${summary.count} / 12 · ${summary.calls} calls · ${summary.triangles} 三角形 ｜ 行走 ${summary.walking} · 休息 ${summary.resting}`
  $('clock').textContent = `模拟时钟 ${Math.floor(time / 60000)}分${Math.floor(time / 1000) % 60}秒 · ${paused ? '暂停' : '运行'} · ${$('speed').value}×`
}
requestAnimationFrame(frame)
addEventListener('pagehide', () => { bar?.dispose(); furniture?.dispose(); staff?.dispose(); renderer.dispose() }, { once: true })
