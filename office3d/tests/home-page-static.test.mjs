import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (name) => fs.readFileSync(new URL(name, root), 'utf8')

test('home page sources stay offline and free of unsafe browser APIs', () => {
  const page = read('home-page.js')
  const room = read('home-room.js')
  const html = read('home.html')
  assert.doesNotMatch(page, /innerHTML|eval\s*\(|new Function|fetch\s*\(|\b(?:buy|purchase|price|balance|wallet)\b/i)
  assert.doesNotMatch(room, /innerHTML|eval\s*\(|new Function|fetch\s*\(|\b(?:buy|purchase|price|balance|wallet)\b/i)
  assert.doesNotMatch(html, /https?:\/\//i)
  assert.match(html, /<title>个人空间（示意）<\/title>/)
  assert.match(html, /home-page\.js/)
})

test('home geometry remains a pure module', () => {
  const source = read('home-room-geometry.mjs')
  assert.doesNotMatch(source, /\b(?:THREE|document|window|fetch|Math\.random|Date\.now)\b/)
})

test('home page references only local modules and does not use work routes', () => {
  const source = read('home-page.js')
  assert.doesNotMatch(source, /['"`]\/(?:state|town\/|act)\b/)
  assert.match(source, /vendor\/three\/three\.module\.js/)
  assert.match(source, /home-room\.js/)
})
