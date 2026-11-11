import test from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const serverPath = path.join(root, 'office3d', 'server.mjs')
const companyFile = path.join(root, 'company-id.txt')

function waitForExit(child, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child did not exit in time')), timeoutMs)
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
  })
}

function waitForReady(child, port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not become ready')), 10000)
    const probe = () => {
      const s = createServer().once('error', () => setTimeout(probe, 50)).listen(port, '127.0.0.1', () => {
        s.close(() => { clearTimeout(timer); resolve() })
      })
    }
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited before ready: ${code}`)) })
    probe()
  })
}

function forkServer(port) {
  return fork(serverPath, [], { cwd: root, env: { ...process.env, OFFICE3D_PORT: String(port), LAN_ENABLED: 'false' }, silent: true })
}

test('disconnect exits within 4.5s and releases the port', async (t) => {
  await fs.writeFile(companyFile, 'test-company\n')
  t.after(async () => { await fs.rm(companyFile, { force: true }) })
  const port = 4401
  const child = forkServer(port)
  t.after(() => child.kill('SIGKILL'))
  await waitForReady(child, port)
  const started = Date.now()
  child.disconnect()
  const result = await waitForExit(child)
  assert.equal(result.code, 0)
  assert.ok(Date.now() - started < 4500)
  await new Promise((resolve, reject) => {
    const s = createServer().once('error', reject).listen(port, '127.0.0.1', () => s.close(resolve))
  })
})

test('EADDRINUSE exits with code 1', async (t) => {
  await fs.writeFile(companyFile, 'test-company\n')
  t.after(async () => { await fs.rm(companyFile, { force: true }) })
  const port = 4402
  const holder = createServer().listen(port, '0.0.0.0')
  await new Promise(resolve => holder.once('listening', resolve))
  const child = forkServer(port)
  t.after(() => child.kill('SIGKILL'))
  const result = await waitForExit(child)
  holder.close()
  assert.equal(result.code, 1)
})
