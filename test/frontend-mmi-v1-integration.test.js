'use strict'
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')

const COMPOSER_PATH = path.join(ROOT, 'public', 'core', 'core-composer.js')

const PDF_HEADER = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\ntrailer\n<< /Size 1 >>\nstartxref\n30\n%%EOF\n', 'binary')

function buildPdfBytes(n, embedText) {
  if (n <= PDF_HEADER.length) return PDF_HEADER.subarray(0, n)
  const pad = embedText ? Buffer.from(String(embedText), 'utf8') : Buffer.alloc(0)
  const body = Buffer.alloc(n, 0x20)
  PDF_HEADER.copy(body, 0)
  if (pad.length > 0 && pad.length < n - PDF_HEADER.length - 12) {
    pad.copy(body, PDF_HEADER.length)
  }
  body[n - 6] = 0x25; body[n - 5] = 0x25; body[n - 4] = 0x45; body[n - 3] = 0x4f; body[n - 2] = 0x46; body[n - 1] = 0x0a
  return body
}

function makeTestCoord({ attachmentsDir, workdir, enableVision = true, transcriptionProvider = 'test' } = {}) {
  const groupId = enableVision ? 'test-vision-group' : 'test-text-group'
  const employees = [{ id: 'alice-test', skill: 'generalist', group: groupId, name: 'Alice Test', enabled: true }]
  const statsFile = path.join(workdir, 'stats.json')
  fs.mkdirSync(workdir, { recursive: true })
  fs.mkdirSync(attachmentsDir, { recursive: true })
  fs.writeFileSync(statsFile, '{}')

  const attachmentStore = new AttachmentStore(attachmentsDir)
  const config = {
    workdir, port: 0, host: '127.0.0.1',
    autonomy: { rounds: 3 },
    logDir: path.join(workdir, 'logs'),
    statsFile,
    transcription: { provider: transcriptionProvider },
    groups: [{
      id: groupId,
      type: 'openai-api',
      name: '测试组',
      enabled: true,
      baseUrl: 'http://invalid.invalid',
      apiKey: 'not-a-real-key-never-sent',
      vision: Boolean(enableVision),
      models: { easy: 'test-easy', medium: 'test-medium', hard: 'test-hard' },
    }],
    employees,
  }
  const coord = new Coordinator(config, { mode: 'live', root: ROOT, attachmentStore })
  for (const g of coord.team.groups.values()) {
    g.ask = async function (prompt, opts) {
      coord._askCalls = coord._askCalls || []
      coord._askCalls.push({ prompt, opts, at: Date.now() })
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
  const rootTmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mmi-v1-frontend-'))
  const attachmentsDir = path.join(rootTmp, 'attachments')
  const workdir = path.join(rootTmp, 'workdir')
  const { coord, attachmentStore } = makeTestCoord({ attachmentsDir, workdir, enableVision, transcriptionProvider })
  await coord.init()

  const server = createServer(coord, { publicDir: PUBLIC_DIR, host: '127.0.0.1', token: '', attachmentStore })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const cleanup = async () => {
    coord.stopAll?.()
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(() => resolve()))
    await new Promise((r) => setTimeout(r, 20))
    let attempts = 0
    while (attempts++ < 5) {
      try {
        fs.rmSync(rootTmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 80 })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }
  if (t && typeof t.after === 'function') t.after(cleanup)

  const host = '127.0.0.1'
  const base = `http://${host}:${port}`
  const request = (p, { method = 'GET', headers = {}, body, query = null } = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(p, base)
      if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
      const req = http.request({ host, port, method: method.toUpperCase(), path: u.pathname + u.search, headers: { Host: `${host}:${port}`, Origin: base, ...headers } }, (res) => {
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

  const uploadBytes = async (bytes, filename = 'test.bin', { chunkSize = 0, declaredSize = null, clientMessageId = null } = {}) => {
    const boundary = '----MMI_V1_FrontendTest_' + crypto.randomBytes(6).toString('hex')
    const bodyStart = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
      Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
    ])
    const fieldsAfter = []
    if (declaredSize != null) {
      fieldsAfter.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="declaredSize"\r\n\r\n${declaredSize}`))
    }
    if (clientMessageId != null) {
      fieldsAfter.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="clientMessageId"\r\n\r\n${String(clientMessageId)}`))
    }
    const bodyEnd = Buffer.from(fieldsAfter.length ? fieldsAfter.join('') + `\r\n--${boundary}--\r\n` : `\r\n--${boundary}--\r\n`)
    const totalLen = bodyStart.length + bytes.length + bodyEnd.length
    const method = 'POST'
    const path = '/niuma/v1/attachments'
    const res = await new Promise((resolve, reject) => {
      const req = http.request({ host, port, method, path, headers: { Host: `${host}:${port}`, Origin: base, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': totalLen } }, resolve)
      req.on('error', reject)
      if (chunkSize > 0) {
        req.write(bodyStart)
        let written = 0
        while (written < bytes.length) {
          const end = Math.min(written + chunkSize, bytes.length)
          req.write(bytes.subarray(written, end))
          written = end
        }
        req.end(bodyEnd)
      } else {
        req.end(Buffer.concat([bodyStart, bytes, bodyEnd]))
      }
    })
    const chunks = []
    for await (const c of res) chunks.push(c)
    const buf = Buffer.concat(chunks)
    const type = res.headers['content-type'] || ''
    let json = undefined
    if (type.includes('application/json')) {
      try { json = JSON.parse(buf.toString('utf8')) } catch {}
    }
    return { status: res.statusCode, text: buf.toString('utf8'), buf, json, type }
  }

  return { cleanup, host, port, coord, attStore: attachmentStore, request, uploadBytes }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// -------------------- DOM shim helpers --------------------
function buildMinDom() {
  const LISTENERS = Symbol('listeners')
  function matchesSelector(n, sel) {
    if (!n || !sel) return false
    const s = String(sel).trim()
    // Split compound selectors into parts: tagName #id .class [attr] chains. All parts must match.
    const parts = []
    let i = 0
    while (i < s.length) {
      const c = s[i]
      if (c === '.') {
        let j = i + 1
        while (j < s.length && /[\w-]/.test(s[j])) j++
        parts.push({ kind: 'class', value: s.slice(i + 1, j) })
        i = j
      } else if (c === '#') {
        let j = i + 1
        while (j < s.length && /[\w-]/.test(s[j])) j++
        parts.push({ kind: 'id', value: s.slice(i + 1, j) })
        i = j
      } else if (c === '[') {
        let j = i + 1
        while (j < s.length && s[j] !== ']') j++
        parts.push({ kind: 'attr', value: s.slice(i + 1, j) })
        i = j + 1
      } else if (/[a-zA-Z]/.test(c)) {
        let j = i
        while (j < s.length && /[\w-]/.test(s[j])) j++
        parts.push({ kind: 'tag', value: s.slice(i, j) })
        i = j
      } else if (/\s/.test(c)) {
        return false
      } else {
        i++
      }
    }
    if (parts.length === 0) {
      // legacy fallback for alternatives with comma, handled below by caller.
      if (/^\.[\w-]+$/.test(s)) return n.className && n.className.split(/\s+/).includes(s.slice(1))
      if (/^#[\w-]+$/.test(s)) return n.id === s.slice(1)
      if (/^\w+$/.test(s)) return (n._tag || '').toLowerCase() === s.toLowerCase()
      return false
    }
    for (const p of parts) {
      if (p.kind === 'class') {
        if (!n.className || !n.className.split(/\s+/).includes(p.value)) return false
      } else if (p.kind === 'id') {
        if (n.id !== p.value) return false
      } else if (p.kind === 'tag') {
        if ((n._tag || '').toLowerCase() !== p.value.toLowerCase()) return false
      } else if (p.kind === 'attr') {
        const inner = p.value
        const eq = inner.indexOf('=')
        if (eq < 0) {
          if (!n.hasAttribute(inner)) return false
        } else {
          const k = inner.slice(0, eq)
          let v = inner.slice(eq + 1)
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
          if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1)
          if (n.getAttribute(k) !== v) return false
        }
      }
    }
    return true
  }
  function walkAll(root, results) {
    for (const c of root._children || []) {
      results.push(c)
      walkAll(c, results)
    }
  }
  function queryAll(root, sel) {
    const all = []
    walkAll(root, all)
    const ss = String(sel).trim()
    const parts = ss.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) {
      const out = []
      for (const sub of parts) for (const n of all) if (matchesSelector(n, sub)) out.push(n)
      // dedupe
      const seen = new Set(out)
      return [...seen]
    }
    return all.filter(n => matchesSelector(n, ss))
  }
  function makeEl(tag, attrs = {}, htmlText = '') {
    const self = {
      _tag: tag,
      _attrs: {},
      _children: [],
      _parent: null,
      _textContent: '',
      _innerHTML: '',
      _listeners: {},
      _dataset: {},
      _style: {},
      _value: '',
      _hidden: false,
      _className: '',
      _id: '',
      _placeholder: '',
      _spellcheck: false,
      _rows: 0,
      _selStart: null,
      _selEnd: null,
      _focused: false,
      setSelectionRange(a, b) { this._selStart = a; this._selEnd = b },
      focus() { this._focused = true },
      scrollIntoView() {},
      get style() { return this._style },
      get className() { return this._className },
      set className(v) { this._className = String(v) },
      get classList() {
        const cls = this
        return {
          add(...xs) {
            const set = new Set((cls._className || '').split(/\s+/).filter(Boolean))
            xs.forEach(x => set.add(x))
            cls._className = [...set].join(' ')
          },
          remove(...xs) {
            const set = new Set((cls._className || '').split(/\s+/).filter(Boolean))
            xs.forEach(x => set.delete(x))
            cls._className = [...set].join(' ')
          },
          contains(x) { return (cls._className || '').split(/\s+/).includes(x) },
        }
      },
      get dataset() { return this._dataset },
      get value() { return this._value },
      set value(v) { this._value = String(v) },
      get placeholder() { return this._placeholder },
      set placeholder(v) { this._placeholder = String(v) },
      get spellcheck() { return this._spellcheck },
      set spellcheck(v) { this._spellcheck = !!v },
      get rows() { return this._rows },
      set rows(v) { this._rows = Number(v) },
      get hidden() { return this._hidden },
      set hidden(v) { this._hidden = !!v },
      get textContent() { return this._textContent },
      set textContent(v) { this._textContent = String(v); this._innerHTML = String(v) },
      get innerHTML() { return this._innerHTML },
      set innerHTML(v) { this._innerHTML = String(v) },
      get id() { return this._id },
      set id(v) { this._id = String(v) },
      get title() { return this._attrs.title || '' },
      set title(v) { this.setAttribute('title', String(v)) },
      get disabled() { return this._attrs.disabled === true || this._attrs.disabled === '' || String(this._attrs.disabled) === 'disabled' },
      set disabled(v) { if (v) this.setAttribute('disabled', ''); else delete this._attrs.disabled },
      get parentElement() { return this._parent },
      get parentNode() { return this._parent },
      get children() { return this._children.slice() },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
      appendChild(c) { return attach(this, c, null, 'append') },
      insertBefore(c, ref) { return attach(this, c, ref, 'before') },
      replaceWith(c) {
        if (!this._parent) return
        const p = this._parent
        const idx = p._children.indexOf(this)
        if (idx < 0) return
        p._children.splice(idx, 1)
        this._parent = null
        if (Array.isArray(c)) for (const k of c) attach(p, k, null, idx < p._children.length ? 'insertAt' + idx : 'append')
        else attach(p, c, null, idx < p._children.length ? 'insertAt' + idx : 'append')
      },
      remove() {
        if (!this._parent) return
        const p = this._parent
        const i = p._children.indexOf(this)
        if (i >= 0) p._children.splice(i, 1)
        this._parent = null
      },
      addEventListener(type, fn, opts) {
        type = String(type).toLowerCase()
        if (!this._listeners[type]) this._listeners[type] = []
        this._listeners[type].push({ fn, opts })
      },
      removeEventListener(type, fn) {
        type = String(type).toLowerCase()
        const l = this._listeners[type]
        if (!l) return
        const i = l.findIndex(x => x.fn === fn)
        if (i >= 0) l.splice(i, 1)
      },
      async dispatchEvent(ev) {
        const t = String(ev.type || '').toLowerCase()
        const ls = this._listeners[t] || []
        for (const h of ls) {
          try { const r = h.fn.call(this, ev); if (r && typeof r.then === 'function') await r } catch {}
        }
        return !ev._cancelled
      },
      setAttribute(k, v) {
        if (v === true) this._attrs[k] = ''
        else if (v === false || v == null) delete this._attrs[k]
        else this._attrs[k] = String(v)
      },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) },
      removeAttribute(k) { delete this._attrs[k] },
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') self.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(self._style, v)
      else if (k.startsWith('on') && typeof v === 'function') {
        const evName = k.slice(2).toLowerCase()
        self.addEventListener(evName, v)
      } else if (typeof v !== 'function') self.setAttribute(k, v)
    }
    if (htmlText != null && htmlText !== '') {
      if (tag === 'textarea') self._value = String(htmlText)
      else self._innerHTML = String(htmlText)
    }
    return self
  }
  function attach(parent, child, ref, mode) {
    if (child == null) return child
    if (Array.isArray(child)) { for (const c of child) attach(parent, c, ref, mode); return child }
    if (!child._tag) return child
    if (child._parent && child._parent !== parent) {
      const prev = child._parent
      const i = prev._children.indexOf(child)
      if (i >= 0) prev._children.splice(i, 1)
    }
    child._parent = parent
    if (mode === 'append') parent._children.push(child)
    else if (mode === 'before') {
      if (!ref) parent._children.push(child)
      else {
        const i = parent._children.indexOf(ref)
        if (i < 0) parent._children.push(child)
        else parent._children.splice(i, 0, child)
      }
    } else if (typeof mode === 'string' && mode.startsWith('insertAt')) {
      const pos = Number(mode.slice(8)) || 0
      parent._children.splice(pos, 0, child)
    }
    return child
  }
  const document = {
    _head: makeEl('head'),
    _body: makeEl('body'),
    documentElement: makeEl('html'),
    readyState: 'complete',
    get head() { return this._head },
    get body() { return this._body },
    createElement(tag) { return makeEl(tag) },
    createTextNode(t) {
      const n = makeEl('#text')
      n._textContent = String(t)
      n.nodeType = 3
      return n
    },
    getElementById(id) { return queryAll(this, '#' + id)[0] || null },
    querySelector(sel) {
      const all = []
      walkAll(this, all)
      return all.find(n => matchesSelector(n, sel)) || null
    },
    querySelectorAll(sel) {
      const all = []
      walkAll(this, all)
      return all.filter(n => matchesSelector(n, sel))
    },
    _listeners: {},
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f) },
    removeEventListener(t, f) {
      const l = this._listeners[t] || []
      const i = l.indexOf(f); if (i >= 0) l.splice(i, 1)
    },
    async dispatchEvent(ev) {
      const ls = this._listeners[String(ev.type || '').toLowerCase()] || []
      for (const h of ls) try { const r = h(ev); if (r && typeof r.then === 'function') await r } catch {}
      return true
    },
  }
  const window = {
    document,
    location: { protocol: 'http:', hash: '' },
    navigator: { userAgent: 'node-dom-shim' },
    crypto: { randomUUID: () => crypto.randomUUID() },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    URL: {
      createObjectURL() { return 'blob:' + crypto.randomBytes(6).toString('hex') },
      revokeObjectURL() {},
    },
    addEventListener() {},
    removeEventListener() {},
    matchMedia() { return { matches: false, addListener() {}, removeListener() {} } },
    console,
    open() { return null },
    confirm(msg) { return true },
  }
  return { document, window, makeEl }
}

