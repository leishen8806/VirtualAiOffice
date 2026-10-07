import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import * as skinStore from './skins.js'
import { ATTACHMENT_STATUS, ATTACHMENT_KIND } from './attachments/types.js'
import { sanitizeFilename, classify, assertPreflight, LIMITS, byteLimitForKind } from './attachments/limits.js'
import { runExtract } from './attachments/parse/extractor.js'

async function loadBusboy() {
  const mod = await import('busboy')
  return mod.default || mod
}

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

export function createServer(coord, { publicDir, host, token, setup, skins = skinStore, attachmentStore }) {
  const clients = new Set()
  const loopbackOnly = isLoopback(host)
  // The request really comes from this computer (not a phone on the LAN), whatever address we listen on.
  const fromThisComputer = (req) => isLoopback(String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''))

  const attStore = attachmentStore || null

  coord.on('event', (ev) => {
    const data = `data: ${JSON.stringify(ev)}\n\n`
    for (const res of clients) res.write(data)
  })

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n')
  }, 20000)
  heartbeat.unref()

  const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(body)
  }
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8')

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
  const authOk = (req, url) => !token || req.headers['x-niuma-token'] === token || url.searchParams.get('token') === token

  const readBody = (req, max = 200_000) =>
    new Promise((resolve, reject) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (c) => {
        body += c
        if (body.length > max) {
          reject(new Error('too large'))
          req.destroy()
        }
      })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://niuma.local')
    // Blocks DNS-rebinding: a page on another domain can't talk to us through a hostname it controls.
    if (!hostOk(req)) return send(res, 403, 'Forbidden host')

    const isApi = url.pathname === '/events' || url.pathname.startsWith('/api/')
    const isNiuma = url.pathname.startsWith('/niuma/v1/')
    if (isApi || isNiuma) {
      if (!authOk(req, url)) return send(res, 401, 'Missing or wrong token')

      // ------------------------- /niuma/v1/attachments -------------------------
      if (isNiuma && url.pathname.startsWith('/niuma/v1/attachments')) {
        const rest = url.pathname.slice('/niuma/v1/attachments'.length) || ''
        if (!attStore) return json(res, 503, { ok: false, error: 'attachment store not configured' })

        // DELETE /niuma/v1/attachments/:id
        if (req.method === 'DELETE' && /^\/([0-9a-f]{24})$/.test(rest)) {
          const id = rest.slice(1)
          const row = attStore.get(id)
          if (!row) return json(res, 404, { ok: false, error: 'not found' })
          if (row.status === ATTACHMENT_STATUS.ATTACHED) return json(res, 409, { ok: false, error: 'already bound to a message' })
          attStore.update(id, { status: ATTACHMENT_STATUS.CANCELLED })
          attStore.remove(id)
          return json(res, 200, { ok: true })
        }

        // GET /niuma/v1/attachments/:id/preview/meta
        if (req.method === 'GET' && /^\/([0-9a-f]{24})\/preview\/meta$/.test(rest)) {
          const id = rest.match(/^\/([0-9a-f]{24})\/preview\/meta$/)[1]
          const row = attStore.get(id)
          if (!row) return json(res, 404, { ok: false, error: 'not found' })
          if (String(row.scopeId || '') !== String(attStore.scopeId || '')) {
            return send(res, 403, 'Forbidden scope')
          }
          return json(res, 200, {
            ok: true,
            id: row.id,
            scopeId: row.scopeId || null,
            filename: row.sanitizedName,
            kind: row.kind,
            mimeType: row.mimeType,
            size: row.size,
            status: row.status,
            pageCount: row.extract?.pageCount ?? null,
            durationSec: row.extract?.durationSec ?? null,
            originalTranscript: row.extract?.originalTranscript || '',
            confirmedEdited: row.extract?.confirmedEdited || '',
            confirmedAt: row.extract?.confirmedAt || null,
            error: row.error || null,
          })
        }

        // PATCH /niuma/v1/attachments/:id/transcript — persist server-confirmed edited transcript
        if (req.method === 'PATCH' && /^\/([0-9a-f]{24})\/transcript$/.test(rest)) {
          const id = rest.match(/^\/([0-9a-f]{24})\/transcript$/)[1]
          const row = attStore.get(id)
          if (!row) return json(res, 404, { ok: false, error: 'not found' })
          if (String(row.scopeId || '') !== String(attStore.scopeId || '')) {
            return send(res, 403, 'Forbidden scope')
          }
          if (!originOk(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) {
            return send(res, 403, 'Forbidden')
          }
          let patch = {}
          try { patch = JSON.parse((await readBody(req, 1_000_000)) || '{}') } catch {
            return send(res, 400, 'Bad JSON')
          }
          const confirmed = String(patch.confirmedEdited || '').trim()
          const existing = row.extract || {}
          attStore.update(id, {
            extract: {
              ...existing,
              confirmedEdited: confirmed,
              confirmedAt: Date.now(),
            },
          })
          const refreshed = attStore.get(id)
          return json(res, 200, {
            ok: true,
            id: refreshed.id,
            scopeId: refreshed?.scopeId || null,
            originalTranscript: refreshed.extract?.originalTranscript || '',
            confirmedEdited: refreshed.extract?.confirmedEdited || '',
            confirmedAt: refreshed.extract?.confirmedAt || null,
          })
        }

        // POST /niuma/v1/attachments
        if (req.method === 'POST' && (rest === '' || rest === '/')) {
          return await handleAttachmentUpload(req, res, coord, attStore, { json, send, originOk })
        }

        // POST /niuma/v1/attachments/_rebind — BLOCKER B idempotent conflict rebind endpoint
        if (req.method === 'POST' && (rest === '/_rebind' || rest === '/rebind')) {
          let rebBody = {}
          try {
            rebBody = JSON.parse((await readBody(req, 200_000)) || '{}')
          } catch {
            return json(res, 400, { ok: false, error: 'Bad JSON', code: 'REBIND_INVALID' })
          }
          const newClientMessageId = rebBody.newClientMessageId ? String(rebBody.newClientMessageId).trim() || null : null
          const rebindToken = typeof rebBody.rebindToken === 'string' ? rebBody.rebindToken.trim() || null : null
          if (!rebindToken || !newClientMessageId) {
            return json(res, 400, { ok: false, error: 'rebindToken and newClientMessageId required', code: 'REBIND_INVALID' })
          }
          const result = coord.consumeRebindToken ? coord.consumeRebindToken({ token: rebindToken, scopeId: attStore.scopeId, newClientMessageId }) : { error: 'rebind not supported' }
          if (result && result.ok === true) {
            return json(res, 200, { ok: true, reboundIds: Array.isArray(result.reboundIds) ? result.reboundIds : [], reuploadRequired: false })
          }
          const msg = (result && result.error) || 'rebind failed'
          const reuploadRequired = /re-upload required|已绑定已接收/.test(String(msg))
          return json(res, reuploadRequired ? 409 : 400, { ok: false, error: msg, code: 'REBIND_FAILED', reuploadRequired: Boolean(reuploadRequired) })
        }

        return send(res, 404, 'Not found')
      }
      // ------------------------- /niuma/v1/attachments end ---------------------

      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        res.write(`data: ${JSON.stringify({ type: 'snapshot', state: coord.snapshot() })}\n\n`)
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, coord.snapshot())
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const vcRaw = typeof coord.configVisionCapability === 'function' ? coord.configVisionCapability() : null
        const tcRaw = typeof coord.configTranscription === 'function' ? coord.configTranscription() : null
        const vc = vcRaw && typeof vcRaw === 'object' ? vcRaw : { visionCapableAdapterIds: [] }
        const tc = tcRaw && typeof tcRaw === 'object' ? tcRaw : { provider: 'disabled', enabled: false }
        return json(res, 200, {
          ok: true,
          vision: { visionCapableAdapterIds: Array.isArray(vc.visionCapableAdapterIds) ? vc.visionCapableAdapterIds.filter((x) => typeof x === 'string') : [] },
          transcription: {
            provider: typeof tc.provider === 'string' ? tc.provider : 'disabled',
            enabled: Boolean(tc.enabled),
          },
          limits: {
            maxAttachmentsPerMessage: LIMITS.maxAttachmentsPerMessage,
            maxTotalBytes: LIMITS.maxTotalBytes,
            perKind: LIMITS.perKind,
          },
        })
      }

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
          const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map((x) => String(x || '').trim()).filter(Boolean) : []
          const clientMessageId = body.clientMessageId ? String(body.clientMessageId).trim() || null : null
          const continuationToken = typeof body.continuationToken === 'string' ? body.continuationToken.trim() || null : null
          const continuationDiscard = Boolean(body.continuationDiscard)
          if (!text && !attachmentIds.length && !continuationToken) {
            return json(res, 400, { ok: false, error: 'Empty message', code: 'EMPTY_MESSAGE' })
          }
          if (attachmentIds.length && !continuationToken) {
            const invalid = coord.validateAttachmentIds?.(attachmentIds, clientMessageId)
            if (invalid) {
              return json(res, 400, { ok: false, error: invalid, code: 'ATTACHMENT_INVALID' })
            }
          }
          const postResult = coord.post({ text, clientMessageId, attachmentIds, continuationToken, continuationDiscard })
          if (postResult && postResult.ok === false) {
            const status = (postResult.code === 'IDEMPOTENT_CONFLICT' || postResult.code === 'CONTINUATION_TOKEN_INVALID') ? 409 : 400
            const out = { ok: false, error: postResult.error, code: postResult.code }
            if (postResult.code === 'IDEMPOTENT_CONFLICT') {
              if (postResult.rebindToken) out.rebindToken = postResult.rebindToken
              if (postResult.rebindTokenTtlMs != null) out.rebindTokenTtlMs = postResult.rebindTokenTtlMs
              if (Array.isArray(postResult.rebindAttachmentIds)) out.rebindAttachmentIds = postResult.rebindAttachmentIds
            }
            return json(res, status, out)
          }
          if (postResult && postResult.cached) {
            return json(res, 200, { ok: true, cached: true, idempotent: true, accepted: postResult.accepted })
          }
          if (postResult && postResult.continuationDiscardCompleted) {
            const out = { ok: true, continuationDiscardCompleted: true }
            if (Array.isArray(postResult.released)) out.released = postResult.released
            if (Array.isArray(postResult.skipped)) out.skipped = postResult.skipped
            return json(res, 200, out)
          }
          const out = { ok: true, accepted: true }
          if (postResult && postResult.idempotent) { out.idempotent = true ; out.cached = true }
          if (postResult && postResult.noIntent) {
            out.noIntent = true
            if (postResult.continuationToken) out.continuationToken = postResult.continuationToken
            if (postResult.continuationTtlMs != null) out.continuationTtlMs = postResult.continuationTtlMs
            if (Array.isArray(postResult.retainedAttachmentIds)) out.retainedAttachmentIds = postResult.retainedAttachmentIds
          }
          return json(res, 200, out)
        }
        if (url.pathname === '/niuma/v1/attachments/_rebind' || url.pathname === '/api/attachments/rebind') {
          if (req.method !== 'POST') return send(res, 405, 'Method not allowed')
          const newClientMessageId = body.newClientMessageId ? String(body.newClientMessageId).trim() || null : null
          const rebindToken = typeof body.rebindToken === 'string' ? body.rebindToken.trim() || null : null
          if (!rebindToken || !newClientMessageId) {
            return json(res, 400, { ok: false, error: 'rebindToken and newClientMessageId required', code: 'REBIND_INVALID' })
          }
          const scopeId = attStore && typeof attStore.scopeId === 'string' ? attStore.scopeId : null
          const result = coord.consumeRebindToken ? coord.consumeRebindToken({ token: rebindToken, scopeId, newClientMessageId }) : { error: 'rebind not supported' }
          if (result && result.ok === true) {
            return json(res, 200, { ok: true, reboundIds: Array.isArray(result.reboundIds) ? result.reboundIds : [], reuploadRequired: false })
          }
          const msg = (result && result.error) || 'rebind failed'
          const reuploadRequired = /re-upload required|已绑定已接收/.test(String(msg))
          return json(res, reuploadRequired ? 409 : 400, { ok: false, error: msg, code: 'REBIND_FAILED', reuploadRequired: Boolean(reuploadRequired) })
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
  })
}

