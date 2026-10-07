;(function () {
  'use strict'

  const UPLOAD_STATUS = Object.freeze({
    IDLE: 'IDLE',
    UPLOADING: 'UPLOADING',
    UPLOADED: 'UPLOADED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    CANCELLED: 'CANCELLED',
  })

  const PROCESSING_STATUS = Object.freeze({
    IDLE: 'IDLE',
    EXTRACTING: 'EXTRACTING',
    EXTRACTED: 'EXTRACTED',
    EXTRACT_FAILED: 'EXTRACT_FAILED',
    PROCESSING_ERROR: 'PROCESSING_ERROR',
    UNSUPPORTED: 'UNSUPPORTED',
  })

  const CONFIRM_STATUS = Object.freeze({
    NONE: 'NONE',
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    FAILED: 'FAILED',
    DISABLED: 'DISABLED',
  })

  const ATTACH_KIND = Object.freeze({
    DOC: 'doc',
    IMAGE: 'image',
    AUDIO: 'audio',
    OTHER: 'other',
  })

  const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods'])
  const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'])
  const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'webm', 'ogg', 'opus', 'flac', 'aac'])

  function kindFromFile(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase()
    const mime = String(file.type || '').toLowerCase()
    if (DOC_EXTS.has(ext) || mime.startsWith('text/') || mime.includes('pdf') || mime.includes('word') || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('document')) return ATTACH_KIND.DOC
    if (IMAGE_EXTS.has(ext) || mime.startsWith('image/')) return ATTACH_KIND.IMAGE
    if (AUDIO_EXTS.has(ext) || mime.startsWith('audio/') || mime.startsWith('video/webm')) return ATTACH_KIND.AUDIO
    return ATTACH_KIND.OTHER
  }

  function extGlyph(kind, ext) {
    if (kind === ATTACH_KIND.IMAGE) return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5.5" cy="6.5" r="1.2"/><path d="M3 12 L6 9 L8.5 11.5 L10.5 9 L13 12"/></svg>'
    if (kind === ATTACH_KIND.AUDIO) return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 8 L3 12 L6 12 L12 8 L12 4 L9 4"/><path d="M9.5 4.5 L9.5 8.5"/><circle cx="5.5" cy="10" r="1.2"/></svg>'
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 2 L11 7 L7 11 L2 6 L6 2 Z" stroke-linejoin="round"/><path d="M9 4 L13 4 L13 13 L5 13 L5 9"/></svg>'
  }

  function formatSize(b) {
    if (b == null) return ''
    const n = Number(b) || 0
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
    return (n / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function el(tag, attrs = {}, html = '') {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v)
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
      else if (v === true) node.setAttribute(k, '')
      else if (v !== false && v != null) node.setAttribute(k, v)
    }
    if (html != null) node.innerHTML = html
    return node
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }

  let uid = 0
  function genId() { return 'att-' + Date.now().toString(36) + '-' + (++uid).toString(36) }

  function createAttachmentFromFile(file) {
    const kind = kindFromFile(file)
    const ext = String(file.name || '').split('.').pop()
    return {
      id: genId(),
      serverId: null,
      clientId: genId(),
      name: file.name || ('file-' + Date.now() + '.' + (ext || 'bin')),
      kind,
      ext: ext || '',
      mime: file.type || '',
      size: file.size || 0,
      file,
      objectUrl: null,
      uploadStatus: UPLOAD_STATUS.IDLE,
      uploadProgress: 0,
      processingStatus: PROCESSING_STATUS.IDLE,
      processingProgress: 0,
      error: null,
      previewText: '',
      originalTranscript: '',
      confirmedEditedTranscript: '',
      confirmStatus: CONFIRM_STATUS.NONE,
      confirmError: '',
      dimensions: null,
      durationSec: null,
      pageCount: null,
      transcriptionConfigured: false,
      abortController: null,
      _metaPollTimer: null,
      _metaPollStartedAt: 0,
      _metaPollAttempts: 0,
    }
  }

  function createAttachmentFromRecording(blob, nameHint) {
    const suffix = (blob.type && blob.type.includes('webm')) ? 'webm' : (blob.type && blob.type.includes('ogg')) ? 'ogg' : (blob.type && blob.type.includes('mp3')) ? 'mp3' : 'webm'
    const file = new File([blob], nameHint || ('recording-' + Date.now() + '.' + suffix), { type: blob.type || ('audio/' + suffix) })
    const a = createAttachmentFromFile(file)
    a.isRecording = true
    return a
  }

  function statusBadge(att) {
    const u = att.uploadStatus
    const p = att.processingStatus
    let label = ''
    let cls = 'status-idle'
    if (u === UPLOAD_STATUS.UPLOADING) { label = '上传中 ' + Math.round(att.uploadProgress || 0) + '%'; cls = 'status-working' }
    else if (u === UPLOAD_STATUS.UPLOAD_FAILED) { label = '上传失败'; cls = 'status-blocked' }
    else if (u === UPLOAD_STATUS.CANCELLED) { label = '已取消'; cls = 'status-offline' }
    else if (p === PROCESSING_STATUS.EXTRACTING) { label = '解析中'; cls = 'status-reviewing' }
    else if (p === PROCESSING_STATUS.EXTRACTED) {
      if (att.kind === ATTACH_KIND.AUDIO && isTranscriptionConfigured()) {
        if (att.confirmStatus === CONFIRM_STATUS.CONFIRMED) { label = '已就绪'; cls = 'status-done' }
        else if (att.confirmStatus === CONFIRM_STATUS.FAILED) { label = '确认失败'; cls = 'status-blocked' }
        else if (att.confirmStatus === CONFIRM_STATUS.PENDING) { label = '确认中'; cls = 'status-thinking' }
        else { label = '转写完成，待确认'; cls = 'status-reviewing' }
      } else {
        label = '已就绪'; cls = 'status-done'
      }
    }
    else if (p === PROCESSING_STATUS.EXTRACT_FAILED || p === PROCESSING_STATUS.PROCESSING_ERROR) { label = '解析失败'; cls = 'status-blocked' }
    else if (p === PROCESSING_STATUS.UNSUPPORTED) { label = '不支持'; cls = 'status-offline' }
    else if (u === UPLOAD_STATUS.UPLOADED && p === PROCESSING_STATUS.IDLE) { label = '已上传'; cls = 'status-thinking' }
    return `<span class="attach-status-badge ${cls}">${label || '待处理'}</span>`
  }

  function renderAttachmentCard(att, ctx) {
    const card = el('div', { class: 'attach-card attach-' + att.kind + (att.uploadStatus === UPLOAD_STATUS.UPLOAD_FAILED || att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED ? ' is-error' : '') })
    card.dataset.attId = att.id
    const head = el('div', { class: 'attach-card-head' })
    head.appendChild(el('span', { class: 'attach-glyph', 'aria-hidden': 'true' }, extGlyph(att.kind, att.ext)))
    const meta = el('div', { class: 'attach-meta' })
    meta.innerHTML = `<div class="attach-name" title="${esc(att.name)}">${esc(att.name)}</div>`
    meta.innerHTML += `<div class="attach-sub">${statusBadge(att)}<span class="attach-size">${formatSize(att.size)}</span></div>`
    head.appendChild(meta)
    const actions = el('div', { class: 'attach-actions' })
    if (att.uploadStatus === UPLOAD_STATUS.UPLOADING) {
      const cancel = el('button', { type: 'button', class: 'attach-btn', title: '取消上传', 'aria-label': '取消上传', onClick: (e) => { e.stopPropagation(); ctx.onCancel?.(att) } }, '✕')
      actions.appendChild(cancel)
    } else if (att.uploadStatus === UPLOAD_STATUS.UPLOAD_FAILED || att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED) {
      const retry = el('button', { type: 'button', class: 'attach-btn', title: '重试', 'aria-label': '重试', onClick: (e) => { e.stopPropagation(); ctx.onRetry?.(att) } }, '↻')
      const remove = el('button', { type: 'button', class: 'attach-btn', title: '移除', 'aria-label': '移除', onClick: (e) => { e.stopPropagation(); ctx.onRemove?.(att) } }, '✕')
      actions.appendChild(retry)
      actions.appendChild(remove)
    } else {
      if (att.kind === ATTACH_KIND.DOC || att.kind === ATTACH_KIND.IMAGE) {
        const preview = el('button', { type: 'button', class: 'attach-btn', title: '预览', 'aria-label': '预览', onClick: (e) => { e.stopPropagation(); ctx.onPreview?.(att) } }, '👁')
        actions.appendChild(preview)
      }
      const remove = el('button', { type: 'button', class: 'attach-btn', title: '移除', 'aria-label': '移除', onClick: (e) => { e.stopPropagation(); ctx.onRemove?.(att) } }, '✕')
      actions.appendChild(remove)
    }
    head.appendChild(actions)
    card.appendChild(head)

    if (att.uploadStatus === UPLOAD_STATUS.UPLOADING) {
      const bar = el('div', { class: 'attach-progress' })
      bar.innerHTML = `<div class="attach-progress-fill" style="width:${Math.round(att.uploadProgress || 0)}%;"></div>`
      card.appendChild(bar)
    }

    if (att.kind === ATTACH_KIND.IMAGE && !att.error) {
      if (!att.objectUrl && att.file) {
        try { att.objectUrl = URL.createObjectURL(att.file) } catch {}
      }
      if (att.objectUrl) {
        const tn = el('div', { class: 'attach-thumb' })
        tn.innerHTML = `<img src="${esc(att.objectUrl)}" alt="${esc(att.name)}" loading="lazy" referrerpolicy="no-referrer"/>`
        card.appendChild(tn)
      }
      if (!isVisionConfigured()) {
        const vu = el('div', { class: 'attach-vision-unavailable transcript-honest' })
        vu.textContent = '当前未配置视觉能力路由，图片不会被自动理解；可在配置中启用支持图片分析的项目组。'
        card.appendChild(vu)
      }
    }

    if (att.kind === ATTACH_KIND.AUDIO) {
      if (!att.objectUrl && att.file) {
        try { att.objectUrl = URL.createObjectURL(att.file) } catch {}
      }
      if (att.objectUrl) {
        const ap = el('div', { class: 'attach-audio' })
        const audio = el('audio', { controls: true, preload: 'metadata', src: att.objectUrl })
        ap.appendChild(audio)
        card.appendChild(ap)
      }
      const trBox = el('div', { class: 'attach-transcript' })
      if (!att.transcriptionConfigured) {
        trBox.appendChild(el('div', { class: 'transcript-honest' }, '尚未配置语音转写'))
        att.confirmStatus = CONFIRM_STATUS.DISABLED
      } else if (att.processingStatus === PROCESSING_STATUS.EXTRACTING || att.processingStatus === PROCESSING_STATUS.IDLE) {
        trBox.appendChild(el('div', { class: 'transcript-working' }, att.processingStatus === PROCESSING_STATUS.IDLE ? '等待解析…' : '正在转写…'))
      } else if (att.processingStatus === PROCESSING_STATUS.EXTRACTED || att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED || att.processingStatus === PROCESSING_STATUS.PROCESSING_ERROR) {
        if (att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED || att.processingStatus === PROCESSING_STATUS.PROCESSING_ERROR) {
          const fail = el('div', { class: 'transcript-honest transcript-honest-bad' })
          fail.style.color = 'var(--blocked)'
          fail.style.background = 'color-mix(in srgb, var(--blocked) 8%, var(--panel-2))'
          fail.style.borderColor = 'color-mix(in srgb, var(--blocked) 40%, var(--line))'
          fail.textContent = '转写失败：' + (att.error || '未知原因')
          trBox.appendChild(fail)
        } else {
          const hasServerConfirmed = att.confirmStatus === CONFIRM_STATUS.CONFIRMED
          const hasConfirmFailed = att.confirmStatus === CONFIRM_STATUS.FAILED
          let statusText = ''
          if (hasServerConfirmed) statusText = '已确认'
          else if (hasConfirmFailed) statusText = '确认失败'
          else statusText = '转写完成，待确认'
          const statusChip = el('div', {
            class: 'transcript-chip' + (hasServerConfirmed ? ' chip-done' : (hasConfirmFailed ? ' chip-fail' : ''))
          })
          statusChip.style.marginBottom = '2px'
          statusChip.style.display = 'inline-block'
          statusChip.style.padding = '1px 7px'
          statusChip.style.fontSize = '10px'
          statusChip.style.fontWeight = '700'
          statusChip.style.borderRadius = '999px'
          statusChip.style.border = '1px solid var(--line)'
          statusChip.textContent = statusText
          if (hasServerConfirmed) {
            statusChip.style.color = 'var(--done)'
            statusChip.style.borderColor = 'color-mix(in srgb, var(--done) 45%, var(--line))'
            statusChip.style.background = 'color-mix(in srgb, var(--done) 10%, transparent)'
          } else if (hasConfirmFailed) {
            statusChip.style.color = 'var(--blocked)'
            statusChip.style.borderColor = 'color-mix(in srgb, var(--blocked) 45%, var(--line))'
            statusChip.style.background = 'color-mix(in srgb, var(--blocked) 10%, transparent)'
          } else {
            statusChip.style.color = 'var(--reviewing)'
            statusChip.style.borderColor = 'color-mix(in srgb, var(--reviewing) 45%, var(--line))'
            statusChip.style.background = 'color-mix(in srgb, var(--reviewing) 10%, transparent)'
          }
          trBox.appendChild(statusChip)
          const label = el('div', { class: 'transcript-label' }, '转写内容（可编辑。点击「确认文字稿」后内容才会被使用）')
          const ta = el('textarea', { class: 'transcript-ta', rows: 2, placeholder: '确认后的转写内容…' })
          ta.value = att.confirmedEditedTranscript || att.originalTranscript || ''
          ta.addEventListener('input', () => {
            att.confirmedEditedTranscript = ta.value
            if (att.confirmStatus === CONFIRM_STATUS.CONFIRMED || att.confirmStatus === CONFIRM_STATUS.FAILED) {
              att.confirmStatus = CONFIRM_STATUS.PENDING
            }
            ctx.onChangeConfirmStateChange?.(att)
          })
          trBox.appendChild(label)
          trBox.appendChild(ta)
          const confirmBar = el('div', { class: 'transcript-confirm-bar', style: 'display:flex;justify-content:flex-end;gap:5px;margin-top:3px;' })
          const confirmBtn = el('button', {
            type: 'button',
            class: 'attach-btn',
            title: '确认文字稿后才能作为附件内容使用',
            'aria-label': '确认文字稿',
            style: 'width:auto;padding:0 9px;',
            onClick: (e) => {
              e.stopPropagation()
              ctx.onConfirmTranscript?.(att, ta.value)
            }
          }, '确认文字稿')
          if (att.confirmStatus === CONFIRM_STATUS.CONFIRMED) confirmBtn.style.opacity = '0.5'
          confirmBar.appendChild(confirmBtn)
          trBox.appendChild(confirmBar)
          if (att.confirmError) {
            const err = el('div', { class: 'attach-error' })
            err.textContent = String(att.confirmError)
            trBox.appendChild(err)
          }
        }
      }
      card.appendChild(trBox)
    }

    if ((att.kind === ATTACH_KIND.DOC) && att.previewText) {
      const pv = el('div', { class: 'attach-doc-preview', hidden: true })
      pv.textContent = att.previewText.slice(0, 240)
      card.appendChild(pv)
    }

    if (att.error) {
      const err = el('div', { class: 'attach-error' })
      err.textContent = String(att.error)
      card.appendChild(err)
    }

    return card
  }

  function renderTray(attachments, ctx) {
    const tray = el('div', { class: 'attachment-tray' })
    if (!attachments || !attachments.length) return tray
    const list = el('div', { class: 'attach-list' })
    for (const a of attachments) list.appendChild(renderAttachmentCard(a, ctx))
    tray.appendChild(list)
    return tray
  }

  let activeRecorder = null

  function isTranscriptionConfigured() {
    return !!(globalThis.VAOTranscriptionConfig && globalThis.VAOTranscriptionConfig.provider && globalThis.VAOTranscriptionConfig.provider !== 'disabled')
  }

  function isVisionConfigured() {
    const ids = (globalThis.VAOVisionConfig && globalThis.VAOVisionConfig.visionCapableAdapterIds) || []
    return Array.isArray(ids) && ids.length > 0
  }

  async function startRecording(ctx) {
    if (activeRecorder) return null
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      ctx.onError?.('当前浏览器不支持录音')
      return null
    }
    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      ctx.onError?.('无法访问麦克风：' + (e && e.message ? e.message : '权限被拒绝'))
      return null
    }
    const chunks = []
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']
    let chosenType = ''
    for (const t of mimeCandidates) {
      if (!t || (typeof window.MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t))) { chosenType = t; break }
    }
    let recorder
    try {
      recorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      ctx.onError?.('初始化录音失败：' + (e && e.message ? e.message : '未知错误'))
      return null
    }
    const startedAt = Date.now()
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    const handle = {
      recorder,
      stream,
      startedAt,
      stop() {
        return new Promise((resolve) => {
          if (!recorder || recorder.state === 'inactive') return resolve(null)
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop())
            const blob = new Blob(chunks, { type: chosenType || recorder.mimeType || 'audio/webm' })
            activeRecorder = null
            resolve(blob)
          }
          try { recorder.stop() } catch { resolve(null) }
        })
      },
      cancel() {
        try { if (recorder.state !== 'inactive') recorder.stop() } catch {}
        stream.getTracks().forEach((t) => t.stop())
        activeRecorder = null
      },
      elapsedMs() { return Date.now() - startedAt },
    }
    try { recorder.start(100) } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      ctx.onError?.('启动录音失败：' + (e && e.message ? e.message : '未知错误'))
      return null
    }
    activeRecorder = handle
    return handle
  }

  function stopRecording() {
    if (!activeRecorder) return Promise.resolve(null)
    return activeRecorder.stop()
  }

  function cancelRecording() {
    if (!activeRecorder) return
    activeRecorder.cancel()
  }

  function getActiveRecorder() { return activeRecorder }

  function fileToImageBytes(att) {
    if (att.kind !== ATTACH_KIND.IMAGE) return Promise.resolve(null)
    return new Promise((resolve) => {
      if (!att.file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const comma = result.indexOf(',')
        const b64 = comma >= 0 ? result.slice(comma + 1) : result
        resolve({ base64: b64, mime: att.mime || guessMimeFromExt(att.ext) || 'image/png' })
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(att.file)
    })
  }

  function guessMimeFromExt(ext) {
    const e = String(ext || '').toLowerCase()
    if (e === 'png') return 'image/png'
    if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
    if (e === 'gif') return 'image/gif'
    if (e === 'webp') return 'image/webp'
    if (e === 'svg') return 'image/svg+xml'
    if (e === 'bmp') return 'image/bmp'
    return ''
  }

  let _serverConfig = null
  let _serverConfigPromise = null
  function getServerConfig() {
    return _serverConfig || null
  }
  async function loadServerConfig({ force = false } = {}) {
    if (!force && _serverConfig) return _serverConfig
    if (!force && _serverConfigPromise) return _serverConfigPromise
    _serverConfigPromise = (async () => {
      try {
        const r = await fetch('/api/config', { cache: 'no-store' })
        if (r.ok) {
          const data = await r.json()
          _serverConfig = data && data.ok ? data : null
        }
      } catch {
        _serverConfig = null
      }
      return _serverConfig
    })()
    try {
      const out = await _serverConfigPromise
      return out
    } finally {
      _serverConfigPromise = null
    }
  }

  function tokenFromLocation() {
    try {
      const s = new URLSearchParams(location.search)
      return s.get('token') || ''
    } catch { return '' }
  }

  function attachmentAuthHeaders() {
    const h = {}
    const t = tokenFromLocation()
    if (t) h['X-Niuma-Token'] = t
    return h
  }

  async function uploadAttachment(att, { clientMessageId = null, onProgress } = {}) {
    if (!att || !att.file) { throw new Error('missing file') }
    att.uploadStatus = UPLOAD_STATUS.UPLOADING
    att.uploadProgress = 0
    const ac = new AbortController()
    att.abortController = ac
    const fd = new FormData()
    fd.append('file', att.file, att.name || ('upload-' + Date.now()))
    if (clientMessageId) fd.append('clientMessageId', String(clientMessageId))
    if (typeof att.size === 'number') fd.append('declaredSize', String(att.size))

    const xhr = (typeof XMLHttpRequest !== 'undefined') ? new XMLHttpRequest() : null
    let finished = false
    try {
      if (xhr && typeof onProgress === 'function') {
        const out = await new Promise((resolve, reject) => {
          xhr.open('POST', '/niuma/v1/attachments', true)
          const token = tokenFromLocation()
          if (token) xhr.setRequestHeader('X-Niuma-Token', token)
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)))
              att.uploadProgress = pct
              onProgress(pct, att)
            }
          }
          xhr.onload = () => {
            if (finished) return
            finished = true
            try {
              let data = {}
              try { data = JSON.parse(xhr.responseText || '{}') } catch {}
              if (xhr.status >= 200 && xhr.status < 300 && data && data.ok === true) resolve(data)
              else reject(new Error((data && data.error) || `HTTP ${xhr.status}`))
            } catch (e) { reject(e) }
          }
          xhr.onerror = () => { if (!finished) { finished = true; reject(new Error('network')) } }
          xhr.onabort = () => { if (!finished) { finished = true; const err = new Error('cancel'); err.code = 'CANCELLED'; reject(err) } }
          ac.signal.addEventListener?.('abort', () => { try { xhr.abort() } catch {} })
          xhr.send(fd)
        })
        att.serverId = String(out.id || '')
        att.uploadStatus = UPLOAD_STATUS.UPLOADED
        att.uploadProgress = 100
        att.error = null
        return out
      }
      const r = await fetch('/niuma/v1/attachments', {
        method: 'POST',
        headers: attachmentAuthHeaders(),
        body: fd,
        signal: ac.signal,
      })
      let data = {}
      try { data = await r.json() } catch {}
      if (!(r.ok && data && data.ok === true)) throw new Error((data && data.error) || `HTTP ${r.status}`)
      att.serverId = String(data.id || '')
      att.uploadStatus = UPLOAD_STATUS.UPLOADED
      att.uploadProgress = 100
      att.error = null
      return data
    } catch (e) {
      if (finished) throw e
      finished = true
      if (e && (e.code === 'CANCELLED' || e.name === 'AbortError')) {
        att.uploadStatus = UPLOAD_STATUS.CANCELLED
        att.error = null
      } else {
        att.uploadStatus = UPLOAD_STATUS.UPLOAD_FAILED
        att.error = e && e.message ? e.message : '上传失败'
      }
      throw e
    }
  }

  async function fetchAttachmentMeta(attOrId) {
    const id = (attOrId && typeof attOrId === 'object') ? (attOrId.serverId || attOrId.id) : String(attOrId || '')
    if (!/^[0-9a-f]{24}$/.test(id)) return null
    const r = await fetch(`/niuma/v1/attachments/${id}/preview/meta`, {
      headers: attachmentAuthHeaders(),
      cache: 'no-store',
    })
    if (!r.ok) return null
    return r.json()
  }

  async function confirmTranscriptServer(attOrId, confirmedText) {
    const id = (attOrId && typeof attOrId === 'object') ? (attOrId.serverId || attOrId.id) : String(attOrId || '')
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('bad id')
    const r = await fetch(`/niuma/v1/attachments/${id}/transcript`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...attachmentAuthHeaders(),
      },
      body: JSON.stringify({ confirmedEdited: String(confirmedText || '').trim() }),
    })
    if (!r.ok) {
      let msg = `HTTP ${r.status}`
      try { const d = await r.json(); if (d && d.error) msg = d.error } catch {}
      throw new Error(msg)
    }
    return r.json()
  }

  const META_POLL_TOTAL_TIMEOUT_MS = 30_000
  const META_POLL_INTERVAL_START_MS = 500
  const META_POLL_INTERVAL_MAX_MS = 2000

  function attachmentIsReady(a) {
    if (!a) return false
    if (a.uploadStatus !== UPLOAD_STATUS.UPLOADED) return false
    const ps = a.processingStatus
    if (ps !== PROCESSING_STATUS.EXTRACTED) return false
    if (a.error) return false
    if (a.kind === ATTACH_KIND.AUDIO) {
      if (!a.transcriptionConfigured) return true
      const cs = a.confirmStatus
      if (cs === CONFIRM_STATUS.CONFIRMED) return true
      if (cs === CONFIRM_STATUS.DISABLED) return true
      return false
    }
    return true
  }

  function _mapServerStatusToProcessing(srvStatus, serverError) {
    if (srvStatus === 'uploading') return PROCESSING_STATUS.IDLE
    if (srvStatus === 'stored') return PROCESSING_STATUS.EXTRACTING
    if (srvStatus === 'extracting') return PROCESSING_STATUS.EXTRACTING
    if (srvStatus === 'extracted') return PROCESSING_STATUS.EXTRACTED
    if (srvStatus === 'processing_error') return PROCESSING_STATUS.PROCESSING_ERROR
    if (srvStatus === 'cancelled') return PROCESSING_STATUS.UNSUPPORTED
    if (srvStatus === 'attached') return PROCESSING_STATUS.EXTRACTED
    if (serverError) return PROCESSING_STATUS.PROCESSING_ERROR
    return PROCESSING_STATUS.IDLE
  }

  function applyMetaToAttachment(att, meta) {
    if (!att || !meta) return
    if (meta.status != null) att.processingStatus = _mapServerStatusToProcessing(meta.status, meta.error)
    if (typeof meta.error === 'string') att.error = meta.error
    if (typeof meta.size === 'number') att.size = meta.size
    if (typeof meta.durationSec === 'number' && meta.durationSec > 0) att.durationSec = meta.durationSec
    if (typeof meta.pageCount === 'number' && meta.pageCount > 0) att.pageCount = meta.pageCount
    if (meta.originalTranscript && !att.originalTranscript) att.originalTranscript = String(meta.originalTranscript)
    if (typeof meta.confirmedEdited === 'string') {
      const serverConfirmed = String(meta.confirmedEdited || '').trim()
      if (serverConfirmed) {
        att.confirmedEditedTranscript = serverConfirmed
        if (!att.confirmStatus || att.confirmStatus === CONFIRM_STATUS.NONE || att.confirmStatus === CONFIRM_STATUS.PENDING) {
          att.confirmStatus = CONFIRM_STATUS.CONFIRMED
        }
      }
    }
  }

  function startMetaPolling(att, { onUpdate } = {}) {
    if (!att) return
    stopMetaPolling(att)
    if (!att.serverId || !/^[0-9a-f]{24}$/.test(att.serverId)) return
    if (att.processingStatus === PROCESSING_STATUS.EXTRACTED && att.kind !== ATTACH_KIND.AUDIO) return
    att._metaPollStartedAt = Date.now()
    att._metaPollAttempts = 0
    const tick = async () => {
      if (!att || !att.serverId) return
      if (Date.now() - att._metaPollStartedAt > META_POLL_TOTAL_TIMEOUT_MS) {
        if (att.processingStatus !== PROCESSING_STATUS.EXTRACTED) {
          att.processingStatus = PROCESSING_STATUS.EXTRACT_FAILED
          att.error = att.error || '附件处理超时'
        }
        onUpdate?.(att)
        return
      }
      let meta
      try { meta = await fetchAttachmentMeta(att) }
      catch { meta = null }
      if (meta) applyMetaToAttachment(att, meta)
      onUpdate?.(att)
      const nowEx = att.processingStatus === PROCESSING_STATUS.EXTRACTED
      const nowTerminal = (nowEx && att.kind !== ATTACH_KIND.AUDIO)
        || (nowEx && att.kind === ATTACH_KIND.AUDIO && (!att.transcriptionConfigured || att.confirmStatus === CONFIRM_STATUS.CONFIRMED))
        || att.processingStatus === PROCESSING_STATUS.PROCESSING_ERROR
        || att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED
        || att.processingStatus === PROCESSING_STATUS.UNSUPPORTED
      if (nowTerminal) {
        stopMetaPolling(att)
        return
      }
      const n = att._metaPollAttempts = (att._metaPollAttempts || 0) + 1
      const delay = Math.min(META_POLL_INTERVAL_START_MS * Math.pow(1.6, n - 1), META_POLL_INTERVAL_MAX_MS)
      att._metaPollTimer = setTimeout(tick, delay)
    }
    tick()
  }

  function stopMetaPolling(att) {
    if (!att) return
    if (att._metaPollTimer) {
      try { clearTimeout(att._metaPollTimer) } catch {}
      att._metaPollTimer = null
    }
  }

  async function persistConfirmTranscript(att, confirmedText) {
    if (!att) throw new Error('missing attachment')
    if (!att.serverId) throw new Error('attachment not uploaded')
    att.confirmStatus = CONFIRM_STATUS.PENDING
    att.confirmError = ''
    try {
      const out = await confirmTranscriptServer(att, confirmedText)
      if (out && typeof out.confirmedEdited === 'string') {
        att.confirmedEditedTranscript = String(out.confirmedEdited)
      }
      att.confirmStatus = CONFIRM_STATUS.CONFIRMED
      att.confirmError = ''
      return out
    } catch (e) {
      att.confirmStatus = CONFIRM_STATUS.FAILED
      att.confirmError = e && e.message ? e.message : '确认失败'
      throw e
    }
  }

  // ---- Override: capability checks prefer server /api/config truth; fall back to legacy globals only if not present ----
  function isTranscriptionConfigured() {
    const sc = _serverConfig
    if (sc && sc.transcription) return Boolean(sc.transcription.enabled)
    return !!(globalThis.VAOTranscriptionConfig && globalThis.VAOTranscriptionConfig.provider && globalThis.VAOTranscriptionConfig.provider !== 'disabled')
  }
  function isVisionConfigured() {
    const sc = _serverConfig
    if (sc && sc.vision && Array.isArray(sc.vision.visionCapableAdapterIds)) return sc.vision.visionCapableAdapterIds.length > 0
    const ids = (globalThis.VAOVisionConfig && globalThis.VAOVisionConfig.visionCapableAdapterIds) || []
    return Array.isArray(ids) && ids.length > 0
  }

  const api = Object.freeze({
    UPLOAD_STATUS,
    PROCESSING_STATUS,
    CONFIRM_STATUS,
    ATTACH_KIND,
    createAttachmentFromFile,
    createAttachmentFromRecording,
    renderAttachmentCard,
    renderTray,
    startRecording,
    stopRecording,
    cancelRecording,
    getActiveRecorder,
    isTranscriptionConfigured,
    isVisionConfigured,
    fileToImageBytes,
    guessMimeFromExt,
    kindFromFile,
    formatSize,
    uploadAttachment,
    fetchAttachmentMeta,
    confirmTranscriptServer,
    persistConfirmTranscript,
    startMetaPolling,
    stopMetaPolling,
    applyMetaToAttachment,
    attachmentIsReady,
    loadServerConfig,
    getServerConfig,
  })

  globalThis.VAOCoreAttachments = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
