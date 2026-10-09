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

  // Workstation surface component library (VIS-5: workstation defines role visually).
  // Each renders a ~70-110px wide desk surface with role-identifying props in front of seated figure.
  const WORKSTATION = {
    product: () => `
      <svg class="ws-surface ws-whiteboard" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <defs><linearGradient id="wbProdFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#f4f6fb"/>
        </linearGradient></defs>
        <rect x="6" y="4" width="98" height="48" rx="4" fill="url(#wbProdFill)" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
        <g stroke="var(--role-product)" stroke-width=".8" fill="none" opacity=".78">
          <rect x="12" y="10" width="22" height="14" rx="1.5"/>
          <rect x="38" y="10" width="26" height="14" rx="1.5"/>
          <rect x="68" y="10" width="32" height="14" rx="1.5"/>
          <path d="M14 19 h18 M14 22 h14 M40 19 h20 M40 22 h16 M70 19 h26 M70 22 h22"/>
        </g>
        <g fill="var(--role-product)" opacity=".85">
          <rect x="14" y="30" width="8" height="4" rx="1"/>
          <rect x="24" y="32" width="10" height="3" rx="1" fill="var(--role-architect)" opacity=".7"/>
          <rect x="36" y="30" width="12" height="4" rx="1" fill="var(--role-frontend)" opacity=".75"/>
          <circle cx="60" cy="34" r="2.5" fill="var(--role-qa)" opacity=".7"/>
          <rect x="72" y="32" width="16" height="3" rx="1" fill="var(--role-docs)" opacity=".75"/>
        </g>
        <g stroke="rgba(0,0,0,.1)" stroke-width="1">
          <line x1="55" y1="52" x2="52" y2="58"/>
          <line x1="55" y1="52" x2="58" y2="58"/>
        </g>
        <rect x="10" y="50" width="90" height="3" rx="1" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    architect: () => `
      <svg class="ws-surface ws-blueprint" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <rect x="4" y="18" width="102" height="30" rx="3" fill="rgba(255,255,255,.7)" stroke="rgba(0,0,0,.09)" stroke-width=".8"/>
        <rect x="10" y="8" width="58" height="16" rx="2" fill="color-mix(in srgb,var(--role-architect) 10%,transparent)" stroke="color-mix(in srgb,var(--role-architect) 45%,transparent)" stroke-width=".8"/>
        <g stroke="var(--role-architect)" stroke-width=".7" fill="none" opacity=".85">
          <path d="M14 30 L28 30 L28 42 L14 42 Z"/>
          <path d="M34 28 L60 28 L60 44 L34 44 Z"/>
          <circle cx="76" cy="36" r="5"/>
          <path d="M76 31 L76 41 M71 36 L81 36" opacity=".6"/>
          <rect x="90" y="28" width="14" height="16" rx="1" stroke-dasharray="2 1.5"/>
        </g>
        <g fill="var(--role-architect)" opacity=".45">
          <circle cx="18" cy="44" r="1.4"/><circle cx="58" cy="44" r="1.4"/>
        </g>
        <rect x="4" y="48" width="102" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    frontend: () => `
      <svg class="ws-surface ws-dual-monitor" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <g>
          <rect x="6" y="8" width="44" height="30" rx="2" fill="#111827" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>
          <rect x="8" y="10" width="40" height="26" rx="1" fill="color-mix(in srgb,var(--role-frontend) 14%,#ffffff22)"/>
          <g fill="#fff" opacity=".9">
            <rect x="10" y="12" width="14" height="3" rx="1"/>
            <rect x="10" y="17" width="36" height="1.5" rx=".7" opacity=".65"/>
            <rect x="10" y="20" width="28" height="1.5" rx=".7" opacity=".5"/>
            <rect x="10" y="23" width="32" height="1.5" rx=".7" opacity=".55"/>
            <rect x="10" y="26" width="22" height="1.5" rx=".7" opacity=".45"/>
            <circle cx="44" cy="14" r="1.6" fill="var(--role-frontend)" opacity=".85"/>
          </g>
          <rect x="24" y="38" width="8" height="6" rx="1" fill="rgba(0,0,0,.18)"/>
          <rect x="18" y="44" width="20" height="3" rx="1" fill="rgba(0,0,0,.2)"/>
        </g>
        <g>
          <rect x="60" y="8" width="44" height="30" rx="2" fill="#111827" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>
          <rect x="62" y="10" width="40" height="26" rx="1" fill="color-mix(in srgb,var(--role-frontend) 10%,#ffffff22)"/>
          <g stroke="var(--role-frontend)" stroke-width=".9" fill="none" opacity=".8">
            <path d="M66 14 L78 14 L80 22 L70 28 L64 22 Z"/>
            <circle cx="92" cy="20" r="2.5"/>
            <rect x="68" y="30" width="28" height="3" rx="1"/>
          </g>
          <rect x="78" y="38" width="8" height="6" rx="1" fill="rgba(0,0,0,.18)"/>
          <rect x="72" y="44" width="20" height="3" rx="1" fill="rgba(0,0,0,.2)"/>
        </g>
        <rect x="4" y="49" width="102" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    backend: () => `
      <svg class="ws-surface ws-server-rack" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <rect x="14" y="6" width="82" height="46" rx="3" fill="rgba(255,255,255,.6)" stroke="rgba(0,0,0,.1)" stroke-width=".9"/>
        <g stroke="rgba(0,0,0,.15)" stroke-width=".6" fill="none">
          <line x1="14" y1="16" x2="96" y2="16"/>
          <line x1="14" y1="26" x2="96" y2="26"/>
          <line x1="14" y1="36" x2="96" y2="36"/>
        </g>
        <g>
          <g fill="var(--role-backend)" opacity=".75">
            <circle cx="22" cy="11" r="1.6"/><circle cx="26" cy="11" r="1.6" opacity=".65"/>
            <rect x="34" y="9.5" width="18" height="3" rx="1"/>
            <circle cx="86" cy="11" r="1.6"/><circle cx="90" cy="11" r="1.6" opacity=".5"/>
          </g>
          <g fill="var(--working)" opacity=".65">
            <circle cx="22" cy="21" r="1.6"/><rect x="34" y="19.5" width="22" height="3" rx="1"/>
            <circle cx="88" cy="21" r="1.4"/>
          </g>
          <g fill="var(--idle)" opacity=".55">
            <circle cx="22" cy="31" r="1.6"/><rect x="34" y="29.5" width="26" height="3" rx="1"/>
          </g>
          <g fill="var(--role-docs)" opacity=".55">
            <circle cx="22" cy="41" r="1.6"/><rect x="34" y="39.5" width="30" height="3" rx="1"/>
          </g>
        </g>
        <g stroke="var(--role-backend)" stroke-width=".6" fill="none" opacity=".6">
          <path d="M96 18 Q104 14 100 6 L96 10" stroke-dasharray="1.5 1"/>
        </g>
        <rect x="10" y="52" width="90" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    qa: () => `
      <svg class="ws-surface ws-testbench" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <rect x="8" y="6" width="94" height="30" rx="3" fill="rgba(255,255,255,.75)" stroke="rgba(0,0,0,.1)" stroke-width=".8"/>
        <rect x="12" y="10" width="86" height="6" rx="2" fill="rgba(0,0,0,.04)"/>
        <g>
          <rect x="12" y="20" width="12" height="10" rx="1.5" fill="color-mix(in srgb,var(--done) 20%,transparent)" stroke="var(--done)" stroke-width=".7"/>
          <path d="M15 25 l2 2 l4 -4" stroke="var(--done)" stroke-width="1.4" fill="none"/>
          <rect x="28" y="20" width="12" height="10" rx="1.5" fill="color-mix(in srgb,var(--working) 22%,transparent)" stroke="var(--working)" stroke-width=".7"/>
          <circle cx="34" cy="25" r="2" fill="none" stroke="var(--working)" stroke-width="1.2" stroke-dasharray="2 1.2"/>
          <rect x="44" y="20" width="12" height="10" rx="1.5" fill="color-mix(in srgb,var(--blocked) 20%,transparent)" stroke="var(--blocked)" stroke-width=".7"/>
          <path d="M48 23 L52 27 M52 23 L48 27" stroke="var(--blocked)" stroke-width="1.3"/>
          <rect x="60" y="20" width="12" height="10" rx="1.5" fill="color-mix(in srgb,var(--role-qa) 20%,transparent)" stroke="var(--role-qa)" stroke-width=".7"/>
          <circle cx="66" cy="25" r="1.5" fill="var(--role-qa)"/>
          <path d="M66 20 L66 23 L69 26" stroke="var(--role-qa)" stroke-width="1" fill="none"/>
          <rect x="76" y="20" width="24" height="10" rx="1.5" fill="rgba(0,0,0,.04)" stroke="rgba(0,0,0,.12)" stroke-width=".6"/>
          <g fill="var(--role-qa)" opacity=".7">
            <rect x="79" y="22.5" width="6" height="1.6" rx=".8"/><rect x="79" y="25.5" width="14" height="1.6" rx=".8"/>
          </g>
        </g>
        <g stroke="rgba(0,0,0,.25)" stroke-width=".6" fill="none" opacity=".55">
          <path d="M12 40 L22 40 L20 50 L55 50 L53 40 L98 40"/>
        </g>
        <rect x="4" y="52" width="102" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    reviewer: () => `
      <svg class="ws-surface ws-review" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <g>
          <rect x="4" y="8" width="50" height="40" rx="3" fill="rgba(255,255,255,.7)" stroke="rgba(0,0,0,.1)" stroke-width=".8"/>
          <rect x="8" y="12" width="42" height="4" rx="1" fill="color-mix(in srgb,var(--role-reviewer) 20%,transparent)"/>
          <g fill="rgba(0,0,0,.55)" opacity=".75">
            <rect x="8" y="20" width="42" height="1.5" rx=".7"/>
            <rect x="8" y="23" width="36" height="1.5" rx=".7" opacity=".85"/>
            <rect x="8" y="26" width="40" height="1.5" rx=".7" opacity=".75"/>
            <rect x="8" y="29" width="30" height="1.5" rx=".7" opacity=".65"/>
            <rect x="8" y="32" width="38" height="1.5" rx=".7" opacity=".6"/>
          </g>
          <g stroke="var(--done)" stroke-width="1.4" fill="none" opacity=".9">
            <path d="M40 23 l-2 2 l-3 -3"/>
            <path d="M42 32 l-2 2 l-5 -5" stroke="var(--blocked)" opacity=".8"/>
            <path d="M38 30 l-1 1 l-1 -1" stroke="var(--reviewing)" opacity=".9"/>
          </g>
        </g>
        <g>
          <rect x="58" y="8" width="48" height="40" rx="3" fill="rgba(255,255,255,.7)" stroke="rgba(0,0,0,.1)" stroke-width=".8"/>
          <line x1="82" y1="8" x2="82" y2="48" stroke="rgba(0,0,0,.15)" stroke-width=".8"/>
          <g stroke="var(--role-reviewer)" stroke-width=".6" fill="none" opacity=".85">
            <rect x="62" y="14" width="38" height="2" rx="1"/>
            <path d="M62 20 l2 4 l2 -4 l2 4 l2 -4 l2 4"/>
            <rect x="62" y="30" width="12" height="10" rx="1.5" fill="color-mix(in srgb,var(--done) 14%,transparent)"/>
            <rect x="78" y="30" width="22" height="10" rx="1.5" fill="color-mix(in srgb,var(--blocked) 12%,transparent)"/>
          </g>
          <path d="M65 34 l1.5 2 l3 -3" stroke="var(--done)" stroke-width="1.2" fill="none"/>
          <path d="M82 33 L86 37 M86 33 L82 37" stroke="var(--blocked)" stroke-width="1.2"/>
        </g>
        <rect x="4" y="52" width="102" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
    docs: () => `
      <svg class="ws-surface ws-library" viewBox="0 0 110 60" width="108" height="60" aria-hidden="true" style="position:relative;display:block;margin:0 auto;">
        <g>
          <rect x="6" y="10" width="100" height="12" rx="2" fill="rgba(0,0,0,.04)" stroke="rgba(0,0,0,.08)" stroke-width=".6"/>
          <g>
            <rect x="10" y="12" width="6" height="8" rx=".8" fill="var(--role-product)" opacity=".65"/>
            <rect x="17" y="12" width="5" height="8" rx=".8" fill="var(--role-architect)" opacity=".7"/>
            <rect x="23" y="12" width="7" height="8" rx=".8" fill="var(--role-frontend)" opacity=".68"/>
            <rect x="31" y="12" width="5" height="8" rx=".8" fill="var(--role-backend)" opacity=".72"/>
            <rect x="37" y="12" width="6" height="8" rx=".8" fill="var(--role-qa)" opacity=".66"/>
            <rect x="44" y="12" width="6" height="8" rx=".8" fill="var(--role-reviewer)" opacity=".7"/>
            <rect x="51" y="12" width="8" height="8" rx=".8" fill="var(--role-docs)" opacity=".78"/>
            <rect x="60" y="12" width="6" height="8" rx=".8" fill="var(--role-frontend)" opacity=".55"/>
            <rect x="67" y="12" width="5" height="8" rx=".8" fill="var(--role-backend)" opacity=".6"/>
            <rect x="73" y="12" width="8" height="8" rx=".8" fill="var(--role-product)" opacity=".55"/>
            <rect x="82" y="12" width="6" height="8" rx=".8" fill="var(--role-architect)" opacity=".6"/>
            <rect x="89" y="12" width="5" height="8" rx=".8" fill="var(--role-docs)" opacity=".85"/>
          </g>
        </g>
        <g>
          <rect x="6" y="30" width="60" height="22" rx="3" fill="rgba(255,255,255,.78)" stroke="rgba(0,0,0,.1)" stroke-width=".8"/>
          <g fill="rgba(0,0,0,.5)" opacity=".7">
            <rect x="10" y="34" width="22" height="2" rx="1"/>
            <rect x="10" y="38" width="48" height="1.4" rx=".7" opacity=".75"/>
            <rect x="10" y="41" width="42" height="1.4" rx=".7" opacity=".65"/>
            <rect x="10" y="44" width="38" height="1.4" rx=".7" opacity=".55"/>
          </g>
          <g transform="translate(10 33.5)">
            <path d="M0 0 L3 2 L6 0" stroke="var(--role-docs)" stroke-width=".9" fill="none" opacity=".9"/>
          </g>
        </g>
        <g>
          <rect x="72" y="30" width="34" height="22" rx="3" fill="rgba(0,0,0,.04)" stroke="rgba(0,0,0,.1)" stroke-width=".8"/>
          <g stroke="var(--role-docs)" stroke-width=".6" fill="none" opacity=".85">
            <circle cx="89" cy="39" r="4"/>
            <path d="M89 35 L89 43 M85 39 L93 39" opacity=".5"/>
            <rect x="75" y="44" width="26" height="4" rx="1.5" stroke-dasharray="1.5 1"/>
          </g>
          <rect x="78" y="33" width="18" height="2.5" rx="1" fill="var(--role-docs)" opacity=".4"/>
        </g>
        <rect x="4" y="54" width="102" height="3" rx="1.5" fill="rgba(0,0,0,.08)"/>
      </svg>`,
  }

  // Seat = workstation surface (defines role visually) + seated figure (smaller 0.85 scale, behind desk)
  //   + state overlay pill + slim nameplate tag beneath workstation.
  // Visual footprint ~110-145px wide per workstation (matches user 100-150px req).
  function renderSeat(roleId, options = {}) {
    const r = role(roleId)
    if (!r) return renderGenericSeat(options)
    const S = globalThis.VAOCoreStates
    const state = options.state || 'IDLE'
    const fig = figure(r, 0.85)
    const wsSVG = WORKSTATION[roleId] ? WORKSTATION[roleId]() : ''
    const stateKey = S?.STATES?.[state]?.key || state.toLowerCase()
    const ring = S && S.ringCss ? `<div class="seat-ring state-${stateKey}" style="position:absolute;left:50%;top:54px;transform:translate(-50%,0);${S.ringCss(state, { size: 44 })}box-sizing:border-box;border-radius:${44 * 0.42}px / ${44 * 0.22}px;opacity:.8;"></div>` : ''
    const stateGlyph = S ? `<span style="position:absolute;right:6px;top:4px;z-index:4;color:var(--${stateKey});background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:1px 5px;display:inline-flex;box-shadow:var(--shadow-1);align-items:center;gap:2px;">${S.stateGlyphSvg(state, 11)}<span style="font-size:9.5px;line-height:11px;padding:0 1.5px 0 2.5px;">${S.STATES[state]?.zh || ''}</span></span>` : ''
    const plate = nameplate(r, options)
    return `<div class="seat seat-${r.id}" role="listitem" aria-label="${r.zh} ${r.en} 座位" data-role="${r.id}" style="position:relative;display:grid;grid-template-rows:auto auto;justify-items:center;gap:6px;min-width:128px;padding:12px 6px 6px;background:transparent;">
      <div class="workstation-stack" style="position:relative;width:118px;height:130px;display:grid;justify-items:center;">
        ${ring}
        <div class="ws-seated-figure" style="position:absolute;left:50%;top:2px;transform:translate(-50%,0);z-index:2;">${fig}</div>
        <div class="ws-surface-wrap" style="position:absolute;left:0;right:0;bottom:0;z-index:3;">${wsSVG}</div>
        ${stateGlyph}
      </div>
      <div style="z-index:3;">${plate}</div>
      ${options.slot ? `<div class="seat-slot" style="margin-top:2px;width:100%;z-index:3;">${options.slot}</div>` : ''}
    </div>`
  }

  function renderGenericSeat(options = {}) {
    const r = GENERIC
    const fig = `<svg viewBox="0 0 32 56" width="30" height="52" focusable="false"><title>通用座位</title>
      ${OPERATOR_BASE}
    </svg>`
    const plate = `<div class="nameplate" style="display:grid;grid-template-columns:4px auto;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-control);padding:4px 8px 4px 4px;">
      <span style="width:4px;height:100%;background:${r.accent};border-radius:999px;"></span>
      <div>
        <div style="font-size:12.5px;font-weight:600;color:var(--text);line-height:17px;">${options.name || r.zh}</div>
        <div style="font-size:11px;color:var(--text-muted);line-height:15px;">${options.en || r.en}</div>
      </div>
    </div>`
    return `<div class="seat seat-generic" data-role="generic" style="position:relative;display:grid;grid-template-rows:auto auto;justify-items:center;gap:6px;min-width:128px;padding:12px 6px 6px;background:transparent;">
      <div style="position:relative;width:118px;height:130px;display:grid;place-items:end center;">
        <div style="position:absolute;left:50%;top:8px;transform:translate(-50%,0);">${fig}</div>
        <div style="position:absolute;bottom:0;left:10px;right:10px;height:36px;border-radius:10px;background:rgba(0,0,0,.04);border:1px solid rgba(0,0,0,.08);"></div>
      </div>
      ${plate}
    </div>`
  }

  // === HELIX VISUAL PRIMITIVE (VIS-4: semi-circular command desk) ===
  // Helix = human-like operator standing behind semicircular command desk
  //   + 2–3 small desk screens + subtle orchestration connection lines to zone corners.
  function renderHelixCore(opts = {}) {
    const r = role('helix')
    const S = globalThis.VAOCoreStates
    const state = opts.state || 'IDLE'
    const fig = figure(r, 1.15)
    const stateKey = S?.STATES?.[state]?.key || state.toLowerCase()
    const deskSVG = `
      <svg class="helix-desk" viewBox="0 0 220 110" width="210" height="105" aria-hidden="true" style="position:relative;display:block;margin:0 auto;z-index:3;">
        <defs>
          <linearGradient id="hdTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 24%,var(--panel))"/>
            <stop offset="100%" stop-color="color-mix(in srgb,var(--orchestrator) 12%,var(--panel-2))"/>
          </linearGradient>
          <radialGradient id="hdGlow" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 22%,transparent)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="106" rx="92" ry="5" fill="rgba(0,0,0,.18)"/>
        <path d="M20 80 Q 110 -14 200 80 L 196 102 Q 110 70 24 102 Z" fill="url(#hdTop)" stroke="color-mix(in srgb,var(--orchestrator) 55%,var(--line))" stroke-width="1.4"/>
        <path d="M28 82 Q 110 0 192 82" fill="url(#hdGlow)" opacity=".8"/>
        <g stroke="rgba(0,0,0,.08)" stroke-width=".8" fill="none" opacity=".7">
          <line x1="40" y1="92" x2="40" y2="102"/>
          <line x1="80" y1="96" x2="80" y2="104"/>
          <line x1="140" y1="96" x2="140" y2="104"/>
          <line x1="180" y1="92" x2="180" y2="102"/>
        </g>
        <g>
          <rect x="30" y="54" width="36" height="24" rx="2.5" fill="#0f1522" stroke="rgba(0,0,0,.2)" stroke-width=".8"/>
          <rect x="32" y="56" width="32" height="20" rx="1.2" fill="color-mix(in srgb,var(--thinking) 22%,#ffffff22)"/>
          <g fill="#fff" opacity=".9">
            <rect x="34" y="58" width="10" height="2" rx="1"/>
            <rect x="34" y="62" width="26" height="1.3" rx=".6" opacity=".6"/>
            <rect x="34" y="65" width="20" height="1.3" rx=".6" opacity=".5"/>
            <rect x="34" y="68" width="24" height="1.3" rx=".6" opacity=".45"/>
          </g>
        </g>
        <g>
          <rect x="92" y="44" width="36" height="30" rx="3" fill="#0f1522" stroke="color-mix(in srgb,var(--orchestrator) 60%,#0f1522)" stroke-width="1"/>
          <rect x="94" y="46" width="32" height="26" rx="1.5" fill="color-mix(in srgb,var(--orchestrator) 24%,#ffffff22)"/>
          <g stroke="var(--orchestrator)" stroke-width=".7" fill="none" opacity=".9">
            <circle cx="110" cy="55" r="3.5" fill="none"/>
            <path d="M110 51.5 L110 58.5 M106.5 55 L113.5 55" opacity=".7"/>
            <path d="M98 64 L106 64 L108 68 L112 62 L116 68 L120 64 L122 64"/>
            <rect x="96" y="68" width="28" height="2.5" rx="1.2" opacity=".8"/>
          </g>
        </g>
        <g>
          <rect x="154" y="54" width="36" height="24" rx="2.5" fill="#0f1522" stroke="rgba(0,0,0,.2)" stroke-width=".8"/>
          <rect x="156" y="56" width="32" height="20" rx="1.2" fill="color-mix(in srgb,var(--working) 22%,#ffffff22)"/>
          <g>
            <circle cx="164" cy="62" r="2" fill="var(--working)"/>
            <circle cx="172" cy="62" r="2" fill="var(--reviewing)" opacity=".85"/>
            <circle cx="180" cy="62" r="2" fill="var(--waiting-human)" opacity=".8"/>
            <rect x="160" y="68" width="24" height="3" rx="1.5" fill="rgba(255,255,255,.25)"/>
            <rect x="160" y="72" width="18" height="1.6" rx=".8" fill="rgba(255,255,255,.18)"/>
          </g>
        </g>
      </svg>`

    const connLines = `
      <svg class="helix-connections" viewBox="0 0 260 230" width="100%" height="100%" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;z-index:1;">
        <defs>
          <linearGradient id="connOrch" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 80%,transparent)"/>
            <stop offset="100%" stop-color="color-mix(in srgb,var(--orchestrator) 14%,transparent)"/>
          </linearGradient>
        </defs>
        <g stroke="url(#connOrch)" stroke-width=".95" fill="none" stroke-dasharray="1.5 2.2" opacity=".78">
          <path d="M130 150 Q 50 110 16 40"/>
          <path d="M130 150 Q 80 70 130 20"/>
          <path d="M130 150 Q 210 110 244 40"/>
          <path d="M130 150 Q 50 190 30 218"/>
          <path d="M130 150 Q 210 190 230 218"/>
        </g>
        <g fill="var(--orchestrator)" opacity=".55">
          <circle cx="16" cy="40" r="1.6"/>
          <circle cx="130" cy="20" r="1.6"/>
          <circle cx="244" cy="40" r="1.6"/>
          <circle cx="30" cy="218" r="1.6"/>
          <circle cx="230" cy="218" r="1.6"/>
        </g>
      </svg>`

    const plate = nameplate(r, opts)

    return `<div class="seat seat-helix seat-helix-core" data-role="helix" aria-label="Helix 系统编排中枢 指挥台" style="position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:240px;padding:12px 6px 4px;background:transparent;">
      <div class="helix-hub-stack" style="position:relative;width:230px;height:230px;">
        ${connLines}
        <div class="helix-operator" style="position:absolute;left:50%;top:18px;transform:translate(-50%,0);z-index:4;">${fig}</div>
        ${S ? `<span style="position:absolute;left:50%;top:4px;transform:translate(-50%,0);z-index:5;color:var(--orchestrator);background:var(--panel);border:1.4px solid color-mix(in srgb, var(--orchestrator) 50%, var(--line));border-radius:999px;padding:2px 8px;display:inline-flex;box-shadow:var(--shadow-1);align-items:center;gap:3.5px;">
          ${S.stateGlyphSvg(state, 13)}
          <span style="font-size:11px;line-height:13px;font-weight:700;">HELIX · ${S.STATES[state]?.zh || S.STATES[state]?.label || state}</span>
        </span>` : ''}
        <div style="position:absolute;left:0;right:0;bottom:4px;z-index:4;">${deskSVG}</div>
      </div>
      <div style="z-index:4;">${plate}</div>
      ${opts.slot || ''}
    </div>`
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
