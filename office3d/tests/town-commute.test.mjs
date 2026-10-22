import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_TRAVEL_MS,
  buildCommuteStates,
  commuteStateFor,
  localParts,
  nextOnDutyStart,
  parseWorkhoursLog,
} from '../town-commute.mjs'

const fixturePath = path.join(import.meta.dirname, 'fixtures', 'workhours-sample.log')
const fixtureText = fs.readFileSync(fixturePath, 'utf8')
const schedule = { timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '08:30', end: '17:30' }

function at(text) {
  return Date.parse(text)
}

function names(list) {
  return list.map((item) => item.agentName)
}

test('parseWorkhoursLog parses real lines, deduplicates exact repeats and tracks ignored metrics', () => {
  const result = parseWorkhoursLog(fixtureText, { nowMs: at('2026-10-20T12:00:00.000Z') })
  assert.equal(result.records.length, 15)
  assert.equal(result.rejected, 2)
  assert.equal(result.ignored, 3)
  assert.equal(result.errorsSeen, 1)
  assert.equal(result.records[0].id, 'wh:2026-10-19T10:37:42.780Z:clock_out:Lead')
  assert.equal(result.records.at(-1).id, 'wh:2026-10-20T10:30:57.344Z:clock_out:QAAutomation')
  assert.equal(result.records.every((record) => record.source === 'workhours.log'), true)
})

test('parseWorkhoursLog stays deterministic for shuffled inputs and stable ids', () => {
  const lines = fixtureText.trim().split(/\r?\n/)
  const shuffled = [lines[8], lines[2], lines[6], lines[1], lines[5], lines[7], lines[0]].join('\n')
  const original = parseWorkhoursLog(lines.slice(0, 9).join('\n'))
  const mixed = parseWorkhoursLog(shuffled)
  assert.deepEqual(
    mixed.records.map((record) => ({ id: record.id, at: record.at, kind: record.kind, agentName: record.agentName })),
    original.records.map((record) => ({ id: record.id, at: record.at, kind: record.kind, agentName: record.agentName })),
  )
})

test('parseWorkhoursLog rejects malformed names and ignores malformed lines', () => {
  const lines = [
    '',
    'not-a-timestamp 上班：恢复 Lead',
    '2026-10-20T10:00:00.000Z 上班：恢复 bad name',
    '2026-10-20T10:00:00.000Z 上班：恢复 bad/name',
    '2026-10-20T10:00:00.000Z 上班：恢复 Lead',
    `2026-10-20T10:00:00.000Z 上班：恢复 ${'A'.repeat(401)}`,
    '2026-10-20T10:00:00.000Z 无关：内容',
    '2026-10-20T10:00:00.000Z 出错：network',
  ].join('\n')
  const result = parseWorkhoursLog(lines)
  assert.equal(result.records.length, 1)
  assert.equal(result.rejected, 2)
  assert.equal(result.ignored, 4)
  assert.equal(result.errorsSeen, 1)
})

test('parseWorkhoursLog honours maxLines tail window', () => {
  const result = parseWorkhoursLog(fixtureText, { maxLines: 6 })
  assert.deepEqual(names(result.records), ['Localizer', 'QAAutomation'])
  assert.equal(result.rejected, 2)
  assert.equal(result.ignored, 1)
  assert.equal(result.errorsSeen, 1)
})

test('parseWorkhoursLog supports oversized text when caller only passes the tail', () => {
  const prefix = `${'x'.repeat(410)}\n`.repeat(7000)
  const tail = [
    '2026-10-20T10:30:57.307Z 下班：暂停 ReactSenior',
    '2026-10-20T10:30:57.315Z 下班：暂停 OpsEngineer',
  ].join('\n')
  const joined = prefix + tail
  const slice = joined.slice(-2 * 1024 * 1024)
  const trimmed = slice.includes('\n') ? slice.slice(slice.indexOf('\n') + 1) : slice
  const result = parseWorkhoursLog(trimmed)
  assert.deepEqual(names(result.records), ['ReactSenior', 'OpsEngineer'])
})

