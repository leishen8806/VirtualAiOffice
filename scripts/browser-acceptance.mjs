import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')

const roleIds = ['product', 'architect', 'frontend', 'backend', 'qa', 'reviewer', 'docs', 'helix']

const VIEWPORTS = [
  { width: 1440, height: 900, roles: true },
  { width: 1280, height: 800, roles: true },
  { width: 1024, height: 768, roles: false },
  { width: 390, height: 844, roles: false },
]

function roleSelector() {
  return '.char-anchor[data-role]'
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function waitForServer(url, child, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`服务子进程提前退出，退出码=${child.exitCode}`)
    }
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch {
      // 服务还没就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未返回 200`)
}

async function runViewport(browser, baseUrl, vp) {
  const results = []
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await ctx.newPage()
  const label = `${vp.width}x${vp.height}`

  try {
    let pageErrors = []
    let consoleErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })

    await page.goto(`${baseUrl}/?skin=core`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('html[data-theme-core]', { timeout: 15000 })

    const errDetail = [...pageErrors, ...consoleErrors]
    results.push({ name: 'no-page-errors', fail: errDetail.length > 0, detail: `pageerrors=${pageErrors.length} console.errors=${consoleErrors.length}${errDetail.length ? ' · ' + errDetail.slice(0, 2).join(' | ') : ''}` })

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    const overflowFail = overflow.scrollWidth > overflow.innerWidth
    results.push({ name: 'no-horizontal-overflow', fail: overflowFail, detail: `scrollWidth=${overflow.scrollWidth} <= innerWidth=${overflow.innerWidth}` })

    if (vp.roles) {
      const roles = await page.$$eval(roleSelector(), (els) => els.map((e) => e.getAttribute('data-role')))
      const present = new Set(roles)
      const missing = roleIds.filter((r) => !present.has(r))
      const countFail = roles.length < 8
      const rolesFail = missing.length > 0
      const parts = [`count=${roles.length}`]
      if (countFail) parts.push(`count<8`)
      if (rolesFail) parts.push(`missing=${missing.join(',')}`)
      parts.push(countFail || rolesFail ? '' : `all roles present (${roleIds.join(',')})`)
      results.push({ name: 'roles-present', fail: countFail || rolesFail, detail: parts.filter(Boolean).join(' · ') })
    }
  } catch (e) {
    results.push({ name: 'page-load', fail: true, detail: String(e) })
  } finally {
    await ctx.close()
  }

  const failCount = results.filter((r) => r.fail).length
  console.log(`\n== 视口 ${label} ==`)
  for (const r of results) {
    console.log(`  [${r.fail ? 'FAIL' : 'PASS'}] ${r.name}：${r.detail}`)
  }
  return failCount
}

async function main() {
  const port = await findFreePort()
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vao-browser-'))
  const url = `http://127.0.0.1:${port}`
  const rootUrl = `${url}/`

  const child = spawn(process.execPath, ['bin/niuma.js', '--fake', '--no-open', '--port', String(port), workdir], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let childOut = ''
  child.stdout.on('data', (d) => (childOut += d.toString()))
  child.stderr.on('data', (d) => (childOut += d.toString()))

  let browser
  let allFail = 0
  try {
    await waitForServer(rootUrl, child, 30000)
    console.log(`服务就绪：${rootUrl}`)

    browser = await chromium.launch({ headless: true })
    for (const vp of VIEWPORTS) {
      allFail += await runViewport(browser, url, vp)
    }
  } catch (e) {
    allFail = 1
    console.error(`浏览器验收失败：${e.message}`)
    if (childOut) console.error(`\n---- 服务输出 ----\n${childOut}\n---- 结束 ----`)
  } finally {
    if (browser) await browser.close()
  }

  console.log(`\n===== 汇总 =====`)
  console.log(`失败断言数：${allFail}`)

  if (child.exitCode === null) {
    child.kill()
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 2000)
      child.on('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  fs.rmSync(workdir, { recursive: true, force: true })

  return allFail
}

main().then(
  (fail) => process.exit(fail > 0 ? 1 : 0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)