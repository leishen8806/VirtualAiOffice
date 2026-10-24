import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  PLACE_NAVIGATION,
  currentPlace,
  mountPlaceBar,
  placeNavigation,
} from '../place-bar.js'
import {
  PLACE_ID_BY_LANDMARK,
  placeIdForLandmark,
} from '../town-map-core.js'
import { townNavClientScript, townNavEnabled } from '../town-nav.mjs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('place navigation maps both locations and their professional workbenches', () => {
  assert.deepEqual(placeNavigation('office-zixu-workshop'), PLACE_NAVIGATION.office)
  assert.deepEqual(placeNavigation('dr-logistics-campus'), PLACE_NAVIGATION.dr)
  assert.deepEqual(PLACE_ID_BY_LANDMARK, {
    'office-zixu-workshop': 'drlife-office',
    'dr-logistics-campus': 'drlife-warehouse',
  })
  assert.equal(placeIdForLandmark('office-zixu-workshop'), 'drlife-office')
  assert.equal(placeIdForLandmark('dr-logistics-campus'), 'drlife-warehouse')
  assert.equal(
    PLACE_NAVIGATION.office.placeHref,
    '/?place=drlife-office&layout=3',
  )
  assert.equal(PLACE_NAVIGATION.office.workbenchHref, '/command-view.html')
  assert.equal(PLACE_NAVIGATION.dr.placeHref, '/?place=drlife-warehouse')
  assert.equal(PLACE_NAVIGATION.dr.workbenchHref, '/dr-console.html')
  assert.equal(currentPlace({ pathname: '/command-view.html', search: '' }).id, 'office')
  assert.equal(currentPlace({ pathname: '/', search: '?campus=1&place=dr' }).id, 'dr')
  assert.equal(currentPlace({ pathname: '/', search: '?place=drlife-warehouse' }).id, 'dr')
  assert.equal(currentPlace({ pathname: '/dr-console.html', search: '' }).id, 'dr')
})

function mockDocument() {
  const makeNode = (name) => ({
    name,
    children: [],
    textContent: '',
    className: '',
    attributes: {},
    append(...children) {
      this.children.push(...children)
    },
    prepend(...children) {
      this.children.unshift(...children)
    },
    setAttribute(key, value) {
      this.attributes[key] = value
    },
    querySelectorAll(selector) {
      const matches = []
      const visit = (node) => {
        if (selector.startsWith('span') && node.name === 'span') matches.push(node)
        for (const child of node.children || []) visit(child)
      }
      visit(this)
      return matches
    },
  })
  const body = makeNode('body')
  body.dataset = { company: 'DR.LIFE' }
  return {
    body,
    head: makeNode('head'),
    createElement: makeNode,
    getElementById: () => null,
  }
}

test('place bar renders canonical place hrefs', () => {
  const officeDocument = mockDocument()
  const officeBar = mountPlaceBar({
    config: { enabled: true },
    documentRef: officeDocument,
    locationRef: { pathname: '/', search: '?place=office' },
  })
  const officeLinks = officeBar.children.filter((node) => node.name === 'a')
  assert.deepEqual(
    officeLinks.map((link) => [link.textContent, link.href]),
    [
      ['返回小镇', '/town.html'],
      ['前往DR 仓配服务中心', '/?place=drlife-warehouse'],
      ['AI 团队指挥中心', '/command-view.html'],
    ],
  )

  const warehouseDocument = mockDocument()
  const warehouseBar = mountPlaceBar({
    config: { enabled: true },
    documentRef: warehouseDocument,
    locationRef: { pathname: '/', search: '?place=drlife-warehouse' },
  })
  const warehouseLinks = warehouseBar.children.filter((node) => node.name === 'a')
  assert.deepEqual(
    warehouseLinks.map((link) => [link.textContent, link.href]),
    [
      ['返回小镇', '/town.html'],
      ['前往智序工场·办公室', '/?place=drlife-office&layout=3'],
      ['仓配调度中心', '/dr-console.html'],
    ],
  )
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
  assert.match(source, /placeNavigation\(placeIdForLandmark\(item\.id\)\)/)
  assert.match(source, /location\.assign\(target\.placeHref\)/)
  assert.match(read('place-bar.js'), /latestSearch\('drlife-office'\)/)
  assert.match(read('place-bar.js'), /latestSearch\('drlife-warehouse'\)/)
  assert.match(source, /办公室 · AI 团队指挥中心/)
  assert.match(source, /仓配地点 · 仓配调度中心/)
  assert.match(html, /id="placeTooltip"/)
  assert.doesNotMatch(source, /库存|订单|任务状态/)
})

test('town place transition resets after bfcache restore and cancelled navigation', () => {
  const source = read('town.js')
  const css = read('town.css')
  const placeBar = read('place-bar.js')
  const commandView = read('command-view.html')
  assert.match(source, /addEventListener\('pageshow',/)
  assert.match(source, /delete document\.body\.dataset\.placeTransition/)
  assert.match(source, /clearPlaceTransition\(true\)/)
  assert.match(source, /addEventListener\('pagehide',/)
  assert.match(source, /schedulePlaceTransitionFallback\(\{/)
  assert.match(source, /isPageLeaving: \(\) => pageLeaving/)
  const opacity = Number(css.match(/data-place-transition="true"[^}]*opacity:([.\d]+)/)?.[1])
  assert.ok(opacity >= 0.9, opacity)
  assert.doesNotMatch(placeBar + commandView, /placeTransition|data-place-transition/)
})