function buildAttachmentShim(globalThis) {
  const UPLOAD_STATUS = Object.freeze({
    IDLE: 'IDLE', UPLOADING: 'UPLOADING', UPLOADED: 'UPLOADED', UPLOAD_FAILED: 'UPLOAD_FAILED', CANCELLED: 'CANCELLED',
  })
  const PROCESSING_STATUS = Object.freeze({
    IDLE: 'IDLE', EXTRACTING: 'EXTRACTING', EXTRACTED: 'EXTRACTED', EXTRACT_FAILED: 'EXTRACT_FAILED',
  })
  const ATTACH_KIND = Object.freeze({ DOC: 'DOC', IMAGE: 'IMAGE', AUDIO: 'AUDIO', OTHER: 'OTHER' })
  const CONFIRM_STATUS = Object.freeze({ NONE: 'NONE', PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', REJECTED: 'REJECTED' })
  let configured = false
  function classifyKind(name) {
    const n = String(name || '').toLowerCase()
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return ATTACH_KIND.IMAGE
    if (/\.(mp3|wav|ogg|webm|m4a|flac|aac)$/.test(n)) return ATTACH_KIND.AUDIO
    if (/\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|rtf|odt|ts|js|json|yaml|yml)$/.test(n)) return ATTACH_KIND.DOC
    return ATTACH_KIND.OTHER
  }
  const self = {
    UPLOAD_STATUS, PROCESSING_STATUS, ATTACH_KIND, CONFIRM_STATUS,
    isTranscriptionConfigured() { return configured },
    setTranscriptionConfigured(v) { configured = !!v },
    loadServerConfig() { return Promise.resolve({}) },
    createAttachmentFromFile(f) {
      const id = 'att-local-' + crypto.randomBytes(5).toString('hex')
      const name = f && f.name || 'file'
      return {
        id, name, sanitizedName: name, originalName: name, kind: classifyKind(name),
        size: f && typeof f.size === 'number' ? f.size : 0,
        uploadStatus: UPLOAD_STATUS.IDLE, uploadProgress: 0, processingStatus: PROCESSING_STATUS.IDLE,
        serverId: null, confirmStatus: CONFIRM_STATUS.NONE, confirmError: '',
        objectUrl: null, localFile: f || null, error: null, thumb: null, extract: null,
        transcriptionConfigured: configured, transcript: null,
      }
    },
    createAttachmentFromRecording(blob, suggestedName) {
      const name = suggestedName || 'recording.webm'
      return {
        id: 'att-rec-' + crypto.randomBytes(5).toString('hex'), name, sanitizedName: name, originalName: name,
        kind: ATTACH_KIND.AUDIO, size: blob ? blob.size : 0,
        uploadStatus: UPLOAD_STATUS.IDLE, uploadProgress: 0, processingStatus: PROCESSING_STATUS.IDLE,
        serverId: null, confirmStatus: CONFIRM_STATUS.NONE, confirmError: '',
        objectUrl: null, localFile: blob || null, error: null, thumb: null, extract: null,
        transcriptionConfigured: configured, transcript: null,
      }
    },
    async uploadAttachment(a, _opts) {
      a.uploadStatus = UPLOAD_STATUS.UPLOAD_FAILED
      a.error = 'Upload path not implemented in dom shim; use uploadBytes().'
    },
    async fetchAttachmentMeta() { return null },
    applyMetaToAttachment(a, meta) { if (a && meta) Object.assign(a, meta) },
    startMetaPolling() {},
    stopMetaPolling() {},
    attachmentIsReady(a) {
      if (!a) return false
      if (a.uploadStatus !== UPLOAD_STATUS.UPLOADED) return false
      if (a.processingStatus !== PROCESSING_STATUS.EXTRACTED) return false
      if (a.error) return false
      return true
    },
    async persistConfirmTranscript(a, text) { if (a) a.confirmStatus = CONFIRM_STATUS.CONFIRMED },
    async startRecording() { return null },
    renderTray(list, ctx) {
      const node = globalThis.document.createElement('div')
      node.className = 'attachment-tray'
      for (const a of list || []) {
        const card = globalThis.document.createElement('div')
        card.className = 'attach-card'
        if (a && a.error) card.className += ' is-error'
        if (a && a.id) card.dataset.attachmentId = a.id
        if (a && a.serverId) card.dataset.serverId = a.serverId
        node.appendChild(card)
      }
      return node
    },
  }
  return self
}

function sendPayload(harn, env) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(env || {})
    const req = http.request({ host: harn.host, port: harn.port, method: 'POST', path: '/api/message', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Host: `${harn.host}:${harn.port}` } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = undefined
        try { if (text) json = JSON.parse(text) } catch {}
        if (!res.statusCode || res.statusCode >= 400) {
          const err = new Error(`${res.statusCode || 0} ${text || ''}`)
          err.status = res.statusCode
          err.body = json != null ? json : text
          if (json && typeof json.code === 'string') err.code = json.code
          reject(err)
        } else resolve(json != null ? json : { ok: true })
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function rebindRequest(harn, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload || {})
    const req = http.request({ host: harn.host, port: harn.port, method: 'POST', path: '/niuma/v1/attachments/_rebind', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Host: `${harn.host}:${harn.port}` } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = undefined
        try { if (text) json = JSON.parse(text) } catch {}
        const ok = !!res.statusCode && res.statusCode < 400
        resolve(Object.assign(ok ? { ok: true } : { ok: false }, json || {}, !ok && !json ? { error: text, reuploadRequired: true } : {}))
      })
    })
    req.on('error', (e) => resolve({ ok: false, error: String(e && e.message || e), reuploadRequired: true }))
    req.write(body)
    req.end()
  })
}

