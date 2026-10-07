/* Visual V2-A Application Shell: 4-region layout per §4-6 UI_PROTOTYPE_CONTRACT_V2.md,
 * §4 HELIX PANEL (Helix visible identity, System Orchestrator / 系统编排中枢),
 * §12 responsive (desktop 4-region / tablet rail collapse helix drawer / mobile ≤640 bottom nav Chinese),
 * and §15 interaction live wiring (theme switch Core ↔ 经典主题, seat/task select, conv send, Helix drawer open/close).
 *
 * Regions (V2-A):
 *   #global-bar        — Top: brand 智序工场 + VirtualAIOffice · Workspace · Project · runtime status · WaitingHuman pill · notifications · settings · theme switcher.
 *   #organization-rail — Left 240px: Workspace meta · Roles list (8 incl Helix) · Human members · AI agents (derived honest from data).
 *   #office-canvas     — Center: VAOCoreOffice.attach().
 *   #helix-panel       — Right 340px: HELIX header · System Orchestrator / 系统编排中枢 · state · conversation · summary · decisions · waiting human · recent activity.
 *
 * Mobile (≤640px): bottom nav 办公室 / 任务 / Helix / 审批 (Chinese, spec required).
 * Tablet (≤1024px): rail collapse 0px, Helix drawer overlay.
 *
 * Theme switcher: Core (智序·Core) first; then optgroup 经典主题 (Classic Themes) → sakura / night / neon / neko / pixel.
 *
 * NEVER mix Core shell + legacy anime chars. When Core → destroy classic AnimeOffice/ShaniuOffice; when classic → destroy V2 Core shell + render classic layout.
 */
