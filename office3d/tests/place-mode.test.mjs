import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  DEFAULT_OFFICE_LAYOUT,
  DR_CAMERA_VIEWS,
  LEGACY_DR_CAMERA_KEY,
  PLACE_LATEST,
  PLACE_TENANTS,
  cameraStorageKeys,
  latestSearch,
  maintainLatestSubtitle,
  normalizeCameraState,
  resolvePlaceMode,
} from '../place-mode.js'
import { currentPlace } from '../place-bar.js'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const oldFields = ({
  place,
  campus,
  title,
  brand,
  subtitle,
  miniBounds,
  cameraViews,
  homeCamera,
  zones,
  controlRoom,
}) => ({
  place,
  campus,
  title,
  brand,
  subtitle,
  ...(miniBounds ? { miniBounds } : {}),
  ...(cameraViews ? { cameraViews } : {}),
  ...(homeCamera ? { homeCamera } : {}),
  ...(zones ? { zones } : {}),
  ...(controlRoom ? { controlRoom } : {}),
})

test('place mode resolves strict URL parameter matrix', () => {
  assert.deepEqual(
    [
      '',
      '?place=office',
      '?layout=2',
      '?place=unknown',
      '?place=DR',
      '?Place=dr',
      '?place=dr&place=dr',
    ].map((search) => resolvePlaceMode(search).place),
    Array(7).fill('office'),
  )
  assert.equal(resolvePlaceMode('').campus, false)
  assert.equal(resolvePlaceMode('?layout=2').campus, false)
  assert.equal(resolvePlaceMode('?campus=1').campus, true)
  assert.equal(resolvePlaceMode('?place=office&campus=1').campus, true)
  assert.equal(resolvePlaceMode('?campus=1&campus=1').campus, false)
  assert.equal(resolvePlaceMode('?place=dr').place, 'dr')
  assert.equal(resolvePlaceMode('?place=dr').campus, true)
  assert.equal(resolvePlaceMode('?campus=1&place=dr').place, 'dr')
})

test('legacy URLs preserve every pre-NAV-2 field', () => {
  const office = {
    place: 'office',
    campus: false,
    title: '智序工场 · 办公室 3D',
    brand: '智序工场 · 办公室',
    subtitle: '连接中…',
  }
  assert.deepEqual(oldFields(resolvePlaceMode('')), office)
  assert.deepEqual(oldFields(resolvePlaceMode('?place=office')), office)
  assert.deepEqual(
    oldFields(resolvePlaceMode('?campus=1')),
    { ...office, campus: true },
  )
  assert.deepEqual(
    oldFields(resolvePlaceMode('?place=office&campus=1')),
    { ...office, campus: true },
  )

  const warehouse = resolvePlaceMode('?place=dr')
  assert.deepEqual(oldFields(warehouse), {
    place: 'dr',
    campus: true,
    title: 'DR 仓配服务中心 · 智序小镇',
    brand: 'DR 仓配服务中心',
    subtitle: '仓配地点 · 演示场景',
    miniBounds: warehouse.miniBounds,
    cameraViews: DR_CAMERA_VIEWS,
    homeCamera: DR_CAMERA_VIEWS[0],
    zones: warehouse.zones,
  })
  assert.deepEqual(
    oldFields(resolvePlaceMode('?campus=1&place=dr&controlRoom=1')),
    { ...oldFields(warehouse), controlRoom: true },
  )
})

test('canonical and legacy place spellings are equivalent', () => {
  const equivalents = [
    ['?place=office', '?place=drlife-office'],
    ['?place=dr', '?place=drlife-warehouse'],
    ['?campus=1&place=dr', '?campus=1&place=drlife-warehouse'],
  ]
  for (const [legacySearch, canonicalSearch] of equivalents) {
    const legacy = resolvePlaceMode(legacySearch)
    const canonical = resolvePlaceMode(canonicalSearch)
    assert.deepEqual(
      { ...legacy, legacy: false },
      canonical,
      `${legacySearch} ≡ ${canonicalSearch}`,
    )
    assert.equal(legacy.legacy, true)
    assert.equal(canonical.legacy, false)
  }
})

