const palette = ['#D9E6E1', '#E4DCCB', '#E9D8C2', '#DDE2EC', '#E5DCCF', '#D7E2D6', '#E8D7C0']

const colorOf = (THREE, value) => new THREE.Color(value)

function zoneGround(THREE, zones) {
  const positions = [], colors = [], indices = [], zoneIds = {}
  zones.forEach((zone, index) => {
    const [x0, x1, z0, z1] = zone.worldBboxXZ, start = positions.length / 3, color = colorOf(THREE, palette[index % palette.length])
    positions.push(x0, .008, z0, x1, .008, z0, x1, .008, z1, x0, .008, z1)
    for (let i = 0; i < 4; i++) colors.push(color.r, color.g, color.b)
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
    zoneIds[zone.id] = { start, count: 4, bounds: [x0, x1, z0, z1] }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .93, transparent: true, opacity: .3 })
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'r1-zones-ground'; mesh.userData.dynamic = true; mesh.userData.zoneIds = zoneIds
  return { mesh, dispose: () => { geometry.dispose(); material.dispose() } }
}

function zoneLabels(THREE, zones) {
  const labelled = zones.filter(zone => zone.id !== '14'), width = 640, row = 96
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = row * labelled.length
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4B4A44'; ctx.font = '600 38px Microsoft YaHei,sans-serif'; ctx.textAlign = 'center'
  labelled.forEach((zone, index) => ctx.fillText(`${zone.id} · ${zone.name}`, width / 2, index * row + 60))
  const texture = new THREE.CanvasTexture(canvas), positions = [], uvs = [], indices = []
  labelled.forEach((zone, index) => {
    const [x0, x1, z0, z1] = zone.worldBboxXZ, w = Math.min(5.6, x1 - x0 - .5), x = (x0 + x1) / 2, z = (z0 + z1) / 2, start = positions.length / 3
    positions.push(x - w / 2, .018, z - .42, x + w / 2, .018, z - .42, x + w / 2, .018, z + .42, x - w / 2, .018, z + .42)
    const v0 = index / labelled.length, v1 = (index + 1) / labelled.length
    uvs.push(0, v0, 1, v0, 1, v1, 0, v1); indices.push(start, start + 1, start + 2, start, start + 2, start + 3)
  })
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'r1-zone-labels'; mesh.userData.dynamic = true; mesh.userData.zoneIds = labelled.map(zone => zone.id)
  return { mesh, dispose: () => { geometry.dispose(); material.dispose(); texture.dispose() } }
}

export function buildR1Zones({ THREE, root, layout }) {
  const group = new THREE.Group(); group.name = 'r1-zones'; group.userData.dynamic = true
  const ground = zoneGround(THREE, layout.r1.data.zones), labels = zoneLabels(THREE, layout.r1.data.zones)
  group.add(ground.mesh, labels.mesh); root.add(group)
  return { root: group, dispose() { group.removeFromParent(); ground.dispose(); labels.dispose() } }
}
