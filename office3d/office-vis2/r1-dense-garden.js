import { createSampleBatch } from './batch.js'
import { appendR1GardenStrip } from './r1-garden-strips.js'
import { R1_CLUSTER_PLANTS, R1_LOW_PLANT_IDS } from './r1-cluster-plan.js'
import { R1_LANDSCAPE } from './r1-landscape-plan.js'
import { tropicalRow, tropicalLeafBatch, appendTropicalPlant } from './r1-tropical.js'

export function r1DensePlan(layout, low = false) {
  if (!low) return R1_LANDSCAPE
  const ids = new Set(R1_LOW_PLANT_IDS)
  return { plants: R1_LANDSCAPE.plants.filter(p => ids.has(p.id)), troughs: R1_LANDSCAPE.troughs, gardens: R1_LANDSCAPE.gardens }
}

export function buildR1DenseGarden({ THREE, root, layout, collision, quality, low = false, lookOnly = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = lookOnly ? 'r1-look-plants' : 'r1-dense-garden'; group.userData.dynamic = true
  const tiers = new Map(), proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  let current, disposed = false
  function build(lowTier) {
    const plan = lookOnly ? { plants: R1_CLUSTER_PLANTS.filter(p => p.look && (!lowTier || R1_LOW_PLANT_IDS.includes(p.id))), troughs: [], gardens: [] } : r1DensePlan(layout, lowTier), host = new THREE.Group(), batch = createSampleBatch(THREE), beds = batch, records = [], proxies = []
    const leaves = tropicalLeafBatch(THREE)
    const proxy = (row, geometry, y) => {
      const mesh = new THREE.Mesh(geometry, proxyMaterial); mesh.name = row.id
      mesh.position.set(row.x, y, row.z); mesh.userData = { collisionProxy: true, r1Id: row.id }
      proxies.push(mesh); return mesh
    }
    for (const [index, original] of plan.plants.entries()) {
      const row = tropicalRow(original,lookOnly?index:R1_LANDSCAPE.plants.indexOf(original)), details = appendTropicalPlant({THREE,batch,leaves,row,low:lowTier})
      proxy(row, new THREE.CylinderGeometry(details.potRadius,details.potRadius,details.potHeight,16),details.potHeight/2)
      records.push({...row,...details,position:{x:row.x,z:row.z},batch:'pots',collision:'ordinary Mesh'})
    }
    for (const [index, row] of [...plan.troughs, ...plan.gardens].entries()) {
      const record = appendR1GardenStrip({ THREE, batch: beds, leaves, row, low: lowTier, index })
      proxy(row, record.proxyGeometry, 0)
      const { proxyGeometry, ...metadata } = record
      records.push(metadata)
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

