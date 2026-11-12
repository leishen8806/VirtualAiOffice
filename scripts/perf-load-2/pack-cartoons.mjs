import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

// Container-only conversion: JSON fields and binary geometry remain unchanged.
const repo = fileURLToPath(new URL('../../', import.meta.url)), base = 'office3d/assets/models/characters', out = 'office3d/assets/compact'
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), rows = []
for (const dir of ['', 'hair']) for (const name of fs.readdirSync(path.join(repo, base, dir)).filter(n => n.endsWith('.gltf')).sort()) {
  const source = path.posix.join(base, dir, name), bytes = fs.readFileSync(path.join(repo, source)), json = JSON.parse(bytes)
  if (json.buffers?.length !== 1 || !json.buffers[0].uri || /^(data:|https?:)/.test(json.buffers[0].uri)) throw Error(`Unexpected buffer ${source}`)
  const sourceBuffer = path.posix.join(base, dir, json.buffers[0].uri), binary = fs.readFileSync(path.join(repo, sourceBuffer))
  if (binary.length !== json.buffers[0].byteLength) throw Error(`Buffer length mismatch ${source}`)
  delete json.buffers[0].uri
  const text = Buffer.from(JSON.stringify(json)), jsonLength = (text.length + 3) & ~3, binLength = (binary.length + 3) & ~3
  const glb = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength)
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8)
  glb.writeUInt32LE(jsonLength, 12); glb.writeUInt32LE(0x4e4f534a, 16); glb.fill(0x20, 20, 20 + jsonLength); text.copy(glb, 20)
  glb.writeUInt32LE(binLength, 20 + jsonLength); glb.writeUInt32LE(0x004e4942, 24 + jsonLength); binary.copy(glb, 28 + jsonLength)
  const output = gzipSync(glb, { level: 9 }), target = path.posix.join(out, 'characters', dir, name.replace('.gltf', '.glb.gz'))
  fs.mkdirSync(path.dirname(path.join(repo, target)), { recursive: true }); fs.writeFileSync(path.join(repo, target), output)
  rows.push({ source, sourceSha256: hash(bytes), sourceBuffer, sourceBufferSha256: hash(binary), file: target, bytes: output.length, sha256: hash(output), kind: 'cartoon-model', license: 'CC0-1.0 (Quaternius)' })
}
fs.writeFileSync(path.join(repo, out, 'conversion-cartoon.json'), JSON.stringify(rows, null, 2) + '\n')
console.log(JSON.stringify({ files: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0) }))
