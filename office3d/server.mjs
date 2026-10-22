// 智序工场 · 办公室 3D —— 本机服务。
// 本机完全可用；局域网设备要输入访问码（lan.json），并且默认只读（看得到、不能审批 / 派任务）。不接触任何密钥。
// 读：聚合 Paperclip 数据。写：只有 POST /act 一个入口，只转发董事会在页面上亲手点的几种操作
// （批准/拒绝审批、回答问题、验收任务、评论），并校验来源与一次性令牌，防止其他网页借本机身份发请求。
import http from 'node:http'
import crypto from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { onDuty, nextChange, localParts } from '../workhours/schedule.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── 金边市中心的时间与天气（每分钟刷新，数据时间与此刻相差不超过 15 分钟；不用机场数据）──
// 取点：金边市中心（独立碑 / 塔仔山一带）。
//   · 降水提示：RainViewer约每10分钟一帧，只读定位像素；周边像素仅作附近雨区提示，不是办公室地面实测。
//     印支半岛陆地都在雷达覆盖内（已核对覆盖图）。
//   · 气温、湿度、风、云量：Open-Meteo 在市中心坐标的 15 分钟临近预报，按此刻在前后两个格点之间插值。
//   雷达有回波 → 以雷达为准下雨；雷达没有回波 → 不下雨（模型的毛毛雨误报不采用）。雷达帧超过 15 分钟取不到时，才退回模型的降水。
import { decodePng } from './pngmini.mjs'
import { sampleRadar } from './weather-radar.mjs'
import { createGossip } from './gossip.mjs'
import { createStats } from './stats.mjs'
import { createWorkload } from './workload.mjs'
import { createTelegram } from './telegram.mjs'
import { createCommittee } from './committee.mjs'
import { createStandup } from './standup.mjs'
import { createAcceptance } from './acceptance.mjs'
import { createBlockedPatrol, blockedReason } from './blocked.mjs'
import { createRework } from './rework.mjs'
import { createEvidenceVersion } from './evidence-version.mjs'
import { createHandoff } from './handoff.mjs'
import { createFoyer } from './foyer.mjs'
import { createMemory, scanMemoryText } from './memory.mjs'
import { createChat } from './chat.mjs'
import { createTenancy } from './tenancy/index.mjs'
import { loadTownMap } from './town-map.mjs'
import { buildWall, redactState, redactText } from './wall.mjs'
import { computeToday } from './today.mjs'
import { buildHealth } from './health.mjs'
import { buildGovernance } from './governance.mjs'
import { createEventsLedger, parseReplayDate, computeGaps, countKinds, dutyConfig } from './events-ledger.mjs'
import { buildCollab, selectWindowDays, ledgerDayFiles, SEAT_GROUPS } from './collab.mjs'
import { summarizeContracts } from './contract-view.mjs'
import { parseContract, validateContract } from './task-contract.mjs'
import { suggest as suggestScheduler, decisionRecords } from './scheduler-view.mjs'
import { createHomeStore } from './town/home-store.mjs'
import { createHomeRoutes } from './town/home-routes.mjs'
import { commandViewEnabled, createCommandViewRoutes } from './command-view-routes.mjs'
import { createCommandLiveWiring } from './command-view-wiring.mjs'
import { townNavClientScript, townNavEnabled } from './town-nav.mjs'
import { coarsenGeo, OFFICE_GEO } from './office-geo.mjs'
import { createLastGoodState, loadStateComponents, createBackgroundHealth } from './state-last-good.mjs'
const PNH = { lat: OFFICE_GEO.lat, lon: OFFICE_GEO.lon, tz: OFFICE_GEO.tz } // 智序工场现实定位；天气、雷达和账本时区沿用此坐标。
let weather = null
let nowcast = null
let sun = { sunrise: null, sunset: null }
let radar = null // { ms, level, nearby }
const RAIN_CODE = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95
const cloudCode = (cloud) => (cloud >= 75 ? 3 : cloud >= 45 ? 2 : cloud >= 20 ? 1 : 0)
function pnhIso(ms) { const t = localParts(new Date(ms), PNH.tz); return `${t.y}-${String(t.mo).padStart(2, '0')}-${String(t.d).padStart(2, '0')}T${String(t.h).padStart(2, '0')}:${String(t.mi).padStart(2, '0')}` }
async function fetchNowcast() {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${PNH.lat}&longitude=${PNH.lon}&minutely_15=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation,wind_speed_10m,cloud_cover&past_minutely_15=6&forecast_minutely_15=4&daily=sunrise,sunset&timezone=${encodeURIComponent(PNH.tz)}&forecast_days=1`
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const j = await r.json()
  const m = j.minutely_15
  nowcast = m.time.map((t, i) => ({ ms: Date.parse(t + ':00+07:00'), temp: m.temperature_2m[i], feels: m.apparent_temperature ? m.apparent_temperature[i] : m.temperature_2m[i], rh: m.relative_humidity_2m[i], code: m.weather_code[i], precip: m.precipitation[i], wind: m.wind_speed_10m[i], cloud: m.cloud_cover[i] }))
  sun = { sunrise: j.daily && j.daily.sunrise && j.daily.sunrise[0], sunset: j.daily && j.daily.sunset && j.daily.sunset[0] }
}
// 雷达像素 → 雨强等级（RainViewer「Universal Blue」配色）：0 无，1 极弱（可能是杂波），2 小雨，3 中雨，4 大雨，5 强对流/雷暴
async function fetchRadar() {
  const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: AbortSignal.timeout(10000) })).json()
  const past = (j.radar && j.radar.past) || []
  const frame = past[past.length - 1], prev = past[past.length - 2]
  if (!frame) throw new Error('没有雷达帧')
  if (radar && radar.ms === frame.time * 1000) return // 还是同一帧
  const z = 7, n = 2 ** z
  const fx = ((PNH.lon + 180) / 360) * n
  const fy = ((1 - Math.log(Math.tan((PNH.lat * Math.PI) / 180) + 1 / Math.cos((PNH.lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const tx = Math.floor(fx), ty = Math.floor(fy), px = Math.floor((fx - tx) * 256), py = Math.floor((fy - ty) * 256)
  const sample = async (f) => {
    const r = await fetch(`${j.host}${f.path}/256/${z}/${tx}/${ty}/2/0_0.png`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('瓦片 HTTP ' + r.status)
    const png = decodePng(Buffer.from(await r.arrayBuffer()))
    return sampleRadar(png, px, py)
  }
  const cur = await sample(frame)
  // 2026-10-19：窗外没下雨时页面仍显示小雨（单帧回波可能是高空降水未落地或杂波）。市中心必须连续两帧都有回波才算下雨，取两帧里较弱的一帧；取不到上一帧就不判为下雨。
  let before = null
  if (prev) { try { before = await sample(prev) } catch {} }
  const level = before ? Math.min(cur.level, before.level) : 0
  radar = { ms: frame.time * 1000, level, nearby: cur.nearby, single: cur.level, confirmed: Boolean(before) }
}
function modelAt(ms) {
  if (!nowcast || !nowcast.length) return null
  let a = nowcast[0], b = nowcast[nowcast.length - 1]
  for (let i = 0; i < nowcast.length - 1; i++) if (nowcast[i].ms <= ms && nowcast[i + 1].ms >= ms) { a = nowcast[i]; b = nowcast[i + 1]; break }
  const f = b.ms === a.ms ? 0 : Math.min(1, Math.max(0, (ms - a.ms) / (b.ms - a.ms)))
  const L = (k) => a[k] + (b[k] - a[k]) * f
  return { temp: L('temp'), feels: L('feels'), rh: L('rh'), cloud: L('cloud'), wind: L('wind'), precip: Math.max(a.precip, b.precip), code: (f < 0.5 ? a : b).code }
}
const LEVEL = [null, { code: 51, mm: 0.2 }, { code: 61, mm: 1 }, { code: 63, mm: 3 }, { code: 65, mm: 8 }, { code: 95, mm: 15 }]
const hhmm = (ms) => pnhIso(ms).slice(11)
function composeWeather() {
  const now = Date.now()
  const mod = modelAt(now)
  if (!mod) return null
  const radarAge = radar ? (now - radar.ms) / 60000 : Infinity
  let code, rainMm, cloud = mod.cloud, rainSrc
  if (radar && radarAge <= 15) {
    if (radar.level > 0) { code = LEVEL[radar.level].code; rainMm = LEVEL[radar.level].mm; cloud = Math.max(cloud, 85) }
    else { code = mod.code === 45 || mod.code === 48 ? mod.code : cloudCode(cloud); rainMm = 0 }
    rainSrc = `雷达帧 ${hhmm(radar.ms)}（${Math.round(radarAge)} 分钟前）${radar.level ? '定位像素连续两帧有降水回波，非地面实测' : radar.single > 0 ? '定位像素仅最新一帧有回波，未连续' : radar.nearby > 0 ? '定位像素无降水回波，周边约8公里存在雨区' : '定位像素无降水回波'}`
  } else {
    code = RAIN_CODE(mod.code) ? mod.code : cloudCode(cloud)
    rainMm = RAIN_CODE(mod.code) ? mod.precip * 4 : 0
    rainSrc = '雷达暂时取不到，降水用模型'
  }
  return {
    tempC: Math.round(mod.temp * 10) / 10, feelsC: Math.round(mod.feels * 10) / 10, cloud: Math.round(cloud), humidity: Math.round(mod.rh), windKmh: Math.round(mod.wind),
    code, rainMm, rainEvidence: radarAge <= 15 ? 'radar' : 'model', radarAt: radar ? pnhIso(radar.ms) : null, location: { lat: PNH.lat, lon: PNH.lon }, nearbyRain: radar ? Math.round(radar.nearby * 100) : null, dataAt: pnhIso(now),
    stale: radarAge > 15,
    source: `金边市中心 · ${rainSrc}；气温/云/风为 15 分钟临近预报插值到此刻`,
  }
}
let fetchedAt = 0
async function refreshWeather() {
  const [a, b] = await Promise.allSettled([fetchNowcast(), fetchRadar()])
  if (a.status === 'rejected') console.log('[weather] 临近预报获取失败：' + a.reason)
  if (b.status === 'rejected') console.log('[weather] 雷达获取失败：' + b.reason)
  if (a.status === 'fulfilled' || b.status === 'fulfilled') fetchedAt = Date.now()
  const w = composeWeather()
  if (w) weather = { ...w, sunrise: sun.sunrise, sunset: sun.sunset, fetchedAt: new Date(fetchedAt).toISOString() }
}
refreshWeather()
setInterval(refreshWeather, 60 * 1000) // 每分钟刷新：数据时间与此刻相差不超过 15 分钟

function world() {
  let cfg = null
  try { cfg = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'workhours', 'workhours.json'), 'utf8')) } catch {}
  const t = localParts(new Date(), PNH.tz)
  return {
    tz: PNH.tz, city: '金边', local: { dow: t.dow, h: t.h, mi: t.mi, s: t.s, minutes: t.minutes },
    weather: weather ? { ...weather, stale: Boolean(weather.stale) || Date.now() - Date.parse(weather.fetchedAt) > 15 * 60000 } : null,
    duty: cfg ? { on: onDuty(cfg), next: nextChange(cfg), start: cfg.start, end: cfg.end, days: cfg.days } : null,
  }
}
const PAPERCLIP = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100'
const PORT = Number(process.env.OFFICE3D_PORT || 3200)
const COMPANY = fs.readFileSync(path.join(HERE, '..', 'company-id.txt'), 'utf8').trim()
const townMap = loadTownMap({ file: path.join(HERE, 'town-map.json'), log: console.log })
const tenancy = createTenancy({ dir: HERE, now: Date.now, log: console.log, paperclipBaseUrl: PAPERCLIP })
tenancy.warnIfPaperclipNotLoopback()

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
}

async function get(p, { signal } = {}) {
  const r = await fetch(PAPERCLIP + p, { signal: signal || AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`${p} -> ${r.status}`)
  return r.json()
}
function readGovernanceFile(name) { try { return JSON.parse(fs.readFileSync(path.join(HERE, name), 'utf8')) } catch { return {} } }
async function send(method, p, body) {
  const r = await fetch(PAPERCLIP + p, {
    method,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// 写操作的令牌：每次启动随机生成，只通过 /state 下发给本页面（其他网站跨域读不到 /state）
const ACT_TOKEN = crypto.randomBytes(24).toString('hex')
// office.localhost：*.localhost 在浏览器里固定指向本机，不会被 DNS 重绑定利用；某个地址的 WebGL 被浏览器封掉时可以换它打开
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, `http://office.localhost:${PORT}`])

// ── 局域网访问（董事会 2026-10-17 要求）──
// 规则：① 本机（回环地址）和以前完全一样；② 其他设备必须先输入访问码（自动生成，存在 lan.json），之后才能看；
// ③ 局域网设备默认只读：/state 里不下发操作令牌、POST /act 一律 403（lan.json 里 write 改成 true 才允许，不建议）；
// ④ 只认「私网 IP:端口」或「本机计算机名:端口」这类访问地址，不认任意域名（防 DNS 重绑定偷读）；⑤ lan.json 里 enabled 改成 false 就回到只允许本机。
const LAN_FILE = path.join(HERE, 'lan.json')
let LAN = { enabled: true, write: false, code: '' }
try { LAN = { ...LAN, ...JSON.parse(fs.readFileSync(LAN_FILE, 'utf8')) } } catch {}
if (!LAN.code) { LAN.code = crypto.randomBytes(5).toString('hex'); try { fs.writeFileSync(LAN_FILE, JSON.stringify(LAN, null, 2)) } catch {} }
const LAN_COOKIE = crypto.createHmac('sha256', LAN.code).update('office3d-lan').digest('hex')
const isLoop = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
const PRIVATE_IP = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/
const HOSTNAME = os.hostname().toLowerCase()
function hostOk(h) {
  if (ORIGINS.has(`http://${h}`)) return true
  if (!LAN.enabled) return false
  const m = String(h || '').match(/^([^:\/]+):(\d+)$/)
  if (!m || Number(m[2]) !== PORT) return false
  const name = m[1].toLowerCase()
  return PRIVATE_IP.test(name) || name === HOSTNAME || name === `${HOSTNAME}.local`
}
const originOk = (o) => typeof o === 'string' && o.startsWith('http://') && hostOk(o.slice(7))
const cookieOf = (req, name) => { for (const part of String(req.headers.cookie || '').split(/;\s*/)) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1) } return '' }
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const lanAuthed = (req) => same(cookieOf(req, 'office_lan'), LAN_COOKIE)
// ── 大屏链接（董事会 2026-10-18）：给领导用的投屏地址，免输入、只读、最小权限 ──
// wall.json：enabled / token（换掉 token = 作废旧链接）/ urls（启动时写入完整链接，只在这台电脑上）。
// 只带大屏令牌的设备：只能 GET 大屏页、静态资源、脱敏后的 /state、/wall/data；/act、知识库、任务详情、治理、健康等一律 403。
const WALL_FILE = path.join(HERE, 'wall.json')
let WALL = { enabled: true, token: '' }
try { WALL = { ...WALL, ...JSON.parse(fs.readFileSync(WALL_FILE, 'utf8')) } } catch {}
if (!WALL.token) WALL.token = crypto.randomBytes(12).toString('hex')
const WALL_COOKIE = crypto.createHmac('sha256', WALL.token).update('office3d-wall').digest('hex')
const wallAuthed = (req) => same(cookieOf(req, 'office_wall'), WALL_COOKIE)
const CONTRACT_VIEW_FILE = path.join(HERE, 'contract-view.json')
let CONTRACT_VIEW_ENABLED = false
try {
  const config = JSON.parse(fs.readFileSync(CONTRACT_VIEW_FILE, 'utf8'))
  CONTRACT_VIEW_ENABLED = config && config.enabled === true
} catch {}
const SCHEDULER_VIEW_FILE = path.join(HERE, 'scheduler-view.json')
let SCHEDULER_VIEW_ENABLED = false
try {
  const config = JSON.parse(fs.readFileSync(SCHEDULER_VIEW_FILE, 'utf8'))
  SCHEDULER_VIEW_ENABLED = config && config.enabled === true
} catch {}
const schedulerDecisionRecords = []
let schedulerLazyCache = { key: '', at: 0, tasks: [], completed: [] }
const HOME_FILE = path.join(HERE, 'town-home.json')
let HOME_ENABLED = false
try {
  const config = JSON.parse(fs.readFileSync(HOME_FILE, 'utf8'))
  HOME_ENABLED = config && config.enabled === true
} catch {}
const HOME_TOKEN = crypto.randomBytes(32).toString('hex')
const homeStore = createHomeStore({ dir: path.join(HERE, 'town', 'data'), now: Date.now })
const homeRoutes = createHomeRoutes({ enabled: HOME_ENABLED, ownerId: 'board', token: HOME_TOKEN, store: homeStore })
let TOWN_NAV_ENABLED = false
try {
  TOWN_NAV_ENABLED = townNavEnabled(JSON.parse(fs.readFileSync(path.join(HERE, 'town-nav.json'), 'utf8')))
} catch {}
const TOWN_NAV_CLIENT = townNavClientScript(TOWN_NAV_ENABLED)
let COMMAND_VIEW_ENABLED = false
let commandViewConfig = {}
try {
  commandViewConfig = JSON.parse(fs.readFileSync(path.join(HERE, 'command-view.json'), 'utf8'))
  COMMAND_VIEW_ENABLED = commandViewEnabled(commandViewConfig)
} catch {}
const commandViewRoutes = COMMAND_VIEW_ENABLED ? createCommandViewRoutes({ enabled: true }) : null
const commandLive = createCommandLiveWiring({
  config: commandViewConfig, routes: commandViewRoutes, readState: () => state(), company: { id: COMPANY, name: 'Virtual AI Office' }, now: Date.now,
  get: async (p, { signal }) => {
    const response = await fetch(PAPERCLIP + p, { method: 'GET', signal })
    return { status: response.status, body: response.ok ? await response.json() : null }
  },
})
const API_PATHS = new Set(['/state', '/kb', '/kb/doc', '/daily', '/backlog', '/issue', '/governance', '/contract-view', '/scheduler/suggest', '/town/home/session', '/town/home/layout', '/town/home/save', '/town/home/reset', '/health', '/blocked/preview', '/memory/preview', '/workload', '/wall/data', '/act', '/lan-login', '/replay', '/collab', '/rework', '/evidence-version', '/foyer', '/foyer/visitors', '/handoff', '/chat', '/chat/summary', '/town/map', '/platform/tenancy'])
API_PATHS.add('/command-view')
API_PATHS.add('/command-view/scenarios')
// 静态文件白名单：页面、脚本、样式、图片、模型。目录里的 json / log / dpapi / md / mjs（访问码、Telegram 配置、审计日志、委员会数据……）一律不对外
const STATIC_EXT = new Set(['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.glb', '.gltf', '.bin', '.fbx'])
const staticOk = (rel) => STATIC_EXT.has(path.extname(rel).toLowerCase()) && !rel.split('/').some((seg) => seg.startsWith('.')) && !/^\/(tests|codex-prompts|_ref)\//.test(rel)
let wallCache = { at: 0, data: null }, issuesCache = { at: 0, list: [] }
// 「待董事会提供 / 决定」：① 阻塞类型为「待授权或业务决定」的任务（读最近一条「阻塞：」评论，按更新时间缓存）；
// ② roadmap.json 的 boardItems 里登记、且对应任务还没结束的事项（任务一结束就自动消失，不会留下过期的红灯）。只读。
const blockedTypeCache = new Map() // issueId -> { updatedAt, type, condition }
async function wallBoardItems(roadmap) {
  const out = [], ended = (s) => s === 'done' || s === 'cancelled'
  const byIdent = new Map(issuesCache.list.map((i) => [i.ident, i]))
  for (const x of (roadmap && roadmap.boardItems) || []) {
    const i = byIdent.get(x.ident)
    if (i && !ended(i.status)) out.push({ kind: 'board', ident: x.ident, title: String(x.what || i.title || '').slice(0, 200), since: x.since || i.updatedAt })
  }
  const seen = new Set(out.map((x) => x.ident))
  for (const i of issuesCache.list.filter((i) => i.status === 'blocked' && i.id && !seen.has(i.ident)).slice(0, 12)) {
    let c = blockedTypeCache.get(i.id)
    if (!c || c.updatedAt !== i.updatedAt) {
      try { const cs = await get(`/api/issues/${i.id}/comments`); c = { updatedAt: i.updatedAt, ...blockedReason(Array.isArray(cs) ? cs : cs.comments || []) } } catch { c = { updatedAt: i.updatedAt, type: '未说明', condition: '' } }
      blockedTypeCache.set(i.id, c)
    }
    if (c.type === '待授权或业务决定') out.push({ kind: 'board_blocked', ident: i.ident, title: `${i.title}${c.condition ? '：' + c.condition : ''}`.slice(0, 200), since: i.updatedAt })
  }
  return out
}
function restrictedWorld(value) {
  if (!value?.weather?.location) return value
  return {
    ...value,
    weather: {
      ...value.weather,
      location: coarsenGeo(value.weather.location.lat, value.weather.location.lon),
    },
  }
}
async function wallData(restrictGeo = false) {
  if (!restrictGeo && wallCache.data && Date.now() - wallCache.at < 5000) return wallCache.data
  if (Date.now() - issuesCache.at > 30000) {
    const r = await get(`/api/companies/${COMPANY}/issues`)
    issuesCache = { at: Date.now(), list: (Array.isArray(r) ? r : r.issues || []).map((i) => ({ id: i.id, ident: i.identifier, title: i.title, status: i.status, projectId: i.projectId || null, updatedAt: i.updatedAt })) }
  }
  let roadmap = null
  try { roadmap = JSON.parse(fs.readFileSync(path.join(HERE, 'roadmap.json'), 'utf8')) } catch {}
  const sourceState = await state()
  const data = buildWall({ now: new Date(), state: restrictGeo ? { ...sourceState, world: restrictedWorld(sourceState.world) } : sourceState, issues: issuesCache.list, roadmap, health: await healthReport().catch(() => null), boardItems: await wallBoardItems(roadmap) })
  if (!restrictGeo) wallCache = { at: Date.now(), data }
  return data
}
const loginTries = new Map() // 地址 -> [时间戳]，5 分钟内最多 6 次
const loginPage = (msg = '') => `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>智序工场 · 局域网访问</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#14161a;color:#f4f1eb;font:16px system-ui,sans-serif}form{width:min(92vw,340px);padding:26px;border:1px solid #b69a6466;border-radius:14px;background:#1d2026}h1{margin:0 0 6px;font-size:20px;color:#e0c88f}p{margin:0 0 16px;color:#a9adb3;font-size:13px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid #444;font-size:16px}input{background:#0f1114;color:#fff;margin-bottom:12px}button{background:#b69a64;color:#14161a;border:0;font-weight:700}.e{color:#ff8a8a;margin:0 0 10px;font-size:13px}</style><form method="post" action="/lan-login"><h1>智序工场 · 办公室</h1><p>局域网只读访问。请输入访问码（在运行服务的电脑上，office3d 目录的 lan.json 里）。</p>${msg ? `<div class="e">${msg}</div>` : ''}<input name="code" autocomplete="off" autofocus placeholder="访问码"><button>进入</button></form></html>`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONEY_RE = /类别：资金类/
const MONEY_OK = new Set(['GoSenior', 'DBEngineer'])
const MONEY_CLAUSE = '**类别：资金类**（账务 / 提现 / 鉴权 / IAM / 迁移 / 密钥 / 入账队列）→ 只允许「Go 高级工程师」或「数据库工程师」实现；PR 必须依次通过 代码审查员 → 安全审查员 → 账务审计员 三道 APPROVE，再由董事会人工过目才能合并。'
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// 显示名称（只在办公室 3D 里用，不改 Paperclip 里的 agent 名）：存在本目录 names.json
const NAMES_FILE = path.join(HERE, 'names.json')
const readNames = () => { try { return JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8')) } catch { return {} } }

// 真实事件账本（「今日回放」的数据源）：订阅 state() 已生成的 events，脱敏存档。本模块出错只记日志，不影响 /state。
const ledger = createEventsLedger({ redactText, dir: HERE, now: Date.now, tz: PNH.tz, names: readNames })

async function act(a) {
  const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }) }
  if (a.type === 'rename') {
    const key = str(a.agentId, 80)
    need(UUID.test(key) || /^board:.{1,12}$/.test(key), '对象不对')
    const name = str(a.name, 24).replace(/[<>"]/g, '')
    const names = readNames()
    if (name) names[key] = name
    else delete names[key] // 清空 = 恢复原名
    fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2))
    return { ok: true }
  }
  if (a.type === 'approval') {
    need(UUID.test(a.id || '') && ['approve', 'reject'].includes(a.decision), '参数不对')
    return send('POST', `/api/approvals/${a.id}/${a.decision}`, { decisionNote: str(a.note, 4000) || null })
  }
  if (a.type === 'answer') {
    need(UUID.test(a.issueId || '') && UUID.test(a.interactionId || '') && Array.isArray(a.answers) && a.answers.length <= 20, '参数不对')
    const answers = a.answers.map((x) => ({
      questionId: str(x.questionId, 160),
      optionIds: (Array.isArray(x.optionIds) ? x.optionIds : []).slice(0, 20).map((o) => str(o, 160)).filter(Boolean),
      ...(str(x.otherText, 8000) ? { otherText: str(x.otherText, 8000) } : {}),
    }))
    return send('POST', `/api/issues/${a.issueId}/interactions/${a.interactionId}/respond`, { answers, summaryMarkdown: str(a.note, 8000) || null })
  }
  if (a.type === 'confirm') { // 确认类卡片：同意（可带勾选项）/ 不同意（可带原因）
    need(UUID.test(a.issueId || '') && UUID.test(a.interactionId || '') && ['accept', 'reject'].includes(a.decision), '参数不对')
    const base = `/api/issues/${a.issueId}/interactions/${a.interactionId}`
    if (a.decision === 'accept') {
      const ids = (Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds : []).slice(0, 200).map((o) => str(o, 160)).filter(Boolean)
      return send('POST', `${base}/accept`, a.selectedOptionIds === undefined ? {} : { selectedOptionIds: ids })
    }
    return send('POST', `${base}/reject`, { reason: str(a.reason, 8000) || undefined })
  }
  if (a.type === 'cancel_run') { // 取消一次运行：进程还在就停掉；进程已退出的残留记录就把它标掉
    need(UUID.test(a.runId || ''), '运行 id 不对')
    return send('POST', `/api/heartbeat-runs/${a.runId}/cancel`, {})
  }
  if (a.type === 'review') {
    need(UUID.test(a.issueId || '') && ['accept', 'changes'].includes(a.decision), '参数不对')
    const note = str(a.note, 8000)
    need(a.decision === 'accept' || note, '要求修改时请写明要改什么')
    if (note) await send('POST', `/api/issues/${a.issueId}/comments`, { body: (a.decision === 'accept' ? '**董事会验收通过。**\n\n' : '**董事会要求修改：**\n\n') + note })
    return send('PATCH', `/api/issues/${a.issueId}`, { status: a.decision === 'accept' ? 'done' : 'in_progress' })
  }
  // 派发：新建任务（可直接指派给某个 agent，或交给 Lead 拆解）；或把待排期的任务指派出去
  // 资金类只能交给 GoSenior / DBEngineer（页面也会限制，这里再守一道）
  const assignee = async (id) => {
    need(UUID.test(id || ''), '负责人不对')
    const ag = (await get(`/api/companies/${COMPANY}/agents`)).find((x) => x.id === id)
    need(ag && ag.status !== 'terminated', '负责人不存在或已离职')
    return ag
  }
  if (a.type === 'create_issue') {
    need(UUID.test(a.projectId || '') && projectsCache.some((x) => x.id === a.projectId), '请选择项目')
    const title = str(a.title, 200)
    need(title, '请填写任务标题')
    let description = str(a.description, 20000)
    if (a.money) {
      description = MONEY_CLAUSE + (description ? '\n\n' + description : '')
    }
    const body = { title, description: description || null, projectId: a.projectId, priority: ['low', 'medium', 'high', 'critical'].includes(a.priority) ? a.priority : 'medium', status: 'backlog' }
    if (a.assigneeAgentId) {
      const ag = await assignee(a.assigneeAgentId)
      need(!(a.money || MONEY_RE.test(description)) || MONEY_OK.has(ag.name), '资金类任务只能交给 GoSenior 或 DBEngineer')
      body.assigneeAgentId = ag.id
      body.status = 'todo'
    }
    const created = await send('POST', `/api/companies/${COMPANY}/issues`, body)
    if (!CONTRACT_VIEW_ENABLED) return created
    const parsed = parseContract(description)
    const checked = parsed.found ? validateContract(parsed.contract, { assignee: body.assigneeAgentId || '' }) : null
    return {
      ...created,
      contractCheck: {
        state: !parsed.found ? 'none' : checked.ok ? 'complete' : 'incomplete',
        errors: checked ? checked.errors.map((item) => ({ field: item.field, code: item.code })) : [],
      },
    }
  }
  if (a.type === 'assign') {
    need(UUID.test(a.issueId || ''), '任务 id 不对')
    const [i, ag] = await Promise.all([get(`/api/issues/${a.issueId}`), assignee(a.assigneeAgentId)])
    need(i.status === 'backlog' || i.status === 'todo', '只能指派「待排期 / 待开始」的任务')
    need(!MONEY_RE.test(i.description || '') || MONEY_OK.has(ag.name), '资金类任务只能交给 GoSenior 或 DBEngineer')
    const open = (i.blockedBy || []).filter((b) => b.status !== 'done' && b.status !== 'cancelled')
    need(!open.length || a.force === true, `依赖未完成：${open.map((b) => b.identifier).join('、')}`)
    return send('PATCH', `/api/issues/${a.issueId}`, { assigneeAgentId: ag.id, status: 'todo' })
  }
  // 取消任务：先发一条带原因的评论，再标为已取消；负责人正在跑这个任务时一并停掉那次运行
  if (a.type === 'cancel_issue') {
    need(UUID.test(a.issueId || ''), '任务 id 不对')
    const i = await get(`/api/issues/${a.issueId}`)
    need(!['done', 'cancelled'].includes(i.status), '任务已经完成或已取消')
    const note = str(a.note, 8000)
    await send('POST', `/api/issues/${a.issueId}/comments`, { body: '**董事会取消了这个任务。**' + (note ? '\n\n' + note : '') + '\n\n请停止相关工作，不要再继续提交。' })
    const r = await send('PATCH', `/api/issues/${a.issueId}`, { status: 'cancelled' })
    const run = i.executionRunId || i.checkoutRunId
    if (run && UUID.test(run)) { try { await send('POST', `/api/heartbeat-runs/${run}/cancel`, {}) } catch {} }
    return r
  }
  // Telegram 向导（令牌只经过这里的内存，不写日志、不回显）
  if (a.type === 'tg_connect') { const r = await telegram.connect(str(a.purpose, 20), typeof a.token === 'string' ? a.token : '', a.takeover === true); return r }
  if (a.type === 'tg_bind') return telegram.bindLink(str(a.purpose, 20), str(a.personId, 40))
  if (a.type === 'tg_confirm') return telegram.confirm(str(a.purpose, 20), Number(a.chatId), a.accept === true)
  if (a.type === 'tg_assign') return telegram.assign(str(a.purpose, 20), Number(a.chatId), str(a.personId, 40))
  if (a.type === 'committee_open') return committee.open()
  if (a.type === 'standup_open') return standup.open()
  if (a.type === 'acceptance_open') return acceptance.open()
  if (a.type === 'blocked_run') return patrol.run()
  if (a.type === 'rework_run') return rework.run()
  if (a.type === 'handoff_run') return handoff.run()
  if (a.type === 'memory_rescan') return mem.rescan()
  if (a.type === 'memory_monthly') return mem.monthly()
  if (a.type === 'workload_report') return workload.report()
  if (a.type === 'chat_send') return chat.send(str(a.agentId, 80), typeof a.text === 'string' ? a.text : '')
  if (a.type === 'chat_to_task') return chat.toTask({ chatAgentId: str(a.chatAgentId, 80), title: typeof a.title === 'string' ? a.title : '', note: typeof a.note === 'string' ? a.note : '', messageIds: a.messageIds })
  if (a.type === 'foyer_announce') return foyer.announce(typeof a.text === 'string' ? a.text : '') // 董事会本机手写公告（≤120 字，scanMemoryText 过闸）
  if (a.type === 'foyer_announce_clear') return foyer.clear() // 清空当前公告，历史保留
  if (a.type === 'committee_revoke') return committee.revoke(str(a.path, 300))
  if (a.type === 'tg_resend') return telegram.resend()
  if (a.type === 'tg_unbind') return telegram.unbind(str(a.purpose, 20), Number(a.chatId))
  if (a.type === 'tg_person_add') return telegram.addPerson(str(a.name, 40), str(a.role, 40))
  if (a.type === 'tg_person_del') return telegram.removePerson(str(a.id, 40))
  if (a.type === 'tg_person_set') return telegram.updatePerson(str(a.id, 40), { ...(a.notify ? { notify: a.notify } : {}), ...('quiet' in a ? { quiet: a.quiet === null ? null : { from: str(a.quiet && a.quiet.from, 5), to: str(a.quiet && a.quiet.to, 5) } } : {}), ...('quick' in a ? { quick: a.quick === true } : {}) })
  if (a.type === 'tg_test') return telegram.test(str(a.purpose, 20))
  if (a.type === 'tg_enable') return telegram.setEnabled(str(a.purpose, 20), a.on === true)
  if (a.type === 'tg_unsub') return telegram.removeSubscriber(str(a.purpose, 20), Number(a.chatId))
  if (a.type === 'tg_remove') return telegram.remove(str(a.purpose, 20))
  if (a.type === 'comment') {
    need(UUID.test(a.issueId || ''), '任务 id 不对')
    need(str(a.body, 20000), '评论不能为空')
    return send('POST', `/api/issues/${a.issueId}/comments`, { body: str(a.body, 20000) })
  }
  need(false, '不支持的操作')
}

