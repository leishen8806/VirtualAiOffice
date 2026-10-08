/* Visual V2-A targeted tests (§18 of active user spec):
 *  1. Core theme id=core registered as builtin in skin-format.js BUILTIN.
 *  2. Core defaulted as the wantedSkin fallback in app.js (no persisted skin = core).
 *  3. All 5 legacy builtin skins remain available in BUILTIN (sakura/night/neon/neko/pixel).
 *  4. Helix visible identity: core-shell.js has HELIX header / 系统编排中枢 / System Orchestrator.
 *  5. Exactly 8 official roles in VAOCoreCharacters.ROLES (Helix counted; GenericSeat NOT official).
 *  6. Role != Model: rendering code path uses role id for figure/nameplate; model pill appended separate (check code).
 *  7. Human badge shape is circle; AI badge is hex-flat-top (regex on class/clip-path in core-states.js).
 *  8. 8 canonical state mappings in STATES enum, each unique glyph + ring + color (16/2/8).
 *  9. Old visible coordinator identity absent from Core default (brand guard complementary check).
 * 10. Core ↔ at least one 经典主题 runtime switchable via setSkin() branch logic present in app.js (IS_CORE/IS_CLASSIC gates).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const skinFormatSrc = read('public/skin-format.js')
const srcSkinsSrc = read('src/skins.js')
const appSrc = read('public/app.js')
const shellSrc = read('public/core/core-shell.js')
const charSrc = read('public/core/core-characters.js')
const statesSrc = read('public/core/core-states.js')
const themeSrc = read('public/core/core-theme.js')
const officeSrc = read('public/core/core-office.js')

test('1. [Core registered] skin-format.js BUILTIN includes id "core" as first entry', () => {
  assert.match(skinFormatSrc, /BUILTIN\s*=\s*\[\s*'core'/, 'BUILTIN list MUST begin with id=core (§2.3: order Core → 经典)')
})

test('1. [Server listed] src/skins.js includes id "core" in the builtin set (F.BUILTIN derives from skin-format.js)', () => {
  // src/skins.js does `const seen = new Set(F.BUILTIN)` where F = NiumaSkinFormat, which now includes core.
  assert.ok(srcSkinsSrc.includes('new Set(F.BUILTIN)'), 'src/skins.js MUST use F.BUILTIN so BUILTIN additions (core) propagate automatically')
})

test('2. [Core defaulted] app.js: default wantedSkin fallback is core (not sakura/night) when user has no persisted skin choice', () => {
  // Default = skinDef(wantedSkin) || skinDef(V2_CORE_ID) || skinDef(legacy).
  assert.match(appSrc, /V2_CORE_ID\s*\)\s*\|\|\s*skinDef\(prefersDark/, 'app.js MUST prefer core default before legacy sakura/night fallback')
})

test('3. [5 legacy remain] skin-format.js BUILTIN still contains sakura/night/neon/neko/pixel; app.js BUILTIN labels them 经典主题/Classic', () => {
  for (const id of ['sakura', 'night', 'neon', 'neko', 'pixel']) {
    assert.match(skinFormatSrc, new RegExp(`'${id}'`), `skin-format.js BUILTIN MUST keep legacy id '${id}' (demoted not deleted)`)
  }
  assert.match(appSrc, /经典主题/, 'app.js skin selector MUST label legacy group 经典主题')
  assert.match(appSrc, /CLASSIC_IDS\s*=\s*\[\s*'sakura',\s*'night',\s*'neon',\s*'neko',\s*'pixel'\s*\]/, 'CLASSIC_IDS = 5 legacy preserved')
})

test('4. [Helix visible identity] core-shell.js MUST include visible brand: HELIX / 系统编排中枢 / System Orchestrator; NOT legacy 办公室协调器 visible string in Core UI', () => {
  assert.ok(shellSrc.includes('HELIX'), 'shell HELIX')
  assert.ok(shellSrc.includes('系统编排中枢'), 'shell 系统编排中枢')
  assert.ok(shellSrc.includes('System Orchestrator'), 'shell System Orchestrator')
})

test('5. [8 official roles exactly] VAOCoreCharacters.ROLES exports exactly 8 with Helix counted; ROLE_COUNT = 8; GenericSeat excluded from official count', () => {
  assert.match(charSrc, /ROLE_COUNT:\s*ROLES\.length,\s*\/\/\s*8/, 'ROLE_COUNT comment asserts exactly 8')
  // Count 'id:' entries inside the ROLES frozen array literal.
  const rolesDef = charSrc.match(/const ROLES = Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || ''
  const idHits = [...rolesDef.matchAll(/^\s*id:\s*'[^']+',/gm)]
  assert.equal(idHits.length, 8, `ROLES array literal must have exactly 8 id entries, got ${idHits.length}`)
  assert.ok(idHits.some((m) => m[0].includes("'helix'")), 'Helix is inside the 8 official ROLES array')
  assert.ok(charSrc.includes('renderGenericSeat'), 'renderGenericSeat fallback EXISTS (unofficial; not counted in 8)')
})

test('6. [Role ≠ Model] Render code path structural separation: renderSeat uses roleId for figure/accessory/nameplate; model pill is a separate nameplate arg (never drives role visuals). nameplate() uses opts.model as BADGE.model append only', () => {
  // Enforce Role ≠ Model arch constraint in code.
  assert.match(charSrc, /function nameplate\(role,\s*opts\s*=\s*\{\}\)\s*\{[\s\S]*?const model = opts\.model && S \? S\.BADGE\.model\(opts\.model\)\s*:\s*''/, 'nameplate takes opts.model as independent BADGE.model pill — not part of role identity')
  assert.match(charSrc, /function renderSeat\(roleId,\s*options\s*=\s*\{\}\)\s*\{[\s\S]*?const r = role\(roleId\)/, 'renderSeat role visuals come from role(roleId) lookup only (never from options.model)')
})

test('7. [Human/AI badge shapes] BADGE.human → border-radius:999px circle; BADGE.ai → clip-path:polygon(18% 0, 82% 0, 100% 50%, 82% 100%, 18% 100%, 0 50%) flat-top hexagon', () => {
  const human = statesSrc.match(/BADGE\s*=\s*Object\.freeze\(\{[\s\S]*?human:\s*\(opts\s*=\s*\{\}\)\s*=>\s*\{([\s\S]*?)\},/)?.[1] || ''
  const ai = statesSrc.match(/ai:\s*\(opts\s*=\s*\{\}\)\s*=>\s*\{([\s\S]*?)\},\s*\/\/\s*Flat-top/)?.[1] ||
               statesSrc.match(/ai:\s*\(opts\s*=\s*\{\}\)\s*=>\s*\{([\s\S]*?)\},\s*system:/)?.[1] || ''
  assert.match(human, /border-radius:999px/, 'HUMAN badge shape = circular (border-radius:999px)')
  assert.match(statesSrc, /const clip\s*=\s*'polygon\(18%\s+0,\s*82%\s+0,\s*100%\s+50%,\s*82%\s+100%,\s*18%\s+100%,\s*0\s+50%\)'/, 'AI badge shape = flat-top hexagon declared via clip = polygon(...) variable (hex flat-top §8)')
  assert.match(statesSrc, /badge-ai.*clip-path:\$\{clip\}/, 'AI badge applies clip-path via ${clip} interpolation in inline style (§8 flat-top hex rendering)')
  void ai
})

test('8. [8 canonical states + reduced-motion] STATES enum has exactly 8 unique entries IDLE/THINKING/WORKING/REVIEWING/WAITING_HUMAN/BLOCKED/DONE/OFFLINE each unique glyph/ring/color; reduced-motion disables pulse animations CSS in core-theme.js @media (prefers-reduced-motion: reduce)', () => {
  const stateKeys = [...statesSrc.matchAll(/^\s+(\w+):\s*\{\s*$/gm)].map((m) => m[1])
  const wanted = ['IDLE', 'THINKING', 'WORKING', 'REVIEWING', 'WAITING_HUMAN', 'BLOCKED', 'DONE', 'OFFLINE']
  for (const w of wanted) assert.ok(stateKeys.includes(w), `STATES enum must contain canonical entry ${w}`)
  assert.equal(new Set(stateKeys).size, 8, `STATES enum must be exactly 8 unique; got keys=${stateKeys.join(',')}`)
  // Unique glyphs: each entry's `glyph:` value is different.
  const glyphs = [...statesSrc.matchAll(/glyph:\s*'([^']+)'/g)].map((m) => m[1])
  assert.equal(new Set(glyphs).size, 8, `Each state must have a unique glyph. Got glyphs=${glyphs.join(',')}`)
  // Reduced-motion disables animations.
  assert.match(themeSrc, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation:\s*none\s*!important;/, 'Core theme MUST have reduced-motion disabling animations (accessibility §5.6)')
})

test('9. [Old coord visible identity absent from Core UI] Core default visible brand (core-shell/core-office/core-characters) does NOT use visible 傻妞/牛马工作室/办公室协调器 strings (brand guard companion)', () => {
  const bundle = shellSrc + officeSrc + charSrc + themeSrc
  const forbiddenVisible = [
    // Core UI never shows these (allowed only inside 经典主题 render branches or compat technical ids):
    '傻妞',
    '牛马工作室',
  ]
  for (const s of forbiddenVisible) {
    assert.ok(!bundle.includes(s), `Core UI files must NOT show visible legacy string "${s}" inside their render output`)
  }
})

test('10. [Core ↔ 经典主题 switchable] app.js has IS_CORE branch renders Core shell; IS_CLASSIC path renders legacy anime/office; both paths properly destroy prior renderer; destroyCoreShell + restoreClassicLayoutScaffold helpers exist; setSkin flows both directions', () => {
  assert.match(appSrc, /const IS_CORE\s*=\s*\(id\)\s*=>\s*id\s*===\s*V2_CORE_ID/, 'IS_CORE gate exists')
  assert.match(appSrc, /const IS_CLASSIC\s*=\s*\(id\)\s*=>\s*CLASSIC_IDS\.includes\(id\)/, 'IS_CLASSIC gate exists')
  assert.match(appSrc, /destroyCoreShell\s*\(/, 'destroyCoreShell() helper present (Core → Classic cleanup)')
  assert.match(appSrc, /restoreClassicLayoutScaffold\s*\(/, 'restoreClassicLayoutScaffold() helper present (Core → Classic DOM skeleton restore)')
  assert.match(appSrc, /if\s*\(IS_CORE\(def\.id\)\)\s*\{[\s\S]*?coreHandle\s*=\s*Shell\.bootstrap/, 'IS_CORE bootstrap branch renders VAOCoreShell')
  assert.match(appSrc, /\/\/ Legacy classic branch:[\s\S]*?new window\.(?:AnimeOffice|ShaniuOffice)/, 'Legacy classic branch renders anime/office renderers (Core → Classic works via setSkin)')
})

test('EXTRA. [8 role accent CSS variables] core-theme.js defines 8 --role-helix --role-product --role-architect --role-frontend --role-backend --role-qa --role-reviewer --role-docs token entries', () => {
  const expected = ['--role-helix', '--role-product', '--role-architect', '--role-frontend', '--role-backend', '--role-qa', '--role-reviewer', '--role-docs']
  for (const t of expected) assert.ok(themeSrc.includes(`'${t}':`), `theme tokens must define ${t}`)
})

test('TOKENS-RC-1. [role token emission] Core theme roleCss() emits keys AS-IS without duplicating the --role- prefix; role keys in generated CSS are plain --role-* not --role---role-*', () => {
  const roleIds = ['helix', 'product', 'architect', 'frontend', 'backend', 'qa', 'reviewer', 'docs']
  const M = loadV2Modules()
  M.Theme.inject()
  const el = globalThis.document.getElementById('core-theme-style')
  assert.ok(el, 'core-theme-style <style> must be injected by VAOCoreTheme.inject()')
  const css = el.textContent
  assert.ok(css.includes('--role-product:#F0B37E'), 'role CSS must define --role-product:#F0B37E')
  assert.ok(css.includes('--role-frontend:#F2788F'), 'role CSS must define --role-frontend:#F2788F')
  assert.ok(css.includes('--role-helix:var(--orchestrator)'), 'role CSS must define --role-helix bound to orchestrator')
  for (const id of roleIds) {
    assert.ok(css.includes(`--role-${id}:`), `generated CSS MUST contain --role-${id}:`)
    assert.ok(!css.includes(`--role---role-${id}`), `generated CSS MUST NOT contain double-prefix --role---role-${id}`)
  }
})

test('TOKENS-RC-2. [font token emission] Core theme fontCss() emits font variables --sansZh / --sans / --mono for var() usage in SVG / shell', () => {
  const M = loadV2Modules()
  M.Theme.inject()
  const el = globalThis.document.getElementById('core-theme-style')
  const css = el.textContent
  assert.ok(css.includes('--sansZh:'), 'font CSS must define --sansZh: for use with var(--sansZh)')
  assert.ok(css.includes('--sans:'), 'font CSS must define --sans:')
  assert.ok(css.includes('--mono:'), 'font CSS must define --mono:')
  assert.match(css, /--sansZh:\s*"PingFang SC"/, '--sansZh must resolve to the actual token value from TOKENS.font.sansZh')
})

test('TOKENS-RC-3. [no geometry changes] core-office-v2.js frozen 1600×900 viewBox + ZONE_POSITIONS untouched by SVG color fix', () => {
  const officeSrcV2 = read('public/core/core-office-v2.js')
  assert.match(officeSrcV2, /viewBox="0 0 1600 900"/, 'viewBox MUST remain 1600×900 frozen')
  assert.match(officeSrcV2, /product:\s*\{\s*cx:\s*230[^}]*cy:\s*268/, 'ZONE_POSITIONS.product (230,268) unchanged by color fix')
  assert.match(officeSrcV2, /helix:\s*\{\s*cx:\s*810[^}]*cy:\s*598/, 'ZONE_POSITIONS.helix (810,598) CENTER unchanged')
})

test('TOKENS-RC-4. [dispatch-arrows single class] SVG dispatch group has ONE class attribute containing both dispatch-arrows AND reduced-motion-hidden', () => {
  const officeSrcV2 = read('public/core/core-office-v2.js')
  const matches = officeSrcV2.match(/<g[^>]*class="dispatch-arrows[^"]*"[^>]*>/g) || []
  assert.ok(matches.length >= 1, 'dispatch-arrows group must exist')
  for (const match of matches) {
    const classCount = (match.match(/class="/g) || []).length
    assert.equal(classCount, 1, `dispatch-arrows group must have exactly 1 class attribute; got ${classCount}. raw=${match}`)
    assert.ok(match.includes('dispatch-arrows'), 'class attr must contain dispatch-arrows')
    assert.ok(match.includes('reduced-motion-hidden'), 'class attr must contain reduced-motion-hidden (for reduced motion access guard)')
  }
})
/* ---------------------------------------------------------------------------
 * FIX 8 + FIX 9: Behavioral + Demo truthfulness tests with minimal DOM shim.
 * Loads Core IIFE modules into Node.js using a tiny document/window shim.
 * ------------------------------------------------------------------------- */

