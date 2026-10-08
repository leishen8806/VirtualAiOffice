/* Wires the page to the Helix orchestrator server (Server-Sent Events) or, when there is no server, to the demo. */
;(function () {
  'use strict'

  const $ = (s) => document.querySelector(s)
  const AGENT_STATUS = { idle: '待命', thinking: '思考中', working: '干活中', meeting: '开会中', walking: '派活中', done: '刚完成', error: '出错了', offline: '不在岗' }
  const TASK_STATUS = { pending: '排队', running: '进行中', done: '完成', failed: '失败', skipped: '跳过', cancelled: '取消' }
  const KIND = { code: '开发', review: '审查', research: '调研', fix: '返工', verify: '验收' }
  const DIFF = { hard: '难', medium: '中', easy: '易' }
  const TOOL_ZH = { browser: '浏览器', desktop: '电脑操作' }
  const SUGGEST = {
    live: ['帮我做一个记账小网站', '把这个项目整理得专业一点', '找找有没有 bug 并修掉', '/工具', '/团队', '/招人 数据库专家'],
    demo: ['帮我做一个待办清单 App', '/招人 数据库专家', '/工具', '/团队'],
  }

  const state = { mode: 'live', roster: { groups: [], employees: [] }, agents: {}, tasks: [], messages: [], busy: false, round: 0, iteration: 0, workdir: '', meeting: null, lastCommit: null }
  const openTasks = new Set()
  const faces = new Map()
  let transport = null

  function statusToV2(s) {
    return { idle: 'IDLE', thinking: 'THINKING', working: 'WORKING', meeting: 'REVIEWING', reviewing: 'REVIEWING', review: 'REVIEWING', walking: 'WORKING', done: 'DONE', error: 'BLOCKED', blocked: 'BLOCKED', offline: 'OFFLINE' }[s] || 'IDLE'
  }
  const OFFICIAL_ROLE_SET = Object.freeze({ helix: 1, product: 1, architect: 1, frontend: 1, backend: 1, qa: 1, reviewer: 1, docs: 1, human: 1 })
  const ROLE_ALIASES = Object.freeze({
    qa: 'qa', tester: 'qa', 'quality-assurance': 'qa', test: 'qa',
    docs: 'docs', documentation: 'docs', writer: 'docs', 'technical-writer': 'docs',
    product: 'product', pm: 'product', 'product-manager': 'product',
    architect: 'architect', 'architecture': 'architect',
    frontend: 'frontend', front: 'frontend', 'front-end': 'frontend',
    backend: 'backend', back: 'backend', 'back-end': 'backend', infra: 'backend',
    reviewer: 'reviewer', review: 'reviewer',
  })
  function normalizeRoleId(raw) {
    if (!raw) return null
    const s = String(raw).trim().toLowerCase().replace(/[\s_]+/g, '-')
    if (!s) return null
    if (OFFICIAL_ROLE_SET[s]) return s
    if (ROLE_ALIASES[s]) return ROLE_ALIASES[s]
    return null
  }
  function resolveVisualRoleForEmployee(employee) {
    if (!employee) return null
    let r = normalizeRoleId(employee.visualRole)
    if (r) return r
    r = normalizeRoleId(employee.role)
    if (r) return r
    if (employee.skill && typeof employee.skill === 'object') r = normalizeRoleId(employee.skill.id)
    if (r) return r
    r = normalizeRoleId(employee.skill)
    if (r) return r
    r = normalizeRoleId(employee.id)
    if (r) return r
    if (typeof employee.alias === 'string' || Array.isArray(employee.aliases)) {
      const list = Array.isArray(employee.aliases) ? employee.aliases : (employee.alias ? [employee.alias] : [])
      for (const x of list) {
        r = normalizeRoleId(x)
        if (r) return r
      }
    }
    return null
  }
  function resolveVisualRoleForTask(t) {
    if (!t) return null
    let r = normalizeRoleId(t.role)
    if (r) return r
    const empId = t.agent || t.agentId || t.empId || t.whoId
    const employee = emp(empId)
    r = resolveVisualRoleForEmployee(employee)
    if (r) return r
    const kindToRole = { review: 'reviewer' }
    if (kindToRole[t.kind]) return kindToRole[t.kind]
    return null
  }
  function deriveCoreRuntimeFromState() {
    const Shell = globalThis.VAOCoreShell
    const mode = state.mode === 'fake' ? 'fake' : state.mode === 'demo' ? 'demo' : 'live'
    const groups = state.roster.groups || []
    const employees = state.roster.employees || []
    const runtimeStatus = state.mode === 'fake' ? 'fake' : state.mode === 'demo' ? 'demo' : (transport && transport.status === 'live') ? 'live' : 'connecting'
    const workspaceName = groups.length ? '智序工场 · 工作区' : '当前工作区'
    const projectName = state.workdir ? (state.workdir.split(/[\\/]/).filter(Boolean).pop() || state.workdir) : '未指定项目'

    const members = { human: [], ai: [] }
    const seatStates = { helix: statusToV2('thinking') }
    const seatKinds = { helix: 'system' }
    const seatMembers = { helix: 'Helix' }
    const seatModels = {}
    for (const e of employees) {
      const role = resolveVisualRoleForEmployee(e)
      if (!role) continue
      // Honor existing runtime semantics: employees are AI unless explicitly .human=true or role is product/qa/reviewer + human flag.
      const humanFlag = e.human || e.kind === 'human' || e.isHuman
      const aiFlag = !humanFlag
      const member = { id: e.id, name: e.name || e.id, role, model: e.model || '', online: e.available !== false && statusToV2(state.agents[e.id]?.status || 'idle') !== 'OFFLINE' }
      if (aiFlag) members.ai.push(member)
      else members.human.push(member)
      seatKinds[role] = seatKinds[role] || (aiFlag ? 'ai' : 'human')
      seatMembers[role] = seatMembers[role] || e.name || e.id
      if (e.model) seatModels[role] = seatModels[role] || e.model
      const st = state.agents[e.id]?.status
      if (st) seatStates[role] = seatStates[role] || statusToV2(st)
    }
    const waitingHuman = []
    if (state.tasks?.length) for (const t of state.tasks) {
      if (t.kind === 'human' || t.status === 'waiting' || t.waiting === true) {
        const role = resolveVisualRoleForTask(t) || (typeof t.role === 'string' ? normalizeRoleId(t.role) : null) || 'human'
        const member = t.member || (t.who || t.whoId || (role && seatMembers[role]))
        waitingHuman.push({ id: `wait-${t.id || String(Math.random()).slice(2, 8)}`, role, member, title: t.title || '等待人工确认', sinceMs: t.sinceMs || Date.now(), required: !!t.required })
      }
    }
    const runtime = {
      workspace: { id: '', name: workspaceName, path: state.workdir || '' },
      project: { id: '', name: projectName },
      members,
      runtimeStatus,
      waitingHuman,
    }
    const conversation = []
    if (state.messages?.length) {
      for (const m of state.messages.slice(-30)) {
        const text = m.text || m.content || ''
        if (!text) continue
        if (m.from === 'shaniu' || m.role === 'orchestrator' || m.from === 'orchestrator' || m.from === 'coordinator' || m.fromId === 'shaniu') {
          conversation.push({ who: 'Helix', side: 'helix', text, at: m.at })
        } else if (m.from === 'user' || m.role === 'user' || !m.from) {
          conversation.push({ who: '你', side: 'user', text, at: m.at })
        } else {
          conversation.push({ who: m.from || '员工', side: 'helix', text: `[${m.from || '员工'}] ${text}`, at: m.at })
        }
      }
    }
    const decisions = []
    if (state.meeting?.items?.length) {
      for (const it of state.meeting.items.slice(0, 5)) decisions.push((it.title || it.text || String(it)).slice(0, 80))
    } else if (state.lastCommit) decisions.push(`最近存档：${String(state.lastCommit).slice(0, 12)}`)
    const recent = []
    for (const t of (state.tasks || []).slice(-8)) {
      if (t.at || t.statusAt) recent.push({ at: t.at || t.statusAt, text: `${t.id || ''} ${t.title || ''} · ${AGENT_STATUS[t.status] || t.status || ''}`.trim() })
    }
    const helix = {
      state: seatStates.helix || (runtimeStatus === 'live' ? 'THINKING' : 'IDLE'),
      header: { label: 'HELIX', zh: '系统编排中枢', en: 'System Orchestrator' },
      conversation,
      summary: state.meeting?.summary || (state.busy ? '正在处理本轮任务，等待员工响应…' : (runtimeStatus === 'connecting' ? '连接中。说点什么开始工作。' : '待机中，准备好接收新任务。')),
      decisions,
      waiting: waitingHuman,
      recent: recent.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10),
    }
    const v2Tasks = []
    if (state.tasks?.length) for (const t of state.tasks) {
      const role = resolveVisualRoleForTask(t) || ''
      const whoId = t.agent || t.agentId || t.empId || t.whoId
      const who = t.who || (whoId ? emp(whoId)?.name : '')
      const v2 = {
        id: t.id,
        title: t.title || t.text || '',
        status: ({ running: 'running', pending: 'pending', done: 'done', failed: 'failed', skipped: 'offline', cancelled: 'offline' }[t.status] || 'pending'),
        difficulty: DIFF[t.difficulty] || t.difficulty || '中',
        kind: KIND[t.kind] || t.kind || '开发',
        role,
        who,
        whoId,
        evidence: [],
        deps: t.deps || [],
      }
      if (t.sinceMs || t.waiting === true || t.kind === 'human') { v2.sinceMs = t.sinceMs || Date.now(); v2.required = !!t.required }
      v2Tasks.push(v2)
    }
    const seatSnapshot = { seatStates, seatKinds, seatMembers, seatModels, tasks: v2Tasks, edges: [] }
    return { mode, runtime, helix, snapshot: seatSnapshot }
  }

  // ---- skins -------------------------------------------------------------------
  // 二次元皮肤用 anime.js（SVG），像素复古用 office.js（canvas）；两者接口一样，可以随时切换。
  // 自制皮肤在一套内置皮肤（base）的基础上改颜色、图片和摆设：存在 ~/.niuma/skins（有服务器时），
  // 或者存在这个浏览器里（网页演示）。格式和检查见 skin-format.js。
  const F = window.NiumaSkinFormat
  const V2_CORE_ID = 'core'
  const CLASSIC_IDS = ['sakura', 'night', 'neon', 'neko', 'pixel']
  const IS_CORE = (id) => id === V2_CORE_ID
  const IS_CLASSIC = (id) => CLASSIC_IDS.includes(id)
  const BUILTIN = [
    ['core', '智序 · Core'],
    ['sakura', '樱花 · Classic'],
    ['night', '夜班 · Classic'],
    ['neon', '赛博霓虹 · Classic'],
    ['neko', '猫耳咖啡 · Classic'],
    ['pixel', '像素复古 · Classic'],
  ]
  const LOCAL_SKINS = 'niuma.localSkins'
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v)
        return localStorage.getItem(k) === v
      } catch {
        return false
      }
    },
  }
  const clean = (skin) => {
    const { warnings, file, ...rest } = skin
    return rest
  }
  function readLocalSkins() {
    try {
      return JSON.parse(store.get(LOCAL_SKINS) || '[]').map((raw) => ({ ...F.normalize(raw), local: true }))
    } catch {
      return []
    }
  }
  let customSkins = readLocalSkins()
  let skinErrors = []
  let skinDir = ''
  const skinDef = (id) => {
    const b = BUILTIN.find(([bid]) => bid === id)
    return b ? { id, name: b[1], base: id, builtin: true } : customSkins.find((sk) => sk.id === id) || null
  }
  const prefersDark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
  const wantedSkin = [new URLSearchParams(location.search).get('skin'), store.get('niuma.skin')].find(Boolean) || ''
  let current = skinDef(wantedSkin) || skinDef(V2_CORE_ID) || skinDef(prefersDark() ? 'night' : 'sakura')
  // 想要的是 ~/.niuma/skins 里的皮肤：等连上服务器读到了再换过去
  let pendingSkin = current.id === wantedSkin ? null : wantedSkin || null
  let setVars = []
  let coreHandle = null

  function applyVars(def) {
    const root = document.documentElement
    for (const k of setVars) root.style.removeProperty(k)
    setVars = []
    if (def.builtin) return
    const vars = F.cssVars(def)
    if (def.font) vars['--font-display'] = `"${def.font}", var(--font-body)`
    vars['color-scheme'] = def.dark ? 'dark' : 'light'
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v)
      setVars.push(k)
    }
  }

  function destroyCoreShell() {
    try { coreHandle?.destroy?.() } catch {}
    coreHandle = null
    globalThis.__coreHandleV2 = null
    // Remove V1 (Core old) + V2 (Interactive Office V2) style nodes so classic CSS tokens are clean.
    const styleIds = ['core-shell-css', 'v2-shell-css', 'core-chars-v2-css', 'core-theme-style']
    for (const id of styleIds) {
      const n = document.getElementById(id)
      if (n) n.remove()
    }
    document.documentElement.removeAttribute('data-theme-core')
    document.documentElement.removeAttribute('data-appearance')
    document.body.classList.remove('v2-core-shell', 'v2-shell-body', 'v2-nav-collapsed', 'v2-nav-open', 'v2-helix-open')
  }

  function restoreClassicLayoutScaffold() {
    // If destroyed by Core bootstrap, restore the .app skeleton nodes (empty) used by legacy renderers.
    // Classic themes (anime/office/pixel) keep their art; visible copy updated to Helix branding per Fix 5.
    // Compat ids (shaniu, niuma*) internally preserved.
    if (document.querySelector('.app')) return
    const app = document.createElement('div')
    app.className = 'app'
    app.innerHTML = `
      <header class="top">
        <div class="brand">
          <span class="wordmark">智序工场</span>
          <span class="wordmark-sub">Virtual AI Office · Helix</span>
          <span class="tagline">人类与 AI，共同把事情做完</span>
        </div>
        <button type="button" id="open-setup" class="btn-setup" aria-label="接入员工或模型配置">接入员工</button>
        <div class="skins" id="skins" role="group" aria-label="切换皮肤/主题"></div>
        <div class="conn">
          <span id="conn" class="pill pill-wait">连接中…</span>
          <code id="workdir" class="workdir"></code>
        </div>
      </header>
      <main class="layout">
        <section class="stage-wrap" aria-label="智序工场 · 虚拟办公室">
          <div class="stage">
            <div class="scene" id="scene">
              <canvas id="office" width="404" height="216" role="img" aria-label="智序工场：Helix 位于中央，各项目组的员工坐在两边的工位上"></canvas>
              <div class="overlay" id="overlay" aria-hidden="true"></div>
            </div>
          </div>
          <div class="team" id="team" aria-label="项目组和员工"></div>
        </section>
        <aside class="chat" aria-label="与 Helix 对话">
          <div class="panel-head">
            <h2>和 Helix 说</h2>
            <button type="button" id="stop" class="btn-stop" hidden>全部停下</button>
          </div>
          <div id="banner" class="banner" hidden></div>
          <div id="messages" class="messages" aria-live="polite"></div>
          <div class="suggest" id="suggest"></div>
          <form id="composer" class="composer">
            <label for="input" class="sr-only">给 Helix 的消息</label>
            <textarea id="input" rows="2" placeholder="跟 Helix 说说要做什么，说的模糊也没关系：他会开会、拆任务、派给合适的员工，做完自己验收"></textarea>
            <button type="submit" id="send" class="btn-send">发送</button>
          </form>
          <p class="hint">Enter 发送 · Shift+Enter 换行 · <code>@员工</code> 点名 · <code>/招人</code> <code>/工具</code> <code>/团队</code> <code>/撤销</code> <code>/stop</code></p>
        </aside>
        <section class="board" aria-label="任务板">
          <div class="panel-head">
            <h2>任务板</h2>
            <span id="round" class="round"></span>
            <button type="button" id="undo" class="btn-ghost" hidden>撤销上一轮</button>
          </div>
          <div id="meeting" class="meeting-card" hidden></div>
          <ol id="tasks" class="tasks"></ol>
          <p id="tasks-empty" class="empty">还没有任务。跟 Helix 说说要做什么，说得模糊也没关系：他会开会、拆任务、派给合适的员工，做完自己验收。</p>
        </section>
      </main>
    `
    document.body.appendChild(app)
    // Re-bind one-shot listeners that live outside renderSkins.
    const composer = document.getElementById('composer')
    composer?.addEventListener('submit', (e) => {
      e.preventDefault()
      const text = document.getElementById('input').value
      document.getElementById('input').value = ''
      send(text)
    })
    const input = document.getElementById('input')
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault()
        composer?.requestSubmit()
      }
    })
    document.getElementById('stop')?.addEventListener('click', () => transport && transport.stop().catch(() => {}))
    document.getElementById('open-setup')?.addEventListener('click', () => window.NiumaSetup?.open({ request: transport?.request || null, fake: state.mode === 'fake' }))
    document.getElementById('team')?.addEventListener('click', (e) => {
      if (e.target.closest('.add-staff')) window.NiumaSetup?.open({ request: transport?.request || null, fake: state.mode === 'fake' })
    })
    document.getElementById('skins')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-skin]')
      if (b) setSkin(b.dataset.skin)
      if (e.target.closest('[data-act="make-skin"]')) window.NiumaSkinEditor?.open()
    })
    document.getElementById('undo')?.addEventListener('click', () => send('/撤销'))
    renderSkins()
  }

  function refreshCoreHandle() {
    if (!coreHandle) return
    const derived = deriveCoreRuntimeFromState()
    coreHandle.update({ runtime: derived.runtime, helix: derived.helix, snapshot: derived.snapshot })
  }

  function makeOffice(def) {
    const root = document.documentElement
    destroyCoreShell()
    restoreClassicLayoutScaffold()
    if (IS_CORE(def.id)) {
      // Core V2 branch: VAOCoreShellV2 (Interactive Office V2 · 6-zone 2.5D) owns rendering.
      // VAOCoreShellV2.bootstrap({mode,runtime,helix,snapshot,...}) shares the deriveCoreRuntimeFromState()
      // payload shape with old VAOCoreShell so no duplication of runtime state.
      root.removeAttribute('data-skin')
      root.removeAttribute('data-skin-id')
      for (const k of setVars) root.style.removeProperty(k)
      setVars = []
      const Shell = globalThis.VAOCoreShellV2
      if (!Shell) return null
      const derived = deriveCoreRuntimeFromState()
      coreHandle = Shell.bootstrap({
        mode: derived.mode,
        runtime: derived.runtime,
        helix: derived.helix,
        snapshot: derived.snapshot,
        initialNav: 'office',
        onThemeChange: (id) => setSkin(id),
        onConversationSend: (t) => send(t),
        onNavigate: (id) => {},
        onPickRole: (rid) => {},
        onPickTask: (tid) => {},
        onDemoToggle: (on) => { try { localStorage.setItem('niuma.demo.v2', on ? '1' : '0') } catch (_) {} },
        onDemoStateVisual: (sid) => coreHandle?.applyDemoStateVisual?.(sid),
      })
      globalThis.__coreHandleV2 = coreHandle
      return {
        destroy: () => destroyCoreShell(),
        setRoster() { refreshCoreHandle() },
        setAgent() { refreshCoreHandle() },
        setTasks() { refreshCoreHandle() },
        meeting() { refreshCoreHandle() },
        say() { refreshCoreHandle() },
        dispatch() { refreshCoreHandle() },
        activity() { refreshCoreHandle() },
        portrait: () => '',
      }
    }
    // Legacy classic branch: anime.js (SVG) or office.js (canvas pixel).
    root.dataset.skin = def.base
    root.dataset.skinId = def.id
    applyVars(def)
    if (def.base === 'pixel' || !window.AnimeOffice) return new window.ShaniuOffice($('#office'), $('#overlay'), $('#scene'))
    return new window.AnimeOffice($('#scene'), $('#overlay'), def.builtin ? def.id : def)
  }
  let office = makeOffice(current)

  /** 换画面（不记住选择；编辑器预览也走这里） */
  function showSkin(def) {
    office.destroy?.()
    office = makeOffice(def)
    faces.clear()
    office.setRoster(state.roster)
    for (const [aid, a] of Object.entries(state.agents)) office.setAgent(aid, a)
    office.setTasks(state.tasks)
    if (state.meeting?.status === 'open') office.meeting(state.meeting)
    renderTeam()
    renderMessages()
  }

  function setSkin(id) {
    const def = skinDef(id)
    if (!def) {
      pendingSkin = id
      return false
    }
    pendingSkin = null
    current = def
    store.set('niuma.skin', id)
    showSkin(def)
    renderSkins()
    return true
  }

  function renderSkins() {
    const box = $('#skins')
    if (!box) return
    const btn = (d, cls = '') => `<button type="button" data-skin="${esc(d.id)}"${cls} aria-pressed="${d.id === current.id}">${esc(d.name)}</button>`
    const coreBuiltin = BUILTIN.find(([id]) => id === V2_CORE_ID)
    const classicBuiltins = BUILTIN.filter(([id]) => id !== V2_CORE_ID)
    box.innerHTML =
      '<span class="skins-label">皮肤</span>' +
      (coreBuiltin ? `<span class="skins-group">${btn({ id: coreBuiltin[0], name: coreBuiltin[1] }, ' core-builtin')}</span>` : '') +
      '<span class="skins-group skins-group-classic" style="margin-left:2px;border-left:1px solid var(--edge);padding-left:8px;"><em class="skins-group-title" style="font-style:normal;font-size:10.5px;color:var(--muted);letter-spacing:.08em;margin-right:2px;">经典主题</em>' +
      classicBuiltins.map(([id, name]) => btn({ id, name })).join('') +
      '</span>' +
      customSkins.map((d) => btn(d, ` class="custom" title="自制皮肤${d.author ? ` · ${esc(d.author)}` : ''}"`)).join('') +
      `<button type="button" class="make-skin" data-act="make-skin">${current.builtin ? '＋ 做皮肤' : '✎ 改皮肤'}</button>`
  }

  /** 读一遍自制皮肤（~/.niuma/skins + 这个浏览器里的）。手改了皮肤文件，回到窗口就会重新读。 */
  let skinsLoading = null
  function loadSkins() {
    skinsLoading ||= (async () => {
      let files = []
      if (transport?.request) {
        try {
          const r = await transport.request('GET', '/api/skins')
          files = (r.skins || []).flatMap((raw) => {
            try {
              return [{ ...F.normalize(raw, { id: raw.id }), id: raw.id }]
            } catch {
              return []
            }
          })
          skinErrors = r.errors || []
          skinDir = r.dir || ''
        } catch {}
      }
      const local = readLocalSkins().filter((l) => !files.some((f) => f.id === l.id))
      const before = JSON.stringify(customSkins.map(clean))
      customSkins = [...files, ...local]
      const target = pendingSkin || (current.builtin ? null : current.id)
      if (target) {
        const def = skinDef(target)
        if (def && (pendingSkin || JSON.stringify(clean(def)) !== JSON.stringify(clean(current)))) {
          pendingSkin = null
          current = def
          showSkin(def)
        } else if (!def && pendingSkin) {
          pendingSkin = null // 要的皮肤已经不在了，就用现在这套
        } else if (!def) {
          current = skinDef(current.base) // 皮肤文件被删了
          showSkin(current)
        }
      }
      if (before !== JSON.stringify(customSkins.map(clean)) || target) renderSkins()
      window.NiumaSkinEditor?.refresh?.()
    })().finally(() => (skinsLoading = null))
    return skinsLoading
  }

  /** 读内置皮肤的界面颜色（给编辑器当起点） */
  function baseColors(base) {
    const root = document.documentElement
    const saved = { skin: root.dataset.skin, style: root.getAttribute('style') }
    root.dataset.skin = base
    root.removeAttribute('style')
    const cs = getComputedStyle(root)
    const out = {}
    for (const [k, v] of Object.entries(F.COLOR_VARS)) out[k] = cs.getPropertyValue(v).trim()
    root.dataset.skin = saved.skin
    if (saved.style) root.setAttribute('style', saved.style)
    return out
  }

  async function saveSkin(raw, { replace = false } = {}) {
    if (transport?.request) {
      const r = await transport.request('POST', '/api/skins/save', { skin: raw, replace })
      if (!r.ok) return r
      await loadSkins()
      setSkin(r.skin.id)
      return { ok: true, skin: skinDef(r.skin.id), where: r.skin.file }
    }
    // 网页演示：存在这个浏览器里
    const skin = F.normalize(raw)
    if (!replace) for (let n = 2, id = skin.id; skinDef(skin.id); n++) skin.id = `${id}-${n}`
    const list = readLocalSkins().filter((l) => l.id !== skin.id)
    list.push(skin)
    if (!store.set(LOCAL_SKINS, JSON.stringify(list.map(clean)))) return { ok: false, error: '浏览器存不下了（图片可能太大）。换小一点的图片，或者用「导出文件」存到电脑上。' }
    customSkins = [...customSkins.filter((c) => !c.local && c.id !== skin.id), ...list.map((l) => ({ ...l, local: true }))]
    setSkin(skin.id)
    return { ok: true, skin: skinDef(skin.id), where: '这个浏览器里' }
  }

  async function removeSkin(id) {
    const def = skinDef(id)
    if (!def || def.builtin) return { ok: false, error: '内置皮肤删不了' }
    if (def.local) store.set(LOCAL_SKINS, JSON.stringify(readLocalSkins().filter((l) => l.id !== id).map(clean)))
    else {
      const r = await transport.request('POST', '/api/skins/delete', { id })
      if (!r.ok) return r
    }
    customSkins = customSkins.filter((c) => c.id !== id)
    if (current.id === id) setSkin(def.base)
    await loadSkins()
    renderSkins()
    return { ok: true }
  }

  // 给皮肤编辑器和桌面版用
  window.NiumaSkin = {
    current: () => current,
    list: () => [...BUILTIN.map(([id]) => skinDef(id)), ...customSkins],
    builtin: BUILTIN,
    baseColors,
    baseRoom: (base) => window.AnimeOffice?.SKINS?.[base === 'pixel' ? 'sakura' : base] || null,
    preview: (def) => showSkin(def),
    restore: () => showSkin(current),
    set: setSkin,
    reload: loadSkins,
    save: saveSkin,
    remove: removeSkin,
    openFolder: () => (transport?.request ? transport.request('POST', '/api/skins/open-folder', {}) : Promise.resolve({ ok: false, error: '网页演示里没有皮肤文件夹' })),
    info: () => ({ server: !!transport?.request, dir: skinDir, errors: skinErrors }),
  }

  // ---- helpers ---------------------------------------------------------------

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Tiny, safe Markdown: headings, paragraphs, bullet lists, fenced code, inline code and bold.
  function md(text) {
    const out = []
    String(text ?? '')
      .split(/```[\w-]*\n?/)
      .forEach((part, i) => {
        if (i % 2) return out.push(`<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`)
        // Line by line: headings, runs of list items, and paragraphs (blank lines split paragraphs).
        let list = []
        let para = []
        const flush = () => {
          if (list.length) out.push('<ul>' + list.map((l) => `<li>${inline(l)}</li>`).join('') + '</ul>')
          if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>')
          list = []
          para = []
        }
        for (const line of part.split('\n')) {
          const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
          if (!line.trim()) flush()
          else if (/^#{1,4}\s/.test(line)) {
            flush()
            out.push(`<h3>${inline(line.replace(/^#+\s*/, ''))}</h3>`)
          } else if (item) {
            if (para.length) flush()
            list.push(item[1])
          } else {
            if (list.length) flush()
            para.push(line)
          }
        }
        flush()
      })
    return out.join('')
  }

  const clock = (ts) => new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
  const mmss = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }
  const emp = (id) => state.roster.employees.find((e) => e.id === id)
  const colorOf = (id) => (id === 'shaniu' ? 'var(--accent)' : emp(id)?.color || 'var(--muted)')

  function face(id) {
    const e = id === 'shaniu' ? { id: 'shaniu' } : emp(id)
    if (!e) return ''
    const key = `${e.id}|${e.color}|${e.look}`
    if (!faces.has(key)) faces.set(key, office.portrait(e))
    return faces.get(key)
  }

  // ---- rendering ------------------------------------------------------------

  function setConn(kind) {
    const map = { live: ['pill-live', '已连接'], fake: ['pill-fake', '彩排模式'], demo: ['pill-demo', '演示'], off: ['pill-off', '连接断开，重连中…'], wait: ['pill-wait', '连接中…'] }
    const [cls, label] = map[kind] || map.wait
    const conn = $('#conn')
    if (conn) { conn.className = `pill ${cls}`; conn.textContent = label }
    const workdir = $('#workdir')
    if (workdir && state.workdir != null) { workdir.textContent = state.workdir; workdir.title = state.workdir }
  }

  function renderTeam() {
    const box = $('#team')
    if (!box) return
    box.innerHTML = ''
    for (const g of state.roster.groups) {
      const card = document.createElement('div')
      card.className = 'group-card'
      card.style.setProperty('--c', g.color)
      const models = ['hard', 'medium', 'easy'].map((d) => `${DIFF[d]} ${g.models?.[d] || '默认'}`)
      const uniq = new Set(Object.values(g.models || {}).map((m) => m || ''))
      const staff = state.roster.employees.filter((e) => e.group === g.id)
      card.innerHTML = `
        <div class="group-head"><b>${esc(g.name)}</b><span class="gtype">${esc(g.typeLabel || g.type)}</span><span class="gstate ${g.available ? '' : 'off'}">${g.available ? '在岗' : '未到岗'}</span></div>
        <div class="gmodels">${g.available ? esc(uniq.size > 1 ? models.join(' · ') : `模型 ${g.models?.medium || '默认'}`) : esc(g.note || '')}</div>
        ${g.available && g.tools?.length ? `<div class="gtools" title="要用到时系统会自动配置"><em>工具</em>${g.tools.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
        <ul class="staff">${staff.map((e) => empRow(e)).join('')}</ul>`
      box.appendChild(card)
    }
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'add-staff'
    add.innerHTML = '<b>＋ 接入员工</b><span>Claude Code、Codex 一键安装登录；DeepSeek、中转站填 Key 就能接</span>'
    box.appendChild(add)
    tickTimers()
  }

  function empRow(e) {
    const a = state.agents[e.id] || {}
    const status = e.available === false ? 'offline' : a.status || 'idle'
    const task = a.taskId && state.tasks.find((t) => t.id === a.taskId)
    const doing =
      status === 'offline'
        ? a.text || '不在岗'
        : ['working', 'meeting', 'thinking', 'error'].includes(status)
          ? a.text || AGENT_STATUS[status]
          : e.stats && e.stats.done + e.stats.failed
            ? `完成 ${e.stats.done} · 失败 ${e.stats.failed}`
            : e.description
    const badge = task && status === 'working' ? `<span class="timer" data-since="${task.startedAt || ''}"></span>` : esc(AGENT_STATUS[status] || status)
    return `<li class="emp" data-s="${esc(status)}" title="${esc(e.description)}">
      <span class="face" style="background-image:url(${face(e.id)})"></span>
      <span class="ename">${esc(e.name)}</span>
      <span class="estate">${badge}</span>
      <span class="edoing">${esc(doing)}</span></li>`
  }

  function tickTimers() {
    for (const el of document.querySelectorAll('.timer[data-since]')) {
      const since = Number(el.dataset.since)
      if (since) el.textContent = mmss(Date.now() - since)
    }
  }
  setInterval(tickTimers, 1000)

  function renderMessage(m) {
    const box = $('#messages')
    if (!box) return
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80
    const el = document.createElement('div')
    el.className = `msg msg-${m.role}`
    if (m.role === 'shaniu') el.innerHTML = `<div class="avatar" style="background-image:url(${face('shaniu')})" aria-hidden="true"></div><div class="body">${md(m.text)}</div>`
    else if (m.role === 'speech') {
      el.style.setProperty('--c', colorOf(m.id))
      el.innerHTML = `<div class="avatar" style="background-image:url(${face(m.id)})" aria-hidden="true"></div><div class="body"><div class="who">${esc(m.who)} · 会上发言</div>${md(m.text)}</div>`
    } else if (m.role === 'user') el.innerHTML = `<div class="body">${md(m.text)}</div>`
    else el.innerHTML = `<div class="body">${esc(m.text)}</div>`
    box.insertBefore(el, $('#typing') || null)
    if (nearBottom || m.role === 'user') box.scrollTop = box.scrollHeight
  }

  function renderMessages() {
    const box = $('#messages')
    if (!box) return
    box.innerHTML = ''
    state.messages.forEach(renderMessage)
    renderTyping()
  }

  function renderTyping() {
    const box = $('#messages')
    if (!box) return
    let el = $('#typing')
    const thinking = state.agents.shaniu?.status === 'thinking'
    if (thinking && !el) {
      el = document.createElement('div')
      el.id = 'typing'
      el.className = 'msg msg-shaniu typing'
      el.innerHTML = `<div class="avatar" style="background-image:url(${face('shaniu')})" aria-hidden="true"></div><div class="body">${esc(state.agents.shaniu.text || '. . .')}</div>`
      box.appendChild(el)
      box.scrollTop = box.scrollHeight
    } else if (!thinking && el) el.remove()
  }

  function renderMeeting() {
    const box = $('#meeting')
    if (!box) return
    const m = state.meeting
    if (!m) {
      box.hidden = true
      return
    }
    const names = m.attendees.map((id) => emp(id)?.name || id).join('、')
    const open = box.querySelector('details')?.open
    box.hidden = false
    box.innerHTML = `<details ${open ? 'open' : ''}>
      <summary><span class="mt">项目会议 · ${m.status === 'open' ? '进行中…' : '已拍板'}</span>
      <span class="mm">议题：${esc(m.topics.join('、'))} · 参会：${esc(names)}${m.file ? ` · 纪要：${esc(m.file)}` : ''}</span></summary>
      <div class="mbody">${m.minutes ? `<pre>${esc(m.minutes)}</pre>` : '<span class="mm">大家正在发言…</span>'}</div>
    </details>`
  }

  function renderTasks() {
    const list = $('#tasks')
    if (!list) { office?.setTasks?.(state.tasks); return }
    list.innerHTML = ''
    const empty = $('#tasks-empty')
    if (empty) empty.hidden = state.tasks.length > 0 || !!state.meeting
    const work = state.tasks.filter((t) => t.kind !== 'verify')
    const done = work.filter((t) => t.status === 'done').length
    const round = $('#round')
    if (round) round.textContent = state.round ? `第 ${state.round} 个需求${state.iteration > 1 ? ` · 第 ${state.iteration} 轮` : ''} · ${done}/${work.length} 完成` : ''
    let iter = 1
    for (const t of state.tasks) {
      if ((t.iter || 1) !== iter) {
        iter = t.iter || 1
        const sep = document.createElement('li')
        sep.className = 'iter'
        sep.textContent = `第 ${iter} 轮：验收没通过，继续补`
        list.appendChild(sep)
      }
      const li = document.createElement('li')
      li.className = 'task'
      li.dataset.s = t.status
      li.style.setProperty('--c', colorOf(t.agent))
      const verdict =
        t.verdict === 'approve' ? ' · <span class="verdict-ok">通过</span>' : t.verdict === 'changes' ? ' · <span class="verdict-bad">没通过</span>' : ''
      const time = t.startedAt ? ` · ${t.endedAt ? mmss(t.endedAt - t.startedAt) : `<span class="timer" data-since="${t.startedAt}"></span>`}` : ''
      const cost = t.cost ? ` · $${Number(t.cost).toFixed(2)}` : t.usage && t.usage.in ? ` · ${Math.round((t.usage.in + t.usage.out) / 1000)}k tokens` : ''
      const last = t.activity?.length ? t.activity[t.activity.length - 1].text : ''
      const deps = t.deps?.length ? ` · 等 ${t.deps.join('、')}` : ''
      const log = (t.activity || []).map((a) => `<li class="k-${esc(a.kind)}"><time>${clock(a.ts)}</time><span>${esc(a.text)}</span></li>`).join('')
      const attempts = (t.attempts || []).map((a) => `<li>${esc(a.who)}：${esc(a.error)}</li>`).join('')
      li.innerHTML = `
        <details ${openTasks.has(t.id) ? 'open' : ''}>
          <summary>
            <span class="stripe"></span>
            <span class="tstate">${esc(TASK_STATUS[t.status] || t.status)}</span>
            <span class="main">
              <div class="title">${esc(t.title)}</div>
              <div class="meta"><span class="diff diff-${esc(t.difficulty)}">${DIFF[t.difficulty] || '中'}</span> ${esc(KIND[t.kind] || t.kind)}${t.model ? ` · ${esc(t.model)}` : ''}${esc(deps)}${time}${cost}${verdict}${t.status === 'running' && last ? ` · ${esc(last)}` : ''}${t.error ? ` · ${esc(t.error)}` : ''}</div>
            </span>
            <span class="who">${esc(t.who || emp(t.agent)?.name || t.agent)}</span>
          </summary>
          <div class="detail">
            ${t.why ? `<div><h3>为什么派给 ${esc(t.who)}</h3><p>${esc(t.why)}</p></div>` : ''}
            ${t.tools?.length ? `<div><h3>配的工具</h3><p>${esc(t.tools.map((x) => TOOL_ZH[x] || x).join('、'))}</p></div>` : ''}
            ${attempts ? `<div><h3>换过人</h3><ul class="log">${attempts}</ul></div>` : ''}
            <div><h3>协调器任务说明</h3><pre>${esc(t.kind === 'verify' ? '对照主人的需求整体验收（只看不改）' : t.prompt)}</pre></div>
            ${log ? `<div><h3>过程</h3><ul class="log">${log}</ul></div>` : ''}
            ${t.result ? `<div><h3>汇报</h3><pre>${esc(t.result)}</pre></div>` : ''}
          </div>
        </details>`
      li.querySelector('details').addEventListener('toggle', (e) => {
        if (e.target.open) openTasks.add(t.id)
        else openTasks.delete(t.id)
      })
      list.appendChild(li)
    }
    office.setTasks(state.tasks)
    tickTimers()
  }

  function renderBusy() {
    const s = $('#stop'); if (s) s.hidden = !state.busy
    const u = $('#undo'); if (u) u.hidden = !state.lastCommit || state.busy
  }

  function renderSuggest() {
    const box = $('#suggest')
    if (!box) return
    box.innerHTML = ''
    for (const s of SUGGEST[state.mode === 'live' ? 'live' : 'demo']) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip'
      b.textContent = s
      b.addEventListener('click', () => {
        const inp = $('#input')
        if (inp) { inp.value = s; inp.focus() }
      })
      box.appendChild(b)
    }
  }

  function renderBanner() {
    const el = $('#banner')
    if (!el) return
    if (state.mode === 'demo') {
      el.innerHTML =
        '这是演示：员工都是演员，不会真的改代码。项目开源在 <a href="https://github.com/leishen8806/VirtualAiOffice" target="_blank" rel="noopener">GitHub</a>，下载后运行 <code>node bin/niuma.js 你的项目目录</code>，他们就会真的开工。'
      el.hidden = false
    } else if (state.mode === 'fake') {
      el.innerHTML = /Electron/.test(navigator.userAgent)
        ? '彩排模式：员工都是替身，不花钱、不改文件。在菜单「项目」里取消勾选「彩排模式」就是真干活。'
        : '彩排模式：员工都是替身，不花钱、不改文件。去掉 <code>--fake</code> 就是真干活。'
      el.hidden = false
    } else el.hidden = true
  }

  // ---- events ----------------------------------------------------------------

  function upsertTask(task) {
    const i = state.tasks.findIndex((t) => t.id === task.id)
    if (i === -1) state.tasks.push(task)
    else state.tasks[i] = task
  }

  let setupPrompted = false
  function handle(ev) {
    switch (ev.type) {
      case 'snapshot':
        Object.assign(state, ev.state)
        setConn(state.mode === 'live' ? 'live' : state.mode)
        const workdirNode = $('#workdir')
        if (workdirNode) { workdirNode.textContent = state.workdir || ''; workdirNode.title = state.workdir || '' }
        office.setRoster(state.roster)
        for (const [id, a] of Object.entries(state.agents)) office.setAgent(id, a)
        if (state.meeting?.status === 'open') office.meeting(state.meeting)
        renderMessages()
        renderMeeting()
        renderTasks()
        renderTeam()
        renderBusy()
        renderSuggest()
        renderBanner()
        if (coreHandle) {
          try {
            const derived = deriveCoreRuntimeFromState()
            const hasHuman = (derived.runtime?.waitingHuman || []).length > 0
            coreHandle.animate.waitingHuman?.(!!hasHuman)
            if (state.meeting?.status === 'open') coreHandle.animate.meeting?.()
            const tasks = state.tasks || []
            const reviewPresent = tasks.some((t) => t.kind === 'review' || t.status === 'reviewing')
            if (reviewPresent) coreHandle.animate.review?.()
          } catch (_) {}
        }
        refreshCoreHandle()
        if (state.mode === 'live' && !setupPrompted && !state.roster?.groups?.some((g) => g.available)) {
          setupPrompted = true
          setTimeout(openSetup, 600)
        }
        break
      case 'roster':
        state.roster = ev.roster
        Object.assign(state.agents, ev.agents || {})
        office.setRoster(state.roster)
        for (const [id, a] of Object.entries(state.agents)) office.setAgent(id, a)
        renderTeam()
        refreshCoreHandle()
        break
      case 'agent': {
        const { type, id, ...rest } = ev
        state.agents[id] = { ...(state.agents[id] || {}), ...rest }
        office.setAgent(id, state.agents[id])
        if (coreHandle) {
          let employee = emp(id)
          if (!employee) {
            for (const e of (state.roster.employees || [])) {
              if (e.id === id || e.name === id) { employee = e; break }
            }
          }
          const roleId = resolveVisualRoleForEmployee(employee)
          if (roleId && OFFICIAL_ROLE_SET[roleId]) {
            const v2 = statusToV2(state.agents[id]?.status || 'idle')
            try {
              if (v2 === 'BLOCKED') coreHandle.animate.blocked?.(roleId)
              else if (v2 === 'DONE') coreHandle.animate.done?.(roleId, 1800)
              else if (v2 === 'REVIEWING') coreHandle.animate.review?.()
            } catch (_) {}
          }
        }
        renderTeam()
        if (id === 'shaniu') renderTyping()
        refreshCoreHandle()
        break
      }
      case 'activity': {
        const t = state.tasks.find((x) => x.id === ev.taskId)
        if (t) {
          t.activity = [...(t.activity || []), { kind: ev.kind, text: ev.text, ts: ev.ts }].slice(-200)
          renderTasks()
        }
        if (state.agents[ev.id]) {
          state.agents[ev.id].text = ev.text
          office.setAgent(ev.id, state.agents[ev.id])
        }
        office.activity(ev.id, ev.text)
        renderTeam()
        refreshCoreHandle()
        break
      }
      case 'message':
        state.messages.push(ev.message)
        renderMessage(ev.message)
        if (ev.message.role === 'shaniu') office.say('shaniu', ev.message.text.replace(/[`*#]/g, '').split('\n')[0].slice(0, 60), { ttl: 6000 })
        if (ev.message.role === 'speech') office.say(ev.message.id, ev.message.text.replace(/[`*#]/g, '').split('\n')[0].slice(0, 50), { ttl: 9000 })
        refreshCoreHandle()
        break
      case 'round':
        state.round = ev.round
        state.iteration = ev.iteration || 1
        state.tasks = []
        state.meeting = null
        openTasks.clear()
        renderMeeting()
        renderTasks()
        renderBanner()
        office.meeting(null)
        office.setTasks([])
        refreshCoreHandle()
        break
      case 'iteration':
        state.iteration = ev.iteration
        renderTasks()
        refreshCoreHandle()
        break
      case 'task':
        upsertTask(ev.task)
        renderTasks()
        renderTeam()
        office.setTasks(state.tasks)
        if (coreHandle) {
          const kind = ev.task.kind
          const status = ev.task.status
          const isReviewTask = kind === 'review' || status === 'reviewing'
          const humanActive = kind === 'human' || ev.task.waiting === true || status === 'waiting'
          if (isReviewTask) { try { coreHandle.animate.review?.() } catch (_) {} }
          if (humanActive) { try { coreHandle.animate.waitingHuman?.(true) } catch (_) {} }
        }
        refreshCoreHandle()
        break
      case 'meeting':
        state.meeting = ev.meeting
        office.meeting(ev.meeting)
        if (coreHandle && ev.meeting?.status === 'open') {
          try { coreHandle.animate.meeting?.() } catch (_) {}
        }
        renderMeeting()
        renderTasks()
        refreshCoreHandle()
        break
      case 'dispatch': {
        office.dispatch(ev.to)
        let employee = emp(ev.to)
        if (!employee) {
          for (const e of (state.roster.employees || [])) {
            if (e.id === ev.to || e.name === ev.to) { employee = e; break }
          }
        }
        const roleId = resolveVisualRoleForEmployee(employee) || normalizeRoleId(ev.to)
        if (roleId && OFFICIAL_ROLE_SET[roleId] && coreHandle) {
          try { coreHandle.animate.dispatch?.(roleId) } catch (_) {}
        }
        refreshCoreHandle()
        break
      }
      case 'commit':
        state.lastCommit = ev.commit
        renderBusy()
        refreshCoreHandle()
        break
      case 'busy':
        state.busy = ev.busy
        renderBusy()
        refreshCoreHandle()
        break
      case 'setup':
        window.NiumaSetup?.event(ev)
        break
    }
  }

  // ---- transports ------------------------------------------------------------

  function connectLive(token) {
    const q = token ? `?token=${encodeURIComponent(token)}` : ''
    const es = new EventSource('/events' + q)
    es.onmessage = (e) => handle(JSON.parse(e.data))
    es.onopen = () => setConn(state.mode === 'fake' ? 'fake' : 'live')
    es.onerror = () => setConn('off')
    const post = async (url, body) => {
      const r = await fetch(url + q, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Niuma-Token': token }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    }
    // 「接入员工」面板用：GET 不带 body，POST 带 JSON，都返回 JSON。
    const request = async (method, url, body) => {
      const r = await fetch(url + q, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Niuma-Token': token },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        cache: 'no-store',
      })
      const type = r.headers.get('content-type') || ''
      if (type.includes('application/json')) return r.json()
      throw new Error(`${r.status} ${await r.text()}`)
    }
    return { send: (text) => post('/api/message', { text }), stop: () => post('/api/stop', {}), request }
  }

  async function detectServer(token) {
    if (location.hash === '#demo' || !/^https?:$/.test(location.protocol)) return false
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 2500)
    try {
      const r = await fetch('/api/state' + (token ? `?token=${encodeURIComponent(token)}` : ''), { signal: ctl.signal, cache: 'no-store' })
      return r.ok && (r.headers.get('content-type') || '').includes('application/json')
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  // ---- composer --------------------------------------------------------------

  async function send(text) {
    text = text.trim()
    if (!text || !transport) return
    try {
      await transport.send(text)
    } catch (e) {
      handle({ type: 'message', message: { role: 'system', text: `没发出去：${e.message}`, ts: Date.now() } })
    }
  }

  $('#composer')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = $('#input').value
    $('#input').value = ''
    send(text)
  })
  $('#input')?.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter or an IME composition (Chinese input) keeps typing.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault()
      $('#composer')?.requestSubmit?.()
    }
  })
  $('#stop')?.addEventListener('click', () => transport && transport.stop().catch(() => {}))
  const openSetup = () => window.NiumaSetup?.open({ request: transport?.request || null, fake: state.mode === 'fake' })
  $('#open-setup')?.addEventListener('click', openSetup)
  $('#team')?.addEventListener('click', (e) => {
    if (e.target.closest('.add-staff')) openSetup()
  })
  $('#skins')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-skin]')
    if (b) setSkin(b.dataset.skin)
    if (e.target.closest('[data-act="make-skin"]')) window.NiumaSkinEditor?.open()
  })
  renderSkins()
  // 手改了皮肤文件：切回窗口就重新读一遍
  let lastSkinCheck = 0
  window.addEventListener('focus', () => {
    if (Date.now() - lastSkinCheck < 3000 || window.NiumaSkinEditor?.isOpen?.()) return
    lastSkinCheck = Date.now()
    loadSkins()
  })
  $('#undo')?.addEventListener('click', () => send('/撤销'))

  // ---- V2 compat bridge (test / Playwright helpers, NO runtime ownership) --------
  // VAOAppV2 is left as a PURE stateless wrapper around the SINGLE runtime owner: this module.
  // No DOMContentLoaded boot, no transport, no duplicate state store. Allowed per BLOCKER 1 §APP-V2 option B.
  ;(function () {
    const V2_CORE_ID = 'core'
    const ShellV2 = globalThis.VAOCoreShellV2
    const CLASSIC_IDS = ShellV2 ? ShellV2.CLASSIC_IDS : CLASSIC_IDS
    const api = Object.freeze({
      V2_CORE_ID,
      CLASSIC_IDS,
      IS_CORE: (id) => id === V2_CORE_ID,
      IS_CLASSIC: (id) => CLASSIC_IDS.includes(String(id)),
      setSkin: (id) => setSkin(id),
      get currentSkinId() { return current.id },
      get handle() { return globalThis.__coreHandleV2 || coreHandle || null },
      OFFICIAL_ROLE_SET,
      ROLE_ALIASES,
      resolveVisualRoleForEmployee,
      resolveVisualRoleForTask,
      normalizeRoleId,
      _detectRunMode: () => {
        try {
          const qm = new URL(String(location.href)).searchParams.get('mode')
          if (/^(demo|fake|live)$/i.test(qm || '')) return (qm || '').toLowerCase()
        } catch {}
        return 'live'
      },
      _dispatchSse: handle,
      _getState: () => state,
      _getSnapshot: () => deriveCoreRuntimeFromState(),
      _getSeatState: (roleId) => {
        const derived = deriveCoreRuntimeFromState()
        return derived.snapshot?.seatStates?.[roleId] || null
      },
    })
    globalThis.VAOAppV2 = api
    globalThis.setSkinV2 = api.setSkin
  })()

  // ---- boot ------------------------------------------------------------------

  ;(async () => {
    let token = ''
    try {
      token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('niuma-token') || ''
      if (token) sessionStorage.setItem('niuma-token', token)
    } catch {}
    renderSuggest()
    if (await detectServer(token)) transport = connectLive(token)
    else transport = window.ShaniuDemo(handle)
    loadSkins()
  })()
})()