// 任务详情（只读）：描述 + 最近几条评论，页面里直接看，不用跳到 Paperclip
async function issueDetail(id) {
  const [i, cs, agents] = await Promise.all([get(`/api/issues/${id}`), get(`/api/issues/${id}/comments`), get(`/api/companies/${COMPANY}/agents`)])
  const names = new Map(agents.map((a) => [a.id, a.name]))
  const list = (Array.isArray(cs) ? cs : cs.comments || []).slice(-8)
  return {
    id: i.id, identifier: i.identifier, title: i.title, status: i.status, projectId: i.projectId || null,
    assignee: i.assigneeAgentId ? names.get(i.assigneeAgentId) || null : null,
    description: String(i.description || '').slice(0, 6000),
    money: MONEY_RE.test(i.description || ''),
    blockedBy: (i.blockedBy || []).map((b) => ({ identifier: b.identifier, title: b.title, status: b.status })),
    comments: list.map((c) => ({ at: c.createdAt, who: c.authorAgentId ? names.get(c.authorAgentId) || 'agent' : '董事会', body: String(c.body || '').slice(0, 6000) })),
  }
}

const issueCache = new Map()
async function issueInfo(id) {
  if (issueCache.has(id)) return issueCache.get(id)
  try {
    const i = await get(`/api/issues/${id}`)
    const v = { identifier: i.identifier, title: i.title, createdByAgentId: i.createdByAgentId || null, createdByUserId: i.createdByUserId || null, assigneeAgentId: i.assigneeAgentId || null, projectId: i.projectId || null }
    issueCache.set(id, v)
    return v
  } catch {
    return null
  }
}
const firstLine = (t) =>
  String(t || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s`]+/, '').replace(/[*`]/g, '').trim())
    .find((l) => l.length > 1) || ''
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