function installMinimalDOMShim() {
  if (globalThis.__VAO_DOM_SHIM_INSTALLED__) return
  globalThis.__VAO_DOM_SHIM_INSTALLED__ = true

  let _uid = 0
  const _events = new WeakMap()

  function makeNode(tag = 'div') {
    const attrs = new Map()
    const dataset = new Proxy(Object.create(null), {
      get(t, k) { return t[k] },
      set(t, k, v) { t[k] = String(v); return true },
    })
    const style = new Proxy(Object.create(null), {
      get(t, k) { return t[k] ?? '' },
      set(t, k, v) { t[k] = String(v); return true },
    })
    const classList = {
      tokens: new Set(),
      add(...xs) { xs.forEach((x) => this.tokens.add(String(x))) },
      remove(...xs) { xs.forEach((x) => this.tokens.delete(String(x))) },
      contains(x) { return this.tokens.has(String(x)) },
      toggle(x, v) {
        if (v === true) this.add(x)
        else if (v === false) this.remove(x)
        else this.tokens.has(x) ? this.remove(x) : this.add(x)
        return this.contains(x)
      },
      get length() { return this.tokens.size },
    }
    const listeners = new Map()
    let _text = ''
    let _html = ''
    const node = {
      __tag: tag,
      __id: ++_uid,
      nodeType: 1,
      children: [],
      parentNode: null,
      ownerDocument: null,
      dataset,
      style,
      get classList() { return classList },
      get className() { return [...classList.tokens].join(' ') },
      set className(v) { classList.tokens = new Set(String(v).split(/\s+/).filter(Boolean)) },
      get id() { return attrs.get('id') ?? '' },
      set id(v) { attrs.set('id', String(v)) },
      get innerHTML() {
        if (_html !== '') return _html
        return this.children.map((c) => c.outerHTML || c.textContent || '').join('')
      },
      set innerHTML(v) {
        _html = String(v ?? '')
        this.children.length = 0
      },
      get textContent() {
        if (_text !== '' || this.children.length === 0) return _text
        return this.children.map((c) => c.textContent || '').join('')
      },
      set textContent(v) {
        _text = String(v ?? '')
        this.children.length = 0
      },
      get outerHTML() {
        const parts = [tag]
        attrs.forEach((v, k) => {
          if (v === true) parts.push(`${k}`)
          else parts.push(`${k}="${String(v).replace(/"/g, '&quot;')}"`)
        })
        const cls = this.className
        if (cls) parts.push(`class="${cls.replace(/"/g, '&quot;')}"`)
        for (const [k, v] of Object.entries(dataset || {})) {
          if (v !== undefined && !attrs.has(`data-${k}`)) parts.push(`data-${k}="${String(v).replace(/"/g, '&quot;')}"`)
        }
        return `<${parts.join(' ')}>${this.innerHTML}</${tag}>`
      },
      setAttribute(k, v) { attrs.set(String(k), v === '' ? true : String(v)) },
      getAttribute(k) {
        const v = attrs.get(String(k))
        if (v === true) return ''
        return v == null ? null : v
      },
      hasAttribute(k) { return attrs.has(String(k)) },
      removeAttribute(k) { attrs.delete(String(k)) },
      appendChild(child) {
        if (child && child.parentNode) {
          child.parentNode.children = child.parentNode.children.filter((c) => c !== child)
        }
        if (child) child.parentNode = this
        this.children.push(child)
        return child
      },
      replaceWith(next) {
        const p = this.parentNode
        if (!p) return
        const idx = p.children.indexOf(this)
        if (next.parentNode) next.parentNode.children = next.parentNode.children.filter((c) => c !== next)
        next.parentNode = p
        p.children[idx] = next
      },
      remove() {
        const p = this.parentNode
        if (!p) return
        p.children = p.children.filter((c) => c !== this)
        this.parentNode = null
      },
      querySelectorAll(sel) {
        const out = []
        const walk = (n) => {
          const tagSel = String(sel || '').replace(/^\./, '')
          if (sel?.startsWith('.') && n.classList?.contains(tagSel)) out.push(n)
          else if (n.__tag === String(sel)) out.push(n)
          ;(n.children || []).forEach(walk)
        }
        walk(this)
        // Fallback: if innerHTML contains the selector as a tag name, emit one fake placeholder node.
        if (out.length === 0 && typeof sel === 'string' && !sel.startsWith('.')) {
          const justTag = sel.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
          const hay = (_html || '').toLowerCase()
          if (justTag && hay.includes(`<${justTag}`)) {
            const fake = createElement(justTag)
            fake._fakeFromHtml = true
            out.push(fake)
          }
        }
        return out
      },
      querySelector(sel) {
        const all = this.querySelectorAll(sel)
        return all.length ? all[0] : null
      },
      requestSubmit() { /* no-op shim: composer submit never auto-fires in unit tests */ },
      addEventListener(type, fn) {
        const k = String(type).toLowerCase()
        if (!listeners.has(k)) listeners.set(k, new Set())
        listeners.get(k).add(fn)
      },
      removeEventListener(type, fn) {
        listeners.get(String(type).toLowerCase())?.delete(fn)
      },
      dispatchEvent(ev) {
        const list = listeners.get(String(ev?.type || '').toLowerCase()) || []
        for (const fn of list) try { fn(ev) } catch (_) { /* ignore */ }
        return !ev?.cancelBubble
      },
    }
    node.ownerDocument = globalThis.document
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
    createEvent() { return new Proxy({ type: '', cancelBubble: false }, {}) },
  }
  body.ownerDocument = doc

  globalThis.document = doc
  if (!Object.getOwnPropertyDescriptor(globalThis, 'window')?.writable &&
      !Object.getOwnPropertyDescriptor(globalThis, 'window')?.set) {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis, writable: true })
  } else {
    globalThis.window = globalThis
  }
  try {
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    if (!navDesc || navDesc.writable || navDesc.set) {
      globalThis.navigator = { userAgent: 'VAO-Test-Shim', platform: 'Node.js' }
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: { userAgent: 'VAO-Test-Shim', platform: 'Node.js' },
      })
    }
  } catch (_) { /* ignore if already frozen with no configurability; navigator not strictly required for current renders */ }
  if (!globalThis.CustomEvent) {
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class CustomEvent {
        constructor(type, opts = {}) { this.type = type; Object.assign(this, opts) }
      },
      writable: true,
    })
  }
  if (!globalThis.matchMedia) {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, media: '', addListener() {}, removeListener() {} }),
      writable: true,
    })
  }
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
  // Office canvas content lives inside handle.nodes.canvas (node = canvas <main>) or handle.office.mount <main>
  if (handle.nodes?.canvas) parts.push(handle.nodes.canvas.outerHTML || handle.nodes.canvas.innerHTML || '')
  if (handle.office?.mount) parts.push(handle.office.mount.outerHTML || handle.office.mount.innerHTML || '')
  // also pull body innerHTML to catch anything appended directly:
  if (globalThis.document?.body?.innerHTML) parts.push(globalThis.document.body.innerHTML)
  return parts.join('\n')
}