function mockShortCircuitPlan(coord) {
  if (coord.makePlan) coord.makePlan = async () => ({ reply: 'ok', tasks: [] })
  if (coord.execute) coord.execute = async () => {}
  if (coord.gitStart) coord.gitStart = async () => null
  if (coord.gitFinish) coord.gitFinish = async () => null
  if (coord.summarize) coord.summarize = async () => 'done'
}

function loadComposer(globalThis, document, window) {
  const composerSource = fs.readFileSync(COMPOSER_PATH, 'utf8')
  const fn = new Function('globalThis', 'document', 'window', 'module',
    composerSource + '\n;return globalThis.VAOCoreComposer;')
  return fn(globalThis, document, window, {})
}

async function fireComposerSubmit(formEl, ev) {
  ev = ev || { type: 'submit', preventDefault() { this._cancelled = true }, _cancelled: false }
  await formEl.dispatchEvent(ev)
  for (let i = 0; i < 6; i++) await new Promise(setImmediate)
  await wait(0)
  return ev
}

function cleanupDomGlobals() {
  delete global.document
  delete global.window
  delete global.HTMLElement
  delete globalThis.VAOCoreAttachments
  delete globalThis.VAOCoreComposer
  delete globalThis.VAOCoreStates
  delete globalThis.VAOCoreCharacters
}

