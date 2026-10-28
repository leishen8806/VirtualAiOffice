import { r1ToWorld } from '../office-r1-layout.js'
import { createOfficePottedFoliage } from './plants.js'
import { createSampleBatch } from './batch.js'

export function buildR1Plants({ THREE, root, layout, A, quality, low = false, collision }) {
  if (layout?.r1Phase !== 'R1' || !A?.furn?.pottedPlant) return { dispose() {} }
  const foliage = createOfficePottedFoliage(THREE, A.furn.pottedPlant, quality ? quality.tier === 'low' : low)
  if (!foliage.enabled) throw new Error('R1 requires the registered pottedPlant foliage asset')
  const group = new THREE.Group(); group.name = 'r1-plants'; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), parts = { pot: [], crown: [] }, boxes = { pot: new THREE.Box3(), crown: new THREE.Box3() }
  foliage.source.updateWorldMatrix(true, true)
  foliage.source.traverse(mesh => {
    if (!mesh.isMesh) return
    const kind = mesh.material.name === 'plant' ? 'crown' : 'pot'
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geometry.computeBoundingBox()
    boxes[kind].union(geometry.boundingBox); parts[kind].push({ geometry, color: mesh.material.color?.clone() || new THREE.Color('#e6dfd2') })
  })
  const plants = layout.r1.elements.filter(row => row.category === '植物总成' && row.regionId !== '14' && row.id !== '07-PL-001')
  const proxies = [], records = [], proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const plant of plants) {
    const p = r1ToWorld(plant.xM, plant.yM), children = Object.fromEntries(['POT', 'TR', 'CR'].map(suffix => [suffix, layout.r1.elements.find(row => row.id === `${plant.id}-${suffix}`)]))
    const record = { id: plant.id, position: p, parts: {} }
    for (const [kind, suffix] of [['pot', 'POT'], ['crown', 'CR']]) {
      const row = children[suffix], box = boxes[kind], size = box.getSize(new THREE.Vector3()), middle = box.getCenter(new THREE.Vector3())
      const scale = new THREE.Vector3(row.lengthM / size.x, row.heightM / size.y, row.widthM / size.z)
      const transform = new THREE.Matrix4().makeScale(...scale.toArray()); transform.setPosition(p.x - middle.x * scale.x, row.zM - box.min.y * scale.y, p.z - middle.z * scale.z)
      const bounds = new THREE.Box3(), vertices = [], startVertex = batch.triangles() * 3
      for (const source of parts[kind]) {
        const g = source.geometry.clone().applyMatrix4(transform); g.computeBoundingBox(); bounds.union(g.boundingBox)
        if (kind === 'crown') vertices.push(...g.attributes.position.array)
        batch.add(g, source.color, [0, 0, 0], 0, .88)
      }
      record.parts[suffix] = { id: row.id, bounds, vertices, startVertex, count: batch.triangles() * 3 - startVertex }
    }
    const trunk = children.TR, trunkGeometry = new THREE.CylinderGeometry(trunk.lengthM / 2, trunk.widthM / 2, trunk.heightM, 8)
    batch.add(trunkGeometry, '#756857', [p.x, trunk.zM + trunk.heightM / 2, p.z])
    record.parts.TR = { id: trunk.id, base: trunk.zM, height: trunk.heightM, diameter: trunk.lengthM }
    const pot = children.POT, proxy = new THREE.Mesh(new THREE.CylinderGeometry(pot.lengthM / 2, pot.widthM / 2, pot.heightM, 24), proxyMaterial)
    proxy.position.set(p.x, pot.zM + pot.heightM / 2, p.z); proxy.userData = { collisionProxy: true, r1Id: pot.id }; proxy.name = pot.id
    collision?.add(proxy, pot.id); proxies.push(proxy); records.push(record)
  }
  Object.values(parts).flat().forEach(part => part.geometry.dispose()); foliage.dispose()
  const built = batch.build(group, 'r1-indoor-plants'); built.mesh.material.side = THREE.DoubleSide
  built.mesh.userData.itemIds = records.map(row => row.id)
  root.add(group); let disposed = false
  return { root: group, records, proxies, dispose() { if (disposed) return; disposed = true; proxies.forEach(proxy => { collision?.remove?.(proxy); proxy.geometry.dispose() }); proxyMaterial.dispose(); built.dispose(); group.removeFromParent() } }
}
