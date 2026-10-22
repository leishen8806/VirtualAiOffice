import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CAMBODIA_CITIES, CAMBODIA_OUTLINE_GEO, CAMBODIA_OUTLINE_D, MAP_VIEW, projectLonLat } from '../dr-cambodia-outline.js'
import { MAP_NOTE, campusMapSvg, consoleMapLabels } from '../dr-console-map.js'

const city = id => CAMBODIA_CITIES.find(item => item.id === id)
const inside = (point, polygon) => {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

test('S2-11 shared projection keeps Cambodia north-up and every city in its geographic quadrant', () => {
  const phnomPenh = city('phnom-penh'), siemReap = city('siem-reap'), battambang = city('battambang'), poipet = city('poipet')
  const sihanoukville = city('sihanoukville'), kampot = city('kampot'), kampongCham = city('kampong-cham')
  for (const item of [siemReap, battambang, poipet]) assert.ok(item.x < phnomPenh.x && item.y < phnomPenh.y, `${item.name} must be northwest of Phnom Penh`)
  assert.ok(poipet.x < battambang.x)
  assert.ok(sihanoukville.x < phnomPenh.x && sihanoukville.y > phnomPenh.y)
  assert.ok(kampot.x < phnomPenh.x && kampot.y > phnomPenh.y)
  assert.ok(kampongCham.x > phnomPenh.x && kampongCham.y < phnomPenh.y)
  assert.ok(CAMBODIA_CITIES.every(item => !(item.x > phnomPenh.x && Math.abs(item.y - phnomPenh.y) < 1)))
})

test('S2-11 outline and cities share one bounded projection with Phnom Penh inside Cambodia', () => {
  assert.ok(CAMBODIA_OUTLINE_GEO.length >= 60 && CAMBODIA_OUTLINE_GEO.length <= 80)
  assert.ok(CAMBODIA_OUTLINE_GEO.every(([lon, lat]) => lon >= 102.3 && lon <= 107.6 && lat >= 10.4 && lat <= 14.7))
  const polygon = CAMBODIA_OUTLINE_GEO.map(([lon, lat]) => projectLonLat(lon, lat))
  assert.ok(polygon.every(point => point.x >= 0 && point.x <= MAP_VIEW.width && point.y >= 0 && point.y <= MAP_VIEW.height))
  assert.ok(CAMBODIA_CITIES.every(item => item.x >= 0 && item.x <= MAP_VIEW.width && item.y >= 0 && item.y <= MAP_VIEW.height))
  assert.ok(inside(city('phnom-penh'), polygon))
  assert.match(CAMBODIA_OUTLINE_D, /^M[\d.]+ [\d.]+L/)
})

test('S2-11b denser outline preserves Cambodia shape cues', () => {
  const north = CAMBODIA_OUTLINE_GEO.filter(([, lat]) => lat >= 14.25)
  assert.ok(north.length >= 10)
  assert.ok(Math.max(...north.map(([, lat]) => lat)) - Math.min(...north.map(([, lat]) => lat)) < .45)
  assert.ok(CAMBODIA_OUTLINE_GEO.some(([lon, lat]) => lon < 104.1 && lat < 10.7), 'southwest coast must extend west')
  assert.ok(CAMBODIA_OUTLINE_GEO.some(([lon, lat]) => lon > 107.3 && lat < 12.5), 'southeast border must protrude east')
})

test('S2-11b console labels stay inside the map and clear each other and the legend', () => {
  const boxes = consoleMapLabels()
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y - a.height < b.y && a.y > b.y - b.height
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.x + box.width <= MAP_VIEW.width && box.y - box.height >= 0 && box.y <= MAP_VIEW.height, box.id)
    assert.equal(overlaps(box, MAP_NOTE), false, `${box.id} overlaps map legend`)
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false, `${boxes[i].id} overlaps ${boxes[j].id}`)
})

test('S2-11 console map is deterministic, city-only and keeps W labels in the campus flow view', async () => {
  assert.equal(campusMapSvg('ALL'), campusMapSvg('ALL'))
  const svg = campusMapSvg('W2')
  for (const name of ['金边', '暹粒', '马德望', '波贝', '西哈努克港', '贡布', '磅湛']) assert.match(svg, new RegExp(`>${name}<`))
  assert.doesNotMatch(svg, /(?:金边|暹粒|马德望|波贝|西哈努克港|贡布|磅湛)[^<]{0,8}W[123]|data-zone="W[123]"/)
  const html = await readFile(new URL('../dr-console.html', import.meta.url), 'utf8')
  for (const zone of ['W1', 'W2', 'W3']) assert.match(html, new RegExp(`data-zone="${zone}"`))
})

test('S2-11 shared map data stays pure and offline', async () => {
  const source = await readFile(new URL('../dr-cambodia-outline.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fs|fetch|Date\.now|Math\.random|innerHTML)\b|office-/)
})