// ── 真实的讨论 → 会议：同一个任务里，12 分钟内有 2 位以上不同的 agent 发了评论，就算一场讨论会。
// 参会者是这些真实发言的人，台词是他们真实评论的第一行；页面上只有当时空闲的人会走去会议室，正在跑的人在会议室屏幕上显示「远程」。
async function buildMeetings(activity) {
  const WINDOW = 12 * 60 * 1000
  const byIssue = new Map()
  for (const e of [...activity].reverse()) {
    if (e.action !== 'issue.comment_added' || e.actorType !== 'agent' || !e.agentId) continue
    const line = clip(firstLine((e.details || {}).bodySnippet), 90)
    if (!line || (line.match(/\?/g) || []).length > line.length * 0.3) continue
    if (!byIssue.has(e.entityId)) byIssue.set(e.entityId, [])
    byIssue.get(e.entityId).push({ agentId: e.agentId, text: line, at: e.createdAt, ident: (e.details || {}).identifier || null, id: e.id })
  }
  const out = []
  for (const [issueId, list] of byIssue) {
    for (let i = list.length - 1; i >= 0; i--) { // 从最新一条往回数 12 分钟窗口
      const end = Date.parse(list[i].at)
      const win = list.filter((x) => Date.parse(x.at) <= end && end - Date.parse(x.at) <= WINDOW)
      const who = [...new Set(win.map((x) => x.agentId))]
      if (who.length >= 2) {
        const info = await issueInfo(issueId)
        out.push({ id: `${issueId}:${win[0].id}`, issueId, ident: win[0].ident || (info && info.identifier) || null, title: info ? info.title : '', at: list[i].at, participants: who.slice(0, 8), lines: win.slice(-6).map((x) => ({ agentId: x.agentId, text: x.text })) })
        break
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)
}

// 把活动流提炼成「会驱动动画的真实事件」。批量导入（backlog、无负责人）等噪声一律不产生动作。
async function buildEvents(activity, approvalsAll) {
  const apprById = new Map(approvalsAll.map((a) => [a.id, a]))
  const out = []
  for (const e of [...activity].reverse()) {
    const d = e.details || {}
    const agent = e.actorType === 'agent' ? e.agentId : null
    if (e.action === 'approval.created' && agent) {
      const a = apprById.get(e.entityId)
      const title = (a && a.payload && a.payload.title) || '审批请求'
      const summary = clip(firstLine(a && a.payload && a.payload.summary), 60)
      out.push({ id: e.id, at: e.createdAt, kind: 'submit_to_board', from: agent, to: 'board', ref: e.entityId, text: clip(title, 70) + (summary ? ' —— ' + summary : '') })
    } else if ((e.action === 'approval.approved' || e.action === 'approval.rejected') && e.actorType === 'user') {
      const a = apprById.get(e.entityId)
      if (a && a.requestedByAgentId) {
        const title = (a.payload && a.payload.title) || '审批'
        out.push({ id: e.id, at: e.createdAt, kind: 'board_decision', from: 'board', to: a.requestedByAgentId, text: (e.action === 'approval.approved' ? '已批准：' : '已拒绝：') + clip(title, 60) })
      }
    } else if (e.action === 'issue.updated' && d.changes) {
      const c = d.changes
      const info = await issueInfo(e.entityId)
      if (!info) continue
      if (c.assigneeAgentId && c.assigneeAgentId.to && c.assigneeAgentId.to !== c.assigneeAgentId.from && agent && agent !== c.assigneeAgentId.to) {
        out.push({ id: e.id, at: e.createdAt, kind: 'dispatch', from: agent, to: c.assigneeAgentId.to, ref: info.identifier, text: `派给你：${info.identifier} ${clip(info.title, 50)}` })
      } else if (c.status && agent && (c.status.to === 'in_review' || c.status.to === 'done')) {
        const to = info.createdByAgentId && info.createdByAgentId !== agent ? info.createdByAgentId : info.createdByUserId ? 'board' : null
        if (to) out.push({ id: e.id, at: e.createdAt, kind: 'report', from: agent, to, ref: info.identifier, text: `${info.identifier} ${c.status.to === 'done' ? '已完成' : '提交审查'}：${clip(info.title, 50)}` })
      }
      // 庆祝：任务真的标为完成（不管是 agent 自己还是董事会验收）→ 负责人工位撒彩纸
      if (c.status && c.status.to === 'done' && info.assigneeAgentId) out.push({ id: e.id + ':celebrate', at: e.createdAt, kind: 'celebrate', from: info.assigneeAgentId, to: null, ref: info.identifier, text: `🎉 ${info.identifier} 完成：${clip(info.title, 40)}` })
    } else if (e.action === 'issue.comment_added' && agent) {
      const line = clip(firstLine(d.bodySnippet), 90)
      const garbled = (line.match(/\?/g) || []).length > line.length * 0.3 // 编码损坏的评论（一串 ?）不拿来演
      if (line && !garbled) out.push({ id: e.id, at: e.createdAt, kind: 'speak', from: agent, to: null, ref: d.identifier || null, text: line })
    }
  }
  return out.slice(-40)
}

// 进程探测：只发「0 号信号」判断进程是否还在，不会影响它。
function pidAlive(pid) {
  if (!pid) return null
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

// 问题卡的内容（题目、选项）：给页面直接作答用。待回答期间内容不变，按 id 缓存。
const interactionCache = new Map()
async function interactionInfo(issueId, interactionId) {
  const hit = interactionCache.get(interactionId)
  if (hit && hit.status !== 'pending') return hit
  try {
    const list = await get(`/api/issues/${issueId}/interactions`)
    const x = (Array.isArray(list) ? list : []).find((y) => y.id === interactionId)
    if (!x) return null
    const qs = (x.payload && (x.payload.questionSet?.questions || x.payload.questions)) || []
    // 确认类卡片（request_confirmation / request_checkbox_confirmation）：不是问答题，页面上用勾选 + 同意 / 不同意来处理
    const pl = x.payload || {}
    const confirm = ['request_confirmation', 'request_checkbox_confirmation'].includes(x.kind)
      ? {
          kind: x.kind, title: x.title || null, prompt: pl.prompt || x.summary || '', details: pl.detailsMarkdown || '',
          options: (pl.options || []).map((o) => ({ id: o.id, label: o.label, description: o.description || '' })),
          selected: pl.defaultSelectedOptionIds || [], min: pl.minSelected ?? 0, max: pl.maxSelected ?? null,
          acceptLabel: pl.acceptLabel || '同意', rejectLabel: pl.rejectLabel || '不同意',
          rejectRequiresReason: Boolean(pl.rejectRequiresReason),
          rejectReasonLabel: pl.rejectReasonLabel || '原因',
        }
      : null
    const verdicts = x.kind === 'request_item_verdicts' ? { prompt: pl.prompt || '', details: pl.detailsMarkdown || '', items: (pl.items || []).map((o) => ({ id: o.id, label: o.label, description: o.description || '' })) } : null
    const v = {
      status: x.status,
      confirm,
      verdicts,
      ask: {
        title: x.title || null,
        questions: qs.map((q) => ({
          id: q.id, prompt: q.prompt,
          multi: q.answerMode === 'multi_select' || q.selectionMode === 'multi',
          text: q.answerMode === 'text',
          allowOther: Boolean(q.customAnswer?.enabled || q.allowOther),
          options: (q.options || []).filter((o) => o.id !== 'paperclip_custom_answer').map((o) => ({ id: o.id, label: o.label, description: o.description || '' })),
        })),
      },
    }
    interactionCache.set(interactionId, v)
    return v
  } catch {
    return null
  }
}

const policyCache = new Map()
async function issuePolicy(id, updatedAt) {
  const key = id + '@' + updatedAt
  if (policyCache.has(key)) return policyCache.get(key)
  try {
    const i = await get(`/api/issues/${id}`)
    policyCache.set(key, i.executionPolicy || null)
    return i.executionPolicy || null
  } catch {
    return null
  }
}

// 「等你处理」：待人工审核的任务、待回答的问题、回答没送达的提醒。
async function buildWaiting(activity, issueList) {
  const out = []
  for (const i of issueList) {
    // 资金类等任务设了 agent 审查链（代码 → 安全 → 账务）：链没走完之前不是董事会验收的时候，不放进「等你处理」
    if (i.status !== 'in_review') continue
    const policy = i.executionPolicy || (await issuePolicy(i.id, i.updatedAt)) // 列表接口不带审查链，单独取（按更新时间缓存）
    const agentChain = ((policy && policy.stages) || []).some((s) => (s.participants || []).some((p) => p.type === 'agent'))
    if (!agentChain) out.push({ kind: 'review', id: i.identifier, issueId: i.id, projectId: i.projectId || null, title: i.title, since: i.updatedAt, agentId: i.assigneeAgentId || null })
  }
  const answered = new Set()
  const lastDelivery = new Map() // issueId -> {ok, at}
  for (const e of activity) { // 活动流是新→旧
    const d = e.details || {}
    // answered / accepted / rejected / dismissed … 凡是「创建」之外的交互事件都算已处理
    if (e.action.startsWith('issue.thread_interaction_') && e.action !== 'issue.thread_interaction_created' && d.interactionId) answered.add(d.interactionId)
    if ((e.action === 'issue.question_response_delivered' || e.action === 'issue.question_response_delivery_failed') && !lastDelivery.has(e.entityId)) {
      lastDelivery.set(e.entityId, { ok: e.action.endsWith('delivered'), at: e.createdAt })
    }
  }
  const week = Date.now() - 7 * 86400000
  for (const e of activity) {
    const d = e.details || {}
    if (e.action === 'issue.thread_interaction_created' && d.interactionId && d.interactionStatus === 'pending' && !answered.has(d.interactionId) && Date.parse(e.createdAt) > week) {
      const info = await issueInfo(e.entityId)
      const q = await interactionInfo(e.entityId, d.interactionId)
      if (q && q.status !== 'pending') continue
      out.push({ kind: 'question', id: info ? info.identifier : '问题', issueId: e.entityId, projectId: info ? info.projectId : null, interactionId: d.interactionId, title: info ? info.title : '', since: e.createdAt, agentId: e.agentId || null, ask: q ? q.ask : null, confirm: q ? q.confirm : null, verdicts: q ? q.verdicts : null })
    }
  }
  // agent 之后在这个任务上又有动作（评论、改状态等），说明它已经接着干了，「没送到」的提醒就不再显示
  const agentLater = new Map()
  for (const e of activity) if (e.actorType === 'agent' && e.entityType === 'issue' && !agentLater.has(e.entityId)) agentLater.set(e.entityId, e.createdAt)
  // 同一个任务既「待验收」又有待回答的问题：说明 agent 在等你的决定，不是做完了 —— 只保留问题卡，避免误点验收把任务关掉
  const asking = new Set(out.filter((w) => w.kind === 'question').map((w) => w.issueId))
  for (let k = out.length - 1; k >= 0; k--) if (out[k].kind === 'review' && asking.has(out[k].issueId)) out.splice(k, 1)
  for (const [issueId, v] of lastDelivery) {
    if (v.ok || Date.now() - Date.parse(v.at) > 3 * 86400000) continue
    if (agentLater.has(issueId) && Date.parse(agentLater.get(issueId)) > Date.parse(v.at)) continue
    const info = await issueInfo(issueId)
    out.push({ kind: 'undelivered', id: info ? info.identifier : '问题', issueId, projectId: info ? info.projectId : null, title: info ? info.title : '', since: v.at, agentId: null })
  }
  return out
}

const gossip = createGossip({ dir: HERE }) // 休息区八卦，见 gossip.mjs

// ── 日程：会议室墙上的「今日日程」，来自 Paperclip 的例程（routines）和它们的下次运行时间 ──
let scheduleCache = []
async function refreshSchedule() {
  try {
    const list = await get(`/api/companies/${COMPANY}/routines`)
    const out = []
    for (const r of Array.isArray(list) ? list : list.routines || []) {
      if (r.status !== 'active') continue
      const d = await get(`/api/routines/${r.id}`).catch(() => null)
      const t = d && (d.triggers || []).find((x) => x.kind === 'schedule' && x.nextRunAt)
      if (t) out.push({ title: r.title, agentId: r.assigneeAgentId, nextRunAt: t.nextRunAt, cron: t.cronExpression })
    }
    scheduleCache = out.sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
  } catch {}
}
refreshSchedule()
setInterval(refreshSchedule, 2 * 60 * 1000)

// ── 企业知识库（只读）：E:\VirtualAIOffice\knowledge 里的 Markdown；页面只能看 public / internal，confidential 只显示标题 ──
const KB_DIR = path.resolve(HERE, '..', '..', 'knowledge')
function kbMeta(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const meta = {}
  if (m) for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^(\w+):\s*(.*?)\s*(#.*)?$/); if (k) meta[k[1]] = k[2] }
  return { meta, body: m ? text.slice(m[0].length) : text }
}
function kbList() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '_templates') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) {
        const { meta } = kbMeta(fs.readFileSync(p, 'utf8'))
        out.push({ path: path.relative(KB_DIR, p).split(path.sep).join('/'), title: meta.title || e.name, audience: meta.audience || 'internal', status: meta.status || 'draft', updated: meta.updated || '', owner: meta.owner || '' })
      }
    }
  }
  try { walk(KB_DIR) } catch { return { ok: false, docs: [] } }
  return { ok: true, docs: out.sort((a, b) => a.path.localeCompare(b.path, 'zh')) }
}
function kbDoc(rel) {
  const p = path.resolve(KB_DIR, rel)
  if (!p.startsWith(KB_DIR + path.sep) || !p.endsWith('.md') || !fs.existsSync(p)) return null // 不允许跳出知识库目录
  const { meta, body } = kbMeta(fs.readFileSync(p, 'utf8'))
  if (meta.audience === 'confidential') return { meta, body: '（confidential：内容不在页面显示，请到原始文件查看）' }
  return { meta, body: body.slice(0, 60000) }
}
const stats = createStats({ dir: HERE, get, company: COMPANY }) // 每日战报、本周之星，见 stats.mjs
// Telegram bot 接入向导，见 telegram.mjs（令牌只在内存里；office / paperclip 用 Windows 账户加密存本机，support 只存 Paperclip 密钥库）
// Telegram 快捷按钮能做的三件事（页面之外的另一个入口，所以这里再核对一遍：资金类、还在 agent 审查链里的、已经不在待验收的，一律不动）
const tgActions = {
  async info(issueId) {
    if (!UUID.test(issueId || '')) throw new Error('任务 id 不对')
    const i = await get(`/api/issues/${issueId}`)
    const policy = i.executionPolicy || (await issuePolicy(i.id, i.updatedAt))
    const agentChain = ((policy && policy.stages) || []).some((st) => (st.participants || []).some((p) => p.type === 'agent'))
    // Telegram 里更保守：任务说明没打「类别：资金类」标记也不放行——只要标题 / 说明里碰到账务、分录、余额、提现、入账、鉴权、IAM、密钥、迁移，或改的是 ledger / iam / auth 目录，一律按资金类处理（例如 CMP-150 只在说明里写了 backend/internal/ledger，没有标记）
    const text = `${i.title}
${i.description || ''}`
    const money = MONEY_RE.test(text) || /账务|分录|余额|提现|入账|鉴权|IAM|密钥|迁移|ledger|outbox|withdraw|payout|migration|secret/i.test(text) || /backend\/internal\/(ledger|iam|auth|wallet)/i.test(text)
    const firstLines = (t, n) => String(t || '').split(/\r?\n/).map((l) => l.replace(/^[#>*\-\s`]+/, '').replace(/[*`]/g, '').trim()).filter(Boolean).join(' ').slice(0, n)
    let lastComment = ''
    try { const cs = await get(`/api/issues/${issueId}/comments`); const l = (Array.isArray(cs) ? cs : cs.comments || []).filter((c) => c.authorAgentId).slice(-1)[0]; if (l) lastComment = firstLines(l.body, 420) } catch {}
    return { identifier: i.identifier, title: i.title, status: i.status, money, agentChain, projectId: i.projectId || null, desc: firstLines(i.description, 300), lastComment }
  },
  async wake(issueId, who) { return send('POST', `/api/issues/${issueId}/comments`, { body: `董事会（${who}，经 Telegram）：上面的回答已经提交，请读取后继续。` }) },
  async review(issueId, who) {
    await send('POST', `/api/issues/${issueId}/comments`, { body: `**董事会验收通过（${who}，经 Telegram）。**` })
    return send('PATCH', `/api/issues/${issueId}`, { status: 'done' })
  },
}
const telegram = createTelegram({
  actions: tgActions,
  dir: HERE,
  createPaperclipSecret: (name, value, description) => send('POST', `/api/companies/${COMPANY}/secrets`, { name, value, description, provider: 'local_encrypted' }),
})
telegram.start()
// 内容审批委员会（见 committee.mjs）：每个工作日 11:00 开一批、16:00 统计；红线内容委员会先投票、董事会最后确认
const committee = createCommittee({ dir: HERE, kbDir: KB_DIR, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t).catch(() => {}) })
committee.start()
// 返工巡检（见 rework.mjs）：识别提交验收后被退回 ≥3 轮的超限任务并通知董事会；超限任务挡住晨会 / 自动验收流程（isCapped 读不到状态按未超限）
const rework = createRework({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t), dutyOn: () => world().duty.on })
rework.start()
// 晨会（见 standup.mjs）：工作日 8:35 Lead 提议今天的主要工作，5 位委员投票，通过的由程序派发
const standup = createStandup({ dir: HERE, workhoursFile: path.join(HERE, '..', 'workhours', 'workhours.json'), company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t).catch(() => {}), rework: (id) => rework.isCapped(id) })
standup.start()
// 超时验收（见 acceptance.mjs）：「待验收」超过 1 小时没人处理 → 委员会投票决定是否验收通过（资金类只能董事会验收）
// 版本核对（见 evidence-version.mjs）：批验收前先把【验收证据】里的对象版本（git 提交 / sha256）与当前实际版本只读核对；
//   版本已变 → 不进入委员会批次（等同交董事会）；证据缺版本 / 核对失败 → 进批次但标记 version:false，投票规则里加版本核对警告
const evidenceVersion = createEvidenceVersion({ dir: HERE, company: COMPANY, get, redactText })
const versionCheck = async (id) => { const r = await evidenceVersion.checkByIdent(id); return r && !r.disabled ? r : null }
const acceptance = createAcceptance({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t).catch(() => {}), rework: (id) => rework.isCapped(id), versionCheck })
acceptance.start()
const patrol = createBlockedPatrol({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t), dutyOn: () => world().duty.on, healthReport })
// 断点交接包（见 handoff.mjs）：被打断 / 转阻塞 / 换人 / 长停留时识别【交接包】模板提醒补写、新负责人上岗时转交前任交接包；只发标记评论不碰状态
const handoff = createHandoff({ dir: HERE, company: COMPANY, get, send, notify: (t) => telegram.notifyCommittee(t), dutyOn: () => world().duty.on, agents: () => get(`/api/companies/${COMPANY}/agents`), redactText })
handoff.start()
patrol.start()
const mem = createMemory({ dir: HERE, kbDir: KB_DIR, company: COMPANY, get, send, dutyOn: () => world().duty.on })
mem.start()
const chat = createChat({ dir: HERE, company: COMPANY, get, send, dutyOn: () => Boolean(world().duty?.on), agents: () => get(`/api/companies/${COMPANY}/agents`), redactText })
const chatStart = setTimeout(() => chat.start(), 60000); chatStart.unref?.()
// 前厅两项新数据（见 foyer.mjs）：匿名访客登记 + 董事会手写公告。默认关闭；foyer.json 原子写入、不在静态白名单里
const foyer = createFoyer({ dir: HERE, now: Date.now, redactText, scanMemoryText, log: console.log })
const workload = createWorkload({ dir: HERE, company: COMPANY, get, stats: () => stats.snapshot(), dutyOn: () => world().duty.on, notify: (t) => telegram.notifyCommittee(t), now: Date.now })
workload.start()
// 投票会：委员会内容审批 / 晨会投票期间，委员在办公室的评审室入座（前端据此走位；投票结果来自真实的投票任务）
function voteSessions(agents) {
  const idOf = new Map(agents.map((a) => [a.name, a.id]))
  const line = (name, rows) => {
    const vs = rows.map((r) => r.votes && r.votes[name]).filter(Boolean)
    if (!vs.length) return null
    const n = (k) => vs.filter((v) => v === k).length
    return `我投完了：通过 ${n('APPROVE')} · 不通过 ${n('CHANGES')}${n('ESCALATE') ? ` · 升级 ${n('ESCALATE')}` : ''}`
  }
  const mk = (id, kind, title, members, rows) => ({ id, kind, title, progress: `已交 ${members.filter((m) => ['done', 'cancelled'].includes(m.status)).length}/${members.length}`, members: members.map((m) => ({ name: m.name, agentId: idOf.get(m.name), done: ['done', 'cancelled'].includes(m.status), line: m.status === 'done' ? line(m.name, rows) : null })).filter((m) => m.agentId) })
  const out = []
  for (const b of committee.view().batches) if (b.state === 'voting') out.push(mk(`committee:${b.id}`, 'committee', `内容审批 批次 ${b.id}`, b.votes, b.items))
  const sv = standup.view()
  const av = acceptance.view()
  const bv = patrol.view().batch
  if (bv && bv.state === 'voting') {
    const session = mk(`blocked:${bv.id}`, 'blocked', `阻塞巡检投票 ${bv.id}`, bv.members, bv.items)
    session.members.forEach((m) => { if (m.done) m.line = '我已提交阻塞巡检投票' })
    out.push(session)
  }
  if (av && av.state === 'voting') out.push(mk(`acceptance:${av.id}`, 'acceptance', `验收投票 ${av.id}：超时待验收`, av.members, av.items))
  if (sv && ['proposing', 'voting'].includes(sv.state)) { // 晨会从开始就在评审室：Lead 先提议，然后 5 位委员投票
    const voters = sv.members.length ? sv.members : committee.view().members.map((m) => ({ name: m.name, status: 'todo' }))
    const sess = mk(`standup:${sv.id}`, 'standup', `晨会 ${sv.id}：今天做什么`, voters, sv.candidates)
    const lead = idOf.get('Lead')
    if (lead) sess.members.unshift({ name: 'Lead', agentId: lead, done: sv.state === 'voting', line: sv.state === 'voting' && sv.candidates.length ? `我提议了 ${sv.candidates.length} 项，请各位投票` : null })
    if (sv.state === 'proposing') sess.progress = 'Lead 提议中'
    out.push(sess)
  }
  return out
}