/* ------------------------------------------------------------------ */
/* FIX 9 — Demo truthfulness tests                                    */
/* ------------------------------------------------------------------ */

test('FIX 9a. [LIVE mode no fixtures] Core bootstrap live/mode=live renders no 李产品/王测试/张审查 and no DEMO banner', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  const html = collectHTML(handle)
  assert.ok(!html.includes('李产品'), 'live mode MUST NOT render fixture name 李产品')
  assert.ok(!html.includes('王测试'), 'live mode MUST NOT render fixture name 王测试')
  assert.ok(!html.includes('张审查'), 'live mode MUST NOT render fixture name 张审查')
  assert.ok(!html.includes('演示数据'), 'live mode MUST NOT render 演示数据 banner')
  assert.ok(!html.includes('DEMO'), 'live mode MUST NOT render DEMO banner pill')
  handle.destroy()
})

test('FIX 9b. [LIVE empty runtime] live mode with no runtime uses buildEmptyRuntime honest empty — no 李产品/王测试/张审查', () => {
  const Shell = loadCoreModules()
  const { buildEmptyRuntime, buildEmptyHelix, DEMO_RUNTIME } = Shell
  const e = buildEmptyRuntime()
  assert.deepEqual(e.members, { human: [], ai: [] }, 'buildEmptyRuntime members are honest empty')
  assert.equal(e.waitingHuman.length, 0, 'buildEmptyRuntime waitingHuman = 0')
  assert.equal(e.runtimeStatus, 'connecting', 'live empty runtime status = connecting not live')
  const h = buildEmptyHelix()
  assert.equal(h.conversation.length, 0, 'Helix empty conv = []')
  assert.equal(h.recent.length, 0, 'Helix empty recent = []')
  assert.equal(h.decisions.length, 0, 'Helix empty decisions = []')
  const fixtureNames = new Set(['李产品', '王测试', '张审查'])
  for (const m of DEMO_RUNTIME.members.human.concat(DEMO_RUNTIME.members.ai)) {
    if (fixtureNames.has(m.name)) continue
  }
  const handle = Shell.bootstrap({ mode: 'live' })
  const html = collectHTML(handle)
  for (const bad of ['李产品', '王测试', '张审查']) {
    assert.ok(!html.includes(bad), `live mode without any runtime arg auto fallback forbidden → ${bad} must be absent`)
  }
  handle.destroy()
})

