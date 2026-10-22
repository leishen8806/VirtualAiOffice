import { evaluateDone, sameVersion } from './done-rules.mjs'

export const STAGES = Object.freeze(['requirement_confirmed', 'claimed', 'executing', 'verifying', 'awaiting_acceptance', 'accepted', 'pending_verification'])
export const REASONS = Object.freeze([
  'STALE_DATA', 'DISCONNECTED', 'NOT_LOADED', 'NOT_APPLICABLE', 'UNKNOWN_TIME',
  'SYNTHETIC_DEMO', 'PARTIAL_PAGE', 'SOURCE_DISABLED', 'SOURCE_FAILED',
  'EVIDENCE_NOT_CONNECTED', 'NO_CONFIRMED_COST', 'COST_NOT_RETURNED',
  'USAGE_NOT_RETURNED', 'RUN_MODEL_NOT_RETURNED', 'NO_STATUS_TRANSITION',
  'NO_TEST_EVIDENCE', 'NO_ACCEPTANCE_EVIDENCE', 'NO_AUTHORIZATION_EVIDENCE',
  'NO_EXECUTION_EVIDENCE', 'NO_CHECKOUT_EVIDENCE', 'NO_CALL_EVIDENCE',
  'DEP_NOT_LOADED', 'DEP_UNKNOWN', 'OWNER_UNKNOWN', 'LEGACY_BASELINE',
  'MIXED_CURRENCY', 'VERSION_MISMATCH', 'PROTECTED_TEST_MISMATCH',
])
const reasons = new Set(REASONS)
const keys = new Set([
  'schemaVersion', 'generatedAt', 'dataAgeMs', 'mode', 'company', 'id', 'name',
  'scope', 'project', 'range', 'from', 'to', 'summary', 'tasks', 'running', 'accepted',
  'cost', 'currency', 'confirmedAmount', 'totalAmount', 'confirmedRuns',
  'unknownCostRuns', 'missingUsageRuns', 'observedRuns', 'lastUpdatedAt',
  'queue', 'taskId', 'projectId', 'title', 'rawStatus', 'stage', 'stageReason',
  'ownerId', 'blocker', 'blockers', 'nextHandler', 'entry', 'waitingSince', 'waitingMs',
  'progress', 'passed', 'total', 'evidence', 'value', 'reason',
  'relations', 'organization', 'dependencies', 'calls', 'items', 'complete',
  'type', 'source', 'confidence', 'execution', 'runId', 'agentId', 'status',
  'startedAt', 'finishedAt', 'model', 'modelSource', 'usage', 'family',
  'healthCategory', 'timeline', 'at', 'operator', 'quality', 'synthetic',
  'freshness', 'stale', 'maxAgeMs', 'animationAllowed', 'sources', 'ageMs',
  'gaps', 'writesAllowed', 'subjectVersion', 'records', 'kind', 'ok', 'actor',
  'ref', 'protectedTestsHash', 'executorActor', 'boardActors', 'riskClass',
  'enforcedSince', 'taskCreatedAt',
])
const identityKeys = new Set(['id', 'taskId', 'projectId', 'runId', 'agentId', 'ownerId', 'nextHandler', 'project', 'from', 'to', 'actor', 'executorActor', 'boardActors'])
export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
export const isIso = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19)
export const isDemoId = (value) => typeof value === 'string' && /^demo-[a-z0-9-]+$/.test(value)
export const sensitiveValue = /Bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}|-----BEGIN|https?:\/\/|(?:\d{1,3}\.){3}\d{1,3}|[A-Z]:[\\/]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|\s)\/(?:home|Users|etc|var|tmp|root)\//i
const sensitiveKey = /token|secret|password|cookie|authorization|api.?key|address|email|phone|description|body|payload|processPid|stdout|stderr|comment/i
export const realIdentifier = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[A-Z]{2,5}-\d+\b|\b[0-9a-f]{32,}\b/i
const blockers = new Set(['authorization', 'dependency', 'budget', 'verification_failed', 'executor', 'delivered_unaccepted', 'none', 'unknown'])
const entries = new Set(['governance', 'issue', 'health', 'acceptance', 'rework', 'handoff', 'none'])