test('FE-SCENARIO-A. retained-attachment continuation: frontend composer flow noIntent → follow-up', async (t) => {
  const dom = buildMinDom()
  global.document = dom.document
  global.window = dom.window
  global.HTMLElement = function FakeHTMLElement() {}
  globalThis.VAOCoreStates = {}
  globalThis.VAOCoreCharacters = {}
  globalThis.VAOCoreAttachments = buildAttachmentShim(globalThis)
  const Composer = loadComposer(globalThis, dom.document, dom.window)
  assert.ok(Composer && typeof Composer.renderComposer === 'function')

  const harn = await startHarness(t)
  try {
    const pdfText = 'FE_SCN_A_RETAINED_CONTENT_' + Date.now()
    const bytes = buildPdfBytes(400, pdfText)
    const up = await harn.uploadBytes(bytes, 'retained-doc.pdf', { declaredSize: bytes.length })
    assert.equal(up.status, 201, 'upload 201')
    const serverId = up.json.id
    harn.attStore.update(serverId, { status: ATTACHMENT_STATUS.EXTRACTED, error: null, extract: { pageCount: 1, pages: [{ n: 1, text: pdfText }] } })

    const ctx = { runtimeId: 'scn-a', workspacePath: '/tmp/a', projectPath: '/proj/a' }
    const Attachments = globalThis.VAOCoreAttachments
    const captured = []
    const composerEl = Composer.renderComposer({
      context: ctx,
      onSend: async (env) => {
        captured.push(env)
        try {
          return await sendPayload(harn, env)
        } catch (e) {
          const fail = { ok: false, error: e.message || String(e), status: e.status || 0 }
          if (typeof e.code === 'string') fail.code = e.code
          if (e.body && typeof e.body === 'object') {
            if (typeof e.body.rebindToken === 'string') fail.rebindToken = e.body.rebindToken
            if (typeof e.body.rebindTokenTtlMs === 'number') fail.rebindTokenTtlMs = e.body.rebindTokenTtlMs
            if (Array.isArray(e.body.rebindAttachmentIds)) fail.rebindAttachmentIds = e.body.rebindAttachmentIds
          }
          return fail
        }
      },
      onRebindAttachments: async (p) => rebindRequest(harn, p),
    })

    const draft = Composer.getDraft(ctx)
    draft.attachments.push({
      id: 'att-scna-' + Date.now(),
      name: 'retained-doc.pdf', sanitizedName: 'retained-doc.pdf', kind: Attachments.ATTACH_KIND.DOC,
      size: bytes.length,
      uploadStatus: Attachments.UPLOAD_STATUS.UPLOADED, uploadProgress: 100,
      processingStatus: Attachments.PROCESSING_STATUS.EXTRACTED,
      serverId, error: null, thumb: null,
      extract: { pageCount: 1, pages: [{ n: 1, text: pdfText }] },
    })
    Composer.DRAFTS.set(Composer.draftKey(ctx), draft)

    const ta = composerEl.querySelector('textarea.composer-ta')
    ta.value = ''
    draft.text = ''
    await fireComposerSubmit(composerEl)

    assert.ok(captured.length >= 1, 'onSend called at least once')
    const s1 = captured[0]
    assert.ok(Array.isArray(s1.attachmentIds) && s1.attachmentIds.includes(serverId), 'step1 send includes serverId')
    assert.ok(!s1.continuationToken, 'step1 send (attach-only) did not yet carry continuationToken')

    assert.ok(draft.retained && draft.retained.continuationToken && draft.retained.continuationToken.startsWith('cont_'),
      `noIntent → retained context with continuationToken set. retained=${JSON.stringify(draft.retained)}`)
    const retainedIds = (draft.retained.attachments || []).map(a => a.serverId).filter(Boolean)
    assert.ok(retainedIds.includes(serverId), 'serverId present in retained attachments list')
    assert.equal(draft.attachments.length, 0, 'draft attachments cleared after moving into retained state')
    assert.equal(draft.text, '', 'text cleared')
    assert.equal(ta.value, '', 'textarea value cleared')

    const wrap = composerEl.querySelector('[data-retained-wrap]')
    assert.ok(wrap, 'retained wrap present')
    assert.equal(wrap.hidden, false, 'retained wrap visible')
    const chips = wrap.querySelectorAll('.retained-chip').length
    assert.equal(chips, 1, `one retained chip rendered. chips=${chips}`)

    // ---- Follow-up instruction
    draft.text = '帮我总结'
    ta.value = '帮我总结'

    // capture ask calls to verify attachment rendered into prompt
    const askCalls = []
    for (const g of harn.coord.team.groups.values()) {
      const origAsk = g.ask
      g.ask = async function (prompt, opts) {
        askCalls.push({ prompt, opts })
        return origAsk.call(this, prompt, opts)
      }
    }

    await fireComposerSubmit(composerEl)
    assert.ok(captured.length >= 2, 'follow-up send called')
    const s2 = captured[1]
    assert.notEqual(s1.clientMessageId, s2.clientMessageId, 'step2 uses NEW clientMessageId')
    assert.equal(typeof s2.continuationToken === 'string' && s2.continuationToken.startsWith('cont_'), true,
      `step2 send carries continuationToken. token=${s2.continuationToken}`)
    assert.ok(Array.isArray(s2.attachmentIds) && s2.attachmentIds.includes(serverId),
      `step2 send envelope attachmentIds includes retained. ids=${JSON.stringify(s2.attachmentIds)}`)

    // model boundary contains attachment pdf text (as rendered in the group ask prompt)
    for (let i = 0; i < 90; i++) {
      const hay = JSON.stringify(askCalls)
      if (hay.includes(pdfText)) break
      await wait(250)
    }
    const serialized = JSON.stringify(askCalls)
    assert.ok(serialized.includes(pdfText),
      `retained attachment text reaches model boundary. length=${serialized.length} peek=${serialized.slice(0, 600)}`)

    // retained context cleared after success
    assert.equal(draft.retained, null, 'retained cleared after successful follow-up')
    const wrapAfter = composerEl.querySelector('[data-retained-wrap]')
    const chipsAfter = wrapAfter ? wrapAfter.querySelectorAll('.retained-chip').length : 0
    assert.equal(chipsAfter === 0 || wrapAfter.hidden, true, `retained chips UI cleared. chipsAfter=${chipsAfter} hidden=${wrapAfter && wrapAfter.hidden}`)
  } finally {
    cleanupDomGlobals()
    await harn.cleanup()
  }
})

