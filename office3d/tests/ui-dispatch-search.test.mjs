// UI-DISPATCH-SEARCH：派发窗口与「交给」窗口按名字搜索同事
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dispatchChoices } from '../ui.js'

const AGENTS = [
  { id: 'a1', name: 'Lead', title: '协调 Lead', status: 'idle' },
  { id: 'a2', name: 'Frontend1', title: '前端工程师', status: 'idle' },
  { id: 'a3', name: 'GoSenior', title: 'Go 后端资深', status: 'paused' },
  { id: 'a4', name: 'DBEngineer', title: '数据库工程师', status: 'idle', task: 'CMP-1' },
  { id: 'a5', name: 'QReviewer', title: '质量审查员', status: 'error' },
  { id: 'a6', name: 'SecReviewer', title: '安全审查员', liveRun: true },
]
const NAMES = { a1: '林队', a2: '小前', a3: '阿高', a4: '库工', a5: '审查喵', a6: '安全喵' }
const pickList = (opts) => dispatchChoices({ agents: AGENTS, names: NAMES, ...opts })
const englishOf = (r) => r.people.map((p) => p.agent.name)

test('空搜索与原有列表一致：按英文名排序、带状态标签、Lead 与待排期两项在前', () => {
  const r = pickList({ lead: true })
  assert.deepEqual(englishOf(r), ['DBEngineer', 'Frontend1', 'GoSenior', 'Lead', 'QReviewer', 'SecReviewer'])
  assert.deepEqual(r.fixed.map((o) => o.value), ['lead:a1', ''])
  assert.deepEqual(r.fixed.map((o) => o.label), ['交给 Lead 拆解后派发（推荐）', '先放「待排期」，不指派'])
  assert.equal(r.empty, false)
  const labels = Object.fromEntries(r.people.map((p) => [p.agent.name, p.label]))
  assert.equal(labels.Frontend1, '小前 / Frontend1 · 前端工程师 · 空闲')
  assert.equal(labels.GoSenior, '阿高 / GoSenior · Go 后端资深 · 已暂停')
  assert.equal(labels.DBEngineer, '库工 / DBEngineer · 数据库工程师 · 手上有任务')
  assert.equal(labels.QReviewer, '审查喵 / QReviewer · 质量审查员 · 出错')
  assert.equal(labels.SecReviewer, '安全喵 / SecReviewer · 安全审查员 · 执行中')
  assert.equal(pickList({ lead: true, offDuty: true }).people.find((p) => p.agent.name === 'GoSenior').label, '阿高 / GoSenior · Go 后端资深 · 已下班，上班后开始')
})

test('按中文名搜索', () => {
  assert.deepEqual(englishOf(pickList({ query: '小前' })), ['Frontend1'])
  assert.deepEqual(englishOf(pickList({ query: '喵' })), ['QReviewer', 'SecReviewer'])
})

test('按英文名搜索且不区分大小写', () => {
  assert.deepEqual(englishOf(pickList({ query: 'frontend' })), ['Frontend1'])
  assert.deepEqual(englishOf(pickList({ query: 'GOSENIOR' })), ['GoSenior'])
  assert.deepEqual(englishOf(pickList({ query: 'reviewer' })), ['QReviewer', 'SecReviewer'])
})

test('按岗位搜索', () => {
  assert.deepEqual(englishOf(pickList({ query: '前端' })), ['Frontend1'])
  assert.deepEqual(englishOf(pickList({ query: '审查员' })), ['QReviewer', 'SecReviewer'])
  assert.deepEqual(englishOf(pickList({ query: 'go 后端' })), ['GoSenior'])
})

test('搜索词前后空白被忽略，空白搜索等于不过滤', () => {
  assert.deepEqual(englishOf(pickList({ query: '  前端  ' })), ['Frontend1'])
  assert.deepEqual(englishOf(pickList({ query: '   ' })), englishOf(pickList({})))
})

test('没有匹配时 people 为空、empty 为真，但 Lead 与待排期两项保留', () => {
  const r = pickList({ lead: true, query: '查无此人' })
  assert.deepEqual(r.people, [])
  assert.equal(r.empty, true)
  assert.deepEqual(r.fixed.map((o) => o.value), ['lead:a1', ''])
  assert.deepEqual(r.options.map((o) => o.value), ['lead:a1', ''])
  assert.equal(r.selected, '')
})