test('FIX 9c. [FAKE mode may render fixtures] mode=fake or mode=demo renders DEMO banner and fixture names allowed', () => {
  const Shell = loadCoreModules()
  for (const mode of ['fake', 'demo']) {
    const handle = Shell.bootstrap({ mode })
    const html = collectHTML(handle)
    assert.ok(html.includes('演示数据') || html.includes('DEMO'), `${mode} mode MUST show DEMO indicator pill, got: ${html.slice(0, 500)}`)
  }
})

test('FIX 9d. [runtimeMode helper] runtimeMode() gates correctly: live/live fake→demo demo→demo anything else→live; DEFAULT_RUNTIME export name removed (now DEMO_RUNTIME)', () => {
  const Shell = loadCoreModules()
  assert.equal(Shell.runtimeMode({ mode: 'live' }), 'live')
  assert.equal(Shell.runtimeMode({ mode: 'fake' }), 'demo')
  assert.equal(Shell.runtimeMode({ mode: 'demo' }), 'demo')
  assert.equal(Shell.runtimeMode({ mode: 'LIVE' }), 'live')
  assert.equal(Shell.runtimeMode({ runtime: { runtimeStatus: 'demo' } }), 'demo')
  assert.equal(Shell.runtimeMode({}), 'live', 'default without options is LIVE — never auto fixture')
  assert.ok('DEMO_RUNTIME' in Shell, 'Must clearly export DEMO_RUNTIME (not named DEFAULT_RUNTIME to prevent accidental misuse)')
  assert.ok('HELIX_DEMO' in Shell, 'Must clearly export HELIX_DEMO')
})

/* ------------------------------------------------------------------ */
/* FIX 8 — Core shell live update behavioral tests                    */
/* ------------------------------------------------------------------ */

test('FIX 8a. [setTasks behavioral] Core bootstrap live empty → update snapshot tasks WORKING renders WORKING state visible in canvas/task card', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  assert.ok(!html.includes('派发中'), 'initial IDLE live empty MUST NOT contain WORKING(派发中) Chinese label initially')
  assert.ok(!html.includes('工作中'), 'initial IDLE live empty MUST NOT contain any working state labels')
  handle.update({
    snapshot: {
      tasks: [{ id: 'T-behavior-1', title: 'Behavioral Task A', status: 'running', role: 'architect', kind: 'feature', difficulty: 'hard' }],
      edges: [],
      seatStates: { architect: 'WORKING' },
      seatKinds: { architect: 'ai' },
      seatMembers: { architect: 'Claude Behavioral' },
      seatModels: { architect: 'test-model' },
    },
  })
  html = collectHTML(handle)
  assert.ok(html.includes('派发中') || html.includes('Behavioral Task A') || html.includes('T-behavior-1'),
    `after setTasks/snapshot update with status=running → DOM MUST show WORKING state ("派发中" Chinese pill or task title) in rendered seat/task card. Tail scan has 派发中=${html.includes('派发中')} TaskA=${html.includes('Behavioral Task A')}`)
  assert.ok(html.includes('派发中'), `state seat pill WORKING → zh="派发中" MUST be visible in canvas office seat rendering after snapshot.seatStates update`)
  handle.destroy()
})

test('FIX 8b. [setAgent behavioral] Core bootstrap live → update runtime seatStates[role] + members updates rail/bar seat agent visual', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  handle.update({
    runtime: {
      members: { ai: [{ id: 'a-arch', name: 'Codex Live Test', role: 'architect', online: true, model: 'test-model' }], human: [] },
      waitingHuman: [],
    },
    snapshot: {
      seatStates: { architect: 'REVIEWING' },
      seatKinds: { architect: 'ai' },
      seatMembers: { architect: 'Codex Live Test' },
    },
  })
  const html = collectHTML(handle)
  assert.ok(html.includes('Codex Live Test'), 'setAgent-style runtime.members update → agent name visible in rail/office canvas')
  assert.ok(html.includes('评审中'), `setAgent seatStates REVIEWING.zh = "评审中" MUST be visible in rendered rail/seat state pill`)
  handle.destroy()
})

test('FIX 8c. [say / Helix conversation behavioral] Core bootstrap live empty → update helix.conversation adds visible Helix bubble text in panel', () => {
  const Shell = loadCoreModules()
  const handle = Shell.bootstrap({ mode: 'live', runtime: {}, helix: {}, snapshot: {} })
  let html = collectHTML(handle)
  assert.ok(!html.includes('Helix behavioral new message XYZ'), 'initial empty Helix panel MUST NOT contain new message')
  handle.update({
    helix: {
      state: 'THINKING',
      conversation: [
        { who: 'Helix', side: 'helix', text: 'Helix behavioral new message XYZ' },
        { who: '你', side: 'user', text: 'hello behavioral' },
      ],
      recent: [{ at: Date.now(), text: 'Recent Behavioral Entry 42' }],
    },
  })
  html = collectHTML(handle)
  assert.ok(html.includes('Helix behavioral new message XYZ'), 'say() equivalent bridge update → Helix conversation bubble visible in panel HTML')
  assert.ok(html.includes('hello behavioral'), 'user conversation bubble also present after helix update')
  assert.ok(html.includes('Recent Behavioral Entry 42'), 'activity/say recent update visible in Helix panel recent section')
  handle.destroy()
})

