import {
  CAMPUS,
  CAMPUS_BUILDING,
  CAMPUS_ZONES,
} from './office-layout.js'
import { WH_R1_CAMERA_VIEWS, WH_R1_SITE, WH_R1_ZONES } from './dr-wh-r1-zones.js'

// 将来由多租户配置替换；F01 完成前不接受或展示其它租户。
export const PLACE_TENANTS = Object.freeze({
  drlife: Object.freeze({ id: 'drlife' }),
})
export const DEFAULT_PLACE_TENANT = 'drlife'
// The default route remains unchanged; the latest office channel is explicit.
export const DEFAULT_OFFICE_LAYOUT = 1
export const LEGACY_DR_CAMERA_KEY = 'office3d.camera.dr'
const STABLE_V3_SUBTITLE = '最新版 · rev3 开发中'
export const PLACE_LATEST = Object.freeze({
  office: Object.freeze({
    layout: 3,
    align: 1,
    officeSample: 1,
    r1: 1,
    subtitle: '最新版 · 办公室样板',
  }),
  warehouse: Object.freeze({}),
})

const OFFICE_MODE = Object.freeze({
  place: 'office',
  title: '智序工场 · 办公室 3D',
  brand: '智序工场 · 办公室',
  subtitle: '连接中…',
})

const buildingCenter = Object.freeze([
  (CAMPUS_BUILDING.x0 + CAMPUS_BUILDING.x1) / 2,
  0,
  (CAMPUS_BUILDING.z0 + CAMPUS_BUILDING.z1) / 2,
])

export const DR_CAMERA_VIEWS = Object.freeze([
  Object.freeze({ id: 'overview', label: '全景', az: -25, el: 46, r: 76, t: buildingCenter }),
  Object.freeze({ id: 'rackDock', label: '货架月台', az: -32, el: 44, r: 44, t: Object.freeze([-134, 0, -4]) }),
  Object.freeze({ id: 'dispatch', label: '调度中控', az: -24, el: 43, r: 30, t: Object.freeze([-161, 0, 8]) }),
  Object.freeze({ id: 'frontPlaza', label: '前广场', az: -18, el: 42, r: 42, t: Object.freeze([-124, 0, 34]) }),
])

const DR_MODE = Object.freeze({
  place: 'dr',
  campus: true,
  title: 'DR 仓配服务中心 · 智序小镇',
  brand: 'DR 仓配服务中心',
  subtitle: '仓配地点 · 演示场景',
  miniBounds: CAMPUS,
  cameraViews: DR_CAMERA_VIEWS,
  homeCamera: DR_CAMERA_VIEWS[0],
  zones: CAMPUS_ZONES,
})

function placeMeta(kind, legacy, layout = DEFAULT_OFFICE_LAYOUT) {
  return {
    placeId: `${DEFAULT_PLACE_TENANT}-${kind}`,
    tenant: DEFAULT_PLACE_TENANT,
    kind,
    legacy,
    layout: kind === 'office' ? layout : null,
  }
}

function officeMode(campus, legacy, layout = DEFAULT_OFFICE_LAYOUT, latest = false) {
  return {
    ...OFFICE_MODE,
    ...(layout === PLACE_LATEST.office.layout
      ? { subtitle: latest ? PLACE_LATEST.office.subtitle : STABLE_V3_SUBTITLE }
      : {}),
    campus,
    ...placeMeta('office', legacy, layout),
  }
}

export function whR1Requested(paramsOrSearch = '') {
  const params = paramsOrSearch instanceof URLSearchParams ? paramsOrSearch : new URLSearchParams(String(paramsOrSearch || ''))
  const values = params.getAll('whr1')
  return values.length === 1 && values[0] === '1'
}

function warehouseMode(controlRoom, legacy, whr1 = false) {
  return {
    ...DR_MODE,
    ...placeMeta('warehouse', legacy),
    ...(controlRoom ? { controlRoom: true } : {}),
    ...(whr1 ? { whr1: true, miniBounds: WH_R1_SITE, cameraViews: WH_R1_CAMERA_VIEWS, homeCamera: WH_R1_CAMERA_VIEWS[0], zones: WH_R1_ZONES } : {}),
  }
}

function parseCanonicalPlace(value) {
  const splitAt = value.lastIndexOf('-')
  if (splitAt <= 0) return null
  const tenant = value.slice(0, splitAt)
  const kind = value.slice(splitAt + 1)
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(tenant)) return null
  if (!Object.hasOwn(PLACE_TENANTS, tenant)) return null
  if (kind !== 'office' && kind !== 'warehouse') return null
  return { tenant, kind }
}

function officeLayout(params) {
  const layouts = params.getAll('layout')
  if (layouts.length !== 1) return DEFAULT_OFFICE_LAYOUT
  if (!['1', '2', '3'].includes(layouts[0])) {
    return DEFAULT_OFFICE_LAYOUT
  }
  return Number(layouts[0])
}

