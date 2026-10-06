/* VISUAL STATE SYSTEM V2: primitives for 8 canonical states per §10 VISUAL_IDENTITY_V2.md,
 * §6 CHARACTER_SYSTEM_V1.md Helix state mapping, and §5 state ring / glyph / motion.
 *
 * Invariants:
 * - State NEVER relies on color alone: glyph + ring/line + text + optional motion.
 * - Each state has a unique glyph (SVG path, 16px grid), not just a color.
 * - Reduced-motion: only static equivalent (ring solid, no pulse dots).
 *
 * Exported:
 * - STATES = canonical state enum with metadata (color var, label EN, label ZH, glyph id)
 * - renderRing(el, state, opts): state ring / dash pattern / border
 * - renderStateGlyph(kind): 16px SVG inline data URL or <svg> node
 * - humanStateGlyph / evidenceChip / badgeShape factories
 */
;(function () {
  'use strict'

  // Canonical state set — matches design doc exactly: 8 states.
  const STATES = Object.freeze({
    IDLE: {
      id: 'IDLE',
      key: 'idle',
      label: 'Idle',
      zh: '空闲',
      glyph: 'dot',
      ring: 'solid',
    },
    THINKING: {
      id: 'THINKING',
      key: 'thinking',
      label: 'Planning',
      zh: '规划中',
      glyph: 'dots3',
      ring: 'dashed',
    },
    WORKING: {
      id: 'WORKING',
      key: 'working',
      label: 'Dispatching',
      zh: '派发中',
      glyph: 'bolt',
      ring: 'double',
    },
    REVIEWING: {
      id: 'REVIEWING',
      key: 'reviewing',
      label: 'Reviewing',
      zh: '评审中',
      glyph: 'scale',
      ring: 'dashed',
    },
    WAITING_HUMAN: {
      id: 'WAITING_HUMAN',
      key: 'waiting-human',
      label: 'Waiting Human',
      zh: '等待人类',
      glyph: 'hand',
      ring: 'solid-thick',
    },
    BLOCKED: {
      id: 'BLOCKED',
      key: 'blocked',
      label: 'Blocked',
      zh: '已阻塞',
      glyph: 'x',
      ring: 'solid-thick',
    },
    DONE: {
      id: 'DONE',
      key: 'done',
      label: 'Completed',
      zh: '已完成',
      glyph: 'check',
      ring: 'solid',
    },
    OFFLINE: {
      id: 'OFFLINE',
      key: 'offline',
      label: 'Offline',
      zh: '离线',
      glyph: 'slash',
      ring: 'dotted',
    },
  })

  // Helix panel mapping per CHARACTER_SYSTEM_V1.md §3.1 (Helix visible state ↔ seat state)
  const HELIX_STATE_MAP = Object.freeze({
    Idle: 'IDLE',
    Planning: 'THINKING',
    Dispatching: 'WORKING',
    WaitingHuman: 'WAITING_HUMAN',
    Waiting_Human: 'WAITING_HUMAN',
    Reviewing: 'REVIEWING',
    Completed: 'DONE',
    Blocked: 'BLOCKED',
    Offline: 'OFFLINE',
  })

  // Inline 16×16 SVG glyphs — unique shapes per state. No font dependency.
  const GLYPHS = {
    dot: `<circle cx="8" cy="8" r="2.4" fill="currentColor"/>`,
    dots3: `<circle cx="4" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/>`,
    bolt: `<path d="M9 2 L4 10 L8 10 L7 14 L12 6 L8 6 Z" fill="currentColor"/>`,
    scale: `<path d="M8 3 L8 13 M4 11 L8 9 L12 11 M4 11 L4 13 L7 13 Z M12 11 L12 13 L9 13 Z" stroke="currentColor" fill="none" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>`,
    hand: `<path d="M5 12 V6 Q5 5 6 5 Q7 5 7 6 V9 M7 6 Q7 5 8 5 Q9 5 9 6 V9 M9 6 Q9 5 10 5 Q11 5 11 6 V10 M11 7 Q11 6 12 7 L12 12 Q12 13 10.5 13.5 L7 14 Q6 14 5.5 13 Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>`,
    x: `<path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
    check: `<path d="M3 9 L7 13 L13 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`,
    slash: `<path d="M12 4 L4 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
    roleIconHelix: `<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="5" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 8 Q6 2 8 5 Q10 11 12 8"/></g>`,
    roleIconProduct: `<path d="M4 5 h8 v6 h-8 z M4 11 h5 v2 h-5 z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M5 7.5 l2 1 l4 -2" stroke="currentColor" stroke-width="1" fill="none"/>`,
    roleIconArchitect: `<rect x="4" y="5" width="3" height="3" stroke="currentColor" fill="none" stroke-width="1"/><rect x="8" y="5" width="3" height="3" stroke="currentColor" fill="none" stroke-width="1"/><rect x="4" y="9" width="3" height="3" stroke="currentColor" fill="none" stroke-width="1"/><rect x="8" y="9" width="3" height="3" stroke="currentColor" fill="none" stroke-width="1"/>`,
    roleIconFrontend: `<rect x="3.5" y="4" width="9" height="6.5" rx="1" stroke="currentColor" stroke-width="1.15" fill="none"/><path d="M10 8.5 L7 12 M6 9 h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>`,
    roleIconBackend: `<ellipse cx="8" cy="5" rx="4.2" ry="1.5" stroke="currentColor" fill="none" stroke-width="1.15"/><path d="M3.8 5 v5 a4.2 1.5 0 0 0 8.4 0 v-5" stroke="currentColor" fill="none" stroke-width="1.15"/><ellipse cx="8" cy="10" rx="4.2" ry="1.5" stroke="currentColor" fill="none" stroke-width="1.15"/>`,
    roleIconQA: `<circle cx="8" cy="8" r="5" stroke="currentColor" fill="none" stroke-width="1.15"/><path d="M10.5 6.5 L7 10.5 L5.5 9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>`,
    roleIconReviewer: `<path d="M4 4 h8 v7 l-3 2 h-2 z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/><path d="M6 7 h4 M6 9 h4" stroke="currentColor" stroke-width="1"/>`,
    roleIconDocs: `<path d="M5 3 h5 l2 2 v10 h-7 z M10 3 v2 h2 M6 8 h4 M6 10.5 h3" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>`,
  }

  const RING_STYLES = {
    solid:        'border-style:solid; border-width:2px;',
    double:       'border-style:double; border-width:3px;',
    dashed:       'border-style:dashed; border-width:2px;',
    'solid-thick':'border-style:solid; border-width:3px;',
    dotted:       'border-style:dotted; border-width:2px;',
  }

  function svg(glyph, size = 16, cls = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" class="${cls}" focusable="false">${GLYPHS[glyph] || ''}</svg>`
  }

  function stateGlyphSvg(stateOrGlyph, size = 16, cls = '') {
    if (!stateOrGlyph) return ''
    if (GLYPHS[stateOrGlyph]) return svg(stateOrGlyph, size, cls)
    const s = typeof stateOrGlyph === 'string' ? STATES[stateOrGlyph] : stateOrGlyph
    return s ? svg(s.glyph, size, cls) : ''
  }

  function ringCss(state, { size = 44 } = {}) {
    const s = typeof state === 'string' ? STATES[state] : state
    if (!s) return ''
    const color = `var(--${s.key === 'waiting-human' ? 'waiting-human' : s.key})`
    return `border-color:${color}; ${RING_STYLES[s.ring] || ''} width:${size}px; height:${size}px; border-radius:${size * 0.42}px / ${size * 0.22}px;`
  }

  // Helix panel display state → canonical seat state (one-to-one, spec-mandated).
  function helixToSeatState(helixLabel) {
    if (!helixLabel) return 'IDLE'
    const clean = String(helixLabel).replace(/[\s_]+/g, '')
    return HELIX_STATE_MAP[helixLabel] || HELIX_STATE_MAP[clean] || 'IDLE'
  }

  // Badge primitives: HUMAN = circular, AI = hexagonal (flat top), Model Pill = pill
  const BADGE = Object.freeze({
    human: (opts = {}) => {
      const size = opts.size || 16
      const label = opts.label || 'HUMAN'
      return `<span class="badge badge-human" role="img" aria-label="人类成员" title="Human Member" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;border:1.5px solid var(--line);background:var(--panel);font-family:var(--sans);font-size:${size * 0.4}px;color:var(--text-muted);font-weight:600;letter-spacing:.04em;line-height:1;user-select:none;">${label.length > 4 ? label.slice(0, 4) : label}</span>`
    },
    ai: (opts = {}) => {
      const size = opts.size || 16
      const label = opts.label || 'AI'
      // Flat-top hexagon via clip-path
      const clip = 'polygon(18% 0, 82% 0, 100% 50%, 82% 100%, 18% 100%, 0 50%)'
      return `<span class="badge badge-ai" role="img" aria-label="AI 成员" title="AI Agent Member" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border:1.5px solid var(--line);background:var(--panel);clip-path:${clip};font-family:var(--sans);font-size:${size * 0.42}px;color:var(--text-muted);font-weight:600;letter-spacing:.04em;line-height:1;user-select:none;">${label.length > 3 ? label.slice(0, 3) : label}</span>`
    },
    system: (opts = {}) => {
      const size = opts.size || 16
      return `<span class="badge badge-system" role="img" aria-label="系统编排" title="System Orchestrator" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${size * 0.28}px;border:1.6px double var(--orchestrator);background:linear-gradient(180deg, transparent 30%, rgba(143,130,255,0.12));color:var(--orchestrator);font-size:0;user-select:none;position:relative;">${svg('roleIconHelix', size * 0.6, '')}</span>`
    },
    model: (text, opts = {}) => {
      if (!text) return ''
      const t = String(text).slice(0, 20)
      return `<span class="pill model-badge" style="display:inline-flex;align-items:center;background:var(--panel-2);color:var(--text-muted);border:1px solid var(--line);font-family:var(--sans);font-weight:500;padding:2px 8px;border-radius:999px;line-height:16px;font-size:11px;">${t}</span>`
    },
  })

  // Evidence chips (§12): build / test / review / human; states pass/fail/missing/stale
  const EVIDENCE = Object.freeze({
    STATES: { PASS: 'pass', FAIL: 'fail', MISSING: 'missing', STALE: 'stale' },
    chip(kind, state, opts = {}) {
      const labelMap = { build: 'build', test: 'test', review: 'review', human: 'human' }
      const labels = { build: '构建', test: '测试', review: '审查', human: '人类' }
      const stateColor = {
        pass: 'var(--done)',
        fail: 'var(--blocked)',
        missing: 'var(--offline)',
        stale: 'var(--text-muted)',
      }
      const glyph = { pass: 'check', fail: 'x', missing: 'dot', stale: 'slash' }
      const l = labelMap[kind] || 'info'
      const color = stateColor[state] || stateColor.missing
      const g = glyph[state] || 'dot'
      const sha = opts.sha
      const title = `${labels[l]}: ${state}${sha ? ' @ ' + sha : ''}`
      return `<span class="evidence-chip evidence-${kind}-${state}" title="${title}" style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;border:1px solid var(--line);background:var(--panel);font-size:11px;line-height:16px;color:var(--text-muted);user-select:none;">
        <span style="color:${color};display:inline-flex">${svg(g, 12, '')}</span>
        <span style="font-family:var(--sans);font-weight:500;">${labels[l] || l}</span>
        ${sha ? `<span style="font-family:var(--mono);color:var(--text-muted);opacity:.7;">${sha}</span>` : ''}
      </span>`
    },
  })

  const HumanActionMarker = {
    render({ role, member, sinceMs, required = false }) {
      const mins = Math.max(0, Math.round((sinceMs ? (Date.now() - sinceMs) / 60000 : 0)))
      return `<div class="human-action-marker" role="status" aria-live="polite" style="display:grid;grid-template-columns:18px 1fr;gap:6px 8px;align-items:start;padding:8px 10px;border-radius:var(--radius-control);border:1.5px solid var(--waiting-human);background:color-mix(in srgb, var(--waiting-human) 14%, var(--panel));">
        <span style="color:var(--waiting-human);display:inline-flex;grid-row:span 2;">${svg('hand', 16, '')}</span>
        <div style="font-size:13px;line-height:18px;color:var(--text);font-weight:600;">需要人类行动${required ? '（必需）' : ''}</div>
        <div style="font-size:11.5px;line-height:16px;color:var(--text-muted);">${role || '负责角色待定'}${member ? ' · ' + member : ''}${mins ? ' · 已等待 ' + mins + ' 分' : ''}</div>
      </div>`
    },
  }

  const DependencyEdge = {
    render(from, to, opts = {}) {
      const status = opts.status || 'ready' // ready / waiting / failed
      const stroke = { ready: 'var(--accent)', waiting: 'var(--text-muted)', failed: 'var(--blocked)' }[status]
      const dash = status === 'waiting' ? '4 4' : undefined
      const markerEnd = status === 'failed' ? '—X' : status === 'waiting' ? '—○' : '→'
      return {
        from, to, status,
        attr: { stroke, 'stroke-dasharray': dash, markerEnd },
      }
    },
  }

  const api = { STATES, HELIX_STATE_MAP, GLYPHS, RING_STYLES, svg, stateGlyphSvg, ringCss, helixToSeatState, BADGE, EVIDENCE, HumanActionMarker, DependencyEdge }
  globalThis.VAOCoreStates = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
