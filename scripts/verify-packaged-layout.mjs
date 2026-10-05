import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8'))
const resource = desktop.build.extraResources.find((entry) => entry.to === 'core/packages/executors/runtime')
if (!resource) throw new Error('desktop extraResources does not include the shared executor runtime')

const source = path.resolve(root, 'desktop', resource.from)
if (!fs.existsSync(path.join(source, 'index.js'))) throw new Error(`runtime source is missing: ${source}`)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-packaged-'))
try {
  const runtime = path.join(temp, 'core', 'packages', 'executors', 'runtime')
  fs.mkdirSync(path.dirname(runtime), { recursive: true })
  fs.writeFileSync(path.join(temp, 'core', 'package.json'), '{"type":"module"}')
  fs.cpSync(source, runtime, { recursive: true, filter: (name) => /\.js$|\.d\.ts$/.test(name) || fs.statSync(name).isDirectory() })
  await import(pathToFileURL(path.join(runtime, 'index.js')).href)
  const shim = fs.readFileSync(path.join(root, 'src', 'workers', 'cli.js'), 'utf8').trim()
  if (!shim.startsWith('export * from')) throw new Error('legacy worker entry is not a runtime shim')
  const duplicates = fs.readdirSync(path.join(root, 'src', 'workers')).filter((name) => name.endsWith('.js') && name !== 'cli.js' && name !== 'base.js' && name !== 'openai.js')
  if (duplicates.length) throw new Error(`unexpected worker implementation files: ${duplicates.join(', ')}`)
  console.log('packaged layout ok: shared runtime resolves from core/packages/executors/runtime')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
