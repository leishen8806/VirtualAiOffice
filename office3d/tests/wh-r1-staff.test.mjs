import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { buildWhR1Staff, WH_R1_STAFF_ROSTER } from '../dr-wh-r1-staff.js'

const fakeCharacter = () => {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.BoxGeometry(.3, 1.7, .3), new THREE.MeshBasicMaterial()))
  return { group, pose: { sit: 0, walk: 0, phase: 0, talk: 0, carry: 0 }, solve() {} }
}
const context = () => {
  const root = new THREE.Group()
  return { root, value: buildWhR1Staff({ THREE, root, A: {}, createCharacter3D: fakeCharacter }) }
}

test('WH-R1 staff roster uses the I8 grid and remains display-only', () => {
  const { root, value } = context()
  assert.equal(value.members.length, WH_R1_STAFF_ROSTER.length)
  assert.deepEqual(value.summary().roles.sort(), ['forklift', 'lead', 'packing', 'packing', 'picking', 'picking', 'receiving', 'receiving', 'shipping'])
  assert.deepEqual(value.summary().agentIds, [])
  assert.equal(value.summary().collision, false)
  for (const member of value.members) {
    assert.equal(member.char.group.userData.displayOnly, true)
    assert.equal(member.char.group.userData.label, '演示人物')
    assert.ok(member.placement.nearest || member.placement.requested)
    if (member.target) assert.ok(member.path.length > 1, `${member.id} must have a navigation path`)
  }
  assert.ok(root.getObjectByName('wh-r1-staff'))
})

test('WH-R1 staff does not build or load in lite mode', () => {
  const root = new THREE.Group()
  const value = buildWhR1Staff({ THREE, root, A: {}, createCharacter3D: fakeCharacter, lite: true })
  assert.equal(value.members.length, 0)
  assert.equal(value.summary().lite, true)
  assert.equal(value.hydrate({}, fakeCharacter), false)
})

test('WH-R1 staff uses only short grid paths and has no Paperclip binding', () => {
  const { value } = context()
  for (const member of value.members.filter(row => row.path.length > 1)) {
    assert.ok(value.navigation.pathLength(member.path) < 40)
    assert.equal(member.char.group.userData.agentId, undefined)
  }
})

test('WH-R1 R2 uses two shared placeholder meshes and click-time labels only', () => {
  const { value } = context()
  assert.equal(value.summary().placeholderCalls, 2)
  assert.equal(value.members.filter(member => member.label).length, 0)
})

test('WH-R1 88 keeps all nine staff visible and limits realistic hydration', async () => {
  const { value } = context()
  const calls = []
  const makePeople = name => ({ avatars: { [name]: {} }, clips: { male: {}, female: {} }, extras: { male: {}, female: {} } })
  const makeReal = () => {
    const group = new THREE.Group()
    return { group, pose: { sit: 0, walk: 0, phase: 0, talk: 0, carry: 0 }, solve() {} }
  }
  value.configureRealistic({ tier: 'high', load: async name => { calls.push(name); return makePeople(name) }, createPerson: makeReal })
  const camera = new THREE.PerspectiveCamera()
  camera.position.copy(value.members[0].placeholder.group.position)
  value.onFrame(.2, { camera })
  await new Promise(resolve => setTimeout(resolve, 220))
  value.onFrame(.2, { camera })
  assert.ok(value.summary().loadedReal <= 4)
  assert.ok(calls.length <= 4)

  const low = context().value
  low.configureRealistic({ tier: 'low', load: async () => { throw new Error('must not load') }, createPerson: makeReal })
  low.onFrame(.2, { camera })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.ok(low.summary().loadedReal <= 2)
  assert.equal(low.members.length, 9)
  assert.equal(low.members.filter(member => member.placeholder.group.visible).length, 9)
})

test('WH-R1 R3 uses two batched human silhouettes with vertex colours and role accents', () => {
  const { value } = context()
  const standing = value.root.getObjectByName('wh-r1-staff-placeholder-standing')
  const seated = value.root.getObjectByName('wh-r1-staff-placeholder-seated')
  assert.ok(standing && seated)
  for (const mesh of [standing, seated]) {
    assert.ok(mesh.geometry.getAttribute('color'))
    assert.ok(mesh.geometry.getAttribute('position').count / 3 <= 400)
  }
  assert.equal(value.summary().placeholderCalls, 2)
  assert.ok(value.summary().placeholderTriangles <= 4000)
  assert.notDeepEqual(standing.instanceColor.array.slice(0, 3), standing.instanceColor.array.slice(6, 9))
})

test('WH-R1 R3 placeholder motion only updates the two shared instance buffers', () => {
  const { value } = context()
  const before = value.root.children.map(mesh => mesh.instanceMatrix.array.slice())
  value.onFrame(.25, { camera: new THREE.PerspectiveCamera() })
  const after = value.root.children.map(mesh => mesh.instanceMatrix.array.slice())
  assert.equal(value.summary().placeholderCalls, 2)
  assert.ok(after.some((array, index) => array.some((v, i) => v !== before[index][i])))
})

test('WH-R1 R4 real-only mode hydrates every registered worker without proxy visibility', async () => {
  const { value } = context()
  value.requireRealistic()
  const makeReal = () => ({ group: new THREE.Group(), pose: { sit: 0, walk: 0, phase: 0, talk: 0, carry: 0 }, solve() {} })
  value.configureRealistic({ tier: 'low', load: async name => ({ avatars: { [name]: {} }, clips: { male: {}, female: {} }, extras: { male: {}, female: {} } }), createPerson: makeReal })
  value.onFrame(.2, { camera: new THREE.PerspectiveCamera() })
  await new Promise(resolve => setTimeout(resolve, 20))
  value.onFrame(.2, { camera: new THREE.PerspectiveCamera() })
  assert.equal(value.summary().loadedReal, 9)
  assert.equal(value.root.getObjectByName('wh-r1-staff-placeholder-standing').visible, false)
  assert.equal(value.root.getObjectByName('wh-r1-staff-placeholder-seated').visible, false)
})
