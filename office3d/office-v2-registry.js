const dynamic = object => {
  for (let node = object; node; node = node.parent) if (!node.visible || node.userData.dynamic || node.userData.agentId) return true
  return false
}

export function mergeOfficeStatic(THREE, root, batchPrefix = 'office2') {
  root.updateWorldMatrix(true, true)
  const local = root.matrixWorld.clone().invert(), groups = new Map(), generated = []
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.morphTargetInfluences || dynamic(mesh)) return
    if (!mesh.geometry?.attributes.position || Array.isArray(mesh.material) || mesh.material?.isShaderMaterial) return
    if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.instanceColor) return
    const attributes = Object.entries(mesh.geometry.attributes)
    if (attributes.some(([, attr]) => attr.isInstancedBufferAttribute || attr.isInterleavedBufferAttribute) || Object.keys(mesh.geometry.morphAttributes).length) return
    const shape = attributes.map(([name, attr]) => `${name}:${attr.itemSize}:${attr.array.constructor.name}:${attr.normalized}`).sort().join('|')
    const key = [mesh.material.uuid, shape, mesh.castShadow, mesh.receiveShadow, mesh.frustumCulled, mesh.renderOrder, mesh.layers.mask].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(mesh)
  })
  let removed = 0
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const pieces = []
    for (const mesh of list) {
      const instances = mesh.isInstancedMesh ? mesh.count : 1
      for (let index = 0; index < instances; index++) {
        const matrix = local.clone().multiply(mesh.matrixWorld)
        if (mesh.isInstancedMesh) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(index, instance); matrix.multiply(instance) }
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
        geometry.applyMatrix4(matrix)
        if (matrix.determinant() < 0) for (const attr of Object.values(geometry.attributes)) {
          for (let v = 0; v < attr.count; v += 3) for (let axis = 0; axis < attr.itemSize; axis++) {
            const a = (v + 1) * attr.itemSize + axis, b = (v + 2) * attr.itemSize + axis
            const value = attr.array[a]; attr.array[a] = attr.array[b]; attr.array[b] = value
          }
        }
        pieces.push(geometry)
      }
    }
    const geometry = new THREE.BufferGeometry()
    for (const [name, attr] of Object.entries(pieces[0].attributes)) {
      const values = new attr.array.constructor(pieces.reduce((n, p) => n + p.attributes[name].array.length, 0)); let offset = 0
      for (const piece of pieces) { values.set(piece.attributes[name].array, offset); offset += piece.attributes[name].array.length }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize, attr.normalized))
    }
    pieces.forEach(piece => piece.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const source = list[0], batch = new THREE.Mesh(geometry, source.material)
    batch.name = `${batchPrefix}-merged-batch-${generated.length + 1}`; batch.castShadow = source.castShadow; batch.receiveShadow = source.receiveShadow
    batch.layers.mask = source.layers.mask; batch.renderOrder = source.renderOrder; batch.userData.qualityProxy = true
    batch.frustumCulled = source.frustumCulled
    root.add(batch); generated.push(batch)
    for (const mesh of list) { mesh.removeFromParent(); removed++ }
  }
  return { removed, added: generated.length, dispose() { generated.forEach(mesh => { mesh.removeFromParent(); mesh.geometry.dispose() }) } }
}

