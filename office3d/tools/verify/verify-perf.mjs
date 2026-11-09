import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const root = path.resolve(value('--root') || path.resolve(import.meta.dirname, '..', '..'))
const place = value('--place') || 'drlife-office'
const requestedTier = value('--q') || 'all'
const isWarehouse = place.includes('drlife-warehouse')
const scene = isWarehouse ? 'warehouse' : 'office'
const tiers = requestedTier === 'all' ? ['high', 'low'] : [requestedTier]
if (!tiers.every(t => t === 'high' || t === 'low')) {
  console.error(JSON.stringify({ error: 'invalid --q; expected high, low, or all' }))
  process.exit(2)
}

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office3d-verify-perf-'))
const label = `verify-${scene}-${Date.now()}`
const runner = path.join(import.meta.dirname, 'qv1-measure.mjs')
const run = spawnSync(process.execPath, [runner, root, label, place, outputDir], { encoding: 'utf8', stdio: 'inherit' })
const jsonPath = path.join(outputDir, `${label}.json`)
if (run.error || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ scene, place, status: 'unable', step: 'measurement', reason: run.error?.message || `exit ${run.status}` }))
  process.exit(2)
}

const measured = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
if (run.status !== 0) {
  const blockedOn = Object.fromEntries(Object.entries(measured.tiers || {}).filter(([, sample]) => !sample.ready).map(([tier, sample]) => [tier, sample.blockedOn || []]))
  console.error(JSON.stringify({ scene, place, status: 'unable', step: 'measurement', reason: 'timeout_or_page_error', blockedOn, tiers: measured.tiers || {}, errors: measured.errors || [] }, null, 2))
  process.exit(2)
}
const budgets = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'budgets.json'), 'utf8'))[scene]
const result = {
  scene,
  place,
  tiers: {},
  errors: measured.errors || [],
  source: 'qv1-measure.mjs',
  root,
}
let over = false
let unable = result.errors.length > 0
for (const tier of tiers) {
  const sample = measured.tiers?.[tier]
  if (!sample || sample.ready === false) unable = true
  const median = sample?.median || sample?.renderer || {}
  const calls = Number(median.calls ?? 0)
  const triangles = Number(median.triangles ?? median.tris ?? 0)
  const budget = budgets[tier]
  const withinBudget = Boolean(sample?.ready) && calls <= budget.calls && triangles <= budget.triangles
  if (!withinBudget) over = true
  result.tiers[tier] = { ready: Boolean(sample?.ready), people: sample?.people || null, waitedMs: sample?.waitedMs || null, median: { calls, triangles }, budget, withinBudget }
}
console.log(JSON.stringify(result, null, 2))
if (unable) process.exit(2)
if (isWarehouse && over) process.exit(1)
