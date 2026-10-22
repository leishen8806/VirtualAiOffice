import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import * as THREE from '../vendor/three/three.module.js'
import {
  PLAZA_PROP_CATALOG,
  buildOfficePlazaProps,
  buildPlazaBenches,
  buildPlazaCafeSets,
  buildPlazaFlowers,
  buildPlazaLamps,
  buildPlazaTrees,
  buildPlazaVendors,
  plazaPlacements,
} from '../office-plaza-props.js'

function canvasTexFixture() {
  const calls = [], textures = []
  const canvasTex = (w, h, draw) => {
    const operations = []
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      fillRect: (...args) => operations.push(['fillRect', ...args]),
      strokeRect: (...args) => operations.push(['strokeRect', ...args]),
    }
    draw(ctx, w, h)
    const texture = {
      isTexture: true,
      disposed: false,
      dispose() { this.disposed = true },
    }
    calls.push({ w, h, operations, texture })
    textures.push(texture)
    return texture
  }
  return { canvasTex, calls, textures }
}

const visibleMeshes = module => module.root.children.filter(item => item.isMesh && item.visible)

test('catalog has three distinct vendor forms and two variants of each landscape tree family', () => {
  const plan = plazaPlacements()
  assert.deepEqual(plan.vendors.map(item => item.kind), ['awning-cart', 'square-kiosk', 'flower-stall'])
  assert.equal(plan.cafe.length, 2)
  assert.equal(plan.lamps.length, 4)
  assert.equal(plan.benches.length, 4)
  assert.equal(plan.flowers.length, 3)
  assert.deepEqual(plan.trees.map(item => item.kind), [
    'broadleaf-round', 'broadleaf-layered', 'palm-fan', 'palm-crown',
  ])
  assert.equal(Object.isFrozen(PLAZA_PROP_CATALOG), true)
  assert.equal(Object.isFrozen(plan), true)
})

test('faithful app canvasTex contract builds high props in budget with no readable brand text', () => {
  const root = new THREE.Group(), fixture = canvasTexFixture()
  const module = buildOfficePlazaProps({ THREE, root, canvasTex: fixture.canvasTex })
  assert.equal(root.children.includes(module.root), true)
  assert.deepEqual(module.counts, { vendors: 3, cafe: 2, lamps: 4, benches: 4, flowers: 3, trees: 4 })
  assert.deepEqual(module.summary().counts, module.counts)
  assert.equal(module.summary().instances, 20)
  assert.ok(module.summary().calls <= 6, JSON.stringify(module.summary()))
  assert.ok(module.summary().triangles <= 40000, JSON.stringify(module.summary()))
  assert.equal(fixture.calls.length, 1)
  assert.deepEqual(fixture.calls[0].operations.at(0), ['fillRect', 0, 0, 256, 128])
  assert.ok(fixture.calls[0].operations.some(item => item[0] === 'strokeRect'))
  for (const mesh of visibleMeshes(module)) {
    assert.ok(mesh.geometry.attributes.position.count > 0)
    assert.equal(mesh.geometry.attributes.uv.itemSize, 2)
    assert.equal(mesh.geometry.attributes.color.itemSize, 3)
    assert.equal(mesh.castShadow, false)
    assert.equal(mesh.receiveShadow, true)
  }
  const resources = visibleMeshes(module).map(mesh => {
    const state = { geometry: 0, material: 0 }
    mesh.geometry.addEventListener('dispose', () => state.geometry++)
    mesh.material.addEventListener('dispose', () => state.material++)
    return state
  })
  module.dispose(); module.dispose()
  assert.equal(root.children.length, 0)
  assert.equal(fixture.textures[0].disposed, true)
  assert.ok(resources.every(state => state.geometry === 1 && state.material === 1))
})

test('low tier creates exactly two instanced calls and does not request canvas texture', () => {
  const root = new THREE.Group(), fixture = canvasTexFixture()
  const module = buildOfficePlazaProps({ THREE, root, canvasTex: fixture.canvasTex, low: true })
  assert.equal(module.summary().calls, 2)
  assert.ok(module.summary().triangles < 40000)
  assert.deepEqual(visibleMeshes(module).map(item => item.name), [
    'office3-plaza-props-solid', 'office3-plaza-props-leaf',
  ])
  assert.ok(visibleMeshes(module).every(item => item.isInstancedMesh && item.count > 1))
  assert.equal(fixture.calls.length, 0)
  module.dispose()
})

test('each category factory builds only its declared instances and disposes independently', () => {
  const cases = [
    [buildPlazaVendors, 'vendors', 3],
    [buildPlazaCafeSets, 'cafe', 2],
    [buildPlazaLamps, 'lamps', 4],
    [buildPlazaBenches, 'benches', 4],
    [buildPlazaFlowers, 'flowers', 3],
    [buildPlazaTrees, 'trees', 4],
  ]
  for (const [factory, category, count] of cases) {
    const root = new THREE.Group()
    const module = factory({ THREE, root, low: false })
    assert.equal(module.counts[category], count)
    assert.equal(module.summary().instances, count)
    assert.ok(module.summary().calls >= 1 && module.summary().calls <= 6)
    module.dispose()
    assert.equal(root.children.length, 0)
  }
})

test('placement injection remains relative and rejects malformed rows without mutating input', () => {
  const input = {
    vendors: [{ id: 'custom-cart', kind: 'awning-cart', x: 100, z: -50, yaw: .4 }, { id: '', x: 0, z: 0, yaw: 0 }],
    trees: [{ id: 'custom-tree', kind: 'palm-fan', x: 95, z: -45, yaw: 0 }],
  }
  const before = structuredClone(input)
  const root = new THREE.Group()
  const module = buildOfficePlazaProps({ THREE, root, placements: input, low: true })
  assert.deepEqual(input, before)
  assert.deepEqual(module.summary().counts, { vendors: 1, cafe: 0, lamps: 0, benches: 0, flowers: 0, trees: 1 })
  const solid = visibleMeshes(module).find(item => item.name === 'office3-plaza-props-solid')
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3()
  let maxX = -Infinity
  for (let i = 0; i < solid.count; i++) {
    solid.getMatrixAt(i, matrix)
    position.setFromMatrixPosition(matrix)
    maxX = Math.max(maxX, position.x)
  }
  assert.ok(maxX > 99)
  module.dispose()
})

test('module is static, office-token based and isolated from warehouse, network and business APIs', () => {
  const source = fs.readFileSync(new URL('../office-plaza-props.js', import.meta.url), 'utf8')
  const preview = fs.readFileSync(new URL('../office-plaza-props-preview.html', import.meta.url), 'utf8')
  assert.match(source, /office-theme-v2\.js/)
  for (const value of [source, preview]) assert.doesNotMatch(value, /dr-campus|dr-console|Math\.random|Date\.now|\bfetch\s*\(|innerHTML|\/state|\/act/)
  assert.doesNotMatch(source, /new THREE\.\w*Light/)
  assert.doesNotMatch(source, /logo|trademark|brand/i)
  assert.match(preview, /draw\(canvas\.getContext\('2d'\),w,h\)/)
})
