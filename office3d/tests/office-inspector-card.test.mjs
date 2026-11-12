import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8')

test('person picking is resolved before office or warehouse item cards', () => {
  const person = app.indexOf("const hit = ray.intersectObjects(meshes, false)[0]")
  const item = app.indexOf("campusRegistry?.pickWhR1?.(ray)")
  assert.ok(person >= 0 && item > person)
  assert.doesNotMatch(app.slice(person, item), /ray\.ray\)/)
})

test('inspector cards are dismissible and do not capture the canvas', () => {
  assert.match(app, /pointerEvents = 'auto'/)
  assert.match(app, /event\.key !== 'Escape'/)
  assert.match(app, /dataset\.itemId === item\.id/) 
  assert.match(app, /inspector-close/)
})
