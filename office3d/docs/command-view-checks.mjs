import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluateDone } from '../done-rules.mjs'

export const STAGES = Object.freeze(['requirement_confirmed', 'claimed', 'executing', 'verifying', 'awaiting_acceptance', 'accepted', 'pending_verification'])
const REASONS = new Set([
  'STALE_DATA', 'DISCONNECTED', 'NOT_LOADED', 'NOT_APPLICABLE', 'UNKNOWN_TIME',
  'SYNTHETIC_DEMO', 'PARTIAL_PAGE', 'SOURCE_DISABLED', 'SOURCE_FAILED',
  'EVIDENCE_NOT_CONNECTED', 'NO_CONFIRMED_COST', 'COST_NOT_RETURNED',
  'USAGE_NOT_RETURNED', 'RUN_MODEL_NOT_RETURNED', 'NO_STATUS_TRANSITION',
  'NO_TEST_EVIDENCE', 'NO_ACCEPTANCE_EVIDENCE', 'NO_AUTHORIZATION_EVIDENCE',
  'NO_EXECUTION_EVIDENCE', 'NO_CHECKOUT_EVIDENCE', 'NO_CALL_EVIDENCE',
  'DEP_NOT_LOADED', 'DEP_UNKNOWN', 'OWNER_UNKNOWN', 'LEGACY_BASELINE',
])
const KEYS = new Set([
  'schemaVersion', 'generatedAt', 'dataAgeMs', 'mode', 'company', 'id', 'name',
  'scope', 'project', 'range', 'from', 'to', 'summary', 'tasks', 'running', 'accepted',
  'cost', 'currency', 'confirmedAmount', 'totalAmount', 'confirmedRuns',
  'unknownCostRuns', 'missingUsageRuns', 'observedRuns', 'lastUpdatedAt',
  'queue', 'taskId', 'projectId', 'title', 'rawStatus', 'stage', 'stageReason',
  'ownerId', 'blocker', 'nextHandler', 'entry', 'waitingSince', 'waitingMs',
  'progress', 'passed', 'total', 'evidence', 'value', 'reason',
  'relations', 'organization', 'dependencies', 'calls', 'items', 'complete',
  'type', 'source', 'confidence', 'execution', 'runId', 'agentId', 'status',
  'startedAt', 'finishedAt', 'model', 'modelSource', 'usage', 'family',
  'healthCategory', 'timeline', 'at', 'operator', 'quality', 'synthetic',
  'freshness', 'stale', 'maxAgeMs', 'animationAllowed', 'sources', 'ageMs',
  'gaps', 'writesAllowed', 'subjectVersion', 'records', 'kind', 'ok', 'actor',
  'ref', 'protectedTestsHash', 'executorActor', 'boardActors', 'riskClass',
])
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const iso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value))
const identityKeys = new Set(['id', 'taskId', 'projectId', 'runId', 'agentId', 'ownerId', 'nextHandler', 'project', 'from', 'to', 'actor', 'executorActor'])
const badKey = /token|secret|password|cookie|authorization|api.?key|address|email|phone|description|body|payload|processPid|stdout|stderr/i
const badValue = /Bearer\s+|sk-[A-Za-z0-9_-]{12,}|-----BEGIN|https?:\/\/|(?:\d{1,3}\.){3}\d{1,3}|[A-Z]:[\\/]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i
const realId = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\bCMP-\d+\b|\b[0-9a-f]{32,}\b/i

