import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { coarsenGeo, DR_CAMPUS_GEO, OFFICE_GEO } from '../office-geo.mjs'
import { loadTownMap } from '../town-map.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const serverSource = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8')
const mapSource = fs.readFileSync(path.join(root, 'town-map.mjs'), 'utf8')
const townSource = fs.readFileSync(path.join(root, 'town.js'), 'utf8')

test('office geo is frozen, complete and within Phnom Penh bounds', () => {
  assert.equal(Object.isFrozen(OFFICE_GEO), true)
  assert.deepEqual(Object.keys(OFFICE_GEO), ['name', 'address', 'lat', 'lon', 'tz', 'note'])
  assert.equal(OFFICE_GEO.name, '智序工场')
  assert.equal(OFFICE_GEO.address, '13b Ke Nou St. (9), Phnom Penh')
  assert.equal(OFFICE_GEO.lat, 11.5536458)
  assert.equal(OFFICE_GEO.lon, 104.9318027)
  assert.equal(OFFICE_GEO.tz, 'Asia/Phnom_Penh')
  assert.match(OFFICE_GEO.note, /示意/)
  assert.ok(OFFICE_GEO.lat >= -90 && OFFICE_GEO.lat <= 90)
  assert.ok(OFFICE_GEO.lon >= -180 && OFFICE_GEO.lon <= 180)
})

test('restricted geo rounds to hundredths while exact geo remains available to callers', () => {
  assert.deepEqual(coarsenGeo(OFFICE_GEO.lat, OFFICE_GEO.lon), { lat: 11.55, lon: 104.93 })
  assert.deepEqual(coarsenGeo(DR_CAMPUS_GEO.lat, DR_CAMPUS_GEO.lon), { lat: 11.53, lon: 104.97 })
  assert.deepEqual(coarsenGeo(11.5549, 104.9349), { lat: 11.55, lon: 104.93 })
})

test('DR campus geo is frozen, exact and no longer described as a示意 point', () => {
  assert.equal(Object.isFrozen(DR_CAMPUS_GEO), true)
  assert.deepEqual(DR_CAMPUS_GEO, {
    name: 'DR 仓配服务中心',
    lat: 11.5337037,
    lon: 104.9725248,
    tz: 'Asia/Phnom_Penh',
    note: '董事会 2026-10-22 确认的现实定位',
  })
  assert.doesNotMatch(DR_CAMPUS_GEO.note, /示意/)
})

