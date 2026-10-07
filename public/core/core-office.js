/* Interactive Office A2: S1 continuous isometric 2.5D office floor (no card grid).
 *
 * §1 REMOVE CARD-GRID: 7 bordered workstation shells → one continuous material floor.
 * §2 FLOOR LAYOUT (6 zones, spatial not bordered):
 *   NW PLANNING STUDIO — Product (tablet/sticky notes) + Architect (diagram board / topology)
 *   NE ENGINEERING POD  — Frontend (dual screens: browser + canvas) + Backend (terminal + service map)
 *   SW QUALITY STUDIO   — QA (device matrix / test checks) + Reviewer (diff wall / before-after)
 *   SE KNOWLEDGE CORNER — Documentation (wiki search / document stack) + HUMAN AREA (optional)
 *   CENTER HELIX HUB    — semi-circular command desk, 2-3 monitors, graphite/silver operator, slightly elevated
 *
 * §4 ROLE WORKSTATIONS: workstation distinguishes role, not text labels only.
 * §5 CHARACTER MOTION SYSTEM: CSS-only animation classes for 8 canonical states.
 * §6 EVENT MAPPING: state transitions → visual animation (e.g., WAITING_HUMAN → amber path).
 * §8 CLICK → INSPECTORS: seat/task/Helix dispatch vao:open-*-inspector events (shell shows popups).
 * §11 TASK CAPSULES: per-role small capsule near desk, non-empty → activity strip footer.
 * §12 AMBIENCE: monitor LEDs, slow data lines, ambient glow.
 * §14 RESPONSIVE: 1440 full office, 1280 no collision, ≤1024 nav collapse + drawer, mobile list slices.
 * §15 PERFORMANCE: CSS transform/opacity only; document.hidden → pause ambient animation.
 */
