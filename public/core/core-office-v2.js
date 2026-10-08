/* VISUAL V2: 6-Zone Continuous 2.5D Office Floor (SVG 1600x900).
 *
 * ZONES (no ring/grid — spatial scene layout):
 *  PLANNING STUDIO  (top-left)     — PM + Architect workstations (roadmap whiteboard, architecture wall)
 *  ENGINEERING POD  (mid-left)     — Frontend (dual-monitor) + Backend (terminal/topology) desks
 *  QUALITY STUDIO   (mid-right)    — QA + Reviewer desks (test matrix screen, diff screen)
 *  HELIX HUB        (center-bottom)— semicircular command desk, 4 orchestration monitors (tasks/roles/reviews/waiting-human)
 *  KNOWLEDGE CORNER (bottom-left)  — Documentation specialist, wiki screens, doc panels
 *  HUMAN AREA       (bottom-right) — hidden default; amber glow on WAITING_HUMAN; request card visible
 *
 * Renders with SVG+CSS+HTML only. Depth layers:
 *   z-1  floor isometric grid (SVG defs pattern)
 *   z0   zone platforms / walkway paths / partition rails
 *   z1   workstation bases + chair anchors
 *   z2   seated character figures (core-characters-v2.js mount)
 *   z3   monitor screens / whiteboards / signage
 *   z4   task capsules / connection paths / status halos
 *
 * Exports VAOCoreOfficeV2.attach(mount, { snapshot?, mode? }) -> handle
 * Fires on mount: vao-v2:role-clicked  { roleId, el }
 *                 vao-v2:workstation-clicked { roleId, el }
 *                 vao-v2:task-clicked { taskId, el }
 */
