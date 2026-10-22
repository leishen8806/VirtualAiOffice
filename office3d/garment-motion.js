import * as THREE from './vendor/three/three.module.js'
import { createClothSpring } from './cloth-spring.js'

export function createGarmentMotion(model, root, scale) {
  const mesh = model.getObjectByName('f201_hipoly_81_bones_opacity')
  if (!mesh?.isSkinnedMesh) return null
  // 仅修改 body 材质中的躯干衣片，原始 FBX 的 Z 是高度；脸、头发、手和腿不动。
  mesh.geometry = mesh.geometry.clone()
  const g = mesh.geometry, pos = g.attributes.position, normal = g.attributes.normal
  const rest = pos.array.slice(), nodes = [], weights = [], nodeAt = new Map(), vertexNode = new Map(), edges = new Set()
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const group of g.groups) {
    if (materials[group.materialIndex]?.name !== 'f201_body') continue
    for (let n = group.start; n < group.start + group.count; n++) {
      const i = g.index ? g.index.getX(n) : n, z = pos.getZ(i), x = pos.getX(i)
      if (z <= 85 || z >= 132 || Math.abs(x) >= 29) continue
      const key = [pos.getX(i), pos.getY(i), z].map(v => v.toFixed(3)).join(',')
      let node = nodeAt.get(key)
      if (node === undefined) {
        node = nodes.length; nodeAt.set(key, node); nodes.push([])
        weights.push(Math.min(1, (z - 85) / 12, (132 - z) / 12, (29 - Math.abs(x)) / 8))
      }
      nodes[node].push(i); vertexNode.set(i, node)
    }
  }
  for (let n = 0; n < (g.index ? g.index.count : pos.count); n += 3) {
    const ids = [0, 1, 2].map(j => vertexNode.get(g.index ? g.index.getX(n + j) : n + j))
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3]
      if (a !== undefined && b !== undefined && a !== b) edges.add(`${Math.min(a, b)},${Math.max(a, b)}`)
    }
  }
  const spring = createClothSpring(weights, [...edges].map(e => e.split(',').map(Number)))
  const normals = nodes.map(indices => {
    const n = new THREE.Vector3()
    for (const i of indices) n.add(new THREE.Vector3().fromBufferAttribute(normal, i))
    return n.normalize()
  })
  const previous = root.position.clone(), speed = new THREE.Vector3(), lastSpeed = new THREE.Vector3()
  const force = new THREE.Vector3()
  let maxOffset = 0
  function update(dt) {
    if (!(dt > 0)) { previous.copy(root.position); return }
    speed.subVectors(root.position, previous).divideScalar(dt)
    // 世界平面加速度转为角色局部坐标，再映射到 FBX 的 Z-up 坐标。
    force.subVectors(speed, lastSpeed).multiplyScalar(-0.18 / scale)
    force.applyAxisAngle(new THREE.Vector3(0, 1, 0), -root.rotation.y)
    force.clampLength(0, 65)
    const offset = spring.update(dt, [-force.x, force.z, -3])
    maxOffset = 0
    for (let n = 0; n < nodes.length; n++) {
      let dx = offset[n * 3], dy = offset[n * 3 + 1], dz = offset[n * 3 + 2]
      // 贴身衣片不能被惯性拉进身体：只保留切向与向外位移。
      const normal = normals[n]
      const inward = Math.min(0, dx * normal.x + dy * normal.y + dz * normal.z)
      dx -= inward * normal.x; dy -= inward * normal.y; dz -= inward * normal.z
      for (const i of nodes[n]) pos.setXYZ(i, rest[i * 3] + dx, rest[i * 3 + 1] + dy, rest[i * 3 + 2] + dz)
      maxOffset = Math.max(maxOffset, Math.hypot(dx, dy, dz) * scale)
    }
    pos.needsUpdate = true
    previous.copy(root.position); lastSpeed.copy(speed)
  }
  return { update, stats: () => ({ nodes: nodes.length, edges: edges.size, maxOffsetMeters: maxOffset, selfCollision: false }) }
}
