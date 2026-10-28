import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const start = app.lastIndexOf("if (!DR_MODE && OFFICE_LAYOUT.r1Phase === 'R1') {")
const code = app.slice(start, app.indexOf('\nwindow.__office =', start))

function fixture({ phase = 'R1', loadFailure = false, personFailure = false, poolFailure = false } = {}) {
  const group = () => ({ visible: true, children: [], add(o) { o.parent = this; this.children.push(o) }, traverse(fn) { fn({ userData: {} }) }, removeFromParent() { this.removed = true } })
  const ring = {}, label = {}, selected = { value: true }, old = { group: group(), pose: { mood: 'happy', type: 1 } }
  old.group.add(ring)
  const view = { id: 'public-test', name: 'Reviewer2', home: { x: 1, z: 2, yaw: 0 }, char: old, ring, label, selected, desk: { group: { position: { x: 1, z: 1 } } } }
  const callbacks = [], context = { DR_MODE: false, OFFICE_LAYOUT: { r1Phase: phase }, views: new Map([[view.id, view]]), SEATS: { Reviewer2: [] }, CAST: ['Male_Adult_01'], CAST_OVERRIDE: {}, PEOPLE: null, scene: { userData: {}, add() {} }, officeV3: { get: () => ({ chairAt: () => ({}), seatedProfile: () => ({ motions: ['neutral_01', 'neutral_02'] }) }) }, performance: { now: () => 123 }, setTimeout: fn => callbacks.push(fn), requestAnimationFrame: fn => callbacks.push(fn), loadR1Extras: async () => {}, r1SeatedAssets: loaded => poolFailure ? null : loaded, placeSeated: (ch, home) => { ch.home = { ...home } }, fitR1SeatedPerson: () => {}, createPerson: (loaded, avatar) => { if (personFailure) throw Error('fixture person failure'); return { avatar, group: group(), pose: {} } } }
  let resolve
  context.loadPeople = () => new Promise((yes, no) => { resolve = () => loadFailure ? no(Error('fixture load failure')) : yes({}) })
  vm.runInNewContext(code, context)
  const flush = async () => { for (let i = 0; i < 12; i++) { callbacks.shift()?.(); await Promise.resolve(); await Promise.resolve() } }
  return { context, view, old, ring, label, selected, callbacks, flush, resolve: () => resolve() }
}

test('R3 paints placeholders first, then replaces only the character and keeps view UI identities', async () => {
  const f = fixture()
  assert.equal(f.view.char, f.old)
  await f.flush()
  assert.equal(f.view.char, f.old, 'pending load retains the seated placeholder')
  f.resolve(); await f.flush()
  assert.equal(f.view.char.avatar, 'Male_Adult_07')
  assert.equal(f.view.ring, f.ring); assert.equal(f.view.label, f.label); assert.equal(f.view.selected, f.selected)
  assert.equal(f.ring.parent, f.view.char.group); assert.equal(f.old.group.removed, true)
  assert.equal(f.view.char.pose.mood, 'happy'); assert.equal(f.view.char.pose.type, 1)
  assert.equal(JSON.stringify(f.view.char.home), JSON.stringify(f.view.home))
  assert.equal(f.context.scene.userData.r1People.replaced.length, 1)
})

test('R3 failed asset loading or character preparation retains the placeholder and its ring', async () => {
  for (const options of [{ loadFailure: true }, { personFailure: true }, { poolFailure: true }]) {
    const f = fixture(options); await f.flush(); f.resolve(); await f.flush()
    assert.equal(f.view.char, f.old); assert.equal(f.ring.parent, f.old.group); assert.equal(f.old.group.removed, undefined)
  }
})

test('R6 pools contain only that person’s certified motions, neutral speaking and isolated containers', () => {
  const source = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
  const slice = source.slice(source.indexOf('const R1_POOL_WARNED'), source.indexOf('export const R1_ARM_LIMITS')).replace('export function', 'function')
  const warnings = [], ctx = { console: { warn: s => warnings.push(s) } }
  vm.runInNewContext(slice + '\nthis.prepare=r1SeatedAssets', ctx)
  const clip = name => ({ name, clone: () => clip(name) })
  const base = clip('sitIdle'), neutral = clip('m_sit_table_idle_neutral_02'), waiting = clip('m_sit_table_idle_waiting_01'), relaxed = clip('m_sit_table_idle_relaxed_01')
  const P = { clips: { male: { sitIdle: base, sitTalk: { name: 'unchecked-talk' } } }, extras: { male: { sitFlavor: [neutral, waiting, relaxed] } } }
  const one = ctx.prepare(P, 'Male_Adult_01', { motions: ['neutral_01', 'neutral_02'] }, 'one')
  const two = ctx.prepare(P, 'Male_Adult_02', { motions: ['neutral_02', 'waiting_01'] }, 'two')
  assert.equal(one.clips.male.sitIdle, base); assert.equal(one.clips.male.sitTalk.name, base.name); assert.notEqual(one.clips.male.sitTalk, base)
  assert.deepEqual([...one.extras.male.sitFlavor], [neutral]); assert.deepEqual([...two.extras.male.sitFlavor], [waiting])
  assert.equal(two.clips.male.sitIdle, neutral); assert.equal(two.clips.male.sitTalk.name, neutral.name); assert.notEqual(two.clips.male.sitTalk, neutral)
  assert.deepEqual(Object.keys(one.clips.male).sort(), ['sitIdle', 'sitTalk'])
  assert.equal(P.extras.male.sitFlavor.length, 3); assert.equal(P.clips.male.sitTalk.name, 'unchecked-talk')
  for (const motions of [[], ['neutral_01'], ['neutral_01', 'neutral_01'], ['waiting_01', 'relaxed_01'], ['neutral_01', 'nervous_01'], ['neutral_01', 'scratch_head']]) {
    assert.equal(ctx.prepare(P, 'Male_Adult_01', { motions }, 'invalid'), null)
  }
  assert.equal(warnings.length, 1); assert.match(warnings[0], /保留卡通占位/); assert.doesNotMatch(warnings[0], /[\\/]/)
})

test('R3 background replacement is absent outside R1 and legacy blocking load guard stays exact', () => {
  const f = fixture({ phase: 'L2B' })
  assert.equal(f.callbacks.length, 0); assert.equal(f.context.scene.userData.r1People, undefined)
  assert.match(app, /try \{ if \(!DR_MODE && !LAYOUT3_MODE\) \{\s*PEOPLE = await loadPeople/)
})
