import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = path.join(root, 'assets', 'third-party', 'MANIFEST.json')

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(target) : [target]
  }))).flat()
}

test('AS1-2 records the rejected CC0 package without installing a model', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const item = manifest.packages.find((entry) => entry.id === 'kenney-car-kit')
  assert.ok(item)
  assert.equal(item.license, 'CC0-1.0')
  assert.equal(item.productLine, '仓配')
  assert.equal(item.status, 'rejected')
  assert.deepEqual(item.usedModels, [])
  assert.equal(item.files.length, 231)
  for (const file of item.files) assert.match(file.SHA256, /^[A-F0-9]{64}$/)
  assert.match(await readFile(path.join(root, item.licenseFile), 'utf8'), /Creative Commons Zero, CC0/)
})

test('AS1-2 keeps the warehouse model namespace registered and script-free', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const registered = new Set(manifest.packages.flatMap((entry) => entry.usedModels || []))
  const modelRoot = path.join(root, 'assets', 'models', 'dr-campus')
  for (const file of await filesUnder(modelRoot)) {
    const relative = path.relative(root, file).replaceAll('\\', '/')
    assert.equal(registered.has(relative), true, `unregistered warehouse asset: ${relative}`)
  }

  const forbidden = new Set(['.exe', '.bat', '.cmd', '.ps1', '.js', '.mjs', '.cjs', '.html', '.htm', '.py', '.dll', '.url'])
  for (const base of [modelRoot, path.join(root, 'assets', 'third-party')]) {
    for (const file of await filesUnder(base)) assert.equal(forbidden.has(path.extname(file).toLowerCase()), false, file)
  }
})