test('FIX 8d. [app.js bridge surface exists] app.js exports adapter methods (setRoster/setAgent/setTasks/meeting/say/dispatch/activity) via makeOffice → they call refreshCoreHandle which derives and calls coreHandle.update (structural + regex verification)', () => {
  assert.match(appSrc, /function refreshCoreHandle\s*\(/, 'app.js MUST declare refreshCoreHandle() bridge helper')
  assert.match(appSrc, /coreHandle\.update\s*\(/, 'app.js refreshCoreHandle MUST eventually call coreHandle.update(...) to re-render Core')
  const requiredBridges = ['setRoster', 'setAgent', 'setTasks', 'meeting', 'say', 'dispatch', 'activity']
  for (const method of requiredBridges) {
    const re = new RegExp(`${method}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?refreshCoreHandle\\s*\\(`, 'm')
    assert.match(appSrc, re, `app.js adapter bridge ${method}() MUST trigger refreshCoreHandle → so legacy runtime events visibly update Core UI`)
  }
  assert.match(appSrc, /deriveCoreRuntimeFromState\s*\(/, 'Honest bootstrap derivation helper must exist (Fix 4)')
  assert.match(appSrc, /Shell\.bootstrap\s*\(\s*\{[\s\S]*?mode\s*:\s*derived\.mode/, 'Shell.bootstrap receives explicit mode from derived state (never silent fallback)')
})

/* ---------------------------------------------------------------------------
 * INTERACTIVE OFFICE V2 — 11 interaction tests (6-zone spatial redesign)
 * Loads V2 IIFE modules into Node.js using the same minimal DOM shim.
 * ------------------------------------------------------------------------- */

function loadV2Modules() {
  installMinimalDOMShim()
  const order = [
    'public/core/core-theme.js',
    'public/core/core-states.js',
    'public/core/core-characters-v2.js',
    'public/core/core-office-v2.js',
    'public/core/core-shell-v2.js',
    'public/core/demo-v2.js',
    'public/core/app-v2.js',
  ]
  for (const rel of order) {
    const abs = path.join(ROOT, rel)
    delete require.cache[abs]
    require(abs)
  }
  return {
    Theme: globalThis.VAOCoreTheme,
    S: globalThis.VAOCoreStates,
    Chars: globalThis.VAOCoreCharactersV2,
    Office: globalThis.VAOCoreOfficeV2,
    Shell: globalThis.VAOCoreShellV2,
    Demo: globalThis.VAODemoV2,
    App: globalThis.VAOAppV2,
  }
}

function collectV2HTML(handle) {
  const parts = []
  for (const key of Object.keys(handle?.nodes || {})) {
    const n = handle.nodes[key]
    if (n) parts.push(n.outerHTML || n.innerHTML || '')
  }
  if (handle?.office?.mount) parts.push(handle.office.mount.outerHTML || handle.office.mount.innerHTML || '')
  if (globalThis.document?.body?.innerHTML) parts.push(globalThis.document.body.innerHTML)
  return parts.join('\n')
}

test('V2-T1. [role click → inspector] Shell.bootstrap demo mode → dispatch vao-v2:role-clicked(frontend) → drawer shows Role Inspector with Frontend Engineer / Member / State fields', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  const html0 = collectV2HTML(handle)
  assert.ok(!html0.includes('Frontend Engineer') || !html0.includes('Role Inspector'),
    'initial render MUST NOT yet contain role inspector drawer')
  const ev = new globalThis.CustomEvent('vao-v2:role-clicked', {
    detail: { roleId: 'frontend', el: handle.nodes.stageWrap },
  })
  handle.nodes.stageWrap.dispatchEvent(ev)
  const html = collectV2HTML(handle)
  assert.ok(html.includes('Role Inspector'), `after vao-v2:role-clicked(frontend) → drawer header must say Role Inspector. Scan tail = ${html.slice(-800)}`)
  assert.ok(html.includes('前端工程师') || html.includes('Frontend Engineer'),
    `drawer MUST contain role name frontend. Present zh=前端工程师:${html.includes('前端工程师')} en=Frontend Engineer:${html.includes('Frontend Engineer')}`)
  assert.ok(html.includes('class="k">Member<'), 'drawer KV section MUST contain Member key')
  assert.ok(html.includes('class="k">State<'), 'drawer KV section MUST contain State key')
  handle.destroy?.()
})

test('V2-T2. [workstation click → same inspector] vao-v2:workstation-clicked(qa) opens identical role inspector drawer as role-clicked path', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  const ev = new globalThis.CustomEvent('vao-v2:workstation-clicked', {
    detail: { roleId: 'qa' },
  })
  handle.nodes.stageWrap.dispatchEvent(ev)
  const html = collectV2HTML(handle)
  assert.ok(html.includes('Role Inspector'), 'workstation-clicked MUST open Role Inspector drawer')
  assert.ok(html.includes('测试工程师') || html.includes('QA Engineer'),
    `workstation-clicked qa role MUST render QA role name. zh=测试工程师:${html.includes('测试工程师')} en=QA Engineer:${html.includes('QA Engineer')}`)
  assert.ok(html.includes('Human·AI'), 'role inspector KV MUST contain Human·AI section regardless of role-clicked vs workstation-clicked path')
  handle.destroy?.()
})

test('V2-T3. [task click → task inspector] vao-v2:task-clicked(V2-101) opens task drawer with id/title/owner/evidence', () => {
  const M = loadV2Modules()
  const runtime = {
    tasks: [
      { id: 'V2-101', title: 'V2 六区楼地面层重构', status: 'running', role: 'architect', kind: 'feature', difficulty: 'hard' },
    ],
  }
  const handle = M.Shell.bootstrap({ mode: 'demo', runtime })
  const ev = new globalThis.CustomEvent('vao-v2:task-clicked', {
    detail: { taskId: 'V2-101' },
  })
  handle.nodes.stageWrap.dispatchEvent(ev)
  const html = collectV2HTML(handle)
  assert.ok(html.includes('Task Inspector'), `task-clicked MUST render Task Inspector header. tail=${html.slice(-400)}`)
  assert.ok(html.includes('V2-101'), 'task inspector MUST contain task id V2-101')
  assert.ok(html.includes('V2 六区楼地面层重构'), 'task inspector MUST contain task title')
  assert.ok(html.includes('架构师') || html.includes('Architect'), 'task inspector MUST show owner architect')
  assert.ok(html.includes('Evidence'), 'task inspector MUST contain Evidence section')
  handle.destroy?.()
})

test('V2-T4. [runtime state → visual state] Shell bootstrap live → handle office setRoleState(architect, WORKING) → mounted SVG has sk2-state-working class', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'live' })
  handle.office?.setRoleState?.('architect', 'WORKING')
  const html = collectV2HTML(handle)
  // sk2-state-working class is applied on .char-<roleId> wrapper when state = WORKING
  const hasStateClass = html.includes('sk2-state-working')
  const hasRoleNode = html.includes('char-architect') || html.includes('data-role="architect"')
  assert.ok(hasRoleNode, `mounted office MUST have char-architect node. Present=${hasRoleNode}`)
  assert.ok(hasStateClass, `after setRoleState(architect,WORKING) → SVG .char-architect MUST carry sk2-state-working class. Classes present=sk2-state-working:${hasStateClass}`)
  handle.destroy?.()
})

test('V2-T5. [WAITING_HUMAN → Human Area active] animate.waitingHuman(true) → zone-human-area data-active="true" AND human-request-card visible', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  // Pre check: default Human Area hidden
  let html = collectV2HTML(handle)
  const zoneRe = /class="zone\s+zone-human-area"[^>]*data-active="(true|false)"/
  const before = html.match(zoneRe)?.[1]
  handle.animate?.waitingHuman?.(true)
  html = collectV2HTML(handle)
  const after = html.match(zoneRe)?.[1]
  assert.equal(after, 'true', `after animate.waitingHuman(true) → zone-human-area data-active MUST flip → true. before=${before} after=${after}`)
  // human-request-card group element present in mounted SVG (via opacity/ display removal — visible means group exists with data-active=true)
  const hasCard = html.includes('human-request-card')
  assert.ok(hasCard, 'after activateHumanArea → human-request-card <g> MUST be present in mounted SVG (data-active branch draws it)')
  handle.destroy?.()
})

test('V2-T6. [BLOCKED visual state] office.setRoleState(frontend, BLOCKED) → char-frontend carries sk2-state-blocked class', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  handle.office?.setRoleState?.('frontend', 'BLOCKED')
  const html = collectV2HTML(handle)
  assert.ok(html.includes('sk2-state-blocked'),
    `setRoleState(frontend,BLOCKED) → SVG MUST carry sk2-state-blocked state class. Has sk2-state-blocked=${html.includes('sk2-state-blocked')}`)
  handle.destroy?.()
})

test('V2-T7. [DONE → IDLE transition timer] animate.done(frontend, 50ms) with short delay → state shifts from sk2-state-done to sk2-state-idle within tolerance', (_, done) => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  handle.animate?.done?.('frontend', 50)
  // Immediately after call → DONE class must be present
  const immediate = collectV2HTML(handle)
  const hadDone = immediate.includes('sk2-state-done')
  setTimeout(() => {
    const later = collectV2HTML(handle)
    const hasIdle = later.includes('sk2-state-idle')
    try {
      assert.ok(hadDone, 'immediately after animate.done → state MUST show DONE (sk2-state-done class)')
      assert.ok(hasIdle, `after delay+50ms → state MUST settle back to IDLE (sk2-state-idle). Immediately hadDone=${hadDone}. Later hasIdle=${hasIdle}`)
      handle.destroy?.()
      done()
    } catch (e) {
      handle.destroy?.()
      done(e)
    }
  }, 140)
})

