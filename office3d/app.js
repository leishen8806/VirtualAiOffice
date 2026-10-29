import * as THREE from './vendor/three/three.module.js'
import { createCharacter } from './rig.js'
import { loadAssets, placeFurniture, createCharacter3D } from './assets3d.js'
import { buildEnvironment, weatherText } from './env.js'
import { createUI } from './ui.js'
import { keepFullscreenAwake, awakeMessage } from './screen-awake.js'
import { snapshot, mergeStatic } from './merge.js'
import { initialQuality, createQualityPolicy, createSceneQuality, cappedDpr, qualityStartupPlan, renderLimit, takeQualityWork } from './quality.js'
import { loadPeople, loadExtras, loadR1Extras, r1SeatedAssets, fitR1SeatedPerson, createPerson, CAST } from './people.js'
import { createFurnitureCollision } from './furniture-collision.js'
import { startOfficeV2, OFFICE_LAYOUT, SEATS, buildWing, ROOMS, buildOfficePartitions, createDirector, createFun, holidayInfo, officeStand, officeExit, corridorPath, LOUNGE_AREA, LOUNGE_SEATS, loungeTrip, meetingTrip, createWaitingBoard, waitingPlan } from './office-v2-modules.js'
import { buildWarehouseShell } from './warehouse-shell.js'
import { createCampusRegistry } from './dr-campus-registry.js'
import { campusModules } from './dr-campus-modules.js'
import { hideCampusEnvironment } from './dr-campus-shell.js'
import { buildDrControlRoom } from './dr-control-room.js'
import { startOfficeV3, demolishLegacyScene, selectEnvironmentConflicts } from './office-v3-modules.js'
import { officeSampleRequested } from './office-vis2/host.js'
import { OFFICE_ROOMS, workHome, BOSS, BOARD_TABLE, REGION_FOCUS, PLAZA, WAREHOUSE, DOCK, PARKING, FOYER_ZONES, WAITING_CAPACITY, ENVELOPE, MAIN_FLOOR_X0, ENTRANCE, RECEPTION, CORRIDOR_X, VIEW_CENTER, MINI_BOUNDS, CAMPUS, CAMPUS_BUILDING, CAMPUS_ZONES, CAMPUS_SHUTTLE_STRIP, CAMPUS_FOCUS, LAYOUT_V3, regionFocusOf } from './office-layout.js'
import { foyerSceneSpec } from './foyer-scene-spec.js'
import { announcementPanel, attendancePanel, milestonePanel, panelAccess, pendingPanel, selectWaitingPeople, standupPanel, visitorPanel } from './foyer-panels.js'
import { createReplay } from './replay.js' // T11 今日回放（真实事件账本）：回放入口 / 回放期间暂停实时事件的最小挂钩
import { normalizeCameraState, resolvePlaceMode } from './place-mode.js'
import { isolateDrPlace, prepareDrPage } from './dr-place-view.js'
const APP_STARTED = performance.now()

// ───────────────────────── 品牌色（DR.LIFE+ VI 1.0 · 标准色）─────────────────────────
const VI = { graphite: 0x202326, ivory: 0xf4f1eb, gold: 0xb69a64, silver: 0xc7cbcf }
const POLL_MS = 3000
// 大屏嵌入模式（?wall=1）：给 /wall 大屏页里的 iframe 用——隐藏所有面板和工具栏、镜头自动巡游、不弹窗；上层页面通过 window.__office.wallGo(区域) 切镜头
const WALL_MODE = new URLSearchParams(location.search).has('wall')
const FIXED_DPR = new URLSearchParams(location.search).has('fixeddpr') // 诊断用：关闭自适应分辨率（刷新后闪屏时，打开 /?fixeddpr=1 对比一下）
const PLACE_MODE = resolvePlaceMode(location.search)
const DR_MODE = PLACE_MODE.place === 'dr'
const CONTROL_ROOM_MODE = DR_MODE && PLACE_MODE.controlRoom === true
const LAYOUT3_MODE = OFFICE_LAYOUT.version === 3
const OFFICE_SAMPLE_MODE = LAYOUT3_MODE && !DR_MODE && officeSampleRequested(location.search)
const CAMPUS_MODE = PLACE_MODE.campus
if (DR_MODE) prepareDrPage(PLACE_MODE)
if (WALL_MODE) document.addEventListener('DOMContentLoaded', () => document.body.classList.add('clean', 'wall'))
const ROOM = { w: ENVELOPE.x1 - MAIN_FLOOR_X0, d: ENVELOPE.z1 - ENVELOPE.z0 }
const BACK_Z = -ROOM.d / 2
const WALL_H = 4.2
const focusOf = (id) => regionFocusOf(OFFICE_LAYOUT, id)
const ZONES = Object.fromEntries(Object.entries({ product: 0x8b6cff, eng: 0x28b4d6, quality: 0xe8963a, drlife: 0xb69a64, ops: 0x3fbf8f, kb: 0x6c8cff, meet: 0x8b6cff, board: 0xffb020 }).map(([id, accent]) => [id, { label: focusOf(id).label, accent, focus: focusOf(id) }]))
// 新同事的形象：Rocketbox 只下载了 22 位，运维两位暂时借用其他区同事的形象（要更多不同的脸需要再批准下载）
const CAST_OVERRIDE = { OpsLead: 'Male_Adult_11', OpsEngineer: 'Female_Adult_07', KnowledgeKeeper: 'Female_Adult_09' }
const FALLBACK = SEATS.Backend2
const MODEL_BADGE = { claude: 0xd9825b, codex: 0x2bb3a3, deepseek: 0x4d7cff }
const SKIN = [0xf1c9a5, 0xd9a577, 0xb97c53, 0x8d5a3b, 0xe6b894]
const HAIR = [0x1b1b1f, 0x3b2a1f, 0x5a3a22, 0x8a8a92, 0x2a2233]
const HAIRSTYLE = {
  male: ['Hair_SimpleParted', ['Hair_Buzzed', 'Hair_Beard'], 'Hair_Buzzed', ['Hair_SimpleParted', 'Hair_Beard']],
  female: ['Hair_Long', 'Hair_Buns', 'Hair_SimpleParted', 'Hair_BuzzedFemale'],
}
const HAIR_TINT =[0xffffff, 0xd9c2a6, 0xa89886, 0x7a6e66, 0xe8d6b8, 0x9a8f88]
const SHIRTS = [0x2b3038, 0x3a3f4a, 0x4a443c, 0x2f3b3a, 0x34303c, 0x454b55]
const ZONE_BADGE ={ product: 0x8b6cff, eng: 0x28b4d6, quality: 0xe8963a, drlife: 0xb69a64, ops: 0x3fbf8f, kb: 0x6c8cff }