// 不接受调用方传入 done 布尔值，必须重新核对同版本、受保护测试和验收身份。
export function evaluateCommandEvidence(evidence, task = {}) {
  if (!isObject(evidence) || !isIso(evidence.enforcedSince)) return { valid: false, reason: 'LEGACY_BASELINE', result: null }
  if (!isIso(task.createdAt || evidence.taskCreatedAt)) return { valid: false, reason: 'LEGACY_BASELINE', result: null }
  if (!Array.isArray(evidence.records) || evidence.records.some((row) => !isObject(row) || typeof row.actor !== 'string' || !row.actor || typeof row.ref !== 'string' || !row.ref) ||
      !evidence.protectedTestsHash || !evidence.executorActor ||
      !sameVersion(evidence.subjectVersion, task.subjectVersion || evidence.subjectVersion)) {
    return { valid: false, reason: 'VERSION_MISMATCH', result: null }
  }
  const result = evaluateDone(
    { createdAt: task.createdAt || evidence.taskCreatedAt, riskClass: task.riskClass || evidence.riskClass },
    evidence.records, task.subjectVersion || evidence.subjectVersion,
    { enforcedSince: evidence.enforcedSince, requiredLevel: 'accepted', protectedTestsHash: evidence.protectedTestsHash,
      executorActor: evidence.executorActor, boardActors: evidence.boardActors },
  )
  const bad = !result.enforced || result.reasons.length > 0
  const selfReview = evidence.records.some((row) => row.kind === 'review' && row.actor === evidence.executorActor)
  const acceptance = evidence.records.filter((row) => row.kind === 'acceptance')
  const wrongActor = acceptance.some((row) => !Array.isArray(evidence.boardActors) || !evidence.boardActors.includes(row.actor))
  const reason = !result.enforced ? 'LEGACY_BASELINE'
    : result.reasons.includes('PROTECTED_TEST_MISMATCH') ? 'PROTECTED_TEST_MISMATCH'
      : result.reasons.includes('VERSION_MISMATCH') ? 'VERSION_MISMATCH' : 'NO_ACCEPTANCE_EVIDENCE'
  return { valid: !bad && !wrongActor && !selfReview, reason, result }
}