export function checkCommandView(data) {
  const errors = []
  const fail = (path, code) => errors.push(`${path}:${code}`)
  const reason = (value) => value === null || REASONS.has(value)
  const required = (value, keys, path) => {
    if (!object(value)) { fail(path, 'OBJECT_REQUIRED'); return }
    for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'REQUIRED')
  }
  const measure = (value, path, numeric = true) => {
    required(value, ['value', 'reason'], path)
    if (!object(value)) return
    if (value.value === null) {
      if (!REASONS.has(value.reason)) fail(path, 'UNKNOWN_REASON_REQUIRED')
    } else {
      if (numeric && !finite(value.value)) fail(path, 'NON_NEGATIVE_NUMBER_REQUIRED')
      if (value.reason !== null) fail(path, 'UNKNOWN_MUST_BE_NULL')
    }
  }
  const collection = (value, path) => {
    required(value, ['items', 'complete', 'reason'], path)
    if (!object(value)) return
    if (!Array.isArray(value.items)) fail(path, 'ARRAY_REQUIRED')
    if (typeof value.complete !== 'boolean') fail(path, 'COMPLETENESS_REQUIRED')
    if (value.complete === false && !REASONS.has(value.reason)) fail(path, 'INCOMPLETE_REASON_REQUIRED')
    if (value.complete === true && value.reason !== null) fail(path, 'COMPLETE_REASON_MUST_BE_NULL')
  }
  const walk = (value, path, parentKey = '') => {
    if (Array.isArray(value)) {
      if (value.length > 200) fail(path, 'ARRAY_LIMIT')
      value.forEach((item, index) => walk(item, `${path}[${index}]`, parentKey))
    } else if (object(value)) {
      if (Object.hasOwn(value, 'value')) measure(value, path, false)
      for (const [key, child] of Object.entries(value)) {
        if (badKey.test(key)) fail(`${path}.${key}`, 'SENSITIVE_KEY')
        if (!KEYS.has(key)) fail(`${path}.${key}`, 'UNKNOWN_KEY')
        if ((key === 'reason' || key === 'stageReason') && !reason(child)) fail(`${path}.${key}`, 'REASON_ENUM')
        walk(child, `${path}.${key}`, key === 'value' ? parentKey : key)
      }
    } else if (typeof value === 'string') {
      if ([...value].length > (parentKey === 'title' ? 80 : 160)) fail(path, 'TEXT_LIMIT')
      if (/[\u0000-\u001f\u007f]/.test(value) || badValue.test(value)) fail(path, 'SENSITIVE_VALUE')
      if (data?.mode === 'demo' && realId.test(value)) fail(path, 'REAL_IDENTIFIER_IN_DEMO')
      if (data?.mode === 'demo' && identityKeys.has(parentKey) && !iso(value) && !/^demo-[a-z0-9-]+$/.test(value)) fail(path, 'DEMO_IDENTIFIER_REQUIRED')
    } else if (typeof value === 'number' && !Number.isFinite(value)) fail(path, 'FINITE_NUMBER_REQUIRED')
  }
  required(data, ['schemaVersion', 'generatedAt', 'dataAgeMs', 'mode', 'company', 'scope', 'summary', 'queue', 'relations', 'execution', 'timeline', 'quality'], '$')
  if (!object(data)) return { ok: false, errors }
  walk(data, '$')
  if (data.schemaVersion !== 1) fail('schemaVersion', 'UNSUPPORTED_VERSION')
  if (!['live', 'replay', 'demo'].includes(data.mode)) fail('mode', 'MODE_ENUM')
  if (!iso(data.generatedAt)) fail('generatedAt', 'ISO_REQUIRED')
  measure(data.dataAgeMs, 'dataAgeMs')
  required(data.company, ['id', 'name'], 'company')
  required(data.scope, ['project', 'range'], 'scope')
  measure(data.scope?.project, 'scope.project', false)
  if (!iso(data.scope?.range?.from) || !iso(data.scope?.range?.to) ||
      Date.parse(data.scope?.range?.from) > Date.parse(data.scope?.range?.to)) fail('scope.range', 'RANGE_INVALID')
  required(data.summary, ['tasks', 'running', 'accepted', 'cost'], 'summary')
  for (const key of ['tasks', 'running', 'accepted']) measure(data.summary?.[key], `summary.${key}`)
  const cost = data.summary?.cost
  required(cost, ['currency', 'confirmedAmount', 'totalAmount', 'confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns', 'lastUpdatedAt'], 'summary.cost')
  if (cost) {
    if (!['USD', 'KHR'].includes(cost.currency)) fail('summary.cost.currency', 'CURRENCY_ENUM')
    for (const key of ['confirmedAmount', 'totalAmount', 'confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns']) measure(cost[key], `summary.cost.${key}`)
    measure(cost.lastUpdatedAt, 'summary.cost.lastUpdatedAt', false)
    if (cost.confirmedRuns?.value === 0 && cost.confirmedAmount?.value !== null) fail('summary.cost.confirmedAmount', 'NO_CONFIRMED_COST_MUST_BE_NULL')
    if (cost.unknownCostRuns?.value !== 0 && cost.totalAmount?.value !== null) fail('summary.cost.totalAmount', 'UNKNOWN_COST_MUST_BE_NULL')
    const counts = ['confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns'].map((key) => cost[key]?.value)
    if (counts.some((count) => count !== null && !Number.isInteger(count))) fail('summary.cost', 'INTEGER_COUNT_REQUIRED')
    if (counts.every(finite) && (counts[0] + counts[1] !== counts[3] || counts[2] > counts[3])) fail('summary.cost', 'COUNT_MISMATCH')
  }
  const validateStage = (row, path) => {
    if (!STAGES.includes(row?.stage)) fail(path, 'STAGE_ENUM')
    if (row?.stage === 'pending_verification' && !REASONS.has(row.stageReason)) fail(path, 'STAGE_REASON_REQUIRED')
    if (['verifying', 'awaiting_acceptance', 'accepted'].includes(row?.stage)) {
      const evidence = row.evidence?.value
      if (!object(evidence) || !Array.isArray(evidence.records) || !evidence.protectedTestsHash || !evidence.executorActor) {
        fail(path, 'EVIDENCE_INTEGRITY_REQUIRED')
      }
      const result = evidence && evaluateDone({ riskClass: evidence.riskClass }, evidence.records, evidence.subjectVersion, {
        enforcedSince: '1970-01-01T00:00:00Z', requiredLevel: 'accepted',
        protectedTestsHash: evidence.protectedTestsHash, executorActor: evidence.executorActor,
        boardActors: evidence.boardActors,
      })
      const hasLevel = row.stage === 'accepted' ? result?.done === true && result?.enforced === true && result?.reasons?.length === 0
        : (row.stage === 'awaiting_acceptance' ? ['reviewed', 'accepted', 'merged', 'released'] : ['verified', 'reviewed', 'accepted', 'merged', 'released']).includes(result?.level)
      if (!hasLevel) fail(path, 'NO_VALID_VERSIONED_EVIDENCE')
    }
  }
  if (!Array.isArray(data.queue)) fail('queue', 'ARRAY_REQUIRED')
  const ids = new Set()
  for (const [index, row] of (Array.isArray(data.queue) ? data.queue : []).entries()) {
    const path = `queue[${index}]`
    required(row, ['taskId', 'projectId', 'title', 'rawStatus', 'stage', 'stageReason', 'ownerId', 'blocker', 'nextHandler', 'entry', 'waitingSince', 'waitingMs', 'progress', 'evidence'], path)
    if (!object(row)) continue
    if (ids.has(row.taskId)) fail(path, 'DUPLICATE_TASK')
    ids.add(row.taskId)
    if (data.scope?.project?.value && row.projectId !== data.scope.project.value) fail(path, 'OUT_OF_SCOPE_PROJECT')
    validateStage(row, path)
    if (!['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled', 'unknown'].includes(row.rawStatus)) fail(path, 'RAW_STATUS_ENUM')
    for (const key of ['ownerId', 'nextHandler', 'waitingSince', 'evidence']) measure(row[key], `${path}.${key}`, false)
    measure(row.waitingMs, `${path}.waitingMs`)
    measure(row.progress?.passed, `${path}.progress.passed`)
    measure(row.progress?.total, `${path}.progress.total`)
    if (row.progress?.passed?.value !== null && row.progress?.total?.value !== null && row.progress.passed.value > row.progress.total.value) fail(path, 'PROGRESS_INVALID')
    if (!['authorization', 'dependency', 'budget', 'verification_failed', 'executor', 'delivered_unaccepted', 'none', 'unknown'].includes(row.blocker)) fail(path, 'BLOCKER_ENUM')
    if (!['governance', 'issue', 'health', 'acceptance', 'rework', 'handoff', 'none'].includes(row.entry)) fail(path, 'ENTRY_ENUM')
  }
  for (const key of ['execution', 'timeline']) {
    collection(data[key], key)
    if (!Array.isArray(data[key]?.items)) { fail(key, 'ARRAY_REQUIRED'); continue }
    for (const [index, row] of data[key].items.entries()) {
      if (!object(row)) { fail(`${key}[${index}]`, 'OBJECT_REQUIRED'); continue }
      if (!ids.has(row.taskId)) fail(`${key}[${index}]`, 'OUT_OF_SCOPE_TASK')
      if (key === 'timeline') {
        required(row, ['id', 'taskId', 'runId', 'at', 'type', 'operator', 'source', 'stage', 'stageReason', 'evidence'], `${key}[${index}]`)
        measure(row.runId, `${key}[${index}].runId`, false)
        measure(row.evidence, `${key}[${index}].evidence`, false)
        if (!iso(row.at)) fail(`${key}[${index}]`, 'ISO_REQUIRED')
        if (!['agent', 'board', 'system'].includes(row.operator)) fail(`${key}[${index}]`, 'OPERATOR_ENUM')
        if (!['activity', 'envelope', 'done_rules', 'synthetic'].includes(row.source)) fail(`${key}[${index}]`, 'SOURCE_ENUM')
        if (row.source === 'synthetic' && data.mode !== 'demo') fail(`${key}[${index}]`, 'SYNTHETIC_IN_LIVE')
        validateStage(row, `${key}[${index}]`)
      } else {
        required(row, ['runId', 'taskId', 'agentId', 'status', 'startedAt', 'finishedAt', 'model', 'modelSource', 'usage', 'cost', 'family', 'healthCategory'], `${key}[${index}]`)
        for (const field of ['startedAt', 'finishedAt', 'model']) measure(row[field], `${key}[${index}].${field}`, false)
        if (!['running', 'queued', 'succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted', 'unknown'].includes(row.status)) fail(`${key}[${index}]`, 'RUN_STATUS_ENUM')
        if (!['run', 'agent_config', 'unknown'].includes(row.modelSource)) fail(`${key}[${index}]`, 'MODEL_SOURCE_ENUM')
        measure(row.cost, `${key}[${index}].cost`)
        measure(row.usage, `${key}[${index}].usage`)
      }
    }
  }
  for (const key of ['organization', 'dependencies', 'calls']) {
    collection(data.relations?.[key], `relations.${key}`)
  }
  required(data.quality, ['synthetic', 'freshness', 'sources', 'gaps', 'writesAllowed'], 'quality')
  if (data.quality?.writesAllowed !== false) fail('quality', 'WRITES_FORBIDDEN')
  if (data.mode === 'live' && data.quality?.synthetic !== false) fail('quality', 'SYNTHETIC_IN_LIVE')
  if (data.mode === 'demo' && data.quality?.synthetic !== true) fail('quality', 'DEMO_LABEL_REQUIRED')
  const freshness = data.quality?.freshness
  required(freshness, ['stale', 'reason', 'maxAgeMs', 'animationAllowed'], 'quality.freshness')
  if (!finite(freshness?.maxAgeMs) || freshness.maxAgeMs > 120000) fail('quality.freshness', 'AGE_LIMIT')
  const stale = data.dataAgeMs?.value === null || data.dataAgeMs?.value > freshness?.maxAgeMs || freshness?.reason === 'DISCONNECTED'
  if (typeof freshness?.stale !== 'boolean' || freshness.stale !== stale) fail('quality.freshness', 'STALE_MARKER_MISMATCH')
  if (stale && (!['STALE_DATA', 'DISCONNECTED', 'UNKNOWN_TIME'].includes(freshness?.reason) || freshness?.animationAllowed !== false)) fail('quality.freshness', 'STALE_LIVE_ILLUSION')
  if (!Array.isArray(data.quality?.sources)) fail('quality.sources', 'ARRAY_REQUIRED')
  for (const [index, source] of (Array.isArray(data.quality?.sources) ? data.quality.sources : []).entries()) {
    measure(source.ageMs, `quality.sources[${index}].ageMs`)
    if (source.ageMs?.value !== null && data.dataAgeMs?.value !== null && source.ageMs?.value > data.dataAgeMs?.value) fail(`quality.sources[${index}]`, 'SOURCE_AGE_HIDDEN')
    if (source.complete === false && !REASONS.has(source.reason)) fail(`quality.sources[${index}]`, 'INCOMPLETE_REASON_REQUIRED')
  }
  if (data.quality?.sources?.some((source) => source.source === 'evidence' && source.complete === false) && data.summary?.accepted?.value !== null) fail('summary.accepted', 'NO_EVIDENCE_COVERAGE')
  return { ok: errors.length === 0, errors }
}

export function mutateCommandView(data, mutation) {
  const result = structuredClone(data)
  if (mutation === 'zerocost') result.summary.cost.totalAmount.value = 0
  else if (mutation === 'fakeaccepted') result.queue[0].stage = 'accepted'
  else if (mutation === 'leak') result.queue[0].apiToken = 'synthetic-forbidden-field'
  else if (mutation === 'stale') { result.quality.freshness.stale = false; result.quality.freshness.animationAllowed = true }
  else throw new Error('unsupported mutation')
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    const sample = JSON.parse(fs.readFileSync(new URL('./command-view-sample.json', import.meta.url), 'utf8'))
    const mutation = process.env.COMMAND_VIEW_CHECK_MUTATE
    const result = checkCommandView(mutation ? mutateCommandView(sample, mutation) : sample)
    console.log(`${result.ok ? 'PASS' : 'FAIL'} CommandViewData v1${mutation ? ` mutation=${mutation}` : ''}`)
    for (const error of result.errors) console.log(error)
    process.exitCode = result.ok ? 0 : 1
  } catch {
    console.error('FAIL SAMPLE_OR_MUTATION_INVALID')
    process.exitCode = 1
  }
}
