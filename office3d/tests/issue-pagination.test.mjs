import test from 'node:test'
import assert from 'node:assert/strict'
import { createIssuePager, ISSUE_PAGE_SIZE } from '../issue-pagination.mjs'

const makeIssues = (n) => Array.from({ length: n }, (_, i) => ({ id: `I-${i}`, status: i % 3 ? 'todo' : 'done' }))

// 模拟 Paperclip 列表接口：认 limit / offset，可选按 status 过滤
const pagedGet = (issues, calls = []) => async (url) => {
  calls.push(url)
  const q = new URL(url, 'http://x').searchParams
  const status = q.get('status')
  const rows = status ? issues.filter((i) => i.status === status) : issues
  const offset = Number(q.get('offset')), limit = Number(q.get('limit'))
  return rows.slice(offset, offset + limit)
}

test('分页取全：超过单页上限的卡片全部取到（STANDUP-PAGING 的 500 张截断问题）', async () => {
  const issues = makeIssues(1124)
  const pager = createIssuePager({ company: 'c1', get: pagedGet(issues), warn: () => {} })
  const all = await pager.all()
  assert.equal(all.length, 1124)
  assert.ok(all.some((i) => i.id === 'I-1100'))
})

test('按状态过滤时也分页，并把 status 透传给接口（STATS-DONE 的前 40 条问题）', async () => {
  const issues = makeIssues(450)
  const calls = []
  const pager = createIssuePager({ company: 'c1', get: pagedGet(issues, calls), warn: () => {} })
  const done = await pager.all({ status: 'done' })
  assert.equal(done.length, issues.filter((i) => i.status === 'done').length)
  assert.ok(calls.every((u) => u.includes('status=done') && u.includes(`limit=${ISSUE_PAGE_SIZE}`)))
})

test('接口不认 offset、每页重复时停止，不会死循环也不会重复计数', async () => {
  const issues = makeIssues(250)
  const warnings = []
  const sameFirstPage = async () => issues.slice(0, ISSUE_PAGE_SIZE)
  const pager = createIssuePager({ company: 'c1', get: sameFirstPage, warn: (m) => warnings.push(m) })
  const all = await pager.all()
  assert.equal(all.length, ISSUE_PAGE_SIZE)
  assert.ok(warnings.some((m) => m.includes('repeated a page')))
})

test('同一口径的总数比上次骤降时告警', async () => {
  let issues = makeIssues(300)
  const warnings = []
  const pager = createIssuePager({ company: 'c1', get: async (url) => pagedGet(issues)(url), warn: (m) => warnings.push(m) })
  await pager.all()
  issues = makeIssues(120)
  await pager.all()
  assert.ok(warnings.some((m) => m.includes('total decreased from 300 to 120')))
})

test('兼容 { issues: [...] } 形式的返回体', async () => {
  const issues = makeIssues(130)
  const wrapped = async (url) => ({ issues: await pagedGet(issues)(url) })
  const pager = createIssuePager({ company: 'c1', get: wrapped, warn: () => {} })
  assert.equal((await pager.all()).length, 130)
})
