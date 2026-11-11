import * as THREE from 'three'

// Byte planes compress repeated exponents; optional fixed-point deltas have an
// explicit per-track precision and are checked against the source by the converter.
export function encodeAnimationClips(clips, { quantize = false } = {}) {
  const arrays = [], metadata = clips.map(clip => ({ name: clip.name, duration: clip.duration, blendMode: clip.blendMode, tracks: clip.tracks.map(t => {
    const precision = quantize ? (t.ValueTypeName === 'quaternion' ? 1e-6 : 1e-5) : 0
    const row = { name: t.name, type: t.ValueTypeName, interpolation: t.getInterpolation(), times: t.times.length, values: t.values.length, precision, stride: t.getValueSize() }
    const values = precision ? new Int32Array(t.values.length) : new Float32Array(t.values)
    if (precision) for (let i = 0; i < values.length; i++) {
      const value = Math.round(t.values[i] / precision), previous = i < row.stride ? 0 : Math.round(t.values[i - row.stride] / precision)
      if (Math.abs(value) > 0x7fffffff || Math.abs(value - previous) > 0x7fffffff) throw new Error('Animation fixed-point overflow')
      values[i] = value - previous
    }
    arrays.push(new Float32Array(t.times), values); return row
  }) }))
  const header = new TextEncoder().encode(JSON.stringify(metadata)), padding = (4 - header.length % 4) % 4
  const output = new ArrayBuffer(8 + header.length + padding + arrays.reduce((n, a) => n + a.byteLength, 0)), view = new DataView(output)
  view.setUint32(0, 0x32414f56, true); view.setUint32(4, header.length, true)
  new Uint8Array(output, 8, header.length).set(header)
  let offset = 8 + header.length + padding
  for (const array of arrays) {
    const input = new Uint8Array(array.buffer), target = new Uint8Array(output, offset, array.byteLength)
    for (let byte = 0; byte < 4; byte++) for (let i = 0; i < array.length; i++) target[byte * array.length + i] = input[i * 4 + byte]
    offset += array.byteLength
  }
  return output
}

export function decodeAnimationClips(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8) throw new Error('Invalid compact animation')
  const view = new DataView(buffer), length = view.getUint32(4, true)
  if (view.getUint32(0, true) !== 0x32414f56 || length > buffer.byteLength - 8) throw new Error('Invalid compact animation header')
  const clips = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)))
  let offset = 8 + length + (4 - length % 4) % 4
  const read = (n, precision = 0, stride = 1) => {
    if (!Number.isSafeInteger(n) || n < 1 || n > (buffer.byteLength - offset) / 4) throw new Error('Invalid compact animation track')
    const array = new Float32Array(n), target = new Uint8Array(array.buffer), source = new Uint8Array(buffer, offset, n * 4)
    for (let byte = 0; byte < 4; byte++) for (let i = 0; i < n; i++) target[i * 4 + byte] = source[byte * n + i]
    offset += n * 4
    if (precision) {
      if (!(precision > 0) || !Number.isInteger(stride) || stride < 1 || stride > 4) throw new Error('Invalid fixed-point animation')
      const integers = new Int32Array(array.buffer), values = new Float32Array(n)
      for (let i = 0; i < n; i++) { if (i >= stride) integers[i] += integers[i - stride]; values[i] = integers[i] * precision }
      return values
    }
    return array
  }
  // AnimationMixer caches by UUID; parse otherwise overwrites the generated UUID with undefined.
  const result = clips.map(c => THREE.AnimationClip.parse({ ...c, uuid: THREE.MathUtils.generateUUID(), tracks: c.tracks.map(t => ({ ...t, times: read(t.times), values: read(t.values, t.precision, t.stride) })) }))
  if (offset !== buffer.byteLength) throw new Error('Trailing compact animation data')
  return result
}
