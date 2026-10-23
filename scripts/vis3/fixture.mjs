// T-01 文件系统隔离：绝不写/删目标仓库或应用目录；总是先复制到独立临时目录再注入配置。
// 只清理本框架自建并拥有的临时目录；启动前校验目标，拒绝不安全/未解析路径。
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { startMockPaperclip } from './mock-paperclip.mjs'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))

export class InfraError extends Error {}

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
  // 拥有权：自建临时根，全部配置注入临时副本；不清理不属于本框架的目录
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-iso-'))
  const owned = [tmpRoot]
  const cleanup = () => { for (const d of [...owned].reverse()) { try { fs.rmSync(d, { recursive: true, force: true }) } catch {} } }
  try {
    const tmpOffice = path.join(tmpRoot, 'office3d')
    fs.cpSync(office3d, tmpOffice, { recursive: true, errorOnExist: false, force: true })
    fs.writeFileSync(path.join(tmpRoot, 'company-id.txt'), 'fixture-company-0001\n')
    const workhoursSrc = path.join(repo, 'workhours')
    if (fs.existsSync(workhoursSrc)) fs.cpSync(workhoursSrc, path.join(tmpRoot, 'workhours'), { recursive: true, errorOnExist: false, force: true })
    else fs.mkdirSync(path.join(tmpRoot, 'workhours'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'workhours', 'workhours.json'), JSON.stringify({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Asia/Phnom_Penh' }))
    fs.writeFileSync(path.join(tmpOffice, 'lan.json'), JSON.stringify({ enabled: false, write: false, code: 'fixture-lan-code' }))
    fs.writeFileSync(path.join(tmpOffice, 'wall.json'), JSON.stringify({ enabled: false, token: 'fixture-wall-token-0001' }))
    const of = path.join(tmpOffice, 'office-visual.json'), cf = path.join(tmpOffice, 'campus-visual.json')
    if (missing) { try { fs.rmSync(of, { force: true }) } catch {} ; try { fs.rmSync(cf, { force: true }) } catch {} }
    else if (corrupt) { fs.writeFileSync(of, '{bad'); fs.writeFileSync(cf, '{bad') }
    else { fs.writeFileSync(of, JSON.stringify({ enabled: office })); fs.writeFileSync(cf, JSON.stringify({ enabled: campus })) }
    const netLog = path.join(outDir, 'logs', 'blocked-network.jsonl')
    const mockLog = path.join(outDir, 'logs', 'mock-requests.jsonl')
    fs.mkdirSync(path.dirname(netLog), { recursive: true }); fs.writeFileSync(netLog, ''); fs.writeFileSync(mockLog, '')
    const mock = await startMockPaperclip({ logFile: mockLog })
    const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
    const logFd = fs.openSync(path.join(outDir, 'logs', 'server.log'), 'w')
    const child = spawn(process.execPath, ['--import', pathToFileURL(path.join(HERE, 'block-network.mjs')).href, path.join(tmpOffice, 'server.mjs')], {
      cwd: tmpRoot,
      env: { ...process.env, PAPERCLIP_API_URL: `http://127.0.0.1:${mock.port}`, OFFICE3D_PORT: String(port), VIS3_NET_LOG: netLog, VIS3_ALLOWED_PORTS: `${mock.port},${port}`, NODE_OPTIONS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => fs.writeSync(logFd, d)); child.stderr.on('data', (d) => fs.writeSync(logFd, d))
    const base = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) }); if (r.ok) return { base, mock, child, tmpRoot, stop: () => { try { child.kill('SIGTERM') } catch {} ; try { mock.server.close() } catch {} ; cleanup() } } } catch {}
      await new Promise((r) => setTimeout(r, 300))
    }
    child.kill('SIGKILL'); mock.server.close(); throw new InfraError('VIS3 隔离服务启动失败')
  } catch (error) {
    cleanup(); throw error
  }
}
