import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCommuteStates, parseWorkhoursLog } from '../town-commute.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DEFAULT_LOG_FILE = path.resolve(ROOT, '..', 'workhours', 'workhours.log')
const DEFAULT_SCHEDULE_FILE = path.resolve(ROOT, '..', 'workhours', 'workhours.json')
const DEFAULT_WORKLOAD_FILE = path.join(ROOT, 'workload.json')
const MAX_BYTES = 2 * 1024 * 1024

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readTailText(file, maxBytes = MAX_BYTES) {
  const stat = fs.statSync(file)
  const start = Math.max(0, stat.size - maxBytes)
  const handle = fs.openSync(file, 'r')
  try {
    const size = stat.size - start
    const buffer = Buffer.alloc(size)
    fs.readSync(handle, buffer, 0, size, start)
    let text = buffer.toString('utf8')
    if (start > 0) {
      const firstBreak = text.indexOf('\n')
      text = firstBreak >= 0 ? text.slice(firstBreak + 1) : ''
    }
    return text
  } finally {
    fs.closeSync(handle)
  }
}

function loadAgents(file) {
  const data = readJson(file)
  return Object.values(data?.agents || {})
    .map((agent) => ({ name: agent?.name }))
    .filter((agent) => typeof agent.name === 'string' && agent.name.trim())
}

function printLine(text = '') {
  process.stdout.write(text + '\n')
}

const nowMs = process.env.TOWN_COMMUTE_NOW ? Date.parse(process.env.TOWN_COMMUTE_NOW) : Date.now()
const logFile = process.env.TOWN_COMMUTE_LOG_FILE || DEFAULT_LOG_FILE
const scheduleFile = process.env.TOWN_COMMUTE_SCHEDULE_FILE || DEFAULT_SCHEDULE_FILE
const workloadFile = process.env.TOWN_COMMUTE_WORKLOAD_FILE || DEFAULT_WORKLOAD_FILE

const schedule = readJson(scheduleFile)
const agents = loadAgents(workloadFile)
const tailText = readTailText(logFile)
const parsed = parseWorkhoursLog(tailText, { nowMs })
const built = buildCommuteStates({ records: parsed.records, agents, nowMs, schedule })

printLine(`# town-commute-report ${new Date(nowMs).toISOString()}`)
printLine(`records=${parsed.records.length} rejected=${parsed.rejected} ignored=${parsed.ignored} errorsSeen=${parsed.errorsSeen}`)
for (const item of built.states) {
  const commute = item.commute
  printLine(`${item.name}\t${commute.state}\t${commute.recordId || '-'}\t${commute.since || '-'}\t${commute.until || '-'}`)
}
printLine(`unknown=${built.states.filter((item) => item.commute.state === 'unknown').length}`)
printLine(`unknownAgents=${built.unknownAgents.count} sample=${built.unknownAgents.sample.join(', ') || '-'}`)
