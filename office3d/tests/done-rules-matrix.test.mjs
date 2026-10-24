// DS-3：office3d/done-rules.mjs 的原因码可达性 + 单调性 + 纯度矩阵测试。
// 只加测试，不改被测代码；默认读 ../done-rules.mjs，
// 变异自检时可用 DONE_RULES_MODULE 指向系统临时目录里的 .mjs 副本。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const moduleUrl = process.env.DONE_RULES_MODULE
  ? pathToFileURL(process.env.DONE_RULES_MODULE)
  : new URL('../done-rules.mjs', import.meta.url)
const rules = await import(moduleUrl)
const {
  DONE_RULE_VERSION,
  LEVELS,
  EVIDENCE_KINDS,
  REASON_CODES,
  parseVersion,
  sameVersion,
  completionLevel,
  evaluateDone,
  enforcementBoundary,
} = rules

const CURRENT = 'git:repo/oa@abcdef1234567890'
const POLICY = Object.freeze({
  enforcedSince: '2026-01-01T00:00:00Z',
  executorActor: 'agent-1',
  protectedTestsHash: 'hash-1',
  boardActors: ['board-1'],
})
const TASK = Object.freeze({ createdAt: '2026-10-21T00:00:00Z' })

const ev = (kind, overrides = {}) => ({
  kind,
  subjectVersion: CURRENT,
  at: '2026-10-21T01:00:00Z',
  ref: `${kind}-ref`,
  ok: true,
  actor: kind === 'execution' ? 'agent-1' : 'reviewer-1',
  ...overrides,
})
const full = () => [
  ev('execution'),
  ev('test', { protectedTestsHash: 'hash-1' }),
  ev('review', { actor: 'reviewer-1' }),
  ev('acceptance', { actor: 'board-1' }),
  ev('merge'),
  ev('release'),
]

const levelIndex = (level) => LEVELS.indexOf(level)
const codesOf = (result) => (result.reasons || []).filter((code) => typeof code === 'string')
const allCodes = (result) => new Set([
  ...(result.reasons || []),
  ...(result.stale || []).map((item) => item.reason),
  ...(result.invalid || []).map((item) => item.reason),
].filter((code) => typeof code === 'string'))

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

function assertNoUndefinedOrNaN(value, path = 'result') {
  if (value === undefined) assert.fail(`${path} 含 undefined`)
  if (typeof value === 'number' && Number.isNaN(value)) assert.fail(`${path} 含 NaN`)
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) assertNoUndefinedOrNaN(child, `${path}.${key}`)
}

// 按当前源码：以下 6 个码只登记在 REASON_CODES，没有任何代码路径会产出。
const KNOWN_UNREACHABLE = ['NO_ACCEPTANCE', 'NO_MERGE', 'NO_RELEASE', 'NO_REVIEW', 'NO_TEST', 'REVIEW_NOT_INDEPENDENT']

// ---- 1. 模块形状与原因码可达性 -----------------------------------------------------

test('LEVELS / EVIDENCE_KINDS / REASON_CODES 与版本号完整且冻结', () => {
  assert.deepEqual([...LEVELS], ['executed', 'verified', 'reviewed', 'accepted', 'merged', 'released'])
  assert.deepEqual([...EVIDENCE_KINDS], ['execution', 'test', 'review', 'acceptance', 'merge', 'release'])
  assert.equal(REASON_CODES.length, 13, '原因码共 13 个')
  assert.deepEqual([...REASON_CODES].sort(), [
    'ACCEPTANCE_STALE', 'BOARD_ACCEPTANCE_REQUIRED', 'EVIDENCE_FAILED', 'LEGACY_BASELINE',
    'NO_ACCEPTANCE', 'NO_EXECUTION', 'NO_MERGE', 'NO_RELEASE', 'NO_REVIEW', 'NO_TEST',
    'PROTECTED_TEST_MISMATCH', 'REVIEW_NOT_INDEPENDENT', 'VERSION_MISMATCH',
  ])
  for (const known of KNOWN_UNREACHABLE) assert.ok(REASON_CODES.includes(known), `已知不可达码仍在册：${known}`)
  assert.equal(DONE_RULE_VERSION, 'L2a-1')
  assert.equal(Object.isFrozen(LEVELS), true)
  assert.equal(Object.isFrozen(REASON_CODES), true)
})

