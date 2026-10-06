/* Core 8 ROLE VISUAL PRIMITIVES (§3 CHARACTER_SYSTEM_V1.md):
 *
 * Helix + Product + Architect + Frontend + Backend + QA + Reviewer + Docs
 * = exactly 8 official roles (Helix included in the 8; Generic Seat = fallback, not official).
 *
 * RENDERING APPROACH (V2-A simplified, V2-B swaps for role artwork without changing
 * public API below):
 *   - renderRoleVisual(roleId, opts) → HTML string (SVG + role emblem).
 *   - Seat visual shares one neutral Operator Base (§2.1 CHARACTER_SYSTEM_V1.md):
 *     3-head simplified adult figure, graphite uniform, status-agnostic silhouette.
 *   - Visual identity of role = 4 codings (accessory + emblem icon + role-color accent
 *     strip + workstation type), so character silhouette test passes at 48px (§2.1).
 *   - Models are NOT baked into role identity: badges sit on nameplate (caller supplies).
 *   - Helix has elevated base + orchestrator node-motif + earring helix charm (§3.1).
 */
;(function () {
  'use strict'

  // === 8 OFFICIAL ROLE DEFINITIONS (canonical frozen order; incl Helix = first) ===
  const ROLES = Object.freeze([
    {
      id: 'helix',
      zh: 'Helix',
      en: 'Helix',
      desc: { zh: '系统编排中枢', en: 'System Orchestrator' },
      glyph: 'roleIconHelix',
      workstation: 'orchestrator-platform',
      accessory: 'headset-helix-charm',
      accent: 'var(--role-helix)',
    },
    {
      id: 'product',
      zh: '产品经理',
      en: 'Product Manager',
      desc: { zh: '需求与业务', en: 'Requirements & Business' },
      glyph: 'roleIconProduct',
      workstation: 'whiteboard',
      accessory: 'clipboard-bookmark',
      accent: 'var(--role-product)',
    },
    {
      id: 'architect',
      zh: '架构师',
      en: 'Architect',
      desc: { zh: '方案与边界', en: 'Plan & Boundaries' },
      glyph: 'roleIconArchitect',
      workstation: 'blueprint-desk',
      accessory: 'round-glasses',
      accent: 'var(--role-architect)',
    },
    {
      id: 'frontend',
      zh: '前端工程师',
      en: 'Frontend Engineer',
      desc: { zh: '界面与交互', en: 'UI & Interaction' },
      glyph: 'roleIconFrontend',
      workstation: 'dual-monitor',
      accessory: 'neck-headphones',
      accent: 'var(--role-frontend)',
    },
    {
      id: 'backend',
      zh: '后端工程师',
      en: 'Backend Engineer',
      desc: { zh: '服务与接口', en: 'Services & APIs' },
      glyph: 'roleIconBackend',
      workstation: 'server-rack',
      accessory: 'database-lanyard',
      accent: 'var(--role-backend)',
    },
    {
      id: 'qa',
      zh: '测试工程师',
      en: 'QA Engineer',
      desc: { zh: '测试与证据', en: 'Tests & Evidence' },
      glyph: 'roleIconQA',
      workstation: 'test-bench',
      accessory: 'magnifier-checklist',
      accent: 'var(--role-qa)',
    },
    {
      id: 'reviewer',
      zh: '审查员',
      en: 'Reviewer',
      desc: { zh: '独立审查', en: 'Independent Review' },
      glyph: 'roleIconReviewer',
      workstation: 'review-seat',
      accessory: 'stamp-half-rim',
      accent: 'var(--role-reviewer)',
    },
    {
      id: 'docs',
      zh: '文档专员',
      en: 'Documentation Specialist',
      desc: { zh: '文档与纪要', en: 'Docs & Minutes' },
      glyph: 'roleIconDocs',
      workstation: 'bookshelf',
      accessory: 'book-ribbon',
      accent: 'var(--role-docs)',
    },
  ])

  const ROLE_INDEX = Object.freeze(ROLES.reduce((m, r) => (m[r.id] = r, m), {}))

  function role(roleId) { return ROLE_INDEX[roleId] || null }

  // === SVG ACCESSORY LIBRARY: one unique accessory per role (silhouette discriminator) ===
  // Each accessory 32x24, anchor top-center of figure's head region.
  const ACCESSORY_SVG = {
    'headset-helix-charm': `
      <path d="M14 3 q-3 0 -4.5 2.5 t-0.5 5" fill="none" stroke="#1F2533" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M18 3 q3 0 4.5 2.5 t0.5 5" fill="none" stroke="#1F2533" stroke-width="1.4" stroke-linecap="round"/>
      <rect x="7" y="9" width="3" height="3.5" rx="1.2" fill="#1F2533"/>
      <rect x="22" y="9" width="3" height="3.5" rx="1.2" fill="#1F2533"/>
      <g transform="translate(25 15)">
        <path d="M0,0 q3,-4 6,0 t6,0" stroke="var(--orchestrator)" fill="none" stroke-width="1.4"/>
        <circle r="1.2" fill="var(--orchestrator)"/>
        <circle cx="6" cy="0" r="1" fill="var(--orchestrator)"/>
        <circle cx="12" cy="0" r="1.2" fill="var(--orchestrator)"/>
      </g>`,
    'clipboard-bookmark': `
      <rect x="11" y="2" width="10" height="18" rx="1.5" fill="#1F2533"/>
      <path d="M16 2 v8 l2 -1.5 l2 1.5 v-8" fill="var(--role-product)"/>
      <path d="M14 10 h4 M14 13 h4 M14 16 h3" stroke="#ffffff" stroke-width=".9"/>`,
    'round-glasses': `
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="#2a2f3a" stroke-width="1.4"/>
      <circle cx="20" cy="8" r="3.2" fill="none" stroke="#2a2f3a" stroke-width="1.4"/>
      <path d="M15.2 8 h1.6" stroke="#2a2f3a" stroke-width="1.2"/>
      <path d="M25.5 5 l2.4 -2.6" stroke="#2a2f3a" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M8.5 5 l-3 -2.6" stroke="#2a2f3a" stroke-width="1.2" stroke-linecap="round"/>`,
    'neck-headphones': `
      <path d="M6 20 q0 -10 10 -10 q10 0 10 10" fill="none" stroke="#1F2533" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="3.5" y="18" width="5" height="6.5" rx="1.5" fill="#1F2533"/>
      <rect x="23.5" y="18" width="5" height="6.5" rx="1.5" fill="#1F2533"/>
      <path d="M28 15 l2 -2 M29 14 h3" stroke="#1F2533" stroke-width="1.1"/>`,
    'database-lanyard': `
      <path d="M8 4 L24 4 L21 8 L11 8 Z" fill="none" stroke="#1F2533" stroke-width="1.2" stroke-linejoin="round"/>
      <ellipse cx="16" cy="15" rx="4.5" ry="1.8" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>
      <path d="M11.5 15 v5 q0 1.8 4.5 1.8 t4.5 -1.8 v-5" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>
      <ellipse cx="16" cy="21.8" rx="4.5" ry="1.8" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>`,
    'magnifier-checklist': `
      <circle cx="12" cy="12" r="4" fill="none" stroke="#1F2533" stroke-width="1.4"/>
      <path d="M15 15 l4.5 4.5" stroke="#1F2533" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="21" y="6" width="9" height="14" rx="1" fill="none" stroke="#1F2533" stroke-width="1.1"/>
      <path d="M23 10 l0.8 0.8 l2 -2" stroke="var(--role-qa)" stroke-width="1.1" fill="none"/>
      <path d="M23 13 h6 M23 16 h5" stroke="#1F2533" stroke-width="1" stroke-linecap="round"/>`,
    'stamp-half-rim': `
      <path d="M11 8 a4 4 0 0 0 8 0" fill="none" stroke="#2a2f3a" stroke-width="1.4"/>
      <path d="M7 8 h4 M19 8 h4" stroke="#2a2f3a" stroke-width="1.2" stroke-linecap="round"/>
      <g transform="translate(18 14)">
        <rect width="10" height="8" rx="1.2" fill="none" stroke="var(--role-reviewer)" stroke-width="1.2"/>
        <path d="M2 4 h2 l1 1 l3 -3" stroke="var(--role-reviewer)" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
      </g>`,
    'book-ribbon': `
      <rect x="8" y="4" width="7" height="17" fill="none" stroke="#1F2533" stroke-width="1.2"/>
      <rect x="17" y="4" width="7" height="17" fill="none" stroke="#1F2533" stroke-width="1.2"/>
      <path d="M11 3 v0 l0 2 l1.5 -1 l1.5 1 V3" stroke="var(--role-docs)" fill="none" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M21 3 v0 l0 2 l1.5 -1 l1.5 1 V3" stroke="var(--role-docs)" fill="none" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M10 9 h12 M10 12 h12 M10 15 h10" stroke="#1F2533" stroke-width=".9"/>`,
  }

  // === Neutral Operator Base: adult 3-head Q-body shared across all 8 roles ===
  // Graphite blazer base (#434957 dark), silver inner #cfd3dc, V2 graphite/silver.
  const OPERATOR_BASE = `
    <g class="operator-base">
      <ellipse cx="16" cy="47.5" rx="8.5" ry="3" fill="rgba(0,0,0,.18)"/>
      <path d="M9 32 l-1 18 h16 l-1 -18 q-2 3 -7 3 t-7 -3 z" fill="#434957" stroke="#2a2e38" stroke-width="1"/>
      <rect x="14" y="29.5" width="4" height="5" rx="1" fill="#cfd3dc" stroke="#9aa1b0" stroke-width=".8"/>
      <circle cx="16" cy="19" r="7.5" fill="#d9d2c8" stroke="#9b8e7a" stroke-width="1"/>
      <path d="M9.5 17 a6.5 6.5 0 0 1 13 0 l0 1.5 q-6.5 -1.5 -13 0 z" fill="#2c313b" stroke="#1a1e27" stroke-width=".8"/>
      <circle cx="13.7" cy="20.2" r=".8" fill="#1e2230"/>
      <circle cx="18.3" cy="20.2" r=".8" fill="#1e2230"/>
      <path d="M14 22.8 q2 0.8 4 0" stroke="#5c4736" fill="none" stroke-width=".85" stroke-linecap="round"/>
    </g>`

  function applyAccentStrip(role, scale = 1) {
    // 4px role accent: left strip on nameplate (§2.4); also coat collar + accessory tint
    return `<rect x="${9 * scale}" y="${30 * scale}" width="${1.4 * scale}" height="${18 * scale}" rx="${0.7 * scale}" fill="${role.accent}"/>`
  }

  function figure(role, scale = 1, variant = 0) {
    const acc = ACCESSORY_SVG[role.accessory] || ''
    // V2-A: simplified V2 operator + accessory + accent collar line.
    // Viewbox 32×56 (logical). Output scales via caller via style.
    return `<svg viewBox="0 0 32 56" width="${32 * scale}" height="${56 * scale}" role="img" aria-label="${role.en}" focusable="false">
      ${OPERATOR_BASE}
      ${applyAccentStrip(role, 1)}
      <g class="role-accessory" transform="translate(0 -2)">${acc}</g>
      <title>${role.zh} / ${role.en}</title>
    </svg>`
  }

  function emblem(role, size = 28) {
    // 28 px circular role emblem for rail/details
    const S = globalThis.VAOCoreStates
    const glyph = S && S.svg ? S.svg(role.glyph, size - 8, '') : ''
    return `<span class="role-emblem" title="${role.zh} · ${role.en}" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.34)}px;border:1.5px solid var(--line);background:var(--panel);color:${role.accent};box-shadow:inset 0 0 0 2px ${role.accent}22;">${glyph}</span>`
  }

  function nameplate(role, opts = {}) {
    const S = globalThis.VAOCoreStates
    const badgeHuman = opts.kind === 'human' && S ? S.BADGE.human({ size: 18 }) : ''
    const badgeAI = opts.kind === 'ai' && S ? S.BADGE.ai({ size: 18 }) : ''
    const badgeSystem = role.id === 'helix' && S ? S.BADGE.system({ size: 18 }) : ''
    const model = opts.model && S ? S.BADGE.model(opts.model) : ''
    const member = opts.memberName
    return `<div class="nameplate" style="display:grid;grid-template-columns:4px auto 1fr;grid-auto-rows:auto;align-items:center;gap:0 6px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-control);padding:4px 8px 4px 4px;min-width:150px;">
      <span style="grid-column:1;grid-row:span 2;width:4px;height:100%;background:${role.accent};border-radius:999px;"></span>
      <span style="grid-column:2;font-size:13px;font-weight:600;color:var(--text);line-height:18px;">${role.zh}${member ? ' · ' + member : ''}</span>
      <span style="grid-column:3;display:flex;justify-content:flex-end;gap:4px;align-items:center;">${badgeSystem || badgeHuman || badgeAI}${model}</span>
      <span style="grid-column:2;font-size:11.5px;color:var(--text-muted);line-height:16px;">${role.en}</span>
    </div>`
  }

  // GenericSeat (§3.9): not official role; for unknown/Workspace Owner.
  const GENERIC = Object.freeze({
    id: 'generic',
    zh: '通用座位',
    en: 'Generic Seat',
    desc: { zh: '非官方角色', en: 'Non-official role' },
    accent: 'var(--text-muted)',
  })

  const ROLE_IDS = Object.freeze(ROLES.map((r) => r.id))

  // Seat = figure + nameplate + stateRing + (optional) taskCard slot.
  // Rendering contract stable so V2-B final artwork drop-in doesn't change call site.
  function renderSeat(roleId, options = {}) {
    const r = role(roleId)
    if (!r) {
      // Fallback GenericSeat (not official; not counted in 8)
      return renderGenericSeat(options)
    }
    const S = globalThis.VAOCoreStates
    const state = options.state || 'IDLE'
    const fig = figure(r, 1.1)
    const ring = S && S.ringCss ? `<div class="seat-ring state-${S.STATES[state]?.key || state.toLowerCase()}" style="position:absolute;left:50%;top:60px;transform:translate(-50%,0);${S.ringCss(state, { size: 56 })}box-sizing:border-box;border-radius:${56 * 0.42}px / ${56 * 0.22}px;"></div>` : ''
    const stateGlyph = S ? `<span style="position:absolute;left:50%;top:46px;transform:translate(-50%,0);color:var(--${S.STATES[state]?.key || 'idle'});background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:1px 4px;display:inline-flex;box-shadow:var(--shadow-1);">${S.stateGlyphSvg(state, 12)}<span style="font-size:10px;line-height:12px;padding:0 2px 0 3px;">${S.STATES[state]?.zh || ''}</span></span>` : ''
    const plate = nameplate(r, options)
    return `<div class="seat seat-${r.id}" role="listitem" aria-label="${r.zh} ${r.en} 座位" data-role="${r.id}" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:170px;padding:14px 8px 8px;background:transparent;">
      ${ring}
      <div style="position:relative;width:88px;height:96px;display:grid;place-items:end center;">${fig}</div>
      ${stateGlyph}
      ${plate}
      ${options.slot ? `<div class="seat-slot" style="margin-top:4px;width:100%;">${options.slot}</div>` : ''}
    </div>`
  }

  function renderGenericSeat(options = {}) {
    const role = GENERIC
    const r = role
    const fig = `<svg viewBox="0 0 32 56" width="35.2" height="61.6" focusable="false"><title>通用座位</title>
      ${OPERATOR_BASE}
    </svg>`
    const plate = `<div class="nameplate" style="display:grid;grid-template-columns:4px auto;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-control);padding:4px 8px 4px 4px;">
      <span style="width:4px;height:100%;background:${r.accent};border-radius:999px;"></span>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);line-height:18px;">${options.name || r.zh}</div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:16px;">${options.en || r.en}</div>
      </div>
    </div>`
    return `<div class="seat seat-generic" data-role="generic" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:170px;padding:14px 8px 8px;background:transparent;">
      <div style="width:88px;height:96px;display:grid;place-items:end center;">${fig}</div>
      ${plate}
    </div>`
  }

  // === HELIX VISUAL PRIMITIVE (elevated, 6 ports + node network motif) ===
  function renderHelixCore(opts = {}) {
    const r = role('helix')
    const S = globalThis.VAOCoreStates
    const state = opts.state || 'IDLE'
    const fig = figure(r, 1.2)
    // 6 ports: Requirements/Tasks/Executions/Reviews/Evidence/Human-Actions (§3.1)
    const ports = ['Requirements', 'Tasks', 'Executions', 'Reviews', 'Evidence', 'Human Actions']
    const zh = { Requirements: '需求', Tasks: '任务', Executions: '执行', Reviews: '评审', Evidence: '证据', 'Human Actions': '人类行动' }
    const portCounts = opts.portCounts || {}
    const elevatedPlatform = `
      <div class="helix-platform" style="position:absolute;left:50%;top:78px;transform:translate(-50%,0);width:172px;height:36px;background:linear-gradient(180deg, color-mix(in srgb, var(--orchestrator) 22%, var(--panel)), var(--panel-2));border:1.5px solid var(--orchestrator);border-radius:86px / 18px;box-shadow:0 6px 18px color-mix(in srgb, var(--orchestrator) 18%, transparent);display:grid;place-items:center;">
        <div style="display:flex;gap:14px;padding:0 14px;align-items:center;">
          ${ports.map((p, i) => `<span class="port port-${i}" data-port="${p}" title="${p} · ${zh[p]}${portCounts[p] != null ? ' ' + portCounts[p] : ''}" style="display:inline-flex;align-items:center;gap:4px;color:${portCounts[p] > 0 ? 'var(--orchestrator)' : 'var(--text-muted)'};">
            <span style="width:6px;height:6px;border-radius:999px;border:1.4px solid currentColor;${portCounts[p] > 0 ? 'background:currentColor;' : ''}"></span>
            <span style="font-size:10px;line-height:1;font-family:var(--mono);font-weight:600;">${portCounts[p] != null ? portCounts[p] : '—'}</span>
          </span>`).join('')}
        </div>
      </div>`
    const base = renderSeat('helix', { ...opts, slot: '' })
    // Inject platform before nameplate + emit 6 ports + elevated ring.
    return `<div class="seat seat-helix seat-helix-core" data-role="helix" aria-label="Helix 系统编排中枢 中心座位" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:220px;padding:14px 8px 8px;background:transparent;">
      <div style="position:relative;width:132px;height:132px;display:grid;place-items:center;">
        <div class="helix-ring" style="position:absolute;width:132px;height:132px;border-radius:132px;border:1.4px dashed color-mix(in srgb, var(--orchestrator) 55%, transparent);box-sizing:border-box;animation:helix-pulse 2.4s ease-in-out infinite alternate;"></div>
        <div style="position:relative;display:grid;place-items:end center;width:96px;height:108px;">${fig}</div>
      </div>
      ${elevatedPlatform}
      ${S ? `<span style="position:absolute;left:50%;top:38px;transform:translate(-50%,0);color:var(--orchestrator);background:var(--panel);border:1.4px solid color-mix(in srgb, var(--orchestrator) 55%, var(--line));border-radius:999px;padding:2px 7px;display:inline-flex;box-shadow:var(--shadow-1);align-items:center;gap:3px;">
        ${S.stateGlyphSvg(state, 13)}
        <span style="font-size:11px;line-height:12px;font-weight:600;">HELIX · ${S.STATES[state]?.label || state}</span>
      </span>` : ''}
      ${nameplate(r, opts)}
      ${opts.slot || ''}
    </div>
    <style>@keyframes helix-pulse{to{transform:scale(1.04);opacity:.7;}}</style>`
  }

  const api = Object.freeze({
    ROLES,
    ROLE_IDS,
    ROLE_COUNT: ROLES.length, // 8
    role,
    emblem,
    nameplate,
    figure,
    renderSeat,
    renderHelixCore,
    renderGenericSeat,
    isOfficialRole(id) { return !!ROLE_INDEX[id] },
  })
  globalThis.VAOCoreCharacters = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
