import * as THREE from 'three'
import { GLTFLoader } from './vendor/three/jsm/loaders/GLTFLoader.js'
import { decodeAnimationClips } from './compact-animation.js'
import { initialQuality } from './quality.js'

export function compactTextureSize() {
  let storage; try { storage = globalThis.localStorage } catch {}
  const tier = globalThis.__office?.quality?.tier || initialQuality({ search: globalThis.location?.search, storage }).tier
  return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || tier === 'low' ? 512 : 1024
}
export function compactTextureUrl(url, size = compactTextureSize()) {
  const normalized = new URL(url, globalThis.location?.href || 'http://localhost/').href
  const mapped = normalized.replace(/assets\/models\/(people|characters\/tex)\/(.*)\.(?:png|jpe?g)$/i, `assets/compact/${size}/$1/$2.webp`)
  return mapped === normalized ? url : mapped
}

const warned = new Set()
function warnFallback(name) {
  if (warned.has(name)) return
  warned.add(name)
  console.warn(`[assets] ${name}: compact asset unavailable; using original`)
}

// Keep the same Texture identity: skin materials can use it before the retry completes.
export class CompactTextureLoader extends THREE.TextureLoader {
  load(url, onLoad, onProgress, onError) {
    const texture = new THREE.Texture(), original = this.manager.resolveURL(url), compact = compactTextureUrl(original)
    const loaded = value => { texture.image = value.image; texture.needsUpdate = true; onLoad?.(texture) }
    const load = (source, failed) => super.load(source, loaded, onProgress, failed)
    load(compact, error => {
      if (compact === original) { onError?.(error); return }
      warnFallback(url)
      load(original, onError)
    })
    return texture
  }
}

async function unpack(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Asset read failed (${response.status}): ${url}`)
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

export async function loadCompactClips(name) {
  try { return decodeAnimationClips(await unpack(`./assets/compact/anim/${name}.anim.gz`)) }
  catch {
    warnFallback(name)
    if (name === 'UAL1_Standard') return (await new GLTFLoader().loadAsync('./assets/models/anim/UAL1_Standard.glb')).animations
    return (await import('./original-people.js')).loadOriginalClips(name)
  }
}

export async function loadCompactGltf(url, resourcePath, manager) {
  try { return await new GLTFLoader(manager).parseAsync(await unpack(url), resourcePath) }
  catch {
    warnFallback(url)
    const name = url.split('/').at(-1).replace(/\.glb\.gz$/, '.gltf')
    return new GLTFLoader(manager).loadAsync(resourcePath + name)
  }
}

export async function loadCompactPerson(name) {
  let scene
  try { scene = await readCompactPerson(name) }
  catch {
    warnFallback(name)
    return (await import('./original-people.js')).loadOriginalPerson(name)
  }
  return scene
}

async function readCompactPerson(name) {
  const { scene } = await new GLTFLoader().parseAsync(await unpack(`./assets/compact/people/${name}.glb.gz`), '')
  const textureLoader = new CompactTextureLoader(), pending = [], materials = new Set()
  scene.traverse(o => {
    if (o.userData.compactHeight > 0) scene.userData.compactHeight = o.userData.compactHeight
    if (!o.isMesh) return
    // The existing garment solver selects the original body name and material group.
    if (o.name === 'f201_hipoly_81_bones_opacity' && !o.geometry.groups.length) o.geometry.addGroup(0, o.geometry.index?.count || o.geometry.attributes.position.count, 0)
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material)
  })
  for (const material of materials) if (material.userData.sourceMap) pending.push((async () => {
    const map = await textureLoader.loadAsync(`./assets/models/people/${name}/${material.userData.sourceMap}`)
    const t = material.userData.texture
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4
    map.flipY = t.flipY; map.offset.fromArray(t.offset); map.repeat.fromArray(t.repeat); map.rotation = t.rotation; map.wrapS = t.wrapS; map.wrapT = t.wrapT
    material.map = map; material.needsUpdate = true
  })())
  await Promise.all(pending)
  if (!(scene.userData.compactHeight > 0)) throw new Error(`Missing certified avatar height: ${name}`)
  return scene
}