test('7 个可达原因码各有一组最小输入能稳定产出', () => {
  const scenarios = new Map([
    ['LEGACY_BASELINE', evaluateDone(TASK, [], CURRENT, {})],
    ['NO_EXECUTION', evaluateDone(TASK, [], CURRENT, POLICY)],
    ['VERSION_MISMATCH', evaluateDone(TASK, [ev('execution', { subjectVersion: 'git:repo/oa@9999999' })], CURRENT, POLICY)],
    ['EVIDENCE_FAILED', evaluateDone(TASK, [ev('execution', { ok: false })], CURRENT, POLICY)],
    ['PROTECTED_TEST_MISMATCH', evaluateDone(TASK, [ev('execution'), ev('test', { protectedTestsHash: 'other' })], CURRENT, POLICY)],
    ['ACCEPTANCE_STALE', evaluateDone(TASK, full().map((item) => item.kind === 'acceptance' ? { ...item, subjectVersion: 'git:repo/oa@9999999' } : item), CURRENT, POLICY)],
    ['BOARD_ACCEPTANCE_REQUIRED', evaluateDone(
      { ...TASK, riskClass: 'money' },
      full().map((item) => item.kind === 'acceptance' ? { ...item, actor: 'agent-2' } : item),
      CURRENT,
      POLICY,
    )],
  ])
  for (const [code, result] of scenarios) {
    assert.ok(REASON_CODES.includes(code), `${code} 必须已登记`)
    assert.ok(codesOf(result).includes(code), `场景应产出 ${code}，实际 ${JSON.stringify(codesOf(result))}`)
  }
  assert.equal(scenarios.size, 7)
})

test('已知不可达的 6 个原因码在完整矩阵里从未出现', () => {
  // 覆盖：全部 64 个证据子集 + 各类失败/缺失/过期/资金场景
  const scenarios = []
  for (let mask = 0; mask < 64; mask++) {
    const picked = full().filter((_, index) => mask & (1 << index))
    scenarios.push(completionLevel(picked, CURRENT, POLICY))
    scenarios.push(evaluateDone(TASK, picked, CURRENT, POLICY))
  }
  scenarios.push(completionLevel([ev('execution'), ev('test'), ev('review', { actor: 'agent-1' })], CURRENT, POLICY))
  scenarios.push(evaluateDone(TASK, [ev('execution'), ev('test'), ev('review', { actor: 'agent-1' })], CURRENT, POLICY))
  scenarios.push(evaluateDone(TASK, [ev('execution')], CURRENT, POLICY))
  scenarios.push(evaluateDone({ ...TASK, riskClass: 'funds' }, [ev('execution'), ev('test'), ev('review'), ev('acceptance')], CURRENT, POLICY))
  scenarios.push(completionLevel([{ kind: 'unknown', ok: true }], CURRENT))
  for (const result of scenarios) {
    const seen = allCodes(result)
    for (const unreachable of KNOWN_UNREACHABLE) {
      assert.equal(seen.has(unreachable), false, `已知不可达码不应出现：${unreachable}`)
    }
  }
})

// ---- 2. 单调性 -------------------------------------------------------------------

test('依次追加合法证据时等级按 LEVELS 逐级升高，从不下降', () => {
  const evidence = []
  const expected = ['none', 'executed', 'verified', 'reviewed', 'accepted', 'merged', 'released']
  assert.equal(completionLevel(evidence, CURRENT, POLICY).level, 'none')
  const steps = [
    ev('execution'),
    ev('test', { protectedTestsHash: 'hash-1' }),
    ev('review', { actor: 'reviewer-1' }),
    ev('acceptance', { actor: 'board-1' }),
    ev('merge'),
    ev('release'),
  ]
  let previous = levelIndex('none')
  for (const [index, entry] of steps.entries()) {
    evidence.push(entry)
    const level = completionLevel(evidence, CURRENT, POLICY).level
    assert.equal(level, expected[index + 1], `第 ${index + 1} 步等级应为 ${expected[index + 1]}`)
    assert.ok(levelIndex(level) >= previous, `等级不能下降：${level}`)
    previous = levelIndex(level)
  }
  assert.equal(previous, levelIndex('released'))
})

test('任意子集追加一条合法证据，等级只会保持或升高', () => {
  const all = full()
  let compared = 0
  for (let mask = 0; mask < 64; mask++) {
    const subset = all.filter((_, index) => mask & (1 << index))
    const before = levelIndex(completionLevel(subset, CURRENT, POLICY).level)
    for (let index = 0; index < all.length; index++) {
      if (mask & (1 << index)) continue
      const after = levelIndex(completionLevel([...subset, all[index]], CURRENT, POLICY).level)
      assert.ok(after >= before, `子集 ${mask} 追加 ${all[index].kind} 后等级下降`)
      compared += 1
    }
  }
  assert.ok(compared > 100, '应比较足够多的子集组合')
})

// ---- 3. 版本语义 -----------------------------------------------------------------

