import { buildWhR1Shell } from './dr-wh-r1-shell.js'
import { buildWhR1Zones } from './dr-wh-r1-zones.js'
import { buildWhR1Racks } from './dr-wh-r1-racks.js'
import { whR1Requested } from './place-mode.js'

const shape = geometry => Object.keys(geometry.attributes).filter(name => name !== 'color').sort().map(name => `${name}${geometry.attributes[name].itemSize}`).join(',')
const isDynamic = object => { for (let node = object; node; node = node.parent) if (node.userData.dynamic) return true; return false }
const isMergeable = mesh => mesh.isMesh && !mesh.isSkinnedMesh && !mesh.morphTargetInfluences && mesh.geometry?.attributes?.position && !Array.isArray(mesh.material) && !mesh.material?.map && !mesh.userData.noMerge && !isDynamic(mesh)

function bake(THREE, root, items) {
  const signature = shape(items[0].mesh.geometry)
  if (items.some(item => shape(item.mesh.geometry) !== signature)) return null
  const local = new THREE.Matrix4().copy(root.matrixWorld).invert(), color = new THREE.Color(), white = new THREE.Color(1, 1, 1)
  const parts = items.map(item => {
    const geometry = item.mesh.geometry.clone()
    geometry.applyMatrix4(local.clone().multiply(item.matrix))
    const base = item.mesh.material.color || white, source = geometry.getAttribute('color'), colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let index = 0; index < geometry.attributes.position.count; index++) {
      color.copy(base).multiply(item.color || white)
      if (source) color.multiply({ r: source.getX(index), g: source.getY(index), b: source.getZ(index) })
      colors.set([color.r, color.g, color.b], index * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  })
  const names = Object.keys(parts[0].attributes), vertices = parts.reduce((total, geometry) => total + geometry.attributes.position.count, 0)
  const merged = new THREE.BufferGeometry()
  for (const name of names) {
    const size = parts[0].attributes[name].itemSize, values = new Float32Array(vertices * size)
    let offset = 0
    for (const geometry of parts) { values.set(geometry.attributes[name].array, offset * size); offset += geometry.attributes.position.count }
    merged.setAttribute(name, new THREE.BufferAttribute(values, size))
  }
  const indexes = parts.map(geometry => geometry.index ? Array.from(geometry.index.array) : Array.from({ length: geometry.attributes.position.count }, (_, index) => index))
  const count = indexes.reduce((total, index) => total + index.length, 0), index = vertices > 65535 ? new Uint32Array(count) : new Uint16Array(count)
  let vertex = 0, offset = 0
  for (let part = 0; part < parts.length; part++) {
    for (let item = 0; item < indexes[part].length; item++) index[offset + item] = indexes[part][item] + vertex
    offset += indexes[part].length; vertex += parts[part].attributes.position.count; parts[part].dispose()
  }
  merged.setIndex(new THREE.BufferAttribute(index, 1)); merged.computeBoundingBox(); merged.computeBoundingSphere()
  return merged
}
const addItems = (THREE, mesh, items) => {
  if (mesh.isInstancedMesh) {
    const matrix = new THREE.Matrix4(), color = new THREE.Color(1, 1, 1)
    for (let index = 0; index < mesh.count; index++) { mesh.getMatrixAt(index, matrix); mesh.getColorAt?.(index, color); items.push({ mesh, matrix: mesh.matrixWorld.clone().multiply(matrix), color: color.clone() }) }
  } else items.push({ mesh, matrix: mesh.matrixWorld, color: new THREE.Color(1, 1, 1) })
}

export function mergeCampusStatic(THREE, root) {
  root.updateMatrixWorld?.(true)
  const groups = new Map(), sources = new Set()
  root.traverse?.(mesh => {
    if (!isMergeable(mesh) || mesh.name === 'campus-sign' || mesh.name === 'campus-rack-labels') return
    const type = mesh.material.transparent ? 'transparent' : 'opaque', key = `${type}|${shape(mesh.geometry)}`
    if (!groups.has(key)) groups.set(key, { type, items: [] })
    addItems(THREE, mesh, groups.get(key).items)
  })
  let removed = 0, added = 0
  const generated = []
  for (const { type, items } of groups.values()) {
    const material = type === 'opaque'
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .72, metalness: .18 })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide })
    const geometry = bake(THREE, root, items)
    if (!geometry) { material.dispose(); continue }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `campus-${type}-batch-${added + 1}`; mesh.userData.qualityProxy = true; mesh.castShadow = false; mesh.receiveShadow = false
    root.add(mesh); generated.push(mesh); added++
    items.forEach(item => sources.add(item.mesh))
  }
  for (const source of sources) { source.removeFromParent(); source.geometry.dispose(); removed++ }
  const result = { removed, added }
  Object.defineProperty(result, 'dispose', { enumerable: false, value: () => generated.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose() }) })
  return result
}

export function createCampusRegistry({ THREE, scene, quality, layout }) {
  const root = new THREE.Group()
  const whr1 = whR1Requested(globalThis.location?.search)
  root.name = whr1 ? 'wh-r1-root' : 'campus-root'
  const modules = new Map(), built = new Map(), skipped = []
  let merged = { removed: 0, added: 0 }, disposeMerged = () => {}
  let lastFrame = null, frameHook = null, previousFrame = null
  const sourceEpoch = globalThis.performance.now()
  const now = () => Math.max(0, globalThis.performance.now() - sourceEpoch)
  const resetFrame = () => { lastFrame = null }
  const stopped = new Set()
  const onFrame = (dt, context = {}) => {
    for (const [name, value] of built) if (!stopped.has(name) && value.onFrame) {
      try { value.onFrame(dt, context) } catch { stopped.add(name) }
    }
  }
  const register = (name, factory) => { if (!whr1) modules.set(name, factory); return root }
  const buildAll = (shared = {}) => {
    scene.add(root)
    const sources = whr1
      ? [['wh-r1-shell', buildWhR1Shell], ['wh-r1-zones', buildWhR1Zones], ['wh-r1-racks', buildWhR1Racks]]
      : modules
    for (const [name, factory] of sources) {
      try { built.set(name, factory({ THREE, root, layout, now, ...shared }) || {}) }
      catch (error) { skipped.push({ name, error: String(error?.message || error) }); console.warn(`[campus:${name}] 已跳过：${error.message}`) }
    }
    merged = mergeCampusStatic(THREE, root); disposeMerged = merged.dispose
    if (!frameHook && [...built.values()].some(value => value.onFrame)) {
      previousFrame = scene.onBeforeRender
      // Scene callback still runs when campus meshes are hidden or culled.
      frameHook = function (renderer, currentScene, camera, ...args) {
        previousFrame?.call(this, renderer, currentScene, camera, ...args)
        const time = now()
        const dt = lastFrame === null ? 0 : Math.min(.1, Math.max(0, (time - lastFrame) / 1000))
        lastFrame = time
        onFrame(dt, { renderer, camera })
      }
      scene.onBeforeRender = frameHook
      globalThis.document?.addEventListener('visibilitychange', resetFrame)
    }
    return root
  }
  const dispose = () => {
    if (frameHook && scene.onBeforeRender === frameHook) scene.onBeforeRender = previousFrame
    globalThis.document?.removeEventListener('visibilitychange', resetFrame)
    disposeMerged(); for (const value of built.values()) value.dispose?.(); built.clear(); root.removeFromParent()
  }
  const summary = () => ({ modules: [...built.keys()], skipped: [...skipped], quality: quality?.tier || null, merged, motion: built.get('motion')?.summary?.() || null })
  return { root, register, buildAll, dispose, summary, onFrame }
}
