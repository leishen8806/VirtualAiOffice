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
    html[data-theme-core] #global-bar{grid-area:bar;display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:10;}
    html[data-theme-core] #organization-rail{grid-area:rail;border-right:1px solid var(--line);background:var(--panel-2);padding:14px 12px;overflow:auto;}
    html[data-theme-core] #office-canvas{grid-area:canvas;overflow:auto;min-height:0;}
    html[data-theme-core] #helix-panel{grid-area:helix;border-left:1px solid var(--line);background:var(--panel);padding:14px 14px 20px;overflow:auto;display:flex;flex-direction:column;gap:14px;}
    html[data-theme-core] .brand-block{display:grid;grid-template-columns:auto 1fr;gap:0 10px;align-items:center;}
    html[data-theme-core] .brand-block .wordmark{font-size:15px;font-weight:700;color:var(--text);letter-spacing:.02em;}
    html[data-theme-core] .brand-block .wordmark-sub{font-size:11px;color:var(--text-muted);line-height:14px;}
    html[data-theme-core] .brand-block .tagline{display:none;}
    html[data-theme-core] .chip-group{display:inline-flex;flex-wrap:wrap;gap:6px;}
    html[data-theme-core] .sep{width:1px;height:22px;background:var(--line);margin:0 2px;}
    html[data-theme-core] .grow{flex:1 1 auto;}
    html[data-theme-core] .pill-runtime{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);}
    html[data-theme-core] .pill-runtime.live{color:var(--done);}
    html[data-theme-core] .pill-runtime.fake{color:var(--waiting-human);}
    html[data-theme-core] .pill-runtime.demo{color:var(--thinking);}
    html[data-theme-core] .pill-runtime.off{color:var(--blocked);}
    html[data-theme-core] .pill-wait{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb, var(--waiting-human) 18%, transparent);color:var(--waiting-human);border:1px solid color-mix(in srgb, var(--waiting-human) 45%, var(--line));font-size:11.5px;font-weight:600;}
    html[data-theme-core] .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text-muted);cursor:pointer;}
    html[data-theme-core] .icon-btn:hover{color:var(--text);border-color:var(--accent);}
    html[data-theme-core] .rail-section{padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--line);}
    html[data-theme-core] .rail-section:last-child{border-bottom:0;}
    html[data-theme-core] .rail-section h3{margin:0 0 8px;font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:.14em;text-transform:uppercase;}
    html[data-theme-core] .rail-item{display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;cursor:pointer;}
    html[data-theme-core] .rail-item:hover{background:var(--panel);}
    html[data-theme-core] .rail-item .meta{font-size:12px;color:var(--text-muted);}
    html[data-theme-core] .rail-item .title{font-size:13px;color:var(--text);font-weight:600;}
    html[data-theme-core] .helix-head{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;}
    html[data-theme-core] .helix-head .sys{font-size:12px;color:var(--orchestrator);font-weight:700;letter-spacing:.12em;}
    html[data-theme-core] .helix-head .zh{font-size:14px;font-weight:700;color:var(--text);}
    html[data-theme-core] .helix-head .en{font-size:11px;color:var(--text-muted);}
    html[data-theme-core] .helix-conv{display:flex;flex-direction:column;gap:8px;}
    html[data-theme-core] .helix-msg{padding:8px 10px;border-radius:10px;font-size:12.5px;line-height:18px;}
    html[data-theme-core] .helix-msg.helix{background:var(--panel-2);border:1px solid var(--line);color:var(--text);}
    html[data-theme-core] .helix-msg.user{background:color-mix(in srgb, var(--accent) 18%, var(--panel-2));border:1px solid color-mix(in srgb, var(--accent) 50%, var(--line));color:var(--text);margin-left:24px;}
    html[data-theme-core] .helix-composer{display:grid;grid-template-columns:1fr auto;gap:6px;}
    html[data-theme-core] .helix-composer textarea{background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:8px 10px;resize:vertical;font:inherit;}
    html[data-theme-core] .helix-composer button{background:var(--orchestrator);color:#fff;border:0;border-radius:10px;padding:0 14px;font-weight:700;cursor:pointer;}
    html[data-theme-core] .helix-list{margin:0;padding-left:18px;display:grid;gap:6px;}
    html[data-theme-core] .helix-list li{font-size:12px;color:var(--text);line-height:18px;}
    html[data-theme-core] .helix-block h4{margin:0 0 8px;font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:.12em;text-transform:uppercase;}
    html[data-theme-core] .mobile-nav{display:none;position:fixed;left:0;right:0;bottom:0;height:56px;background:var(--panel);border-top:1px solid var(--line);z-index:30;grid-template-columns:repeat(4,1fr);}
    html[data-theme-core] .mobile-nav .nav-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:0;color:var(--text-muted);cursor:pointer;font-size:10.5px;font-weight:600;}
    html[data-theme-core] .mobile-nav .nav-btn.active{color:var(--orchestrator);}
    html[data-theme-core] .drawer-overlay{display:none;position:fixed;inset:0;background:rgba(10,16,32,.45);z-index:40;}
    html[data-theme-core] .drawer-overlay.open{display:block;}
    html[data-theme-core] .helix-drawer{position:fixed;top:0;right:0;bottom:0;width:min(92vw, 360px);background:var(--panel);border-left:1px solid var(--line);transform:translateX(100%);transition:transform var(--dur-base) var(--ease);z-index:41;padding:14px;display:flex;flex-direction:column;gap:14px;overflow:auto;}
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
      html[data-theme-core] body.v2-core-shell{grid-template-columns:1fr;grid-template-rows:var(--shell-bar-h) 1fr var(--shell-bar-h);grid-template-areas:"bar""canvas""nav";padding-bottom:56px;}
      html[data-theme-core] .mobile-nav{display:grid;grid-area:nav;}
      html[data-theme-core] .brand-block .wordmark-sub{display:none;}
      html[data-theme-core] #global-bar{padding:0 8px;gap:6px;}
      html[data-theme-core] #global-bar .sep+a,html[data-theme-core] #global-bar .sep+a~.pill-runtime,html[data-theme-core] #global-bar .workspace-chip{display:none;}
    }
    html[data-theme-core] .theme-select{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:8px;padding:4px 6px;font:inherit;}`
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

  function renderRail({ runtime, onPickSeat }) {
    const rail = el('aside', { id: 'organization-rail', 'aria-label': '组织栏' })
    const roles = (Chars?.ROLES || []).slice()
    const humanMembers = runtime?.members?.human || []
    const aiMembers = runtime?.members?.ai || []
    const wsName = runtime?.workspace?.name || '当前工作区'
    const projName = runtime?.project?.name || '未指定项目'
    const wsSec = el('div', { class: 'rail-section' })
    wsSec.appendChild(el('h3', {}, 'Workspace · 工作区'))
    wsSec.appendChild(el('div', { class: 'rail-item' }, `
      <span style="width:24px;height:24px;border-radius:7px;background:var(--panel);border:1px solid var(--line);display:grid;place-items:center;color:var(--text-muted);">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.25"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M2 6 H14"/></svg>
      </span>
      <div><div class="title">${esc(wsName)}</div><div class="meta">${esc(projName)} · ${roles.length} 个角色</div></div>
      <span style="width:8px;height:8px;border-radius:999px;background:${runtime?.runtimeStatus === 'live' ? 'var(--done)' : 'var(--thinking)'};"></span>
    `))
    const rolesSec = el('div', { class: 'rail-section' })
    rolesSec.appendChild(el('h3', {}, `Roles · 角色（官方 ${roles.length}）`))
    for (const r of roles) {
      const hasH = humanMembers.find((m) => m.role === r.id)
      const hasA = aiMembers.find((m) => m.role === r.id)
      const kindBadge = r.id === 'helix' ? 'system' : (hasH ? 'human' : (hasA ? 'ai' : 'human'))
      const item = el('div', { class: 'rail-item', onClick: () => onPickSeat?.(r.id) }, `
        ${Chars?.emblem(r, 24)}
        <div><div class="title">${esc(r.zh)}</div><div class="meta">${esc(r.en)}</div></div>
        ${States?.BADGE?.[kindBadge]?.({ size: 14 }) || ''}
      `)
      rolesSec.appendChild(item)
    }
    const humanSec = el('div', { class: 'rail-section' })
    humanSec.appendChild(el('h3', {}, `Human · 人类（${humanMembers.length}）`))
    if (humanMembers.length === 0) {
      humanSec.appendChild(el('div', { style: { padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' } }, '暂无成员数据'))
    } else for (const m of humanMembers) {
      const r = Chars?.role(m.role)
      humanSec.appendChild(el('div', { class: 'rail-item' }, `
        ${memberAvatar(m, 'human')}
        <div><div class="title">${esc(m.name)}</div><div class="meta">${r ? esc(r.zh) : esc(m.role || '')}</div></div>
        <span style="width:8px;height:8px;border-radius:999px;background:${m.online ? 'var(--done)' : 'var(--offline)'};"></span>
      `))
    }
    const aiSec = el('div', { class: 'rail-section' })
    aiSec.appendChild(el('h3', {}, `AI Agents · 智能体（${aiMembers.length}）`))
    if (aiMembers.length === 0) {
      aiSec.appendChild(el('div', { style: { padding: '6px 8px', fontSize: '12px', color: 'var(--text-muted)' } }, '暂无成员数据'))
    } else for (const a of aiMembers) {
      const r = Chars?.role(a.role)
      aiSec.appendChild(el('div', { class: 'rail-item' }, `
        ${memberAvatar(a, 'ai')}
        <div><div class="title">${esc(a.name)}</div><div class="meta">${r ? esc(r.zh) : esc(a.role || '')}${a.model ? ` · 模型 ${esc(a.model)}` : ''}</div></div>
        <span style="width:8px;height:8px;border-radius:999px;background:${a.online ? 'var(--thinking)' : 'var(--offline)'};"></span>
      `))
    }
    rail.appendChild(wsSec)
    rail.appendChild(rolesSec)
    rail.appendChild(humanSec)
    rail.appendChild(aiSec)
    return rail
  }

  function renderHelixPanel({ helix, runtime }, composer = {}) {
    const pane = el('div', { id: 'helix-panel-inner' })
    const conv = (helix.conversation || []).slice()
    const decisions = (helix.decisions || []).slice()
    const recent = (helix.recent || []).slice()
    const waiting = (runtime?.waitingHuman || []).slice()
    const st = States?.STATES?.[helix.state] || States.STATES.IDLE
    const header = el('div', { class: 'helix-head helix-block' }, `
      <div style="width:36px;height:36px;border-radius:11px;border:1.6px double var(--orchestrator);background:linear-gradient(180deg,transparent 30%,rgba(143,130,255,0.12));display:grid;place-items:center;color:var(--orchestrator);">
        ${States?.svg('roleIconHelix', 22) || ''}
      </div>
      <div>
        <div class="sys">HELIX</div>
        <div class="zh">${esc(helix.header.zh)} · ${esc(helix.header.label)}</div>
        <div class="en">${esc(helix.header.en)}</div>
      </div>
      <div>${statePill(helix.state)}</div>
    `)
    pane.appendChild(header)

    const convBlock = el('div', { class: 'helix-block helix-conv' })
    convBlock.appendChild(el('h4', {}, '对话 · Conversation'))
    if (conv.length === 0) {
      convBlock.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text-muted)', padding: '10px 10px', border: '1px dashed var(--line)', borderRadius: '10px' } }, '暂无对话。跟 Helix 说点什么开始。'))
    } else for (const m of conv) {
      const side = m.side === 'user' ? 'user' : 'helix'
      const bubble = el('div', { class: `helix-msg ${side}` })
      if (side === 'helix') bubble.innerHTML = `<div style="font-size:10.5px;color:var(--orchestrator);letter-spacing:.1em;font-weight:700;margin-bottom:3px;">HELIX</div>${esc(m.text)}`
      else bubble.innerHTML = `<div style="font-size:10.5px;color:var(--accent);letter-spacing:.1em;font-weight:700;margin-bottom:3px;">你</div>${esc(m.text)}`
      convBlock.appendChild(bubble)
    }
    const cwrap = el('div', { class: 'helix-block' })
    cwrap.appendChild(convBlock)
    const cform = el('form', { class: 'helix-composer', onsubmit: (e) => { e.preventDefault(); const ta = cform.querySelector('textarea'); if (ta.value.trim()) composer.onSend?.(ta.value.trim()); ta.value = '' } })
    cform.innerHTML = `
      <textarea rows="2" placeholder="跟 Helix 说点什么…（回车发送，Shift+回车换行）" aria-label="给 Helix 的消息"></textarea>
      <button type="submit">发送</button>
    `
    cform.querySelector('textarea').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); cform.requestSubmit() }
    })
    cwrap.appendChild(cform)
    pane.appendChild(cwrap)

    const sum = el('div', { class: 'helix-block' })
    sum.appendChild(el('h4', {}, '摘要 · Summary'))
    sum.appendChild(el('div', { style: { fontSize: '12.5px', lineHeight: '19px', color: 'var(--text)', padding: '8px 10px', borderRadius: '10px', background: 'var(--panel-2)', border: '1px solid var(--line)' } }, esc(helix.summary || '暂无摘要。')))
    pane.appendChild(sum)

    const dec = el('div', { class: 'helix-block' })
    dec.appendChild(el('h4', {}, '决议 · Decisions'))
    if (decisions.length === 0) dec.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, '暂无决议。'))
    else dec.appendChild(el('ol', { class: 'helix-list' }, decisions.map((d) => `<li>${esc(d)}</li>`).join('')))
    pane.appendChild(dec)

    const waitBlock = el('div', { class: 'helix-block' })
    waitBlock.appendChild(el('h4', {}, `等待人类 · Waiting Human（${waiting.length}）`))
    if (waiting.length === 0) waitBlock.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, '0 等待人类项。'))
    else for (const w of waiting) {
      const r = Chars?.role(w.role)
      waitBlock.appendChild(el('div', { style: { marginTop: '8px' } }, States?.HumanActionMarker?.render({
        role: r?.zh || w.role, member: w.member, sinceMs: w.sinceMs, required: w.required,
      }) || ''))
      if (w.title) waitBlock.appendChild(el('div', { style: { marginTop: '4px', fontSize: '12px', color: 'var(--text)', paddingLeft: '2px' } }, esc(w.title)))
    }
    pane.appendChild(waitBlock)

    const rec = el('div', { class: 'helix-block' })
    rec.appendChild(el('h4', {}, '最近 · Recent'))
    if (recent.length === 0) rec.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text-muted)' } }, '暂无活动。'))
    else rec.appendChild(el('ol', { class: 'helix-list', style: { paddingLeft: '0', listStyle: 'none', display: 'grid', gap: '6px' } }, recent.map((x) => `<li style="display:grid;grid-template-columns:64px 1fr;gap:6px;align-items:baseline;"><span style="color:var(--text-muted);font-size:11px;">${esc(ago(x.at))}</span><span style="color:var(--text);">${esc(x.text)}</span></li>`).join('')))
    pane.appendChild(rec)
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
    const overlay = el('div', { class: 'drawer-overlay' })
    const helixDrawer = el('aside', { class: 'helix-drawer', role: 'dialog', 'aria-label': 'Helix 系统编排中枢面板' })

    function setHelixDrawer(open) {
      helixDrawerOpen = open
      if (open) { overlay.classList.add('open'); helixDrawer.classList.add('open') }
      else { overlay.classList.remove('open'); helixDrawer.classList.remove('open') }
    }
    overlay.addEventListener('click', () => setHelixDrawer(false))

    const bar = renderGlobalBar({
      runtime,
      currentThemeId: 'core',
      onThemeChange: (id) => { options.onThemeChange?.(id) },
      onToggleHelix: () => setHelixDrawer(!helixDrawerOpen),
      mode,
    })
    const rail = renderRail({ runtime, onPickSeat: options.onPickSeat })
    const canvas = el('main', { id: 'office-canvas', role: 'main', 'aria-label': 'Helix 位于中央, 周围 7 个角色席位的办公室画布' })
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
      else if (id === 'tasks') canvas.scrollIntoView({ behavior: 'smooth' })
      else if (id === 'office') document.getElementById('office-canvas')?.scrollIntoView({ behavior: 'smooth' })
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
          helixPanel.innerHTML = ''
          helixPanel.appendChild(renderHelixPanel({ helix, runtime }, { onSend: (t) => options.onConversationSend?.(t) }))
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
