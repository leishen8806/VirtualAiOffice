/* VISUAL V2: Shell Layout + Inspectors + Demo Mode + Event Animations.
 *
 * Layout regions (§4 UI_PROTOTYPE_CONTRACT_V2 V2 layout, NEW spec for visual-v2):
 *   LEFT NAV   — #v2-left-rail    expanded ~168px · collapsed 56px. Nav items: Office/Tasks/Team/Activity/Approvals/Files.
 *   CENTER     — #v2-office-stage 65-75% of width. Renders 6-zone 2.5D office via VAOCoreOfficeV2.attach().
 *   HELIX RAIL — #v2-helix-rail   collapsed default 64-72px. Expands to 360-420px with conversation / orchestration summary /
 *                                 critical activity / waiting human / recent events / multimodal mount point (empty slot — NOT PR#10).
 *   TOP BAR    — #v2-top-bar      brand · DEMO toggle (top-right) · runtime status · theme switcher (Core + optgroup 经典主题).
 *
 * Theme switching MUST remain functional:
 *   When theme id = core → render this V2 shell.
 *   When classic id (sakura/night/neon/neko/pixel) → destroy V2 shell + restore classic .app scaffold (so app.js legacy renderers mount).
 *
 * Inspectors (right-side overlay drawers, or bottom sheet on mobile):
 *   Role Inspector  — triggered by vao-v2:role-clicked OR vao-v2:workstation-clicked. Fields:
 *     Role / Member / Human·AI / state / current task / recent / model / tools / evidence / blocked reason / waiting info.
 *   Task Inspector  — triggered by vao-v2:task-clicked. Fields:
 *     id / title / owner / state / deps / execution / review / evidence / waiting / recent / timestamps.
 *
 * Event animations (visual only, NEVER fake live runtime events in DEMO):
 *   TASK_DISPATCH  → Helix subtle pulse → target workstation pulse → WORKING/THINKING state visual apply.
 *   REVIEW         → Reviewer/QA diff screens prominent (highlight added).
 *   WAITING_HUMAN  → Human Area appears amber + pulse line Helix↔Human.
 *   BLOCKED        → Target workstation warning marker.
 *   DONE           → Brief ack animation → delayed IDLE.
 *   MEETING        → Selected roles rotate orient to Planning meeting area.
 *
 * Responsive:
 *   ≥1440:  full 3-column · stage 70%.
 *   ≥1280:  coherent slightly tighter.
 *   ≥1024:  nav collapsed default · inspectors are overlay drawers · Helix drawer overlays.
 *   ≤1024:  nav collapsed · Helix overlay drawer · stage 100% width min-width scroll.
 *   Mobile: role scene slices (vertical list), simplified roster, bottom nav (Office/Tasks/Helix/Approvals), inspectors as bottom sheets.
 */
