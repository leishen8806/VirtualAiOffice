import test from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const serverPath = path.join(root, 'office3d', 'server.mjs')

function waitForExit(child, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not exit in time')), timeoutMs)
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stderr }) })
  })
}

function waitForReady(child, port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not become ready')), 10000)
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${port}/health`, res => {
        res.resume()
        if (res.statusCode === 200) { clearTimeout(timer); resolve(); return }
        setTimeout(probe, 50)
      })
      req.on('error', () => setTimeout(probe, 50))
    }
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited before ready: ${code}: ${stderr}`)) })
    probe()
  })
}

async function forkServer(port, cwd) {
  const companyFile = path.join(cwd, 'company-id.txt')
  await fs.writeFile(companyFile, 'test-company\n')
  return fork(serverPath, [], { cwd: root, env: { ...process.env, OFFICE3D_PORT: String(port), OFFICE3D_COMPANY_ID_FILE: companyFile, LAN_ENABLED: 'false' }, silent: true })
}

test('disconnect exits within 4.5s and releases the port', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'office3d-disconnect-'))
  t.after(async () => { await fs.rm(cwd, { recursive: true, force: true }) })
  const port = 4401
  const child = await forkServer(port, cwd)
  t.after(() => child.kill('SIGKILL'))
  await waitForReady(child, port)
  const started = Date.now()
  child.disconnect()
  const result = await waitForExit(child)
  assert.equal(result.code, 0, result.stderr)
  assert.ok(Date.now() - started < 4500)
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 2000
    const probe = () => {
      const s = createServer().once('error', () => { if (Date.now() < deadline) setTimeout(probe, 50); else reject(new Error('port was not reusable')) }).listen(port, '127.0.0.1', () => s.close(resolve))
    }
    probe()
  })
})

test('EADDRINUSE exits with code 1', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'office3d-eaddr-'))
  t.after(async () => { await fs.rm(cwd, { recursive: true, force: true }) })
  const port = 4402
  const holder = createServer().listen(port, '0.0.0.0')
  await new Promise(resolve => holder.once('listening', resolve))
  const child = await forkServer(port, cwd)
  t.after(() => child.kill('SIGKILL'))
  const result = await waitForExit(child)
  holder.close()
  assert.equal(result.code, 1)
})