test('latest channel is frozen and generates complete place searches', () => {
  assert.deepEqual(PLACE_LATEST, {
    office: {
      layout: 3,
      subtitle: '最新版 · rev3 开发中',
    },
    warehouse: {},
  })
  assert.ok(Object.isFrozen(PLACE_LATEST))
  assert.ok(Object.isFrozen(PLACE_LATEST.office))
  assert.ok(Object.isFrozen(PLACE_LATEST.warehouse))
  assert.equal(
    latestSearch('drlife-office'),
    '?place=drlife-office&layout=3',
  )
  assert.equal(
    latestSearch('drlife-warehouse'),
    '?place=drlife-warehouse',
  )
  assert.equal(
    latestSearch('unknown-place'),
    '?place=drlife-office&layout=3',
  )
})

test('office layout metadata follows valid URL values and fails closed', () => {
  for (const place of ['drlife-office', 'office']) {
    for (const layout of [1, 2, 3]) {
      const mode = resolvePlaceMode(`?place=${place}&layout=${layout}`)
      assert.equal(mode.place, 'office')
      assert.equal(mode.layout, layout)
      assert.equal(
        mode.subtitle,
        layout === 3
          ? PLACE_LATEST.office.subtitle
          : '连接中…',
      )
    }
  }
  for (const search of [
    '?place=drlife-office&layout=0',
    '?place=drlife-office&layout=4',
    '?place=drlife-office&layout=03',
    '?place=drlife-office&layout=three',
    '?place=drlife-office&layout=2&layout=3',
  ]) {
    assert.equal(
      resolvePlaceMode(search).layout,
      DEFAULT_OFFICE_LAYOUT,
      search,
    )
  }
  assert.equal(resolvePlaceMode('?layout=2').layout, 2)
  assert.equal(
    resolvePlaceMode('?place=drlife-warehouse&layout=3').layout,
    null,
  )
})

test('latest office subtitle survives connection text updates only on layout 3', () => {
  const target = { textContent: '连接中…' }
  let sync = null
  const observer = {
    observeTarget: null,
    observeOptions: null,
  }
  class Observer {
    constructor(callback) {
      sync = callback
    }

    observe(observeTarget, observeOptions) {
      observer.observeTarget = observeTarget
      observer.observeOptions = observeOptions
    }
  }
  const documentRef = {
    getElementById: (id) => id === 'connText' ? target : null,
  }
  const mounted = maintainLatestSubtitle({
    search: latestSearch('drlife-office'),
    documentRef,
    Observer,
  })
  assert.ok(mounted)
  assert.equal(target.textContent, PLACE_LATEST.office.subtitle)
  assert.equal(observer.observeTarget, target)
  assert.deepEqual(observer.observeOptions, {
    childList: true,
    characterData: true,
    subtree: true,
  })
  target.textContent = '实时 · 每 3 秒刷新'
  sync()
  assert.equal(target.textContent, PLACE_LATEST.office.subtitle)
  assert.equal(maintainLatestSubtitle({
    search: '?place=drlife-office',
    documentRef,
    Observer,
  }), null)
})

test('canonical place metadata and invalid values fail closed', () => {
  assert.deepEqual(Object.keys(PLACE_TENANTS), ['drlife'])
  assert.ok(Object.isFrozen(PLACE_TENANTS))
  assert.ok(Object.isFrozen(PLACE_TENANTS.drlife))

  const office = resolvePlaceMode('?place=drlife-office')
  assert.equal(office.placeId, 'drlife-office')
  assert.equal(office.tenant, 'drlife')
  assert.equal(office.kind, 'office')
  assert.equal(office.layout, DEFAULT_OFFICE_LAYOUT)
  assert.equal(office.campus, false)

  const warehouse = resolvePlaceMode('?place=drlife-warehouse')
  assert.equal(warehouse.placeId, 'drlife-warehouse')
  assert.equal(warehouse.tenant, 'drlife')
  assert.equal(warehouse.kind, 'warehouse')
  assert.equal(warehouse.layout, null)
  assert.equal(warehouse.campus, true)

  const invalid = [
    '?place=acme-office',
    '?place=drlife-shop',
    '?place=drlife-Office',
    '?place=DRLIFE-office',
    '?place=drlife_office',
    '?place=-drlife-office',
    '?place=drlife--office',
    `?place=${'a'.repeat(33)}-office`,
    '?place=drlife-office&place=drlife-office',
  ]
  for (const search of invalid) {
    const mode = resolvePlaceMode(search)
    assert.equal(mode.place, 'office', search)
    assert.equal(mode.placeId, 'drlife-office', search)
    assert.equal(mode.campus, false, search)
  }
})