/**
 * Streaming binary upload handler.
 *
 * POST /niuma/v1/attachments accepts `multipart/form-data` with exactly ONE
 * file part + optional text fields:
 *   clientMessageId   claims an ownership slot so this attachment can only
 *                     be referenced by the /api/message that carries the
 *                     same id. Without one the attachment is an orphan that
 *                     the 5-min daemon will reap.
 *   field name = "file" for the binary part.
 *
 * Flow per request:
 *   1. busboy reads headers; we peek first 4 KB to classify + check limits
 *      BEFORE opening a write stream (prevents tiny-client bombs of
 *      disallowed mime types).
 *   2. Reserve id + create index row in UPLOADING with ownerClientMessageId
 *      set from the form field.
 *   3. Stream bytes to blobs/<xx>/<id>.tmp, enforcing the per-kind byte
 *      cap mid-stream (req.destroy + mark CANCELLED + delete tmp).
 *   4. On end: rename tmp → final; transition STORED; kick off extractor
 *      asynchronously (response does NOT wait for parse – preview/meta
 *      polls status).
 *   5. On req 'close' / aborted: mark CANCELLED + delete tmp if present.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {import('./coordinator.js').Coordinator} coord
 * @param {import('./attachments/store.js').AttachmentStore} attStore
 * @param {{json:Function,send:Function,originOk:Function}} helpers
 */