test('资金类只在 GoSenior / DBEngineer 中搜索，且不出现 Lead 选项', () => {
  assert.deepEqual(englishOf(pickList({ money: true })), ['DBEngineer', 'GoSenior'])
  assert.deepEqual(englishOf(pickList({ money: true, query: '审查员' })), [])
  assert.deepEqual(englishOf(pickList({ money: true, query: '数据库' })), ['DBEngineer'])
  const r = pickList({ money: true, lead: true })
  assert.deepEqual(r.fixed.map((o) => o.value), [''])
  assert.equal(r.options.some((o) => String(o.value).startsWith('lead:')), false)
})

test('预选同事仍被选中；被过滤掉时选中第一个匹配的同事', () => {
  assert.equal(pickList({ pick: 'a2' }).selected, 'a2')
  assert.equal(pickList({ pick: 'a2', query: '前端' }).selected, 'a2')
  assert.equal(pickList({ pick: 'a2', query: '审查员' }).selected, 'a5')
  assert.equal(pickList({ pick: 'a2', money: true }).selected, 'a4')
  assert.equal(pickList({ pick: 'a2', query: '查无此人' }).selected, '')
  assert.equal(pickList({}).selected, '')
})

test('坏输入不抛错', () => {
  assert.deepEqual(dispatchChoices().options, [])
  assert.deepEqual(dispatchChoices({ agents: null, query: null }).people, [])
  assert.equal(dispatchChoices({ agents: AGENTS, query: undefined }).people.length, 6)
})

test('两个窗口都接上搜索框、无匹配提示与键盘操作，且派发规则没被改动', () => {
  const ui = fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
  // assert.match 会把整份 ui.js 打进失败信息里，这里改用 ok + 说明
  const has = (re, why) => assert.ok(re.test(ui), why)
  const count = (re) => (ui.match(re) || []).length
  // 两个下拉各有自己的搜索框与「没有匹配的同事」提示，占位文字按需求文案
  has(/const AGENT_FIND = '搜索同事：中文名 \/ 英文名 \/ 岗位'/, '缺少搜索框占位文案')
  has(/id="dWhoFind" class="one" placeholder="\$\{AGENT_FIND\}"/, '派发窗口缺少同事搜索框')
  has(/id="dWhoFind2" class="one" placeholder="\$\{AGENT_FIND\}"/, '「交给」窗口缺少同事搜索框')
  has(/id="dWhoNone"[^>]*>没有匹配的同事</, '派发窗口缺少无匹配提示')
  has(/id="dWhoNone2"[^>]*>没有匹配的同事</, '「交给」窗口缺少无匹配提示')
  // 两处都走同一套联动：过滤、无匹配禁用按钮、↓ 进下拉、回车选第一个匹配项、默认光标在搜索框
  assert.equal(count(/wireAgentSearch/g), 3, 'wireAgentSearch 应为 1 处定义 + 2 处调用')
  assert.equal(count(/selected: agentId \|\| null/g), 2, '两个窗口都要保留预选同事')
  has(/submit\.disabled = result\.empty/, '无匹配时没有禁用提交按钮')
  has(/e\.key === 'ArrowDown'/, '搜索框缺少 ↓ 进入下拉')
  has(/e\.key === 'Enter'[\s\S]{0,200}draw\(\)\.people\[0\]/, '搜索框回车没有选中第一个匹配项')
  has(/if \(!agentId\) find\.focus\(\)/, '未预选同事时光标没有默认在搜索框')
  has(/if \(!agentId\) find2\.focus\(\)/, '「交给」窗口未预选同事时光标没有默认在搜索框')
  // 服务端契约不变：提交字段与资金类限制照旧
  has(/MONEY_OK = \['GoSenior', 'DBEngineer'\]/, '资金类白名单被改动')
  has(/type: 'create_issue'[\s\S]{0,200}assigneeAgentId: assigneeAgentId \|\| undefined/, '新建任务提交字段被改动')
  has(/type: 'assign', issueId, assigneeAgentId: who, force: openDeps\.length > 0/, '指派提交字段被改动')
  has(/assigneeAgentId\.startsWith\('lead:'\)/, '交给 Lead 的处理被改动')
})
