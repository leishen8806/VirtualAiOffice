import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const repo = fileURLToPath(new URL('../../', import.meta.url)), root = path.join(repo, 'office3d/assets/compact')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')
const files = ['animation', 'model'].flatMap(kind => read(`conversion-${kind}.json`).map(row => ({ source: row.file, sourceSha256: row.sourceSha256, file: `office3d/assets/compact/${row.target}`, bytes: row.bytes, sha256: row.sha256, kind, validation: row.proof, license: row.cartoon ? 'CC0-1.0 (Quaternius)' : 'MIT (Microsoft Rocketbox)' })))
files.push(...read('conversion-cartoon.json'))
files.push(...read('conversion-textures.json').map(row => ({ source: row.source, sourceSha256: row.sourceSha256, file: row.target, bytes: row.bytes, sha256: row.sha256, kind: 'texture', dimensions: row.dimensions, license: row.source.includes('/people/') ? 'MIT (Microsoft Rocketbox)' : 'CC0-1.0 (Quaternius)' })))
for (const row of files) {
  if (sha(row.source) !== row.sourceSha256 || sha(row.file) !== row.sha256 || fs.statSync(path.join(repo, row.file)).size !== row.bytes) throw Error(`Asset provenance mismatch ${row.file}`)
  if (row.sourceBuffer && sha(row.sourceBuffer) !== row.sourceBufferSha256) throw Error(`Source buffer changed ${row.sourceBuffer}`)
}
fs.writeFileSync(path.join(root, 'MANIFEST.json'), JSON.stringify({ schemaVersion: 1, threeRevision: '185', originalFilesRetained: true, format: 'GLB gzip / VOA2 Float32 byte-plane animation gzip / WebP', animationTolerance: { quaternionComponent: 1e-5, positionSourceUnits: 2e-5, samplesPerSecond: 120, allSourceKeyframes: true }, files: files.sort((a, b) => a.file.localeCompare(b.file, 'en')) }, null, 2) + '\n')
console.log(JSON.stringify({ files: files.length, bytes: files.reduce((n, row) => n + row.bytes, 0) }))
