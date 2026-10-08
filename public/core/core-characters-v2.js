/* VISUAL V2: 8 SHARED REUSABLE SVG CHARACTER PRIMITIVES + 8 VISUAL STATES.
 *
 * 8 Roles (frozen set):
 *   Helix | Product Manager | Architect | Frontend | Backend | QA | Reviewer | Documentation
 *
 * Architecture:
 *   - SHARED SVG SKELETON: head (ellipse) / torso (trapezoid blazer) / arms (two splines)
 *     — 48-72px readable size. ViewBox 48x72 default (scale via wrapper).
 *   - ROLE DIFFERENTIATION (4 codings per role, per CHAR_SYSTEM_V1 §2):
 *       clothing color · hair style · accessory · workstation type
 *   - 8 VISUAL STATES (§6):
 *       IDLE / THINKING / WORKING / REVIEWING / WAITING_HUMAN / BLOCKED / DONE / OFFLINE
 *     Implemented as CSS classes + CSS keyframes. NO JS animation loop (requestAnimationFrame).
 *   - REDUCED MOTION: prefers-reduced-motion disables walking/pulses/breathing. Static indicators retained.
 *   - VISIBILITY PAUSE: when document.hidden, CSS animationPlayState=paused via root[data-doc-hidden].
 *
 * Exports: VAOCoreCharactersV2
 *   .ROLES (8, incl Helix)
 *   .role(id) → definition
 *   .renderSVG(roleId, { state, kind, memberName, model, angle, scale })
 *   .renderStateClasses(roleId, state) → string of CSS classes for mount element
 *   .injectStyles()  — injects @keyframes + state classes into <head> once
 *   ._internals for tests
 */
