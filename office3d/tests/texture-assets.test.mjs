import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(path.join(root, 'assets', 'third-party', 'MANIFEST.json'), 'utf8'))
const metrics = JSON.parse(await readFile(path.join(root, 'assets', 'third-party', 'texture-prep-metrics.json'), 'utf8'))
const expectedSource = '董事会在 ChatGPT 生成，2026-10-22，按 `GPT-texture-redraw-prompts.md` 的提示词；原提示词文本未逐张保存'
const expectedLicense = 'AI 生成，由董事会按其账号适用的 OpenAI 使用条款使用；无第三方许可'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase()

function dimensions(buffer) {
  if (buffer.subarray(1, 4).toString() === 'PNG') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'unsupported image format')
  let offset = 2
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue }
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  throw new Error('JPEG size marker missing')
}

test('AS2-0 registers all 14 processed textures without replacing AS1-2', async () => {
  assert.equal(manifest.packages.some((entry) => entry.id === 'kenney-car-kit'), true)
  assert.equal(manifest.textures.length, 14)
  assert.equal(new Set(manifest.textures.map((entry) => entry.id)).size, 14)
  for (const entry of manifest.textures) {
    assert.equal(entry.source, expectedSource)
    assert.equal(entry.license, expectedLicense)
    assert.match(entry.originalSha256, /^[A-F0-9]{64}$/)
    assert.match(entry.outputSha256, /^[A-F0-9]{64}$/)
  }
})

test('AS2-0 output directories contain only registered textures for their product line', async () => {
  const locations = { office: 'office-v2', campus: 'dr-campus' }
  for (const [line, directory] of Object.entries(locations)) {
    const actual = (await readdir(path.join(root, 'assets', 'textures', directory))).sort()
    const registered = manifest.textures.filter((entry) => entry.productLine === line).map((entry) => path.basename(entry.outputFile)).sort()
    // LOOK R2 approves one additional owned atlas; the original fourteen AS2 entries stay frozen.
    if (line === 'office') {
      const office = JSON.parse(await readFile(path.join(root, 'office-vis2', 'MANIFEST.json'), 'utf8'))
      const atlas = office.textures.find(entry => entry.file === 'assets/textures/office-v2/leaf-atlas-v2.png')
      assert.ok(atlas)
      const bytes = await readFile(path.join(root, atlas.file))
      assert.equal(sha256(bytes), 'ABB107B0C9731E2351D17FF5FAE512D3D59007592630F8A453970FAE7EF53934')
      assert.equal(atlas.sha256, sha256(bytes))
      assert.deepEqual(dimensions(bytes), { width: 1774, height: 887 })
      registered.push('leaf-atlas-v2.png'); registered.sort()
    }
    assert.deepEqual(actual, registered)
    assert.equal(actual.length, line === 'office' ? 8 : 7)
    for (const entry of manifest.textures.filter((item) => item.productLine === line)) {
      assert.equal(entry.outputFile.startsWith(`assets/textures/${directory}/`), true, entry.outputFile)
    }
  }
})

test('AS2-0 output hashes, dimensions and byte budgets match disk', async () => {
  const totals = { office: 0, campus: 0 }
  for (const entry of manifest.textures) {
    const file = path.join(root, entry.outputFile)
    const buffer = await readFile(file)
    const disk = await stat(file)
    const size = dimensions(buffer)
    assert.equal(sha256(buffer), entry.outputSha256, entry.outputFile)
    assert.deepEqual(size, { width: entry.width, height: entry.height })
    assert.ok(Math.max(size.width, size.height) <= 1024, entry.outputFile)
    assert.ok(disk.size <= 400 * 1024, `${entry.outputFile}: ${disk.size}`)
    assert.equal(disk.size, entry.bytes)
    totals[entry.productLine] += disk.size
  }
  assert.ok(totals.office <= 3 * 1024 * 1024, `office total: ${totals.office}`)
  assert.ok(totals.campus <= 3 * 1024 * 1024, `campus total: ${totals.campus}`)
})

test('AS2-0 generated metrics prove each tiling texture meets the seam target', () => {
  assert.equal(metrics.textures.length, 14)
  for (const entry of metrics.textures.filter((item) => item.tile)) {
    assert.equal(entry.seam.pass, true, entry.id)
    assert.ok(entry.seam.after.lr <= entry.seam.after.lrReference * 1.5, `${entry.id} left/right`)
    assert.ok(entry.seam.after.tb <= entry.seam.after.tbReference * 1.5, `${entry.id} top/bottom`)
  }
})

test('AS2-0 keeps alpha atlases transparent and records their assessment', () => {
  const atlases = manifest.textures.filter((entry) => entry.alpha)
  assert.equal(atlases.length, 2)
  for (const entry of atlases) {
    assert.equal(path.extname(entry.outputFile), '.png')
    assert.ok(entry.alphaAssessment.transparentRatio > 0.1)
    assert.ok(['可用', '待重绘'].includes(entry.alphaAssessment.status))
  }
})

test('AS2-0 remains disconnected from scene modules and the default route', async () => {
  const sceneModules = [
    'app.js', 'warehouse-shell.js', 'dr-campus-shell.js', 'dr-campus-registry.js', 'dr-campus-racks.js',
    'dr-campus-motion.js', 'dr-campus-motion-logic.js', 'dr-campus-modules.js', 'dr-campus-interior.js',
    'office-v2-registry.js', 'office-v2-modules.js'
  ]
  for (const file of sceneModules) {
    const source = await readFile(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /assets\/textures\/(?:office-v2|dr-campus)|texture-preview|texture-prep/, file)
  }
  const entrySources = await Promise.all(['index.html', 'app.js', 'ui.js'].map((file) => readFile(path.join(root, file), 'utf8')))
  const textureRequests = entrySources.flatMap((source) => source.match(/assets\/textures\/(?:office-v2|dr-campus)\/[^'"`)\s]+/g) || [])
  assert.deepEqual(textureRequests, [], 'default page route snapshot must add zero texture requests')
})

test('AS2-0 preview is local-only and exposes both product tabs', async () => {
  const source = await readFile(path.join(root, 'texture-preview.html'), 'utf8')
  assert.match(source, />办公区</)
  assert.match(source, />仓配</)
  assert.match(source, /3×3 平铺预览/)
  assert.doesNotMatch(source, /https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket/)
})
