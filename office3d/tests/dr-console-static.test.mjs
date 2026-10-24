import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
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
    'assets/demo/dr-cam-site.jpg',
    'assets/demo/dr-cam-d1.jpg',
    'assets/demo/dr-cam-d3.jpg',
    'assets/demo/dr-cam-entry.jpg',
    'assets/demo/dr-cam-w1.jpg',
  ]
  for (const file of imageFiles) {
    const bytes = fs.statSync(new URL(file, root)).size
    assert.ok(bytes > 0, `${file} must be non-empty`)
    assert.ok(bytes < 500000, `${file} must remain below 500 KB`)
  }
  const html = read('dr-console.html')
  // D-V1：主图 = W1/W2/W3 园区鸟瞰裁剪图；剖面参考仅保留 .sceneThumb 兜底（jpg）。
  assert.match(html, /\.panorama\{[^}]*dr-campus-hero\.jpg/)
  assert.match(html, /dr-campus-reference\.jpg/)
  assert.match(html, /\.sceneThumb\{background-repeat:no-repeat;background-size:cover/)
  assert.ok(html.includes(
    '.videoGrid .sceneThumb.camera-d1,.videoGrid .sceneThumb.camera-d3,.videoGrid .sceneThumb.camera-entry,.videoGrid .sceneThumb.camera-w1{background-size:cover',
  ))
  for (const slot of ['site', 'd1', 'd3', 'entry', 'w1']) {
    assert.match(html, new RegExp(`dr-cam-${slot}\\.jpg`))
  }
  for (const cls of ['overview', 'd1', 'd3', 'entry', 'w1']) {
    assert.match(html, new RegExp(`camera-${cls}`))
  }
  assert.match(html, /设计参考 · 非实时/)
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

test('hero campus image content matches INDEX and is not the section image', () => {
  const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(new URL(file, root))).digest('hex')
  const INDEX = JSON.parse(read('assets/demo/INDEX.json'))
  const hero = INDEX.assets.find((a) => a.file === 'dr-campus-hero.jpg')
  assert.ok(hero, 'INDEX must register dr-campus-hero.jpg')
  assert.equal(sha256('assets/demo/dr-campus-hero.jpg'), hero.sha256, 'hero file sha256 must equal INDEX value')
  assert.notEqual(hero.sha256, INDEX.sectionImageSha256, 'hero must not be the section image')
  assert.ok(!hero.sha256.startsWith('41e5ecbb'), 'hero must not be the byte-identical section webp')
  // INDEX 里登记的哈希必须与实际文件哈希一致，且必须覆盖 assets/demo 下全部演示图片
  const dirFiles = fs.readdirSync(new URL('assets/demo/', root)).filter((f) => f !== 'INDEX.json').sort()
  const indexedFiles = INDEX.assets.map((a) => a.file).sort()
  assert.deepEqual(indexedFiles, dirFiles, 'INDEX must list every demo asset file exactly once')
  for (const a of INDEX.assets) {
    assert.equal(sha256('assets/demo/' + a.file), a.sha256, `${a.file} sha256 mismatch vs INDEX`)
  }
  assert.equal(sha256('assets/demo/dr-campus-reference.jpg'), INDEX.dashboard6_0FullSha256, 'full dashboard sha256 must match INDEX')
  // 主图文件必须不等于剖面图文件
  const html = read('dr-console.html')
  assert.match(html, /dr-campus-hero\.jpg/)
  assert.doesNotMatch(html, /\.panorama\{[^}]*dr-cam-overview\.webp/)
})

test('D-V1-R5 layout: sidebar opaque, narrow offset, network panel moved to KPI row right', () => {
  const html = read('dr-console.html')
  // 桌面侧栏完全不透明
  assert.doesNotMatch(html, /#063758ed|#05192bee/, 'aside background must be opaque (no alpha)')
  // 窄屏主图偏移
  assert.match(html, /\.panorama\{top:45px;height:250px;background-size:cover;background-position:-62px center\}/)
  // networkPanel 不再是 .hero 的后代：hero 的 </section> 必须出现在 networkPanel 之前
  const heroClose = html.indexOf('</article></section>')
  const netStart = html.indexOf('<article class="panel networkPanel">')
  assert.ok(heroClose !== -1 && netStart !== -1 && heroClose < netStart, 'networkPanel must be outside .hero')
  // 1024 段规则位于覆盖它的 min-width:768px 块之后
  const m1024 = html.indexOf('@media(min-width:768px) and (max-width:1024px)')
  const m768panorama = html.indexOf('@media(min-width:768px){')
  const centerPos = html.indexOf('.panorama{background-image:url(\'/assets/demo/dr-campus-hero.jpg\');background-size:cover;background-position:center}')
  assert.ok(m1024 > centerPos, '1024 rule must come after the min-width:768px .panorama rule')
  // 网格两列 + networkPanel 跨行
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) 24%/)
  assert.match(html, /\.networkPanel\{position:relative;grid-column:2;grid-row:2\/span 2;/)
})

test('D-V2-C1-R1 无旧百分比 background-size（监控窗不再放大）', () => {
  const html = read('dr-console.html')
  assert.doesNotMatch(html, /\.sitePanel \.sceneThumb\{[^}]*background-size:\d+(\.\d+)?%/, 'sitePanel 不应再有百分比 background-size')
  assert.doesNotMatch(html, /\.videoGrid \.sceneThumb:nth-child\([^)]*\)\{[^}]*background-size:\d+(\.\d+)?%/, 'videoGrid nth-child 不应再有百分比 background-size')
  assert.doesNotMatch(html, /619\.26%|760%|648\.97%|696\.67%|627\.33%|1147\.56%/, '不应残留整图百分比抠图值')
})
