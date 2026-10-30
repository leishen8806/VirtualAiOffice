import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initialQuality, createQualityPolicy, renderLimit, TIERS } from '../quality.js'

// 董事会 2026-10-30："画质效果选择 高：完整效果，不需要开启节能模式，一直保持完整效果"。
const slow = (policy, from, ms = 80, seconds = 30) => { let changed = false; for (let t = from; t < from + seconds * 1000; t += ms) changed = policy.observe(ms, t) || changed; return changed }
const store = init => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('QH-1 manually choosing 高 locks it: slow frames never downgrade it', () => {
  const policy = createQualityPolicy({ selection: initialQuality({ search: '' }) })
  assert.equal(policy.select('high', store({})), true)
  assert.equal(policy.locked, true)
  slow(policy, 0)
  assert.equal(policy.tier, 'high'); assert.equal(policy.downgraded, false)
})

test('QH-2 a saved 高 and ?q=high are locked too; 中 / 低 keep the existing power saving', () => {
  for (const selection of [initialQuality({ search: '', storage: store({ 'office3d.quality.v3': 'high' }) }), initialQuality({ search: '?q=high' })]) {
    const policy = createQualityPolicy({ selection }); assert.equal(policy.locked, true); slow(policy, 0); assert.equal(policy.tier, 'high')
  }
  const medium = createQualityPolicy({ selection: initialQuality({ search: '' }) })
  medium.select('medium', store({})); assert.equal(medium.locked, false)
  slow(medium, 0); assert.equal(medium.tier, 'low', 'unlocked tiers still step down after 10 s under 24 FPS')
  const back = createQualityPolicy({ selection: initialQuality({ search: '' }) }); back.select('high', store({})); back.select('medium', store({})); assert.equal(back.locked, false)
})

test('QH-3 locked 高 keeps full frame rate when idle; unlocked tiers still idle down to 10 FPS', () => {
  assert.equal(renderLimit({ tier: 'high', idleMs: 120000, locked: true }), TIERS.high.fps)
  assert.equal(renderLimit({ tier: 'high', idleMs: 120000 }), 10)
  assert.equal(renderLimit({ tier: 'high', idleMs: 120000, locked: true, hidden: true }), 0, 'a hidden tab still stops rendering')
})

test('QH-4 wiring: render loop passes the lock and never lowers resolution while locked; menu says 不节能', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8'), ui = readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  assert.match(app, /renderLimit\(\{tier:qualityPolicy\.tier,wall:WALL_MODE,idleMs:t0-lastInput,active,locked:qualityPolicy\.locked\}\)/)
  assert.match(app, /dpr > 0\.6 && !qualityPolicy\.locked\) next = Math\.max\(0\.6, dpr \* 0\.85\)/)
  assert.match(ui, /high:'高：完整效果，不节能'/)
})
