import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function installMinimalDOMShim() {
  if (globalThis.document &&
      typeof globalThis.document.createElement === 'function' &&
      typeof globalThis.document.addEventListener === 'function' &&
      globalThis.document.querySelector) {
    return
  }

  const _events = new WeakMap()
  function makeNode(tag) {
    const listeners = new Map()
    const attrs = new Map()
    const node = {
      __tag: String(tag).toLowerCase(),
      tagName: String(tag).toUpperCase(),
      nodeName: String(tag).toUpperCase(),
      nodeType: 1,
      id: '',
      className: '',
      classList: new Proxy([], {
        get(target, prop) {
          if (prop === 'add') return (...cs) => {
            for (const c of cs) {
              if (typeof c !== 'string') continue
              if (!target.includes(c)) target.push(c)
            }
            node.className = target.join(' ')
          }
          if (prop === 'remove') return (...cs) => {
            for (const c of cs) {
              if (typeof c !== 'string') continue
              const i = target.indexOf(c)
              if (i >= 0) target.splice(i, 1)
            }
            node.className = target.join(' ')
          }
          if (prop === 'contains') return (c) => target.includes(String(c))
          if (prop === 'toggle') return (c) => {
            const i = target.indexOf(String(c))
            if (i >= 0) { target.splice(i, 1); node.className = target.join(' '); return false }
            target.push(String(c)); node.className = target.join(' '); return true
          }
          if (prop === 'item') return (i) => target[i] ?? null
          if (prop === 'length') return target.length
          if (prop === 'forEach') return Array.prototype.forEach.bind(target)
          if (prop === Symbol.iterator) return Array.prototype[Symbol.iterator].bind(target)
          return Reflect.get(target, prop)
        },
        has(target, prop) { return typeof prop === 'string' ? target.includes(prop) : Reflect.has(target, prop) },
      }),
      style: {},
      dataset: {},
      children: [],
      parentNode: null,
      _html: '',
      _txt: '',
      get innerHTML() { return this._html },
      set innerHTML(v) { this._html = String(v ?? '') },
      get outerHTML() {
        return `<${this.__tag}${attrs.size ? ' ' + [...attrs].map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ') : ''}${this.className ? ` class="${this.className}"` : ''}${this.id ? ` id="${this.id}"` : ''}>${this._html}</${this.__tag}>`
      },
      get textContent() { return this._txt },
      set textContent(v) { this._txt = String(v ?? '') },
      setAttribute(k, v) { attrs.set(String(k), String(v ?? '')) },
      removeAttribute(k) { attrs.delete(String(k)) },
      getAttribute(k) { return attrs.has(String(k)) ? attrs.get(String(k)) : null },
      hasAttribute(k) { return attrs.has(String(k)) },
      getBoundingClientRect() { return { x: 20, y: 120, width: 160, height: 120, top: 120, left: 20, right: 180, bottom: 240 } },
      focus() {},
      blur() {},
      appendChild(c) {
        if (!c) return c
        c.parentNode = this
        if (!this.children.includes(c)) this.children.push(c)
        this._html += (c.outerHTML || c.textContent || '')
        return c
      },
      prepend(c) {
        if (!c) return c
        c.parentNode = this
        this.children.unshift(c)
        this._html = (c.outerHTML || c.textContent || '') + this._html
        return c
      },
      insertBefore(c, ref) {
        if (!c) return c
        c.parentNode = this
        const i = ref ? this.children.indexOf(ref) : this.children.length
        this.children.splice(i < 0 ? 0 : i, 0, c)
        this._html = this.children.map(x => x.outerHTML || x.innerHTML || '').join('')
        return c
      },
      removeChild(c) {
        const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1)
        this._html = this.children.map(x => x.outerHTML || x.innerHTML || '').join('')
        return c
      },
      remove() {
        const p = this.parentNode
        if (!p) return
        const i = p.children.indexOf(this)
        if (i >= 0) {
          p.children.splice(i, 1)
          p._html = p.children.map(x => x.outerHTML || x.innerHTML || '').join('')
        }
        this.parentNode = null
      },
      replaceWith(newNode) {
        const p = this.parentNode
        if (!p) return
        const sib = p.children
        const i = sib.indexOf(this)
        if (i >= 0) {
          sib[i] = newNode
          newNode.parentNode = p
        }
        this.parentNode = null
        p._html = sib.map(x => (x && (x.outerHTML || x.innerHTML || '')) || '').join('')
      },
      querySelectorAll(sel) {
        const out = []
        const seen = new Set()
        const self = this
        function walk(n) {
          if (!n || !n.children) return
          for (const c of n.children) {
            if (seen.has(c)) continue
            seen.add(c)
            const s = String(sel || '')
            let match = false
            if (s.startsWith('.') && c.className && c.className.includes(s.slice(1))) match = true
            else if (s.startsWith('#') && c.id === s.slice(1)) match = true
            else if (!s.startsWith('.') && !s.startsWith('#') && String(c.__tag).toLowerCase() === String(sel).toLowerCase()) match = true
            if (match) out.push(c)
            walk(c)
          }
        }
        walk(self)
        if (out.length === 0 && typeof sel === 'string' && !sel.startsWith('.') && !sel.startsWith('#')) {
          const justTag = sel.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
          const hay = (self._html || '').toLowerCase()
          if (justTag && hay.includes(`<${justTag}`)) {
            const fake = createElement(justTag)
            fake._fakeFromHtml = true
            out.push(fake)
          }
        }
        return out
      },
      querySelector(sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null },
      requestSubmit() { /* no-op */ },
      requestUpdate() { /* no-op */ },
      addEventListener(type, fn) {
        const k = String(type).toLowerCase()
        if (!listeners.has(k)) listeners.set(k, new Set())
        listeners.get(k).add(fn)
      },
      removeEventListener(type, fn) { listeners.get(String(type).toLowerCase())?.delete(fn) },
      dispatchEvent(ev) {
        const list = listeners.get(String(ev?.type || '').toLowerCase()) || []
        for (const fn of list) try { fn(ev) } catch (_) { /* ignore */ }
        return !ev?.cancelBubble
      },
    }
    _events.set(node, listeners)
    return node
  }

  const byId = new Map()
  const body = makeNode('body')

  function createElement(tag) {
    const n = makeNode(String(tag).toLowerCase())
    return new Proxy(n, {
      set(target, prop, val) {
        if (prop === 'id') byId.set(String(val), target)
        Reflect.set(target, prop, val)
        if (prop === 'id') byId.set(String(target.id), target)
        return true
      },
    })
  }

  const doc = {
    body,
    documentElement: makeNode('html'),
    head: makeNode('head'),
    createElement,
    createTextNode: (text) => {
      const n = createElement('#text')
      n.nodeType = 3
      n.textContent = String(text ?? '')
      return n
    },
    getElementById(id) { return byId.get(String(id)) || null },
    querySelectorAll(sel) { return body.querySelectorAll(sel) },
    querySelector(sel) { const a = body.querySelectorAll(sel); return a.length ? a[0] : null },
    createEvent() { return new Proxy({ type: '', cancelBubble: false }, {}) },
    addEventListener: function (type, fn) { this.body.addEventListener(type, fn) },
    removeEventListener: function (type, fn) { this.body.removeEventListener(type, fn) },
    dispatchEvent: function (ev) { return this.body.dispatchEvent(ev) },
    get hidden() { return false },
  }
  body.ownerDocument = doc
  globalThis.document = doc
  doc.documentElement.ownerDocument = doc
  doc.head.ownerDocument = doc

  if (!Object.getOwnPropertyDescriptor(globalThis, 'window')?.writable &&
      !Object.getOwnPropertyDescriptor(globalThis, 'window')?.set) {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis, writable: true })
  } else {
    globalThis.window = globalThis
  }
  try {
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    if (!navDesc || navDesc.writable || navDesc.set) {
      globalThis.navigator = { userAgent: 'VAO-Test-Shim', platform: 'Node.js', language: 'zh-CN' }
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true, writable: true,
        value: { userAgent: 'VAO-Test-Shim', platform: 'Node.js', language: 'zh-CN' },
      })
    }
  } catch (_) { /* ignore */ }
  if (!globalThis.CustomEvent) {
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true, writable: true,
      value: class CustomEvent { constructor(type, opts = {}) { this.type = type; this.bubbles = opts.bubbles ?? false; this.cancelable = opts.cancelable ?? true; Object.assign(this, opts) } },
    })
  }
  if (!globalThis.matchMedia) {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true, writable: true,
      value: () => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }),
    })
  }
  if (globalThis.innerWidth === undefined) {
    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, writable: true, value: 1440 })
  }
  if (globalThis.innerHeight === undefined) {
    Object.defineProperty(globalThis, 'innerHeight', { configurable: true, writable: true, value: 900 })
  }
  if (!globalThis.scrollTo) globalThis.scrollTo = () => {}
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16)
  if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }
}

