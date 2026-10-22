export const ROOM = Object.freeze({ cellsW: 16, cellsD: 12, cellM: 0.5, wallH: 3, wallT: 0.12 })

const rotations = new Set([0, 90, 180, 270])
const inGrid = (cx, cz) => Number.isInteger(cx) && Number.isInteger(cz) && cx >= 0 && cx < ROOM.cellsW && cz >= 0 && cz < ROOM.cellsD

export function cellToLocal(cx, cz) {
  if (!inGrid(cx, cz)) return null
  return {
    x: (cx + 0.5 - ROOM.cellsW / 2) * ROOM.cellM,
    z: (cz + 0.5 - ROOM.cellsD / 2) * ROOM.cellM,
  }
}

export function localToCell(x, z) {
  const cx = Math.floor(Number(x) / ROOM.cellM + ROOM.cellsW / 2)
  const cz = Math.floor(Number(z) / ROOM.cellM + ROOM.cellsD / 2)
  return inGrid(cx, cz) ? { cx, cz } : null
}

export function doorOpening() {
  return Object.freeze({ cx0: 7, cx1: 8, cz: 11, width: 1, height: 2.2 })
}

export function wallSegments() {
  const halfW = ROOM.cellsW * ROOM.cellM / 2
  const halfD = ROOM.cellsD * ROOM.cellM / 2
  const door = doorOpening()
  const doorW = door.width
  const southLeft = door.cx0 * ROOM.cellM
  const southRight = (ROOM.cellsW - door.cx1 - 1) * ROOM.cellM
  return Object.freeze([
    { side: 'north', x: 0, z: -halfD, width: ROOM.cellsW * ROOM.cellM, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'west', x: -halfW, z: 0, width: ROOM.wallT, depth: ROOM.cellsD * ROOM.cellM, height: ROOM.wallH },
    { side: 'east', x: halfW, z: 0, width: ROOM.wallT, depth: ROOM.cellsD * ROOM.cellM, height: ROOM.wallH },
    { side: 'south-west', x: -halfW + southLeft / 2, z: halfD, width: southLeft, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'south-east', x: halfW - southRight / 2, z: halfD, width: southRight, depth: ROOM.wallT, height: ROOM.wallH },
    { side: 'south-header', x: 0, z: halfD, width: doorW, depth: ROOM.wallT, height: Number((ROOM.wallH - door.height).toFixed(2)), y: door.height },
  ].filter((segment) => segment.width > 0))
}

export function placementTransform(placement, itemDef) {
  if (!placement || !itemDef || !rotations.has(placement.rot)) return null
  const rotated = placement.rot === 90 || placement.rot === 270
  const width = rotated ? itemDef.footprint.d : itemDef.footprint.w
  const depth = rotated ? itemDef.footprint.w : itemDef.footprint.d
  if (!Number.isInteger(placement.cx) || !Number.isInteger(placement.cz)) return null
  if (placement.cx < 0 || placement.cz < 0 || placement.cx + width > ROOM.cellsW || placement.cz + depth > ROOM.cellsD) return null
  return {
    x: (placement.cx + width / 2 - ROOM.cellsW / 2) * ROOM.cellM,
    z: (placement.cz + depth / 2 - ROOM.cellsD / 2) * ROOM.cellM,
    rotY: placement.rot * Math.PI / 180,
  }
}

export function roomBounds() {
  return Object.freeze({
    minX: -ROOM.cellsW * ROOM.cellM / 2,
    maxX: ROOM.cellsW * ROOM.cellM / 2,
    minZ: -ROOM.cellsD * ROOM.cellM / 2,
    maxZ: ROOM.cellsD * ROOM.cellM / 2,
    width: ROOM.cellsW * ROOM.cellM,
    depth: ROOM.cellsD * ROOM.cellM,
    height: ROOM.wallH,
  })
}
