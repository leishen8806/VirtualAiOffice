import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'

const [srcDir, outDir, gltfpackBin, ratio = '0.25'] = process.argv.slice(2)
if (!srcDir || !outDir || !gltfpackBin) throw new Error('usage: node generate-wh-r1-staff-lod.mjs <srcDir> <outDir> <gltfpack-bin> [ratio]')
const names = ['Male_Adult_03', 'Female_Adult_04', 'Male_Adult_05', 'Female_Adult_05', 'Male_Adult_06', 'Female_Adult_06', 'Male_Adult_08', 'Male_Adult_09', 'Female_Adult_08']
fs.mkdirSync(outDir, { recursive: true })
for (const name of names) {
  const input = path.join(outDir, `${name}.glb`), output = path.join(outDir, `${name}-lod.glb`)
  fs.writeFileSync(input, zlib.gunzipSync(fs.readFileSync(path.join(srcDir, `${name}.glb.gz`))))
  const result = spawnSync(process.execPath, [gltfpackBin, '-i', input, '-o', output, '-si', ratio, '-kn', '-ke'], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`gltfpack failed for ${name}`)
  fs.writeFileSync(path.join(outDir, `${name}.glb.gz`), zlib.gzipSync(fs.readFileSync(output), { level: 9 }))
  fs.rmSync(input); fs.rmSync(output)
}
