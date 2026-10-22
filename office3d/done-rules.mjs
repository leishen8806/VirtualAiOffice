export const DONE_RULE_VERSION = 'L2a-1'
export const LEVELS = Object.freeze(['executed', 'verified', 'reviewed', 'accepted', 'merged', 'released'])
export const EVIDENCE_KINDS = Object.freeze(['execution', 'test', 'review', 'acceptance', 'merge', 'release'])
export const DEFAULT_REQUIRED_LEVEL = 'accepted'
export const REASON_CODES = Object.freeze([
  'LEGACY_BASELINE',
  'NO_EXECUTION',
  'NO_TEST',
  'NO_REVIEW',
  'REVIEW_NOT_INDEPENDENT',
  'NO_ACCEPTANCE',
  'NO_MERGE',
  'NO_RELEASE',
  'ACCEPTANCE_STALE',
  'VERSION_MISMATCH',
  'EVIDENCE_FAILED',
  'PROTECTED_TEST_MISMATCH',
  'BOARD_ACCEPTANCE_REQUIRED',
])

const VERSION_RE = /^(git|sha256):(.+)$/
const GIT_RE = /^git:(.+)@([0-9a-f]{7,40})$/i
const SHA_RE = /^sha256:(.+)=([0-9a-f]{64})$/i
const LEVEL_INDEX = new Map(LEVELS.map((level, index) => [level, index]))