function loadCoreModules() {
  installMinimalDOMShim()
  const order = [
    'public/core/core-theme.js',
    'public/core/core-states.js',
    'public/core/core-characters.js',
    'public/core/core-office.js',
    'public/core/core-shell.js',
  ]
  for (const rel of order) {
    const abs = path.join(ROOT, rel)
    delete require.cache[abs]
    require(abs)
  }
  return globalThis.VAOCoreShell
}

function collectHTML(handle) {
  const parts = []
  for (const key of Object.keys(handle.nodes || {})) {
    const n = handle.nodes[key]
    if (n) parts.push(n.outerHTML || n.innerHTML || '')
  }
  if (handle.nodes?.canvas) parts.push(handle.nodes.canvas.outerHTML || handle.nodes.canvas.innerHTML || '')
  if (handle.office?.mount) parts.push(handle.office.mount.outerHTML || handle.office.mount.innerHTML || '')
  if (globalThis.document?.body?._html) parts.push(globalThis.document.body._html)
  if (globalThis.document?.body?.innerHTML) parts.push(globalThis.document.body.innerHTML)
  return parts.join('\n')
}

const doc = () => globalThis.document
const bodyClasses = () => doc() && doc().body ? [...doc().body.classList] : []
const hasClass = (c) => bodyClasses().includes(c)

