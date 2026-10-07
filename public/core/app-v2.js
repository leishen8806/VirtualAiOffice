/* Interactive Office V2 — main entry.
 *
 * Load order (per index.html):
 *   skin-format.js
 *   → core-theme.js         VAOCoreTheme (existing, reused)
 *   → core-states.js        VAOCoreStates (existing, reused)
 *   → core-characters-v2.js VAOCoreCharactersV2 (NEW 8-role shared skeleton + 8 states)
 *   → core-office-v2.js     VAOCoreOfficeV2 (NEW 6-zone 2.5D SVG 1600x900 floor)
 *   → core-shell-v2.js      VAOCoreShellV2 (NEW nav/Helix rail/inspectors/Demo/events)
 *   → demo-v2.js            VAODemoV2 (NEW visual-only scenario/cycle tooling)
 *   → app-v2.js             THIS FILE: boots default skin, wires Core ↔ Classic switch.
 *
 * Then LEGACY scripts load (office.js, chibi.js, anime.js, setup.js, skin-editor.js, demo.js, app.js).
 * The legacy app.js contains V1/V2-A core+classic branches; for Core V2 we boot first via this file,
 * and allow switching to classic (destroying V2 shell) so theme selector is fully functional.
 *
 * Theme flow:
 *   id === 'core' →  VAOCoreShellV2.bootstrap(…)
 *   id in CLASSIC_IDS → VAOCoreShellV2.restoreClassicScaffold(…) then let legacy app.js mount
 *                       its own classic renderers on the restored DOM skeleton.
 *
 * If legacy app.js already mounted a Core shell (V2-A) because the user previously loaded it,
 * we still install the V2 shell here when skin id resolves to 'core'.
 */
