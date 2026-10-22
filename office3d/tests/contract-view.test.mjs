import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { summarizeContracts } from '../contract-view.mjs'

const contract = (extra = '') => `【任务契约】
项目: Virtual AI Office
目标: 页面显示契约摘要
允许修改: ui.js
禁止: 读取密钥
依赖: 无
验收标准:
- 页面显示完整标签且测试全过
工具权限: 读写工作区文件
预算上限: 2 次运行
交付物: ui.js
审核责任人: Reviewer
风险等级: 低
${extra}`

test('summarizes complete, incomplete and none without free text', () => {
  const result = summarizeContracts([
    { identifier: 'CMP-1', status: 'todo', projectId: 'p1', description: contract() },
    { identifier: 'CMP-2', status: 'blocked', projectId: 'p1', description: contract().replace('预算上限: 2 次运行', '预算上限: <填写>') },
    { identifier: 'CMP-3', status: 'done', projectId: 'p2', description: '标题秘密正文描述' },
  ], { now: 1000 })
  assert.deepEqual({ total: result.total, withContract: result.withContract, complete: result.complete, incomplete: result.incomplete, none: result.none, truncated: result.truncated }, { total: 3, withContract: 2, complete: 1, incomplete: 1, none: 1, truncated: false })
  assert.deepEqual(result.items[1].errors, [{ field: '预算上限', code: 'required' }, { field: '预算上限', code: 'no_budget' }])
  assert.doesNotMatch(JSON.stringify(result), /标题秘密正文描述/)
  assert.doesNotMatch(JSON.stringify(result), /页面显示契约摘要/)
  assert.equal(result.byProject.p1.incomplete, 1)
})

test('money false positive and malformed input are safe', () => {
  const result = summarizeContracts([
    { identifier: 'CMP-4', status: 'todo', projectId: 'p', description: contract().replace('目标: 页面显示契约摘要', '目标: 完成安全检查').replace('交付物: ui.js', '交付物: 安全扫描报告') },
    null,
    { id: 'CMP-6', status: null, description: null },
  ], { now: 1000 })
  assert.equal(result.items[0].state, 'complete')
  assert.equal(result.items[1].state, 'none')
  assert.equal(result.items[2].status, 'unknown')
})

test('caps processing at 500 and marks truncation', () => {
  const tasks = Array.from({ length: 501 }, (_, index) => ({ identifier: `CMP-${index}`, status: 'todo', description: null }))
  const result = summarizeContracts(tasks)
  assert.equal(result.total, 501)
  assert.equal(result.items.length, 500)
  assert.equal(result.truncated, true)
})

test('pure module has no IO or time side effects', () => {
  const source = fs.readFileSync(new URL('../contract-view.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:fetch|Date\.now|Math\.random|child_process|fs|process\.env)\b/)
})
