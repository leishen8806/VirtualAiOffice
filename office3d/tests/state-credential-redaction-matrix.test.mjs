// DS-5：state-last-good.mjs 的 stripStateCredentials 键名矩阵测试。
// 只加测试，不改被测代码；默认读 ../state-last-good.mjs，
// 变异自检时用 STATE_LAST_GOOD_MODULE 指向系统临时目录里的 .mjs 副本。
//
// 三张表：
//   1. MUST_DELETE —— 当前正则确实会删的凭据键（顶层 / 嵌套 / 数组内 / 三层深各测一次）；
//   2. KEEP_TABLE  —— 普通业务键应当保留，以及含 token 字样但属统计数据的「被误伤」键；
//   3. VARIANTS    —— 可能漏网的敏感变体（逐项断言当前真实行为）。
// 所有值都是明显的假值 fixture，不含任何真实密钥。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const moduleUrl = process.env.STATE_LAST_GOOD_MODULE
  ? pathToFileURL(process.env.STATE_LAST_GOOD_MODULE)
  : new URL('../state-last-good.mjs', import.meta.url)
const { stripStateCredentials } = await import(moduleUrl)

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

// ---- 表一：必须被删除的键名（当前正则确实删除；≥40） ------------------------------
const MUST_DELETE = [
  'token', 'accessToken', 'access_token', 'ACCESS-TOKEN', 'refreshToken', 'idToken', 'authToken', 'oauthToken',
  'password', 'passwordHash', 'dbPassword', 'passphrase',
  'secret', 'clientSecret', 'secretKey', 'secretAccessKey', 'clientCredentials',
  'apiKey', 'api_key', 'API-KEY', 'API_KEY', 'api-key', 'apiKeyId',
  'accessKey', 'accessKeyId', 'access_code', 'accessCode', 'access-code',
  'authorization', 'Authorization',
  'cookie', 'Set-Cookie', 'set-cookie', 'csrf', 'csrfToken', 'csrfCookie', 'jwt', 'jwtToken', 'jwtSecret', 'bearer', 'bearerToken',
  'credential', 'credentials', 'credentialHint', 'actToken', 'tokenHash',
  '访问码', '令牌', '口令', '密钥', '访问密钥',
]

test('表一：必须删除的键名在四种位置都会被删，且同层其它字段保留', () => {
  let checked = 0
  MUST_DELETE.forEach((key, index) => {
    const secret = `fixture-secret-${index}`
    // 1) 顶层
    const top = { [key]: secret, safe: 'keep' }
    const outTop = stripStateCredentials(top)
    assert.equal(has(outTop, key), false, `顶层应删除 ${key}`)
    assert.equal(outTop.safe, 'keep', `顶层其它字段保留：${key}`)
    assert.equal(JSON.stringify(outTop).includes(secret), false, `顶层输出不得含值：${key}`)
    // 2) 嵌套对象
    const nested = { outer: { [key]: secret, safe: 'keep' }, keep: 1 }
    const outNested = stripStateCredentials(nested)
    assert.equal(has(outNested.outer, key), false, `嵌套应删除 ${key}`)
    assert.equal(outNested.outer.safe, 'keep', `嵌套其它字段保留：${key}`)
    assert.equal(outNested.keep, 1)
    // 3) 数组元素里的对象
    const inArray = { list: [{ [key]: secret, safe: 'keep' }] }
    const outArray = stripStateCredentials(inArray)
    assert.equal(has(outArray.list[0], key), false, `数组元素应删除 ${key}`)
    assert.equal(outArray.list[0].safe, 'keep', `数组元素其它字段保留：${key}`)
    // 4) 三层深
    const deep = { a: { b: { c: { [key]: secret, safe: 'keep' } } } }
    const outDeep = stripStateCredentials(deep)
    assert.equal(has(outDeep.a.b.c, key), false, `三层深应删除 ${key}`)
    assert.equal(outDeep.a.b.c.safe, 'keep', `三层深其它字段保留：${key}`)
    assert.equal(JSON.stringify(outDeep).includes(secret), false, `三层深输出不得含值：${key}`)
    checked += 4
  })
  assert.ok(MUST_DELETE.length >= 40, `必须删除键名至少 40 个，实际 ${MUST_DELETE.length}`)
  assert.equal(checked, MUST_DELETE.length * 4)
})

