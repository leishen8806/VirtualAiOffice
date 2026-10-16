import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const LEDGER = path.join(ROOT, 'docs/brand/ASSET_LEDGER.md')
const VENDOR = path.join(ROOT, 'public/vendor')
const forbiddenLicense = new Set(['', '-', 'tbd', 'unknown'])
const remoteSources = /cdn\.|unpkg\.com|jsdelivr|cdnjs|esm\.sh|skypack|https:\/\/threejs\.org/i

const read = (file) => fs.readFileSync(file, 'utf8')
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const filesUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(dir, entry.name)
  return entry.isDirectory() ? filesUnder(file) : [file]
})

function ledgerEntries() {
  assert.ok(fs.existsSync(LEDGER), `asset ledger is missing: ${LEDGER}`)
  return read(LEDGER).split(/\r?\n/).flatMap((line) => {
    if (!line.startsWith('|')) return []
    const columns = line.split('|').slice(1, -1).map((column) => column.trim())
    if (columns.length !== 8 || columns[0] === '文件' || /^-+$/.test(columns[0])) return []
    return [{ file: columns[0], license: columns[4], size: Number(columns[6]), checksum: columns[7] }]
  })
}

test('vendored assets match the asset ledger and remain self-contained', () => {
  const entries = ledgerEntries()
  assert.ok(entries.length >= 1, 'asset ledger must contain at least one entry')
  assert.ok(fs.existsSync(VENDOR), `vendor directory is missing: ${VENDOR}`)

  const ledgerFiles = new Set(entries.map((entry) => entry.file))
  for (const entry of entries) {
    const file = path.join(ROOT, entry.file)
    assert.ok(fs.existsSync(file), `ledger file is missing: ${entry.file}`)
    assert.equal(fs.statSync(file).size, entry.size, `byte count mismatch: ${entry.file}`)
    const actual = sha256(file)
    assert.equal(actual, entry.checksum, `checksum mismatch: ${entry.file}; ledger=${entry.checksum} actual=${actual}`)
    assert.ok(!forbiddenLicense.has(entry.license.toLowerCase()), `license must be explicit: ${entry.file}`)
  }

  for (const file of filesUnder(VENDOR)) {
    const relative = path.relative(ROOT, file).replaceAll('\\', '/')
    assert.ok(ledgerFiles.has(relative), `vendor file is not registered: ${relative}`)
    assert.doesNotMatch(relative, /niuma|牛马|shaniu|傻妞/i, `vendor path is forbidden: ${relative}`)
  }

  for (const file of [path.join(ROOT, 'public/index.html'), ...filesUnder(path.join(ROOT, 'public/core')).filter((file) => file.endsWith('.js'))]) {
    assert.doesNotMatch(read(file), remoteSources, `remote CDN source found: ${path.relative(ROOT, file)}`)
  }

  for (const file of filesUnder(path.join(VENDOR, 'three')).filter((file) => file.endsWith('.js'))) {
    const source = read(file)
    for (const match of source.matchAll(/(?:from\s*|import\s*)['\"]([^'\"]+)['\"]/g)) {
      const target = match[1]
      assert.ok(target.startsWith('./') || target.startsWith('../'), `non-relative import in ${path.basename(file)}: ${target}`)
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `missing internal import in ${path.basename(file)}: ${target}`)
    }
  }
})
