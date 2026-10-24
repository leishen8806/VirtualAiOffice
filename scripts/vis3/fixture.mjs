// T-01/P-03/P-04/P-05/P-07/P-12：隔离、异步清理、子进程登记、环境白名单、受保护文件排除、两级沙箱。
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { startMockPaperclip } from './mock-paperclip.mjs'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))

export class InfraError extends Error {}

const CHILDREN = new Set()
process.on('exit', () => { for (const c of CHILDREN) { try { c.kill('SIGKILL') } catch {} } })

const PROTECTED = /(^|\/)(lan\.json|wall\.json|config\.json|.*\.dpapi|\.env.*|.*ed25519.*|telegram[^/]*\.json|telegram[^/]*\.dpapi)$/i

function assertSafeRepo(repo) {
  if (!repo || !path.isAbsolute(repo)) throw new InfraError('VIS3_REPO 必须是绝对路径')
  const office3d = path.join(repo, 'office3d')
  if (!fs.existsSync(path.join(office3d, 'server.mjs')) || !fs.existsSync(path.join(office3d, 'index.html'))) {
    throw new InfraError(`目标仓库缺少 office3d/server.mjs 或 index.html：${repo}`)
  }
  return office3d
}

export async function bootIsolated({ repo, office = false, campus = false, missing = false, corrupt = false, outDir }) {
  const office3d = assertSafeRepo(repo)
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-iso-'))
  const sandbox = path.join(tmpRoot, 'sandbox')
  fs.mkdirSync(sandbox, { recursive: true })
  const tmpOffice = path.join(sandbox, 'office3d')
  const emptyBin = path.join(tmpRoot, 'empty-bin'); fs.mkdirSync(emptyBin, { recursive: true })
  fs.mkdirSync(path.join(tmpRoot, 'knowledge'), { recursive: true })
  const cleanupErrors = []
  let logFd = -1
  let mock = null
  let child = null

  const stop = async () => {
    if (child) {
      const exited = child.exitCode !== null || child.signalCode !== null
      if (!exited) {
        try { child.kill('SIGTERM') } catch {}
        try { await Promise.race([once(child, 'exit'), new Promise((r) => setTimeout(r, 3000))]) } catch {}
        if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL') } catch {}; try { await once(child, 'exit') } catch {} }
      }
      CHILDREN.delete(child)
    }
    if (mock) { try { mock.server.close() } catch {} }
    if (logFd >= 0) { try { fs.closeSync(logFd) } catch {} }
    try { fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch (e) { cleanupErrors.push('rmSync:' + e.code) }
  }

  try {
    fs.cpSync(office3d, tmpOffice, { recursive: true, errorOnExist: false, force: true, filter: (src) => !PROTECTED.test(src) })
    fs.writeFileSync(path.join(sandbox, 'company-id.txt'), 'fixture-company-0001\n')
    const workhoursSrc = path.join(repo, 'workhours')
    if (fs.existsSync(workhoursSrc)) fs.cpSync(workhoursSrc, path.join(sandbox, 'workhours'), { recursive: true, errorOnExist: false, force: true })
    else fs.mkdirSync(path.join(sandbox, 'workhours'), { recursive: true })
    fs.writeFileSync(path.join(sandbox, 'workhours', 'workhours.json'), JSON.stringify({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Asia/Phnom_Penh' }))
    // 注入假配置（受保护文件在复制时已被排除，这里写的是夹具假值）
    fs.writeFileSync(path.join(tmpOffice, 'lan.json'), JSON.stringify({ enabled: false, write: false, code: 'fixture-lan-code' }))
    fs.writeFileSync(path.join(tmpOffice, 'wall.json'), JSON.stringify({ enabled: false, token: 'fixture-wall-token-0001' }))
    const of = path.join(tmpOffice, 'office-visual.json'), cf = path.join(tmpOffice, 'campus-visual.json')
    if (missing) { try { fs.rmSync(of, { force: true }) } catch {} ; try { fs.rmSync(cf, { force: true }) } catch {} }
    else if (corrupt) { fs.writeFileSync(of, '{bad'); fs.writeFileSync(cf, '{bad') }
    else { fs.writeFileSync(of, JSON.stringify({ enabled: office })); fs.writeFileSync(cf, JSON.stringify({ enabled: campus })) }

    const netLog = path.join(outDir, 'logs', 'blocked-network.jsonl')
    const mockLog = path.join(outDir, 'logs', 'mock-requests.jsonl')
    fs.mkdirSync(path.dirname(netLog), { recursive: true }); fs.writeFileSync(netLog, ''); fs.writeFileSync(mockLog, '')
    mock = await startMockPaperclip({ logFile: mockLog })
    const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
    logFd = fs.openSync(path.join(outDir, 'logs', 'server.log'), 'w')
    const env = {
      PATH: emptyBin,
      TMP: os.tmpdir(), TEMP: os.tmpdir(),
      PAPERCLIP_API_URL: `http://127.0.0.1:${mock.port}`,
      OFFICE3D_PORT: String(port),
      VIS3_NET_LOG: netLog,
      VIS3_ALLOWED_PORTS: `${mock.port},${port}`,
      NODE_OPTIONS: '',
    }
    child = spawn(process.execPath, ['--max-old-space-size=1024', '--import', pathToFileURL(path.join(HERE, 'block-network.mjs')).href, path.join(tmpOffice, 'server.mjs')], {
      cwd: sandbox,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    CHILDREN.add(child)
    child.stdout.on('data', (d) => { try { fs.writeSync(logFd, d) } catch {} }); child.stderr.on('data', (d) => { try { fs.writeSync(logFd, d) } catch {} })
    const base = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) }); if (r.ok) return { base, mock, child, tmpRoot, stop, cleanupErrors } } catch {}
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new InfraError('VIS3 隔离服务启动失败')
  } catch (error) {
    await stop(); throw error
  }
}