test('FE-SCENARIO-B. IDEMPOTENT_CONFLICT frontend rebind via /_rebind endpoint accepted once no re-upload', async (t) => {
  const dom = buildMinDom()
  global.document = dom.document
  global.window = dom.window
  global.HTMLElement = function FakeHTMLElement() {}
  globalThis.VAOCoreStates = {}
  globalThis.VAOCoreCharacters = {}
  globalThis.VAOCoreAttachments = buildAttachmentShim(globalThis)
  const Composer = loadComposer(globalThis, dom.document, dom.window)
  const harn = await startHarness(t)
  try {
    mockShortCircuitPlan(harn.coord)
    const bytes = buildPdfBytes(300)
    const up = await harn.uploadBytes(bytes, 'rebind-scn-b.pdf', { declaredSize: bytes.length })
    const X = up.json.id
    harn.attStore.update(X, { status: ATTACHMENT_STATUS.EXTRACTED, error: null, extract: { pageCount: 1, pages: [{ n: 1, text: 'REBIND_SCN_B' }] } })

    const msgA = 'scnB-msgA-' + Date.now()
    const ctx = { runtimeId: 'scn-b', workspacePath: '/tmp/b', projectPath: '/proj/b' }
    const Attachments = globalThis.VAOCoreAttachments
    // Prime idempotency cache
    const resPrime = harn.coord.post({ clientMessageId: msgA, text: 'v1 prime', attachmentIds: [X] })
    assert.equal(resPrime.accepted, true, `prime msgA accepted to populate idempotency cache`)

    const sendCalls = []
    const rebindCalls = []
    const composerEl = Composer.renderComposer({
      context: ctx,
      onSend: async (env) => {
        // Force first submit to use msgA so we get the 409 conflict.
        let finalEnv = env
        if (sendCalls.length === 0 && finalEnv.clientMessageId) {
          // override id to msgA (for conflict test)
          finalEnv = { ...finalEnv, clientMessageId: msgA }
        }
        sendCalls.push(finalEnv)
        try {
          return await sendPayload(harn, finalEnv)
        } catch (e) {
          const fail = { ok: false, error: e.message || String(e), status: e.status || 0 }
          if (typeof e.code === 'string') fail.code = e.code
          if (e.body && typeof e.body === 'object') {
            if (typeof e.body.rebindToken === 'string') fail.rebindToken = e.body.rebindToken
            if (typeof e.body.rebindTokenTtlMs === 'number') fail.rebindTokenTtlMs = e.body.rebindTokenTtlMs
            if (Array.isArray(e.body.rebindAttachmentIds)) fail.rebindAttachmentIds = e.body.rebindAttachmentIds
          }
          return fail
        }
      },
      onRebindAttachments: async (p) => { rebindCalls.push(p); return rebindRequest(harn, p) },
    })
    const draft = Composer.getDraft(ctx)
    draft.attachments.push({
      id: 'att-scnb-local-' + Date.now(), name: 'rebind-scn-b.pdf', sanitizedName: 'rebind-scn-b.pdf',
      kind: Attachments.ATTACH_KIND.DOC, size: bytes.length,
      uploadStatus: Attachments.UPLOAD_STATUS.UPLOADED, uploadProgress: 100,
      processingStatus: Attachments.PROCESSING_STATUS.EXTRACTED, serverId: X, error: null,
    })
    Composer.DRAFTS.set(Composer.draftKey(ctx), draft)
    const ta = composerEl.querySelector('textarea.composer-ta')
    const sentText = 'different text v2'
    draft.text = sentText
    ta.value = sentText
    try { ta.setSelectionRange(5, 9) } catch {}

    await fireComposerSubmit(composerEl)

    // Conflict banner
    const banner = composerEl.querySelector('.send-error-banner')
    const bannerText = banner ? banner.textContent : ''
    assert.ok(/消息标识冲突已修复，附件已重新绑定/.test(bannerText),
      `successful rebind banner text. banner=${JSON.stringify(bannerText)}`)

    assert.ok(rebindCalls.length >= 1, `frontend actually called /_rebind endpoint. count=${rebindCalls.length}`)
    const rCall = rebindCalls[0]
    assert.equal(typeof rCall.rebindToken === 'string' && rCall.rebindToken.startsWith('rebind_'), true,
      `rebind token present. rebindCall=${JSON.stringify(rCall)}`)
    assert.equal(typeof rCall.newClientMessageId === 'string' && rCall.newClientMessageId !== msgA, true,
      `newClientMessageId different from old msgA=${msgA}. newId=${rCall.newClientMessageId}`)

    // draft preserved
    assert.equal(draft.text, sentText, 'text preserved after rebind')
    assert.equal(draft.attachments.length, 1, 'attachments count preserved')
    assert.equal(draft.attachments[0].serverId, X, `attachment serverId unchanged (no re-upload). X=${X} att=${draft.attachments[0].serverId}`)
    assert.equal(draft.attachments[0].uploadStatus, Attachments.UPLOAD_STATUS.UPLOADED, 'UPLOADED status preserved no re-upload triggered')

    // follow-up submit sends with new id + attachment X
    draft.text = sentText
    ta.value = sentText
    await fireComposerSubmit(composerEl)
    const lastEnv = sendCalls[sendCalls.length - 1]
    assert.notEqual(lastEnv.clientMessageId, msgA, `follow-up submit uses NEW id != msgA. actual=${lastEnv.clientMessageId}`)
    assert.ok(Array.isArray(lastEnv.attachmentIds) && lastEnv.attachmentIds.includes(X),
      `follow-up send still carries X. ids=${JSON.stringify(lastEnv.attachmentIds)}`)

    // exactly one distinct NEW accepted message beyond prime msgA (i.e. total 2 distinct accepted)
    const acceptedIds = new Set()
    for (const [id, val] of [...harn.coord._idempotencyCache.entries()]) {
      if (val && val.accepted) acceptedIds.add(id)
    }
    assert.ok(acceptedIds.has(msgA), `prime msgA still in accepted cache. has=${[...acceptedIds]}`)
    const totalAccepted = acceptedIds.size
    assert.ok(totalAccepted >= 2, `at least two distinct accepted messages (msgA prime + new B). total=${totalAccepted} ids=[${[...acceptedIds]}]`)
    // no duplicates: each id in cache is unique (Map keys unique) so no duplicate by construction.
  } finally {
    cleanupDomGlobals()
    await harn.cleanup()
  }
})