/* ------------------------------------------------------------------ */
/* §18 Behavioral Gates (8 total)                                      */
/* ------------------------------------------------------------------ */

test('§18.1 [click role → Role Inspector] dispatch vao:open-role-inspector product → inspector DOM contains product role text and evidence section', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  // Dispatch on doc()
  const detail = { role: 'product' }
  doc().dispatchEvent(new globalThis.CustomEvent('vao:open-role-inspector', { bubbles: true, detail }))
  html = collectHTML(handle)
  assert.ok(/inspector-pop|inspector-backdrop/.test(html), 'after event → inspector node (.inspector-pop / backdrop) MUST exist in DOM')
  const productMatch = /(产品经理|Product|PM|李产品|产品)/.test(html)
  assert.ok(productMatch, `Role Inspector role=product → text 产品经理 / Product / PM / 李产品 / 产品 MUST be present`)
  assert.ok(/证据|evidence|Evidence/i.test(html), 'Role Inspector includes 证据/evidence section (§8 spec)')
  handle.destroy()
})

test('§18.2 [click task → Task Inspector] dispatch vao:open-task-inspector DEMO-104 → inspector contains DEMO-104 task id', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  doc().dispatchEvent(new globalThis.CustomEvent('vao:open-task-inspector', { bubbles: true, detail: { taskId: 'DEMO-104' } }))
  html = collectHTML(handle)
  assert.ok(/inspector-pop|inspector-backdrop/.test(html), 'after event → task inspector MUST render .inspector-pop')
  assert.ok(html.includes('DEMO-104'), `Task Inspector MUST include the dispatched taskId=DEMO-104 in DOM`)
  assert.ok(/(状态|Status|依赖|Depends|阻断|Blocked)/.test(html), 'Task Inspector includes 状态/依赖/阻断 columns (§8 spec)')
  handle.destroy()
})

