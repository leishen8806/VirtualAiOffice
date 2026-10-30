import { R1_CLUSTER_PLANTS } from './r1-cluster-plan.js'
import { createSampleBatch } from './batch.js'
import { r1ToWorld } from '../office-r1-layout.js'

// Supplemental landscaping; source register and route coordinates remain untouched.
export const r1LookPlantPositions = Object.freeze(R1_CLUSTER_PLANTS.filter(p => p.look).map(p => Object.freeze([p.id, p.zone, p.x, p.z])))

export function r1LookPlantElements() {
  return r1LookPlantPositions.flatMap(([id, regionId, x, z]) => {
    const spec = R1_CLUSTER_PLANTS.find(p => p.id === id)
    const row = { id, regionId, xM: x + 26, yM: 18 - z, yawDeg: 0, zM: 0, category: '植物总成', heightM: spec.height, lengthM: spec.r * 2, widthM: spec.r * 2 }
    return [row, ...[['POT', spec.potR * 2, .42, 0], ['TR', .09, spec.height * .5, .2], ['CR', spec.r * 2, spec.height - .3, .3]].map(([suffix, width, height, base]) => ({ ...row, id: `${id}-${suffix}`, parentId: id, category: suffix, lengthM: width, widthM: width, heightM: height, zM: base }))]
  })
}

export function r1MarbleTexture(THREE) {
  const size = 512, pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const vein = Math.exp(-Math.abs(Math.sin(x * .034 + Math.sin(y * .027) * 1.8 + y * .012)) * 30)
    const grain = Math.sin(x * 13.1 + y * 7.7) * Math.sin(x * 1.9 - y * 4.3)
    const joint = x % 256 < 2 || y % 256 < 2, shade = joint ? 31 : vein * 16 + grain * 2
    const k = (y * size + x) * 4
    pixels.set([235 - shade, 221 - shade, 197 - shade, 255], k)
  }
  const texture = new THREE.DataTexture(pixels, size, size)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true
  return texture
}

export function r1FloorInlay(THREE, root, layout) {
  const center = r1ToWorld(...layout.r1.data.central.center_m), r = layout.r1.data.central.radii_m
  const batch = createSampleBatch(THREE)
  const rings = [[r.bar_outer + .05, r.inner_walk_outer - .04, '#F3E9D8'], [r.inner_walk_outer - .04, r.inner_walk_outer + .04, '#B99467'], [r.inner_walk_outer + .04, r.outer_walk_outer - .04, '#EFE3CE'], [r.outer_walk_outer - .04, r.outer_walk_outer + .04, '#B99467']]
  for (const [inner, outer, color] of rings) {
    const geometry = new THREE.RingGeometry(inner, outer, 160); geometry.rotateX(-Math.PI / 2)
    batch.add(geometry, color, [center.x, .004, center.z], 0, .32, .05)
  }
  const built = batch.build(root, 'r1-floor-inlay')
  built.mesh.userData.rings = rings; built.mesh.userData.center = center
  built.mesh.material.polygonOffset = true; built.mesh.material.polygonOffsetFactor = -1
  return built
}