export function createOfficeV2Registry({ THREE, scene, quality, layout, rootName = 'office2-root', batchPrefix = 'office2' }) {
  const root = new THREE.Group(); root.name = rootName
  const modules = new Map(), built = new Map(), skipped = []
  let merged = { removed: 0, added: 0 }, builtOnce = false
  let frameHook = null, previousFrame = null, sourceNow = null, lastFrame = null, animationMs = 0
  const stopped = new Set(), bounds = new THREE.Box3(), frustum = new THREE.Frustum(), projection = new THREE.Matrix4()
  const resetFrame = () => { lastFrame = null }
  const onFrame = (dt, { camera } = {}) => {
    if (globalThis.document?.hidden || !root.visible) { resetFrame(); return }
    for (let parent = root.parent; parent; parent = parent.parent) if (!parent.visible) { resetFrame(); return }
    if (camera) {
      root.updateWorldMatrix(true, true)
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      if (!frustum.intersectsBox(bounds.setFromObject(root))) { resetFrame(); return }
    }
    const delta = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0
    animationMs += delta * 1000
    for (const [name, value] of built) if (!stopped.has(name) && value.onFrame) {
      try { value.onFrame(delta, { camera, now: animationMs }) }
      catch (error) {
        stopped.add(name); const message = String(error?.message || error)
        skipped.push({ name, error: `onFrame: ${message}` }); console.warn(`[office-v2:${name}] 已停用更新：${message}`)
      }
    }
  }
  const get = name => built.get(name)
  const register = (name, factory) => { modules.set(name, factory); return root }
  const buildAll = (shared = {}) => {
    if (builtOnce) return root
    builtOnce = true; scene.add(root)
    sourceNow = shared.now || (() => 0); animationMs = sourceNow()
    for (const [name, factory] of modules) {
      const mount = new THREE.Group(); mount.name = `${batchPrefix}-${name}-root`; root.add(mount)
      const pending = [], collision = shared.collision && { ...shared.collision, add: (...args) => pending.push(args) }
      const sceneBefore = new Map(scene.children.map(child => [child, child.visible]))
      try {
        const value = factory({ ...shared, THREE, root: mount, scene, layout, quality, low: quality?.tier === 'low', collision, get, now: () => animationMs }) || {}
        let part = 0
        mount.traverse(object => { if (object !== mount && !object.name.startsWith(`${batchPrefix}-${name}-`)) object.name = `${batchPrefix}-${name}-${object.name.replace(/^office2-/, '').replace(/^office3-/, '') || `part-${part++}`}` })
        built.set(name, value)
        for (const args of pending) shared.collision.add(...args)
      } catch (error) {
        const message = String(error?.message || error)
        mount.removeFromParent(); skipped.push({ name, error: message })
        for (const child of [...scene.children]) if (!sceneBefore.has(child)) child.removeFromParent()
        for (const [child, visible] of sceneBefore) child.visible = visible
        console.warn(`[office-v2:${name}] 已跳过：${message}`)
      }
    }
    merged = mergeOfficeStatic(THREE, root, batchPrefix)
    if ([...built.values()].some(value => value.onFrame)) {
      previousFrame = scene.onBeforeRender
      frameHook = function (renderer, currentScene, camera, ...args) {
        previousFrame?.call(this, renderer, currentScene, camera, ...args)
        const stamp = sourceNow(), dt = lastFrame === null ? 0 : (stamp - lastFrame) / 1000
        lastFrame = stamp; onFrame(dt, { camera })
      }
      scene.onBeforeRender = frameHook
      globalThis.document?.addEventListener?.('visibilitychange', resetFrame)
    }
    return root
  }
  const dispose = () => {
    if (frameHook && scene.onBeforeRender === frameHook) scene.onBeforeRender = previousFrame
    globalThis.document?.removeEventListener?.('visibilitychange', resetFrame)
    merged.dispose?.()
    for (const [name, value] of [...built].reverse()) {
      try { value.dispose?.() }
      catch (error) { const message = String(error?.message || error); skipped.push({ name, error: `dispose: ${message}` }); console.warn(`[office-v2:${name}] 清理失败：${message}`) }
    }
    built.clear(); root.removeFromParent()
    if (scene.userData.officeV2?.root === root) delete scene.userData.officeV2
  }
  const summary = () => ({ modules: [...built.keys()], skipped: [...skipped], quality: quality?.tier || null, merged: { removed: merged.removed, added: merged.added } })
  return { root, register, buildAll, dispose, summary, get, onFrame }
}