;(function () {
  'use strict'

  const ShellV2 = globalThis.VAOCoreShellV2
  const V2_CORE_ID = 'core'
  const CLASSIC_IDS = ShellV2 ? ShellV2.CLASSIC_IDS : ['sakura','night','neon','neko','pixel']
  const IS_CORE = (id) => String(id) === V2_CORE_ID
  const IS_CLASSIC = (id) => CLASSIC_IDS.includes(String(id))

  const SKIN_STORAGE_KEY = 'niuma.skin.id.v2'
  let currentSkinId = null
  let shellHandle = null

  function storageGet(k, fb) { try { const v = localStorage.getItem(k); return v == null ? fb : v } catch (_) { return fb } }
  function storageSet(k, v) { try { localStorage.setItem(k, String(v)) } catch (_) {} }

  function detectDark() {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches } catch (_) { return true }
  }
  function deriveInitialSkinId() {
    const persisted = storageGet(SKIN_STORAGE_KEY, '')
    if (IS_CORE(persisted) || IS_CLASSIC(persisted)) return persisted
    // Spec mandate: default = core. Legacy fallbacks (sakura/night) only if user explicitly has that old pref.
    const dark = detectDark()
    const legacyFallback = dark ? 'night' : 'sakura'
    const legacyPref = storageGet('niuma.skin', '')
    return IS_CLASSIC(legacyPref) ? legacyPref : (V2_CORE_ID || legacyFallback)
  }

  function destroyCoreV2Handle() {
    if (shellHandle) {
      try { shellHandle.destroy?.() } catch (_) {}
      shellHandle = null
    }
    if (typeof globalThis.VAOCoreShell !== 'undefined') {
      // Classic app.js may also keep a handle to V2-A core; leave that for app.js own destroyCoreShell path.
    }
  }

  function bootCoreV2() {
    destroyCoreV2Handle()
    const mode = detectRunMode()
    shellHandle = ShellV2.bootstrap({
      mode,
      initialNav: 'office',
      onThemeChange: (id) => setSkin(id),
      onNavigate: (id) => { /* hook for future: nav overlay for Tasks/Team */ },
      onPickRole: (rid) => { /* Role inspector already opened by shell; hook for bridge. */ },
      onPickTask: (tid) => { /* Task inspector already opened by shell; hook for bridge. */ },
      onConversationSend: (text) => {
        // Visual: simulate self-message for DEMO. Real bridge handled by app.js.
        if (mode === 'demo' && shellHandle) {
          shellHandle.update({
            helix: {
              conversation: [
                ...(shellHandle.nodes?.helixRail ? [] : []),
                { who: '你', side: 'user', text },
                { who: 'Helix', side: 'helix', text: '【V2 DEMO 视觉】已记录你的输入：' + String(text).slice(0, 60) },
              ].slice(-20),
            },
          })
        }
      },
      onDemoToggle: (on) => { storageSet('niuma.demo.v2', on ? '1' : '0') },
      onDemoStateVisual: (sid) => {
        // DEMO banner buttons (visual only; never fakes runtime).
        if (shellHandle) shellHandle.applyDemoStateVisual?.(sid)
      },
    })
    // Expose for debugging/legacy bridge.
    globalThis.__coreHandleV2 = shellHandle
    return shellHandle
  }

  function detectRunMode() {
    try {
      const url = new URL(window.location.href)
      const qm = url.searchParams.get('mode') || ''
      if (/^(demo|fake|live)$/i.test(qm)) return qm.toLowerCase()
    } catch (_) {}
    try {
      const demoPref = storageGet('niuma.demo.v2', '')
      if (demoPref === '1') return 'demo'
    } catch (_) {}
    return 'live'
  }

  function bootClassic(id) {
    destroyCoreV2Handle()
    ShellV2?.restoreClassicScaffold?.()
    // The legacy app.js boot path (VAOMain / makeOffice / setSkin) will pick up the DOM scaffold
    // and mount AnimeOffice + chat + board on top. Remove any V2 Core-only attributes so legacy
    // data-skin CSS tokens take over cleanly.
    document.documentElement.removeAttribute('data-theme-core')
    document.documentElement.removeAttribute('data-appearance')
    try { document.documentElement.setAttribute('data-skin', id) } catch (_) {}
    try { document.documentElement.setAttribute('data-skin-id', id) } catch (_) {}
    // Notify legacy app.js if it exposes a setSkin bridge. Prefer legacy's entrypoint for consistency.
    const legacySet = globalThis.VAOSkins?.setSkin || globalThis.setSkin || (globalThis.NiumaAppV2?.setSkin)
    if (typeof legacySet === 'function') {
      try { legacySet(id) } catch (_) {}
    }
    globalThis.__coreHandleV2 = null
  }

  function setSkin(id) {
    const cleanId = String(id || '').trim()
    if (!cleanId) return
    if (currentSkinId === cleanId) return
    currentSkinId = cleanId
    storageSet(SKIN_STORAGE_KEY, cleanId)
    if (IS_CORE(cleanId)) bootCoreV2()
    else if (IS_CLASSIC(cleanId)) bootClassic(cleanId)
    else bootCoreV2() // Unknown id → fall back to V2 Core.
  }

  // Install the public bridge used by legacy app.js skin selector if present.
  globalThis.setSkinV2 = setSkin

  // If no legacy app.js bridge will run, then boot the initial skin here. We check if legacy
  // setSkin() already did work by scanning for a Core V2 shell node; if not, we auto-boot.
  function bootIfNeeded() {
    const alreadyCoreV2 = !!document.getElementById('v2-top-bar')
    if (alreadyCoreV2) return
    const initial = deriveInitialSkinId()
    if (IS_CORE(initial)) {
      setSkin(V2_CORE_ID)
    } else {
      // Classic first: scaffold + let legacy renderers mount.
      setSkin(initial)
      // Some legacy paths mount only on DOMContentLoaded; if empty, re-queue Core as fallback after tick.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootIfNeeded, { once: true })
  } else {
    bootIfNeeded()
  }

  const api = Object.freeze({
    V2_CORE_ID,
    CLASSIC_IDS,
    IS_CORE,
    IS_CLASSIC,
    setSkin,
    get currentSkinId() { return currentSkinId },
    get handle() { return shellHandle },
    _detectRunMode: detectRunMode,
    _deriveInitialSkinId: deriveInitialSkinId,
  })
  globalThis.VAOAppV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
