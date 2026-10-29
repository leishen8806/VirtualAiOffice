import { createSampleBatch } from './batch.js'
import { appendOfficeGardenBed } from './plants.js'
import { R1_LANDSCAPE } from './r1-landscape-plan.js'
import { r1LookPlantPositions } from './r1-look.js'
import { tropicalRow, tropicalLeafBatch, appendTropicalPlant, PLAZA_SPECIES } from './r1-tropical.js'

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

export function buildR1DenseGarden({ THREE, root, layout, collision, quality, low = false, lookOnly = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = lookOnly ? 'r1-look-plants' : 'r1-dense-garden'; group.userData.dynamic = true
  const tiers = new Map(), proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  let current, disposed = false
  function build(lowTier) {
    const plan = lookOnly ? { plants: r1LookPlantPositions.map(([id,zone,x,z])=>({id,zone,x,z,r:.6,kind:'medium'})), troughs: [], gardens: [] } : r1DensePlan(layout, lowTier), host = new THREE.Group(), batch = createSampleBatch(THREE), beds = batch, records = [], proxies = []
    const leaves = tropicalLeafBatch(THREE)
    const proxy = (row, geometry, y) => {
      const mesh = new THREE.Mesh(geometry, proxyMaterial); mesh.name = row.id
      mesh.position.set(row.x, y, row.z); mesh.userData = { collisionProxy: true, r1Id: row.id }
      proxies.push(mesh); return mesh
    }
    for (const [index, original] of plan.plants.entries()) {
      const row = tropicalRow(original,lookOnly?index:R1_LANDSCAPE.plants.indexOf(original)), details = appendTropicalPlant({THREE,batch,leaves,row,low:lowTier})
      proxy(row, new THREE.CylinderGeometry(row.r*.72,row.r*.72,details.potHeight,16),details.potHeight/2)
      records.push({...row,...details,position:{x:row.x,z:row.z},batch:'pots',collision:'ordinary Mesh'})
    }
    for (const [index, row] of [...plan.troughs, ...plan.gardens].entries()) {
      const startVertex = beds.triangles() * 3
      const trough = !!row.wall, parts = [], box = new THREE.Box3(), capture = { add(geometry, color, position, yaw = 0, roughness = .85, metalness = 0) {
        geometry.rotateY(yaw); geometry.translate(...position); geometry.computeBoundingBox(); box.union(geometry.boundingBox)
        parts.push({ geometry, color: ['#D5B2AE', '#E7D7AA'].includes(color) ? ['#B94E54', '#D992AE', '#E2C65F', '#F1E8D7'][index % 4] : color, roughness, metalness })
      } }
      appendOfficeGardenBed({ THREE, batch: capture, leafBatch: { add: (...args) => capture.add(...args) }, bed: { x: 0, z: 0, w: Math.max(.9, row.w), d: Math.max(.9, row.d) }, low: lowTier, seed: index + 31, organic: !trough })
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
      let species
      if (!trough) {
        species = PLAZA_SPECIES[index % 4]
        const plant = appendTropicalPlant({THREE,batch:beds,leaves,row:{...row,r:row.w*.38,height:species==='三角梅'?1.1:2.3,speciesIndex:index%4},low:lowTier,plaza:true})
        measured.union(plant.bounds)
      }
      if (trough) { beds.add(new THREE.BoxGeometry(row.w, .35, row.d), '#C5BCA9', [row.x, .175, row.z]); proxy(row, new THREE.BoxGeometry(row.w, .35, row.d), .175) }
      else proxy(row, new THREE.CylinderGeometry(row.w / 2, row.w / 2, .18, 32), .09)
      records.push({ ...row, species, area, startVertex, vertexCount: beds.triangles() * 3 - startVertex, batch: 'pots', renderHeight: measured.max.y, kind: trough ? 'trough' : 'flowerbed', bounds: measured, collision: 'ordinary Mesh', flowerColor: ['#B94E54', '#D992AE', '#E2C65F', '#F1E8D7'][index % 4] })
    }
    const built = [batch.build(host, 'r1-dense-pots'), leaves.build(host,'r1-tropical-leaves')]
    // Pots and beds share one opaque material; two-sided foliage needs no duplicate reverse triangles.
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

