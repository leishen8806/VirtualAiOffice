import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PASSWORD_PARAMS,
  countCodePoints,
  hashPassword,
  needsRehash,
  validatePassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from '../tenancy/auth/password.mjs'

test('password hashing uses the required scrypt params and unique salts', async () => {
  const a = await hashPassword('ValidPass123')
  const b = await hashPassword('ValidPass123')
  assert.equal(a.algorithm, 'scrypt')
  assert.equal(a.N, PASSWORD_PARAMS.N)
  assert.equal(a.r, PASSWORD_PARAMS.r)
  assert.equal(a.p, PASSWORD_PARAMS.p)
  assert.equal(a.keyLen, PASSWORD_PARAMS.keyLen)
  assert.notEqual(a.salt, b.salt)
  assert.equal(a.hash === b.hash, false)
})

test('password validation enforces length, username and blacklist rules', () => {
  assert.equal(validatePassword('short', 'user'), '口令至少 12 个字符')
  assert.equal(validatePassword('password123', 'user'), '口令至少 12 个字符')
  assert.equal(validatePassword('aaaaaaaaaaaa', 'user'), '口令过弱')
  assert.equal(validatePassword('same-as-user', 'same-as-user'), '口令不能与用户名相同')
  assert.equal(validatePassword('ValidPass123', 'user'), null)
  assert.equal(countCodePoints('12345678901'), 11)
  assert.equal(countCodePoints('123456789012'), 12)
  assert.equal(countCodePoints('x'.repeat(128)), 128)
  assert.equal(validatePassword('x'.repeat(129), 'user'), '口令不能超过 128 个字符')
})

test('password verification succeeds, fails and detects rehash needs', async () => {
  const record = await hashPassword('ValidPass123')
  assert.equal(await verifyPassword('ValidPass123', record), true)
  assert.equal(await verifyPassword('wrong-pass-123', record), false)
  assert.equal(needsRehash(record), false)
  assert.equal(needsRehash({ ...record, N: 1024 }), true)
})

test('dummy verification keeps nonexistent account cost in the same order of magnitude', async () => {
  const record = await hashPassword('ValidPass123')
  const real = []
  const fake = []
  for (let i = 0; i < 4; i++) {
    let start = process.hrtime.bigint()
    await verifyPasswordOrDummy('ValidPass123', record)
    real.push(Number(process.hrtime.bigint() - start))
    start = process.hrtime.bigint()
    await verifyPasswordOrDummy('ValidPass123', null)
    fake.push(Number(process.hrtime.bigint() - start))
  }
  real.sort((a, b) => a - b)
  fake.sort((a, b) => a - b)
  const realMedian = real[Math.floor(real.length / 2)]
  const fakeMedian = fake[Math.floor(fake.length / 2)]
  const ratio = realMedian > fakeMedian ? realMedian / fakeMedian : fakeMedian / realMedian
  assert.ok(ratio < 2.5, `timing ratio too large: ${ratio}`)
})

test('password records never serialize plaintext secrets', async () => {
  const record = await hashPassword('ValidPass123')
  const serialized = JSON.stringify(record)
  assert.doesNotMatch(serialized, /ValidPass123/)
  assert.doesNotMatch(serialized, /password/i)
})
