const ROOM = Object.freeze({ cellsW: 16, cellsD: 12, cellM: 0.5, wallH: 3, wallT: 0.12 })
const CATALOG = Object.freeze([
  ['bed_single', 4, 3, 0.6, 'floor', true],
  ['sofa_two', 4, 2, 0.8, 'floor', true],
  ['table_dining', 3, 2, 0.75, 'floor', true],
  ['chair_wood', 1, 1, 0.9, 'floor', true],
  ['desk_work', 3, 2, 0.75, 'floor', true],
  ['wardrobe', 2, 1, 2, 'floor', true],
  ['bookshelf', 3, 1, 1.8, 'wall', true],
  ['tv_stand', 3, 1, 0.5, 'wall', true],
  ['plant_pot', 1, 1, 1, 'floor', true],
  ['lamp_floor', 1, 1, 1.6, 'floor', true],
  ['rug_round', 4, 4, 0.02, 'rug', false],
  ['frame_art', 2, 1, 1, 'wall', false],
].map(([id, w, d, height, layer, blocks]) => Object.freeze({
  id,
  footprint: Object.freeze({ w, d }),
  height,
  layer,
  blocks,
})))
const ITEMS = new Map(CATALOG.map((item) => [item.id, item]))
const rotations = new Set([0, 90, 180, 270])
const getItem = (itemId) => ITEMS.get(itemId) || null
export const starterInventory = () => {
  const counts = { chair_wood: 3, plant_pot: 2, frame_art: 2 }
  const entries = []
  for (const item of CATALOG) {
    const count = counts[item.id] || 1
    for (let index = 1; index <= count; index++) entries.push({ itemInstanceId: `${item.id}#${index}`, itemId: item.id })
  }
  return entries
}
export const getHomeItem = getItem

const occupiedCells = (item, cx, cz, rot) => {
  if (!item || !rotations.has(rot)) return []
  const width = rot === 90 || rot === 270 ? item.footprint.d : item.footprint.w
  const depth = rot === 90 || rot === 270 ? item.footprint.w : item.footprint.d
  return Array.from({ length: width * depth }, (_, index) => ({
    cx: cx + index % width,
    cz: cz + Math.floor(index / width),
  }))
}
function validateLayout(placements, inventory) {
  const ids = new Set(inventory.map((entry) => entry.itemInstanceId))
  const used = new Set()
  const occupied = new Map()
  const violations = []
  for (const placement of placements) {
    const item = getItem(placement?.itemId)
    const cells = occupiedCells(item, placement?.cx, placement?.cz, placement?.rot)
    if (!item || !ids.has(placement?.itemInstanceId) || used.has(placement?.itemInstanceId) ||
      placement?.layer !== item?.layer || cells.some((cell) => cell.cx < 0 || cell.cz < 0 || cell.cx >= ROOM.cellsW || cell.cz >= ROOM.cellsD)) {
      violations.push(placement?.itemInstanceId || 'unknown')
      continue
    }
    used.add(placement.itemInstanceId)
    if (item.blocks && cells.some((cell) => cell.cz >= 10 && cell.cx >= 6 && cell.cx <= 9)) violations.push(placement.itemInstanceId)
    if (item.layer === 'floor') {
      for (const cell of cells) {
        const key = `${cell.cx},${cell.cz}`
        if (occupied.has(key)) violations.push(placement.itemInstanceId)
        occupied.set(key, placement.itemInstanceId)
      }
    }
  }
  return { ok: violations.length === 0, violations }
}

const cellToLocal = (cx, cz) => Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cx < ROOM.cellsW && cz >= 0 && cz < ROOM.cellsD
  ? { x: (cx + 0.5 - ROOM.cellsW / 2) * ROOM.cellM, z: (cz + 0.5 - ROOM.cellsD / 2) * ROOM.cellM }
  : null
