/* Visual V2-A Office Canvas (§7 VISUAL_IDENTITY_V2.md §5.4 zoning, §8 role primitives consumers,
 * §12 task/evidence chips, §13 responsive).
 *
 * Layout contract (desktop 4-region: Canvas = center primary zone):
 *   - CENTER: Helix seat (renderHelixCore, elevated platform + 6 ports)
 *   - AROUND Helix (in ring order): 7 official role seats — total 8 INCLUDING Helix.
 *   - Seat count audit: Helix(center) + Product + Architect + Frontend + Backend + QA + Reviewer + Docs = 8.
 *   - Zones (when layoutable, soft): Planning(Build left-top) / Build / Verify(right-bottom) / Docs(bottom) / Human(top).
 *   - RoleSeat, TaskCard, EvidenceChip, DependencyEdge, HumanActionMarker compose on this canvas.
 *   - NEVER draws legacy anime/office SVG characters (no mixing rule §13).
 *
 * Responsive:
 *   - ≥1024px desktop: grid 3×3 center cell = Helix; 8 seats fill ring cells.
 *   - 640–1024 tablet: stack 2 rows of 4 seats each below Helix center row.
 *   - ≤640 mobile: Helix header banner, remaining seats become vertical list cards.
 */
;(function () {
  'use strict'

  const C = globalThis.VAOCoreCharacters
  const S = globalThis.VAOCoreStates
  const ROLES = C ? C.ROLES : []
  const HELIX_INDEX = 0

  // Demo / fake data for canvas only in fake/demo mode. NEVER used in live mode.
  // Live mode uses empty honest states when no snapshot data provided.
  const DEMO_SEAT_STATES = Object.freeze({
    helix: 'THINKING',
    product: 'IDLE',
    architect: 'THINKING',
    frontend: 'WORKING',
    backend: 'WORKING',
    qa: 'IDLE',
    reviewer: 'REVIEWING',
    docs: 'IDLE',
  })
  const DEMO_SEAT_KIND = Object.freeze({
    helix: 'system',
    product: 'human',
    architect: 'ai',
    frontend: 'ai',
    backend: 'ai',
    qa: 'human',
    reviewer: 'human',
    docs: 'ai',
  })
  const DEMO_SEAT_MEMBER = Object.freeze({
    product: '李产品',
    architect: 'Codex (演示)',
    frontend: 'Claude (演示)',
    backend: 'DeepSeek (演示)',
    qa: '王测试',
    reviewer: '张审查',
    docs: 'Gemini (演示)',
  })
  const DEMO_SEAT_MODEL = Object.freeze({
    architect: 'demo',
    frontend: 'demo',
    backend: 'demo',
    docs: 'demo',
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

  const DEMO_EDGES = Object.freeze([
    ['DEMO-101', 'DEMO-104', 'ready'],
  ])

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }

  function officeMode(opts = {}) {
    const raw = String(opts.mode || 'live').toLowerCase()
    return raw === 'fake' || raw === 'demo' ? 'demo' : 'live'
  }

  function taskCard(task) {
    const St = S?.STATES
    const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[task.status] || 'IDLE'
    const color = St ? `var(--${St[stateKey].key})` : 'var(--accent)'
    const chips = (task.evidence || []).map((e) => S?.EVIDENCE?.chip(e.kind, e.state, { sha: e.sha }) || '').join('')
    return `<article class="task-card" data-task="${task.id}" data-role="${task.role}" style="display:grid;grid-template-columns:4px 1fr auto;gap:0 10px;align-items:start;padding:10px 10px 10px 6px;border-radius:var(--radius-panel);border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow-1);min-width:240px;">
      <span style="grid-column:1;grid-row:span 3;width:4px;height:100%;background:${color};border-radius:999px;"></span>
      <div style="grid-column:2;grid-row:1;display:flex;align-items:baseline;gap:6px;">
        <span class="task-id" style="color:var(--text-muted);font-size:11px;line-height:14px;">${task.id}</span>
        <span class="task-title" style="font-size:13px;font-weight:600;color:var(--text);line-height:18px;">${task.title}</span>
      </div>
      <div style="grid-column:3;grid-row:1;display:inline-flex;align-items:center;gap:4px;color:${color};">${S?.stateGlyphSvg(stateKey, 12) || ''}<span style="font-size:11px;line-height:14px;">${St?.[stateKey]?.zh || task.status}</span></div>
      <div style="grid-column:2;grid-row:2;display:flex;flex-wrap:wrap;gap:4px;padding-top:4px;">
        <span class="pill" style="background:var(--panel-2);color:var(--text-muted);border:1px solid var(--line);padding:1px 8px;font-size:11px;line-height:14px;">${task.kind} · ${task.difficulty}</span>
        ${task.deps?.length ? `<span class="pill" style="background:var(--panel-2);color:var(--text-muted);border:1px solid var(--line);padding:1px 8px;font-size:11px;line-height:14px;">依赖 ${task.deps.length}</span>` : ''}
        ${chips}
      </div>
      <div style="grid-column:2 / span 2;grid-row:3;display:flex;justify-content:space-between;padding-top:6px;">
        <span style="font-size:11.5px;color:var(--text-muted);line-height:14px;">${task.who || ''}</span>
        ${task.sinceMs ? `<span style="font-size:11px;color:var(--waiting-human);line-height:14px;">等待 ${Math.max(0, Math.round((Date.now() - task.sinceMs) / 60000))} 分</span>` : ''}
      </div>
    </article>`
  }

  function humanWaitingCard(task) {
    const role = task.role ? C?.role(task.role) : null
    return S?.HumanActionMarker?.render({
      role: role?.zh || task.who || '负责角色待定',
      member: task.member || undefined,
      sinceMs: task.sinceMs,
      required: task.required,
    }) || ''
  }

  function edgeSVG(edges) {
    if (!edges?.length) return ''
    return `<svg class="canvas-edges" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;">
      ${edges.map(([f, t, status]) => {
        const attr = S?.DependencyEdge?.render(f, t, { status })?.attr || {}
        return `<line data-from="${f}" data-to="${t}" x1="0" y1="0" x2="0" y2="0" stroke="${attr.stroke || 'var(--accent)'}" stroke-width="1.5" stroke-dasharray="${attr['stroke-dasharray'] || ''}" opacity=".55"/>`
      }).join('')}
    </svg>`
  }

  function renderSeatRow(snapshot, roleIds, mode, opts = {}) {
    const useFixtures = mode === 'demo'
    return roleIds.map((rid) => {
      if (rid === 'helix') return ''
      const seatState = snapshot?.seatStates?.[rid] || (useFixtures ? DEMO_SEAT_STATES[rid] : 'IDLE')
      const kind = snapshot?.seatKinds?.[rid] || (useFixtures ? DEMO_SEAT_KIND[rid] : (rid === 'product' || rid === 'qa' || rid === 'reviewer' ? 'human' : 'ai'))
      const memberName = snapshot?.seatMembers?.[rid] || (useFixtures ? DEMO_SEAT_MEMBER[rid] : undefined)
      const model = snapshot?.seatModels?.[rid] || (useFixtures ? DEMO_SEAT_MODEL[rid] : undefined)
      const seatOpts = { state: seatState, kind, memberName, model, slot: opts.slots?.[rid] }
      return C?.renderSeat(rid, seatOpts) || ''
    }).join('')
  }

  function renderHelix(snapshot, mode) {
    const useFixtures = mode === 'demo'
    const state = snapshot?.seatStates?.helix || (useFixtures ? DEMO_SEAT_STATES.helix : 'IDLE')
    const kind = 'system'
    const portCounts = snapshot?.portCounts || (useFixtures ? DEMO_PORT_COUNTS : null)
    return C?.renderHelixCore({
      state,
      kind,
      memberName: 'Helix',
      portCounts,
      slot: snapshot?.slot,
    }) || ''
  }

  /**
   * Office Canvas attach (VIS-3/6/7: 6-zone continuous office floor).
   * Zones: HELIX COMMAND HUB (center) / PLANNING (NW product+architect) / ENGINEERING (NE frontend+backend) /
   *        QUALITY (SW qa+reviewer) / KNOWLEDGE (SE docs) / HUMAN AREA (conditional).
   * Depth layers: z-1 floor grid → z0 workstation base/partitions → z1 seated people → z2 screens/whiteboards → z3 connections.
   * Tasks: empty → small inline hint; non-empty → narrow footer activity strip.
   * @param {HTMLElement} mount Canvas mount element (typically #office-canvas).
   * @param {{ snapshot?: any, mode?: 'live'|'fake'|'demo' }} opts
   */
  function attach(mount, opts = {}) {
    if (!mount) throw new Error('VAOCoreOffice.attach: mount element required')
    if (!C || !S) throw new Error('VAOCoreOffice: missing VAOCoreCharacters / VAOCoreStates (load order)')

    mount.classList.add('v2-canvas')
    const mode = officeMode(opts)
    const useFixtures = mode === 'demo'
    const snapshot = opts.snapshot || null

    const ringRoles = ROLES.filter((r) => r.id !== 'helix').map((r) => r.id)
    const tasks = snapshot?.tasks?.length ? snapshot.tasks.slice() : (useFixtures ? JSON.parse(JSON.stringify(DEMO_TASKS)) : [])
    const edges = snapshot?.edges?.length ? snapshot.edges.slice() : (useFixtures ? JSON.parse(JSON.stringify(DEMO_EDGES)) : [])
    const waitingHuman = tasks.filter((t) => t.kind === 'human' || t.sinceMs)

    const roleTasksMap = {}
    for (const t of tasks) {
      if (!t.role) continue
      roleTasksMap[t.role] ||= []
      roleTasksMap[t.role].push(t)
    }
    const seatSlots = {}
    for (const rid of ringRoles) {
      const first = (roleTasksMap[rid] || [])[0]
      seatSlots[rid] = first ? taskCard(first) : ''
    }

    const hum1 = snapshot?.seatMembers?.product || (useFixtures ? DEMO_SEAT_MEMBER.product : undefined)
    const hum2 = snapshot?.seatMembers?.qa || (useFixtures ? DEMO_SEAT_MEMBER.qa : undefined)
    const hum3 = snapshot?.seatMembers?.reviewer || (useFixtures ? DEMO_SEAT_MEMBER.reviewer : undefined)
    const humanCount = [hum1, hum2, hum3].filter(Boolean).length

    const helixSlotHtml = waitingHuman.length ? `<div style="padding-top:6px;display:grid;gap:5px;min-width:220px;">${waitingHuman.slice(0, 2).map(humanWaitingCard).join('')}</div>` : ''

    const demoBanner = useFixtures ? `<div aria-label="演示数据" style="position:relative;z-index:5;margin:10px 18px 0;padding:5px 9px;border:1px solid var(--thinking);background:color-mix(in srgb, var(--thinking) 14%, transparent);color:var(--thinking);border-radius:9px;font-size:11px;font-weight:700;letter-spacing:.08em;display:inline-block;left:0;">● 演示数据 · DEMO（仅 fake/demo 模式显示）</div>` : ''

    const zoneLabel = (id, zh, en) => `<div class="zone-label" data-zone-label="${id}" aria-hidden="true" style="position:absolute;top:4px;left:6px;z-index:3;display:inline-flex;align-items:baseline;gap:5px;padding:1px 7px;border-radius:8px;background:rgba(255,255,255,0.42);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border:1px solid rgba(0,0,0,0.06);">
      <span style="font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--text);opacity:.78;">${id}</span>
      <span style="font-size:9.5px;color:var(--text-muted);letter-spacing:.02em;">${zh} · ${en}</span>
    </div>`

    const workstationShell = (rid, roleIds, zoneId) => {
      if (!Array.isArray(roleIds)) roleIds = [roleIds]
      return `<div class="workstation work-${rid}" style="position:relative;padding:16px 12px 10px;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 90%,transparent),color-mix(in srgb,var(--panel-2) 82%,transparent));border:1px solid rgba(0,0,0,0.07);border-radius:14px;box-shadow:0 5px 16px rgba(18,24,40,.10),0 1px 2px rgba(18,24,40,.05);backdrop-filter:blur(2px);">
        ${roleIds.map((r) => renderSeatRow(snapshot, [r], mode, { slots: seatSlots })).join('')}
      </div>`
    }

    const humanAreaBlock = (() => {
      if (humanCount === 0) return ''
      return `<div class="zone zone-human-area" data-zone="human-area" style="position:relative;grid-column:1 / -1;grid-row:4;padding:14px 16px 12px;background:linear-gradient(180deg,color-mix(in srgb,var(--waiting-human) 9%,transparent),color-mix(in srgb,var(--panel-2) 80%,transparent));border-top:1px solid rgba(0,0,0,0.07);">
        ${zoneLabel('HUMAN', '人类区', 'Human Area')}
        <div style="display:flex;flex-wrap:wrap;gap:10px;padding-top:6px;align-items:flex-start;">
          ${hum1 ? `<div class="human-chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 9px;background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow-1);">${S?.BADGE?.human?.({ size: 16 }) || ''}<span style="font-size:12px;font-weight:600;color:var(--text);">产品经理 · ${esc(hum1)}</span></div>` : ''}
          ${hum2 ? `<div class="human-chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 9px;background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow-1);">${S?.BADGE?.human?.({ size: 16 }) || ''}<span style="font-size:12px;font-weight:600;color:var(--text);">QA · ${esc(hum2)}</span></div>` : ''}
          ${hum3 ? `<div class="human-chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 9px;background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow-1);">${S?.BADGE?.human?.({ size: 16 }) || ''}<span style="font-size:12px;font-weight:600;color:var(--text);">审查员 · ${esc(hum3)}</span></div>` : ''}
        </div>
      </div>`
    })()

    const taskBlock = (() => {
      if (tasks.length === 0) {
        return `<div class="task-empty-hint" aria-label="暂无任务" style="position:absolute;right:14px;bottom:12px;z-index:5;display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:rgba(255,255,255,.55);border:1px dashed rgba(0,0,0,0.14);backdrop-filter:blur(3px);color:var(--text-muted);font-size:11px;">· 暂无任务 · 导入后显示在活动区</div>`
      }
      return `<section class="task-strip" aria-label="活动任务条" style="position:relative;grid-column:1 / -1;grid-row:5;z-index:4;margin:0 18px 18px;padding:4px 8px;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 94%,transparent),color-mix(in srgb,var(--panel-2) 88%,transparent));border:1px solid rgba(0,0,0,0.07);border-radius:12px;box-shadow:0 3px 12px rgba(18,24,40,.08);">
        <div style="display:flex;gap:6px;align-items:center;overflow:auto;padding:2px 0;">
          ${tasks.map((t) => {
            const St = S?.STATES
            const stateKey = ({ done: 'DONE', running: 'WORKING', pending: 'IDLE', failed: 'BLOCKED', skipped: 'OFFLINE' })[t.status] || 'IDLE'
            const color = St ? `var(--${St[stateKey].key})` : 'var(--accent)'
            return `<article class="task-chip" data-task="${t.id}" data-role="${t.role}" style="flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:9px;background:var(--panel);border:1px solid var(--line);cursor:pointer;">
              <span style="width:3px;height:16px;border-radius:999px;background:${color};"></span>
              <span style="font-size:10.5px;color:var(--text-muted);font-family:var(--mono);font-weight:700;">${esc(t.id)}</span>
              <span style="font-size:11.5px;color:var(--text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${esc(t.title)}</span>
              <span style="display:inline-flex;align-items:center;gap:3px;color:${color};">${S?.stateGlyphSvg?.(stateKey, 11) || ''}<span style="font-size:10px;line-height:1;">${St?.[stateKey]?.zh || ''}</span></span>
            </article>`
          }).join('')}
        </div>
      </section>`
    })()

    const floorBackdrop = `
      <svg class="office-floor" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;">
        <defs>
          <pattern id="iso-grid" width="40" height="24" patternUnits="userSpaceOnUse" patternTransform="skewX(-16)">
            <path d="M 40 0 L 0 0 0 24" fill="none" stroke="color-mix(in srgb, var(--canvas-grid) 60%, transparent)" stroke-width="0.6" opacity=".55"/>
          </pattern>
          <linearGradient id="floor-vignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--canvas-floor)"/>
            <stop offset="100%" stop-color="color-mix(in srgb, var(--canvas-floor) 92%, var(--panel-2))"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#floor-vignette)"/>
        <rect width="100%" height="100%" fill="url(#iso-grid)"/>
      </svg>
      <svg class="office-paths" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;">
        <g stroke="color-mix(in srgb, var(--orchestrator) 22%, transparent)" stroke-width="1.2" fill="none" stroke-dasharray="2 3" opacity=".85">
          <path class="path-helix-planning" d="M 50% 38% L 22% 22%"/>
          <path class="path-helix-engineering" d="M 50% 38% L 78% 22%"/>
          <path class="path-helix-quality" d="M 50% 38% L 22% 78%"/>
          <path class="path-helix-knowledge" d="M 50% 38% L 78% 78%"/>
        </g>
        <g stroke="color-mix(in srgb, var(--line) 70%, transparent)" stroke-width="1" fill="none" opacity=".45">
          <path class="walk-h" d="M 8% 50% L 92% 50%"/>
          <path class="walk-v" d="M 50% 12% L 50% 92%"/>
        </g>
      </svg>
      <div class="glass-partition glass-a" aria-hidden="true" style="position:absolute;left:50%;top:10%;width:0;height:64%;border-left:1px solid rgba(120,130,160,.12);backdrop-filter:blur(1px);z-index:1;"></div>
      <div class="glass-partition glass-b" aria-hidden="true" style="position:absolute;left:10%;top:50%;width:80%;height:0;border-top:1px solid rgba(120,130,160,.12);backdrop-filter:blur(1px);z-index:1;"></div>`

    const canvasInner = `
      ${floorBackdrop}
      ${demoBanner}
      ${edgeSVG(edges)}
      <div class="office-plan" style="position:relative;z-index:2;display:grid;grid-template-columns:1fr 1.05fr 1fr;grid-template-rows:auto auto auto auto auto;gap:18px 16px;padding:26px 20px 22px;align-items:stretch;">

        <div class="zone zone-planning" data-zone="planning" style="position:relative;grid-column:1;grid-row:1 / span 2;min-height:240px;">
          ${zoneLabel('PLANNING', '规划工作室', 'Planning Studio')}
          <div style="display:grid;gap:12px;padding-top:18px;height:100%;">
            ${workstationShell('planning-product', 'product', 'planning')}
            ${workstationShell('planning-architect', 'architect', 'planning')}
          </div>
        </div>

        <div class="zone zone-helix-hub" data-zone="helix-hub" style="position:relative;grid-column:2;grid-row:1 / span 3;min-height:360px;">
          ${zoneLabel('HELIX', '指挥中枢', 'Command Hub')}
          <div style="display:grid;place-items:center;padding-top:22px;height:calc(100% - 22px);">
            ${renderHelix({ ...snapshot, slot: helixSlotHtml }, mode)}
          </div>
        </div>

        <div class="zone zone-engineering" data-zone="engineering" style="position:relative;grid-column:3;grid-row:1 / span 2;min-height:240px;">
          ${zoneLabel('ENGINEERING', '工程站', 'Engineering Pod')}
          <div style="display:grid;gap:12px;padding-top:18px;height:100%;">
            ${workstationShell('eng-frontend', 'frontend', 'engineering')}
            ${workstationShell('eng-backend', 'backend', 'engineering')}
          </div>
        </div>

        <div class="zone zone-quality" data-zone="quality" style="position:relative;grid-column:1;grid-row:3 / span 2;min-height:240px;">
          ${zoneLabel('QUALITY', '质检工作室', 'Quality Studio')}
          <div style="display:grid;gap:12px;padding-top:18px;height:100%;">
            ${workstationShell('qa-qa', 'qa', 'quality')}
            ${workstationShell('qa-reviewer', 'reviewer', 'quality')}
          </div>
        </div>

        <div class="zone zone-knowledge" data-zone="knowledge" style="position:relative;grid-column:3;grid-row:3 / span 2;min-height:240px;">
          ${zoneLabel('KNOWLEDGE', '文档角', 'Knowledge Corner')}
          <div style="display:grid;gap:12px;padding-top:18px;height:100%;">
            ${workstationShell('docs-docs', 'docs', 'knowledge')}
          </div>
        </div>

        ${humanAreaBlock}
      </div>
      ${taskBlock}

      <style>
        @media (max-width:1024px){
          .v2-canvas .office-plan{grid-template-columns:1fr 1fr;grid-template-rows:auto auto auto auto auto auto;gap:14px 12px;padding:18px 14px 16px;}
          .v2-canvas .zone-helix-hub{grid-column:1 / -1;grid-row:1;min-height:300px;}
          .v2-canvas .zone-planning{grid-column:1;grid-row:2 / span 2;}
          .v2-canvas .zone-engineering{grid-column:2;grid-row:2 / span 2;}
          .v2-canvas .zone-quality{grid-column:1;grid-row:4 / span 2;}
          .v2-canvas .zone-knowledge{grid-column:2;grid-row:4 / span 2;}
          .v2-canvas .zone-human-area{grid-row:6;}
          .v2-canvas .task-strip{grid-row:7;}
        }
        @media (max-width:640px){
          .v2-canvas .office-plan{grid-template-columns:1fr;grid-template-rows:auto;gap:12px;padding:14px 10px 14px;}
          .v2-canvas .office-plan .zone{grid-column:1 !important;grid-row:auto !important;min-height:auto !important;}
          .v2-canvas .office-plan .zone-helix-hub{min-height:240px !important;}
          .v2-canvas .task-strip{grid-column:1 !important;grid-row:auto !important;margin:0 10px 14px;}
        }
        .v2-canvas{background:var(--canvas-floor);min-height:100%;position:relative;}
        .v2-canvas .task-card:hover{border-color:var(--accent);cursor:pointer;transition:border-color var(--dur-base) var(--ease);}
        .v2-canvas .seat{cursor:pointer;}
        .v2-canvas .task-chip:hover{border-color:var(--accent);transition:border-color var(--dur-base) var(--ease);}
        .v2-canvas .workstation:hover{box-shadow:0 6px 20px rgba(18,24,40,.14),0 1px 2px rgba(18,24,40,.05);transition:box-shadow var(--dur-base) var(--ease);}
      </style>
    `
    mount.innerHTML = canvasInner

    mount.querySelectorAll('.seat').forEach((seat) => {
      seat.addEventListener('click', () => {
        mount.querySelectorAll('.seat').forEach((s) => s.classList.remove('is-selected'))
        seat.classList.add('is-selected')
        seat.style.setProperty('outline', '2px solid var(--accent)')
        seat.style.setProperty('outline-offset', '4px')
        seat.style.setProperty('border-radius', 'var(--radius-panel)')
        mount.querySelectorAll('.seat:not(.is-selected)').forEach((s) => { s.style.outline = 'none'; s.style.outlineOffset = '0' })
        const ev = new CustomEvent('vao:seat-selected', { bubbles: true, detail: { role: seat.dataset.role } })
        mount.dispatchEvent(ev)
      })
    })
    mount.querySelectorAll('.task-card, .task-chip').forEach((card) => {
      card.addEventListener('click', () => {
        mount.querySelectorAll('.task-card, .task-chip').forEach((c) => c.style.outline = '')
        card.style.setProperty('outline', '2px solid var(--accent)')
        card.style.setProperty('outline-offset', '2px')
        const ev = new CustomEvent('vao:task-selected', { bubbles: true, detail: { taskId: card.dataset.task } })
        mount.dispatchEvent(ev)
      })
    })

    return {
      mode,
      mount,
      update(nextSnapshot) {
        attach(mount, { snapshot: nextSnapshot, mode })
      },
      destroy() {
        mount.innerHTML = ''
        mount.classList.remove('v2-canvas')
      },
    }
  }

  const api = Object.freeze({
    attach,
    officeMode,
    _internals: { taskCard, humanWaitingCard, edgeSVG, DEMO_TASKS, DEMO_EDGES, DEMO_PORT_COUNTS, DEMO_SEAT_STATES, DEMO_SEAT_KIND, DEMO_SEAT_MEMBER, DEMO_SEAT_MODEL, HELIX_INDEX },
  })
  globalThis.VAOCoreOffice = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
