// 静态网格合并：场景里约 2000 个小网格，每帧 ~3000 次绘制（高画质 ~6000 次）是卡顿主因。
// 把「不会动、不透明、同材质、同一片区域」的网格烘焙成一个网格，绘制次数降到几百。
// 材质对象仍然共用，所以按时间改颜色 / 发光强度（夜间窗户、路灯）照样生效。
// 不合并：人物（及其身上的东西）、蒙皮/变形/实例化网格、透明材质、多材质、标了 userData.dynamic 的、
//         以及在试运行里位置变过的（例如随风摆的树冠）。
import * as THREE from 'three'

const CELL = 24 // 米：按 24×24 米分块，保留视锥剔除的效果

function signature(g) {
  return Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}`).join(',')
}

export function snapshot(scene) {
  const m = new Map()
  scene.updateMatrixWorld(true)
  scene.traverse((o) => { if (o.isMesh) m.set(o, o.matrixWorld.clone()) })
  return m
}

export function mergeStatic(scene, before) {
  scene.updateMatrixWorld(true)
  const buckets = new Map()
  const skipUnder = (o) => { for (let p = o; p; p = p.parent) { if (p.userData.agentId || p.userData.dynamic || p.userData.noMerge || p.userData.collisionProxy || !p.visible) return true } return false }
  const box = new THREE.Box3(), c = new THREE.Vector3()
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.morphTargetInfluences) return
    const mat = o.material
    if (!mat || Array.isArray(mat) || mat.transparent || mat.isShaderMaterial) return // 单材质时几何体的 groups（如 BoxGeometry 的 6 个面）渲染器本来就不用
    if (o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return
    if (!o.geometry.attributes.position || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return
    if (skipUnder(o)) return
    const was = before && before.get(o)
    if (before && (!was || !was.equals(o.matrixWorld))) return // 试运行里动过（或之后才加进来的）
    box.setFromObject(o).getCenter(c)
    const far = c.length() > 150
    const cell = far ? `F${Math.round(Math.atan2(c.z, c.x) * 4)}` : `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`
    const key = [mat.uuid, signature(o.geometry), o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask, o.frustumCulled, cell].join('|')
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(o)
  })

  let removed = 0, added = 0
  const holder = new THREE.Group()
  holder.name = 'merged-static'
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    const merged = bake(list)
    if (!merged) continue
    const src = list[0]
    const mesh = new THREE.Mesh(merged, src.material)
    mesh.castShadow = src.castShadow
    mesh.receiveShadow = src.receiveShadow
    mesh.renderOrder = src.renderOrder
    mesh.layers.mask = src.layers.mask
    mesh.frustumCulled = src.frustumCulled
    mesh.matrixAutoUpdate = false
    holder.add(mesh)
    for (const o of list) o.removeFromParent()
    removed += list.length
    added++
  }
  holder.matrixAutoUpdate = false
  scene.add(holder)
  // 被合并掉的原始几何体如果没有别的网格在用，释放掉显存（否则显存翻倍）
  const used = new Set()
  scene.traverse((o) => { if (o.geometry) used.add(o.geometry) })
  const freed = new Set()
  for (const list of buckets.values()) for (const o of list) if (!o.parent && !used.has(o.geometry) && !freed.has(o.geometry)) { freed.add(o.geometry); o.geometry.dispose() }
  // 删掉合并后变空的分组（没有子节点、自身不是网格/灯光的）
  const empties = []
  scene.traverse((o) => { if (o.type === 'Group' && o !== holder && o.children.length === 0) empties.push(o) })
  for (const e of empties) e.removeFromParent()
  return { removed, added }
}

function bake(list) {
  const names = Object.keys(list[0].geometry.attributes)
  let vCount = 0, iCount = 0
  const parts = list.map((o) => {
    const g = o.geometry.clone()
    g.applyMatrix4(o.matrixWorld)
    const n = g.attributes.position.count
    let idx = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i)
    if (o.matrixWorld.determinant() < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t } // 镜像缩放要翻转绕序
    vCount += n
    iCount += idx.length
    return { g, n, idx }
  })
  const out = new THREE.BufferGeometry()
  for (const k of names) {
    const size = list[0].geometry.attributes[k].itemSize
    const arr = new Float32Array(vCount * size)
    let off = 0
    for (const { g, n } of parts) {
      const a = g.attributes[k]
      for (let i = 0; i < n; i++) for (let s = 0; s < size; s++) arr[(off + i) * size + s] = a.getComponent(i, s)
      off += n
    }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size))
  }
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount)
  let vo = 0, io = 0
  for (const { n, idx, g } of parts) {
    for (let i = 0; i < idx.length; i++) index[io + i] = idx[i] + vo
    io += idx.length
    vo += n
    g.dispose()
  }
  out.setIndex(new THREE.BufferAttribute(index, 1))
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}
