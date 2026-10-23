import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (name) => fs.readFileSync(new URL(name, root), 'utf8')

test('DR console is an offline demo-only static page', () => {
  const html = read('dr-console.html')
  const source = [read('dr-console.js'), read('dr-console-data.js'), read('dr-console-map.js'), read('dr-cambodia-outline.js'), read('dr-console-demo.js'), read('dr-console-render.js')].join('\n')
  assert.match(html, /演示数据 · 模拟/)
  assert.match(html, /dr-console\.js/)
  assert.doesNotMatch(html, /https?:\/\//i)
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|Math\.random|Date\.now|eval|new Function)\b/)
  assert.doesNotMatch(source, /\/state\b|\/act\b|\/town\//)
  assert.match(source, /DrConsoleSnapshot v1/)
})

test('reference dashboard uses high-quality independent image slots and identifies design imagery', () => {
  const imageFiles = [
    'assets/demo/dr-campus-reference.webp',
    'assets/demo/dr-cam-overview.webp',
    'assets/demo/dr-cam-d1.webp',
    'assets/demo/dr-cam-d3.webp',
    'assets/demo/dr-cam-entry.webp',
    'assets/demo/dr-cam-w1.webp',
  ]
  const jpegBytes = fs.statSync(
    new URL('assets/demo/dr-campus-reference.jpg', root),
  ).size
  for (const file of imageFiles) {
    const bytes = fs.statSync(new URL(file, root)).size
    assert.ok(bytes > jpegBytes, `${file} must preserve more source detail`)
    assert.ok(bytes < 1000000, `${file} must remain below 1 MB`)
  }
  const html = read('dr-console.html')
  // D-V1：主图由「仓配剖面参考」改为 W1/W2/W3 园区全景；剖面参考仅保留 .sceneThumb 兜底（jpg）。
  assert.match(html, /\.panorama\{[^}]*dr-cam-overview\.webp/)
  assert.match(html, /dr-campus-reference\.jpg/)
  assert.match(html, /background-image:image-set\(/)
  assert.match(html, /\.sceneThumb\{background-repeat:no-repeat;background-size:contain/)
  assert.ok(html.includes(
    '.videoGrid .sceneThumb.camera-d1,.videoGrid .sceneThumb.camera-d3,.videoGrid .sceneThumb.camera-entry,.videoGrid .sceneThumb.camera-w1{background-size:contain',
  ))
  for (const slot of ['overview', 'd1', 'd3', 'entry', 'w1']) {
    assert.match(html, new RegExp(`dr-cam-${slot}\\.webp`))
    assert.match(html, new RegExp(`camera-${slot}`))
  }
  assert.match(html, /模拟占位/)
  assert.match(html, /设计参考图 · 非实景/)
  assert.match(html, /设计图 · 非直播/)
  assert.match(html, /aria-label="筛选 W1 智慧云仓"/)
  assert.doesNotMatch(read('dr-console.js'), /(?:import|from)\s*['"].*(?:app|ui|office-layout)\.js/)
})

test('every local image path referenced by the page exists', () => {
  const html = read('dr-console.html')
  const paths = new Set(
    [...html.matchAll(/url\(\s*(['"]?)(\/[^'")]+)\1\s*\)/g)]
      .map((match) => match[2])
      .filter((path) => /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path)),
  )
  assert.ok(paths.size > 0, 'page must reference at least one local image')
  for (const path of paths) {
    const fileUrl = new URL(path.slice(1), root)
    assert.equal(
      fs.existsSync(fileUrl),
      true,
      `referenced image must exist: ${path}`,
    )
  }
})

test('large-screen typography scales at 1920, 2560 and 3840 without changing mobile rules', () => {
  const html = read('dr-console.html')
  assert.match(html, /--screen-unit:clamp\(1px,.052083vw,2px\)/)
  assert.match(html, /body\{font-size:calc\(12 \* var\(--screen-unit\)\)/)
  assert.match(html, /\.label\{font-size:\.88em\}/)
  assert.match(html, /\.eventsTable\{font-size:\.9em\}/)
  assert.match(html, /@media\(min-width:1600px\)/)
  assert.match(html, /@media\(max-width:767px\)\{body\{font-size:12px\}/)
  assert.match(read('dr-console-map.js'), /<svg viewBox="0 0 520 270"/)
})
