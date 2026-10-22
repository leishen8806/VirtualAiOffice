import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { OFFICE_THEME_V2 } from '../office-theme-v2.js'

test('office V2 theme exports valid, isolated warm palette and material values', () => {
  const colors = ['floor', 'exteriorWall', 'interiorWall', 'glass', 'trim', 'nameplate', 'nameplateText']
  for (const key of colors) assert.match(OFFICE_THEME_V2[key], /^#[\da-f]{6}$/i, `${key} must be a hex color`)
  assert.ok(OFFICE_THEME_V2.glassOpacity >= .55 && OFFICE_THEME_V2.glassOpacity <= .65)
  assert.ok(OFFICE_THEME_V2.wallRoughness > .5 && OFFICE_THEME_V2.wallRoughness <= 1)
  assert.ok(OFFICE_THEME_V2.glassRoughness >= 0 && OFFICE_THEME_V2.glassRoughness <= 1)

  const source = fs.readFileSync(new URL('../office-theme-v2.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]\.\/dr-(?:campus|console)[^'"]*['"]|from ['"]\.\/dr-campus-/i)
  assert.doesNotMatch(source, /THREE|new (?:Mesh|Color|Texture)Material/)
})