test('sameVersion 对称，git 与 sha256 互不相等，规范化后相等', () => {
  const pairsEqual = [
    ['git:repo/oa@abcdef1234567890', 'git:REPO\\OA@ABCDEF1234567890'],
    ['git:repo/oa@abcdef1', 'git:repo/oa@abcdef1234567890'],
    ['sha256:dir/file.txt=' + 'a'.repeat(64), 'sha256:DIR\\FILE.TXT=' + 'A'.repeat(64)],
  ]
  for (const [left, right] of pairsEqual) {
    assert.equal(sameVersion(left, right), true, `${left} == ${right}`)
    assert.equal(sameVersion(right, left), true, 'sameVersion 必须对称')
  }
  assert.equal(sameVersion('git:repo/oa@abcdef1234567890', 'sha256:repo/oa@abcdef1234567890'), false, 'git 与 sha256 不相等')
  assert.equal(sameVersion('sha256:a=' + 'a'.repeat(64), 'git:a@' + 'a'.repeat(40)), false)
  assert.equal(sameVersion('git:repo/oa@abcdef1', 'git:repo/other@abcdef1'), false, '仓库不同不相等')
})

test('不可解析的字符串 / null / 已解析的 unparseable 对象与任何值都不相等', () => {
  // 字符串或已解析对象：当前行为符合「不可解析即不同」。
  for (const value of ['bad-version', '', 'git:repo/oa@abc', 'sha256:a=xyz', null, undefined]) {
    assert.equal(sameVersion(value, value), false, `不可解析值不应等于自身：${String(value)}`)
  }
  const parsedBad = parseVersion('git:repo/oa@abcdef')
  assert.equal(parsedBad.kind, 'unparseable')
  assert.equal(sameVersion(parsedBad, parseVersion('git:repo/oa@abcdef')), false)
  assert.equal(parseVersion(null).kind, 'unparseable')
  assert.equal(parseVersion(CURRENT).kind, 'git')
})

test('当前行为固定：非字符串原始值/普通对象会被 sameVersion 误判为相等', () => {
  // 这是被测代码的已知缺陷（见报告「范围外发现」），按卡片要求用断言固定当前行为。
  assert.equal(sameVersion(42, 42), true, '当前行为：数字自我比较返回 true')
  assert.equal(sameVersion(42, 43), true, '当前行为：任意两个数字都返回 true')
  assert.equal(sameVersion(true, true), true, '当前行为：布尔也返回 true')
  assert.equal(sameVersion({}, {}), true, '当前行为：普通对象返回 true')
  assert.equal(sameVersion({}, { a: 1 }), true, '当前行为：不比较对象内容')
})

test('版本不一致的证据一律不计入等级', () => {
  const stale = completionLevel([ev('execution', { subjectVersion: 'git:repo/oa@1111111' })], CURRENT)
  assert.equal(stale.level, 'none')
  assert.deepEqual(stale.stale.map((item) => item.reason), ['VERSION_MISMATCH'])
  const partial = completionLevel([
    ev('execution'),
    ev('test', { subjectVersion: 'git:repo/oa@1111111' }),
  ], CURRENT)
  assert.equal(partial.level, 'executed', '过期测试证据不能把等级推到 verified')
})

// ---- 4. 纯度与确定性 -------------------------------------------------------------

test('深度冻结入参可调用，重复调用结果逐字段相等', () => {
  const frozenTask = deepFreeze({ createdAt: '2026-10-21T00:00:00Z' })
  const frozenEvidence = deepFreeze(full())
  const frozenPolicy = deepFreeze({ ...POLICY, boardActors: [...POLICY.boardActors] })
  let first
  assert.doesNotThrow(() => { first = evaluateDone(frozenTask, frozenEvidence, CURRENT, frozenPolicy) })
  const second = evaluateDone(frozenTask, frozenEvidence, CURRENT, frozenPolicy)
  assert.deepEqual(second, first)
  const a = completionLevel(deepFreeze(full().map((item) => ({ ...item }))), CURRENT, frozenPolicy)
  const b = completionLevel(deepFreeze(full().map((item) => ({ ...item }))), CURRENT, frozenPolicy)
  assert.deepEqual(a, b)
})

test('证据顺序打乱后结论不变（有效证据集合）', () => {
  const ordered = full()
  const reversed = [...ordered].reverse()
  const rotated = [...ordered.slice(2), ...ordered.slice(0, 2)]
  const base = completionLevel(ordered, CURRENT, POLICY)
  assert.equal(completionLevel(reversed, CURRENT, POLICY).level, base.level)
  assert.equal(completionLevel(rotated, CURRENT, POLICY).level, base.level)
  assert.equal(evaluateDone(TASK, reversed, CURRENT, POLICY).done, evaluateDone(TASK, ordered, CURRENT, POLICY).done)
  assert.deepEqual(completionLevel(reversed, CURRENT, POLICY).levels, base.levels)
})