;(function () {
  'use strict'

  const Theme = globalThis.VAOCoreTheme
  const Chars = globalThis.VAOCoreCharactersV2
  const S = globalThis.VAOCoreStates
  const Office = globalThis.VAOCoreOfficeV2

  const CLASSIC_SKIN_ORDER = Object.freeze([
    ['sakura', '樱花 · Sakura'],
    ['night', '夜班 · Night'],
    ['neon', '赛博霓虹 · Cyber Neon'],
    ['neko', '猫耳咖啡 · Neko Cafe'],
    ['pixel', '像素复古 · Pixel Retro'],
  ])
  const CLASSIC_IDS = CLASSIC_SKIN_ORDER.map(([id]) => id)

  const ROLE_IDS_8 = Object.freeze(['helix','product','architect','frontend','backend','qa','reviewer','docs'])

  const NAV_ITEMS = Object.freeze([
    { id: 'office',    zh: '办公室', en: 'Office',     glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 13 L2 7 L8 3 L14 7 L14 13"/><path d="M6 13 V9 H10 V13"/></svg>` },
    { id: 'tasks',     zh: '任务',   en: 'Tasks',      glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M6 6.5 H11 M6 9.5 H11"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/></svg>` },
    { id: 'team',      zh: '团队',   en: 'Team',       glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="5.5" cy="6" r="2"/><circle cx="11" cy="6.6" r="1.6"/><path d="M2 13.5 C2.5 10.8 4.2 9.6 5.5 9.6 C6.8 9.6 8.5 10.8 9 13.5"/><path d="M8.8 13.7 c.3-1.9 1.4-3.1 2.6-3.1 c1.2 0 2.6 1.1 2.6 3.1"/></svg>` },
    { id: 'activity',  zh: '活动',   en: 'Activity',   glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 8 H5.2 L6.5 4.5 L9.5 11.5 L10.8 8 H14.5"/></svg>` },
    { id: 'approvals', zh: '审批',   en: 'Approvals',  glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3 H10 L13 6 V13 H3 Z"/><path d="M10 3 V6 H13"/><path d="M5.5 9.5 L7.5 11.5 L11.5 7.5"/></svg>` },
    { id: 'files',     zh: '文件',   en: 'Files',      glyph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 2.5 H9 L11 4.5 V13.5 H2.5 Z"/></svg>` },
  ])

  const DEMO_STATE_BUTTONS = Object.freeze([
    { id: 'IDLE',          zh: '空闲',     cls: 'idle' },
    { id: 'WORKING',       zh: '工作',     cls: 'working' },
    { id: 'THINKING',      zh: '思考',     cls: 'thinking' },
    { id: 'REVIEWING',     zh: '评审',     cls: 'reviewing' },
    { id: 'WAITING_HUMAN', zh: '等待人类', cls: 'waiting-human' },
    { id: 'BLOCKED',       zh: '阻塞',     cls: 'blocked' },
    { id: 'DONE',          zh: '完成',     cls: 'done' },
    { id: 'MEETING',       zh: '会议',     cls: 'meeting' },
  ])

  const STORAGE_KEYS = Object.freeze({
    navCollapsed: 'v2.nav.collapsed',
    helixExpanded: 'v2.helix.expanded',
  })

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }
  function el(tag, attrs = {}, html = '') {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v)
      else if (k.startsWith('on') && typeof v === 'function') {
        if (typeof n.addEventListener === 'function') n.addEventListener(k.slice(2).toLowerCase(), v)
      }
      else if (v === true) n.setAttribute(k, '')
      else if (v !== false && v != null) n.setAttribute(k, String(v))
    }
    if (html != null && html !== '') n.innerHTML = html
    return n
  }
  function modeOf(opts = {}) {
    const raw = String(opts.mode || 'live').toLowerCase()
    return raw === 'fake' || raw === 'demo' ? 'demo' : 'live'
  }
  function storeGet(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v) } catch(_) { return fallback } }
  function storeSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch(_) {} }
  function ago(ts) {
    if (!ts) return ''
    const d = Date.now() - ts
    if (d < 60000) return '刚刚'
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前'
    return Math.floor(d / 3600000) + ' 时前'
  }
  function stateBadge(state) {
    const St = S?.STATES?.[state] || { key: 'idle', zh: state || '未知' }
    return `<span class="v2-state-pill v2sp-${St.key}">${S?.stateGlyphSvg(state, 12) || ''}<span>${St.zh}</span></span>`
  }
  function kindBadge(kind) {
    if (!S) return ''
    if (kind === 'system') return S.BADGE.system({ size: 18 })
    if (kind === 'human') return S.BADGE.human({ size: 18 })
    return S.BADGE.ai({ size: 18 })
  }

  // === Default demo fixtures (only used when mode=demo; NEVER for live) ===
  function demoRuntime() {
    return Object.freeze({
      workspace: { id: 'ws-demo', name: '智序工场 · 演示工作区', path: 'E:\\VirtualAIOffice\\demo' },
      project:   { id: 'p-v2',    name: 'Interactive Office V2（演示）' },
      runtimeStatus: 'demo',
      members: {
        human: [
          { id: 'hu-1', name: '李产品', role: 'product',  online: true  },
          { id: 'hu-2', name: '王测试', role: 'qa',       online: true  },
          { id: 'hu-3', name: '张审查', role: 'reviewer', online: false },
        ],
        ai: [
          { id: 'ai-1', name: 'Codex Demo',    role: 'architect', model: 'demo-model', online: true  },
          { id: 'ai-2', name: 'Claude Demo',   role: 'frontend',  model: 'demo-model', online: true  },
          { id: 'ai-3', name: 'DeepSeek Demo', role: 'backend',   model: 'demo-model', online: true  },
          { id: 'ai-4', name: 'Gemini Demo',   role: 'docs',      model: 'demo-model', online: false },
        ],
      },
      seatStates:   Office?.DEMO_SEAT_STATE   || {},
      seatKinds:    Office?.DEMO_SEAT_KIND    || {},
      seatMembers:  Office?.DEMO_SEAT_MEMBER  || {},
      seatModels:   Office?.DEMO_SEAT_MODEL   || {},
      waitingHuman: [
        { id: 'w-1', role: 'product', member: '李产品', title: '【DEMO】确认 §5.1 颜色 token 规格对比表', sinceMs: Date.now() - 14 * 60 * 1000, required: true },
      ],
      tasks: JSON.parse(JSON.stringify(Office?.DEMO_TASKS || [])),
    })
  }
  function demoHelix() {
    return Object.freeze({
      state: 'THINKING',
      header: { label: 'HELIX', zh: '系统编排中枢（演示）', en: 'System Orchestrator · DEMO' },
      counts: { running: 3, reviewing: 2, waiting: 1, blocked: 0, unread: 5 },
      conversation: [
        { who: 'Helix', side: 'helix', text: '【DEMO】载入 Interactive Office V2 基线 fixture，等待命令。' },
        { who: '你',     side: 'user',  text: '【DEMO】把 V2 壳子挂起来，经典主题切换要能用。' },
        { who: 'Helix', side: 'helix', text: '【DEMO】登记完成：主题选择器包含 optgroup「经典主题」5 个皮肤。' },
      ],
      summary: '【DEMO】6 区空间布局 + 8 角色共享骨架 + 状态机：视觉层已就绪（仅演示）。',
      decisions: [
        '左导航：展开 168 / 收起 56',
        'Helix 右侧：收起 64-72 / 展开 360-420',
        'WAITING_HUMAN → Human Area 琥珀激活',
      ],
      waiting: [{ id: 'w-1', role: 'product', member: '李产品', title: '【DEMO】确认颜色规格', sinceMs: Date.now() - 14 * 60 * 1000, required: true }],
      recent: [
        { at: Date.now() - 20 * 60000, text: '【DEMO】Helix Hub 4 屏接入' },
        { at: Date.now() - 10 * 60000, text: '【DEMO】Human Area 激活' },
        { at: Date.now() - 3  * 60000, text: '【DEMO】主题切换走查' },
      ],
    })
  }
  function emptyRuntime() {
    return {
      workspace: { id: '', name: '当前工作区', path: '' },
      project:   { id: '', name: '未指定项目' },
      runtimeStatus: 'connecting',
      members: { human: [], ai: [] },
      seatStates: {}, seatKinds: {}, seatMembers: {}, seatModels: {},
      waitingHuman: [], tasks: [],
    }
  }
  function emptyHelix() {
    return {
      state: 'IDLE',
      header: { label: 'HELIX', zh: '系统编排中枢', en: 'System Orchestrator' },
      counts: { running: 0, reviewing: 0, waiting: 0, blocked: 0, unread: 0 },
      conversation: [], summary: '暂无摘要。跟 Helix 说点什么开始。',
      decisions: [], waiting: [], recent: [],
    }
  }

  // ======================= CSS =======================
  const CSS_ID = 'v2-shell-css'
  function injectCss() {
    if (document.getElementById(CSS_ID)) return
    const c = document.createElement('style')
    c.id = CSS_ID
    c.textContent = `
html[data-theme-core]{margin:0;}
html[data-theme-core] body{margin:0;}
html[data-theme-core] body.v2-shell-body{margin:0;padding:0;min-height:100vh;background:var(--bg);color:var(--text);font-family:var(--sansZh),var(--sans);-webkit-font-smoothing:antialiased;display:grid;grid-template-rows:48px 1fr;grid-template-columns:var(--v2-nav-w,168px) 1fr var(--v2-helix-w,64px);grid-template-areas:"top top top" "nav stage helix";gap:0;overflow:hidden;max-width:100vw;width:100vw;box-sizing:border-box;}
html[data-theme-core] body.v2-shell-body .v2-stage-wrap{grid-area:stage;overflow:auto;max-width:100%;width:100%;box-sizing:border-box;}
html[data-theme-core] body.v2-shell-body .v2-stage-wrap > svg{display:block;min-width:720px;height:auto;max-width:none;}
html[data-theme-core] body.v2-shell-body #v2-office-stage > *{box-sizing:border-box;}
@media (max-width: 1024px) {
  html[data-theme-core] body.v2-shell-body{grid-template-columns:0 1fr 0;}
  html[data-theme-core] body.v2-shell-body .v2-stage-wrap > svg{min-width:720px;}
}
html[data-theme-core] .v2-top-bar{grid-area:top;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:50;max-width:100vw;overflow-x:hidden;}
html[data-theme-core] .v2-top-right{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0;flex-shrink:1;max-width:62vw;}
html[data-theme-core] .v2-top-right > *{flex-shrink:1;min-width:0;max-width:100%;}
@media (max-width: 640px){
  html[data-theme-core] .v2-top-right .v2-conn-pill, html[data-theme-core] .v2-top-right .v2-workdir, html[data-theme-core] .v2-top-right label{display:none;}
  html[data-theme-core] .v2-top-right{max-width:46vw;}
}
html[data-theme-core] .v2-nav-rail{grid-area:nav;border-right:1px solid var(--line);background:var(--panel-2);padding:8px 6px;overflow:hidden;display:flex;flex-direction:column;gap:6px;transition:width var(--dur-base) var(--ease);width:var(--v2-nav-w,168px);}
html[data-theme-core] body.v2-shell-body.v2-nav-collapsed{--v2-nav-w:56px;}
html[data-theme-core] .v2-stage-wrap{grid-area:stage;overflow:auto;min-height:0;background:var(--canvas-floor);position:relative;}
html[data-theme-core] .v2-helix-rail{grid-area:helix;border-left:1px solid var(--line);background:var(--panel);overflow:hidden;display:flex;flex-direction:column;transition:width var(--dur-base) var(--ease);width:var(--v2-helix-w,64px);}
html[data-theme-core] body.v2-shell-body.v2-helix-open{--v2-helix-w:min(420px,38vw);}
@media (max-width: 1440px){ html[data-theme-core] body.v2-shell-body{--v2-nav-w:160px;} }
@media (max-width: 1280px){ html[data-theme-core] body.v2-shell-body{--v2-nav-w:56px;} html[data-theme-core] body.v2-shell-body:not(.v2-nav-collapsed){--v2-nav-w:168px;} }
@media (max-width: 1024px){
  html[data-theme-core] body.v2-shell-body{grid-template-columns:0 1fr 0;grid-template-areas:"top top top" "stage stage stage";}
  html[data-theme-core] .v2-nav-rail{display:flex;position:fixed;top:48px;left:0;bottom:0;z-index:90;width:min(86vw,320px);height:auto;transform:translateX(-100%);transition:transform var(--dur-base) var(--ease);box-shadow:4px 0 22px rgba(0,0,0,.35);border-right:1px solid var(--line);background:var(--panel-2);}
  html[data-theme-core] body.v2-shell-body.v2-nav-open .v2-nav-rail{transform:translateX(0);}
  html[data-theme-core] .v2-helix-rail{display:flex;position:fixed;top:48px;right:0;bottom:0;z-index:90;width:min(420px,94vw);height:auto;transform:translateX(100%);transition:transform var(--dur-base) var(--ease);box-shadow:-4px 0 22px rgba(0,0,0,.35);border-left:1px solid var(--line);background:var(--panel);}
  html[data-theme-core] body.v2-shell-body.v2-helix-open .v2-helix-rail{transform:translateX(0);}
  html[data-theme-core] .v2-drawer-backdrop{display:none;position:fixed;inset:48px 0 0;background:rgba(10,16,32,.4);z-index:70;}
  html[data-theme-core] body.v2-shell-body.v2-nav-open .v2-drawer-backdrop,
  html[data-theme-core] body.v2-shell-body.v2-helix-open .v2-drawer-backdrop{display:block;}
}
@media (max-width: 640px){
  html[data-theme-core] body.v2-shell-body{grid-template-rows:56px 1fr 56px;padding-bottom:0;}
  html[data-theme-core] .v2-nav-rail{top:56px;bottom:56px;width:min(86vw,320px);}
  html[data-theme-core] .v2-helix-rail{top:56px;bottom:56px;width:min(420px,94vw);}
  html[data-theme-core] .v2-bottom-nav{display:grid !important;}
}
html[data-theme-core] .v2-brand{display:grid;grid-template-columns:32px 1fr;gap:0 8px;align-items:center;min-width:0;}
html[data-theme-core] .v2-brand-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,color-mix(in srgb,var(--orchestrator) 55%,var(--accent)),var(--orchestrator));display:grid;place-items:center;color:#fff;font-weight:900;font-size:13px;}
html[data-theme-core] .v2-brand-wordmark{font-size:14px;font-weight:700;line-height:18px;}
html[data-theme-core] .v2-brand-sub{font-size:10px;color:var(--text-muted);line-height:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
html[data-theme-core] .v2-nav-collapsed .v2-brand-wordmark,html[data-theme-core] .v2-nav-collapsed .v2-brand-sub,html[data-theme-core] .v2-nav-collapsed .v2-nav-item-title,html[data-theme-core] .v2-nav-collapsed .v2-nav-item-sub,html[data-theme-core] .v2-nav-collapsed .v2-sect-title,html[data-theme-core] .v2-nav-collapsed .v2-workspace-text{display:none !important;}
html[data-theme-core] .v2-sect{display:grid;gap:2px;padding:6px 2px;}
html[data-theme-core] .v2-sect-title{font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);padding:4px 6px 2px;}
html[data-theme-core] .v2-nav-item{display:grid;grid-template-columns:28px 1fr;gap:0 8px;align-items:center;padding:6px 6px;border-radius:9px;cursor:pointer;user-select:none;color:var(--text-muted);}
html[data-theme-core] .v2-nav-item:hover{background:var(--panel);color:var(--text);}
html[data-theme-core] .v2-nav-item.active{background:color-mix(in srgb,var(--orchestrator) 12%,var(--panel));color:var(--text);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--orchestrator) 35%,var(--line));}
html[data-theme-core] .v2-nav-item .glyph{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;}
html[data-theme-core] .v2-nav-item.active .glyph{color:var(--orchestrator);background:color-mix(in srgb,var(--orchestrator) 14%,transparent);}
html[data-theme-core] .v2-nav-item-title{font-size:13px;font-weight:600;line-height:16px;color:inherit;}
html[data-theme-core] .v2-nav-item-sub{font-size:10px;color:var(--text-muted);line-height:12px;}
html[data-theme-core] .v2-nav-collapsed .v2-nav-item{grid-template-columns:28px;padding:6px 2px;justify-content:center;}
html[data-theme-core] .v2-workspace{display:grid;grid-template-columns:28px 1fr auto;gap:6px;align-items:center;padding:6px;border-radius:10px;background:var(--panel);border:1px solid var(--line);}
html[data-theme-core] .v2-workspace-text .ws-name{font-size:12px;font-weight:700;line-height:15px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
html[data-theme-core] .v2-workspace-text .pr-name{font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
html[data-theme-core] .v2-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:var(--panel-2);font-size:11px;font-weight:600;}
html[data-theme-core] .v2-pill-live{color:var(--done);}
html[data-theme-core] .v2-pill-demo{color:var(--thinking);border-color:color-mix(in srgb,var(--thinking) 40%,var(--line));background:color-mix(in srgb,var(--thinking) 12%,transparent);}
html[data-theme-core] .v2-pill-connect{color:var(--text-muted);}
html[data-theme-core] .v2-demo-banner{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;border:1px solid var(--thinking);background:color-mix(in srgb,var(--thinking) 14%,transparent);color:var(--thinking);font-size:11px;font-weight:700;letter-spacing:.08em;}
html[data-theme-core] .v2-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;}
html[data-theme-core] .v2-icon-btn:hover{color:var(--text);border-color:var(--accent);}
html[data-theme-core] .v2-top-right{display:flex;align-items:center;gap:6px;margin-left:auto;}
html[data-theme-core] .v2-theme-select{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:7px;padding:3px 6px;font-size:11px;}
html[data-theme-core] .v2-demo-controls{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;padding:2px 6px;border-radius:10px;border:1px dashed color-mix(in srgb,var(--thinking) 50%,var(--line));background:color-mix(in srgb,var(--thinking) 8%,transparent);}
html[data-theme-core] .v2-demo-btn{padding:2px 7px;border-radius:7px;border:1px solid var(--line);background:var(--panel);font-size:10.5px;font-weight:700;cursor:pointer;}
html[data-theme-core] .v2-demo-btn:hover{border-color:var(--accent);}
html[data-theme-core] .v2-state-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);background:var(--panel-2);font-size:10.5px;font-weight:700;}
html[data-theme-core] .v2sp-idle{color:var(--idle);}
html[data-theme-core] .v2sp-thinking{color:var(--thinking);}
html[data-theme-core] .v2sp-working{color:var(--working);}
html[data-theme-core] .v2sp-reviewing{color:var(--reviewing);}
html[data-theme-core] .v2sp-waiting-human{color:var(--waiting-human);}
html[data-theme-core] .v2sp-blocked{color:var(--blocked);}
html[data-theme-core] .v2sp-done{color:var(--done);}
html[data-theme-core] .v2sp-offline{color:var(--offline);}
html[data-theme-core] .v2-spacer{flex:1 1 auto;}
html[data-theme-core] .v2-helix-collapsed{padding:10px 6px;display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;}
html[data-theme-core] .v2-helix-avatar{width:44px;height:44px;border-radius:14px;border:1.8px double var(--orchestrator);background:linear-gradient(180deg,transparent 30%,rgba(143,130,255,.14));display:grid;place-items:center;color:var(--orchestrator);cursor:pointer;}
html[data-theme-core] .v2-helix-metric{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--panel-2);display:grid;place-items:center;gap:1px;text-align:center;cursor:pointer;}
html[data-theme-core] .v2-helix-metric .n{font-size:13px;font-weight:800;line-height:1;}
html[data-theme-core] .v2-helix-metric .l{font-size:8px;opacity:.7;letter-spacing:.04em;}
html[data-theme-core] .v2-helix-expanded{display:flex;flex-direction:column;gap:10px;padding:12px;height:100%;overflow:auto;}
html[data-theme-core] .v2-h-block h4{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);}
html[data-theme-core] .v2-h-head{display:grid;grid-template-columns:36px 1fr auto;gap:8px;align-items:center;}
html[data-theme-core] .v2-h-head .sys{font-size:11px;color:var(--orchestrator);font-weight:800;letter-spacing:.16em;}
html[data-theme-core] .v2-h-head .zh{font-size:13px;font-weight:700;}
html[data-theme-core] .v2-h-head .en{font-size:10px;color:var(--text-muted);}
html[data-theme-core] .v2-h-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
html[data-theme-core] .v2-h-metrics .it{display:grid;gap:2px;padding:7px 6px;border-radius:9px;border:1px solid var(--line);background:var(--panel-2);}
html[data-theme-core] .v2-h-metrics .it .l{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;}
html[data-theme-core] .v2-h-metrics .it .n{font-size:15px;font-weight:800;line-height:1;}
html[data-theme-core] .v2-h-metrics .it.running{border-color:color-mix(in srgb,var(--working) 30%,var(--line));background:color-mix(in srgb,var(--working) 10%,transparent);color:var(--working);}
html[data-theme-core] .v2-h-metrics .it.review{border-color:color-mix(in srgb,var(--reviewing) 30%,var(--line));background:color-mix(in srgb,var(--reviewing) 10%,transparent);color:var(--reviewing);}
html[data-theme-core] .v2-h-metrics .it.wait{border-color:color-mix(in srgb,var(--waiting-human) 30%,var(--line));background:color-mix(in srgb,var(--waiting-human) 10%,transparent);color:var(--waiting-human);}
html[data-theme-core] .v2-h-metrics .it.block{border-color:color-mix(in srgb,var(--blocked) 30%,var(--line));background:color-mix(in srgb,var(--blocked) 10%,transparent);color:var(--blocked);}
html[data-theme-core] .v2-h-conv{display:flex;flex-direction:column;gap:6px;}
html[data-theme-core] .v2-h-msg{padding:6px 8px;border-radius:8px;font-size:11.5px;line-height:16px;}
html[data-theme-core] .v2-h-msg.hx{background:var(--panel-2);border:1px solid var(--line);}
html[data-theme-core] .v2-h-msg.u{background:color-mix(in srgb,var(--accent) 16%,var(--panel-2));border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));margin-left:18px;}
html[data-theme-core] .v2-h-composer{display:grid;grid-template-columns:1fr auto;gap:5px;}
html[data-theme-core] .v2-h-composer textarea{background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 8px;resize:vertical;font-size:11.5px;line-height:15px;font-family:inherit;}
html[data-theme-core] .v2-h-composer button{background:var(--orchestrator);color:#fff;border:0;border-radius:8px;padding:0 14px;font-weight:700;cursor:pointer;font-size:11.5px;}
html[data-theme-core] .v2-h-list{list-style:none;margin:0;padding:0;display:grid;gap:5px;}
html[data-theme-core] .v2-h-list li{font-size:11.5px;line-height:16px;padding:2px 0;}
html[data-theme-core] .v2-multimodal-mount{min-height:72px;border:1px dashed color-mix(in srgb,var(--orchestrator) 40%,var(--line));border-radius:10px;background:color-mix(in srgb,var(--orchestrator) 6%,transparent);display:grid;place-items:center;color:var(--text-muted);font-size:10.5px;padding:8px;text-align:center;}
html[data-theme-core] .v2-drawer{position:fixed;top:0;right:0;bottom:0;width:min(94vw,380px);background:var(--panel);border-left:1px solid var(--line);transform:translateX(105%);transition:transform var(--dur-base) var(--ease);z-index:100;padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto;box-shadow:-6px 0 30px rgba(0,0,0,.3);}
html[data-theme-core] .v2-drawer.open{transform:translateX(0);}
html[data-theme-core] .v2-drawer-head{display:flex;align-items:center;gap:8px;}
html[data-theme-core] .v2-drawer-title{font-size:14px;font-weight:800;}
html[data-theme-core] .v2-drawer-close{margin-left:auto;width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);cursor:pointer;display:grid;place-items:center;color:var(--text-muted);}
html[data-theme-core] .v2-section{padding:8px 8px;border:1px solid var(--line);background:var(--panel-2);border-radius:10px;}
html[data-theme-core] .v2-section h5{margin:0 0 6px;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted);}
html[data-theme-core] .v2-kv{display:grid;grid-template-columns:80px 1fr;gap:4px 8px;font-size:11.5px;}
html[data-theme-core] .v2-kv .k{color:var(--text-muted);}
html[data-theme-core] .v2-kv .v{color:var(--text);word-break:break-word;}
html[data-theme-core] .v2-timeline{display:flex;flex-direction:column;gap:4px;font-size:11px;}
html[data-theme-core] .v2-timeline .e{display:grid;grid-template-columns:54px 1fr;gap:6px;}
html[data-theme-core] .v2-timeline .t{color:var(--text-muted);font-family:var(--mono);font-size:10px;}
html[data-theme-core] .v2-bottom-nav{display:none;position:fixed;left:0;right:0;bottom:0;height:56px;background:var(--panel);border-top:1px solid var(--line);z-index:60;grid-template-columns:repeat(4,1fr);}
html[data-theme-core] .v2-bottom-nav .b{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:0;color:var(--text-muted);cursor:pointer;font-size:10px;font-weight:700;}
html[data-theme-core] .v2-bottom-nav .b.active{color:var(--orchestrator);}
html[data-theme-core] .v2-evidence{display:flex;flex-wrap:wrap;gap:4px;}
@media (max-width: 1024px){
  html[data-theme-core] .v2-drawer{width:min(94vw,420px);}
}
@media (max-width: 640px){
  html[data-theme-core] .v2-drawer{top:auto;height:min(86vh,640px);border-top:1px solid var(--line);border-radius:16px 16px 0 0;left:0;right:0;bottom:56px;width:auto;transform:translateY(110%);}
  html[data-theme-core] .v2-drawer.open{transform:translateY(0);}
}
@keyframes v2-role-focus { 0%{filter:drop-shadow(0 0 0 transparent)} 50%{filter:drop-shadow(0 0 6px var(--accent))} 100%{filter:drop-shadow(0 0 0 transparent)} }
.v2-focus-anim{animation:v2-role-focus 700ms ease-out;}
@keyframes v2-task-dispatch-pulse { 0%{stroke-width:1.2;opacity:0.4} 50%{stroke-width:3.4;opacity:1} 100%{stroke-width:1.2;opacity:0.4} }
.v2-dispatch-pulse{animation:v2-task-dispatch-pulse 700ms ease-out 1;}
@media (prefers-reduced-motion: reduce){
  .v2-focus-anim,.v2-dispatch-pulse{animation:none !important;}
}
`
    document.head.appendChild(c)
  }

  // ======================= Renderers =======================
  function renderThemeSwitcher(currentId, onChange) {
    const wrap = el('label', { style: 'display:inline-flex;align-items:center;gap:6px;' })
    wrap.appendChild(el('span', { style: 'font-size:11px;color:var(--text-muted);font-weight:700;letter-spacing:.1em;' }, '主题'))
    const sel = el('select', { class: 'v2-theme-select', 'aria-label': '主题选择器' })
    sel.innerHTML = `
      <optgroup label="智序 · Core">
        <option value="core" ${currentId === 'core' ? 'selected' : ''}>智序 · Core (V2)</option>
      </optgroup>
      <optgroup label="经典主题 / Classic Themes">
        ${CLASSIC_SKIN_ORDER.map(([id, name]) => `<option value="${id}" ${currentId === id ? 'selected' : ''}>${name}</option>`).join('')}
      </optgroup>
    `
    if (typeof sel.addEventListener === 'function') sel.addEventListener('change', () => onChange(sel.value))
    wrap.appendChild(sel)
    return wrap
  }

  function renderTopBar({ runtime, mode, demo, onToggleNav, onToggleHelix, onThemeChange, onToggleDemo, onDemoState, currentThemeId }) {
    const bar = el('header', { id: 'v2-top-bar', class: 'v2-top-bar' })
    const navBtn = el('button', { class: 'v2-icon-btn', title: '切换导航', onClick: onToggleNav, 'aria-label': '切换导航收起展开' },
      `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4 H14 M2 8 H14 M2 12 H14"/></svg>`)
    const brand = el('div', { class: 'v2-brand' }, `
      <div class="v2-brand-logo">序</div>
      <div>
        <div class="v2-brand-wordmark">智序工场</div>
        <div class="v2-brand-sub">Interactive Office V2</div>
      </div>
    `)
    const ws = runtime.workspace || {}
    const pr = runtime.project || {}
    const wsPill = el('span', { class: 'v2-pill', title: ws.path || '' },
      `${esc(ws.name || '工作区')} · ${esc(pr.name || '项目')}`)
    const status = runtime.runtimeStatus || 'connecting'
    const statusCls = status === 'live' ? 'v2-pill-live' : status === 'demo' || status === 'fake' ? 'v2-pill-demo' : 'v2-pill-connect'
    const statusText = { live: '● 已连接', demo: '● 演示', fake: '● 彩排模式', off: '● 断开', connecting: '● 连接中' }[status] || '● 连接中'
    const statusPill = el('span', { class: `v2-pill ${statusCls}` }, statusText)
    const waitingPill = runtime.waitingHuman?.length
      ? el('span', { class: 'v2-pill', style: 'color:var(--waiting-human);border-color:color-mix(in srgb,var(--waiting-human) 45%,var(--line));background:color-mix(in srgb,var(--waiting-human) 14%,transparent);' },
        `👋 等待人类 · ${runtime.waitingHuman.length}`)
      : null
    const demoBanner = mode === 'demo'
      ? el('span', { class: 'v2-demo-banner' }, '● 演示 · DEMO')
      : null
    const topRight = el('div', { class: 'v2-top-right' })
    if (mode === 'demo') {
      const demoCtl = el('span', { class: 'v2-demo-controls' })
      demoCtl.appendChild(el('span', { style: 'font-size:10px;color:var(--thinking);font-weight:800;letter-spacing:.08em;padding:0 2px;' }, '演示控制'))
      for (const b of DEMO_STATE_BUTTONS) {
        const btn = el('button', {
          class: `v2-demo-btn v2sp-${b.cls}`,
          type: 'button',
          title: `DEMO：推送视觉状态 ${b.zh}（仅演示，不会伪造运行时事件）`,
          onClick: () => onDemoState?.(b.id),
        }, b.zh)
        demoCtl.appendChild(btn)
      }
      topRight.appendChild(demoCtl)
    } else {
      const demoToggle = el('button', {
        class: 'v2-icon-btn',
        type: 'button',
        title: '切换 DEMO 模式（仅视觉）',
        'aria-label': '切换 DEMO 模式',
        onClick: () => onToggleDemo?.(),
      }, `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2 L9.5 6.5 L14.5 6.5 L10.5 9 L12 14 L8 11 L4 14 L5.5 9 L1.5 6.5 L6.5 6.5 Z"/></svg>`)
      topRight.appendChild(demoToggle)
    }
    const helixBtn = el('button', {
      class: 'v2-icon-btn',
      title: '打开/收起 Helix',
      'aria-label': '切换 Helix 面板',
      onClick: onToggleHelix,
    }, S ? `<svg viewBox="0 0 16 16" width="15" height="15">${S.GLYPHS?.roleIconHelix || ''}</svg>` : 'H')
    const notifBtn = el('button', { class: 'v2-icon-btn', title: '通知' },
      `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2.5 a4.5 4.5 0 0 0 -4.5 4.5 v3 l-1 2 h11 l-1 -2 v-3 a4.5 4.5 0 0 0 -4.5 -4.5 z"/></svg>`)
    const setBtn = el('button', { class: 'v2-icon-btn', title: '设置' },
      `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5 L8 3.2 M8 12.8 L8 14.5 M14.5 8 L12.8 8 M3.2 8 L1.5 8"/></svg>`)
    topRight.appendChild(helixBtn)
    topRight.appendChild(notifBtn)
    topRight.appendChild(setBtn)
    topRight.appendChild(renderThemeSwitcher(currentThemeId, onThemeChange))

    bar.appendChild(navBtn)
    bar.appendChild(brand)
    if (demoBanner) bar.appendChild(demoBanner)
    bar.appendChild(wsPill)
    bar.appendChild(statusPill)
    if (waitingPill) bar.appendChild(waitingPill)
    bar.appendChild(topRight)
    return bar
  }

  function renderNav({ runtime, activeNav, onNavigate, onToggleNav, navCollapsed }) {
    const rail = el('aside', { id: 'v2-left-rail', class: 'v2-nav-rail', 'aria-label': '主导航 Nav' })
    const ws = runtime.workspace || {}
    const pr = runtime.project || {}
    const wsBlock = el('div', { class: 'v2-workspace' }, `
      <div style="width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,color-mix(in srgb,var(--orchestrator) 55%,var(--accent)),var(--orchestrator));display:grid;place-items:center;color:#fff;font-weight:900;font-size:12px;">序</div>
      <div class="v2-workspace-text">
        <div class="ws-name">${esc(ws.name || '工作区')}</div>
        <div class="pr-name">${esc(pr.name || '项目')}</div>
      </div>
      <span style="width:7px;height:7px;border-radius:999px;background:${(runtime.runtimeStatus === 'live' || runtime.runtimeStatus === 'demo' || runtime.runtimeStatus === 'fake') ? 'var(--done)' : 'var(--thinking)'};"></span>
    `)
    const navSect = el('div', { class: 'v2-sect' })
    navSect.appendChild(el('div', { class: 'v2-sect-title' }, 'Navigate · 导航'))
    for (const it of NAV_ITEMS) {
      const active = activeNav === it.id
      const n = el('div', {
        class: 'v2-nav-item' + (active ? ' active' : ''),
        'data-nav': it.id,
        title: `${it.zh} · ${it.en}`,
        onClick: () => onNavigate?.(it.id),
      }, `
        <span class="glyph">${it.glyph}</span>
        <div>
          <div class="v2-nav-item-title">${esc(it.zh)}</div>
          <div class="v2-nav-item-sub">${esc(it.en)}</div>
        </div>
      `)
      navSect.appendChild(n)
    }
    const staffCount = ((runtime.members?.human?.length || 0) + (runtime.members?.ai?.length || 0))
    const teamSect = el('div', { class: 'v2-sect' })
    teamSect.appendChild(el('div', { class: 'v2-sect-title' }, `Team · 团队 (${staffCount})`))
    if (staffCount === 0) {
      teamSect.appendChild(el('div', { style: 'padding:4px 6px;font-size:10.5px;color:var(--text-muted);' }, '—'))
    } else {
      const people = [
        ...((runtime.members?.human || []).slice(0, 2).map(m => ({ ...m, _k: 'human' }))),
        ...((runtime.members?.ai || []).slice(0, 3).map(m => ({ ...m, _k: 'ai' }))),
      ]
      for (const p of people) {
        teamSect.appendChild(el('div', {
          class: 'v2-nav-item',
          title: p.name || '',
          onClick: () => { onNavigate?.('team'); },
        }, `
          <span class="glyph">${kindBadge(p._k || 'ai')}</span>
          <div>
            <div class="v2-nav-item-title" style="font-size:12px;">${esc(p.name || '')}</div>
            <div class="v2-nav-item-sub">${(Chars?.role(p.role)?.en) || (p.role || '')}</div>
          </div>
        `))
      }
    }
    rail.appendChild(wsBlock)
    rail.appendChild(navSect)
    rail.appendChild(teamSect)
    return rail
  }

  function renderHelixCollapsed({ helix, onToggle }) {
    const h = el('div', { class: 'v2-helix-collapsed' })
    const avatar = el('div', {
      class: 'v2-helix-avatar',
      title: '展开 Helix 面板',
      onClick: onToggle,
    }, S ? `<svg viewBox="0 0 16 16" width="22" height="22">${S.GLYPHS?.roleIconHelix || ''}</svg>` : 'H')
    h.appendChild(avatar)
    const c = helix.counts || {}
    const items = [
      { n: c.running || 0, l: 'RUN', cls: 'running',   title: '运行中',   col: 'var(--working)' },
      { n: c.reviewing|| 0, l: 'REV', cls: 'reviewing', title: '评审中',   col: 'var(--reviewing)' },
      { n: c.waiting  || 0, l: 'WAIT',cls: 'waiting',   title: '等待人类', col: 'var(--waiting-human)' },
      { n: c.blocked  || 0, l: 'BLK', cls: 'blocked',   title: '已阻塞',   col: 'var(--blocked)' },
    ]
    for (const it of items) {
      const m = el('div', { class: `v2-helix-metric`, title: it.title, onClick: onToggle })
      m.innerHTML = `<div class="n" style="color:${it.col};">${it.n}</div><div class="l" style="color:${it.col};opacity:.8;">${it.l}</div>`
      h.appendChild(m)
    }
    if ((c.unread || 0) > 0) {
      h.appendChild(el('div', {
        class: 'v2-helix-metric',
        title: `${c.unread} 条未读`,
        onClick: onToggle,
        style: 'color:var(--orchestrator);',
      }, `<div class="n">${c.unread}</div><div class="l">NEW</div>`))
    }
    return h
  }

  function renderHelixExpanded({ helix, runtime }, composer = {}) {
    const c = helix.counts || {}
    const wrap = el('div', { class: 'v2-helix-expanded' })
    const head = el('div', { class: 'v2-h-block v2-h-head' }, `
      <div style="width:36px;height:36px;border-radius:11px;border:1.8px double var(--orchestrator);background:linear-gradient(180deg,transparent 30%,rgba(143,130,255,.14));display:grid;place-items:center;color:var(--orchestrator);">
        ${S ? `<svg viewBox="0 0 16 16" width="20" height="20">${S.GLYPHS?.roleIconHelix || ''}</svg>` : 'H'}
      </div>
      <div>
        <div class="sys">HELIX</div>
        <div class="zh">${esc(helix.header?.zh || '')} · ${esc(helix.header?.label || '')}</div>
        <div class="en">${esc(helix.header?.en || '')}</div>
      </div>
      <div>${stateBadge(helix.state)}</div>
    `)
    wrap.appendChild(head)

    const metrics = el('div', { class: 'v2-h-block' })
    metrics.innerHTML = `
      <h4>编排指标 · Metrics</h4>
      <div class="v2-h-metrics">
        <div class="it running"><div class="l">Running</div><div class="n">${c.running || 0}</div></div>
        <div class="it review"><div class="l">Review</div><div class="n">${c.reviewing || 0}</div></div>
        <div class="it wait"><div class="l">Wait</div><div class="n">${c.waiting || 0}</div></div>
        <div class="it block"><div class="l">Block</div><div class="n">${c.blocked || 0}</div></div>
      </div>`
    wrap.appendChild(metrics)

    const conv = (helix.conversation || []).slice(-14)
    const convBlock = el('div', { class: 'v2-h-block helix-conv' })
    convBlock.appendChild(el('h4', {}, '对话 · Conversation'))
    if (conv.length === 0) convBlock.appendChild(el('div', { style: 'font-size:11.5px;color:var(--text-muted);padding:10px;border:1px dashed var(--line);border-radius:8px;text-align:center;' }, '跟 Helix 说点什么…'))
    else for (const m of conv) {
      const side = m.side === 'user' ? 'u' : 'hx'
      const b = el('div', { class: `v2-h-msg ${side}` })
      if (side === 'hx') b.innerHTML = `<div style="font-size:9.5px;color:var(--orchestrator);letter-spacing:.12em;font-weight:800;margin-bottom:2px;">HELIX</div>${esc(String(m.text || '').slice(0, 320))}`
      else b.innerHTML = `<div style="font-size:9.5px;color:var(--accent);letter-spacing:.12em;font-weight:800;margin-bottom:2px;">你</div>${esc(String(m.text || '').slice(0, 320))}`
      convBlock.appendChild(b)
    }
    const cblock = el('div', { class: 'v2-h-block' })
    cblock.appendChild(convBlock)
    const cform = el('form', { class: 'v2-h-composer', onsubmit: (e) => {
      e.preventDefault()
      const ta = cform.querySelector('textarea')
      if (ta.value.trim()) composer.onSend?.(ta.value.trim())
      ta.value = ''
    } })
    cform.innerHTML = `<textarea rows="2" placeholder="跟 Helix 说点什么…" aria-label="给 Helix 的消息"></textarea><button type="submit">发送</button>`
    const ta = cform.querySelector && cform.querySelector('textarea')
    if (ta && typeof ta.addEventListener === 'function') {
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (typeof cform.requestSubmit === 'function') cform.requestSubmit() }
      })
    }
    cblock.appendChild(cform)
    wrap.appendChild(cblock)

    const summary = el('div', { class: 'v2-h-block' })
    summary.innerHTML = `<h4>摘要 · Summary</h4><div style="font-size:11.5px;line-height:16px;color:var(--text);">${esc(helix.summary || '')}</div>`
    wrap.appendChild(summary)

    if ((helix.decisions || []).length) {
      const d = el('div', { class: 'v2-h-block' })
      d.innerHTML = `<h4>决议 · Decisions</h4><ol class="v2-h-list">${(helix.decisions || []).slice(0, 6).map(x => `<li>${esc(String(x).slice(0, 160))}</li>`).join('')}</ol>`
      wrap.appendChild(d)
    }
    if ((helix.waiting || []).length) {
      const w = el('div', { class: 'v2-h-block' })
      w.appendChild(el('h4', {}, `等待人类 · Waiting (${helix.waiting.length})`))
      for (const item of helix.waiting.slice(0, 4)) {
        const r = Chars?.role(item.role)
        const marker = S?.HumanActionMarker?.render({
          role: r?.zh || item.role, member: item.member, sinceMs: item.sinceMs, required: item.required,
        }) || ''
        if (marker) w.appendChild(el('div', { style: 'margin-top:6px;' }, marker))
        if (item.title) w.appendChild(el('div', { style: 'margin-top:3px;font-size:11px;color:var(--text);padding-left:2px;line-height:15px;' }, esc(String(item.title).slice(0, 160))))
      }
      wrap.appendChild(w)
    }
    if ((helix.recent || []).length) {
      const r = el('div', { class: 'v2-h-block' })
      r.innerHTML = `<h4>最近 · Recent</h4><ol class="v2-h-list">${(helix.recent || []).slice(-8).map(x =>
        `<li style="display:grid;grid-template-columns:52px 1fr;gap:5px;align-items:baseline;"><span style="color:var(--text-muted);font-size:10px;">${esc(ago(x.at))}</span><span>${esc(String(x.text || '').slice(0, 180))}</span></li>`
      ).join('')}</ol>`
      wrap.appendChild(r)
    }
    const mm = el('div', { class: 'v2-h-block' })
    mm.appendChild(el('h4', {}, '多模态接入 · Multimodal (挂载点)'))
    mm.appendChild(el('div', {
      class: 'v2-multimodal-mount',
      'aria-label': '多模态集成挂载点（PR#10 不接入，仅占位）',
    }, '🔌 多模态集成挂载点（空壳 · 不含 PR #10 MMI 逻辑）<br>语音/图像/屏幕共享由外部系统 attach 至此'))
    wrap.appendChild(mm)

    return wrap
  }

  function renderInspectorBackdrop({ onClose }) {
    const b = el('div', { class: 'v2-drawer-backdrop', role: 'presentation' })
    b.addEventListener('click', () => onClose?.())
    return b
  }

  function openDrawer(mount, opts = {}) {
    closeDrawer(mount)
    const backdrop = renderInspectorBackdrop({ onClose: () => closeDrawer(mount) })
    const drawer = el('aside', { class: 'v2-drawer', role: 'dialog', 'aria-label': opts.title || 'Inspector' })
    const head = el('div', { class: 'v2-drawer-head' })
    head.appendChild(el('span', {}, opts.leading || ''))
    head.appendChild(el('div', { class: 'v2-drawer-title' }, opts.title || ''))
    const closeBtn = el('button', { class: 'v2-drawer-close', onClick: () => closeDrawer(mount) },
      `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4 L12 12 M12 4 L4 12"/></svg>`)
    head.appendChild(closeBtn)
    drawer.appendChild(head)
    for (const child of (opts.children || [])) if (child) drawer.appendChild(child)
    document.body.appendChild(backdrop)
    document.body.appendChild(drawer)
    const hasRAF = typeof globalThis !== 'undefined' && typeof globalThis.requestAnimationFrame === 'function'
      && typeof globalThis.requestAnimationFrame.call === 'function'
    if (hasRAF) {
      try { requestAnimationFrame(() => drawer.classList.add('open')) } catch (_) { drawer.classList.add('open') }
    } else {
      drawer.classList.add('open')
    }
    return { backdrop, drawer }
  }
  function closeDrawer(mount) {
    try { document.querySelectorAll('.v2-drawer-backdrop, .v2-drawer').forEach(n => n.remove()) }
    catch (_) {
      const body = document.body
      for (const c of [...(body.__children || body.children || [])]) {
        const cn = c.className || ''
        if (typeof cn === 'string' && (cn.includes('v2-drawer-backdrop') || cn.includes('v2-drawer'))) body.removeChild(c)
      }
    }
  }

  function inspectorSection(title, html) {
    const s = el('div', { class: 'v2-section' })
    s.appendChild(el('h5', {}, title))
    s.appendChild(el('div', {}, html || ''))
    return s
  }

  function roleInspectorHTML({ roleId, runtime, snapshot }) {
    const r = Chars?.role(roleId)
    if (!r) return `<div style="color:var(--text-muted);">未知角色 ${esc(roleId)}</div>`
    const state = snapshot?.seatStates?.[roleId] || runtime?.seatStates?.[roleId] || 'IDLE'
    const kind = (
      snapshot?.seatKinds?.[roleId] ||
      runtime?.seatKinds?.[roleId] ||
      (roleId === 'helix' ? 'system' : (['product','qa','reviewer'].includes(roleId) ? 'human' : 'ai'))
    )
    const member = snapshot?.seatMembers?.[roleId] || runtime?.seatMembers?.[roleId] || '—'
    const model = snapshot?.seatModels?.[roleId] || runtime?.seatModels?.[roleId] || ''
    const tasks = ((runtime?.tasks || []).filter(t => t.role === roleId) || [])
    const currentTask = tasks.find(t => t.status === 'running' || t.status === 'pending') || tasks[0] || null
    const blockedReason = state === 'BLOCKED' ? '【演示数据】缺少上游依赖或配置未就绪（视觉状态）' : '—'
    const waitingInfo = state === 'WAITING_HUMAN' ? `【演示】已等待 ${Math.floor(Math.random()*18+2)} 分钟：需要人类确认规格` : '—'
    const evidence = (currentTask?.evidence || [
      { kind: 'build', state: 'pass', sha: 'a31f' },
      { kind: 'test', state: currentTask?.status === 'running' ? 'missing' : 'pass' },
    ]).map(e => S?.EVIDENCE?.chip(e.kind, e.state, { sha: e.sha }) || '').join('')
    const humanAiLabel = kind === 'system' ? '系统编排' : kind === 'human' ? '人类 Human' : 'AI Agent'
    const recent = [
      { at: Date.now() - 20 * 60000, text: `${r.zh} 从 IDLE → THINKING` },
      { at: Date.now() - 8 * 60000,  text: `${r.zh} 加载工具：browser / mcp-desktop` },
      { at: Date.now() - 2 * 60000,  text: `${r.zh} 当前状态 → ${state}` },
    ]

    return [
      inspectorSection('角色 / Role', `
        <div class="v2-kv">
          <div class="k">Role</div><div class="v"><b>${esc(r.zh)}</b> · ${esc(r.en)} · ${esc(r.desc?.zh || '')}</div>
          <div class="k">Member</div><div class="v">${esc(member)} ${kindBadge(kind)}</div>
          <div class="k">Human·AI</div><div class="v">${humanAiLabel}</div>
          <div class="k">State</div><div class="v">${stateBadge(state)}</div>
        </div>`),
      inspectorSection('当前任务 / Current Task', `
        <div class="v2-kv">
          <div class="k">ID</div><div class="v" style="font-family:var(--mono);">${currentTask?.id ? esc(currentTask.id) : '—'}</div>
          <div class="k">标题</div><div class="v">${currentTask?.title ? esc(currentTask.title) : '暂无活动任务'}</div>
          <div class="k">状态</div><div class="v">${currentTask?.status ? esc(currentTask.status) : '—'}</div>
          <div class="k">难度</div><div class="v">${currentTask?.difficulty ? esc(currentTask.difficulty) : '—'}</div>
        </div>`),
      inspectorSection('模型 / 工具 / 证据', `
        <div class="v2-kv">
          <div class="k">Model</div><div class="v">${model ? S?.BADGE?.model(model) : '—'}</div>
          <div class="k">Tools</div><div class="v"><span class="v2-pill" style="padding:1px 6px;">browser</span> <span class="v2-pill" style="padding:1px 6px;">filesystem</span> <span class="v2-pill" style="padding:1px 6px;">mcp-desktop</span></div>
          <div class="k">Evidence</div><div class="v2-evidence v"><div style="display:flex;flex-wrap:wrap;gap:4px;">${evidence}</div></div>
        </div>`),
      inspectorSection('阻塞 / 等待', `
        <div class="v2-kv">
          <div class="k">阻塞原因</div><div class="v" style="${state === 'BLOCKED' ? 'color:var(--blocked);font-weight:600;' : ''}">${esc(blockedReason)}</div>
          <div class="k">等待信息</div><div class="v" style="${state === 'WAITING_HUMAN' ? 'color:var(--waiting-human);font-weight:600;' : ''}">${esc(waitingInfo)}</div>
        </div>`),
      inspectorSection('最近活动 / Recent', `
        <div class="v2-timeline">
          ${recent.map(e => `<div class="e"><span class="t">${esc(ago(e.at))}</span><span>${esc(e.text)}</span></div>`).join('')}
        </div>`),
    ]
  }

  function taskInspectorHTML({ taskId, runtime }) {
    const t = (runtime?.tasks || []).find(x => x.id === taskId) || { id: taskId, title: `任务 ${taskId}`, status: 'pending', role: 'frontend' }
    const owner = (t.role ? Chars?.role(t.role) : null) || { zh: t.who || '未分配', en: 'Unassigned' }
    const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE', waiting: 'WAITING_HUMAN' })[t.status] || 'IDLE'
    const deps = t.deps || []
    const evidence = (t.evidence || [
      { kind: 'build', state: stateKey === 'BLOCKED' ? 'fail' : 'pass', sha: (t.id || '').slice(-4) || 'abcd' },
      { kind: 'test', state: stateKey === 'DONE' ? 'pass' : stateKey === 'WORKING' ? 'missing' : 'pass' },
    ]).map(e => S?.EVIDENCE?.chip(e.kind, e.state, { sha: e.sha }) || '').join('')
    const recent = [
      { at: Date.now() - 30 * 60000, text: `创建任务 ${t.id}` },
      { at: Date.now() - 12 * 60000, text: `派给 ${owner.zh}` },
      { at: Date.now() - 2  * 60000, text: `状态 → ${stateKey}` },
    ]
    const createdAt = t.createdAt || (Date.now() - 32 * 60000)
    const updatedAt = t.updatedAt || (Date.now() - 3 * 60000)
    return [
      inspectorSection('任务 / Task', `
        <div class="v2-kv">
          <div class="k">ID</div><div class="v" style="font-family:var(--mono);font-weight:700;">${esc(t.id)}</div>
          <div class="k">标题</div><div class="v">${esc(t.title || '')}</div>
          <div class="k">Owner</div><div class="v">${esc(owner.zh)} · ${esc(owner.en)} ${kindBadge(t.role === 'product' || t.role === 'qa' || t.role === 'reviewer' ? 'human' : 'ai')}</div>
          <div class="k">State</div><div class="v">${stateBadge(stateKey)} · ${esc(t.status || '')}</div>
          <div class="k">Type</div><div class="v">${esc(t.kind || '')} · ${esc(t.difficulty || '')}</div>
        </div>`),
      inspectorSection('依赖 / 执行 / 审查', `
        <div class="v2-kv">
          <div class="k">Deps</div><div class="v">${deps.length ? deps.map(d => `<span class="v2-pill" style="padding:1px 6px;font-family:var(--mono);">${esc(d)}</span>`).join(' ') : '无'}</div>
          <div class="k">执行</div><div class="v">${stateKey === 'WORKING' || stateKey === 'THINKING' ? '⏳ 执行中…' : stateKey === 'DONE' ? '✅ 已完成' : stateKey === 'BLOCKED' ? '❌ 阻塞' : '排队中'}</div>
          <div class="k">审查</div><div class="v">${stateKey === 'REVIEWING' ? '🔍 审查中' : (t.reviewed ? '✅ 已通过' : '待触发')}</div>
          <div class="k">Evidence</div><div class="v"><div style="display:flex;flex-wrap:wrap;gap:4px;">${evidence}</div></div>
        </div>`),
      inspectorSection('等待 / 时间戳', `
        <div class="v2-kv">
          <div class="k">Waiting</div><div class="v" style="${t.kind === 'human' || t.status === 'waiting' ? 'color:var(--waiting-human);font-weight:600;' : ''}">${t.kind === 'human' || t.status === 'waiting' ? '等待人类确认' : '—'}</div>
          <div class="k">Created</div><div class="v" style="font-family:var(--mono);">${new Date(createdAt).toLocaleString()}</div>
          <div class="k">Updated</div><div class="v" style="font-family:var(--mono);">${new Date(updatedAt).toLocaleString()}</div>
        </div>`),
      inspectorSection('最近事件 / Recent', `
        <div class="v2-timeline">
          ${recent.map(e => `<div class="e"><span class="t">${esc(ago(e.at))}</span><span>${esc(e.text)}</span></div>`).join('')}
        </div>`),
    ]
  }

  function renderBottomNav(onPick) {
    const nav = el('nav', { class: 'v2-bottom-nav', role: 'navigation', 'aria-label': '底部导航' })
    const items = [
      ['office', '办公室', `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 13 L2 7 L8 3 L14 7 L14 13"/></svg>`],
      ['tasks', '任务', `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/></svg>`],
      ['helix', 'Helix', S ? `<svg viewBox="0 0 16 16" width="18" height="18">${S.GLYPHS?.roleIconHelix || ''}</svg>` : 'H'],
      ['approvals', '审批', `<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3 H10 L13 6 V13 H3 Z"/></svg>`],
    ]
    items.forEach(([id, label, icon], i) => {
      const b = el('button', {
        class: 'b' + (i === 0 ? ' active' : ''),
        onClick: () => { nav.querySelectorAll('.b').forEach(n => n.classList.remove('active')); b.classList.add('active'); onPick?.(id) },
      })
      b.innerHTML = icon + `<span>${esc(label)}</span>`
      nav.appendChild(b)
    })
    return nav
  }

  // ======================= Bootstrap =======================
  function destroyClassicIfPresent() {
    for (const sel of ['.app', '.top', '.layout', '.stage-wrap', '.chat', '.board', '#team']) {
      document.querySelectorAll(sel).forEach(n => n.remove())
    }
    document.body.querySelectorAll(':scope > #v2-top-bar,:scope > #v2-left-rail,:scope > #v2-office-stage,:scope > #v2-helix-rail,:scope > .v2-bottom-nav,:scope > .v2-drawer-backdrop,:scope > .v2-drawer').forEach(n => n.remove())
  }

  function destroyV2Shell() {
    document.body.classList.remove('v2-shell-body', 'v2-nav-collapsed', 'v2-nav-open', 'v2-helix-open')
    document.documentElement.removeAttribute('data-theme-core')
    const ids = [CSS_ID, 'core-theme-style']
    ids.forEach(id => { const n = document.getElementById(id); if (n) n.remove() })
    document.body.querySelectorAll('#v2-top-bar, #v2-left-rail, #v2-office-stage, #v2-helix-rail, .v2-bottom-nav, .v2-drawer-backdrop, .v2-drawer, .v2-drawer-backdrop').forEach(n => n.remove())
  }

  function restoreClassicScaffold() {
    destroyV2Shell()
    const mount = document.getElementById('app-mount')
    if (mount) mount.innerHTML = ''
    document.body.innerHTML = `
      <div class="app">
        <header class="top">
          <div class="brand">
            <span class="wordmark">智序工场</span>
            <span class="wordmark-sub">Virtual AI Office · Helix</span>
            <span class="tagline">人类与 AI，共同把事情做完</span>
          </div>
          <button type="button" id="open-setup" class="btn-setup" aria-label="接入员工或模型配置">接入员工</button>
          <div class="skins" id="skins" role="group" aria-label="切换皮肤/主题"></div>
          <div class="conn">
            <span id="conn" class="pill pill-wait">连接中…</span>
            <code id="workdir" class="workdir"></code>
          </div>
        </header>
        <main class="layout">
          <section class="stage-wrap" aria-label="智序工场 · 虚拟办公室">
            <div class="stage">
              <div class="scene" id="scene">
                <canvas id="office" width="404" height="216" role="img" aria-label="智序工场：Helix 位于中央，各项目组的员工坐在两边的工位上"></canvas>
                <div class="overlay" id="overlay" aria-hidden="true"></div>
              </div>
            </div>
            <div class="team" id="team" aria-label="项目组和员工"></div>
          </section>
          <aside class="chat" aria-label="与 Helix 对话">
            <div class="panel-head">
              <h2>和 Helix 说</h2>
              <button type="button" id="stop" class="btn-stop" hidden>全部停下</button>
            </div>
            <div id="banner" class="banner" hidden></div>
            <div id="messages" class="messages" aria-live="polite"></div>
            <div class="suggest" id="suggest"></div>
            <form id="composer" class="composer">
              <label for="input" class="sr-only">给 Helix 的消息</label>
              <textarea id="input" rows="2" placeholder="跟 Helix 说说要做什么，说得模糊也没关系：他会开会、拆任务、派给合适的员工，做完自己验收"></textarea>
              <button type="submit" id="send" class="btn-send">发送</button>
            </form>
            <p class="hint">Enter 发送 · Shift+Enter 换行 · <code>@员工</code> 点名 · <code>/招人</code> <code>/工具</code> <code>/团队</code> <code>/撤销</code> <code>/stop</code></p>
          </aside>
          <section class="board" aria-label="任务板">
            <div class="panel-head">
              <h2>任务板</h2>
              <span id="round" class="round"></span>
              <button type="button" id="undo" class="btn-ghost" hidden>撤销上一轮</button>
            </div>
            <div id="meeting" class="meeting-card" hidden></div>
            <ol id="tasks" class="tasks"></ol>
            <p id="tasks-empty" class="empty">还没有任务。跟 Helix 说说要做什么，说得模糊也没关系：他会开会、拆任务、派给合适的员工，做完自己验收。</p>
          </section>
        </main>
      </div>
    `
  }

  function bootstrap(options = {}) {
    if (!Theme || !S) throw new Error('VAOCoreShellV2.bootstrap: missing theme/states')
    Theme.inject()
    Chars?.injectStyles?.()
    document.documentElement.setAttribute('data-theme-core', Theme.THEME_ID)
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('data-skin-id')
    injectCss()

    const initialMode = modeOf(options)
    const useFixtures = initialMode === 'demo'
    let runtime = options.runtime && Object.keys(options.runtime).length
      ? options.runtime
      : (useFixtures ? JSON.parse(JSON.stringify(demoRuntime())) : emptyRuntime())
    let helix = options.helix && Object.keys(options.helix).length
      ? options.helix
      : (useFixtures ? JSON.parse(JSON.stringify(demoHelix())) : emptyHelix())

    destroyClassicIfPresent()
    document.body.classList.add('v2-shell-body')
    document.body.innerHTML = ''

    const navCollapsedStored = !!storeGet(STORAGE_KEYS.navCollapsed, false)
    let navCollapsed = navCollapsedStored
    let helixOpen = false
    let activeNav = options.initialNav || 'office'
    let demoMode = initialMode === 'demo'

    if (navCollapsed) document.body.classList.add('v2-nav-collapsed')
    if (helixOpen) document.body.classList.add('v2-helix-open')

    const backdrop = el('div', { class: 'v2-drawer-backdrop' })
    if (typeof backdrop.addEventListener === 'function') backdrop.addEventListener('click', () => {
      setNav(false); setHelix(false); closeDrawer()
    })

    function setNav(on) {
      const small = (typeof window !== 'undefined' && window.innerWidth != null && window.innerWidth <= 1024)
      navCollapsed = small ? navCollapsed : !on
      storeSet(STORAGE_KEYS.navCollapsed, navCollapsed)
      if (small) {
        // Mobile / tablet (≤1024): off-canvas drawer toggled by v2-nav-open class
        document.body.classList.remove('v2-nav-collapsed')
        document.body.classList.toggle('v2-nav-open', !!on)
      } else {
        // Desktop: collapse/expand width via v2-nav-collapsed CSS var
        document.body.classList.remove('v2-nav-open')
        document.body.classList.toggle('v2-nav-collapsed', !on)
      }
    }
    function setHelix(on) {
      helixOpen = !!on
      storeSet(STORAGE_KEYS.helixExpanded, helixOpen)
      document.body.classList.toggle('v2-helix-open', helixOpen)
      rerenderHelix()
    }
    function toggleNav() {
      const small = (typeof window !== 'undefined' && window.innerWidth != null && window.innerWidth <= 1024)
      if (small) {
        setNav(!document.body.classList.contains('v2-nav-open'))
      } else {
        setNav(document.body.classList.contains('v2-nav-collapsed'))
      }
    }
    function toggleHelix() { setHelix(!helixOpen) }
    function setActiveNav(id) {
      activeNav = id
      rerenderNav()
      options.onNavigate?.(id)
    }

    let topBar, navRail, stageWrap, helixRail, bottomNav
    let officeHandle = null

    function rerender() {
      if (topBar) topBar.remove()
      if (navRail) navRail.remove()
      if (helixRail) helixRail.remove()
      if (bottomNav) bottomNav.remove()
      topBar = renderTopBar({
        runtime, mode: demoMode ? 'demo' : initialMode, demo: demoMode,
        onToggleNav: toggleNav, onToggleHelix: toggleHelix,
        onThemeChange: (id) => options.onThemeChange?.(id),
        onToggleDemo: () => setDemoMode(!demoMode),
        onDemoState: (sid) => applyDemoStateVisual(sid),
        currentThemeId: 'core',
      })
      navRail = renderNav({ runtime, activeNav, onNavigate: setActiveNav, navCollapsed })
      helixRail = el('aside', { id: 'v2-helix-rail', class: 'v2-helix-rail', 'aria-label': 'Helix 编排中枢' })
      rerenderHelix(true)
      bottomNav = renderBottomNav((id) => {
        if (id === 'helix') setHelix(true)
        else setActiveNav(id)
      })
      document.body.appendChild(topBar)
      document.body.appendChild(navRail)
      document.body.appendChild(stageWrap)
      document.body.appendChild(helixRail)
      document.body.appendChild(backdrop)
      document.body.appendChild(bottomNav)
      wireStageEvents()
    }
    function rerenderNav() {
      const next = renderNav({ runtime, activeNav, onNavigate: setActiveNav, navCollapsed })
      navRail.replaceWith(next); navRail = next
    }
    function rerenderHelix(force) {
      helixRail.innerHTML = ''
      if (helixOpen) helixRail.appendChild(renderHelixExpanded({ helix, runtime }, {
        onSend: (t) => options.onConversationSend?.(t),
      }))
      else helixRail.appendChild(renderHelixCollapsed({ helix }, toggleHelix))
    }
    function rerenderTop() {
      const next = renderTopBar({
        runtime, mode: demoMode ? 'demo' : initialMode, demo: demoMode,
        onToggleNav: toggleNav, onToggleHelix: toggleHelix,
        onThemeChange: (id) => options.onThemeChange?.(id),
        onToggleDemo: () => setDemoMode(!demoMode),
        onDemoState: (sid) => applyDemoStateVisual(sid),
        currentThemeId: 'core',
      })
      topBar.replaceWith(next); topBar = next
    }

    function buildSnapshot() {
      return {
        seatStates: runtime.seatStates || {},
        seatKinds: runtime.seatKinds || {},
        seatMembers: runtime.seatMembers || {},
        seatModels: runtime.seatModels || {},
        tasks: runtime.tasks || [],
        edges: [],
      }
    }

    function wireStageEvents() {
      if (typeof stageWrap.addEventListener === 'function') {
        stageWrap.addEventListener('vao-v2:role-clicked', (e) => {
          options.onPickRole?.(e.detail.roleId)
          openRoleInspector(e.detail.roleId)
          const n = e.detail.el
          if (n && n.classList) { n.classList.remove('v2-focus-anim'); void n.offsetWidth; n.classList.add('v2-focus-anim') }
        })
        stageWrap.addEventListener('vao-v2:workstation-clicked', (e) => {
          options.onPickRole?.(e.detail.roleId)
          openRoleInspector(e.detail.roleId)
        })
        stageWrap.addEventListener('vao-v2:task-clicked', (e) => {
          options.onPickTask?.(e.detail.taskId)
          openTaskInspector(e.detail.taskId)
        })
      }
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('vao-v2:task-clicked', (e) => {
          if (e && e.detail && e.detail.taskId) {
            options.onPickTask?.(e.detail.taskId)
            openTaskInspector(e.detail.taskId)
          }
        })
      }
    }

    function openRoleInspector(roleId) {
      const r = Chars?.role(roleId)
      const lead = r ? `<div style="display:inline-flex;align-items:center;gap:8px;"><span style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,${r.accent} 22%,var(--panel-2));color:${r.accent};">${S?.svg?.(r.glyph, 18) || ''}</span></div>` : ''
      openDrawer(document.body, {
        title: `${r?.zh || ''} · Role Inspector`,
        leading: lead,
        children: roleInspectorHTML({ roleId, runtime, snapshot: buildSnapshot() }),
      })
    }
    function openTaskInspector(taskId) {
      openDrawer(document.body, {
        title: `Task Inspector · ${esc(taskId)}`,
        leading: `<div style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 18%,var(--panel-2));color:var(--accent);font-weight:800;font-family:var(--mono);font-size:11px;">T</div>`,
        children: taskInspectorHTML({ taskId, runtime }),
      })
    }

    function setDemoMode(on) {
      demoMode = !!on
      runtime = demoMode ? JSON.parse(JSON.stringify(demoRuntime())) : emptyRuntime()
      helix = demoMode ? JSON.parse(JSON.stringify(demoHelix())) : emptyHelix()
      rerender()
      options.onDemoToggle?.(demoMode)
    }

    function applyDemoStateVisual(stateId) {
      if (demoMode) {
        options.onDemoStateVisual?.(stateId)
      }
    }

    // Event animation: TASK_DISPATCH
    function animateDispatch(roleId) {
      if (!officeHandle) return
      officeHandle.pulseHelixTo?.(roleId)
      setTimeout(() => officeHandle.setRoleState?.(roleId, 'WORKING'), 250)
    }
    // Event animation: REVIEW → highlight QA/Reviewer
    function animateReview() {
      for (const rid of ['qa', 'reviewer']) {
        const n = typeof stageWrap.querySelector === 'function' ? stageWrap.querySelector(`.char-${rid}`) : null
        if (n && officeHandle) officeHandle.setRoleState(rid, 'REVIEWING')
      }
    }
    // Event animation: WAITING_HUMAN
    function animateWaitingHuman(on) {
      officeHandle?.activateHumanArea?.(!!on)
      if (on) officeHandle?.setRoleState?.('helix', 'WAITING_HUMAN')
    }
    // Event animation: BLOCKED
    function animateBlocked(roleId) {
      officeHandle?.setRoleState?.(roleId, 'BLOCKED')
    }
    // Event animation: DONE → brief ack → delay → IDLE
    function animateDone(roleId, thenIdleMs = 1800) {
      officeHandle?.setRoleState?.(roleId, 'DONE')
      if (thenIdleMs > 0) setTimeout(() => officeHandle?.setRoleState?.(roleId, 'IDLE'), thenIdleMs)
    }
    // Event animation: MEETING → rotate roles orient to Planning
    function animateMeeting(roleIds = ['product', 'architect', 'frontend', 'backend']) {
      const els = stageWrap.querySelectorAll('.char-anchor')
      els.forEach(g => {
        const rid = g.dataset.role
        if (roleIds.includes(rid)) {
          g.setAttribute('transform', g.getAttribute('transform')?.replace(/rotate\([^)]*\)/, '') + ' rotate(-6 24 36)')
          officeHandle?.setRoleState?.(rid, 'THINKING')
        }
      })
    }

    // Initial mount of stage
    stageWrap = el('main', { id: 'v2-office-stage', class: 'v2-stage-wrap', role: 'main', 'aria-label': 'Interactive Office V2 · 6-zone 2.5D Floor' })
    officeHandle = Office
      ? Office.attach(stageWrap, { snapshot: buildSnapshot(), mode: demoMode ? 'demo' : 'live' })
      : null

    rerender()

    const handle = {
      get mode() { return demoMode ? 'demo' : initialMode },
      get navCollapsed() { return navCollapsed },
      get helixOpen() { return helixOpen },
      get nodes() { return { topBar, navRail, stageWrap, helixRail, bottomNav } },
      get office() { return officeHandle },
      setOfficeHandle(h) { officeHandle = h },
      setNav, toggleNav, setHelix, toggleHelix,
      openRoleInspector, openTaskInspector,
      closeInspector: closeDrawer,
      // Event anim helpers (safe, DEMO-mode visual-only triggers)
      animate: {
        dispatch: animateDispatch,
        review: animateReview,
        waitingHuman: animateWaitingHuman,
        blocked: animateBlocked,
        done: animateDone,
        meeting: animateMeeting,
      },
      applyDemoStateVisual(stateId) {
        // DEMO mode only: push visual state to all non-helix roles for a few seconds.
        if (stateId === 'MEETING') { animateMeeting(['product','architect','frontend','backend','qa','reviewer','docs']); return }
        if (stateId === 'WAITING_HUMAN') { animateWaitingHuman(true); return }
        ROLE_IDS_8.forEach(rid => officeHandle?.setRoleState?.(rid, stateId))
        if (stateId === 'DONE') ROLE_IDS_8.forEach(rid => {
          setTimeout(() => officeHandle?.setRoleState?.(rid, 'IDLE'), 2000)
        })
        if (stateId !== 'WAITING_HUMAN') animateWaitingHuman(false)
      },
      update(next = {}) {
        if (next.runtime) Object.assign(runtime, next.runtime)
        if (next.helix) Object.assign(helix, next.helix)
        rerenderTop()
        rerenderNav()
        rerenderHelix()
        if (next.snapshot || next.runtime) {
          const snap = next.snapshot || buildSnapshot()
          officeHandle?.update?.(snap)
        }
      },
      destroy() {
        destroyV2Shell()
        if (typeof globalThis.VAOCoreOfficeV2?.destroy === 'function') {/*noop*/}
        if (officeHandle) officeHandle.destroy?.()
      },
    }
    return handle
  }

  const api = Object.freeze({
    bootstrap,
    destroyV2Shell,
    restoreClassicScaffold,
    CSS_ID,
    CLASSIC_IDS,
    CLASSIC_SKIN_ORDER,
    ROLE_IDS_8,
    NAV_ITEMS,
    DEMO_STATE_BUTTONS,
    renderThemeSwitcher,
    renderTopBar,
    renderNav,
    renderHelixCollapsed,
    renderHelixExpanded,
    renderBottomNav,
    openRoleInspectorHTML: roleInspectorHTML,
    openTaskInspectorHTML: taskInspectorHTML,
    runtimeMode: modeOf,
    demoRuntime, demoHelix, emptyRuntime, emptyHelix,
  })
  globalThis.VAOCoreShellV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