const STALL_MS = 5 * 60 * 1000 // 超过 5 分钟没有任何输出，就不再算「执行中」
const WAIT_LABEL = { review: '待人工审核', question: '待你回答', undelivered: '回答未送达' }
const WAIT_HINT = {
  review: '任务已提交审查，在 Paperclip 里打开任务评审：通过 / 要求修改',
  question: 'agent 提了问题，在任务页回答后它才会继续',
  undelivered: '你的回答没能送达 agent（它当时没有在运行），需要在任务里重发或唤醒它',
}
function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 90) return `${s} 秒`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ''}`
}
const $ = (id) => document.getElementById(id)
const setText = (id, v) => { $(id).textContent = v }
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()

// ───────────────────────── 渲染器 / 场景 ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
let qualityStorage
try { qualityStorage = localStorage } catch {}
const qualitySelection = initialQuality({ search:location.search, storage:qualityStorage, wall:WALL_MODE })
const debugGPU = renderer.getContext().getExtension('WEBGL_debug_renderer_info')
const qualityPolicy = createQualityPolicy({ selection:qualitySelection, wall:WALL_MODE, signals:{ cores:navigator.hardwareConcurrency, memory:navigator.deviceMemory, gpu:debugGPU ? renderer.getContext().getParameter(debugGPU.UNMASKED_RENDERER_WEBGL) : '' } })
// 显卡上下文丢失（驱动重置、显存不足、长时间后台）时：提示一下，恢复后自动重新加载页面
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  const b = document.getElementById('err')
  if (b) { b.style.display = 'block'; b.textContent = '显卡渲染中断了，正在恢复…（恢复后页面会自动重新加载；一直不恢复请手动刷新）' }
  // 不要定时强制刷新：反复丢失上下文会让浏览器把本页的 WebGL 整个封掉
})
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload())
// 分辨率自适应：从 min(设备像素比, 1.5) 起步，帧率低就自动降、富余就慢慢升回去（见 frame()）
const DPR_MAX = Math.min(window.devicePixelRatio || 1, 1.5)
let dpr = cappedDpr(qualityPolicy.tier, DPR_MAX, innerWidth, innerHeight)
renderer.setPixelRatio(dpr)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.shadowMap.autoUpdate = false
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.85
renderer.outputColorSpace = THREE.SRGBColorSpace
$('stage').appendChild(renderer.domElement)
renderer.domElement.tabIndex = 0
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 6000)

function canvasTex(w, h, draw, repeat, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = renderer.capabilities.getMaxAnisotropy()
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
  return t
}
const loader = new THREE.TextureLoader()
function loadTex(url) { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }
const logoTex = loadTex('./assets/logo.png') // 设计师提供的标志位图（VI 手册）
const markTex = loadTex('./assets/logo-mark.png')

// ───────────────────────── 光照（阳光 + 天光）─────────────────────────
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x6b5d4c, 0.45)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff0d8, 2.0)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048) // 4096 太重；68×60 米范围下 2048 每像素约 3 厘米，够用
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 30, bottom: -30, near: 1, far: 140 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.03
sun.shadow.radius = 3
scene.add(sun)
const fill = new THREE.DirectionalLight(0xa9bfff, 0.35)
fill.position.set(18, 12, -10)
scene.add(fill)

// ───────────────────────── 材质 ─────────────────────────
const M = {
  ivory: new THREE.MeshStandardMaterial({ color: 0xe2dbcf, roughness: 0.95 }),
  graphite: new THREE.MeshStandardMaterial({ color: VI.graphite, roughness: 0.78 }),
  graphiteMetal: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.38, metalness: 0.75 }),
  gold: new THREE.MeshStandardMaterial({ color: VI.gold, roughness: 0.32, metalness: 0.95 }),
  silver: new THREE.MeshStandardMaterial({ color: VI.silver, roughness: 0.3, metalness: 0.95 }),
  oak: new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.42 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.55 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.85 }),
}
function add(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = true
  parent.add(m)
  return m
}
const box = (w, h, d, mat, x, y, z, shadow = true) => add(scene, new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow)

// ───────────────────────── 房间：象牙白墙 · 大理石地面 ─────────────────────────
const marble = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#d6cfc2'
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 320; i++) {
    g.strokeStyle = `rgba(${110 + rnd() * 50 | 0},${105 + rnd() * 45 | 0},${98 + rnd() * 40 | 0},${0.05 + rnd() * 0.12})`
    g.lineWidth = 0.6 + rnd() * 2.2
    g.beginPath()
    let x = rnd() * w, y = rnd() * h
    g.moveTo(x, y)
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.4) * 160; y += (rnd() - 0.5) * 120; g.quadraticCurveTo(x - 40 + rnd() * 80, y - 40 + rnd() * 80, x, y) }
    g.stroke()
  }
  g.strokeStyle = 'rgba(80,72,62,.22)'
  g.lineWidth = 3
  g.strokeRect(0, 0, w, h)
}, [ROOM.w / 8, ROOM.d / 8])
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: marble, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.35 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

// 后墙：形象墙居中（x≈0.5）不开窗，其余四扇窗
const winXs = [-17, -10, 11, 18]
box(ROOM.w, 1.0, 0.3, M.ivory, 0, 0.5, BACK_Z)
box(ROOM.w, 0.7, 0.3, M.ivory, 0, WALL_H - 0.35, BACK_Z)
const piers = [-ROOM.w / 2, ...winXs.flatMap((x) => [x - 1.6, x + 1.6]), ROOM.w / 2]
for (let i = 0; i < piers.length; i += 2) {
  const a = piers[i], b = piers[i + 1]
  if (b - a > 0.05) box(b - a, WALL_H, 0.3, M.ivory, (a + b) / 2, WALL_H / 2, BACK_Z)
}
box(ROOM.w, 0.22, 0.34, M.graphite, 0, 0.11, BACK_Z + 0.02, false)
const sceneBeforeEnvironment = new Set(scene.children)
const env3d = buildEnvironment({ scene, renderer, camera, sun, hemi, rnd, officeWarm: OFFICE_SAMPLE_MODE })
const environmentRoots = new Set(scene.children.filter((root) => !sceneBeforeEnvironment.has(root)))
env3d.setQuality(qualityPolicy.tier)
for (const x of winXs) {
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 2.45), new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.1, roughness: 0.05 }))
  glass.position.set(x, 2.35, BACK_Z + 0.16)
  scene.add(glass)
  box(0.06, 2.5, 0.06, M.graphite, x, 2.35, BACK_Z + 0.17, false)
  box(3.2, 0.06, 0.06, M.graphite, x, 2.35, BACK_Z + 0.17, false)
}
for (const sx of [ROOM.w / 2]) { // 西墙拆掉了，西边接着西翼（见 wing.js）
  box(0.2, 1.1, ROOM.d, M.ivory, sx, 0.55, 0)
  const g = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.d, 1.6), new THREE.MeshPhysicalMaterial({ color: 0xdde8ff, transparent: true, opacity: 0.08, roughness: 0.08, side: THREE.DoubleSide }))
  g.rotation.y = Math.PI / 2
  g.position.set(sx, 1.9, 0)
  scene.add(g)
}

// ───────────────────────── 入口形象墙（VI 手册：石墨圆面 + 银金标志 + 暖白背光 + 绿植带）─────────────────────────
const FW = { x: CORRIDOR_X, y: 2.3, z: BACK_Z + 0.2 }
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.42, 2.95, 96, 1, Math.PI * 0.32, Math.PI * 1.72), new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.9, side: THREE.DoubleSide }))
  ring.position.set(FW.x, FW.y, FW.z + 0.02)
  ring.receiveShadow = true
  scene.add(ring)
  const ringShadow = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 96, 1, Math.PI * 0.32, Math.PI * 1.72), new THREE.MeshBasicMaterial({ color: 0x8a8174, transparent: true, opacity: 0.18, side: THREE.DoubleSide }))
  ringShadow.position.set(FW.x + 0.05, FW.y - 0.05, FW.z + 0.01)
  scene.add(ringShadow)
  const glowTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2)
    gr.addColorStop(0, 'rgba(255,205,140,0)'); gr.addColorStop(0.62, 'rgba(255,205,140,0.85)'); gr.addColorStop(0.8, 'rgba(255,205,140,0.25)'); gr.addColorStop(1, 'rgba(255,205,140,0)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
  })
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  glow.position.set(FW.x, FW.y, FW.z + 0.03)
  scene.add(glow)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.05, 96), new THREE.MeshStandardMaterial({ color: VI.graphite, roughness: 0.82 }))
  disc.position.set(FW.x, FW.y, FW.z + 0.06)
  disc.receiveShadow = true
  scene.add(disc)
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.1, 96), new THREE.MeshStandardMaterial({ color: VI.gold, roughness: 0.3, metalness: 0.95 }))
  rim.position.set(FW.x, FW.y, FW.z + 0.065)
  scene.add(rim)
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4 * (544 / 979)), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }))
  logo.position.set(FW.x, FW.y + 0.22, FW.z + 0.075)
  scene.add(logo)
  const slogan = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.38), new THREE.MeshBasicMaterial({
    map: canvasTex(760, 152, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.fillStyle = '#c9ae78'
      g.font = '600 38px Inter, Arial, sans-serif'; g.letterSpacing = '8px'; g.fillText('INFINITE POSSIBILITIES!', w / 2, 56)
      g.fillStyle = '#e6d6b2'; g.font = '500 40px "Source Han Sans SC","Microsoft YaHei",sans-serif'; g.letterSpacing = '6px'; g.fillText('生活 · 无限可能', w / 2, 122)
    }), transparent: true, toneMapped: false,
  }))
  slogan.position.set(FW.x, FW.y - 1.28, FW.z + 0.075)
  scene.add(slogan)
  const warm = new THREE.PointLight(0xffc98a, 6, 12, 1.8)
  warm.position.set(FW.x, FW.y, FW.z + 1.6)
  scene.add(warm)
  box(6.4, 0.34, 0.8, M.ivory, FW.x, 0.17, BACK_Z + 0.75)
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.8 })
  for (let i = 0; i < 46; i++) {
    const m = add(scene, new THREE.SphereGeometry(0.1 + rnd() * 0.07, 8, 6), leaf, FW.x - 3 + rnd() * 6, 0.45 + rnd() * 0.28, BACK_Z + 0.5 + rnd() * 0.5, false)
    m.scale.y = 0.8
  }
}

// ───────────────────────── 地毯：石墨 + 香槟金包边 ─────────────────────────
function carpet(x0, x1, z0, z1) {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 9000; i++) { const v = 190 + rnd() * 65 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
  }, [(x1 - x0) / 2, (z1 - z0) / 2])
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x2b3038, map: tex, roughness: 1 }))
  m.rotation.x = -Math.PI / 2
  m.position.set((x0 + x1) / 2, 0.014, (z0 + z1) / 2)
  m.receiveShadow = true
  scene.add(m)
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.16, z1 - z0 + 0.16), new THREE.MeshStandardMaterial({ color: VI.gold, roughness: 0.35, metalness: 0.9 }))
  edge.rotation.x = -Math.PI / 2
  edge.position.set((x0 + x1) / 2, 0.009, (z0 + z1) / 2)
  scene.add(edge)
}
for (const r of OFFICE_ROOMS.filter(r => !['review', 'plan'].includes(r.id))) carpet(r.x0 + 0.5, r.x1 - 0.5, r.z0 + 0.5, r.z1 - 0.5)

// ───────────────────────── 招牌（黑色拉丝招牌 + 银金标志）─────────────────────────
function hangingSign(x, y, z, w, h, content) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.userData.legacyHangingSign = true
  add(g, new THREE.BoxGeometry(w, h, 0.14), M.graphiteMetal, 0, 0, 0)
  add(g, new THREE.BoxGeometry(w + 0.06, 0.03, 0.16), M.gold, 0, h / 2, 0, false)
  add(g, new THREE.BoxGeometry(w + 0.06, 0.03, 0.16), M.gold, 0, -h / 2, 0, false)
  for (const sx of [-w * 0.38, w * 0.38]) add(g, new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), M.silver, sx, h / 2 + 0.7, 0, false)
  content(g)
  scene.add(g)
}
hangingSign(REGION_FOCUS.drlife.t[0], 3.3, OFFICE_ROOMS.find(r => r.id === 'drlife').z0 + 0.2, 3.5, 1.0, (g) => {
  g.name = 'drlife-door-logo'
  g.userData.legacyHangingSign = false
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * (544 / 979)), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }))
  logo.position.set(-0.55, 0, 0.075)
  g.add(logo)
  const t = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), new THREE.MeshBasicMaterial({
    map: canvasTex(480, 192, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#b69a64'; c.fillRect(0, 36, 3, 120); c.fillStyle = '#e6d6b2'; c.font = '600 58px "Source Han Sans SC","Microsoft YaHei",sans-serif'; c.fillText('研发工作室', 26, 100); c.fillStyle = '#b69a64'; c.font = '30px Inter, Arial, sans-serif'; c.letterSpacing = '4px'; c.fillText('ENGINEERING', 28, 150) }),
    transparent: true, toneMapped: false,
  }))
  t.position.set(0.95, 0, 0.075)
  g.add(t)
})
hangingSign(-6.5, 3.05, -0.2, 3.9, 0.9, (g) => {
  const t = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), new THREE.MeshBasicMaterial({
    map: canvasTex(1080, 210, (c, w, h) => { c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = '#e6d6b2'; c.font = '700 74px "Source Han Sans SC","Microsoft YaHei",sans-serif'; c.letterSpacing = '6px'; c.fillText('智序工场', w / 2, 98); c.fillStyle = '#b69a64'; c.font = '34px Inter, Arial, sans-serif'; c.letterSpacing = '9px'; c.fillText('VIRTUAL AI OFFICE', w / 2, 160) }),
    transparent: true, toneMapped: false,
  }))
  t.position.z = 0.075
  g.add(t)
})

// ───────────────────────── 素材（CC0，失败则退回程序生成的造型）─────────────────────────
let A = null
const loadText = (t, p) => { const el = $('loadText'); if (el) el.textContent = t; const b = $('loadBar'); if (b && p !== undefined) b.style.width = Math.round(p * 100) + '%' }
try {
  loadText('正在搬家具…', 0.05)
  A = await loadAssets()
} catch (e) {
  console.warn('素材加载失败，使用程序生成的造型：', e)
}
// 写实人物（Rocketbox）；失败时退回上一版人物
let PEOPLE = null
try { if (!DR_MODE && !LAYOUT3_MODE) {
  PEOPLE = await loadPeople((p) => loadText('同事们正在到岗…', 0.15 + p * 0.8))
} } catch (e) {
  console.warn('写实人物加载失败，退回旧人物：', e)
}
loadText('马上就好…', 1)
const furnitureCollision = createFurnitureCollision()
const officeFurnitureV2 = startOfficeV2({ THREE, scene, quality: qualityPolicy, materials: M, collision: furnitureCollision, canvasTex, A, placeFurniture, makeScreenTexture, floor, now: () => new Date().getTime() })
function furn(name, x, z, opt) {
  const f = placeFurniture(A, name, x, z, opt)
  scene.add(f.group)
  if (/^(desk|chairDesk|table|chairModernCushion|chairRounded|loungeSofa|loungeSofaLong|loungeChair|tableCoffee)$/.test(name)) furnitureCollision.add(f.group, name)
  return f
}

// ───────────────────────── 西翼：会议室 + 运维 / 知识库工作区 ─────────────────────────
// Rev3 由 registry 的 furniture3 模块创建同一套会议家具，不能先叠加旧西翼再销毁。
let wing = LAYOUT3_MODE ? { seats: [], drawSchedule() {}, drawRoom() {} } : buildWing({ scene, box, add, M, VI, canvasTex, marble, furn, A, WALL_H, BACK_Z, carpet, furnitureCollision })
let MEET_SEATS = wing.seats
// 会议室里每个座位的走法：从工位 → 过道 → 西翼入口 → 会议室门 → 绕过桌子的侧过道 → 座位
for (const seat of MEET_SEATS) seat.pathFn = v => meetingTrip(v.home, seat)

// ───────────────────────── 家具 ─────────────────────────
function makeScreenTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 144
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return { ctx: c.getContext('2d'), tex: t, scroll: 0, last: '' }
}
function drawScreen(scr, mode, tick) {
  const g = scr.ctx, w = 256, h = 144
  const key = mode + ((mode === 'run' || mode === 'idle') ? tick : '') + (markTex.image ? 'm' : '')
  if (scr.last === key) return
  scr.last = key
  if (mode === 'run') {
    g.fillStyle = '#0a1018'; g.fillRect(0, 0, w, h)
    scr.scroll = (scr.scroll + 5) % 400
    g.fillStyle = '#182533'; g.fillRect(0, 0, w, 20)
    g.fillStyle = '#b69a64'; g.fillRect(10, 8, 8, 4)
    g.fillStyle = '#dce8ee'; g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.fillText('LIVE WORKSPACE', 24, 12)
    g.fillStyle = '#35d07f'; g.beginPath(); g.arc(241, 10, 3, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#13202b'; g.fillRect(10, 28, 58, 106)
    g.fillStyle = '#88a6b5'; g.font = '8px sans-serif'
    ;['PLAN', 'BUILD', 'TEST', 'SHIP'].forEach((label, i) => { g.fillText(label, 19, 44 + i * 20); g.fillStyle = i < 2 ? '#35d07f' : '#6d8490'; g.fillRect(16, 49 + i * 20, 42, 3); g.fillStyle = '#88a6b5' })
    g.fillStyle = '#263747'; g.fillRect(78, 28, 168, 20)
    g.fillStyle = '#e6e0d2'; g.font = '9px sans-serif'; g.fillText('agent execution', 88, 41)
    g.fillStyle = '#35d07f'; g.fillRect(190, 36, 42, 5)
    for (let i = 0; i < 7; i++) {
      const y = 58 + i * 11 - (scr.scroll % 11)
      const seed = Math.floor(scr.scroll / 11) + i
      g.fillStyle = ['#d9bf8a', '#9fe7b4', '#8ad8ff', '#e6e0d2'][seed % 4]
      g.globalAlpha = 0.82
      g.fillRect(82, y, 20 + ((seed * 13) % 5) * 10, 4)
      g.fillStyle = '#415866'; g.fillRect(108, y, 75 + ((seed * 17) % 4) * 11, 4)
      g.fillStyle = '#2bb3a3'; g.fillRect(194, y, 22 + ((seed * 7) % 3) * 7, 4)
    }
    g.globalAlpha = 1
  } else if (mode === 'err') {
    g.fillStyle = '#2a0a0e'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#ff5d5d'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('!', w / 2, 84)
    g.font = '15px sans-serif'; g.fillText('ERROR', w / 2, 112)
  } else if (mode === 'stall') {
    g.fillStyle = '#241a08'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffb020'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('…', w / 2, 76)
    g.font = '15px sans-serif'; g.fillText('NO OUTPUT', w / 2, 108)
  } else {
    g.fillStyle = '#0d1116'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#1b2b35'; g.fillRect(12, 12, 232, 18)
    g.fillStyle = '#b69a64'; g.font = 'bold 11px Inter, Arial, sans-serif'; g.textAlign = 'left'; g.fillText('VIRTUAL AI OFFICE', 20, 25)
    g.fillStyle = '#7d939d'; g.font = '9px sans-serif'; g.fillText('standby / ready for next task', 20, 46)
    g.fillStyle = '#31444d'; g.fillRect(20, 60, 216, 5); g.fillRect(20, 75, 160, 5); g.fillRect(20, 90, 188, 5)
    g.fillStyle = '#35d07f'; g.fillRect(20, 60, 64, 5)
    g.fillStyle = 'rgba(182,154,100,.8)'; g.font = 'bold 10px sans-serif'; g.textAlign = 'right'; g.fillText('READY', 236, 122 + (tick % 2))
    if (markTex.image) g.drawImage(markTex.image, 108, 103, 34, 30)
  }
  scr.tex.needsUpdate = true
}
function makeDeskModel(x, z, accent) {
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  scene.add(g)
  const put = (name, px, py, pz, opt = {}) => {
    const f = placeFurniture(A, name, px, pz, { y: py, ...opt })
    g.add(f.group)
    return f
  }
  const deskBody = put('desk', 0, 0, 0)
  furnitureCollision.add(deskBody.group, 'desk')
  const mon = put('computerScreen', 0, 0.76, -0.2)
  put('computerKeyboard', -0.12, 0.76, 0.16)
  put('computerMouse', 0.43, 0.76, 0.16)
  const deskPad = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.012, 0.38), new THREE.MeshStandardMaterial({ color: 0x28343d, roughness: 0.85 }))
  deskPad.position.set(0.08, 0.765, 0.16)
  g.add(deskPad)
  const dice = rnd()
  if (dice < 0.4) put('books', 0.6, 0.76, -0.12, { rotY: 0.2 })
  else if (dice < 0.7) put('lampRoundTable', -0.62, 0.76, -0.22, { scale: 1.6 })
  else put('plantSmall1', 0.6, 0.76, -0.14, { scale: 2.2 })
  const scr = makeScreenTexture()
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }))
  // 贴合 Kenney 显示器的屏幕面（实测：面朝 +z，向后倾约 8°，面上 z = 0.048 − 0.14·y，面的高度约 0.17–0.58，宽 0.785）
  screen.geometry.dispose()
  // 只覆盖显示器内框，避免运行贴图越过黑色边框。
  screen.geometry = new THREE.PlaneGeometry(0.62, 0.349)
  screen.position.set(0, 0.76 + 0.375, -0.2 + 0.0002)
  screen.rotation.x = -0.14
  g.add(screen)
  const bezel = new THREE.Group()
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.42, metalness: 0.25 })
  const bars = [[0, 0.19, 0.7, 0.025], [0, -0.19, 0.7, 0.025], [-0.34, 0, 0.025, 0.41], [0.34, 0, 0.025, 0.41]]
  for (const [bx, by, bw, bh] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.018), bezelMat)
    bar.position.set(bx, 1.135 + by, -0.205)
    bar.rotation.x = -0.14
    bezel.add(bar)
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }))
  led.position.set(0.27, 0.955, -0.22)
  bezel.add(led)
  g.add(bezel)
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.09, 14), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }), -0.55, 0.805, 0.12)
  return { group: g, scr }
}
function makeDesk(x, z, accent) {
  if (officeFurnitureV2?.deskAt(x, z)) return officeFurnitureV2.deskAt(x, z)
  if (A) return makeDeskModel(x, z, accent)
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  add(g, new THREE.BoxGeometry(1.7, 0.05, 0.85), M.oak, 0, 0.75, 0)
  add(g, new THREE.BoxGeometry(1.72, 0.012, 0.012), M.gold, 0, 0.778, 0.43, false)
  add(g, new THREE.BoxGeometry(0.05, 0.73, 0.8), M.graphiteMetal, -0.78, 0.365, 0)
  add(g, new THREE.BoxGeometry(0.05, 0.73, 0.8), M.graphiteMetal, 0.78, 0.365, 0)
  add(g, new THREE.BoxGeometry(1.5, 0.3, 0.03), M.graphite, 0, 0.55, -0.38)
  const scr = makeScreenTexture()
  add(g, new THREE.BoxGeometry(0.72, 0.42, 0.03), M.graphiteMetal, 0, 1.12, -0.22)
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.60, 0.3375), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }))
  screen.position.set(0, 1.12, -0.203)
  g.add(screen)
  add(g, new THREE.CylinderGeometry(0.03, 0.05, 0.3, 12), M.graphiteMetal, 0, 0.92, -0.24)
  add(g, new THREE.BoxGeometry(0.82, 0.012, 0.38), new THREE.MeshStandardMaterial({ color: 0x28343d, roughness: 0.85 }), 0.08, 0.785, 0.16)
  add(g, new THREE.BoxGeometry(0.46, 0.02, 0.15), M.white, -0.12, 0.797, 0.2)
  add(g, new THREE.BoxGeometry(0.06, 0.025, 0.1), M.white, 0.43, 0.799, 0.2)
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.09, 14), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 }), -0.62, 0.82, 0.08)
  scene.add(g)
  furnitureCollision.add(g, 'desk')
  return { group: g, scr }
}
function makeChair(x, z) {
  if (officeFurnitureV2?.deskAt(x, z - 1)) return officeFurnitureV2.deskAt(x, z - 1).chair
  if (A) return furn('chairDesk', x, z + 0.05, { rotY: Math.PI }).group
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  add(g, new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20), M.chair, 0, 0.5, 0)
  add(g, new THREE.BoxGeometry(0.46, 0.5, 0.06), M.chair, 0, 0.82, 0.22)
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), M.graphiteMetal, 0, 0.27, 0)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    add(g, new THREE.BoxGeometry(0.34, 0.03, 0.04), M.graphiteMetal, Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.17).rotation.y = -a
  }
  scene.add(g)
  furnitureCollision.add(g, 'chairDesk')
  return g
}
function makePlant(x, z, s = 1) {
  if (A) { furn('pottedPlant', x, z, { scale: 2.6 * s, rotY: rnd() * 6 }); return }
  const g = new THREE.Group()
  g.position.set(x, 0, z)
  add(g, new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.5 * s, 16), M.ivory, 0, 0.25 * s, 0)
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.8 })
  for (let i = 0; i < 7; i++) add(g, new THREE.SphereGeometry((0.3 + rnd() * 0.15) * s, 12, 10), leaf, (rnd() - 0.5) * 0.4 * s, (0.75 + rnd() * 0.7) * s, (rnd() - 0.5) * 0.4 * s).scale.y = 1.3
  scene.add(g)
}
for (const [x, z, s] of [[-20.2, -11.5, 1.2], [20.6, -12, 1.1], [-20.4, 11.5, 1.1], [5.2, -11.4, 1], [6, 11.5, 1.2], [20.4, 11.6, 1.1], [-3.2, 11.4, 1]]) makePlant(x, z, s)
function whiteboard(x, label, color) {
  if (officeFurnitureV2) return
  box(3.6, 1.7, 0.08, M.graphiteMetal, x, 1.9, BACK_Z + 0.2, false)
  const tex = canvasTex(512, 240, (g, w, h) => {
    g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, w, h)
    g.fillStyle = color; g.font = 'bold 34px sans-serif'; g.fillText(label, 24, 54)
    g.strokeStyle = 'rgba(60,70,90,.5)'; g.lineWidth = 3
    for (let i = 0; i < 4; i++) { g.strokeRect(24 + i * 118, 90, 100, 56); if (i < 3) { g.beginPath(); g.moveTo(124 + i * 118, 118); g.lineTo(142 + i * 118, 118); g.stroke() } }
    g.fillStyle = 'rgba(60,70,90,.3)'
    for (let i = 0; i < 4; i++) g.fillRect(24, 170 + i * 16, 200 + (i * 53) % 180, 6)
  })
  const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.55), new THREE.MeshBasicMaterial({ map: tex }))
  p.position.set(x, 1.9, BACK_Z + 0.245)
  scene.add(p)
}
whiteboard(-13.5, 'PRODUCT / DESIGN', '#8b6cff')
whiteboard(-6.5, 'ENGINEERING', '#28b4d6')

// ───────────────────────── 休息区 / 书柜 / 迎宾地毯（需要素材）─────────────────────────
function makeLoungeSofa(name, x, z, yaw) {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, 0, z); g.rotation.y = yaw
  const fabric = new THREE.MeshStandardMaterial({ color: 0x263e54, roughness: 0.93 })
  const trim = new THREE.MeshStandardMaterial({ color: 0x496176, roughness: 0.85 })
  // 原素材的前部结构与三人坐姿的膝盖相交，改用有明确腿部净空的座面。
  add(g, new THREE.BoxGeometry(2.8, 0.14, 1.2), fabric, 0, 0.39, 0)
  for (const sx of [-0.95, 0, 0.95]) add(g, new THREE.BoxGeometry(0.9, 0.07, 1.1), fabric, sx, 0.495, -0.02)
  add(g, new THREE.BoxGeometry(2.8, 0.72, 0.14), fabric, 0, 0.8, 0.57)
  for (const sx of [-1.46, 1.46]) {
    add(g, new THREE.BoxGeometry(0.12, 0.33, 1.2), fabric, sx, 0.58, 0)
    add(g, new THREE.BoxGeometry(0.125, 0.02, 1.2), trim, sx, 0.755, 0)
  }
  for (const sx of [-0.94, 0.94]) for (const sz of [-0.3, 0.3]) add(g, new THREE.BoxGeometry(0.07, 0.32, 0.07), M.silver, sx, 0.16, sz)
  scene.add(g)
  furnitureCollision.add(g, 'loungeSofaLong')
}
function decorate() {
  // 迎宾地毯：石墨圆毯 + 香槟金边 + 标志，正对入口形象墙
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), new THREE.MeshStandardMaterial({ color: 0x353a41, roughness: 1 }))
  rug.rotation.x = -Math.PI / 2
  rug.position.set(FW.x, 0.016, BACK_Z + 3.4)
  rug.receiveShadow = true
  scene.add(rug)
  const rim = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.78, 64), new THREE.MeshStandardMaterial({ color: VI.gold, roughness: 0.35, metalness: 0.9 }))
  rim.rotation.x = -Math.PI / 2
  rim.position.set(FW.x, 0.018, BACK_Z + 3.4)
  scene.add(rim)
  const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9 * (390 / 313)), new THREE.MeshBasicMaterial({ map: markTex, transparent: true, toneMapped: false, depthWrite: false }))
  mk.rotation.x = -Math.PI / 2
  mk.position.set(FW.x, 0.02, BACK_Z + 3.4)
  scene.add(mk)

  // 地面画块区分迎宾和休息，家具不再占据门洞和主通道。
  const floorBlock = (name, x, z, w, d, color) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }))
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.024, z); p.receiveShadow = true; scene.add(p)
    const text = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.4, 5), 0.42), new THREE.MeshBasicMaterial({ map: canvasTex(1000, 84, c => { c.fillStyle = '#e8d6aa'; c.textAlign = 'center'; c.font = '600 46px "Microsoft YaHei",sans-serif'; c.fillText(name, 500, 58) }), transparent: true, depthWrite: false, toneMapped: false }))
    text.rotation.x = -Math.PI / 2; text.position.set(x, 0.03, z + d / 2 - 0.27); scene.add(text)
  }
  { // DR广场地面标识：一块铺装嵌片 + 金边 + 中心圆环和名称，只加 1 个网格
    const w = PLAZA.x1 - PLAZA.x0, d = PLAZA.z1 - PLAZA.z0
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: canvasTex(1536, 896, c => {
      c.fillStyle = '#8f8878'; c.fillRect(0, 0, 1536, 896)
      c.strokeStyle = '#d8c28a'; c.lineWidth = 10; c.strokeRect(16, 16, 1504, 864)
      c.lineWidth = 4; c.strokeRect(40, 40, 1456, 816)
      c.strokeStyle = 'rgba(232,214,170,.55)'; c.lineWidth = 8; c.beginPath(); c.arc(768, 448, 250, 0, Math.PI * 2); c.stroke()
      c.fillStyle = '#e8d6aa'; c.textAlign = 'center'; c.font = '700 150px sans-serif'; c.fillText('DR 广场', 768, 440)
      c.font = '600 64px sans-serif'; c.fillText('DR PLAZA', 768, 540)
    }), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    plaza.name = 'dr-plaza'; plaza.rotation.x = -Math.PI / 2; plaza.position.set((PLAZA.x0 + PLAZA.x1) / 2, -0.575, (PLAZA.z0 + PLAZA.z1) / 2); plaza.receiveShadow = true; scene.add(plaza)
  }
  if (officeFurnitureV2) return
  floorBlock('休息交流区 · LOUNGE', LOUNGE_AREA.x, LOUNGE_AREA.z, LOUNGE_AREA.width, LOUNGE_AREA.depth, 0x5d655f)
  floorBlock('欢迎光临 · WELCOME', CORRIDOR_X, LOUNGE_AREA.z, ENTRANCE.x1 - ENTRANCE.x0, LOUNGE_AREA.depth, 0x454e57)
  const welcomeSlogan = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4 / 12), new THREE.MeshBasicMaterial({ map: canvasTex(1536, 128, g => {
    g.fillStyle = '#e8d6aa'; g.textAlign = 'center'; g.font = '600 88px sans-serif'; g.fillText('INFINITE POSSIBILITIES', 768, 94)
  }), transparent: true, depthWrite: false, toneMapped: false }))
  welcomeSlogan.name = 'entrance-slogan'
  welcomeSlogan.rotation.x = -Math.PI / 2; welcomeSlogan.position.set(CORRIDOR_X, 0.034, LOUNGE_AREA.z + 0.7); scene.add(welcomeSlogan)
  const reception = OFFICE_ROOMS.find(r => r.id === 'drlife')
  floorBlock('接待前厅 · RECEPTION', (reception.x0 + reception.x1) / 2, LOUNGE_AREA.z, reception.x1 - reception.x0 - 3, LOUNGE_AREA.depth, 0x55535c)
  makeLoungeSofa('foyer-lounge_west_sofa', -12.5, LOUNGE_AREA.z, -Math.PI / 2)
  makeLoungeSofa('foyer-lounge_east_sofa', -6.5, LOUNGE_AREA.z, Math.PI / 2)
  const loungeTable = furn('tableCoffee', LOUNGE_AREA.x, LOUNGE_AREA.z, { scale: 1.4 })
  loungeTable.group.name = 'foyer-lounge_coffee_table'
  furn('books', LOUNGE_AREA.x, LOUNGE_AREA.z, { y: 0.325, scale: 1.4 })
  furn('sideTable', LOUNGE_AREA.x - 3.5, LOUNGE_AREA.z + 1, { scale: 1.5 })
  furn('lampRoundTable', LOUNGE_AREA.x - 3.5, LOUNGE_AREA.z + 1, { y: 0.6, scale: 1.5 })
  furn('plantSmall1', LOUNGE_AREA.x + 3.5, LOUNGE_AREA.z + 1, { scale: 2 })
  const kb = OFFICE_ROOMS.find(r => r.id === 'kb')
  for (const dz of [-1, 0, 1]) furn(dz === 0 ? 'bookcaseOpen' : 'bookcaseClosed', kb.x0 + 0.5, REGION_FOCUS.kb.t[2] + dz, { rotY: Math.PI / 2, scale: 2.2 })
  for (const dz of [-1, 0, 1]) furn(dz === 0 ? 'bookcaseOpen' : 'bookcaseClosed', reception.x1 - 0.5, LOUNGE_AREA.z + dz, { rotY: -Math.PI / 2, scale: 2.2 })
  for (const r of OFFICE_ROOMS.filter(r => ['product', 'eng', 'quality', 'drlife', 'ops'].includes(r.id))) furn('trashcan', r.x0 + 0.5, r.z0 + 0.5, { scale: 2 })
  const ops = OFFICE_ROOMS.find(r => r.id === 'ops')
  furn('speaker', ops.x0 + 0.5, ops.z0 + 1.5, { rotY: Math.PI / 2, scale: 2 })
}
if (A) decorate()

// 前台、迎宾通道和后方形象墙共用中轴，人物从前台左侧绕行。
if (!officeFurnitureV2) {
  const reception = new THREE.Group()
  reception.name = 'entrance-reception'
  reception.position.set(RECEPTION.x, 0, RECEPTION.z)
  scene.add(reception)
  const stoneTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#202326'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 32; i++) {
      g.strokeStyle = i % 4 ? 'rgba(204,195,176,.13)' : 'rgba(182,154,100,.35)'
      g.lineWidth = i % 4 ? 0.8 : 1.2
      const y = i * 19
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(160, y - 110, 330, y + 45, w, y - 160); g.stroke()
    }
  })
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.3, metalness: 0.15 })
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd49a, toneMapped: false })
  const part = (w, h, d, mat, x, y, z) => add(reception, new THREE.BoxGeometry(w, h, d), mat, x, y, z)
  part(5.4, 2.9, 0.18, stone, 0, 1.45, -1.5)
  for (const x of [-2.72, 2.72]) part(0.045, 2.9, 0.22, M.gold, x, 1.45, -1.5)
  part(5, 1.05, 1, stone, 0, 0.595, 0.4)
  part(5.15, 0.09, 1.12, M.graphiteMetal, 0, 1.165, 0.4)
  part(5, 0.055, 1.02, M.gold, 0, 0.1, 0.4)
  part(4.95, 0.025, 0.025, glow, 0, 0.16, 0.917)
  part(5.2, 0.025, 0.025, glow, 0, 2.82, -1.395)
  const logo = add(reception, new THREE.PlaneGeometry(2.4, 2.4 * 544 / 979), new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }), 0, 1.95, -1.395, false)
  logo.name = 'reception-brand-logo'
  const caption = canvasTex(1024, 96, (g, w, h) => {
    g.fillStyle = '#b69a64'; g.textAlign = 'center'; g.font = '28px sans-serif'
    g.fillText('INFINITE POSSIBILITIES', w / 2, 60)
  })
  add(reception, new THREE.PlaneGeometry(4.4, 0.4), new THREE.MeshBasicMaterial({ map: caption, transparent: true, toneMapped: false }), 0, 1.03, -1.395, false)
  part(0.9, 0.5, 0.08, M.silver, 2.05, 1.55, 0.15)
  part(0.08, 0.15, 0.08, M.silver, 2.05, 1.25, 0.15)
  part(0.4, 0.035, 0.28, M.silver, 2.05, 1.225, 0.15)
  furnitureCollision.add(reception, 'receptionCounter')
}

const foyerPanels = new Map()

// 前厅与 DR 广场只从布局常量搭建；三块 Canvas 面板保持独立，数据变化时才重绘。
function buildFoyerScene() {
  const spec = foyerSceneSpec(), unitBox = new THREE.BoxGeometry(1, 1, 1), unitCylinder = new THREE.CylinderGeometry(.5, .5, 1, 16)
  const mats = {
    dark: M.graphite, metal: M.graphite, gold: M.gold, light: M.ivory,
    wood: M.ivory, green: M.ivory, canopy: M.graphite, glow: M.gold,
  }
  const part = (g, geo, mat, x, y, z, sx, sy, sz, shadow = true) => {
    const mesh = add(g, geo, mat, x, y, z, shadow); mesh.scale.set(sx, sy, sz); return mesh
  }
  const cube = (g, mat, x, y, z, w, h, d, shadow = true) => part(g, unitBox, mat, x, y, z, w, h, d, shadow)
  const post = (g, mat, x, y, z, r, h) => part(g, unitCylinder, mat, x, y, z, r * 2, h, r * 2)
  const frontStrip = (g, item, y = .58) => {
    const w = item.size.x, d = item.size.z, south = item.facing === 'S', north = item.facing === 'N', east = item.facing === 'E'
    if (south || north) cube(g, mats.gold, 0, y, (south ? 1 : -1) * (d / 2 - .03), Math.max(.3, w - .12), .06, .045, false)
    else if (east || item.facing === 'W') cube(g, mats.gold, (east ? 1 : -1) * (w / 2 - .03), y, 0, .045, .06, Math.max(.3, d - .12), false)
  }
  const panel = (g, id, text, x, y, z, w, h) => {
    const mount = new THREE.Group(); mount.name = `foyer-panel-${id}`; mount.userData.dynamic = true; mount.position.set(x, y, z)
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512
    const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); mesh.name = `foyer-panel-surface-${id}`; mesh.userData.dynamic = true; mesh.userData.foyerPanel = id
    mount.add(mesh); g.add(mount); foyerPanels.set(id, { id, text, ctx, texture, mesh, signature: '', redraws: 0 })
  }
  const debugBounds = (g, item) => { const mesh = cube(g, mats.light, 0, .005, 0, item.size.x, .01, item.size.z, false); mesh.name = `${item.entityName}-bounds`; mesh.rotation.y = -g.rotation.y; mesh.visible = false }

  const atlasBounds = { x0: ENVELOPE.x0, x1: ENVELOPE.x1, z0: 8, z1: PLAZA.z1 }
  const atlas = canvasTex(2048, 1024, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 34px sans-serif'
    FOYER_ZONES.forEach((zone, i) => {
      const x = (zone.x0 - atlasBounds.x0) / (atlasBounds.x1 - atlasBounds.x0) * w, rw = (zone.x1 - zone.x0) / (atlasBounds.x1 - atlasBounds.x0) * w
      const y = (zone.z0 - atlasBounds.z0) / (atlasBounds.z1 - atlasBounds.z0) * h, rh = (zone.z1 - zone.z0) / (atlasBounds.z1 - atlasBounds.z0) * h
      c.fillStyle = `hsla(${28 + i * 13},25%,${i < 5 ? 42 : 34}%,.22)`; c.fillRect(x, y, rw, rh); c.strokeStyle = 'rgba(232,214,170,.18)'; c.strokeRect(x, y, rw, rh)
      if (!['foyer_buffer', 'circle'].includes(zone.id)) { c.fillStyle = 'rgba(246,235,208,.58)'; c.fillText(zone.name, x + rw / 2, y + rh / 2) }
    })
  })
  const floorPositions = [], floorUvs = [], floorIndices = []
  for (const [x0, x1, z0, z1, y] of [[ENVELOPE.x0, ENVELOPE.x1, 8, 13, .027], [PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, -.565]].filter(part => !officeFurnitureV2 || part[2] >= PLAZA.z0)) {
    const n = floorPositions.length / 3, u0 = (x0 - atlasBounds.x0) / (atlasBounds.x1 - atlasBounds.x0), u1 = (x1 - atlasBounds.x0) / (atlasBounds.x1 - atlasBounds.x0)
    const v0 = 1 - (z1 - atlasBounds.z0) / (atlasBounds.z1 - atlasBounds.z0), v1 = 1 - (z0 - atlasBounds.z0) / (atlasBounds.z1 - atlasBounds.z0)
    floorPositions.push(x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z0); floorUvs.push(u0, v0, u1, v0, u0, v1, u1, v1); floorIndices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3)
  }
  const floorGeometry = new THREE.BufferGeometry(); floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions, 3)); floorGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(floorUvs, 2)); floorGeometry.setIndex(floorIndices)
  const zoneFloor = new THREE.Mesh(floorGeometry, new THREE.MeshBasicMaterial({ map: atlas, transparent: true, opacity: .72, depthWrite: false, toneMapped: false })); zoneFloor.name = 'foyer-zone-atlas'; scene.add(zoneFloor)

  for (const item of spec) {
    if (officeFurnitureV2 && item.z0 < PLAZA.z0) continue
    const existing = scene.getObjectByName(item.entityName)
    if (existing) { existing.userData.foyerCollision = item.collides; debugBounds(existing, item); continue }
    const g = new THREE.Group(), w = item.size.x, d = item.size.z, plazaY = item.z0 >= PLAZA.z0 ? -.55 : 0
    g.name = item.entityName; g.userData.foyerCollision = item.collides; g.position.set(item.center.x, plazaY, item.center.z); scene.add(g)
    if (/counter|reception_desk/.test(item.id)) {
      cube(g, mats.dark, 0, .5, 0, w - .12, 1, d - .12); cube(g, mats.gold, 0, 1.02, 0, w - .05, .06, d - .05, false); frontStrip(g, item)
      if (item.id === 'reception_desk') {
        const plaque = canvasTex(512, 128, (c, width) => { c.fillStyle = '#e8d6aa'; c.textAlign = 'center'; c.font = '600 52px sans-serif'; c.fillText('前厅服务台', width / 2, 82) })
        const label = add(g, new THREE.PlaneGeometry(2.2, .55), new THREE.MeshBasicMaterial({ map: plaque, transparent: true, toneMapped: false }), 0, .62, d / 2 + .011, false); label.name = 'foyer-service-desk-label'
      }
    } else if (item.id === 'a1_stools') {
      for (let i = 0; i < 6; i++) { const x = -w / 2 + .65 + i * (w - 1.3) / 5; post(g, mats.metal, x, .36, 0, .07, .65); part(g, unitCylinder, mats.wood, x, .7, 0, .55, .12, .55) }
    } else if (item.id === 'a2_vending_wall') {
      for (let i = 0; i < 3; i++) { const x = -w / 2 + .7 + i * (w - 1.4) / 2; cube(g, mats.metal, x, .9, 0, 1.15, 1.8, d - .12); cube(g, mats.glow, x, 1.2, d / 2 - .05, .75, .55, .025, false) }
    } else if (item.id === 'a2_snack_cabinet') {
      cube(g, mats.wood, 0, .8, 0, w - .12, 1.6, d - .12); for (const x of [-.45, .45]) cube(g, mats.gold, x, .8, d / 2 - .04, .02, 1.3, .02, false)
    } else if (/table/.test(item.id)) {
      part(g, unitCylinder, mats.wood, 0, .72, 0, Math.min(w, d) * .72, .12, Math.min(w, d) * .72); post(g, mats.metal, 0, .35, 0, .09, .7)
    } else if (item.id === 'handoff_box') {
      cube(g, mats.dark, 0, .55, 0, w - .12, 1.1, d - .12); frontStrip(g, item, .6)
    } else if (item.id === 'notice_attendance_wall') {
      for (const x of [-w / 2 + .15, w / 2 - .15]) post(g, mats.metal, x, 1.1, 0, .06, 2.2)
      cube(g, mats.dark, 0, 1.35, 0, w - .18, 1.4, .08, false)
    } else if (/sofa/.test(item.id)) {
      cube(g, mats.dark, 0, .38, 0, w - .1, .34, d - .1); cube(g, mats.dark, 0, .78, -d / 2 + .08, w - .1, .65, .14)
    } else if (item.id === 'plaza_bike_rack') {
      for (let i = 0; i < 5; i++) { const x = -w / 2 + .45 + i * (w - .9) / 4; cube(g, mats.metal, x, .38, 0, .06, .76, d - .18); cube(g, mats.metal, x, .72, 0, .48, .06, d - .18) }
    } else if (/lamp/.test(item.id)) {
      post(g, mats.metal, 0, 1.35, 0, .09, 2.7); post(g, mats.dark, 0, .08, 0, .32, .16)
    } else if (item.id === 'b0_coffee_cart') {
      cube(g, mats.dark, 0, .75, 0, w - .18, 1.3, d - .2); cube(g, mats.canopy, 0, 1.75, 0, w - .08, .12, d - .08); for (const x of [-w / 2 + .35, w / 2 - .35]) part(g, unitCylinder, mats.metal, x, .3, d / 2 - .15, .55, .18, .55)
    } else if (/stall/.test(item.id)) {
      cube(g, mats.wood, 0, .65, 0, w - .16, .75, d - .16); for (const x of [-w / 2 + .15, w / 2 - .15]) for (const z of [-d / 2 + .15, d / 2 - .15]) post(g, mats.metal, x, 1.35, z, .05, 2.7); cube(g, mats.canopy, 0, 2.7, 0, w - .04, .12, d - .04)
    } else if (/bench/.test(item.id)) {
      cube(g, mats.wood, 0, .48, 0, w - .1, .14, d - .12); cube(g, mats.wood, 0, .8, -d / 2 + .08, w - .1, .55, .1); for (const x of [-w / 2 + .35, w / 2 - .35]) cube(g, mats.metal, x, .22, 0, .08, .44, .08)
    } else if (/planter/.test(item.id)) {
      cube(g, mats.light, 0, .3, 0, w - .08, .6, d - .08); for (let i = 0; i < Math.max(3, Math.floor(w)); i++) { const x = -w / 2 + .45 + i * (w - .9) / Math.max(1, Math.floor(w) - 1); post(g, mats.green, x, .72, 0, .28, .75) }
    }
    if (item.collides) furnitureCollision.add(g, item.entityName)
    if (/lamp/.test(item.id)) { cube(g, mats.glow, 0, 2.72, 0, .55, .3, .55, false); cube(g, mats.dark, 0, 2.94, 0, .75, .12, .75, false) }
    for (const id of item.panels) {
      if (id === 'handoff') panel(g, id, '交办', 0, .68, d / 2 + .011, .7, .35)
      else panel(g, id, id === 'attendance' ? '今日出勤' : '公告 · 暂无', id === 'attendance' ? -w * .24 : w * .24, 1.38, d / 2 + .011, w * .44, .86)
    }
    debugBounds(g, item)
  }
}
buildFoyerScene()
const warehouseShell = buildWarehouseShell({ THREE, scene, collision: furnitureCollision, canvasTex, VI })
const campusRegistry = CAMPUS_MODE ? createCampusRegistry({ THREE, scene, quality: qualityPolicy, layout: { campus: CAMPUS, building: CAMPUS_BUILDING, zones: CAMPUS_ZONES, shuttle: CAMPUS_SHUTTLE_STRIP } }) : null
if (campusRegistry) { campusModules.forEach(([name, factory]) => campusRegistry.register(name, factory)); campusRegistry.buildAll({ canvasTex, quality: qualityPolicy }); campusRegistry.hiddenEnvironment = hideCampusEnvironment(THREE, scene, campusRegistry.root) }
const controlRoom = CONTROL_ROOM_MODE ? buildDrControlRoom({ THREE, scene, canvasTex, origin: { x: -161, z: 8 } }) : null
if (controlRoom && campusRegistry) campusRegistry.root.visible = false

let latestState = null, foyerData = null, milestoneData = null
function paintFoyerPanel(id, title, lines, visible = true) {
  const panel = foyerPanels.get(id)
  if (!panel) return
  panel.mesh.visible = visible
  if (!visible) return
  const model = { title, lines }, signature = JSON.stringify(model)
  if (panel.signature === signature) return
  try {
    const g = panel.ctx
    g.fillStyle = '#16202a'; g.fillRect(0, 0, 1024, 512)
    g.strokeStyle = '#b69a64'; g.lineWidth = 18; g.strokeRect(12, 12, 1000, 488)
    g.fillStyle = '#e8d6aa'; g.font = '700 58px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(title, 54, 70, 916)
    g.fillStyle = '#f4f1eb'; g.font = '500 42px sans-serif'
    lines.slice(0, 7).forEach((line, i) => g.fillText(String(line), 54, 137 + i * 51, 916))
    panel.texture.needsUpdate = true; panel.signature = signature; panel.redraws++
  } catch (error) {
    console.warn(`[foyer-panel:${id}] 保留上一帧：${error.message}`)
  }
}

function updateFoyerPanels() {
  const attendance = attendancePanel(latestState), pending = pendingPanel(latestState), standup = standupPanel(latestState), milestones = milestonePanel(milestoneData)
  const announce = announcementPanel(foyerData), visitors = visitorPanel(foyerData)
  const mode = WALL_MODE ? 'wall' : latestState?.lan ? 'lan' : 'local', access = panelAccess(mode)
  paintFoyerPanel('attendance', '今日动态', [...attendance.lines, pending.text, ...(pending.waitingText === pending.text ? [] : [pending.waitingText]), ...standup.lines.slice(0, 2), ...milestones.lines.slice(0, 1)])
  paintFoyerPanel('notice', '公告与访客', [...announce.lines.map(line => `公告 · ${line}`), ...visitors.lines])
  paintFoyerPanel('handoff', latestState?.chat?.enabled ? '交办箱' : '对话功能未开启', latestState?.chat?.enabled ? ['选择同事开始对话', '选中内容后交给 Lead'] : ['请在本机配置中开启'], access.handoff)
}
updateFoyerPanels()

// ───────────────────────── 董事会会议室 ─────────────────────────
let board = officeFurnitureV2?.board || (() => {
  const t = new THREE.Group()
  t.position.set(BOARD_TABLE.x, 0, BOARD_TABLE.z)
  add(t, new THREE.BoxGeometry(5.2, 0.08, 1.7), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.3 }), 0, 0.76, 0)
  add(t, new THREE.BoxGeometry(5.2, 0.015, 1.7), M.gold, 0, 0.72, 0, false)
  add(t, new THREE.BoxGeometry(4.6, 0.7, 0.6), M.graphite, 0, 0.38, 0)
  scene.add(t)
  furnitureCollision.add(t, 'boardTable')
  for (const sx of [-2.1, -0.7, 0.7, 2.1]) for (const sz of [-1.25, 1.25]) {
    if (A) { furn('chairModernCushion', BOARD_TABLE.x + sx, BOARD_TABLE.z + sz * 1.05 + Math.sign(sz) * 0.14, { scale: 2.3, rotY: sz > 0 ? Math.PI : 0 }); continue }
    const c = new THREE.Group()
    c.position.set(BOARD_TABLE.x + sx, 0, BOARD_TABLE.z + sz)
    add(c, new THREE.CylinderGeometry(0.24, 0.24, 0.07, 18), M.chair, 0, 0.5, 0)
    add(c, new THREE.BoxGeometry(0.44, 0.45, 0.06), M.chair, 0, 0.8, sz > 0 ? 0.22 : -0.22)
    add(c, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), M.graphiteMetal, 0, 0.27, 0)
    scene.add(c)
    furnitureCollision.add(c, 'boardChair')
  }
  box(3.7, 1.7, 0.08, M.graphiteMetal, BOARD_TABLE.x, 1.9, BACK_Z + 0.35)
  const scr = makeScreenTexture()
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.5), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }))
  panel.position.set(BOARD_TABLE.x, 1.9, BACK_Z + 0.395)
  scene.add(panel)
  const amber = new THREE.PointLight(0xffb020, 0, 14, 1.6)
  amber.position.set(BOARD_TABLE.x, 2.6, BOARD_TABLE.z)
  scene.add(amber)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4a4130, toneMapped: false }))
  beacon.position.set(BOARD_TABLE.x, 3.1, BOARD_TABLE.z)
  scene.add(beacon)
  return { amber, beacon, scr }
})()


// ───────────────────────── 苏晨的老板桌椅（董事会会议室东侧上首）─────────────────────────
// 大班台：实木桌面 + 金色包边 + 皮质桌垫 + 两侧抽屉柜；行政高背皮椅（金色压线、镀铬五星脚）。全部用几何体搭，不依赖外部素材。
;if (!officeFurnitureV2) (() => {
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a281c, roughness: 0.32, metalness: 0.05 })
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x2a1c13, roughness: 0.4 })
  const leather = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.5 })
  const chairLeather = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.42, metalness: 0.04 })
  const chairLight = new THREE.MeshStandardMaterial({ color: 0x3a281e, roughness: 0.4 })
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.18, metalness: 1 })
  // 地毯（深灰，金色细边）
  const rug = new THREE.Group(); rug.position.set((BOSS.desk.x + BOSS.chair.x) / 2, 0, BOSS.desk.z)
  add(rug, new THREE.BoxGeometry(3.3, 0.012, 3.1), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 1 }), 0, 0.008, 0, false)
  add(rug, new THREE.BoxGeometry(3.12, 0.014, 2.92), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 1 }), 0, 0.01, 0, false)
  scene.add(rug)
  // 桌：局部坐标里长边沿 X、使用者在 +Z 一侧；整体转 90°，让使用者朝 +X 侧坐、面向会议桌
  const d = new THREE.Group(); d.position.set(BOSS.desk.x, 0, BOSS.desk.z); d.rotation.y = Math.PI / 2
  add(d, new THREE.BoxGeometry(2.5, 0.07, 1.15), wood, 0, 0.765, 0)
  add(d, new THREE.BoxGeometry(2.54, 0.02, 1.19), M.gold, 0, 0.73, 0, false) // 台面下沿金色包边
  add(d, new THREE.BoxGeometry(1.7, 0.006, 0.78), leather, 0, 0.803, 0.12, false) // 皮质桌垫
  for (const sx of [-1.02, 1.02]) { // 两侧抽屉柜
    add(d, new THREE.BoxGeometry(0.72, 0.7, 1.0), woodDark, sx, 0.37, 0)
    for (const y of [0.2, 0.42, 0.62]) {
      add(d, new THREE.BoxGeometry(0.62, 0.015, 0.012), M.gold, sx, y, 0.506, false)
      add(d, new THREE.BoxGeometry(0.2, 0.02, 0.025), M.gold, sx, y - 0.07, 0.52, false)
    }
  }
  add(d, new THREE.BoxGeometry(1.32, 0.46, 0.04), woodDark, 0, 0.5, -0.46) // 挡板（朝着访客的一面）
  add(d, new THREE.BoxGeometry(1.34, 0.025, 0.045), M.gold, 0, 0.74, -0.46, false)
  // 桌面：铭牌、台灯、显示器、笔筒
  const plate = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#b69a64'; g.fillRect(0, 0, w, h)
    g.fillStyle = '#f4efe2'; g.fillRect(6, 6, w - 12, h - 12)
    g.fillStyle = '#2a1c13'; g.textAlign = 'center'; g.font = 'bold 54px sans-serif'; g.fillText('苏 晨', w / 2, 60)
    g.font = '28px sans-serif'; g.fillStyle = '#6a5a3a'; g.fillText('董事会', w / 2, 102)
  })
  const np = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.115, 0.03), [M.gold, M.gold, M.gold, M.gold, new THREE.MeshBasicMaterial({ map: plate, toneMapped: false }), M.gold])
  np.position.set(0.55, 0.88, -0.38); np.rotation.x = -0.2 // 朝访客一侧（-Z）倾斜
  np.rotation.y = Math.PI; np.castShadow = true; d.add(np)
  add(d, new THREE.BoxGeometry(0.46, 0.03, 0.12), M.gold, 0.55, 0.835, -0.36, false)
  add(d, new THREE.CylinderGeometry(0.1, 0.12, 0.025, 20), M.gold, -0.75, 0.82, 0.05, false) // 台灯
  add(d, new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), M.gold, -0.75, 1.02, 0.05, false)
  add(d, new THREE.ConeGeometry(0.12, 0.14, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f6f55, roughness: 0.4, side: THREE.DoubleSide }), -0.75, 1.27, 0.05, false)
  add(d, new THREE.BoxGeometry(0.9, 0.46, 0.025), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.3 }), 0.1, 1.07, -0.18) // 显示器（背面朝访客）
  add(d, new THREE.BoxGeometry(0.06, 0.26, 0.05), M.graphiteMetal, 0.1, 0.9, -0.18)
  add(d, new THREE.BoxGeometry(0.28, 0.01, 0.2), M.graphiteMetal, 0.1, 0.81, -0.18, false)
  add(d, new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), M.gold, 0.95, 0.85, 0.2, false) // 笔筒
  scene.add(d)
  furnitureCollision.add(d, 'bossDesk')
  // 行政高背皮椅：局部使用者面向 +Z；转到面向 -X（朝桌子和会议桌）
  const c = new THREE.Group(); c.position.set(BOSS.chair.x, 0, BOSS.chair.z); c.rotation.y = -Math.PI / 2
  for (let i = 0; i < 5; i++) { // 镀铬五星脚 + 脚轮
    const a = (i / 5) * Math.PI * 2
    const leg = add(c, new THREE.BoxGeometry(0.34, 0.03, 0.055), chrome, Math.sin(a) * 0.17, 0.085, Math.cos(a) * 0.17, false); leg.rotation.y = a - Math.PI / 2
    add(c, new THREE.SphereGeometry(0.035, 10, 8), M.graphite, Math.sin(a) * 0.33, 0.04, Math.cos(a) * 0.33, false)
  }
  add(c, new THREE.CylinderGeometry(0.04, 0.05, 0.34, 14), chrome, 0, 0.27, 0, false)
  add(c, new THREE.BoxGeometry(0.6, 0.11, 0.58), chairLeather, 0, 0.5, 0) // 座垫
  add(c, new THREE.BoxGeometry(0.54, 0.05, 0.52), chairLight, 0, 0.575, 0.01)
  add(c, new THREE.BoxGeometry(0.62, 0.008, 0.6), M.gold, 0, 0.445, 0, false) // 座垫金色压线
  const back = add(c, new THREE.BoxGeometry(0.62, 0.86, 0.13), chairLeather, 0, 1.03, -0.3); back.rotation.x = -0.1
  for (const sx of [-0.18, 0, 0.18]) { const ch = add(c, new THREE.BoxGeometry(0.012, 0.74, 0.02), chairLight, sx, 1.03, -0.226, false); ch.rotation.x = -0.1 } // 竖向分格
  const head = add(c, new THREE.BoxGeometry(0.44, 0.24, 0.11), chairLeather, 0, 1.56, -0.34); head.rotation.x = -0.14 // 头枕
  add(c, new THREE.BoxGeometry(0.64, 0.012, 0.14), M.gold, 0, 1.47, -0.32, false).rotation.x = -0.12 // 靠背上沿压线
  for (const sx of [-0.35, 0.35]) { // 扶手
    add(c, new THREE.BoxGeometry(0.06, 0.26, 0.06), chrome, sx, 0.68, -0.05, false)
    add(c, new THREE.BoxGeometry(0.08, 0.05, 0.44), chairLeather, sx, 0.82, 0.0)
    add(c, new THREE.BoxGeometry(0.084, 0.012, 0.1), M.gold, sx, 0.848, -0.18, false)
  }
  scene.add(c)
  furnitureCollision.add(c, 'bossChair')
})()

// ───────────────────────── 人物视图 ─────────────────────────
const labelsEl = $('labels')
const bubblesEl = $('bubbles')
const views = new Map() // agentId -> view
const boardViews = {}
let fallbackIdx = 0

function seatFor(name) {
  if (SEATS[name]) return SEATS[name]
  return [FALLBACK[0], FALLBACK[1] + (fallbackIdx++) * 3, FALLBACK[2] + 3.2]
}
function modelFamily(a) {
  const m = `${a.model || ''} ${a.adapter || ''}`.toLowerCase()
  return m.includes('deepseek') ? 'deepseek' : m.includes('claude') ? 'claude' : 'codex'
}
// 标签格式：昵称-岗位-模型，例如「张三-产品经理-Claude」。昵称 = 董事会改的显示名（没改就用 Paperclip 里的名字）
const FAMILY_NAME = { claude: 'Claude', deepseek: 'DeepSeek', codex: 'GPT' }
const shortTitle = (t) => String(t || '').replace(/[（(].*$/, '').trim()
const labelText = (a, nick) => [nick, shortTitle(a.title), FAMILY_NAME[modelFamily(a)]].filter(Boolean).join('-')
function placeSeated(ch, home) {
  ch.group.position.set(home.x, 0, home.z)
  ch.group.rotation.y = home.yaw
  ch.pose.sit = 1
  ch.solve(0)
}
function createAgentView(a, index) {
  const seat = seatFor(a.name)
  const [zone, sx, sz] = seat
  const desk = LAYOUT3_MODE ? officeV3?.get('furniture3')?.deskAt(sx, sz) : makeDesk(sx, sz, ZONES[zone].accent)
  if (!desk) return null
  const chair = LAYOUT3_MODE ? desk.chair : makeChair(sx, sz + 1)
  const gender = [0, 1, 0, 0, 1, 0, 1, 1, 0, 1][index % 10] ? 'female' : 'male'
  const seatIdx = Object.keys(SEATS).indexOf(a.name)
  const avatar = (OFFICE_LAYOUT.r1Phase === 'R1' && ({ Reviewer2: 'Male_Adult_07', SecurityReviewer: 'Male_Adult_10' })[a.name]) || CAST_OVERRIDE[a.name] || CAST[(seatIdx >= 0 ? seatIdx : index) % CAST.length]
  const personAssets = PEOPLE && (OFFICE_LAYOUT.r1Phase === 'R1' ? r1SeatedAssets(PEOPLE, avatar, officeV3.get('furniture3').seatedProfile(a.name), a.name) : PEOPLE)
  const ch = personAssets
    ? createPerson(personAssets, avatar)
    : A
    ? createCharacter3D(A, {
      gender, tone: [0, 0, 1, 0, 1, 1, 0, 0, 1, 0][index % 10] ? 'light' : 'dark',
      hairStyle: HAIRSTYLE[gender][index % HAIRSTYLE[gender].length], hair: HAIR_TINT[(index * 3) % HAIR_TINT.length], shirt: zone === 'drlife' ? VI.graphite : SHIRTS[index % SHIRTS.length],
      markTexture: zone === 'drlife' ? markTex : null, accent: ZONE_BADGE[zone] || VI.gold,
    })
    : createCharacter({
      outfit: a.name === 'Lead' ? 0x1b1e22 : 0x25292e, trim: VI.gold, skin: SKIN[index % SKIN.length], hair: HAIR[(index * 3) % HAIR.length], hairStyle: [0, 1, 0, 2, 0][index % 5],
      markTexture: zone === 'drlife' ? markTex : null, accent: ZONE_BADGE[zone] || VI.gold,
    })
  const home = workHome(seat)
  placeSeated(ch, home)
  if (OFFICE_LAYOUT.r1Phase === 'R1' && ch.avatar) fitR1SeatedPerson(ch, { handY: officeV3.get('furniture3').seatedProfile(a.name).handY, home, desk: { x: sx, z: sz }, chair: officeV3.get('furniture3').chairAt(home.x, home.z) })
  scene.add(ch.group)
  ch.group.traverse((o) => { o.userData.agentId = a.id })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 36), new THREE.MeshBasicMaterial({ color: 0x35d07f, transparent: true, opacity: 0.95, toneMapped: false }))
  ring.rotation.x = Math.PI / 2
  ring.visible = false
  ch.group.add(ring)
  if (desk.setBadge) desk.setBadge(MODEL_BADGE[modelFamily(a)])
  else {
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 6), new THREE.MeshBasicMaterial({ color: MODEL_BADGE[modelFamily(a)], toneMapped: false }))
    badge.position.set(0.62, 0.8, 0.06)
    badge.rotation.x = Math.PI / 2
    desk.group.add(badge)
  }
  const el = document.createElement('div')
  el.className = 'lab'
  el.innerHTML = '<span class="st" style="display:none"></span><span class="tk" style="display:none"></span><span class="nm"></span>'
  labelsEl.appendChild(el)
  return { id: a.id, name: a.name, data: a, zone, home, stand: officeStand(home), char: ch, desk, chair, ring, label: el, nm: el.querySelector('.nm'), tk: el.querySelector('.tk'), st: el.querySelector('.st'), why: '', mode: 'idle', act: null, phase: rnd() * 10, headPos: new THREE.Vector3() }
}
function createBoardView(name, home, stand, via, skinI) {
  const ch = PEOPLE
    ? createPerson(PEOPLE, skinI === 3 ? 'Male_Adult_08' : 'Male_Adult_05')
    : A
    ? createCharacter3D(A, { gender: 'male', tone: skinI === 3 ? 'dark' : 'light', hairStyle: skinI === 3 ? 'Hair_Buzzed' : ['Hair_SimpleParted', 'Hair_Beard'], hair: HAIR_TINT[skinI], shirt: 0x14161a, pants: 0x14161a, accent: 0xffb020 })
    : createCharacter({ outfit: 0x30343c, trim: VI.gold, skin: SKIN[skinI], hair: HAIR[skinI], accent: 0xffb020 })
  placeSeated(ch, home)
  scene.add(ch.group)
  const el = document.createElement('div')
  el.className = 'lab boardname'
  el.innerHTML = `<span class="nm">${name}</span>`
  ch.group.traverse((o) => { o.userData.agentId = `board:${name}` })
  labelsEl.appendChild(el)
  return { id: `board:${name}`, name, baseName: name, isBoard: true, home, stand, via, char: ch, label: el, act: null, mode: 'idle', headPos: new THREE.Vector3() }
}
// 董事会现在只有苏晨一位（2026-10-17 董事会取消了大旺）
// 苏晨坐在东侧上首的老板桌后（面向 -X）；来找他的同事从会议室门进来，沿会议桌前侧走到桌前站定
if (!LAYOUT3_MODE) boardViews['苏晨'] = officeFurnitureV2 ? createBoardView('苏晨', officeFurnitureV2.spec.boss.chair, officeFurnitureV2.spec.boss.stand, [], 1) : createBoardView('苏晨', { ...BOSS.chair, yaw: Math.PI / 2 }, BOSS.stand, BOSS.via, 1)
const officePartitions = buildOfficePartitions({ scene, collision: furnitureCollision, canvasTex, VI })
for (const child of scene.children) if (child.userData.legacyHangingSign) child.visible = false

// rev3 不复用旧外壳、家具、广场和仓配旧址；保留灯光，V3 注册根独立接管场景。
const activeCollision = LAYOUT3_MODE ? createFurnitureCollision() : furnitureCollision; const officeV3 = LAYOUT3_MODE ? (() => { const legacy = scene.children.filter((child) => !environmentRoots.has(child) && !child.isLight && !child.isCamera); const envConflicts = selectEnvironmentConflicts(environmentRoots, OFFICE_LAYOUT); demolishLegacyScene(scene, new Set([...legacy, ...envConflicts])); return startOfficeV3({ THREE, scene, quality: qualityPolicy, layout: OFFICE_LAYOUT, collision: activeCollision, A, placeFurniture, canvasTex, makeScreenTexture, floor, search: location.search }) })() : null
if (LAYOUT3_MODE && officeV3?.get('furniture3')?.wing) {
  wing = officeV3.get('furniture3').wing
  MEET_SEATS = wing.seats
  for (const seat of MEET_SEATS) seat.pathFn = v => meetingTrip(v.home, seat)
  board = officeV3.get('furniture3').board
  const boss = officeV3.get('furniture3').spec.boss
  if (OFFICE_SAMPLE_MODE) boardViews['苏晨'] = createBoardView('苏晨', boss.chair, boss.stand, [], 1)
}

// ───────────────────────── 区域标牌 ─────────────────────────
const zoneLabels = []
const ANCHORS = Object.fromEntries(Object.entries(ZONES).map(([id, zone]) => [id, [zone.focus.t[0], 0.15, zone.focus.t[2]]]))
for (const [key, z] of Object.entries(ZONES)) {
  if (LAYOUT3_MODE) continue
  const el = document.createElement('div')
  el.className = 'lab zone' + (key === 'board' ? ' board' : '')
  el.innerHTML = `<span class="nm">${z.label}</span>`
  labelsEl.appendChild(el)
  zoneLabels.push({ el, pos: new THREE.Vector3(...ANCHORS[key]) })
}
for (const [name, x, z] of [['休息交流区', LOUNGE_AREA.x, LOUNGE_AREA.z + 1.5], ['欢迎光临', CORRIDOR_X, LOUNGE_AREA.z]]) {
  if (LAYOUT3_MODE) continue
  const el = document.createElement('div'); el.className = 'lab zone'
  el.textContent = name; labelsEl.appendChild(el)
  zoneLabels.push({ el, pos: new THREE.Vector3(x, 0.15, z) })
}

// ───────────────────────── 状态 → 人物 ─────────────────────────
const boardState = { approvals: 0, titles: [], waiting: 0 }
let selectedId = null
let NAMES = {}
function applyState(s) {
  latestState = s
  if (LAYOUT3_MODE && (!OFFICE_SAMPLE_MODE || !officeV3?.get('furniture3')?.deskAt)) { NAMES = s.names || {}; updateFoyerPanels(); ui.render(s); return }
  NAMES = s.names || {}
  gossipThreads = s.gossip || []
  meetingsList = meetSeenInit(s.meetings || [])
  voteSessions = voteForced ? [voteForced] : (s.voteSessions || [])
  if (document.body.classList.contains('lan') !== !!s.lan) document.body.classList.toggle('lan', !!s.lan) // 局域网设备：只读
  wing.drawSchedule(s.schedule || [], (id) => (views.get(id) ? views.get(id).name : ''))
  for (const bv of Object.values(boardViews)) { bv.name = NAMES[bv.id] || bv.baseName; const nm = bv.label.querySelector('.nm'); if (nm) nm.textContent = bv.name }
  const seen = new Set()
  s.agents.forEach((a, i) => {
    if (LAYOUT3_MODE && !SEATS[a.name]) return // 未映射的新岗位仍显示在任务界面，不能凭空挤出一个工位。
    seen.add(a.id)
    let v = views.get(a.id)
    if (!v) { v = createAgentView(a, views.size + i); if (!v) return; views.set(a.id, v) }
    v.data = a
    v.chat = s.chat?.agents?.[a.id] || null
    // 「在跑」要看有没有真实输出：状态是 running 但进程已退出 / 很久没有输出，不能算执行中
    const lr = a.liveRun
    const lastOut = lr ? Date.now() - Date.parse(lr.lastOutputAt) : 0
    const failed = a.lastRun && a.lastRun.status === 'failed' && Date.now() - Date.parse(a.lastRun.at) < 20 * 60 * 1000 && a.lastRun.error && a.lastRun.error !== 'cancelled'
    let chip = ''
    if (a.status === 'paused') { v.mode = 'pause'; chip = s.world && s.world.duty && !s.world.duty.on ? '已下班' : '已暂停' }
    else if (lr && lr.alive === false) { v.mode = 'stall'; chip = `运行记录残留：进程已退出，${ago(lastOut)}无输出`; v.why = '这次运行的进程已经不在了，但 Paperclip 还把它记为「运行中」。需要在 Paperclip 里处理掉这条运行记录。' }
    else if (lr && lastOut > STALL_MS) { v.mode = 'stall'; chip = `疑似卡住：${ago(lastOut)}无输出`; v.why = '进程还在，但很久没有新输出，可能在等回复或已挂起。' }
    else if (lr || a.status === 'running') { v.mode = 'run'; chip = lr ? `执行中 · ${ago(lastOut)}前有输出` : '执行中'; v.why = '' }
    else if (a.status === 'error' || failed) { v.mode = 'err'; chip = `出错${a.lastRun && a.lastRun.error ? '：' + a.lastRun.error : ''}`; v.why = '' }
    else { v.mode = 'idle'; v.why = '' }
    v.chip = chip
    const mine = (s.waiting || []).filter((w) => w.agentId === a.id)
    v.waits = mine
    v.name = NAMES[a.id] || a.name // 显示名称（可在人物卡片里改），Paperclip 里的名字不变
    v.nm.textContent = labelText(a, v.name)
    v.nm.title = `${v.name} · ${a.title || ''} · ${a.model || a.adapter || ''}`
    v.label.classList.toggle('err', v.mode === 'err')
    v.label.classList.toggle('stall', v.mode === 'stall')
    v.label.classList.toggle('waiting', mine.length > 0)
    const lines = []
    if (v.chat?.unread) lines.push('<i class="c-wait">💬</i>')
    if (chip) lines.push(`<i class="c-${v.mode}">${esc(chip)}</i>`)
    for (const w of mine) lines.push(`<i class="c-wait">${esc(WAIT_LABEL[w.kind])} ${esc(w.id)} · 已等 ${esc(ago(Date.now() - Date.parse(w.since)))}</i>`)
    v.st.innerHTML = lines.join('')
    v.st.style.display = lines.length ? '' : 'none'
    if (v.mode === 'run' && a.task) { v.tk.style.display = ''; v.tk.textContent = `${a.task.id} ${a.task.title}` } else v.tk.style.display = 'none'
  })
  for (const [id, v] of views) if (!seen.has(id)) { v.label.remove(); v.char.group.visible = false; v.desk.group.visible = false; views.delete(id) }
  const running = [...views.values()].filter((v) => v.mode === 'run').length
  const stalled = [...views.values()].filter((v) => v.mode === 'stall').length
  setText('sAgents', s.agents.length)
  setText('sRunning', running)
  setText('sStall', stalled)
  $('stStall').style.display = stalled ? '' : 'none'
  $('stStall').title = '点击查看是谁卡住了、卡在哪'
  $('stStall').style.cursor = 'pointer'
  $('stStall').onclick = () => ui.openStalled([...views.values()].filter((x) => x.mode === 'stall').map((x) => ({ agentId: x.id, name: labelText(x.data, x.name), title: x.data.title, task: x.data.task, chip: x.chip, why: x.why, runId: x.data.liveRun && x.data.liveRun.id })))
  setText('sTasks', (s.tasks && s.tasks.inProgress) ?? '–')
  setText('sCost', `$${(((s.costs && s.costs.monthSpendCents) || 0) / 100).toFixed(2)}`)
  boardState.approvals = s.pendingApprovals || 0
  boardState.titles = (s.approvals || []).map((x) => x.title)
  boardState.waiting = (s.waiting || []).length
  updateFoyerPanels()
  ui.render(s) // 「等你处理」与任务列表：在本页直接操作
  fun.setAwards(s.awards && s.awards.list)
  awardsSince = s.awards && s.awards.since
  // 心情（全部来自真实数据）：刚失败 → 皱眉挠头；连续跑很久 → 累了伸懒腰；刚完成任务 → 开心
  for (const v of views.values()) {
    const a = v.data, now = Date.now()
    const failed = a.lastRun && ['failed', 'timed_out'].includes(a.lastRun.status) && now - Date.parse(a.lastRun.at) < 30 * 60000 && !a.liveRun
    const long = a.liveRun && now - Date.parse(a.liveRun.startedAt) > 20 * 60000
    v.mood = failed ? 'frown' : long ? 'tired' : v.happyUntil > now ? 'happy' : null
    v.char.pose.mood = v.mood
  }
  applyWorld(s)
  ingestEvents(s.events || [])
  if (selectedId) showDetail(selectedId)
}

// ───────────────────────── 金边时间、天气、上下班 ─────────────────────────
let worldSeen = false, lastWorldMs = 0
function hideAway(v) {
  v.away = true
  v.leaving = false
  v.char.group.visible = false
  v.char.group.position.set(v.home.x, 0, v.home.z)
  v.char.group.rotation.y = v.home.yaw
  v.char.pose.sit = 1
}
let lastWorld = null
let lastDutyOn = null, awardsSince = null
function applyWorld(s) {
  const w = s.world
  if (!w) return
  lastWorld = w
  env3d.setWorld(w)
  const [ic, txt] = w.weather ? weatherText(w.weather.code) : ['🌡️', '天气获取中']
  const hhmm = `${String(w.local.h).padStart(2, '0')}:${String(w.local.mi).padStart(2, '0')}`
  const duty = w.duty ? (w.duty.on ? '上班中' : '已下班') : ''
  const hol = holidayInfo(pnhDate())
  fun.setHoliday(hol)
  const hc = $('holiday')
  if (hc) {
    hc.style.display = hol.today || hol.next ? '' : 'none'
    hc.innerHTML = hol.today ? `🎉 今天：<b>${esc(hol.today.name)}</b>` : hol.next ? `📅 ${esc(hol.next.name)} <b>${hol.next.days}</b> 天后` : ''
    hc.title = '柬埔寨 2026 公共假日（来源：2026 年假日次令）。节日当天办公室自动换装：彩旗、灯笼、横幅；送水节护城河上有龙舟；天黑后放烟花（纪念类节日只点莲花灯）。'
  }
  if (w.duty && lastDutyOn === true && !w.duty.on && !document.hidden && !WALL_MODE) ui.openDaily() // 下班那一刻弹出今日战报（大屏模式不弹）
  if (w.duty) lastDutyOn = w.duty.on
  const wxText = w.weather && /雨|雷/.test(txt) ? (w.weather.rainEvidence === 'radar' ? '雷达提示' : w.weather.rainEvidence === 'model' ? '预报' : '天气估计') + txt : txt
  $('wx').innerHTML = `${esc(w.city)} <b>${hhmm}</b> ${ic} ${esc(wxText)}${w.weather ? ` <b>${Math.round(w.weather.tempC)}°C</b>${Number.isFinite(w.weather.feelsC) && Math.abs(w.weather.feelsC - w.weather.tempC) >= 2 ? ` 体感 ${Math.round(w.weather.feelsC)}°C` : ''}` : ''} · ${duty}`
  $('wx').title = w.weather ? `湿度 ${w.weather.humidity}% · 云量 ${w.weather.cloud}% · 风 ${w.weather.windKmh} km/h · 日出 ${String(w.weather.sunrise).slice(11)} 日落 ${String(w.weather.sunset).slice(11)}\n刷新时间：金边 ${String(w.weather.dataAt || '').slice(11)}；雷达帧：${String(w.weather.radarAt || '暂无').slice(-5)}${w.weather.stale ? ' ⚠ 数据源过期或暂时取不到' : ''}\n来源：${w.weather.source || '—'}\n雷达回波与模型预报不等同于办公室窗外实测${w.weather.raw ? '\n' + w.weather.raw : ''}` : ''
  // 上下班：作息调度暂停的 agent 在下班时间从正门离开；恢复后从正门进来
  const offHours = w.duty && !w.duty.on
  // 只有「页面一直开着、在前台、数据连续更新」时才演上下班动画；刷新、后台、冻结后回来的页面直接按当前状态落位（上班了就已经坐好）
  const gapMs = lastWorldMs ? Date.now() - lastWorldMs : 0
  lastWorldMs = Date.now()
  const live = worldSeen && !document.hidden && gapMs < 90000
  for (const v of views.values()) {
    const off = offHours && v.data.status === 'paused'
    if (off && v.visiting?.targetId === 'waiting') {
      if (live) director.cancelVisit(v, 'offDuty')
      else { director.cancelVisit(v, 'offDuty', true); hideAway(v) }
      continue
    }
    if (off && v.lounging) { backToDesk(v); continue } // 先从休息区回工位收拾，再下班
    if (off && !v.away && !v.leaving) {
      if (!live) hideAway(v) // 页面刚打开 / 在后台 / 刚恢复：直接不在，不演离开
      else {
        v.leaving = true
        setTimeout(() => { if (!director.goHome(v, () => hideAway(v))) v.leaving = false }, Math.random() * 25000)
      }
    } else if (!off && v.away && !v.arriving) {
      v.arriving = true
      setTimeout(() => {
        v.away = false
        v.arriving = false
        v.char.group.visible = true
        if (!(live && !document.hidden && director.arrive(v))) placeSeated(v.char, v.home) // 不在前台看着就直接坐好
      }, live ? Math.random() * 40000 : 0)
    }
  }
  syncWaitingPeople(!offHours, live)
  worldSeen = true
  lifeTick(!offHours)
}

// ── 休息区：上班时间里「空闲」（没有在跑、没有在等你）的同事，过一阵会去沙发坐坐；有活了就回工位 ──
// 这是把真实的「空闲」状态画出来，不代表在干活。
const LOUNGE = LOUNGE_SEATS.map(seat => ({ ...seat, taken: null }))
// 加载期旧岛台仍整圈禁入；只延后可选休息与闲聊，不阻塞业务会议。
const loungeReady = () => !OFFICE_SAMPLE_MODE || OFFICE_LAYOUT.variant !== 'align' || officeV3?.get('island')?.status === 'open'
function loungePath(v, seat) {
  if (seat.pathFn) return seat.pathFn(v) // 会议室座位
  return loungeTrip(v.home, seat)
}
function backToDesk(v) {
  if (!v.lounging || v.act) return
  const seat = v.lounging
  const pts = loungePath(v, seat).reverse().slice(1).concat([{ x: v.home.x, z: v.home.z }])
  if (director.travel(v, pts, v.home, false, null)) { seat.taken = null; v.lounging = null }
}
function lifeTick(onDuty) {
  const now = Date.now()
  for (const v of views.values()) {
    const idle = onDuty && v.mode === 'idle' && !(v.waits && v.waits.length) && !v.away && !v.leaving && !v.arriving && !v.visiting
    if (!idle) { v.idleSince = null; if (v.lounging && !voteSeated.has(v)) backToDesk(v); continue }
    if (v.idleSince == null) v.idleSince = now
    if (v.lounging && now > v.loungeUntil && !voteSeated.has(v)) { backToDesk(v); v.idleSince = now; continue }
    if (!v.lounging && !v.act && now - v.idleSince > 90000 && Math.random() < 0.06) goLounge(v, now, (4 + Math.random() * 8) * 60000)
  }
  if (onDuty) { voteTick(now); meetTick(now); if (!meet) gossipTick(now) }
  if (!gossip) loungeChat(now)
}
function goLounge(v, now, stay, pick) {
  if (v.visiting || (!pick?.meeting && !loungeReady())) return false
  const seat = pick || LOUNGE.find((x) => !x.taken)
  if (!seat) return false
  seat.taken = v
  if (director.travel(v, loungePath(v, seat), seat, !seat.meeting, null)) { v.lounging = seat; v.loungeUntil = now + stay; return true }
  seat.taken = null
  return false
}

// ── 休息区八卦：服务器拉真实新闻标题、让空闲同事按岗位视角聊几句（见 gossip.mjs）。
// 新话题出来后，被点到名、此刻空闲的同事主动走去休息区，坐下后轮流说；不在休息区的人那句就跳过。气泡带 📰。
let gossipThreads = [], gossip = null
const gossipPlayed = new Set()
const isFreeForChat = (v) => v && v.mode === 'idle' && !(v.waits && v.waits.length) && !v.away && !v.leaving && !v.arriving && !v.visiting
// ── 会议室：同一个任务里 12 分钟内有 2 位以上不同的 agent 发了评论 = 一场真实的讨论（服务器的 meetings）。
// 当时空闲的参会者走去会议室坐下，按时间顺序说出自己真实评论的第一行；正在跑 / 在等你的人不会离开工位，
// 他们的发言仍从工位冒气泡（标「远程」），会议室屏幕上也写明谁在场、谁远程。最多同时一场，不演没发生的会。
let meetingsList = null, meet = null
const meetSeen = new Set()
let meetInit = false
function meetSeenInit(list) { // 第一次加载：历史会议不重演
  if (!meetInit) { meetInit = true; list.forEach((x) => meetSeen.add(x.id)) }
  return list
}
function meetTick(now) {
  if (meetingsList === null) return
  if (!meet) {
    const m = meetingsList.find((x) => !meetSeen.has(x.id) && now - Date.parse(x.at) < 10 * 60000)
    if (!m) return
    meetSeen.add(m.id)
    const people = m.participants.map((id) => views.get(id)).filter(Boolean)
    const free = people.filter((v) => isFreeForChat(v) && !v.act && !v.lounging)
    if (free.length < 2) return // 不够两个人有空：不开会（也不编）
    const room = free.length <= 6 || voteMeet ? 'B' : 'A' // 评审室 A 在投票会期间留给委员
    const seats = MEET_SEATS.filter((s) => s.room === room && !s.taken)
    const here = []
    free.slice(0, seats.length).forEach((v, i) => { if (goLounge(v, now, 14 * 60000, seats[i])) here.push(v) })
    if (here.length < 2) { here.forEach((v) => { v.loungeUntil = 0 }); return } // 不够两个人坐下：让已经出发的人到了就回去
    meet = { m, room, here, remote: people.filter((v) => !here.includes(v)), idx: -1, next: now + 4000, giveUp: now + 90000, endAt: 0 }
    wing.drawRoom(room, { ident: m.ident, topic: m.title, here: here.map((v) => v.name), remote: meet.remote.map((v) => v.name) })
    return
  }
  if (now < meet.next) return
  const seated = meet.here.filter((v) => v.lounging && v.lounging.meeting && !v.act)
  if (meet.idx < 0) { // 等人到齐（至少两位坐下），最多等 90 秒
    if (seated.length < 2 && now < meet.giveUp) { meet.next = now + 2000; return }
    if (seated.length < 2) { endMeeting(); return }
    meet.idx = 0
  }
  if (meet.idx < meet.m.lines.length) {
    const ln = meet.m.lines[meet.idx++]
    const sp = views.get(ln.agentId)
    if (!sp) return
    const sitting = sp.lounging && sp.lounging.meeting
    if (sitting && sp.act) { meet.idx--; meet.next = now + 1500; return }
    const text = (meet.idx === 1 && meet.m.ident ? `💬 ${meet.m.ident}：` : '💬 ') + (sitting ? '' : '（远程）') + ln.text
    director.enqueue({ id: `meet-${meet.m.id}-${meet.idx}`, at: new Date().toISOString(), kind: 'speak', from: sp.id, to: null, text, lounge: true })
    for (const v of meet.here) if (v !== sp) { v.lookAt = sp; v.lookUntil = performance.now() + 6000 }
    meet.next = now + 6500 + Math.min(4000, ln.text.length * 90)
    return
  }
  if (!meet.endAt) { meet.endAt = now + 25000; meet.next = meet.endAt; return } // 说完后再坐 25 秒
  endMeeting()
}
// ── 投票会：委员会内容审批 / 晨会投票期间，5 位委员在评审室（A）入座投票（服务器的 voteSessions，来自真实的投票任务）。
// 委员正在跑投票任务也算「在评审室投票」，不会被当作工位上的人叫回去；谁交了票，就在座位上说出他真实的投票结果。统计完散会。
const voteSeated = new Set()
let voteSessions = [], voteMeet = null, voteForced = null
const votePlayed = new Set()
function voteTick(now) {
  const s = voteSessions[0]
  if (!s) { if (voteMeet) endVote(); return }
  if (!voteMeet || voteMeet.id !== s.id) { if (voteMeet) endVote(); voteMeet = { id: s.id, next: 0 } }
  if (now < voteMeet.next) return
  voteMeet.next = now + 3000
  const seats = MEET_SEATS.filter((x) => x.room === 'A')
  const here = []
  for (const m of s.members) {
    const v = views.get(m.agentId)
    if (!v) continue
    if (v.lounging && v.lounging.room === 'A') { voteSeated.add(v); v.loungeUntil = now + 60000; here.push(v); continue }
    if (v.act || v.leaving || v.arriving || v.away || v.visiting || v.mode === 'pause') continue
    if (v.lounging) { voteSeated.delete(v); backToDesk(v); continue } // 在休息区的先回工位，下一轮再去评审室
    const seat = seats.find((x) => !x.taken)
    if (seat && goLounge(v, now, 60000, seat)) { voteSeated.add(v); here.push(v) }
  }
  wing.drawRoom('A', { mode: 'vote', ident: s.progress, topic: s.title, here: here.map((v) => v.name), remote: s.members.filter((m) => !here.some((v) => v.id === m.agentId)).map((m) => m.name), basis: '依据：Paperclip 里的真实投票任务' })
  for (const m of s.members) { // 每人交票后说一次真实的结果
    const key = s.id + m.name
    if (!m.line || votePlayed.has(key)) continue
    const sp = views.get(m.agentId)
    if (!sp || !(sp.lounging && sp.lounging.room === 'A') || sp.act) continue
    votePlayed.add(key)
    director.enqueue({ id: `vote-${key}`, at: new Date().toISOString(), kind: 'speak', from: sp.id, to: null, text: '🗳️ ' + m.line, lounge: true })
    break
  }
}
function endVote() {
  for (const v of voteSeated) if (v.lounging && v.lounging.room === 'A') { v.loungeUntil = 0; backToDesk(v) }
  voteSeated.clear()
  if (!meet) wing.drawRoom('A', null)
  voteMeet = null
}
function endMeeting() {
  if (!meet) return
  for (const v of meet.here) if (v.lounging && v.lounging.meeting) { v.loungeUntil = 0; backToDesk(v) }
  wing.drawRoom(meet.room, null)
  meet = null
}
function gossipTick(now) {
  if (!loungeReady()) return
  if (!gossip) {
    const t = gossipThreads.find((x) => !gossipPlayed.has(x.id) && now - Date.parse(x.at) < 20 * 60000)
    if (!t) return
    gossipPlayed.add(t.id)
    for (const id of t.cast) {
      const v = views.get(id)
      if (isFreeForChat(v) && !v.lounging && !v.act) goLounge(v, now, 6 * 60000)
      else if (v && v.lounging) v.loungeUntil = Math.max(v.loungeUntil, now + 4 * 60000)
    }
    gossip = { t, idx: -1, next: now + 4000, giveUp: now + 75000 }
    return
  }
  if (now < gossip.next) return
  const seated = gossip.t.cast.map((id) => views.get(id)).filter((v) => v && v.lounging && !v.lounging.meeting && !v.act)
  if (gossip.idx < 0) { // 等人到齐（至少两位坐下），最多等 75 秒
    if (seated.length < 2 && now < gossip.giveUp) { gossip.next = now + 2000; return }
    if (seated.length < 2) { gossip = null; return }
    gossip.idx = 0
  }
  const lines = gossip.t.lines
  while (gossip.idx < lines.length) {
    const ln = lines[gossip.idx++]
    const sp = views.get(ln.agentId)
    if (!sp || !sp.lounging || sp.lounging.meeting || sp.act) continue // 这个人不在休息区，跳过他这句
    const text = (gossip.idx === 1 ? `📰 看到条新闻：${gossip.t.topic}。` : '📰 ') + ln.text
    director.enqueue({ id: `gossip-${gossip.t.id}-${gossip.idx}`, at: new Date().toISOString(), kind: 'speak', from: sp.id, to: null, text, lounge: true })
    for (const v of views.values()) if (v.lounging && !v.lounging.meeting && v !== sp) { v.lookAt = sp; v.lookUntil = performance.now() + 7000 }
    gossip.next = now + 6500 + Math.min(4000, ln.text.length * 90)
    return
  }
  gossip = null
  nextChatAt = now + 20000
}

// ── 休息区聊天：坐在一起的同事轮流说一句。内容全部来自真实数据（自己最近的事件、手上的任务、上次运行、金边天气），不编造工作进展 ──
const STATUS_CN = { todo: '还没开始', in_progress: '正在做', in_review: '在等审查', blocked: '卡住了', backlog: '在排队' }
const clipText = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
let nextChatAt = 0, lastSpeaker = null
function chatLine(v) {
  const a = v.data, lines = []
  for (const e of lastEvents.filter((x) => x.from === v.id && x.text && !/^\[测试\]/.test(x.text)).slice(-3)) {
    lines.push(({ report: '刚交了：', submit_to_board: '刚提了审批：', dispatch: '刚派了活：' }[e.kind] || '刚在任务里说：') + clipText(e.text, 38))
  }
  if (a.task) lines.push(`我手上是 ${a.task.id}「${clipText(a.task.title, 22)}」，${STATUS_CN[a.task.status] || a.task.status}`)
  else lines.push('我手上暂时没有任务，等 Lead 派活')
  if (a.lastRun && a.lastRun.at) lines.push(`我上一次运行是 ${ago(Date.now() - Date.parse(a.lastRun.at))}前，${a.lastRun.status === 'succeeded' ? '顺利跑完了' : '结果：' + a.lastRun.status}`)
  if (lastWorld && lastWorld.weather) lines.push(`金边现在 ${Math.round(lastWorld.weather.tempC)}°C，${weatherText(lastWorld.weather.code)[1]}`)
  const cand = lines.filter((l) => l !== v.lastChat)
  const line = cand[Math.floor(Math.random() * cand.length)]
  v.lastChat = line
  return line
}
function loungeChat(now) {
  const people = [...views.values()].filter((v) => v.lounging && !v.lounging.meeting && !v.act)
  if (people.length < 2 || now < nextChatAt) return
  nextChatAt = now + 8000 + Math.random() * 9000
  const pool = people.filter((v) => v !== lastSpeaker)
  const sp = pool[Math.floor(Math.random() * pool.length)]
  const text = chatLine(sp)
  if (!text) return
  lastSpeaker = sp
  director.enqueue({ id: `lounge-${now}`, at: new Date().toISOString(), kind: 'speak', from: sp.id, to: null, text, lounge: true })
  for (const v of people) if (v !== sp) { v.lookAt = sp; v.lookUntil = performance.now() + 7000 } // 其他人转头看说话的人
}

// ───────────────────────── 真实事件 → 动画 ─────────────────────────
const tmpV = new THREE.Vector3()
function projectTo(v3, el, dy = 0) {
  tmpV.copy(v3)
  tmpV.y += dy
  tmpV.project(camera)
  const vis = tmpV.z < 1 && tmpV.z > -1 && !(cam.r > 85 && (el.classList.contains('lab') || el.classList.contains('bubble')))
  el.style.display = vis ? '' : 'none'
  if (!vis) return
  let x = (tmpV.x * 0.5 + 0.5) * innerWidth
  let y = (-tmpV.y * 0.5 + 0.5) * innerHeight
  if (el.classList.contains('bubble')) {
    // 气泡不要跑出屏幕，也不要盖到顶部状态栏
    const hw = el.offsetWidth / 2 + 8
    x = Math.min(Math.max(x, hw), innerWidth - hw)
    y = Math.max(y, el.offsetHeight + 74)
  }
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
  el._sx = x
  el._sy = y
}
// 名字标签防重叠：从近到远排，挡住了就往上挪
let frameNo = 0
function declutter(list) {
  frameNo++
  const items = list.filter((el) => el.style.display !== 'none' && el._sx !== undefined)
  items.sort((a, b) => b._sy - a._sy)
  const placed = []
  for (const el of items) {
    if (!el._w || frameNo % 30 === 0) { el._w = el.offsetWidth; el._h = el.offsetHeight }
    let y = el._sy
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((q) => Math.abs(q.x - el._sx) < (q.w + el._w) / 2 && y > q.y - q.h && y - el._h < q.y)
      if (!hit) break
      y = hit.y - hit.h - 2
    }
    placed.push({ x: el._sx, y, w: el._w, h: el._h })
    if (y !== el._sy) el.style.transform = `translate(${el._sx}px, ${y}px) translate(-50%, -100%)`
  }
}
const director = createDirector({ views, board: boardViews, layer: bubblesEl, project: { tmp: new THREE.Vector3(), fn: projectTo }, needDesk: (v) => backToDesk(v), furnitureCollision: activeCollision })
const waitingBoard = createWaitingBoard()
const hasQuestion = (id) => (latestState?.waiting || []).some((item) => item.agentId === id && item.kind === 'question')
function syncWaitingPeople(onDuty, live) {
  const selected = new Set(onDuty ? selectWaitingPeople(latestState?.waiting, WAITING_CAPACITY) : [])
  for (const v of views.values()) {
    if (!onDuty && v.visiting?.targetId === 'waiting') {
      if (live) director.cancelVisit(v, 'offDuty')
      else if (director.cancelVisit(v, 'offDuty', true)) placeSeated(v.char, v.home)
      continue
    }
    if (!live && v.visiting?.targetId === 'waiting' && hasQuestion(v.id)) director.cancelVisit(v, null, true)
    if (v.visiting?.targetId === 'waiting' && (!onDuty || !hasQuestion(v.id))) {
      if (live) director.cancelVisit(v, onDuty ? null : 'offDuty')
      else if (director.cancelVisit(v, null, true)) placeSeated(v.char, v.home)
      continue
    }
    if (!selected.has(v.id) || v.visiting || v.mode !== 'idle' || v.act || v.lounging || v.away || v.leaving || v.arriving || voteSeated.has(v) || meet?.here?.includes(v)) continue
    const plan = waitingPlan({ home: v.home, agentId: v.id, board: waitingBoard })
    if (!plan.ok) continue
    const started = director.visitConsumer(v, plan, {
      mode: 'waiting', board: waitingBoard, agentId: v.id,
      shouldStay: () => hasQuestion(v.id),
      onAbort: () => {},
    })
    if (!started) { waitingBoard.leave(v.id); continue }
    if (!live) {
      v.char.group.position.set(plan.stand.x, 0, plan.stand.z)
      v.char.group.rotation.y = plan.yaw
      v.char.pose.sit = 0
    }
  }
}
function focusAgent(id) {
  const v = views.get(id)
  if (!v) return
  selectedId = id
  showDetail(id)
  const p = v.char.group.position
  setGoal({ az: 8, el: 30, r: 9, t: [p.x, 0, p.z] })
}
const ui = createUI({ refresh: () => poll(), refreshFoyer: () => pollFoyer(), focusAgent: (id) => focusAgent(id), setGoal: (p) => setGoal(p) })
const emptyFun = { burst() {}, celebrate() {}, setAwards() {}, setHoliday() {}, preview() {}, pick() { return false }, catInfo: () => '关闭', catDiag: () => [], catDiagClear() {}, catReact() { return null }, catToggle() { return false }, catPlaying: () => false, catAim() { return false }, debugCatPlan() {}, update() {}, debug: () => ({}) }; const fun = LAYOUT3_MODE ? emptyFun : createFun({ scene, views, boardViews, LOUNGE, furnitureCollision: activeCollision }) // 彩纸、猫、节日装饰、奖杯（见 fun.js）
const officeSceneRoots = DR_MODE ? isolateDrPlace({ scene, campusRoot: campusRegistry?.root, keepRoots: controlRoom ? [controlRoom.root] : [], environmentRoots, labels: labelsEl, bubbles: bubblesEl, zones: CAMPUS_ZONES, setGoal }) : []
const catPlayBtn = $('catPlay'), catPlayStatus = $('catPlayStatus')
function syncCatPlay() {
  const on = fun.catPlaying()
  catPlayBtn.textContent = `🧶 逗猫：${on ? '开' : '关'}`; catPlayBtn.classList.toggle('on', on); catPlayBtn.setAttribute('aria-pressed', String(on)); catPlayStatus.classList.toggle('on', on)
}
function toggleCatPlay(on) { const enabled = fun.catToggle(on); syncCatPlay(); ui.toast(enabled ? '🐱 逗猫中（纯装饰，不影响工作数据）；Shift 点击地面可放球' : '已退出逗猫，点地面恢复移动镜头'); return enabled }
syncCatPlay()
const pnhDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function onCelebrate(e) {
  const v = views.get(e.from)
  if (!v || v.away) return
  v.happyUntil = Date.now() + 2 * 3600000 // 完成任务后两小时里笑得开心一点
  fun.celebrate(v)
  ui.toast(e.text)
}
function boardCheer() {
  const bv = Object.values(boardViews)[0]
  if (bv) fun.burst(bv.char.group.position.clone().setY(1.8), 120)
}
let seenEvents = null
let lastEvents = []
let replayBuf = [] // T11 回放期间缓冲的实时事件，退出回放后一次性放回
function ingestEvents(list) {
  lastEvents = list
  if (replay.active) { replayBuf.push(...list); return } // T11 回放中：只缓冲不演出
  if (seenEvents === null) { seenEvents = new Set(list.map((e) => e.id)); return } // 首次加载：历史事件不重放
  for (const e of list) {
    if (seenEvents.has(e.id)) continue
    seenEvents.add(e.id)
    if (Date.now() - Date.parse(e.at) > 180000) continue // 太旧的不演
    if (e.kind === 'celebrate') { onCelebrate(e); continue }
    if (e.kind === 'board_decision' && /^已批准/.test(e.text)) boardCheer()
    director.enqueue(e)
  }
}
// T11 今日回放（真实事件账本）：时间压缩播放；回放期间暂停实时演出（缓冲），退出后恢复
const replay = createReplay({
  director,
  esc,
  today: pnhDate,
  load: async (date) => {
    try {
      const r = await fetch(`/replay?date=${date}`, { cache: 'no-store' })
      return r.ok ? r.json() : null
    } catch (e) {
      console.warn('[replay] 拉取失败：' + String((e && e.message) || e))
      return null
    }
  },
  onLive: (active) => { if (!active && replayBuf.length) { const buf = replayBuf; replayBuf = []; ingestEvents(buf) } },
})
$('replay').addEventListener('click', () => replay.open('today'))
$('replayY').addEventListener('click', () => replay.open('yesterday'))

// ───────────────────────── 相机：360° 环绕 + 惯性 + 预设机位 ─────────────────────────
const VIEW_BOUNDS = LAYOUT3_MODE ? LAYOUT_V3.site : (CAMPUS_MODE ? CAMPUS : ENVELOPE)
const LIM = { el: [6, 88], r: [3, 160], tx: [VIEW_BOUNDS.x0 - 10, VIEW_BOUNDS.x1 + 10], tz: [VIEW_BOUNDS.z0 - 10, VIEW_BOUNDS.z1 + 10] }
const D2R = Math.PI / 180
// 镜头坞：滚轮横向滚动（位置由 #bottombar 的 flex 布局保证不和工具栏重叠）
{
  const dock = $('dock')
  dock.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { dock.scrollLeft += e.deltaY; e.preventDefault() } }, { passive: false })
}
const homeR = () => {
  const aspect = innerWidth / innerHeight, tangent = Math.tan((aspect < 1 ? 60 : 38) * Math.PI / 360)
  return Math.min(160, Math.max(48, (ENVELOPE.x1 - ENVELOPE.x0 + 18) / 2 / (tangent * aspect), (ENVELOPE.z1 - ENVELOPE.z0 + 14) / 2 / tangent))
}
let initialDrCamera = PLACE_MODE.homeCamera
try { initialDrCamera = normalizeCameraState(JSON.parse(sessionStorage.getItem('office3d.camera.dr')), initialDrCamera) } catch {}
const HOME = LAYOUT3_MODE ? { ...LAYOUT_V3.cameraDefaults.overview, t: LAYOUT_V3.cameraDefaults.overview.target } : DR_MODE ? initialDrCamera : { az: 6, el: 50, get r() { return homeR() }, t: VIEW_CENTER }
const cam = { az: HOME.az, el: HOME.el, r: HOME.r, t: new THREE.Vector3(...HOME.t) }
const goal = { az: cam.az, el: cam.el, r: cam.r, t: cam.t.clone() }
if (DR_MODE) addEventListener('pagehide', () => {
  try { sessionStorage.setItem('office3d.camera.dr', JSON.stringify({ az: goal.az, el: goal.el, r: goal.r, t: goal.t.toArray() })) } catch {}
})
const clampTo = (v, [a, b]) => Math.min(b, Math.max(a, v))
const camMode = { tour: false, follow: null } // 环绕巡航 / 跟随某个人
const inertia = { az: 0, el: 0 }
// 方位角不再限制：预设机位走「最近的那一圈」，不会绕远路
const nearestAz = (target, from) => target + Math.round((from - target) / 360) * 360
function setGoal(p, keepMode) {
  if (!keepMode) { camMode.tour = false; camMode.follow = null }
  if (p.az !== undefined) goal.az = nearestAz(p.az, goal.az)
  if (p.el !== undefined) goal.el = clampTo(p.el, LIM.el)
  if (p.r !== undefined) goal.r = clampTo(p.r, LIM.r)
  if (p.t) goal.t.set(clampTo(p.t[0], LIM.tx), 0, clampTo(p.t[2], LIM.tz))
}
if (CONTROL_ROOM_MODE) setGoal({ az: 0, el: 22, r: 24, t: [-161, 1.6, 8] })
if (LAYOUT3_MODE) setGoal({ az: HOME.az, el: HOME.el, r: HOME.r, t: HOME.t })
// 镜头跟随鼠标：鼠标在 3D 画面上移动时，镜头朝鼠标方向轻微偏转（视差，最多约 ±4° / ±2.5°），平滑过渡；
// 拖动、环绕巡航时让位，鼠标移到面板上或离开画面就慢慢回正；不改变拖动 / 缩放 / 跟随同事这些原有操作。按 M 或点工具栏开关；系统设置了「减少动态效果」时默认关。
const look = { on: true, mx: 0, my: 0, ax: 0, ay: 0, over: false }
try { if (localStorage.getItem('office3d.look') === 'off') look.on = false } catch {}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) look.on = false
const syncLook = () => { const b = $('look'); if (b) b.textContent = '🖱 镜头跟随：' + (look.on ? '开' : '关') }
function toggleLook() { look.on = !look.on; try { localStorage.setItem('office3d.look', look.on ? 'on' : 'off') } catch {} syncLook(); ui.toast(look.on ? '镜头会跟着鼠标轻微移动' : '镜头跟随已关闭', true) }
// ── 像玩游戏一样在地图里走：点地面 = 镜头走到那里（地上有落点光圈）；双击 = 拉近；W A S D 平移、Q E 转向、Shift 加速；鼠标靠近画面边缘 = 滚动；左下角小地图点哪去哪。
const moveKeys = new Set()
const nav = { edge: true }
try { if (localStorage.getItem('office3d.edge') === 'off') nav.edge = false } catch {}
const syncEdge = () => { const b = $('edgeBtn'); if (b) b.textContent = '🎮 边缘滚动：' + (nav.edge ? '开' : '关') }
function toggleEdge() { nav.edge = !nav.edge; try { localStorage.setItem('office3d.edge', nav.edge ? 'on' : 'off') } catch {} syncEdge(); ui.toast(nav.edge ? '鼠标靠近画面边缘会滚动（W A S D / Q E 也可以）' : '边缘滚动已关闭', true) }
const walkMark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.46, 40), new THREE.MeshBasicMaterial({ color: VI.gold, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }))
walkMark.rotation.x = -Math.PI / 2
walkMark.visible = false
scene.add(walkMark)
let walkAt = 0
function walkTo(x, z, zoom) {
  walkMark.position.set(x, 0.06, z)
  walkMark.visible = true
  walkAt = performance.now()
  setGoal(zoom ? { t: [x, 0, z], r: Math.max(8, goal.r * 0.55) } : { t: [x, 0, z] })
}
function navTick(dt) {
  // 键盘：相对镜头方向平移（W 往前 / S 往后 / A 往左 / D 往右），Q E 转向
  const az = goal.az * D2R
  const fx = -Math.sin(az), fz = -Math.cos(az), rx = Math.cos(az), rz = -Math.sin(az)
  let mx = 0, mz = 0, rot = 0
  const fast = moveKeys.has('shift') ? 2.6 : 1
  if (moveKeys.has('w')) { mx += fx; mz += fz }
  if (moveKeys.has('s')) { mx -= fx; mz -= fz }
  if (moveKeys.has('d')) { mx += rx; mz += rz }
  if (moveKeys.has('a')) { mx -= rx; mz -= rz }
  if (moveKeys.has('q')) rot -= 1
  if (moveKeys.has('e')) rot += 1
  // 边缘滚动：鼠标在 3D 画面上、且靠近边缘（面板 / 弹窗 / 工具栏上不触发）
  if (nav.edge && !drag && !moveKeys.size && look.over) {
    const E = 0.9
    const ex = Math.abs(look.mx) > E ? Math.sign(look.mx) * (Math.abs(look.mx) - E) / (1 - E) : 0
    const ey = Math.abs(look.my) > E ? Math.sign(look.my) * (Math.abs(look.my) - E) / (1 - E) : 0
    if (ex || ey) { mx += rx * ex - fx * ey; mz += rz * ex - fz * ey } // 屏幕上方 = 向前
  }
  if (mx || mz) {
    camMode.follow = null; camMode.tour = false
    const v = goal.r * 0.9 * fast * dt
    const n = Math.hypot(mx, mz) || 1
    goal.t.set(clampTo(goal.t.x + (mx / Math.max(1, n)) * v, LIM.tx), 0, clampTo(goal.t.z + (mz / Math.max(1, n)) * v, LIM.tz))
  }
  if (rot) { camMode.tour = false; goal.az += rot * 70 * dt }
  // 落点光圈：放大并淡出
  if (walkMark.visible) {
    const k = (performance.now() - walkAt) / 900
    if (k >= 1) walkMark.visible = false
    else { walkMark.scale.setScalar(0.6 + k * 1.8); walkMark.material.opacity = 0.9 * (1 - k) }
  }
}
function applyCamera(dt) {
  navTick(dt)
  // 松手后的惯性：慢慢减速停下
  if (!drag && (Math.abs(inertia.az) > 0.5 || Math.abs(inertia.el) > 0.5)) {
    goal.az += inertia.az * dt
    goal.el = clampTo(goal.el + inertia.el * dt, LIM.el)
    const f = Math.pow(0.04, dt)
    inertia.az *= f
    inertia.el *= f
  }
  if (camMode.tour) goal.az += dt * 7 // 环绕巡航：每秒 7°
  if (camMode.follow) {
    const v = views.get(camMode.follow)
    if (v && !v.away) { const p = v.char.group.position; goal.t.set(p.x, 0, p.z) } else camMode.follow = null
  }
  const k = 1 - Math.pow(0.004, dt) // 比之前更柔和的阻尼
  cam.az += (goal.az - cam.az) * k
  cam.el += (goal.el - cam.el) * k
  cam.r += (goal.r - cam.r) * k
  cam.t.lerp(goal.t, k)
  const lk = look.on && !drag && !camMode.tour
  const kl = 1 - Math.pow(0.02, dt)
  look.ax += ((lk ? look.mx : 0) - look.ax) * kl
  look.ay += ((lk ? look.my : 0) - look.ay) * kl
  const az = (cam.az + look.ax * 4) * D2R, el = (cam.el - look.ay * 2.5) * D2R
  camera.position.set(cam.t.x + cam.r * Math.sin(az) * Math.cos(el), Math.max(0.6, cam.r * Math.sin(el)), cam.t.z + cam.r * Math.cos(az) * Math.cos(el))
  camera.lookAt(cam.t.x, camMode.follow ? 1.1 : 0.9, cam.t.z)
}
const dom = renderer.domElement
const ptrs = new Map()
let drag = null
dom.addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('pointermove', (e) => { // 只在鼠标位于 3D 画面（不是面板 / 弹窗）上时跟随
  if (e.target !== dom) { look.mx = look.my = 0; look.over = false; return }
  look.over = true
  look.mx = (e.clientX / innerWidth - 0.5) * 2
  look.my = (e.clientY / innerHeight - 0.5) * 2
})
document.addEventListener('pointerleave', () => { look.mx = look.my = 0; look.over = false })
syncLook()
document.addEventListener('click', (e) => { if (e.target && e.target.id === 'look') toggleLook(); if (e.target && e.target.id === 'edgeBtn') toggleEdge(); if (e.target && e.target.id === 'catPlay') toggleCatPlay() })
setTimeout(() => syncEdge(), 0)
dom.addEventListener('pointerdown', (e) => {
  dom.setPointerCapture(e.pointerId)
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (!drag) drag = { moved: 0, pan: e.button === 2 || e.shiftKey, pinch: null, center: null, t: performance.now(), vAz: 0, vEl: 0 }
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); drag.center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; drag.moved = 99 }
  inertia.az = inertia.el = 0
})
dom.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return
  const prev = ptrs.get(e.pointerId)
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    if (drag.pinch) setGoal({ r: goal.r * (drag.pinch / d) }, true)
    drag.pinch = d
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (drag.center) { const dx = center.x - drag.center.x, dy = center.y - drag.center.y; const s = goal.r * 0.0016, az = goal.az * D2R; setGoal({ t: [goal.t.x - (dx * Math.cos(az) + dy * Math.sin(az)) * s, 0, goal.t.z - (-dx * Math.sin(az) + dy * Math.cos(az)) * s] }, true) }
    drag.center = center
    drag.moved = 99
    return
  }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y
  drag.moved += Math.abs(dx) + Math.abs(dy)
  if (drag.pan) {
    camMode.follow = null
    const s = goal.r * 0.0016, az = goal.az * D2R
    setGoal({ t: [goal.t.x - (dx * Math.cos(az) + dy * Math.sin(az)) * s, 0, goal.t.z - (-dx * Math.sin(az) + dy * Math.cos(az)) * s] }, true)
  } else {
    camMode.tour = false
    const now = performance.now(), dts = Math.max(1 / 240, (now - drag.t) / 1000)
    drag.t = now
    const dAz = -dx * 0.25, dEl = dy * 0.2
    goal.az += dAz
    goal.el = clampTo(goal.el + dEl, LIM.el)
    // 记录手势速度（平滑），松手后按这个速度继续转一会儿
    drag.vAz = drag.vAz * 0.6 + (dAz / dts) * 0.4
    drag.vEl = drag.vEl * 0.6 + (dEl / dts) * 0.4
  }
})
dom.addEventListener('pointerup', (e) => {
  const was = drag
  ptrs.delete(e.pointerId)
  if (was && was.moved < 5 && ptrs.size === 0) pick(e.clientX, e.clientY, e.shiftKey)
  if (was && !was.pan && was.moved >= 5 && performance.now() - was.t < 80) { inertia.az = clampTo(was.vAz, [-400, 400]); inertia.el = clampTo(was.vEl, [-200, 200]) }
  if (ptrs.size === 0) drag = null
})
dom.addEventListener('dblclick', (e) => { // 双击地面：走过去并拉近
  const r = dom.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  const pt = new THREE.Vector3()
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) { if (fun.catPlaying()) fun.catAim(pt, e.shiftKey); else walkTo(pt.x, pt.z, true) }
})
dom.addEventListener('wheel', (e) => { e.preventDefault(); setGoal({ r: goal.r * (1 + Math.sign(e.deltaY) * 0.09) }, true) }, { passive: false })
const NAVKEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const k = e.key.toLowerCase()
  if (NAVKEYS.has(k)) { moveKeys.add(k); if (e.shiftKey) moveKeys.add('shift'); e.preventDefault() }
  if (k === 'shift') moveKeys.add('shift')
  if (k === 'g') toggleEdge()
})
addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); moveKeys.delete(k); if (k === 'shift') moveKeys.delete('shift') })
addEventListener('blur', () => moveKeys.clear())
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === '0') setGoal({ az: HOME.az, el: HOME.el, r: HOME.r, t: HOME.t })
  const st = 0.06 * goal.r
  if (e.key === 'ArrowLeft') setGoal({ az: goal.az - 6 }, true)
  if (e.key === 'ArrowRight') setGoal({ az: goal.az + 6 }, true)
  if (e.key === 'ArrowUp') setGoal({ t: [goal.t.x, 0, goal.t.z - st] }, true)
  if (e.key === 'ArrowDown') setGoal({ t: [goal.t.x, 0, goal.t.z + st] }, true)
  if (e.key === '+' || e.key === '=') setGoal({ r: goal.r * 0.9 }, true)
  if (e.key === '-') setGoal({ r: goal.r * 1.1 }, true)
})
// ── 小地图（左下角）：整个办公室的平面图 + 每个人的位置 + 镜头位置；点击 / 拖动 = 镜头跳到那里
const MINI = DR_MODE ? PLACE_MODE.miniBounds : OFFICE_LAYOUT.r1Phase === 'R1' ? OFFICE_LAYOUT.miniBounds : MINI_BOUNDS
const miniEl = $('minimap')
const miniCtx = miniEl.getContext('2d')
const miniView = () => { const s = Math.min(miniEl.width / (MINI.x1 - MINI.x0), miniEl.height / (MINI.z1 - MINI.z0)); return { s, ox: (miniEl.width - (MINI.x1 - MINI.x0) * s) / 2, oy: (miniEl.height - (MINI.z1 - MINI.z0) * s) / 2 } }
const miniXY = (x, z) => { const { s, ox, oy } = miniView(); return [ox + (x - MINI.x0) * s, oy + (z - MINI.z0) * s] }
function drawMini() {
  if (getComputedStyle(miniEl).display === 'none') return // 隐藏时不画
  const g = miniCtx, W = miniEl.width, H = miniEl.height
  g.clearRect(0, 0, W, H)
  const rect = (x0, z0, x1, z1, fill, stroke) => { const [a, b] = miniXY(x0, z0), [c, d] = miniXY(x1, z1); g.fillStyle = fill; g.fillRect(a, b, c - a, d - b); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.strokeRect(a, b, c - a, d - b) } }
  if (DR_MODE) {
    rect(CAMPUS.x0, CAMPUS.z0, CAMPUS.x1, CAMPUS.z1, 'rgba(255,255,255,.07)', 'rgba(216,194,138,.72)')
    rect(CAMPUS_BUILDING.x0, CAMPUS_BUILDING.z0, CAMPUS_BUILDING.x1, CAMPUS_BUILDING.z1, 'rgba(63,75,85,.42)', 'rgba(182,154,100,.8)')
    for (const zone of CAMPUS_ZONES) rect(zone.x0, zone.z0, zone.x1, zone.z1, zone.kind === 'outdoor' ? 'rgba(216,194,138,.12)' : 'rgba(139,108,255,.13)', 'rgba(216,194,138,.35)')
  } else {
    rect(ENVELOPE.x0, ENVELOPE.z0, ENVELOPE.x1, ENVELOPE.z1, 'rgba(255,255,255,.07)', 'rgba(255,255,255,.28)')
    for (const r of OFFICE_ROOMS) rect(r.x0, r.z0, r.x1, r.z1, 'rgba(139,108,255,.16)', 'rgba(139,108,255,.6)')
    rect(LOUNGE_AREA.x - LOUNGE_AREA.width / 2, LOUNGE_AREA.z - LOUNGE_AREA.depth / 2, LOUNGE_AREA.x + LOUNGE_AREA.width / 2, LOUNGE_AREA.z + LOUNGE_AREA.depth / 2, 'rgba(130,164,139,.25)', 'rgba(160,196,166,.75)')
    rect(PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, 'rgba(216,194,138,.12)', 'rgba(216,194,138,.55)')
    rect(WAREHOUSE.x0, WAREHOUSE.z0, WAREHOUSE.x1, WAREHOUSE.z1, 'rgba(63,75,85,.42)', 'rgba(182,154,100,.75)')
    rect(DOCK.x0, DOCK.z0, DOCK.x1, DOCK.z1, 'rgba(182,154,100,.25)', 'rgba(216,194,138,.62)')
    rect(PARKING.x0, PARKING.z0, PARKING.x1, PARKING.z1, 'rgba(255,255,255,.04)', 'rgba(182,154,100,.38)')
    rect(ENTRANCE.x0, LOUNGE_AREA.entryZ, ENTRANCE.x1, ENVELOPE.z1, 'rgba(182,154,100,.15)', 'rgba(182,154,100,.6)')
    g.font = '600 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    { const plazaFocus = focusOf('plaza'), [x, y] = miniXY(plazaFocus.t[0], plazaFocus.t[2]); g.fillStyle = 'rgba(244,241,235,.55)'; g.fillText(plazaFocus.label, x, y) }
    for (const z of Object.values(ZONES)) { const [x, y] = miniXY(z.focus.t[0], z.focus.t[2]); g.fillStyle = 'rgba(244,241,235,.55)'; g.fillText(z.label.replace(/ 工作室$/, ''), x, y) }
  }
  const dot = (x, z, c, r) => { const [a, b] = miniXY(x, z); g.beginPath(); g.arc(a, b, r, 0, 7); g.fillStyle = c; g.fill() }
  if (!DR_MODE) {
    for (const v of views.values()) { if (v.away || !v.char) continue; const p = v.char.group.position; dot(p.x, p.z, v.mode === 'run' ? '#46d17a' : v.mode === 'err' || v.mode === 'stall' ? '#ff5d5d' : v.mode === 'pause' ? '#59606a' : '#c7cbcf', 4.2) }
    for (const v of Object.values(boardViews)) { const p = v.char.group.position; dot(p.x, p.z, '#ffb020', 5.2) }
  }
  // 镜头：目标点 + 朝向（三角）+ 大致视野范围
  const [cx, cy] = miniXY(cam.t.x, cam.t.z), az = cam.az * D2R
  const span = Math.min(60, cam.r * 0.9) * miniView().s
  g.strokeStyle = 'rgba(182,154,100,.95)'; g.lineWidth = 2; g.strokeRect(cx - span * 0.55, cy - span * 0.32, span * 1.1, span * 0.64)
  g.fillStyle = '#e0c88f'; g.beginPath(); g.moveTo(cx - Math.sin(az) * 11, cy - Math.cos(az) * 11); g.lineTo(cx + Math.cos(az) * 6 + Math.sin(az) * 5, cy - Math.sin(az) * 6 + Math.cos(az) * 5); g.lineTo(cx - Math.cos(az) * 6 + Math.sin(az) * 5, cy + Math.sin(az) * 6 + Math.cos(az) * 5); g.closePath(); g.fill()
}
function miniGo(e) {
  const r = miniEl.getBoundingClientRect()
  const { s, ox, oy } = miniView(), px = (e.clientX - r.left) / r.width * miniEl.width, py = (e.clientY - r.top) / r.height * miniEl.height, x = Math.min(MINI.x1, Math.max(MINI.x0, MINI.x0 + (px - ox) / s)), z = Math.min(MINI.z1, Math.max(MINI.z0, MINI.z0 + (py - oy) / s))
  setGoal({ t: [x, 0, z] })
}
let miniDown = false
miniEl.addEventListener('pointerdown', (e) => { miniDown = true; miniEl.setPointerCapture(e.pointerId); miniGo(e); e.preventDefault() })
miniEl.addEventListener('pointermove', (e) => { if (miniDown) miniGo(e) })
miniEl.addEventListener('pointerup', () => { miniDown = false })
setInterval(drawMini, 250)
const zonesEl = $('dock')
function zoneBtn(label, fn, first) {
  const b = document.createElement('button')
  b.textContent = label
  b.addEventListener('click', () => { zonesEl.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); fn() })
  if (first) b.classList.add('on')
  zonesEl.appendChild(b)
}
if (DR_MODE) {
  PLACE_MODE.cameraViews.forEach((view, index) => zoneBtn(view.label, () => setGoal(view), index === 0))
} else {
  zoneBtn('🏢 全景', () => setGoal({ az: HOME.az, el: HOME.el, r: HOME.r, t: HOME.t }), true)
  zoneBtn('🔄 环绕巡航', () => { setGoal({ el: 30, r: homeR(), t: VIEW_CENTER }); camMode.tour = true })
  zoneBtn('🔭 俯视', () => setGoal({ az: 0, el: 86, r: homeR(), t: VIEW_CENTER }))
  zoneBtn('📐 等距', () => setGoal({ az: 45, el: 35, r: homeR(), t: VIEW_CENTER }))
  zoneBtn('🎥 低机位', () => setGoal({ az: -25, el: 7, r: 26, t: [-4, 0, 2] }))
  zoneBtn('👤 跟随', () => {
  // 跟随选中的人；没选就跟一个正在走动或正在干活的人
  const all = [...views.values()].filter((v) => !v.away)
  const v = views.get(selectedId) || all.find((x) => x.act) || all.find((x) => x.mode === 'run') || all[0]
  if (!v) return
  setGoal({ el: 22, r: 6.5 })
  camMode.follow = v.id
  selectedId = v.id
  showDetail(v.id)
})
zoneBtn('🌇 室外', () => setGoal({ az: 18, el: 24, r: 78, t: VIEW_CENTER }))
zoneBtn('🛕 高棉地标', () => setGoal({ az: 0, el: 12, r: 110, t: [0, 0, -20] }))
zoneBtn('✨ 形象墙', () => setGoal({ az: 4, el: 22, r: 13, t: [CORRIDOR_X, 0, BACK_Z + 4] }))
for (const z of Object.values(ZONES)) zoneBtn(z.label, () => setGoal({ az: 6, el: 36, r: z.focus.r, t: z.focus.t }))
zoneBtn('🏛️ DR广场', () => { const focus = focusOf('plaza'); setGoal({ az: 8, el: 34, r: focus.r, t: focus.t }) })
  zoneBtn('🛋️ 休息区', () => setGoal({ az: 10, el: 38, r: 13, t: [LOUNGE_AREA.x, 0, LOUNGE_AREA.z] }))
}
const qb = $('quality')
board.beacon.userData.dynamic = true // 告警灯会变色，不进入静态渲染副本。
const sceneQuality = createSceneQuality(THREE, { scene, renderer, camera, env:env3d, characters:()=>[...views.values()].map(v=>v.char).concat(Object.values(boardViews).map(v=>v.char)), mergeStatic })
const startupQualityPlan = qualityStartupPlan({ tier: qualityPolicy.tier, source: qualityPolicy.source })
const qualityMetrics = { fps:0, frameMs:0, renderMs:0, calls:0, triangles:0, lights:0, rendered:0, placeholderMs:0, firstRenderMs:0, qualityReadyMs:0 }
const qualityNames = { low:'低', medium:'中', high:'高' }
const showQ = () => { qb.textContent = '画质：' + qualityNames[qualityPolicy.tier] }
function applyQuality() {
  sceneQuality.activate(qualityPolicy.tier)
  dpr=cappedDpr(qualityPolicy.tier,DPR_MAX,innerWidth,innerHeight);renderer.setPixelRatio(dpr);resize();showQ()
}
const qualityStatus = () => `${qualityNames[qualityPolicy.tier]}档 · ${qualityMetrics.fps.toFixed(1)} FPS · ${qualityMetrics.frameMs.toFixed(1)}ms · calls ${qualityMetrics.calls} · 三角形 ${qualityMetrics.triangles} · 灯 ${qualityMetrics.lights} · ${qualityPolicy.reason}`
if(new URLSearchParams(location.search).has('perf')){
  const panel=document.createElement('div');panel.id='perfPanel';panel.className='glass';panel.setAttribute('role','status');document.body.appendChild(panel)
}
showQ()
qb.addEventListener('click', () => ui.openQuality({ tier:qualityPolicy.tier, forced:qualityPolicy.forced, status:qualityStatus(), select:q=>{if(qualityPolicy.select(q,qualityStorage)){ui.toast('正在切换画质…');requestAnimationFrame(applyQuality)}} }))
// 全屏 + 隐藏面板（沉浸看场景）：按钮或键盘 F / H
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen().catch(() => ui.toast('浏览器拒绝了全屏', false))
}
const toggleClean = () => document.body.classList.toggle('clean')
$('fs').addEventListener('click', toggleFullscreen)
keepFullscreenAwake({ onStatus: status => { $('fs').title = awakeMessage(status); if (['unsupported', 'denied', 'released'].includes(status)) ui.toast(awakeMessage(status), false) } })
$('clean').addEventListener('click', toggleClean)
// 底部工具栏分组（查看 / 治理 / 设置）：点组按钮展开 / 收起菜单，同时只开一个；点菜单里的按钮后自动收起
// （画质 / 亮度 / 边缘滚动 / 镜头跟随这类连续切换的带 data-keep，保持打开）；点别处或按 Esc 也收起。
{
  const grps = [...document.querySelectorAll('#tools .grp')]
  const closeAll = (except) => grps.forEach((g) => { if (g !== except) g.classList.remove('open') })
  for (const g of grps) {
    g.querySelector('.gbtn').addEventListener('click', (e) => { e.stopPropagation(); closeAll(g); g.classList.toggle('open') })
    g.querySelector('.menu').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.hasAttribute('data-keep')) g.classList.remove('open') })
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#tools .grp')) closeAll() })
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll() })
}
document.addEventListener('fullscreenchange', () => { $('fs').textContent = document.fullscreenElement ? '⛶ 退出全屏' : '⛶ 全屏'; setTimeout(resize, 50) })
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === 'f' || e.key === 'F') toggleFullscreen()
  if (e.key === 'h' || e.key === 'H') toggleClean()
  if (e.key === 'm' || e.key === 'M') toggleLook()
  if (e.key === 'Escape' && fun.catPlaying()) toggleCatPlay(false)
})
// 亮度：默认「柔和」，不刺眼；每位观看者自己的偏好存在本机浏览器
const BRIGHT = [['柔和', 0.85], ['标准', 1.0], ['明亮', 1.2]]
let brightIdx = 0
try { brightIdx = Math.max(0, BRIGHT.findIndex((b) => b[0] === localStorage.getItem('office3d.bright'))) } catch {}
const applyBright = () => { renderer.toneMappingExposure = BRIGHT[brightIdx][1]; $('bright').textContent = '亮度：' + BRIGHT[brightIdx][0] }
applyBright()
$('bright').addEventListener('click', () => {
  brightIdx = (brightIdx + 1) % BRIGHT.length
  applyBright()
  try { localStorage.setItem('office3d.bright', BRIGHT[brightIdx][0]) } catch {}
})

// ───────────────────────── 点选与详情 ─────────────────────────
const ray = new THREE.Raycaster()
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), new THREE.MeshBasicMaterial({ color: VI.gold, transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false }))
selRing.rotation.x = -Math.PI / 2
selRing.visible = false
selRing.userData.dynamic = true
scene.add(selRing)
function catGround(cx, cy) {
  const r = dom.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
  const pt = new THREE.Vector3()
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt) ? pt : null
}
dom.addEventListener('pointermove', (e) => { if (fun.catPlaying() && ptrs.size < 2 && e.target === dom) { const p = catGround(e.clientX, e.clientY); if (p) fun.catAim(p, false) } })
function pick(cx, cy, shift = false) {
  const r = dom.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
  const meshes = []
  for (const v of [...views.values(), ...Object.values(boardViews)]) v.char.group.traverse((o) => { if (o.isMesh) meshes.push(o) })
  if (fun.pick(ray)) { const response = fun.catReact(); ui.toast(`🐱 小橘（办公室猫，纯装饰）：${response || '刚玩过，等一下'}`); return }
  if (fun.catPlaying()) { const p = catGround(cx, cy); if (p) fun.catAim(p, shift); return }
  const panelHit = ray.intersectObjects([...foyerPanels.values()].map(panel => panel.mesh).filter(mesh => mesh.visible), false)[0]
  if (panelHit) {
    const access = panelAccess(WALL_MODE ? 'wall' : latestState?.lan ? 'lan' : 'local')
    const id = panelHit.object.userData.foyerPanel
    if (id === 'notice' && access.announce) ui.openAnnounce(foyerData)
    else if (id === 'handoff' && access.handoff) ui.openHandoff()
    else if (id === 'attendance' && access.taskPanel) ui.openTasks()
    return
  }
  const hit = ray.intersectObjects(meshes, false)[0]
  const plazaHit = !hit && officeV3?.get('plaza')?.pick(ray)
  if (plazaHit) {
    const labels = { vendors: '广场轻食亭', cafe: '户外休闲桌', benches: '广场长椅', lamps: '景观灯', flowers: '花箱' }
    ui.toast(`${labels[plazaHit.kind] || '广场设施'} · 仅供参观`)
    walkTo(plazaHit.x, plazaHit.z, false)
    return
  }
  if (hit) { selectedId = hit.object.userData.agentId; showDetail(selectedId) } else {
    selectedId = null; $('detail').style.display = 'none'; selRing.visible = false
    const pt = new THREE.Vector3()
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) walkTo(pt.x, pt.z, false) // 点地面：镜头走过去
  }
}
// 改名：放在人物卡片底部，单独渲染（每 3 秒刷新卡片时不会冲掉正在输入的内容）
let nameBoxFor = null
function renderNameBox(id, current, original) {
  const box = $('detailName')
  if (nameBoxFor === id && box.innerHTML) return
  nameBoxFor = id
  box.innerHTML = `<div class="sec" style="margin-top:10px;font-size:12px;color:var(--gold2)">显示名称</div>
    <div style="display:flex;gap:6px"><input type="text" id="nameIn" maxlength="24" value="${esc(current)}" style="min-height:0;padding:7px 9px"><button class="btn gold" id="nameSave">保存</button></div>
    <div class="note" style="margin-top:4px">原名 ${esc(original)}；只改办公室里显示的名字，Paperclip 里的名字不变。清空后保存 = 恢复原名。</div>`
  const save = () => ui.rename(id, $('nameIn').value.trim())
  $('nameSave').onclick = save
  $('nameSave').disabled = document.body.classList.contains('lan')
  if ($('nameSave').disabled) $('nameSave').title = '局域网只读，请在运行服务的电脑上操作'
  $('nameIn').onkeydown = (e) => { if (e.key === 'Enter') save() }
}
function showBoardDetail(key) {
  const bv = Object.values(boardViews).find((b) => b.id === key)
  if (!bv) return
  $('detailBody').innerHTML = `<h3>${esc(bv.name)}</h3><div class="row"><span>身份</span><span>董事会</span></div>`
  renderNameBox(key, bv.name, bv.baseName)
  $('detail').style.display = 'block'
}
function showDetail(id) {
  if (String(id).startsWith('board:')) return showBoardDetail(id)
  const v = views.get(id)
  if (!v) return
  const a = v.data
  const modeText = v.act ? ({ queued: '等候通行', rise: '起身', walk: '走动中', turn: '转正', talk: '汇报中', sit: '回座', say: '发言', wait: '等对方回来' }[v.act.phase] || '互动中') : { run: '执行中', stall: '疑似卡住', err: '出错', pause: '已暂停', idle: '空闲' }[v.mode]
  const rows = [['岗位', a.title], ['状态', modeText], ...(v.chip ? [['详情', v.chip]] : []), ...(v.why ? [['说明', v.why]] : []), ...(v.waits || []).map((w) => [WAIT_LABEL[w.kind], `${w.id} · 已等 ${ago(Date.now() - Date.parse(w.since))}`]), ['模型', a.model || '默认'], ['适配器', a.adapter], ['当前任务', a.task ? `${a.task.id} · ${a.task.status}` : '无'], ['最近一次运行', a.lastRun ? `${a.lastRun.status}${a.lastRun.error ? ' (' + a.lastRun.error + ')' : ''}` : '无'], ...(v.mood ? [['心情', { frown: '😣 最近一次运行失败了', tired: '🥱 这次运行已超过 20 分钟', happy: '😄 刚完成了任务' }[v.mood]]] : []), ...(v.awards || []).map((x) => ['🏆 ' + x.label, x.detail + (awardsSince ? `（统计自 ${String(awardsSince).slice(5, 10)}）` : '')])]
  renderNameBox(id, v.name, a.name)
  $('detailBody').innerHTML = `<h3>${esc(labelText(a, v.name))}</h3>${v.name !== a.name ? `<div class="note">Paperclip 里的名字：${esc(a.name)}</div>` : ''}` + rows.map(([k, val]) => `<div class="row"><span>${k}</span><span>${esc(val)}</span></div>`).join('') + (a.task ? `<div class="row"><span>任务</span><span>${esc(a.task.title)}</span></div><div class="actions"><button class="btn gold" id="detailOpen">打开任务（在本页处理）</button></div>` : '') + '<div class="actions"><button class="btn" id="detailChat">💬 对话</button><button class="btn" id="detailDispatch">＋ 派任务给 TA</button></div>'
  $('detailChat').disabled = WALL_MODE || document.body.classList.contains('lan') || a.status === 'terminated'
  $('detailChat').title = WALL_MODE ? '大屏模式不提供对话' : document.body.classList.contains('lan') ? '对话内容只允许在运行服务的电脑上查看' : a.status === 'terminated' ? '已离职，不能对话' : '与这位同事对话'
  $('detailChat').onclick = () => ui.openChat(id)
  $('detailDispatch').disabled = document.body.classList.contains('lan') || latestState?.stale?.active
  if ($('detailDispatch').disabled) $('detailDispatch').title = latestState?.stale?.active ? 'Paperclip 暂不可用' : '局域网只读，请在运行服务的电脑上操作'
  $('detailDispatch').onclick = () => ui.openDispatch(id)
  const ob = $('detailOpen')
  if (ob) ob.onclick = () => ui.openIssue(a.task.issueId, a.task.status === 'in_review' ? 'review' : 'view')
  $('detail').style.display = 'block'
  selRing.visible = true
}
$('detailClose').addEventListener('click', () => { nameBoxFor = null; $('detailName').innerHTML = ''; selectedId = null; $('detail').style.display = 'none'; selRing.visible = false })

// ───────────────────────── 帧循环 ─────────────────────────
const clock = { last: performance.now(), t0: performance.now(), t: 0, delta() { const n = performance.now(); const d = Math.min((n - this.last) / 1000, 0.1); this.last = n; this.t = (n - this.t0) / 1000; return d } }
let lastScreenTick = 0
let lastBoard = ''
function drawBoardScreen(alert) {
  const key = `${alert}|${boardState.approvals}|${boardState.waiting}|${markTex.image ? 1 : 0}`
  if (key === lastBoard) return
  lastBoard = key
  const g = board.scr.ctx
  g.fillStyle = '#0c1016'; g.fillRect(0, 0, 256, 144)
  g.textAlign = 'center'
  g.fillStyle = alert ? '#ffb020' : '#d9bf8a'
  g.font = 'bold 54px sans-serif'
  g.fillText(String(boardState.approvals + boardState.waiting), 128, 74)
  g.font = '15px sans-serif'
  g.fillStyle = alert ? '#ffd88a' : '#9fe7b4'
  g.fillText(alert ? '项等你处理' : '没有待处理', 128, 102)
  if (markTex.image) g.drawImage(markTex.image, 12, 10, 22, 28)
  g.fillStyle = 'rgba(182,154,100,.7)'; g.font = '11px sans-serif'
  g.fillText('董事会', 128, 128)
  board.scr.tex.needsUpdate = true
}
const ease = (dt, k) => Math.min(1, dt * k)
const perf = { n: 0, ms: 0, since: performance.now() }
let animationFrame=0,lastRender=0,nextRender=0,lastInput=performance.now(),lastMetric=performance.now(),metricFrames=0,metricMs=0
for(const event of ['pointerdown','pointermove','wheel','keydown','touchstart'])addEventListener(event,()=>{lastInput=performance.now()},{passive:true})
document.addEventListener('visibilitychange',()=>{
  cancelAnimationFrame(animationFrame);animationFrame=0;lastRender=nextRender=0;clock.last=performance.now();qualityPolicy.resetWindow();perf.n=0;perf.since=performance.now()
  if(!document.hidden)animationFrame=requestAnimationFrame(frame)
})
function frame(rafTime) {
  const t0 = performance.now()
  const tickTime=Number.isFinite(rafTime)?rafTime:t0
  if(document.hidden){animationFrame=0;return}
  animationFrame=requestAnimationFrame(frame)
  const ds=director.stats(),active=ds.active>0||ds.queued>0||ds.bubbles>0||!!meet||!!voteMeet||fun.catPlaying()||[...views.values()].some(v=>!!v.act||v.mode==='run')||camMode.tour||!!camMode.follow||moveKeys.size>0||goal.t.distanceTo(cam.t)>.02||Math.abs(goal.az-cam.az)>.1||Math.abs(goal.r-cam.r)>.05
  const limit=renderLimit({tier:qualityPolicy.tier,wall:WALL_MODE,idleMs:t0-lastInput,active})
  const interval=1000/limit
  if(nextRender&&tickTime<nextRender-.5)return
  nextRender=!nextRender||tickTime-nextRender>interval*2?tickTime+interval:nextRender+interval
  const frameMs=lastRender?tickTime-lastRender:interval
  lastRender=tickTime
  const dt = clock.delta()
  if(!sceneQuality.prepared){applyCamera(dt);renderer.clear();qualityMetrics.calls=qualityMetrics.triangles=qualityMetrics.lights=0;if(!qualityMetrics.placeholderMs)qualityMetrics.placeholderMs=performance.now()-APP_STARTED;return}
  if(sceneQuality.prepared&&qualityPolicy.observe(frameMs,t0,limit!==10&&sceneQuality.eligible(t0)))applyQuality()
  // 每 2 秒看一次平均帧间隔：低于约 33 帧就降分辨率，高于约 55 帧再慢慢升回去。
  // 必须放在渲染之前：重设画布尺寸会清空画布，如果放在渲染之后，浏览器会先显示一帧空白再画下一帧，刷新后连降几档就会闪几下。
  // 另外等静态网格合并完成（首数据后约 6 秒）再开始自适应，加载期的卡顿不算，免得一上来就连降好几档。
  perf.n++
  if (!poll.merged) { perf.n = 0; perf.since = t0; perf.warmUntil = 0 } // 加载期间的慢帧不算，免得一上来就把分辨率降到最低
  else if (!perf.warmUntil) { perf.warmUntil = t0 + 6000; perf.n = 0; perf.since = t0 }
  else if (t0 < perf.warmUntil) { perf.n = 0; perf.since = t0 }
  else if (!document.hidden && !FIXED_DPR && t0 - perf.since > 2000) {
    const avg = (t0 - perf.since) / perf.n
    let next = dpr
    if (avg > (limit===30?45:30) && dpr > 0.6) next = Math.max(0.6, dpr * 0.85)
    const ceiling=cappedDpr(qualityPolicy.tier,DPR_MAX,innerWidth,innerHeight)
    if(avg<18&&dpr<ceiling)next=Math.min(ceiling,dpr*1.08)
    next=Math.min(next,ceiling)
    if (Math.abs(next - dpr) > 0.01) { dpr = next; renderer.setPixelRatio(dpr); resize() }
    perf.n = 0
    perf.since = t0
  }
  step(dt, clock.t) // 渲染在调整分辨率之后：重设尺寸后马上重画，不会出现空白帧
  qualityMetrics.renderMs=performance.now()-t0;metricFrames++;metricMs+=frameMs
  if(t0-lastMetric>=1000){qualityMetrics.fps=metricFrames*1000/metricMs;qualityMetrics.frameMs=metricMs/metricFrames;metricFrames=0;metricMs=0;lastMetric=t0;qb.title=qualityStatus();const el=$('perfPanel');if(el)el.textContent=qualityStatus();const qs=$('qualityStats');if(qs)qs.textContent=qualityStatus()}
}
let simT = 0
let shadowTick = 0
function step(dt, t = (simT += dt)) { // 单步推进：页面不可见时 rAF 会暂停，调试/验收可以手动推进模拟
  renderer.shadowMap.needsUpdate = qualityPolicy.tier!=='low'&&(renderer.shadowMap.needsUpdate||(shadowTick++ & 1) === 0)
  applyCamera(dt)
  env3d.update(dt, t)
  if (!DR_MODE) {
  const wx = lastWorld && lastWorld.weather
  const catWasPlaying = fun.catPlaying()
  fun.update(dt, t, { night: env3d.night, offDuty: !!(lastWorld && lastWorld.duty && !lastWorld.duty.on), raining: !!(wx && (wx.rainMm > 0.1 || wx.code >= 51)) }, projectTo)
  if (catWasPlaying && !fun.catPlaying()) syncCatPlay()
  const tick = Math.floor(t * 8)
  const redraw = t - lastScreenTick > 0.12
  director.update(dt)
  for (const v of views.values()) {
    const ch = v.char, p = ch.pose
    if (!v.act) {
      // 没有互动时：按真实状态坐着干活 / 发呆
      p.sit = THREE.MathUtils.lerp(p.sit, 1, ease(dt, 6))
      p.walk = THREE.MathUtils.lerp(p.walk, 0, ease(dt, 6))
      p.type = THREE.MathUtils.lerp(p.type, v.mode === 'run' ? 1 : 0, ease(dt, 5))
      p.talk = THREE.MathUtils.lerp(p.talk, 0, ease(dt, 5))
      p.carry = THREE.MathUtils.lerp(p.carry, 0, ease(dt, 5))
      p.yaw = v.mode === 'run' ? Math.sin(t * 0.9 + v.phase) * 0.12 : Math.sin(t * 0.35 + v.phase) * 0.28
      if (v.lookAt && performance.now() < v.lookUntil) {
        const sp = v.lookAt.char.group.position, g = ch.group
        const d = Math.atan2(-(sp.x - g.position.x), -(sp.z - g.position.z)) - g.rotation.y
        p.yaw = Math.max(-1, Math.min(1, Math.atan2(Math.sin(d), Math.cos(d))))
      }
    }
    solveCharacter(ch,dt,!!v.act||p.walk>.05||p.talk>.05)
    v.ring.visible = !v.away && (v.mode === 'run' || v.mode === 'err' || v.mode === 'stall' || (v.waits && v.waits.length > 0))
    v.ring.material.color.setHex(v.mode === 'err' ? 0xff5d5d : v.mode === 'stall' ? 0xffb020 : v.mode === 'run' ? 0x35d07f : 0x6fa8ff)
    v.ring.material.opacity = v.mode === 'stall' ? 0.5 + 0.5 * Math.sin(t * 5) : 0.95
    v.ring.rotation.z += dt * (v.mode === 'run' ? 2.4 : 0.6)
    v.ring.position.set(0, (ch.ringY || 1.82) + Math.sin(t * 2 + v.phase) * 0.02, 0)
    if (redraw) drawScreen(v.desk.scr, v.mode === 'run' ? 'run' : v.mode === 'err' ? 'err' : v.mode === 'stall' ? 'stall' : 'idle', tick)
    ch.body.head.getWorldPosition(v.headPos)
    v.headPos.y += ch.labelDY || 0.62
    if (v.away) v.label.style.display = 'none'
    else projectTo(v.headPos, v.label, 0)
    if (selectedId === v.id) { selRing.position.set(ch.group.position.x, 0.03, ch.group.position.z) }
  }
  if (redraw) lastScreenTick = t
  const alert = boardState.approvals > 0 || boardState.waiting > 0
  board.amber.intensity = alert ? 14 + Math.sin(t * 4) * 6 : 0
  board.beacon.material.color.setHex(alert ? (Math.sin(t * 4) > 0 ? 0xffc23d : 0xb5780f) : 0x4a4130)
  drawBoardScreen(alert)
  Object.values(boardViews).forEach((bv, i) => {
    const p = bv.char.pose
    if (!bv.act) {
      p.sit = 1
      p.type = 0
      p.yaw = Math.sin(t * 0.4 + i * 2) * (alert ? 0.5 : 0.25)
      p.pitch = 0
      p.carry = bv.char.isModel ? 0 : THREE.MathUtils.lerp(p.carry, 0.7, ease(dt, 3)) // 手放在桌面
    }
    solveCharacter(bv.char,dt,!!bv.act||bv.char.pose.talk>.05)
    bv.char.body.head.getWorldPosition(bv.headPos)
    bv.headPos.y += bv.char.labelDY || 0.5
    projectTo(bv.headPos, bv.label, 0)
  })
  for (const z of zoneLabels) projectTo(z.pos, z.el)
  declutter([...[...views.values()].map((v) => v.label), ...Object.values(boardViews).map((b) => b.label)])
  }
  sceneQuality.update()
  renderer.info.autoReset=false;renderer.info.reset()
  env3d.render()
  qualityMetrics.calls=renderer.info.render.calls;qualityMetrics.triangles=renderer.info.render.triangles;qualityMetrics.rendered++
  if(!qualityMetrics.firstRenderMs)qualityMetrics.firstRenderMs=performance.now()-APP_STARTED
  let lights=0;scene.traverseVisible(o=>{if(o.isLight)lights++});qualityMetrics.lights=lights
}
const animationFrustum=new THREE.Frustum(),animationMatrix=new THREE.Matrix4(),animationSphere=new THREE.Sphere(),animationPoint=new THREE.Vector3()
function solveCharacter(ch,dt,active){
  if(qualityPolicy.tier==='high'){ch.animationDebt=0;ch.solve(dt);return}
  ch.group.getWorldPosition(animationPoint);animationPoint.y+=1
  animationSphere.set(animationPoint,1.8);animationMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);animationFrustum.setFromProjectionMatrix(animationMatrix)
  ch.animationDebt=(ch.animationDebt||0)+dt
  const visible=animationFrustum.intersectsSphere(animationSphere)
  if(!visible){ch.animationDebt=Math.min(ch.animationDebt,.15);return}
  const distant=animationPoint.distanceTo(camera.position)>28
  if(qualityPolicy.tier==='low'&&!active&&distant&&ch.animationDebt<1/15)return
  ch.solve(Math.min(ch.animationDebt,.15));ch.animationDebt=0
}

// ───────────────────────── 数据轮询 ─────────────────────────
async function pollFoyer() {
  if (document.hidden) return
  try {
    const response = await fetch('/foyer', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    foyerData = await response.json()
  } catch (error) {
    foyerData = null
    if (!pollFoyer.warned) { pollFoyer.warned = true; console.warn(`[foyer] 读取失败，显示空态：${error.message}`) }
  }
  updateFoyerPanels()
}

async function pollMilestones() {
  if (document.hidden) return
  try {
    const response = await fetch('/wall/data', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    milestoneData = { milestones: (await response.json()).milestones }
  } catch (error) {
    milestoneData = null
    if (!pollMilestones.warned) { pollMilestones.warned = true; console.warn(`[foyer] 里程碑读取失败，显示空态：${error.message}`) }
  }
  updateFoyerPanels()
}

async function poll() {
  try {
    const r = await fetch('/state', { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    applyState(await r.json())
    if (!poll.merged) { // 首次有数据后、首帧之前完成当前档需要的合并与编译，避免先画完整重场景。
      poll.merged = true
      const snap = snapshot(scene)
      const t0 = performance.now(), merged = mergeStatic(scene, snap)
      sceneQuality.prepare(startupQualityPlan.current);applyQuality();poll.qualityReady=true;qualityMetrics.qualityReadyMs=performance.now()-APP_STARTED
      const deferred=qualityStartupPlan({tier:startupQualityPlan.current,source:qualityPolicy.source,idle:true}).deferred
      const schedule=window.requestIdleCallback||((cb)=>setTimeout(()=>cb({timeRemaining:()=>8}),100))
      const work=()=>{takeQualityWork(deferred,q=>sceneQuality.prepareTier(q),{timeRemaining:()=>8});if(deferred.length)schedule(work,{timeout:15000})}
      if(deferred.length)schedule(work,{timeout:15000})
      console.info(`[office3d] 静态网格合并：${merged.removed} → ${merged.added}，用时 ${Math.round(performance.now() - t0)} ms`)
    }
    $('loading').classList.add('done')
    $('conn').className = 'dot live'
    setText('connText', '实时 · 每 3 秒刷新')
    $('err').style.display = 'none'
  } catch (e) {
    $('conn').className = 'dot off'
    setText('connText', '断开')
    $('err').style.display = 'block'
    $('err').textContent = `读取 Paperclip 数据失败：${e.message}（确认 Paperclip 在 127.0.0.1:3100 运行）`
  }
}
function resize() {
  const w = innerWidth, h = innerHeight
  const ceiling=cappedDpr(qualityPolicy.tier,DPR_MAX,w,h)
  if(dpr>ceiling){dpr=ceiling;renderer.setPixelRatio(dpr)}
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.fov = w / h < 1 ? 60 : 38
  camera.updateProjectionMatrix()
  env3d.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio())
  if (resize.once && Math.abs(goal.r - cam.r) < 0.5 && goal.t.distanceTo(new THREE.Vector3(...HOME.t)) < 0.2) setGoal({ r: HOME.r })
  resize.once = true
}
addEventListener('resize', resize)
resize()
applyCamera(1)
if (DR_MODE) {
  poll.merged = true
  const snap = snapshot(scene), merged = mergeStatic(scene, snap)
  sceneQuality.prepare(startupQualityPlan.current); applyQuality(); qualityMetrics.qualityReadyMs = performance.now() - APP_STARTED
  console.info(`[office3d] 仓配模式静态网格合并：${merged.removed} → ${merged.added}`)
  $('loading').classList.add('done')
  $('conn').className = 'dot live'
  setText('connText', PLACE_MODE.subtitle)
} else {
  poll().finally(()=>{if(!sceneQuality.prepared){sceneQuality.prepare(startupQualityPlan.current);applyQuality();qualityMetrics.qualityReadyMs=performance.now()-APP_STARTED}})
  setInterval(poll, POLL_MS)
  pollFoyer(); pollMilestones()
  setInterval(pollFoyer, 30_000)
  setInterval(pollMilestones, 30_000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollFoyer(); pollMilestones() } })
}
if (!WALL_MODE && !DR_MODE) { // T11 直入：?replay=YYYY-MM-DD（?wall=1 时忽略）
  const rp = new URLSearchParams(location.search).get('replay')
  if (rp && /^\d{4}-\d{2}-\d{2}$/.test(rp)) setTimeout(() => replay.openDate(rp), 900)
}
frame()
if (!DR_MODE && !LAYOUT3_MODE && PEOPLE) loadExtras(PEOPLE).catch((e) => console.warn('日常小动作加载失败：', e)) // 首屏后再加载，不挡打开速度
if (!DR_MODE && OFFICE_LAYOUT.r1Phase === 'R1') {
  const ready = () => {
    if (!views.size) { setTimeout(ready, 100); return }
    // Paint the seated placeholders before starting expensive FBX parsing.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(async () => {
      const status = scene.userData.r1People = { startedAt: performance.now(), replaced: [], failed: [] }
      try {
        const loaded = await loadPeople()
        await loadR1Extras(loaded)
        PEOPLE = loaded
        for (const v of views.values()) {
          if (v.char.avatar) continue
          const personName = v.data?.name ?? v.name
          try {
            const seatIdx = Object.keys(SEATS).indexOf(personName), avatar = ({ Reviewer2: 'Male_Adult_07', SecurityReviewer: 'Male_Adult_10' })[personName] || CAST_OVERRIDE[personName] || CAST[seatIdx % CAST.length]
            const assets = r1SeatedAssets(loaded, avatar, officeV3.get('furniture3').seatedProfile(personName), personName)
            if (!assets) { status.failed.push(personName); continue }
            const ch = createPerson(assets, avatar), previous = v.char
            Object.assign(ch.pose, previous.pose)
            placeSeated(ch, v.home)
            fitR1SeatedPerson(ch, { handY: officeV3.get('furniture3').seatedProfile(personName).handY, home: v.home, desk: { x: v.desk.group.position.x, z: v.desk.group.position.z }, chair: officeV3.get('furniture3').chairAt(v.home.x, v.home.z) })
            ch.group.visible = previous.group.visible
            ch.group.traverse(o => { o.userData.agentId = v.id })
            ch.group.add(v.ring); scene.add(ch.group); previous.group.removeFromParent(); v.char = ch
            status.replaced.push(personName)
          } catch { status.failed.push(personName) }
          await new Promise(resolve => requestAnimationFrame(resolve))
        }
        status.completedAt = performance.now()
      } catch { status.loadFailed = true }
    }, 0)))
  }
  ready()
}
window.__office = { debugMeeting: (m) => { meetingsList = [m] }, debugVote: (s) => { voteForced = s || null; voteSessions = s ? [s] : [] }, voteState: () => voteMeet && { id: voteMeet.id, seated: [...voteSeated].map((v) => v.name) }, meetState: () => meet && { room: meet.room, idx: meet.idx, here: meet.here.map((v) => v.name), remote: meet.remote.map((v) => v.name) }, fun, gossipState: () => ({ gossip, threads: gossipThreads.length, played: [...gossipPlayed] }), chatLine, env3d, lifeTick, LOUNGE, step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt, clock.t) }, A, THREE, scene, camera, renderer, views, boardViews, cam, goal, setGoal, boardState, director, enqueue: (e) => director.enqueue(e) }
window.__office.furnitureCollision = activeCollision
window.__office.officeV2 = officeFurnitureV2?.registry || null
window.__office.officeV3 = officeV3 && { root: officeV3.root, summary: officeV3.summary, dispose: officeV3.dispose }
window.__office.warehouseShell = warehouseShell
window.__office.campus = campusRegistry && { summary: () => campusRegistry.summary(), hiddenEnvironment: campusRegistry.hiddenEnvironment, focus: () => setGoal({ az: 35, el: 48, r: CAMPUS_FOCUS.r, t: CAMPUS_FOCUS.t }) }
window.__office.controlRoom = controlRoom && { root: controlRoom.root, summary: () => ({ enabled: true, seats: 4, watermark: '模拟数据 · 示意' }), dispose: controlRoom.dispose }
window.__office.placeMode = { mode: PLACE_MODE, officeRoots: officeSceneRoots, visibleOfficeRoots: () => officeSceneRoots.filter((root) => root.visible), zones: CAMPUS_ZONES }
window.__office.foyerSpec = foyerSceneSpec()
window.__office.foyerPanels = () => Object.fromEntries([...foyerPanels].map(([id, panel]) => [id, { redraws: panel.redraws, signature: panel.signature, visible: panel.mesh.visible }]))
window.__office.quality={get tier(){return qualityPolicy.tier},get metrics(){return {...qualityMetrics,dpr:renderer.getPixelRatio(),reason:qualityPolicy.reason,source:qualityPolicy.source,hidden:document.hidden}},select:q=>{if(qualityPolicy.select(q,qualityStorage))applyQuality()},summary:()=>sceneQuality.summary()}
window.__office.meetingSeats = MEET_SEATS
window.__office.officePartitions = officePartitions
if (WALL_MODE) {
  const WALL_SPOTS = { overview: null, review: focusOf('review'), plan: focusOf('plan'), plaza: focusOf('plaza') }
  window.__office.wallGo = (key) => { // key：overview | tour | review | plan | ZONES 里的区域（product / eng / quality / drlife / ops / kb / meet / board）
    if (key === 'tour') { setGoal({ az: HOME.az, el: HOME.el, r: HOME.r, t: HOME.t }); camMode.tour = true; return true }
    if (key === 'overview') { setGoal({ az: HOME.az, el: HOME.el, r: HOME.r, t: HOME.t }); return true }
    const z = ZONES[key], sp = WALL_SPOTS[key]
    if (sp) { setGoal({ az: 6, el: 36, r: sp.r, t: sp.t }); return true }
    if (z) { setGoal({ az: 6, el: 36, r: z.focus.r, t: z.focus.t }); return true }
    return false
  }
  setTimeout(() => window.__office.wallGo('tour'), 4000)
}
