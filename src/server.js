import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import * as skinStore from './skins.js'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

// public/index.html is written as a document fragment (so the same file can be published as a
// standalone page); the server supplies the document shell.
const SHELL =
  '<!doctype html>\n<html lang="zh-CN">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLoopback(host) {
  return LOOPBACK.has(host)
}

export function createServer(coord, { publicDir, host, token, setup, skins = skinStore }) {
  const clients = new Set()
  const loopbackOnly = isLoopback(host)
  if (!loopbackOnly && (typeof token !== 'string' || !token.trim())) throw new Error('A non-loopback server requires a non-empty token')
  const sessions = new Set()
  // The request really comes from this computer (not a phone on the LAN), whatever address we listen on.
  const fromThisComputer = (req) => isLoopback(String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''))

  coord.on('event', (ev) => {
    let data
    try { data = `data: ${JSON.stringify(ev)}\n\n` } catch { return }
    for (const res of clients) safeWrite(res, data)
  })

  const heartbeat = setInterval(() => {
    for (const res of clients) safeWrite(res, ': ping\n\n')
  }, 20000)
  heartbeat.unref()

  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  }
  const safeWrite = (res, data) => {
    if (res.destroyed || res.writableEnded) return false
    try { return res.write(data) } catch { return false }
  }
  const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    if (res.destroyed || res.writableEnded) return
    try {
      res.writeHead(code, { ...securityHeaders, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra })
      res.end(body)
    } catch {}
  }
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8')

  const sameSecret = (actual, expected) => {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false
    const a = Buffer.from(actual)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }
  const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=')
    return i < 0 ? [] : [part.slice(0, i).trim(), part.slice(i + 1).trim()]
  }).filter((entry) => entry.length === 2))
  const sessionOk = (req) => {
    const sid = cookies(req).vao_sid
    if (!sid) return false
    for (const valid of sessions) if (sameSecret(sid, valid)) return true
    return false
  }
  const issueSession = (res) => {
    const sid = crypto.randomBytes(24).toString('base64url')
    sessions.add(sid)
    send(res, 302, '', 'text/plain; charset=utf-8', {
      Location: '/',
      'Set-Cookie': `vao_sid=${sid}; HttpOnly; SameSite=Strict; Path=/`,
    })
  }

  const hostOk = (req) => {
    if (!loopbackOnly) return true
    const h = String(req.headers.host || '').replace(/:\d+$/, '')
    return isLoopback(h)
  }
  const originOk = (req) => {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      return new URL(origin).host === req.headers.host
    } catch {
      return false
    }
  }
  const authOk = (req) => loopbackOnly || sameSecret(req.headers['x-niuma-token'], token) || sessionOk(req)

  const readBody = (req, max = 200_000) =>
    new Promise((resolve, reject) => {
      let body = ''
      req.setEncoding('utf8')
      let settled = false
      req.on('data', (c) => {
        if (settled) return
        body += c
        if (body.length > max) {
          settled = true
          reject(new Error('too large'))
          req.resume()
        }
      })
      req.on('end', () => { if (!settled) { settled = true; resolve(body) } })
      req.on('error', (error) => { if (!settled) { settled = true; reject(error) } })
    })

  const server = http.createServer(async (req, res) => {
    try {
      if (String(req.url || '').startsWith('//')) return send(res, 400, 'Bad request')
      let url
      try { url = new URL(req.url, 'http://niuma.local') } catch { return send(res, 400, 'Bad request') }
      // Blocks DNS-rebinding: a page on another domain can't talk to us through a hostname it controls.
      if (!hostOk(req)) return send(res, 403, 'Forbidden host')

      if (!loopbackOnly && req.method === 'GET' && url.pathname === '/' && sameSecret(url.searchParams.get('token'), token)) {
        return issueSession(res)
      }

      if (url.pathname === '/events' || url.pathname.startsWith('/api/')) {
        if (!authOk(req)) return send(res, 401, 'Missing or wrong token')

        if (req.method === 'GET' && url.pathname === '/events') {
          res.writeHead(200, {
            ...securityHeaders,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          safeWrite(res, `data: ${JSON.stringify({ type: 'snapshot', state: coord.snapshot() })}\n\n`)
          clients.add(res)
          req.on('close', () => clients.delete(res))
          return
        }
        if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, coord.snapshot())

        // 「接入员工」会装软件、开终端、写配置：只给本机用，局域网里的手机不行。
        if (url.pathname.startsWith('/api/setup')) {
          if (!setup) return send(res, 404, 'Not found')
          if (!fromThisComputer(req)) return json(res, 403, { ok: false, error: '只能在运行智序工场的那台电脑上接入员工' })
          if (req.method === 'GET' && url.pathname === '/api/setup') {
            try {
              return json(res, 200, await setup.status())
            } catch (e) {
              return json(res, 500, { ok: false, error: e.message })
            }
          }
        }

        // 自制皮肤：谁都能看；存、删、开文件夹只给本机。
        if (req.method === 'GET' && url.pathname === '/api/skins') {
          try {
            return json(res, 200, skins.listSkins())
          } catch (e) {
            return json(res, 500, { ok: false, error: e.message })
          }
        }
        if (url.pathname.startsWith('/api/skins/') && !fromThisComputer(req)) {
          return json(res, 403, { ok: false, error: '只能在运行智序工场的那台电脑上改皮肤' })
        }

        if (req.method === 'POST') {
          // Only same-origin JSON requests: a random website can't make the browser send these.
          if (!originOk(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) {
            return send(res, 403, 'Forbidden')
          }
          let body = {}
          try {
            // 皮肤可能带图片，放宽到 12MB
            body = JSON.parse((await readBody(req, url.pathname === '/api/skins/save' ? 12_000_000 : 200_000)) || '{}')
          } catch {
            return send(res, 400, 'Bad JSON')
          }
          if (url.pathname === '/api/message') {
            const text = String(body.text || '').trim()
            if (!text) return send(res, 400, 'Empty message')
            coord.post(text)
            return json(res, 200, { ok: true })
          }
          if (url.pathname === '/api/stop') {
            coord.stop()
            return json(res, 200, { ok: true })
          }
          if (url.pathname.startsWith('/api/skins/')) {
            const actions = {
              save: () => ({ ok: true, skin: skins.saveSkin(body.skin, { replace: !!body.replace }) }),
              delete: () => skins.deleteSkin(body.id),
              'open-folder': () => skins.openSkinsFolder(),
            }
            const act = actions[url.pathname.slice('/api/skins/'.length)]
            if (!act) return send(res, 404, 'Not found')
            try {
              return json(res, 200, await act())
            } catch (e) {
              return json(res, 200, { ok: false, error: e.message })
            }
          }
          if (setup && url.pathname.startsWith('/api/setup/')) {
            const actions = {
              install: () => setup.install(body.tool),
              'install-terminal': () => setup.installInTerminal(body.tool),
              login: () => setup.login(body.tool),
              test: () => (body.tool ? setup.testCli(body.tool) : setup.testApi(body.api || {})),
              api: () => setup.saveApi(body),
              remove: () => setup.remove(body.id),
              recheck: () => setup.recheck(),
            }
            const act = actions[url.pathname.slice('/api/setup/'.length)]
            if (!act) return send(res, 404, 'Not found')
            try {
              return json(res, 200, await act())
            } catch (e) {
              return json(res, 200, { ok: false, error: e.message })
            }
          }
        }
        return send(res, 404, 'Not found')
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const file = path.resolve(publicDir, rel)
      if (!file.startsWith(path.resolve(publicDir) + path.sep)) return send(res, 403, 'Forbidden')
      fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'Not found')
        const type = TYPES[path.extname(file)] || 'application/octet-stream'
        if (rel === 'index.html') data = SHELL + data.toString('utf8')
        send(res, 200, data, type)
      })
    } catch (error) {
      if (error?.message === 'too large') return send(res, 413, 'Request body too large')
      if (error instanceof URIError) return send(res, 400, 'Bad request')
      return send(res, 500, 'Internal server error')
    }
  })
  server.on('clientError', (_error, socket) => {
    try {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    } catch {}
  })
  return server
}
