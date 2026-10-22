import crypto from 'node:crypto'
import fs from 'node:fs'

const ROUTES = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: '/app.js' },
  { method: 'GET', path: '/town.html' },
  { method: 'GET', path: '/town/map' },
  { method: 'GET', path: '/wall' },
  { method: 'GET', path: '/foyer' },
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/state' },
  { method: 'GET', path: '/auth/session' },
  { method: 'GET', path: '/c/zhixu/auth/session' },
  { method: 'GET', path: '/c/zhixu/whoami' },
  { method: 'POST', path: '/auth/login', body: { company: 'zhixu', username: 'snapshot', password: 'placeholder' } },
]

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function normalize(method, pathname, body) {
  if (pathname === '/foyer') return JSON.parse(body)
  if (pathname === '/health') {
    const data = JSON.parse(body)
    return {
      level: data.level,
      text: data.text,
      familyNames: Array.isArray(data.families) ? data.families.map((item) => item.family).sort() : [],
      agentCount: Array.isArray(data.agents) ? data.agents.length : 0,
      incidentCount: Array.isArray(data.incidents) ? data.incidents.length : 0,
      nextStandupWarning: !!data.nextStandup?.warning,
    }
  }
  if (pathname === '/state') {
    const data = JSON.parse(body)
    return {
      keys: Object.keys(data).sort(),
      healthLevel: data.healthLevel,
      foyer: data.foyer,
      schedule: data.schedule,
      hasActToken: !!data.actToken,
      workloadEnabled: !!data.workload?.enabled,
      chatEnabled: !!data.chat?.enabled,
      handoffEnabled: !!data.handoff?.enabled,
      reworkEnabled: !!data.rework?.enabled,
      worldKeys: data.world && typeof data.world === 'object' ? Object.keys(data.world).sort() : [],
    }
  }
  return { bodySha256: sha(body) }
}

function pickHeaders(headers) {
  const out = {}
  for (const key of ['content-type', 'cache-control', 'etag', 'x-content-type-options']) if (headers.get(key)) out[key] = headers.get(key)
  return out
}

async function capture(baseUrl) {
  const routes = []
  for (const route of ROUTES) {
    const init = {
      method: route.method,
      headers: { Host: 'office.localhost:3200' },
    }
    if (route.body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(route.body)
    }
    const res = await fetch(baseUrl + route.path, init)
    const body = await res.text()
    const normalized = normalize(route.method, route.path, body)
    routes.push({
      method: route.method,
      path: route.path,
      status: res.status,
      headers: pickHeaders(res.headers),
      bodySha256: sha(JSON.stringify(normalized)),
      normalized,
    })
  }
  return {
    capturedAt: new Date().toISOString(),
    note: 'Pruned volatile fields: /health.at,nextStandup time details,/state.at and dynamic counters/full payloads; static, auth probes and town map routes use full body hash.',
    routes,
  }
}

const output = process.argv[2]
if (!output) throw new Error('usage: node tools/tenancy-snapshot.mjs <output.json> [baseUrl]')
const baseUrl = process.argv[3] || 'http://127.0.0.1:3200'
const result = await capture(baseUrl)
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(`captured ${result.routes.length} routes -> ${output}`)
