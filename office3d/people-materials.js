import * as THREE from 'three'

// FBX 带来的 Phong 材质换成 PBR，透明贴图（头发、睫毛）用 alphaTest，避免排序闪烁
export function fixMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
    if (o.isSkinnedMesh) o.normalizeSkinWeights()
    const conv = (m) => {
      const map = m.map || null
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4 }
      const cut = /opacity/i.test(m.name || '') || /opacity/i.test(map?.image?.src || map?.name || '')
      const n = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: cut ? 0.6 : 0.72, metalness: 0, name: m.name })
      if (cut) { n.transparent = false; n.alphaTest = 0.45; n.side = THREE.DoubleSide }
      return n
    }
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material)
  })
}