let projectsCache = []
let backlogCache = { at: 0, rows: [] }
const lastGoodState = createLastGoodState({ file: path.join(HERE, 'state-last-good.json') })
const backgroundHealth = createBackgroundHealth({ get, company: COMPANY, buildHealth, schedule: () => ({ days: (world().duty || {}).days }) })
async function refreshProjects() {
  try {
    const p = await get(`/api/companies/${COMPANY}/projects`)
    projectsCache = (Array.isArray(p) ? p : p.projects || []).map((x) => ({ id: x.id, name: x.name, status: x.status }))
  } catch {}
}
refreshProjects()
setInterval(refreshProjects, 5 * 60 * 1000)

async function backlogRows(strict = false) {
  if (Date.now() - backlogCache.at < 60 * 1000) {
    if (strict && backlogCache.failed) throw new Error('BACKLOG_UNAVAILABLE')
    return backlogCache.rows
  }
  try {
    const result = await get(`/api/companies/${COMPANY}/issues?status=backlog`)
    const rows = Array.isArray(result) ? result : result.issues || []
    backlogCache = { at: Date.now(), rows: rows.map((i) => ({
      id: i.identifier,
      issueId: i.id,
      projectId: i.projectId || null,
      title: i.title,
      status: 'backlog',
      ...((CONTRACT_VIEW_ENABLED || SCHEDULER_VIEW_ENABLED) ? { description: i.description || '' } : {}),
      ...(SCHEDULER_VIEW_ENABLED ? {
        priority: i.priority || null,
        createdAt: i.createdAt || null,
        assigneeAgentId: i.assigneeAgentId || null,
      } : {}),
    })) }
  } catch (error) { if (strict) throw error; backlogCache = { at: Date.now(), rows: backlogCache.rows, failed: true } }
  return backlogCache.rows
}

