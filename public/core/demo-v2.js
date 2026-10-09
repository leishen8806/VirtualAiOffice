/* DEMO CONTROLS V2: Visual-only state cycling for the 6-zone office.
 *
 * RULES (NEVER fake runtime events in LIVE mode):
 *   1. Only fires when Shell.applyDemoStateVisual is explicitly invoked (button in DEMO banner).
 *   2. ONLY updates VISUAL STATE classes on SVG character groups and V2 shell DOM.
 *   3. NEVER writes to the live runtime (tasks, messages, agents, state machine).
 *   4. In live mode these controls are hidden (only top-right DEMO button shows them temporarily).
 *
 * Provides:
 *   - VAODemoV2.autoCycle(handle, intervalMs)   → auto-stepping state carousel (visual only)
 *   - VAODemoV2.dispatchScenario(handle, name)  → plays a canned event scenario visually
 *   - VAODemoV2.stop(handle)                    → stops any timers
 */
;(function () {
  'use strict'

  const SCENARIOS = Object.freeze({
    planning_dispatch: {
      name: '规划任务派发',
      run(handle) {
        handle.animate.dispatch('product')
        handle.animate.dispatch('architect')
        setTimeout(() => handle.applyDemoStateVisual('THINKING'), 400)
      },
    },
    build_dispatch: {
      name: '工程派发（前后端）',
      run(handle) {
        handle.animate.dispatch('frontend')
        setTimeout(() => handle.animate.dispatch('backend'), 350)
      },
    },
    review_cycle: {
      name: '走查：QA + Reviewer',
      run(handle) {
        handle.applyDemoStateVisual('REVIEWING')
        handle.animate.review()
      },
    },
    waiting_human: {
      name: '等待人类（Human Area）',
      run(handle) {
        handle.applyDemoStateVisual('WAITING_HUMAN')
        handle.animate.waitingHuman(true)
      },
    },
    blocked_scenario: {
      name: '后端阻塞告警',
      run(handle) {
        handle.animate.blocked('backend')
        handle.applyDemoStateVisual('BLOCKED')
      },
    },
    done_scenario: {
      name: '全员完成 → 空闲',
      run(handle) {
        handle.applyDemoStateVisual('DONE')
        handle.animate.done('frontend', 1500)
        handle.animate.done('backend', 1700)
        handle.animate.done('qa', 1900)
        handle.animate.done('reviewer', 2100)
      },
    },
    meeting_scenario: {
      name: '全员大会（Planning 区）',
      run(handle) {
        handle.applyDemoStateVisual('MEETING')
        handle.animate.meeting(['product','architect','frontend','backend','qa','reviewer','docs'])
      },
    },
    reset_idle: {
      name: '重置为 Idle',
      run(handle) {
        handle.applyDemoStateVisual('IDLE')
        handle.animate.waitingHuman(false)
      },
    },
  })

  const _timers = new WeakMap()
  function clearTimers(h) {
    const arr = _timers.get(h) || []
    arr.forEach(clearTimeout)
    arr.forEach(clearInterval)
    _timers.set(h, [])
  }
  function pushTimer(h, id) {
    if (!_timers.has(h)) _timers.set(h, [])
    _timers.get(h).push(id)
  }

  function autoCycle(handle, intervalMs = 2600) {
    if (!handle) throw new Error('VAODemoV2.autoCycle: handle required')
    clearTimers(handle)
    const order = ['IDLE', 'THINKING', 'WORKING', 'REVIEWING', 'WAITING_HUMAN', 'BLOCKED', 'DONE', 'IDLE']
    let i = 0
    const tick = () => {
      handle.applyDemoStateVisual(order[i % order.length])
      if (order[i % order.length] === 'WAITING_HUMAN') handle.animate.waitingHuman(true)
      else handle.animate.waitingHuman(false)
      i++
    }
    tick()
    const id = setInterval(tick, intervalMs || 2600)
    pushTimer(handle, id)
    return id
  }

  function dispatchScenario(handle, name) {
    if (!handle) throw new Error('VAODemoV2.dispatchScenario: handle required')
    const s = SCENARIOS[name]
    if (!s) throw new Error('VAODemoV2: unknown scenario ' + name)
    clearTimers(handle)
    try { s.run(handle) } catch (e) { /* visual demo failures non-fatal */ }
    return s
  }

  function stop(handle) {
    clearTimers(handle)
  }

  function listScenarios() {
    return Object.keys(SCENARIOS).map(k => ({ id: k, name: SCENARIOS[k].name }))
  }

  const api = Object.freeze({
    SCENARIOS,
    autoCycle,
    dispatchScenario,
    listScenarios,
    stop,
  })
  globalThis.VAODemoV2 = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
