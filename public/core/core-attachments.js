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
    UNSUPPORTED: 'UNSUPPORTED',
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
      dimensions: null,
      durationSec: null,
      transcriptionConfigured: false,
      abortController: null,
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
    else if (p === PROCESSING_STATUS.EXTRACTED) { label = '已就绪'; cls = 'status-done' }
    else if (p === PROCESSING_STATUS.EXTRACT_FAILED) { label = '解析失败'; cls = 'status-blocked' }
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
      const cancel = el('button', { class: 'attach-btn', title: '取消上传', 'aria-label': '取消上传', onClick: (e) => { e.stopPropagation(); ctx.onCancel?.(att) } }, '✕')
      actions.appendChild(cancel)
    } else if (att.uploadStatus === UPLOAD_STATUS.UPLOAD_FAILED || att.processingStatus === PROCESSING_STATUS.EXTRACT_FAILED) {
      const retry = el('button', { class: 'attach-btn', title: '重试', 'aria-label': '重试', onClick: (e) => { e.stopPropagation(); ctx.onRetry?.(att) } }, '↻')
      const remove = el('button', { class: 'attach-btn', title: '移除', 'aria-label': '移除', onClick: (e) => { e.stopPropagation(); ctx.onRemove?.(att) } }, '✕')
      actions.appendChild(retry)
      actions.appendChild(remove)
    } else {
      if (att.kind === ATTACH_KIND.DOC || att.kind === ATTACH_KIND.IMAGE) {
        const preview = el('button', { class: 'attach-btn', title: '预览', 'aria-label': '预览', onClick: (e) => { e.stopPropagation(); ctx.onPreview?.(att) } }, '👁')
        actions.appendChild(preview)
      }
      const remove = el('button', { class: 'attach-btn', title: '移除', 'aria-label': '移除', onClick: (e) => { e.stopPropagation(); ctx.onRemove?.(att) } }, '✕')
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
      } else if (att.processingStatus === PROCESSING_STATUS.EXTRACTING) {
        trBox.appendChild(el('div', { class: 'transcript-working' }, '正在转写…'))
      } else if (att.originalTranscript || att.confirmedEditedTranscript) {
        const label = el('div', { class: 'transcript-label' }, '转写内容（可编辑，发送时使用已确认内容）')
        const ta = el('textarea', { class: 'transcript-ta', rows: 2, placeholder: '确认后的转写内容…' })
        ta.value = att.confirmedEditedTranscript || att.originalTranscript || ''
        ta.addEventListener('input', () => { att.confirmedEditedTranscript = ta.value })
        trBox.appendChild(label)
        trBox.appendChild(ta)
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

  const api = Object.freeze({
    UPLOAD_STATUS,
    PROCESSING_STATUS,
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
  })

  globalThis.VAOCoreAttachments = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