;(function () {
  'use strict'

  const STATES_V2 = Object.freeze([
    'IDLE', 'THINKING', 'WORKING', 'REVIEWING', 'WAITING_HUMAN', 'BLOCKED', 'DONE', 'OFFLINE',
  ])

  const ROLES = Object.freeze([
    {
      id: 'helix', zh: 'Helix', en: 'Helix',
      desc: { zh: '系统编排中枢', en: 'System Orchestrator' },
      accent: 'var(--orchestrator)',
      hair: 'helm',  hairColor: '#1d2433',
      clothing: { blazer: '#2d2556', shirt: '#8F82FF', tie: 'none' },
      accessory: 'helix-earring', workstation: 'command-hub',
      glyph: 'roleIconHelix', kindName: 'system',
    },
    {
      id: 'product', zh: '产品经理', en: 'Product Manager',
      desc: { zh: '需求与业务', en: 'Requirements & Business' },
      accent: 'var(--role-product)',
      hair: 'wavy-side',  hairColor: '#3a2a1d',
      clothing: { blazer: '#4a3a2a', shirt: '#f3b989', tie: 'clip' },
      accessory: 'clipboard-badge', workstation: 'whiteboard',
      glyph: 'roleIconProduct', kindName: 'human',
    },
    {
      id: 'architect', zh: '架构师', en: 'Architect',
      desc: { zh: '方案与边界', en: 'Plan & Boundaries' },
      accent: 'var(--role-architect)',
      hair: 'short-slick', hairColor: '#222a33',
      clothing: { blazer: '#2d3d3d', shirt: '#5ed0c9', tie: 'narrow' },
      accessory: 'round-glasses-v2', workstation: 'blueprint-desk',
      glyph: 'roleIconArchitect', kindName: 'ai',
    },
    {
      id: 'frontend', zh: '前端工程师', en: 'Frontend Engineer',
      desc: { zh: '界面与交互', en: 'UI & Interaction' },
      accent: 'var(--role-frontend)',
      hair: 'medium-shag', hairColor: '#2d2230',
      clothing: { blazer: '#3a2a33', shirt: '#f2788f', tie: 'none' },
      accessory: 'neck-phones', workstation: 'dual-monitor',
      glyph: 'roleIconFrontend', kindName: 'ai',
    },
    {
      id: 'backend', zh: '后端工程师', en: 'Backend Engineer',
      desc: { zh: '服务与接口', en: 'Services & APIs' },
      accent: 'var(--role-backend)',
      hair: 'crew-cut', hairColor: '#1f2a1e',
      clothing: { blazer: '#2d3a2a', shirt: '#8bc34a', tie: 'wide' },
      accessory: 'db-lanyard', workstation: 'server-rack',
      glyph: 'roleIconBackend', kindName: 'ai',
    },
    {
      id: 'qa', zh: '测试工程师', en: 'QA Engineer',
      desc: { zh: '测试与证据', en: 'Tests & Evidence' },
      accent: 'var(--role-qa)',
      hair: 'bob-cut', hairColor: '#3a3020',
      clothing: { blazer: '#3d3620', shirt: '#f2c94c', tie: 'none' },
      accessory: 'checker-mag', workstation: 'test-bench',
      glyph: 'roleIconQA', kindName: 'human',
    },
    {
      id: 'reviewer', zh: '审查员', en: 'Reviewer',
      desc: { zh: '独立审查', en: 'Independent Review' },
      accent: 'var(--role-reviewer)',
      hair: 'side-part', hairColor: '#2d2620',
      clothing: { blazer: '#3a2e20', shirt: '#c9a27e', tie: 'bow' },
      accessory: 'stamp-rim', workstation: 'review-seat',
      glyph: 'roleIconReviewer', kindName: 'human',
    },
    {
      id: 'docs', zh: '文档专员', en: 'Documentation Specialist',
      desc: { zh: '文档与纪要', en: 'Docs & Minutes' },
      accent: 'var(--role-docs)',
      hair: 'ponytail', hairColor: '#2a3240',
      clothing: { blazer: '#303845', shirt: '#a6b4c8', tie: 'none' },
      accessory: 'book-ribbon-v2', workstation: 'bookshelf',
      glyph: 'roleIconDocs', kindName: 'ai',
    },
  ])
  const RINDEX = Object.freeze(ROLES.reduce((m, r) => (m[r.id] = r, m), {}))
  function role(id) { return RINDEX[id] || null }

  const SVG_DEFS = `<defs>
    <linearGradient id="sk2-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8dcc6"/>
      <stop offset="100%" stop-color="#c7b594"/>
    </linearGradient>
    <radialGradient id="sk2-shadow" cx="0.4" cy="0.35" r="0.85">
      <stop offset="60%" stop-color="transparent"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.22)"/>
    </radialGradient>
    <filter id="ch2-soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="0.35"/>
    </filter>
  </defs>`

  const ACCESSORY_V2 = {
    'helix-earring': `
      <g transform="translate(36 18)" opacity="0.95">
        <circle r="2.4" fill="none" stroke="var(--orchestrator)" stroke-width="1"/>
        <path d="M0 -3 q2 -5 5 0 t5 0" stroke="var(--orchestrator)" stroke-width="1" fill="none"/>
      </g>
      <path d="M14 3 q-2 -8 10 -8 q14 0 10 8" stroke="#151a26" stroke-width="1.8" fill="none"/>
      <rect x="11" y="2" width="3.6" height="5" rx="1.2" fill="#1a2030"/>
      <rect x="29" y="2" width="3.6" height="5" rx="1.2" fill="#1a2030"/>`,
    'clipboard-badge': `
      <rect x="32" y="6" width="12" height="18" rx="1.6" fill="#1a1f2b" stroke="#0c0f16" stroke-width="0.6"/>
      <path d="M35 8 v5 l2 -1.5 l2 1.5 V8" fill="var(--role-product)"/>
      <path d="M34.5 16 h7 M34.5 19 h5" stroke="#ffffff" stroke-width="0.7" opacity="0.9"/>`,
    'round-glasses-v2': `
      <circle cx="17" cy="20" r="3.4" fill="none" stroke="#2a303e" stroke-width="1.3"/>
      <circle cx="31" cy="20" r="3.4" fill="none" stroke="#2a303e" stroke-width="1.3"/>
      <path d="M20.4 20 h1.2 M13 17 l-3 -2 M35 17 l3 -2" stroke="#2a303e" stroke-width="1" stroke-linecap="round"/>`,
    'neck-phones': `
      <path d="M9 38 q0 -14 15 -14 q15 0 15 14" fill="none" stroke="#1a2030" stroke-width="1.8" stroke-linecap="round"/>
      <rect x="6.5" y="36" width="5.5" height="7.5" rx="1.8" fill="#1a2030"/>
      <rect x="36" y="36" width="5.5" height="7.5" rx="1.8" fill="#1a2030"/>`,
    'db-lanyard': `
      <path d="M14 14 L34 14 L31 20 L17 20 Z" fill="none" stroke="#1a2030" stroke-width="1" stroke-linejoin="round"/>
      <ellipse cx="24" cy="30" rx="4.6" ry="1.9" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>
      <path d="M19.4 30 v5 q0 2 4.6 2 t4.6 -2 v-5" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>
      <ellipse cx="24" cy="37" rx="4.6" ry="1.9" fill="none" stroke="var(--role-backend)" stroke-width="1.2"/>`,
    'checker-mag': `
      <circle cx="14" cy="24" r="4.2" fill="none" stroke="#1a2030" stroke-width="1.4"/>
      <path d="M17 27 l5 5" stroke="#1a2030" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="24" y="18" width="10" height="16" rx="1" fill="none" stroke="#1a2030" stroke-width="0.95"/>
      <path d="M27 22 l1 1.2 l2.4 -2.5" stroke="var(--role-qa)" stroke-width="1.1" fill="none"/>
      <path d="M26.5 26 h7 M26.5 29 h6" stroke="#1a2030" stroke-width="0.8" stroke-linecap="round"/>`,
    'stamp-rim': `
      <path d="M16 20 a3.8 3.8 0 0 0 7.6 0" fill="none" stroke="#2a303e" stroke-width="1.3"/>
      <path d="M12 20 h4 M32 20 h4" stroke="#2a303e" stroke-width="1" stroke-linecap="round"/>
      <g transform="translate(28 26)">
        <rect width="11" height="9" rx="1" fill="none" stroke="var(--role-reviewer)" stroke-width="1.1"/>
        <path d="M2 4 h2.4 l1.2 1.2 l3.6 -3.6" stroke="var(--role-reviewer)" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
      </g>`,
    'book-ribbon-v2': `
      <rect x="9" y="6" width="7.6" height="18.5" fill="none" stroke="#1a2030" stroke-width="1"/>
      <rect x="18.6" y="6" width="7.6" height="18.5" fill="none" stroke="#1a2030" stroke-width="1"/>
      <path d="M11.8 5 v0 l0 2.2 l1.6 -1.2 l1.6 1.2 V5" stroke="var(--role-docs)" fill="none" stroke-width="1" stroke-linejoin="round"/>
      <path d="M21.8 5 v0 l0 2.2 l1.6 -1.2 l1.6 1.2 V5" stroke="var(--role-docs)" fill="none" stroke-width="1" stroke-linejoin="round"/>
      <path d="M11 12 h14 M11 15 h14 M11 18 h12" stroke="#1a2030" stroke-width="0.75"/>`,
  }

  const HAIR_V2 = {
    helm: `<path d="M11 15 a13 13 0 0 1 26 0 v-2 q-13 -8 -26 0 z" fill="var(--hair)" stroke="rgba(0,0,0,0.28)" stroke-width="0.6"/>
           <path d="M10 16 a14 9 0 0 0 28 0" stroke="rgba(0,0,0,0.15)" stroke-width="0.6" fill="none"/>`,
    'wavy-side': `<path d="M11 17 q-1 -6 13 -8 q12 1 13 8 q-1 -4 -6 -4 q-3 2 -6 0 q-3 2 -6 0 q-6 0 -8 4 z" fill="var(--hair)" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>`,
    'short-slick': `<path d="M12 17 q0 -7 12 -7 q12 0 12 7 q-1 -4 -5 -4 q-2 1 -5 -1 q-3 2 -5 0 q-4 0 -9 5 z" fill="var(--hair)" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>`,
    'medium-shag': `<path d="M10 18 q-2 -8 14 -9 q15 1 14 9 q-2 -3 -7 -3 q-1 3 -5 1 q-3 2 -5 -1 q-4 1 -11 3 z" fill="var(--hair)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>`,
    'crew-cut': `<path d="M14 16 q0 -5 10 -5 q10 0 10 5 q-1 -3 -4 -3 q-2 0 -4 -1 q-2 1 -4 0 q-2 1 -4 0 q-4 2 -4 4 z" fill="var(--hair)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>`,
    'bob-cut': `<path d="M10 20 q-2 -9 14 -9 q14 0 14 9 v3 q-1 -6 -7 -5 q-2 1 -4 -1 q-3 2 -5 0 q-5 0 -12 4 z" fill="var(--hair)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>`,
    'side-part': `<path d="M12 17 q0 -7 15 -7 q9 0 11 6 q-2 -4 -8 -3 q-2 1 -5 -1 q-2 2 -6 0 q-5 1 -7 5 z" fill="var(--hair)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>`,
    ponytail: `<path d="M10 18 q-2 -8 14 -8 q14 1 14 9 q0 -4 -6 -4 q-1 2 -4 0 q-2 2 -5 0 q-4 2 -5 0 q-6 0 -8 3 z" fill="var(--hair)" stroke="rgba(0,0,0,0.22)" stroke-width="0.6"/>
                <path d="M30 22 q3 2 2 8 q0 3 -2 5" stroke="var(--hair)" stroke-width="3" fill="none" opacity="0.9"/>`,
  }

  function skeleton(r, state) {
    const st = state || 'IDLE'
    const cls = `sk2-fig sk2-state-${(r?.id || 'role')}-${st.toLowerCase().replace(/_/g, '-')}`
    const roleId = r?.id || 'role'
    let torsoStyle = ''
    let headStyle = ''
    let armsGroup = ''
    let extraMarkers = ''
    if (st === 'IDLE') {
      torsoStyle = 'transform:translateY(0.6px) scale(1);'
      armsGroup = `
        <path d="M10 43 q-2 7 2 13 q1.6 2.2 4.4 1.6" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M38 43 q2 7 -2 13 q-1.6 2.2 -4.4 1.6" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>`
    } else if (st === 'THINKING') {
      headStyle = 'transform:translateY(-1.2px) rotate(-4deg);transform-origin:24px 25px;'
      torsoStyle = 'transform:translateY(-0.5px) scale(1.01);'
      armsGroup = `
        <path d="M11 42 q-2 4 0 10 q-1 -4 -4 -8" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M37 41 q1.5 -2 2.4 -10 q-1 -1.6 -3.5 -0.8" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>
        <circle cx="36" cy="27.5" r="1.8" fill="url(#sk2-skin)" stroke="rgba(0,0,0,0.18)" stroke-width="0.45" class="sk2-hand sk2-hand-r"/>`
    } else if (st === 'WORKING') {
      torsoStyle = 'transform:translateY(-0.6px) scale(1.015);'
      armsGroup = `
        <path d="M11 44 q-1 6 3 12 q1 0 3 -2" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M37 44 q1 6 -3 12 q-1 0 -3 -2" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>
        <rect x="10" y="56.5" width="28" height="4.5" rx="1.4" fill="rgba(15,21,34,0.92)" stroke="rgba(0,0,0,0.3)" stroke-width="0.5" class="sk2-kbd"/>
        <g font-family="var(--mono)" font-size="3.6" fill="rgba(255,255,255,0.75)" opacity="0.85" class="sk2-kbd-keys">
          <text x="12" y="60">Q W E</text>
          <text x="12" y="63.8">A S D F</text>
        </g>`
    } else if (st === 'REVIEWING') {
      headStyle = 'transform:translateX(2.4px) rotate(8deg);transform-origin:24px 25px;'
      torsoStyle = 'transform:translateX(1.2px);'
      armsGroup = `
        <path d="M12 44 q0 6 3 10" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M40 40 q3 -2 6 0 q2 4 -1 10" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>
        <g transform="translate(40 46)" class="sk2-clipboard">
          <rect x="0" y="0" width="16" height="18" rx="1.8" fill="rgba(255,255,255,0.82)" stroke="rgba(0,0,0,0.22)" stroke-width="0.5"/>
          <rect x="2" y="2.6" width="12" height="1.6" rx="0.8" fill="var(--reviewing)" opacity="0.6"/>
          <rect x="2" y="6" width="10" height="1.2" rx="0.6" fill="rgba(0,0,0,0.28)" opacity="0.6"/>
          <rect x="2" y="8.6" width="12" height="1.2" rx="0.6" fill="rgba(0,0,0,0.24)" opacity="0.5"/>
          <path d="M3.2 13.4 L5.6 15.8 L12.8 8.6" stroke="var(--done)" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.9"/>
        </g>`
    } else if (st === 'WAITING_HUMAN') {
      headStyle = 'transform:rotate(18deg);transform-origin:24px 25px;'
      torsoStyle = 'transform:translateX(1.6px) rotate(3deg);transform-origin:24px 52px;'
      armsGroup = `
        <path d="M12 44 q2 6 0 11 q-3 0 -3.5 -3" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M36 43 q-2 5 0 12 q2 2 4 -0.5" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>
        <g transform="translate(41 30)" class="sk2-waiting-gesture">
          <path d="M-4 4 V-4 Q-4 -6 -2.4 -6 Q-0.8 -6 -0.8 -4 V-1 M-0.8 -6 Q1 -6 1 -4 V0 M1 -6 Q2.6 -6 2.6 -5 V2 M2.6 -3 Q4.2 -3 4.2 -1.6 V7 Q4.2 8.8 1.5 9.6 L-2.5 10 Q-4 9.6 -4 8.6 Z" fill="none" stroke="var(--waiting-human)" stroke-width="1.15" stroke-linejoin="round"/>
        </g>`
    } else if (st === 'BLOCKED') {
      torsoStyle = 'transform:translateX(-0.8px);'
      armsGroup = `
        <path d="M12 44 q-3 7 2 14 q5 -1 9 -7" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M36 44 q3 7 -2 14 q-5 -1 -9 -7" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>`
      extraMarkers = `<g class="sk2-blocked-pose" transform="translate(24 52)" opacity="0.82">
        <circle r="5.4" fill="color-mix(in srgb,var(--blocked) 14%,var(--panel))" stroke="var(--blocked)" stroke-width="0.85"/>
        <path d="M-3.2 -2.2 L3.2 2.2 M3.2 -2.2 L-3.2 2.2" stroke="var(--blocked)" stroke-width="1.3" stroke-linecap="round"/>
      </g>`
    } else if (st === 'DONE') {
      torsoStyle = 'transform:translateY(-0.6px) scale(1.012);'
      armsGroup = `
        <path d="M11 45 q0 6 3 10" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M37 43 q1.5 -8 8 -10 q2.2 0 2.5 3 q0 3 -3 4" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>`
      extraMarkers = `<g class="sk2-done-gesture" transform="translate(48 28)" opacity="0.95">
        <circle r="6" fill="color-mix(in srgb,var(--done) 20%,var(--panel))" stroke="var(--done)" stroke-width="0.9"/>
        <path d="M-3.2 0.6 L-1 2.8 L3.4 -2" stroke="var(--done)" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
      </g>`
    } else if (st === 'OFFLINE') {
      torsoStyle = 'filter:grayscale(0.6) opacity(0.58);'
      headStyle = 'transform:translateY(2.4px) rotate(-6deg);transform-origin:24px 25px;opacity:0.65;'
      armsGroup = `
        <path d="M10 46 q-1 8 3 12" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M38 46 q1 8 -3 12" fill="none" stroke="var(--blazer)" stroke-width="4.8" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>`
    } else {
      armsGroup = `
        <path d="M11 42 q-2 5 0 10 q1 3 4 3" fill="none" stroke="var(--blazer)" stroke-width="4.5" stroke-linecap="round" class="sk2-arm sk2-arm-l"/>
        <path d="M37 42 q2 5 0 10 q-1 3 -4 3" fill="none" stroke="var(--blazer)" stroke-width="4.5" stroke-linecap="round" class="sk2-arm sk2-arm-r"/>`
    }
    return `
    <g class="${cls}" style="--role-accent:${r?.accent || 'var(--accent)'};--hair:${r?.hairColor || '#2a2a2a'};--blazer:${r?.clothing?.blazer || '#3a3e4a'};--shirt:${r?.clothing?.shirt || '#cfd3dc'};">
      <ellipse cx="24" cy="70" rx="14" ry="2.8" fill="rgba(0,0,0,0.24)" class="sk2-shadow"/>
      <g class="sk2-torso" style="${torsoStyle}">
        <path d="M12 40 l-2 24 h28 l-2 -24 q-2 4 -12 4 t-12 -4 z" fill="var(--blazer)" stroke="rgba(0,0,0,0.28)" stroke-width="0.7"/>
        <rect x="21" y="37" width="6" height="7.5" rx="1.6" fill="var(--shirt)" stroke="rgba(0,0,0,0.18)" stroke-width="0.55" class="sk2-shirt"/>
      </g>
      <g class="sk2-head-wrap" style="${headStyle}">
        <circle cx="24" cy="25" r="8.5" fill="url(#sk2-skin)" stroke="rgba(0,0,0,0.22)" stroke-width="0.7" class="sk2-head"/>
        <circle cx="24" cy="25" r="8.5" fill="url(#sk2-shadow)" opacity="0.55"/>
        <g class="sk2-hair">${HAIR_V2[r?.hair] || HAIR_V2['crew-cut']}</g>
        <g fill="#1d2230" class="sk2-eyes">
          <circle cx="21" cy="26.8" r="${st === 'OFFLINE' ? 0.3 : 1.05}" class="sk2-eye sk2-eye-l"/>
          <circle cx="27" cy="26.8" r="${st === 'OFFLINE' ? 0.3 : 1.05}" class="sk2-eye sk2-eye-r"/>
        </g>
        <path d="${st === 'DONE' ? 'M21.5 30.2 q2.5 2.6 5 0' : st === 'BLOCKED' ? 'M22 30.8 q2 -2 4 0' : 'M22 30 q2 1.4 4 0'}" stroke="#6a4a36" fill="none" stroke-width="${st === 'BLOCKED' ? 1 : 0.8}" stroke-linecap="round" class="sk2-mouth"/>
        <g class="sk2-accessory">${ACCESSORY_V2[r?.accessory] || ''}</g>
      </g>
      <g class="sk2-arms">${armsGroup}</g>
      ${extraMarkers}
    </g>`
  }

  function stateIndicator(state) {
    const S = globalThis.VAOCoreStates
    if (!S) return ''
    const key = S.STATES?.[state]?.key || state.toLowerCase().replace(/_/g, '-')
    const color = `var(--${key})`
    const gly = S.stateGlyphG(state, 9.6, color) || ''
    return `<g class="sk2-state-pill" transform="translate(1 -4)" opacity="0.88">
      <rect x="0" y="0" width="30" height="11" rx="5.5" fill="var(--panel-2)" stroke="var(--line)" stroke-width="0.6" opacity="0.92"/>
      <g transform="translate(3.5 0.7)" fill="${color}">${gly}</g>
      <text x="15" y="8.2" font-size="6.6" fill="${color}" font-weight="700" style="font-family:var(--sans),system-ui;" text-anchor="middle" opacity="0.92">${S.STATES?.[state]?.zh || state}</text>
    </g>`
  }

  function workstationMini(r, state) {
    const stKey = state || 'IDLE'
    const active = (stKey === 'WORKING' || stKey === 'THINKING' || stKey === 'REVIEWING')
    const dim = stKey === 'OFFLINE'
    const op = dim ? 0.45 : (active ? 1 : 0.82)
    const accent = r?.accent || 'var(--accent)'
    const ws = r?.workstation
    const monitor = (x, w, h, content) => `<g transform="translate(${x} 0)" opacity="${op}">
      <rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.7"/>
      <rect x="1.2" y="1.2" width="${w-2.4}" height="${h-2.4}" rx="1" fill="color-mix(in srgb, ${accent} ${active ? 22 : 10}%, #ffffff18)"/>
      ${content || ''}
    </g>`
    if (ws === 'dual-monitor') return `<g class="ws-mini ws-dual">${monitor(0, 18, 12, '<rect x="3" y="3.5" width="5" height="1.5" rx="0.6" fill="#fff" opacity="0.85"/><rect x="3" y="6.5" width="12" height="1" rx="0.5" fill="#fff" opacity="0.55"/><rect x="3" y="8.5" width="10" height="1" rx="0.5" fill="#fff" opacity="0.45"/>')}${monitor(20, 18, 12, `<g stroke="${accent}" stroke-width="0.7" fill="none" opacity="0.85"><path d="M25 4 L29 4 L30 7 L26.5 9.5 L24 7 Z"/><circle cx="34" cy="6.5" r="1.6"/></g>`)}</g>`
    if (ws === 'server-rack') return `<g class="ws-mini ws-server" opacity="${op}">
      <rect x="0" y="0" width="42" height="16" rx="2" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.1)" stroke-width="0.6"/>
      <line x1="0" y1="5" x2="42" y2="5" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      <line x1="0" y1="10.5" x2="42" y2="10.5" stroke="rgba(0,0,0,0.12)" stroke-width="0.5"/>
      <circle cx="4" cy="2.6" r="0.9" fill="${accent}" opacity="0.78"/><rect x="9" y="2" width="10" height="1.6" rx="0.7" fill="${accent}" opacity="0.7"/>
      <circle cx="4" cy="7.8" r="0.9" fill="var(--working)" opacity="0.65"/><rect x="9" y="7.2" width="12" height="1.6" rx="0.7" fill="var(--working)" opacity="0.6"/>
      <circle cx="4" cy="13" r="0.9" fill="var(--done)" opacity="0.55"/><rect x="9" y="12.4" width="14" height="1.6" rx="0.7" fill="var(--done)" opacity="0.5"/>
    </g>`
    if (ws === 'blueprint-desk') return `<g class="ws-mini ws-blueprint" opacity="${op}">
      <rect x="0" y="4" width="42" height="12" rx="2" fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.08)" stroke-width="0.6"/>
      <g stroke="${accent}" stroke-width="0.65" fill="none" opacity="0.85">
        <rect x="4" y="7" width="10" height="6"/><rect x="16" y="6" width="14" height="8"/><circle cx="37" cy="10" r="2.4"/>
      </g>
    </g>`
    if (ws === 'whiteboard') return `<g class="ws-mini ws-whiteboard" opacity="${op}">
      <rect x="0" y="0" width="42" height="18" rx="2" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.6"/>
      <g stroke="${accent}" stroke-width="0.65" fill="none" opacity="0.85">
        <rect x="4" y="3" width="10" height="5" rx="1"/><rect x="16" y="3" width="12" height="5" rx="1"/><rect x="30" y="3" width="8" height="5" rx="1"/>
      </g>
      <g opacity="0.7"><rect x="4" y="11" width="10" height="2.2" rx="0.8" fill="var(--role-product)"/><rect x="16" y="11" width="12" height="2.2" rx="0.8" fill="var(--role-frontend)" opacity="0.75"/></g>
    </g>`
    if (ws === 'test-bench') return `<g class="ws-mini ws-test" opacity="${op}">
      <rect x="0" y="2" width="42" height="14" rx="2" fill="rgba(255,255,255,0.7)" stroke="rgba(0,0,0,0.1)" stroke-width="0.6"/>
      <rect x="3" y="6" width="7" height="6" rx="1" fill="color-mix(in srgb,var(--done) 22%,transparent)" stroke="var(--done)" stroke-width="0.55"/>
      <path d="M5 9 L6.5 10.5 L9 8" stroke="var(--done)" stroke-width="1.2" fill="none"/>
      <rect x="12" y="6" width="7" height="6" rx="1" fill="color-mix(in srgb,var(--blocked) 20%,transparent)" stroke="var(--blocked)" stroke-width="0.55"/>
      <path d="M13.5 8 L17.5 12 M17.5 8 L13.5 12" stroke="var(--blocked)" stroke-width="1"/>
      <rect x="21" y="6" width="18" height="6" rx="1" fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>
    </g>`
    if (ws === 'review-seat') return `<g class="ws-mini ws-review" opacity="${op}">
      <rect x="0" y="2" width="20" height="14" rx="2" fill="rgba(255,255,255,0.7)" stroke="rgba(0,0,0,0.1)" stroke-width="0.6"/>
      <rect x="22" y="2" width="20" height="14" rx="2" fill="rgba(255,255,255,0.7)" stroke="rgba(0,0,0,0.1)" stroke-width="0.6"/>
      <line x1="42" y1="2" x2="42" y2="16" stroke="rgba(0,0,0,0.15)" stroke-width="0.6"/>
      <path d="M3 7 l1.5 1.6 l-3 -3" stroke="var(--done)" stroke-width="1" fill="none" transform="translate(0 1)"/>
      <path d="M25 7 L29 11 L29 7 L25 11" stroke="var(--blocked)" stroke-width="1"/>
    </g>`
    if (ws === 'bookshelf') return `<g class="ws-mini ws-books" opacity="${op}">
      <rect x="0" y="2" width="42" height="7" rx="1.5" fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>
      <rect x="2" y="4" width="4" height="4" fill="var(--role-product)" opacity="0.7"/>
      <rect x="7" y="4" width="3" height="4" fill="var(--role-architect)" opacity="0.72"/>
      <rect x="11" y="4" width="4.5" height="4" fill="var(--role-frontend)" opacity="0.7"/>
      <rect x="16.5" y="4" width="3.5" height="4" fill="var(--role-backend)" opacity="0.72"/>
      <rect x="21" y="4" width="4" height="4" fill="var(--role-qa)" opacity="0.7"/>
      <rect x="26" y="4" width="4.5" height="4" fill="var(--role-reviewer)" opacity="0.72"/>
      <rect x="31.5" y="4" width="5" height="4" fill="var(--role-docs)" opacity="0.78"/>
    </g>`
    if (ws === 'command-hub') return `<g class="ws-mini ws-helix" opacity="${op}">
      <path d="M-2 14 Q24 -4 50 14" fill="color-mix(in srgb,var(--orchestrator) 22%,var(--panel))" stroke="color-mix(in srgb,var(--orchestrator) 55%,var(--line))" stroke-width="0.9"/>
      ${monitor(5, 9, 8, `<circle cx="9.5" cy="4.2" r="1.5" fill="none" stroke="var(--orchestrator)" stroke-width="0.7"/>`)}
      ${monitor(17, 12, 9, `<path d="M20 4 L22 4 L23 7 L25 4 L27 7 L28 4" stroke="var(--orchestrator)" stroke-width="0.7" fill="none"/>`)}
      ${monitor(32, 10, 8, `<rect x="35" y="4.5" width="4" height="1.2" rx="0.5" fill="#fff" opacity="0.75"/>`)}
    </g>`
    return `<g class="ws-mini ws-default"><rect x="0" y="5" width="42" height="11" rx="2" fill="var(--panel-2)" stroke="var(--line)" stroke-width="0.6"/></g>`
  }

  const CSS_INJECTED_KEY = 'core-chars-v2-css'

  function injectStyles() {
    if (document.getElementById(CSS_INJECTED_KEY)) return
    const s = document.createElement('style')
    s.id = CSS_INJECTED_KEY
    s.textContent = `
@keyframes ch2-breath { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-0.7px) scale(1.008)} }
@keyframes ch2-type { 0%,100%{transform:rotate(-3deg)} 50%{transform:rotate(5deg)} }
@keyframes ch2-type-alt { 0%,100%{transform:rotate(5deg)} 50%{transform:rotate(-4deg)} }
@keyframes ch2-think-tilt { 0%,100%{transform:rotate(-1.5deg)} 50%{transform:rotate(2.5deg)} }
@keyframes ch2-review-tilt { 0%,100%{transform:translateX(0) rotate(0)} 50%{transform:translateX(2px) rotate(1deg)} }
@keyframes ch2-pulse-amber { 0%,100%{opacity:0.75} 50%{opacity:1;filter:drop-shadow(0 0 4px var(--waiting-human))} }
@keyframes ch2-pulse-orch { 0%,100%{filter:drop-shadow(0 0 0 transparent)} 50%{filter:drop-shadow(0 0 5px var(--orchestrator))} }
@keyframes ch2-blocked-shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-1.2px)} 40%,80%{transform:translateX(1.2px)} }
@keyframes ch2-done-pop { 0%{transform:scale(1)} 30%{transform:scale(1.06)} 60%{transform:scale(0.985)} 100%{transform:scale(1)} }
@keyframes ch2-wait-pulse { 0%,100%{stroke-dashoffset:0} 50%{stroke-dashoffset:10} }
.sk2-fig{transform-origin:24px 50px;will-change:transform;}
.sk2-head{transform-origin:24px 25px;}
.sk2-arm-l{transform-origin:12px 44px;}
.sk2-arm-r{transform-origin:36px 44px;}
.sk2-state-idle .sk2-fig{animation:ch2-breath 3.6s ease-in-out infinite;}
.sk2-state-thinking .sk2-fig{animation:ch2-breath 3.2s ease-in-out infinite;}
.sk2-state-thinking .sk2-head{animation:ch2-think-tilt 2.6s ease-in-out infinite;}
.sk2-state-working .sk2-fig{animation:ch2-breath 2.8s ease-in-out infinite;}
.sk2-state-working .sk2-arm-r{animation:ch2-type 260ms ease-in-out infinite;}
.sk2-state-working .sk2-arm-l{animation:ch2-type-alt 290ms ease-in-out infinite;}
.sk2-state-reviewing .sk2-fig{animation:ch2-review-tilt 2.2s ease-in-out infinite;}
.sk2-state-waiting-human .sk2-fig{animation:ch2-pulse-amber 1.6s ease-in-out infinite;}
.sk2-state-waiting-human {color:var(--waiting-human);}
.sk2-state-blocked .sk2-fig{animation:ch2-blocked-shake 520ms ease-in-out infinite;}
.sk2-state-done .sk2-fig{animation:ch2-done-pop 900ms ease-out 1;}
.sk2-state-offline .sk2-fig{filter:grayscale(0.5) opacity(0.55);}
.sk2-state-helix-thinking,
.sk2-state-helix-working {animation:ch2-pulse-orch 2.2s ease-in-out infinite;}
.sk2-state-helix-waiting-human {animation:ch2-pulse-amber 1.6s ease-in-out infinite;}
@media (prefers-reduced-motion: reduce){
  .sk2-fig,.sk2-head,.sk2-arm-l,.sk2-arm-r{animation:none !important;animation-duration:1ms !important;}
  .sk2-state-working .sk2-arm-r,.sk2-state-working .sk2-arm-l{transform:none !important;}
  .sk2-state-thinking .sk2-head{transform:none !important;}
  .sk2-state-helix-thinking,.sk2-state-helix-working,.sk2-state-waiting-human .sk2-fig{animation:none !important;filter:none !important;}
}
html[data-doc-hidden="true"] .sk2-fig,
html[data-doc-hidden="true"] .sk2-head,
html[data-doc-hidden="true"] .sk2-arm-l,
html[data-doc-hidden="true"] .sk2-arm-r {
  animation-play-state: paused !important;
}
.sk2-nameplate{font-family:var(--sans),system-ui;}`
    document.head.appendChild(s)
  }

  function renderSVG(roleId, opts = {}) {
    injectStyles()
    const r = role(roleId)
    if (!r) return `<g class="sk2-unknown char-v2 char-v2-unknown" data-role="unknown"><rect x="0" y="0" width="48" height="72" rx="6" fill="var(--panel-2)" stroke="var(--line)"/><text x="24" y="40" text-anchor="middle" font-size="10" fill="var(--text-muted)">?</text></g>`
    const scale = opts.scale || (roleId === 'helix' ? 1.85 : 1.45)
    const angle = opts.angle || 0
    const state = opts.state || 'IDLE'
    const stateCls = 'sk2-state-' + (state.toLowerCase().replace(/_/g, '-'))
    const roleStateCls = 'sk2-state-' + roleId + '-' + (state.toLowerCase().replace(/_/g, '-'))
    const st = state || 'IDLE'
    const S = globalThis.VAOCoreStates
    const ringColor = `var(--${(S?.STATES?.[st]?.key) || st.toLowerCase().replace(/_/g,'-')})`
    const showIndicator = st !== 'OFFLINE'
    const memberBadge = (() => {
      if (!S) return ''
      if (roleId === 'helix') return S.BADGE_SVG.system({ size: 14 })
      if (opts.kind === 'human') return S.BADGE_SVG.human({ size: 14 })
      return S.BADGE_SVG.ai({ size: 14 })
    })()
    const modelBadge = opts.model && S ? S.BADGE_SVG.model(String(opts.model).slice(0, 12)) : ''
    const wsScale = Math.min(1.12, Math.max(1.02, scale * 0.82))
    const ws = workstationMini(r, state)
    const deskState = st === 'OFFLINE'
      ? `<rect x="3" y="58" width="42" height="14" rx="4" fill="var(--panel-2)" stroke="var(--line)" stroke-width="0.8" opacity="0.55"/>`
      : `<g class="sk2-desk">
           <rect x="3" y="58" width="42" height="14" rx="4" fill="color-mix(in srgb,var(--panel) 95%,transparent)" stroke="var(--line)" stroke-width="0.8"/>
           <rect x="4" y="57" width="40" height="4" rx="2" fill="color-mix(in srgb,var(--panel-2) 85%,transparent)" stroke="rgba(0,0,0,0.06)" stroke-width="0.6"/>
         </g>`
    const glow = (st === 'WORKING' || st === 'THINKING' || st === 'REVIEWING')
      ? `<rect x="2" y="56" width="44" height="16" rx="5" fill="none" stroke="color-mix(in srgb,${ringColor} 55%,transparent)" stroke-width="0.7" opacity="0.6" class="reduced-motion-hidden"/>`
      : ''
    const blockedMarker = st === 'BLOCKED'
      ? `<g class="sk2-blocked-mark" transform="translate(36 18)">
           <circle r="7" fill="color-mix(in srgb,var(--blocked) 16%,var(--panel))" stroke="var(--blocked)" stroke-width="1"/>
           <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke="var(--blocked)" stroke-width="1.6" stroke-linecap="round"/>
         </g>`
      : ''
    const doneCheck = st === 'DONE'
      ? `<g class="sk2-done-mark" transform="translate(36 18)">
           <circle r="7" fill="color-mix(in srgb,var(--done) 18%,var(--panel))" stroke="var(--done)" stroke-width="1"/>
           <path d="M-3.5 0.5 L-1 3 L4 -2.5" stroke="var(--done)" stroke-width="1.7" fill="none" stroke-linejoin="round"/>
         </g>`
      : ''
    const waitHand = st === 'WAITING_HUMAN'
      ? `<g class="sk2-wait-mark" transform="translate(36 18)">
           <circle r="7" fill="color-mix(in srgb,var(--waiting-human) 18%,var(--panel))" stroke="var(--waiting-human)" stroke-width="1"/>
           <path d="M-4 3 V-3 Q-4 -4 -2.5 -4 Q-1 -4 -1 -3 V0 M-1 -4 Q1 -4 1 -3 V0 M1 -4 Q2.5 -4 2.5 -3 V1 M2.5 -2 Q3.6 -2.5 3.6 -1.5 V3 Q3.6 4.5 1.5 5 L-2.5 5.5 Q-4 5.3 -4 4 Z" fill="none" stroke="var(--waiting-human)" stroke-width="1.3" stroke-linejoin="round"/>
         </g>`
      : ''
    const offlineX = st === 'OFFLINE'
      ? `<g class="sk2-offline-mark" transform="translate(36 18)">
           <circle r="6" fill="none" stroke="var(--offline)" stroke-width="1.1" stroke-dasharray="2 1.5"/>
         </g>`
      : ''
    const figureW = Math.round(48 * scale)
    const figureH = Math.round(82 * scale)
    const ariaLbl = `${r.zh} · ${r.en} · ${state}`
    return `<g class="char-v2 char-v2-${roleId} ${stateCls} ${roleStateCls}" data-role="${roleId}" data-state="${state}" aria-label="${ariaLbl.replace(/"/g,'&quot;')}" role="img" tabindex="0">
      <g transform="scale(${scale})">
        <g transform="rotate(${angle} 24 50)">
          ${skeleton(r, state)}
        </g>
        ${deskState}
        ${glow}
        <g transform="translate(3 47.2) scale(${wsScale})">${ws}</g>
        ${showIndicator ? stateIndicator(state) : ''}
        ${blockedMarker}${doneCheck}${waitHand}${offlineX}
        <g class="sk2-meta" transform="translate(0 74)" style="display:none;">
          ${memberBadge}${modelBadge}
        </g>
      </g>
    </g>`
  }

  function renderStateClasses(roleId, state) {
    const key = (state || 'IDLE').toLowerCase().replace(/_/g, '-')
    return `sk2-state-${key} sk2-state-${roleId}-${key}`
  }

  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    try {
      document.addEventListener('visibilitychange', () => {
        if (!document || !document.documentElement) return
        document.documentElement.setAttribute('data-doc-hidden', document.hidden ? 'true' : 'false')
      }, { once: false, passive: true })
      if (document.visibilityState === 'hidden' && document.documentElement) {
        document.documentElement.setAttribute('data-doc-hidden', 'true')
      }
    } catch (_) { /* ignore in jsdom/non-browser environments */ }
  }

  const api = Object.freeze({
    ROLES,
    ROLE_COUNT: ROLES.length,
    STATES: STATES_V2,
    role,
    renderSVG,
    renderStateClasses,
    injectStyles,
    _internals: { ACCESSORY_V2, HAIR_V2, skeleton, workstationMini, SVG_DEFS },
  })
  globalThis.VAOCoreCharactersV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
