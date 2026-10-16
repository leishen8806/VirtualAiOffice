/* P5-1: 3D 座位坐标换算锁表。
 * 每个座位由 2D 办公室的 ZONE_POSITIONS（cx, cy, angle）按冻结规则换算成 3D 世界坐标：
 *   地面原点取中心，1 个 2D 逻辑单位 = 0.02 米
 *   x = cx * 0.02 - 16
 *   z = cy * 0.02 - 9
 *   yaw(度) = angle 原样透传
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function loadModule(relPath) {
  const src = fs.readFileSync(new URL(relPath, import.meta.url), 'utf8')
  const sb = { module: { exports: {} } }
  sb.globalThis = sb
  vm.createContext(sb)
  vm.runInContext(src, sb)
  return sb.module.exports
}

const ZONE_POSITIONS = loadModule('../public/core/core-office-v2.js').ZONE_POSITIONS
const VAOOffice3DCoords = loadModule('../public/core/office-3d-coords.js')

// 期望表（单位 m，x/z 误差 < 1e-9）
const EXPECTED = {
  product:   { x: -11.4, z: -3.64, yaw: 15 },
  architect: { x: -7.8,  z: -2.16, yaw: 10 },
  frontend:  { x: -11.6, z: 2.16,  yaw: 18 },
  backend:   { x: -8.0,  z: 3.52,  yaw: 14 },
  qa:        { x: 8.8,   z: -2.6,  yaw: -14 },
  reviewer:  { x: 12.0,  z: -1.12, yaw: -18 },
  docs:      { x: -7.6,  z: 7.2,   yaw: 8 },
  helix:     { x: 0.2,   z: 2.96,  yaw: 0 },
  human:     { x: 10.2,  z: 7.4,   yaw: 0 },
}

test('constants match the frozen conversion contract', () => {
  assert.equal(VAOOffice3DCoords.SCALE, 0.02)
  assert.equal(VAOOffice3DCoords.ORIGIN_X, 16)
  assert.equal(VAOOffice3DCoords.ORIGIN_Z, 9)
})

test('every ZONE_POSITIONS seat converts to the locked 3D world coordinate', () => {
  for (const [roleId, pos] of Object.entries(ZONE_POSITIONS)) {
    const expected = EXPECTED[roleId]
    assert.ok(expected, `ZONE_POSITIONS has an unexpected key: ${roleId}`)
    const world = VAOOffice3DCoords.seatToWorld(pos)
    assert.ok(Math.abs(world.x - expected.x) < 1e-9, `${roleId}: x=${world.x}, expected ~${expected.x}`)
    assert.ok(Math.abs(world.z - expected.z) < 1e-9, `${roleId}: z=${world.z}, expected ~${expected.z}`)
    assert.equal(world.yaw, pos.angle, `${roleId}: yaw must equal its 2D angle`)
  }
})

test('ZONE_POSITIONS keys are exactly the 9 locked seats', () => {
  assert.deepEqual(Object.keys(ZONE_POSITIONS).sort(), Object.keys(EXPECTED).sort())
})

test('toWorld boundaries and non-NaN guarantee', () => {
  const origin = VAOOffice3DCoords.toWorld(0, 0)
  // toWorld returns a vm-realm object; compare fields individually (not deepStrictEqual across realms).
  assert.equal(origin.x, -16)
  assert.equal(origin.z, -9)
  const far = VAOOffice3DCoords.toWorld(1600, 900)
  assert.equal(far.x, 16)
  assert.equal(far.z, 9)
  const w = VAOOffice3DCoords.toWorld(810, 598)
  assert.ok(Number.isFinite(Number(w.x)), 'x must not be NaN')
  assert.ok(Number.isFinite(Number(w.z)), 'z must not be NaN')
})