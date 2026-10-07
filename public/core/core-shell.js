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

  function injectShellCss() {
    const id = 'core-shell-css'
    if (document.getElementById(id)) return
    const s = document.createElement('style')
    s.id = id
    s.textContent = `
    html[data-theme-core] body.v2-core-shell{margin:0;display:grid;grid-template-rows:var(--shell-bar-h) 1fr;grid-template-columns:var(--shell-rail-w) 1fr var(--shell-helix-w);grid-template-areas:"bar bar bar""rail canvas helix";min-height:100vh;}
    html[data-theme-core] #global-bar{grid-area:bar;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:10;}
    html[data-theme-core] #organization-rail{grid-area:rail;border-right:1px solid var(--line);background:var(--panel-2);padding:12px 10px;overflow:auto;}
    html[data-theme-core] #office-canvas{grid-area:canvas;overflow:auto;min-height:0;background:var(--canvas-floor);}
    html[data-theme-core] #helix-panel{grid-area:helix;border-left:1px solid var(--line);background:var(--panel);padding:12px 12px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px;}
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

  function renderGlobalBar({ runtime, currentThemeId, onThemeChange, onToggleHelix, mode }) {
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
    bar.appendChild(brand)
    if (demoBanner) { bar.appendChild(sep3); bar.appendChild(demoBanner) }
    bar.appendChild(sep1)
    bar.appendChild(wsChip)
    bar.appendChild(sep2)
    bar.appendChild(runtimePill)
    if (waiting) bar.appendChild(waiting)
    bar.appendChild(grow)
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

  function renderHelixPanel({ helix, runtime }, composer = {}, reuseFromNode = null) {
    const Composer = globalThis.VAOCoreComposer
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

    const composerContext = {
      runtimeId: runtime?.workspace?.id || '',
      workspacePath: runtime?.workspace?.path || '',
      projectPath: runtime?.project?.id || '',
    }

    let composerEl = null
    if (reuseFromNode && typeof reuseFromNode.querySelector === 'function') {
      const existing = reuseFromNode.querySelector('.helix-composer-v2')
      if (existing && existing.parentElement) {
        composerEl = existing
        existing.parentElement.removeChild(existing)
      }
    }
    if (!composerEl) {
      if (Composer && typeof Composer.renderComposer === 'function') {
        composerEl = Composer.renderComposer({
          context: composerContext,
          onSend: (t) => {
            // Forward ONE normalized envelope (string or object). Transport.send()
            // is the SINGLE boundary responsible for converting legacy plain-string
            // senders into the canonical { clientMessageId?, text, attachmentIds? }
            // shape. Do NOT drop the 2nd arg or strip attachmentIds here.
            return composer.onSend?.(t)
          },
          onRebindAttachments: typeof composer.onRebindAttachments === 'function'
            ? (payload) => composer.onRebindAttachments(payload)
            : null,
        })
      } else {
        composerEl = el('form', { class: 'helix-composer', onsubmit: (e) => { e.preventDefault(); const ta = composerEl.querySelector('textarea'); if (ta.value.trim()) composer.onSend?.(ta.value.trim()); ta.value = '' } })
        composerEl.innerHTML = `
          <textarea rows="2" placeholder="跟 Helix 说说要做什么…" aria-label="给 Helix 的消息" style="font-size:12px;padding:6px 8px !important;"></textarea>
          <button type="submit">发送</button>
        `
        composerEl.querySelector('textarea').addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); composerEl.requestSubmit() }
        })
      }
    }
    cwrap.appendChild(composerEl)
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

    let helixDrawerOpen = false
    let activeNav = options.initialNav || 'office'
    const overlay = el('div', { class: 'drawer-overlay' })
    const helixDrawer = el('aside', { class: 'helix-drawer', role: 'dialog', 'aria-label': 'Helix 系统编排中枢面板' })

    function setHelixDrawer(open) {
      helixDrawerOpen = open
      if (open) { overlay.classList.add('open'); helixDrawer.classList.add('open') }
      else { overlay.classList.remove('open'); helixDrawer.classList.remove('open') }
    }
    function setActiveNav(id) {
      activeNav = id
      const newRail = renderRail({ runtime, onPickSeat: options.onPickSeat, onNavigate: navHandler, activeNav })
      rail.replaceWith(newRail)
      handle.nodes.rail = newRail
      options.onNavigate?.(id)
    }
    const navHandler = (id) => setActiveNav(id)
    overlay.addEventListener('click', () => setHelixDrawer(false))

    const bar = renderGlobalBar({
      runtime,
      currentThemeId: 'core',
      onThemeChange: (id) => { options.onThemeChange?.(id) },
      onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
      mode,
    })
    const rail = renderRail({ runtime, onPickSeat: options.onPickSeat, onNavigate: navHandler, activeNav })
    const canvas = el('main', { id: 'office-canvas', role: 'main', 'aria-label': '办公室楼层 · Office Floor: Helix 指挥台居中，周围是 规划工作室 / 工程站 / 质检 / 文档 / 人类区' })
    const helixPanel = el('aside', { id: 'helix-panel', 'aria-label': 'Helix 系统编排中枢面板' })
    const innerHelixPanel = renderHelixPanel({ helix, runtime }, { onSend: (t, full) => {
      // Preserve the envelope across the shell → application bridge.
      // Only normalize legacy string callers; object envelopes pass verbatim.
      if (t && typeof t === 'object') return options.onConversationSend?.(t)
      if (full && typeof full === 'object') return options.onConversationSend?.(full)
      return options.onConversationSend?.(String(t ?? ''))
    }, onRebindAttachments: (payload) => options.onRebindAttachments?.(payload) })
    helixPanel.appendChild(innerHelixPanel)
    helixDrawer.innerHTML = ''
    helixDrawer.appendChild(renderHelixPanel({ helix, runtime }, { onSend: (t, full) => {
      if (t && typeof t === 'object') return options.onConversationSend?.(t)
      if (full && typeof full === 'object') return options.onConversationSend?.(full)
      return options.onConversationSend?.(String(t ?? ''))
    }, onRebindAttachments: (payload) => options.onRebindAttachments?.(payload) }))

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
    canvas.addEventListener('vao:seat-selected', (e) => options.onPickSeat?.(e.detail.role))
    canvas.addEventListener('vao:task-selected', (e) => options.onPickTask?.(e.detail.taskId))

    const handle = {
      mode,
      nodes: { bar, rail, canvas, helixPanel, overlay, helixDrawer },
      office: officeHandle,
      update(next = {}) {
        if (next.runtime) Object.assign(runtime, next.runtime)
        if (next.helix) Object.assign(helix, next.helix)
        if (next.runtime || next.helix) {
          const oldPanel = helixPanel.firstElementChild
          const oldDrawer = helixDrawer.firstElementChild
          helixPanel.innerHTML = ''
          helixPanel.appendChild(renderHelixPanel({ helix, runtime }, { onSend: (t, full) => options.onConversationSend?.(t ?? full?.text ?? '', full), onRebindAttachments: (payload) => options.onRebindAttachments?.(payload) }, oldPanel))
          if (oldDrawer) {
            const newDrawer = renderHelixPanel({ helix, runtime }, { onSend: (t, full) => options.onConversationSend?.(t ?? full?.text ?? '', full), onRebindAttachments: (payload) => options.onRebindAttachments?.(payload) }, oldDrawer)
            helixDrawer.innerHTML = ''
            helixDrawer.appendChild(newDrawer)
          }
        }
        if (next.snapshot) officeHandle.update(next.snapshot)
        if (next.runtime) {
          const newRail = renderRail({ runtime, onPickSeat: options.onPickSeat })
          rail.replaceWith(newRail)
          handle.nodes.rail = newRail
          const newBar = renderGlobalBar({
            runtime,
            currentThemeId: 'core',
            onThemeChange: (id) => { options.onThemeChange?.(id) },
            onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
            mode,
          })
          bar.replaceWith(newBar)
          handle.nodes.bar = newBar
        }
      },
      destroy() {
        officeHandle.destroy()
        document.body.classList.remove('v2-core-shell')
        document.documentElement.removeAttribute('data-theme-core')
        document.documentElement.removeAttribute('data-appearance')
        const sid = document.getElementById('core-shell-css'); if (sid) sid.remove()
        const tid = document.getElementById('core-theme-style'); if (tid) tid.remove()
        ;[bar, rail, canvas, helixPanel, overlay, helixDrawer].forEach((n) => n.remove())
        document.body.querySelectorAll('.mobile-nav').forEach((n) => n.remove())
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