test('camera storage keys are place-scoped with one legacy DR fallback', () => {
  assert.deepEqual(
    cameraStorageKeys(resolvePlaceMode('?place=drlife-office')),
    ['office3d.camera.drlife-office'],
  )
  assert.deepEqual(
    cameraStorageKeys(resolvePlaceMode('?place=drlife-warehouse')),
    ['office3d.camera.drlife-warehouse', LEGACY_DR_CAMERA_KEY],
  )
})

test('DR mode exposes isolated copy, four campus cameras and fourteen demo zones', () => {
  const mode = resolvePlaceMode('?place=dr')
  assert.equal(mode.title, 'DR 仓配服务中心 · 智序小镇')
  assert.equal(mode.brand, 'DR 仓配服务中心')
  assert.equal(mode.subtitle, '仓配地点 · 演示场景')
  assert.deepEqual(DR_CAMERA_VIEWS.map((view) => view.label), ['全景', '货架月台', '调度中控', '前广场'])
  assert.ok(DR_CAMERA_VIEWS.every((view) => view.el >= 40 && view.el <= 50))
  assert.equal(mode.zones.length, 14)
  assert.ok(mode.zones.every((zone) => zone.label.endsWith('（示意）')))
})

test('stored DR camera accepts finite campus views and rejects invalid state', () => {
  const valid = { az: 125, el: 45, r: 55, t: [-120, 3, 12] }
  assert.deepEqual(normalizeCameraState(valid), { az: 125, el: 45, r: 55, t: [-120, 0, 12] })
  for (const invalid of [
    null,
    { az: 1, el: 100, r: 20, t: [-120, 0, 0] },
    { az: 1, el: 45, r: 20, t: [0, 0, 0] },
    { az: Number.NaN, el: 45, r: 20, t: [-120, 0, 0] },
  ]) {
    assert.equal(normalizeCameraState(invalid), DR_CAMERA_VIEWS[0])
  }
})

test('place bar treats campus-only preview as office and fails closed', () => {
  assert.equal(currentPlace({ pathname: '/', search: '?campus=1' }).id, 'office')
  assert.equal(currentPlace({ pathname: '/', search: '?place=dr' }).id, 'dr')
  assert.equal(currentPlace({ pathname: '/', search: '?place=drlife-warehouse' }).id, 'dr')
  assert.equal(currentPlace({ pathname: '/', search: '?place=drlife-office' }).id, 'office')
  assert.equal(currentPlace({ pathname: '/', search: '?place=DR' }).id, 'office')
  assert.equal(currentPlace({ pathname: '/', search: '?place=dr&place=dr' }).id, 'office')
})

test('main page wires DR isolation without changing office defaults', () => {
  const app = read('app.js')
  const view = read('dr-place-view.js')
  const html = read('index.html')
  assert.match(app, /const DR_MODE = PLACE_MODE\.place === 'dr'/)
  assert.match(app, /const CAMPUS_MODE = PLACE_MODE\.campus/)
  assert.match(app, /if \(DR_MODE\) \{[\s\S]*\} else \{[\s\S]*setInterval\(poll, POLL_MS\)/)
  assert.match(app, /if \(!DR_MODE\) \{[\s\S]*director\.update\(dt\)/)
  assert.match(app, /const MINI = DR_MODE \? PLACE_MODE\.miniBounds : MINI_BOUNDS/)
  assert.match(app, /isolateDrPlace\(\{ scene, campusRoot: campusRegistry\?\.root/)
  assert.match(view, /root === campusRoot \|\| keepRoots\.includes\(root\) \|\| root\.isLight \|\| environmentRoots\.has\(root\)/)
  assert.doesNotMatch(view, /\bfetch\b|XMLHttpRequest|WebSocket|setInterval/)
  assert.match(html, /body\.place-dr \.chips/)
  assert.match(html, /id="drPanel"/)
  assert.match(html, /href="\/dr-console\.html"/)
  assert.match(html, /href="\/town\.html"/)
  assert.doesNotMatch(html.match(/<section id="drPanel"[\s\S]*?<\/section>/)?.[0] || '', /智序工场|办公室|AI 同事|Paperclip|\d+\s*㎡/)
})
