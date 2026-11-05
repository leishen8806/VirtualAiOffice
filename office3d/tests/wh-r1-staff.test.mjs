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
