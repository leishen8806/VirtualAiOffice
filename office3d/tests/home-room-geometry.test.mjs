import assert from 'node:assert/strict'
import test from 'node:test'
import { getItem } from '../town/home-catalog.mjs'
import { occupiedCells } from '../town/home-space.mjs'
import { ROOM, cellToLocal, doorOpening, localToCell, placementTransform, roomBounds, wallSegments } from '../home-room-geometry.mjs'

test('all room cells round trip between grid and local coordinates', () => {
  for (let cz = 0; cz < ROOM.cellsD; cz++) {
    for (let cx = 0; cx < ROOM.cellsW; cx++) {
      const local = cellToLocal(cx, cz)
      assert.deepEqual(localToCell(local.x, local.z), { cx, cz })
    }
  }
})

test('south wall has a centered one metre door opening and closed remaining walls', () => {
  const door = doorOpening()
  assert.deepEqual(door, { cx0: 7, cx1: 8, cz: 11, width: 1, height: 2.2 })
  const segments = wallSegments()
  assert.equal(segments.filter((item) => item.side.startsWith('south')).length, 3)
  assert.equal(segments.filter((item) => item.side === 'north').length, 1)
  assert.equal(segments.filter((item) => item.side === 'west').length, 1)
  assert.equal(segments.filter((item) => item.side === 'east').length, 1)
  assert.equal(segments.filter((item) => item.side === 'south-west')[0].width, 3.5)
  assert.equal(segments.filter((item) => item.side === 'south-east')[0].width, 3.5)
  assert.equal(segments.filter((item) => item.side === 'south-header')[0].height, 0.8)
})

test('room bounds and placement centers use the half metre grid', () => {
  assert.deepEqual(roomBounds(), { minX: -4, maxX: 4, minZ: -3, maxZ: 3, width: 8, depth: 6, height: 3 })
  const item = getItem('bed_single')
  for (const rot of [0, 90, 180, 270]) {
    const placement = { cx: 2, cz: 3, rot }
    const transform = placementTransform(placement, item)
    const cells = occupiedCells(item, placement.cx, placement.cz, placement.rot)
    const minX = Math.min(...cells.map((cell) => cell.cx))
    const maxX = Math.max(...cells.map((cell) => cell.cx))
    const minZ = Math.min(...cells.map((cell) => cell.cz))
    const maxZ = Math.max(...cells.map((cell) => cell.cz))
    const center = {
      x: ((minX + maxX + 1) / 2 - ROOM.cellsW / 2) * ROOM.cellM,
      z: ((minZ + maxZ + 1) / 2 - ROOM.cellsD / 2) * ROOM.cellM,
    }
    assert.deepEqual({ x: transform.x, z: transform.z }, center)
    assert.equal(transform.rotY, rot * Math.PI / 180)
  }
})

test('out of bounds local coordinates and invalid placements are rejected', () => {
  assert.equal(localToCell(-4.1, 0), null)
  assert.equal(localToCell(0, 3.1), null)
  assert.equal(placementTransform({ cx: 20, cz: 0, rot: 0 }, getItem('bed_single')), null)
  assert.equal(placementTransform({ cx: 1, cz: 1, rot: 45 }, getItem('bed_single')), null)
})
