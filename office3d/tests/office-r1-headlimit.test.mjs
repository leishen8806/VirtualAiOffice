import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as THREE from '../vendor/three/three.module.js'

const source = readFileSync(new URL('../people.js', import.meta.url), 'utf8')
const context = { THREE }
vm.runInNewContext(source.slice(source.indexOf('export const R1_HEAD_LIMITS'), source.indexOf('const used')).replaceAll('export ', '') + '\nthis.api={R1_HEAD_LIMITS,limitR1HeadQuaternion,r1HeadAngles}', context)
const { R1_HEAD_LIMITS, limitR1HeadQuaternion, r1HeadAngles } = context.api

const rad = Math.PI / 180
const q = (pitch, yaw, roll) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * rad, yaw * rad, roll * rad, 'YXZ'))
const scratch = () => ({
  bindHeadWorld: new THREE.Quaternion(), bindChestWorld: new THREE.Quaternion(), headMotion: new THREE.Quaternion(), chestMotion: new THREE.Quaternion(),
  relative: new THREE.Quaternion(), limited: new THREE.Quaternion(), inverse: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ'),
})

function fixture(pitch, yaw, roll) {
  const model = q(0, 27, 0), bindHead = q(-11, 8, 4), bindChest = q(6, -5, 2), chestMotion = q(12, 24, -7)
  const bindHeadWorld = model.clone().multiply(bindHead), bindChestWorld = model.clone().multiply(bindChest)
  return {
    model, bindHead, bindChest,
    chest: chestMotion.clone().multiply(bindChestWorld),
    head: chestMotion.clone().multiply(q(pitch, yaw, roll)).multiply(bindHeadWorld),
  }
}

test('R1 head limiter calibrates bind pose and proportionally returns every synthetic pose to the anatomical envelope', () => {
  for (let yaw = -180; yaw <= 180; yaw += 15) for (let pitch = -90; pitch <= 90; pitch += 15) for (let roll = -90; roll <= 90; roll += 15) {
    const f = fixture(pitch, yaw, roll), out = new THREE.Quaternion(), work = scratch(), angles = new THREE.Euler()
    limitR1HeadQuaternion(f.head, f.chest, f.model, f.bindHead, f.bindChest, out, work)
    r1HeadAngles(out, f.chest, f.model, f.bindHead, f.bindChest, angles, work)
    assert.ok(Math.abs(angles.y / rad) <= R1_HEAD_LIMITS.yaw + 1e-6)
    assert.ok(angles.x / rad >= R1_HEAD_LIMITS.pitchMin - 1e-6 && angles.x / rad <= R1_HEAD_LIMITS.pitchMax + 1e-6)
    assert.ok(Math.abs(angles.z / rad) <= R1_HEAD_LIMITS.roll + 1e-6)
  }
  const f = fixture(70, 160, 60), out = new THREE.Quaternion(), work = scratch(), angles = new THREE.Euler()
  limitR1HeadQuaternion(f.head, f.chest, f.model, f.bindHead, f.bindChest, out, work)
  r1HeadAngles(out, f.chest, f.model, f.bindHead, f.bindChest, angles, work)
  assert.ok(Math.abs(angles.y / rad - 80) < 1e-6)
  assert.ok(Math.abs(angles.x / rad - 35) < 1e-6)
  assert.ok(Math.abs(angles.z / rad - 30) < 1e-6)
})

test('R1 head limiter uses the same shortest-arc result for q and -q', () => {
  const f = fixture(-65, -145, 57), a = new THREE.Quaternion(), b = new THREE.Quaternion()
  limitR1HeadQuaternion(f.head, f.chest, f.model, f.bindHead, f.bindChest, a, scratch())
  const opposite = f.head.clone().set(-f.head.x, -f.head.y, -f.head.z, -f.head.w)
  limitR1HeadQuaternion(opposite, f.chest, f.model, f.bindHead, f.bindChest, b, scratch())
  assert.ok(1 - Math.abs(a.dot(b)) < 1e-12)
  assert.ok(a.dot(f.head) >= 0)
})

test('R1 head limiter recalibrates the model world basis after the person turns', () => {
  const f = fixture(12, 36, 48), turnedModel = q(0, 117, 0), turn = turnedModel.clone().multiply(f.model.clone().invert())
  f.model.copy(turnedModel); f.head.premultiply(turn); f.chest.premultiply(turn)
  const out = new THREE.Quaternion(), work = scratch(), angles = new THREE.Euler()
  limitR1HeadQuaternion(f.head, f.chest, f.model, f.bindHead, f.bindChest, out, work)
  r1HeadAngles(out, f.chest, f.model, f.bindHead, f.bindChest, angles, work)
  assert.ok(Math.abs(angles.z / rad) <= R1_HEAD_LIMITS.roll + 1e-6)
  const stale = fixture(12, 36, 48).model
  r1HeadAngles(out, f.chest, stale, f.bindHead, f.bindChest, angles, work)
  assert.ok(Math.abs(angles.z / rad) > R1_HEAD_LIMITS.roll)
})

test('only the R1 seated asset adapter opts realistic people into head limiting', () => {
  const ctx = { R1_POOL_WARNED: new Set(), console }
  vm.runInNewContext(source.slice(source.indexOf('export function r1SeatedAssets'), source.indexOf('export const R1_ARM_LIMITS')).replace('export function', 'function') + '\nthis.prepare=r1SeatedAssets', ctx)
  const clip = new THREE.AnimationClip('m_sit_table_idle_neutral_02', 1, []), P = { clips: { male: { sitIdle: clip } }, extras: { male: { sitFlavor: [clip] } } }
  const adapted = ctx.prepare(P, 'Male_Adult_11', { motions: ['neutral_01', 'neutral_02'] }, 'OpsLead')
  assert.equal(adapted.r1HeadLimit, true)
  assert.equal(P.r1HeadLimit, undefined)
})
