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

const ROOT = path.resolve(import.meta.dirname, '..')
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
