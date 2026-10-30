import * as THREE from 'three'
import { FBXLoader } from '/office3d/vendor/three/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from '/office3d/vendor/three/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from './vendor/exporters/GLTFExporter.js'
import { encodeAnimationClips, decodeAnimationClips } from '/office3d/compact-animation.js'

const keepMorph = /(EyeBlinkLeft|EyeBlinkRight|AK_25_JawOpen|VI_10_aa|VI_13_O|VI_11_E|MouthSmileLeft|MouthSmileRight|MouthFrownLeft|MouthFrownRight|BrowDownLeft|BrowDownRight|BrowInnerUp)$/
const blank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAZWr9nwAAAABJRU5ErkJggg=='
function base64(buffer) {
  const bytes = new Uint8Array(buffer), chunks = []
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  return btoa(chunks.join(''))
}
function reduceTrack(source) {
  const track = source.clone(), count = source.times.length, size = source.getValueSize(), keep = new Set([0, count - 1]), stack = [[0, count - 1]], q = new Float32Array(4)
  const tolerance = source.ValueTypeName === 'quaternion' ? 5e-6 : 1e-5
  while (stack.length) {
    const [start, end] = stack.pop(); let worst = tolerance, index = -1
    for (let i = start + 1; i < end; i++) {
      const t = (source.times[i] - source.times[start]) / (source.times[end] - source.times[start])
      if (size === 4) THREE.Quaternion.slerpFlat(q, 0, source.values, start * 4, source.values, end * 4, t)
      let error = 0
      for (let k = 0; k < size; k++) error = Math.max(error, Math.abs(source.values[i * size + k] - (size === 4 ? q[k] : source.values[start * size + k] * (1 - t) + source.values[end * size + k] * t)))
      if (error > worst) { worst = error; index = i }
    }
    if (index >= 0) { keep.add(index); stack.push([start, index], [index, end]) }
  }
  const indices = [...keep].sort((a, b) => a - b)
  track.times = new Float32Array(indices.map(i => source.times[i])); track.values = new Float32Array(indices.flatMap(i => Array.from(source.values.slice(i * size, (i + 1) * size))))
  return track
}
export async function animation(file, cartoon = false) {
  const manager = new THREE.LoadingManager(); manager.setURLModifier(url => /\.(tga|png|jpg)$/i.test(url) ? blank : url)
  const source = cartoon ? await new GLTFLoader(manager).loadAsync(file) : await new FBXLoader(manager).loadAsync(file)
  const used = new Set(['Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Walk_Formal_Loop'])
  const clips = source.animations.filter(c => !cartoon || used.has(c.name)).map(c => {
    c.tracks = c.tracks.filter(t => cartoon ? !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis.')) : (t.name.endsWith('.quaternion') && !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name)) || t.name === 'Bip01.position')
    return c
  })
  const reduced = clips.map(c => new THREE.AnimationClip(c.name, c.duration, c.tracks.map(reduceTrack), c.blendMode))
  const binary = encodeAnimationClips(reduced, { quantize: true }), decoded = decodeAnimationClips(binary)
  let samples = 0, maxError = 0
  clips.forEach((c, i) => c.tracks.forEach((track, j) => {
    const copy = decoded[i].tracks[j]
    if (track.name !== copy.name || track.getInterpolation() !== copy.getInterpolation()) throw Error('Track identity changed')
    const a = track.createInterpolant(), b = copy.createInterpolant()
    const phases = [...track.times]; for (let t = 0; t <= c.duration; t += 1 / 120) phases.push(t)
    for (const t of phases) {
      const av = a.evaluate(t), bv = b.evaluate(t); samples++
      for (let k = 0; k < av.length; k++) {
        const error = Math.abs(av[k] - bv[k]); maxError = Math.max(maxError, error)
        if (error > (track.ValueTypeName === 'quaternion' ? 1e-5 : 2e-5)) throw Error(`Curve error ${error} at ${track.name}/${t}`)
      }
    }
  }))
  return { binary: base64(binary), proof: { clips: clips.length, tracks: clips.reduce((n, c) => n + c.tracks.length, 0), samples, maxError } }
}

export async function model(file) {
  const folder = file.slice(0, file.lastIndexOf('/') + 1)
  const manager = new THREE.LoadingManager(); manager.setURLModifier(url => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop())
    if (/_(normal|specular)\.tga$/i.test(name)) return blank
    return /\.tga$/i.test(name) ? folder + name.replace(/\.tga$/i, /opacity/i.test(name) ? '.png' : '.jpg') : url
  })
  const ready = new Promise(resolve => { manager.onLoad = resolve })
  const root = await new FBXLoader(manager).loadAsync(file), lights = []
  await ready
  root.traverse(o => {
    if (o.isLight || o.isCamera) lights.push(o)
    if (!o.isMesh) return
    if (o.isSkinnedMesh) o.normalizeSkinWeights()
    if (o.morphTargetDictionary) {
      const positions = o.geometry.morphAttributes.position || [], keep = Object.entries(o.morphTargetDictionary).filter(([n]) => keepMorph.test(n)).sort((a, b) => a[1] - b[1])
      o.geometry.morphAttributes = keep.length ? { position: keep.map(([, i]) => positions[i]) } : {}
      o.morphTargetDictionary = Object.fromEntries(keep.map(([n], i) => [n, i])); o.morphTargetInfluences = keep.map(() => 0)
    }
    const convert = m => {
      const map = m.map, sourceMap = map?.image?.src ? decodeURIComponent(new URL(map.image.src).pathname.split('/').pop()) : ''
      if (map && !/\.(png|jpg)$/i.test(sourceMap)) throw Error(`Missing texture provenance for ${m.name}`)
      return new THREE.MeshStandardMaterial({ name: m.name, color: 0xffffff, roughness: /opacity/i.test(m.name) ? .6 : .72, metalness: 0, alphaTest: /opacity/i.test(m.name) ? .45 : 0, side: /opacity/i.test(m.name) ? THREE.DoubleSide : THREE.FrontSide, userData: { sourceMap, texture: map ? { flipY: map.flipY, offset: map.offset.toArray(), repeat: map.repeat.toArray(), rotation: map.rotation, wrapS: map.wrapS, wrapT: map.wrapT } : null } })
    }
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material)
  })
  lights.forEach(o => o.removeFromParent()); root.animations = []; root.updateMatrixWorld(true)
  const originalBox = new THREE.Box3().setFromObject(root)
  root.userData.compactHeight = originalBox.max.y - originalBox.min.y
  // glTF splits material groups into meshes. Trim each group first so it does not
  // duplicate the complete body's morph arrays and pelvis work for every material.
  const split = []; root.traverse(o => { if (o.isMesh && Array.isArray(o.material)) split.push(o) })
  let part = 0
  for (const original of split) {
    const source = original.geometry
    const groups = new Map()
    for (const group of source.groups) {
      if (!groups.has(group.materialIndex)) groups.set(group.materialIndex, [])
      groups.get(group.materialIndex).push(...Array.from({ length: group.count }, (_, i) => source.index ? source.index.getX(group.start + i) : group.start + i))
    }
    for (const [materialIndex, allIndices] of groups) {
      const attributes = [...Object.values(source.attributes), ...Object.values(source.morphAttributes).flat()], unique = new Map(), indices = [], triangles = []
      for (const vertex of allIndices) {
        const key = attributes.map(a => Array.from(a.array.subarray(vertex * a.itemSize, (vertex + 1) * a.itemSize)).join(',')).join('|')
        if (!unique.has(key)) { unique.set(key, indices.length); indices.push(vertex) }
        triangles.push(unique.get(key))
      }
      const geometry = new THREE.BufferGeometry(), subset = attr => {
        const array = new attr.array.constructor(indices.length * attr.itemSize)
        indices.forEach((v, i) => { for (let k = 0; k < attr.itemSize; k++) array[i * attr.itemSize + k] = attr.array[v * attr.itemSize + k] })
        return new THREE.BufferAttribute(array, attr.itemSize, attr.normalized)
      }
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, subset(attribute))
      for (const [name, attributes] of Object.entries(source.morphAttributes)) geometry.morphAttributes[name] = attributes.map(subset)
      geometry.morphTargetsRelative = source.morphTargetsRelative
      geometry.setIndex(triangles)
      const mesh = original.isSkinnedMesh ? new THREE.SkinnedMesh(geometry, original.material[materialIndex]) : new THREE.Mesh(geometry, original.material[materialIndex])
      mesh.name = mesh.material.name === 'f201_body' ? original.name : `RocketboxPart_${part++}`
      mesh.userData.sourceMesh = original.name
      mesh.position.copy(original.position); mesh.quaternion.copy(original.quaternion); mesh.scale.copy(original.scale)
      if (original.morphTargetDictionary) { mesh.morphTargetDictionary = { ...original.morphTargetDictionary }; mesh.morphTargetInfluences = [...original.morphTargetInfluences] }
      original.parent.add(mesh)
      if (original.isSkinnedMesh) mesh.bind(original.skeleton, original.bindMatrix)
    }
    original.removeFromParent()
  }
  root.updateMatrixWorld(true)
  const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false })
  const reloaded = (await new GLTFLoader().parseAsync(binary, '')).scene
  const originalBones = [], loadedBones = []
  root.traverse(o => { if (o.isBone) originalBones.push(o.name) }); reloaded.traverse(o => { if (originalBones.includes(o.name)) loadedBones.push(o.name) })
  // glTF root Bip01 is an animated transform, not a skin joint; its name and transform remain intact.
  if (JSON.stringify(originalBones.sort()) !== JSON.stringify(loadedBones.sort())) throw Error('Bone transform names changed')
  const box = new THREE.Box3().setFromObject(root), copyBox = new THREE.Box3().setFromObject(reloaded)
  const error = Math.max(box.min.distanceTo(copyBox.min), box.max.distanceTo(copyBox.max))
  if (error > .01) throw Error(`Model bounds changed ${error}`)
  let vertexError = 0, vertices = 0, morphs = 0
  root.traverse(o => {
    if (!o.isSkinnedMesh) return
    const other = reloaded.getObjectByName(o.name)
    if (!other?.isSkinnedMesh || JSON.stringify(o.morphTargetDictionary) !== JSON.stringify(other.morphTargetDictionary)) throw Error(`Skin or morph identity changed: ${o.name}`)
    const a = new THREE.Vector3(), b = new THREE.Vector3()
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, a).applyMatrix4(o.matrixWorld); other.getVertexPosition(i, b).applyMatrix4(other.matrixWorld)
      vertexError = Math.max(vertexError, a.distanceTo(b)); vertices++
    }
    morphs += Object.keys(o.morphTargetDictionary || {}).length
  })
  if (vertexError > .01) throw Error(`Skin vertex changed ${vertexError}`)
  return { binary: base64(binary), proof: { bones: originalBones.length, boundsError: error, vertexErrorSourceUnits: vertexError, vertices, morphs, height: root.userData.compactHeight, bytes: binary.byteLength } }
}
