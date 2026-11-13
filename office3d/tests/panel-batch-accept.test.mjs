import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from 'playwright'

const root = path.dirname(fileURLToPath(new URL('../index.html', import.meta.url)))
const artifacts = process.env.PANEL_BATCH_ARTIFACT_DIR || path.join(process.cwd(), 'review-artifacts', 'PANEL-BATCH-ACCEPT')
const waiting = [
  { kind: 'review', id: 'CMP-1', issueId: 'issue-1', title: '第一张待验收', projectId: 'project-a', agentId: 'agent-1', since: '2026-11-12T00:00:00.000Z' },
  { kind: 'review', id: 'CMP-2', issueId: 'issue-2', title: '第二张待验收', projectId: 'project-a', agentId: 'agent-1', since: '2026-11-12T00:00:00.000Z' },
  { kind: 'question', id: 'CMP-Q', issueId: 'issue-q', title: '需要董事会回答', projectId: 'project-a', agentId: 'agent-1', since: '2026-11-12T00:00:00.000Z', ask: { questions: [{ id: 'q-1', prompt: '请选择上线方案\n并说明原因', options: [{ id: 'a', label: '方案 A' }], multi: false, text: false, allowOther: true }] } },
  { kind: 'review', id: 'CMP-3', issueId: 'issue-3', title: '另一项目待验收', projectId: 'project-b', agentId: 'agent-1', since: '2026-11-12T00:00:00.000Z' },
]
const state = () => ({ actToken: 'test-token', lan: false, agents: [{ id: 'agent-1', name: '测试同事' }], names: { 'agent-1': '测试同事' }, approvals: [], waiting: waiting.slice(), assigned: [], rework: { tasks: [] }, stale: null, healthLevel: { level: 'ok', text: '健康' }, today: null, world: { duty: { on: true } }, projects: [{ id: 'project-a', name: '项目甲' }, { id: 'project-b', name: '项目乙' }] })

const html = `<!doctype html><html><body>
<div id="staleBanner"></div><div id="toast"></div><div id="quest"><div id="questHead"><h2>等你处理</h2><button id="dispatchBtn"></button><span id="questCount"></span><span id="questFold"></span></div><div id="waitList"></div><div id="taskHead"></div><div id="taskList"></div></div>
<div id="todayPanel"></div><div id="todoChip"></div><span id="sTodo"></span><button id="healthChip"><span id="healthDot"></span><span id="healthText"></span></button>
<button id="cmBtn"></button><button id="govBtn"></button><button id="collabBtn"></button><button id="tgBtn"></button><button id="daily"></button><button id="kbBtn"></button><button id="searchBtn"></button><input id="searchInput"><div id="searchPanel"><div id="searchResults"></div></div>
<div id="modalWrap"><div id="modal"></div></div><div id="handoffPanel"></div><div id="reworkPanel"></div><div id="versionPanel"></div><div id="workloadPanel"></div><button id="rwScan"></button><button id="hfScan"></button><button id="memoryRescan"></button><button id="memoryPreview"></button><input id="memoryIssue"><div id="memoryResult"></div><div id="collabRoot"></div><div id="commandEntry"></div>
<script type="module" src="/fixture.js"></script></body></html>`

test('PANEL-BATCH-ACCEPT uses fake upstream data and continues after one failure', async (t) => {
  const requests = []
  const accepted = new Set()
  const server = http.createServer(async (request, response) => {
    const reply = (status, body, contentType = 'application/json') => { if (!response.headersSent) response.writeHead(status, { 'content-type': contentType }).end(body) }
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/') return reply(200, html, 'text/html')
    if (url.pathname === '/fixture.js') return reply(200, `import { createUI } from '/ui.js'; let current = ${JSON.stringify(state())}; let ui; const refresh = async () => { current.waiting = current.waiting.filter((item) => item.issueId !== 'issue-1'); ui.render(current) }; ui = createUI({ refresh, refreshFoyer: async () => {}, focusAgent: () => {}, setGoal: () => {} }); ui.render(current)`, 'text/javascript')
    if (url.pathname === '/act') {
      let raw = ''; for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw); requests.push(body)
      if (body.issueId === 'issue-2') return setTimeout(() => reply(500, JSON.stringify({ error: '模拟失败：上游拒绝' })), 40)
      accepted.add(body.issueId)
      return setTimeout(() => reply(200, '{"result":{"ok":true}}'), 40)
    }
    if (url.pathname === '/evidence-version') return reply(200, '{"items":[]}')
    const file = path.resolve(root, url.pathname === '/ui.js' ? 'ui.js' : url.pathname.slice(1))
    if (!file.startsWith(root + path.sep)) return reply(403, '')
    try { reply(200, await readFile(file), file.endsWith('.js') ? 'text/javascript' : 'text/plain') } catch { reply(404, '') }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  await mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  t.after(async () => { await browser.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForSelector('[data-review-select="issue-1"]', { timeout: 5000 })
  const question = page.locator('.card.question')
  await question.click()
  await page.waitForSelector('#modalWrap.show')
  assert.match(await page.locator('#modal').textContent(), /CMP-Q 需要董事会回答/)
  assert.match(await page.locator('#modal').textContent(), /请选择上线方案/)
  assert.match(await page.locator('#modal').textContent(), /方案 A/)
  assert.match(await page.locator('#modal a').getAttribute('href'), /127\.0\.0\.1:3100\/issues\/issue-q/)
  await page.locator('#modalWrap .close').click()
  assert.equal(await page.locator('[data-review-select]').count(), 3)
  assert.equal(await page.locator('[data-review-select="issue-q"]').count(), 0)
  await page.locator('[data-review-select="issue-1"]').check()
  await page.locator('[data-review-select="issue-3"]').check()
  assert.equal(await page.locator('[data-batch-accept]').isDisabled(), true)
  await page.screenshot({ path: path.join(artifacts, '01-selected-cross-project.png'), fullPage: true })
  await page.locator('[data-review-select="issue-3"]').uncheck()
  await page.locator('[data-review-select="issue-2"]').check()
  await page.locator('[data-batch-accept]').click()
  await page.screenshot({ path: path.join(artifacts, '02-confirm.png'), fullPage: true })
  assert.match(await page.locator('[role="alertdialog"]').textContent(), /确认批量验收 2 张/)
  await page.locator('[data-batch-confirm]').click()
  assert.equal(await page.locator('[data-batch-accept]').isDisabled(), true)
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent === '成功 1 张，失败 1 张')
  assert.deepEqual(requests.map((request) => [request.type, request.issueId, request.decision]), [['review', 'issue-1', 'accept'], ['review', 'issue-2', 'accept']])
  assert.equal(await page.locator('[data-review-select="issue-1"]').count(), 0)
  assert.match(await page.locator('.batch-result').textContent(), /模拟失败：上游拒绝/)
  await page.screenshot({ path: path.join(artifacts, '03-partial-failure.png'), fullPage: true })
})
