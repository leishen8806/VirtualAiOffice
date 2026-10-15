/* M1-2: 3D office limited-orbit camera -- pure math only.
 *
 * The legal orbit range is frozen by the board (PRODUCT_MASTER_PLAN_V1 B5 / B6.1).
 * This module clamps arbitrary camera params into that range and hands out the default
 * view, so the range can be locked down in node and M1-6 only has to wire the numbers
 * into the real camera. No rendering, no page globals, no side effects, no deps.
 *
 * Exports VAOOffice3DCamera (globalThis + module.exports fallback).
 */
;(function () {
  'use strict'

  const LIMITS = Object.freeze({
    azimuth: Object.freeze({ min: 10, max: 80 }),
    polar: Object.freeze({ min: 40, max: 60 }),
    zoom: Object.freeze({ min: 0.7, max: 1.6 }),
    targetX: Object.freeze({ min: -16, max: 16 }),
    targetZ: Object.freeze({ min: -9, max: 9 }),
  })

  const FLOOR = Object.freeze({ width: 32, depth: 18, minX: -16, maxX: 16, minZ: -9, maxZ: 9 })

  const DEFAULT_VIEW = Object.freeze({ azimuth: 45, polar: 50, zoom: 1, targetX: 0, targetZ: 0 })

  const FIELDS = Object.freeze(Object.keys(DEFAULT_VIEW))

  const TRANSITION_MS = 320

  const round4 = (v) => Math.round(v * 1e4) / 1e4

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

  const asObject = (v) => (v && typeof v === 'object' ? v : {})

  const deltaKey = (field) => 'd' + field[0].toUpperCase() + field.slice(1)

  function clampField(field, value) {
    if (!isNum(value)) return DEFAULT_VIEW[field]
    const { min, max } = LIMITS[field]
    return round4(Math.min(max, Math.max(min, value)))
  }

  /** Clamp every field into range. Returns a new view; never touches the input. */
  function clamp(view) {
    const src = asObject(view)
    const out = {}
    for (const field of FIELDS) out[field] = clampField(field, src[field])
    return out
  }

  /** Add a camera delta to a view, then clamp. Missing delta fields count as 0. */
  function applyDelta(view, delta) {
    const src = asObject(view)
    const d = asObject(delta)
    const next = {}
    for (const field of FIELDS) {
      const step = d[deltaKey(field)]
      next[field] = src[field] + (isNum(step) ? step : 0)
    }
    return clamp(next)
  }

  /** A fresh copy of the default view, so callers can mutate it freely. */
  function reset() {
    return clamp(DEFAULT_VIEW)
  }

  function isWithinLimits(view) {
    const src = asObject(view)
    return FIELDS.every((field) => {
      if (!isNum(src[field])) return false
      const { min, max } = LIMITS[field]
      return src[field] >= min && src[field] <= max
    })
  }

  /** prefers-reduced-motion collapses the camera transition to an instant switch. */
  function transitionMs(prefersReducedMotion) {
    return prefersReducedMotion ? 0 : TRANSITION_MS
  }

  const api = Object.freeze({
    LIMITS,
    FLOOR,
    DEFAULT_VIEW,
    clamp,
    applyDelta,
    reset,
    isWithinLimits,
    transitionMs,
  })
  globalThis.VAOOffice3DCamera = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
