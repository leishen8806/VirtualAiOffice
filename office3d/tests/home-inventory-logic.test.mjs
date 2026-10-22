import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { starterInventory } from '../town/home-space.mjs'
import { CATALOG } from '../town/home-catalog.mjs'
import { canShowHomeEntry, filterInventory, inventoryRows, inventorySummary, INVENTORY_CATEGORIES } from '../home-inventory-logic.mjs'
import * as browserLogic from '../home-inventory.js'
import { validateItemParameter } from '../home-editor-logic.js'

test('starter inventory totals sixteen instances and twelve types', () => {
  const inventory = starterInventory()
  const rows = inventoryRows(inventory)
  assert.deepEqual(inventorySummary(rows), { types: 12, owned: 16, placed: 0, remaining: 16 })
  assert.equal(rows.length, 12)
  for (const item of CATALOG) {
    const row = rows.find((entry) => entry.id === item.id)
    assert.equal(row.name, item.name)
    assert.equal(row.category, item.category)
    assert.deepEqual(row.footprint, item.footprint)
    assert.equal(row.source, '初始赠送')
  }
})

test('placement counts stay per-kind and do not consume inventory', () => {
  const inventory = starterInventory()
  const original = structuredClone(inventory)
  const rows = inventoryRows(inventory, { placements: [
    { itemId: 'chair_wood', itemInstanceId: 'chair_wood#1' },
    { itemId: 'bed_single', itemInstanceId: 'bed_single#1' },
  ] })
  assert.deepEqual(inventorySummary(rows), { types: 12, owned: 16, placed: 2, remaining: 14 })
  assert.equal(rows.find((row) => row.id === 'chair_wood').remaining, 2)
  assert.equal(rows.find((row) => row.id === 'plant_pot').remaining, 2)
  assert.deepEqual(inventory, original)
})

test('categories and search use deterministic stable ordering', () => {
  const rows = inventoryRows(starterInventory())
  assert.equal(Object.keys(INVENTORY_CATEGORIES).length, 6)
  assert.equal(filterInventory(rows, { category: 'furniture' }).length, 8)
  assert.equal(filterInventory(rows, { category: 'decor' }).length, 0)
  assert.equal(filterInventory(rows, { query: '木椅' })[0].id, 'chair_wood')
  assert.equal(filterInventory(rows, { query: 'CHAIR WOOD', category: 'furniture' })[0].id, 'chair_wood')
  assert.deepEqual(filterInventory(rows.slice().reverse()), filterInventory(rows))
  assert.deepEqual(filterInventory(rows, { query: '<script>' }), [])
})

test('entry is fail-closed for missing full access, LAN and wall views', () => {
  assert.equal(canShowHomeEntry(), false)
  assert.equal(canShowHomeEntry({ fullAccess: true }), true)
  for (const input of [
    { fullAccess: false }, { fullAccess: 'true' }, { fullAccess: true, lan: true },
    { fullAccess: true, wall: true }, { fullAccess: true, lan: true, wall: true },
  ]) assert.equal(canShowHomeEntry(input), false)
})

test('browser and Node inventory logic stay behaviorally identical', () => {
  for (const inventory of [[], starterInventory(), [{ itemId: 'plant_pot', itemInstanceId: 'p', source: 'grant' }]]) {
    for (const layout of [{}, { placements: [{ itemId: 'plant_pot', itemInstanceId: 'p' }] }]) {
      const rows = inventoryRows(inventory, layout)
      assert.deepEqual(browserLogic.inventoryRows(inventory, layout), rows)
      assert.deepEqual(browserLogic.inventorySummary(rows), inventorySummary(rows))
      for (const query of ['', '灯', '木椅', 'INVALID']) {
        for (const category of ['', ...Object.keys(INVENTORY_CATEGORIES)]) {
          assert.deepEqual(browserLogic.filterInventory(rows, { query, category }), filterInventory(rows, { query, category }))
        }
      }
    }
  }
  for (const input of [{}, { fullAccess: true }, { fullAccess: true, wall: true }, { fullAccess: true, lan: true }]) {
    assert.equal(browserLogic.canShowHomeEntry(input), canShowHomeEntry(input))
  }
})

test('inventory reads only home layout and remains free of unsafe APIs', () => {
  const logic = fs.readFileSync(new URL('../home-inventory-logic.mjs', import.meta.url), 'utf8')
  const source = fs.readFileSync(new URL('../home-inventory.js', import.meta.url), 'utf8')
  const html = fs.readFileSync(new URL('../home-inventory.html', import.meta.url), 'utf8')
  assert.doesNotMatch(logic, /\b(?:fetch|document|window|THREE)\b|Math\.random|Date\.now/)
  assert.doesNotMatch(source + html, /innerHTML|eval\s*\(|new Function|Math\.random|Date\.now|\b(?:buy|purchase|price|balance|wallet)\b|购买|价格|余额|交易|DR 币|提现/)
  assert.deepEqual([...source.matchAll(/fetch\('([^']+)'/g)].map((match) => match[1]), ['/town/home/layout'])
  assert.match(source, /method: 'GET'/)
  assert.doesNotMatch(source, /method: 'POST'|localStorage|sessionStorage|document\.cookie/)
  assert.match(html, /示意 · 虚拟物品，不对应现实资产权益/)
})

test('main entry rechecks permission before opening and dialog ARIA is explicit', () => {
  const ui = fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  assert.match(ui, /homeEntry\.onclick = .*canShowHomeEntry.*window\.open\('\/home-inventory\.html', '_blank', 'noopener'\)/)
  assert.match(ui, /homeEntry\.style\.display = canShowHomeEntry/)
  const page = fs.readFileSync(new URL('../home-page.js', import.meta.url), 'utf8')
  assert.match(page, /dialog\.setAttribute\('role', 'dialog'\)/)
  assert.match(page, /dialog\.setAttribute\('aria-modal', 'true'\)/)
})

test('item parameters accept exactly the twelve canonical IDs', () => {
  for (const item of CATALOG) assert.equal(validateItemParameter(item.id), item.id)
  for (const value of [null, undefined, '', 'unknown', 'CHAIR_WOOD', ' chair_wood', 'chair_wood ', '../chair_wood', '<script>', ['chair_wood'], 1]) {
    assert.equal(validateItemParameter(value), null)
  }
})

test('inventory links pass item IDs and preselection waits for layout loading', () => {
  const inventory = fs.readFileSync(new URL('../home-inventory.js', import.meta.url), 'utf8')
  assert.match(inventory, /link\.href = `\/home\.html\?item=\$\{encodeURIComponent\(row\.id\)\}`/)
  const page = fs.readFileSync(new URL('../home-page.js', import.meta.url), 'utf8')
  assert.match(page, /validateItemParameter\(new URLSearchParams\(location\.search\)\.get\('item'\)\)/)
  assert.ok(page.indexOf('editor.selectItem(requestedItem)') > page.indexOf('await persistence.connect()'))
  const editor = fs.readFileSync(new URL('../home-editor.js', import.meta.url), 'utf8')
  assert.match(editor, /addListener\(button, 'click', \(\) => selectItem\(id\)\)/)
})
