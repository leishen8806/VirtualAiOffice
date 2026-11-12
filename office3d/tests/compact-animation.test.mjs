import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from '../vendor/three/three.module.js'
import vm from 'node:vm'
import { initialQuality } from '../quality.js'

const source = readFileSync(new URL('../compact-animation.js', import.meta.url), 'utf8').replace("'three'", JSON.stringify(new URL('../vendor/three/three.module.js', import.meta.url).href))
const { encodeAnimationClips, decodeAnimationClips } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('compact tracks preserve Float32 samples, names, duration and interpolation', () => {
  const clips = [new THREE.AnimationClip('fixture', 2, [
    new THREE.QuaternionKeyframeTrack('Bip01.quaternion', [0, .123, 2], [0, 0, 0, 1, .1, .2, .3, .9, .2, .1, .3, .9]),
    new THREE.VectorKeyframeTrack('Bip01.position', [0, 2], [.125, -20, 0, 1.23456, 3, 4]),
  ])]
  const result = decodeAnimationClips(encodeAnimationClips(clips))
  assert.equal(result[0].name, clips[0].name); assert.equal(result[0].duration, 2)
  clips[0].tracks.forEach((track, i) => {
    assert.equal(result[0].tracks[i].name, track.name)
    assert.deepEqual(result[0].tracks[i].times, track.times); assert.deepEqual(result[0].tracks[i].values, track.values)
    const a = track.createInterpolant(), b = result[0].tracks[i].createInterpolant()
    for (let t = 0; t < 2; t += 1 / 120) assert.deepEqual(b.evaluate(t), a.evaluate(t))
  })
})

test('compact decoder rejects truncation, bad magic and trailing bytes', () => {
  const good = encodeAnimationClips([new THREE.AnimationClip('test', 1, [new THREE.VectorKeyframeTrack('Bip01.position', [0, 1], [0, 0, 0, 1, 2, 3])])])
  for (const buffer of [new ArrayBuffer(0), good.slice(0, 7), good.slice(0, -1), new ArrayBuffer(good.byteLength)]) assert.throws(() => decodeAnimationClips(buffer))
  const extra = new Uint8Array(good.byteLength + 4); extra.set(new Uint8Array(good)); assert.throws(() => decodeAnimationClips(extra.buffer), /Trailing/)
})

test('separate decoded clips remain separate AnimationMixer actions across files', () => {
  const make = x => decodeAnimationClips(encodeAnimationClips([new THREE.AnimationClip('pose', 1, [new THREE.VectorKeyframeTrack('.position', [0, 1], [x, 0, 0, x, 0, 0])])]))[0]
  const a = make(1), b = make(5), root = new THREE.Group(), mixer = new THREE.AnimationMixer(root)
  assert.ok(a.uuid); assert.notEqual(a.uuid, b.uuid)
  const first = mixer.clipAction(a), second = mixer.clipAction(b)
  assert.notEqual(first, second)
  first.play(); mixer.update(.25); assert.equal(root.position.x, 1)
  first.stop(); second.play(); mixer.update(.25); assert.equal(root.position.x, 5)
})

test('fixed-point deltas retain negative components and bound the conversion error', () => {
  const clips = [new THREE.AnimationClip('quantized', 1, [new THREE.QuaternionKeyframeTrack('arm.quaternion', [0, 1], [-.12345678, .2, .3, .8, .3141592, -.5, .2, .7])])]
  const [copy] = decodeAnimationClips(encodeAnimationClips(clips, { quantize: true }))
  copy.tracks[0].values.forEach((v, i) => assert.ok(Math.abs(v - clips[0].tracks[0].values[i]) <= 5.1e-7))
})

test('texture variants resolve hair/../tex paths and select phone or explicit low quality', () => {
  const source = readFileSync(new URL('../compact-assets.js', import.meta.url), 'utf8')
  const code = source.slice(source.indexOf('export function compactTextureSize'), source.indexOf('async function unpack')).replaceAll('export ', '') + '\nthis.size=compactTextureSize;this.url=compactTextureUrl'
  const context = { THREE, URL, initialQuality, location: { href: 'http://localhost/index.html', search: '?q=high' }, matchMedia: () => ({ matches: false }) }
  vm.runInNewContext(code, context)
  assert.equal(context.size(), 1024)
  assert.equal(context.url('./assets/models/characters/hair/../tex/T_Hair_1_Normal.png'), 'http://localhost/assets/compact/1024/characters/tex/T_Hair_1_Normal.webp')
  context.location.search = '?q=low'; assert.equal(context.size(), 512)
  context.location.search = '?q=high'; context.matchMedia = () => ({ matches: true }); assert.equal(context.size(), 512)
  assert.equal(context.url('./assets/models/furniture/desk.glb'), './assets/models/furniture/desk.glb')
})