function isLatestOfficeParams(params) {
  if (params.getAll('place').length !== 1 || params.get('place') !== `${DEFAULT_PLACE_TENANT}-office`) return false
  for (const [key, value] of Object.entries(PLACE_LATEST.office)) {
    // r1 is optional here so the older latest URL (without r1) keeps resolving the same way.
    if (key === 'subtitle' || key === 'r1') continue
    const values = params.getAll(key)
    if (values.length !== 1 || values[0] !== String(value)) return false
  }
  const l2b = params.getAll('l2b'), r1 = params.getAll('r1')
  return (l2b.length === 0 || l2b.length === 1 && l2b[0] === '1') && (r1.length === 0 || r1.length === 1 && r1[0] === '1')
}

export function latestSearch(placeId) {
  const kind = placeId === `${DEFAULT_PLACE_TENANT}-warehouse`
    ? 'warehouse'
    : 'office'
  const latest = PLACE_LATEST[kind]
  const params = new URLSearchParams({
    place: `${DEFAULT_PLACE_TENANT}-${kind}`,
  })
  for (const [key, value] of Object.entries(latest)) {
    if (key !== 'subtitle') params.set(key, String(value))
  }
  return `?${params.toString()}`
}

export function resolvePlaceMode(search = '') {
  const params = new URLSearchParams(String(search || ''))
  const controlRoom = params.get('controlRoom') === '1'
  const whr1 = whR1Requested(params)
  const places = params.getAll('place')
  if (places.length > 1) return officeMode(false, false)
  if (places.length === 1) {
    if (places[0] === 'dr') return warehouseMode(controlRoom, true, whr1)
    if (places[0] === 'office') {
      const campuses = params.getAll('campus')
      return officeMode(
        campuses.length === 1 && campuses[0] === '1',
        true,
        officeLayout(params),
      )
    }
    const canonical = parseCanonicalPlace(places[0])
    if (!canonical) return officeMode(false, false)
    if (canonical.kind === 'warehouse') {
      return warehouseMode(controlRoom, false, whr1)
    }
    const campuses = params.getAll('campus')
    return officeMode(
      campuses.length === 1 && campuses[0] === '1',
      false,
      officeLayout(params),
      isLatestOfficeParams(params),
    )
  }
  const campuses = params.getAll('campus')
  const campus = campuses.length === 1 && campuses[0] === '1'
  if (campus && whr1) return warehouseMode(controlRoom, true, true)
  return officeMode(campus, true, officeLayout(params))
}

export function maintainLatestSubtitle({
  search = globalThis.location?.search,
  documentRef = globalThis.document,
  Observer = globalThis.MutationObserver,
} = {}) {
  const mode = resolvePlaceMode(search)
  if (
    mode.kind !== 'office' ||
    !isLatestOfficeParams(new URLSearchParams(String(search || '').replace(/^\?/, ''))) ||
    !documentRef ||
    typeof Observer !== 'function'
  ) {
    return null
  }
  const target = documentRef.getElementById('connText')
  if (!target) return null
  const sync = () => {
    if (target.textContent !== PLACE_LATEST.office.subtitle) {
      target.textContent = PLACE_LATEST.office.subtitle
    }
  }
  sync()
  const observer = new Observer(sync)
  observer.observe(target, { childList: true, characterData: true, subtree: true })
  return observer
}

export function cameraStorageKeys(mode) {
  const placeId = mode?.placeId || `${DEFAULT_PLACE_TENANT}-office`
  const keys = [`office3d.camera.${placeId}`]
  if (placeId === `${DEFAULT_PLACE_TENANT}-warehouse`) {
    keys.push(LEGACY_DR_CAMERA_KEY)
  }
  return Object.freeze(keys)
}

export function normalizeCameraState(value, fallback = DR_CAMERA_VIEWS[0]) {
  if (!value || typeof value !== 'object') return fallback
  const numbers = [value.az, value.el, value.r, ...(Array.isArray(value.t) ? value.t : [])]
  if (numbers.length !== 6 || numbers.some((item) => !Number.isFinite(item))) return fallback
  if (value.el < 6 || value.el > 88 || value.r < 3 || value.r > 160) return fallback
  if (value.t[0] < CAMPUS.x0 - 10 || value.t[0] > CAMPUS.x1 + 10) return fallback
  if (value.t[2] < CAMPUS.z0 - 10 || value.t[2] > CAMPUS.z1 + 10) return fallback
  return {
    az: value.az,
    el: value.el,
    r: value.r,
    t: [value.t[0], 0, value.t[2]],
  }
}

if (typeof document !== 'undefined') maintainLatestSubtitle()