test('输出不含 undefined / NaN', () => {
  const cases = [
    completionLevel(null, CURRENT),
    completionLevel([], CURRENT),
    completionLevel(full(), CURRENT, POLICY),
    completionLevel([ev('execution', { ok: false })], CURRENT),
    completionLevel([{ kind: 'unknown' }], CURRENT),
    evaluateDone(TASK, [], CURRENT, POLICY),
    evaluateDone(TASK, full(), CURRENT, POLICY),
    evaluateDone(TASK, [ev('execution', { subjectVersion: 'bad' })], CURRENT, POLICY),
  ]
  for (const [index, result] of cases.entries()) assertNoUndefinedOrNaN(result, `case-${index}`)
})

// ---- 5. 输入清洗 -----------------------------------------------------------------

test('控制字符、超长文本、异常证据与版本都不抛错且被截断/清洗', () => {
  const dirty = [
    null,
    undefined,
    42,
    'not-an-evidence',
    { kind: 'execution', ok: true, subjectVersion: 'bad', ref: 'a\u0000b\u0001c' },
    { kind: 'execution', ok: true, subjectVersion: CURRENT, ref: 'x'.repeat(600) },
    { kind: 'test', ok: false, ref: '\u007f'.repeat(10) },
    { kind: 'unknown-kind', ok: true },
  ]
  assert.doesNotThrow(() => completionLevel(dirty, CURRENT))
  const result = completionLevel(dirty, CURRENT)
  assert.equal(result.level, 'executed', '唯一有效 execution 应让等级为 executed')
  for (const item of result.invalid) {
    if (typeof item.ref === 'string') assert.ok(item.ref.length <= 160, 'invalid ref 被截断')
  }
  for (const item of result.stale) assert.ok(String(item.ref).length <= 160, 'stale ref 被截断')
  const longVersion = parseVersion('git:' + 'a'.repeat(600) + '@abcdef1')
  assert.equal(longVersion.kind, 'unparseable')
  assert.ok(longVersion.raw.length <= 500, '版本 raw 被截断')
  assert.doesNotThrow(() => completionLevel(full(), null))
  assert.equal(completionLevel(full(), null).level, 'none', '无当前版本时全部证据过期')
  assertNoUndefinedOrNaN(result)
})

// ---- 6. 等级门槛（覆盖 >= 边界的变异） ---------------------------------------------

test('requiredLevel 边界包含等号：等级恰好等于要求时 done 为 true', () => {
  const accepted = evaluateDone(TASK, full().slice(0, 4), CURRENT, { ...POLICY, requiredLevel: 'accepted' })
  assert.equal(accepted.level, 'accepted')
  assert.equal(accepted.done, true, 'level == requiredLevel 必须算 done')
  const released = evaluateDone(TASK, full(), CURRENT, { ...POLICY, requiredLevel: 'released' })
  assert.equal(released.level, 'released')
  assert.equal(released.done, true, 'released == requiredLevel 必须算 done')
  const unknown = evaluateDone(TASK, full().slice(0, 4), CURRENT, { ...POLICY, requiredLevel: 'nope' })
  assert.equal(unknown.requiredLevel, 'accepted', '未知 requiredLevel 回退默认值')
})

test('失败证据不会推进等级（对应 ok!==true 的变异）', () => {
  const result = completionLevel([ev('execution'), ev('test', { ok: false })], CURRENT)
  assert.equal(result.level, 'executed', '失败的 test 不能算 verified')
  assert.ok(result.invalid.some((item) => item.reason === 'EVIDENCE_FAILED'))
  const reviewFailed = completionLevel([ev('execution'), ev('test', { protectedTestsHash: 'hash-1' }), ev('review', { ok: false })], CURRENT, POLICY)
  assert.equal(reviewFailed.level, 'verified', '失败的 review 不能算 reviewed')
})

// ---- 7. 边界说明与静态纯度 --------------------------------------------------------

test('enforcementBoundary 诚实列出未覆盖路径', () => {
  const boundary = enforcementBoundary()
  assert.ok(Array.isArray(boundary.coveredPaths) && boundary.coveredPaths.length > 0)
  assert.ok(boundary.uncoveredPaths.length >= 3)
  assert.match(boundary.note, /只.*生效|覆盖范围/)
  assert.equal(Object.hasOwn(boundary, 'global'), false)
})
