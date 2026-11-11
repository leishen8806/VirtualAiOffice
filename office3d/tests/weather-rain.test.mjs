import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'three'
      ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true }
      : nextResolve(specifier, context)
  },
})
const { RAIN_AREA, forceRainRequested, rainAnchorFor, rainVisibleFor } = await import('../env.js')
hooks.deregister()
const envSource = readFileSync(new URL('../env.js', import.meta.url), 'utf8')

test('rain anchor follows the active camera and keeps the configured coverage', () => {
  assert.deepEqual(rainAnchorFor({ x: -189.345, z: 57.653 }), { x: -189.345, z: 57.653 })
  assert.deepEqual(RAIN_AREA, { width: 120, depth: 100, height: 40 })
})

test('rain visibility is off at zero and in low quality, on for medium/high rain', () => {
  assert.equal(rainVisibleFor('high', 0), false)
  assert.equal(rainVisibleFor('medium', 0.2), true)
  assert.equal(rainVisibleFor('high', 1), true)
  assert.equal(rainVisibleFor('low', 1), false)
})

test('forced rain is local-only and opt-in', () => {
  assert.equal(forceRainRequested('?rain=1', 'localhost'), true)
  assert.equal(forceRainRequested('?rain=1', 'office.localhost'), true)
  assert.equal(forceRainRequested('?rain=1', 'example.com'), false)
  assert.equal(forceRainRequested('', 'localhost'), false)
})

test('runtime rain mesh is repositioned from the camera anchor before visibility is evaluated', () => {
  assert.match(envSource, /const moveRain = \(\) => \{[\s\S]*rain\.position\.x = anchor\.x[\s\S]*rain\.position\.z = anchor\.z/)
  assert.match(envSource, /moveRain\(\)[\s\S]*rain\.visible = rainVisibleFor\(quality, cur\.rain\)/)
})