;(function () {
  'use strict'

  const CV2 = globalThis.VAOCoreCharactersV2
  const S = globalThis.VAOCoreStates

  const RESPONSIVE_MODES = Object.freeze({
    DESKTOP_LARGE: 'DESKTOP_LARGE',
    DESKTOP_COMPACT: 'DESKTOP_COMPACT',
    TABLET: 'TABLET',
    MOBILE: 'MOBILE',
  })

  function resolveResponsiveMode(width, height) {
    const w = typeof width === 'number' ? width : 0
    if (w >= 1440) return RESPONSIVE_MODES.DESKTOP_LARGE
    if (w >= 1025 && w <= 1439) return RESPONSIVE_MODES.DESKTOP_COMPACT
    if (w >= 641 && w <= 1024) return RESPONSIVE_MODES.TABLET
    return RESPONSIVE_MODES.MOBILE
  }

  const OFFICE_SLICES = Object.freeze({
    planning: '120 0 400 620',
    engineering: '110 280 400 620',
    quality: '1120 47 400 620',
    knowledge: '220 280 400 620',
    helix: '610 280 400 620',
    human: '1110 280 400 620',
  })

  const DEFAULT_SLICE = 'planning'

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }
  function modeOf(opts = {}) {
    const raw = String(opts.mode || 'live').toLowerCase()
    return raw === 'fake' || raw === 'demo' ? 'demo' : 'live'
  }

  const DEMO_SEAT_STATE = Object.freeze({
    helix: 'THINKING', product: 'IDLE', architect: 'THINKING',
    frontend: 'WORKING', backend: 'WORKING', qa: 'IDLE', reviewer: 'REVIEWING', docs: 'IDLE',
  })
  const DEMO_SEAT_KIND = Object.freeze({
    helix: 'system', product: 'human', architect: 'ai', frontend: 'ai', backend: 'ai',
    qa: 'human', reviewer: 'human', docs: 'ai',
  })
  const DEMO_SEAT_MEMBER = Object.freeze({
    product: '李产品', architect: 'Codex (演示)', frontend: 'Claude (演示)',
    backend: 'DeepSeek (演示)', qa: '王测试', reviewer: '张审查', docs: 'Gemini (演示)',
  })
  const DEMO_SEAT_MODEL = Object.freeze({
    architect: 'demo-model', frontend: 'demo-model', backend: 'demo-model', docs: 'demo-model',
  })

  const DEMO_TASKS = Object.freeze([
    { id: 'V2-101', title: '【DEMO】V2 壳子布局脚手架', status: 'done', role: 'frontend' },
    { id: 'V2-104', title: '【DEMO】Helix Hub 4 屏数据接入', status: 'running', role: 'backend' },
    { id: 'V2-112', title: '【DEMO】等待人类：确认设计规格 §5.1', status: 'pending', role: 'product', kind: 'human', sinceMs: Date.now() - 14 * 60 * 1000, required: true },
    { id: 'V2-118', title: '【DEMO】6 区空间布局走查', status: 'pending', role: 'reviewer' },
  ])

  // Workstation positions (roleId -> [cx, cy] in SVG 1600x900 coords, and orient angle deg for figure)
  const ZONE_POSITIONS = Object.freeze({
    product:   { cx: 230,  cy: 268,  angle: 15,  zone: 'planning' },
    architect: { cx: 410,  cy: 342,  angle: 10,  zone: 'planning' },
    frontend:  { cx: 220,  cy: 558,  angle: 18,  zone: 'engineering' },
    backend:   { cx: 400,  cy: 626,  angle: 14,  zone: 'engineering' },
    qa:        { cx: 1240, cy: 320,  angle: -14, zone: 'quality' },
    reviewer:  { cx: 1400, cy: 394,  angle: -18, zone: 'quality' },
    docs:      { cx: 420,  cy: 810,  angle: 8,   zone: 'knowledge' },
    helix:     { cx: 810,  cy: 598,  angle: 0,   zone: 'helix-hub' },
    human:     { cx: 1310, cy: 820,  angle: 0,   zone: 'human-area' },
  })

  function zoneLabel(id, zh, en, x, y, anchor) {
    const anc = anchor || 'start'
    return `<g class="zone-label" data-zone="${id}" transform="translate(${x} ${y})" opacity="0.4" style="pointer-events:none;">
      <text x="0" y="0" font-size="7.6" font-weight="700" letter-spacing="2.8" fill="var(--text)" text-anchor="${anc}" style="font-family:var(--sans),system-ui;">${id}</text>
      <text x="0" y="9.8" font-size="6.2" fill="var(--text-muted)" text-anchor="${anc}" style="font-family:var(--sans),system-ui;">${zh} · ${en}</text>
    </g>`
  }

  function planningZone() {
    return `<g class="zone zone-planning" data-zone="planning">
      <path d="M60 90 L580 90 L600 440 L60 440 Z" fill="color-mix(in srgb,var(--role-product) 3%,transparent)" stroke="none"/>
      <path d="M60 90 L580 90 L600 440 L60 440 Z" fill="none" stroke="color-mix(in srgb,var(--role-product) 18%,transparent)" stroke-width="0.8" stroke-dasharray="2 6" opacity="0.48"/>
      <ellipse cx="320" cy="280" rx="240" ry="160" fill="color-mix(in srgb,var(--role-product) 4.5%,transparent)" opacity="0.78"/>
      <rect x="66" y="96" width="508" height="4" rx="2" fill="color-mix(in srgb,var(--panel-2) 90%,transparent)" stroke="rgba(0,0,0,0.05)" stroke-width="0.4"/>
      ${zoneLabel('PLANNING', '规划工作室', 'Planning Studio', 78, 108)}
      <g class="wall-panel-back" transform="translate(90 126)">
        <rect x="0" y="0" width="420" height="16" rx="3" fill="color-mix(in srgb,var(--panel-2) 92%,transparent)" stroke="rgba(0,0,0,0.06)" stroke-width="0.6"/>
        <g fill="color-mix(in srgb,var(--role-product) 26%,transparent)" opacity="0.48">
          <rect x="24" y="4.2" width="24" height="7" rx="1.8"/>
          <rect x="58" y="4.2" width="36" height="7" rx="1.8" fill="color-mix(in srgb,var(--role-architect) 28%,transparent)"/>
          <rect x="104" y="4.2" width="48" height="7" rx="1.8" fill="color-mix(in srgb,var(--role-frontend) 26%,transparent)"/>
          <rect x="162" y="4.2" width="30" height="7" rx="1.8" fill="color-mix(in srgb,var(--role-backend) 26%,transparent)"/>
        </g>
      </g>
      <g class="whiteboard-roadmap" transform="translate(150 156)">
        <rect x="0" y="0" width="280" height="92" rx="4" fill="#ffffff" stroke="rgba(0,0,0,0.1)" stroke-width="0.7" opacity="0.96"/>
        <g stroke="var(--role-product)" stroke-width="0.65" fill="none" opacity="0.72">
          <rect x="16" y="16" width="56" height="20" rx="2.4"/>
          <rect x="84" y="16" width="70" height="20" rx="2.4"/>
          <rect x="168" y="16" width="88" height="20" rx="2.4"/>
        </g>
        <g opacity="0.68">
          <rect x="16" y="50" width="44" height="10" rx="2" fill="var(--role-product)" opacity="0.5"/>
          <rect x="68" y="50" width="56" height="10" rx="2" fill="var(--role-frontend)" opacity="0.46"/>
          <rect x="134" y="50" width="50" height="10" rx="2" fill="var(--role-architect)" opacity="0.46"/>
          <rect x="194" y="50" width="60" height="10" rx="2" fill="var(--role-qa)" opacity="0.44"/>
        </g>
        <g font-family="var(--sans),system-ui" font-size="5.8" fill="var(--text-muted)" opacity="0.58">
          <text x="16" y="80">Now</text><text x="84" y="80">Next 2w</text><text x="168" y="80">This Q</text>
        </g>
      </g>
      <g class="sticky-cluster" transform="translate(440 162)" opacity="0.9">
        <g transform="rotate(-6)">
          <rect x="0" y="0" width="32" height="32" rx="1.5" fill="#FFE58A" stroke="rgba(0,0,0,0.08)"/>
          <text x="4" y="12" font-size="5.2" fill="#6B5A10" opacity="0.82" style="font-family:var(--sans),system-ui;">访谈</text>
          <text x="4" y="22" font-size="4.8" fill="#6B5A10" opacity="0.58" style="font-family:var(--sans),system-ui;">记录</text>
        </g>
        <g transform="translate(30 6) rotate(4)">
          <rect x="0" y="0" width="30" height="30" rx="1.5" fill="#FFB4A2" stroke="rgba(0,0,0,0.08)"/>
          <text x="4" y="12" font-size="5" fill="#7A2A1E" opacity="0.82" style="font-family:var(--sans),system-ui;">PRD</text>
          <text x="4" y="22" font-size="4.6" fill="#7A2A1E" opacity="0.58" style="font-family:var(--sans),system-ui;">v3.2</text>
        </g>
        <g transform="translate(60 -2) rotate(-2)">
          <rect x="0" y="0" width="30" height="30" rx="1.5" fill="#B5E48C" stroke="rgba(0,0,0,0.08)"/>
          <text x="4" y="12" font-size="5" fill="#2C5A1C" opacity="0.82" style="font-family:var(--sans),system-ui;">验收</text>
          <text x="4" y="22" font-size="4.6" fill="#2C5A1C" opacity="0.58" style="font-family:var(--sans),system-ui;">标准</text>
        </g>
      </g>
      <g class="architecture-wall" transform="translate(460 220)">
        <rect x="0" y="0" width="96" height="150" rx="4" fill="color-mix(in srgb,var(--role-architect) 6%,transparent)" stroke="color-mix(in srgb,var(--role-architect) 32%,transparent)" stroke-width="0.8" opacity="0.9"/>
        <g stroke="var(--role-architect)" stroke-width="0.6" fill="none" opacity="0.8">
          <rect x="10" y="14" width="28" height="26"/>
          <rect x="46" y="14" width="40" height="26"/>
          <rect x="10" y="50" width="76" height="24"/>
          <circle cx="48" cy="96" r="14"/>
          <path d="M10 124 L26 124 L34 140 L62 140 L70 124 L86 124"/>
        </g>
        <g font-family="var(--sans),system-ui" font-size="4.8" fill="var(--text-muted)" opacity="0.54">
          <text x="10" y="12">System Topology</text>
        </g>
      </g>
      <g class="glass-divider" opacity="0.32">
        <rect x="598" y="90" width="1.4" height="352" fill="rgba(255,255,255,0.3)"/>
        <rect x="598.7" y="90" width="0.4" height="352" fill="rgba(0,0,0,0.04)"/>
      </g>
    </g>`
  }

  function engineeringZone() {
    return `<g class="zone zone-engineering" data-zone="engineering">
      <path d="M60 450 L580 450 L600 690 L60 690 Z" fill="color-mix(in srgb,var(--role-frontend) 2.5%,transparent)" stroke="none"/>
      <path d="M60 450 L580 450 L600 690 L60 690 Z" fill="none" stroke="color-mix(in srgb,var(--role-frontend) 16%,transparent)" stroke-width="0.75" stroke-dasharray="2 6" opacity="0.46"/>
      <ellipse cx="320" cy="570" rx="240" ry="110" fill="color-mix(in srgb,var(--role-backend) 3.5%,transparent)" opacity="0.72"/>
      <rect x="66" y="456" width="508" height="3.8" rx="1.8" fill="color-mix(in srgb,var(--panel-2) 88%,transparent)" stroke="rgba(0,0,0,0.04)" stroke-width="0.4"/>
      ${zoneLabel('ENGINEERING', '工程站', 'Engineering Pod', 78, 468)}
      <g class="wall-panel-back" transform="translate(90 470)">
        <rect x="0" y="0" width="420" height="14" rx="2.6" fill="color-mix(in srgb,var(--panel-2) 92%,transparent)" stroke="rgba(0,0,0,0.06)" stroke-width="0.6"/>
        <g fill="color-mix(in srgb,var(--role-frontend) 28%,transparent)" opacity="0.48">
          <rect x="22" y="4" width="26" height="6.2" rx="1.6"/>
          <rect x="56" y="4" width="30" height="6.2" rx="1.6" fill="color-mix(in srgb,var(--role-backend) 30%,transparent)"/>
          <rect x="94" y="4" width="42" height="6.2" rx="1.6" fill="color-mix(in srgb,var(--role-architect) 28%,transparent)"/>
        </g>
      </g>
      <g class="fe-monitor-bank" transform="translate(118 494)">
        <rect x="2" y="26" width="70" height="58" rx="3" fill="#0f1522" stroke="rgba(0,0,0,0.24)" stroke-width="0.85"/>
        <rect x="5" y="29" width="64" height="52" rx="1.6" fill="color-mix(in srgb,var(--role-frontend) 22%,#ffffff1a)"/>
        <g fill="#ffffff" opacity="0.86">
          <rect x="10" y="36" width="46" height="2.8" rx="1.2"/>
          <rect x="10" y="42" width="36" height="2.2" rx="0.9" opacity="0.64"/>
          <rect x="10" y="47" width="50" height="2.2" rx="0.9" opacity="0.5"/>
          <rect x="10" y="52" width="28" height="2.2" rx="0.9" opacity="0.45"/>
        </g>
        <rect x="18" y="36" width="16" height="22" rx="1.3" fill="color-mix(in srgb,var(--role-frontend) 45%,#ffffff30)" opacity="0.68"/>
        <rect x="78" y="16" width="72" height="68" rx="3" fill="#0f1522" stroke="rgba(0,0,0,0.24)" stroke-width="0.85"/>
        <rect x="81" y="19" width="66" height="62" rx="1.6" fill="color-mix(in srgb,var(--role-frontend) 18%,#ffffff16)"/>
        <g stroke="var(--role-frontend)" stroke-width="0.8" fill="none" opacity="0.84">
          <path d="M86 29 L100 29 L104 40 L92 48 L85 40 Z"/>
          <circle cx="130" cy="38" r="3.2"/>
        </g>
        <g stroke="#ffffff" opacity="0.68" stroke-width="0.7" fill="none">
          <path d="M86 54 h32 M86 61 h22 M86 68 h28"/>
        </g>
        <g transform="translate(110 2)" opacity="0.76">
          <rect x="0" y="0" width="36" height="14" rx="2" fill="rgba(255,255,255,0.62)" stroke="rgba(0,0,0,0.1)"/>
          <g stroke="var(--role-frontend)" stroke-width="0.55" fill="none" opacity="0.78">
            <rect x="3" y="3" width="8" height="8"/>
            <rect x="14" y="3" width="7" height="8"/>
            <rect x="24" y="3" width="9" height="8"/>
          </g>
        </g>
      </g>
      <g class="be-terminal-suite" transform="translate(290 560)">
        <rect x="2" y="2" width="124" height="88" rx="3" fill="#0b1020" stroke="rgba(0,0,0,0.25)" stroke-width="0.95"/>
        <rect x="5" y="5" width="118" height="82" rx="1.8" fill="#0a0e1c"/>
        <g font-family="ui-monospace, Menlo, monospace" font-size="6.2" fill="var(--done)" opacity="0.88">
          <text x="10" y="18">$ ci build --target=prod</text>
          <text x="10" y="28" fill="var(--working)">[1/6] compile services…</text>
          <text x="10" y="38" fill="var(--working)">[2/6] wire MCP routes…</text>
          <text x="10" y="48" fill="var(--done)">✓ api-core linked</text>
          <text x="10" y="58" fill="var(--done)">✓ workers scheduled</text>
          <text x="10" y="68" fill="var(--reviewing)">[3/6] review gates…</text>
          <text x="10" y="78" fill="var(--text-muted)" opacity="0.72">_</text>
        </g>
        <g transform="translate(130 10)">
          <rect x="0" y="0" width="30" height="26" rx="2.3" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.78"/>
          <g stroke="var(--role-backend)" stroke-width="0.65" fill="none" opacity="0.86">
            <circle cx="8" cy="10" r="3.2"/>
            <circle cx="22" cy="10" r="3.2"/>
            <circle cx="15" cy="20" r="3.2"/>
            <path d="M11 10 L19 10 M10.6 12.4 L13 17.2 M19.4 12.4 L17 17.2"/>
          </g>
        </g>
        <g transform="translate(130 46)" opacity="0.9">
          <rect x="0" y="0" width="30" height="38" rx="2.1" fill="rgba(255,255,255,0.54)" stroke="rgba(0,0,0,0.12)" stroke-width="0.68"/>
          <line x1="0" y1="12" x2="30" y2="12" stroke="rgba(0,0,0,0.14)" stroke-width="0.48"/>
          <line x1="0" y1="25" x2="30" y2="25" stroke="rgba(0,0,0,0.14)" stroke-width="0.48"/>
          <circle cx="3.5" cy="6" r="0.88" fill="var(--working)" opacity="0.68"/>
          <rect x="7" y="5" width="18" height="2" rx="0.78" fill="var(--role-backend)" opacity="0.68"/>
          <circle cx="3.5" cy="18.5" r="0.88" fill="var(--done)" opacity="0.64"/>
          <rect x="7" y="17.4" width="20" height="2" rx="0.78" fill="var(--done)" opacity="0.64"/>
          <circle cx="3.5" cy="31.5" r="0.88" fill="var(--reviewing)" opacity="0.6"/>
          <rect x="7" y="30.4" width="14" height="2" rx="0.78" fill="var(--reviewing)" opacity="0.6"/>
        </g>
      </g>
      <g class="be-topology-board" transform="translate(470 640)">
        <rect x="0" y="0" width="82" height="42" rx="3.5" fill="color-mix(in srgb,var(--role-backend) 6%,transparent)" stroke="color-mix(in srgb,var(--role-backend) 28%,transparent)" stroke-width="0.75" opacity="0.9"/>
        <g stroke="var(--role-backend)" stroke-width="0.7" fill="none" opacity="0.86">
          <circle cx="22" cy="13" r="6.4"/>
          <circle cx="58" cy="13" r="6.4"/>
          <circle cx="40" cy="30" r="6.4"/>
          <path d="M27 13 L51 13 M26.8 18.6 L34.6 24.4 M53.2 18.6 L45.4 24.4"/>
        </g>
        <g font-family="var(--sans),system-ui" font-size="4.4" fill="var(--text-muted)" opacity="0.6">
          <text x="16" y="6">Service Mesh</text>
        </g>
      </g>
      <g class="glass-divider" opacity="0.3">
        <rect x="598" y="450" width="1.4" height="244" fill="rgba(255,255,255,0.28)"/>
        <rect x="598.7" y="450" width="0.4" height="244" fill="rgba(0,0,0,0.04)"/>
      </g>
    </g>`
  }

  function qualityZone() {
    return `<g class="zone zone-quality" data-zone="quality">
      <path d="M1000 90 L1540 90 L1540 460 L1000 460 Z" fill="color-mix(in srgb,var(--role-qa) 2.8%,transparent)" stroke="none"/>
      <path d="M1000 90 L1540 90 L1540 460 L1000 460 Z" fill="none" stroke="color-mix(in srgb,var(--role-qa) 18%,transparent)" stroke-width="0.75" stroke-dasharray="2 6" opacity="0.48"/>
      <ellipse cx="1270" cy="270" rx="240" ry="170" fill="color-mix(in srgb,var(--role-reviewer) 3.8%,transparent)" opacity="0.72"/>
      <rect x="1006" y="96" width="528" height="3.8" rx="1.8" fill="color-mix(in srgb,var(--panel-2) 88%,transparent)" stroke="rgba(0,0,0,0.04)" stroke-width="0.4"/>
      ${zoneLabel('QUALITY', '质检工作室', 'Quality Studio', 1522, 108, 'end')}
      <g class="wall-panel-back" transform="translate(1020 118)">
        <rect x="0" y="0" width="460" height="14" rx="2.6" fill="color-mix(in srgb,var(--panel-2) 92%,transparent)" stroke="rgba(0,0,0,0.06)" stroke-width="0.6"/>
        <g fill="color-mix(in srgb,var(--role-qa) 28%,transparent)" opacity="0.48">
          <rect x="26" y="4" width="30" height="6.2" rx="1.6"/>
          <rect x="64" y="4" width="36" height="6.2" rx="1.6" fill="color-mix(in srgb,var(--role-reviewer) 30%,transparent)"/>
          <rect x="108" y="4" width="48" height="6.2" rx="1.6" fill="color-mix(in srgb,var(--done) 24%,transparent)"/>
        </g>
      </g>
      <g class="test-matrix-console" transform="translate(1024 148)">
        <rect x="2" y="2" width="176" height="92" rx="3.4" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.1)" stroke-width="0.8"/>
        <g>
          <g transform="translate(12 14)">
            <rect x="0" y="0" width="32" height="22" rx="2.1" fill="color-mix(in srgb,var(--done) 18%,transparent)" stroke="var(--done)" stroke-width="0.6"/>
            <path d="M7 11 L12 16 L25 5" stroke="var(--done)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
          </g>
          <g transform="translate(52 14)">
            <rect x="0" y="0" width="32" height="22" rx="2.1" fill="color-mix(in srgb,var(--working) 20%,transparent)" stroke="var(--working)" stroke-width="0.6"/>
            <circle cx="16" cy="11" r="3.6" fill="none" stroke="var(--working)" stroke-width="1.3" stroke-dasharray="2.8 1.8"/>
          </g>
          <g transform="translate(92 14)">
            <rect x="0" y="0" width="32" height="22" rx="2.1" fill="color-mix(in srgb,var(--blocked) 18%,transparent)" stroke="var(--blocked)" stroke-width="0.6"/>
            <path d="M7 6 L25 22 M25 6 L7 22" stroke="var(--blocked)" stroke-width="1.2" stroke-linecap="round"/>
          </g>
          <g transform="translate(132 14)">
            <rect x="0" y="0" width="38" height="22" rx="2.1" fill="color-mix(in srgb,var(--role-qa) 18%,transparent)" stroke="var(--role-qa)" stroke-width="0.6"/>
            <g fill="var(--role-qa)" opacity="0.8">
              <rect x="5" y="8" width="8" height="2.2" rx="0.8"/>
              <rect x="5" y="12.5" width="26" height="2.2" rx="0.8"/>
            </g>
          </g>
          <g font-family="ui-monospace, Menlo, monospace" font-size="6.1" fill="var(--text-muted)" transform="translate(12 50)">
            <text x="0" y="0">suite/core.spec.ts</text>
            <text x="0" y="12" fill="var(--done)">✓ 142 passed</text>
            <text x="88" y="12" fill="var(--blocked)">✗ 2 failed</text>
            <text x="0" y="24" fill="var(--reviewing)">⟳ 8 pending · 3.4s</text>
          </g>
        </g>
      </g>
      <g class="device-test-screen" transform="translate(1216 244)">
        <rect x="0" y="0" width="54" height="96" rx="7" fill="#1a1f2c" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
        <rect x="3.5" y="8" width="47" height="80" rx="4" fill="#ffffff" stroke="rgba(0,0,0,0.14)" stroke-width="0.65"/>
        <g transform="translate(7 12)" opacity="0.88">
          <rect x="0" y="0" width="40" height="8" rx="1.5" fill="color-mix(in srgb,var(--role-qa) 25%,transparent)"/>
          <rect x="0" y="14" width="40" height="6" rx="1.1" fill="rgba(0,0,0,0.07)"/>
          <rect x="0" y="24" width="40" height="6" rx="1.1" fill="rgba(0,0,0,0.06)" opacity="0.8"/>
          <rect x="0" y="34" width="26" height="10" rx="2.2" fill="color-mix(in srgb,var(--done) 28%,transparent)" stroke="var(--done)" stroke-width="0.55"/>
          <path d="M4 39.5 L7 42.5 L17 33.5" stroke="var(--done)" stroke-width="1" fill="none"/>
          <rect x="0" y="50" width="40" height="10" rx="2.2" fill="color-mix(in srgb,var(--working) 24%,transparent)" stroke="var(--working)" stroke-width="0.55"/>
          <circle cx="12" cy="55" r="2.4" fill="none" stroke="var(--working)" stroke-width="0.95" stroke-dasharray="1.9 1.5"/>
        </g>
        <text x="27" y="5.5" font-size="3.8" text-anchor="middle" fill="#ffffff" opacity="0.6" style="font-family:var(--sans),system-ui;">QA DEVICE</text>
      </g>
      <g class="review-diff-station" transform="translate(1282 286)">
        <rect x="2" y="2" width="204" height="104" rx="3.4" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.1)" stroke-width="0.8"/>
        <line x1="104" y1="2" x2="104" y2="106" stroke="rgba(0,0,0,0.15)" stroke-width="0.7"/>
        <g font-family="ui-monospace, Menlo, monospace" font-size="5.9">
          <text x="10" y="16" fill="var(--text-muted)" opacity="0.7">a/core-shell-v2.js</text>
          <text x="108" y="16" fill="var(--text-muted)" opacity="0.7">b/core-shell-v2.js</text>
          <rect x="6" y="24" width="88" height="11" rx="1.5" fill="color-mix(in srgb,var(--blocked) 12%,transparent)"/>
          <text x="10" y="32.4" fill="var(--blocked)">- rail-w: 192px</text>
          <rect x="104" y="24" width="88" height="11" rx="1.5" fill="color-mix(in srgb,var(--done) 14%,transparent)"/>
          <text x="108" y="32.4" fill="var(--done)">+ rail-w: 168px</text>
          <rect x="6" y="40" width="88" height="11" rx="1.5" fill="color-mix(in srgb,var(--blocked) 12%,transparent)"/>
          <text x="10" y="48.4" fill="var(--blocked)">- helix: 312px</text>
          <rect x="104" y="40" width="88" height="11" rx="1.5" fill="color-mix(in srgb,var(--done) 14%,transparent)"/>
          <text x="108" y="48.4" fill="var(--done)">+ helix: 360-420px</text>
          <text x="10" y="66" fill="var(--text-muted)" opacity="0.7">  nav: Office / Tasks</text>
          <text x="108" y="66" fill="var(--text-muted)" opacity="0.7">  nav: Office / Tasks</text>
          <text x="10" y="78" fill="var(--text-muted)" opacity="0.7">  theme-switch ok</text>
          <text x="108" y="78" fill="var(--text-muted)" opacity="0.7">  theme-switch ok</text>
          <text x="10" y="94" fill="var(--reviewing)" opacity="0.82">@@ 2 files, +12 -8</text>
        </g>
      </g>
      <g class="evidence-viewer" transform="translate(1362 406)" opacity="0.92">
        <rect x="0" y="0" width="96" height="44" rx="3.2" fill="rgba(255,255,255,0.68)" stroke="rgba(0,0,0,0.09)" stroke-width="0.7"/>
        <rect x="0" y="0" width="96" height="11" rx="3.2" fill="color-mix(in srgb,var(--role-reviewer) 24%,transparent)"/>
        <text x="6" y="8.2" font-size="5.4" fill="#1f2430" font-weight="700" style="font-family:var(--sans),system-ui;">Evidence</text>
        <g transform="translate(6 16)" font-family="var(--sans),system-ui" font-size="4.6" fill="var(--text-muted)" opacity="0.76">
          <rect x="0" y="0" width="84" height="5.8" rx="1.4" fill="color-mix(in srgb,var(--done) 18%,transparent)"/>
          <text x="2" y="4.4" fill="var(--done)">✓ Screenshot A-01</text>
          <rect x="0" y="10" width="84" height="5.8" rx="1.4" fill="color-mix(in srgb,var(--done) 18%,transparent)"/>
          <text x="2" y="14.4" fill="var(--done)">✓ Playwright 02</text>
        </g>
      </g>
      <g class="glass-divider" opacity="0.3">
        <rect x="1000" y="90" width="1.4" height="374" fill="rgba(255,255,255,0.28)"/>
        <rect x="1000.7" y="90" width="0.4" height="374" fill="rgba(0,0,0,0.04)"/>
      </g>
    </g>`
  }

  function helixHubZone() {
    return `<g class="zone zone-helix-hub" data-zone="helix-hub">
      <defs>
        <radialGradient id="helixCommandBacklightV2" cx="50%" cy="18%" r="72%">
          <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 22%,transparent)"/>
          <stop offset="58%" stop-color="color-mix(in srgb,var(--orchestrator) 10%,transparent)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
        <linearGradient id="helixDeskTopV2" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 34%,var(--panel))"/>
          <stop offset="100%" stop-color="color-mix(in srgb,var(--orchestrator) 20%,var(--panel-2))"/>
        </linearGradient>
      </defs>
      <path d="M448 446 L1172 446 L1212 766 L408 766 Z" fill="url(#helixCommandBacklightV2)" opacity="0.72"/>
      <ellipse cx="810" cy="606" rx="360" ry="228" fill="color-mix(in srgb,var(--orchestrator) 6.5%,transparent)" opacity="0.84"/>
      <ellipse cx="810" cy="624" rx="240" ry="128" fill="none" stroke="color-mix(in srgb,var(--orchestrator) 30%,transparent)" stroke-width="1.1" stroke-dasharray="3 5.5" opacity="0.52"/>
      ${zoneLabel('HELIX HUB', '指挥中枢', 'Command Hub', 810, 468, 'middle')}
      <g class="helix-desk-semicircle" transform="translate(810 626)">
        <path d="M-265 106 Q0 -228 265 106 L250 142 Q0 -162 -250 142 Z" fill="url(#helixDeskTopV2)" stroke="color-mix(in srgb,var(--orchestrator) 64%,var(--line))" stroke-width="2.4"/>
        <path d="M-250 94 Q0 -194 250 94" fill="none" stroke="color-mix(in srgb,var(--orchestrator) 46%,transparent)" stroke-width="1.3" opacity="0.76"/>
        <g>
          <rect x="-246" y="16" width="96" height="62" rx="4.4" fill="#0f1522" stroke="rgba(0,0,0,0.24)" stroke-width="1.05"/>
          <rect x="-242" y="20" width="88" height="54" rx="2.7" fill="color-mix(in srgb,var(--working) 28%,#ffffff26)"/>
          <text x="-232" y="40" font-family="var(--mono)" font-size="8.2" fill="var(--working)" font-weight="700">TASK Q</text>
          <g fill="#ffffff" opacity="0.84">
            <rect x="-236" y="52" width="76" height="3.6" rx="1.5"/>
            <rect x="-236" y="60" width="62" height="3.6" rx="1.5" opacity="0.66"/>
            <rect x="-236" y="68" width="52" height="3.6" rx="1.5" opacity="0.52"/>
          </g>
          <circle cx="-160" cy="31" r="3.1" fill="var(--working)"/>
          <circle cx="-160" cy="46" r="3.1" fill="var(--done)" opacity="0.88"/>
          <circle cx="-160" cy="63" r="3.1" fill="var(--reviewing)" opacity="0.82"/>
        </g>
        <g>
          <rect x="-138" y="-12" width="104" height="90" rx="5.8" fill="#0f1522" stroke="color-mix(in srgb,var(--orchestrator) 68%,#0f1522)" stroke-width="1.35"/>
          <rect x="-132" y="-6" width="92" height="78" rx="3.8" fill="color-mix(in srgb,var(--orchestrator) 36%,#ffffff2e)"/>
          <g stroke="var(--orchestrator)" stroke-width="1.2" fill="none" opacity="0.94">
            <circle cx="-86" cy="23" r="9.4"/>
            <path d="M-86 13.6 L-86 32.4 M-95.4 23 L-76.6 23" opacity="0.76"/>
            <path d="M-124 58 L-104 58 L-96 68 L-86 54 L-76 68 L-68 58 L-48 58"/>
          </g>
          <g fill="#ffffff" opacity="0.86">
            <rect x="-126" y="72" width="80" height="3.8" rx="1.7"/>
            <rect x="-126" y="79" width="62" height="3.8" rx="1.7" opacity="0.62"/>
          </g>
        </g>
        <g>
          <rect x="-16" y="6" width="96" height="72" rx="5" fill="#0f1522" stroke="rgba(0,0,0,0.25)" stroke-width="1.1"/>
          <rect x="-12" y="10" width="88" height="64" rx="3.4" fill="color-mix(in srgb,var(--orchestrator) 30%,#ffffff26)"/>
          <text x="-2" y="31" font-family="var(--mono)" font-size="8.2" fill="var(--orchestrator)" font-weight="700">RUNTIME</text>
          <g font-family="ui-monospace, Menlo, monospace" font-size="7.2" fill="#ffffff" opacity="0.86">
            <text x="-2" y="48">nodes: 8</text>
            <text x="-2" y="59">mem: 62%</text>
            <text x="-2" y="70" fill="var(--done)">heartbeat ok</text>
          </g>
          <circle cx="70" cy="23" r="3.4" fill="var(--done)"/>
        </g>
        <g>
          <rect x="100" y="16" width="96" height="62" rx="4.4" fill="#0f1522" stroke="rgba(0,0,0,0.24)" stroke-width="1.05"/>
          <rect x="104" y="20" width="88" height="54" rx="2.7" fill="color-mix(in srgb,var(--reviewing) 28%,#ffffff26)"/>
          <text x="112" y="40" font-family="var(--mono)" font-size="8.2" fill="var(--reviewing)" font-weight="700">REVIEWS</text>
          <g fill="#ffffff" opacity="0.84">
            <rect x="112" y="52" width="74" height="3.6" rx="1.5"/>
            <rect x="112" y="60" width="58" height="3.6" rx="1.5" opacity="0.66"/>
            <rect x="112" y="68" width="48" height="3.6" rx="1.5" opacity="0.52"/>
          </g>
          <circle cx="186" cy="31" r="3.1" fill="var(--reviewing)"/>
          <circle cx="186" cy="50" r="3.1" fill="var(--working)" opacity="0.84"/>
        </g>
        <g>
          <rect x="216" y="22" width="106" height="56" rx="4.4" fill="#0f1522" stroke="rgba(0,0,0,0.24)" stroke-width="1.05"/>
          <rect x="220" y="26" width="98" height="48" rx="2.7" fill="color-mix(in srgb,var(--waiting-human) 28%,#ffffff28)"/>
          <text x="228" y="46" font-family="var(--mono)" font-size="8.2" fill="var(--waiting-human)" font-weight="700">WAIT HUMAN</text>
          <g fill="#ffffff" opacity="0.84">
            <rect x="228" y="58" width="70" height="3.6" rx="1.5"/>
            <rect x="228" y="66" width="52" height="3.6" rx="1.5" opacity="0.66"/>
          </g>
          <g transform="translate(298 36)" fill="none" stroke="var(--waiting-human)" stroke-width="1.25">
            <path d="M-6 12 V-6 Q-6 -8.4 -3.6 -8.4 Q-1.2 -8.4 -1.2 -6 V-1.2 M-1.2 -8.4 Q1.2 -8.4 1.2 -6 V-1.2 M1.2 -8.4 Q3.6 -8.4 3.6 -6 V2.4 M3.6 -3.6 Q5.04 -4.2 5.04 -2.64 V9.6 Q5.04 12 1.8 12.96 L-3.6 13.2 Q-5.4 12.6 -6 12 Z"/>
          </g>
        </g>
      </g>
      <g class="hub-connection-paths" fill="none" stroke-width="1.2" opacity="0.12">
        <path d="M810 586 Q640 460 290 300" stroke="color-mix(in srgb,var(--role-product) 58%,transparent)" stroke-dasharray="2.8 4.2"/>
        <path d="M810 586 Q620 580 290 570" stroke="color-mix(in srgb,var(--role-frontend) 58%,transparent)" stroke-dasharray="2.8 4.2"/>
        <path d="M810 586 Q980 480 1260 340" stroke="color-mix(in srgb,var(--role-qa) 58%,transparent)" stroke-dasharray="2.8 4.2"/>
        <path d="M810 586 Q680 700 400 800" stroke="color-mix(in srgb,var(--role-docs) 60%,transparent)" stroke-dasharray="2.8 4.2"/>
        <path d="M810 586 Q1020 720 1310 810" stroke="color-mix(in srgb,var(--waiting-human) 60%,transparent)" stroke-dasharray="2.8 4.2"/>
      </g>
    </g>`
  }

  function knowledgeZone() {
    return `<g class="zone zone-knowledge" data-zone="knowledge">
      <path d="M60 700 L540 700 L540 896 L60 896 Z" fill="color-mix(in srgb,var(--role-docs) 2.5%,transparent)" stroke="none"/>
      <path d="M60 700 L540 700 L540 896 L60 896 Z" fill="none" stroke="color-mix(in srgb,var(--role-docs) 16%,transparent)" stroke-width="0.75" stroke-dasharray="2 6" opacity="0.46"/>
      <ellipse cx="320" cy="802" rx="220" ry="88" fill="color-mix(in srgb,var(--role-docs) 4%,transparent)" opacity="0.64"/>
      <rect x="66" y="706" width="468" height="3.6" rx="1.7" fill="color-mix(in srgb,var(--panel-2) 88%,transparent)" stroke="rgba(0,0,0,0.04)" stroke-width="0.4"/>
      ${zoneLabel('KNOWLEDGE', '文档角', 'Knowledge Corner', 78, 718)}
      <g class="knowledge-shelves" transform="translate(120 768)">
        <rect x="0" y="0" width="120" height="128" rx="3.5" fill="color-mix(in srgb,var(--panel-2) 90%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="0.7"/>
        <g stroke="rgba(0,0,0,0.1)" stroke-width="0.5">
          <line x1="0" y1="32" x2="120" y2="32"/>
          <line x1="0" y1="64" x2="120" y2="64"/>
          <line x1="0" y1="96" x2="120" y2="96"/>
        </g>
        <g transform="translate(6 6)">
          <rect x="0" y="0" width="8" height="22" fill="var(--role-product)" opacity="0.65"/>
          <rect x="9" y="0" width="6.5" height="22" fill="var(--role-architect)" opacity="0.7"/>
          <rect x="17" y="0" width="9" height="22" fill="var(--role-frontend)" opacity="0.65"/>
          <rect x="28" y="0" width="7.5" height="22" fill="var(--role-backend)" opacity="0.72"/>
          <rect x="37" y="0" width="8.5" height="22" fill="var(--role-qa)" opacity="0.62"/>
          <rect x="47" y="0" width="8" height="22" fill="var(--role-reviewer)" opacity="0.7"/>
          <rect x="57" y="0" width="10" height="22" fill="var(--role-docs)" opacity="0.78"/>
          <rect x="69" y="0" width="7" height="22" fill="var(--role-product)" opacity="0.55"/>
          <rect x="78" y="0" width="9" height="22" fill="var(--role-architect)" opacity="0.6"/>
          <rect x="89" y="0" width="7.5" height="22" fill="var(--role-frontend)" opacity="0.58"/>
          <rect x="99" y="0" width="10" height="22" fill="var(--role-backend)" opacity="0.6"/>
        </g>
        <g transform="translate(6 38)">
          <rect x="0" y="0" width="10" height="22" fill="var(--role-backend)" opacity="0.55"/>
          <rect x="12" y="0" width="7.5" height="22" fill="var(--role-qa)" opacity="0.6"/>
          <rect x="22" y="0" width="9" height="22" fill="var(--role-docs)" opacity="0.68"/>
          <rect x="33" y="0" width="6.5" height="22" fill="var(--role-product)" opacity="0.6"/>
          <rect x="42" y="0" width="10" height="22" fill="var(--role-architect)" opacity="0.58"/>
          <rect x="54" y="0" width="8" height="22" fill="var(--role-frontend)" opacity="0.62"/>
          <rect x="64" y="0" width="7" height="22" fill="var(--role-reviewer)" opacity="0.6"/>
          <rect x="73" y="0" width="9" height="22" fill="var(--role-docs)" opacity="0.72"/>
          <rect x="84" y="0" width="7.5" height="22" fill="var(--role-backend)" opacity="0.55"/>
          <rect x="94" y="0" width="8.5" height="22" fill="var(--role-qa)" opacity="0.6"/>
        </g>
        <g transform="translate(6 70)">
          <rect x="0" y="0" width="7.5" height="22" fill="var(--role-architect)" opacity="0.55"/>
          <rect x="9" y="0" width="10" height="22" fill="var(--role-docs)" opacity="0.62"/>
          <rect x="21" y="0" width="7" height="22" fill="var(--role-frontend)" opacity="0.58"/>
          <rect x="30" y="0" width="9" height="22" fill="var(--role-product)" opacity="0.64"/>
          <rect x="41" y="0" width="8" height="22" fill="var(--role-backend)" opacity="0.6"/>
          <rect x="51" y="0" width="7.5" height="22" fill="var(--role-qa)" opacity="0.62"/>
          <rect x="61" y="0" width="10" height="22" fill="var(--role-reviewer)" opacity="0.58"/>
          <rect x="73" y="0" width="7.5" height="22" fill="var(--role-docs)" opacity="0.7"/>
          <rect x="83" y="0" width="8.5" height="22" fill="var(--role-architect)" opacity="0.56"/>
          <rect x="94" y="0" width="7.5" height="22" fill="var(--role-frontend)" opacity="0.6"/>
        </g>
        <g transform="translate(6 102)" opacity="0.9">
          <rect x="0" y="0" width="108" height="18" rx="2.5" fill="color-mix(in srgb,var(--role-docs) 18%,transparent)" stroke="color-mix(in srgb,var(--role-docs) 34%,transparent)" stroke-width="0.6"/>
          <text x="54" y="13" font-size="5.4" text-anchor="middle" fill="var(--role-docs)" opacity="0.82" font-weight="700" style="font-family:var(--sans),system-ui;">KNOWLEDGE VAULT</text>
        </g>
      </g>
      <g class="wiki-dual-panels" transform="translate(272 778)">
        <rect x="0" y="0" width="116" height="112" rx="4" fill="rgba(255,255,255,0.72)" stroke="rgba(0,0,0,0.1)" stroke-width="0.8"/>
        <rect x="0" y="0" width="56" height="112" rx="4" fill="rgba(255,255,255,0.9)"/>
        <line x1="58" y1="0" x2="58" y2="112" stroke="rgba(0,0,0,0.12)" stroke-width="0.7"/>
        <g transform="translate(8 12)" font-family="var(--sans),system-ui" font-size="5.6" fill="var(--text)">
          <rect x="0" y="0" width="40" height="6" rx="2" fill="color-mix(in srgb,var(--role-docs) 26%,transparent)"/>
          <text x="0" y="16" opacity="0.78">Onboarding</text>
          <text x="0" y="26" opacity="0.6">API Guide</text>
          <text x="0" y="36" opacity="0.6">SOP 048</text>
          <text x="0" y="46" opacity="0.6">Handbook</text>
          <rect x="0" y="56" width="40" height="6" rx="2" fill="rgba(0,0,0,0.06)" opacity="0.7"/>
          <text x="0" y="76" opacity="0.58">Minutes …</text>
          <text x="0" y="86" opacity="0.5">Retro notes</text>
        </g>
        <g transform="translate(66 12)">
          <rect x="0" y="0" width="42" height="6" rx="2" fill="color-mix(in srgb,var(--role-docs) 22%,transparent)"/>
          <g fill="rgba(0,0,0,0.58)" opacity="0.72">
            <rect x="0" y="14" width="44" height="2.8" rx="1.2"/>
            <rect x="0" y="20" width="38" height="2.8" rx="1.2" opacity="0.86"/>
            <rect x="0" y="26" width="42" height="2.8" rx="1.2" opacity="0.76"/>
            <rect x="0" y="32" width="32" height="2.8" rx="1.2" opacity="0.66"/>
            <rect x="0" y="38" width="40" height="2.8" rx="1.2" opacity="0.7"/>
            <rect x="0" y="52" width="44" height="2.8" rx="1.2"/>
            <rect x="0" y="58" width="36" height="2.8" rx="1.2" opacity="0.8"/>
            <rect x="0" y="64" width="26" height="2.8" rx="1.2" opacity="0.7"/>
            <rect x="0" y="78" width="16" height="6" rx="2.5" fill="var(--role-docs)" opacity="0.58"/>
          </g>
        </g>
      </g>
      <g class="doc-reading-screen" transform="translate(410 778)" opacity="0.94">
        <rect x="0" y="0" width="116" height="112" rx="4" fill="rgba(255,255,255,0.58)" stroke="rgba(0,0,0,0.08)" stroke-width="0.75"/>
        <g stroke="var(--role-docs)" stroke-width="0.75" fill="none" opacity="0.86">
          <rect x="14" y="16" width="36" height="22"/>
          <rect x="58" y="16" width="46" height="22"/>
          <path d="M18 24 h28 M18 29 h20 M62 24 h36 M62 29 h30"/>
          <circle cx="44" cy="60" r="8"/>
          <path d="M18 82 L56 82 L66 96 L90 96 L100 82"/>
        </g>
        <g font-family="var(--sans),system-ui" font-size="5" fill="var(--text-muted)" opacity="0.6" transform="translate(14 10)">
          <text x="0" y="0">Architecture · WIKI</text>
        </g>
      </g>
      <g class="glass-divider" opacity="0.3">
        <rect x="540" y="700" width="1.4" height="196" fill="rgba(255,255,255,0.28)"/>
        <rect x="540.7" y="700" width="0.4" height="196" fill="rgba(0,0,0,0.04)"/>
      </g>
    </g>`
  }

  function humanAreaZone(active) {
    const op = active ? '1' : '0.12'
    const dimStroke = active ? 'color-mix(in srgb,var(--waiting-human) 56%,rgba(0,0,0,0.1))' : 'rgba(0,0,0,0.04)'
    const baseFill = active
      ? 'color-mix(in srgb,var(--waiting-human) 18%,color-mix(in srgb,var(--panel) 78%,transparent))'
      : 'color-mix(in srgb,var(--panel) 18%,transparent)'
    const vis = active ? '' : 'display:none;'
    return `<g class="zone zone-human-area" data-zone="human-area" data-active="${active ? 'true' : 'false'}" opacity="${op}" style="${active ? '' : 'transition:opacity var(--dur-slow) var(--ease);'}">
      <defs>
        <radialGradient id="humanAmberGlowV2" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="color-mix(in srgb,var(--waiting-human) 44%,transparent)"/>
          <stop offset="55%" stop-color="color-mix(in srgb,var(--waiting-human) 13%,transparent)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <ellipse cx="1310" cy="824" rx="210" ry="74" fill="${active ? 'url(#humanAmberGlowV2)' : 'transparent'}" opacity="${active ? 0.92 : 0}"/>
      <path d="M1060 720 L1524 720 L1524 890 L1060 890 Z" fill="${baseFill}" stroke="${dimStroke}" stroke-width="${active ? '1.4' : '0.7'}" stroke-dasharray="${active ? '' : '4 4'}" opacity="${active ? 1 : 0.62}"/>
      ${active ? zoneLabel('HUMAN AREA', '人类区', 'Human Action Zone', 1510, 734, 'end') : ''}
      <g class="human-request-card" transform="translate(1092 746)" style="${vis}">
        <rect x="0" y="0" width="288" height="92" rx="8.5" fill="color-mix(in srgb,var(--waiting-human) 18%,var(--panel))" stroke="var(--waiting-human)" stroke-width="1.7"/>
        <g transform="translate(16 16)">
          <g fill="none" stroke="var(--waiting-human)" stroke-width="1.45">
            <path d="M-1 6 V-4 Q-1 -6 1 -6 Q3 -6 3 -4 V-1 M3 -6 Q5 -6 5 -4 V0 M5 -4 Q6.4 -4.6 6.4 -3.2 V10 Q6.4 11.8 3.6 12.6 L-0.6 13 Q-2 12.6 -2.6 11.6 Z"/>
          </g>
          <text x="22" y="3" font-size="12.2" font-weight="700" fill="var(--text)" style="font-family:var(--sans),system-ui;">需要人类行动（必需）</text>
          <text x="22" y="20" font-size="10" fill="var(--text-muted)" style="font-family:var(--sans),system-ui;">产品经理 · 李产品 · 已等待 14 分</text>
          <rect x="0" y="32" width="256" height="30" rx="4.5" fill="var(--panel)" stroke="var(--line)"/>
          <text x="10" y="51" font-size="10" fill="var(--text)" style="font-family:var(--sans),system-ui;">【DEMO】确认设计规格 §5.1 颜色 token 规格对比表</text>
          <rect x="0" y="68" width="78" height="14" rx="4" fill="var(--waiting-human)" style="cursor:pointer;">
            <text x="39" y="78.5" font-size="9.2" font-weight="700" text-anchor="middle" fill="#fff" style="font-family:var(--sans),system-ui;">立即处理 →</text>
          </rect>
          <rect x="86" y="68" width="60" height="14" rx="4" fill="var(--panel-2)" stroke="var(--line)" style="cursor:pointer;">
            <text x="116" y="78.5" font-size="9.2" fill="var(--text-muted)" text-anchor="middle" style="font-family:var(--sans),system-ui;">稍后</text>
          </rect>
        </g>
      </g>
      <g class="human-seat-indicator" transform="translate(1460 818)" style="${vis}">
        <circle cx="0" cy="0" r="24" fill="none" stroke="var(--waiting-human)" stroke-width="2.2" stroke-dasharray="4.2 3" class="reduced-motion-hidden" opacity="0.82"/>
        <circle cx="0" cy="0" r="15" fill="color-mix(in srgb,var(--waiting-human) 20%,transparent)"/>
        <text x="0" y="4.5" font-size="10.5" text-anchor="middle" fill="var(--waiting-human)" font-weight="800" style="font-family:var(--sans),system-ui;">HUMAN</text>
      </g>
      <g class="helix-human-pulse-line" ${active ? '' : 'style="display:none;"'} fill="none" stroke="var(--waiting-human)" stroke-width="2" stroke-dasharray="6.5 4.5" opacity="0.88">
        <path d="M810 602 Q1080 720 1310 810" class="reduced-motion-hidden"/>
      </g>
    </g>`
  }

  function floorBackdropSVG() {
    return `<svg class="office-floor-v2" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" role="img" aria-label="2.5D 办公楼层平面图：6 区域连续空间" style="position:relative;width:100%;height:100%;display:block;">
      <defs>
        <pattern id="iso-grid-v2" width="56" height="32" patternUnits="userSpaceOnUse" patternTransform="skewX(-18)">
          <path d="M 56 0 L 0 0 0 32" fill="none" stroke="color-mix(in srgb, var(--canvas-grid) 58%, transparent)" stroke-width="0.65" opacity="0.52"/>
        </pattern>
        <linearGradient id="floor-vignette-v2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--canvas-floor)"/>
          <stop offset="100%" stop-color="color-mix(in srgb, var(--canvas-floor) 92%, var(--panel-2))"/>
        </linearGradient>
        <linearGradient id="walkway-center-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="transparent"/>
          <stop offset="18%" stop-color="color-mix(in srgb,var(--panel-2) 50%,transparent)"/>
          <stop offset="50%" stop-color="color-mix(in srgb,var(--orchestrator) 10%,color-mix(in srgb,var(--panel-2) 70%,transparent))"/>
          <stop offset="82%" stop-color="color-mix(in srgb,var(--panel-2) 50%,transparent)"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
        <linearGradient id="walkway-center-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="transparent"/>
          <stop offset="22%" stop-color="color-mix(in srgb,var(--panel-2) 48%,transparent)"/>
          <stop offset="55%" stop-color="color-mix(in srgb,var(--orchestrator) 8%,color-mix(in srgb,var(--panel-2) 68%,transparent))"/>
          <stop offset="85%" stop-color="color-mix(in srgb,var(--panel-2) 48%,transparent)"/>
          <stop offset="100%" stop-color="transparent"/>
        </linearGradient>
        <radialGradient id="collab-rug" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 14%,transparent)"/>
          <stop offset="70%" stop-color="color-mix(in srgb,var(--panel-2) 55%,transparent)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
        <linearGradient id="meeting-board-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.36)"/>
          <stop offset="45%" stop-color="rgba(255,255,255,0.18)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0.06)"/>
        </linearGradient>
        <linearGradient id="meeting-board-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="color-mix(in srgb,var(--panel-2) 80%,transparent)"/>
          <stop offset="100%" stop-color="color-mix(in srgb,var(--line) 50%,transparent)"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="900" fill="url(#floor-vignette-v2)"/>
      <rect x="0" y="0" width="1600" height="900" fill="url(#iso-grid-v2)"/>
      <rect x="40" y="462" width="1520" height="48" rx="20" fill="url(#walkway-center-h)" opacity="0.88"/>
      <rect x="776" y="40" width="48" height="820" rx="22" fill="url(#walkway-center-v)" opacity="0.82"/>
      <g class="walkway-skinny" fill="none" stroke="color-mix(in srgb, var(--line) 68%, transparent)" stroke-width="1.1" opacity="0.38">
        <path d="M60 486 L1540 486"/>
        <path d="M800 80 L800 860"/>
        <path d="M540 110 L540 860" opacity="0.7"/>
        <path d="M1060 360 L1060 860" opacity="0.7"/>
      </g>
      <g class="shared-meeting-board" transform="translate(620 114)" opacity="0.92" style="pointer-events:none;">
        <rect x="0" y="0" width="360" height="116" rx="6" fill="url(#meeting-board-frame)" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>
        <rect x="4" y="4" width="352" height="108" rx="4" fill="url(#meeting-board-glass)"/>
        <g transform="translate(16 14)">
          <g transform="translate(0 0)" opacity="0.56">
            <rect x="0" y="0" width="72" height="5" rx="2.2" fill="var(--orchestrator)" opacity="0.32"/>
            <text x="0" y="18" font-size="6.8" font-weight="700" fill="var(--text)" style="font-family:var(--sans),system-ui;letter-spacing:1.2;">TEAM CADENCE</text>
          </g>
          <g transform="translate(0 28)" fill="none" stroke="var(--text-muted)" stroke-width="0.55" opacity="0.48">
            <line x1="0" y1="0" x2="328" y2="0"/>
            <line x1="66" y1="0" x2="66" y2="68"/>
            <line x1="0" y1="18" x2="328" y2="18"/>
            <line x1="0" y1="36" x2="328" y2="36"/>
            <line x1="0" y1="54" x2="328" y2="54"/>
          </g>
          <g transform="translate(8 32)" font-family="var(--sans),system-ui" font-size="5.8" fill="var(--text-muted)" opacity="0.52">
            <text x="0" y="0" fill="var(--role-product)" opacity="0.72">Mon</text>
            <text x="74" y="0" opacity="0.62">Standup</text>
            <text x="172" y="0" opacity="0.62">Grooming</text>
            <text x="258" y="0" fill="var(--role-reviewer)" opacity="0.72">Review</text>
            <text x="0" y="18" fill="var(--role-frontend)" opacity="0.72">Wed</text>
            <text x="74" y="18" opacity="0.62">Design Sync</text>
            <text x="172" y="18" fill="var(--orchestrator)" opacity="0.68">Helix Sync</text>
            <text x="258" y="18" opacity="0.62">Demo Prep</text>
            <text x="0" y="36" fill="var(--role-backend)" opacity="0.72">Fri</text>
            <text x="74" y="36" opacity="0.62">CI Gates</text>
            <text x="172" y="36" fill="var(--role-qa)" opacity="0.72">QA Signoff</text>
            <text x="258" y="36" fill="var(--done)" opacity="0.72">Ship ✦</text>
          </g>
          <g transform="translate(250 -2)" opacity="0.68">
            <circle cx="0" cy="0" r="4.8" fill="var(--working)" opacity="0.22"/>
            <circle cx="0" cy="0" r="2.6" fill="var(--working)"/>
          </g>
        </g>
        <g transform="translate(180 104)" font-family="var(--sans),system-ui" font-size="5.4" fill="var(--text-muted)" opacity="0.38" text-anchor="middle">
          <text x="0" y="0">Open Collaboration Space · 共享协作板</text>
        </g>
      </g>
      <g transform="translate(800 486)" opacity="0.96">
        <ellipse cx="0" cy="0" rx="160" ry="96" fill="url(#collab-rug)"/>
        <ellipse cx="0" cy="0" rx="110" ry="62" fill="none" stroke="color-mix(in srgb,var(--orchestrator) 28%,transparent)" stroke-width="0.9" stroke-dasharray="2.5 5" opacity="0.62"/>
        <g transform="translate(0 -6)" opacity="0.78">
          <circle cx="-34" cy="0" r="5" fill="color-mix(in srgb,var(--working) 60%,transparent)"/>
          <circle cx="0" cy="-14" r="5" fill="color-mix(in srgb,var(--reviewing) 60%,transparent)"/>
          <circle cx="34" cy="0" r="5" fill="color-mix(in srgb,var(--done) 60%,transparent)"/>
          <circle cx="0" cy="14" r="5" fill="color-mix(in srgb,var(--orchestrator) 55%,transparent)"/>
        </g>
        <g font-family="var(--sans),system-ui" font-size="7" fill="var(--text-muted)" opacity="0.44" text-anchor="middle">
          <text x="0" y="46">COLLAB · DISPATCH PATH</text>
        </g>
      </g>
      <g class="dispatch-arrows reduced-motion-hidden" fill="none" stroke="color-mix(in srgb,var(--orchestrator) 32%,transparent)" stroke-width="1.2" stroke-dasharray="5.5 3.5" opacity="0.12">
        <path d="M800 486 C 720 430 520 300 300 270"/>
        <path d="M800 486 C 720 540 520 560 300 560"/>
        <path d="M800 486 C 880 430 1080 420 1320 460"/>
        <path d="M800 486 C 720 540 600 700 400 780"/>
        <path d="M800 486 C 880 540 1000 700 1300 790"/>
      </g>
    </svg>`
  }

  function taskCapsuleSVG(task, x, y) {
    const St = S?.STATES
    const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[task.status] || 'IDLE'
    const color = St ? `var(--${St[stateKey].key})` : 'var(--accent)'
    return `<g class="task-capsule task-${task.id}" data-task="${task.id}" data-role="${task.role || ''}" transform="translate(${x} ${y})" style="cursor:pointer;">
      <rect x="0" y="0" width="128" height="28" rx="7" fill="color-mix(in srgb,var(--panel-2) 72%,transparent)" stroke="var(--line)" stroke-width="0.85" opacity="0.88"/>
      <rect x="0" y="0" width="3.4" height="28" rx="1.6" fill="${color}" opacity="0.92"/>
      <text x="10" y="12.5" font-family="var(--mono)" font-size="7.2" fill="var(--text-muted)" font-weight="700" opacity="0.86">${esc(task.id)}</text>
      <text x="10" y="22" font-size="7.6" fill="var(--text)" style="font-family:var(--sans),system-ui;font-weight:600;" opacity="0.94">${esc(String(task.title).slice(0, 19))}</text>
      <g transform="translate(108 13)" fill="${color}" opacity="0.94">
        ${S?.stateGlyphSvg(stateKey, 9) || ''}
      </g>
    </g>`
  }

  function buildDeskSVG(roleId, cx, cy) {
    return `<g class="desk desk-${roleId}" data-role="${roleId}" style="cursor:pointer;">
      <ellipse cx="${cx + 4}" cy="${cy + 68}" rx="48" ry="9.5" fill="rgba(0,0,0,0.2)" opacity="0.55"/>
      <path d="M${cx - 58} ${cy + 22} L${cx + 58} ${cy + 22} L${cx + 62} ${cy + 60} L${cx - 54} ${cy + 60} Z" fill="color-mix(in srgb,var(--panel-2) 72%,transparent)" stroke="rgba(0,0,0,0.14)" stroke-width="0.8"/>
      <path d="M${cx - 58} ${cy + 22} L${cx - 54} ${cy + 60} L${cx - 48} ${cy + 62} L${cx - 52} ${cy + 24} Z" fill="color-mix(in srgb,var(--panel) 55%,var(--panel-2))" stroke="rgba(0,0,0,0.1)" stroke-width="0.6" opacity="0.82"/>
      <path d="M${cx + 58} ${cy + 22} L${cx + 62} ${cy + 60} L${cx + 68} ${cy + 62} L${cx + 64} ${cy + 24} Z" fill="color-mix(in srgb,var(--panel) 40%,var(--panel-2))" stroke="rgba(0,0,0,0.1)" stroke-width="0.6" opacity="0.82"/>
      <rect x="${cx - 56}" y="${cy + 16}" width="112" height="10" rx="4.5" fill="color-mix(in srgb,var(--panel) 96%,transparent)" stroke="rgba(0,0,0,0.1)" stroke-width="0.7"/>
      <rect x="${cx - 54}" y="${cy + 14}" width="108" height="4.5" rx="2.2" fill="color-mix(in srgb,var(--panel-2) 88%,transparent)" stroke="rgba(0,0,0,0.06)" stroke-width="0.5" opacity="0.9"/>
      <rect x="${cx - 42}" y="${cy + 54}" width="8" height="18" rx="2.2" fill="color-mix(in srgb,var(--panel-2) 80%,rgba(40,44,56,0.9))" stroke="rgba(0,0,0,0.2)" stroke-width="0.6" opacity="0.92"/>
      <g transform="translate(${cx - 36} ${cy + 58})" opacity="0.78">
        <circle cx="2" cy="3" r="1.1" fill="var(--working)" opacity="0.85"/>
        <rect x="5.5" y="2" width="10" height="2" rx="0.9" fill="var(--done)" opacity="0.75"/>
      </g>
    </g>`
  }

  function buildChairSVG(roleId, cx, cy, angle) {
    const tilt = (angle || 0) * 0.11
    return `<g class="chair chair-${roleId}" transform="translate(${cx} ${cy + 72}) rotate(${tilt || 0})">
      <ellipse cx="0" cy="16" rx="17" ry="3.2" fill="rgba(0,0,0,0.22)" opacity="0.48"/>
      <path d="M-14 -8 L14 -8 L16 14 L-16 14 Z" fill="rgba(46,50,64,0.88)" stroke="rgba(0,0,0,0.28)" stroke-width="0.8"/>
      <rect x="-19" y="6" width="38" height="7.5" rx="3.4" fill="rgba(62,66,82,0.9)" stroke="rgba(0,0,0,0.25)" stroke-width="0.75"/>
      <rect x="-2.6" y="14" width="5.2" height="15" rx="2" fill="rgba(38,42,56,0.95)"/>
      <path d="M-12 28 L12 28 L14 31 L-14 31 Z" fill="rgba(30,34,46,0.93)" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>
      <rect x="-15" y="-12" width="30" height="4" rx="2" fill="rgba(30,34,46,0.85)" stroke="rgba(0,0,0,0.25)" stroke-width="0.6" opacity="0.85"/>
    </g>`
  }

  function sliceSwitcherHTML(snapshot, humanActive, mount) {
    const slice = mount && typeof mount === 'object' && mount.dataset ? (mount.dataset.officeSlice || DEFAULT_SLICE) : DEFAULT_SLICE
    return `<div class="v2-slice-switcher" style="display:flex; gap:6px; padding:8px; overflow-x:auto; position:absolute; top:48px; left:0; right:0; z-index:20; background:color-mix(in srgb,var(--panel) 88%,transparent); border-bottom:1px solid var(--line); min-height:52px; align-items:center; touch-action:pan-x;">
    ${Object.entries(OFFICE_SLICES).map(([key]) => {
      const isHuman = key === 'human'
      if (isHuman && !humanActive) return ''
      const active = slice === key || (!slice && key === DEFAULT_SLICE)
      const cls = `v2-slice-chip ${active ? 'is-active' : ''}`
      const chipStyle = 'display:inline-flex; align-items:center; justify-content:center; padding:8px 12px; height:44px; min-width:44px; border-radius:10px; border:1px solid ' + (active ? 'var(--role-helix)' : 'var(--line)') + '; background:' + (active ? 'color-mix(in srgb,var(--role-helix) 18%,transparent)' : 'var(--panel-2)') + '; color:' + (active ? 'var(--text)' : 'var(--text-muted)') + '; font-weight:' + (active ? '700' : '500') + '; font-size:11.5px; white-space:nowrap; cursor:pointer; font-family:var(--sans);'
      const labels = { planning:'规划', engineering:'工程', quality:'质量', knowledge:'知识', helix:'Helix', human:'人类协作' }
      return `<button type="button" data-slice="${key}" class="${cls}" style="${chipStyle}" aria-pressed="${active}">${labels[key] || key}</button>`
    }).join('')}
  </div>`
  }

  /** Mount 6-zone 2.5D office onto `mount`. */
  function attach(mount, opts = {}) {
    if (!mount) throw new Error('VAOCoreOfficeV2.attach: mount required')
    mount.classList.add('v2-canvas', 'v2-canvas-spatial')
    const mode = modeOf(opts)
    const useFixtures = mode === 'demo'
    const snapshot = opts.snapshot || null

    if (typeof window !== 'undefined' && window && typeof window.innerWidth === 'number') {
      const rm = resolveResponsiveMode(window.innerWidth, window.innerHeight || 0)
      mount.dataset.officeMode = rm
      if (rm === 'TABLET' && window.innerHeight > window.innerWidth) mount.dataset.officeMode = 'TABLET_PORTRAIT'
    }
    if (!mount.dataset?.officeSlice) mount.dataset.officeSlice = DEFAULT_SLICE
    const croppedMode = mount.dataset.officeMode === 'MOBILE' || mount.dataset.officeMode === 'TABLET_PORTRAIT'
    const initialViewBox = croppedMode ? (OFFICE_SLICES[mount.dataset.officeSlice] || OFFICE_SLICES[DEFAULT_SLICE]) : '0 0 1600 900'

    const seatStates = Object.assign({}, snapshot?.seatStates || (useFixtures ? DEMO_SEAT_STATE : {}))
    const seatKinds = Object.assign({}, snapshot?.seatKinds || (useFixtures ? DEMO_SEAT_KIND : {}))
    const seatMembers = Object.assign({}, snapshot?.seatMembers || (useFixtures ? DEMO_SEAT_MEMBER : {}))
    const seatModels = Object.assign({}, snapshot?.seatModels || (useFixtures ? DEMO_SEAT_MODEL : {}))
    const tasks = snapshot?.tasks?.length ? snapshot.tasks.slice() : (useFixtures ? JSON.parse(JSON.stringify(DEMO_TASKS)) : [])
    const waitingHuman = tasks.filter((t) => t.kind === 'human' || t.sinceMs || t.status === 'waiting')
    const humanActive = waitingHuman.length > 0

    const roleTasks = {}
    for (const t of tasks) { if (t.role) (roleTasks[t.role] ||= []).push(t) }

    const figureMounts = {}
    for (const [roleId, pos] of Object.entries(ZONE_POSITIONS)) {
      if (roleId === 'human') continue
      const state = seatStates[roleId] || 'IDLE'
      const kind = seatKinds[roleId] || (roleId === 'helix' ? 'system' : (['product','qa','reviewer'].includes(roleId) ? 'human' : 'ai'))
      const memberName = seatMembers[roleId]
      const model = seatModels[roleId]
      const scale = roleId === 'helix' ? 2.2 : 1.75
      figureMounts[roleId] = CV2
        ? CV2.renderSVG(roleId, { state, kind, memberName, model, angle: pos.angle, scale })
        : `<text x="${pos.cx}" y="${pos.cy}" font-size="10" fill="var(--text-muted)">${roleId}</text>`
    }

    const taskCapsules = []
    ;['frontend', 'backend', 'qa', 'reviewer', 'architect'].forEach((rid, i) => {
      const list = roleTasks[rid] || []
      const pos = ZONE_POSITIONS[rid]
      if (!pos || !list.length) return
      taskCapsules.push(taskCapsuleSVG(list[0], pos.cx - 64, pos.cy - (rid === 'qa' || rid === 'reviewer' ? 148 : 178)))
    })

    const overlayHTML = `
      ${taskCapsules.join('')}
      ${tasks.filter(t => t.role === 'docs').slice(0,1).map((t, i) => taskCapsuleSVG(t, 356, 704 + i * 36)).join('')}
    `

    const desktopPAR = croppedMode ? 'xMidYMid meet' : 'xMidYMin meet'
    mount.innerHTML = `
      ${floorBackdropSVG()}
      <div class="office-scene-wrap" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
        <svg class="scene-svg" viewBox="${initialViewBox}" preserveAspectRatio="${desktopPAR}" role="presentation" style="position:absolute;inset:0;width:100%;height:100%;min-width:0;min-height:0;display:block;">
          <!-- Z-ORDER (earlier = painted first = bottom layer):
               01 floorBackdrop (outside this SVG, pre-rendered backdrop)
               02 zoneRugsLayer / rugs (inside zone SVGs)
               03 wallBoards / environments / whiteboards (zone layers)
               04 chairLayer / characters-layer CHAIRS (per seat, NO desks at office level)
               05 workstation / screens (inside each character SVG paint L1)
               06 CHARACTER bodies (inside character SVG paint L3 skeleton)
               07 desk foregrounds (inside character SVG deskState)
               08 capsules-layer (task capsules UI above everything) -->
          ${planningZone()}
          ${engineeringZone()}
          ${qualityZone()}
          ${knowledgeZone()}
          ${helixHubZone()}
          ${humanAreaZone(humanActive)}
          <g class="characters-layer" style="pointer-events:auto;">
            ${['product','architect','frontend','backend','qa','reviewer','docs'].map((rid) => {
              const p = ZONE_POSITIONS[rid]
              return buildChairSVG(rid, p.cx, p.cy, p.angle)
            }).join('')}
            ${Object.entries(figureMounts).filter(([rid]) => rid !== 'helix').map(([rid, svgStr]) => {
              const p = ZONE_POSITIONS[rid]
              return `<g class="char-anchor char-${rid}" data-role="${rid}" transform="translate(${p.cx - 35} ${p.cy - 42})" style="cursor:pointer;">${svgStr}</g>`
            }).join('')}
            ${(figureMounts.helix ? `<g class="char-anchor char-helix" data-role="helix" transform="translate(${ZONE_POSITIONS.helix.cx - 45} ${ZONE_POSITIONS.helix.cy - 128})" style="cursor:pointer;">${figureMounts.helix}</g>` : '')}
          </g>
          <g class="capsules-layer" style="pointer-events:auto;">
            ${overlayHTML}
          </g>
        </svg>
        ${(mount.dataset?.officeMode === 'MOBILE' || mount.dataset?.officeMode === 'TABLET_PORTRAIT') ? sliceSwitcherHTML(snapshot, humanActive, mount) : ''}
      </div>
      <style>
        html[data-theme-core] body.v2-shell-body .v2-stage-wrap.v2-canvas-spatial {
          background:var(--canvas-floor); width:100%; position:relative; display:block; overflow:hidden;
          height:100%;
        }
        html[data-theme-core] .v2-canvas-spatial > .office-scene-wrap { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; display:block; }
        html[data-theme-core] body.v2-shell-body .v2-stage-wrap.v2-canvas-spatial .office-scene-wrap > .scene-svg {
          position:absolute; inset:0; width:100%; height:100%; display:block; min-width:0; min-height:0;
        }
        html[data-theme-core] body.v2-shell-body.v2-responsive-mobile .v2-stage-wrap.v2-canvas-spatial { overflow:hidden; }
        html[data-theme-core] body.v2-shell-body.v2-responsive-tablet-portrait .v2-stage-wrap.v2-canvas-spatial { overflow:hidden; }
      </style>
    `

    function fire(type, detail) {
      const hasDisp = typeof mount.dispatchEvent === 'function'
      if (hasDisp) {
        try { mount.dispatchEvent(new CustomEvent(type, { bubbles: true, detail })) }
        catch (_) {}
      }
    }

    function safeForEach(list, cb) {
      if (!list) return
      if (typeof list.forEach === 'function') { list.forEach(cb); return }
      if (Array.isArray(list)) for (const n of list) cb(n)
    }

    function safeQuery(m, sel) {
      if (m && typeof m.querySelector === 'function') try { return m.querySelector(sel) } catch (_) { return null }
      return null
    }
    function safeQueryAll(m, sel) {
      if (m && typeof m.querySelectorAll === 'function') try { return m.querySelectorAll(sel) } catch (_) { return [] }
      return []
    }

    safeForEach(safeQueryAll(mount, '.char-anchor'), (g) => {
      if (g && typeof g.addEventListener === 'function') g.addEventListener('click', (e) => { try { e.stopPropagation && e.stopPropagation() } catch (_) {} fire('vao-v2:role-clicked', { roleId: g.dataset?.role, el: g }) })
    })
    safeForEach(safeQueryAll(mount, '.char-anchor'), (g) => {
      const roleId = g?.dataset?.role
      if (!roleId) return
      const d = (typeof g.querySelector === 'function') ? g.querySelector('.sk2-desk, .ws-mini') : null
      if (d && typeof d.addEventListener === 'function') d.addEventListener('click', (e) => { try { e.stopPropagation && e.stopPropagation() } catch (_) {} fire('vao-v2:workstation-clicked', { roleId, el: d }) })
    })
    safeForEach(safeQueryAll(mount, '.task-capsule'), (tc) => {
      if (tc && typeof tc.addEventListener === 'function') tc.addEventListener('click', (e) => { try { e.stopPropagation && e.stopPropagation() } catch (_) {} fire('vao-v2:task-clicked', { taskId: tc.dataset?.task, el: tc }) })
    })
    safeForEach(safeQueryAll(mount, '.v2-slice-chip'), (btn) => {
      if (btn && typeof btn.addEventListener === 'function') btn.addEventListener('click', (e) => {
        try { e.stopPropagation && e.stopPropagation() } catch (_) {}
        const slice = btn.dataset?.slice
        if (!slice) return
        mount.dataset.officeSlice = slice
        fire('vao-v2:office-slice-changed', { slice })
        const svgEl = safeQuery(mount, '.scene-svg')
        if (svgEl && svgEl.setAttribute) svgEl.setAttribute('viewBox', OFFICE_SLICES[slice] || '0 0 1600 900')
        safeForEach(safeQueryAll(mount, '.v2-slice-chip'), (c) => {
          const on = (c && c.dataset?.slice === slice)
          if (!c || typeof c.setAttribute !== 'function') return
          c.setAttribute('aria-pressed', on ? 'true' : 'false')
          c.style.borderColor = on ? 'var(--role-helix)' : 'var(--line)'
          c.style.background = on ? 'color-mix(in srgb,var(--role-helix) 18%,transparent)' : 'var(--panel-2)'
        })
      })
    })

    return {
      mode,
      mount,
      update(nextSnapshot) { attach(mount, { snapshot: nextSnapshot, mode }) },
      setRoleState(roleId, stateId) {
        if (!CV2) return
        const p = ZONE_POSITIONS[roleId] || {}
        const kind = seatKinds[roleId] || (roleId === 'helix' ? 'system' : (['product','qa','reviewer'].includes(roleId) ? 'human' : 'ai'))
        const scale = roleId === 'helix' ? 2.2 : 1.75
        const newSVG = CV2.renderSVG(roleId, { state: stateId, kind, memberName: seatMembers[roleId], model: seatModels[roleId], angle: p.angle || 0, scale })
        seatStates[roleId] = stateId
        const wrapperClassKey = 'state-' + ((S?.STATES?.[stateId]?.key) || stateId.toLowerCase().replace(/_/g, '-'))
        const el = safeQuery(mount, `.char-${roleId}`)
        if (el) {
          el.innerHTML = newSVG
          ;['IDLE','THINKING','WORKING','REVIEWING','WAITING_HUMAN','BLOCKED','DONE','OFFLINE'].forEach((s) => el.classList.remove('state-' + s.toLowerCase().replace(/_/g, '-')))
          el.classList.add(wrapperClassKey)
          return
        }
        // Shim fallback: perform regex text-level replacement on mount's stored innerHTML.
        // Querying inside SVG text blobs via querySelector does not work in minimal shim.
        try {
          const html = mount.innerHTML || ''
          // 1. Replace inner SVG content of the char-<roleId> anchor
          const innerRe = new RegExp(`(<g\\s+[^>]*class="char-anchor\\s+char-${roleId}"[^>]*>)[\\s\\S]*?(<\\/g>)`, 'i')
          let replaced = html.replace(innerRe, (_, open, close) => `${open}${newSVG}${close}`)
          // 2. Wrapper class update inside the G tag
          const tagRe = new RegExp(`<g\\s+([^>]*class="[^"]*char-anchor\\s+char-${roleId}[^"]*"[^>]*)>`, 'i')
          replaced = replaced.replace(tagRe, (full, attrs) => {
            let cleanedAttrs = attrs.replace(/\bstate-[\w-]+\s*/g, '').replace(/\s+/g, ' ').trim()
            const classRe = /class="([^"]*)"/
            if (classRe.test(cleanedAttrs)) cleanedAttrs = cleanedAttrs.replace(classRe, (m, cls) => {
              const classes = cls.split(/\s+/).filter(Boolean).filter(c => !c.startsWith('state-'))
              classes.push(wrapperClassKey)
              return `class="${classes.join(' ')}"`
            })
            return `<g ${cleanedAttrs}>`
          })
          if (replaced !== html) mount.innerHTML = replaced
        } catch (_) { /* ignore shim write errors */ }
      },
      activateHumanArea(on) {
        const zone = safeQuery(mount, '.zone-human-area')
        const val = on ? 'true' : 'false'
        if (zone) {
          try { zone.setAttribute('data-active', val) } catch (_) { zone.dataset && (zone.dataset.active = val) }
          try { zone.setAttribute('opacity', on ? '1' : '0.12') } catch (_) {}
          safeForEach(safeQueryAll(zone, '.human-request-card, .human-seat-indicator, .helix-human-pulse-line'), (n) => {
            try { n.style.display = on ? '' : 'none' } catch (_) {}
          })
          return
        }
        try {
          const html = mount.innerHTML || ''
          let replaced = html
          const zoneRe = /(<g\s+[^>]*class="zone\s+zone-human-area"[^>]*>)/i
          replaced = replaced.replace(zoneRe, (m, openTag) => {
            let t = openTag.replace(/data-active="[^"]*"/i, '')
            t = t.replace(/opacity="[^"]*"/i, '')
            t = t.slice(0, -1) + ` data-active="${val}" opacity="${on ? '1' : '0.12'}">`
            return t
          })
          if (on) {
            replaced = replaced.replace(/style="display\s*:\s*none[^"]*"/gi, (m) => {
              return m.includes('human-') || m.includes('helix-human-') ? 'style=""' : m
            })
            replaced = replaced.replace(/(<g\s+[^>]*class="[^"]*(?:human-request-card|human-seat-indicator|helix-human-pulse-line)[^"]*"[^>]*\s)style="display\s*:\s*none[^"]*"/gi, '$1style=""')
          }
          if (replaced !== html) mount.innerHTML = replaced
        } catch (_) {}
      },
      pulseHelixTo(roleId) {
        const paths = safeQueryAll(mount, '.hub-connection-paths path')
        const floorPaths = safeQueryAll(mount, '.dispatch-arrows path')
        if (!S) return
        const map = { product: 0, architect: 0, frontend: 1, backend: 1, qa: 2, reviewer: 2, docs: 3, human: 4 }
        const idx = map[roleId]
        const target = paths && paths.length ? (typeof idx === 'number' ? (paths[idx] || paths[0]) : paths[0]) : null
        const floorTarget = floorPaths && floorPaths.length ? (typeof idx === 'number' ? (floorPaths[idx] || floorPaths[0]) : null) : null
        if (target) {
          try { target.setAttribute('stroke-width', '3.2') } catch (_) {}
          try { target.setAttribute('stroke', 'var(--orchestrator)') } catch (_) {}
          try { target.setAttribute('opacity', '0.94') } catch (_) {}
          try { target.classList && target.classList.add('reduced-motion-hidden') } catch (_) {}
        }
        if (floorTarget) {
          try { floorTarget.setAttribute('stroke-width', '2.8') } catch (_) {}
          try { floorTarget.setAttribute('stroke', 'var(--orchestrator)') } catch (_) {}
          try { floorTarget.setAttribute('opacity', '0.88') } catch (_) {}
        }
        try { setTimeout(() => {
          if (target) {
            try { target.setAttribute('stroke-width', '1.2') } catch (_) {}
            try { target.setAttribute('stroke', 'color-mix(in srgb,var(--orchestrator) 28%,transparent)') } catch (_) {}
            try { target.setAttribute('opacity', '0.12') } catch (_) {}
          }
          if (floorTarget) {
            try { floorTarget.setAttribute('stroke-width', '1.2') } catch (_) {}
            try { floorTarget.setAttribute('stroke', 'color-mix(in srgb,var(--orchestrator) 32%,transparent)') } catch (_) {}
            try { floorTarget.setAttribute('opacity', '0.12') } catch (_) {}
          }
        }, 700) } catch (_) {}
      },
      destroy() {
        try { mount.innerHTML = '' } catch (_) {}
        try { mount.classList && mount.classList.remove('v2-canvas', 'v2-canvas-spatial') } catch (_) {}
      },
    }
  }

  const _internals = Object.freeze({
    RESPONSIVE_MODES,
    resolveResponsiveMode,
    OFFICE_SLICES,
    DEFAULT_SLICE,
  })

  const api = Object.freeze({
    attach,
    RESPONSIVE_MODES,
    resolveResponsiveMode,
    OFFICE_SLICES,
    DEFAULT_SLICE,
    ZONE_POSITIONS,
    DEMO_SEAT_STATE,
    DEMO_SEAT_KIND,
    DEMO_SEAT_MEMBER,
    DEMO_SEAT_MODEL,
    DEMO_TASKS,
    _internals,
  })
  globalThis.VAOCoreOfficeV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