async function handleAttachmentUpload(req, res, coord, attStore, { json, send, originOk }) {
  if (!originOk(req)) return send(res, 403, 'Forbidden')
  const ct = String(req.headers['content-type'] || '')
  if (!ct.startsWith('multipart/form-data')) return send(res, 400, 'multipart/form-data required')

  // Attach data listeners synchronously BEFORE any await (including the
  // busboy dynamic import below) so any bytes that arrive on this
  // request stream are captured instead of being silently dropped.
  let drainedResolve, drainedReject
  const drainedPromise = new Promise((resolve, reject) => {
    drainedResolve = resolve
    drainedReject = reject
    const chunks = []
    let total = 0
    req.on('data', (c) => { chunks.push(c); total += c.length })
    req.on('end', () => drainedResolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

  let busboyFactory
  try {
    busboyFactory = await loadBusboy()
  } catch (e) {
    return json(res, 500, { ok: false, error: `附件上传组件加载失败：${e.message}` })
  }

  const drained = await drainedPromise
  const Readable = (await import('node:stream')).Readable
  const src = Readable.from(drained, { objectMode: false })
  const fakeHeaders = {
    'content-type': ct,
    'content-length': req.headers['content-length'] || String(drained.length),
  }

  let bb
  try {
    bb = busboyFactory({ headers: fakeHeaders, limits: { files: 1, fields: 4 } })
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message })
  }

  let clientMessageId = null
  let reserved = null
  let written = 0
  let row = null
  let kind = null
  let writeStream = null
  let finished = false
  let firstBuf = Buffer.alloc(0)
  let preflightDone = false
  let declaredFilename = ''
  let declaredMime = ''
  let declaredSize = null
  let abortedCleanupDone = false
  let sendError = (code, msg) => {
    if (finished) return
    finished = true
    if (writeStream) { try { writeStream.destroy() } catch {} }
    try { src.unpipe?.(bb) } catch {}
    try { src.destroy() } catch {}
    if (reserved) {
      try { fs.unlinkSync(reserved.tmpPath) } catch {}
      if (row && row.id) {
        attStore.update(row.id, { status: ATTACHMENT_STATUS.CANCELLED, error: msg })
        attStore.remove(row.id)
      }
    }
    json(res, code, { ok: false, error: msg })
  }

  bb.on('field', (name, val, info) => {
    if (finished) return
    const n = String(name)
    if (n === 'clientMessageId') clientMessageId = String(val || '').trim() || null
    if (n === 'declaredSize') declaredSize = Number(val) || null
  })

  bb.on('file', (name, stream, info) => {
    if (finished) { stream.resume(); return }
    if (name !== 'file') { sendError(400, 'form field must be named "file"'); stream.resume(); return }
    declaredFilename = info.filename || ''
    declaredMime = info.mimeType || info.mime || ''

    const counts = countForSlot(attStore, clientMessageId)
    if ((counts.count + 1) > LIMITS.maxAttachmentsPerMessage) {
      sendError(400, `每条消息最多 ${LIMITS.maxAttachmentsPerMessage} 个附件`)
      stream.resume()
      return
    }

    reserved = attStore.reserveId()
    const cleanName = sanitizeFilename(declaredFilename)
    row = attStore.create({
      id: reserved.id,
      ownerClientMessageId: clientMessageId,
      filename: declaredFilename,
      sanitizedName: cleanName,
      mimeType: 'application/octet-stream',
      kind: ATTACHMENT_KIND.UNKNOWN,
      size: 0,
      status: ATTACHMENT_STATUS.UPLOADING,
      storagePath: reserved.tmpPath,
    })

    let cap = LIMITS.perKind[ATTACHMENT_KIND.UNKNOWN].maxBytes

    function runPreflightAndOpenStream() {
      if (preflightDone) return true
      if (firstBuf.length < 16) return false
      preflightDone = true
      const headerSlice = firstBuf.slice(0, 4096)
      let pf
      try {
        pf = assertPreflight({ perMessageCounts: countForSlot(attStore, clientMessageId), declaredSize, declaredMime, filename: declaredFilename, firstChunk: headerSlice })
      } catch (e) {
        sendError(400, e.message || 'preflight 失败')
        return false
      }
      kind = pf.kind
      const { mime } = classify(headerSlice, declaredMime, declaredFilename)
      attStore.update(row.id, { kind, mimeType: mime })
      cap = byteLimitForKind(kind)
      if (declaredSize != null && declaredSize > cap) {
        sendError(400, `该类型单文件最大 ${Math.round(cap / 1024 / 1024)} MB`)
        return false
      }
      try {
        fs.mkdirSync(path.dirname(reserved.tmpPath), { recursive: true })
        writeStream = fs.createWriteStream(reserved.tmpPath)
        writeStream.on('error', () => sendError(500, '写入失败'))
      } catch (e) {
        sendError(500, e.message)
        return false
      }
      if (firstBuf.length && writeStream && !writeStream.destroyed) {
        writeStream.write(firstBuf)
        written = firstBuf.length
      }
      firstBuf = null
      return true
    }

    stream.on('data', (chunk) => {
      if (finished) return
      if (!preflightDone) {
        firstBuf = Buffer.concat([firstBuf, chunk])
        if (firstBuf.length >= 16) {
          if (!runPreflightAndOpenStream()) return
          if (firstBuf && firstBuf.length) {
            // If firstBuf > 4096 the full buffer was NOT yet written. Write now the remainder (runPreflight already wrote full firstBuf above actually, safe ok)
          }
        }
        return
      }
      written += chunk.length
      if (written > cap) { sendError(413, `文件超过 ${Math.round(cap / 1024 / 1024)} MB 上限`); return }
      if (writeStream && !writeStream.destroyed) writeStream.write(chunk)
    })

    stream.on('limit', () => sendError(413, 'exceeded busboy field limit'))
    stream.on('error', (e) => sendError(400, e.message))

    stream.on('end', () => {
      if (finished) return
      if (!preflightDone && firstBuf && firstBuf.length > 0) {
        if (!runPreflightAndOpenStream()) return
      }
      if (!writeStream) { sendError(400, '空文件或文件过小'); return }
      if (written === 0) { sendError(400, '空文件'); return }
      const final = endWrite(writeStream)
      final.then(() => {
        if (finished) return
        const finalized = attStore.finalizeBlob(row.id)
        if ((finalized.size || 0) > cap) { sendError(413, `文件超过 ${Math.round(cap / 1024 / 1024)} MB 上限`); return }
        finished = true
        runExtract(attStore, row.id, {
          onUpdate: (r) => coord.emitEvent?.({ type: 'attachment', id: r.id, status: r.status, error: r.error || null }),
        }).catch(() => {})
        json(res, 201, {
          ok: true,
          id: row.id,
          filename: finalized.sanitizedName,
          kind: finalized.kind,
          mimeType: finalized.mimeType,
          size: finalized.size,
        })
      }, (e) => sendError(500, e.message || '写入失败'))
    })
  })

  bb.on('finish', () => {
    // busboy is done reading the envelope – real response is sent from
    // stream.on('end') above, or sendError if no file arrived.
    if (finished || row) return
    sendError(400, 'no file part')
  })
  bb.on('error', (e) => sendError(400, e.message))

  req.on('close', () => {
    if (finished) return
    // client disconnected mid-stream → CANCELLED + clean up tmp
    if (row?.id) {
      attStore.update(row.id, { status: ATTACHMENT_STATUS.CANCELLED })
      attStore.remove(row.id)
    } else if (reserved) {
      try { fs.unlinkSync(reserved.tmpPath) } catch {}
    }
    finished = true
  })

  src.pipe(bb)
}

function countForSlot(attStore, clientMessageId) {
  let count = 0
  let totalBytes = 0
  for (const r of attStore.all()) {
    if (r.status === ATTACHMENT_STATUS.CANCELLED) continue
    if (clientMessageId && r.ownerClientMessageId === clientMessageId) {
      count++
      totalBytes += r.size || 0
    }
    if (!clientMessageId && r.ownerClientMessageId == null && Date.now() - r.createdAt < 300_000) {
      // Unslotted uploads within last 5 min count against the global
      // per-message ceiling defensively; the daemon will reap them if the
      // client never claims a slot.
      count++
      totalBytes += r.size || 0
    }
  }
  return { count, totalBytes }
}

function endWrite(ws) {
  return new Promise((resolve, reject) => {
    if (ws.destroyed) return resolve()
    ws.on('finish', resolve)
    ws.on('error', reject)
    ws.end()
  })
}
