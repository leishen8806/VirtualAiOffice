import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from '../vendor/three/three.module.js'
import { createSceneQuality } from '../quality.js'

const character = (x, z, visible = true) => {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.visible = visible
  return { group }
}

const makeQuality = () => {
  const scene = new THREE.Scene()
  const renderer = { shadowMap: {}, compile() {} }
  const first = character(1, 2), chars = [first]
  const quality = createSceneQuality(THREE, {
    scene, renderer, camera: new THREE.PerspectiveCamera(), env: { setQuality() {} },
    characters: () => chars, mergeStatic: () => ({ removed: 0, added: 0 }),
  })
  return { quality, chars, first }
}

for (const [tier, visible] of [['high', false], ['medium', false], ['low', true]]) {
  test(`QS R2 ${tier}: replacement shadow is immediately ${visible ? 'visible and positioned' : 'hidden'}`, () => {
    const { quality, chars, first } = makeQuality()
    quality.prepare(tier)
    const summary = quality.summary()
    const next = character(7, 8)
    chars[0] = next
    quality.replaceCharacter(first, next)
    const [row] = quality.fakeShadowState()
    assert.equal(row.character, next)
    assert.equal(row.shadow.visible, visible)
    assert.equal(row.shadow.position.x, 7)
    assert.equal(row.shadow.position.y, .035)
    assert.equal(row.shadow.position.z, 8)
    assert.deepEqual(quality.summary(), summary)
  })
}

test('QS R3: R1 realistic replacement notifies scene quality before replacing v.char', () => {
  const source = readFileSync(fileURLToPath(new URL('../app.js', import.meta.url)), 'utf8')
  const start = source.indexOf('const replace = v => {')
  const end = source.indexOf('const busy =', start)
  assert.ok(start >= 0 && end > start, 'R1 realistic replacement block exists')
  const replacement = source.slice(start, end)
  const call = replacement.indexOf('sceneQuality.replaceCharacter(previous, ch)')
  assert.ok(call >= 0, 'replacement transfers fake-shadow ownership to the realistic character')
  assert.match(replacement, /typeof sceneQuality !== 'undefined'/)
  assert.ok(call < replacement.indexOf('v.char = ch'), 'quality receives previous before the view points at the replacement')
})