// ---- 表二：普通键（含统计键）按当前行为固定 ---------------------------------------
// true = 当前保留；false = 当前被删（其中 token 统计键属于「误伤」，单列在报告里）
const KEEP_TABLE = [
  ['name', true], ['status', true], ['at', true], ['agents', true], ['tasks', true], ['title', true],
  ['costCents', true], ['cost', true], ['costUsd', true], ['count', true], ['level', true], ['missing', true],
  ['stale', true], ['reasons', true], ['projectId', true], ['actor', true], ['role', true], ['summary', true],
  ['ok', true], ['eligible', true], ['blockedBy', true], ['dependencies', true], ['durationMs', true],
  ['startedAt', true], ['endedAt', true], ['items', true], ['queue', true], ['metrics', true], ['budget', true],
  ['accessLevel', true], ['authMode', true], ['author', true],
  // 含 token 字样的统计键：当前会被正则误删
  ['inputTokens', false], ['outputTokens', false], ['cachedInputTokens', false], ['maxTokens', false],
  ['promptTokens', false], ['totalTokens', false], ['tokenCount', false],
  // 看似普通但含敏感子串，当前被误删
  ['tokenizer', false], ['secretary', false], ['authorizationless', false],
]

test('表二：普通键保留、统计键与含敏感子串的普通键按当前行为固定', () => {
  for (const [key, shouldKeep] of KEEP_TABLE) {
    const value = `fixture-keep-${key}`
    const out = stripStateCredentials({ [key]: value, safe: 1 })
    assert.equal(has(out, key), shouldKeep, `${key} 当前行为应为 ${shouldKeep ? '保留' : '删除'}`)
    assert.equal(out.safe, 1, `同层普通字段必须保留：${key}`)
    if (shouldKeep) assert.equal(out[key], value, `保留键的值不应改变：${key}`)
    else assert.equal(JSON.stringify(out).includes(value), false, `被删键的值不得出现：${key}`)
  }
  assert.ok(KEEP_TABLE.filter(([, keep]) => keep).length >= 25, '普通保留键至少 25 个')
})

// ---- 表三：可能漏网的敏感变体（逐项固定当前行为） ---------------------------------
// true = 当前保留（漏网）；false = 当前被删
const VARIANTS = [
  ['to-ken', true], ['tok3n', true], ['TOKEN', false], ['tok\u200ben', true],
  ['pass_word', true], ['passwd', true], ['pwd', true], ['pwdHash', true],
  ['private_key', true], ['privateKey', true], ['privateKeyPath', true], ['signingKey', true],
  ['sessionId', true], ['sessionKey', true], ['session_secret_value', false],
  ['x-api-key', false], ['proxy-authorization', false],
  ['otp', true], ['otpCode', true], ['pin', true], ['pinCode', true],
  ['seed', true], ['mnemonic', true],
]

test('表三：敏感变体逐项固定当前真实行为（漏网清单见报告）', () => {
  const leaks = []
  for (const [key, shouldKeep] of VARIANTS) {
    const value = 'fixture-variant-value'
    const out = stripStateCredentials({ [key]: value, safe: 1 })
    assert.equal(has(out, key), shouldKeep, `${JSON.stringify(key)} 当前行为应为 ${shouldKeep ? '保留' : '删除'}`)
    assert.equal(out.safe, 1)
    if (shouldKeep) {
      assert.equal(out[key], value)
      leaks.push(key)
    }
  }
  assert.ok(VARIANTS.length >= 15, '变体至少 15 个')
  assert.ok(leaks.length >= 10, `当前至少 10 个敏感变体不会被删，实际 ${leaks.length}`)
})

// ---- 其它性质 ---------------------------------------------------------------------

