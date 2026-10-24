// DS-7（R1）：完成策略统一。默认关闭（mode: 'off'），行为与改前完全一致。
//
// 三种模式：
//   off      —— 一律放行，不读证据（与现状一致）
//   warn     —— 一律放行，但把证据问题写进 reasons / audit（用于灰度观察）
//   enforce  —— 证据无效时拒绝完成；只有本机「董事会特批」+ 理由 ≥10 字才放行
//
// 判定复用 done-rules.mjs / command-view-validate.mjs，不另造规则。
// 本模块是纯函数：无网络、无文件 I/O；读取开关与证据由调用方（server.mjs）完成。
import { REASON_CODES } from './done-rules.mjs'
import { evaluateCommandEvidence } from './command-view-validate.mjs'

export const MODES = Object.freeze(['off', 'warn', 'enforce'])
/** 本模块新增、并已登记在 ALL_REASON_CODES 的原因码。 */
export const NEW_REASON_CODES = Object.freeze(['NO_EVIDENCE', 'OVERRIDE_NOT_ALLOWED'])
export const ALL_REASON_CODES = Object.freeze([...REASON_CODES, ...NEW_REASON_CODES])
const ALLOWED_POLICY_KEYS = new Set(['mode', 'enforcedSince', 'boardActors'])
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const isIso = (value) => typeof value === 'string' && ISO_RE.test(value) && Number.isFinite(Date.parse(value))
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const trim = (value) => String(value ?? '').trim()
const unique = (list) => [...new Set(list)]

export const OFF_POLICY = Object.freeze({ mode: 'off' })

/**
 * 解析开关对象。缺失、损坏、非法 mode、未知字段、非法 enforcedSince / boardActors
 * 一律回退为 { mode: 'off' }（默认关闭，失败关闭）。
 * @param {unknown} raw 文件内容字符串或已解析对象
 */
export function loadCompletionPolicy(raw) {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ...OFF_POLICY, reason: 'corrupt' }
    }
  }
  if (!isObject(value)) return { ...OFF_POLICY, reason: 'missing' }
  if (Object.keys(value).some((key) => !ALLOWED_POLICY_KEYS.has(key))) return { ...OFF_POLICY, reason: 'unknown-field' }
  if (value.mode === 'off' || value.mode === undefined) return { ...OFF_POLICY }
  if (!MODES.includes(value.mode) || value.mode === 'off') return { ...OFF_POLICY, reason: 'bad-mode' }
  if (!isIso(value.enforcedSince)) return { ...OFF_POLICY, reason: 'bad-enforced-since' }
  if (!Array.isArray(value.boardActors) || value.boardActors.some((actor) => typeof actor !== 'string' || !actor.trim())) {
    return { ...OFF_POLICY, reason: 'bad-board-actors' }
  }
  return Object.freeze({
    mode: value.mode,
    enforcedSince: value.enforcedSince,
    boardActors: Object.freeze(value.boardActors.map((actor) => actor.trim())),
  })
}

function legacyTask(task, policy) {
  if (!isObject(task)) return true
  const createdAt = task.createdAt
  if (!isIso(createdAt)) return true
  return Date.parse(createdAt) < Date.parse(policy.enforcedSince)
}