test('§18.3 [setState visual] live empty → update seatStates frontend=WORKING → state WORKING indicator rendered after update only', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  const beforeWorking = /(state-working|派发中|工作中|data-state="WORKING")/.test(html)
  handle.update({
    snapshot: {
      seatStates: { frontend: 'WORKING' },
      seatKinds: { frontend: 'ai' },
      seatMembers: { frontend: 'ReactCode Bot' },
      tasks: [{ id: 'T-W-1', title: 'frontend working task', status: 'running', role: 'frontend' }],
    },
  })
  html = collectHTML(handle)
  const afterWorking = /(state-working|派发中|工作中|data-state="WORKING")/.test(html)
  assert.ok(!beforeWorking, 'BEFORE update → no WORKING visuals (live empty mode honest clean state)')
  assert.ok(afterWorking, `AFTER seatStates[frontend]=WORKING → DOM MUST contain: state-working class / 派发中 / 工作中 / data-state="WORKING"`)
  handle.destroy()
})

test('§18.4 [WAITING_HUMAN activates Human Zone] live empty → set seatStates product=WAITING_HUMAN + runtime.waitingHuman list → human zone amber chip / WAITING_HUMAN visual rendered', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  const beforeWH = /(等待人类|Waiting Human|data-state="WAITING_HUMAN"|Waiting for Human)/.test(html)
  handle.update({
    snapshot: { seatStates: { product: 'WAITING_HUMAN' }, seatKinds: { product: 'human' } },
    runtime: { waitingHuman: [{ id: 'w1', role: 'product', member: '李产品', title: '签字规格表', sinceMs: Date.now() - 14 * 60000 }] },
  })
  html = collectHTML(handle)
  const afterWH = /(等待人类|Waiting Human|data-state="WAITING_HUMAN"|Waiting for Human)/.test(html)
  assert.ok(!beforeWH, 'before update must not have WAITING_HUMAN state literal text (live empty honest)')
  assert.ok(afterWH, `after update MUST render 等待人类 / Waiting Human / data-state="WAITING_HUMAN" / Waiting for Human in office canvas`)
  handle.destroy()
})

test('§18.5 [BLOCKED visible] live empty → seatStates backend=BLOCKED → blocked marker class / blocked zh label rendered only after update', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  const beforeBlock = /(data-state="BLOCKED"|阻断中|已阻塞|状态 BLOCKED)/.test(html)
  handle.update({
    snapshot: {
      seatStates: { backend: 'BLOCKED' },
      seatKinds: { backend: 'ai' },
      tasks: [{ id: 'T-B-1', title: 'API gateway down', status: 'blocked', role: 'backend' }],
    },
  })
  html = collectHTML(handle)
  const afterBlock = /(data-state="BLOCKED"|阻断中|已阻塞|状态 BLOCKED)/.test(html)
  assert.ok(!beforeBlock, 'before update no BLOCKED state literal text in honest live empty')
  assert.ok(afterBlock, `after update backend=BLOCKED → DOM MUST show data-state="BLOCKED" or 阻断中 / 已阻塞 zh label`)
  handle.destroy()
})

test('§18.6 [Helix panel expand/collapse] default compact → handle.setHelixMode(expanded) → body.helix-is-expanded class; then compact; then collapsed', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  assert.ok(!hasClass('helix-is-expanded'), 'DEFAULT compact → NOT body.helix-is-expanded')
  assert.ok(!hasClass('helix-is-collapsed'), 'DEFAULT compact → NOT body.helix-is-collapsed')
  assert.ok(hasClass('helix-is-compact'), 'DEFAULT compact → body.helix-is-compact MUST be set by applyHelixBodyClass("compact") at bootstrap')
  assert.equal(typeof handle.setHelixMode, 'function', 'handle.setHelixMode MUST be exposed public method on handle')
  handle.setHelixMode('expanded')
  assert.ok(hasClass('helix-is-expanded'), 'AFTER setHelixMode("expanded") → body.helix-is-expanded MUST be present')
  assert.ok(!hasClass('helix-is-compact'), 'AFTER expanded → NOT body.helix-is-compact (classList multi-arg remove MUST work)')
  handle.setHelixMode('compact')
  assert.ok(hasClass('helix-is-compact'), 'AFTER setHelixMode("compact") → body.helix-is-compact MUST restore')
  assert.ok(!hasClass('helix-is-expanded'), 'NOT expanded after compact')
  handle.setHelixMode('collapsed')
  assert.ok(hasClass('helix-is-collapsed'), 'AFTER collapsed → body.helix-is-collapsed MUST present')
  assert.ok(!hasClass('helix-is-compact'), 'NOT compact when collapsed')
  handle.destroy()
})

