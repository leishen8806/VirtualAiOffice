import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
const town = readFileSync(new URL('../town-3d.js', import.meta.url), 'utf8')

test('3d town uses authenticated data routes instead of static json paths', () => {
  assert.match(town, /fetch\('\/town\/3d-data\/town-3d-data\.json'\)/)
  assert.match(town, /fetch\('\/town\/map'\)/)
  assert.doesNotMatch(town, /fetch\('\/town-map\.json'\)/)
})

test('3d data route keeps a fixed filename allowlist and method gate', async () => {
  assert.match(server, /API_PATHS\.add\('\/town\/3d-data'\)/)
  assert.match(server, /const allowed = new Set\(\['town-3d-data\.json', 'pp-core\.json', 'pp-peripheral\.json', 'pp-riverfront\.json', 'pp-warehouse\.json'\]\)/)
  assert.match(server, /if \(!allowed\.has\(name\) \|\| name\.includes\('\/'\) \|\| name\.includes\('\\\\'\) \|\| name\.includes\('\.\.'\)\) return json\(404/)
  assert.match(server, /if \(req\.method !== 'GET'\) return json\(405/)
  assert.match(server, /url\.pathname\.startsWith\('\/town\/3d-data\/'\)/)

  const port = 4387
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, OFFICE3D_PORT: String(port), OFFICE3D_COMPANY_ID_FILE: fileURLToPath(new URL('./fixtures/town-company-id.txt', import.meta.url)), LAN_ENABLED: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 8000)
      child.stdout.on('data', chunk => { if (String(chunk).includes(`127.0.0.1:${port}`)) { clearTimeout(timer); resolve() } })
      child.once('error', reject)
      child.once('exit', code => reject(new Error(`server exited ${code}`)))
    })
    const request = async (path, options) => (await fetch(`http://127.0.0.1:${port}${path}`, options)).status
    assert.equal(await request('/town/3d-data/town-3d-data.json'), 200)
    assert.equal(await request('/town/3d-data/not-allowlisted.json'), 404)
    assert.equal(await request('/town/3d-data/../server.mjs'), 404)
    assert.equal(await request('/town/3d-data/town-3d-data.json', { method: 'POST' }), 405)
  } finally {
    child.kill('SIGTERM')
  }
})
