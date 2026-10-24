import { WEST_OPEN_FIXTURE } from './align-fixture.js'
import { buildOpenFurnishing } from './open-furnishing.js'
import { createSampleBatch } from './batch.js'

export function buildAlignOpenPreview({ THREE, root, low }) {
  const group = new THREE.Group(); group.name = 'align-open-preview'
  const furnishing = buildOpenFurnishing({ THREE, root: group, low, ...WEST_OPEN_FIXTURE }), batch = createSampleBatch(THREE)
  const { area, corridors, workstations } = WEST_OPEN_FIXTURE
  const slab = (b, y, tint) => batch.add(new THREE.BoxGeometry(b.x1 - b.x0, .01, b.z1 - b.z0), tint, [(b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2], 0, .9)
  slab(area, -.02, '#E1C399')
  for (const c of corridors) slab(c, -.005, '#B7C2B4')
  for (const p of workstations) {
    const disc = new THREE.CircleGeometry(p.radius + .6, 32); disc.rotateX(-Math.PI / 2)
    batch.add(disc, '#D9D3C6', [p.x, .008, p.z], 0, .9)
    batch.add(new THREE.BoxGeometry(1.6, .05, .7), '#A5B1B4', [p.x, .75, p.z], 0, .85)
    for (const dx of [-.65, .65]) batch.add(new THREE.BoxGeometry(.07, .7, .5), '#756857', [p.x + dx, .375, p.z])
  }
  const context = batch.build(group, 'preview-only-six-workstation-markers'); root.add(group)
  return { root: group, furnishing, dispose() { furnishing.dispose(); context.dispose(); group.removeFromParent() } }
}
