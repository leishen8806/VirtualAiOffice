import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import {
  LAYOUT_V1,
  LAYOUT_V2,
  LAYOUT_V3,
  LAYOUT_V3_ALIGN,
  LAYOUT_V3_ALIGN_L2B,
  LAYOUT_V3_ALIGN_SAMPLE,
  resolveOfficeLayout,
} from '../office-layout.js'

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
const layoutName = (search) => {
  const layout = resolveOfficeLayout(search)
  if (layout === LAYOUT_V1) return 'LAYOUT_V1'
  if (layout === LAYOUT_V2) return 'LAYOUT_V2'
  if (layout === LAYOUT_V3) return 'LAYOUT_V3'
  if (layout === LAYOUT_V3_ALIGN) return 'LAYOUT_V3_ALIGN'
  if (layout === LAYOUT_V3_ALIGN_SAMPLE) return 'LAYOUT_V3_ALIGN_SAMPLE'
  if (layout === LAYOUT_V3_ALIGN_L2B) return 'LAYOUT_V3_ALIGN_L2B'
  return 'unknown'
}

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

test('ENTRANCE-1 preserves the baseline parse matrix except the new latest office query', () => {
  const baseline = [
    ['empty', '', 'f0d76817f147618325bce8a9acbfa46fe3f63ef8ccb6d9df38b70c1f921ce23e', 'LAYOUT_V1'],
    ['canonical office', '?place=drlife-office', '8c1832972fbea6998cc4959bbf87dc1e206d5903597b8cf959cca40fb3240fab', 'LAYOUT_V1'],
    ['stable V3', '?place=drlife-office&layout=3', 'e33e8499531a68272908619cbdc2b3ac1720148c0d8026e7480a52ee2355db74', 'LAYOUT_V3'],
    // OFFICE-L2B-B3 起，精确样板入口默认解析到 L2B（ENTRANCE-1 写这条测试时还是 L2 样板）。
    ['new latest sample', '?place=drlife-office&layout=3&align=1&officeSample=1', 'e33e8499531a68272908619cbdc2b3ac1720148c0d8026e7480a52ee2355db74', 'LAYOUT_V3_ALIGN_L2B'],
    ['warehouse latest', '?place=drlife-warehouse', '9a611052a0767ced059d37faba83ff6c42442bf870be0b9cc71ebb174bccd612', 'LAYOUT_V1'],
    ['layout 2', '?layout=2', '4a4415a9df99c3d5263f66afddf4ee20432379ee9901d8fa97ac5efe9af430b0', 'LAYOUT_V2'],
    ['ALIGN without sample', '?layout=3&align=1', '3f4e4925cee7cb49874f475a0782610dd3fcdc2a356f19e31ff50d9839b02598', 'LAYOUT_V3_ALIGN'],
    ['campus preview', '?campus=1', '97a90876ce07b7b6639a5326f49f79a116d8e54c565b977de7c12c2ee5b0bb04', 'LAYOUT_V1'],
    ['legacy office', '?place=office', 'f0d76817f147618325bce8a9acbfa46fe3f63ef8ccb6d9df38b70c1f921ce23e', 'LAYOUT_V1'],
    ['legacy warehouse', '?place=dr', '7c27943e311b9ba04ac46db4e257da0f26c04aecd0a2b41f11746af0971976f8', 'LAYOUT_V1'],
    ['uppercase value', '?place=DRLIFE-OFFICE', '8c1832972fbea6998cc4959bbf87dc1e206d5903597b8cf959cca40fb3240fab', 'LAYOUT_V1'],
    ['uppercase key', '?Place=drlife-office', 'f0d76817f147618325bce8a9acbfa46fe3f63ef8ccb6d9df38b70c1f921ce23e', 'LAYOUT_V1'],
    ['duplicate place', '?place=drlife-office&place=drlife-office', '8c1832972fbea6998cc4959bbf87dc1e206d5903597b8cf959cca40fb3240fab', 'LAYOUT_V1'],
    ['duplicate latest shape', '?place=drlife-office&place=drlife-office&layout=3&align=1&officeSample=1', '8c1832972fbea6998cc4959bbf87dc1e206d5903597b8cf959cca40fb3240fab', 'LAYOUT_V3_ALIGN_L2B'],
  ]
  for (const [label, search, baselineHash, baselineLayout] of baseline) {
    const mode = resolvePlaceMode(search)
    const hash = createHash('sha256').update(JSON.stringify(mode)).digest('hex')
    assert.equal(layoutName(search), baselineLayout, `${label}: office layout`)
    if (label === 'new latest sample') {
      const stableV3 = resolvePlaceMode('?place=drlife-office&layout=3')
      assert.deepEqual({ ...mode, subtitle: stableV3.subtitle }, stableV3, 'only the new latest route subtitle changes')
      assert.equal(mode.subtitle, '最新版 · 办公室样板')
      assert.notEqual(hash, baselineHash)
    } else {
      assert.equal(hash, baselineHash, `${label}: full resolvePlaceMode result`)
    }
  }
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
      align: 1,
      officeSample: 1,
      r1: 1,
      subtitle: '最新版 · 办公室样板',
    },
    warehouse: {},
  })
  assert.ok(Object.isFrozen(PLACE_LATEST))
  assert.ok(Object.isFrozen(PLACE_LATEST.office))
  assert.ok(Object.isFrozen(PLACE_LATEST.warehouse))
  assert.equal(
    latestSearch('drlife-office'),
    '?place=drlife-office&layout=3&align=1&officeSample=1&r1=1',
  )
  assert.equal(
    latestSearch('drlife-warehouse'),
    '?place=drlife-warehouse',
  )
  assert.equal(
    latestSearch('unknown-place'),
    '?place=drlife-office&layout=3&align=1&officeSample=1&r1=1',
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
          ? '最新版 · rev3 开发中'
          : '连接中…',
      )
    }
  }
  assert.equal(
    resolvePlaceMode(latestSearch('drlife-office')).subtitle,
    PLACE_LATEST.office.subtitle,
  )
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

test('latest office subtitle survives connection updates only on the generated latest route', () => {
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
  assert.equal(maintainLatestSubtitle({
    search: '?place=drlife-office&layout=3',
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
  assert.match(app, /const MINI = DR_MODE \? PLACE_MODE\.miniBounds : OFFICE_LAYOUT\.r1Phase === 'R1' \? OFFICE_LAYOUT\.miniBounds : MINI_BOUNDS/)
  assert.match(app, /isolateDrPlace\(\{ scene, campusRoot: campusRegistry\?\.root/)
  assert.match(view, /root === campusRoot \|\| keepRoots\.includes\(root\) \|\| root\.isLight \|\| environmentRoots\.has\(root\)/)
  assert.doesNotMatch(view, /\bfetch\b|XMLHttpRequest|WebSocket|setInterval/)
  assert.match(html, /body\.place-dr \.chips/)
  assert.match(html, /id="drPanel"/)
  assert.match(html, /href="\/dr-console\.html"/)
  assert.match(html, /href="\/town\.html"/)
  assert.doesNotMatch(html.match(/<section id="drPanel"[\s\S]*?<\/section>/)?.[0] || '', /智序工场|办公室|AI 同事|Paperclip|\d+\s*㎡/)
})
