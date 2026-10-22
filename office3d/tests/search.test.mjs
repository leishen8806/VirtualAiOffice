import test from 'node:test'
import assert from 'node:assert/strict'
import { searchGroups, recentGroups } from '../search.js'

const groups = [{ key: 'tasks', label: '任务', items: [
  { kind: 'task', id: 'CMP-123', title: '数据库提现流程', search: 'DBE' },
  { kind: 'task', id: 'CMP-195', title: '晨会同步' },
  { kind: 'task', id: 'CMP-12', title: '提现页面' },
  { kind: 'task', id: 'CMP-9', title: '其他' },
] }, { key: 'people', label: '同事', items: [{ kind: 'person', id: 'DBE', title: '数据库工程师' }] }]

test('numeric input matches task number without CMP prefix', () => assert.equal(searchGroups('195', groups)[0].items[0].id, 'CMP-195'))
test('Chinese substring and multi-word AND matching', () => {
  assert.equal(searchGroups('提现', groups)[0].items.length, 2)
  assert.equal(searchGroups('数据库 DBE', groups)[0].items[0].id, 'CMP-123')
})
test('ranking prefers exact id, then title prefix, then contains', () => {
  const result = searchGroups('12', groups)[0].items
  assert.equal(result[0].id, 'CMP-12')
})
test('empty input returns recent items', () => {
  const result = recentGroups(groups, [{ kind: 'task', id: 'CMP-195' }])
  assert.equal(result[0].items[0].id, 'CMP-195')
})
test('search data remains data, so HTML characters are not executable', () => {
  const result = searchGroups('<img>', [{ key: 'x', label: 'X', items: [{ kind: 'task', id: '1', title: '<img>' }] }])
  assert.equal(result[0].items[0].title, '<img>')
})
test('UUID ids are not searchable substrings', () => {
  const result = searchGroups('239', [{ key: 'people', label: '同事', items: [{ kind: 'person', id: '12345678-2390-4abc-8def-123456789012', title: 'Go 工程师' }] }])
  assert.equal(result.length, 0)
})