test('commuteStateFor returns at_office, leaving, in_town and arriving at the right boundaries', () => {
  const { records } = parseWorkhoursLog(fixtureText)
  const atOffice = commuteStateFor({ agentName: 'ReactSenior', records, nowMs: at('2026-10-20T08:00:00.000Z'), schedule })
  assert.equal(atOffice.state, 'at_office')
  assert.equal(atOffice.recordId, 'wh:2026-10-20T01:30:57.137Z:clock_in:ReactSenior')

  const leaving = commuteStateFor({ agentName: 'ReactSenior', records, nowMs: at('2026-10-20T10:40:00.000Z'), schedule })
  assert.equal(leaving.state, 'leaving')
  assert.equal(leaving.until, '2026-10-20T10:45:57.307Z')

  const inTown = commuteStateFor({ agentName: 'ReactSenior', records, nowMs: at('2026-10-20T12:00:00.000Z'), schedule })
  assert.equal(inTown.state, 'in_town')
  assert.equal(inTown.since, '2026-10-20T10:30:57.307Z')

  const arriving = commuteStateFor({ agentName: 'ReactSenior', records, nowMs: at('2026-10-21T01:20:00.000Z'), schedule })
  assert.equal(arriving.state, 'arriving')
  assert.equal(arriving.recordId, 'wh:2026-10-20T10:30:57.307Z:clock_out:ReactSenior')
  assert.equal(arriving.until, '2026-10-21T01:30:00.000Z')
})

test('commuteStateFor returns unknown for missing, stale or contradictory records', () => {
  const stale = [
    { id: 'old', at: '2026-10-01T00:00:00.000Z', atMs: at('2026-10-01T00:00:00.000Z'), kind: 'clock_out', agentName: 'Lead' },
  ]
  assert.equal(commuteStateFor({ agentName: 'Nobody', records: [], nowMs: at('2026-10-20T12:00:00.000Z') }).state, 'unknown')
  assert.equal(commuteStateFor({ agentName: 'Lead', records: stale, nowMs: at('2026-10-20T12:00:00.000Z') }).state, 'unknown')
  assert.equal(commuteStateFor({
    agentName: 'Lead',
    records: [
      { id: 'a', at: '2026-10-20T00:00:00.000Z', atMs: at('2026-10-20T00:00:00.000Z'), kind: 'clock_in', agentName: 'Lead' },
      { id: 'b', at: '2026-10-20T01:00:00.000Z', atMs: at('2026-10-20T01:00:00.000Z'), kind: 'clock_in', agentName: 'Lead' },
    ],
    nowMs: at('2026-10-20T02:00:00.000Z'),
  }).state, 'unknown')
})

test('commuteStateFor clamps travelMs and only uses arriving when next shift is known', () => {
  const records = [
    { id: 'out', at: '2026-10-20T10:30:00.000Z', atMs: at('2026-10-20T10:30:00.000Z'), kind: 'clock_out', agentName: 'Lead' },
  ]
  const defaulted = commuteStateFor({ agentName: 'Lead', records, nowMs: at('2026-10-20T10:31:00.000Z'), travelMs: -1, schedule })
  assert.equal(defaulted.until, '2026-10-20T10:45:00.000Z')

  const unknownSchedule = commuteStateFor({
    agentName: 'Lead',
    records,
    nowMs: at('2026-10-21T01:20:00.000Z'),
    travelMs: 5 * 60 * 60 * 1000,
    schedule: null,
  })
  assert.equal(unknownSchedule.state, 'in_town')
})

test('buildCommuteStates only emits requested agents and reports unknown log names', () => {
  const { records } = parseWorkhoursLog(fixtureText)
  const result = buildCommuteStates({
    records,
    agents: [{ name: 'ReactSenior' }, { name: 'OpsEngineer' }, { name: 'ReactSenior' }, { name: 'bad name' }],
    nowMs: at('2026-10-20T12:00:00.000Z'),
    schedule,
  })
  assert.deepEqual(result.states.map((item) => item.name), ['ReactSenior', 'OpsEngineer'])
  assert.equal(result.states[0].commute.state, 'in_town')
  assert.equal(result.unknownAgents.count, 7)
  assert.deepEqual(result.unknownAgents.sample, ['Frontend1', 'Lead', 'Localizer', 'PM', 'QAAutomation'])
})

