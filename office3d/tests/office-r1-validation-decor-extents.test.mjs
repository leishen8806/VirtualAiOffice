import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import * as THREE from '../vendor/three/three.module.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { buildR1Decor, R1_DECOR } from '../office-vis2/r1-decor.js'
import { DECOR_EXTENTS } from '../office-r1-validation.js'

const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true } : next(specifier, context) } })
const { GLTFLoader } = await import('../vendor/three/jsm/loaders/GLTFLoader.js')
const { placeFurniture } = await import('../assets3d.js')
hooks.deregister()

const MODELS = ['coatRack', 'trashcan', 'speaker', 'lampSquareFloor', 'sideTable', 'rugRectangle']
const loader = new GLTFLoader(), furn = {}
for (const name of MODELS) {
  const bytes = readFileSync(new URL(`../assets/models/furniture/${name}.glb`, import.meta.url))
  furn[name] = (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene
}
const A = { furn }
const withCanvas = callback => {
  const old = globalThis.document
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) }
  try { return callback() } finally { globalThis.document = old }
}

test('DECOR_EXTENTS matches buildR1Decor H2 world envelopes within 5mm', () => withCanvas(() => {
  const root = new THREE.Group(), decor = buildR1Decor({ THREE, root, layout: createOfficeR1Layout(), A, placeFurniture })
  root.updateMatrixWorld(true)
  const byId = new Map(R1_DECOR.map(row => [row.id, row]))
  for (const item of decor.items) {
    const row = byId.get(item.id), [width, depth] = DECOR_EXTENTS[row.model]
    const angle = (row.rotYDeg || 0) * Math.PI / 180
    const expected = [Math.abs(Math.cos(angle) * width) + Math.abs(Math.sin(angle) * depth), Math.abs(Math.sin(angle) * width) + Math.abs(Math.cos(angle) * depth)]
    const size = item.bounds.getSize(new THREE.Vector3())
    assert.ok(Math.abs(size.x - expected[0]) <= .005, `${item.id} x ${size.x} != ${expected[0]}`)
    assert.ok(Math.abs(size.z - expected[1]) <= .005, `${item.id} z ${size.z} != ${expected[1]}`)
  }
  decor.dispose()
}))
