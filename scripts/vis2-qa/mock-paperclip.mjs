// VIS2-Q 模拟 Paperclip：只读夹具数据，记录全部请求；不做任何真实派发 / 审批 / 写入。
import http from 'node:http'
import fs from 'node:fs'

export function startMockPaperclip({ logFile = '' } = {}) {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      let body = ''
      try { body = Buffer.concat(chunks).toString('utf8') } catch {}
      const entry = { at: new Date().toISOString(), method: req.method, url: req.url, body: body.slice(0, 500) }
      requests.push(entry)
      if (logFile) fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      const path = String(req.url || '').split('?')[0]
      const reply = (value) => { res.end(JSON.stringify(value)) }
      if (req.method !== 'GET') return reply({ ok: true, id: 'mock-write-0001' })
      if (path.endsWith('/agents')) return reply([])
      if (path.includes('/issues')) return reply([])
      if (path.endsWith('/dashboard')) return reply({ tasks: { todo: 0, done: 0 }, costs: { total: 0 }, pendingApprovals: 0 })
      if (path.includes('approvals')) return reply([])
      if (path.includes('heartbeat-runs')) return reply([])
      if (path.includes('/projects')) return reply([])
      return reply([])
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests }))
  })
}
