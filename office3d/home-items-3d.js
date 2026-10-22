export const ITEM_DEFS = Object.freeze([
  ['bed_single', '单人床', 4, 3, 0.6], ['sofa_two', '双人沙发', 4, 2, 0.8],
  ['table_dining', '餐桌', 3, 2, 0.75], ['chair_wood', '木椅', 1, 1, 0.9],
  ['desk_work', '书桌', 3, 2, 0.75], ['wardrobe', '衣柜', 2, 1, 2.0],
  ['bookshelf', '书架', 3, 1, 1.8], ['tv_stand', '电视柜', 3, 1, 0.5],
  ['plant_pot', '盆栽', 1, 1, 1.0], ['lamp_floor', '落地灯', 1, 1, 1.6],
  ['rug_round', '圆形地毯', 4, 4, 0.02], ['frame_art', '挂画', 2, 1, 1.0],
].map(([id, name, w, d, height]) => Object.freeze({ id, name, footprint: Object.freeze({ w, d }), height })))
export const ITEM_IDS = Object.freeze(ITEM_DEFS.map(item => item.id))

const byId = new Map(ITEM_DEFS.map(item => [item.id, item]))

const shared = material => {
  material.userData.sharedHomeItemMaterial = true
  return material
}

function canvasMap(THREE, size, draw) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d'), size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createMaterials(THREE) {
  const standard = options => shared(new THREE.MeshStandardMaterial(options))
  const rugMap = canvasMap(THREE, 256, (g, s) => {
    const gradient = g.createRadialGradient(s / 2, s / 2, 12, s / 2, s / 2, s / 2)
    gradient.addColorStop(0, '#74899a')
    gradient.addColorStop(0.62, '#526b7d')
    gradient.addColorStop(0.64, '#d2b778')
    gradient.addColorStop(0.72, '#405867')
    gradient.addColorStop(1, '#263d4b')
    g.fillStyle = gradient
    g.fillRect(0, 0, s, s)
  })
  const artMap = canvasMap(THREE, 256, (g, s) => {
    g.fillStyle = '#e9e1d1'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#527480'; g.fillRect(20, 22, 216, 90)
    g.fillStyle = '#c39b61'; g.beginPath(); g.arc(172, 140, 54, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#344955'; g.fillRect(40, 155, 96, 64)
  })
  return Object.freeze({
    wood: standard({ color: 0x9b704d, roughness: 0.72 }),
    woodDark: standard({ color: 0x4d382d, roughness: 0.68 }),
    fabric: standard({ color: 0x496477, roughness: 0.92 }),
    bedding: standard({ color: 0xd9e3e5, roughness: 0.94 }),
    white: standard({ color: 0xf1eee6, roughness: 0.9 }),
    metal: standard({ color: 0x7c8790, roughness: 0.28, metalness: 0.76 }),
    dark: standard({ color: 0x202a31, roughness: 0.42 }),
    glass: standard({ color: 0x263b49, roughness: 0.16, metalness: 0.15 }),
    ceramic: standard({ color: 0xc9b793, roughness: 0.7 }),
    leaf: standard({ color: 0x3d795d, roughness: 0.88 }),
    books: standard({ color: 0x9e6956, roughness: 0.8 }),
    glow: standard({ color: 0xe7d5a4, emissive: 0xc19a55, emissiveIntensity: 0.7, roughness: 0.65 }),
    rug: standard({ color: 0x526b7d, map: rugMap, roughness: 0.95 }),
    art: standard({ color: 0xffffff, map: artMap, roughness: 0.75 }),
  })
}

const itemStats = {
  bed_single: { meshes: 3, triangles: 36, materials: 3 },
  sofa_two: { meshes: 4, triangles: 48, materials: 1 },
  table_dining: { meshes: 5, triangles: 60, materials: 1 },
  chair_wood: { meshes: 6, triangles: 72, materials: 1 },
  desk_work: { meshes: 5, triangles: 60, materials: 1 },
  wardrobe: { meshes: 5, triangles: 228, materials: 3 },
  bookshelf: { meshes: 8, triangles: 96, materials: 2 },
  tv_stand: { meshes: 2, triangles: 24, materials: 2 },
  plant_pot: { meshes: 5, triangles: 1024, materials: 3 },
  lamp_floor: { meshes: 3, triangles: 240, materials: 2 },
  rug_round: { meshes: 1, triangles: 48, materials: 1 },
  frame_art: { meshes: 2, triangles: 14, materials: 2 },
}

export const ITEM_STATS = Object.freeze(Object.fromEntries(Object.entries(itemStats).map(([id, stats]) => [id, Object.freeze(stats)])))

