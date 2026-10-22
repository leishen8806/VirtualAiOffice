import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(crypto.scrypt)

export const PASSWORD_PARAMS = Object.freeze({
  algorithm: 'scrypt',
  N: 32768,
  r: 8,
  p: 1,
  keyLen: 32,
  maxmem: 64 * 1024 * 1024,
})

export const PASSWORD_BLACKLIST = Object.freeze([
  'password',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin1234',
  'letmein123',
  'changeme123',
])

const RECORD_KEYS = ['algorithm', 'N', 'r', 'p', 'keyLen', 'salt', 'hash']
const DUMMY_SALT = Buffer.alloc(16, 7)
const DUMMY_HASH = crypto.scryptSync('dummy-password', DUMMY_SALT, PASSWORD_PARAMS.keyLen, PASSWORD_PARAMS).toString('base64')
const DUMMY_RECORD = Object.freeze({
  algorithm: PASSWORD_PARAMS.algorithm,
  N: PASSWORD_PARAMS.N,
  r: PASSWORD_PARAMS.r,
  p: PASSWORD_PARAMS.p,
  keyLen: PASSWORD_PARAMS.keyLen,
  salt: DUMMY_SALT.toString('base64'),
  hash: DUMMY_HASH,
})

function countCodePoints(text) {
  return Array.from(String(text || '')).length
}

function weakPassword(password, username) {
  const normalized = String(password || '').toLowerCase()
  if (!normalized) return '口令不能为空'
  if (countCodePoints(password) < 12) return '口令至少 12 个字符'
  if (countCodePoints(password) > 128) return '口令不能超过 128 个字符'
  if (username && normalized === String(username).toLowerCase()) return '口令不能与用户名相同'
  if (/^(.)\1+$/.test(normalized)) return '口令过弱'
  if (PASSWORD_BLACKLIST.includes(normalized)) return '口令过弱'
  return null
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null
  for (const key of RECORD_KEYS) if (!(key in record)) return null
  if (record.algorithm !== PASSWORD_PARAMS.algorithm) return null
  if (!Number.isInteger(record.N) || !Number.isInteger(record.r) || !Number.isInteger(record.p) || !Number.isInteger(record.keyLen)) return null
  let salt = null
  let hash = null
  try {
    salt = Buffer.from(record.salt, 'base64')
    hash = Buffer.from(record.hash, 'base64')
  } catch {
    return null
  }
  if (salt.length !== 16 || hash.length !== record.keyLen || record.keyLen !== 32) return null
  return {
    algorithm: record.algorithm,
    N: record.N,
    r: record.r,
    p: record.p,
    keyLen: record.keyLen,
    salt,
    hash,
  }
}

async function derive(password, normalized) {
  return Buffer.from(await scryptAsync(String(password), normalized.salt, normalized.keyLen, {
    N: normalized.N,
    r: normalized.r,
    p: normalized.p,
    maxmem: PASSWORD_PARAMS.maxmem,
  }))
}

export function validatePassword(password, username = '') {
  return weakPassword(password, username)
}

export async function hashPassword(password, { randomBytesImpl = crypto.randomBytes } = {}) {
  const weak = validatePassword(password)
  if (weak) throw new Error(weak)
  const salt = randomBytesImpl(16)
  const hash = Buffer.from(await scryptAsync(String(password), salt, PASSWORD_PARAMS.keyLen, PASSWORD_PARAMS))
  return Object.freeze({
    algorithm: PASSWORD_PARAMS.algorithm,
    N: PASSWORD_PARAMS.N,
    r: PASSWORD_PARAMS.r,
    p: PASSWORD_PARAMS.p,
    keyLen: PASSWORD_PARAMS.keyLen,
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  })
}

export function needsRehash(record) {
  const normalized = normalizeRecord(record)
  if (!normalized) return true
  return normalized.N !== PASSWORD_PARAMS.N || normalized.r !== PASSWORD_PARAMS.r || normalized.p !== PASSWORD_PARAMS.p || normalized.keyLen !== PASSWORD_PARAMS.keyLen
}

export async function verifyPassword(password, record) {
  const normalized = normalizeRecord(record)
  if (!normalized || countCodePoints(password) > 128) return false
  const derived = await derive(password, normalized)
  return crypto.timingSafeEqual(derived, normalized.hash)
}

export async function verifyPasswordOrDummy(password, record) {
  const target = normalizeRecord(record) || normalizeRecord(DUMMY_RECORD)
  const derived = await derive(password, target)
  return normalizeRecord(record) ? crypto.timingSafeEqual(derived, target.hash) : false
}

export { countCodePoints, normalizeRecord }