test('server derives PNH and weather URL from OFFICE_GEO without changing timezone flow', () => {
  assert.match(serverSource, /import \{ coarsenGeo, OFFICE_GEO \} from '\.\/office-geo\.mjs'/)
  assert.match(serverSource, /const PNH = \{ lat: OFFICE_GEO\.lat, lon: OFFICE_GEO\.lon, tz: OFFICE_GEO\.tz \}/)
  assert.match(serverSource, /latitude=\$\{PNH\.lat\}&longitude=\$\{PNH\.lon\}/)
  assert.match(serverSource, /location: \{ lat: PNH\.lat, lon: PNH\.lon \}/)
  assert.match(serverSource, /const fx = \(\(PNH\.lon \+ 180\) \/ 360\) \* n/)
  assert.match(serverSource, /const fy = \(\(1 - Math\.log/)
})

test('town map appends the projected office landmark and computes Khan by polygon', () => {
  const map = loadTownMap({ file: path.join(root, 'town-map.json') })
  const data = map.view()
  const office = data.layers.landmarks.find((item) => item.id === 'office-zixu-workshop')
  assert.ok(office)
  assert.equal(office.name, '智序工场·办公室')
  assert.deepEqual(office.point.map((value) => Math.round(value * 100) / 100), [2923.05, -1807.79])
  assert.equal(office.khan, 'Khan Chamkar Mon')
  assert.equal(office.address, OFFICE_GEO.address)
  assert.match(office.note, /示意位置/)
  assert.equal(map.ready(), true)
})

test('town map projects DR campus and computes its Khan from the existing polygons', () => {
  const map = loadTownMap({ file: path.join(root, 'town-map.json') })
  const campus = map.view().layers.landmarks.find((item) => item.id === 'dr-logistics-campus')
  assert.ok(campus)
  assert.equal(campus.name, 'DR 仓配服务中心')
  assert.deepEqual(campus.point.map((value) => Math.round(value * 100) / 100), [7364.12, -4012.19])
  assert.equal(campus.khan, 'Khan Chbar Ampov')
  assert.equal(campus.lat, DR_CAMPUS_GEO.lat)
  assert.equal(campus.lon, DR_CAMPUS_GEO.lon)
  assert.equal(campus.note, DR_CAMPUS_GEO.note)
  assert.doesNotMatch(campus.name + campus.note, /示意/)
})

test('LAN/wall map view removes exact coordinates and coarse-grids both places', () => {
  const map = loadTownMap({ file: path.join(root, 'town-map.json') })
  const local = JSON.parse(map.handle({ method: 'GET' }).body)
  const restricted = JSON.parse(map.handle({ method: 'GET', redactOffice: true }).body)
  const localOffice = local.layers.landmarks.find((item) => item.id === 'office-zixu-workshop')
  const restrictedOffice = restricted.layers.landmarks.find((item) => item.id === 'office-zixu-workshop')
  const localCampus = local.layers.landmarks.find((item) => item.id === 'dr-logistics-campus')
  const restrictedCampus = restricted.layers.landmarks.find((item) => item.id === 'dr-logistics-campus')
  assert.equal(localOffice.address, OFFICE_GEO.address)
  assert.equal('address' in restrictedOffice, false)
  assert.equal('lat' in restrictedOffice, false)
  assert.equal('lon' in restrictedOffice, false)
  assert.deepEqual(restrictedOffice.point, [3000, -2000])
  assert.equal(restrictedOffice.note, '示意位置')
  assert.equal(localCampus.lat, DR_CAMPUS_GEO.lat)
  assert.equal(localCampus.lon, DR_CAMPUS_GEO.lon)
  assert.equal('lat' in restrictedCampus, false)
  assert.equal('lon' in restrictedCampus, false)
  assert.deepEqual(restrictedCampus.point, [7500, -4000])
  assert.equal(restrictedCampus.khan, localCampus.khan)
  assert.equal(restrictedCampus.note, '粗化位置')
  const restrictedText = JSON.stringify(restricted)
  assert.doesNotMatch(restrictedText, /11\.5337037|104\.9725248|11\.53370|104\.97252/)
  assert.notEqual(map.handle({ method: 'GET' }).headers.ETag, map.handle({ method: 'GET', redactOffice: true }).headers.ETag)
})

test('restricted world and wall outputs never serialize exact office coordinates', () => {
  assert.match(serverSource, /coarsenGeo\(value\.weather\.location\.lat, value\.weather\.location\.lon\)/)
  assert.match(serverSource, /const restricted = lanUser \|\| wallScope/)
  assert.match(serverSource, /wallData\(lanUser \|\| wallScope\)/)
  const exact = JSON.stringify({ lat: OFFICE_GEO.lat, lon: OFFICE_GEO.lon })
  const coarse = JSON.stringify(coarsenGeo(OFFICE_GEO.lat, OFFICE_GEO.lon))
  assert.equal(exact.includes('11.5536458'), true)
  assert.equal(coarse.includes('11.5536458'), false)
  assert.equal(coarse.includes('104.9318027'), false)
})

test('town browser renders both API place markers without embedding DR exact coordinates', () => {
  assert.match(townSource, /office-zixu-workshop/)
  assert.match(townSource, /dr-logistics-campus/)
  assert.match(townSource, /collectLabelCandidates\(\{ data, view, width: cssWidth, height: cssHeight, mode: labelMode, places \}\)/)
  assert.doesNotMatch(townSource, /11\.5337037|104\.9725248|7364\.121/)
  assert.doesNotMatch(townSource, /虚构位置/)
  assert.doesNotMatch(mapSource, /\b(?:fetch|Math\.random|Date\.now)\b/)
})
