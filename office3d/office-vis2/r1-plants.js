import { buildR1DenseGarden } from './r1-dense-garden.js'
import { r1ToWorld } from '../office-r1-layout.js'
import { createOfficePottedFoliage } from './plants.js'
import { createSampleBatch } from './batch.js'
import { r1LookPlantElements } from './r1-look.js'

// 裁定 D（dispatch/OFFICE-R1-I6B-20261028/裁定-绿植外形-R2.md）：登记冠包络、盆尺寸与总高都不动，
// 只在包络内加密叶片。外层正好顶到登记冠包络；内层复用同一叶源，缩到 CROWN_FILL 并绕竖轴转过一个
// 角度后在包络内居中，把源模型稀疏的叶片填实。低档只保留外层，不增加面数。
// 比例取 .92（Q-V1 2026-10-29 裁决，裁定 D 的「或等效做法」内）：.72 的同心副本几乎整层藏在外层
// 叶片与树干后面，椅子视角只多 6.7 % 叶片像素；.92 同样满足全部硬约束且面数增量不变。
const CROWN_FILL = .92

function buildPlantSet({ THREE, root, layout, A, quality, low = false, collision, elements = layout?.r1?.elements, name = 'r1-plants' }) {
  if (layout?.r1Phase !== 'R1' || !A?.furn?.pottedPlant) return { dispose() {} }
  const lowTier = quality ? quality.tier === 'low' : low
  const foliage = createOfficePottedFoliage(THREE, A.furn.pottedPlant, lowTier)
  if (!foliage.enabled) throw new Error('R1 requires the registered pottedPlant foliage asset')
  const group = new THREE.Group(); group.name = name; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), parts = { pot: [], crown: [] }, boxes = { pot: new THREE.Box3(), crown: new THREE.Box3() }
  foliage.source.updateWorldMatrix(true, true)
  foliage.source.traverse(mesh => {
    if (!mesh.isMesh) return
    const kind = mesh.material.name === 'plant' ? 'crown' : 'pot'
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geometry.computeBoundingBox()
    boxes[kind].union(geometry.boundingBox); parts[kind].push({ geometry, color: mesh.material.color?.clone() || new THREE.Color('#e6dfd2') })
  })
  const plants = elements.filter(row => row.category === '植物总成' && row.regionId !== '14' && row.id !== '07-PL-001')
  const proxies = [], records = [], proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const [index, plant] of plants.entries()) {
    const p = r1ToWorld(plant.xM, plant.yM), children = Object.fromEntries(['POT', 'TR', 'CR'].map(suffix => [suffix, elements.find(row => row.id === `${plant.id}-${suffix}`)]))
    const record = { id: plant.id, position: p, parts: {} }
    for (const [kind, suffix] of [['pot', 'POT'], ['crown', 'CR']]) {
      const row = children[suffix]
      const specs = kind === 'crown' && !lowTier ? [{ shrink: 1, yaw: 0 }, { shrink: CROWN_FILL, yaw: .7 + index * .37 }] : [{ shrink: 1, yaw: 0 }]
      const bounds = new THREE.Box3(), vertices = [], startVertex = batch.triangles() * 3, layers = []
      for (const spec of specs) {
        // 先转过角度并量出真实包围盒，再贴合登记包络、整体缩到 shrink 并居中，
        // 内层的包围盒因此正好是登记包络的 shrink 倍，必然落在外层包络之内。
        const rotation = spec.yaw ? new THREE.Matrix4().makeRotationY(spec.yaw) : null, turned = new THREE.Box3()
        const geometries = parts[kind].map(source => {
          const g = source.geometry.clone(); if (rotation) g.applyMatrix4(rotation)
          g.computeBoundingBox(); turned.union(g.boundingBox)
          return { geometry: g, color: source.color }
        })
        const size = turned.getSize(new THREE.Vector3()), middle = turned.getCenter(new THREE.Vector3())
        const scale = new THREE.Vector3(row.lengthM / size.x, row.heightM / size.y, row.widthM / size.z).multiplyScalar(spec.shrink)
        const transform = new THREE.Matrix4().makeScale(...scale.toArray())
        transform.setPosition(p.x - middle.x * scale.x, row.zM + row.heightM * (1 - spec.shrink) / 2 - turned.min.y * scale.y, p.z - middle.z * scale.z)
        const layerBounds = new THREE.Box3(), layerVertices = [], layerStart = batch.triangles() * 3
        for (const { geometry, color } of geometries) {
          geometry.applyMatrix4(transform); geometry.computeBoundingBox(); layerBounds.union(geometry.boundingBox)
          if (kind === 'crown') layerVertices.push(...geometry.attributes.position.array)
          batch.add(geometry, color, [0, 0, 0], 0, .88)
        }
        bounds.union(layerBounds); vertices.push(...layerVertices)
        layers.push({ shrink: spec.shrink, yaw: spec.yaw, bounds: layerBounds, vertices: layerVertices, triangles: (batch.triangles() * 3 - layerStart) / 3 })
      }
      record.parts[suffix] = { id: row.id, bounds, vertices, startVertex, count: batch.triangles() * 3 - startVertex, layers }
    }
    const trunk = children.TR, trunkGeometry = new THREE.CylinderGeometry(trunk.lengthM / 2, trunk.widthM / 2, trunk.heightM, 8)
    batch.add(trunkGeometry, '#756857', [p.x, trunk.zM + trunk.heightM / 2, p.z])
    record.parts.TR = { id: trunk.id, base: trunk.zM, height: trunk.heightM, diameter: trunk.lengthM }
    const pot = children.POT, proxy = new THREE.Mesh(new THREE.CylinderGeometry(pot.lengthM / 2, pot.widthM / 2, pot.heightM, 24), proxyMaterial)
    proxy.position.set(p.x, pot.zM + pot.heightM / 2, p.z); proxy.userData = { collisionProxy: true, r1Id: pot.id }; proxy.name = pot.id
    collision?.add(proxy, pot.id); proxies.push(proxy); records.push(record)
  }
  Object.values(parts).flat().forEach(part => part.geometry.dispose()); foliage.dispose()
  const built = batch.build(group, name === 'r1-plants' ? 'r1-indoor-plants' : name + '-surfaces'); built.mesh.material.side = THREE.DoubleSide
  built.mesh.userData.itemIds = records.map(row => row.id)
  root.add(group); let disposed = false
  return { root: group, records, proxies, dispose() { if (disposed) return; disposed = true; proxies.forEach(proxy => { collision?.remove?.(proxy); proxy.geometry.dispose() }); proxyMaterial.dispose(); built.dispose(); group.removeFromParent() } }
}

export function buildR1Plants(context) {
  const registered = buildPlantSet(context)
  if (!registered.root) return registered
  let look, dense
  try { look = buildPlantSet({ ...context, elements: r1LookPlantElements(), name: 'r1-look-plants' }); dense = buildR1DenseGarden(context) }
  catch (error) { registered.dispose(); look?.dispose(); throw error }
  return { ...registered, look, dense, onFrame() { dense.onFrame() }, dispose() { registered.dispose(); look.dispose(); dense.dispose() } }
}
