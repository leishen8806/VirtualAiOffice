const DEFAULT_TRAVEL_MS = 15 * 60 * 1000
const MAX_TRAVEL_MS = 2 * 60 * 60 * 1000
const STALE_MS = 7 * 24 * 60 * 60 * 1000
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/g

function clampTravelMs(value) {
  if (!Number.isFinite(value)) return DEFAULT_TRAVEL_MS
  const rounded = Math.floor(value)
  if (rounded <= 0) return DEFAULT_TRAVEL_MS
  return Math.min(rounded, MAX_TRAVEL_MS)
}

function localParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return {
    dow,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function hm(value) {
  const [hour, minute] = String(value || '').split(':').map(Number)
  return hour * 60 + minute
}

function onDuty(schedule, date = new Date()) {
  if (!schedule || !schedule.timezone || !Array.isArray(schedule.days)) return false
  const parts = localParts(date, schedule.timezone)
  return schedule.days.includes(parts.dow) && parts.minutes >= hm(schedule.start) && parts.minutes < hm(schedule.end)
}

function nextOnDutyStart(schedule, nowMs) {
  if (!schedule || !schedule.timezone || !Array.isArray(schedule.days)) return null
  const startMinute = hm(schedule.start)
  if (!Number.isFinite(startMinute)) return null
  const start = Math.floor(nowMs / 60000) * 60000
  for (let i = 1; i <= 14 * 24 * 60; i++) {
    const probe = new Date(start + i * 60000)
    const parts = localParts(probe, schedule.timezone)
    if (schedule.days.includes(parts.dow) && parts.minutes === startMinute) return probe.getTime()
  }
  return null
}

function stripControls(value) {
  return String(value || '').replace(CONTROL_RE, '').trim()
}

function sanitizeAgentName(value) {
  const cleaned = stripControls(value)
  if (!NAME_RE.test(cleaned)) return null
  return cleaned
}

function compareRecords(a, b) {
  return a.atMs - b.atMs || a.agentName.localeCompare(b.agentName, 'en') || a.kind.localeCompare(b.kind, 'en')
}

function unknownState() {
  return {
    state: 'unknown',
    since: null,
    recordId: null,
    until: null,
    note: '暂无通勤记录',
  }
}

export function parseWorkhoursLog(text, { nowMs = Date.now(), maxLines = Infinity } = {}) {
  const lines = String(text || '').split(/\r?\n/)
  const tail = Number.isFinite(maxLines) ? lines.slice(-Math.max(0, Math.floor(maxLines))) : lines
  const dedup = new Map()
  let rejected = 0
  let ignored = 0
  let errorsSeen = 0

  for (const rawLine of tail) {
    if (!rawLine) continue
    if (rawLine.length > 400) {
      ignored++
      continue
    }
    const splitAt = rawLine.indexOf(' ')
    if (splitAt <= 0) {
      ignored++
      continue
    }
    const at = rawLine.slice(0, splitAt)
    const message = rawLine.slice(splitAt + 1).trim()
    if (message.startsWith('出错：')) errorsSeen++
    if (!ISO_Z_RE.test(at)) {
      ignored++
      continue
    }
    const atMs = Date.parse(at)
    if (!Number.isFinite(atMs)) {
      ignored++
      continue
    }
    if (atMs > nowMs + 365 * 24 * 60 * 60 * 1000) {
      ignored++
      continue
    }

    let kind = null
    let rawName = null
    let match = message.match(/^上班：恢复\s+(.+)$/)
    if (match) {
      kind = 'clock_in'
      rawName = match[1]
    } else {
      match = message.match(/^下班：暂停\s+(.+)$/)
      if (match) {
        kind = 'clock_out'
        rawName = match[1]
      }
    }

    if (!kind) {
      ignored++
      continue
    }

    const agentName = sanitizeAgentName(rawName)
    if (!agentName) {
      rejected++
      continue
    }

    const id = `wh:${at}:${kind}:${agentName}`
    if (dedup.has(id)) continue
    dedup.set(id, {
      id,
      at,
      atMs,
      kind,
      agentName,
      source: 'workhours.log',
      line: rawLine,
    })
  }

  const records = [...dedup.values()].sort(compareRecords)
  return { records, rejected, ignored, errorsSeen }
}

export function commuteStateFor({ agentName, records, nowMs = Date.now(), schedule = null, travelMs = DEFAULT_TRAVEL_MS } = {}) {
  const cleanName = sanitizeAgentName(agentName)
  if (!cleanName) return unknownState()
  const normalizedTravelMs = clampTravelMs(travelMs)
  const list = Array.isArray(records) ? records.filter((record) => record?.agentName === cleanName).slice().sort(compareRecords) : []
  if (!list.length) return unknownState()
  for (let i = 1; i < list.length; i++) {
    if (list[i].kind === list[i - 1].kind) return unknownState()
  }

  let current = null
  for (const record of list) {
    if (!Number.isFinite(record?.atMs) || record.atMs > nowMs) break
    current = record
  }
  if (!current) return unknownState()
  if (nowMs - current.atMs > STALE_MS) return unknownState()

  if (current.kind === 'clock_in') {
    return {
      state: 'at_office',
      since: current.at,
      recordId: current.id,
      until: null,
      note: '',
    }
  }

  const leavingUntil = current.atMs + normalizedTravelMs
  if (nowMs < leavingUntil) {
    return {
      state: 'leaving',
      since: current.at,
      recordId: current.id,
      until: new Date(leavingUntil).toISOString(),
      note: '',
    }
  }

  const nextStartMs = nextOnDutyStart(schedule, nowMs)
  if (nextStartMs && nowMs >= nextStartMs - normalizedTravelMs && nowMs < nextStartMs) {
    return {
      state: 'arriving',
      since: current.at,
      recordId: current.id,
      until: new Date(nextStartMs).toISOString(),
      note: '',
    }
  }

  return {
    state: 'in_town',
    since: current.at,
    recordId: current.id,
    until: nextStartMs ? new Date(nextStartMs).toISOString() : null,
    note: '',
  }
}

export function buildCommuteStates({ records, agents, nowMs = Date.now(), schedule = null, travelMs = DEFAULT_TRAVEL_MS } = {}) {
  const normalizedTravelMs = clampTravelMs(travelMs)
  const items = []
  const knownNames = new Set()
  for (const agent of Array.isArray(agents) ? agents : []) {
    const cleanName = sanitizeAgentName(agent?.name)
    if (!cleanName || knownNames.has(cleanName)) continue
    knownNames.add(cleanName)
    items.push({
      name: cleanName,
      commute: commuteStateFor({ agentName: cleanName, records, nowMs, schedule, travelMs: normalizedTravelMs }),
    })
  }

  const extras = []
  const seenExtras = new Set()
  for (const record of Array.isArray(records) ? records : []) {
    const cleanName = sanitizeAgentName(record?.agentName)
    if (!cleanName || knownNames.has(cleanName) || seenExtras.has(cleanName)) continue
    seenExtras.add(cleanName)
    extras.push(cleanName)
  }
  extras.sort((a, b) => a.localeCompare(b, 'en'))

  return {
    states: items,
    unknownAgents: {
      count: extras.length,
      sample: extras.slice(0, 5),
    },
  }
}

export {
  DEFAULT_TRAVEL_MS,
  MAX_TRAVEL_MS,
  STALE_MS,
  clampTravelMs,
  localParts,
  nextOnDutyStart,
  onDuty,
  sanitizeAgentName,
}