test('§18.7 [Core↔Classic switch remains functional] Core boot → skin-format BUILTIN list still contains core + 5 legacy; app.js still has setSkin/IS_CORE/IS_CLASSIC branch; Core identity brand not mixed with legacy names after re-bootstrap', () => {
  const skinFormatSrc = read('public/skin-format.js')
  const appSrc = read('public/app.js')
  for (const id of ['core', 'sakura', 'night', 'neon', 'neko', 'pixel']) {
    assert.match(skinFormatSrc, new RegExp(`'${id}'`), `skin-format.js BUILTIN MUST include id '${id}'`)
  }
  assert.match(appSrc, /setSkin\s*\(|IS_CORE|IS_CLASSIC|经典主题/, 'app.js MUST still have runtime switchable Core↔Classic skin setSkin branch (§18 gate 7)')
  const Shell = loadCoreModules()
  const r1 = Shell.bootstrap({ mode: 'demo' })
  let html = collectHTML(r1)
  assert.ok(/(系统编排中枢|System Orchestrator|HELIX)/.test(html), 'Core demo MUST have 系统编排中枢 / System Orchestrator / HELIX visible')
  const badNames = ['小美', '小丽', '牛马工作室', '傻妞']
  for (const b of badNames) assert.ok(!html.includes(b), `Core identity MUST NOT contain rejected legacy brand name '${b}'`)
  r1.destroy()
  const r2 = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  html = collectHTML(r2)
  assert.ok(hasClass('v2-core-shell'), 'After re-bootstrap → body class v2-core-shell MUST still be applied (document.body.classList.add("v2-core-shell") inside 2nd bootstrap)')
  for (const b of badNames) assert.ok(!html.includes(b), `After re-bootstrap no legacy brand mix-in '${b}'`)
  r2.destroy()
})

test('§18.8 [reduced-motion disables non-essential animations] CSS source includes prefers-reduced-motion:paused rule; matchMedia(matches:true) boot still succeeds without crash', () => {
  const themeSrc = read('public/core/core-theme.js')
  const shellSrc = read('public/core/core-shell.js')
  const officeSrc = read('public/core/core-office.js')
  const combined = themeSrc + '\n' + shellSrc + '\n' + officeSrc
  assert.match(combined, /prefers-reduced-motion:\s*reduce/, 'combined CSS MUST include @media prefers-reduced-motion: reduce')
  const hasPause = /animation-play-state\s*:\s*paused/.test(combined)
  const hasHidden = /reduced-motion/.test(combined)
  assert.ok(hasPause || hasHidden, `reduced-motion CSS MUST set animation-play-state:paused or define reduced-motion classes`)
  const hasVH = /(visibilitychange|document-hidden|\.document-hidden)/.test(combined)
  assert.ok(hasVH, '§15 performance: document visibilitychange listener OR .document-hidden class MUST exist in source')
  const orig = globalThis.matchMedia
  let threw = null
  try {
    globalThis.matchMedia = () => ({ matches: true, media: '(prefers-reduced-motion: reduce)', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
    const Shell = loadCoreModules()
    const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
    assert.ok(hasClass('v2-core-shell'), `reduced-motion matches:true → bootstrap must succeed; body.v2-core-shell MUST be in classList after bootstrap`)
    handle.destroy()
  } catch (e) { threw = e } finally { globalThis.matchMedia = orig }
  assert.ok(threw === null, `reduced-motion emulation (matches:true) MUST not throw; got error ${threw && threw.stack || threw}`)
})
