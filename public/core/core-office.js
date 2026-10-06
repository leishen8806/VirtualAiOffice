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

  // Demo / fake data for canvas when no runtime snapshot loaded yet (§19: rehearsal fixtures, not live).
  const DEMO_SEAT_STATES = {
    helix: 'THINKING',
    product: 'IDLE',
    architect: 'THINKING',
    frontend: 'WORKING',
    backend: 'WORKING',
    qa: 'IDLE',
    reviewer: 'REVIEWING',
    docs: 'IDLE',
  }
  const DEMO_SEAT_KIND = {
    helix: 'system',
    product: 'human',
    architect: 'ai',
    frontend: 'ai',
    backend: 'ai',
    qa: 'human',
    reviewer: 'human',
    docs: 'ai',
  }
  const DEMO_SEAT_MEMBER = {
    product: '李产品',
    architect: 'Codex',
    frontend: 'Claude 4.5 Sonnet',
    backend: 'DeepSeek V3',
    qa: '王测试',
    reviewer: '张审查',
    docs: 'Gemini 2.5 Flash',
  }
  const DEMO_SEAT_MODEL = {
    architect: 'o3-mini',
    frontend: 'Claude',
    backend: 'DeepSeek',
    docs: 'Gemini',
  }
  const DEMO_PORT_COUNTS = Object.freeze({
    Requirements: 3, Tasks: 8, Executions: 5, Reviews: 2, Evidence: 11, 'Human Actions': 1,
  })

  const DEMO_TASKS = Object.freeze([
    {
      id: 'T-101', title: 'Core Shell 布局脚手架', status: 'done', difficulty: '易', kind: '开发',
      role: 'frontend', who: '前端工程师', whoId: 'frontend',
      evidence: [{ kind: 'build', state: 'pass', sha: 'a31f' }, { kind: 'test', state: 'pass', sha: 'a31f' }],
      deps: [],
    },
    {
      id: 'T-104', title: 'Helix 6 端口可视数据接入', status: 'running', difficulty: '中', kind: '开发',
      role: 'backend', who: '后端工程师', whoId: 'backend',
      evidence: [{ kind: 'build', state: 'pass' }, { kind: 'test', state: 'missing' }],
      deps: ['T-101'],
    },
    {
      id: 'T-105', title: 'Office Canvas 8 座位栅格布局', status: 'running', difficulty: '中', kind: '开发',
      role: 'frontend', who: '前端工程师', whoId: 'frontend',
      evidence: [{ kind: 'build', state: 'pass' }, { kind: 'review', state: 'stale', sha: '55b1' }],
      deps: ['T-101'],
    },
    {
      id: 'T-110', title: 'V2-A 可视化验收清单', status: 'pending', difficulty: '中', kind: '审查',
      role: 'reviewer', who: '审查员', whoId: 'reviewer',
      evidence: [],
      deps: ['T-104', 'T-105'],
    },
    {
      id: 'T-112', title: '等待人类：确认设计规格 §5.1 颜色 token', status: 'pending', difficulty: '易', kind: 'human',
      role: 'product', who: '产品经理', whoId: 'product', sinceMs: Date.now() - 14 * 60 * 1000, required: true,
      evidence: [{ kind: 'human', state: 'missing' }],
      deps: [],
    },
  ])

  const DEMO_EDGES = [
    ['T-101', 'T-104', 'ready'],
    ['T-101', 'T-105', 'ready'],
    ['T-104', 'T-110', 'waiting'],
    ['T-105', 'T-110', 'waiting'],
  ]

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
      member: task.who ? DEMO_SEAT_MEMBER[task.whoId] || undefined : undefined,
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

  function renderSeatRow(snapshot, roleIds, opts = {}) {
    return roleIds.map((rid) => {
      if (rid === 'helix') return ''
      const seatState = snapshot?.seatStates?.[rid] || DEMO_SEAT_STATES[rid] || 'IDLE'
      const kind = snapshot?.seatKinds?.[rid] || DEMO_SEAT_KIND[rid]
      const memberName = snapshot?.seatMembers?.[rid] || DEMO_SEAT_MEMBER[rid]
      const model = snapshot?.seatModels?.[rid] || DEMO_SEAT_MODEL[rid]
      const seatOpts = { state: seatState, kind, memberName, model, slot: opts.slots?.[rid] }
      return C?.renderSeat(rid, seatOpts) || ''
    }).join('')
  }

  function renderHelix(snapshot) {
    const state = snapshot?.seatStates?.helix || DEMO_SEAT_STATES.helix || 'THINKING'
    const kind = 'system'
    return C?.renderHelixCore({
      state,
      kind,
      memberName: 'Helix',
      portCounts: snapshot?.portCounts || DEMO_PORT_COUNTS,
    }) || ''
  }

  /**
   * Office Canvas attach.
   * @param {HTMLElement} mount Canvas mount element (typically #office-canvas).
   * @param {{ snapshot?: any }} opts
   */
  function attach(mount, opts = {}) {
    if (!mount) throw new Error('VAOCoreOffice.attach: mount element required')
    if (!C || !S) throw new Error('VAOCoreOffice: missing VAOCoreCharacters / VAOCoreStates (load order)')

    mount.classList.add('v2-canvas')
    const snapshot = opts.snapshot || null

    const ringRoles = ROLES.filter((r) => r.id !== 'helix').map((r) => r.id)
    const tasks = snapshot?.tasks || DEMO_TASKS
    const edges = snapshot?.edges || DEMO_EDGES
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

    const helixSlotHtml = waitingHuman.length ? `<div style="padding-top:10px;display:grid;gap:6px;min-width:240px;">${waitingHuman.slice(0, 2).map(humanWaitingCard).join('')}</div>` : ''

    const canvasInner = `
      ${edgeSVG(edges)}
      <div class="canvas-grid" style="position:relative;z-index:2;display:grid;grid-template-columns:repeat(3, 1fr);grid-template-rows:auto auto auto;gap:24px 20px;padding:28px 20px 40px;align-items:start;">
        <div class="zone zone-planning" data-zone="planning" style="grid-column:1;grid-row:1;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['product'], { slots: seatSlots })}
        </div>
        <div class="zone zone-human" data-zone="human" style="grid-column:2;grid-row:1;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['architect'], { slots: seatSlots })}
        </div>
        <div class="zone zone-docs-top" data-zone="docs-top" style="grid-column:3;grid-row:1;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['reviewer'], { slots: seatSlots })}
        </div>
        <div class="zone zone-build-left" data-zone="build-left" style="grid-column:1;grid-row:2;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['frontend'], { slots: seatSlots })}
        </div>
        <div class="zone zone-helix" data-zone="helix" style="grid-column:2;grid-row:2;display:flex;justify-content:center;">
          ${renderHelix({ ...snapshot, slot: helixSlotHtml })}
        </div>
        <div class="zone zone-build-right" data-zone="build-right" style="grid-column:3;grid-row:2;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['backend'], { slots: seatSlots })}
        </div>
        <div class="zone zone-verify" data-zone="verify" style="grid-column:1;grid-row:3;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['qa'], { slots: seatSlots })}
        </div>
        <div class="zone zone-docs" data-zone="docs" style="grid-column:3;grid-row:3;display:flex;justify-content:center;">
          ${renderSeatRow(snapshot, ['docs'], { slots: seatSlots })}
        </div>
      </div>
      <section class="canvas-rail" style="padding:0 20px 28px;display:grid;gap:16px;">
        <div class="rail-head" style="display:flex;justify-content:space-between;align-items:baseline;">
          <h3 style="margin:0;font-size:14px;font-weight:700;color:var(--text);letter-spacing:.02em;">任务看板 · Kanban</h3>
          <span style="font-size:12px;color:var(--text-muted);">${tasks.length} 项 · ${waitingHuman.length} 项等待人类</span>
        </div>
        <div class="rail-tasks" style="display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">
          ${tasks.map(taskCard).join('')}
        </div>
      </section>
      <style>
        @media (max-width:1024px){
          .v2-canvas .canvas-grid{grid-template-columns:repeat(4,1fr);grid-template-rows:auto auto auto;}
          .v2-canvas .zone-helix{grid-column:1 / -1;grid-row:1;}
          .v2-canvas [data-zone="planning"],.v2-canvas [data-zone="human"],.v2-canvas [data-zone="docs-top"],.v2-canvas [data-zone="build-left"]{grid-row:2;}
          .v2-canvas [data-zone="build-right"],.v2-canvas [data-zone="verify"],.v2-canvas [data-zone="docs"],.v2-canvas [data-zone="build-left"]~[data-zone]{grid-row:3;}
        }
        @media (max-width:640px){
          .v2-canvas .canvas-grid{grid-template-columns:1fr;grid-template-rows:auto;gap:12px;padding:12px 10px 18px;}
          .v2-canvas .zone{grid-column:1 !important;grid-row:auto !important;}
          .v2-canvas .canvas-rail{padding:0 10px 18px;}
          .v2-canvas .canvas-rail .rail-tasks{grid-template-columns:1fr;}
        }
        .v2-canvas{background:
          linear-gradient(var(--canvas-floor),var(--canvas-floor)),
          repeating-linear-gradient(0deg,transparent 0 47px,var(--canvas-grid) 47px 48px),
          repeating-linear-gradient(90deg,transparent 0 47px,var(--canvas-grid) 47px 48px);
        background-blend-mode:normal;min-height:100%;}
        .v2-canvas .task-card:hover{border-color:var(--accent);cursor:pointer;transition:border-color var(--dur-base) var(--ease);}
        .v2-canvas .seat{cursor:pointer;}
        .v2-canvas .seat:hover .nameplate{border-color:var(--accent);transition:border-color var(--dur-base) var(--ease);}
      </style>
    `
    mount.innerHTML = canvasInner

    // Selection handlers (seat/task)
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
    mount.querySelectorAll('.task-card').forEach((card) => {
      card.addEventListener('click', () => {
        mount.querySelectorAll('.task-card').forEach((c) => c.style.outline = '')
        card.style.setProperty('outline', '2px solid var(--accent)')
        card.style.setProperty('outline-offset', '2px')
        const ev = new CustomEvent('vao:task-selected', { bubbles: true, detail: { taskId: card.dataset.task } })
        mount.dispatchEvent(ev)
      })
    })

    return {
      mount,
      update(nextSnapshot) {
        attach(mount, { snapshot: nextSnapshot })
      },
      destroy() {
        mount.innerHTML = ''
        mount.classList.remove('v2-canvas')
      },
    }
  }

  const api = Object.freeze({
    attach,
    _internals: { taskCard, humanWaitingCard, edgeSVG, DEMO_TASKS, DEMO_EDGES, DEMO_PORT_COUNTS, DEMO_SEAT_STATES, DEMO_SEAT_KIND, DEMO_SEAT_MEMBER, DEMO_SEAT_MODEL, HELIX_INDEX },
  })
  globalThis.VAOCoreOffice = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