test('localParts and nextOnDutyStart respect Phnom Penh day boundaries and weekday subsets', () => {
  const before = localParts(new Date('2026-10-20T16:59:00.000Z'), schedule.timezone)
  const after = localParts(new Date('2026-10-20T17:00:00.000Z'), schedule.timezone)
  assert.equal(before.day, 20)
  assert.equal(after.day, 21)

  const sunday = nextOnDutyStart(schedule, at('2026-10-24T12:00:00.000Z'))
  assert.equal(new Date(sunday).toISOString(), '2026-10-25T01:30:00.000Z')

  const weekdaysOnly = { ...schedule, days: [1, 2, 3, 4, 5] }
  const monday = nextOnDutyStart(weekdaysOnly, at('2026-10-24T12:00:00.000Z'))
  assert.equal(new Date(monday).toISOString(), '2026-10-26T01:30:00.000Z')
})

test('zero-token static checks cover module and report script', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const moduleText = fs.readFileSync(path.join(root, 'town-commute.mjs'), 'utf8')
  const reportText = fs.readFileSync(path.join(root, 'tools', 'town-commute-report.mjs'), 'utf8')
  for (const [name, text] of [['town-commute.mjs', moduleText], ['town-commute-report.mjs', reportText]]) {
    for (const bad of [/\bfetch\s*\(/, /\bsend\s*\(/, /chat_to_task/, /ollama/i, /anthropic/i, /openai/i, /\/api\/companies\//, /\bPOST\b/, /child_process/, /\beval\s*\(/, /new Function/, /Math\.random/]) {
      assert.doesNotMatch(text, bad, `${name} ${bad}`)
    }
  }
})

test('report script reads real files without mutating workhours directory', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'town-commute-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }))

  const officeDir = path.join(dir, 'office3d')
  const workhoursDir = path.join(dir, 'workhours')
  fs.mkdirSync(path.join(officeDir, 'tools'), { recursive: true })
  fs.mkdirSync(workhoursDir, { recursive: true })
  fs.copyFileSync(path.join(path.resolve(import.meta.dirname, '..'), 'tools', 'town-commute-report.mjs'), path.join(officeDir, 'tools', 'town-commute-report.mjs'))
  fs.copyFileSync(path.join(path.resolve(import.meta.dirname, '..'), 'town-commute.mjs'), path.join(officeDir, 'town-commute.mjs'))
  fs.writeFileSync(path.join(officeDir, 'workload.json'), JSON.stringify({
    agents: {
      a: { name: 'ReactSenior' },
      b: { name: 'OpsEngineer' },
      c: { name: 'Ghost' },
    },
  }, null, 2))
  fs.writeFileSync(path.join(workhoursDir, 'workhours.json'), JSON.stringify(schedule, null, 2))
  fs.writeFileSync(path.join(workhoursDir, 'workhours.log'), fixtureText)
  const beforeMtime = fs.statSync(path.join(workhoursDir, 'workhours.log')).mtimeMs

  const proc = await import('node:child_process')
  const output = await new Promise((resolve, reject) => {
    proc.execFile(
      process.execPath,
      [path.join(officeDir, 'tools', 'town-commute-report.mjs')],
      {
        cwd: officeDir,
        env: {
          ...process.env,
          TOWN_COMMUTE_WORKLOAD_FILE: path.join(officeDir, 'workload.json'),
          TOWN_COMMUTE_LOG_FILE: path.join(workhoursDir, 'workhours.log'),
          TOWN_COMMUTE_SCHEDULE_FILE: path.join(workhoursDir, 'workhours.json'),
          TOWN_COMMUTE_NOW: '2026-10-20T12:00:00.000Z',
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }
        resolve(stdout)
      },
    )
  })

  assert.match(output, /records=15 rejected=2 ignored=3 errorsSeen=1/)
  assert.match(output, /ReactSenior\tin_town\twh:2026-10-20T10:30:57\.307Z:clock_out:ReactSenior/)
  assert.match(output, /Ghost\tunknown\t-\t-/)
  assert.match(output, /unknownAgents=7 sample=Frontend1, Lead, Localizer, PM, QAAutomation/)
  assert.equal(fs.statSync(path.join(workhoursDir, 'workhours.log')).mtimeMs, beforeMtime)
})
