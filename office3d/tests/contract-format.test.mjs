import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { formatContract, hasContractValues } from '../contract-format.js'
import { parseContract, validateContract } from '../task-contract.mjs'

const valid = {
  项目: 'Virtual AI Office',
  目标: '输出一份可检查的派发契约',
  允许修改: 'ui.js, contract-format.js',
  禁止: 'server.mjs, 读取密钥',
  依赖: '无',
  输入版本: 'v1',
  验收标准: '页面显示契约徽标\nnode 测试全过',
  工具权限: 'node, 浏览器',
  预算上限: '2 次运行 / 30 分钟',
  交付物: '文件与测试证据',
  审核责任人: 'board',
  风险等级: '低',
}

test('browser formatter round trips through the server parser', () => {
  const text = formatContract(valid)
  const parsed = parseContract(text)
  assert.equal(parsed.found, true)
  assert.equal(parsed.contract['项目'], valid['项目'])
  assert.deepEqual(parsed.contract['允许修改'], ['ui.js', 'contract-format.js'])
  assert.deepEqual(parsed.contract['验收标准'], ['页面显示契约徽标', 'node 测试全过'])
  assert.equal(validateContract(parsed.contract).ok, true)
})

test('empty fields produce no contract block and special characters stay one block', () => {
  assert.equal(formatContract({}), '')
  assert.equal(formatContract({ 项目: 'X' }), '')
  assert.equal(formatContract({ 项目: 'X', 目标: '', 验收标准: '' }), '')
  assert.equal(hasContractValues({}), false)
  const untouched = '原始说明：保持逐字节一致'
  const formatted = formatContract({ 项目: 'X' })
  assert.equal(formatted ? `${untouched}\n\n${formatted}` : untouched, untouched)
  const text = formatContract({ ...valid, 目标: '显示 <x>: a\nb 【任务契约】' })
  assert.equal((text.match(/【任务契约】/g) || []).length, 1)
  assert.equal(parseContract(text).contract['目标'], '显示 <x>: a b 任务契约')
})

test('one non-project field creates a complete block and keeps the value', () => {
  const text = formatContract({ 项目: 'X', '风险等级': '低' })
  assert.match(text, /^【任务契约】/)
  assert.equal(parseContract(text).contract['项目'], 'X')
  assert.equal(parseContract(text).contract['风险等级'], '低')
})

test('money risk is supplied by the caller and formatter preserves it', () => {
  const text = formatContract({ ...valid, 风险等级: '资金', 目标: '完成账务迁移' })
  assert.match(text, /风险等级: 资金/)
  assert.equal(parseContract(text).contract['风险等级'], '资金')
})

test('browser formatter is standalone and does not use runtime APIs', () => {
  const source = fs.readFileSync(new URL('../contract-format.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\b(?:document|window|fetch|Math\.random|innerHTML|eval|new Function)\b/)
})
