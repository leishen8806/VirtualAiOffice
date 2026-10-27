import { r1World } from './r1-site.js'

const palette = ['#D9E6E1', '#E4DCCB', '#E9D8C2', '#DDE2EC', '#E5DCCF', '#D7E2D6', '#E8D7C0']

export function buildR1Zones({ THREE, root, layout }) {
  const group = new THREE.Group()
  group.name = 'r1-zones'
  group.userData.dynamic = true
  const materials = [], textures = []
  const createLabel = zone => {
    const canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 96
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#4B4A44'; ctx.font = '600 38px Microsoft YaHei,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${zone.id} · ${zone.name}`, canvas.width / 2, 60)
    const texture = new THREE.CanvasTexture(canvas); textures.push(texture)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }); materials.push(material)
    return material
  }
  layout.r1.data.zones.forEach((zone, index) => {
    const [x0, x1, z0, z1] = zone.worldBboxXZ
    const w = x1 - x0, d = z1 - z0
    const material = new THREE.MeshStandardMaterial({ color: palette[index % palette.length], roughness: .93, transparent: true, opacity: .3 }); materials.push(material)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w - .08, d - .08), material)
    ground.name = `r1-zone-${zone.id}`; ground.rotation.x = -Math.PI / 2; ground.position.set((x0 + x1) / 2, .008, (z0 + z1) / 2)
    group.add(ground)
    if (zone.id !== '14') {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(5.6, w - .5), .84), createLabel(zone))
      label.name = `r1-zone-label-${zone.id}`; label.rotation.x = -Math.PI / 2; label.position.set((x0 + x1) / 2, .018, (z0 + z1) / 2)
      group.add(label)
    }
  })
  root.add(group)
  return { root: group, dispose() { group.removeFromParent(); group.traverse(item => item.isMesh && item.geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()) } }
}