const add = (THREE, group, geometry, material, x, y, z, rotation) => {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

const box = (THREE, group, material, size, at) => add(THREE, group, new THREE.BoxGeometry(...size), material, ...at)

const BUILDERS = {
  bed_single(THREE, g, m) {
    box(THREE, g, m.woodDark, [1.92, 0.16, 1.42], [0, 0.08, 0])
    box(THREE, g, m.bedding, [1.84, 0.28, 1.22], [0, 0.30, 0.05])
    box(THREE, g, m.white, [0.72, 0.12, 0.34], [0, 0.50, -0.40])
  },
  sofa_two(THREE, g, m) {
    box(THREE, g, m.fabric, [1.64, 0.22, 0.68], [0, 0.36, 0.08])
    box(THREE, g, m.fabric, [1.80, 0.55, 0.16], [0, 0.53, -0.38])
    box(THREE, g, m.fabric, [0.16, 0.48, 0.78], [-0.91, 0.39, 0])
    box(THREE, g, m.fabric, [0.16, 0.48, 0.78], [0.91, 0.39, 0])
  },
  table_dining(THREE, g, m) {
    box(THREE, g, m.wood, [1.38, 0.10, 0.88], [0, 0.70, 0])
    for (const x of [-0.56, 0.56]) for (const z of [-0.31, 0.31]) box(THREE, g, m.wood, [0.08, 0.65, 0.08], [x, 0.325, z])
  },
  chair_wood(THREE, g, m) {
    box(THREE, g, m.wood, [0.42, 0.08, 0.42], [0, 0.46, 0])
    box(THREE, g, m.wood, [0.42, 0.38, 0.06], [0, 0.70, -0.18])
    for (const x of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) box(THREE, g, m.wood, [0.05, 0.42, 0.05], [x, 0.21, z])
  },
  desk_work(THREE, g, m) {
    box(THREE, g, m.woodDark, [1.40, 0.10, 0.86], [0, 0.70, 0])
    for (const x of [-0.60, 0.60]) for (const z of [-0.34, 0.34]) box(THREE, g, m.woodDark, [0.07, 0.65, 0.07], [x, 0.325, z])
  },
  wardrobe(THREE, g, m) {
    box(THREE, g, m.woodDark, [0.94, 1.92, 0.44], [0, 0.96, 0])
    box(THREE, g, m.wood, [0.44, 1.76, 0.035], [-0.235, 1.0, 0.238])
    box(THREE, g, m.wood, [0.44, 1.76, 0.035], [0.235, 1.0, 0.238])
    for (const x of [-0.055, 0.055]) add(THREE, g, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 24), m.metal, x, 1.0, 0.265)
  },
  bookshelf(THREE, g, m) {
    box(THREE, g, m.woodDark, [1.44, 1.72, 0.07], [0, 0.86, -0.205])
    box(THREE, g, m.woodDark, [0.08, 1.76, 0.42], [-0.70, 0.88, 0])
    box(THREE, g, m.woodDark, [0.08, 1.76, 0.42], [0.70, 0.88, 0])
    box(THREE, g, m.woodDark, [1.32, 0.08, 0.42], [0, 0.04, 0])
    box(THREE, g, m.woodDark, [1.32, 0.08, 0.42], [0, 1.76, 0])
    box(THREE, g, m.woodDark, [1.32, 0.06, 0.42], [0, 0.62, 0])
    box(THREE, g, m.woodDark, [1.32, 0.06, 0.42], [0, 1.20, 0])
    box(THREE, g, m.books, [0.82, 0.46, 0.16], [-0.12, 0.35, 0.09])
  },
  tv_stand(THREE, g, m) {
    box(THREE, g, m.dark, [1.42, 0.24, 0.44], [0, 0.12, 0])
    box(THREE, g, m.glass, [1.18, 0.28, 0.035], [0, 0.40, 0.205])
  },
  plant_pot(THREE, g, m) {
    add(THREE, g, new THREE.CylinderGeometry(0.14, 0.19, 0.30, 24), m.ceramic, 0, 0.15, 0)
    add(THREE, g, new THREE.CylinderGeometry(0.025, 0.035, 0.45, 16), m.wood, 0, 0.50, 0)
    for (const [x, y, z, sx, sy, sz] of [[-0.10, 0.76, 0, 0.16, 0.27, 0.12], [0.10, 0.80, 0.02, 0.16, 0.25, 0.13], [0, 0.80, -0.08, 0.18, 0.24, 0.12]]) {
      const leaf = add(THREE, g, new THREE.SphereGeometry(1, 16, 10), m.leaf, x, y, z)
      leaf.scale.set(sx, sy, sz)
    }
  },
  lamp_floor(THREE, g, m) {
    add(THREE, g, new THREE.CylinderGeometry(0.15, 0.17, 0.05, 24), m.metal, 0, 0.025, 0)
    add(THREE, g, new THREE.CylinderGeometry(0.018, 0.024, 1.20, 24), m.metal, 0, 0.65, 0)
    add(THREE, g, new THREE.CylinderGeometry(0.12, 0.22, 0.38, 24, 1, true), m.glow, 0, 1.40, 0)
  },
  rug_round(THREE, g, m) {
    add(THREE, g, new THREE.CircleGeometry(0.96, 48), m.rug, 0, 0.012, 0, [-Math.PI / 2, 0, 0])
  },
  frame_art(THREE, g, m) {
    box(THREE, g, m.metal, [0.96, 0.98, 0.06], [0, 0.51, 0])
    add(THREE, g, new THREE.PlaneGeometry(0.84, 0.84), m.art, 0, 0.52, 0.031)
  },
}

export function buildItem(THREE, itemId, { materials } = {}) {
  if (!byId.has(itemId) || !BUILDERS[itemId]) throw new RangeError(`未知个人空间物品：${itemId}`)
  const group = new THREE.Group()
  group.name = `home-item-${itemId}`
  group.userData.itemId = itemId
  group.userData.ownsMaterials = !materials
  const table = materials || createMaterials(THREE)
  BUILDERS[itemId](THREE, group, table)
  return group
}

export function disposeItem(group) {
  const materials = new Set()
  group.traverse(object => {
    if (!object.isMesh) return
    object.geometry?.dispose()
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) if (material) materials.add(material)
  })
  if (group.userData.ownsMaterials) for (const material of materials) {
    material.map?.dispose()
    material.dispose()
  }
}
