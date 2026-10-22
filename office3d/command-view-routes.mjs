import { buildDemoCommandView, defaultCommandView, listDemoScenarios } from './command-view-demo.mjs'
import { isDemoId, realIdentifier, sensitiveValue, validateCommandView } from './command-view-validate.mjs'

const PATHS = new Set(['/command-view', '/command-view/scenarios'])
const HEADERS = Object.freeze({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
const empty = () => ({ kind: 'empty', data: null, reason: 'NO_AUTHORIZED_LIVE_SCOPE' })
const reply = (status, body) => ({ status, headers: HEADERS, body })
const error = (status, code) => reply(status, { error: code })

export function commandViewEnabled(config) {
  return config !== null && typeof config === 'object' && !Array.isArray(config) && config.enabled === true
}

// 时钟由服务注入；闭包仅保存最多 120 个请求时刻，不访问任何外部数据源。
export function createCommandViewRoutes({
  enabled = false,
  listScenarios = listDemoScenarios,
  buildDemo = buildDemoCommandView,
  loadDefault = defaultCommandView,
  validate = validateCommandView,
} = {}) {
  let times = []
  let lastNow = 0
  function handle({ method = 'GET', path = '', query = '', wallScope = false, now } = {}) {
    if (!PATHS.has(path)) return null
    if (wallScope === true) return error(403, 'FORBIDDEN')
    if (enabled !== true) return error(404, 'NOT_FOUND')
    if (method !== 'GET') return error(405, 'METHOD_NOT_ALLOWED')
    try {
      if (!Number.isFinite(now) || now < 0) return error(500, 'COMMAND_VIEW_UNAVAILABLE')
      const clock = Math.max(now, lastNow)
      lastNow = clock
      times = times.filter((at) => clock - at < 60000)
      if (times.length >= 120) return error(429, 'RATE_LIMITED')
      times.push(clock)
      const params = new URLSearchParams(query)
      const seen = new Set()
      const allowed = path.endsWith('/scenarios') ? [] : ['mode', 'scenario', 'timeSlice']
      for (const [key] of params) {
        if (!allowed.includes(key) || seen.has(key)) return error(400, 'INVALID_PARAMETERS')
        seen.add(key)
      }
      const mode = params.get('mode') ?? 'live'
      if (!['live', 'demo'].includes(mode)) return error(400, 'INVALID_PARAMETERS')
      if (path === '/command-view' && mode === 'live') {
        if (params.has('scenario') || params.has('timeSlice')) return error(400, 'INVALID_PARAMETERS')
        const body = loadDefault()
        // 空状态是加载器信封，不是虚构的 CommandViewData，单独核对固定合同。
        if (JSON.stringify(body) !== JSON.stringify(empty())) return error(500, 'COMMAND_VIEW_UNAVAILABLE')
        return reply(200, empty())
      }
      const scenarios = listScenarios()
      if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > 200 ||
          new Set(scenarios.map((row) => row?.id)).size !== scenarios.length ||
          scenarios.some((row) => !row || Object.keys(row).sort().join(',') !== 'id,name,synthetic,timeSlices' ||
            !isDemoId(row.id) || typeof row.name !== 'string' || !row.name || [...row.name].length > 160 ||
            /[\u0000-\u001f\u007f]/.test(row.name) || realIdentifier.test(row.name) || sensitiveValue.test(row.name) ||
            row.synthetic !== true || !Number.isInteger(row.timeSlices) || row.timeSlices < 1 || row.timeSlices > 200)) {
        return error(500, 'COMMAND_VIEW_UNAVAILABLE')
      }
      if (path.endsWith('/scenarios')) return reply(200, structuredClone(scenarios))
      const scenario = params.get('scenario') ?? 'demo-journey'
      const definition = scenarios.find((row) => row.id === scenario)
      const rawSlice = params.get('timeSlice') ?? '0'
      if (!definition || !/^(0|[1-9]\d*)$/.test(rawSlice) || rawSlice.length > 3) return error(400, 'INVALID_PARAMETERS')
      const timeSlice = Number(rawSlice)
      if (timeSlice >= definition.timeSlices) return error(400, 'INVALID_PARAMETERS')
      const body = buildDemo({ scenario, timeSlice })
      if (body?.mode !== 'demo' || body?.quality?.synthetic !== true || validate(body)?.ok !== true) {
        return error(500, 'COMMAND_VIEW_UNAVAILABLE')
      }
      // 固化为 JSON 副本；序列化异常不能逃逸到服务的通用错误处理。
      return reply(200, JSON.parse(JSON.stringify(body)))
    } catch {
      return error(500, 'COMMAND_VIEW_UNAVAILABLE')
    }
  }
  return Object.freeze({ handle })
}
