import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const officeRoot = path.dirname(fileURLToPath(new URL('../index.html', import.meta.url)))
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' }
const waiting = ['第一张问题', '第二张问题'].map((title, index) => ({
  id: `CMP-${index + 1}`,
  title,
  kind: 'question',
  issueId: `issue-${index + 1}`,
  interactionId: `interaction-${index + 1}`,
  agentId: 'agent-1',
  projectId: 'project-1',
  since: '2026-11-11T00:00:00.000Z',
  ask: { title: '', questions: [{ id: `question-${index + 1}`, prompt: '请选择', multi: false, options: [{ id: 'yes', label: '同意' }] }] },
}))
const appSource = `
  import { createUI } from './ui.js'
  document.getElementById('loading').style.display = 'none'
  const ui = createUI({ refresh: async () => {}, refreshFoyer: async () => {}, focusAgent: () => {}, setGoal: () => {} })
  ui.render({ actToken:'test-token', lan:false, agents:[{id:'agent-1',name:'测试同事'}], names:{'agent-1':'测试同事'}, approvals:[], waiting:${JSON.stringify(waiting)}, assigned:[], rework:{tasks:[]}, stale:null, healthLevel:{level:'ok',text:'健康'}, today:null, world:{duty:{on:true}} })
`

test('ACT-SUBMIT-FEEDBACK times out, restores submit, and explains the global busy state', { timeout: 10_000 }, async (t) => {
  const attempts = new Map()
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/act') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      const count = (attempts.get(body.issueId) || 0) + 1
      attempts.set(body.issueId, count)
      if (body.issueId === 'issue-1' && count === 1) {
        const timer = setTimeout(() => response.writeHead(200, { 'content-type': 'application/json' }).end('{"result":{"late":true}}'), 30_000)
        response.on('close', () => clearTimeout(timer))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"result":{"ok":true}}')
      return
    }
    if (url.pathname === '/app.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(appSource)
      return
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = path.resolve(officeRoot, `.${relative}`)
    if (!file.startsWith(officeRoot + path.sep)) return response.writeHead(403).end()
    try {
      const data = await readFile(file)
      response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }).end(data)
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
  const url = `http://127.0.0.1:${server.address().port}/`

  await t.test('a 30-second server stall reports the 20-second timeout and allows a manual retry', async () => {
    attempts.clear()
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window)
      window.setTimeout = (fn, ms, ...args) => nativeSetTimeout(fn, ms === 20_000 ? 300 : ms, ...args)
    })
    await page.goto(url)
    await page.locator('#waitList .card', { hasText: '第一张问题' }).click()
    await page.locator('input[value="yes"]').check()
    const submit = page.locator('#mSubmit')
    await submit.click()
    assert.equal(await submit.textContent(), '提交中…')
    assert.equal(await submit.isDisabled(), true)
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent === '服务器没有回应，请稍后再试，不要重复提交')
    assert.equal(await submit.textContent(), '提交回答')
    assert.equal(await submit.isDisabled(), false)
    await submit.click()
    await page.waitForFunction(() => document.querySelector('#toast')?.textContent === '回答已提交，agent 会被唤醒继续')
    assert.equal(attempts.get('issue-1'), 2)
    await page.close()
  })

  await t.test('a second card explains that the first operation is still submitting', async () => {
    attempts.clear()
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window)
      window.setTimeout = (fn, ms, ...args) => nativeSetTimeout(fn, ms === 20_000 ? 5_000 : ms, ...args)
    })
    await page.goto(url)
    await page.locator('#waitList .card', { hasText: '第一张问题' }).click()
    await page.locator('input[value="yes"]').check()
    await page.locator('#mSubmit').click()
    await page.locator('#waitList .card', { hasText: '第二张问题' }).evaluate((element) => element.click())
    await page.locator('input[value="yes"]').check()
    await page.locator('#mSubmit').click()
    assert.equal(await page.locator('#toast').textContent(), '上一个操作还在提交中')
    assert.equal(attempts.get('issue-1'), 1)
    assert.equal(attempts.has('issue-2'), false)
    await page.close()
  })
})
