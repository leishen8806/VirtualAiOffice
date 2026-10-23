import { LAYOUT_V3 } from '../office-layout.js'
import { createSampleBatch } from './batch.js'
export function buildOfficeSamplePlants({ THREE, root, layout = LAYOUT_V3, assets } = {}) {
  if (!THREE || !root) throw new TypeError('buildOfficeSamplePlants requires THREE and root')
  const c = layout.island.center, f = layout.foyer
  const poses = [-1, 1].flatMap(sign => [-1, 1].map(side => ({ x: c.x + sign * 4.4, z: c.z + side * 3.3 })))
  for (const x of [f.x0 + .75, f.x1 - .75]) for (const z of [f.z0 + 2.2, f.z1 - 1]) poses.push({ x, z })
  const group = new THREE.Group(); group.name = 'office-sample-plants'; const batch = createSampleBatch(THREE, assets)
  batch.add(new THREE.CylinderGeometry(.32, .4, .46, 12), '#F4F1EA', [0, .23, 0], 0, .9)
  batch.add(new THREE.CylinderGeometry(.29, .29, .025, 12), '#534A3C', [0, .47, 0], 0, 1)
  for (let i = 0; i < 20; i++) {
    const angle = i * 2.399, height = .58 + (i % 5) * .15
    const leaf = new THREE.SphereGeometry(1, 6, 4); leaf.scale(.075, .28, .025); leaf.rotateZ(.45 + (i % 3) * .22); leaf.rotateY(angle)
    batch.add(leaf, i % 4 ? '#3E5A4E' : '#648B50', [Math.sin(angle) * .24, height, Math.cos(angle) * .24], 0, .9)
  }
  const plants = batch.build(group, 'sample-instanced-potted-plants', poses); root.add(group)
  return { root: group, placements: poses, summary: () => ({ calls: 1, triangles: plants.triangles(), pots: poses.length }), dispose() { plants.dispose(); group.removeFromParent() } }
}
