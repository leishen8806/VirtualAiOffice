// Office-only brand plaques. The shared scene loader remains responsible for feature gating.
import { receptionBackdrop } from './foyer.js'

function curvedPanel(THREE, center, radius, width, height, y, yaw, depth = 0) {
  const positions = [], uvs = [], indices = [], segments = 20, half = width / (2 * radius)
  const point = (angle, elevation, r) => [center.x + Math.sin(angle) * r, elevation, center.z + Math.cos(angle) * r]
  const quad = (a, b, c, d, u0, u1) => {
    const start = positions.length / 3
    positions.push(...a, ...b, ...c, ...d)
    uvs.push(u0, 0, u1, 0, u1, 1, u0, 1)
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
  }
  const bottom = y - height / 2, top = y + height / 2, outer = radius + depth / 2, inner = radius - depth / 2
  for (let i = 0; i < segments; i++) {
    const a = yaw - half + i * 2 * half / segments, b = yaw - half + (i + 1) * 2 * half / segments
    quad(point(a, bottom, outer), point(b, bottom, outer), point(b, top, outer), point(a, top, outer), i / segments, (i + 1) / segments)
    if (depth) {
      quad(point(b, bottom, inner), point(a, bottom, inner), point(a, top, inner), point(b, top, inner), 0, 1)
      quad(point(a, top, outer), point(b, top, outer), point(b, top, inner), point(a, top, inner), 0, 1)
      quad(point(b, bottom, outer), point(a, bottom, outer), point(a, bottom, inner), point(b, bottom, inner), 0, 1)
    }
  }
  if (depth) {
    const a = yaw - half, b = yaw + half
    quad(point(a, bottom, inner), point(a, bottom, outer), point(a, top, outer), point(a, top, inner), 0, 1)
    quad(point(b, bottom, outer), point(b, bottom, inner), point(b, top, inner), point(b, top, outer), 0, 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

function joinGeometry(THREE, parts) {
  const position = [], normal = [], uv = []
  for (const { geometry, matrix } of parts) {
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    if (matrix) part.applyMatrix4(matrix)
    position.push(...part.attributes.position.array)
    normal.push(...part.attributes.normal.array)
    uv.push(...part.attributes.uv.array)
    part.dispose(); geometry.dispose()
  }
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  result.computeBoundingSphere()
  return result
}

export function buildOfficeBrandMarks({ THREE, root, layout, assets, canvasTex } = {}) {
  if (!THREE || !root || !layout) throw new TypeError('buildOfficeBrandMarks requires THREE, root and layout')
  const center = layout.bar.center, front = layout.frontDesk, barRadius = layout.bar.radius, angle = Math.asin(1.1 / barRadius)
  const grille = receptionBackdrop(front).grille
  const marks = [
    { id: 'bar-fascia', x: center.x + Math.sin(angle) * (barRadius + .06), y: .50, z: center.z + Math.cos(angle) * (barRadius + .06), width: .92, yaw: angle },
    { id: 'reception-desk', x: front.center.x, y: .68, z: front.z1 + .026, width: .82, yaw: 0 },
    // 背板厚 35 mm，背面离格栅 2 mm，标识面离背板正面 1 mm。
    { id: 'reception-wall', x: front.center.x, y: 1.65, z: grille.faceZ + .002 + .035 + .001, width: 1.45, yaw: 0, backingOffset: .0185 },
  ].map(mark => ({ ...mark, height: mark.width / (979 / 544) }))
  const group = new THREE.Group(); group.name = 'office-vis2-brand-marks'; root.add(group)
  const backingMaterial = new THREE.MeshStandardMaterial({ color: '#B89B64', metalness: .72, roughness: .42, emissive: '#7a5827', emissiveIntensity: .16 })
  let logoMaterial, labelTexture, placeholder = false
  if (assets?.logo?.isTexture) logoMaterial = new THREE.MeshBasicMaterial({ map: assets.logo, transparent: true, alphaTest: .04, depthWrite: false, side: THREE.DoubleSide })
  else {
    placeholder = true
    if (canvasTex) labelTexture = canvasTex(640, 240, (ctx, width, height) => { ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#493f32'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 48px Microsoft YaHei, sans-serif'; ctx.fillText('品牌标识预留', width / 2, height / 2) })
    logoMaterial = new THREE.MeshBasicMaterial({ map: labelTexture || null, color: labelTexture ? '#ffffff' : '#493f32', transparent: !!labelTexture, alphaTest: labelTexture ? .04 : 0, depthWrite: false, side: THREE.DoubleSide })
  }
  const bar = marks[0], backingParts = [{ geometry: curvedPanel(THREE, center, barRadius + .04, bar.width + .16, bar.height + .1, bar.y, angle, .02) }]
  const logoParts = [{ geometry: curvedPanel(THREE, center, barRadius + .06, bar.width, bar.height, bar.y, angle) }]
  const backingBarVertices = backingParts[0].geometry.index.count, logoBarVertices = logoParts[0].geometry.index.count
  const helper = new THREE.Object3D()
  for (const mark of marks.slice(1)) {
    helper.position.set(mark.x, mark.y, mark.z - (mark.backingOffset ?? .026)); helper.rotation.y = 0; helper.scale.set(mark.width + .16, mark.height + .14, .035); helper.updateMatrix()
    backingParts.push({ geometry: new THREE.BoxGeometry(1, 1, 1), matrix: helper.matrix.clone() })
    helper.position.z = mark.z; helper.scale.set(mark.width, mark.height, 1); helper.updateMatrix()
    logoParts.push({ geometry: new THREE.PlaneGeometry(1, 1), matrix: helper.matrix.clone() })
  }
  const backing = new THREE.Mesh(joinGeometry(THREE, backingParts), backingMaterial)
  backing.name = 'office-vis2-brushed-metal-brand-backing'; backing.userData = { innerRadius: barRadius + .03, barVertexCount: backingBarVertices, depthOffset: .026 }
  const logos = new THREE.Mesh(joinGeometry(THREE, logoParts), logoMaterial)
  logos.name = placeholder ? 'office-vis2-brand-placeholder-slots' : 'office-vis2-approved-logo-marks'
  logos.userData = { replaceable: placeholder, barVertexCount: logoBarVertices }
  logos.renderOrder = 4; group.add(backing, logos)
  let disposed = false
  return { root: group, marks, placeholder, summary: () => ({ calls: 2, marks: marks.length, source: placeholder ? 'placeholder' : 'assets/logo.png' }), dispose() {
    if (disposed) return; disposed = true
    backing.geometry.dispose(); logos.geometry.dispose()
    backingMaterial.dispose(); logoMaterial.dispose(); labelTexture?.dispose(); group.removeFromParent()
  } }
}