function structuredReasons(evidence, policy) {
  const records = evidence.records
  if (!Array.isArray(records) || records.length === 0) return ['NO_EVIDENCE']
  const enforcedSince = policy.enforcedSince
  const taskCreatedAt = isIso(evidence.taskCreatedAt) ? evidence.taskCreatedAt : null
  const commandEvidence = {
    enforcedSince,
    taskCreatedAt,
    subjectVersion: evidence.subjectVersion,
    protectedTestsHash: evidence.protectedTestsHash,
    executorActor: evidence.executorActor,
    boardActors: policy.boardActors,
    records,
  }
  const task = {
    createdAt: taskCreatedAt,
    subjectVersion: evidence.subjectVersion,
    riskClass: evidence.riskClass,
  }
  const command = evaluateCommandEvidence(commandEvidence, task)
  const reasons = []
  if (!command.valid) {
    const result = command.result
    if (result && Array.isArray(result.reasons)) reasons.push(...result.reasons)
    if (command.reason === 'LEGACY_BASELINE') reasons.push('LEGACY_BASELINE')
    else if (ALL_REASON_CODES.includes(command.reason)) reasons.push(command.reason)
  }
  const selfReview = records.some((row) => row && row.kind === 'review' && row.actor === evidence.executorActor)
  if (selfReview) reasons.push('REVIEW_NOT_INDEPENDENT')
  const acceptance = records.filter((row) => row && row.kind === 'acceptance')
  const wrongActor = acceptance.some((row) => !Array.isArray(policy.boardActors) || !policy.boardActors.includes(row.actor))
  if (acceptance.length && wrongActor) reasons.push('BOARD_ACCEPTANCE_REQUIRED')
  const known = unique(reasons).filter((code) => ALL_REASON_CODES.includes(code))
  if (!command.valid && known.length === 0) known.push('NO_EVIDENCE')
  return known
}

function simplifiedReasons(evidence, policy) {
  if (!isObject(evidence) || evidence.present !== true) return ['NO_EVIDENCE']
  const reasons = []
  if (evidence.versionStatus === 'mismatch') reasons.push('VERSION_MISMATCH')
  else if (evidence.versionStatus !== 'ok') reasons.push('NO_EVIDENCE')
  if (evidence.author && evidence.assignee && String(evidence.author) === String(evidence.assignee)) reasons.push('REVIEW_NOT_INDEPENDENT')
  if (evidence.protectedTestsOk === false) reasons.push('PROTECTED_TEST_MISMATCH')
  if (evidence.acceptanceActor && (!Array.isArray(policy.boardActors) || !policy.boardActors.includes(evidence.acceptanceActor))) {
    reasons.push('BOARD_ACCEPTANCE_REQUIRED')
  }
  return unique(reasons).filter((code) => ALL_REASON_CODES.includes(code))
}

function problemsOf(evidence, policy) {
  if (isObject(evidence) && Array.isArray(evidence.records)) return structuredReasons(evidence, policy)
  return simplifiedReasons(evidence, policy)
}

/**
 * 完成判定。
 * @param {object} input
 * @param {object} input.policy  loadCompletionPolicy 的返回值
 * @param {object} input.task    任务（createdAt / assigneeAgentId 等）
 * @param {object|null} input.evidence 证据（结构化 records，或本模块的简化形状）
 * @param {{reason:string}|null} input.override 人工特批
 * @param {boolean} input.localFullAccess 调用方是否为本机完整权限（LAN / 大屏必须 false）
 * @param {string} input.at 审计时间（默认当前时间，测试可注入）
 */
export function decideCompletion({
  policy = OFF_POLICY,
  task = {},
  evidence = null,
  override = null,
  localFullAccess = false,
  at = new Date().toISOString(),
} = {}) {
  const mode = policy && MODES.includes(policy.mode) ? policy.mode : 'off'
  const baseAudit = { at, mode, taskId: isObject(task) ? task.id || null : null, source: 'completion-policy' }
  if (mode === 'off') {
    return { allow: true, mode, reasons: [], audit: Object.freeze({ ...baseAudit, decision: 'allow', override: false }) }
  }
  const legacy = legacyTask(task, policy)
  const problems = legacy ? ['LEGACY_BASELINE'] : problemsOf(evidence, policy)
  if (legacy) {
    return {
      allow: true,
      mode,
      reasons: problems,
      audit: Object.freeze({ ...baseAudit, decision: 'allow', override: false, legacy: true }),
    }
  }
  if (mode === 'warn') {
    return {
      allow: true,
      mode,
      reasons: problems,
      audit: Object.freeze({ ...baseAudit, decision: 'allow', override: false, warnOnly: true }),
    }
  }
  // enforce
  if (problems.length === 0) {
    return { allow: true, mode, reasons: [], audit: Object.freeze({ ...baseAudit, decision: 'allow', override: false }) }
  }
  const overrideReason = isObject(override) ? trim(override.reason) : ''
  const overrideEligible = localFullAccess === true && [...overrideReason].length >= 10
  if (overrideEligible) {
    return {
      allow: true,
      mode,
      reasons: problems,
      audit: Object.freeze({
        ...baseAudit,
        decision: 'allow',
        override: true,
        overrideReason,
        overrideAt: at,
      }),
    }
  }
  const reasons = [...problems]
  if (override) reasons.push('OVERRIDE_NOT_ALLOWED')
  return {
    allow: false,
    mode,
    reasons: unique(reasons),
    audit: Object.freeze({ ...baseAudit, decision: 'deny', override: false, overrideAttempted: Boolean(override) }),
  }
}

