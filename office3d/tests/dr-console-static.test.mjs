import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (name) => fs.readFileSync(new URL(name, root), 'utf8')

test('DR console is an offline demo-only static page', () => {
  const html = read('dr-console.html')
  const source = [read('dr-console.js'), read('dr-console-data.js'), read('dr-console-map.js')].join('\n')
  assert.match(html, /演示数据 · 模拟/)
  assert.match(html, /dr-console\.js/)
  assert.doesNotMatch(html, /https?:\/\//i)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|Math\.random|Date\.now|eval|new Function)\b/)
  assert.doesNotMatch(source, /\/state\b|\/act\b|\/town\//)
  assert.match(source, /DrConsoleSnapshot v1/)
})
