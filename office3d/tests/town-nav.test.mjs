import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  PLACE_NAVIGATION,
  currentPlace,
  mountPlaceBar,
  placeNavigation,
} from '../place-bar.js'
import { townNavClientScript, townNavEnabled } from '../town-nav.mjs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('place navigation maps both locations and their professional workbenches', () => {
  assert.deepEqual(placeNavigation('office-zixu-workshop'), PLACE_NAVIGATION.office)
  assert.deepEqual(placeNavigation('dr-logistics-campus'), PLACE_NAVIGATION.dr)
  assert.equal(PLACE_NAVIGATION.office.placeHref, '/?place=office')
  assert.equal(PLACE_NAVIGATION.office.workbenchHref, '/command-view.html')
  assert.equal(PLACE_NAVIGATION.dr.placeHref, '/?campus=1&place=dr')
  assert.equal(PLACE_NAVIGATION.dr.workbenchHref, '/dr-console.html')
  assert.equal(currentPlace({ pathname: '/command-view.html', search: '' }).id, 'office')
  assert.equal(currentPlace({ pathname: '/', search: '?campus=1&place=dr' }).id, 'dr')
  assert.equal(currentPlace({ pathname: '/dr-console.html', search: '' }).id, 'dr')
})

test('town navigation switch fails closed and emits only a boolean client config', () => {
  assert.equal(townNavEnabled(), false)
  assert.equal(townNavEnabled(null), false)
  assert.equal(townNavEnabled({}), false)
  assert.equal(townNavEnabled({ enabled: false }), false)
  assert.equal(townNavEnabled({ enabled: 'true' }), false)
  assert.equal(townNavEnabled({ enabled: true }), true)
  assert.equal(townNavClientScript(false), 'globalThis.__TOWN_NAV__=Object.freeze({enabled:false})\n')
  assert.equal(townNavClientScript(true), 'globalThis.__TOWN_NAV__=Object.freeze({enabled:true})\n')
  assert.deepEqual(JSON.parse(read('town-nav.json')), { enabled: false })
})

test('disabled place bar performs zero DOM work', () => {
  const documentRef = {
    get body() {
      throw new Error('disabled place bar touched the page')
    },
  }
  assert.equal(mountPlaceBar({ config: { enabled: false }, documentRef }), null)
  assert.equal(mountPlaceBar({ config: {}, documentRef }), null)
  assert.equal(mountPlaceBar({ config: null, documentRef }), null)
})

test('place bar is navigation-only and contains no request or write primitives', () => {
  const source = read('place-bar.js')
  assert.doesNotMatch(source, /\bfetch\b|XMLHttpRequest|WebSocket|innerHTML|Math\.random|Date\.now|setInterval|setTimeout/)
  assert.doesNotMatch(source, /\/act|\/state|POST|PATCH|PUT|DELETE|Paperclip/)
  assert.match(source, /documentRef\.body\.dataset\.company \|\| '–'/)
  assert.match(source, /aria-label', '地点导航'/)
  assert.match(source, /返回小镇/)
})

test('server reads town-nav once and command view uses two-line bar wiring', () => {
  const server = read('server.mjs')
  const html = read('command-view.html')
  assert.equal((server.match(/readFileSync\(path\.join\(HERE, 'town-nav\.json'\)/g) || []).length, 1)
  assert.match(server, /TOWN_NAV_ENABLED = townNavEnabled/)
  assert.match(server, /url\.pathname === '\/town-nav-config\.js'/)
  assert.match(server, /'Cache-Control': 'no-store'/)
  const configAt = html.indexOf('<script src="/town-nav-config.js"></script>')
  const barAt = html.indexOf('<script type="module" src="/place-bar.js"></script>')
  const pageAt = html.indexOf('<script type="module" src="/command-view.js"></script>')
  assert.ok(configAt > 0 && configAt < barAt && barAt < pageAt)
  assert.equal((html.match(/town-nav-config\.js|place-bar\.js/g) || []).length, 2)
  assert.doesNotMatch(read('dr-console.html'), /place-bar|town-nav-config/)
})

test('town markers stay visible and navigable independently of town-nav switch', () => {
  const source = read('town.js')
  const html = read('town.html')
  const map = read('town-map.mjs')
  assert.deepEqual(JSON.parse(read('town-nav.json')), { enabled: false })
  assert.doesNotMatch(html, /town-nav-config|__TOWN_NAV__/)
  assert.doesNotMatch(source, /town-nav-config|__TOWN_NAV__|townNavEnabled/)
  assert.match(map, /id: 'office-zixu-workshop'/)
  assert.match(map, /id: 'dr-logistics-campus'/)
  assert.match(source, /import \{ placeNavigation \} from '\.\/place-bar\.js'/)
  assert.match(source, /location\.assign\(target\.placeHref\)/)
  assert.match(source, /办公室 · AI 团队指挥中心/)
  assert.match(source, /仓配地点 · 仓配调度中心/)
  assert.match(html, /id="placeTooltip"/)
  assert.doesNotMatch(source, /库存|订单|任务状态/)
})
