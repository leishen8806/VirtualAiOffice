import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DISPLAY_DEPARTMENTS,
  DISPLAY_LABEL,
  displayConfig,
  displayHash,
  displayRoster,
  displayRoute,
} from '../display-staff-logic.js'
import * as logic from '../display-staff-logic.js'
import { LAYOUT_V2 } from '../office-layout.js'

test('displayHash is deterministic, uint32-bounded and safe for non-string/empty/oversized input', () => {
  const repeated = 'display:market:2707'
  const expected = displayHash(repeated)
  for (let i = 0; i < 5; i++) assert.equal(displayHash(repeated), expected)
  assert.equal(displayHash(''), 2166136261)

  const inputs = [null, undefined, 0, 1, false, true, {}, [], NaN, '中文', '😀', 'a'.repeat(100000)]
  for (const input of inputs) {
    const first = displayHash(input)
    assert.equal(Number.isInteger(first), true, `hash must be an integer for ${String(input).slice(0, 32)}`)
    assert.equal(first >= 0, true, `hash must not be negative for ${String(input).slice(0, 32)}`)
    assert.equal(first <= 0xffffffff, true, `hash must fit uint32 for ${String(input).slice(0, 32)}`)
    assert.equal(displayHash(input), first, `hash must be repeatable for ${String(input).slice(0, 32)}`)
  }

  assert.equal(Number.isInteger(displayHash('a'.repeat(100000))), true)
})

test('displayHash distinguishes different inputs and is stable through the module namespace', () => {
  const values = [
    'market', 'service', 'aftersales', 'marketing',
    'sim-market-1', 'sim-market-2', 'sim-service-1', 'sim-service-2',
    'sim-aftersales-1', 'sim-aftersales-2', 'sim-marketing-1', 'sim-marketing-2',
    '', 'a', 'aa', 'ab', 'ba', 'abc', 'abd', '中文',
    '展示部门', '0', '1', '2707', 'seed', 'visit', 'west', 'east',
    'north', 'south', 'x', 'z',
  ]
  const hashes = values.map(displayHash)
  assert.equal(new Set(hashes).size >= values.length - 1, true, 'distinct inputs must mostly produce distinct hashes')
  assert.notEqual(displayHash('sim-1'), displayHash('sim-2'))
  assert.notEqual(displayHash('a'.repeat(999)), displayHash('a'.repeat(1000)))
  assert.equal(logic.displayHash, displayHash)
  assert.equal(logic.displayHash('market'), displayHash('market'))
})

test('display metadata is frozen, unique and cannot be replaced through the namespace', () => {
  assert.equal(DISPLAY_LABEL, '展示部门 · 模拟角色')
  assert.equal(typeof DISPLAY_LABEL, 'string')
  assert.equal(Object.isFrozen(DISPLAY_LABEL), true)
  assert.equal(Object.isFrozen(DISPLAY_DEPARTMENTS), true)
  assert.equal(Array.isArray(DISPLAY_DEPARTMENTS), true)
  assert.deepEqual([...DISPLAY_DEPARTMENTS], ['market', 'service', 'aftersales', 'marketing'])
  assert.equal(new Set(DISPLAY_DEPARTMENTS).size, DISPLAY_DEPARTMENTS.length)
  assert.equal(DISPLAY_DEPARTMENTS.every(department => typeof department === 'string' && department.length > 0), true)

  assert.throws(() => DISPLAY_DEPARTMENTS.push('unknown'), TypeError)
  assert.throws(() => { logic.DISPLAY_DEPARTMENTS = [] }, TypeError)
  assert.throws(() => { logic.DISPLAY_LABEL = 'replaced' }, TypeError)
  assert.equal(DISPLAY_LABEL, '展示部门 · 模拟角色')
  assert.deepEqual([...DISPLAY_DEPARTMENTS], ['market', 'service', 'aftersales', 'marketing'])
})

test('displayConfig ignores unknown fields and rejects missing or repeated display flags', () => {
  const missing = displayConfig(null)
  assert.equal(missing.enabled, false)
  assert.equal(missing.countPerDepartment, 3)
  assert.equal(Object.isFrozen(missing), true)
  assert.deepEqual(Object.keys(missing), ['enabled', 'countPerDepartment'])

  assert.equal(displayConfig({ enabled: true, unknown: 'ignored' }).enabled, true)
  assert.equal(displayConfig({ display: true }).enabled, false)
  assert.equal(displayConfig('{"enabled":true,"extra":[1,2]}').enabled, true)
  assert.equal(displayConfig('null').enabled, false)
  assert.equal(displayConfig('[]').enabled, false)
  assert.equal(displayConfig(123).enabled, false)

  assert.equal(displayConfig(null, '?foo=bar').enabled, false)
  assert.equal(displayConfig(null, '?display=1&foo=bar').enabled, true)
  assert.equal(displayConfig(null, '?display=1&display=0').enabled, false)
  assert.equal(displayConfig(null, '?display=1&display=').enabled, false)
  assert.equal(displayConfig(null, '?Display=1').enabled, false)
  assert.equal(displayConfig(null, '?display=1&display=1&foo=1').enabled, false)
})

test('displayRoster is repeatable for the same layout and returns isolated rows', () => {
  const first = displayRoster(LAYOUT_V2)
  const second = displayRoster(LAYOUT_V2)
  assert.deepEqual(first, second)
  assert.equal(first.length, 12)
  assert.equal(new Set(first.map(person => person.id)).size, 12)

  for (const person of first) {
    assert.equal(Number.isFinite(person.home.x), true)
    assert.equal(Number.isFinite(person.home.z), true)
    assert.equal(Number.isFinite(person.desk.x), true)
    assert.equal(Number.isFinite(person.desk.z), true)
    assert.equal(Number.isFinite(person.yaw), true)
  }

  first[0].home.x += 1
  assert.notEqual(first[0].home.x, second[0].home.x)
  assert.deepEqual(displayRoster(LAYOUT_V2), second)
})

test('displayRoute is repeatable and every route point stays finite', () => {
  const roster = displayRoster(LAYOUT_V2)
  assert.equal(roster.length, 12)

  for (const person of roster) {
    const first = displayRoute(LAYOUT_V2, person)
    const second = displayRoute(LAYOUT_V2, person)
    assert.deepEqual(first, second)
    assert.equal(Object.isFrozen(first), true)
    assert.equal(first.go.length >= 2, true)
    assert.equal(first.back.length, first.go.length)

    for (const point of [...first.go, ...first.back]) {
      assert.equal(Number.isFinite(point.x), true)
      assert.equal(Number.isFinite(point.z), true)
    }

    assert.equal(Number.isFinite(first.length), true)
    assert.equal(first.length > 0, true)
    assert.equal(Number.isFinite(first.durationMs), true)
    assert.equal(first.durationMs > 0, true)
    assert.equal(first.gapAccess, false)
    assert.equal(first.reason, 'O5_GAP_ROUTE_NOT_CONNECTED')
  }
})