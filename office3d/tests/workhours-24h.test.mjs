import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { onDuty, nextChange } from '../../workhours/schedule.mjs'

const cfg = { timezone: 'Asia/Phnom_Penh', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '24:00' }

test('24-hour schedule is on duty all day and has no next transition', () => {
  for (const iso of ['2026-11-10T00:00:00+07:00', '2026-11-10T12:00:00+07:00', '2026-11-10T23:59:00+07:00']) assert.equal(onDuty(cfg, new Date(iso)), true)
  assert.equal(nextChange(cfg, new Date('2026-11-10T12:00:00+07:00')), null)
})

test('standup keeps an independent configured time instead of using workday start', () => {
  const source = fs.readFileSync(path.resolve('office3d/standup.mjs'), 'utf8')
  assert.match(source, /standup\?\.at/)
  assert.match(source, /DEFAULT_AT_MIN = 8 \* 60 \+ 35/)
  assert.doesNotMatch(source, /n\.min >= AT_MIN/)
})