function text(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function cleanVersionPart(value) {
  return text(value, 400).replace(/\\/g, '/').toLowerCase()
}

export function parseVersion(value) {
  const raw = text(value, 500)
  const git = raw.match(GIT_RE)
  if (git) return { kind: 'git', repo: cleanVersionPart(git[1]), commit: git[2].toLowerCase(), raw }
  const sha = raw.match(SHA_RE)
  if (sha) return { kind: 'sha256', path: cleanVersionPart(sha[1]), hash: sha[2].toLowerCase(), raw }
  return { kind: 'unparseable', raw }
}

export function sameVersion(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left
  const b = typeof right === 'string' ? parseVersion(right) : right
  if (!a || !b || a.kind === 'unparseable' || b.kind === 'unparseable' || a.kind !== b.kind) return false
  if (a.kind === 'git') {
    return a.repo === b.repo &&
      (a.commit.startsWith(b.commit) || b.commit.startsWith(a.commit))
  }
  return a.path === b.path && a.hash === b.hash
}

function validEvidence(entry) {
  return entry && typeof entry === 'object' && !Array.isArray(entry) && EVIDENCE_KINDS.includes(entry.kind)
}

function evidenceRef(entry) {
  return text(entry?.ref || entry?.kind || 'evidence', 160)
}

function versionMatches(entry, currentVersion) {
  const parsed = parseVersion(entry?.subjectVersion)
  return parsed.kind !== 'unparseable' && sameVersion(parsed, currentVersion)
}

function staleRecord(entry, reasonCode = 'VERSION_MISMATCH') {
  return { kind: text(entry?.kind, 40), ref: evidenceRef(entry), reason: reasonCode }
}

function missingFor(levels) {
  const missing = []
  if (!levels.executed) missing.push('executed')
  if (levels.executed && !levels.verified) missing.push('verified')
  if (levels.verified && !levels.reviewed) missing.push('reviewed')
  if (levels.reviewed && !levels.accepted) missing.push('accepted')
  if (levels.accepted && !levels.merged) missing.push('merged')
  if (levels.merged && !levels.released) missing.push('released')
  return missing
}

export function completionLevel(evidence, currentVersion, policy = {}) {
  const list = Array.isArray(evidence) ? evidence : []
  const levels = Object.fromEntries(LEVELS.map((level) => [level, false]))
  const stale = []
  const invalid = []
  const valid = []
  const protectedHash = policy.protectedTestsHash ? text(policy.protectedTestsHash, 200).toLowerCase() : null
  for (const entry of list) {
    if (!validEvidence(entry)) {
      invalid.push({ ref: evidenceRef(entry), reason: 'unknown_kind' })
      continue
    }
    if (entry.ok !== true) {
      invalid.push({ kind: entry.kind, ref: evidenceRef(entry), reason: 'EVIDENCE_FAILED' })
      continue
    }
    if (!versionMatches(entry, currentVersion)) {
      stale.push(staleRecord(entry))
      continue
    }
    if (entry.kind === 'test' && protectedHash && text(entry.protectedTestsHash, 200).toLowerCase() !== protectedHash) {
      invalid.push({ kind: entry.kind, ref: evidenceRef(entry), reason: 'PROTECTED_TEST_MISMATCH' })
      continue
    }
    valid.push(entry)
  }
  const execution = valid.find((entry) => entry.kind === 'execution')
  levels.executed = Boolean(execution)
  levels.verified = levels.executed && valid.some((entry) => entry.kind === 'test')
  const executor = text(policy.executorActor || execution?.actor, 120)
  levels.reviewed = levels.verified && valid.some((entry) =>
    entry.kind === 'review' && text(entry.actor, 120) && text(entry.actor, 120) !== executor
  )
  levels.accepted = levels.reviewed && valid.some((entry) => entry.kind === 'acceptance')
  levels.merged = levels.accepted && valid.some((entry) => entry.kind === 'merge')
  levels.released = levels.merged && valid.some((entry) => entry.kind === 'release')
  let level = 'none'
  for (const candidate of LEVELS) {
    if (levels[candidate]) level = candidate
    else break
  }
  return {
    level,
    levels,
    stale,
    missing: missingFor(levels),
    invalid,
  }
}

function boardRequired(task, policy) {
  return ['money', 'funds', 'server'].includes(String(task?.riskClass || task?.class || '').toLowerCase()) ||
    task?.money === true ||
    policy?.money === true
}

function enforcementEnabled(policy) {
  return Boolean(policy && policy.enforcedSince)
}

function isBefore(value, boundary) {
  const a = Date.parse(String(value || ''))
  const b = Date.parse(String(boundary || ''))
  return Number.isFinite(a) && Number.isFinite(b) && a < b
}

export function evaluateDone(task = {}, evidence = [], currentVersion, policy = {}) {
  const legacyDone = typeof policy.legacyDone === 'function' ? Boolean(policy.legacyDone(task)) : false
  if (!enforcementEnabled(policy) || isBefore(task.createdAt, policy.enforcedSince)) {
    return {
      done: legacyDone,
      level: legacyDone ? 'accepted' : 'none',
      requiredLevel: policy.requiredLevel || DEFAULT_REQUIRED_LEVEL,
      missing: legacyDone ? [] : ['legacy_baseline'],
      stale: [],
      reasons: ['LEGACY_BASELINE'],
      enforced: false,
    }
  }
  const requiredLevel = LEVEL_INDEX.has(policy.requiredLevel) ? policy.requiredLevel : DEFAULT_REQUIRED_LEVEL
  const result = completionLevel(evidence, currentVersion, policy)
  const reasons = []
  if (result.level === 'none') reasons.push('NO_EXECUTION')
  for (const item of result.invalid) reasons.push(item.reason)
  if (result.stale.length) reasons.push('VERSION_MISMATCH')
  if (result.stale.some((item) => item.kind === 'acceptance')) reasons.push('ACCEPTANCE_STALE')
  if (LEVEL_INDEX.has(result.level) &&
    LEVEL_INDEX.get(result.level) >= LEVEL_INDEX.get('accepted') &&
    boardRequired(task, policy)) {
    const accepted = (Array.isArray(evidence) ? evidence : []).find((entry) =>
      entry.kind === 'acceptance' && entry.ok === true && versionMatches(entry, currentVersion)
    )
    if (!accepted || !Array.isArray(policy.boardActors) || !policy.boardActors.map(String).includes(String(accepted.actor))) {
      reasons.push('BOARD_ACCEPTANCE_REQUIRED')
    }
  }
  const done = LEVEL_INDEX.has(result.level) &&
    LEVEL_INDEX.get(result.level) >= LEVEL_INDEX.get(requiredLevel) &&
    !reasons.includes('ACCEPTANCE_STALE') &&
    !reasons.includes('BOARD_ACCEPTANCE_REQUIRED') &&
    !reasons.includes('PROTECTED_TEST_MISMATCH')
  return {
    done,
    level: result.level,
    requiredLevel,
    missing: result.missing,
    stale: result.stale,
    reasons: [...new Set(reasons)],
    enforced: true,
  }
}

export function enforcementBoundary(options = {}) {
  const coveredPaths = Array.isArray(options.coveredPaths) && options.coveredPaths.length
    ? options.coveredPaths.map((item) => text(item, 160))
    : ['办公室 3D 的任务验收流程', '办公室 3D 的完成判定调用']
  return {
    coveredPaths,
    uncoveredPaths: [
      'Agent 绕过办公室 3D 直接修改 Paperclip 完成状态',
      'Paperclip 原生领取、执行锁和其他入口',
      '未接入本规则引擎的历史或外部工作流',
    ],
    note: '本规则只在列明的办公室 3D 验收流程内生效；覆盖范围之外必须单独授权和验证。',
  }
}
