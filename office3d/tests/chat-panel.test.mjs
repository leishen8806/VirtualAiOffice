import test from 'node:test'
import assert from 'node:assert/strict'
import { countChatText, chatQuotaText, chatStatusText, panelSuggestion, chatPanelHtml } from '../chat-panel.js'

test('额度、状态、计数与建议任务文案', () => {
  assert.equal(countChatText('你好'), '2/600')
  assert.equal(chatQuotaText({ hour: 2, hourLimit: 6, day: 9, dayLimit: 60 }), '本小时 2/6 · 今日 9/60')
  assert.equal(chatStatusText({ status: 'paused' }, true), '下班了，明天 8:30 后回复')
  assert.equal(chatStatusText({ status: 'idle' }, true), '空闲')
  assert.deepEqual(panelSuggestion('建议任务：修复布局｜手机端溢出'), { title: '修复布局', note: '手机端溢出' })
})

test('面板转义数据、显示关闭态与完整消息状态', () => {
  const off = chatPanelHtml({ enabled: false, agent: { name: '<Lead>' } }); assert.match(off, /&lt;Lead&gt;/); assert.match(off, /未开启/)
  const html = chatPanelHtml({ enabled: true, agent: { name: 'PM', status: 'idle' }, quota: {}, pending: true, messages: [{ id: '1', at: '2026-10-20T01:00:00Z', role: 'agent', text: '<img src=x>', status: 'replied', suggestion: { title: '修复', note: '' } }] })
  assert.ok(!html.includes('<img src=x>')); assert.match(html, /&lt;img src=x&gt;/); assert.match(html, /建议任务：修复/); assert.match(html, /等 TA 回复后再说/)
})

test('面板区分回复中和松散格式', () => {
  const html = chatPanelHtml({ enabled: true, agent: { name: 'PM', status: 'running' }, quota: {}, pending: true, messages: [
    { id: '1', at: '2026-10-20T01:00:00Z', role: 'agent', text: '【对话】分段回复', status: 'replying' },
    { id: '2', at: '2026-10-20T01:01:31Z', role: 'agent', text: '没有前缀', status: 'replied', format: 'loose' }
  ] })
  assert.match(html, /还在回复/)
  assert.match(html, /TA 没有按对话格式回复/)
})
