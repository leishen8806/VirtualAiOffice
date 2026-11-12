import http from 'node:http'
import fs from 'node:fs'
export function startMockPaperclip({ logFile = '' } = {}) {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      requests.push({ at: new Date().toISOString(), method: req.method, url: req.url })
      if (logFile) fs.appendFileSync(logFile, JSON.stringify(requests[requests.length - 1]) + '\n')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.method !== 'GET') return res.end(JSON.stringify({ ok: true, id: 'mock-1' }))
      const p = String(req.url || '').split('?')[0]
      if (p.endsWith('/agents')) return res.end('[]')
      if (p.includes('/issues')) return res.end('[]')
      if (p.endsWith('/dashboard')) return res.end(JSON.stringify({ tasks: {}, costs: {}, pendingApprovals: 0 }))
      if (p.includes('approvals') || p.includes('heartbeat-runs') || p.includes('projects')) return res.end('[]')
      res.end('[]')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests })))
}
