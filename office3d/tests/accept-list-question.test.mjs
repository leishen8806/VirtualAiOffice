import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const server = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs'), 'utf8')
const source = server.match(/async function buildWaiting\(activity, issueList\) \{[\s\S]*?\r?\n\}\r?\n\r?\nconst gossip/)[0].replace(/\r?\nconst gossip$/, '')
const buildWaiting = new Function('issueInfo', 'interactionInfo', 'issuePolicy', `return (${source})`) (
  async () => { throw new Error('issueInfo should use issueList first') },
  async (_issueId, interactionId) => ({ status: interactionId === 'expired' ? 'expired' : 'pending', ask: { questions: [{ prompt: interactionId }] }, confirm: null, verdicts: null }),
  async () => null,
)

test('待回答用列表任务信息，并且同卡只保留最新 pending 问题', async () => {
  const now = new Date().toISOString()
  const activity = [
    { action: 'issue.thread_interaction_created', entityId: 'issue-1', agentId: 'agent-1', createdAt: now, details: { interactionId: 'latest', interactionStatus: 'pending' } },
    { action: 'issue.thread_interaction_created', entityId: 'issue-1', agentId: 'agent-1', createdAt: now, details: { interactionId: 'old', interactionStatus: 'pending' } },
  ]
  const waiting = await buildWaiting(activity, [{ id: 'issue-1', identifier: 'CMP-1417', title: '明确上线方案', projectId: 'project-1' }])
  assert.deepEqual(waiting.map(({ id, title, interactionId }) => ({ id, title, interactionId })), [{ id: 'CMP-1417', title: '明确上线方案', interactionId: 'latest' }])
})

test('最新问题已过期时不回退显示同卡旧问题', async () => {
  const now = new Date().toISOString()
  const activity = [
    { action: 'issue.thread_interaction_created', entityId: 'issue-1', agentId: 'agent-1', createdAt: now, details: { interactionId: 'expired', interactionStatus: 'pending' } },
    { action: 'issue.thread_interaction_created', entityId: 'issue-1', agentId: 'agent-1', createdAt: now, details: { interactionId: 'old', interactionStatus: 'pending' } },
  ]
  const waiting = await buildWaiting(activity, [{ id: 'issue-1', identifier: 'CMP-1417', title: '明确上线方案' }])
  assert.equal(waiting.filter((item) => item.kind === 'question').length, 0)
})
