import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { LAYOUT_V2 } from '../office-layout.js'
import { buildOfficeShellV2Spec } from '../office-layout-v2-scene.js'

test('O3 shell keeps the rev2 envelope, real door holes and static thin offsets', () => {
  const parts = buildOfficeShellV2Spec(LAYOUT_V2)
  assert.equal(parts.some((part) => part.name === 'office2-south-door-frame' && part.offset >= .12), true)
  assert.equal(parts.some((part) => part.name === 'office2-north-locked-door' && part.locked), true)
  assert.equal(parts.some((part) => part.name === 'office2-south-west' && part.x1 === -2), true)
  assert.equal(parts.some((part) => part.name === 'office2-south-east' && part.x0 === 6), true)
  assert.equal(parts.some((part) => part.dynamic), false)
  assert.ok(parts.filter((part) => part.kind === 'thin').every((part) => part.offset >= .12))
})

test('O3 source stays isolated from network and moving scene concerns', () => {
  const source = fs.readFileSync(new URL('../office-layout-v2-scene.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\s*\(|Math\.random|Date\.now|userData\.dynamic|new (?:Point|Directional|Hemisphere)Light/)
  assert.doesNotMatch(source, /#(?:0d2942|24d7df|d6f8ff)/i)
  assert.doesNotMatch(source, /from ['"]\.\/dr-(?:campus|console)[^'"]*['"]|from ['"]\.\/dr-campus-/i)
  assert.match(source, /office-theme-v2\.js/)
  assert.match(source, /office2-opaque-batch/)
  assert.match(source, /office2-glass-batch/)
})

test('O3 app wiring only creates the candidate shell behind the layout query guard', () => {
  const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const entry = fs.readFileSync(new URL('../office-v2-modules.js', import.meta.url), 'utf8')
  assert.match(source, /startOfficeV2\(\{ THREE, scene/)
  assert.match(entry, /if \(layout.version !== 2\) return null/)
  assert.match(entry, /\['shell', context => buildOfficeShellV2\(\{ \.\.\.context, scene: context.root \}\)\]/)
})
