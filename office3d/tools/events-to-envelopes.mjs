import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromLedgerEvent, dedupe } from '../event-envelope.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EVENTS_DIR = path.resolve(HERE, '..', 'events')
const MAX_FILES = 3
const MAX_BYTES = 5 * 1024 * 1024
const sampleIndex = process.argv.indexOf('--sample')
const sampleLimit = sampleIndex >= 0 ? Math.max(0, Number(process.argv[sampleIndex + 1]) || 0) : 0

function readRecent() {
  if (!fs.existsSync(EVENTS_DIR)) return { files: [], records: [], failures: { no_events_dir: 1 } }
  const files = fs.readdirSync(EVENTS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort()
    .slice(-MAX_FILES)
  const records = []
  const failures = {}
  let bytes = 0
  for (const file of files) {
    const full = path.join(EVENTS_DIR, file)
    const stat = fs.statSync(full)
    if (stat.size > MAX_BYTES) {
      failures.file_too_large = (failures.file_too_large || 0) + 1
      continue
    }
    bytes += stat.size
    if (bytes > MAX_BYTES) {
      failures.total_too_large = (failures.total_too_large || 0) + 1
      break
    }
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/).filter(Boolean)) {
      try { records.push(JSON.parse(line)) } catch { failures.invalid_json = (failures.invalid_json || 0) + 1 }
    }
  }
  return { files, records, failures }
}

const input = readRecent()
const envelopes = []
const failures = { ...input.failures }
const eventTypes = {}
for (const record of input.records) {
  const result = fromLedgerEvent(record, { tenantId: 'zhixu', projectId: 'legacy-zhixu' })
  if (!result.ok) {
    for (const error of result.errors) failures[error.code] = (failures[error.code] || 0) + 1
    continue
  }
  envelopes.push(result.envelope)
  eventTypes[result.envelope.type] = (eventTypes[result.envelope.type] || 0) + 1
}
const unique = dedupe(envelopes)
const output = {
  files: input.files,
  total: input.records.length,
  success: envelopes.length,
  failed: input.records.length - envelopes.length,
  failures,
  deduped: unique.unique.length,
  conflicts: unique.conflicts.length,
  eventTypes,
}
if (sampleLimit > 0) output.sample = unique.unique.slice(0, sampleLimit)
process.stdout.write(JSON.stringify(output, null, 2) + '\n')