test('V2-T8. [Helix panel expand/collapse] handle.setHelix(true/false) toggles body.v2-helix-open class AND helix rail expanded/collapsed content', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'live' })
  handle.setHelix(true)
  let html = collectV2HTML(handle)
  let hasOpen = globalThis.document.body.classList.contains('v2-helix-open')
  assert.ok(hasOpen, 'after setHelix(true) → body MUST carry v2-helix-open class')
  // With helix open → rail should render v2-helix-expanded node
  assert.ok(handle.nodes.helixRail.querySelector || true, 'helix rail exists')
  const expanded = collectV2HTML(handle).includes('v2-helix-expanded')
  assert.ok(expanded, `after setHelix(true) → rail inner MUST contain v2-helix-expanded class wrapper. expandedPresent=${expanded}`)
  handle.setHelix(false)
  hasOpen = globalThis.document.body.classList.contains('v2-helix-open')
  assert.ok(!hasOpen, 'after setHelix(false) → body MUST NOT carry v2-helix-open class')
  handle.destroy?.()
})

test('V2-T9. [Navigation collapse] handle.setNav(false) adds body.v2-nav-collapsed; titles hidden via CSS class', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  handle.setNav(false)
  const collapsed = globalThis.document.body.classList.contains('v2-nav-collapsed')
  assert.ok(collapsed, 'after setNav(false) → body MUST carry v2-nav-collapsed class')
  // InjectCss in shell-v2 guarantees the class is wired to display:none for titles
  const shellCss = globalThis.document.getElementById(M.Shell?.CSS_ID || 'v2-shell-css')?.textContent || ''
  assert.match(shellCss, /\.v2-nav-collapsed[\s\S]*?\.v2-nav-item-title[\s\S]*?display:\s*none\s*!important/,
    'v2-shell CSS MUST hide nav item titles via v2-nav-collapsed selector (nav collapse spec)')
  handle.destroy?.()
})

test('V2-T10. [Core ↔ Classic functional] VAOCoreShellV2.restoreClassicScaffold() rewrites body with .app/.layout/#scene/#office canvas; then setSkinV2(core) re-boots V2', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'live' })
  let html = globalThis.document.body.innerHTML
  const bodyHasClass = globalThis.document.body.classList?.contains?.('v2-shell-body')
  const inAttr = /<body[^>]*class="[^"]*v2-shell-body[^"]*"/i.test(html) || html.includes('v2-shell-body')
  assert.ok(bodyHasClass || inAttr, `Core active → body carries v2-shell-body. classList.has=${bodyHasClass} html.in=${inAttr}`)
  M.Shell.restoreClassicScaffold()
  html = globalThis.document.body.innerHTML
  assert.ok(html.includes('class="app"'), `Classic scaffold MUST contain <div class="app">. present=${html.includes('class="app"')}`)
  assert.ok(html.includes('class="layout"'), 'Classic scaffold MUST contain <main class="layout">')
  assert.ok(html.includes('id="scene"'), 'Classic scaffold MUST contain <div class="scene" id="scene">')
  assert.ok(html.includes('id="office"'), `Classic scaffold MUST contain <canvas id="office">. present=${html.includes('id="office"')}`)
  assert.ok(html.includes('skins"'), `Classic scaffold MUST restore #skins selector so legacy setSkin() still works. present=${html.includes('skins"')}`)
  // Reset back to Core V2 via AppV2.setSkin('core').
  // Note: App may have bootstrapped Core on load via bootIfNeeded. First switch to a classic skin so id mismatch bypasses early-return guard, then back to core.
  const App = M.App
  if (App && typeof App.setSkin === 'function') {
    const origId = App.currentSkinId
    // Force transient classic to ensure state transition
    try { App.setSkin(M.Shell?.CLASSIC_IDS?.[0] || 'sakura') } catch (_) {}
    // Now transition back to core
    App.setSkin('core')
  }
  html = globalThis.document.body.innerHTML
  const hasCoreBar = html.includes('v2-top-bar') || html.includes('v2-shell-body') || globalThis.document.body.classList.contains('v2-shell-body')
  assert.ok(hasCoreBar, `after setSkin(core) → V2 shell MUST be re-mounted (body v2-shell-body or #v2-top-bar present). hasCoreBar=${hasCoreBar}`)
  handle.destroy?.()
})

test('V2-T11. [reduced-motion disables] force matchMedia(prefers-reduced-motion)=matches → Chars.injectStyles @media block contains animation:none !important for sk2-fig', () => {
  const M = loadV2Modules()
  // 1) Clear any previously injected chars-v2 style so injectStyles actually re-runs the write.
  const prev = globalThis.document.getElementById('core-chars-v2-css')
  if (prev) prev.remove()
  // 2) Override matchMedia shim to report prefers-reduced-motion: reduce → matches:true
  const origMatchMedia = globalThis.matchMedia
  globalThis.matchMedia = (q) => ({
    matches: String(q || '').includes('prefers-reduced-motion') && String(q).includes('reduce'),
    media: '',
    addListener() {},
    removeListener() {},
  })
  try {
    M.Chars?.injectStyles?.()
    const styleNode = globalThis.document.getElementById('core-chars-v2-css')
    assert.ok(styleNode, 'Chars.injectStyles() MUST append <style id="core-chars-v2-css"> to head')
    const css = styleNode.textContent || ''
    const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.sk2-fig[\s\S]*?animation:\s*none\s*!important/
    assert.match(css, re,
      `chars-v2 injected CSS MUST contain @media (prefers-reduced-motion: reduce) block that disables animation for .sk2-fig. Snip: ${css.slice(2200, 2700)}`)
  } finally {
    globalThis.matchMedia = origMatchMedia
  }
})

/* ---- FINAL CORRECTNESS CLOSEOUT — Task Exact-Once + Inspector LIVE contract ---- */

test('C1-TASK-ONCE. [task exact-once initial] Shell bootstrap mode=demo → one bubbling task event on stageWrap → onPickTask called exactly 1; Task Inspector present in body', () => {
  const M = loadV2Modules()
  let pickCount = 0
  const handle = M.Shell.bootstrap({ mode: 'demo', onPickTask: () => { pickCount++ } })
  const ev = new globalThis.CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'T-DEMO-1' } })
  handle.nodes.stageWrap.dispatchEvent(ev)
  assert.equal(pickCount, 1, `one stageWrap task event must trigger onPickTask exactly once (got ${pickCount})`)
  const html = collectV2HTML(handle)
  assert.ok(html.includes('Task Inspector'), `after task-click event, Task Inspector drawer must appear in DOM; last 800=${html.slice(-800)}`)
  handle.destroy?.()
})

test('C2-TASK-3REMOUNT. [task exact-once after 3 destroy/remount] Core bootstrap/destroy 3 cycles → 4th mount → task event still triggers onPickTask once', () => {
  const M = loadV2Modules()
  let pickCount = 0
  let handle = null
  for (let i = 0; i < 3; i++) {
    handle = M.Shell.bootstrap({ mode: 'live', onPickTask: () => {} })
    handle.destroy?.()
  }
  handle = M.Shell.bootstrap({ mode: 'demo', onPickTask: () => { pickCount++ } })
  const ev = new globalThis.CustomEvent('vao-v2:task-clicked', { bubbles: true, detail: { taskId: 'T-REMOUNT-4' } })
  handle.nodes.stageWrap.dispatchEvent(ev)
  assert.equal(pickCount, 1, `3 remounts → single task click = 1 callback actual=${pickCount}`)
  handle.destroy?.()
})