test('不会读取凭据键的 getter；普通键的 getter 会被读取（当前行为）', () => {
  const value = { at: 'fixture', nested: [{ clientSecret: 'fixture', safe: 1 }] }
  Object.defineProperty(value, 'password', { enumerable: true, get() { assert.fail('凭据键 getter 被读取了') } })
  assert.doesNotThrow(() => stripStateCredentials(value))
  const out = stripStateCredentials(value)
  assert.equal(has(out, 'password'), false)
  assert.equal(has(out.nested[0], 'clientSecret'), false)

  const reads = []
  const second = {}
  Object.defineProperty(second, 'plain', { enumerable: true, get() { reads.push('plain'); return 'fixture-plain' } })
  const outSecond = stripStateCredentials(second)
  assert.deepEqual(reads, ['plain'], '当前行为：普通键 getter 会被读取')
  assert.equal(outSecond.plain, 'fixture-plain')
})

test('不修改入参：深度冻结后调用不抛错，原型数据保持不变', () => {
  const input = {
    at: 'fixture',
    agents: [{ id: 'a1', token: 'fixture-token', nested: { apiKey: 'fixture-key', keep: 2 } }],
    counts: { inputTokens: 5, outputCount: 7 },
    values: [null, 42, true, 'fixture'],
  }
  const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
    return value
  }
  deepFreeze(input)
  const snapshot = JSON.stringify(input)
  let output
  assert.doesNotThrow(() => { output = stripStateCredentials(input) })
  assert.equal(JSON.stringify(input), snapshot, '入参不得被修改')
  assert.deepEqual(output, {
    at: 'fixture',
    agents: [{ id: 'a1', nested: { keep: 2 } }],
    counts: { outputCount: 7 },
    values: [null, 42, true, 'fixture'],
  })
})

test('数组顺序与非凭据值原样保留；非对象入参原样返回', () => {
  const list = [{ token: 'fixture', id: 1 }, { id: 2 }, { secret: 'fixture', id: 3 }]
  const out = stripStateCredentials({ list })
  assert.deepEqual(out.list.map((item) => item.id), [1, 2, 3])
  assert.equal(out.list.length, 3)
  assert.deepEqual(out.list[0], { id: 1 })
  assert.equal(stripStateCredentials(null), null)
  assert.equal(stripStateCredentials(undefined), undefined)
  assert.equal(stripStateCredentials(42), 42)
  assert.equal(stripStateCredentials('fixture'), 'fixture')
  assert.equal(stripStateCredentials(true), true)
})

test('循环引用与超深嵌套按当前行为固定（RangeError）', () => {
  const cyclic = { safe: 1 }
  cyclic.self = cyclic
  assert.throws(() => stripStateCredentials(cyclic), RangeError, '循环引用当前会栈溢出')

  const makeDeep = (depth) => {
    const root = { leaf: 1 }
    let cursor = root
    for (let i = 0; i < depth; i++) { cursor.child = {}; cursor = cursor.child }
    return root
  }
  assert.doesNotThrow(() => stripStateCredentials(makeDeep(1000)), '1000 层当前可处理')
  assert.throws(() => stripStateCredentials(makeDeep(5000)), RangeError, '5000 层当前会栈溢出')
})

test('混合快照脱敏后递归搜不到任何已登记凭据键名', () => {
  const mixed = {
    at: 'fixture',
    agents: [{ id: 'a1', token: 'fixture', inputTokens: 3, nested: { apiKey: 'fixture', sessionId: 'fixture' } }],
    list: [{ password: 'fixture', ok: true }],
    counts: { inputTokens: 1, outputTokens: 2, costCents: 9 },
  }
  const out = stripStateCredentials(mixed)
  const text = JSON.stringify(out)
  for (const key of ['token', 'apiKey', 'password', 'secret', 'credential', 'authorization', 'cookie']) {
    assert.equal(text.includes(`"${key}"`), false, `输出不应再含键名 ${key}`)
  }
  assert.equal(text.includes('"sessionId"'), true, '当前行为：sessionId 仍会保留（漏网）')
  assert.equal(text.includes('"inputTokens"'), false, '当前行为：inputTokens 被误删')
  assert.equal(text.includes('"costCents":9'), true, '成本键保留')
})
