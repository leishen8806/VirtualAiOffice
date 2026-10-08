/* Interactive Office V2 — PURE COMPAT WRAPPER, NO RUNTIME OWNERSHIP.
 *
 * SINGLE RUNTIME OWNER = public/app.js.
 *
 * This module exists ONLY so:
 *   1. Existing test V2-T10 can call M.App.setSkin() (Node shim environment,
 *      where full public/app.js IIFE with transport boot cannot run).
 *   2. Any external tooling still referencing globalThis.VAOAppV2 keeps working.
 *
 * In the REAL BROWSER, public/app.js TAIL OVERWRITES globalThis.VAOAppV2 with
 * the authoritative setSkin → app.js internal setSkin. This file runs FIRST
 * (script order) so the browser always ends with the real runtime-backed
 * VAOAppV2. In Node tests, app.js isn't loaded, so this wrapper is used.
 *
 * FORBIDDEN here (per BLOCKER 1 closeout):
 *  ❌ NO DOMContentLoaded / auto-boot / bootIfNeeded
 *  ❌ NO transport / EventSource / /events / /api/* ownership
 *  ❌ NO duplicate theme store / NO setSkin real mutation
 *  ❌ NO duplicate runtime state
 */
;(function () {
  'use strict'
  const V2_CORE_ID = 'core'
  const ShellV2 = globalThis.VAOCoreShellV2
  const CLASSIC_IDS = Object.freeze(
    (ShellV2 && ShellV2.CLASSIC_IDS) ? ShellV2.CLASSIC_IDS.slice() : ['sakura', 'night', 'neon', 'neko', 'pixel']
  )
  const IS_CORE = (id) => String(id) === V2_CORE_ID
  const IS_CLASSIC = (id) => CLASSIC_IDS.includes(String(id))
  let skinIdLast = V2_CORE_ID
  const setSkinFallback = (id) => {
    const cleanId = String(id || '').trim()
    if (!cleanId) return false
    skinIdLast = IS_CLASSIC(cleanId) || IS_CORE(cleanId) ? cleanId : V2_CORE_ID
    if (IS_CLASSIC(cleanId)) ShellV2?.restoreClassicScaffold?.()
    else if (IS_CORE(cleanId) && ShellV2) {
      // Minimal shim-side bootstrap only; real browser uses app.js makeOffice.
      ShellV2.bootstrap({ mode: 'live', initialNav: 'office' })
    }
    return true
  }
  const api = Object.freeze({
    V2_CORE_ID,
    CLASSIC_IDS,
    IS_CORE,
    IS_CLASSIC,
    setSkin: (id) => {
      const real = globalThis.NiumaSkin?.set || globalThis.setSkin
      if (typeof real === 'function') return real(id)
      return setSkinFallback(id)
    },
    get currentSkinId() {
      try {
        const live = globalThis.NiumaSkin?.current?.()
        if (live && live.id) return live.id
      } catch (_) {}
      return skinIdLast
    },
    get handle() {
      return globalThis.__coreHandleV2 || null
    },
    _detectRunMode: () => 'live',
  })
  globalThis.VAOAppV2 = api
  globalThis.setSkinV2 = api.setSkin
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