export function validateCommandView(data) {
  const errors = []
  const fail = (path, code) => errors.push({ path, code })
  const required = (value, fields, path) => {
    if (!isObject(value)) { fail(path, 'OBJECT_REQUIRED'); return false }
    for (const key of fields) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'REQUIRED')
    return true
  }
  const measurement = (value, path, type = 'number') => {
    if (!required(value, ['value', 'reason'], path)) return
    if (value.value === null) {
      if (!reasons.has(value.reason)) fail(path, 'UNKNOWN_REASON_REQUIRED')
    } else {
      if (value.reason !== null) fail(path, 'UNKNOWN_MUST_BE_NULL')
      if (type === 'number' && !isNumber(value.value)) fail(path, 'NON_NEGATIVE_NUMBER_REQUIRED')
      if (type === 'integer' && (!isNumber(value.value) || !Number.isInteger(value.value))) fail(path, 'INTEGER_COUNT_REQUIRED')
      if (type === 'time' && !isIso(value.value)) fail(path, 'ISO_REQUIRED')
      if (type === 'id' && (typeof value.value !== 'string' || !value.value)) fail(path, 'IDENTIFIER_REQUIRED')
    }
  }
  const collection = (value, path) => {
    if (!required(value, ['items', 'complete', 'reason'], path)) return []
    if (!Array.isArray(value.items)) fail(path, 'ARRAY_REQUIRED')
    if (typeof value.complete !== 'boolean') fail(path, 'COMPLETENESS_REQUIRED')
    if (value.complete === false && !reasons.has(value.reason)) fail(path, 'INCOMPLETE_REASON_REQUIRED')
    if (value.complete === true && value.reason !== null) fail(path, 'COMPLETE_REASON_MUST_BE_NULL')
    return Array.isArray(value.items) ? value.items : []
  }
  const seen = new Set()
  const walk = (value, path, parentKey = '') => {
    if (value && typeof value === 'object') {
      if (seen.has(value)) { fail(path, 'NON_JSON_GRAPH'); return }
      seen.add(value)
      if (Array.isArray(value)) {
        if (value.length > 200) fail(path, 'ARRAY_LIMIT')
        value.forEach((child, index) => walk(child, `${path}[${index}]`, parentKey))
      } else {
        if (Object.hasOwn(value, 'value')) measurement(value, path, 'any')
        for (const [key, child] of Object.entries(value)) {
          if (sensitiveKey.test(key)) fail(`${path}.${key}`, 'SENSITIVE_KEY')
          if (!keys.has(key)) fail(`${path}.${key}`, 'UNKNOWN_KEY')
          if ((key === 'reason' || key === 'stageReason') && child !== null && !reasons.has(child)) fail(`${path}.${key}`, 'REASON_ENUM')
          walk(child, `${path}.${key}`, key === 'value' ? parentKey : key)
        }
      }
      seen.delete(value)
    } else if (typeof value === 'string') {
      if ([...value].length > (parentKey === 'title' ? 80 : 160)) fail(path, 'TEXT_LIMIT')
      if (/[\u0000-\u001f\u007f]/.test(value) || sensitiveValue.test(value)) fail(path, 'SENSITIVE_VALUE')
      if (data?.mode === 'demo' && realIdentifier.test(value)) fail(path, 'REAL_IDENTIFIER_IN_DEMO')
      if (data?.mode === 'demo' && identityKeys.has(parentKey) && !isIso(value) && !isDemoId(value)) fail(path, 'DEMO_IDENTIFIER_REQUIRED')
    } else if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' ||
               (typeof value === 'number' && !Number.isFinite(value))) fail(path, 'JSON_VALUE_REQUIRED')
  }
  if (!required(data, ['schemaVersion', 'generatedAt', 'dataAgeMs', 'mode', 'company', 'scope', 'summary', 'queue', 'relations', 'execution', 'timeline', 'quality'], '$')) return { ok: false, errors }
  walk(data, '$')
  if (data.schemaVersion !== 1) fail('schemaVersion', 'UNSUPPORTED_VERSION')
  if (!['live', 'demo'].includes(data.mode)) fail('mode', 'MODE_ENUM')
  if (!isIso(data.generatedAt)) fail('generatedAt', 'ISO_REQUIRED')
  measurement(data.dataAgeMs, 'dataAgeMs')
  required(data.company, ['id', 'name'], 'company')
  if (typeof data.company?.id !== 'string' || !data.company.id) fail('company.id', 'IDENTIFIER_REQUIRED')
  required(data.scope, ['project', 'range'], 'scope')
  measurement(data.scope?.project, 'scope.project', 'id')
  if (!isIso(data.scope?.range?.from) || !isIso(data.scope?.range?.to) ||
      Date.parse(data.scope.range.from) > Date.parse(data.scope.range.to)) fail('scope.range', 'RANGE_INVALID')
  required(data.summary, ['tasks', 'running', 'accepted', 'cost'], 'summary')
  for (const key of ['tasks', 'running', 'accepted']) measurement(data.summary?.[key], `summary.${key}`, 'integer')
  const cost = data.summary?.cost
  if (required(cost, ['currency', 'confirmedAmount', 'totalAmount', 'confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns', 'lastUpdatedAt'], 'summary.cost')) {
    if (!['USD', 'KHR'].includes(cost.currency)) fail('summary.cost.currency', 'CURRENCY_ENUM')
    for (const field of ['confirmedAmount', 'totalAmount']) measurement(cost[field], `summary.cost.${field}`)
    const countFields = ['confirmedRuns', 'unknownCostRuns', 'missingUsageRuns', 'observedRuns']
    for (const field of countFields) measurement(cost[field], `summary.cost.${field}`, 'integer')
    measurement(cost.lastUpdatedAt, 'summary.cost.lastUpdatedAt', 'time')
    if (cost.confirmedRuns?.value === 0 && cost.confirmedAmount?.value !== null) fail('summary.cost.confirmedAmount', 'NO_CONFIRMED_COST_MUST_BE_NULL')
    if ((cost.unknownCostRuns?.value !== 0 || cost.observedRuns?.value === null) && cost.totalAmount?.value !== null) fail('summary.cost.totalAmount', 'UNKNOWN_COST_MUST_BE_NULL')
    if (cost.confirmedRuns?.value === 0 && cost.totalAmount?.value !== null) fail('summary.cost.totalAmount', 'NO_CONFIRMED_COST_MUST_BE_NULL')
    const counts = countFields.map((field) => cost[field]?.value)
    if (counts.every(isNumber) && (counts[0] + counts[1] !== counts[3] || counts[2] > counts[3])) fail('summary.cost', 'COUNT_MISMATCH')
  }
  const stage = (row, path) => {
    if (!STAGES.includes(row.stage)) fail(path, 'STAGE_ENUM')
    if (row.stage === 'pending_verification' && !reasons.has(row.stageReason)) fail(path, 'STAGE_REASON_REQUIRED')
    if (['verifying', 'awaiting_acceptance', 'accepted'].includes(row.stage)) {
      const evidence = row.evidence?.value
      const assessment = evaluateCommandEvidence(evidence)
      if (!isObject(evidence) || !evidence.protectedTestsHash || !evidence.executorActor) fail(path, 'EVIDENCE_INTEGRITY_REQUIRED')
      const levels = row.stage === 'verifying' ? ['verified', 'reviewed', 'accepted', 'merged', 'released'] : ['reviewed', 'accepted', 'merged', 'released']
      if (!assessment.valid || !levels.includes(assessment.result?.level) || (row.stage === 'accepted' && !assessment.result?.done)) fail(path, 'NO_VALID_VERSIONED_EVIDENCE')
    }
  }
  const ids = new Set()
  const queue = Array.isArray(data.queue) ? data.queue : []
  if (!Array.isArray(data.queue)) fail('queue', 'ARRAY_REQUIRED')
  queue.forEach((row, index) => {
    const path = `queue[${index}]`
    if (!required(row, ['taskId', 'projectId', 'title', 'rawStatus', 'stage', 'stageReason', 'ownerId', 'blocker', 'nextHandler', 'entry', 'waitingSince', 'waitingMs', 'progress', 'evidence'], path)) return
    if (typeof row.taskId !== 'string' || !row.taskId || typeof row.projectId !== 'string' || !row.projectId) fail(path, 'IDENTIFIER_REQUIRED')
    if (ids.has(row.taskId)) fail(path, 'DUPLICATE_TASK')
    ids.add(row.taskId)
    if (data.scope?.project?.value && row.projectId !== data.scope.project.value) fail(path, 'OUT_OF_SCOPE_PROJECT')
    if (typeof row.rawStatus !== 'string' || !row.rawStatus) fail(path, 'RAW_STATUS_REQUIRED')
    stage(row, path)
    for (const key of ['ownerId', 'nextHandler']) measurement(row[key], `${path}.${key}`, 'id')
    measurement(row.waitingSince, `${path}.waitingSince`, 'time')
    measurement(row.waitingMs, `${path}.waitingMs`)
    measurement(row.evidence, `${path}.evidence`, 'any')
    for (const key of ['passed', 'total']) measurement(row.progress?.[key], `${path}.progress.${key}`, 'integer')
    if (isNumber(row.progress?.passed?.value) && isNumber(row.progress?.total?.value) && row.progress.passed.value > row.progress.total.value) fail(path, 'PROGRESS_INVALID')
    for (const focus of [row, ...(Array.isArray(row.blockers) ? row.blockers : [])]) {
      if (!blockers.has(focus?.blocker)) fail(path, 'BLOCKER_ENUM')
      if (!entries.has(focus?.entry)) fail(path, 'ENTRY_ENUM')
    }
  })
  for (const name of ['execution', 'timeline']) {
    collection(data[name], name).forEach((row, index) => {
      const path = `${name}[${index}]`
      if (!isObject(row)) { fail(path, 'OBJECT_REQUIRED'); return }
      if (!ids.has(row.taskId)) fail(path, 'OUT_OF_SCOPE_TASK')
      if (name === 'execution') {
        required(row, ['runId', 'taskId', 'agentId', 'status', 'startedAt', 'finishedAt', 'model', 'modelSource', 'usage', 'cost', 'family', 'healthCategory'], path)
        for (const key of ['startedAt', 'finishedAt']) measurement(row[key], `${path}.${key}`, 'time')
        measurement(row.model, `${path}.model`, 'id')
        for (const key of ['cost', 'usage']) measurement(row[key], `${path}.${key}`)
        if (!['run', 'agent_config', 'unknown'].includes(row.modelSource)) fail(path, 'MODEL_SOURCE_ENUM')
        if (!['running', 'queued', 'succeeded', 'failed', 'timed_out', 'cancelled', 'interrupted', 'unknown'].includes(row.status)) fail(path, 'RUN_STATUS_ENUM')
      } else {
        required(row, ['id', 'taskId', 'runId', 'at', 'type', 'operator', 'source', 'stage', 'stageReason', 'evidence'], path)
        measurement(row.runId, `${path}.runId`, 'id')
        measurement(row.evidence, `${path}.evidence`, 'any')
        if (!isIso(row.at)) fail(path, 'ISO_REQUIRED')
        if (!['activity', 'envelope', 'done_rules', 'synthetic'].includes(row.source)) fail(path, 'SOURCE_ENUM')
        if (!['board', 'agent', 'system'].includes(row.operator)) fail(path, 'OPERATOR_ENUM')
        if (row.source === 'synthetic' && data.mode !== 'demo') fail(path, 'SYNTHETIC_IN_LIVE')
        stage(row, path)
      }
    })
  }
  for (const key of ['organization', 'dependencies', 'calls']) collection(data.relations?.[key], `relations.${key}`)
  required(data.quality, ['synthetic', 'freshness', 'sources', 'gaps', 'writesAllowed'], 'quality')
  if (data.quality?.writesAllowed !== false) fail('quality', 'WRITES_FORBIDDEN')
  if (data.quality?.synthetic !== (data.mode === 'demo')) fail('quality', 'SYNTHETIC_MODE_MISMATCH')
  const freshness = data.quality?.freshness
  required(freshness, ['stale', 'reason', 'maxAgeMs', 'animationAllowed'], 'quality.freshness')
  if (!isNumber(freshness?.maxAgeMs) || freshness.maxAgeMs > 120000) fail('quality.freshness', 'AGE_LIMIT')
  const stale = data.dataAgeMs?.value === null || data.dataAgeMs?.value > freshness?.maxAgeMs || freshness?.reason === 'DISCONNECTED'
  if (freshness?.stale !== stale) fail('quality.freshness', 'STALE_MARKER_MISMATCH')
  if (stale && (!['STALE_DATA', 'DISCONNECTED', 'UNKNOWN_TIME'].includes(freshness?.reason) || freshness?.animationAllowed !== false)) fail('quality.freshness', 'STALE_LIVE_ILLUSION')
  if (!Array.isArray(data.quality?.sources)) fail('quality.sources', 'ARRAY_REQUIRED')
  for (const [index, source] of (Array.isArray(data.quality?.sources) ? data.quality.sources : []).entries()) {
    measurement(source?.ageMs, `quality.sources[${index}].ageMs`)
    if (isNumber(source?.ageMs?.value) && isNumber(data.dataAgeMs?.value) && source.ageMs.value > data.dataAgeMs.value) fail(`quality.sources[${index}]`, 'SOURCE_AGE_HIDDEN')
    if (source?.complete === false && !reasons.has(source.reason)) fail(`quality.sources[${index}]`, 'INCOMPLETE_REASON_REQUIRED')
    if (source?.source === 'evidence' && source.complete === false && data.summary?.accepted?.value !== null) fail('summary.accepted', 'NO_EVIDENCE_COVERAGE')
    if (source?.source === 'queue' && source.complete === false && data.summary?.tasks?.value !== null) fail('summary.tasks', 'PARTIAL_COUNT_MUST_BE_NULL')
  }
  if (isNumber(data.summary?.tasks?.value) && data.summary.tasks.value !== queue.length) fail('summary.tasks', 'COUNT_MISMATCH')
  if (isNumber(data.summary?.accepted?.value) && data.summary.accepted.value !== queue.filter((row) => row?.stage === 'accepted').length) fail('summary.accepted', 'COUNT_MISMATCH')
  return { ok: errors.length === 0, errors }
}
