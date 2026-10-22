import * as THREE from './vendor/three/three.module.js'
import { buildItem, createMaterials } from './home-items-3d.js'
import { createHomeRoom, getHomeItem, starterInventory } from './home-room.js?a4p=1'
import { createHomeEditor } from './home-editor.js'
import { createHomePersistence } from './home-persist.js'
import { validateItemParameter } from './home-editor-logic.js'

const canvas = document.querySelector('#homeCanvas')
const status = document.querySelector('#homeStatus')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
renderer.shadowMap.enabled = true
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
const target = new THREE.Vector3(0, 0.7, 0)
const materials = {
  ...createMaterials(THREE),
  floor: new THREE.MeshStandardMaterial({ color: 0x9b7959, roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x526873, roughness: 0.84 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xd2b778, roughness: 0.68 }),
  grid: new THREE.LineBasicMaterial({ color: 0xd8c39a, transparent: true, opacity: 0.2 }),
  entry: new THREE.MeshBasicMaterial({ color: 0xd2b778, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
}
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x39454a, 1.8))
const key = new THREE.DirectionalLight(0xffe3b0, 2.1)
key.position.set(-4, 8, 5)
key.castShadow = true
scene.add(key)

const room = createHomeRoom(THREE, {
  scene,
  materials,
  itemBuilder: (itemId) => buildItem(THREE, itemId, { materials }),
})
let inventory = starterInventory('demo')
const byItem = new Map(inventory.map((entry) => [entry.itemId, entry]))
const demoPlacements = [
  ['bed_single', 1, 1, 0], ['sofa_two', 10, 1, 180], ['rug_round', 5, 4, 0],
  ['table_dining', 5, 7, 0], ['chair_wood', 4, 7, 0], ['chair_wood', 8, 7, 180],
  ['plant_pot', 13, 8, 0], ['lamp_floor', 2, 8, 0], ['bookshelf', 1, 0, 0],
  ['frame_art', 7, 0, 0], ['tv_stand', 12, 11, 0],
]
const galleryPlacements = [
  ['bed_single', 0, 0, 0], ['sofa_two', 6, 0, 0], ['table_dining', 1, 5, 0],
  ['chair_wood', 4, 5, 0], ['desk_work', 10, 5, 0], ['wardrobe', 13, 1, 0],
  ['bookshelf', 0, 0, 0], ['tv_stand', 12, 11, 0], ['plant_pot', 4, 2, 0],
  ['lamp_floor', 13, 7, 0], ['rug_round', 5, 3, 0], ['frame_art', 6, 0, 0],
]
function makePlacements(source) {
  const used = new Map()
  return source.map(([itemId, cx, cz, rot]) => {
    const index = (used.get(itemId) || 0) + 1
    used.set(itemId, index)
    const entry = inventory.find((item) => item.itemId === itemId && item.itemInstanceId.endsWith(`#${index}`)) || byItem.get(itemId)
    return { itemInstanceId: entry.itemInstanceId, itemId, cx, cz, rot, layer: getHomeItem(itemId).layer }
  })
}
const gallery = new URLSearchParams(location.search).get('items') === 'gallery'
const initialLayout = {
  schemaVersion: 1,
  ownerId: 'demo',
  revision: 0,
  placements: makePlacements(gallery ? galleryPlacements : demoPlacements),
}
room.setPlacements(initialLayout.placements, inventory)
status.textContent = gallery ? '12 件物品展示 · 仅页面内存数据' : '演示布置 · 仅页面内存数据'
function chooseConflictVersion() {
  status.textContent = '版本冲突，请选择处理方式（尚未保存）'
  return new Promise((resolve) => {
    const previousFocus = document.activeElement
    const dialog = document.createElement('dialog')
    dialog.className = 'glass'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', '个人空间版本冲突')
    dialog.style.cssText = 'box-sizing:border-box;width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:20px;color:var(--text);background:var(--panel)'
    const title = document.createElement('h2')
    title.textContent = '服务器已有更新'
    const explanation = document.createElement('p')
    explanation.textContent = '你的修改尚未保存。请选择使用哪个版本。'
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:16px'
    const finish = (choice) => {
      dialog.close()
      dialog.remove()
      previousFocus?.focus()
      resolve(choice)
    }
    for (const [choice, label] of [
      ['overwrite', '保留我的布置并覆盖'],
      ['server', '改用服务器版本'],
    ]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.setAttribute('aria-label', label)
      button.style.minHeight = '44px'
      button.addEventListener('click', () => finish(choice), { once: true })
      actions.append(button)
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish('cancel')
    }, { once: true })
    dialog.append(title, explanation, actions)
    document.body.append(dialog)
    dialog.showModal()
    actions.firstElementChild.focus()
  })
}
const persistence = createHomePersistence({
  onConflict: chooseConflictVersion,
})
const editor = createHomeEditor({
  THREE,
  scene,
  camera,
  renderer,
  room,
  itemBuilder: (itemId) => buildItem(THREE, itemId, { materials }),
  persistAdapter: {
    save: async (layout) => {
      status.textContent = '正在保存（尚未完成）'
      const result = await persistence.save(layout)
      if (result.ok) status.textContent = result.message || '已保存到本机'
      else if (result.kind === 'offline') status.textContent = `${result.message} · 离线演示`
      else status.textContent = result.message || '保存失败，当前布置仍保留'
      return result
    },
    reset: async () => {
      const result = await persistence.reset()
      if (result.ok) status.textContent = '已恢复默认并保存到本机'
      else if (result.kind === 'offline') status.textContent = `${result.message} · 离线演示`
      else status.textContent = result.message || '恢复默认失败，当前布置仍保留'
      return result
    },
  },
})
editor.setLayout(initialLayout, inventory)