const roomBounds = () => ({
  minX: -ROOM.cellsW * ROOM.cellM / 2,
  maxX: ROOM.cellsW * ROOM.cellM / 2,
  minZ: -ROOM.cellsD * ROOM.cellM / 2,
  maxZ: ROOM.cellsD * ROOM.cellM / 2,
  width: ROOM.cellsW * ROOM.cellM,
  depth: ROOM.cellsD * ROOM.cellM,
  height: ROOM.wallH,
})
const placementTransform = (placement, item) => {
  if (!item || !rotations.has(placement?.rot)) return null
  const rotated = placement.rot === 90 || placement.rot === 270
  const width = rotated ? item.footprint.d : item.footprint.w
  const depth = rotated ? item.footprint.w : item.footprint.d
  if (!Number.isInteger(placement.cx) || !Number.isInteger(placement.cz) ||
    placement.cx < 0 || placement.cz < 0 || placement.cx + width > ROOM.cellsW || placement.cz + depth > ROOM.cellsD) return null
  return {
    x: (placement.cx + width / 2 - ROOM.cellsW / 2) * ROOM.cellM,
    z: (placement.cz + depth / 2 - ROOM.cellsD / 2) * ROOM.cellM,
    rotY: placement.rot * Math.PI / 180,
  }
}
const wallSegments = () => {
  const halfW = ROOM.cellsW * ROOM.cellM / 2
  const halfD = ROOM.cellsD * ROOM.cellM / 2
  return [
    { side: 'north', x: 0, z: -halfD, width: 8, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'west', x: -halfW, z: 0, width: ROOM.wallT, depth: 6, height: ROOM.wallH },
    { side: 'east', x: halfW, z: 0, width: ROOM.wallT, depth: 6, height: ROOM.wallH },
    { side: 'south-west', x: -2.25, z: halfD, width: 3.5, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'south-east', x: 2.25, z: halfD, width: 3.5, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'south-header', x: 0, z: halfD, width: 1, depth: ROOM.wallT, height: 0.8, y: 2.2 },
  ]
}

export function createHomeRoom(THREE, { scene, materials, itemBuilder } = {}) {
  const group = new THREE.Group()
  group.name = 'home-room'
  const owned = []
  const items = new THREE.Group()
  items.name = 'home-room-items'
  group.add(items)
  const addMesh = (geometry, material, position = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.receiveShadow = true
    group.add(mesh)
    owned.push(geometry)
    return mesh
  }
  const bounds = roomBounds()
  const floor = addMesh(
    new THREE.PlaneGeometry(bounds.width, bounds.depth),
    materials.floor,
    [0, -0.01, 0],
  )
  floor.rotation.x = -Math.PI / 2
  for (let cx = 0; cx <= 16; cx++) {
    const x = (cx - 8) * 0.5
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.006, bounds.minZ),
      new THREE.Vector3(x, 0.006, bounds.maxZ),
    ])
    const line = new THREE.Line(geometry, materials.grid)
    group.add(line)
    owned.push(geometry)
  }
  for (let cz = 0; cz <= 12; cz++) {
    const z = (cz - 6) * 0.5
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bounds.minX, 0.006, z),
      new THREE.Vector3(bounds.maxX, 0.006, z),
    ])
    const line = new THREE.Line(geometry, materials.grid)
    group.add(line)
    owned.push(geometry)
  }
  for (const segment of wallSegments()) {
    const wall = addMesh(
      new THREE.BoxGeometry(segment.width, segment.height, segment.depth),
      materials.wall,
      [segment.x, segment.y === undefined ? segment.height / 2 : segment.y + segment.height / 2, segment.z],
    )
    wall.name = `wall-${segment.side}`
  }
  for (const side of [-1, 1]) {
    addMesh(new THREE.BoxGeometry(bounds.width, 0.08, 0.08), materials.trim, [0, 0.04, side * (bounds.maxZ - 0.04)])
    addMesh(new THREE.BoxGeometry(0.08, 0.08, bounds.depth), materials.trim, [side * (bounds.maxX - 0.04), 0.04, 0])
  }
  const entry = addMesh(new THREE.PlaneGeometry(2, 1), materials.entry, [0, 0.002, 2.5])
  entry.rotation.x = -Math.PI / 2
  entry.name = 'entry-clearance'

  function cellToWorld(cx, cz) {
    return cellToLocal(cx, cz)
  }

  function setPlacements(list, catalog = []) {
    while (items.children.length) {
      const child = items.children.pop()
      child.traverse((object) => object.geometry?.dispose())
    }
    const source = []
    let warned = false
    for (const entry of Array.isArray(list) ? list : []) {
      const checkedEntry = validateLayout([...source, entry], catalog)
      if (checkedEntry.ok) source.push(entry)
      else warned = true
    }
    if (warned) console.warn('个人空间演示布置含非法项，已丢弃非法布置')
    for (const placement of source) {
      const item = getItem(placement.itemId)
      const transform = placementTransform(placement, item)
      if (!item || !transform || typeof itemBuilder !== 'function') continue
      const child = itemBuilder(placement.itemId)
      child.position.set(transform.x, 0, transform.z)
      child.rotation.y = transform.rotY
      child.userData.itemInstanceId = placement.itemInstanceId
      items.add(child)
    }
    const checked = validateLayout(source, catalog)
    return { ok: checked.ok, count: source.length, violations: checked.violations }
  }

  function focusGoal() {
    return { x: 0, y: 0.8, z: 0 }
  }

  function dispose() {
    group.traverse((object) => object.geometry?.dispose())
    for (const material of Object.values(materials || {})) {
      if (!material?.userData?.sharedHomeItemMaterial) material?.dispose?.()
    }
  }

  scene?.add(group)
  return { group, items, setPlacements, cellToWorld, focusGoal, dispose }
}
