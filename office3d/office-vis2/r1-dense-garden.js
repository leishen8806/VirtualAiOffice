import { createSampleBatch } from './batch.js'
import { createOfficePottedFoliage, appendOfficeGardenBed } from './plants.js'
import { R1_LANDSCAPE } from './r1-landscape-plan.js'
import { r1LookPlantPositions } from './r1-look.js'

export function r1DensePlan(layout, low = false) {
  if (!low) return R1_LANDSCAPE
  const base = zone => layout.r1.elements.filter(p => p.category === '植物总成' && p.regionId === zone).length + r1LookPlantPositions.filter(p => p[1] === zone).length
  const plants = []
  for (const zone of layout.regions.map(z => z.id)) {
    const rows = R1_LANDSCAPE.plants.filter(p => p.zone === zone)
    if (!rows.length) continue
    const count = Math.max(0, Math.ceil((base(zone) + rows.length) * .6) - base(zone))
    if (zone === '07') {
      plants.push(...rows.filter(p => p.role === 'passage').slice(0, 5), ...rows.filter(p => p.role === 'sofa-group').slice(0, 10))
    } else plants.push(...rows.slice(0, count))
  }
  return { plants, troughs: R1_LANDSCAPE.troughs.filter((_, i) => i % 5 < 3), gardens: R1_LANDSCAPE.gardens.filter((_, i) => i % 5 < 3) }
}