let yaw = 0.55
let pitch = 0.96
let distance = 10.5
let drag = null
function placeCamera() {
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance,
  ).add(target)
  camera.lookAt(target)
}
function resize() {
  const width = innerWidth
  const height = innerHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  scene.background = new THREE.Color(theme === 'light' ? 0xe9eef0 : 0x101820)
}
function frame() {
  if (!document.hidden) renderer.render(scene, camera)
}
canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY }
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return
  yaw -= (event.clientX - drag.x) * 0.006
  pitch = Math.max(0.35, Math.min(1.35, pitch + (event.clientY - drag.y) * 0.005))
  drag = { x: event.clientX, y: event.clientY }
  placeCamera()
})
canvas.addEventListener('pointerup', () => { drag = null })
canvas.addEventListener('wheel', (event) => {
  event.preventDefault()
  distance = Math.max(7, Math.min(16, distance + event.deltaY * 0.01))
  placeCamera()
}, { passive: false })
document.querySelector('#themeDark').onclick = () => setTheme('dark')
document.querySelector('#themeLight').onclick = () => setTheme('light')
document.querySelector('#cameraReset').onclick = () => { yaw = 0.55; pitch = 0.96; distance = 10.5; placeCamera() }
document.querySelector('#editHome').onclick = () => editor.open()
document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : frame))
addEventListener('resize', resize)
setTheme(new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark')
resize()
placeCamera()
renderer.setAnimationLoop(frame)
const persisted = await persistence.connect()
if (persisted.mode === 'online' && persisted.layout) {
  inventory = persisted.inventory.length ? persisted.inventory : inventory
  editor.setLayout(persisted.layout, inventory)
  status.textContent = persisted.message || '已载入本机布置'
} else {
  status.textContent = `${persisted.message || '个人空间保存未开启（本机管理员可在服务端开启）'} · 离线演示`
}
const requestedItem = validateItemParameter(new URLSearchParams(location.search).get('item'))
if (requestedItem) editor.selectItem(requestedItem)
addEventListener('beforeunload', (event) => {
  if (editor.isDirty()) {
    event.preventDefault()
    event.returnValue = ''
  }
  room.dispose()
  editor.dispose()
  renderer.dispose()
  for (const material of Object.values(materials)) material?.dispose?.()
})