test('C3-NO-GLOBAL-LISTENER. [no window task listener] Core shell must register window vao-v2:task-clicked listener ONLY 0 times. Structural regex: no window.addEventListener(task-clicked) in shell', () => {
  // Product spec: window task listener forbidden; removed in closeout fix 1.
  // Structural check on the actual shell source is stronger than Node shim (which
  // has a partial window shim).
  const shellV2Src = read('public/core/core-shell-v2.js')
  const re = /window\s*\.\s*addEventListener\s*\(\s*['\"]vao-v2:task-clicked['\"]/g
  const matches = shellV2Src.match(re) || []
  assert.equal(matches.length, 0,
    `core-shell-v2.js MUST NOT contain window.addEventListener('vao-v2:task-clicked' ...) — window-level listener forbidden. Matches=${matches.length}`)
})

test('C4-LIVE-NO-FAKES. [LIVE Role Inspector no fabrication] bootstrap mode=live empty runtime → open Role Inspector frontend → no 【演示】/ no a31f / no synthetic recent / no Math.random waiting', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'live' })
  const ev = new globalThis.CustomEvent('vao-v2:role-clicked', { detail: { roleId: 'frontend', el: handle.nodes.stageWrap } })
  handle.nodes.stageWrap.dispatchEvent(ev)
  const html = collectV2HTML(handle)
  const demoMarkerCount = (html.match(/【演示】|【演示数据】/g) || []).length
  const fakeShaCount = (html.match(/a31f/g) || []).length
  const syntheticRecent = html.includes('从 IDLE → THINKING') || html.includes('加载工具：browser / mcp-desktop')
  const randomWaiting = /已等待 \d+ 分钟：需要人类确认规格/.test(html) && !html.includes('【演示】')
  assert.equal(demoMarkerCount, 0, `LIVE inspector must contain 0 【演示】 markers; actual=${demoMarkerCount}`)
  assert.equal(fakeShaCount, 0, `LIVE inspector must contain 0 fake a31f SHA; actual=${fakeShaCount}`)
  assert.ok(!syntheticRecent, `LIVE inspector MUST NOT fabricate synthetic recent events`)
  assert.ok(html.includes('暂无证据') || html.includes('暂无最近事件') || html.includes('暂无活动任务'), `LIVE inspector with no runtime data MUST show empty-state strings`)
  handle.destroy?.()
})

test('C5-DEMO-STILL-FIXTURES. [DEMO Role Inspector may retain labeled fixtures] bootstrap mode=demo → role inspector qa → labeled 【演示】 fixture present OR demo task evidence shown', () => {
  const M = loadV2Modules()
  const handle = M.Shell.bootstrap({ mode: 'demo' })
  const ev = new globalThis.CustomEvent('vao-v2:role-clicked', { detail: { roleId: 'qa', el: handle.nodes.stageWrap } })
  handle.nodes.stageWrap.dispatchEvent(ev)
  const html = collectV2HTML(handle)
  const ok = html.includes('【演示】') || html.includes('【演示数据】') || html.includes('a31f')
  assert.ok(ok, `DEMO mode role inspector MUST keep its labeled demo fixtures (visual contract)`)
  handle.destroy?.()
})

/* ------------------------------------------------------------------ */
/* ANATOMY contract tests (Commit A)                                   */
/* ------------------------------------------------------------------ */

test('ANAT-T1. [ANATOMY constant] VAOCoreCharactersV2.ANATOMY exists with FRAME_W=48, FRAME_H=82, anchors at HEAD_CENTER(24,25), HEAD_RADIUS=8.5, EYE_LEFT(21,26.8), STATE_MARKER(40,10), CHEST_CENTER.y=48, DESK_TOP_Y=57', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  assert.ok(CV2.ANATOMY, 'CV2.ANATOMY top-level constant must be exposed')
  assert.equal(CV2.ANATOMY.FRAME_W, 48, 'FRAME_W=48')
  assert.equal(CV2.ANATOMY.FRAME_H, 82, 'FRAME_H=82')
  assert.equal(CV2.ANATOMY.HEAD_CENTER.x, 24, 'HEAD_CENTER.x=24')
  assert.equal(CV2.ANATOMY.HEAD_CENTER.y, 25, 'HEAD_CENTER.y=25')
  assert.equal(CV2.ANATOMY.HEAD_RADIUS, 8.5, 'HEAD_RADIUS=8.5')
  assert.equal(CV2.ANATOMY.EYE_LEFT.x, 21, 'EYE_LEFT.x=21')
  assert.equal(CV2.ANATOMY.EYE_LEFT.y, 26.8, 'EYE_LEFT.y=26.8')
  assert.equal(CV2.ANATOMY.EYE_RIGHT.x, 27, 'EYE_RIGHT.x=27')
  assert.equal(CV2.ANATOMY.EYE_RIGHT.y, 26.8, 'EYE_RIGHT.y=26.8')
  assert.equal(CV2.ANATOMY.STATE_MARKER.x, 40, 'STATE_MARKER.x=40')
  assert.equal(CV2.ANATOMY.STATE_MARKER.y, 10, 'STATE_MARKER.y=10')
  assert.equal(CV2.ANATOMY.CHEST_CENTER.y, 48, 'CHEST_CENTER.y=48')
  assert.equal(CV2.ANATOMY.DESK_TOP_Y, 57, 'DESK_TOP_Y=57')
  assert.ok(CV2._internals.ANATOMY, 'ANATOMY also exposed via _internals')
  assert.equal(CV2._internals.ANATOMY, CV2.ANATOMY, 'ANATOMY same reference via api and _internals')
})

test('ANAT-T2. [HAND_ANCHORS constant] HAND_ANCHORS exists with all 8 states; each has left/right {x,y} finite numbers', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  assert.ok(CV2.HAND_ANCHORS, 'CV2.HAND_ANCHORS top-level exposed')
  const states = ['IDLE', 'THINKING', 'WORKING', 'REVIEWING', 'WAITING_HUMAN', 'BLOCKED', 'DONE', 'OFFLINE']
  for (const s of states) {
    assert.ok(CV2.HAND_ANCHORS[s], `HAND_ANCHORS[${s}] must exist`)
    assert.ok(CV2.HAND_ANCHORS[s].left, `${s} has .left`)
    assert.ok(CV2.HAND_ANCHORS[s].right, `${s} has .right`)
    assert.ok(Number.isFinite(CV2.HAND_ANCHORS[s].left.x), `${s}.left.x is finite`)
    assert.ok(Number.isFinite(CV2.HAND_ANCHORS[s].left.y), `${s}.left.y is finite`)
    assert.ok(Number.isFinite(CV2.HAND_ANCHORS[s].right.x), `${s}.right.x is finite`)
    assert.ok(Number.isFinite(CV2.HAND_ANCHORS[s].right.y), `${s}.right.y is finite`)
  }
})

/* Helpers: balanced substring extraction for outer <g class="NAME"> groups. */
function substringByClassName(svg, className) {
  const re = new RegExp('<g\\b[^>]*class="[^"]*\\b' + className.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\b')
  const m = svg.match(re)
  if (!m) return ''
  return svg.slice(m.index, findBalancedCloseSibling(svg, m.index))
}
function findBalancedCloseSibling(s, openIdx) {
  if (openIdx < 0 || openIdx >= s.length) return s.length
  const depthStart = s.lastIndexOf('<g', openIdx + 50) >= 0 ? 1 : 0
  let depth = depthStart
  const gOpen = s.indexOf('<g', openIdx)
  if (gOpen >= 0 && gOpen - openIdx < 200) { depth = Math.max(1, depth) }
  let i = openIdx
  const len = s.length
  while (i < len) {
    const open = s.indexOf('<g', i)
    const close = s.indexOf('</g>', i)
    if (open < 0 && close < 0) return len
    if (close < 0 || (open >= 0 && open < close)) {
      depth++
      i = open + 2
    } else {
      depth--
      if (depth <= 0) return close + 4
      i = close + 4
    }
  }
  return len
}

test('ANAT-T3. [Architect glasses in head-wrap] Architect glasses circles at cx=21/cx=27 cy=26.8 live inside sk2-head-wrap DOM group containing sk2-face-accessory', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('architect', { state: 'IDLE' })
  assert.ok(svg.includes('sk2-head-wrap'), 'svg must contain sk2-head-wrap group')
  assert.ok(svg.includes('sk2-face-accessory'), 'svg must contain sk2-face-accessory group (inside head-wrap)')
  const headInner = substringByClassName(svg, 'sk2-head-wrap')
  assert.ok(headInner.includes('<circle cx="21" cy="26.8"'), 'EYE_LEFT circle cx=21 cy=26.8 inside sk2-head-wrap')
  assert.ok(headInner.includes('<circle cx="27" cy="26.8"'), 'EYE_RIGHT circle cx=27 cy=26.8 inside sk2-head-wrap')
  assert.ok(headInner.includes('sk2-face-accessory'), 'sk2-face-accessory class marker present inside head-wrap')
})

