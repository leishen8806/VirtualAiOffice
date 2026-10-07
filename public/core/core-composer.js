;(function () {
  'use strict'

  const Attachments = globalThis.VAOCoreAttachments
  const DRAFTS = new Map()
  const EXPANDED_STACK = []
  const COMPOSER_ID_COUNTER = { v: 0 }
  const HANDLERS_SYM = Symbol('vaoComposerHandlers')
  const ESC_LISTENER_SYM = Symbol('vaoComposerEscListener')

  function draftKey({ runtimeId, workspacePath, projectPath } = {}) {
    const rid = String(runtimeId || 'default')
    const wsp = String(workspacePath || '').replace(/[\\\/]/g, '/') || 'default'
    const prj = String(projectPath || '').replace(/[\\\/]/g, '/') || 'default'
    return rid + '::' + wsp + '::' + prj
  }

  function getDraft(ctx) {
    const k = draftKey(ctx)
    if (!DRAFTS.has(k)) {
      DRAFTS.set(k, {
        text: '',
        attachments: [],
        timestamp: Date.now(),
        retained: null,
      })
    }
    return DRAFTS.get(k)
  }

  function setDraft(ctx, patch) {
    const k = draftKey(ctx)
    const d = getDraft(ctx)
    Object.assign(d, patch)
    d.timestamp = Date.now()
    return d
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

  function injectComposerCss() {
    const id = 'core-composer-css'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
html[data-theme-core] .helix-composer-v2{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:10px;position:relative;}
html[data-theme-core] .helix-composer-v2.drop-active{box-shadow:inset 0 0 0 2px var(--orchestrator);}
html[data-theme-core] .helix-composer-v2 .attachment-tray{min-height:0;}
html[data-theme-core] .helix-composer-v2 .attach-list{display:flex;flex-direction:column;gap:6px;}
html[data-theme-core] .helix-composer-v2 .attach-card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);background:var(--panel-2);border-radius:8px;padding:7px 8px;}
html[data-theme-core] .helix-composer-v2 .attach-card.is-error{border-color:color-mix(in srgb, var(--blocked) 55%, var(--line));background:color-mix(in srgb, var(--blocked) 8%, var(--panel-2));}
html[data-theme-core] .helix-composer-v2 .attach-card-head{display:flex;align-items:center;gap:8px;}
html[data-theme-core] .helix-composer-v2 .attach-glyph{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:color-mix(in srgb, var(--orchestrator) 12%, transparent);color:var(--orchestrator);flex-shrink:0;}
html[data-theme-core] .helix-composer-v2 .attach-image .attach-glyph{background:color-mix(in srgb, var(--accent) 12%, transparent);color:var(--accent);}
html[data-theme-core] .helix-composer-v2 .attach-audio .attach-glyph{background:color-mix(in srgb, var(--waiting-human) 12%, transparent);color:var(--waiting-human);}
html[data-theme-core] .helix-composer-v2 .attach-meta{flex:1 1 auto;min-width:0;}
html[data-theme-core] .helix-composer-v2 .attach-name{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px;}
html[data-theme-core] .helix-composer-v2 .attach-sub{display:inline-flex;align-items:center;gap:6px;margin-top:2px;}
html[data-theme-core] .helix-composer-v2 .attach-size{font-size:10.5px;color:var(--text-muted);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge{font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--panel);border:1px solid var(--line);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-working{color:var(--working);border-color:color-mix(in srgb, var(--working) 40%, var(--line));background:color-mix(in srgb, var(--working) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-done{color:var(--done);border-color:color-mix(in srgb, var(--done) 40%, var(--line));background:color-mix(in srgb, var(--done) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-blocked{color:var(--blocked);border-color:color-mix(in srgb, var(--blocked) 40%, var(--line));background:color-mix(in srgb, var(--blocked) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-offline{color:var(--offline);border-color:color-mix(in srgb, var(--offline) 40%, var(--line));background:color-mix(in srgb, var(--offline) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-reviewing{color:var(--reviewing);border-color:color-mix(in srgb, var(--reviewing) 40%, var(--line));background:color-mix(in srgb, var(--reviewing) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-status-badge.status-thinking{color:var(--thinking);border-color:color-mix(in srgb, var(--thinking) 40%, var(--line));background:color-mix(in srgb, var(--thinking) 10%, transparent);}
html[data-theme-core] .helix-composer-v2 .attach-actions{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;}
html[data-theme-core] .helix-composer-v2 .attach-btn{width:24px;height:24px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1;}
html[data-theme-core] .helix-composer-v2 .attach-btn:hover{color:var(--text);border-color:var(--accent);}
html[data-theme-core] .helix-composer-v2 .attach-progress{height:4px;border-radius:999px;background:var(--panel);overflow:hidden;border:1px solid var(--line);}
html[data-theme-core] .helix-composer-v2 .attach-progress-fill{height:100%;background:linear-gradient(90deg,var(--orchestrator),var(--accent));transition:width 120ms var(--ease);}
html[data-theme-core] .helix-composer-v2 .attach-thumb{display:block;max-height:120px;border-radius:7px;overflow:hidden;background:var(--panel);border:1px solid var(--line);}
html[data-theme-core] .helix-composer-v2 .attach-thumb img{display:block;max-width:100%;max-height:120px;width:auto;height:auto;margin:0 auto;}
html[data-theme-core] .helix-composer-v2 .attach-audio audio{width:100%;height:32px;display:block;}
html[data-theme-core] .helix-composer-v2 .attach-transcript{display:flex;flex-direction:column;gap:4px;}
html[data-theme-core] .helix-composer-v2 .transcript-honest{font-size:11px;color:var(--waiting-human);padding:5px 7px;border-radius:6px;background:color-mix(in srgb, var(--waiting-human) 10%, transparent);border:1px dashed color-mix(in srgb, var(--waiting-human) 35%, var(--line));}
html[data-theme-core] .helix-composer-v2 .transcript-working{font-size:11px;color:var(--reviewing);padding:5px 7px;border-radius:6px;background:color-mix(in srgb, var(--reviewing) 8%, transparent);}
html[data-theme-core] .helix-composer-v2 .transcript-label{font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;}
html[data-theme-core] .helix-composer-v2 .transcript-ta{width:100%;resize:vertical;min-height:44px;background:var(--panel);border:1px solid var(--line);border-radius:6px;color:var(--text);padding:5px 7px;font:inherit;font-size:11.5px;line-height:16px;box-sizing:border-box;}
html[data-theme-core] .helix-composer-v2 .attach-doc-preview{font-size:11px;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 8px;line-height:15px;white-space:pre-wrap;max-height:100px;overflow:auto;}
html[data-theme-core] .helix-composer-v2 .attach-error{font-size:11px;color:var(--blocked);padding:4px 7px;border-radius:6px;background:color-mix(in srgb, var(--blocked) 10%, transparent);line-height:15px;}
html[data-theme-core] .helix-composer-v2 .composer-ta-wrap{display:block;position:relative;}
html[data-theme-core] .helix-composer-v2 textarea.composer-ta{width:100%;box-sizing:border-box;min-height:160px;max-height:320px;resize:none;padding:10px 12px;font-size:15px;line-height:24px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;overflow-y:auto;scrollbar-width:thin;}
html[data-theme-core] .helix-composer-v2 textarea.composer-ta:focus{outline:none;border-color:var(--orchestrator);box-shadow:0 0 0 3px color-mix(in srgb, var(--orchestrator) 18%, transparent);}
html[data-theme-core] .helix-composer-v2 textarea.composer-ta::placeholder{color:var(--text-muted);}
html[data-theme-core] .helix-composer-v2 .composer-toolbar{display:flex;align-items:center;gap:6px;justify-content:space-between;}
html[data-theme-core] .helix-composer-v2 .toolbar-left,html[data-theme-core] .helix-composer-v2 .toolbar-right{display:inline-flex;align-items:center;gap:5px;}
html[data-theme-core] .helix-composer-v2 .tool-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;font-size:14px;}
html[data-theme-core] .helix-composer-v2 .tool-btn:hover{color:var(--text);border-color:var(--accent);}
html[data-theme-core] .helix-composer-v2 .tool-btn.recording{color:var(--blocked);border-color:color-mix(in srgb, var(--blocked) 55%, var(--line));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--blocked) 30%, transparent);animation:vao-composer-rec-pulse 1s var(--ease) infinite;}
html[data-theme-core] .helix-composer-v2 .tool-btn[aria-disabled="true"],html[data-theme-core] .helix-composer-v2 .tool-btn[disabled]{opacity:.5;cursor:not-allowed;}
@keyframes vao-composer-rec-pulse{0%,100%{box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--blocked) 30%, transparent);}50%{box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--blocked) 65%, var(--line)), 0 0 0 3px color-mix(in srgb, var(--blocked) 22%, transparent);}}
html[data-theme-core] .helix-composer-v2 .rec-timer{font-size:11px;font-weight:700;color:var(--blocked);font-variant-numeric:tabular-nums;padding:2px 6px;border-radius:6px;background:color-mix(in srgb, var(--blocked) 12%, transparent);}
html[data-theme-core] .helix-composer-v2 .expand-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;font-size:13px;}
html[data-theme-core] .helix-composer-v2 .expand-btn:hover{color:var(--orchestrator);border-color:var(--orchestrator);}
html[data-theme-core] .helix-composer-v2 .send-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border-radius:8px;background:var(--orchestrator);color:#fff;border:0;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.02em;}
html[data-theme-core] .helix-composer-v2 .send-btn:hover{filter:brightness(1.08);}
html[data-theme-core] .helix-composer-v2 .send-btn[disabled]{opacity:.55;cursor:not-allowed;filter:none;}
html[data-theme-core] .helix-composer-v2 .ime-protect{width:0;height:0;visibility:hidden;position:absolute;}
html[data-theme-core] .composer-expanded-overlay{position:fixed;inset:0;background:rgba(6,10,20,.55);z-index:9998;display:none;}
html[data-theme-core] .composer-expanded-overlay.open{display:block;}
html[data-theme-core] .helix-composer-v2.expanded{position:fixed;z-index:9999;width:min(720px,95vw);left:50%;top:8vh;transform:translateX(-50%);max-height:88vh;box-shadow:var(--shadow-2);padding:14px;}
@media (max-width:640px){
html[data-theme-core] .helix-composer-v2.expanded{position:fixed;inset:0;left:0;top:0;transform:none;width:100%;height:100%;max-height:100vh;border-radius:0;padding:16px 12px 14px;}
html[data-theme-core] .helix-composer-v2.expanded .composer-ta{min-height:220px;max-height:60vh;}
html[data-theme-core] .retained-wrap{margin:0 2px 6px;border-radius:8px;border:1px dashed color-mix(in srgb, var(--orchestrator) 45%, var(--line));background:color-mix(in srgb, var(--orchestrator) 7%, transparent);padding:6px 8px;}
html[data-theme-core] .retained-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--orchestrator);letter-spacing:.02em;}
html[data-theme-core] .retained-head .retained-count{padding:1px 6px;border-radius:999px;background:color-mix(in srgb, var(--orchestrator) 18%, transparent);}
html[data-theme-core] .retained-head .spacer{flex:1 1 auto;}
html[data-theme-core] .retained-head .retained-clear-all{font-size:10px;font-weight:700;color:var(--text-muted);cursor:pointer;border:1px solid var(--line);background:var(--panel);padding:2px 6px;border-radius:6px;}
html[data-theme-core] .retained-head .retained-clear-all:hover{color:var(--blocked);border-color:color-mix(in srgb, var(--blocked) 40%, var(--line));}
html[data-theme-core] .retained-list{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:5px;}
html[data-theme-core] .retained-chip{display:inline-flex;align-items:center;gap:5px;background:var(--panel-2);border:1px solid var(--line);padding:2px 2px 2px 7px;border-radius:999px;font-size:11px;color:var(--text);line-height:1.5;}
html[data-theme-core] .retained-chip .rc-name{max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;}
html[data-theme-core] .retained-chip .rc-size{color:var(--text-muted);font-variant-numeric:tabular-nums;}
html[data-theme-core] .retained-chip .rc-x{width:18px;height:18px;border-radius:50%;border:0;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:11px;line-height:1;}
html[data-theme-core] .retained-chip .rc-x:hover{color:var(--blocked);background:color-mix(in srgb, var(--blocked) 15%, transparent);}`
    document.head.appendChild(s)
  }

  function autoGrowTa(ta) {
    ta.style.height = 'auto'
    const scrollH = ta.scrollHeight
    const min = 160
    const max = 320
    const target = Math.max(min, Math.min(max, scrollH))
    ta.style.height = target + 'px'
    ta.style.overflowY = scrollH > max ? 'auto' : 'hidden'
  }

  function isMobile() {
    try { return window.matchMedia && window.matchMedia('(max-width: 640px)').matches } catch { return false }
  }

  function queueAttachmentsFromFileList(fileList, draft) {
    if (!fileList || !fileList.length) return 0
    const files = Array.from(fileList)
    let added = 0
    for (const f of files) {
      if (!f) continue
      draft.attachments.push(Attachments.createAttachmentFromFile(f))
      added++
    }
    return added
  }

  function attachCtxFromDraft(draft, formEl) {
    return {
      onCancel: (att) => {
        if (att.abortController) { try { att.abortController.abort() } catch {} }
        Attachments.stopMetaPolling?.(att)
        att.uploadStatus = Attachments.UPLOAD_STATUS.CANCELLED
        rerenderTray(formEl, draft)
      },
      onRetry: (att) => {
        Attachments.stopMetaPolling?.(att)
        att.error = null
        att.confirmError = ''
        att.confirmStatus = Attachments.CONFIRM_STATUS?.NONE || 'NONE'
        att.uploadStatus = Attachments.UPLOAD_STATUS.IDLE
        att.uploadProgress = 0
        att.processingStatus = Attachments.PROCESSING_STATUS.IDLE
        rerenderTray(formEl, draft)
      },
      onRemove: (att) => {
        Attachments.stopMetaPolling?.(att)
        if (att.objectUrl) { try { URL.revokeObjectURL(att.objectUrl) } catch {} }
        const i = draft.attachments.findIndex((x) => x.id === att.id)
        if (i >= 0) draft.attachments.splice(i, 1)
        rerenderTray(formEl, draft)
      },
      onPreview: (att) => {
        if (att.kind === Attachments.ATTACH_KIND.IMAGE && att.objectUrl) {
          try { window.open(att.objectUrl, '_blank', 'noopener') } catch {}
        } else if (att.kind === Attachments.ATTACH_KIND.DOC) {
          const pv = formEl.querySelector('.attach-doc-preview')
          if (pv) pv.hidden = !pv.hidden
        }
      },
      onError: (msg) => {
        const box = formEl.querySelector('.attach-error-top') || el('div', { class: 'attach-error-top', style: 'font-size:11px;color:var(--blocked);padding:5px 8px;border-radius:6px;background:color-mix(in srgb, var(--blocked) 10%, transparent);border:1px solid color-mix(in srgb, var(--blocked) 30%, var(--line));margin-bottom:2px;' })
        box.textContent = String(msg)
        const tray = formEl.querySelector('.attachment-tray')
        if (tray && !box.parentElement) tray.insertBefore(box, tray.firstChild)
      },
      onConfirmTranscript: async (att, textValue) => {
        try {
          await Attachments.persistConfirmTranscript?.(att, textValue)
        } catch {}
        rerenderTray(formEl, draft)
      },
      onChangeConfirmStateChange: () => {
        rerenderTray(formEl, draft)
      },
    }
  }

  function rerenderTray(formEl, draft) {
    const ctx = attachCtxFromDraft(draft, formEl)
    const old = formEl.querySelector('.attachment-tray')
    const fresh = Attachments.renderTray(draft.attachments, ctx)
    if (old && old.parentElement) old.replaceWith(fresh)
  }

  function closeExpanded(formEl) {
    if (!formEl) return
    const idx = EXPANDED_STACK.indexOf(formEl)
    if (idx >= 0) EXPANDED_STACK.splice(idx, 1)
    formEl.classList.remove('expanded')
    const ovr = document.getElementById('composer-expanded-overlay-' + formEl.dataset.composerId)
    if (ovr) ovr.classList.remove('open')
    const ta = formEl.querySelector('textarea.composer-ta')
    if (ta) try { ta.focus() } catch {}
  }

  function openExpanded(formEl) {
    if (!formEl) return
    if (!formEl.dataset.composerId) formEl.dataset.composerId = String(++COMPOSER_ID_COUNTER.v)
    let ovr = document.getElementById('composer-expanded-overlay-' + formEl.dataset.composerId)
    if (!ovr) {
      ovr = el('div', { class: 'composer-expanded-overlay', id: 'composer-expanded-overlay-' + formEl.dataset.composerId })
      ovr.addEventListener('click', () => closeExpanded(formEl))
      document.body.appendChild(ovr)
    }
    ovr.classList.add('open')
    formEl.classList.add('expanded')
    EXPANDED_STACK.push(formEl)
    const ta = formEl.querySelector('textarea.composer-ta')
    if (ta) try { ta.focus() } catch {}
  }

  function escapeGlobalHandler(e) {
    if (e.key !== 'Escape') return
    const top = EXPANDED_STACK[EXPANDED_STACK.length - 1]
    if (!top) return
    e.preventDefault()
    closeExpanded(top)
  }

  function isComposerEmpty(draft) {
    if (String(draft.text || '').trim()) return false
    if (draft.attachments && draft.attachments.length) return false
    return true
  }

  function buildOutgoingPayload(draft, extra = {}) {
    const text = String(draft.text || '').trim()
    const freshIds = (draft.attachments || [])
      .filter((a) => a.serverId && (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADED))
      .map((a) => a.serverId)
    const retainedIds = (draft && draft.retained && draft.retained.continuationToken && Array.isArray(draft.retained.attachments))
      ? draft.retained.attachments.map((a) => a.serverId).filter(Boolean)
      : []
    const ids = [...retainedIds, ...freshIds]
    const payload = { text }
    if (ids.length) payload.attachmentIds = ids
    if (extra && extra.clientMessageId) payload.clientMessageId = String(extra.clientMessageId)
    if (draft && draft.retained && draft.retained.continuationToken && retainedIds.length) {
      payload.continuationToken = draft.retained.continuationToken
    }
    return payload
  }

  function attachmentIsReady(a) {
    if (typeof Attachments.attachmentIsReady === 'function') return Attachments.attachmentIsReady(a)
    if (!a) return false
    if (a.uploadStatus !== Attachments.UPLOAD_STATUS.UPLOADED) return false
    const ps = a.processingStatus
    if (ps !== Attachments.PROCESSING_STATUS.EXTRACTED) return false
    if (a.error) return false
    return true
  }

  function genUUID() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
    return 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  }

  function fmtBytes(n) {
    const v = Number(n || 0)
    if (v < 1024) return v + 'B'
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + 'KB'
    return (v / 1024 / 1024).toFixed(2) + 'MB'
  }

  function renderRetained(draft, formEl, opts) {
    const wrap = el('div', { class: 'retained-wrap', 'data-retained-wrap': '1' })
    if (!draft || !draft.retained || !Array.isArray(draft.retained.attachments) || !draft.retained.attachments.length) {
      wrap.hidden = true
      return wrap
    }
    const count = draft.retained.attachments.length
    const head = el('div', { class: 'retained-head' })
    head.appendChild(el('span', {}, '已保留附件上下文'))
    const countPill = el('span', { class: 'retained-count' }, `${count} 个`)
    head.appendChild(countPill)
    const ttlMs = Number(draft.retained.ttlMs || 0)
    const issuedAt = Number(draft.retained.issuedAt || 0)
    if (ttlMs > 0 && issuedAt > 0) {
      const remainMs = Math.max(0, (issuedAt + ttlMs) - Date.now())
      const remainSec = Math.round(remainMs / 1000)
      const mins = Math.floor(remainSec / 60)
      const secs = remainSec % 60
      const tt = mins > 0 ? `${mins}分${String(secs).padStart(2, '0')}秒` : `${secs}秒`
      const pill = el('span', { style: 'font-size:10px;color:var(--text-muted);font-weight:700;', 'data-retained-ttl': tt }, '剩余 ' + tt)
      head.appendChild(pill)
    }
    const spacer = el('div', { class: 'spacer' })
    head.appendChild(spacer)
    const clearAll = el('button', { type: 'button', class: 'retained-clear-all', title: '移除所有保留的附件上下文', onClick: () => {
      if (typeof opts.onDiscardRetainedAll === 'function') opts.onDiscardRetainedAll()
    } }, '清除保留')
    head.appendChild(clearAll)
    wrap.appendChild(head)
    const list = el('div', { class: 'retained-list' })
    draft.retained.attachments.forEach((att, index) => {
      const chip = el('div', { class: 'retained-chip', 'data-retained-index': String(index) })
      const glyph = (att.kind === 'IMAGE') ? '🖼️' : (att.kind === 'AUDIO') ? '🎙️' : '📄'
      chip.appendChild(el('span', { style: 'font-size:11px;', 'aria-hidden': 'true' }, glyph))
      const name = el('span', { class: 'rc-name', title: String(att.sanitizedName || att.name || '') }, String(att.sanitizedName || att.name || 'attachment'))
      chip.appendChild(name)
      if (typeof att.size === 'number') {
        chip.appendChild(el('span', { class: 'rc-size' }, fmtBytes(att.size)))
      }
      const xb = el('button', { type: 'button', class: 'rc-x', title: '不再保留此附件', onClick: () => {
        if (typeof opts.onDiscardRetainedIndex === 'function') opts.onDiscardRetainedIndex(index)
      } }, '×')
      chip.appendChild(xb)
      list.appendChild(chip)
    })
    wrap.appendChild(list)
    return wrap
  }

  function rerenderRetained(formEl, draft, opts) {
    if (!formEl) return
    const old = formEl.querySelector('[data-retained-wrap]')
    const fresh = renderRetained(draft, formEl, opts)
    // Insert retained BEFORE the attachment tray OR before textarea first row if no tray yet
    const tray = formEl.querySelector('.attachment-tray')
    const taWrap = formEl.querySelector('.composer-ta-wrap')
    if (old && old.parentElement) old.replaceWith(fresh)
    else {
      // Try insert: target before textarea (taWrap)
      if (taWrap && taWrap.parentElement) taWrap.parentElement.insertBefore(fresh, taWrap)
      else if (tray && tray.parentElement) tray.parentElement.insertBefore(fresh, tray)
      else formEl.insertBefore(fresh, formEl.firstChild)
    }
  }

  function renderComposer(options = {}) {
    const ctx = options.context || {}
    const onSend = options.onSend || null
    const scopeKey = options.scopeKey || draftKey(ctx)
    const draft = getDraft(ctx)
    const cid = 'hc-v2-' + (++COMPOSER_ID_COUNTER.v)

    let sendingInFlight = false
    let pendingClientMessageId = null
    let retainedExpireTimer = null
    let latestTrayRenderOpts = null

    const stopRetainedExpireTimer = () => {
      if (retainedExpireTimer) { clearInterval(retainedExpireTimer); retainedExpireTimer = null }
    }
    const clearRetainedClientOnly = () => {
      stopRetainedExpireTimer()
      draft.retained = null
    }
    const callDiscardServerSide = async () => {
      const tok = draft && draft.retained && draft.retained.continuationToken
      if (!tok || !onSend) return { ok: false, error: 'no onSend channel' }
      try {
        const ids = (draft.retained.attachments || []).map((a) => a.serverId).filter(Boolean)
        const payload = {
          clientMessageId: genUUID(),
          text: '',
          attachmentIds: ids,
          continuationToken: tok,
          continuationDiscard: true,
        }
        const res = await onSend(payload)
        if (res && res.ok === true) return { ok: true }
        if (res && res.error) return { ok: false, error: res.error }
        return { ok: false, error: '服务器未确认移除。' }
      } catch (e) {
        return { ok: false, error: (e && (e.message || e)) || '网络错误' }
      }
    }
    const discardRetainedAll = async () => {
      if (!draft || !draft.retained) return
      let ok = true
      let err = ''
      if (draft.retained.continuationToken) {
        const res = await callDiscardServerSide()
        ok = res.ok === true
        err = res.error || ''
      }
      if (ok) {
        clearRetainedClientOnly()
      } else {
        setSendErrorBanner(form, '附件上下文清理失败，上下文保留未移除。原因：' + (err || '未知错误'))
      }
      rerenderRetained(form, draft, latestTrayRenderOpts)
      rerenderTray(form, draft)
    }
    const discardRetainedIndex = (index) => {
      if (!draft || !draft.retained || !Array.isArray(draft.retained.attachments)) return
      draft.retained.attachments.splice(index, 1)
      if (!draft.retained.attachments.length) {
        discardRetainedAll()
        return
      }
      rerenderRetained(form, draft, latestTrayRenderOpts)
      rerenderTray(form, draft)
    }
    const startRetainedExpireTimer = () => {
      stopRetainedExpireTimer()
      const tick = () => {
        const r = draft && draft.retained
        if (!r || !r.issuedAt || !r.ttlMs) return
        const remain = (r.issuedAt + r.ttlMs) - Date.now()
        if (remain <= 0) {
          const tok = r.continuationToken
          const ids = (r.attachments || []).map(a => a.serverId).filter(Boolean)
          // Best-effort server-side discard; if unreachable client clears anyway.
          if (tok && onSend) {
            Promise.resolve().then(async () => {
              try {
                await onSend({ clientMessageId: genUUID(), text: '', attachmentIds: ids, continuationToken: tok, continuationDiscard: true })
              } catch {}
            }).catch(() => {})
          }
          clearRetainedClientOnly()
          setSendErrorBanner(form, '附件上下文已过期，请重新上传。')
          rerenderRetained(form, draft, latestTrayRenderOpts)
          rerenderTray(form, draft)
          return
        }
        // Update visible TTL if node present
        const ttlNode = form.querySelector('[data-retained-ttl]')
        if (ttlNode) {
          const remainSec = Math.round(remain / 1000)
          const mins = Math.floor(remainSec / 60)
          const secs = remainSec % 60
          ttlNode.textContent = '剩余 ' + (mins > 0 ? `${mins}分${String(secs).padStart(2, '0')}秒` : `${secs}秒`)
        }
      }
      tick()
      retainedExpireTimer = setInterval(tick, 1000)
    }

    latestTrayRenderOpts = {
      onDiscardRetainedAll: discardRetainedAll,
      onDiscardRetainedIndex: discardRetainedIndex,
    }

    const form = el('form', {
      class: 'helix-composer-v2',
      id: cid,
      'data-composer-id': String(COMPOSER_ID_COUNTER.v),
      'aria-label': '给 Helix 的消息（支持文本、附件、图片、语音）',
      autocomplete: 'off',
    })
    form.dataset.draftKey = draftKey(ctx)

    if (!document[ESC_LISTENER_SYM]) {
      document.addEventListener('keydown', escapeGlobalHandler, true)
      document[ESC_LISTENER_SYM] = true
    }

    // ---- duplicate handler guard: only attach top-level (doc-level) listeners once.
    // Form handlers below are per-element so fire exactly once per form.
    if (form[HANDLERS_SYM]) {
      // Reuse case: transplant node; bail out.
      return form
    }

    // Load server config for honest capability rendering + uploads ASAP
    Attachments.loadServerConfig?.().catch(() => {})

    const tray = Attachments.renderTray(draft.attachments, attachCtxFromDraft(draft, form))
    form.appendChild(tray)
    const initialRetained = renderRetained(draft, form, latestTrayRenderOpts)
    form.insertBefore(initialRetained, tray)
    if (draft.retained && draft.retained.ttlMs && draft.retained.issuedAt) startRetainedExpireTimer()

    async function ensureAttachmentsUploaded() {
      if (!draft.attachments || !draft.attachments.length) return true
      const clientMsgId = pendingClientMessageId || (pendingClientMessageId = genUUID())
      for (const a of draft.attachments) {
        if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADED) {
          if (a.serverId && !a._metaPollStartedAt) {
            a.transcriptionConfigured = Attachments.isTranscriptionConfigured()
            try {
              const initMeta = await Attachments.fetchAttachmentMeta(a)
              if (initMeta) Attachments.applyMetaToAttachment?.(a, initMeta)
            } catch {}
            if (!attachmentIsReady(a)) {
              Attachments.startMetaPolling?.(a, { onUpdate: () => rerenderTray(form, draft) })
            }
          }
          continue
        }
        if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADING) {
          await new Promise((r) => {
            const tick = setInterval(() => {
              if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADED || a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOAD_FAILED || a.uploadStatus === Attachments.UPLOAD_STATUS.CANCELLED) {
                clearInterval(tick); r()
              }
            }, 60)
          })
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADED && a.serverId) {
            a.transcriptionConfigured = Attachments.isTranscriptionConfigured()
            try {
              const initMeta = await Attachments.fetchAttachmentMeta(a)
              if (initMeta) Attachments.applyMetaToAttachment?.(a, initMeta)
            } catch {}
            if (!attachmentIsReady(a)) {
              Attachments.startMetaPolling?.(a, { onUpdate: () => rerenderTray(form, draft) })
            }
          }
        } else {
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.CANCELLED) continue
          try {
            await Attachments.uploadAttachment(a, {
              clientMessageId: clientMsgId,
              onProgress: () => rerenderTray(form, draft),
            })
          } catch (e) {
            // error already set on att
          } finally {
            rerenderTray(form, draft)
          }
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADED && a.serverId) {
            a.transcriptionConfigured = Attachments.isTranscriptionConfigured()
            try {
              const initMeta = await Attachments.fetchAttachmentMeta(a)
              if (initMeta) Attachments.applyMetaToAttachment?.(a, initMeta)
            } catch {}
            if (!attachmentIsReady(a)) {
              Attachments.startMetaPolling?.(a, { onUpdate: () => rerenderTray(form, draft) })
            }
          }
        }
      }
      return draft.attachments.every(attachmentIsReady)
    }

    const taWrap = el('div', { class: 'composer-ta-wrap' })
    const ta = el('textarea', {
      class: 'composer-ta',
      rows: 6,
      placeholder: '跟 Helix 说说要做什么，或拖入/粘贴文件、图片、语音…',
      'aria-label': '给 Helix 的消息文本',
      spellcheck: true,
    })
    ta.value = draft.text || ''
    ta.addEventListener('input', () => {
      draft.text = ta.value
      autoGrowTa(ta)
    })
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        form.requestSubmit()
      }
    })
    ta.addEventListener('paste', async (e) => {
      if (!e.clipboardData) return
      const items = e.clipboardData.files
      if (!items || !items.length) return
      e.preventDefault()
      queueAttachmentsFromFileList(items, draft)
      rerenderTray(form, draft)
    })
    taWrap.appendChild(ta)
    form.appendChild(taWrap)

    const toolbar = el('div', { class: 'composer-toolbar' })
    const tleft = el('div', { class: 'toolbar-left' })
    const tright = el('div', { class: 'toolbar-right' })

    const fileInput = el('input', { type: 'file', multiple: true, hidden: true, 'aria-hidden': 'true' })
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        queueAttachmentsFromFileList(fileInput.files, draft)
        rerenderTray(form, draft)
      }
      fileInput.value = ''
    })
    tleft.appendChild(fileInput)

    const attachBtn = el('button', { type: 'button', class: 'tool-btn', title: '添加附件', 'aria-label': '添加附件', onClick: () => fileInput.click() }, '📎')
    tleft.appendChild(attachBtn)

    const recBtn = el('button', { type: 'button', class: 'tool-btn', title: '语音输入（录音）', 'aria-label': '语音输入（录音）' })
    const recTimer = el('span', { class: 'rec-timer', hidden: true, 'aria-hidden': 'true' }, '00:00')
    let recTick = null
    recBtn.textContent = '🎙️'
    let recorderHandle = null

    function updateMicHonestState() {
      const configured = Attachments.isTranscriptionConfigured()
      if (configured) recBtn.title = '语音输入（录音）'
      else recBtn.title = '录音（当前未配置语音转写，会显示「尚未配置语音转写」）'
    }
    updateMicHonestState()

    function stopTick() { if (recTick) { clearInterval(recTick); recTick = null } }
    async function onStopRec() {
      stopTick()
      recBtn.classList.remove('recording')
      recTimer.hidden = true
      recBtn.textContent = '🎙️'
      if (!recorderHandle) return
      const blob = await recorderHandle.stop()
      recorderHandle = null
      if (blob && blob.size) {
        const att = Attachments.createAttachmentFromRecording(blob, 'recording-' + Date.now() + '.webm')
        att.transcriptionConfigured = Attachments.isTranscriptionConfigured()
        draft.attachments.push(att)
        rerenderTray(form, draft)
      }
    }
    function onCancelRec() {
      stopTick()
      recBtn.classList.remove('recording')
      recTimer.hidden = true
      recBtn.textContent = '🎙️'
      if (recorderHandle) recorderHandle.cancel()
      recorderHandle = null
    }
    recBtn.addEventListener('click', async () => {
      if (recorderHandle) { await onStopRec(); return }
      const handle = await Attachments.startRecording({
        onError: (m) => { const c = attachCtxFromDraft(draft, form); c.onError?.(m) },
      })
      if (!handle) return
      recorderHandle = handle
      recBtn.classList.add('recording')
      recBtn.title = '结束录音'
      recBtn.textContent = '⏹'
      recTimer.hidden = false
      recTimer.textContent = '00:00'
      const t0 = Date.now()
      recTick = setInterval(() => {
        const s = Math.floor((Date.now() - t0) / 1000)
        recTimer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
        if (s >= 600) { onStopRec() }
      }, 250)
    })
    tleft.appendChild(recBtn)
    tleft.appendChild(recTimer)

    toolbar.appendChild(tleft)

    const expandBtn = el('button', { type: 'button', class: 'expand-btn', title: '展开编辑器 (Esc 关闭)', 'aria-label': '展开编辑器', onClick: () => {
      if (form.classList.contains('expanded')) closeExpanded(form)
      else openExpanded(form)
    }}, '⤢')
    tright.appendChild(expandBtn)

    const imeProtect = el('div', { class: 'ime-protect', id: 'ime-protect-' + COMPOSER_ID_COUNTER.v, 'aria-hidden': 'true' })
    tright.appendChild(imeProtect)

    const sendBtn = el('button', { type: 'submit', class: 'send-btn', 'aria-label': '发送' }, '发送')
    tright.appendChild(sendBtn)

    toolbar.appendChild(tright)
    form.appendChild(toolbar)

    function setSendErrorBanner(form, msg) {
      let node = form.querySelector('.send-error-banner')
      if (!msg) { node && node.remove(); return }
      if (!node) {
        node = el('div', { class: 'send-error-banner', role: 'alert', style: 'padding:4px 8px;margin:0 6px 4px;border:1px solid #dc3545;border-radius:6px;background:#fff5f5;color:#b02a37;font-size:11.5px;' })
        form.insertBefore(node, tray)
      }
      node.textContent = msg
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (sendingInFlight) return
      if (recorderHandle) { onStopRec(); return }
      draft.text = ta.value
      if (isComposerEmpty(draft)) return

      const currentDraftKey = form.dataset.draftKey
      if (currentDraftKey && scopeKey && currentDraftKey !== scopeKey) {
        const ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
          ? window.confirm('草稿所属工作区与当前不一致。确定要将该草稿发送到当前的项目吗？')
          : true
        if (!ok) return
      }

      sendingInFlight = true
      sendBtn.disabled = true
      setSendErrorBanner(form, '')

      const clientMessageId = pendingClientMessageId || (pendingClientMessageId = genUUID())
      try {
        await ensureAttachmentsUploaded()
      } catch {
        // individual attachment errors are already stored on each card; fall through to readiness check.
      }
      const allReady = draft.attachments.length === 0 || draft.attachments.every(attachmentIsReady)
      if (!allReady) {
        const unready = draft.attachments.filter((a) => !attachmentIsReady(a)).map((a) => {
          const s = a.processingStatus
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOADING) return `${a.sanitizedName || a.name}（上传中）`
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.UPLOAD_FAILED) return `${a.sanitizedName || a.name}（上传失败，请点重试或移除）`
          if (a.uploadStatus === Attachments.UPLOAD_STATUS.CANCELLED) return `${a.sanitizedName || a.name}（已取消，请移除后再发送）`
          if (s === Attachments.PROCESSING_STATUS.EXTRACTING) return `${a.sanitizedName || a.name}（解析中，请稍候）`
          if (s === Attachments.PROCESSING_STATUS.EXTRACT_FAILED) return `${a.sanitizedName || a.name}（解析失败，请移除后再发送）`
          if (a.uploadStatus !== Attachments.UPLOAD_STATUS.UPLOADED) return `${a.sanitizedName || a.name}（尚未上传）`
          return a.sanitizedName || a.name
        })
        setSendErrorBanner(form, '以下附件尚未就绪，请重试或移除后再发送：' + unready.join('；'))
        sendingInFlight = false
        sendBtn.disabled = false
        return
      }

      const saved = {
        value: ta.value,
        start: typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length,
        end: typeof ta.selectionEnd === 'number' ? ta.selectionEnd : ta.value.length,
        attachments: draft.attachments.slice(),
        text: draft.text,
        retainedBefore: draft.retained ? { ...draft.retained, attachments: draft.retained.attachments ? draft.retained.attachments.slice() : null } : null,
      }
      const payload = buildOutgoingPayload(draft, { clientMessageId })
      // Save the set of attachment ids sent this envelope (for rebind & noIntent branch).
      // Combine retained + fresh from payload.
      const sentAttachmentIds = Array.isArray(payload.attachmentIds) ? payload.attachmentIds.slice() : []
      try {
        const res = await (onSend && onSend(payload))
        if (res && typeof res === 'object' && res.ok === false) {
          const code = res.code || ''
          const msg = res.error || '发送失败，请稍后再试。'
          if (code === 'IDEMPOTENT_CONFLICT') {
            const hasRebind = typeof res.rebindToken === 'string' && Array.isArray(res.rebindAttachmentIds) && res.rebindAttachmentIds.length > 0
            const newId = genUUID()
            let needReuploadFor = []
            let rebindSucceeded = false
            let bannerMsg = '当前消息标识与已有请求冲突，已生成新的消息标识。\n内容已保留，请再次发送。'
            if (hasRebind) {
              const rebindPayload = {
                rebindToken: res.rebindToken,
                newClientMessageId: newId,
              }
              let rebindRes = { ok: false, reuploadRequired: true, error: 'no rebind callback' }
              if (typeof options.onRebindAttachments === 'function') {
                try {
                  rebindRes = await options.onRebindAttachments(rebindPayload)
                } catch (e) {
                  rebindRes = { ok: false, error: e && e.message ? e.message : String(e), reuploadRequired: true }
                }
              }
              if (rebindRes && rebindRes.ok === true) {
                rebindSucceeded = true
                bannerMsg = '消息标识冲突已修复，附件已重新绑定。\n内容已保留，请再次发送。'
              } else {
                // Need reupload: clear server ids for the rebind affected ids.
                const affected = new Set(res.rebindAttachmentIds || [])
                needReuploadFor = []
                // Clear serverId on draft attachments if id matched.
                for (const a of draft.attachments) {
                  if (a.serverId && affected.has(a.serverId)) {
                    needReuploadFor.push(a.sanitizedName || a.name || '附件')
                    a.serverId = null
                    a.uploadStatus = Attachments.UPLOAD_STATUS.IDLE
                    a.uploadProgress = 0
                  }
                }
                bannerMsg = (rebindRes && rebindRes.reuploadRequired)
                  ? ('部分附件需要重新上传后再发送：' + needReuploadFor.join('、') + '。内容已保留，请修复后重试。')
                  : ('消息标识冲突，附件重绑定失败：' + (rebindRes && rebindRes.error ? rebindRes.error : '未知错误') + '。内容已保留，请重试或手动移除并重新上传受影响的附件。')
              }
            }
            pendingClientMessageId = newId
            setSendErrorBanner(form, bannerMsg)
            throw new Error('IDEMPOTENT_CONFLICT_ROTATED')
          }
          throw new Error(msg)
        }
        // success or noIntent success path
        if (res && typeof res === 'object' && res.noIntent === true) {
          // no intent: store retained context, do NOT clear attachment ids yet.
          pendingClientMessageId = null
          setSendErrorBanner(form, '')
          for (const a of draft.attachments || []) { try { Attachments.stopMetaPolling?.(a) } catch {} }
          const contTok = typeof res.continuationToken === 'string' ? res.continuationToken : ''
          const ttl = typeof res.continuationTtlMs === 'number' ? res.continuationTtlMs : 0
          const retainedIds = Array.isArray(res.retainedAttachmentIds) ? res.retainedAttachmentIds : sentAttachmentIds
          const retainedSet = new Set(retainedIds)
          const retainedCards = []
          // Move from draft.attachments → retainedCards: if their serverId is within retained set
          const leftover = []
          for (const a of draft.attachments || []) {
            if (a.serverId && retainedSet.has(a.serverId)) {
              retainedCards.push({
                serverId: a.serverId,
                name: a.name || '',
                sanitizedName: a.sanitizedName || a.name || '',
                kind: a.kind,
                size: a.size,
                processingStatus: a.processingStatus,
                uploadStatus: a.uploadStatus,
                error: a.error || null,
                extract: a.extract || null,
                objectUrl: null, // Don't keep blob URLs, no re-upload needed
                localFile: null, // Don't keep File blobs
                thumb: (a.thumb && typeof a.thumb === 'string') ? a.thumb : null,
              })
            } else {
              leftover.push(a)
            }
          }
          // Also any retainedCards from previous retained attachments that were in draft
          if (saved.retainedBefore && Array.isArray(saved.retainedBefore.attachments)) {
            for (const a of saved.retainedBefore.attachments) {
              if (a && a.serverId && retainedSet.has(a.serverId)) {
                if (!retainedCards.some((x) => x.serverId === a.serverId)) retainedCards.push({ ...a })
              }
            }
          }
          // Clear draft text
          draft.text = ''
          ta.value = ''
          // Keep only non-retained leftovers in draft.attachments (typically empty).
          draft.attachments = leftover
          if (contTok && retainedCards.length > 0) {
            draft.retained = {
              continuationToken: contTok,
              ttlMs: ttl,
              issuedAt: Date.now(),
              attachments: retainedCards,
            }
          } else {
            draft.retained = null
            stopRetainedExpireTimer()
          }
          autoGrowTa(ta)
          rerenderRetained(form, draft, latestTrayRenderOpts)
          rerenderTray(form, draft)
          if (draft.retained && draft.retained.ttlMs) startRetainedExpireTimer()
          try { ta.focus() } catch {}
          try { ta.setSelectionRange(0, 0) } catch {}
        } else {
          // Normal success: commit clear, new UUID next send, clear retained context.
          pendingClientMessageId = null
          stopRetainedExpireTimer()
          for (const a of draft.attachments || []) { try { Attachments.stopMetaPolling?.(a) } catch {} }
          draft.retained = null
          draft.text = ''
          draft.attachments = []
          ta.value = ''
          autoGrowTa(ta)
          rerenderRetained(form, draft, latestTrayRenderOpts)
          rerenderTray(form, draft)
          try { ta.focus() } catch {}
          try { ta.setSelectionRange(0, 0) } catch {}
          setSendErrorBanner(form, '')
        }
      } catch (e) {
        if (e && e.message === 'IDEMPOTENT_CONFLICT_ROTATED') {
          // Banner already set; fall through with state preserved.
          draft.attachments = saved.attachments
          draft.text = saved.text
          if (saved.retainedBefore !== undefined) draft.retained = saved.retainedBefore
          ta.value = saved.value
          autoGrowTa(ta)
          rerenderRetained(form, draft, latestTrayRenderOpts)
          rerenderTray(form, draft)
          try { ta.focus() } catch {}
          try {
            const max = ta.value.length
            const s = Math.min(saved.start, max)
            const en = Math.min(saved.end, max)
            ta.setSelectionRange(s, en)
          } catch {}
        } else {
          // restore the draft to its pre-send snapshot so the user can retry the same clientMessageId.
          draft.attachments = saved.attachments
          draft.text = saved.text
          if (saved.retainedBefore !== undefined) draft.retained = saved.retainedBefore
          ta.value = saved.value
          autoGrowTa(ta)
          rerenderRetained(form, draft, latestTrayRenderOpts)
          rerenderTray(form, draft)
          try { ta.focus() } catch {}
          try {
            const max = ta.value.length
            const s = Math.min(saved.start, max)
            const en = Math.min(saved.end, max)
            ta.setSelectionRange(s, en)
          } catch {}
          setSendErrorBanner(form, '发送失败：' + (e && e.message ? e.message : '未知错误。') + ' 内容已保留，可重试或修改后再发。')
        }
      } finally {
        sendingInFlight = false
        sendBtn.disabled = false
      }
    })

    form.addEventListener('dragover', (e) => {
      e.preventDefault()
      form.classList.add('drop-active')
    })
    form.addEventListener('dragleave', (e) => {
      if (e.target === form) form.classList.remove('drop-active')
    })
    form.addEventListener('drop', (e) => {
      e.preventDefault()
      form.classList.remove('drop-active')
      if (!e.dataTransfer) return
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        queueAttachmentsFromFileList(e.dataTransfer.files, draft)
        rerenderTray(form, draft)
      } else if (e.dataTransfer.items) {
        const files = []
        for (const it of e.dataTransfer.items) {
          if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f) }
        }
        if (files.length) {
          queueAttachmentsFromFileList({ length: files.length, ...files, [Symbol.iterator]() { return files[Symbol.iterator]() } }, draft)
          rerenderTray(form, draft)
        }
      }
    })

    queueMicrotask(() => autoGrowTa(ta))

    form[HANDLERS_SYM] = { onSend, draftKey: draftKey(ctx) }

    return form
  }

  function getOrCreateComposer(existingNode, options) {
    if (existingNode && existingNode.classList && existingNode.classList.contains('helix-composer-v2')) return existingNode
    return renderComposer(options)
  }

  const api = Object.freeze({
    DRAFTS,
    draftKey,
    getDraft,
    setDraft,
    renderComposer,
    getOrCreateComposer,
    buildOutgoingPayload,
    isComposerEmpty,
    closeExpanded,
    openExpanded,
    autoGrowTa,
    injectComposerCss,
    queueAttachmentsFromFileList,
  })

  globalThis.VAOCoreComposer = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectComposerCss)
    else injectComposerCss()
  }
})()