async function schedulerEnrichRows(rows) {
  const queue = rows.slice(0, 200)
  const out = Array(queue.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const index = cursor++
      out[index] = await schedulerEnrichRow(queue[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
  return out
}

async function schedulerEnrichRow(row) {
    let detail = null
    try {
      const r = await fetch(PAPERCLIP + `/api/issues/${encodeURIComponent(row.issueId || row.id)}`, { signal: AbortSignal.timeout(5000) })
      if (r.ok) detail = await r.json()
    } catch {}
    const source = detail && typeof detail === 'object' ? detail : row
    const hasDependencies = Boolean(detail && Object.prototype.hasOwnProperty.call(detail, 'blockedBy'))
    const blockedBy = hasDependencies && Array.isArray(source.blockedBy)
      ? source.blockedBy.map((item) => ({
        id: item.id || item.issueId || item.identifier || null,
        status: item.status || null,
      }))
      : []
    return {
      ...row,
      priority: source.priority || row.priority || null,
      createdAt: source.createdAt || row.createdAt || null,
      assigneeAgentId: source.assigneeAgentId || row.assigneeAgentId || row.agentId || null,
      blockedBy,
      dependencyKnown: hasDependencies,
      parentId: source.parentId || null,
      parentStatus: source.parentStatus || null,
    }
}

async function schedulerCompletedRows() {
  try {
    const r = await fetch(PAPERCLIP + `/api/companies/${COMPANY}/issues?status=done`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`done -> ${r.status}`)
    const result = await r.json()
    const rows = Array.isArray(result) ? result : result.issues || []
    return rows
      .filter((item) => item.assigneeAgentId && item.projectId)
      .map((item) => ({
        projectId: item.projectId,
        assigneeAgentId: item.assigneeAgentId,
        completedAt: item.completedAt || item.updatedAt || item.createdAt || null,
      }))
  } catch {
    return []
  }
}

async function healthReport() {
  return backgroundHealth.read()
}

// 聚合：一次请求拿到页面需要的全部数据，页面不直接访问 Paperclip。
async function state() {
  return lastGoodState.run(async () => {
  const { agents, dashboard: dash, issues, runs, approvals, activity, approvalsAll, backlog, gaps } =
    await loadStateComponents({ get, company: COMPANY, backlog: () => backlogRows(true) })
  const issueList = Array.isArray(issues) ? issues : issues.issues || []
  const byAgent = new Map()
  for (const i of issueList) {
    if (!i.assigneeAgentId) continue
    const rank = { in_progress: 0, in_review: 1, blocked: 2, todo: 3 }[i.status] ?? 9
    const cur = byAgent.get(i.assigneeAgentId)
    if (!cur || rank < cur.rank) byAgent.set(i.assigneeAgentId, { rank, id: i.identifier, issueId: i.id, projectId: i.projectId || null, title: i.title, status: i.status, since: i.updatedAt })
  }
  const lastRun = new Map()
  const liveRun = new Map()
  for (const r of runs) {
    if (!lastRun.has(r.agentId)) lastRun.set(r.agentId, { status: r.status, at: r.createdAt, error: r.errorCode || null })
    if (r.status === 'running' && !liveRun.has(r.agentId)) {
      liveRun.set(r.agentId, { id: r.id, startedAt: r.startedAt, lastOutputAt: r.lastOutputAt || r.startedAt, alive: pidAlive(r.processPid) })
    }
  }
  // 休息区八卦：上班时间、空闲（不在跑、没在等董事会、没暂停）的同事够两位就后台生成一段（不等它）
  const w = world()
  const waitingAgents = new Set(issueList.filter((i) => ['in_review', 'blocked'].includes(i.status)).map((i) => i.assigneeAgentId))
  const names = readNames()
  const idle = agents.filter((a) => a.status === 'idle' && !liveRun.has(a.id) && !waitingAgents.has(a.id)).map((a) => ({ id: a.id, name: names[a.id] || a.name, title: a.title }))
  if (!gaps.some(gap => gap.source === 'runs')) gossip.maybeGenerate({ onDuty: !!(w.duty && w.duty.on), people: idle })
  stats.ingest({ runs, activity })
  const daily = stats.daily()
  const out = {
    at: new Date().toISOString(),
    telegram: telegram.view(),
    committee: committee.view(),
    standup: standup.view(),
    voteSessions: voteSessions(agents),
    acceptance: acceptance.view(),
    blockedPatrol: patrol.view(),
    rework: rework.view(),
    handoff: handoff.view(),
    memory: mem.view(),
    chat: chat.summary(),
    workload: workload.view(),
    gossip: gossip.recent(),
    awards: stats.awards(),
    schedule: scheduleCache,
    meetings: await buildMeetings(activity),
    agents: agents
      .filter((a) => a.status !== 'terminated' && a.status !== 'pending_approval') // 招聘还没批准的不进办公室
      .map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        status: a.status,
        adapter: a.adapterType,
        model: (a.adapterConfig && a.adapterConfig.model) || null,
        task: byAgent.get(a.id) || null,
        lastRun: lastRun.get(a.id) || null,
        liveRun: liveRun.get(a.id) || null,
      })),
    waiting: await buildWaiting(activity, issueList),
    assigned: issueList.filter((i) => i.assigneeAgentId).map((i) => ({ id: i.identifier, issueId: i.id, projectId: i.projectId || null, title: i.title, status: i.status, agentId: i.assigneeAgentId, at: i.updatedAt })),
    tasks: dash.tasks,
    costs: dash.costs,
    pendingApprovals: dash.pendingApprovals,
    approvals: (approvals || []).map((a) => ({
      id: a.id, type: a.type, title: (a.payload && a.payload.title) || a.type, at: a.createdAt,
      summary: String((a.payload && (a.payload.summary || a.payload.description || a.payload.reason)) || '').slice(0, 3000),
      agentId: a.requestedByAgentId || null,
    })),
    actToken: ACT_TOKEN,
    names: readNames(),
    projects: projectsCache,
    world: world(),
    events: await buildEvents(activity, approvalsAll),
  }
  Object.defineProperty(out, '_schedulerSource', {
    value: {
      at: out.at,
      schedulerTasks: issueList.concat(backlog),
      schedulerAgents: agents,
    },
    enumerable: false,
  })
  if (CONTRACT_VIEW_ENABLED) {
    const contractTasks = issueList.concat(backlog).map((task) => ({
      id: task.id,
      identifier: task.identifier || task.id,
      status: task.status,
      projectId: task.projectId || null,
      description: task.description || '',
      assignee: task.assigneeAgentId || '',
    }))
    out.contractView = summarizeContracts(contractTasks, { now: Date.now() })
  }
  if (gaps.some(gap => gap.source === 'approvalsAll')) out.events = out.events.filter(event => !['submit_to_board', 'board_decision'].includes(event.kind))
  try { ledger.ingest(out.events) } catch (e) { console.log('[ledger] 记账失败：' + String((e && e.message) || e)) } // 账本出错只记日志，不影响 /state
  try { out.ledger = ledger.view() } catch { out.ledger = { enabled: true, date: null, count: 0, capped: false, since: null, firstAt: null, corrupt: 0 } }
  try {
    const h = await healthReport()
    out.healthLevel = { level: h.level, text: h.text }
    if (h.stale) out.healthLevel.stale = h.stale
  } catch {
    out.healthLevel = { level: 'warn', text: '健康数据暂不可用' }
  }
  out.today = computeToday({ now: out.at, doneLedger: daily.done, assigned: issueList.concat(backlog), waiting: out.waiting, runsToday: daily, projects: projectsCache, duty: out.world.duty })
  if (gaps.length) {
    out.gaps = gaps
    const missing = name => gaps.some(gap => gap.source === name)
    const unknown = { value: null, reason: 'UPSTREAM_UNAVAILABLE' }
    if (missing('runs')) out.today.runs = { total: unknown, succeeded: unknown, failed: unknown }
    if (missing('activity')) {
      out.today.done = out.today.total = out.today.percent = out.today.comments = out.today.waiting = unknown
      out.today.decisions = { approved: unknown, rejected: unknown }
      out.today.byProject = []
      out.awards = []
    }
    if (missing('backlog')) out.today.backlog = unknown
  }
  acceptance.onState(out.waiting, out.world && out.world.duty && out.world.duty.on)
  telegram.onState(out, { daily: () => stats.daily() }).catch(() => {}) // 通知在后台发，不拖慢页面
  commandLive.capture(out)
  return out
  })
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      const json = (code, obj) => res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify(obj))
      const authRoute = tenancy.auth.router.match(req.method, url.pathname)
      if (!hostOk(req.headers.host)) return json(403, { error: '只允许本机地址或局域网 IP 访问' }) // 防 DNS 重绑定偷读令牌
      const addr = req.socket.remoteAddress || ''
      const lanUser = !isLoop(addr)
      if (WALL.enabled && url.pathname === '/wall' && url.searchParams.has('k')) { // 兑换大屏令牌：设 cookie 后跳到干净的地址（令牌不留在地址栏）
        const now = Date.now(), tries = (loginTries.get('wall:' + addr) || []).filter((t) => now - t < 5 * 60000)
        if (tries.length >= 8) return res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' }).end('试得太多了，请稍后再试')
        if (!same(url.searchParams.get('k'), WALL.token)) { tries.push(now); loginTries.set('wall:' + addr, tries); return res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('大屏链接不对或已作废') }
        return res.writeHead(303, { Location: '/wall', 'Set-Cookie': `office_wall=${WALL_COOKIE}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` }).end()
      }
      let wallScope = false
      if (lanUser) { // 局域网设备：先过访问码
        if (!LAN.enabled) return json(403, { error: '局域网访问已关闭' })
        if (req.method === 'POST' && url.pathname === '/lan-login') {
          const now = Date.now(), tries = (loginTries.get(addr) || []).filter((t) => now - t < 5 * 60000)
          if (tries.length >= 6) return res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' }).end(loginPage('试得太多了，请 5 分钟后再试'))
          tries.push(now); loginTries.set(addr, tries)
          let raw = ''
          for await (const chunk of req) { raw += chunk; if (raw.length > 2048) break }
          const code = new URLSearchParams(raw).get('code') || ''
          if (!same(code.trim(), LAN.code)) return res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }).end(loginPage('访问码不对'))
          console.log(`[lan] ${addr} 登录成功`)
          return res.writeHead(303, { Location: '/', 'Set-Cookie': `office_lan=${LAN_COOKIE}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` }).end()
        }
        if (!lanAuthed(req)) {
          if (WALL.enabled && wallAuthed(req)) wallScope = true // 只有大屏令牌：最小权限
          else if (!authRoute) return res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(loginPage())
        }
      }
      if (wallScope && (req.method !== 'GET' || ((API_PATHS.has(url.pathname) || authRoute) && !['/state', '/wall/data'].includes(url.pathname)))) return json(403, { error: '大屏链接只能看大屏，不能做别的' })
      if (lanUser && ['/chat', '/chat/summary'].includes(url.pathname)) return json(403, { error: '对话内容只允许在运行服务的电脑上查看' })
      if (url.pathname === '/town-nav-config.js') {
        if (req.method !== 'GET') return json(405, { error: '不支持' })
        return res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(TOWN_NAV_CLIENT)
      }
      if (url.pathname === '/command-view' || url.pathname === '/command-view/scenarios') {
        const input = { method: req.method, path: url.pathname, query: url.search, wallScope, now: Date.now(), principal: !lanUser && !wallAuthed(req) ? 'local_full' : 'restricted' }
        const reply = await commandLive.handle(input) || commandViewRoutes?.handle(input)
        if (commandViewConfig.enabled === true && commandViewConfig.live?.enabled === true && url.searchParams.has('taskId')) console.log('[command-live] ' + JSON.stringify(commandLive.metrics()))
        return json(reply?.status ?? 404, reply?.body ?? { error: 'NOT_FOUND' })
      }
      if (url.pathname.startsWith('/town/home/')) {
        let rawBody = ''
        let bodyTooLarge = false
        if (req.method === 'POST') {
          for await (const chunk of req) {
            rawBody += chunk
            if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) {
              bodyTooLarge = true
              break
            }
          }
        }
        const reply = await homeRoutes.handle({
          method: req.method,
          path: url.pathname,
          remoteAddress: addr,
          lanUser,
          wallScope,
          host: req.headers.host,
          origin: req.headers.origin,
          isLoopback: isLoop,
          hostOk,
          originOk,
          contentType: req.headers['content-type'],
          homeToken: req.headers['x-home-token'],
          rawBody,
          bodyTooLarge,
          now: Date.now,
        })
        if (reply) return json(reply.status, reply.body)
      }
      if (req.method === 'POST' && url.pathname === '/act') {
        // 只接受本页面发来的请求：Host 与 Origin 都必须是本机地址，并带上 /state 下发的令牌
        const origin = req.headers.origin
        if (lanUser && !LAN.write) return json(403, { error: '局域网访问是只读的：要审批、派任务请在运行服务的那台电脑上操作' })
        if (!hostOk(req.headers.host) || (origin && !originOk(origin)) || req.headers['x-office-token'] !== ACT_TOKEN) return json(403, { error: '拒绝：来源或令牌不对' })
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(415, { error: '只接受 JSON' })
        let raw = ''
        for await (const chunk of req) {
          raw += chunk
          if (raw.length > 64 * 1024) return json(413, { error: '内容太长' })
        }
        let body
        try { body = JSON.parse(raw) } catch { return json(400, { error: 'JSON 格式不对' }) }
        try {
          const result = await act(body)
          console.log(`[act] ${body.type} ${body.decision || ''} ${body.issueId || body.id || ''}`)
          const exposeResult = body.type.startsWith('tg_') || body.type.startsWith('committee_') || body.type.startsWith('standup_') || body.type.startsWith('acceptance_') || body.type.startsWith('blocked_') || body.type.startsWith('rework_') || body.type.startsWith('handoff_') || body.type.startsWith('memory_') || body.type.startsWith('workload_') || body.type.startsWith('chat_') || body.type.startsWith('foyer_') || (body.type === 'create_issue' && CONTRACT_VIEW_ENABLED)
          return json(200, { ok: true, result: result && exposeResult ? result : undefined })
        } catch (e) {
          return json(e.status || 502, { error: String(e.message || e) })
        }
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/town/map') {
        const reply = townMap.handle({ method: req.method, ifNoneMatch: req.headers['if-none-match'], redactOffice: lanUser || wallScope })
        res.writeHead(reply.status, reply.headers)
        return res.end(reply.body)
      }
      if (req.method === 'GET' && url.pathname === '/platform/tenancy') {
        if (lanUser) return json(403, { error: '多租户平台状态只允许在运行服务的电脑上查看' })
        return json(200, tenancy.platformView())
      }
      if (authRoute) {
        const reply = await tenancy.auth.router.handle(req, url, { remoteAddress: addr, hostOk, originOk })
        if (reply) return res.writeHead(reply.status, reply.headers).end(reply.body)
      }
      if (req.method !== 'GET' && !(req.method === 'HEAD' && url.pathname === '/town/map')) return json(405, { error: '不支持' })
      if (url.pathname === '/wall/data') return json(200, await wallData(lanUser || wallScope))
      if (url.pathname === '/kb') return json(200, kbList())
      if (url.pathname === '/kb/doc') {
        const doc = kbDoc(url.searchParams.get('path') || '')
        return doc ? json(200, doc) : json(404, { error: '没有这篇' })
      }
      if (url.pathname === '/daily') {
        const d = url.searchParams.get('date') || undefined
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return json(400, { error: '日期格式不对' })
        return json(200, stats.daily(d))
      }
      if (url.pathname === '/health') return json(200, await healthReport())
      if (url.pathname === '/workload') return json(200, workload.reportView(url.searchParams.get('days') === '7' ? 7 : 14))
      if (url.pathname === '/chat/summary') return json(200, chat.summary())
      if (url.pathname === '/chat') return json(200, await chat.view(url.searchParams.get('agent') || ''))
      if (req.method === 'GET' && url.pathname === '/blocked/preview') return json(200, await patrol.preview())
      if (req.method === 'GET' && url.pathname === '/memory/preview') return json(200, await mem.preview(url.searchParams.get('issue')))
      if (url.pathname === '/governance') {
        const rawDays = Number(url.searchParams.get('days') || 30)
        const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(90, Math.floor(rawDays))) : 30
        const currentMembers = (committee.view() || {}).members || []
        return json(200, buildGovernance({ days, currentMembers, standup: readGovernanceFile('standup.json'), committee: readGovernanceFile('committee.json'), acceptance: readGovernanceFile('acceptance.json'), rework: rework.view(), version: evidenceVersion.view(), handoff: handoff.view() }))
      }
      if (url.pathname === '/scheduler/suggest') {
        if (!SCHEDULER_VIEW_ENABLED) return json(404, { error: 'not found' })
        try {
          const st = await state()
          const cacheKey = `enabled:${SCHEDULER_VIEW_ENABLED}`
          const now = Date.now()
          let cached = false
          if (schedulerLazyCache.key === cacheKey && now - schedulerLazyCache.at < 60 * 1000) cached = true
          if (!cached) {
            const source = st._schedulerSource || st
            schedulerLazyCache = {
              key: cacheKey,
              at: now,
              tasks: await schedulerEnrichRows(source.schedulerTasks || []),
              completed: await schedulerCompletedRows(),
            }
          }
          const result = suggestScheduler({
            ...(st._schedulerSource || st),
            schedulerTasks: schedulerLazyCache.tasks,
            schedulerCompletedTasks: schedulerLazyCache.completed,
          }, { now, dataAt: schedulerLazyCache.at })
          result.cached = cached
          result.dataAgeMs = Math.max(0, now - schedulerLazyCache.at)
          schedulerDecisionRecords.push(...decisionRecords(result, st.at))
          if (schedulerDecisionRecords.length > 100) schedulerDecisionRecords.splice(0, schedulerDecisionRecords.length - 100)
          return json(200, result)
        } catch {
          return json(500, { error: '调度建议读取失败' })
        }
      }
      if (url.pathname === '/contract-view') {
        if (!CONTRACT_VIEW_ENABLED) return json(404, { error: 'not found' })
        const st = await state()
        return json(200, st.contractView || summarizeContracts([], { now: Date.now() }))
      }
      if (url.pathname === '/backlog') {
        // 某个项目的待排期任务（派发面板用）；资金类任务打标，页面据此限制可选的负责人
        const pid = url.searchParams.get('projectId') || ''
        if (!UUID.test(pid)) return json(400, { error: 'projectId 不对' })
        const list = await get(`/api/companies/${COMPANY}/issues?status=backlog&projectId=${pid}`)
        const items = (Array.isArray(list) ? list : list.issues || []).filter((i) => i.projectId === pid)
        return json(200, items.map((i) => ({
          id: i.id,
          identifier: i.identifier,
          title: i.title,
          money: MONEY_RE.test(i.description || ''),
          priority: i.priority,
          ...(SCHEDULER_VIEW_ENABLED ? { createdAt: i.createdAt || null } : {}),
        })))
      }
      if (url.pathname === '/issue') {
        const id = url.searchParams.get('id') || ''
        if (!UUID.test(id)) return json(400, { error: 'id 不对' })
        return json(200, await issueDetail(id))
      }
      if (url.pathname === '/state') {
        let st
        try { st = await state() } catch (error) {
          return json(503, { error: 'STATE_UNAVAILABLE_NO_SNAPSHOT', reason: 'UPSTREAM_UNAVAILABLE' })
        }
        st.foyer = foyer.summary() // S1-2：前厅摘要（无哈希、无逐设备信息、无 IP / UA）
        if (lanUser) { st.lan = true; if (!LAN.write) st.actToken = '' } // 局域网设备：不下发操作令牌
        if (lanUser && !LAN.write && st.memory) st.memory = redactState({ memory: st.memory }).memory
        const restricted = lanUser || wallScope
        const view = restricted ? { ...st, world: restrictedWorld(st.world) } : st
        const body = JSON.stringify(wallScope ? redactState(view) : view)
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(body)
        return
      }
      if (url.pathname === '/replay') {
        // 今日精彩回放（只读，数据来自事件账本）：缺省为今天；日期非法 400；没有记录返回 available:false 与空数组，不是错误
        const date = parseReplayDate(url.searchParams.get('date'))
        if (!date) return json(400, { error: '日期格式不对' })
        const day = ledger.readDay(date)
        const available = day.records.length > 0
        return json(200, {
          date,
          from: `${date}T00:00:00+07:00`,
          to: `${date}T23:59:59+07:00`,
          available,
          events: day.records.map((e) => ({ at: e.at, kind: e.kind, from: e.from, to: e.to, ref: e.ref, text: redactText(e.text || '') })), // 返回前再脱敏一遍
          gaps: available ? computeGaps(day.records, dutyConfig(world())) : [],
          counts: countKinds(day.records),
          firstRecordAt: day.firstAt,
        })
      }
      if (url.pathname === '/collab') {
        // 协作关系图（只读，数据来自事件账本）：window 最近 7 / 14 上班日或全部；kinds 逗号分隔的 dispatch/report/speak 子集。
        // 挂在访问控制之后、静态回退之前；大屏令牌设备经 API_PATHS 直接被拦 403。账本或本模块出错只记日志，不影响 /state。
        const winRaw = url.searchParams.get('window') || '14'
        if (!['7', '14', 'all'].includes(winRaw)) return json(400, { error: 'window 只能是 7 / 14 / all' })
        const rawKinds = (url.searchParams.get('kinds') || '').split(',').map((s) => s.trim()).filter(Boolean)
        const kinds = rawKinds.length ? [...new Set(rawKinds)] : ['dispatch', 'report', 'speak']
        if (kinds.length === 0 || kinds.some((k) => !['dispatch', 'report', 'speak'].includes(k))) return json(400, { error: 'kinds 只能包含 dispatch / report / speak' })
        try {
          const rawAgents = await get(`/api/companies/${COMPANY}/agents`)
          const agents = Array.isArray(rawAgents) ? rawAgents : rawAgents.agents || []
          const names = readNames()
          // 节点 = 25 个有座岗位（agent.name 即 SEAT 键，分组沿 office-layout.js 的房间）+ 董事会
          const idToName = new Map(agents.map((a) => [a.id, a.name]))
          const nodes = agents.filter((a) => a.name && SEAT_GROUPS[a.name]).map((a) => ({ id: a.name, name: names[a.id] || a.name, group: SEAT_GROUPS[a.name] }))
          nodes.push({ id: 'board', name: '董事会', group: 'board' })
          const toNodeId = (x) => (x == null ? null : x === 'board' ? 'board' : idToName.get(x) || x)
          const allDays = ledgerDayFiles(HERE)
          // T12b：窗口 = 最近 n 个上班日（含今天——若今天是上班日且今天有至少一条账本事件），
          // selectWindowDays 返回 { workdays, workdayCount, partialToday }；window=all 走全量 + partialToday。
          const duty = dutyConfig(world()) // { timezone, days, start, end }；无作息时退化为账本最近 n 天
          const winSel = winRaw === 'all'
            ? selectWindowDays({ allDays, nowMs: Date.now() })
            : selectWindowDays({ allDays, nowMs: Date.now(), n: winRaw === '7' ? 7 : 14, dutyDays: duty ? duty.days : null })
          const windowDays = winSel.workdays
          const records = []
          for (const d of windowDays) {
            try { for (const r of ledger.readDay(d).raw) records.push(r) } catch (e) { console.log('[collab] 读账本失败（' + d + '）：' + String((e && e.message) || e)) }
          }
          const mapped = records.map((r) => ({ ...r, from: toNodeId(r.from), to: r.to ? toNodeId(r.to) : null }))
          const result = buildCollab({
            records: mapped,
            nodes,
            kinds,
            window: { kind: winRaw, workdays: windowDays, from: windowDays[0] || null, to: windowDays.at(-1) || null, workdayCount: winSel.workdayCount, partialToday: winSel.partialToday },
          })
          return json(200, result)
        } catch (e) {
          console.log('[collab] 生成协作关系图失败：' + String((e && e.message) || e))
          return json(500, { error: '协作关系图读取失败', notes: ['服务端读取失败，请稍后再试'] })
        }
      }
      if (url.pathname === '/rework') {
        // 返工巡检（只读，数据来自 rework.json）：退回到第 N 轮、未关闭 R 项；超限的被挡住晨会 / 自动验收，等董事会决定。
        return json(200, rework.view())
      }
      if (url.pathname === '/handoff') {
        // 断点交接包（只读，见 handoff.mjs）：这里是「下一轮计划怎么处理」的预览——哪些任务的负责人没写交接包、现在已经冒出中断 / 阻塞 / 换人 / 长停留，
        // 以及交接包缺哪些字段、是否已提醒 / 转交、对象版本是否可能过期。只读不改状态；大屏令牌设备经 API_PATHS 直接被拦 403。
        return json(200, await handoff.preview())
      }
      if (url.pathname === '/evidence-version') {
        // 验收证据版本核对（只读）：把【验收证据】块里的对象版本（git 提交 / sha256）与当前实际版本逐条只读核对。
        // 带 ?issue= 核对单个任务；不带则核对当前「待验收」批次（state().waiting 里 kind=review 的项）。enabled:false 时返回 {disabled:true}。
        // 挂在访问控制之后、静态回退之前；大屏令牌设备经 API_PATHS 直接被拦 403。
        const ident = (url.searchParams.get('issue') || '').trim()
        try {
          if (ident) {
            const r = await evidenceVersion.checkByIdent(ident)
            if (!r) return json(404, { error: '没找到这个任务' })
            return json(200, r)
          }
          const st = await state()
          const waiting = (st.waiting || []).filter((w) => w.kind === 'review' && w.issueId).map((w) => w.issueId)
          const items = []
          for (const id of waiting) {
            try {
              const r = await evidenceVersion.checkByIdent(id)
              if (r && !r.disabled) items.push(r)
            } catch (e) {
              console.log('[evidence-version] 批量核对失败（' + id + '）：' + String((e && e.message) || e))
              items.push({ issueId: id, result: '无法核对（核对接口失败）', note: String((e && e.message) || e).slice(0, 120) })
            }
          }
          return json(200, { items })
        } catch (e) {
          console.log('[evidence-version] 核对失败：' + String((e && e.message) || e))
          return json(500, { error: '版本核对失败' })
        }
      }
      if (url.pathname === '/foyer') {
        // 前厅只读摘要（见 foyer.mjs）：访客计数 + 当前公告。局域网只读设备可读；大屏令牌设备经 API_PATHS 已在访问控制处 403。
        return json(200, foyer.summary())
      }
      if (url.pathname === '/foyer/visitors') {
        // 逐设备明细只给本机（每条只给摘要前 8 位，不给完整摘要）；局域网和大屏设备一律 403
        if (lanUser) return json(403, { error: '逐设备明细只允许在运行服务的电脑上查看' })
        return json(200, foyer.visitors())
      }
      let rel = decodeURIComponent(url.pathname)
      if (rel === '/') rel = '/index.html'
      if (rel === '/wall') rel = '/wall.html'
      if (rel === '/town') rel = '/town.html'
      // S1-2 前厅访客登记：只在主页面 HTML（index.html / wall.html）的已鉴权响应上计数，复用现有鉴权变量、不改任何鉴权判断
      if (rel === '/index.html' || rel === '/wall.html') {
        let visitorKind = null
        if (lanUser && lanAuthed(req)) visitorKind = 'lan' // 局域网设备：已过访问码
        else if (wallScope) visitorKind = 'wall' // 大屏令牌设备
        if (visitorKind) { // 本机（lanUser=false）不计；未鉴权的已在访问控制处被拦下
          const tr = foyer.touch({ kind: visitorKind, cookieValue: cookieOf(req, 'office_visitor') })
          if (tr.setCookie) res.setHeader('Set-Cookie', tr.setCookie)
        }
      }
      if (!staticOk(rel)) return res.writeHead(404).end('not found')
      const file = path.resolve(HERE, '.' + rel)
      if (!file.startsWith(HERE + path.sep)) {
        res.writeHead(403).end('forbidden')
        return
      }
      fs.readFile(file, (err, data) => {
        if (err) return res.writeHead(404).end('not found')
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data)
      })
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e) }))
    }
  })
  .listen(PORT, LAN.enabled ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`办公室 3D: http://127.0.0.1:${PORT}/  （数据来自 ${PAPERCLIP}；页面内操作只走 POST /act，需令牌）`)
    if (LAN.enabled) {
      const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal && PRIVATE_IP.test(i.address)).map((i) => i.address)
      try { fs.writeFileSync(WALL_FILE, JSON.stringify({ enabled: WALL.enabled, token: WALL.token, urls: ips.map((ip) => `http://${ip}:${PORT}/wall?k=${WALL.token}`), note: '大屏链接：在投屏的浏览器里打开 urls 里的地址（局域网 IP 那个）。换掉 token 再重启 = 作废旧链接；enabled 改 false = 关闭大屏链接。' }, null, 2)) } catch {}
      console.log(`大屏链接已写入 ${WALL_FILE}（本机可用 http://127.0.0.1:${PORT}/wall 直接预览）`)
      console.log(`局域网：${ips.map((ip) => `http://${ip}:${PORT}/`).join('  ') || '（没有找到私网地址）'}  访问码在 ${LAN_FILE} 里；局域网设备${LAN.write ? '可以操作（write: true）' : '只读'}`)
    }
  })
