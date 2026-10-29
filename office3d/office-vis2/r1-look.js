import { createSampleBatch } from './batch.js'
import { r1ToWorld } from '../office-r1-layout.js'

// Supplemental landscaping; source register and route coordinates remain untouched.
export const r1LookPlantPositions = Object.freeze([
  ['LOOK-ATR-1','07',9.972,.881], ['LOOK-ATR-2','07',8.647,2.547],
  ['LOOK-ATR-3','07',4.591,4.936], ['LOOK-ATR-4','07',-.274,5.021],
  ['LOOK-ATR-5','07',-4.647,2.547], ['LOOK-ATR-6','07',-6.776,-.731],
  ['LOOK-ATR-7','07',-7.457,-7.921], ['LOOK-ATR-8','07',-4.986,-10.39],
  ['LOOK-ATR-9','07',6.449,-12.832], ['LOOK-ATR-10','07',8.986,-10.39],
  ['LOOK-ATR-11','07',11.457,-7.921], ['LOOK-ATR-12','07',-5.967,1.074],
  ['LOOK-04-1','04',23.1,-13.7], ['LOOK-04-2','04',5.3,-13.9],
  ['LOOK-06-1','06',-25.1,7.7], ['LOOK-06-2','06',-25.1,-10.9],
  ['LOOK-08-1','08',29.2,7.7], ['LOOK-08-2','08',29.2,-10.9],
  ['LOOK-10-1','10',-19.3,17.2], ['LOOK-10-2','10',-5.7,17.2],
  ['LOOK-11-1','11',8.1,16.8], ['LOOK-11-2','11',-4.1,16.8],
  ['LOOK-12-1','12',23.3,17.2], ['LOOK-12-2','12',9.9,9.2],
].map(Object.freeze))

export function r1LookPlantElements() {
  return r1LookPlantPositions.flatMap(([id, regionId, x, z]) => {
    const row = { id, regionId, xM: x + 26, yM: 18 - z, yawDeg: 0, zM: 0, category: '植物总成', heightM: 1.8, lengthM: .84, widthM: .84 }
    return [row, ...[['POT', .72, .55, 0], ['TR', .09, .8, .5], ['CR', .84, 1.25, .55]].map(([suffix, width, height, base]) => ({ ...row, id: `${id}-${suffix}`, parentId: id, category: suffix, lengthM: width, widthM: width, heightM: height, zM: base }))]
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
