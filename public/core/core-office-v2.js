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
    product:   { cx: 220,  cy: 230,  angle: 15,  zone: 'planning' },
    architect: { cx: 380,  cy: 300,  angle: 10,  zone: 'planning' },
    frontend:  { cx: 210,  cy: 500,  angle: 18,  zone: 'engineering' },
    backend:   { cx: 370,  cy: 560,  angle: 14,  zone: 'engineering' },
    qa:        { cx: 1240, cy: 430,  angle: -14, zone: 'quality' },
    reviewer:  { cx: 1390, cy: 500,  angle: -18, zone: 'quality' },
    docs:      { cx: 380,  cy: 740,  angle: 8,   zone: 'knowledge' },
    helix:     { cx: 800,  cy: 700,  angle: 0,   zone: 'helix-hub' },
    human:     { cx: 1300, cy: 760,  angle: 0,   zone: 'human-area' },
  })

  function zoneLabel(id, zh, en, x, y) {
    return `<g class="zone-label" data-zone="${id}" transform="translate(${x} ${y})">
      <rect x="0" y="0" width="180" height="30" rx="8" fill="rgba(255,255,255,0.42)" stroke="rgba(0,0,0,0.08)"/>
      <text x="12" y="19" font-size="11" font-weight="800" letter-spacing="2" fill="var(--text)" opacity="0.78" style="font-family:var(--sans),system-ui;">${id}</text>
      <text x="62" y="19" font-size="10" fill="var(--text-muted)" style="font-family:var(--sans),system-ui;">${zh} · ${en}</text>
    </g>`
  }

  function planningZone() {
    return `<g class="zone zone-planning" data-zone="planning">
      <path d="M80 100 L520 100 L560 420 L80 360 Z" fill="color-mix(in srgb,var(--panel) 88%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="1.2"/>
      ${zoneLabel('PLANNING', '规划工作室', 'Planning Studio', 100, 112)}
      <g class="whiteboard-roadmap" transform="translate(130 140)">
        <rect x="0" y="0" width="280" height="100" rx="6" fill="#ffffff" stroke="rgba(0,0,0,0.14)" stroke-width="1"/>
        <g stroke="var(--role-product)" stroke-width="0.8" fill="none" opacity="0.85">
          <rect x="16" y="16" width="64" height="22" rx="3"/>
          <rect x="90" y="16" width="80" height="22" rx="3"/>
          <rect x="180" y="16" width="80" height="22" rx="3"/>
          <path d="M18 32 h60 M92 32 h76 M182 32 h76"/>
        </g>
        <g fill="var(--role-product)" opacity="0.72">
          <rect x="16" y="56" width="48" height="10" rx="2"/>
          <rect x="72" y="56" width="60" height="10" rx="2" fill="var(--role-frontend)" opacity="0.65"/>
          <rect x="140" y="56" width="54" height="10" rx="2" fill="var(--role-architect)" opacity="0.65"/>
          <rect x="202" y="56" width="72" height="10" rx="2" fill="var(--role-qa)" opacity="0.6"/>
        </g>
      </g>
      <g class="architecture-wall" transform="translate(420 160)">
        <rect x="0" y="0" width="110" height="180" rx="5" fill="color-mix(in srgb,var(--role-architect) 10%,transparent)" stroke="color-mix(in srgb,var(--role-architect) 45%,transparent)" stroke-width="1"/>
        <g stroke="var(--role-architect)" stroke-width="0.7" fill="none" opacity="0.85">
          <rect x="12" y="16" width="32" height="30"/>
          <rect x="52" y="16" width="46" height="30"/>
          <rect x="12" y="56" width="86" height="28"/>
          <circle cx="55" cy="110" r="16"/>
          <path d="M12 140 L30 140 L40 160 L70 160 L80 140 L98 140"/>
        </g>
      </g>
    </g>`
  }

  function engineeringZone() {
    return `<g class="zone zone-engineering" data-zone="engineering">
      <path d="M80 400 L520 460 L540 680 L80 680 Z" fill="color-mix(in srgb,var(--panel) 85%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="1.2"/>
      ${zoneLabel('ENGINEERING', '工程站', 'Engineering Pod', 100, 420)}
      <g class="fe-dual-monitor" transform="translate(140 430)">
        <rect x="0" y="24" width="130" height="14" rx="4" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.8"/>
        <rect x="4" y="0" width="58" height="44" rx="3" fill="#111827" stroke="rgba(0,0,0,0.25)" stroke-width="0.9"/>
        <rect x="8" y="4" width="50" height="36" rx="2" fill="color-mix(in srgb,var(--role-frontend) 16%,#ffffff20)"/>
        <g fill="#ffffff" opacity="0.88">
          <rect x="12" y="8" width="16" height="4" rx="1.5"/>
          <rect x="12" y="14" width="42" height="2.2" rx="1" opacity="0.6"/>
          <rect x="12" y="18" width="36" height="2.2" rx="1" opacity="0.5"/>
          <circle cx="54" cy="11" r="2.5" fill="var(--role-frontend)" opacity="0.85"/>
        </g>
        <rect x="68" y="0" width="58" height="44" rx="3" fill="#111827" stroke="rgba(0,0,0,0.25)" stroke-width="0.9"/>
        <rect x="72" y="4" width="50" height="36" rx="2" fill="color-mix(in srgb,var(--role-frontend) 12%,#ffffff18)"/>
        <g stroke="var(--role-frontend)" stroke-width="0.9" fill="none" opacity="0.8">
          <path d="M76 10 L92 10 L95 22 L82 28 L75 22 Z"/>
          <circle cx="112" cy="18" r="3"/>
        </g>
      </g>
      <g class="be-terminal-monitor" transform="translate(290 490)">
        <rect x="0" y="0" width="140" height="72" rx="4" fill="#0b1020" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
        <rect x="4" y="4" width="132" height="64" rx="2" fill="#0a0e1c"/>
        <g font-family="ui-monospace, Menlo, monospace" font-size="6.5" fill="var(--done)" opacity="0.9">
          <text x="10" y="16">$ build --target=dist</text>
          <text x="10" y="26" fill="var(--working)">[1/4] compile services…</text>
          <text x="10" y="36" fill="var(--working)">[2/4] wire MCP routes…</text>
          <text x="10" y="46" fill="var(--done)">✓ api-core linked</text>
          <text x="10" y="56" fill="var(--reviewing)">[3/4] review pending…</text>
        </g>
      </g>
      <g class="be-topology-screen" transform="translate(450 540)">
        <rect x="0" y="0" width="72" height="64" rx="4" fill="#0f1522" stroke="rgba(0,0,0,0.2)" stroke-width="0.9"/>
        <g stroke="var(--role-backend)" stroke-width="0.7" fill="none" opacity="0.8">
          <circle cx="20" cy="22" r="6"/>
          <circle cx="52" cy="22" r="6"/>
          <circle cx="36" cy="46" r="6"/>
          <path d="M24 22 L48 22 M24 25 L32 42 M48 25 L40 42"/>
        </g>
      </g>
    </g>`
  }

  function qualityZone() {
    return `<g class="zone zone-quality" data-zone="quality">
      <path d="M1080 360 L1520 420 L1520 680 L1080 680 Z" fill="color-mix(in srgb,var(--panel) 85%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="1.2"/>
      ${zoneLabel('QUALITY', '质检工作室', 'Quality Studio', 1100, 380)}
      <g class="test-matrix-screen" transform="translate(1100 410)">
        <rect x="0" y="0" width="150" height="72" rx="4" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.9"/>
        <g>
          <rect x="8" y="8" width="28" height="20" rx="2" fill="color-mix(in srgb,var(--done) 20%,transparent)" stroke="var(--done)" stroke-width="0.7"/>
          <path d="M15 19 L20 24 L32 14" stroke="var(--done)" stroke-width="1.5" fill="none"/>
          <rect x="42" y="8" width="28" height="20" rx="2" fill="color-mix(in srgb,var(--working) 22%,transparent)" stroke="var(--working)" stroke-width="0.7"/>
          <circle cx="56" cy="18" r="3.5" fill="none" stroke="var(--working)" stroke-width="1.4" stroke-dasharray="3 2"/>
          <rect x="76" y="8" width="28" height="20" rx="2" fill="color-mix(in srgb,var(--blocked) 20%,transparent)" stroke="var(--blocked)" stroke-width="0.7"/>
          <path d="M82 14 L98 26 M98 14 L82 26" stroke="var(--blocked)" stroke-width="1.3"/>
          <rect x="110" y="8" width="30" height="20" rx="2" fill="color-mix(in srgb,var(--role-qa) 20%,transparent)" stroke="var(--role-qa)" stroke-width="0.7"/>
          <g fill="var(--role-qa)" opacity="0.8">
            <rect x="114" y="14" width="8" height="2" rx="1"/>
            <rect x="114" y="18" width="18" height="2" rx="1"/>
          </g>
          <g font-family="var(--mono)" font-size="6.5" fill="var(--text-muted)">
            <text x="12" y="46">suite/core.spec</text>
            <text x="12" y="56" fill="var(--done)">✓ 142 passed</text>
            <text x="80" y="56" fill="var(--blocked)">✗ 2 failed</text>
            <text x="12" y="66" fill="var(--reviewing)">⟳ 8 pending</text>
          </g>
        </g>
      </g>
      <g class="diff-screen" transform="translate(1310 470)">
        <rect x="0" y="0" width="180" height="90" rx="4" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.9"/>
        <line x1="90" y1="0" x2="90" y2="90" stroke="rgba(0,0,0,0.15)" stroke-width="0.8"/>
        <g font-family="ui-monospace, Menlo, monospace" font-size="6.2">
          <text x="8" y="16" fill="var(--text-muted)">a/core-shell.js</text>
          <text x="98" y="16" fill="var(--text-muted)">b/core-shell.js</text>
          <rect x="4" y="22" width="82" height="10" rx="1.5" fill="color-mix(in srgb,var(--blocked) 12%,transparent)"/>
          <text x="8" y="30" fill="var(--blocked)">-  rail-w: 192px</text>
          <rect x="94" y="22" width="82" height="10" rx="1.5" fill="color-mix(in srgb,var(--done) 14%,transparent)"/>
          <text x="98" y="30" fill="var(--done)">+  rail-w: 168px</text>
          <rect x="4" y="36" width="82" height="10" rx="1.5" fill="color-mix(in srgb,var(--blocked) 12%,transparent)"/>
          <text x="8" y="44" fill="var(--blocked)">-  helix: 312px</text>
          <rect x="94" y="36" width="82" height="10" rx="1.5" fill="color-mix(in srgb,var(--done) 14%,transparent)"/>
          <text x="98" y="44" fill="var(--done)">+  helix: 360-420px</text>
          <text x="8" y="60" fill="var(--text-muted)">  nav: Office/Tasks</text>
          <text x="98" y="60" fill="var(--text-muted)">  nav: Office/Tasks</text>
          <text x="8" y="70" fill="var(--text-muted)">  theme-switcher ok</text>
          <text x="98" y="70" fill="var(--text-muted)">  theme-switcher ok</text>
          <text x="8" y="82" fill="var(--reviewing)">@@ 2 files, +12 -8</text>
        </g>
      </g>
    </g>`
  }

  function helixHubZone() {
    return `<g class="zone zone-helix-hub" data-zone="helix-hub">
      <path d="M540 600 L1080 600 L1080 860 L540 860 Z" fill="color-mix(in srgb,var(--orchestrator) 8%,color-mix(in srgb,var(--panel) 88%,transparent))" stroke="color-mix(in srgb,var(--orchestrator) 42%,rgba(0,0,0,0.08))" stroke-width="1.4"/>
      ${zoneLabel('HELIX HUB', '指挥中枢', 'Command Hub', 740, 612)}
      <g class="helix-desk-semicircle" transform="translate(800 720)">
        <path d="M-180 60 Q0 -150 180 60 L170 90 Q0 -100 -170 90 Z" fill="url(#helixDeskTop)" stroke="color-mix(in srgb,var(--orchestrator) 55%,var(--line))" stroke-width="1.6"/>
        <defs>
          <linearGradient id="helixDeskTop" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 28%,var(--panel))"/>
            <stop offset="100%" stop-color="color-mix(in srgb,var(--orchestrator) 14%,var(--panel-2))"/>
          </linearGradient>
          <radialGradient id="helixHubGlow" cx="50%" cy="0%" r="70%">
            <stop offset="0%" stop-color="color-mix(in srgb,var(--orchestrator) 28%,transparent)"/>
            <stop offset="100%" stop-color="transparent"/>
          </radialGradient>
        </defs>
        <path d="M-170 62 Q0 -130 170 62" fill="url(#helixHubGlow)" opacity="0.88"/>
        <g>
          <rect x="-160" y="14" width="68" height="42" rx="3" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
          <rect x="-156" y="18" width="60" height="34" rx="2" fill="color-mix(in srgb,var(--working) 22%,#ffffff1e)"/>
          <text x="-150" y="32" font-family="var(--mono)" font-size="6.2" fill="var(--working)" font-weight="700">TASK Q</text>
          <g fill="#ffffff" opacity="0.8">
            <rect x="-154" y="38" width="54" height="2.4" rx="1"/>
            <rect x="-154" y="44" width="42" height="2.4" rx="1" opacity="0.65"/>
          </g>
          <circle cx="-102" cy="28" r="2" fill="var(--working)"/>
          <circle cx="-102" cy="40" r="2" fill="var(--done)" opacity="0.85"/>
        </g>
        <g>
          <rect x="-82" y="2" width="72" height="54" rx="4" fill="#0f1522" stroke="color-mix(in srgb,var(--orchestrator) 60%,#0f1522)" stroke-width="1"/>
          <rect x="-78" y="6" width="64" height="46" rx="2.5" fill="color-mix(in srgb,var(--orchestrator) 28%,#ffffff24)"/>
          <g stroke="var(--orchestrator)" stroke-width="0.9" fill="none" opacity="0.9">
            <circle cx="-46" cy="22" r="6"/>
            <path d="M-46 16 L-46 28 M-52 22 L-40 22" opacity="0.7"/>
            <path d="M-72 38 L-60 38 L-56 44 L-48 34 L-42 44 L-36 38 L-22 38"/>
          </g>
          <g fill="#ffffff" opacity="0.82">
            <rect x="-74" y="46" width="56" height="2.4" rx="1.2"/>
            <rect x="-74" y="50" width="42" height="2.4" rx="1.2" opacity="0.6"/>
          </g>
        </g>
        <g>
          <rect x="2" y="14" width="68" height="42" rx="3" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
          <rect x="6" y="18" width="60" height="34" rx="2" fill="color-mix(in srgb,var(--reviewing) 22%,#ffffff1e)"/>
          <text x="10" y="32" font-family="var(--mono)" font-size="6.2" fill="var(--reviewing)" font-weight="700">REVIEWS</text>
          <g fill="#ffffff" opacity="0.82">
            <rect x="10" y="38" width="50" height="2.4" rx="1"/>
            <rect x="10" y="44" width="38" height="2.4" rx="1" opacity="0.65"/>
          </g>
          <circle cx="62" cy="28" r="2" fill="var(--reviewing)"/>
        </g>
        <g>
          <rect x="80" y="14" width="78" height="42" rx="3" fill="#0f1522" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
          <rect x="84" y="18" width="70" height="34" rx="2" fill="color-mix(in srgb,var(--waiting-human) 22%,#ffffff20)"/>
          <text x="88" y="32" font-family="var(--mono)" font-size="6.2" fill="var(--waiting-human)" font-weight="700">WAIT HUMAN</text>
          <g fill="#ffffff" opacity="0.82">
            <rect x="88" y="38" width="48" height="2.4" rx="1"/>
            <rect x="88" y="44" width="34" height="2.4" rx="1" opacity="0.65"/>
          </g>
          <g transform="translate(138 28)">
            <path d="M-4 8 V-4 Q-4 -6 -2 -6 Q0 -6 0 -4 V-1 M0 -6 Q2 -6 2 -4 V-1 M2 -6 Q4 -6 4 -4 V1 M4 -2 Q5 -3 5 -2 L5 7 Q5 9 2 10 L-2 10 Q-3 9 -4 8 Z" fill="none" stroke="var(--waiting-human)" stroke-width="1"/>
          </g>
        </g>
      </g>
      <g class="hub-connection-paths" fill="none" stroke="color-mix(in srgb,var(--orchestrator) 28%,transparent)" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.85">
        <path d="M800 680 Q600 540 300 340"/>
        <path d="M800 680 Q620 600 300 560"/>
        <path d="M800 680 Q960 600 1320 480"/>
        <path d="M800 680 Q680 780 400 780"/>
        <path d="M800 680 Q1020 780 1300 780"/>
      </g>
    </g>`
  }

  function knowledgeZone() {
    return `<g class="zone zone-knowledge" data-zone="knowledge">
      <path d="M80 700 L520 700 L520 870 L80 870 Z" fill="color-mix(in srgb,var(--panel) 85%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="1.2"/>
      ${zoneLabel('KNOWLEDGE', '文档角', 'Knowledge Corner', 100, 712)}
      <g class="wiki-screen" transform="translate(120 740)">
        <rect x="0" y="0" width="100" height="70" rx="4" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>
        <rect x="6" y="6" width="88" height="6" rx="2" fill="color-mix(in srgb,var(--role-docs) 22%,transparent)"/>
        <g fill="rgba(0,0,0,0.55)" opacity="0.7">
          <rect x="8" y="20" width="80" height="3" rx="1.2"/>
          <rect x="8" y="27" width="70" height="3" rx="1.2" opacity="0.85"/>
          <rect x="8" y="34" width="84" height="3" rx="1.2" opacity="0.75"/>
          <rect x="8" y="41" width="64" height="3" rx="1.2" opacity="0.65"/>
          <rect x="8" y="48" width="78" height="3" rx="1.2" opacity="0.7"/>
          <rect x="8" y="58" width="30" height="4" rx="2" fill="var(--role-docs)" opacity="0.65"/>
        </g>
      </g>
      <g class="book-stack" transform="translate(260 770)">
        <rect x="0" y="0" width="80" height="10" rx="1.6" fill="var(--role-product)" opacity="0.65"/>
        <rect x="4" y="10" width="72" height="10" rx="1.6" fill="var(--role-architect)" opacity="0.7"/>
        <rect x="2" y="20" width="76" height="10" rx="1.6" fill="var(--role-frontend)" opacity="0.65"/>
        <rect x="6" y="30" width="70" height="10" rx="1.6" fill="var(--role-backend)" opacity="0.7"/>
        <rect x="0" y="40" width="82" height="10" rx="1.6" fill="var(--role-qa)" opacity="0.62"/>
        <rect x="4" y="50" width="74" height="10" rx="1.6" fill="var(--role-reviewer)" opacity="0.68"/>
      </g>
      <g class="doc-panel" transform="translate(380 740)">
        <rect x="0" y="0" width="100" height="70" rx="4" fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.08)" stroke-width="0.8"/>
        <g stroke="var(--role-docs)" stroke-width="0.7" fill="none" opacity="0.85">
          <rect x="12" y="14" width="30" height="18"/>
          <rect x="48" y="14" width="38" height="18"/>
          <path d="M14 20 h26 M14 24 h22 M50 20 h30 M50 24 h24"/>
          <circle cx="38" cy="48" r="6"/>
          <path d="M16 58 L50 58 L56 64 L80 64 L86 58"/>
        </g>
      </g>
    </g>`
  }

  function humanAreaZone(active) {
    const op = active ? '1' : '0.28'
    const glow = active ? 'color-mix(in srgb,var(--waiting-human) 24%,color-mix(in srgb,var(--panel) 80%,transparent))' : 'color-mix(in srgb,var(--panel) 55%,transparent)'
    const vis = active ? '' : 'display:none;'
    return `<g class="zone zone-human-area" data-zone="human-area" data-active="${active ? 'true' : 'false'}" opacity="${op}" style="${active ? '' : 'transition:opacity var(--dur-slow) var(--ease);'}">
      <path d="M1080 700 L1520 700 L1520 870 L1080 870 Z" fill="${glow}" stroke="${active ? 'color-mix(in srgb,var(--waiting-human) 55%,rgba(0,0,0,0.1))' : 'rgba(0,0,0,0.06)'}" stroke-width="${active ? '1.6' : '1'}" stroke-dasharray="${active ? '' : '4 4'}"/>
      ${zoneLabel('HUMAN AREA', '人类区', 'Human Action Zone', 1100, 712)}
      <g class="human-request-card" transform="translate(1150 750)" style="${vis}">
        <rect x="0" y="0" width="280" height="86" rx="8" fill="color-mix(in srgb,var(--waiting-human) 16%,var(--panel))" stroke="var(--waiting-human)" stroke-width="1.6"/>
        <g transform="translate(14 14)">
          <path d="M0 4 V-6 Q0 -8 2 -8 Q4 -8 4 -6 V-3 M4 -8 Q6 -8 6 -6 V0 M6 -4 Q7 -5 7 -4 L7 9 Q7 11 4 12 L0 12 Q-1 11 -1 9 Z" fill="none" stroke="var(--waiting-human)" stroke-width="1.4"/>
          <text x="18" y="2" font-size="12" font-weight="700" fill="var(--text)" style="font-family:var(--sans),system-ui;">需要人类行动（必需）</text>
          <text x="18" y="18" font-size="10" fill="var(--text-muted)" style="font-family:var(--sans),system-ui;">产品经理 · 李产品 · 已等待 14 分</text>
          <rect x="0" y="28" width="252" height="28" rx="4" fill="var(--panel)" stroke="var(--line)"/>
          <text x="8" y="46" font-size="10" fill="var(--text)" style="font-family:var(--sans),system-ui;">【DEMO】确认设计规格 §5.1 颜色 token 规格对比表</text>
          <rect x="0" y="62" width="70" height="12" rx="3" fill="var(--waiting-human)" style="cursor:pointer;">
            <text x="35" y="71" font-size="9" font-weight="700" text-anchor="middle" fill="#fff" style="font-family:var(--sans),system-ui;">立即处理 →</text>
          </rect>
          <rect x="78" y="62" width="56" height="12" rx="3" fill="var(--panel-2)" stroke="var(--line)" style="cursor:pointer;">
            <text x="106" y="71" font-size="9" fill="var(--text-muted)" text-anchor="middle" style="font-family:var(--sans),system-ui;">稍后</text>
          </rect>
        </g>
      </g>
      <g class="human-seat-indicator" transform="translate(1450 770)" style="${vis}">
        <circle cx="0" cy="0" r="22" fill="none" stroke="var(--waiting-human)" stroke-width="2" stroke-dasharray="4 3" class="reduced-motion-hidden" opacity="0.78"/>
        <circle cx="0" cy="0" r="14" fill="color-mix(in srgb,var(--waiting-human) 18%,transparent)"/>
        <text x="0" y="4" font-size="10" text-anchor="middle" fill="var(--waiting-human)" font-weight="800" style="font-family:var(--sans),system-ui;">HUMAN</text>
      </g>
      <g class="helix-human-pulse-line" ${active ? '' : 'style="display:none;"'} fill="none" stroke="var(--waiting-human)" stroke-width="1.8" stroke-dasharray="6 4" opacity="0.85">
        <path d="M800 700 Q1080 730 1300 760" class="reduced-motion-hidden"/>
      </g>
    </g>`
  }

  function floorBackdropSVG() {
    return `<svg class="office-floor-v2" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" role="img" aria-label="2.5D 办公楼层平面图：6 区域连续空间" style="position:relative;width:100%;height:100%;display:block;">
      <defs>
        <pattern id="iso-grid-v2" width="56" height="32" patternUnits="userSpaceOnUse" patternTransform="skewX(-18)">
          <path d="M 56 0 L 0 0 0 32" fill="none" stroke="color-mix(in srgb, var(--canvas-grid) 60%, transparent)" stroke-width="0.7" opacity="0.6"/>
        </pattern>
        <linearGradient id="floor-vignette-v2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--canvas-floor)"/>
          <stop offset="100%" stop-color="color-mix(in srgb, var(--canvas-floor) 92%, var(--panel-2))"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1600" height="900" fill="url(#floor-vignette-v2)"/>
      <rect x="0" y="0" width="1600" height="900" fill="url(#iso-grid-v2)"/>
      <g class="walkways" fill="none" stroke="color-mix(in srgb, var(--line) 70%, transparent)" stroke-width="1.4" opacity="0.45">
        <path d="M60 480 L1540 480"/>
        <path d="M520 80 L520 860"/>
        <path d="M1080 320 L1080 860"/>
      </g>
    </svg>`
  }

  function taskCapsuleSVG(task, x, y) {
    const St = S?.STATES
    const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[task.status] || 'IDLE'
    const color = St ? `var(--${St[stateKey].key})` : 'var(--accent)'
    return `<g class="task-capsule task-${task.id}" data-task="${task.id}" data-role="${task.role || ''}" transform="translate(${x} ${y})" style="cursor:pointer;">
      <rect x="0" y="0" width="160" height="34" rx="8" fill="var(--panel)" stroke="var(--line)" stroke-width="1"/>
      <rect x="0" y="0" width="4" height="34" rx="2" fill="${color}"/>
      <text x="12" y="15" font-family="var(--mono)" font-size="8" fill="var(--text-muted)" font-weight="700">${esc(task.id)}</text>
      <text x="12" y="27" font-size="8.5" fill="var(--text)" style="font-family:var(--sans),system-ui;font-weight:600;">${esc(String(task.title).slice(0, 22))}</text>
      <g transform="translate(140 17)" fill="${color}">
        ${S?.stateGlyphSvg(stateKey, 11) || ''}
      </g>
    </g>`
  }

  function buildDeskSVG(roleId, cx, cy) {
    return `<g class="desk desk-${roleId}" data-role="${roleId}" style="cursor:pointer;">
      <ellipse cx="${cx}" cy="${cy + 60}" rx="42" ry="8" fill="rgba(0,0,0,0.18)" opacity="0.7"/>
      <rect x="${cx - 52}" y="${cy + 14}" width="104" height="44" rx="8" fill="color-mix(in srgb,var(--panel) 94%,transparent)" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
      <rect x="${cx - 50}" y="${cy + 12}" width="100" height="8" rx="4" fill="color-mix(in srgb,var(--panel-2) 90%,transparent)" stroke="rgba(0,0,0,0.08)" stroke-width="0.8"/>
    </g>`
  }

  function buildChairSVG(roleId, cx, cy, angle) {
    const tilt = (angle || 0) * 0.08
    return `<g class="chair chair-${roleId}" transform="translate(${cx} ${cy + 66}) rotate(${tilt || 0})">
      <rect x="-14" y="-18" width="28" height="22" rx="5" fill="rgba(40,44,56,0.85)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>
      <rect x="-18" y="-6" width="36" height="6" rx="3" fill="rgba(58,62,78,0.9)" stroke="rgba(0,0,0,0.22)" stroke-width="0.7"/>
      <rect x="-2" y="0" width="4" height="14" rx="1.6" fill="rgba(36,40,52,0.92)"/>
      <path d="M-10 14 L10 14 L12 16 L-12 16 Z" fill="rgba(32,36,48,0.9)" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>
    </g>`
  }

  /** Mount 6-zone 2.5D office onto `mount`. */
  function attach(mount, opts = {}) {
    if (!mount) throw new Error('VAOCoreOfficeV2.attach: mount required')
    mount.classList.add('v2-canvas', 'v2-canvas-spatial')
    const mode = modeOf(opts)
    const useFixtures = mode === 'demo'
    const snapshot = opts.snapshot || null

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
      figureMounts[roleId] = CV2
        ? CV2.renderSVG(roleId, { state, kind, memberName, model, angle: pos.angle })
        : `<text x="${pos.cx}" y="${pos.cy}" font-size="10" fill="var(--text-muted)">${roleId}</text>`
    }

    const taskCapsules = []
    ;['frontend', 'backend', 'qa', 'reviewer', 'architect'].forEach((rid, i) => {
      const list = roleTasks[rid] || []
      const pos = ZONE_POSITIONS[rid]
      if (!pos || !list.length) return
      taskCapsules.push(taskCapsuleSVG(list[0], pos.cx - 80, pos.cy - (rid === 'qa' || rid === 'reviewer' ? 46 : 78)))
    })

    const overlayHTML = `
      ${taskCapsules.join('')}
      ${tasks.filter(t => t.role === 'docs').slice(0,1).map((t, i) => taskCapsuleSVG(t, 300, 704 + i * 40)).join('')}
    `

    mount.innerHTML = `
      ${floorBackdropSVG()}
      <div class="office-scene-wrap" style="position:absolute;inset:0;display:grid;place-items:stretch;overflow:hidden;">
        <svg class="scene-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" role="presentation" style="position:relative;width:100%;height:100%;">
          ${planningZone()}
          ${engineeringZone()}
          ${qualityZone()}
          ${knowledgeZone()}
          ${helixHubZone()}
          ${humanAreaZone(humanActive)}
          <g class="furniture-layer">
            ${['product','architect','frontend','backend','qa','reviewer','docs'].map((rid) => {
              const p = ZONE_POSITIONS[rid]
              return buildDeskSVG(rid, p.cx, p.cy) + buildChairSVG(rid, p.cx, p.cy, p.angle)
            }).join('')}
          </g>
          <g class="characters-layer" style="pointer-events:auto;">
            ${Object.entries(figureMounts).filter(([rid]) => rid !== 'helix').map(([rid, svgStr]) => {
              const p = ZONE_POSITIONS[rid]
              return `<g class="char-anchor char-${rid}" data-role="${rid}" transform="translate(${p.cx - 24} ${p.cy - 10})" style="cursor:pointer;">${svgStr}</g>`
            }).join('')}
            ${(figureMounts.helix ? `<g class="char-anchor char-helix" data-role="helix" transform="translate(${ZONE_POSITIONS.helix.cx - 30} ${ZONE_POSITIONS.helix.cy - 90})" style="cursor:pointer;">${figureMounts.helix}</g>` : '')}
          </g>
          <g class="capsules-layer" style="pointer-events:auto;">
            ${overlayHTML}
          </g>
        </svg>
      </div>
      <style>
        .v2-canvas-spatial{background:var(--canvas-floor);min-height:100%;position:relative;contain:layout paint;}
        .v2-canvas-spatial .scene-svg{aspect-ratio:16/9;max-height:calc(100vh - 120px);}
        @media (max-width: 1280px){
          .v2-canvas-spatial .scene-svg{max-height:calc(100vh - 110px);}
        }
        @media (max-width: 1024px){
          .v2-canvas-spatial{overflow:auto;}
          .v2-canvas-spatial .scene-svg{min-width:1024px;width:1024px;max-height:none;height:auto;aspect-ratio:16/9;}
        }
        @media (max-width: 640px){
          .v2-canvas-spatial .scene-svg{min-width:760px;width:760px;}
        }
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
    safeForEach(safeQueryAll(mount, '.desk'), (d) => {
      if (d && typeof d.addEventListener === 'function') d.addEventListener('click', (e) => { try { e.stopPropagation && e.stopPropagation() } catch (_) {} fire('vao-v2:workstation-clicked', { roleId: d.dataset?.role, el: d }) })
    })
    safeForEach(safeQueryAll(mount, '.task-capsule'), (tc) => {
      if (tc && typeof tc.addEventListener === 'function') tc.addEventListener('click', (e) => { try { e.stopPropagation && e.stopPropagation() } catch (_) {} fire('vao-v2:task-clicked', { taskId: tc.dataset?.task, el: tc }) })
    })

    return {
      mode,
      mount,
      update(nextSnapshot) { attach(mount, { snapshot: nextSnapshot, mode }) },
      setRoleState(roleId, stateId) {
        if (!CV2) return
        const p = ZONE_POSITIONS[roleId] || {}
        const kind = seatKinds[roleId] || (roleId === 'helix' ? 'system' : (['product','qa','reviewer'].includes(roleId) ? 'human' : 'ai'))
        const newSVG = CV2.renderSVG(roleId, { state: stateId, kind, memberName: seatMembers[roleId], model: seatModels[roleId], angle: p.angle || 0 })
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
          try { zone.setAttribute('opacity', on ? '1' : '0.28') } catch (_) {}
          safeForEach(safeQueryAll(zone, '.human-request-card, .human-seat-indicator, .helix-human-pulse-line'), (n) => {
            try { n.style.display = on ? '' : 'none' } catch (_) {}
          })
          return
        }
        try {
          const html = mount.innerHTML || ''
          // Replace entire G zone tag attributes and style of children
          let replaced = html
          const zoneRe = /(<g\s+[^>]*class="zone\s+zone-human-area"[^>]*>)/i
          replaced = replaced.replace(zoneRe, (m, openTag) => {
            let t = openTag.replace(/data-active="[^"]*"/i, '')
            t = t.replace(/opacity="[^"]*"/i, '')
            t = t.slice(0, -1) + ` data-active="${val}" opacity="${on ? '1' : '0.28'}">`
            return t
          })
          if (on) {
            replaced = replaced.replace(/style="display\s*:\s*none[^"]*"/gi, (m) => {
              // Only flip nodes inside human area scope — hard to regex; rely on the marker being there
              return m.includes('human-') || m.includes('helix-human-') ? 'style=""' : m
            })
            // Just remove display:none when on=true on marker classes
            replaced = replaced.replace(/(<g\s+[^>]*class="[^"]*(?:human-request-card|human-seat-indicator|helix-human-pulse-line)[^"]*"[^>]*\s)style="display\s*:\s*none[^"]*"/gi, '$1style=""')
          }
          if (replaced !== html) mount.innerHTML = replaced
        } catch (_) {}
      },
      pulseHelixTo(roleId) {
        const paths = safeQueryAll(mount, '.hub-connection-paths path')
        if (!paths || !paths.length || !S) return
        const map = { product: 0, architect: 0, frontend: 1, backend: 1, qa: 2, reviewer: 2, docs: 3 }
        const idx = map[roleId]
        const target = typeof idx === 'number' ? (paths[idx] || paths[0]) : paths[0]
        if (!target) return
        try { target.setAttribute('stroke-width', '3') } catch (_) {}
        try { target.setAttribute('stroke', 'var(--orchestrator)') } catch (_) {}
        try { target.classList && target.classList.add('reduced-motion-hidden') } catch (_) {}
        try { setTimeout(() => {
          try { target.setAttribute('stroke-width', '1.2') } catch (_) {}
          try { target.setAttribute('stroke', 'color-mix(in srgb,var(--orchestrator) 28%,transparent)') } catch (_) {}
        }, 700) } catch (_) {}
      },
      destroy() {
        try { mount.innerHTML = '' } catch (_) {}
        try { mount.classList && mount.classList.remove('v2-canvas', 'v2-canvas-spatial') } catch (_) {}
      },
    }
  }

  const api = Object.freeze({
    attach,
    ZONE_POSITIONS,
    DEMO_SEAT_STATE,
    DEMO_SEAT_KIND,
    DEMO_SEAT_MEMBER,
    DEMO_SEAT_MODEL,
    DEMO_TASKS,
  })
  globalThis.VAOCoreOfficeV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
