import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
test('page and pure helper are isolated from warehouse components and forbidden APIs', () => {
  for (const file of ['command-view.html', 'command-view.js', 'command-view-render.js']) {
    assert.doesNotMatch(read(file), /dr-console|https?:\/\/|innerHTML|document\.cookie|sessionStorage|child_process|\beval\s*\(|Math\.random/)
  }
  assert.doesNotMatch(read('command-view-render.js'), /\bfetch\b|Date\.now|document|localStorage|setTimeout/)
})
test('page requests only two same-origin command endpoints and uses tested browser helper directly', () => {
  const source = read('command-view.js')
  assert.match(source, /from '\.\/command-view-render\.js'/)
  assert.equal((source.match(/\bfetch\(/g) || []).length, 1)
  assert.match(source, /read\('\/command-view\/scenarios'/)
  assert.match(source, /read\(`\/command-view\?\$\{query\}`/)
  assert.doesNotMatch(source, /\/state|\/act|Paperclip|\/town\//)
  assert.match(source, /localStorage\.setItem\('vao\.command\.theme', theme\)/)
})
test('default synthetic warning, separate light/dark palette and mobile panels are declared', () => {
  const html = read('command-view.html')
  assert.match(html, /合成演示 · 非真实数据/)
  assert.match(html, /--bg:#f4f6f8/)
  assert.match(html, /--bg:#101820/)
  assert.match(html, /@media\(max-width:640px\)/)
  assert.match(html, /min-height:44px/)
  assert.match(html, /overflow-x:clip/)
  assert.match(html, /role="tablist" aria-label="手机视图"/)
  assert.match(html, /id="timelineGap"/)
})
test('requests abort on mode switch, timeout and hiding; animation intervals are safe', () => {
  const source = read('command-view.js')
  assert.match(source, /controller\?\.abort\(\)/)
  assert.match(source, /ticket !== epoch/)
  assert.match(source, /document\.hidden/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /}, 1800\)/)
  assert.match(source, /clearTimeout\(timer\)/)
  assert.match(source, /尚未授权 live 数据范围/)
  assert.match(source, /指挥视图未开启（本机管理员可在服务端开启）/)
})
test('governance entry is permission gated at creation, click and state update', () => {
  const source = read('ui.js')
  const start = source.indexOf("const commandEntry = document.createElement('button')")
  assert.ok(start > source.indexOf('async function openGovernance()'))
  assert.match(source.slice(start - 220, start), /canShowHomeEntry/)
  assert.match(source.slice(start, start + 850), /window\.open\('\/command-view\.html', '_blank', 'noopener'\)/)
  assert.match(source, /if \(\$\('commandEntry'\)\) \$\('commandEntry'\)\.hidden = !canShowHomeEntry/)
  assert.doesNotMatch(read('command-view.html'), /src="[^"]*\.mjs/)
})