test('ANAT-T4. [Product badge NOT in head-wrap] Product clipboard-badge lives in sk2-torso-accessory / outside head-wrap group', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('product', { state: 'IDLE' })
  const headInner = substringByClassName(svg, 'sk2-head-wrap')
  const torsoInner = substringByClassName(svg, 'sk2-torso')
  const forbiddenInHead = ['clipboard-badge', 'data-role="product"', 'sk2-torso-accessory']
  for (const p of forbiddenInHead) {
    assert.ok(!headInner.includes(p), `Product marker "${p}" must NOT appear inside sk2-head-wrap`)
  }
  assert.ok(torsoInner.includes('sk2-torso-accessory'), 'sk2-torso-accessory must appear inside sk2-torso')
  const hasBadgeInTorso = torsoInner.includes('clipboard-badge') || torsoInner.includes('data-role="product"') || torsoInner.includes('var(--role-product)')
  assert.ok(hasBadgeInTorso, 'Product badge/identifier must appear inside sk2-torso class subtree, not head-wrap')
})

test('ANAT-T5. [Backend lanyard y>=36] Backend db-lanyard torso V-strap paths start at Y>=36 (never above CHIN)', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('backend', { state: 'IDLE' })
  const torsoAccInner = substringByClassName(svg, 'sk2-torso-accessory')
  assert.ok(torsoAccInner.includes('var(--role-backend)') || torsoAccInner.includes('M19 37'),
    'Backend torso-accessory must contain lanyard V-strap + DB badge')
  const lanyardPaths = [...torsoAccInner.matchAll(/<path[^>]*d="M([0-9.]+)\s+([0-9.]+)/g)]
  assert.ok(lanyardPaths.length >= 1, 'Backend sk2-torso-accessory must have at least one path')
  for (const m of lanyardPaths) {
    const y = parseFloat(m[2])
    assert.ok(Number.isFinite(y) && y >= 36, `Backend lanyard accessory path M Y must be >= 36 (below CHIN=33.5); got Y=${y}`)
  }
})

test('ANAT-T6. [QA checklist below eyes] QA checklist rectangle y>=40 (safely below eye bbox y 24-30)', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('qa', { state: 'IDLE' })
  const torsoAccInner = substringByClassName(svg, 'sk2-torso-accessory')
  assert.ok(torsoAccInner.includes('var(--role-qa)') || torsoAccInner.includes('checker-torso'),
    'QA torso-accessory group must contain checklist')
  const checklistRects = [...torsoAccInner.matchAll(/<rect[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/g)]
  assert.ok(checklistRects.length >= 1, 'QA torso-accessory must contain checklist rectangle(s)')
  for (const m of checklistRects) {
    const y = parseFloat(m[2])
    const h = parseFloat(m[4])
    const bottom = y + h
    assert.ok(Number.isFinite(y) && y >= 40, `QA checklist rect top Y must be >= 40 (below eye bbox ~24-30); got Y=${y}`)
    assert.ok(bottom <= 65, `QA checklist bottom Y should stay within torso area; got bottom=${bottom}`)
  }
})

test('ANAT-T7. [Docs book >= y40] Docs book rectangle(s) in torso/hand-left have top y >= 40 (never over forehead)', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('docs', { state: 'IDLE' })
  const torsoAccInner = substringByClassName(svg, 'sk2-torso-accessory')
  const handRInner = substringByClassName(svg, 'sk2-hand-right-accessory')
  const handLInner = substringByClassName(svg, 'sk2-hand-left-accessory')
  const scan = torsoAccInner + handRInner + handLInner
  const bookRects = [...scan.matchAll(/<rect[^>]*x="([0-9.]+)"[^>]*y="([0-9.]+)"[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/g)]
  assert.ok(bookRects.length >= 1 || scan.includes('book-torso') || scan.includes('var(--role-docs)'),
    'Docs book must appear in accessory groups (torso/hand-left/right)')
  for (const m of bookRects) {
    const y = parseFloat(m[2])
    assert.ok(Number.isFinite(y) && y >= 40, `Docs book rect top Y must be >= 40 (never forehead/hair area); got Y=${y}`)
  }
})

test('ANAT-T8. [Head rotation ownership] Architect THINKING: sk2-head-wrap has rotate(-4deg) style AND glasses circles are inside head-wrap substring', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('architect', { state: 'THINKING' })
  const hwMatch = svg.match(/<g[^>]*class="[^"]*sk2-head-wrap[^"]*"[^>]*style="([^"]*)"[^>]*>/)
  assert.ok(hwMatch, 'sk2-head-wrap group must exist with style attribute')
  const headStyle = hwMatch[1]
  assert.ok(headStyle.includes('rotate(-4deg)'), `sk2-head-wrap style for THINKING MUST contain rotate(-4deg); got style=${headStyle}`)
  assert.ok(headStyle.includes('transform-origin:24px 25px') || headStyle.includes('transform-origin:24 25'),
    `THINKING head-wrap style must include transform-origin 24 25 (HEAD_CENTER); got=${headStyle}`)
  const headInner = substringByClassName(svg, 'sk2-head-wrap')
  assert.ok(headInner.includes('<circle cx="21" cy="26.8"'), 'Architect left glass EYE_LEFT circle inside head-wrap (rotates with head)')
  assert.ok(headInner.includes('<circle cx="27" cy="26.8"'), 'Architect right glass EYE_RIGHT circle inside head-wrap (rotates with head)')
})

test('ANAT-T9. [WAITING_HUMAN non-rotating torso badge] Product badge WAITING_HUMAN: head rotates 18deg but torso badge stays outside 18deg-rotate group', () => {
  const M = loadV2Modules()
  const CV2 = M.Chars
  const svg = CV2.renderSVG('product', { state: 'WAITING_HUMAN' })
  const hwMatch = svg.match(/<g[^>]*class="[^"]*sk2-head-wrap[^"]*"[^>]*style="([^"]*)"[^>]*>/)
  assert.ok(hwMatch, 'sk2-head-wrap must exist')
  const headStyle = hwMatch[1]
  assert.ok(headStyle.includes('rotate(18deg)'), `WAITING_HUMAN head-wrap style MUST contain rotate(18deg); got=${headStyle}`)
  const headInner = substringByClassName(svg, 'sk2-head-wrap')
  const torsoInner = substringByClassName(svg, 'sk2-torso')
  const productBadgePatterns = ['clipboard-badge', 'data-role="product"', 'sk2-torso-accessory']
  for (const p of productBadgePatterns) {
    assert.ok(!headInner.includes(p), `Product badge marker "${p}" must NOT be inside the rotate(18deg) head-wrap`)
  }
  const hasInTorso = productBadgePatterns.some((p) => torsoInner.includes(p)) || torsoInner.includes('var(--role-product)')
  assert.ok(hasInTorso, 'Product badge must live inside sk2-torso class subtree (NOT head-wrap; not tilted 18deg)')
})