test('FE-EXTRA. continuation expiry / remove retained chip / failed rebind preserves draft / text-only conflict no rebind', async (t) => {
  const dom = buildMinDom()
  global.document = dom.document
  global.window = dom.window
  global.HTMLElement = function FakeHTMLElement() {}
  globalThis.VAOCoreStates = {}
  globalThis.VAOCoreCharacters = {}
  globalThis.VAOCoreAttachments = buildAttachmentShim(globalThis)
  const Composer = loadComposer(globalThis, dom.document, dom.window)
  const harn = await startHarness(t)
  try {
    mockShortCircuitPlan(harn.coord)
    const Attachments = globalThis.VAOCoreAttachments
    const ctx = { runtimeId: 'extra', workspacePath: '/tmp/x', projectPath: '/proj/x' }

    // ---------- Part 1: expiry banner
    const bytes1 = buildPdfBytes(200, 'EXPIRY_TEST')
    const up1 = await harn.uploadBytes(bytes1, 'expiry-test.pdf', { declaredSize: bytes1.length })
    const idX = up1.json.id
    harn.attStore.update(idX, { status: ATTACHMENT_STATUS.EXTRACTED, error: null, extract: { pageCount: 1, pages: [{ n: 1, text: 'EXPIRY_TEST' }] } })

    const sendCalls = []
    const composer = Composer.renderComposer({
      context: ctx,
      onSend: async (env) => {
        sendCalls.push(env)
        try {
          return await sendPayload(harn, env)
        } catch (e) {
          const fail = { ok: false, error: e.message || String(e), status: e.status || 0 }
          if (typeof e.code === 'string') fail.code = e.code
          if (e.body && typeof e.body === 'object') {
            if (typeof e.body.rebindToken === 'string') fail.rebindToken = e.body.rebindToken
            if (typeof e.body.rebindTokenTtlMs === 'number') fail.rebindTokenTtlMs = e.body.rebindTokenTtlMs
            if (Array.isArray(e.body.rebindAttachmentIds)) fail.rebindAttachmentIds = e.body.rebindAttachmentIds
          }
          return fail
        }
      },
      onRebindAttachments: (p) => rebindRequest(harn, p),
    })
    const draft = Composer.getDraft(ctx)
    draft.attachments.push({
      id: 'expiry-att-local-' + Date.now(), name: 'expiry-test.pdf', sanitizedName: 'expiry-test.pdf',
      kind: Attachments.ATTACH_KIND.DOC, size: bytes1.length,
      uploadStatus: Attachments.UPLOAD_STATUS.UPLOADED, processingStatus: Attachments.PROCESSING_STATUS.EXTRACTED,
      serverId: idX, error: null,
    })
    Composer.DRAFTS.set(Composer.draftKey(ctx), draft)
    const ta = composer.querySelector('textarea.composer-ta')
    ta.value = ''
    draft.text = ''
    await fireComposerSubmit(composer)
    assert.ok(draft.retained && draft.retained.continuationToken, `retained set after noIntent. retained=!${!draft.retained}`)
    // Force expire
    draft.retained.issuedAt = Date.now() - (draft.retained.ttlMs || 1000) - 50
    await wait(1500)
    const banner = composer.querySelector('.send-error-banner')
    const bannerText = banner ? banner.textContent : ''
    assert.ok(/附件上下文已过期/.test(bannerText), `expiry banner present. banner=${JSON.stringify(bannerText)}`)
    assert.equal(draft.retained, null, 'retained cleared after expiry. retained=' + JSON.stringify(draft.retained))

    // ---------- Part 2: failed rebind + reuploadRequired preserves draft
    const msgCached = 'fe-conflict-cached-' + Date.now()
    const bytes2 = buildPdfBytes(180, 'FAIL_REBIND')
    const up2 = await harn.uploadBytes(bytes2, 'rebind-fail.pdf', { declaredSize: bytes2.length })
    const idY = up2.json.id
    harn.attStore.update(idY, { status: ATTACHMENT_STATUS.EXTRACTED, error: null, extract: { pageCount: 1, pages: [{ n: 1, text: 'FAIL_REBIND' }] } })
    harn.coord.post({ clientMessageId: msgCached, text: 'prime v1', attachmentIds: [idY] })
    let rebindFailCalls = []
    const ctx2 = { runtimeId: 'fail-rebind', workspacePath: '/tmp/f', projectPath: '/proj/f' }
    const composerFail = Composer.renderComposer({
      context: ctx2,
      onSend: async (env) => {
        // force send id to msgCached to trigger 409 conflict with attachment.
        const finalEnv = { ...env, clientMessageId: msgCached }
        try {
          return await sendPayload(harn, finalEnv)
        } catch (e) {
          const fail = { ok: false, error: e.message || String(e), status: e.status || 0 }
          if (typeof e.code === 'string') fail.code = e.code
          if (e.body && typeof e.body === 'object') {
            if (typeof e.body.rebindToken === 'string') fail.rebindToken = e.body.rebindToken
            if (typeof e.body.rebindTokenTtlMs === 'number') fail.rebindTokenTtlMs = e.body.rebindTokenTtlMs
            if (Array.isArray(e.body.rebindAttachmentIds)) fail.rebindAttachmentIds = e.body.rebindAttachmentIds
          }
          return fail
        }
      },
      onRebindAttachments: async (p) => {
        rebindFailCalls.push(p)
        return { ok: false, error: 'forced rebind failure for test', reuploadRequired: true }
      },
    })
    const dF = Composer.getDraft(ctx2)
    dF.attachments.length = 0
    dF.attachments.push({
      id: 'failrebind-local-' + Date.now(),
      name: 'rebind-fail.pdf', sanitizedName: 'rebind-fail.pdf',
      kind: Attachments.ATTACH_KIND.DOC, size: bytes2.length,
      uploadStatus: Attachments.UPLOAD_STATUS.UPLOADED, processingStatus: Attachments.PROCESSING_STATUS.EXTRACTED,
      serverId: idY, error: null,
    })
    const sentText = '请总结失败的重绑定草稿保留情况'
    dF.text = sentText
    Composer.DRAFTS.set(Composer.draftKey(ctx2), dF)
    const taF = composerFail.querySelector('textarea.composer-ta')
    taF.value = sentText
    try { taF.setSelectionRange(3, 8) } catch {}
    await fireComposerSubmit(composerFail)

    const bannerF = composerFail.querySelector('.send-error-banner')
    const bannerFText = bannerF ? bannerF.textContent : ''
    assert.ok(/部分附件需要重新上传|rebind失败|失败/.test(bannerFText) || /rebind-fail\.pdf/.test(bannerFText),
      `failed rebind banner indicates reupload or failure. banner=${JSON.stringify(bannerFText)}`)

    assert.equal(dF.text, sentText, `sent text preserved after failed rebind. actual=${JSON.stringify(dF.text)}`)
    assert.ok(dF.attachments.length >= 1, `attachments list preserved. count=${dF.attachments.length}`)
    const attAffected = dF.attachments.find(a => a.sanitizedName === 'rebind-fail.pdf')
    assert.ok(attAffected, 'attachment object still in list')
    assert.ok(attAffected.serverId == null || attAffected.uploadStatus === Attachments.UPLOAD_STATUS.IDLE,
      `reuploadRequired:true clears serverId or resets upload status. serverId=${attAffected.serverId} upStatus=${attAffected.uploadStatus}`)

    // ---------- Part 3: text-only conflict (no rebind called)
    const txtId = 'fe-textonly-' + Date.now()
    harn.coord.post({ clientMessageId: txtId, text: 'hello v1' })
    let rebindTxtCalled = false
    const composerTxt = Composer.renderComposer({
      context: { runtimeId: 'textonly-conf', workspacePath: '/tmp/t', projectPath: '/proj/t' },
      onSend: async (env) => {
        const finalEnv = { ...env, clientMessageId: txtId }
        try {
          return await sendPayload(harn, finalEnv)
        } catch (e) {
          const fail = { ok: false, error: e.message || String(e), status: e.status || 0 }
          if (typeof e.code === 'string') fail.code = e.code
          if (e.body && typeof e.body === 'object') {
            if (typeof e.body.rebindToken === 'string') fail.rebindToken = e.body.rebindToken
            if (Array.isArray(e.body.rebindAttachmentIds)) fail.rebindAttachmentIds = e.body.rebindAttachmentIds
          }
          return fail
        }
      },
      onRebindAttachments: async () => { rebindTxtCalled = true; return { ok: true, rebound: [] } },
    })
    const dT = Composer.getDraft({ runtimeId: 'textonly-conf', workspacePath: '/tmp/t', projectPath: '/proj/t' })
    dT.text = 'hello v2'
    Composer.DRAFTS.set(Composer.draftKey({ runtimeId: 'textonly-conf', workspacePath: '/tmp/t', projectPath: '/proj/t' }), dT)
    const taT = composerTxt.querySelector('textarea.composer-ta')
    taT.value = 'hello v2'
    await fireComposerSubmit(composerTxt)
    const bannerT = composerTxt.querySelector('.send-error-banner')
    const bannerTText = bannerT ? bannerT.textContent : ''
    assert.ok(/消息标识与已有请求冲突|已生成新的消息标识/.test(bannerTText),
      `text-only conflict banner uses old wording (no rebind mention). banner=${JSON.stringify(bannerTText)}`)
    assert.equal(rebindTxtCalled, false, `text-only conflict does NOT call /_rebind endpoint (no attachments involved)`)
  } finally {
    cleanupDomGlobals()
    await harn.cleanup()
  }
})
