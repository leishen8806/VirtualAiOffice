import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHomeStore } from '../town/home-store.mjs'

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'home-store-'))
const clock = () => Date.parse('2026-10-21T01:00:00.000Z')

test('homePath accepts safe owners and rejects traversal, devices, punctuation and case', () => {
  const store = createHomeStore({ dir: mk(), now: clock })
  assert.match(store.homePath('alice_1'), /alice_1\.json$/)
  for (const owner of ['../x', '..', 'Alice', 'con', 'nul.txt', 'a/b', 'a\\b', 'C:x', 'a..b', 'a.', 'a ', 'x'.repeat(41), 'a\u0000b']) {
    assert.throws(() => store.homePath(owner), (error) => error.code === 'invalid_owner_id' || error.code === 'unsafe_path')
  }
})

test('new load returns defaults without creating files and inventory persists on demand', () => {
  const dir = mk()
  const store = createHomeStore({ dir, now: clock })
  const result = store.load('alice')
  assert.equal(result.status, 'new')
  assert.equal(result.layout.revision, 0)
  assert.equal(result.inventory.length, 16)
  assert.equal(fs.existsSync(path.join(dir, 'home', 'alice.json')), false)
  assert.equal(fs.existsSync(path.join(dir, 'home', 'alice.inventory.json')), false)
  store.inventory('alice')
  assert.equal(fs.existsSync(path.join(dir, 'home', 'alice.inventory.json')), true)
})

test('save round trips, revision conflicts, reset preserves inventory and concurrent saves serialize', async () => {
  const store = createHomeStore({ dir: mk(), now: clock })
  const inventory = store.inventory('alice')
  const placement = { itemInstanceId: inventory[0].itemInstanceId, itemId: inventory[0].itemId, cx: 0, cz: 0, rot: 0, layer: 'floor' }
  const first = await store.save('alice', { placements: [placement], expectedRevision: 0 })
  assert.equal(first.ok, true)
  assert.equal(first.layout.revision, 1)
  const conflict = await store.save('alice', { placements: [], expectedRevision: 0 })
  assert.equal(conflict.code, 'revision_conflict')
  const [one, two] = await Promise.all([
    store.save('alice', { placements: [], expectedRevision: 1 }),
    store.save('alice', { placements: [placement], expectedRevision: 1 }),
  ])
  assert.equal([one, two].filter((item) => item.ok).length, 1)
  const beforeReset = store.load('alice').inventory
  const reset = await store.reset('alice', { expectedRevision: 2 })
  assert.equal(reset.ok, true)
  assert.deepEqual(store.load('alice').inventory, beforeReset)
  assert.deepEqual(store.load('alice').layout.placements, [])
})

test('corrupt, oversized and illegal layouts are protected without overwriting source', () => {
  const dir = mk()
  const store = createHomeStore({ dir, now: clock })
  const file = store.homePath('alice')
  fs.writeFileSync(file, '{broken', 'utf8')
  const before = fs.readFileSync(file)
  const corrupt = store.load('alice')
  assert.equal(corrupt.status, 'corrupt')
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(fs.readdirSync(path.join(dir, 'home')).filter((name) => name.includes('.corrupt-')).length, 1)
  fs.writeFileSync(file, 'x'.repeat(64 * 1024 + 1), 'utf8')
  assert.equal(store.load('alice').status, 'corrupt')
  const inventory = store.inventory('alice')
  const illegal = {
    schemaVersion: 1, ownerId: 'alice', revision: 0, updatedAt: null,
    placements: [
      { itemInstanceId: inventory[0].itemInstanceId, itemId: inventory[0].itemId, cx: 0, cz: 0, rot: 0, layer: 'floor' },
      { itemInstanceId: inventory[1].itemInstanceId, itemId: inventory[1].itemId, cx: 0, cz: 0, rot: 0, layer: 'floor' },
    ],
  }
  fs.writeFileSync(file, JSON.stringify(illegal), 'utf8')
  const loaded = store.load('alice')
  assert.equal(loaded.status, 'ok')
  assert.equal(loaded.dropped.total, 1)
  assert.equal(loaded.layout.placements.length, 1)
})

test('invalid saves do not change disk and atomic rename failure cleans temp', async () => {
  const dir = mk()
  const store = createHomeStore({ dir, now: clock })
  const inventory = store.inventory('alice')
  const placement = { itemInstanceId: inventory[0].itemInstanceId, itemId: inventory[0].itemId, cx: 0, cz: 0, rot: 0, layer: 'floor' }
  await store.save('alice', { placements: [placement], expectedRevision: 0 })
  const file = store.homePath('alice')
  const before = fs.readFileSync(file)
  const invalid = await store.save('alice', { placements: [{ ...placement, cx: 99 }], expectedRevision: 1 })
  assert.equal(invalid.ok, false)
  assert.deepEqual(fs.readFileSync(file), before)
  const failing = createHomeStore({
    dir: mk(),
    now: clock,
    fsOps: {
      ...fs,
      renameSync() { throw new Error('rename failed') },
    },
  })
  const failingDir = path.dirname(failing.homePath('alice'))
  fs.writeFileSync(path.join(failingDir, 'alice.inventory.json'), JSON.stringify(inventory), 'utf8')
  await assert.rejects(failing.save('alice', { placements: [], expectedRevision: 0 }), /rename failed/)
  assert.equal(fs.readdirSync(path.join(failing.homePath('alice'), '..')).some((name) => name.endsWith('.tmp')), false)
})

test('symlink escape is rejected when the platform allows symlink creation', () => {
  const dir = mk()
  const outside = mk()
  const home = path.join(dir, 'home')
  fs.mkdirSync(home, { recursive: true })
  try {
    fs.rmSync(home, { recursive: true, force: true })
    fs.symlinkSync(outside, home, 'junction')
  } catch {
    return
  }
  const store = createHomeStore({ dir, now: clock })
  assert.throws(() => store.homePath('alice'), (error) => error.code === 'unsafe_path' || error.code === 'unsafe_home_root')
})

test('source remains pure and avoids forbidden APIs and commerce words', () => {
  const source = fs.readFileSync(new URL('../town/home-store.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|fetch|child_process|eval|innerHTML|process\.env)\b/)
  assert.doesNotMatch(source, /\b(?:buy|purchase|price|balance|wallet)\b/i)
})
