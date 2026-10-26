import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
test('R5 moves exactly six east town buildings outside the campus with road and paving clearance', async () => {
  const source = await readFile(new URL('../env.js', import.meta.url), 'utf8')
  assert.match(source, /export const EAST_TOWN_BUILDING_X = -53/)
  assert.match(source, /EAST_TOWN_BUILDING_Z = Object\.freeze\(\[-30, -18, -6, 6, 18, 30\]\)/)
  assert.match(source, /EAST_TOWN_BUILDING_BOUNDS = Object\.freeze\(\{ x0: -58, x1: -48, westRoadClearance: 6, pavingClearance: 2 \}\)/)
  assert.match(source, /EAST_TOWN_ROAD_BOUNDS = Object\.freeze\(\{ x0: -78, x1: -66, z0: -110, z1: 110 \}\)/)
  assert.match(source, /town-east-building-\$\{\+\+eastBuilding\}/)
  assert.match(source, /road\(12, 220, -72, 0, 'town-road-east'\)/)
  assert.doesNotMatch(source, /m\.rotation\.z = rot/)
  assert.doesNotMatch(source, /m\.rotation\.y = rot/)
  assert.match(source, /if \(clearsD03Turn\) \{ x -= 8; z -= 10 \}/)
  assert.match(source, /clearsD03Turn \? 'd03-turn-palm' : ''/)
})

test('R5 keeps town navigation independent of the moved east city building row', async () => {
  const source = await readFile(new URL('../town.html', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /EAST_TOWN_BUILDING|town-east-building/)
})