export function buildR1DenseGarden({ THREE, root, layout, A, collision, quality, low = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-dense-garden'; group.userData.dynamic = true
  const tiers = new Map(), proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  let current, disposed = false
  function build(lowTier) {
    const plan = r1DensePlan(layout, lowTier), host = new THREE.Group(), batch = createSampleBatch(THREE), beds = createSampleBatch(THREE), records = [], proxies = []
    const foliage = createOfficePottedFoliage(THREE, A.furn.pottedPlant, lowTier)
    if (!foliage.enabled) throw new Error('Dense R1 planting requires the existing pottedPlant leaf source')
    const source = { pot: [], crown: [] }, bounds = { pot: new THREE.Box3(), crown: new THREE.Box3() }
    foliage.source.updateWorldMatrix(true, true)
    foliage.source.traverse(m => {
      if (!m.isMesh) return
      const kind = m.material.name === 'plant' ? 'crown' : 'pot', geometry = m.geometry.clone().applyMatrix4(m.matrixWorld)
      geometry.computeBoundingBox(); bounds[kind].union(geometry.boundingBox); source[kind].push({ geometry, color: m.material.color })
    })
    const proxy = (row, geometry, y) => {
      const mesh = new THREE.Mesh(geometry, proxyMaterial); mesh.name = row.id
      mesh.position.set(row.x, y, row.z); mesh.userData = { collisionProxy: true, r1Id: row.id }
      proxies.push(mesh); return mesh
    }
    for (const row of plan.plants) {
      const startVertex = batch.triangles() * 3
      const potHeight = row.kind === 'tall' ? .5 : row.kind === 'medium' ? .32 : .15, renderBounds = new THREE.Box3()
      for (const kind of ['pot', 'crown']) {
        const box = bounds[kind], size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3()), meshes = []
        let radial = 1
        for (const part of source[kind]) {
          const geometry = part.geometry.clone(), p = geometry.attributes.position
          for (let i = 0; i < p.count; i++) { const x = (p.getX(i) - center.x) / size.x * 2, z = (p.getZ(i) - center.z) / size.z * 2; radial = Math.max(radial, Math.hypot(x, z)) }
          meshes.push({ ...part, geometry })
        }
        for (const part of meshes) {
          const geometry = part.geometry, radius = row.r * (kind === 'pot' ? .72 : 1), height = kind === 'pot' ? potHeight : row.height - potHeight
          geometry.translate(-center.x, -box.min.y, -center.z); geometry.scale(radius * 2 / size.x / radial, height / size.y, radius * 2 / size.z / radial)
          geometry.translate(row.x, kind === 'pot' ? 0 : potHeight, row.z); geometry.computeBoundingBox(); renderBounds.union(geometry.boundingBox)
          if (kind === 'crown' && row.kind === 'tall' && !lowTier) { const fill = geometry.clone(); fill.translate(-row.x, -potHeight, -row.z); fill.scale(.92, .92, .92); fill.rotateY(Math.PI * .37); fill.translate(row.x, potHeight + (row.height - potHeight) * .04, row.z); batch.add(fill, part.color, [0, 0, 0], 0, .86) }
          batch.add(geometry, kind === 'pot' ? ['#D5C6AE', '#B2A28A', '#C9C4B3'][records.length % 3] : part.color, [0, 0, 0], 0, .86)
        }
      }
      batch.add(new THREE.CylinderGeometry(.026, .04, potHeight + .3, 6), '#756857', [row.x, (potHeight + .3) / 2, row.z])
      proxy(row, new THREE.CylinderGeometry(row.r * .72, row.r * .72, potHeight, 16), potHeight / 2)
      records.push({ ...row, startVertex, vertexCount: batch.triangles() * 3 - startVertex, batch: 'pots', renderHeight: renderBounds.max.y, bounds: renderBounds, potHeight, collision: 'ordinary Mesh' })
    }
    Object.values(source).flat().forEach(p => p.geometry.dispose()); foliage.dispose()
    for (const [index, row] of [...plan.troughs, ...plan.gardens].entries()) {
      const startVertex = beds.triangles() * 3
      const trough = !!row.wall, parts = [], box = new THREE.Box3(), capture = { add(geometry, color, position, yaw = 0, roughness = .85, metalness = 0) {
        geometry.rotateY(yaw); geometry.translate(...position); geometry.computeBoundingBox(); box.union(geometry.boundingBox)
        parts.push({ geometry, color: ['#D5B2AE', '#E7D7AA'].includes(color) ? ['#B94E54', '#D992AE', '#E2C65F', '#F1E8D7'][index % 4] : color, roughness, metalness })
      } }
      appendOfficeGardenBed({ THREE, batch: capture, bed: { x: 0, z: 0, w: Math.max(.9, row.w), d: Math.max(.9, row.d) }, low: lowTier, seed: index + 31, organic: !trough })
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3()), measured = new THREE.Box3()
      let radialScale = 1, area = 0
      if (!trough) {
        let radius = 0
        for (const part of parts) { const p = part.geometry.attributes.position; for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot((p.getX(i) - center.x) * row.w / size.x, (p.getZ(i) - center.z) * row.d / size.z)) }
        radialScale = Math.min(row.w, row.d) / 2 / radius
      }
      for (const part of parts) {
        part.geometry.translate(-center.x, 0, -center.z); part.geometry.scale(row.w / size.x * radialScale, 1, row.d / size.z * radialScale)
        part.geometry.translate(row.x, trough ? .25 : 0, row.z); part.geometry.computeBoundingBox(); measured.union(part.geometry.boundingBox)
        if (!trough && part.color === '#514E36') {
          const g = part.geometry, p = g.attributes.position, idx = g.index
          for (let i = 0; i < (idx?.count ?? p.count); i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2 }
        }
        beds.add(part.geometry, part.color, [0, 0, 0], 0, part.roughness, part.metalness)
      }
      if (trough) { beds.add(new THREE.BoxGeometry(row.w, .35, row.d), '#C5BCA9', [row.x, .175, row.z]); proxy(row, new THREE.BoxGeometry(row.w, .35, row.d), .175) }
      else proxy(row, new THREE.CylinderGeometry(row.w / 2, row.w / 2, .18, 32), .09)
      records.push({ ...row, area, startVertex, vertexCount: beds.triangles() * 3 - startVertex, batch: 'beds', renderHeight: measured.max.y, kind: trough ? 'trough' : 'flowerbed', bounds: measured, collision: 'ordinary Mesh', flowerColor: ['#B94E54', '#D992AE', '#E2C65F', '#F1E8D7'][index % 4] })
    }
    const built = [batch.build(host, 'r1-dense-pots'), beds.build(host, 'r1-dense-beds')]
    built.forEach(b => { b.mesh.material.side = THREE.DoubleSide; b.mesh.userData.itemIds = records.map(r => r.id); b.mesh.castShadow = false })
    host.name = lowTier ? 'r1-dense-low' : 'r1-dense-high'; group.add(host)
    return { root: host, plan, records, proxies, built }
  }
  function onFrame() {
    const tier = quality ? quality.tier === 'low' : low
    if (current?.tier === tier || disposed) return
    if (!tiers.has(tier)) tiers.set(tier, { ...build(tier), tier })
    if (current) { current.root.visible = false; current.proxies.forEach(p => collision?.remove?.(p)) }
    current = tiers.get(tier); current.root.visible = true; current.proxies.forEach(p => collision?.add(p, 'r1-landscape'))
  }
  root.add(group); onFrame()
  return { root: group, get records() { return current.records }, get plan() { return current.plan }, get proxies() { return current.proxies }, onFrame,
    dispose() { if (disposed) return; disposed = true; current.proxies.forEach(p => collision?.remove?.(p)); tiers.forEach(t => { t.proxies.forEach(p => p.geometry.dispose()); t.built.forEach(b => b.dispose()) }); proxyMaterial.dispose(); group.removeFromParent() } }
}

