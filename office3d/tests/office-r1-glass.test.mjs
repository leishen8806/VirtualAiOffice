import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import { buildR1Shell, r1Glazing } from '../office-vis2/r1-shell.js'
import { createOfficeR1Layout } from '../office-vis2/r1-site.js'
import { createFurnitureCollision } from '../furniture-collision.js'
const mergeSource = readFileSync(new URL('../merge.js', import.meta.url), 'utf8').replace("from 'three'", `from '${new URL('../vendor/three/three.module.js', import.meta.url).href}'`)
const { mergeStatic, snapshot } = await import(`data:text/javascript;base64,${Buffer.from(mergeSource).toString('base64')}`)

function scene(check) {
  const previous = globalThis.document
  globalThis.document = { createElement: () => ({ getContext: () => ({ clearRect() {}, fillText() {} }) }) }
  const root = new THREE.Scene(), layout = createOfficeR1Layout(), collision = createFurnitureCollision()
  let shell
  try {
    shell = buildR1Shell({ THREE, root, layout, collision }); root.updateMatrixWorld(true)
    return check({ root, layout, collision, shell, get: name => root.getObjectByName(name) })
  } finally { shell?.dispose(); globalThis.document = previous }
}

function bounds(mesh, index, start = 0, count = mesh.geometry.attributes.position.count) {
  const matrix = mesh.matrixWorld.clone(), box = new THREE.Box3(), position = mesh.geometry.attributes.position
  if (index !== null) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(index, instance); matrix.multiply(instance) }
  for (let at = start; at < start + count; at++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, at).applyMatrix4(matrix))
  return box
}

test('I2B glazing keeps only the reception background opaque; exterior has no transmission', () => scene(({ get }) => {
  assert.deepEqual(get('r1-interior-walls').userData.wallIds, ['00-W-036'])
  assert.equal(get('r1-interior-glass').count, 27)
  for (const name of ['r1-interior-glass', 'r1-corner-walls']) {
    const material = get(name).material
    assert.equal(material.transparent, true); assert.equal(material.opacity, .2); assert.equal(material.transmission, 0)
  }
  const outer = get('r1-exterior-glass')
  assert.equal(outer.count, 4); assert.ok(outer.material.opacity >= .45 && outer.material.opacity <= .55)
  assert.equal(outer.material.roughness, .65); assert.equal(outer.material.transmission, 0)
  assert.equal(get('r1-low-glass').material.opacity, .24)
  for (const name of ['r1-interior-walls', 'r1-front-slope-wall', 'r1-top-bands']) assert.equal(get(name).material.transparent, false)
  assert.ok(Object.isFrozen(r1Glazing))
}))

test('I2B each glass, frame and band remains inside its original wall bounds with exact vertical layers', () => scene(({ root, get }) => {
  const originals = new Map()
  root.traverse(mesh => { if (/^r1-collision-00-W-/.test(mesh.name)) originals.set(mesh.name.slice('r1-collision-'.length), bounds(mesh, null)) })
  const corners = get('r1-collision-corners'), size = corners.geometry.attributes.position.count / 2
  corners.userData.wallIds.forEach((id, index) => originals.get(id).union(bounds(corners, null, index * size, size)))
  const contains = (id, box, label) => assert.ok(originals.get(id).clone().expandByScalar(.001).containsBox(box), `${label}: ${id}`)
  for (const name of ['r1-interior-glass', 'r1-exterior-glass', 'r1-interior-frames']) {
    const mesh = get(name)
    for (let index = 0; index < mesh.count; index++) {
      const box = bounds(mesh, index); contains(mesh.userData.wallIds[index], box, name)
      assert.ok(Math.abs(box.min.y) <= .005)
      if (name !== 'r1-interior-frames') assert.ok(Math.abs(box.max.y - (name === 'r1-exterior-glass' ? 3.7 : 2.4)) < .001)
    }
  }
  const visibleCorners = get('r1-corner-walls')
  visibleCorners.userData.wallIds.forEach((id, index) => contains(id, bounds(visibleCorners, null, index * size, size), 'corner'))
  const bands = get('r1-top-bands')
  assert.equal(bands.userData.ranges.length, 33)
  for (const range of bands.userData.ranges) {
    const box = bounds(bands, null, range.start, range.count), exterior = ['00-W-001', '00-W-002', '00-W-003', '00-W-004'].includes(range.id)
    contains(range.id, box, 'band'); assert.ok(Math.abs(box.min.y - (exterior ? 3.7 : 2.4)) < .001)
    assert.ok(Math.abs(box.max.y - (exterior ? 4.5 : 2.7)) < .001)
  }
}))

test('I2B straight upright gaps are at most 1.5 m with clipped end posts and a bottom frame', () => scene(({ get }) => {
  const glass = get('r1-interior-glass'), frames = get('r1-interior-frames')
  for (let index = 0; index < glass.count; index++) {
    const id = glass.userData.wallIds[index], wall = bounds(glass, index), axis = wall.max.x - wall.min.x > wall.max.z - wall.min.z ? 'x' : 'z'
    const posts = []
    for (let i = 0; i < frames.count; i++) {
      if (frames.userData.wallIds[i] !== id) continue
      const box = bounds(frames, i)
      if (!wall.clone().expandByScalar(.001).containsBox(box) || box.max.y < 2) continue
      posts.push(box)
    }
    posts.sort((a, b) => a.min[axis] - b.min[axis])
    assert.ok(Math.abs(posts[0].min[axis] - wall.min[axis]) < .001, id)
    assert.ok(Math.abs(posts.at(-1).max[axis] - wall.max[axis]) < .001, id)
    for (let i = 0; i < posts.length; i++) {
      assert.ok(posts[i].max[axis] - posts[i].min[axis] <= .05 + .001, id)
      if (i) assert.ok(posts[i].min[axis] - posts[i - 1].max[axis] <= 1.5, id)
    }
  }
}))

test('I2B actual full merge and low-tier second merge retain 42 walls / 84 faces / 13 doors and block all 618 samples', () => scene(({ root, layout, collision, shell }) => {
  mergeStatic(root, snapshot(root)); mergeStatic(root)
  assert.equal(new Set(shell.wallLedger.wallIds).size, 42); assert.equal(new Set(shell.wallLedger.faceIds).size, 84); assert.equal(new Set(shell.wallLedger.doorIds).size, 13)
  for (const name of ['r1-interior-glass', 'r1-interior-frames', 'r1-top-bands', 'r1-collision-corners']) assert.ok(root.getObjectByName(name).userData.wallIds.length)
  let count = 0
  for (const wall of layout.r1.data.walls) for (let i = 1; i < wall.geometry.points.length; i++) {
    const [a, b] = [wall.geometry.points[i - 1], wall.geometry.points[i]]
    for (const fraction of [.25, .5, .75]) { count++; assert.ok(collision.hit(a[0] + (b[0] - a[0]) * fraction - 26, 18 - a[1] - (b[1] - a[1]) * fraction), wall.id) }
  }
  assert.equal(count, 618)
  for (const door of layout.r1.data.doors) assert.equal(collision.hit(door.xM - 26, 18 - door.yM), null, door.id)
}))