;(function () {
  'use strict'

  const Theme = globalThis.VAOCoreTheme
  const Chars = globalThis.VAOCoreCharacters
  const States = globalThis.VAOCoreStates
  const Office = globalThis.VAOCoreOffice

  const CLASSIC_SKIN_ORDER = [
    ['sakura', '樱花 · Sakura'],
    ['night', '夜班 · Night'],
    ['neon', '赛博霓虹 · Cyber Neon'],
    ['neko', '猫耳咖啡 · Neko Cafe'],
    ['pixel', '像素复古 · Pixel Retro'],
  ]
  const CLASSIC_IDS = CLASSIC_SKIN_ORDER.map(([id]) => id)

  const DEMO_RUNTIME = Object.freeze({
    workspace: { id: 'ws-demo', name: '智序工场 · 演示数据', path: 'e:\\VirtualAIOffice\\repo' },
    project: { id: 'visual-v2-a-demo', name: 'Visual V2-A Demo（演示）' },
    members: {
      human: [
        { id: 'm-product', name: '李产品', role: 'product', online: true },
        { id: 'm-qa', name: '王测试', role: 'qa', online: true },
        { id: 'm-reviewer', name: '张审查', role: 'reviewer', online: false },
      ],
      ai: [
        { id: 'a-architect', name: 'Codex Demo', model: 'demo-model', role: 'architect', online: true },
        { id: 'a-frontend', name: 'Claude Demo', model: 'demo-model', role: 'frontend', online: true },
        { id: 'a-backend', name: 'DeepSeek Demo', model: 'demo-model', role: 'backend', online: true },
        { id: 'a-docs', name: 'Gemini Demo', model: 'demo-model', role: 'docs', online: false },
      ],
    },
    runtimeStatus: 'demo',
    waitingHuman: [
      { id: 'w-demo-1', role: 'product', member: '李产品', title: '【DEMO】确认 §5.1 颜色 token 规格对比表', sinceMs: Date.now() - 14 * 60 * 1000, required: true },
    ],
  })

  const HELIX_DEMO = Object.freeze({
    state: 'THINKING',
    header: { label: 'HELIX', zh: '系统编排中枢（演示）', en: 'System Orchestrator · DEMO' },
    conversation: [
      { who: 'Helix', side: 'helix', text: '【DEMO 演示数据】已读取项目 Visual V2-A 基线 demo fixtures。' },
      { who: '你', side: 'user', text: '【DEMO】把 Core 主题设为默认，并在选择器里把 5 个老皮肤归类到「经典主题」。' },
      { who: 'Helix', side: 'helix', text: '【DEMO 演示数据】已登记：skin-format.js + src/skins.js 加入 id=core。' },
    ],
    summary: '【DEMO 演示数据】V2-A 第一阶段：Core Shell / Helix / Office Canvas 渲染器 demo fixtures，仅 fake/demo 模式显示。',
    decisions: [
      '【DEMO】主题 id=core，显示名「智序·Core」',
      '【DEMO】Helix 计入官方角色数 → 恰好 8',
      '【DEMO】WAITING_HUMAN 琥珀色环 + hand glyph',
    ],
    waiting: DEMO_RUNTIME.waitingHuman,
    recent: [
      { at: Date.now() - 20 * 60000, text: '【DEMO】最近活动 1' },
      { at: Date.now() - 10 * 60000, text: '【DEMO】最近活动 2' },
      { at: Date.now() - 2 * 60000, text: '【DEMO】最近活动 3' },
    ],
  })

  function runtimeMode(options = {}) {
    const raw = String(options.mode || options.runtime?.runtimeStatus || 'live').toLowerCase()
    if (raw === 'fake' || raw === 'demo') return 'demo'
    return 'live'
  }

  function buildEmptyRuntime() {
    return {
      workspace: { id: '', name: '当前工作区', path: '' },
      project: { id: '', name: '未指定项目' },
      members: { human: [], ai: [] },
      runtimeStatus: 'connecting',
      waitingHuman: [],
    }
  }

  function buildEmptyHelix() {
    return {
      state: 'IDLE',
      header: { label: 'HELIX', zh: '系统编排中枢', en: 'System Orchestrator' },
      conversation: [],
      summary: '暂无摘要。跟 Helix 说点什么开始。',
      decisions: [],
      waiting: [],
      recent: [],
    }
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
  function ago(ts) {
    if (!ts) return ''
    const d = Date.now() - ts
    if (d < 60000) return '刚刚'
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前'
    return Math.floor(d / 3600000) + ' 时前'
  }
  function statePill(state) {
    const St = States?.STATES?.[state] || { key: state?.toLowerCase?.() || 'idle', zh: state || '未知' }
    return `<span class="pill state-pill state-${St.key}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--panel-2);border:1px solid var(--line);">${States?.stateGlyphSvg(state, 12) || ''}<span>${St.zh}</span></span>`
  }
  function memberAvatar(member, kind = 'human') {
    const badge = kind === 'human' ? States?.BADGE?.human({ size: 14 }) : States?.BADGE?.ai({ size: 14 })
    return badge || ''
  }

  const HELIX_STATE = {
    mode: 'compact',
  }

  function injectShellCss() {
    const id = 'core-shell-css'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
    html[data-theme-core] body.v2-core-shell{margin:0;display:grid;grid-template-rows:var(--shell-bar-h) 1fr;grid-template-columns:var(--shell-rail-w) 1fr var(--shell-helix-w);grid-template-areas:"bar bar bar""rail canvas helix";min-height:100vh;}
    html[data-theme-core] body.v2-core-shell.helix-is-collapsed #helix-panel .helix-head .zh,
    html[data-theme-core] body.v2-core-shell.helix-is-collapsed #helix-panel .helix-head .en,
    html[data-theme-core] body.v2-core-shell.helix-is-collapsed #helix-panel .helix-head .state-pill,
    html[data-theme-core] body.v2-core-shell.helix-is-collapsed #helix-panel .helix-block:not(.helix-head){display:none !important;}
    html[data-theme-core] body.v2-core-shell.helix-is-collapsed #helix-panel{padding:10px 8px !important;}
    html[data-theme-core] body.v2-core-shell.helix-is-expanded #helix-panel .helix-composer-multimodal{display:grid !important;}
    html[data-theme-core] #global-bar{grid-area:bar;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:10;}
    html[data-theme-core] #organization-rail{grid-area:rail;border-right:1px solid var(--line);background:var(--panel-2);padding:12px 10px;overflow:auto;}
    html[data-theme-core] #office-canvas{grid-area:canvas;overflow:auto;min-height:0;background:var(--canvas-floor);}
    html[data-theme-core] #helix-panel{grid-area:helix;border-left:1px solid var(--line);background:var(--panel);padding:12px 12px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px;}
    html[data-theme-core] .helix-tri-toggle{display:inline-flex;gap:3px;align-items:center;padding:2px 3px;border-radius:7px;border:1px solid var(--line);background:var(--panel-2);}
    html[data-theme-core] .helix-tri-toggle .tt-btn{width:22px;height:22px;border-radius:5px;border:0;cursor:pointer;background:transparent;color:var(--text-muted);display:grid;place-items:center;}
    html[data-theme-core] .helix-tri-toggle .tt-btn:hover{color:var(--orchestrator);}
    html[data-theme-core] .helix-tri-toggle .tt-btn.active{background:color-mix(in srgb, var(--orchestrator) 14%, transparent);color:var(--orchestrator);}
    html[data-theme-core] .helix-composer-multimodal{display:none;grid-template-columns:repeat(5, 1fr) auto;gap:4px;margin-top:4px;padding:6px 7px;border:1px dashed var(--line);border-radius:8px;background:color-mix(in srgb, var(--panel-2) 60%, transparent);}
    html[data-theme-core] .helix-composer-multimodal .mm-btn{display:inline-flex;align-items:center;justify-content:center;height:22px;padding:0 6px;border-radius:5px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:not-allowed;font-size:10px;font-weight:700;letter-spacing:.04em;}
    html[data-theme-core] .helix-composer-multimodal .mm-hint{font-size:9.5px;color:var(--text-muted);align-self:center;justify-self:end;font-style:italic;}
    html[data-theme-core] .inspector-backdrop{position:fixed;inset:0;background:rgba(8,12,24,.35);z-index:58;display:none;}
    html[data-theme-core] .inspector-backdrop.open{display:block;}
    html[data-theme-core] .inspector-pop{position:fixed;z-index:60;min-width:320px;max-width:420px;max-height:calc(100vh - 40px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 48px rgba(20,28,48,.28),0 2px 0 rgba(255,255,255,.4) inset;display:grid;gap:10px;padding:14px 14px 16px;animation:inspector-in 260ms var(--ease, ease-out) both;}
    html[data-theme-core] .inspector-pop.drawer{position:fixed;left:0 !important;right:0 !important;top:auto !important;bottom:0;width:100%;max-width:100%;min-width:100%;border-radius:14px 14px 0 0;max-height:86vh;animation:drawer-in 280ms var(--ease, ease-out) both;}
    html[data-theme-core] .inspector-head{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;}
    html[data-theme-core] .inspector-title{font-size:13px;font-weight:800;color:var(--text);letter-spacing:.02em;}
    html[data-theme-core] .inspector-sub{font-size:10.5px;color:var(--text-muted);margin-top:1px;}
    html[data-theme-core] .inspector-close{width:24px;height:24px;border-radius:7px;border:1px solid var(--line);background:var(--panel-2);color:var(--text-muted);cursor:pointer;display:grid;place-items:center;}
    html[data-theme-core] .inspector-close:hover{color:var(--text);border-color:var(--accent);}
    html[data-theme-core] .inspector-section h5{margin:0 0 5px;font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.16em;text-transform:uppercase;}
    html[data-theme-core] .inspector-kv{display:grid;grid-template-columns:86px 1fr;gap:4px 10px;}
    html[data-theme-core] .inspector-kv .k{font-size:10.5px;color:var(--text-muted);font-weight:600;align-self:start;padding-top:3px;}
    html[data-theme-core] .inspector-kv .v{font-size:11.5px;color:var(--text);line-height:16px;}
    html[data-theme-core] .inspector-list{list-style:none;margin:0;padding:0;display:grid;gap:5px;}
    html[data-theme-core] .inspector-list li{padding:5px 7px;border-radius:7px;background:var(--panel-2);border:1px solid var(--line);font-size:11px;color:var(--text);line-height:15px;display:grid;grid-template-columns:56px 1fr;gap:6px;}
    html[data-theme-core] .inspector-list li .t{font-size:10px;color:var(--text-muted);font-weight:700;}
    html[data-theme-core] .inspector-evidence{padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:color-mix(in srgb, var(--panel-2) 70%, transparent);}
    html[data-theme-core] .inspector-evidence .ev-row{display:grid;grid-template-columns:auto 1fr auto;gap:6px;align-items:center;padding:3px 0;border-bottom:1px dashed var(--line);font-size:10.5px;}
    html[data-theme-core] .inspector-evidence .ev-row:last-child{border-bottom:0;}
    html[data-theme-core] .inspector-evidence .tag{display:inline-block;padding:1px 6px;border-radius:999px;font-size:9.5px;font-weight:800;letter-spacing:.06em;}
    html[data-theme-core] .inspector-evidence .tag.static{background:color-mix(in srgb, var(--offline) 14%, transparent);color:var(--offline);}
    html[data-theme-core] .inspector-evidence .tag.ui{background:color-mix(in srgb, var(--reviewing) 14%, transparent);color:var(--reviewing);}
    html[data-theme-core] .inspector-evidence .tag.behavior{background:color-mix(in srgb, var(--working) 14%, transparent);color:var(--working);}
    html[data-theme-core] .inspector-evidence .tag.e2e{background:color-mix(in srgb, var(--done) 14%, transparent);color:var(--done);}
    @keyframes drawer-in{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}
    html[data-theme-core] .brand-block{display:grid;grid-template-columns:auto 1fr;gap:0 8px;align-items:center;}
    html[data-theme-core] .brand-block .wordmark{font-size:14px;font-weight:700;color:var(--text);letter-spacing:.02em;}
    html[data-theme-core] .brand-block .wordmark-sub{font-size:10.5px;color:var(--text-muted);line-height:13px;}
    html[data-theme-core] .brand-block .tagline{display:none;}
    html[data-theme-core] .chip-group{display:inline-flex;flex-wrap:wrap;gap:5px;}
    html[data-theme-core] .sep{width:1px;height:20px;background:var(--line);margin:0 2px;}
    html[data-theme-core] .grow{flex:1 1 auto;}
    html[data-theme-core] .pill-runtime{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);}
    html[data-theme-core] .pill-runtime.live{color:var(--done);}
    html[data-theme-core] .pill-runtime.fake{color:var(--waiting-human);}
    html[data-theme-core] .pill-runtime.demo{color:var(--thinking);}
    html[data-theme-core] .pill-runtime.off{color:var(--blocked);}
    html[data-theme-core] .pill-wait{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;background:color-mix(in srgb, var(--waiting-human) 16%, transparent);color:var(--waiting-human);border:1px solid color-mix(in srgb, var(--waiting-human) 40%, var(--line));font-size:11px;font-weight:600;}
    html[data-theme-core] .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;}
    html[data-theme-core] .icon-btn:hover{color:var(--text);border-color:var(--accent);}
    html[data-theme-core] .rail-section{padding-bottom:12px;margin-bottom:10px;border-bottom:1px solid var(--line);}
    html[data-theme-core] .rail-section:last-child{border-bottom:0;margin-bottom:0;}
    html[data-theme-core] .rail-section h3{margin:0 0 6px;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.16em;text-transform:uppercase;}
    html[data-theme-core] .rail-item{display:grid;grid-template-columns:24px 1fr auto;gap:6px;align-items:center;padding:5px 6px;border-radius:7px;cursor:pointer;}
    html[data-theme-core] .rail-item:hover{background:var(--panel);}
    html[data-theme-core] .rail-item.nav-item.is-active{background:color-mix(in srgb, var(--orchestrator) 10%, var(--panel));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--orchestrator) 35%, var(--line));}
    html[data-theme-core] .rail-item.small{padding:4px 5px;}
    html[data-theme-core] .rail-item.small.muted .title{font-size:10.5px;}
    html[data-theme-core] .rail-item .meta{font-size:10.5px;color:var(--text-muted);}
    html[data-theme-core] .rail-item .title{font-size:12.5px;color:var(--text);font-weight:600;}
    html[data-theme-core] .rail-muted{padding:4px 6px;font-size:11px;color:var(--text-muted);}
    html[data-theme-core] .helix-head{display:grid;grid-template-columns:32px 1fr auto;gap:8px;align-items:center;}
    html[data-theme-core] .helix-head .sys{font-size:11px;color:var(--orchestrator);font-weight:800;letter-spacing:.16em;}
    html[data-theme-core] .helix-head .zh{font-size:13px;font-weight:700;color:var(--text);}
    html[data-theme-core] .helix-head .en{font-size:10px;color:var(--text-muted);}
    html[data-theme-core] .helix-conv{display:flex;flex-direction:column;gap:6px;}
    html[data-theme-core] .helix-msg{padding:6px 8px;border-radius:8px;font-size:11.5px;line-height:16px;}
    html[data-theme-core] .helix-msg.helix{background:var(--panel-2);border:1px solid var(--line);color:var(--text);}
    html[data-theme-core] .helix-msg.user{background:color-mix(in srgb, var(--accent) 16%, var(--panel-2));border:1px solid color-mix(in srgb, var(--accent) 45%, var(--line));color:var(--text);margin-left:18px;}
    html[data-theme-core] .helix-composer{display:grid;grid-template-columns:1fr auto;gap:5px;}
    html[data-theme-core] .helix-composer textarea{background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 8px;resize:vertical;font:inherit;font-size:11.5px;line-height:15px;}
    html[data-theme-core] .helix-composer button{background:var(--orchestrator);color:#fff;border:0;border-radius:8px;padding:0 12px;font-weight:700;cursor:pointer;font-size:11.5px;}
    html[data-theme-core] .helix-list{margin:0;padding-left:18px;display:grid;gap:5px;}
    html[data-theme-core] .helix-list li{font-size:11.5px;color:var(--text);line-height:16px;}
    html[data-theme-core] .helix-block h4{margin:0 0 6px;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.16em;text-transform:uppercase;}
    html[data-theme-core] .mobile-nav{display:none;position:fixed;left:0;right:0;bottom:0;height:54px;background:var(--panel);border-top:1px solid var(--line);z-index:30;grid-template-columns:repeat(4,1fr);}
    html[data-theme-core] .mobile-nav .nav-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:0;color:var(--text-muted);cursor:pointer;font-size:10px;font-weight:600;}
    html[data-theme-core] .mobile-nav .nav-btn.active{color:var(--orchestrator);}
    html[data-theme-core] .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(10,16,32,.45);z-index:40;}
    html[data-theme-core] .drawer-overlay.open{display:block;}
    html[data-theme-core] .helix-drawer{position:fixed;top:0;right:0;bottom:0;width:min(92vw, 320px);background:var(--panel);border-left:1px solid var(--line);transform:translateX(100%);transition:transform var(--dur-base) var(--ease);z-index:41;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto;}
    html[data-theme-core] .helix-drawer.open{transform:translateX(0);}
    @media (max-width:1024px){
      html[data-theme-core] body.v2-core-shell{grid-template-columns:0 1fr;grid-template-rows:var(--shell-bar-h) 1fr;grid-template-areas:"bar bar""canvas canvas";}
      html[data-theme-core] #organization-rail{display:none;}
      html[data-theme-core] #helix-panel{display:none;}
      html[data-theme-core] .icon-btn.helix-toggle{display:inline-flex;}
    }
    @media (min-width:1025px){
      html[data-theme-core] .icon-btn.helix-toggle{display:none;}
    }
    @media (max-width:640px){
      html[data-theme-core] body.v2-core-shell{grid-template-columns:1fr;grid-template-rows:var(--shell-bar-h) 1fr var(--shell-bar-h);grid-template-areas:"bar""canvas""nav";padding-bottom:54px;}
      html[data-theme-core] .mobile-nav{display:grid;grid-area:nav;}
      html[data-theme-core] .brand-block .wordmark-sub{display:none;}
      html[data-theme-core] #global-bar{padding:0 6px;gap:4px;}
      html[data-theme-core] #global-bar .sep+a,html[data-theme-core] #global-bar .sep+a~.pill-runtime,html[data-theme-core] #global-bar .workspace-chip{display:none;}
    }
    html[data-theme-core] .theme-select{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:7px;padding:3px 5px;font:inherit;font-size:11px;}`
    document.head.appendChild(s)
  }

  function renderThemeSwitcher(currentId, onChange) {
    const wrap = el('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } })
    const label = el('span', { style: { fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '.1em' } }, '主题')
    const sel = el('select', { class: 'theme-select', 'aria-label': '主题选择器' })
    sel.innerHTML = `
      <optgroup label="智序 · Core">
        <option value="core" ${currentId === 'core' ? 'selected' : ''}>智序 · Core</option>
      </optgroup>
      <optgroup label="经典主题 / Classic Themes">
        ${CLASSIC_SKIN_ORDER.map(([id, name]) => `<option value="${id}" ${currentId === id ? 'selected' : ''}>${name}</option>`).join('')}
      </optgroup>
    `
    sel.addEventListener('change', () => onChange(sel.value))
    wrap.appendChild(label)
    wrap.appendChild(sel)
    return wrap
  }

  function renderGlobalBar({ runtime, currentThemeId, onThemeChange, onToggleHelix, onHelixTriState, helixMode, mode }) {
    const bar = el('header', { id: 'global-bar' })
    const demoBanner = mode === 'demo'
      ? el('span', { style: { display:'inline-flex',alignItems:'center',gap:'5px',padding:'2px 8px',borderRadius:'999px',fontSize:'11px',fontWeight:'700',border:'1px solid var(--thinking)',background:'color-mix(in srgb, var(--thinking) 16%, transparent)',color:'var(--thinking)',letterSpacing:'.08em' } }, '● 演示数据 · DEMO')
      : null
    const brand = el('div', { class: 'brand-block' }, `
      <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,color-mix(in srgb,var(--orchestrator) 55%,var(--accent)),var(--orchestrator));display:grid;place-items:center;color:#fff;font-weight:900;">序</div>
      <div>
        <div class="wordmark">智序工场</div>
        <div class="wordmark-sub">Virtual AI Office</div>
      </div>
    `)
    const wsChip = el('span', { class: 'workspace-chip pill-runtime', title: String(runtime.workspace.path || '') }, `${esc(runtime.workspace.name || '当前工作区')} · ${esc(runtime.project.name || '未指定项目')}`)
    const status = ['live','fake','demo','off','connecting'].includes(runtime.runtimeStatus) ? runtime.runtimeStatus : 'connecting'
    const statusText = status === 'live' ? '● 已连接' : status === 'fake' ? '● 彩排模式' : status === 'demo' ? '● 演示' : status === 'off' ? '● 断开' : '● 连接中'
    const runtimePill = el('span', { class: `pill-runtime ${status}` }, statusText)
    const waiting = runtime.waitingHuman?.length
      ? el('span', { class: 'pill-wait' }, `👋 等待人类 · ${runtime.waitingHuman.length}`)
      : null
    const helixTri = el('div', { class: 'helix-tri-toggle', title: 'Helix 面板宽度：折叠 / 紧凑 / 展开', 'aria-label': 'Helix 面板宽度切换' }, `
      <button type="button" class="tt-btn tri-collapse${helixMode === 'collapsed' ? ' active' : ''}" data-tri="collapsed" title="折叠 Helix (68px)" aria-label="折叠 Helix">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 3 L5 8 L9 13" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="tt-btn tri-compact${helixMode === 'compact' ? ' active' : ''}" data-tri="compact" title="紧凑 Helix (280px)" aria-label="紧凑 Helix">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.5" y="3" width="7" height="10" rx="1.6"/></svg>
      </button>
      <button type="button" class="tt-btn tri-expand${helixMode === 'expanded' ? ' active' : ''}" data-tri="expanded" title="展开 Helix (392px)" aria-label="展开 Helix">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 3 L11 8 L7 13" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `)
    helixTri.querySelectorAll('.tt-btn').forEach((b) => b.addEventListener('click', () => onHelixTriState?.(b.getAttribute('data-tri'))))
    const notifBtn = el('button', { class: 'icon-btn', title: '通知', 'aria-label': '通知' }, `
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2.5 a4.5 4.5 0 0 0 -4.5 4.5 v3 l-1 2 h11 l-1 -2 v-3 a4.5 4.5 0 0 0 -4.5 -4.5 z"/><path d="M7 13 a1 1 0 0 0 2 0" stroke-linecap="round"/></svg>
    `)
    const setBtn = el('button', { class: 'icon-btn', title: '设置', 'aria-label': '设置' }, `
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5 L8 3.2 M8 12.8 L8 14.5 M14.5 8 L12.8 8 M3.2 8 L1.5 8 M12.9 3.1 L11.7 4.3 M4.3 11.7 L3.1 12.9 M12.9 12.9 L11.7 11.7 M4.3 4.3 L3.1 3.1"/></svg>
    `)
    const helixBtn = el('button', { class: 'icon-btn helix-toggle', title: '打开 Helix 面板', 'aria-label': '打开 Helix 面板', onClick: onToggleHelix }, `
      <svg viewBox="0 0 16 16" width="16" height="16">${States?.GLYPHS?.roleIconHelix || ''}</svg>
    `)
    const themeSwitcher = renderThemeSwitcher(currentThemeId, onThemeChange)
    const grow = el('div', { class: 'grow' })
    const sep1 = el('div', { class: 'sep' })
    const sep2 = el('div', { class: 'sep' })
    const sep3 = el('div', { class: 'sep' })
    const sep4 = el('div', { class: 'sep' })
    bar.appendChild(brand)
    if (demoBanner) { bar.appendChild(sep4); bar.appendChild(demoBanner) }
    bar.appendChild(sep1)
    bar.appendChild(wsChip)
    bar.appendChild(sep2)
    bar.appendChild(runtimePill)
    if (waiting) bar.appendChild(waiting)
    bar.appendChild(grow)
    bar.appendChild(helixTri)
    bar.appendChild(sep3)
    bar.appendChild(helixBtn)
    bar.appendChild(notifBtn)
    bar.appendChild(setBtn)
    bar.appendChild(themeSwitcher)
    return bar
  }

  function renderRail({ runtime, onPickSeat, onNavigate, activeNav = 'office' }) {
    const rail = el('aside', { id: 'organization-rail', 'aria-label': '导航 Nav' })
    const wsName = runtime?.workspace?.name || '当前工作区'
    const projName = runtime?.project?.name || '未指定项目'
    const wsSec = el('div', { class: 'rail-section' })
    wsSec.appendChild(el('h3', {}, 'Workspace · 工作区'))
    wsSec.appendChild(el('div', { class: 'rail-item rail-workspace' }, `
      <span style="width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,color-mix(in srgb,var(--orchestrator) 55%,var(--accent)),var(--orchestrator));display:grid;place-items:center;color:#fff;font-weight:900;font-size:12px;">序</span>
      <div style="min-width:0;">
        <div class="title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(wsName)}</div>
        <div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(projName)}</div>
      </div>
      <span style="width:8px;height:8px;border-radius:999px;background:${runtime?.runtimeStatus === 'live' ? 'var(--done)' : 'var(--thinking)'};"></span>
    `))
    rail.appendChild(wsSec)

    const navSec = el('div', { class: 'rail-section' })
    navSec.appendChild(el('h3', {}, 'Navigate · 导航'))
    const navItems = [
      { id: 'office', label: '办公室', sub: 'Office', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 13 L2 7 L8 3 L14 7 L14 13"/><path d="M6 13 V9 H10 V13"/></svg>` },
      { id: 'tasks', label: '任务', sub: 'Tasks', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M6 6.5 H11 M6 9.5 H11"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/></svg>` },
      { id: 'team', label: '团队', sub: 'Team', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="5.5" cy="6" r="2"/><circle cx="11" cy="6.6" r="1.6"/><path d="M2 13.5 C2.5 10.8 4.2 9.6 5.5 9.6 C6.8 9.6 8.5 10.8 9 13.5" stroke-linecap="round"/><path d="M8.8 13.7 c.3-1.9 1.4-3.1 2.6-3.1 c1.2 0 2.6 1.1 2.6 3.1" stroke-linecap="round"/></svg>` },
      { id: 'activity', label: '活动', sub: 'Activity', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1.5 8 H5.2 L6.5 4.5 L9.5 11.5 L10.8 8 H14.5" stroke-linejoin="round" stroke-linecap="round"/></svg>` },
      { id: 'approvals', label: '审批', sub: 'Approvals', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3 H10 L13 6 V13 H3 Z"/><path d="M10 3 V6 H13"/><path d="M5.5 9.5 L7.5 11.5 L11.5 7.5"/></svg>` },
      { id: 'files', label: '文件', sub: 'Files', glyph: `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2.5 2.5 H9 L11 4.5 V13.5 H2.5 Z" stroke-linejoin="round"/></svg>` },
    ]
    for (const item of navItems) {
      const active = activeNav === item.id
      const node = el('div', {
        class: 'rail-item nav-item' + (active ? ' is-active' : ''),
        'data-nav': item.id,
        onClick: () => onNavigate?.(item.id),
        title: item.label,
      }, `
        <span class="nav-glyph" style="width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:${active ? 'var(--orchestrator)' : 'var(--text-muted)'};background:${active ? 'color-mix(in srgb, var(--orchestrator) 14%, transparent)' : 'transparent'};">${item.glyph}</span>
        <div style="min-width:0;">
          <div class="title" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${active ? 'var(--text)' : 'var(--text)'};">${esc(item.label)}</div>
          <div class="meta" style="font-size:10.5px;">${esc(item.sub)}</div>
        </div>
      `)
      navSec.appendChild(node)
    }
    rail.appendChild(navSec)

    const staffCount = ((runtime?.members?.human?.length || 0) + (runtime?.members?.ai?.length || 0))
    const teamSec = el('div', { class: 'rail-section', style: 'opacity:.9;' })
    teamSec.appendChild(el('h3', {}, `Team · 团队（${staffCount}）`))
    if (staffCount === 0) {
      teamSec.appendChild(el('div', { class: 'rail-muted' }, '—'))
    } else {
      const people = [
        ...((runtime?.members?.human || []).slice(0, 2).map((m) => ({ ...m, _k: 'human' }))),
        ...((runtime?.members?.ai || []).slice(0, 3).map((m) => ({ ...m, _k: 'ai' }))),
      ].slice(0, 4)
      for (const p of people) {
        teamSec.appendChild(el('div', { class: 'rail-item small', title: String(p.name || '') }, `
          ${memberAvatar(p, p._k || 'ai')}
          <div style="min-width:0;">
            <div class="title" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name || '')}</div>
          </div>
          <span style="width:7px;height:7px;border-radius:999px;background:${p.online ? (p._k === 'human' ? 'var(--done)' : 'var(--thinking)') : 'var(--offline)'};"></span>
        `))
      }
      if ((runtime?.members?.human?.length || 0) + (runtime?.members?.ai?.length || 0) > people.length) {
        const r = Chars?.role('team') || { zh: '更多', en: 'More' }
        teamSec.appendChild(el('div', { class: 'rail-item small muted', onClick: () => onNavigate?.('team') }, `
          <span style="width:24px;height:24px;border-radius:7px;background:var(--panel);border:1px dashed var(--line);display:grid;place-items:center;color:var(--text-muted);font-size:11px;font-weight:700;">+${((runtime?.members?.human?.length || 0) + (runtime?.members?.ai?.length || 0)) - people.length}</span>
          <div><div class="title" style="font-size:11.5px;color:var(--text-muted);">在「团队」查看全部</div></div>
        `))
      }
    }
    rail.appendChild(teamSec)

    return rail
  }

  const DEMO_ROLE_INSPECT = Object.freeze({
    product:   { member: '李产品',  kind: 'human', model: null,   tools: ['需求访谈', 'Figma 走查', '原型评审'],       state: 'WAITING_HUMAN', task: 'T-101 · 规格对比表签字',     since: Date.now() - 22 * 60000 },
    architect: { member: 'Codex',    kind: 'ai',    model: 'demo-model-v1', tools: ['C4 建模', '接口契约', '技术选型'],     state: 'THINKING',      task: 'T-104 · A2 画布结构评审',    since: Date.now() - 6 * 60000 },
    frontend:  { member: 'Claude',   kind: 'ai',    model: 'demo-model-v1', tools: ['组件库', 'Playwright', 'Core SVG'],   state: 'WORKING',       task: 'T-102 · 检查器弹窗交互',     since: Date.now() - 3 * 60000 },
    backend:   { member: 'DeepSeek', kind: 'ai',    model: 'demo-model-v1', tools: ['NestJS', 'DTO 校验', 'Supabase'],     state: 'WORKING',       task: 'T-103 · 附件状态机',          since: Date.now() - 11 * 60000 },
    qa:        { member: '王测试',   kind: 'human', model: null,   tools: ['6 设备矩阵', 'BEHAVIORAL_TEST', 'VIS'], state: 'REVIEWING',     task: 'T-105 · 视觉 10 场景回归',   since: Date.now() - 8 * 60000 },
    reviewer:  { member: '张审查',   kind: 'human', model: null,   tools: ['Diff 统一视图', 'CODE_REVIEW', '风险'],  state: 'REVIEWING',     task: 'T-106 · A2 PR 代码审阅',     since: Date.now() - 16 * 60000 },
    docs:      { member: 'Gemini',   kind: 'ai',    model: 'demo-model-v1', tools: ['i18n zh/en/km', 'MDX', 'Wiki'],       state: 'IDLE',          task: null,                            since: Date.now() - 41 * 60000 },
    helix:     { member: 'Helix 系统编排中枢', kind: 'ai', model: 'orchestrator-v2', tools: ['调度', '状态机', '证据汇总'],      state: 'THINKING',      task: 'ROOT · 全局编排',              since: Date.now() - 1 * 60000 },
  })

  const DEMO_TASK_INSPECT = Object.freeze({
    'T-101': { id: 'T-101', name: '规格 §5.1 颜色 token 对比表签字', owner: '李产品',  state: 'WAITING_HUMAN', deps: ['T-099'],  exec: '人类走查中',      evidence: 'STATIC_CHECK', review: '待审查', waiting: '李产品 签字确认', at: Date.now() - 22 * 60000 },
    'T-102': { id: 'T-102', name: 'Role/Task Inspector 弹窗交互',       owner: 'Claude',   state: 'WORKING',       deps: ['T-100'],  exec: '前端实现中',     evidence: 'UI_CAPTURE',    review: '待审查', waiting: null,              at: Date.now() - 3 * 60000 },
    'T-103': { id: 'T-103', name: '附件 BINDING_STATUS 三态机',          owner: 'DeepSeek', state: 'WORKING',       deps: [],          exec: '服务端单测 7/9', evidence: 'BEHAVIORAL_TEST', review: '待审查', waiting: null,        at: Date.now() - 11 * 60000 },
    'T-104': { id: 'T-104', name: 'A2 画布布局结构评审',                 owner: 'Codex',    state: 'THINKING',      deps: ['T-102'],  exec: '阅读结构中',     evidence: 'STATIC_CHECK',   review: '待审查', waiting: null,          at: Date.now() - 6 * 60000 },
    'T-105': { id: 'T-105', name: '视觉 10 场景 (A-J) 回归',             owner: '王测试',   state: 'REVIEWING',     deps: ['T-102'],  exec: '截图对比 4/10', evidence: 'END_TO_END_TEST', review: '审查中', waiting: null,       at: Date.now() - 8 * 60000 },
    'T-106': { id: 'T-106', name: 'visual-v2/interactive-office-a2 审阅', owner: '张审查',   state: 'REVIEWING',     deps: ['T-102','T-105'], exec: 'Diff 阅读中', evidence: 'STATIC_CHECK',  review: '审查中', waiting: null,       at: Date.now() - 16 * 60000 },
    'DEMO-104': { id: 'DEMO-104', name: '【DEMO】Helix 调度证据链样例',   owner: 'Helix',    state: 'REVIEWING',     deps: ['T-104','T-105','T-106'], exec: '多角色会议中', evidence: 'END_TO_END_TEST', review: '审查中', waiting: '等待产品最终签字', at: Date.now() - 2 * 60000 },
  })

  const DEMO_RECENT_ACTIVITY = Object.freeze([
    { at: Date.now() - 3 * 60000,   text: 'Claude：Inspector 弹窗 CSS 调整完成' },
    { at: Date.now() - 6 * 60000,   text: 'Codex：输出 A2 结构评审意见 v1' },
    { at: Date.now() - 11 * 60000,  text: 'DeepSeek：附件 UNCLAIMED → ATTACHED 状态迁移' },
    { at: Date.now() - 16 * 60000,  text: '张审查：开始 A2 PR 审阅' },
    { at: Date.now() - 22 * 60000,  text: '李产品：收到签字提醒（未处理）' },
    { at: Date.now() - 41 * 60000,  text: 'Gemini：文档站 zh 同步完成' },
  ])

  const DEMO_EVIDENCE_ROWS = Object.freeze([
    { k: 'VIS-A',  label: '静态结构检查 · A1',      kind: 'STATIC_CHECK',    status: 'PASS' },
    { k: 'VIS-H',  label: 'Inspector Role 截图',    kind: 'UI_CAPTURE',      status: 'PASS' },
    { k: 'BEH-3',  label: '点击角色→检查器打开',    kind: 'BEHAVIORAL_TEST', status: 'RUNNING' },
    { k: 'E2E-AJ', label: 'A→J 10 场景走查',        kind: 'END_TO_END_TEST', status: 'PENDING' },
  ])

  function tagClassForEvidenceKind(k) {
    if (k === 'STATIC_CHECK') return 'static'
    if (k === 'UI_CAPTURE') return 'ui'
    if (k === 'BEHAVIORAL_TEST') return 'behavior'
    if (k === 'END_TO_END_TEST') return 'e2e'
    if (k === 'LIVE_PROVIDER_TEST') return 'e2e'
    return 'static'
  }

  function renderInspectorBackdrop() {
    let bd = document.querySelector('.inspector-backdrop')
    if (!bd) {
      bd = el('div', { class: 'inspector-backdrop', role: 'presentation' })
      document.body.appendChild(bd)
    }
    return bd
  }

  function positionInspectorPop(pop, anchorRect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const useDrawer = vw < 1024 || vh < 520
    if (useDrawer) { pop.classList.add('drawer'); return }
    pop.classList.remove('drawer')
    const popRect = pop.getBoundingClientRect()
    const margin = 12
    const pad = 8
    let top = (anchorRect?.top ?? 60) + (anchorRect?.height ?? 0) + pad
    let left = (anchorRect?.left ?? 60) + (anchorRect?.width ?? 0) + pad
    if (left + popRect.width + margin > vw) left = Math.max(margin, (anchorRect?.left ?? 60) - popRect.width - pad)
    if (top + popRect.height + margin > vh) top = Math.max(margin, vh - popRect.height - margin)
    left = Math.max(margin, Math.min(vw - popRect.width - margin, left))
    top = Math.max(margin, Math.min(vh - popRect.height - margin, top))
    pop.style.left = left + 'px'
    pop.style.top = top + 'px'
  }

  function closeInspectorPop() {
    const pop = document.querySelector('.inspector-pop')
    const bd = document.querySelector('.inspector-backdrop.open')
    if (pop) pop.remove()
    if (bd) bd.classList.remove('open')
  }

  function renderRoleInspector(roleId, mode, anchorRect) {
    if (!roleId) return
    const role = Chars?.ROLES?.[roleId] || Chars?.role(roleId) || { zh: String(roleId), en: String(roleId) }
    const info = DEMO_ROLE_INSPECT[roleId] || { member: '未分配', kind: 'unknown', model: null, tools: [], state: 'OFFLINE', task: null, since: null }
    const useFixtures = mode === 'demo'
    const honestMember = useFixtures ? info.member : (info.kind === 'ai' ? '（尚未配置）' : '（尚未邀请）')
    const honestState = useFixtures ? info.state : 'OFFLINE'
    const honestTask = useFixtures ? info.task : null
    const honestTools = useFixtures ? info.tools : []
    const honestModel = useFixtures ? info.model : null
    const honestRecent = useFixtures ? DEMO_RECENT_ACTIVITY.slice(0, 4) : []
    closeInspectorPop()
    const bd = renderInspectorBackdrop()
    bd.classList.add('open')
    const badge = info.kind === 'human'
      ? States?.BADGE?.human({ size: 22 })
      : info.kind === 'ai' ? States?.BADGE?.ai({ size: 22 }) : '<span style="width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);color:var(--text-muted);font-size:10px;font-weight:800;">?</span>'
    const pop = el('div', { class: 'inspector-pop role-inspector', role: 'dialog', 'aria-label': `角色检查器 · ${role.zh || roleId}`, 'data-role': roleId })
    pop.innerHTML = `
      <div class="inspector-head">
        <div style="width:34px;height:34px;border-radius:10px;background:color-mix(in srgb, ${info.kind === 'human' ? 'var(--done)' : 'var(--orchestrator)'} 16%, var(--panel-2));border:1px solid var(--line);display:grid;place-items:center;">${badge}</div>
        <div style="min-width:0;">
          <div class="inspector-title">${esc(role.zh || roleId)} · ${esc(role.en || roleId)}</div>
          <div class="inspector-sub">${honestMember ? esc(honestMember) : '—'} ${info.kind === 'human' ? '· 人类' : info.kind === 'ai' ? '· AI Agent' : ''}</div>
        </div>
        <button type="button" class="inspector-close" aria-label="关闭检查器" title="关闭">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4 L12 12 M12 4 L4 12" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="inspector-section">
        <div class="inspector-kv">
          <div class="k">角色</div><div class="v">${esc(role.zh || roleId)} <span style="color:var(--text-muted);font-size:10px;">(${esc(role.en || roleId)})</span></div>
          <div class="k">成员</div><div class="v">${honestMember ? esc(honestMember) : '<span style="color:var(--text-muted);">尚未分配</span>'}</div>
          <div class="k">类型</div><div class="v">${info.kind === 'human' ? '人类 Human 👤' : info.kind === 'ai' ? 'AI Agent 🤖' : '未知'}</div>
          ${honestModel ? `<div class="k">模型</div><div class="v"><span style="font-family:var(--mono,monospace);font-size:10.5px;">${esc(honestModel)}</span></div>` : ''}
          <div class="k">当前状态</div><div class="v">${statePill(honestState)}</div>
          <div class="k">当前任务</div><div class="v">${honestTask ? esc(honestTask) : '<span style="color:var(--text-muted);">— 空闲 —</span>'}</div>
        </div>
      </div>
      ${honestTools.length ? `<div class="inspector-section">
        <h5>能力 / 工具 · Capabilities</h5>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${honestTools.map((t) => `<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);font-size:10.5px;color:var(--text);">${esc(t)}</span>`).join('')}
        </div>
      </div>` : ''}
      ${honestRecent.length ? `<div class="inspector-section">
        <h5>最近活动 · Recent</h5>
        <ul class="inspector-list">
          ${honestRecent.map((x) => `<li><span class="t">${esc(ago(x.at))}</span><span>${esc(String(x.text || '').slice(0, 160))}</span></li>`).join('')}
        </ul>
      </div>` : ''}
      <div class="inspector-section">
        <h5>证据汇总 · Evidence</h5>
        <div class="inspector-evidence">
          ${DEMO_EVIDENCE_ROWS.map((row) => `<div class="ev-row">
            <span class="tag ${tagClassForEvidenceKind(row.kind)}">${esc(row.k)}</span>
            <span style="color:var(--text);">${esc(row.label)}</span>
            <span style="font-weight:800;font-size:10.5px;color:${row.status === 'PASS' ? 'var(--done)' : row.status === 'RUNNING' ? 'var(--working)' : row.status === 'FAIL' ? 'var(--blocked)' : 'var(--text-muted)'};">${esc(row.status)}</span>
          </div>`).join('')}
        </div>
      </div>
    `
    document.body.appendChild(pop)
    pop.querySelector('.inspector-close').addEventListener('click', closeInspectorPop)
    bd.addEventListener('click', closeInspectorPop)
    pop.addEventListener('click', (e) => e.stopPropagation())
    positionInspectorPop(pop, anchorRect)
    window.addEventListener('resize', () => positionInspectorPop(pop, anchorRect), { once: false })
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { closeInspectorPop(); document.removeEventListener('keydown', onEsc) } }, { once: true })
    return pop
  }

  function renderTaskInspector(taskId, mode, anchorRect) {
    if (!taskId) return
    const task = DEMO_TASK_INSPECT[taskId] || { id: taskId, name: '未知任务', owner: '—', state: 'OFFLINE', deps: [], exec: '—', evidence: 'NOT_VERIFIED', review: '—', waiting: null, at: Date.now() }
    const useFixtures = mode === 'demo'
    const honest = useFixtures ? task : { ...task, owner: '—', exec: '尚未开始', review: '—', waiting: null, deps: [], name: task.name || '未命名任务' }
    closeInspectorPop()
    const bd = renderInspectorBackdrop()
    bd.classList.add('open')
    const pop = el('div', { class: 'inspector-pop task-inspector', role: 'dialog', 'aria-label': `任务检查器 · ${task.id}`, 'data-task': taskId })
    pop.innerHTML = `
      <div class="inspector-head">
        <div style="width:34px;height:34px;border-radius:10px;background:color-mix(in srgb, var(--working) 14%, var(--panel-2));border:1px solid var(--line);display:grid;place-items:center;color:var(--working);font-weight:900;font-size:12px;">T</div>
        <div style="min-width:0;">
          <div class="inspector-title">${esc(honest.id)} · ${esc(String(honest.name || '').slice(0, 60))}</div>
          <div class="inspector-sub">Owner: ${esc(honest.owner)} · 最近更新: ${esc(ago(honest.at))}</div>
        </div>
        <button type="button" class="inspector-close" aria-label="关闭检查器" title="关闭">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4 L12 12 M12 4 L4 12" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="inspector-section">
        <div class="inspector-kv">
          <div class="k">任务名</div><div class="v" style="font-weight:700;">${esc(String(honest.name || '').slice(0, 120))}</div>
          <div class="k">状态</div><div class="v">${statePill(honest.state)}</div>
          <div class="k">负责人</div><div class="v">${esc(honest.owner)}</div>
          <div class="k">依赖</div><div class="v">${honest.deps?.length ? honest.deps.map((d) => `<span style="display:inline-block;padding:1px 6px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);font-size:10px;font-family:var(--mono,monospace);color:var(--text);margin:1px 2px 1px 0;">${esc(d)}</span>`).join('') : '<span style="color:var(--text-muted);">无</span>'}</div>
          <div class="k">执行</div><div class="v">${esc(honest.exec)}</div>
          <div class="k">证据</div><div class="v"><span class="tag ${tagClassForEvidenceKind(honest.evidence)}" style="background:color-mix(in srgb, ${honest.evidence === 'END_TO_END_TEST' ? 'var(--done)' : honest.evidence === 'BEHAVIORAL_TEST' ? 'var(--working)' : honest.evidence === 'UI_CAPTURE' ? 'var(--reviewing)' : 'var(--offline)'} 14%, transparent);color:${honest.evidence === 'END_TO_END_TEST' ? 'var(--done)' : honest.evidence === 'BEHAVIORAL_TEST' ? 'var(--working)' : honest.evidence === 'UI_CAPTURE' ? 'var(--reviewing)' : 'var(--text-muted)'};">${esc(honest.evidence)}</span></div>
          <div class="k">审查</div><div class="v">${esc(honest.review)}</div>
          ${honest.waiting ? `<div class="k">等待人类</div><div class="v" style="color:var(--waiting-human);font-weight:700;">👋 ${esc(honest.waiting)}</div>` : ''}
        </div>
      </div>
      <div class="inspector-section">
        <h5>最近活动 · Recent</h5>
        <ul class="inspector-list">
          ${(useFixtures ? DEMO_RECENT_ACTIVITY.slice(0, 3) : []).map((x) => `<li><span class="t">${esc(ago(x.at))}</span><span>${esc(String(x.text || '').slice(0, 160))}</span></li>`).join('')}
          ${(!useFixtures || !DEMO_RECENT_ACTIVITY.length) ? '<li style="color:var(--text-muted);background:transparent;border:1px dashed var(--line);grid-template-columns:1fr;">暂无活动记录</li>' : ''}
        </ul>
      </div>
      <div class="inspector-section">
        <h5>证据汇总 · Evidence</h5>
        <div class="inspector-evidence">
          ${DEMO_EVIDENCE_ROWS.map((row) => `<div class="ev-row">
            <span class="tag ${tagClassForEvidenceKind(row.kind)}">${esc(row.k)}</span>
            <span style="color:var(--text);">${esc(row.label)}</span>
            <span style="font-weight:800;font-size:10.5px;color:${row.status === 'PASS' ? 'var(--done)' : row.status === 'RUNNING' ? 'var(--working)' : row.status === 'FAIL' ? 'var(--blocked)' : 'var(--text-muted)'};">${esc(row.status)}</span>
          </div>`).join('')}
        </div>
      </div>
    `
    document.body.appendChild(pop)
    pop.querySelector('.inspector-close').addEventListener('click', closeInspectorPop)
    bd.addEventListener('click', closeInspectorPop)
    pop.addEventListener('click', (e) => e.stopPropagation())
    positionInspectorPop(pop, anchorRect)
    window.addEventListener('resize', () => positionInspectorPop(pop, anchorRect), { once: false })
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { closeInspectorPop(); document.removeEventListener('keydown', onEsc) } }, { once: true })
    return pop
  }

  function renderHelixPanel({ helix, runtime }, composer = {}) {
    const pane = el('div', { id: 'helix-panel-inner' })
    const conv = (helix.conversation || []).slice().slice(-12)
    const decisions = (helix.decisions || []).slice()
    const recent = (helix.recent || []).slice().slice(-8)
    const waiting = (runtime?.waitingHuman || []).slice()
    const st = States?.STATES?.[helix.state] || States.STATES.IDLE

    const allTasks = (runtime?._tasksCount || 0) + 0
    const metrics = {
      running: (runtime?._counts?.running) ?? 0,
      reviewing: (runtime?._counts?.reviewing) ?? (decisions.length ? 1 : 0),
      waiting: waiting.length,
      blocked: (runtime?._counts?.blocked) ?? 0,
    }

    const header = el('div', { class: 'helix-head helix-block' }, `
      <div style="width:34px;height:34px;border-radius:10px;border:1.6px double var(--orchestrator);background:linear-gradient(180deg,transparent 30%,rgba(143,130,255,0.12));display:grid;place-items:center;color:var(--orchestrator);">
        ${States?.svg('roleIconHelix', 20) || ''}
      </div>
      <div style="min-width:0;">
        <div class="sys">HELIX</div>
        <div class="zh" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(helix.header.zh)} · ${esc(helix.header.label)}</div>
        <div class="en" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(helix.header.en)}</div>
      </div>
      <div>${statePill(helix.state)}</div>
    `)
    pane.appendChild(header)

    const metricsRow = el('div', { class: 'helix-block', 'aria-label': '当前编排指标' }, `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        <div style="display:grid;gap:2px;padding:6px 6px;border-radius:8px;background:color-mix(in srgb, var(--working) 10%, transparent);border:1px solid color-mix(in srgb, var(--working) 30%, var(--line));">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--working);">Running</div>
          <div style="font-size:15px;font-weight:800;color:var(--working);line-height:1.1;">${metrics.running}</div>
        </div>
        <div style="display:grid;gap:2px;padding:6px 6px;border-radius:8px;background:color-mix(in srgb, var(--reviewing) 10%, transparent);border:1px solid color-mix(in srgb, var(--reviewing) 30%, var(--line));">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--reviewing);">Review</div>
          <div style="font-size:15px;font-weight:800;color:var(--reviewing);line-height:1.1;">${metrics.reviewing}</div>
        </div>
        <div style="display:grid;gap:2px;padding:6px 6px;border-radius:8px;background:color-mix(in srgb, var(--waiting-human) 10%, transparent);border:1px solid color-mix(in srgb, var(--waiting-human) 30%, var(--line));">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--waiting-human);">Wait</div>
          <div style="font-size:15px;font-weight:800;color:var(--waiting-human);line-height:1.1;">${metrics.waiting}</div>
        </div>
        <div style="display:grid;gap:2px;padding:6px 6px;border-radius:8px;background:color-mix(in srgb, var(--blocked) 10%, transparent);border:1px solid color-mix(in srgb, var(--blocked) 30%, var(--line));">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--blocked);">Block</div>
          <div style="font-size:15px;font-weight:800;color:var(--blocked);line-height:1.1;">${metrics.blocked}</div>
        </div>
      </div>
    `)
    pane.appendChild(metricsRow)

    const convBlock = el('div', { class: 'helix-block helix-conv' })
    convBlock.appendChild(el('h4', {}, '对话 · Conversation'))
    if (conv.length === 0) {
      convBlock.appendChild(el('div', { class: 'helix-empty-hint', style: 'font-size:11.5px;color:var(--text-muted);padding:10px 10px;border:1px dashed var(--line);border-radius:8px;text-align:center;' }, '跟 Helix 说说要做什么…'))
    } else for (const m of conv) {
      const side = m.side === 'user' ? 'user' : 'helix'
      const bubble = el('div', { class: `helix-msg ${side}` })
      if (side === 'helix') bubble.innerHTML = `<div style="font-size:9.5px;color:var(--orchestrator);letter-spacing:.12em;font-weight:800;margin-bottom:2px;">HELIX</div>${esc(String(m.text || '').slice(0, 280))}`
      else bubble.innerHTML = `<div style="font-size:9.5px;color:var(--accent);letter-spacing:.12em;font-weight:800;margin-bottom:2px;">你</div>${esc(String(m.text || '').slice(0, 280))}`
      convBlock.appendChild(bubble)
    }
    const cwrap = el('div', { class: 'helix-block' })
    cwrap.appendChild(convBlock)
    const cform = el('form', { class: 'helix-composer', onsubmit: (e) => { e.preventDefault(); const ta = cform.querySelector('textarea'); if (ta.value.trim()) composer.onSend?.(ta.value.trim()); ta.value = '' } })
    cform.innerHTML = `
      <textarea rows="2" placeholder="跟 Helix 说说要做什么…" aria-label="给 Helix 的消息" style="font-size:12px;padding:6px 8px !important;"></textarea>
      <button type="submit">发送</button>
    `
    cform.querySelector('textarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); cform.requestSubmit() }
    })
    cwrap.appendChild(cform)
    const mmPlace = el('div', { class: 'helix-composer-multimodal', 'aria-label': 'Multimodal Composer 占位边界 — 通过 PR #10 接入' })
    mmPlace.innerHTML = `
      <button type="button" class="mm-btn" title="图片 · Vision (PR #10)" disabled>🖼 IMG</button>
      <button type="button" class="mm-btn" title="文件 · DOC/XLSX/PDF (PR #10)" disabled>📄 DOC</button>
      <button type="button" class="mm-btn" title="音频 · 语音转写 (PR #10)" disabled>🎙 AUDIO</button>
      <button type="button" class="mm-btn" title="截图 · Screenshot (PR #10)" disabled>💻 SCREEN</button>
      <button type="button" class="mm-btn" title="链接 · Link Summary (PR #10)" disabled>🔗 LINK</button>
      <span class="mm-hint">Multimodal placeholder · via PR #10 边界</span>
    `
    cwrap.appendChild(mmPlace)
    pane.appendChild(cwrap)

    if (waiting.length > 0) {
      const waitBlock = el('div', { class: 'helix-block' })
      waitBlock.appendChild(el('h4', {}, `等待人类 · Waiting（${waiting.length}）`))
      for (const w of waiting.slice(0, 4)) {
        const r = Chars?.role(w.role)
        waitBlock.appendChild(el('div', { style: 'margin-top:6px;' }, States?.HumanActionMarker?.render({
          role: r?.zh || w.role, member: w.member, sinceMs: w.sinceMs, required: w.required,
        }) || ''))
        if (w.title) waitBlock.appendChild(el('div', { style: 'margin-top:3px;font-size:11px;color:var(--text);padding-left:2px;line-height:15px;' }, esc(String(w.title).slice(0, 120))))
      }
      if (waiting.length > 4) waitBlock.appendChild(el('div', { style: 'padding-top:4px;font-size:10.5px;color:var(--text-muted);' }, `+${waiting.length - 4} 更多`))
      pane.appendChild(waitBlock)
    }

    if (recent.length > 0) {
      const rec = el('div', { class: 'helix-block' })
      rec.appendChild(el('h4', {}, '最近 · Recent'))
      rec.appendChild(el('ol', { class: 'helix-list', style: 'padding-left:0;list-style:none;display:grid;gap:5px;' }, recent.map((x) => `<li style="display:grid;grid-template-columns:52px 1fr;gap:5px;align-items:baseline;"><span style="color:var(--text-muted);font-size:10px;">${esc(ago(x.at))}</span><span style="color:var(--text);font-size:11.5px;line-height:15px;">${esc(String(x.text || '').slice(0, 180))}</span></li>`).join('')))
      pane.appendChild(rec)
    }

    if (decisions.length > 0 && recent.length === 0) {
      const dec = el('div', { class: 'helix-block' })
      dec.appendChild(el('h4', {}, '决议 · Decisions'))
      dec.appendChild(el('ol', { class: 'helix-list' }, decisions.slice(0, 6).map((d) => `<li style="font-size:11.5px;line-height:16px;">${esc(String(d).slice(0, 160))}</li>`).join('')))
      pane.appendChild(dec)
    }

    return pane
  }

  function renderMobileNav(onPick) {
    const nav = el('nav', { class: 'mobile-nav', role: 'navigation', 'aria-label': '底部导航' })
    const buttons = [
      ['office', '办公室', '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 13 L2 7 L8 3 L14 7 L14 13"/><path d="M6 13 V9 H10 V13"/></svg>'],
      ['tasks', '任务', '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M6 6.5 H11 M6 9.5 H11"/><path d="M5 6.5 h0 v0 h0"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/></svg>'],
      ['helix', 'Helix', `<svg viewBox="0 0 16 16" width="18" height="18">${States?.GLYPHS?.roleIconHelix || ''}</svg>`],
      ['review', '审批', '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 3 H10 L13 6 V13 H3 Z"/><path d="M10 3 V6 H13"/><path d="M5.5 9.5 L7.5 11.5 L11.5 7.5"/></svg>'],
    ]
    buttons.forEach(([id, label, icon], i) => {
      const b = el('button', { class: `nav-btn${i === 0 ? ' active' : ''}`, onClick: () => { nav.querySelectorAll('.nav-btn').forEach((n) => n.classList.remove('active')); b.classList.add('active'); onPick?.(id) } })
      b.innerHTML = icon + `<span>${label}</span>`
      nav.appendChild(b)
    })
    return nav
  }

  function destroyExistingClassic() {
    // Remove existing classic layout root children if present (avoid mixing rule).
    for (const sel of ['.app', '#team', '.chat', '.board', '.stage-wrap']) {
      document.querySelectorAll(sel).forEach((n) => n.remove())
    }
    if (typeof globalThis.AnimeOffice?.prototype?.destroy === 'function') { /* no-op: handled by app.js flow */ }
  }

  function applyHelixBodyClass(mode) {
    if (typeof document === 'undefined' || !document.body || typeof document.body.classList !== 'object') return
    document.body.classList.remove('helix-is-collapsed', 'helix-is-compact', 'helix-is-expanded')
    if (mode === 'collapsed') document.body.classList.add('helix-is-collapsed')
    else if (mode === 'expanded') document.body.classList.add('helix-is-expanded')
    else document.body.classList.add('helix-is-compact')
    HELIX_STATE.mode = mode
  }

  function bootstrap(options = {}) {
    if (!Theme || !Chars || !States) throw new Error('VAOCoreShell.bootstrap: Core modules not loaded (load order: theme → states → characters → office → shell)')
    Theme.inject()
    document.documentElement.setAttribute('data-theme-core', Theme.THEME_ID)
    document.documentElement.removeAttribute('data-skin')
    document.documentElement.removeAttribute('data-skin-id')
    injectShellCss()
    const mode = runtimeMode(options)
    const useFixtures = mode === 'demo'
    const runtime = options.runtime && Object.keys(options.runtime).length ? options.runtime
      : (useFixtures ? JSON.parse(JSON.stringify(DEMO_RUNTIME)) : buildEmptyRuntime())
    const helix = options.helix && Object.keys(options.helix).length ? options.helix
      : (useFixtures ? JSON.parse(JSON.stringify(HELIX_DEMO)) : buildEmptyHelix())

    destroyExistingClassic()

    document.body.classList.add('v2-core-shell')
    document.body.innerHTML = ''
    applyHelixBodyClass('compact')

    let helixDrawerOpen = false
    let helixMode = 'compact'
    let activeNav = options.initialNav || 'office'
    const overlay = el('div', { class: 'drawer-overlay' })
    const helixDrawer = el('aside', { class: 'helix-drawer', role: 'dialog', 'aria-label': 'Helix 系统编排中枢面板' })

    function safeReplaceWith(oldNode, newNode) {
      if (!oldNode) return
      if (typeof oldNode.replaceWith === 'function') { oldNode.replaceWith(newNode); return }
      const p = oldNode.parentNode
      if (!p) return
      const sib = p.children || []
      const i = sib.indexOf(oldNode)
      if (i >= 0) {
        sib[i] = newNode
        newNode.parentNode = p
      }
      p._html = sib.map(x => (x && (x.outerHTML || x.innerHTML || '')) || '').join('')
    }

    function setHelixDrawer(open) {
      helixDrawerOpen = open
      if (open) { overlay.classList.add('open'); helixDrawer.classList.add('open') }
      else { overlay.classList.remove('open'); helixDrawer.classList.remove('open') }
    }
    function setHelixTri(nextMode) {
      if (!['collapsed', 'compact', 'expanded'].includes(nextMode)) nextMode = 'compact'
      helixMode = nextMode
      applyHelixBodyClass(nextMode)
      const newBar = renderGlobalBar({
        runtime,
        currentThemeId: 'core',
        onThemeChange: (id) => { options.onThemeChange?.(id) },
        onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
        onHelixTriState: setHelixTri,
        helixMode,
        mode,
      })
      safeReplaceWith(bar, newBar)
      bar = newBar
      handle.nodes.bar = newBar
    }
    function setActiveNav(id) {
      activeNav = id
      const newRail = renderRail({ runtime, onPickSeat: options.onPickSeat, onNavigate: navHandler, activeNav })
      safeReplaceWith(rail, newRail)
      rail = newRail
      handle.nodes.rail = newRail
      options.onNavigate?.(id)
    }
    const navHandler = (id) => setActiveNav(id)
    overlay.addEventListener('click', () => setHelixDrawer(false))

    let bar = renderGlobalBar({
      runtime,
      currentThemeId: 'core',
      onThemeChange: (id) => { options.onThemeChange?.(id) },
      onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
      onHelixTriState: setHelixTri,
      helixMode,
      mode,
    })
    let rail = renderRail({ runtime, onPickSeat: options.onPickSeat, onNavigate: navHandler, activeNav })
    const canvas = el('main', { id: 'office-canvas', role: 'main', 'aria-label': '办公室楼层 · Office Floor: Helix 指挥台居中，周围是 规划工作室 / 工程站 / 质检 / 文档 / 人类区' })
    const helixPanel = el('aside', { id: 'helix-panel', 'aria-label': 'Helix 系统编排中枢面板' })
    const innerHelixPanel = renderHelixPanel({ helix, runtime }, { onSend: (t) => options.onConversationSend?.(t) })
    helixPanel.appendChild(innerHelixPanel)
    helixDrawer.innerHTML = ''
    helixDrawer.appendChild(renderHelixPanel({ helix, runtime }, { onSend: (t) => options.onConversationSend?.(t) }))

    document.body.appendChild(bar)
    document.body.appendChild(rail)
    document.body.appendChild(canvas)
    document.body.appendChild(helixPanel)
    document.body.appendChild(overlay)
    document.body.appendChild(helixDrawer)
    document.body.appendChild(renderMobileNav((id) => {
      if (id === 'helix') setHelixDrawer(true)
      else if (id === 'review') options.onNavigate?.(id)
      else if (id === 'tasks') { setActiveNav('tasks'); canvas.scrollIntoView({ behavior: 'smooth' }) }
      else if (id === 'office') { setActiveNav('office'); canvas.scrollIntoView({ behavior: 'smooth' }) }
    }))

    const officeHandle = Office.attach(canvas, { snapshot: options.snapshot || null, mode })
    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('vao:seat-selected', (e) => options.onPickSeat?.(e.detail.role))
      canvas.addEventListener('vao:task-selected', (e) => options.onPickTask?.(e.detail.taskId))
    }

    function anchorRectFromEvent(e, selectorFallback) {
      try {
        const path = e.composedPath?.() || [e.target]
        for (const n of path) {
          if (n && n.nodeType === 1 && typeof n.getBoundingClientRect === 'function') {
            const r = n.getBoundingClientRect()
            if (r && (r.width || r.height)) return r
          }
        }
      } catch (_) {}
      return null
    }

    function openRoleInspectorHandler(e) {
      const roleId = e.detail?.role || e.detail?.roleId
      if (!roleId) return
      const anchor = anchorRectFromEvent(e) || e.detail?.anchorRect || null
      renderRoleInspector(roleId, mode, anchor)
      options.onOpenRoleInspector?.(roleId)
    }
    function openTaskInspectorHandler(e) {
      const taskId = e.detail?.taskId || e.detail?.task
      if (!taskId) return
      const anchor = anchorRectFromEvent(e) || e.detail?.anchorRect || null
      renderTaskInspector(taskId, mode, anchor)
      options.onOpenTaskInspector?.(taskId)
    }
    function openHelixPanelHandler() {
      if (helixMode === 'collapsed') setHelixTri('compact')
      else if (helixMode === 'compact') setHelixTri('expanded')
      else if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth < 1025) setHelixDrawer(true)
      options.onOpenHelixPanel?.()
    }

    const documentListenersAttached = typeof document !== 'undefined' && typeof document.addEventListener === 'function'
    if (documentListenersAttached) {
      document.addEventListener('vao:open-role-inspector', openRoleInspectorHandler)
      document.addEventListener('vao:open-task-inspector', openTaskInspectorHandler)
      document.addEventListener('vao:open-helix-panel', openHelixPanelHandler)
    }

    const handle = {
      mode,
      helix: { get mode() { return helixMode }, setHelixMode: setHelixTri },
      setHelixMode: setHelixTri,
      inspectors: { close: closeInspectorPop, openRole: (roleId, anchorRect) => renderRoleInspector(roleId, mode, anchorRect), openTask: (taskId, anchorRect) => renderTaskInspector(taskId, mode, anchorRect) },
      nodes: { bar, rail, canvas, helixPanel, overlay, helixDrawer },
      office: officeHandle,
      update(next = {}) {
        if (next.helixMode) setHelixTri(next.helixMode)
        if (next.runtime) Object.assign(runtime, next.runtime)
        if (next.helix) Object.assign(helix, next.helix)
        if (next.runtime || next.helix) {
          helixPanel.innerHTML = ''
          helixPanel.appendChild(renderHelixPanel({ helix, runtime }, { onSend: (t) => options.onConversationSend?.(t) }))
        }
        if (next.snapshot) officeHandle.update(next.snapshot)
        if (next.runtime) {
          const newRail = renderRail({ runtime, onPickSeat: options.onPickSeat, onNavigate: navHandler, activeNav })
          safeReplaceWith(rail, newRail)
          rail = newRail
          handle.nodes.rail = newRail
          const newBar = renderGlobalBar({
            runtime,
            currentThemeId: 'core',
            onThemeChange: (id) => { options.onThemeChange?.(id) },
            onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
            onHelixTriState: setHelixTri,
            helixMode,
            mode,
          })
          safeReplaceWith(bar, newBar)
          bar = newBar
          handle.nodes.bar = newBar
        }
      },
      destroy() {
        officeHandle.destroy()
        if (documentListenersAttached) {
          document.removeEventListener('vao:open-role-inspector', openRoleInspectorHandler)
          document.removeEventListener('vao:open-task-inspector', openTaskInspectorHandler)
          document.removeEventListener('vao:open-helix-panel', openHelixPanelHandler)
        }
        if (document?.body?.classList) {
          document.body.classList.remove('v2-core-shell', 'helix-is-collapsed', 'helix-is-compact', 'helix-is-expanded')
        }
        if (document?.documentElement) {
          document.documentElement.removeAttribute('data-theme-core')
          document.documentElement.removeAttribute('data-appearance')
        }
        if (typeof document?.getElementById === 'function') {
          const sid = document.getElementById('core-shell-css'); if (sid) sid.remove()
          const tid = document.getElementById('core-theme-style'); if (tid) tid.remove()
        }
        ;[bar, rail, canvas, helixPanel, overlay, helixDrawer].forEach((n) => n && typeof n.remove === 'function' && n.remove())
        if (typeof document?.body?.querySelectorAll === 'function') {
          document.body.querySelectorAll('.mobile-nav, .inspector-backdrop, .inspector-pop').forEach((n) => n.remove())
        }
      },
    }
    return handle
  }

  const api = Object.freeze({
    bootstrap,
    renderThemeSwitcher,
    renderGlobalBar,
    renderRail,
    renderHelixPanel,
    renderMobileNav,
    runtimeMode,
    buildEmptyRuntime,
    buildEmptyHelix,
    CLASSIC_IDS,
    CLASSIC_SKIN_ORDER,
    DEMO_RUNTIME,
    HELIX_DEMO,
  })
  globalThis.VAOCoreShell = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
