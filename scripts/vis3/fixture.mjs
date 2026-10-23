import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startMockPaperclip } from './mock-paperclip.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export async function bootIsolated({ repo, office = false, campus = false, outDir }) {
  const OFFICE = path.join(repo, 'office3d')
  fs.writeFileSync(path.join(repo, 'company-id.txt'), 'fixture-company-0001\n')
  fs.mkdirSync(path.join(repo, 'workhours'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'workhours', 'workhours.json'), JSON.stringify({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], tz: 'Asia/Phnom_Penh' }))
  fs.writeFileSync(path.join(OFFICE, 'lan.json'), JSON.stringify({ enabled: false, write: false, code: 'fixture-lan-code' }))
  fs.writeFileSync(path.join(OFFICE, 'wall.json'), JSON.stringify({ enabled: false, token: 'fixture-wall-token-0001' }))
  for (const f of ['acceptance.json', 'standup.json', 'committee.json', 'evidence-version.json', 'telegram.json', 'state-last-good.json']) { try { fs.rmSync(path.join(OFFICE, f), { force: true }) } catch {} }
  fs.writeFileSync(path.join(OFFICE, 'office-visual.json'), JSON.stringify({ enabled: office }))
  fs.writeFileSync(path.join(OFFICE, 'campus-visual.json'), JSON.stringify({ enabled: campus }))
  const netLog = path.join(outDir, 'logs', 'blocked-network.jsonl')
  const mockLog = path.join(outDir, 'logs', 'mock-requests.jsonl')
  fs.mkdirSync(path.dirname(netLog), { recursive: true }); fs.writeFileSync(netLog, ''); fs.writeFileSync(mockLog, '')
  const mock = await startMockPaperclip({ logFile: mockLog })
  const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
  const logFd = fs.openSync(path.join(outDir, 'logs', 'server.log'), 'w')
  const child = spawn(process.execPath, ['--import', path.join(HERE, 'block-network.mjs'), path.join(OFFICE, 'server.mjs')], {
    cwd: repo,
    env: { ...process.env, PAPERCLIP_API_URL: `http://127.0.0.1:${mock.port}`, OFFICE3D_PORT: String(port), VIS3_NET_LOG: netLog, VIS3_ALLOWED_PORTS: `${mock.port},${port}`, NODE_OPTIONS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => fs.writeSync(logFd, d)); child.stderr.on('data', (d) => fs.writeSync(logFd, d))
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) { try { const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) }); if (r.ok) return { base, mock, child, stop: () => { try { child.kill('SIGTERM') } catch {} ; mock.server.close() } } } catch {} await new Promise((r) => setTimeout(r, 300)) }
  child.kill('SIGKILL'); mock.server.close(); throw new Error('VIS3 隔离服务启动失败')
}
