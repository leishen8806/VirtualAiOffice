import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const officeRoot = path.dirname(fileURLToPath(new URL('../index.html', import.meta.url)))
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }
const issue = {
  identifier: 'CMP-222', title: '按钮加载状态', status: 'in_review', assignee: '测试同事',
  projectId: 'project-1', description: '验证统一加载状态', comments: [],
}
const waiting = [
  { id: 'CMP-222', title: issue.title, kind: 'review', issueId: 'issue-ok', agentId: 'agent-1', projectId: 'project-1', since: '2026-11-11T00:00:00.000Z' },
  { id: 'CMP-223', title: '读取失败', kind: 'review', issueId: 'issue-fail', agentId: 'agent-1', projectId: 'project-1', since: '2026-11-11T00:00:00.000Z' },
]
const appSource = `
  import { createUI } from './ui.js'
  document.getElementById('loading').style.display = 'none'
  const ui = createUI({ refresh: async () => {}, refreshFoyer: async () => {}, focusAgent: () => {}, setGoal: () => {} })
  ui.render({ actToken:'test-token', lan:false, agents:[{id:'agent-1',name:'测试同事'}], names:{'agent-1':'测试同事'}, approvals:[], waiting:${JSON.stringify(waiting)}, assigned:[], rework:{tasks:[]}, stale:null, healthLevel:{level:'ok',text:'健康'}, today:null, world:{duty:{on:true}} })
`

test('BTN-LOADING shows one loading state and always restores it', { timeout: 90_000 }, async (t) => {
  let actMode = 'success'
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/issue') {
      if (url.searchParams.get('id') === 'issue-fail') return response.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"详情服务暂不可用"}')
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(issue))
    }
    if (url.pathname === '/evidence-version') return response.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    if (url.pathname === '/act') {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      return actMode === 'success'
        ? response.writeHead(200, { 'content-type': 'application/json' }).end('{"result":{"ok":true}}')
        : response.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"提交失败"}')
    }
    if (url.pathname === '/app.js') return response.writeHead(200, { 'content-type': 'text/javascript' }).end(appSource)
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = path.resolve(officeRoot, `.${relative}`)
    if (!file.startsWith(officeRoot + path.sep)) return response.writeHead(403).end()
    try {
      response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  t.after(async () => {
    await browser?.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)

  await t.test('a three-second detail load updates and restores the card action', async () => {
    const card = page.locator('#waitList .card', { hasText: issue.title })
    await card.click({ noWaitAfter: true })
    assert.equal(await card.getAttribute('aria-busy'), 'true')
    assert.equal((await card.locator('.go').textContent()).replace(/\s/g, ''), '处理中…')
    assert.match(await page.locator('#modal').textContent(), /加载中/)
    await page.locator('#mAccept').waitFor({ state: 'visible' })
    assert.equal(await card.getAttribute('aria-busy'), null)
    assert.equal((await card.locator('.go').textContent()).trim(), '验收')
  })

  await t.test('confirmation waits until the real submit, then shows loading', async () => {
    const accept = page.locator('#mAccept')
    await accept.click()
    assert.equal(await accept.getAttribute('aria-busy'), null)
    assert.equal(await accept.textContent(), '确认：标为已完成')
    await accept.click({ noWaitAfter: true })
    assert.equal(await accept.getAttribute('aria-busy'), 'true')
    assert.equal((await accept.textContent()).replace(/\s/g, ''), '处理中…')
    await page.locator('#modalWrap').waitFor({ state: 'hidden' })
  })

  await t.test('failed detail and action requests restore controls with a toast', async () => {
    const failedCard = page.locator('#waitList .card', { hasText: '读取失败' })
    await failedCard.click()
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('详情服务暂不可用'))
    assert.equal(await failedCard.getAttribute('aria-busy'), null)
    assert.equal((await failedCard.locator('.go').textContent()).trim(), '验收')
    assert.match(await page.locator('#modal').textContent(), /任务详情读取失败/)
    await page.locator('#modal [data-x]').click()

    await page.locator('#waitList .card', { hasText: issue.title }).click()
    await page.locator('#mAccept').waitFor({ state: 'visible' })
    await page.locator('#mNote').fill('需要修改')
    actMode = 'failure'
    const changes = page.locator('#mChanges')
    await changes.click({ noWaitAfter: true })
    assert.equal(await changes.isDisabled(), true)
    assert.equal((await changes.textContent()).replace(/\s/g, ''), '处理中…')
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent === '没有成功：提交失败')
    assert.equal(await changes.isDisabled(), false)
    assert.equal(await changes.textContent(), '要求修改')
  })
})
