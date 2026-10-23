// DS-8（R2）：派发准入统一。默认关闭（mode: 'off'），行为与改前完全一致。
//
// 两个入口：
//   assign        —— 依赖口径与 scheduler-core.mjs 对齐（取消默认不等于交付）；
//   create_issue  —— 契约在「可执行」之前检查：enforce 下契约不完整只能建成草稿。
//
// 三种模式：off / warn / enforce；enforce 的人工例外只限本机完整权限 + 理由 ≥10 字，并写审计。
// 本模块是纯函数：无网络、无文件 I/O；开关由调用方（server.mjs）启动时读取。
import {
  CANCELLED_STATUSES,
  COMPLETED_STATUSES,
  REASON_CODES,
} from './scheduler-core.mjs'

export const MODES = Object.freeze(['off', 'warn', 'enforce'])
/** 本模块新增、并已登记在 ALL_REASON_CODES 的原因码。 */
export const NEW_REASON_CODES = Object.freeze(['CONTRACT_INCOMPLETE', 'OVERRIDE_NOT_ALLOWED'])
export const ALL_REASON_CODES = Object.freeze([...REASON_CODES, ...NEW_REASON_CODES])
export const OFF_POLICY = Object.freeze({ mode: 'off', cancelledDependencySatisfies: false })

const ALLOWED_POLICY_KEYS = new Set(['mode', 'cancelledDependencySatisfies'])
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const trim = (value) => String(value ?? '').trim()
const unique = (list) => [...new Set(list)]
const statusOf = (value) => trim(value).toLowerCase()

export function loadDispatchPolicy(raw) {
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
  if (value.mode === undefined || value.mode === 'off') return { ...OFF_POLICY }
  if (!MODES.includes(value.mode) || value.mode === 'off') return { ...OFF_POLICY, reason: 'bad-mode' }
  if (value.cancelledDependencySatisfies !== undefined && typeof value.cancelledDependencySatisfies !== 'boolean') {
    return { ...OFF_POLICY, reason: 'bad-cancelled-flag' }
  }
  return Object.freeze({
    mode: value.mode,
    cancelledDependencySatisfies: value.cancelledDependencySatisfies === true,
  })
}

function classifyBlockers(blockers, policy) {
  const pending = []
  const cancelled = []
  const unknown = []
  const list = Array.isArray(blockers) ? blockers : blockers == null ? [] : [blockers]
  for (const entry of list) {
    if (!isObject(entry) || typeof entry.status !== 'string' || !entry.status) {
      unknown.push(entry)
      continue
    }
    const status = statusOf(entry.status)
    if (COMPLETED_STATUSES.includes(status)) continue
    if (CANCELLED_STATUSES.includes(status)) {
      if (policy.cancelledDependencySatisfies === true) continue
      cancelled.push(entry)
      continue
    }
    pending.push(entry)
  }
  return { pending, cancelled, unknown }
}

function blockersOf(issue, blockers) {
  if (blockers !== undefined) return blockers
  if (!isObject(issue)) return []
  return issue.blockedBy
}

function identifierOf(entry) {
  return isObject(entry) && (entry.identifier || entry.id) ? String(entry.identifier || entry.id) : '未知依赖'
}

/**
 * 依赖准入判定。
 * @param {object} input
 * @param {object} input.policy                loadDispatchPolicy 的返回值
 * @param {object} input.issue                 任务（含 blockedBy / identifier）
 * @param {Array} [input.blockers]             显式阻塞依赖（缺省取 issue.blockedBy）
 * @param {{reason:string}|null} [input.override] 人工例外
 * @param {boolean} [input.force]              旧行为：force 直接放行（仅 off 下保留）
 * @param {boolean} [input.localFullAccess]    调用方是否为本机完整权限（LAN / 大屏 false）
 * @param {string} [input.at]                  审计时间
 */