/**
 * 纯函数：从任务评论里提取「简化证据」。
 * versionCheck 是 evidence-version.mjs 的 checkByIdent 结果（可为 { disabled:true } / null）。
 */
export function buildCompletionEvidence({ issue = {}, comments = [], versionCheck = null } = {}) {
  const list = Array.isArray(comments) ? comments : Array.isArray(comments?.comments) ? comments.comments : []
  const evidenceComments = list.filter((comment) => /【验收证据】/.test(String(comment?.body || '')))
  if (evidenceComments.length === 0) return { present: false, versionStatus: 'missing' }
  const last = evidenceComments[evidenceComments.length - 1]
  const result = versionCheck && typeof versionCheck === 'object' ? versionCheck.result : null
  const versionStatus = result === '版本一致' ? 'ok' : result === '版本已变' ? 'mismatch' : 'unverifiable'
  return {
    present: true,
    author: last.authorAgentId || last.authorUserId || null,
    assignee: issue.assigneeAgentId || null,
    versionStatus,
    evidenceAt: last.createdAt || null,
  }
}

/**
 * 工厂：把「读任务 + 读评论 + 校验版本 + 判定」串起来，供三处入口共用。
 * 默认关闭时不读任何数据（不新增请求）。
 */
export function createCompletionGate({
  policy = OFF_POLICY,
  get = async () => { throw new Error('no get') },
  versionCheck = async () => null,
  parseEvidence = null,
} = {}) {
  return async function completionGate(issueId, options = {}) {
    if (policy.mode === 'off') {
      return { allow: true, mode: 'off', reasons: [], audit: null, skipped: true }
    }
    let issue
    try {
      issue = await get(`/api/issues/${issueId}`)
    } catch {
      return decideCompletion({ policy, task: {}, evidence: { present: false }, ...options })
    }
    let comments = []
    try {
      comments = await get(`/api/issues/${issueId}/comments`)
    } catch {
      comments = []
    }
    let version = null
    try {
      const ident = issue.identifier || issue.id
      version = await versionCheck(ident)
    } catch {
      version = null
    }
    const evidence = buildCompletionEvidence({ issue, comments, versionCheck: version })
    if (parseEvidence) evidence.parsed = parseEvidence(issue, comments)
    return decideCompletion({ policy, task: issue, evidence, ...options })
  }
}

/** 人类可读的一句话说明（错误消息 / 评论用）。 */
export function completionMessage(decision) {
  if (!decision) return ''
  const reasons = Array.isArray(decision.reasons) && decision.reasons.length ? decision.reasons.join('、') : '无'
  if (decision.allow && decision.audit && decision.audit.override) {
    return `完成策略（${decision.mode}）已由本机董事会特批：${decision.audit.overrideReason}`
  }
  if (decision.allow && decision.reasons.length) return `完成策略（${decision.mode}）提示：${reasons}`
  if (decision.allow) return '完成策略通过'
  return `完成策略（${decision.mode}）拦下：${reasons}；如需放行，只能由本机董事会特批并填写至少 10 字理由`
}
