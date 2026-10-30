import { R1_ADDED_AVATARS } from '../office-r1-seating.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { R1_SEATED_PROFILES } from '../office-vis2/r1-furniture.js'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const start = app.lastIndexOf("if (!DR_MODE && OFFICE_LAYOUT.r1Phase === 'R1') {")
const code = app.slice(start, app.indexOf('\nwindow.__office =', start))
const people = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
const CAST = vm.runInNewContext(people.match(/export const CAST = (\[[^\n]+\])/)[1])
const names = Object.keys(R1_SEATED_PROFILES)
const CAST_OVERRIDE = { OpsLead: 'Male_Adult_11', OpsEngineer: 'Female_Adult_07', KnowledgeKeeper: 'Female_Adult_09' }

async function replace(nicknames, phase = 'R1') {
  const group = () => ({ visible: true, add() {}, traverse(fn) { fn({ userData: {} }) }, removeFromParent() {} })
  const views = new Map(names.map((name, i) => [String(i), {
    id: String(i), data: { name }, name: nicknames ? (['Reviewer1', 'React1'].includes(name) ? 'R1' : `昵称-${i}`) : name,
    home: { x: i, z: 0, yaw: 0 }, desk: { group: { position: { x: i, z: -1 } } }, ring: {},
    char: { group: group(), pose: {} },
  }]))
  const callbacks = [], lookups = []
  let builds = 0
  const context = { R1_ADDED_AVATARS,
    DR_MODE: false, OFFICE_LAYOUT: { r1Phase: phase }, views,
    SEATS: Object.fromEntries(names.map(n => [n, []])), CAST, CAST_OVERRIDE,
    PEOPLE: null, scene: { userData: {}, add() {} }, performance: { now: () => 1 },
    setTimeout: fn => callbacks.push(fn), requestAnimationFrame: fn => callbacks.push(fn),
    loadPeople: async () => ({}), loadR1Extras: async () => {}, loadR1MovementExtras: async () => {},
    officeV3: { get: () => ({ seatedProfile: name => { lookups.push(name); return R1_SEATED_PROFILES[name] }, chairAt: () => ({}) }) },
    r1SeatedAssets: (loaded, avatar, profile, name) => profile ? { profile, name } : null,
    createPerson: (assets, avatar) => { builds++; return { avatar, assets, group: group(), pose: {} } },
    placeSeated: (ch, home) => { ch.home = home }, fitR1SeatedPerson: (ch, options) => { ch.handY = options.handY },
  }
  vm.runInNewContext(code, context)
  const flush = async () => { for (let i = 0; i < 160; i++) { callbacks.shift()?.(); await Promise.resolve(); await Promise.resolve() } }
  await flush()
  return { context, views, lookups, flush, builds: () => builds }
}

test('I3C-1 all workstation nicknames, including duplicate R1, resolve by Paperclip identity', async () => {
  const plain = await replace(false), nick = await replace(true)
  assert.equal(names.length, createOfficeR1Layout().r1.workstations.length)
  assert.equal(nick.builds(), names.length)
  assert.equal(nick.context.scene.userData.r1People.failed.length, 0)
  assert.deepEqual([...nick.context.scene.userData.r1People.replaced], names)
  for (const [id, v] of nick.views) {
    const original = plain.views.get(id)
    assert.notEqual(v.name, v.data.name)
    assert.equal(v.char.avatar, original.char.avatar)
    assert.equal(v.char.assets.name, v.data.name)
    assert.deepEqual(v.char.assets.profile, original.char.assets.profile)
    assert.deepEqual(v.char.home, original.char.home)
    assert.equal(v.char.handY, original.char.handY)
  }
  assert.ok(nick.lookups.every(name => names.includes(name)))
})

test('I3C-2 changing a display name after replacement never rebuilds or changes its pool', async () => {
  const f = await replace(true), v = [...f.views.values()].find(v => v.data.name === 'Reviewer1')
  const char = v.char, profile = char.assets.profile, avatar = char.avatar
  v.name = '改名后'; await f.flush()
  assert.equal(f.builds(), names.length); assert.equal(v.char, char)
  assert.equal(v.char.assets.profile, profile); assert.equal(v.char.avatar, avatar)
  assert.match(app, /v\.name = NAMES\[a\.id\] \|\| a\.name/)
})

test('I3C-4 replacement remains R1-only', async () => {
  for (const phase of ['L1', 'L2', 'L2B', undefined]) {
    const f = await replace(true, phase === undefined ? '' : phase)
    assert.equal(f.builds(), 0); assert.equal(f.context.scene.userData.r1People, undefined)
  }
})
