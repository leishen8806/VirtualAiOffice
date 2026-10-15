/* Renderer registration and renderer-agnostic view state. */
(() => {
  const RENDERER_IDS = Object.freeze(['2d', '3d'])
  const DEFAULT_RENDERER = '2d'
  const HANDLE_MEMBERS = Object.freeze(['mode', 'mount', 'update', 'setRoleState', 'activateHumanArea', 'pulseHelixTo', 'destroy'])
  const RESOLVE_REASONS = Object.freeze(['MOBILE_NO_3D', 'DEFAULT', 'REQUESTED', 'NO_WEBGL2', 'LOW_TIER', 'RENDERER_UNAVAILABLE'])
  const VIEW_KEYS = Object.freeze(['selectedRoleId', 'selectedTaskId', 'drawer', 'viewpoint', 'camera', 'filters'])
  const renderers = new Map()
  const waiters = new Map()

  function validId(id) { return RENDERER_IDS.includes(id) }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone)
    if (value && typeof value === 'object') {
      const copy = {}
      for (const [key, item] of Object.entries(value)) copy[key] = clone(item)
      return copy
    }
    return value
  }
  function freezeViewState(state) {
    if (state.drawer && typeof state.drawer === 'object') Object.freeze(state.drawer)
    if (state.camera && typeof state.camera === 'object') Object.freeze(state.camera)
    if (state.filters && typeof state.filters === 'object') Object.freeze(state.filters)
    return Object.freeze(state)
  }
  function assertViewKeys(value) {
    const unknown = Object.keys(value || {}).filter((key) => !VIEW_KEYS.includes(key))
    if (unknown.length) throw new Error(`view state has unknown fields: ${unknown.join(', ')}`)
  }

  function register(id, impl) {
    if (!validId(id)) throw new Error(`renderer ${id}: unknown id`)
    if (!impl || typeof impl.attach !== 'function') throw new Error(`renderer ${id}: attach must be a function`)
    if (renderers.has(id)) throw new Error(`renderer ${id}: already registered`)
    renderers.set(id, impl)
    for (const resolve of waiters.get(id) || []) resolve(impl)
    waiters.delete(id)
    return impl
  }
  function get(id) { return renderers.get(id) }
  function has(id) { return renderers.has(id) }
  function whenRegistered(id) {
    if (!validId(id)) return Promise.reject(new Error(`renderer ${id}: unknown id`))
    if (renderers.has(id)) return Promise.resolve(renderers.get(id))
    return new Promise((resolve) => {
      const pending = waiters.get(id) || []
      pending.push(resolve)
      waiters.set(id, pending)
    })
  }

  function assertHandleContract(handle) {
    const candidate = handle && typeof handle === 'object' ? handle : {}
    const missing = HANDLE_MEMBERS.filter((member) => (
      member === 'mode' || member === 'mount'
        ? !(member in candidate)
        : typeof handle?.[member] !== 'function'
    ))
    if (missing.length) throw new Error(`renderer handle missing: ${missing.join(', ')}`)
    return handle
  }
  function readPreference({ search, storage } = {}) {
    let queryValue = null
    try {
      queryValue = search instanceof URLSearchParams ? search.get('renderer') : new URLSearchParams(search || '').get('renderer')
    } catch (_) {}
    if (validId(queryValue)) return queryValue
    try {
      const stored = storage?.getItem('vao.renderer')
      if (validId(stored)) return stored
    } catch (_) {}
    return null
  }
  function resolve({ requested, responsiveMode, capabilities } = {}) {
    if (responsiveMode === 'MOBILE') return { id: '2d', reason: 'MOBILE_NO_3D' }
    if (!validId(requested)) return { id: DEFAULT_RENDERER, reason: 'DEFAULT' }
    if (requested === '2d') return { id: '2d', reason: 'REQUESTED' }
    if (capabilities?.webgl2 !== true) return { id: '2d', reason: 'NO_WEBGL2' }
    if (capabilities?.tier === 'low') return { id: '2d', reason: 'LOW_TIER' }
    if (!has('3d')) return { id: '2d', reason: 'RENDERER_UNAVAILABLE' }
    return { id: '3d', reason: 'REQUESTED' }
  }

  function createViewState(init = {}) {
    assertViewKeys(init)
    return freezeViewState({
      selectedRoleId: null,
      selectedTaskId: null,
      drawer: null,
      viewpoint: null,
      camera: null,
      filters: {},
      ...clone(init),
    })
  }
  function mergeViewState(prev, patch = {}) {
    assertViewKeys(patch)
    return createViewState({ ...clone(prev || {}), ...clone(patch) })
  }

  function swap({ mount, fromHandle, toId, snapshot, mode, viewState } = {}) {
    // Validate the destination first so a failed switch leaves the current renderer alive.
    if (!has(toId)) throw new Error(`renderer ${toId}: not registered`)
    const warnings = []
    try { fromHandle?.destroy?.() } catch (error) { warnings.push(error) }
    const newHandle = get(toId).attach(mount, { snapshot, mode })
    assertHandleContract(newHandle)
    return { handle: newHandle, id: toId, viewState: mergeViewState(createViewState(), viewState), warnings }
  }

  const api = Object.freeze({
    RENDERER_IDS,
    DEFAULT_RENDERER,
    HANDLE_MEMBERS,
    RESOLVE_REASONS,
    register,
    get,
    has,
    whenRegistered,
    assertHandleContract,
    readPreference,
    resolve,
    createViewState,
    mergeViewState,
    swap,
  })
  globalThis.VAOOfficeRendererRegistry = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
