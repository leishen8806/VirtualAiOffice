// Office-only brand plaques. The shared scene loader remains responsible for feature gating.
export function buildOfficeBrandMarks({ THREE, root, layout, assets, canvasTex } = {}) {
  if (!THREE || !root || !layout) throw new TypeError('buildOfficeBrandMarks requires THREE, root and layout')
  const center = layout.bar.center, front = layout.frontDesk, backdrop = { z: front.z0 - .18 }
  const marks = [
    { id: 'bar-fascia', x: center.x + 1.1, y: .68, z: center.z + layout.bar.radius + .028, width: .92 },
    { id: 'reception-desk', x: front.center.x, y: .68, z: front.z1 + .026, width: .82 },
    { id: 'reception-wall', x: front.center.x, y: 1.7, z: backdrop.z + .12, width: 1.45 },
  ].map(mark => ({ ...mark, height: mark.width / (979 / 544) }))
  const group = new THREE.Group(); group.name = 'office-vis2-brand-marks'; root.add(group)
  const helper = new THREE.Object3D(), backingMaterial = new THREE.MeshStandardMaterial({ color: '#B89B64', metalness: .72, roughness: .42, emissive: '#7a5827', emissiveIntensity: .16 })
  const backing = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), backingMaterial, marks.length)
  backing.name = 'office-vis2-brushed-metal-brand-backing'
  backing.userData.depthOffset = .026
  marks.forEach((mark, index) => { helper.position.set(mark.x, mark.y, mark.z - .026); helper.scale.set(mark.width + .16, mark.height + .14, .035); helper.updateMatrix(); backing.setMatrixAt(index, helper.matrix) })
  backing.instanceMatrix.needsUpdate = true; group.add(backing)
  let material, logos, labelTexture, placeholder = false
  if (assets?.logo?.isTexture) {
    material = new THREE.MeshBasicMaterial({ map: assets.logo, transparent: true, alphaTest: .04, depthWrite: false, side: THREE.DoubleSide })
    logos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, marks.length)
    logos.name = 'office-vis2-approved-logo-marks'
  } else {
    placeholder = true
    if (canvasTex) labelTexture = canvasTex(640, 240, (ctx, width, height) => { ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#493f32'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 48px Microsoft YaHei, sans-serif'; ctx.fillText('品牌标识预留', width / 2, height / 2) })
    material = new THREE.MeshBasicMaterial({ map: labelTexture || null, color: labelTexture ? '#ffffff' : '#493f32', transparent: !!labelTexture, alphaTest: labelTexture ? .04 : 0, depthWrite: false, side: THREE.DoubleSide })
    logos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, marks.length)
    logos.name = 'office-vis2-brand-placeholder-slots'
  }
  marks.forEach((mark, index) => { helper.position.set(mark.x, mark.y, mark.z); helper.scale.set(mark.width, mark.height, 1); helper.rotation.set(0, 0, 0); helper.updateMatrix(); logos.setMatrixAt(index, helper.matrix) })
  logos.instanceMatrix.needsUpdate = true; logos.renderOrder = 4; logos.userData.replaceable = placeholder; group.add(logos)
  let disposed = false
  return { root: group, marks, placeholder, summary: () => ({ calls: 2, marks: marks.length, source: placeholder ? 'placeholder' : 'assets/logo.png' }), dispose() { if (disposed) return; disposed = true; backing.geometry.dispose(); backingMaterial.dispose(); logos.geometry.dispose(); material.dispose(); labelTexture?.dispose(); group.removeFromParent() } }
}