;(function () {
  'use strict'

  const C = globalThis.VAOCoreCharacters
  const S = globalThis.VAOCoreStates
  const ROLES = C ? C.ROLES : []

  // ---------- Demo / fake fixtures (only mode=demo) ----------
  const DEMO_SEAT_STATES = Object.freeze({
    helix: 'THINKING',
    product: 'IDLE', architect: 'THINKING',
    frontend: 'WORKING', backend: 'WORKING',
    qa: 'IDLE', reviewer: 'REVIEWING',
    docs: 'IDLE',
  })
  const DEMO_SEAT_KIND = Object.freeze({
    helix: 'system',
    product: 'human', architect: 'ai', frontend: 'ai', backend: 'ai',
    qa: 'human', reviewer: 'human', docs: 'ai',
  })
  const DEMO_SEAT_MEMBER = Object.freeze({
    product: '李产品', architect: 'Codex (演示)', frontend: 'Claude (演示)',
    backend: 'DeepSeek (演示)', qa: '王测试', reviewer: '张审查', docs: 'Gemini (演示)',
  })
  const DEMO_SEAT_MODEL = Object.freeze({
    architect: 'demo', frontend: 'demo', backend: 'demo', docs: 'demo',
  })
  const DEMO_PORT_COUNTS = Object.freeze({
    Requirements: 3, Tasks: 8, Executions: 5, Reviews: 2, Evidence: 11, 'Human Actions': 1,
  })
  const DEMO_TASKS = Object.freeze([
    {
      id: 'DEMO-101', title: '【DEMO】Core Shell 布局脚手架', status: 'done', difficulty: '易', kind: '开发',
      role: 'frontend', who: '前端工程师', whoId: 'frontend',
      evidence: [{ kind: 'build', state: 'pass', sha: 'a31f' }, { kind: 'test', state: 'pass', sha: 'a31f' }],
      deps: [],
    },
    {
      id: 'DEMO-104', title: '【DEMO】Helix 6 端口可视数据接入', status: 'running', difficulty: '中', kind: '开发',
      role: 'backend', who: '后端工程师', whoId: 'backend',
      evidence: [{ kind: 'build', state: 'pass' }, { kind: 'test', state: 'missing' }],
      deps: ['DEMO-101'],
    },
    {
      id: 'DEMO-112', title: '【DEMO】等待人类：确认设计规格 §5.1', status: 'pending', difficulty: '易', kind: 'human',
      role: 'product', who: '产品经理', whoId: 'product', sinceMs: Date.now() - 14 * 60 * 1000, required: true,
      evidence: [{ kind: 'human', state: 'missing' }],
      deps: [],
    },
  ])
  const DEMO_EDGES = Object.freeze([['DEMO-101', 'DEMO-104', 'ready']])

  // ---------- Utilities ----------
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }
  function officeMode(opts = {}) {
    const raw = String(opts.mode || 'live').toLowerCase()
    return raw === 'fake' || raw === 'demo' ? 'demo' : 'live'
  }
  function stateColor(state) {
    const St = S?.STATES
    if (!St) return 'var(--accent)'
    const key = (St[state] && St[state].key) || state?.toLowerCase?.() || 'idle'
    return `var(--${key})`
  }
  function seatState(snapshot, rid, useFixtures) {
    const fromSnap = snapshot?.seatStates?.[rid]
    if (fromSnap) return fromSnap
    return useFixtures ? (DEMO_SEAT_STATES[rid] || 'IDLE') : (rid === 'helix' ? 'IDLE' : 'OFFLINE')
  }
  function seatKind(snapshot, rid, useFixtures) {
    return snapshot?.seatKinds?.[rid] || (useFixtures ? DEMO_SEAT_KIND[rid] : (rid === 'product' || rid === 'qa' || rid === 'reviewer' ? 'human' : rid === 'helix' ? 'system' : 'ai'))
  }
  function seatMember(snapshot, rid, useFixtures) {
    const v = snapshot?.seatMembers?.[rid]
    if (v) return v
    return useFixtures ? DEMO_SEAT_MEMBER[rid] : undefined
  }
  function seatModel(snapshot, rid, useFixtures) {
    const v = snapshot?.seatModels?.[rid]
    if (v) return v
    return useFixtures ? DEMO_SEAT_MODEL[rid] : undefined
  }

  // ---------- §11 Task chip (small capsule next to workstation) ----------
  function taskCapsule(task) {
    if (!task) return ''
    const St = S?.STATES
    const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[task.status] || 'IDLE'
    const color = stateColor(stateKey)
    const mins = task.sinceMs ? Math.max(0, Math.round((Date.now() - task.sinceMs) / 60000)) : null
    return `<article class="task-capsule task-capsule-${task.role}" data-task="${task.id}" data-role="${task.role}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:10px;background:var(--panel);box-shadow:var(--shadow-1);border:1px solid var(--line);cursor:pointer;min-width:160px;max-width:230px;">
      <span style="width:3px;height:18px;border-radius:999px;background:${color};display:inline-block;flex:0 0 3px;"></span>
      <div style="display:grid;gap:1px;min-width:0;">
        <div style="display:flex;align-items:baseline;gap:4px;min-width:0;">
          <span style="font-size:9.5px;font-family:var(--mono);color:var(--text-muted);font-weight:700;flex:0 0 auto;">${esc(task.id)}</span>
          <span style="font-size:11.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">${esc(task.title)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          ${S?.stateGlyphSvg?.(stateKey, 10) || ''}
          <span style="font-size:10px;line-height:1;color:${color};font-weight:600;">${St?.[stateKey]?.zh || task.status}</span>
          ${mins != null ? `<span style="font-size:10px;color:var(--text-muted);">· ${mins}m</span>` : ''}
        </div>
      </div>
    </article>`
  }

  // ---------- §4 ROLE-SPECIFIC WORKSTATION INTERIORS (material-only, NO bordered cards!) ----------
  // Product Manager: tablet requirement wall with sticky notes & pinup roadmap
  function productWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-product" data-role="product" data-state="${opts.state}" aria-label="产品经理工作站" style="position:relative;width:100%;height:100%;">
        <!-- Pinup felt board with sticky notes on back wall -->
        <div class="pinup-board" aria-hidden="true" style="position:absolute;left:6%;right:6%;top:4%;height:44%;background:var(--felt);border-radius:8px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.14), inset 0 -3px 14px rgba(0,0,0,0.15);">
          <div style="position:absolute;left:8%;top:16%;width:32px;height:28px;background:#F9C74F;border-radius:2px;transform:rotate(-4deg);box-shadow:0 2px 4px rgba(0,0,0,.2);"></div>
          <div style="position:absolute;left:36%;top:22%;width:30px;height:26px;background:#F3722C;border-radius:2px;transform:rotate(3deg);box-shadow:0 2px 4px rgba(0,0,0,.2);"></div>
          <div style="position:absolute;right:10%;top:18%;width:34px;height:30px;background:#577590;border-radius:2px;transform:rotate(-2deg);box-shadow:0 2px 4px rgba(0,0,0,.2);"></div>
          <div style="position:absolute;left:20%;bottom:14%;width:40px;height:3px;background:rgba(0,0,0,.14);border-radius:2px;"></div>
          <div style="position:absolute;right:22%;bottom:22%;width:40px;height:3px;background:rgba(0,0,0,.14);border-radius:2px;"></div>
        </div>
        <!-- Desk surface: tablet on stand -->
        <div class="desk-surf" aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:40%;background:linear-gradient(180deg,var(--canvas-desk),color-mix(in srgb, var(--canvas-desk) 82%, #000 18%));border-top:1px solid rgba(0,0,0,.18);border-radius:0 0 var(--radius-desk) var(--radius-desk);"></div>
        <div class="desk-tablet" aria-hidden="true" style="position:absolute;left:50%;bottom:24%;transform:translate(-50%,0);width:70px;height:50px;background:linear-gradient(180deg,#111620,#1A202C);border-radius:8px;box-shadow:0 6px 14px rgba(0,0,0,.35);border:1.5px solid #2A3140;">
          <div style="position:absolute;left:8%;right:8%;top:14%;bottom:18%;background:linear-gradient(180deg,color-mix(in srgb,var(--orchestrator) 30%,var(--panel-2)),color-mix(in srgb,var(--orchestrator) 12%,var(--panel-2)));border-radius:3px;">
            <div style="position:absolute;left:8%;top:22%;width:38%;height:3px;background:rgba(255,255,255,.35);border-radius:2px;"></div>
            <div style="position:absolute;left:8%;top:44%;width:66%;height:2.5px;background:rgba(255,255,255,.22);border-radius:2px;"></div>
            <div style="position:absolute;left:8%;top:58%;width:48%;height:2.5px;background:rgba(255,255,255,.22);border-radius:2px;"></div>
            <div style="position:absolute;left:8%;top:72%;width:30%;height:7px;border-radius:3px;background:color-mix(in srgb,var(--done) 60%,var(--panel-2));"></div>
          </div>
        </div>
        <!-- LED: monitor power -->
        <div class="led led-led-blink led-blink" style="position:absolute;left:18%;bottom:8%;width:6px;height:6px;border-radius:999px;background:var(--done);box-shadow:0 0 6px var(--done);"></div>
      </div>`
  }

  // Architect: large architecture diagram screen + blueprint overlay
  function architectWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-architect" data-role="architect" data-state="${opts.state}" aria-label="架构师工作站" style="position:relative;width:100%;height:100%;">
        <!-- Big architecture display wall -->
        <div class="arch-screen" aria-hidden="true" style="position:absolute;left:8%;right:8%;top:6%;height:52%;background:#0B0F16;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.04);overflow:hidden;">
          <div aria-hidden="true" style="position:absolute;inset:8% 6%;">
            <!-- Diagram nodes (4 boxes + arrows) -->
            <div style="position:absolute;left:4%;top:18%;width:30%;height:24%;background:color-mix(in srgb,var(--role-frontend) 26%,#0F1420);border-radius:5px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--role-frontend) 50%,transparent);"></div>
            <div style="position:absolute;right:4%;top:18%;width:30%;height:24%;background:color-mix(in srgb,var(--role-backend) 26%,#0F1420);border-radius:5px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--role-backend) 50%,transparent);"></div>
            <div style="position:absolute;left:34%;top:58%;width:32%;height:26%;background:color-mix(in srgb,var(--orchestrator) 30%,#0F1420);border-radius:5px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--orchestrator) 55%,transparent);"></div>
            <!-- Connecting lines -->
            <svg style="position:absolute;inset:0;width:100%;height:100%;" aria-hidden="true"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="color-mix(in srgb, var(--orchestrator) 80%, white)"/></marker></defs>
              <path d="M 34% 30% L 46% 62%" stroke="color-mix(in srgb, var(--orchestrator) 60%, transparent)" stroke-width="1.4" fill="none" marker-end="url(#ah)"/>
              <path d="M 66% 30% L 54% 62%" stroke="color-mix(in srgb, var(--orchestrator) 60%, transparent)" stroke-width="1.4" fill="none" marker-end="url(#ah)"/>
            </svg>
          </div>
          <!-- Screen bezel LED -->
          <div class="led led-blink" style="position:absolute;right:10px;bottom:6px;width:5px;height:5px;border-radius:999px;background:var(--thinking);box-shadow:0 0 6px var(--thinking);"></div>
        </div>
        <!-- Blueprint drafting mat -->
        <div aria-hidden="true" style="position:absolute;left:12%;right:12%;bottom:6%;height:26%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 2px,transparent 2px 10px),color-mix(in srgb,var(--orchestrator) 10%,transparent);border-radius:6px;border:1px dashed color-mix(in srgb,var(--orchestrator) 40%,transparent);"></div>
        <div class="desk-surf" aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:8%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--canvas-desk) 88%,#000 12%));"></div>
      </div>`
  }

  // Frontend: dual display (browser window + component canvas devtools)
  function frontendWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-frontend" data-role="frontend" data-state="${opts.state}" aria-label="前端工程师工作站" style="position:relative;width:100%;height:100%;">
        <!-- Dual monitor bank -->
        <div aria-hidden="true" style="position:absolute;left:6%;right:6%;top:6%;display:grid;grid-template-columns:1fr 1fr;gap:6px;height:56%;">
          <!-- Left: Browser window -->
          <div style="position:relative;background:#0E141D;border-radius:8px 8px 4px 4px;box-shadow:0 5px 14px rgba(0,0,0,.35);overflow:hidden;border-top:1px solid rgba(255,255,255,.04);">
            <div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:#1A202B;border-bottom:1px solid rgba(255,255,255,.06);">
              <div style="width:7px;height:7px;border-radius:999px;background:#FF5F57;"></div>
              <div style="width:7px;height:7px;border-radius:999px;background:#FEBC2E;"></div>
              <div style="width:7px;height:7px;border-radius:999px;background:#28C840;"></div>
              <div style="flex:1;margin-left:4px;height:11px;background:#232A36;border-radius:999px;"></div>
            </div>
            <div style="position:absolute;inset:28px 8px 8px;">
              <div style="height:14px;background:color-mix(in srgb,var(--role-frontend) 35%,var(--panel-2));border-radius:4px;"></div>
              <div style="height:70%;margin-top:6px;background:color-mix(in srgb,var(--orchestrator) 14%,var(--panel-2));border-radius:4px;position:relative;">
                <div style="position:absolute;left:12%;top:22%;width:40%;height:34%;border-radius:4px;background:var(--panel);box-shadow:0 1px 2px rgba(0,0,0,.3);"></div>
                <div style="position:absolute;right:12%;top:28%;width:28%;height:24%;border-radius:4px;background:color-mix(in srgb,var(--accent) 30%,var(--panel));"></div>
              </div>
            </div>
          </div>
          <!-- Right: Component canvas / devtools -->
          <div style="position:relative;background:#0E141D;border-radius:8px 8px 4px 4px;box-shadow:0 5px 14px rgba(0,0,0,.35);overflow:hidden;border-top:1px solid rgba(255,255,255,.04);">
            <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:#1A202B;border-bottom:1px solid rgba(255,255,255,.06);">
              <div style="flex:1;height:11px;background:linear-gradient(90deg,color-mix(in srgb,var(--orchestrator) 40%,var(--panel-2)),transparent);border-radius:999px;"></div>
            </div>
            <div style="position:absolute;inset:26px 8px 8px;display:grid;grid-template-columns:1fr 1.3fr;gap:4px;">
              <div style="background:color-mix(in srgb,var(--thinking) 18%,var(--panel-2));border-radius:4px;position:relative;">
                <div style="position:absolute;inset:22% 14%;border:1.2px dashed color-mix(in srgb,var(--orchestrator) 55%,transparent);border-radius:6px;"></div>
              </div>
              <div style="background:color-mix(in srgb,var(--idle) 14%,var(--panel-2));border-radius:4px;">
                <div style="margin:8px 8px 0;height:3px;background:rgba(255,255,255,.15);border-radius:2px;"></div>
                <div style="margin:6px 8px 0;height:3px;background:rgba(255,255,255,.10);border-radius:2px;width:78%;"></div>
                <div style="margin:6px 8px 0;height:3px;background:rgba(255,255,255,.10);border-radius:2px;width:60%;"></div>
                <div style="margin:6px 8px 0;height:3px;background:rgba(255,255,255,.08);border-radius:2px;width:88%;"></div>
              </div>
            </div>
            <div class="led led-blink" style="position:absolute;right:8px;bottom:6px;width:5px;height:5px;border-radius:999px;background:var(--working);box-shadow:0 0 6px var(--working);"></div>
          </div>
        </div>
        <div class="desk-surf" aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:12%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--canvas-desk) 85%,#000 15%));"></div>
      </div>`
  }

  // Backend: terminal window + service topology radar
  function backendWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-backend" data-role="backend" data-state="${opts.state}" aria-label="后端工程师工作站" style="position:relative;width:100%;height:100%;">
        <!-- Terminal monitor -->
        <div class="term" aria-hidden="true" style="position:absolute;left:8%;right:8%;top:8%;height:58%;background:#070A0F;border-radius:9px 9px 4px 4px;box-shadow:0 5px 16px rgba(0,0,0,.45);overflow:hidden;border-top:1px solid rgba(255,255,255,.04);">
          <div style="display:flex;align-items:center;gap:4px;padding:5px 8px;background:#131821;border-bottom:1px solid rgba(255,255,255,.06);">
            <div style="width:8px;height:8px;border-radius:999px;background:#FF5F57;"></div>
            <div style="width:8px;height:8px;border-radius:999px;background:#FEBC2E;"></div>
            <div style="width:8px;height:8px;border-radius:999px;background:#28C840;"></div>
            <div style="margin-left:8px;font-size:9.5px;color:var(--text-muted);font-family:var(--mono);">zsh · /srv/app — 120×32</div>
          </div>
          <div style="position:absolute;inset:30px 10px 10px;font-family:var(--mono);font-size:9px;line-height:13px;color:var(--done);">
            <div style="color:var(--role-backend);">$ npm run start:api</div>
            <div style="color:var(--text-muted);">[info] bootstrap scope-id=8a23f1…</div>
            <div><span style="color:var(--done);">✓</span> AttachmentStore online</div>
            <div><span style="color:var(--done);">✓</span> HTTP :3791 listening</div>
            <div><span style="color:var(--thinking);">→</span> POST /niuma/v1/attachments …<span style="color:var(--done);">201</span> (48ms)</div>
            <div><span style="color:var(--working);">↻</span> runExtract: pdf → 1 pages …</div>
          </div>
          <div class="led led-blink" style="position:absolute;right:10px;bottom:7px;width:5px;height:5px;border-radius:999px;background:var(--working);box-shadow:0 0 6px var(--working);"></div>
        </div>
        <!-- Service topology node dock -->
        <div aria-hidden="true" style="position:absolute;left:12%;right:12%;bottom:6%;height:18%;border-radius:7px;background:color-mix(in srgb,var(--idle) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--idle) 30%,transparent);display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:6px;align-items:center;">
          ${[1,2,3,4,5].map(i => `<div style="border-radius:4px;height:70%;background:color-mix(in srgb,var(--role-backend) ${20 + i * 6}%,var(--panel-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--role-backend) 40%,transparent);"></div>`).join('')}
        </div>
      </div>`
  }

  // QA: device matrix (phone/tablet/laptop silhouettes + status badges)
  function qaWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-qa" data-role="qa" data-state="${opts.state}" aria-label="QA 工程师工作站" style="position:relative;width:100%;height:100%;">
        <!-- Test wall / device matrix -->
        <div aria-hidden="true" style="position:absolute;left:6%;right:6%;top:6%;height:60%;background:color-mix(in srgb,var(--panel) 50%,transparent);border-radius:10px;padding:8px;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:6px;">
          ${['phone','tablet','laptop','browser','tv','watch'].map((d, i) => {
            const color = i % 3 === 0 ? 'var(--done)' : (i % 3 === 1 ? 'var(--waiting-human)' : 'var(--done)')
            return `<div style="position:relative;background:var(--panel-2);border-radius:6px;box-shadow:inset 0 0 0 1px var(--line);">
              <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56%;height:68%;border-radius:4px;background:linear-gradient(180deg,#0D1219,#141A24);box-shadow:0 0 0 1.5px #222A37,0 3px 6px rgba(0,0,0,.3);">
                <div style="position:absolute;left:10%;right:10%;top:18%;height:46%;background:color-mix(in srgb,${color} 25%,var(--panel));"></div>
                <div style="position:absolute;right:6%;bottom:6%;width:7px;height:7px;border-radius:999px;background:${color};box-shadow:0 0 5px ${color};"></div>
              </div>
            </div>`
          }).join('')}
        </div>
        <!-- Test checklist clipboard -->
        <div aria-hidden="true" style="position:absolute;left:16%;right:16%;bottom:7%;height:16%;background:var(--panel);border-radius:5px;box-shadow:var(--shadow-1);padding:5px 7px;display:grid;grid-template-rows:repeat(3,1fr);gap:2px;">
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:var(--done);"></span><span style="flex:1;height:3px;border-radius:2px;background:rgba(120,130,150,.35);"></span></div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:var(--waiting-human);"></span><span style="flex:1;height:3px;border-radius:2px;background:rgba(120,130,150,.25);width:86%;"></span></div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:var(--done);"></span><span style="flex:1;height:3px;border-radius:2px;background:rgba(120,130,150,.35);width:70%;"></span></div>
        </div>
      </div>`
  }

  // Reviewer: before/after diff wall with gutter + red-green stripes
  function reviewerWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-reviewer" data-role="reviewer" data-state="${opts.state}" aria-label="审查员工作站" style="position:relative;width:100%;height:100%;">
        <!-- Big diff screen -->
        <div class="diff" aria-hidden="true" style="position:absolute;left:6%;right:6%;top:6%;height:62%;background:#0C1017;border-radius:9px 9px 4px 4px;box-shadow:0 5px 14px rgba(0,0,0,.4);overflow:hidden;">
          <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:#151A23;border-bottom:1px solid rgba(255,255,255,.06);">
            <div style="width:8px;height:8px;border-radius:999px;background:#FF5F57;"></div>
            <div style="width:8px;height:8px;border-radius:999px;background:#FEBC2E;"></div>
            <div style="width:8px;height:8px;border-radius:999px;background:#28C840;"></div>
            <div style="margin-left:6px;font-size:9.5px;color:var(--text-muted);font-family:var(--mono);">PR #10 · unified diff — 12 files</div>
            <div style="margin-left:auto;display:inline-flex;gap:4px;">
              <div style="padding:1px 5px;border-radius:4px;background:color-mix(in srgb,var(--blocked) 20%,transparent);color:var(--blocked);font-size:9px;font-weight:700;">-24</div>
              <div style="padding:1px 5px;border-radius:4px;background:color-mix(in srgb,var(--done) 25%,transparent);color:var(--done);font-size:9px;font-weight:700;">+48</div>
            </div>
          </div>
          <div style="position:absolute;inset:32px 10px 10px;display:grid;grid-template-columns:34px 1fr;gap:0;overflow:hidden;">
            <div style="background:#111519;border-right:1px solid rgba(255,255,255,.05);color:var(--text-muted);font-family:var(--mono);font-size:8.5px;line-height:11px;padding:4px 3px;text-align:right;">
              <div>12</div><div>13</div><div>14</div><div>15</div><div>16</div><div>17</div><div>18</div><div>19</div><div>20</div><div>21</div>
            </div>
            <div style="font-family:var(--mono);font-size:8.5px;line-height:11px;padding:4px 6px;">
              <div style="background:color-mix(in srgb,var(--blocked) 14%,transparent);color:var(--blocked);">-  const allow = status === 'ATTACHED'</div>
              <div style="background:color-mix(in srgb,var(--done) 18%,transparent);color:var(--done);">+  const owned = scopeMatch &amp;&amp; (claimable || ownerIdMatch)</div>
              <div style="background:color-mix(in srgb,var(--done) 18%,transparent);color:var(--done);">+  return owned &amp;&amp; terminal</div>
              <div>   if (row.error) return ATTACHMENT_INVALID</div>
              <div>   }</div>
              <div style="background:color-mix(in srgb,var(--done) 18%,transparent);color:var(--done);">+</div>
              <div style="background:color-mix(in srgb,var(--done) 18%,transparent);color:var(--done);">+  function validateScope(store, row) { … }</div>
            </div>
          </div>
        </div>
        <!-- Review checklist -->
        <div aria-hidden="true" style="position:absolute;left:14%;right:14%;bottom:6%;height:14%;border-radius:7px;background:var(--panel);box-shadow:var(--shadow-1);padding:6px 8px;display:flex;align-items:center;gap:8px;">
          <div style="width:18px;height:18px;border-radius:4px;background:color-mix(in srgb,var(--reviewing) 26%,var(--panel-2));display:inline-flex;align-items:center;justify-content:center;color:var(--reviewing);font-weight:900;font-size:12px;">?</div>
          <div style="flex:1;height:4px;border-radius:999px;background:rgba(120,130,150,.22);position:relative;"><div style="position:absolute;left:0;top:0;bottom:0;width:62%;border-radius:999px;background:linear-gradient(90deg,var(--reviewing),var(--thinking));"></div></div>
          <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono);">62%</div>
        </div>
      </div>`
  }

  // Documentation Specialist: knowledge stack + wiki search display
  function docsWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-docs" data-role="docs" data-state="${opts.state}" aria-label="文档专家工作站" style="position:relative;width:100%;height:100%;">
        <!-- Stack of documents (side view, fanned) -->
        <div aria-hidden="true" style="position:absolute;left:8%;bottom:8%;width:42%;height:56%;">
          <div style="position:absolute;left:0;bottom:0;width:80%;height:90%;background:#FAF6EE;border-radius:2px 6px 2px 6px;box-shadow:3px 3px 8px rgba(0,0,0,.25), inset -2px 0 0 rgba(0,0,0,.04);transform:rotate(-2.5deg);"></div>
          <div style="position:absolute;left:10%;bottom:2%;width:82%;height:94%;background:#F5F0E3;border-radius:2px 6px 2px 6px;box-shadow:3px 3px 8px rgba(0,0,0,.25), inset -2px 0 0 rgba(0,0,0,.04);transform:rotate(-1deg);"></div>
          <div style="position:absolute;left:18%;bottom:4%;width:82%;height:98%;background:#F9F2DE;border-radius:2px 6px 2px 6px;box-shadow:3px 3px 10px rgba(0,0,0,.28), inset -2px 0 0 rgba(0,0,0,.04);">
            <div style="position:absolute;left:8%;right:8%;top:12%;height:5px;background:rgba(90,70,40,.2);border-radius:3px;"></div>
            <div style="position:absolute;left:8%;right:18%;top:22%;height:3.5px;background:rgba(90,70,40,.15);border-radius:3px;"></div>
            <div style="position:absolute;left:8%;right:12%;top:30%;height:3.5px;background:rgba(90,70,40,.15);border-radius:3px;"></div>
            <div style="position:absolute;left:8%;right:24%;top:38%;height:3.5px;background:rgba(90,70,40,.15);border-radius:3px;"></div>
            <div style="position:absolute;left:8%;right:8%;bottom:12%;width:42%;height:18px;border-radius:4px;background:color-mix(in srgb,var(--role-docs) 45%,#fff);"></div>
          </div>
        </div>
        <!-- Wiki search / knowledge panel screen -->
        <div aria-hidden="true" style="position:absolute;right:8%;top:10%;width:42%;height:56%;background:#0C1017;border-radius:8px 8px 4px 4px;overflow:hidden;box-shadow:0 5px 14px rgba(0,0,0,.35);">
          <div style="padding:5px 7px;background:#151920;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:4px;">
            <div style="flex:1;height:11px;background:var(--panel-2);border-radius:999px;padding:0 6px;display:flex;align-items:center;">
              <div style="width:6px;height:6px;border-radius:999px;background:var(--text-muted);"></div>
              <div style="margin-left:5px;width:48%;height:3px;border-radius:2px;background:rgba(150,160,180,.4);"></div>
            </div>
          </div>
          <div style="position:absolute;left:6px;right:6px;top:26px;bottom:6px;">
            <div style="height:8px;border-radius:3px;background:color-mix(in srgb,var(--role-docs) 30%,var(--panel-2));"></div>
            <div style="margin-top:6px;height:3px;border-radius:2px;background:rgba(150,160,180,.2);"></div>
            <div style="margin-top:3px;height:3px;border-radius:2px;background:rgba(150,160,180,.18);width:84%;"></div>
            <div style="margin-top:10px;height:8px;border-radius:3px;background:color-mix(in srgb,var(--orchestrator) 20%,var(--panel-2));"></div>
            <div style="margin-top:6px;height:3px;border-radius:2px;background:rgba(150,160,180,.18);width:76%;"></div>
            <div style="margin-top:3px;height:3px;border-radius:2px;background:rgba(150,160,180,.18);width:58%;"></div>
            <div class="led led-blink" style="position:absolute;right:0;bottom:0;width:5px;height:5px;border-radius:999px;background:var(--idle);"></div>
          </div>
        </div>
      </div>`
  }

  // Helix Center: semi-circular command desk, 2-3 monitors, graphite/silver operator figure, elevated platform
  function helixWorkstationInterior(role, opts = {}) {
    return `
      <div class="ws-content ws-helix" data-role="helix" data-state="${opts.state}" aria-label="Helix 指挥中枢" style="position:relative;width:100%;height:100%;">
        <!-- Subtle indigo platform elevation (§3: central workstation slightly elevated) -->
        <div class="helix-platform" aria-hidden="true" style="position:absolute;left:10%;right:10%;bottom:4%;height:18%;background:radial-gradient(ellipse at 50% 50%,color-mix(in srgb,var(--helix-indigo) 24%,var(--panel-2)),color-mix(in srgb,var(--helix-violet) 10%,transparent));border-radius:50% 50% 24% 24% / 70% 70% 30% 30%;box-shadow:0 12px 36px var(--glow-helix),inset 0 1px 0 rgba(255,255,255,.05);">
          <div style="position:absolute;inset:28% 18%;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--orchestrator) 45%,transparent) 0%,transparent 70%);"></div>
        </div>
        <!-- Semi-circular command desk -->
        <div class="helix-desk" aria-hidden="true" style="position:absolute;left:14%;right:14%;bottom:16%;height:26%;background:linear-gradient(180deg,#272C36 0%,#191E27 100%);border-radius:50% 50% 18px 18px / 100% 100% 18px 18px;box-shadow:0 14px 36px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05), inset 0 -3px 0 rgba(0,0,0,.28);">
          <div style="position:absolute;inset:8% 14% 45%;background:linear-gradient(180deg,color-mix(in srgb,var(--orchestrator) 22%,rgba(255,255,255,.04)),transparent);border-radius:999px;pointer-events:none;"></div>
        </div>
        <!-- Three monitors above desk: center orchestration main, flanking system statuses -->
        <div aria-hidden="true" style="position:absolute;left:18%;right:18%;top:18%;height:28%;display:grid;grid-template-columns:0.82fr 1.2fr 0.82fr;gap:6px;align-items:end;">
          <!-- Left secondary: tasks -->
          <div style="height:78%;background:#0A0F18;border-radius:5px 5px 2px 2px;box-shadow:0 5px 14px rgba(0,0,0,.4);overflow:hidden;position:relative;border-top:1px solid rgba(255,255,255,.04);">
            <div style="position:absolute;inset:6px;">
              <div style="height:5px;background:color-mix(in srgb,var(--working) 35%,var(--panel-2));border-radius:2px;"></div>
              <div style="margin-top:4px;height:4px;background:rgba(150,160,180,.22);border-radius:2px;"></div>
              <div style="margin-top:3px;height:4px;background:rgba(150,160,180,.18);border-radius:2px;width:80%;"></div>
              <div style="margin-top:4px;height:4px;background:color-mix(in srgb,var(--done) 30%,var(--panel-2));border-radius:2px;"></div>
              <div style="margin-top:3px;height:4px;background:rgba(150,160,180,.18);border-radius:2px;width:66%;"></div>
            </div>
          </div>
          <!-- Center primary: Helix orchestration -->
          <div style="height:100%;background:#0A0F18;border-radius:6px 6px 2px 2px;box-shadow:0 7px 18px rgba(0,0,0,.48);overflow:hidden;position:relative;border-top:1px solid rgba(255,255,255,.04);">
            <div style="position:absolute;inset:0;background:
              radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--orchestrator) 38%,var(--panel-2)) 0%,transparent 70%),
              repeating-conic-gradient(from 0deg, rgba(121,102,255,.08) 0deg 6deg, transparent 6deg 18deg);
            "></div>
            <!-- Helix / DNA motif -->
            <svg viewBox="0 0 100 100" style="position:absolute;inset:10% 20%;width:60%;height:80%;" aria-hidden="true">
              <path d="M 10 10 C 90 30, 10 70, 90 90" stroke="var(--helix-indigo)" stroke-width="2" fill="none" opacity="0.9"/>
              <path d="M 90 10 C 10 30, 90 70, 10 90" stroke="var(--helix-violet)" stroke-width="2" fill="none" opacity="0.9"/>
              ${Array.from({length:7}).map((_,i)=>`<line x1="${10+i*11}" y1="${12+i*11}" x2="${90-i*11}" y2="${12+i*11}" stroke="rgba(180,190,220,.3)" stroke-width="1"/>`).join('')}
            </svg>
            <div class="ring-anim" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:70%;height:70%;border-radius:50%;border:1.5px dashed color-mix(in srgb,var(--orchestrator) 60%,transparent);opacity:.6;"></div>
            <div class="led led-blink" style="position:absolute;right:6px;bottom:4px;width:5px;height:5px;border-radius:999px;background:var(--orchestrator);box-shadow:0 0 8px var(--orchestrator);"></div>
          </div>
          <!-- Right secondary: runtime stats -->
          <div style="height:78%;background:#0A0F18;border-radius:5px 5px 2px 2px;box-shadow:0 5px 14px rgba(0,0,0,.4);overflow:hidden;position:relative;border-top:1px solid rgba(255,255,255,.04);">
            <div style="position:absolute;inset:6px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;">
              <div style="background:color-mix(in srgb,var(--waiting-human) 22%,var(--panel-2));border-radius:3px;"></div>
              <div style="background:color-mix(in srgb,var(--done) 22%,var(--panel-2));border-radius:3px;"></div>
              <div style="background:color-mix(in srgb,var(--blocked) 18%,var(--panel-2));border-radius:3px;"></div>
              <div style="background:color-mix(in srgb,var(--thinking) 22%,var(--panel-2));border-radius:3px;"></div>
            </div>
          </div>
        </div>
      </div>`
  }

  // Role → interior renderer map
  const WORKSTATION_RENDERERS = Object.freeze({
    helix: helixWorkstationInterior,
    product: productWorkstationInterior,
    architect: architectWorkstationInterior,
    frontend: frontendWorkstationInterior,
    backend: backendWorkstationInterior,
    qa: qaWorkstationInterior,
    reviewer: reviewerWorkstationInterior,
    docs: docsWorkstationInterior,
  })

  // ---------- §5 CHARACTER MOTION CLASSES: attach to rendered person wrapper ----------
  // (CSS anims declared in core-theme.)
  function motionClass(state) {
    if (state === 'OFFLINE' || !state) return 'person-offline'
    if (state === 'WORKING') return 'person-breath person-typing'
    if (state === 'THINKING' || state === 'REVIEWING') return 'person-breath'
    if (state === 'DONE') return 'person-breath person-done'
    if (state === 'BLOCKED') return 'person-breath person-blocked'
    if (state === 'WAITING_HUMAN') return 'person-breath person-waiting'
    return 'person-breath idle-glance' // IDLE default
  }

  // ---------- §2 Zone layout placement (CSS positional: left/top/width/height on grid) ----------
  // Returns a positioned wrapper containing: 1) workstation interior + 2) seated person (renderSeat)
  function renderZoneStation(layout, roleId, snapshot, mode) {
    const useFixtures = mode === 'demo'
    const state = seatState(snapshot, roleId, useFixtures)
    const kind = seatKind(snapshot, roleId, useFixtures)
    const member = seatMember(snapshot, roleId, useFixtures)
    const model = seatModel(snapshot, roleId, useFixtures)
    const renderInterior = WORKSTATION_RENDERERS[roleId] || (() => '')
    const stateBadgeColor = stateColor(state)
    // Render person seat (C.renderSeat returns a string; already includes nameplate + state chip)
    const seatOpts = { state, kind, memberName: member, model }
    const seatHtml = C?.renderSeat?.(roleId, seatOpts) || ''
    const offlineDim = state === 'OFFLINE' ? 'opacity:.35;filter:grayscale(1) contrast(.85);' : ''
    // §7 Movement: meaningful purposeful transforms driven by state (not random walk)
    //   THINKING → slight lean back / face-whiteboard orientation
    //   REVIEWING → dual screen compare
    //   WAITING_HUMAN → orient toward Human area (right side, SE)
    //   BLOCKED → workstation warning frame overlay
    const poseClass = (() => {
      if (state === 'THINKING') return 'pose-thinking'
      if (state === 'REVIEWING') return 'pose-reviewing'
      if (state === 'WAITING_HUMAN') return 'pose-waiting-human'
      if (state === 'BLOCKED') return 'pose-blocked'
      if (state === 'WORKING') return 'pose-working'
      return 'pose-idle'
    })()
    return `
      <div class="zone-station zone-station-${roleId} ${poseClass}"
           data-role="${roleId}" data-state="${state}"
           style="position:absolute;left:${layout.l};top:${layout.t};width:${layout.w};height:${layout.h};${offlineDim}
                  transform-origin:50% 100%;transition:transform var(--dur-slow) var(--ease-out), opacity var(--dur-base) var(--ease);"
           tabindex="0" role="group" aria-label="${C?.role?.(roleId)?.zh || roleId} 工作站 · 状态 ${state}">
        <!-- Workstation interior (role specific) -->
        <div class="station-interior" style="position:absolute;inset:0;">${renderInterior(roleId, { state })}</div>
        <!-- Seated character (rendered by core-characters, 0.85x scale subordination) -->
        <div class="seat person-seat ${motionClass(state)}"
             data-role="${roleId}" data-state="${state}"
             style="position:absolute;left:50%;bottom:8%;transform:translate(-50%,0) scale(.85);transform-origin:50% 100%;
                    width:62%;max-width:140px;pointer-events:auto;cursor:pointer;
                    filter:drop-shadow(0 10px 14px rgba(0,0,0,.28));">
          ${seatHtml}
        </div>
        <!-- State marker ring / BLOCKED warning (§5 BLOCKED) -->
        ${state === 'BLOCKED' ? `<div aria-hidden="true" class="blocked-marker" style="position:absolute;left:6%;top:6%;width:22px;height:22px;border-radius:7px;background:color-mix(in srgb,var(--blocked) 22%,var(--panel));border:1.4px solid var(--blocked);color:var(--blocked);display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 0 10px color-mix(in srgb,var(--blocked) 45%,transparent);">!</div>` : ''}
        <!-- WAITING_HUMAN → amber badge near person (§5) -->
        ${state === 'WAITING_HUMAN' ? `<div aria-hidden="true" style="position:absolute;right:6%;top:6%;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;background:color-mix(in srgb,var(--waiting-human) 20%,var(--panel));border:1px solid color-mix(in srgb,var(--waiting-human) 55%,var(--line));color:var(--waiting-human);">● 等待人类</div>` : ''}
        <!-- §11: small task capsule at workstation if active task present for this role -->
        <div class="station-task-capsule" data-role="${roleId}"
             style="position:absolute;${layout.capsule || 'left:6%;top:54%;'} z-index:4;">
          ${(snapshot?._activeTasksByRole?.[roleId] || [])[0] ? taskCapsule(snapshot._activeTasksByRole[roleId][0]) : ''}
        </div>
        <!-- State LED accent (top edge) → ring style -->
        <div aria-hidden="true" style="position:absolute;left:50%;top:0;transform:translate(-50%,-50%);width:20px;height:4px;border-radius:999px;background:${stateBadgeColor};box-shadow:0 0 8px ${stateBadgeColor};opacity:.9;"></div>
      </div>`
  }

  // ---------- §3 Helix Center separate ----------
  function renderHelixCenter(snapshot, mode, slotHtml) {
    const useFixtures = mode === 'demo'
    const state = seatState(snapshot, 'helix', useFixtures)
    const kind = 'system'
    const portCounts = snapshot?.portCounts || (useFixtures ? DEMO_PORT_COUNTS : null)
    const helixPerson = C?.renderHelixCore?.({
      state, kind, memberName: 'Helix', portCounts,
    }) || ''
    const layout = { l: '34%', t: '36%', w: '32%', h: '32%' }
    return `
      <div class="zone-helix-core" data-role="helix" data-state="${state}"
           style="position:absolute;left:${layout.l};top:${layout.t};width:${layout.w};height:${layout.h};
                  z-index:5;" role="group" aria-label="Helix 指挥中枢 · 状态 ${state}" tabindex="0">
        <div class="station-interior" style="position:absolute;inset:-14% -22% -10%;">
          ${helixWorkstationInterior('helix', { state })}
        </div>
        <!-- Operator: Helix renderHelixCore (the character figure itself). §3 graphite/silver + indigo accents. -->
        <div class="helix-operator person-seat ${motionClass(state)}" data-role="helix"
             data-state="${state}"
             style="position:absolute;left:50%;bottom:8%;transform:translate(-50%,0) scale(1);transform-origin:50% 100%;
                    width:58%;max-width:150px;pointer-events:auto;cursor:pointer;
                    filter:drop-shadow(0 14px 22px var(--glow-helix));">
          ${helixPerson}
        </div>
        <!-- Helix connection ports: 6 SVG arc bezier paths extending outward. -->
        <svg aria-hidden="true" class="helix-ports" style="position:absolute;inset:-24% -30%;width:160%;height:148%;z-index:-1;pointer-events:none;">
          <g stroke="color-mix(in srgb,var(--orchestrator) 55%,transparent)" stroke-width="1.5" fill="none" opacity=".6">
            <path d="M 50% 60% C 20% 52%, 18% 34%, 16% 22%"/>
            <path d="M 50% 60% C 80% 52%, 82% 34%, 84% 22%"/>
            <path d="M 50% 60% C 26% 72%, 14% 80%, 10% 92%"/>
            <path d="M 50% 60% C 74% 72%, 86% 80%, 90% 92%"/>
            <path d="M 50% 60% C 32% 62%, 30% 54%, 22% 52%"/>
            <path d="M 50% 60% C 68% 62%, 70% 54%, 78% 52%"/>
          </g>
        </svg>
        ${slotHtml || ''}
      </div>`
  }

  // ---------- §8 Inspector dispatch ----------
  function emitOpenRoleInspector(mount, role) {
    mount.dispatchEvent(new CustomEvent('vao:open-role-inspector', {
      bubbles: true, cancelable: true, detail: { role },
    }))
  }
  function emitOpenTaskInspector(mount, taskId) {
    mount.dispatchEvent(new CustomEvent('vao:open-task-inspector', {
      bubbles: true, cancelable: true, detail: { taskId },
    }))
  }
  function emitOpenHelixPanel(mount) {
    mount.dispatchEvent(new CustomEvent('vao:open-helix-panel', {
      bubbles: true, cancelable: true,
    }))
  }

  // ---------- §6 Event animation: helix → role dispatch travel pulse (SVG animating dash path) ----------
  function dispatchLineSvg(edges, waitingHumanActive) {
    return `
      <svg class="canvas-dispatches" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;">
        <g fill="none" stroke-width="1.8">
          <!-- Helix → Planning (NW) -->
          <path d="M 50% 58% C 30% 50%, 26% 38%, 22% 26%"
                stroke="color-mix(in srgb, var(--orchestrator) 55%, transparent)"
                stroke-dasharray="4 7" class="dispatch-path-0 ${waitingHumanActive ? '' : 'data-line-anim'}"/>
          <!-- Helix → Engineering (NE) -->
          <path d="M 50% 58% C 70% 50%, 74% 38%, 78% 26%"
                stroke="color-mix(in srgb, var(--working) 55%, transparent)"
                stroke-dasharray="4 7" class="dispatch-path-1 data-line-anim"/>
          <!-- Helix → Quality (SW) -->
          <path d="M 50% 58% C 30% 68%, 24% 80%, 22% 90%"
                stroke="color-mix(in srgb, var(--reviewing) 55%, transparent)"
                stroke-dasharray="4 7" class="dispatch-path-2 data-line-anim"/>
          <!-- Helix → Knowledge / Human (SE): amber if WAITING_HUMAN -->
          <path class="${waitingHumanActive ? 'path-waiting-human' : 'dispatch-path-3'}"
                d="M 50% 58% C 70% 68%, 76% 80%, 78% 90%"
                ${waitingHumanActive ? '' : 'stroke="color-mix(in srgb, var(--docs, var(--idle)) 50%, transparent)" stroke-dasharray="4 7" class="data-line-anim"'} />
        </g>
        <style>
          @keyframes data-flow { to { stroke-dashoffset: -66; } }
          .data-line-anim { animation: data-flow 2.2s linear infinite; }
        </style>
      </svg>`
  }

  // ---------- Office Floor Backdrop (continuous isometric 2.5D with warm neutral material) ----------
  function floorBackdrop(zones) {
    const hasWaitingHuman = !!zones?.waitingHuman
    return `
      <div class="ambient-floor" aria-hidden="true"></div>
      <svg class="office-floor-svg" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;">
        <defs>
          <!-- Warm neutral 2.5D isometric floor -->
          <linearGradient id="floor-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--canvas-floor)"/>
            <stop offset="100%" stop-color="var(--canvas-floor-warm)"/>
          </linearGradient>
          <pattern id="iso-warm" width="48" height="28" patternUnits="userSpaceOnUse" patternTransform="skewX(-14)">
            <path d="M 48 0 L 0 0 0 28" fill="none" stroke="color-mix(in srgb, var(--canvas-grid) 55%, transparent)" stroke-width="0.5" opacity=".5"/>
          </pattern>
          <!-- Zone tints (subtle material changes — NOT bordered rectangles!) -->
          <linearGradient id="zone-planning-tint" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="color-mix(in srgb, var(--role-product) 6%, transparent)"/>
            <stop offset="100%" stop-color="color-mix(in srgb, var(--role-architect) 5%, transparent)"/>
          </linearGradient>
          <linearGradient id="zone-engineering-tint" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="color-mix(in srgb, var(--role-frontend) 6%, transparent)"/>
            <stop offset="100%" stop-color="color-mix(in srgb, var(--role-backend) 5%, transparent)"/>
          </linearGradient>
          <linearGradient id="zone-quality-tint" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="color-mix(in srgb, var(--role-qa) 6%, transparent)"/>
            <stop offset="100%" stop-color="color-mix(in srgb, var(--role-reviewer) 5%, transparent)"/>
          </linearGradient>
          <linearGradient id="zone-knowledge-tint" x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="color-mix(in srgb, var(--role-docs) 7%, transparent)"/>
            <stop offset="100%" stop-color="color-mix(in srgb, ${hasWaitingHuman ? 'var(--waiting-human)' : 'var(--role-docs)'} 5%, transparent)"/>
          </linearGradient>
          <!-- Glass partition subtle shadow -->
          <filter id="soft-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.2"/>
          </filter>
        </defs>
        <!-- Base warm floor -->
        <rect width="100%" height="100%" fill="url(#floor-base)"/>
        <rect width="100%" height="100%" fill="url(#iso-warm)" opacity=".6"/>
        <!-- Zone tint polygons (soft color washes; NO full borders!) -->
        <polygon points="0,0 50%,0 44%,50% 0,44%" fill="url(#zone-planning-tint)"/>
        <polygon points="50%,0 100%,0 100%,44% 56%,50%" fill="url(#zone-engineering-tint)"/>
        <polygon points="0,44% 44%,50% 50%,100% 0,100%" fill="url(#zone-quality-tint)"/>
        <polygon points="56%,50% 100%,44% 100%,100% 50%,100%" fill="url(#zone-knowledge-tint)"/>
        <!-- Center Helix platform glow base -->
        <ellipse cx="50%" cy="58%" rx="20%" ry="12%" fill="var(--glow-helix)"/>
        <!-- Cross walkway (warm material change, not dashed borders) -->
        <path d="M 0 50% L 100% 50%" stroke="color-mix(in srgb, var(--wood) 35%, transparent)" stroke-width="1.5"/>
        <path d="M 50% 0 L 50% 100%" stroke="color-mix(in srgb, var(--wood) 35%, transparent)" stroke-width="1.5"/>
        <!-- Glass partition lines (very subtle) -->
        <path d="M 50% 0 L 50% 32%" stroke="rgba(160,180,220,0.14)" stroke-width="2" filter="url(#soft-shadow)"/>
        <path d="M 50% 84% L 50% 100%" stroke="rgba(160,180,220,0.14)" stroke-width="2" filter="url(#soft-shadow)"/>
      </svg>

      <!-- Zone label chips (small, subtle, §2: no giant white rectangles) -->
      <div class="zone-labels" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none;z-index:2;">
        <div class="zone-label planning-label" style="position:absolute;left:16px;top:14px;">
          <div style="display:inline-flex;align-items:baseline;gap:5px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:1px solid rgba(0,0,0,.06);">
            <span style="font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--text);opacity:.78;">PLANNING</span>
            <span style="font-size:9.5px;color:var(--text-muted);">规划工作室 · Product + Architect</span>
          </div>
        </div>
        <div class="zone-label engineering-label" style="position:absolute;right:16px;top:14px;">
          <div style="display:inline-flex;align-items:baseline;gap:5px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:1px solid rgba(0,0,0,.06);">
            <span style="font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--text);opacity:.78;">ENGINEERING</span>
            <span style="font-size:9.5px;color:var(--text-muted);">工程站 · FE + BE</span>
          </div>
        </div>
        <div class="zone-label quality-label" style="position:absolute;left:16px;bottom:68px;">
          <div style="display:inline-flex;align-items:baseline;gap:5px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:1px solid rgba(0,0,0,.06);">
            <span style="font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--text);opacity:.78;">QUALITY</span>
            <span style="font-size:9.5px;color:var(--text-muted);">质检工作室 · QA + Reviewer</span>
          </div>
        </div>
        <div class="zone-label knowledge-label" style="position:absolute;right:16px;bottom:68px;">
          <div style="display:inline-flex;align-items:baseline;gap:5px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:1px solid rgba(0,0,0,.06);">
            <span style="font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--text);opacity:.78;">KNOWLEDGE · HUMAN</span>
            <span style="font-size:9.5px;color:var(--text-muted);">文档角 · Docs + Human</span>
          </div>
        </div>
      </div>

      <!-- §2 Human area visual only if humans present (no big empty rectangle) -->
      ${zones?.humanCount > 0 ? zones.humanAreaHtml : ''}
      <!-- §6 / §10 dispatch lines -->
      ${dispatchLineSvg(null, hasWaitingHuman)}
      <!-- Small potted plants / coffee details (§1: keep professional) -->
      <div aria-hidden="true" style="position:absolute;left:4px;bottom:4px;width:22px;height:36px;z-index:2;">
        <div style="position:absolute;left:50%;bottom:0;transform:translate(-50%,0);width:16px;height:10px;border-radius:3px;background:#8A6B4F;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);"></div>
        <div style="position:absolute;left:50%;bottom:9px;transform:translate(-50%,0);width:20px;height:22px;background:radial-gradient(ellipse at 50% 80%,#2D7A4F 0%,#1E5A3A 70%,transparent 100%);border-radius:50% 50% 44% 44%;opacity:.82;"></div>
      </div>
      <div aria-hidden="true" style="position:absolute;right:4px;bottom:4px;width:22px;height:32px;z-index:2;">
        <div style="position:absolute;left:50%;bottom:0;transform:translate(-50%,0);width:14px;height:9px;border-radius:3px;background:#7A5D42;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);"></div>
        <div style="position:absolute;left:50%;bottom:8px;transform:translate(-50%,0);width:18px;height:20px;background:radial-gradient(ellipse at 50% 80%,#3A8A5C 0%,#256844 70%,transparent 100%);border-radius:50% 50% 44% 44%;opacity:.82;"></div>
      </div>
      <!-- Coffee machine corner (NW / near planning) -->
      <div aria-hidden="true" style="position:absolute;left:10px;top:calc(44% - 4px);width:22px;height:28px;z-index:2;">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,#20262F,#14181F);border-radius:4px 4px 2px 2px;box-shadow:0 4px 8px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.04);"></div>
        <div class="led led-blink" style="position:absolute;right:4px;bottom:4px;width:4px;height:4px;border-radius:999px;background:var(--waiting-human);box-shadow:0 0 4px var(--waiting-human);"></div>
      </div>`
  }

  // ---------- §1 HUMAN AREA (compact; only shown when humans actually present) ----------
  function renderHumanArea(snapshot, mode) {
    const useFixtures = mode === 'demo'
    const hum1 = snapshot?.seatMembers?.product || (useFixtures ? DEMO_SEAT_MEMBER.product : undefined)
    const hum2 = snapshot?.seatMembers?.qa || (useFixtures ? DEMO_SEAT_MEMBER.qa : undefined)
    const hum3 = snapshot?.seatMembers?.reviewer || (useFixtures ? DEMO_SEAT_MEMBER.reviewer : undefined)
    const items = [
      hum1 ? { label: '产品经理', name: hum1 } : null,
      hum2 ? { label: 'QA', name: hum2 } : null,
      hum3 ? { label: '审查员', name: hum3 } : null,
    ].filter(Boolean)
    const count = items.length
    if (count === 0) return { count, html: '' }
    const html = `
      <div class="human-area-vis" aria-label="人类区" style="position:absolute;left:56%;right:8%;bottom:8px;height:46px;z-index:4;display:flex;align-items:center;gap:6px;padding:4px 8px 4px 44px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--waiting-human) 10%,var(--panel)) 30%,color-mix(in srgb,var(--panel-2) 92%,transparent));border-radius:10px;box-shadow:var(--shadow-soft);">
        <div style="position:absolute;left:8px;top:50%;transform:translate(0,-50%);padding:2px 6px;border-radius:6px;background:color-mix(in srgb,var(--waiting-human) 24%,var(--panel-2));color:var(--waiting-human);font-size:10px;font-weight:700;letter-spacing:.06em;">● 人类可联系</div>
        ${items.map((it) => `<div style="display:inline-flex;align-items:center;gap:5px;padding:3px 7px 3px 3px;border-radius:999px;background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow-1);">
          ${S?.BADGE?.human?.({ size: 16 }) || ''}
          <span style="font-size:11px;font-weight:600;color:var(--text);">${it.label} · ${esc(it.name)}</span>
        </div>`).join('')}
      </div>`
    return { count, html }
  }

  // ---------- §11 Activity strip (only if tasks non-empty) ----------
  function taskActivityStrip(tasks) {
    if (!tasks?.length) {
      return `<div class="task-empty-hint" aria-label="暂无任务" style="position:absolute;right:14px;bottom:12px;z-index:5;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:rgba(255,255,255,.42);border:1px dashed rgba(0,0,0,0.13);backdrop-filter:blur(3px);color:var(--text-muted);font-size:11px;">· 暂无活动任务 · 导入后在工作站处显示</div>`
    }
    return `<section class="task-strip" aria-label="活动任务条" style="position:absolute;left:16px;right:16px;bottom:12px;z-index:5;padding:4px 8px;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 94%,transparent),color-mix(in srgb,var(--panel-2) 88%,transparent));border:1px solid rgba(0,0,0,0.07);border-radius:12px;box-shadow:0 3px 12px rgba(18,24,40,.08);">
      <div style="display:flex;gap:6px;align-items:center;overflow:auto;padding:2px 0;">
        ${tasks.map((t) => {
          const St = S?.STATES
          const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[t.status] || 'IDLE'
          const color = stateColor(stateKey)
          return `<article class="task-chip" data-task="${t.id}" data-role="${t.role}" style="flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:9px;background:var(--panel);border:1px solid var(--line);cursor:pointer;box-shadow:var(--shadow-1);">
            <span style="width:3px;height:16px;border-radius:999px;background:${color};"></span>
            <span style="font-size:10.5px;color:var(--text-muted);font-family:var(--mono);font-weight:700;">${esc(t.id)}</span>
            <span style="font-size:11.5px;color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;">${esc(t.title)}</span>
            <span style="display:inline-flex;align-items:center;gap:3px;color:${color};">${S?.stateGlyphSvg?.(stateKey, 11) || ''}<span style="font-size:10px;line-height:1;">${St?.[stateKey]?.zh || ''}</span></span>
          </article>`
        }).join('')}
      </div>
    </section>`
  }

  // ---------- §14 Responsive layout variants ----------
  const RESPONSIVE_CSS = `
    .v2-canvas{position:relative;min-height:100%;background:var(--canvas-floor);overflow:hidden;}
    .v2-canvas .person-seat:focus{outline:2px solid var(--accent);outline-offset:4px;border-radius:var(--radius-control);}
    .v2-canvas .zone-station:focus{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--radius-workstation);}
    .v2-canvas .task-capsule:focus{outline:2px solid var(--accent);outline-offset:2px;}
    /* §7 Movement pose transforms (state-driven, CSS-only — no pathfinding) */
    .pose-thinking .person-seat{transform:translate(-50%,-2px) scale(.85) rotate(-2deg)!important;}
    .pose-working  .person-seat{transform:translate(-50%,0) scale(.86)!important;}
    .pose-reviewing .person-seat{transform:translate(-42%,-1px) scale(.85) rotate(3deg)!important;}
    .pose-waiting-human .person-seat{transform:translate(-34%,0) scale(.85) rotate(6deg)!important;}
    .pose-blocked .person-seat{transform:translate(-50%,0) scale(.83)!important;}
    /* §6 DONE → short green flash on seat */
    @keyframes done-flash { 0% { filter: drop-shadow(0 0 0 var(--done)) drop-shadow(0 10px 14px rgba(0,0,0,.28)); } 40% { filter: drop-shadow(0 0 12px var(--done)) drop-shadow(0 10px 18px rgba(0,0,0,.25)); } 100% { filter: drop-shadow(0 10px 14px rgba(0,0,0,.28)); } }
    .person-done{animation: done-flash 2.2s ease-out 1;}
    /* §15 Pause ambient animations when tab hidden (class toggled by JS below) */
    .v2-canvas.document-hidden .ambient-floor,
    .v2-canvas.document-hidden .ring-anim,
    .v2-canvas.document-hidden .data-line-anim,
    .v2-canvas.document-hidden .led-blink{animation-play-state:paused!important;}

    @media (max-width:1280px){
      .v2-canvas .person-seat{width:70%;}
      .v2-canvas .zone-label span:last-child{display:none;}
    }
    @media (max-width:1024px){
      .v2-canvas{min-height:720px;}
      .v2-canvas .zone-station.zone-station-product   { left:4%;  top:6%;  width:42%; height:22%; }
      .v2-canvas .zone-station.zone-station-architect { left:54%; top:6%;  width:42%; height:22%; }
      .v2-canvas .zone-helix-core                     { left:30%; top:28%; width:40%; height:24%; }
      .v2-canvas .zone-station.zone-station-frontend  { left:4%;  top:52%; width:42%; height:22%; }
      .v2-canvas .zone-station.zone-station-backend   { left:54%; top:52%; width:42%; height:22%; }
      .v2-canvas .zone-station.zone-station-qa        { left:4%;  top:76%; width:42%; height:22%; }
      .v2-canvas .zone-station.zone-station-reviewer  { left:54%; top:76%; width:42%; height:22%; }
      .v2-canvas .zone-station.zone-station-docs      { left:29%; top:102%;width:42%; height:22%; }
      .v2-canvas{min-height:calc(1024px * 1.24);}
      .v2-canvas .human-area-vis{left:12%;right:12%;bottom:4px;padding-left:8px;}
    }
    @media (max-width:640px){
      /* §14 Mobile → list slices, do NOT show miniature whole office */
      .v2-canvas{padding:12px 10px 22px;min-height:auto;}
      .v2-canvas .ambient-floor,.v2-canvas .office-floor-svg,.v2-canvas .zone-labels{display:none!important;}
      .v2-canvas .office-plan{position:relative;display:grid;gap:10px;}
      .v2-canvas .zone-station,.v2-canvas .zone-helix-core{
        position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:150px!important;
        border-radius:var(--radius-workstation);background:linear-gradient(180deg,var(--panel),var(--panel-2));
        box-shadow:var(--shadow-1);border:1px solid var(--line);
      }
      .v2-canvas .person-seat{width:40%;max-width:96px;}
      .v2-canvas .zone-station .station-task-capsule{position:absolute;left:auto!important;right:10px!important;top:10px!important;bottom:auto!important;}
      .v2-canvas .task-strip{position:relative;left:auto;right:auto;bottom:auto;margin-top:10px;}
      .v2-canvas .task-empty-hint{position:relative;left:auto;right:auto;bottom:auto;margin-top:8px;}
      .v2-canvas .human-area-vis{position:relative;left:auto;right:auto;bottom:auto;margin-top:10px;height:auto;padding:6px;flex-wrap:wrap;}
    }
  `

  // ---------- Zone station positional layouts (desktop 1440 baseline, §2 zoning) ----------
  const DESKTOP_LAYOUTS = Object.freeze({
    product:   { l: '4%',  t: '7%',  w: '28%', h: '24%', capsule: 'left:4%;top:62%;' },
    architect: { l: '4%',  t: '31%', w: '28%', h: '24%', capsule: 'right:4%;top:62%;' },
    frontend:  { l: '68%', t: '7%',  w: '28%', h: '24%', capsule: 'left:4%;top:62%;' },
    backend:   { l: '68%', t: '31%', w: '28%', h: '24%', capsule: 'right:4%;top:62%;' },
    qa:        { l: '4%',  t: '69%', w: '28%', h: '24%', capsule: 'left:4%;top:10%;' },
    reviewer:  { l: '4%',  t: '69%', w: '28%', h: '24%', capsule: 'right:4%;top:10%;' },
    docs:      { l: '68%', t: '69%', w: '28%', h: '24%', capsule: 'left:4%;top:10%;' },
  })
  // Place Reviewer to the RIGHT of QA instead of overlap (adjust layouts):
  const CORRECT_DESKTOP_LAYOUTS = Object.freeze({
    ...DESKTOP_LAYOUTS,
    qa:        { l: '4%',  t: '69%', w: '28%', h: '24%', capsule: 'left:4%;top:62%;' },
    reviewer:  { l: '68%', t: '69%', w: '28%', h: '24%', capsule: 'right:4%;top:62%;' },
    docs:      { l: '38%', t: '82%', w: '24%', h: '18%', capsule: 'right:4%;top:8%;' },
    // Actually keep docs in SE area: rebalance the 4 zones
  })
  // Final balanced desktop (ring around center Helix):
  const FINAL_LAYOUTS = Object.freeze({
    product:   { l: '4%',  t: '6%',  w: '26%', h: '22%', capsule: 'left:6%;top:60%;' },
    architect: { l: '4%',  t: '30%', w: '26%', h: '22%', capsule: 'right:6%;top:60%;' },
    frontend:  { l: '70%', t: '6%',  w: '26%', h: '22%', capsule: 'left:6%;top:60%;' },
    backend:   { l: '70%', t: '30%', w: '26%', h: '22%', capsule: 'right:6%;top:60%;' },
    qa:        { l: '4%',  t: '68%', w: '26%', h: '22%', capsule: 'left:6%;top:58%;' },
    reviewer:  { l: '70%', t: '68%', w: '26%', h: '22%', capsule: 'right:6%;top:58%;' },
    docs:      { l: '38%', t: '80%', w: '24%', h: '18%', capsule: 'right:8%;top:6%;' },
  })

  // ---------- attach() ----------
  function attach(mount, opts = {}) {
    if (!mount) throw new Error('VAOCoreOffice.attach: mount element required')
    if (!C || !S) throw new Error('VAOCoreOffice: missing VAOCoreCharacters / VAOCoreStates (load order)')

    mount.classList.add('v2-canvas')
    const mode = officeMode(opts)
    const useFixtures = mode === 'demo'
    const snapshot = (opts.snapshot || null) && typeof opts.snapshot === 'object' ? opts.snapshot : null

    // Group tasks by role → render capsules
    const tasks = snapshot?.tasks?.length ? snapshot.tasks.slice() : (useFixtures ? JSON.parse(JSON.stringify(DEMO_TASKS)) : [])
    const waitingHumanTasks = tasks.filter((t) => t.kind === 'human' || t.sinceMs)
    const activeTasksByRole = {}
    for (const t of tasks) {
      if (!t.role) continue
      activeTasksByRole[t.role] ||= []
      activeTasksByRole[t.role].push(t)
    }
    // Attach by-ref for render helpers
    const snapRef = Object.assign({}, snapshot || {}, { _activeTasksByRole: activeTasksByRole })

    const humanArea = renderHumanArea(snapRef, mode)
    const helixSlotHtml = waitingHumanTasks.length
      ? `<div style="position:absolute;left:50%;top:104%;transform:translate(-50%,0);min-width:230px;z-index:6;display:grid;gap:5px;">${waitingHumanTasks.slice(0,2).map((t) => S?.HumanActionMarker?.render({ role: C?.role?.(t.role)?.zh || t.who || '负责角色', member: t.member, sinceMs: t.sinceMs, required: t.required }) || '').join('')}</div>`
      : ''

    const demoBanner = useFixtures
      ? `<div aria-label="演示数据" style="position:relative;z-index:8;margin:10px 18px 0;display:inline-block;padding:5px 9px;border:1px solid var(--thinking);background:color-mix(in srgb, var(--thinking) 14%, transparent);color:var(--thinking);border-radius:9px;font-size:11px;font-weight:700;letter-spacing:.08em;">● 演示数据 · DEMO（仅 fake / demo 模式显示）</div>`
      : ''

    // Per-role station HTML (exclude Helix, rendered separately at center)
    const ringRoles = ROLES.filter((r) => r.id !== 'helix').map((r) => r.id)
    const stationsHtml = ringRoles.map((rid) => {
      const layout = FINAL_LAYOUTS[rid] || FINAL_LAYOUTS.docs
      return renderZoneStation(layout, rid, snapRef, mode)
    }).join('')

    // Actually correct QA/Reviewer split: QA SW, Reviewer SW bottom-right-of-center? No!
    // Re-balance so QA+Reviewer are distinct in SW quadrant
    const qaLayout     = { l: '5%',  t: '62%', w: '22%', h: '20%', capsule: 'left:6%;top:58%;' }
    const reviewerLayout = { l: '28%', t: '74%', w: '22%', h: '20%', capsule: 'right:6%;top:58%;' }
    const fixed = { ...FINAL_LAYOUTS, qa: qaLayout, reviewer: reviewerLayout }
    // Rebuild with correct distinct layouts
    const finalStationsHtml = ROLES.filter((r) => r.id !== 'helix').map((r) => r.id).map((rid) => {
      const layout = fixed[rid] || FINAL_LAYOUTS[rid]
      return renderZoneStation(layout, rid, snapRef, mode)
    }).join('')

    const backdrop = floorBackdrop({ humanCount: humanArea.count, humanAreaHtml: humanArea.html, waitingHuman: waitingHumanTasks.length > 0 })
    const activity = taskActivityStrip(tasks)
    const helix = renderHelixCenter(snapRef, mode, helixSlotHtml)

    mount.innerHTML = `
      ${demoBanner}
      <div class="office-plan" style="position:relative;z-index:2;width:100%;height:min(100%,1100px);min-height:calc(100vh - 48px);">
        ${backdrop}
        ${finalStationsHtml}
        ${helix}
        ${activity}
      </div>
      <style>${RESPONSIVE_CSS}</style>
    `

    // §8 click wiring → inspector events (shell layer displays popups, we dispatch events)
    mount.querySelectorAll('.person-seat, .zone-station, .helix-operator').forEach((el) => {
      el.addEventListener('click', (e) => {
        const role = el.dataset.role || (el.closest('[data-role]') || {}).dataset?.role
        if (!role) return
        e.stopPropagation()
        if (role === 'helix') emitOpenHelixPanel(mount)
        else emitOpenRoleInspector(mount, role)
      })
    })
    mount.querySelectorAll('.task-capsule, .task-chip, [data-task]').forEach((card) => {
      card.addEventListener('click', (e) => {
        const id = card.dataset.task
        if (!id) return
        e.stopPropagation()
        emitOpenTaskInspector(mount, id)
      })
    })

    // §15 Performance: pause ambient if tab hidden
    const onVis = () => {
      mount.classList.toggle('document-hidden', !!document.hidden)
    }
    onVis()
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVis, { passive: true })
    }
    const _prevCleanup = mount._vaoCleanup
    if (typeof _prevCleanup === 'function') { try { _prevCleanup() } catch (_) {} }
    mount._vaoCleanup = () => {
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('visibilitychange', onVis)
      }
    }

    return Object.freeze({
      mode,
      mount,
      update(nextSnapshot) {
        attach(mount, { snapshot: nextSnapshot, mode })
      },
      destroy() {
        if (typeof mount._vaoCleanup === 'function') { try { mount._vaoCleanup() } catch (_) {} }
        mount.innerHTML = ''
        mount.classList.remove('v2-canvas')
      },
    })
  }

  const api = Object.freeze({
    attach,
    officeMode,
    _internals: Object.freeze({
      taskCapsule, WORKSTATION_RENDERERS, FINAL_LAYOUTS, DESKTOP_LAYOUTS,
      motionClass, stateColor, seatState, seatKind, seatMember, seatModel,
      DEMO_SEAT_STATES, DEMO_SEAT_KIND, DEMO_SEAT_MEMBER, DEMO_SEAT_MODEL,
      DEMO_PORT_COUNTS, DEMO_TASKS, DEMO_EDGES,
    }),
  })

  globalThis.VAOCoreOffice = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
