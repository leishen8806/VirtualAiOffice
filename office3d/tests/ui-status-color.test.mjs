// CMP-590 / UI-STATUS-COLOR：任务状态用不同颜色显示。颜色之外必须保留中文状态文字（色盲友好），
// 并且只有已知状态才允许把状态值写进 class，避免服务端字符串进入 HTML 属性。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { statusBadge } from '../ui.js'

const CASES = [
  ['todo', '待开始'],
  ['in_progress', '进行中'],
  ['in_review', '待验收'],
  ['blocked', '阻塞'],
  ['done', '已完成'],
  ['backlog', '待排期'],
  ['cancelled', '已取消'],
]

test('C-1 七个状态各自得到状态类与中文名', () => {
  for (const [status, label] of CASES) {
    assert.equal(statusBadge(status), `<span class="st-badge st-${status}">${label}</span>`)
  }
})

test('C-1 未知状态回落到默认文字色，且不把状态值写进 class', () => {
  assert.equal(statusBadge('weird_state'), '<span class="st-badge">weird_state</span>')
  assert.equal(statusBadge(''), '<span class="st-badge"></span>')
  assert.equal(statusBadge(null), '<span class="st-badge"></span>')
  assert.equal(statusBadge(undefined), '<span class="st-badge"></span>')
  // 原型链上的名字不算已知状态
  assert.equal(statusBadge('constructor'), '<span class="st-badge">constructor</span>')
})

test('C-1 未知状态里的 HTML 被转义，不能注入标签或属性', () => {
  assert.equal(statusBadge('<script>alert(1)</script>'), '<span class="st-badge">&lt;script&gt;alert(1)&lt;/script&gt;</span>')
  assert.equal(statusBadge('" onmouseover="x'), '<span class="st-badge">&quot; onmouseover=&quot;x</span>')
  for (const out of ['<script>alert(1)</script>', '" onmouseover="x', 'a"b<c>'].map(statusBadge)) {
    assert.equal(out.match(/</g).length, 2, `只应有 <span> 与 </span> 两个标签起始符：${out}`)
  }
})

test('C-1 三处状态显示都改用 statusBadge，任务标题仍被转义', () => {
  const ui = fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  // 勘察 B / C / D：任务列表卡片、任务详情 meta 行、「交给」窗口依赖
  assert.match(ui, /<div class="meta">\$\{projTag\(d\.projectId\)\}\$\{statusBadge\(d\.status\)\}/)
  assert.match(ui, /依赖：.*statusBadge\(b\.status\)/)
  assert.match(ui, /card\('task', t\.id,/)
  assert.equal(ui.match(/statusBadge\(/g).length, 4) // 1 处定义 + 勘察 B / C / D 三处调用
  // 状态文字不再有未经标签包装的裸插值
  assert.doesNotMatch(ui, /esc\(STATUS\[/)
  // card() 仍然转义用户内容（标题、负责人）
  assert.match(ui, /<div class="ti">\$\{esc\(title\)\}<\/div><div class="m">\$\{esc\(meta\)\}<\/div>/)
})

test('C-1 index.html 为七个状态定义颜色，阻塞红 / 进行中绿 / 待验收琥珀 / 待开始蓝', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /\.st-badge \{/)
  for (const [status] of CASES) assert.match(html, new RegExp(`\\.st-badge\\.st-${status} \\{`))
  const rule = (status) => html.match(new RegExp(`\\.st-badge\\.st-${status} \\{([^}]*)\\}`))[1]
  assert.match(rule('blocked'), /255,\s*93,\s*93/) // --bad #ff5d5d
  assert.match(rule('in_progress'), /53,\s*208,\s*127/) // --ok #35d07f
  assert.match(rule('in_review'), /255,\s*176,\s*32/) // --warn #ffb020
  assert.match(rule('todo'), /111,\s*168,\s*255/) // --info #6fa8ff
  assert.match(rule('cancelled'), /text-decoration:\s*line-through/)
  // 不新增颜色体系：不引入新的 CSS 变量
  assert.doesNotMatch(html, /--status-[a-z]+:/)
})
