import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideLiteMode, setLitePreference, LITE_KEY } from '../lite-mode.js'

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) } }
const desktop = { nav: { deviceMemory: 16, hardwareConcurrency: 12, connection: { effectiveType: '4g' } }, screen: { width: 1920, height: 1080 }, coarsePointer: false }

test('LITE-1 URL beats the saved choice, the saved choice beats auto detection', () => {
  assert.deepEqual(decideLiteMode({ ...desktop, search: '?lite=1' }).lite, true)
  assert.equal(decideLiteMode({ ...desktop, search: '?lite=0', storage: store({ [LITE_KEY]: '1' }) }).lite, false)
  assert.equal(decideLiteMode({ ...desktop, storage: store({ [LITE_KEY]: '1' }) }).source, 'storage')
  assert.equal(decideLiteMode({ ...desktop, nav: { deviceMemory: 2 }, storage: store({ [LITE_KEY]: '0' }) }).lite, false)
})

test('LITE-2 auto detection: weak memory, few cores, slow network, data saver and phones go lite; a normal desktop does not', () => {
  assert.equal(decideLiteMode(desktop).lite, false)
  for (const nav of [{ deviceMemory: 4 }, { hardwareConcurrency: 4 }, { connection: { saveData: true } }, { connection: { effectiveType: '3g' } }, { connection: { effectiveType: 'slow-2g' } }])
    assert.equal(decideLiteMode({ ...desktop, nav: { ...desktop.nav, ...nav, connection: { ...desktop.nav.connection, ...nav.connection } } }).lite, true, JSON.stringify(nav))
  assert.equal(decideLiteMode({ ...desktop, screen: { width: 390, height: 844 }, coarsePointer: true }).lite, true)
  assert.equal(decideLiteMode({ ...desktop, screen: { width: 1024, height: 1366 }, coarsePointer: true }).lite, false, 'large tablet keeps full mode')
  assert.equal(decideLiteMode({ ...desktop, nav: {} }).lite, false, 'unknown signals do not force lite')
})

test('LITE-3 preference persists and storage failures never throw', () => {
  const s = store(); assert.equal(setLitePreference(s, true), true); assert.equal(s.getItem(LITE_KEY), '1')
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(setLitePreference(broken, true), false)
  assert.equal(decideLiteMode({ ...desktop, storage: broken }).lite, false)
})

test('LITE-4 wiring: R1-only, forces low tier and DPR 1, skips realistic people and R1 walking, toggle button present', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8'), director = readFileSync(new URL('../director.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(app, /const LITE = OFFICE_LAYOUT\.r1Phase === 'R1' && !WALL_MODE \? decideLiteMode\(/)
  assert.match(app, /LITE\.lite && !new URLSearchParams\(location\.search\)\.has\('q'\) \? \{ tier: 'low', source: 'lite', forced: true \}/)
  assert.match(app, /const DPR_MAX = LITE\.lite \? 1 :/)
  assert.match(app, /if \(!DR_MODE && OFFICE_LAYOUT\.r1Phase === 'R1' && !LITE\.lite\) \{/)
  assert.match(app, /r1Walking: !LITE\.lite/)
  assert.match(app, /director\.celebrate\?\.\(v\)/)
  assert.match(director, /if \(layout\?\.r1Phase === 'R1' && r1Walking\) return createR1Director/)
  assert.match(html, /<button id="liteToggle" type="button" hidden><\/button>/)
})

test('LITE-5 lite assets: character normal / roughness maps become a 1-pixel image, colour maps and models are untouched', async () => {
  const src = readFileSync(new URL('../assets3d.js', import.meta.url), 'utf8')
  assert.match(src, /export async function loadAssets\(\{ lite = false \} = \{\}\)/)
  assert.match(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), /A = await loadAssets\(\{ lite: LITE\.lite \}\)/)
  const rule = src.match(/export const liteTextureUrl = url => (.*)\r?\n/)[1], blank = src.match(/const LITE_BLANK = '([^']+)'/)[1]
  const liteTextureUrl = new Function('url', 'LITE_BLANK', `return ${rule}`)
  for (const url of ['./tex/T_Hair_1_Normal.png', './tex/T_Superhero_Male_Roughness.png']) assert.equal(liteTextureUrl(url, blank), blank)
  for (const url of ['./tex/T_Hair_1_BaseColor.png', './tex/T_Superhero_Male_Dark.png', './anim/UAL1_Standard.glb', './furniture/desk.glb']) assert.equal(liteTextureUrl(url, blank), url)
})