export function decideAssign({
  policy = OFF_POLICY,
  issue = {},
  blockers,
  override = null,
  force = false,
  localFullAccess = false,
  at = new Date().toISOString(),
} = {}) {
  const mode = policy && MODES.includes(policy.mode) ? policy.mode : 'off'
  const auditBase = { at, mode, kind: 'assign', issueId: isObject(issue) ? issue.id || issue.identifier || null : null }
  const { pending, cancelled, unknown } = classifyBlockers(blockersOf(issue, blockers), policy)
  const reasons = []
  if (unknown.length) reasons.push('DEP_UNKNOWN')
  if (cancelled.length) reasons.push('DEP_CANCELLED')
  if (pending.length) reasons.push('DEP_PENDING')
  const blocked = reasons.length > 0

  if (mode === 'off') {
    // 旧口径：done / cancelled 都算满足（取消不阻塞），force 可以直接放行。
    const legacyOpen = [...pending, ...unknown]
    const allow = legacyOpen.length === 0 || force === true
    return {
      allow,
      mode,
      reasons: allow ? [] : unique(reasons.filter((code) => code !== 'DEP_CANCELLED')),
      legacyOpen: legacyOpen.map(identifierOf),
      audit: Object.freeze({ ...auditBase, decision: allow ? 'allow' : 'deny', force: force === true, override: false }),
    }
  }
  if (mode === 'warn') {
    return {
      allow: true,
      mode,
      reasons: [...reasons],
      legacyOpen: [...pending, ...cancelled, ...unknown].map(identifierOf),
      audit: Object.freeze({ ...auditBase, decision: 'allow', force: force === true, override: false, warnOnly: true }),
    }
  }
  // enforce：force 不再单独生效
  if (!blocked) {
    return {
      allow: true,
      mode,
      reasons: [],
      legacyOpen: [],
      audit: Object.freeze({ ...auditBase, decision: 'allow', force: false, override: false }),
    }
  }
  const overrideReason = isObject(override) ? trim(override.reason) : ''
  const overrideEligible = localFullAccess === true && [...overrideReason].length >= 10
  if (overrideEligible) {
    return {
      allow: true,
      mode,
      reasons,
      legacyOpen: [...pending, ...cancelled, ...unknown].map(identifierOf),
      audit: Object.freeze({
        ...auditBase,
        decision: 'allow',
        force: false,
        override: true,
        overrideReason,
        overrideAt: at,
      }),
    }
  }
  const denyReasons = [...reasons]
  if (override) denyReasons.push('OVERRIDE_NOT_ALLOWED')
  return {
    allow: false,
    mode,
    reasons: unique(denyReasons).filter((code) => ALL_REASON_CODES.includes(code)),
    legacyOpen: [...pending, ...cancelled, ...unknown].map(identifierOf),
    audit: Object.freeze({ ...auditBase, decision: 'deny', force: false, override: false, overrideAttempted: Boolean(override) }),
  }
}

/**
 * 创建准入判定：契约不完整时 enforce 只允许建成草稿。
 * @param {object} input
 * @param {object} input.policy
 * @param {{state?: 'none'|'complete'|'incomplete', errors?: Array}} input.contractCheck
 * @param {boolean} input.wantsExecutable 是否「建成可执行」（指定负责人 / 置 todo）
 * @param {string} [input.at]
 */
export function decideCreate({
  policy = OFF_POLICY,
  contractCheck = null,
  wantsExecutable = false,
  at = new Date().toISOString(),
} = {}) {
  const mode = policy && MODES.includes(policy.mode) ? policy.mode : 'off'
  const state = isObject(contractCheck) && ['none', 'complete', 'incomplete'].includes(contractCheck.state)
    ? contractCheck.state
    : 'none'
  const reasons = []
  if (state === 'none') reasons.push('NO_CONTRACT')
  else if (state === 'incomplete') reasons.push('CONTRACT_INCOMPLETE')
  const audit = { at, mode, kind: 'create', contractState: state, wantsExecutable: wantsExecutable === true }
  if (mode === 'off') {
    return {
      allowExecutable: wantsExecutable === true,
      forceDraft: false,
      mode,
      reasons: [],
      audit: Object.freeze({ ...audit, decision: wantsExecutable === true ? 'executable' : 'draft' }),
    }
  }
  if (mode === 'warn') {
    return {
      allowExecutable: wantsExecutable === true,
      forceDraft: false,
      mode,
      reasons: wantsExecutable === true ? [...reasons] : [],
      audit: Object.freeze({ ...audit, decision: wantsExecutable === true ? 'executable' : 'draft', warnOnly: true }),
    }
  }
  const complete = state === 'complete'
  return {
    allowExecutable: wantsExecutable === true && complete,
    forceDraft: wantsExecutable === true && !complete,
    mode,
    reasons: wantsExecutable === true ? [...reasons] : [],
    audit: Object.freeze({ ...audit, decision: wantsExecutable === true && complete ? 'executable' : 'draft' }),
  }
}

/** 人类可读的一句话说明（错误消息用）。 */
export function dispatchMessage(decision) {
  if (!decision) return ''
  const codes = Array.isArray(decision.reasons) && decision.reasons.length ? decision.reasons.join('、') : '无'
  if (decision.allow && decision.audit && decision.audit.override) {
    return `派发准入（${decision.mode}）已由本机董事会特批：${decision.audit.overrideReason}`
  }
  if (decision.allow && decision.reasons.length) return `派发准入（${decision.mode}）提示：${codes}`
  if (decision.allow) return '派发准入通过'
  const legacy = Array.isArray(decision.legacyOpen) && decision.legacyOpen.length ? `（未满足：${decision.legacyOpen.join('、')}）` : ''
  return `派发准入（${decision.mode}）拦下：${codes}${legacy}；依赖未满足时只能由本机董事会特批并填写至少 10 字理由`
}
