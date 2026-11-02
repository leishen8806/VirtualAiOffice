// 只读用量日报：只访问 Paperclip GET 端点，不写 Paperclip。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100'
const COMPANY = process.env.PAPERCLIP_COMPANY_ID || (() => {
  try { return fs.readFileSync(path.join(HERE, '..', 'company-id.txt'), 'utf8').trim() } catch { return '' }
})()
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.runs) ? value.runs : Array.isArray(value?.agents) ? value.agents : []
const number = value => Number(value) || 0
const millions = value => (value / 1e6).toFixed(2)
const localDateTime = value => new Date(value + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)
const localDay = value => new Date(value + 7 * 3600e3).toISOString().slice(0, 10)

export async function buildUsageReport({ api = API, company = COMPANY, days = 1, now = new Date(), fetchFn = fetch } = {}) {
  const get = async endpoint => {
    const response = await fetchFn(api + endpoint, { method: 'GET', signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`${endpoint} -> ${response.status}`)
    return response.json()
  }
  const agents = rows(await get(`/api/companies/${company}/agents`))
  const byId = Object.fromEntries(agents.map(agent => [agent.id, agent]))
  const response = await get(`/api/companies/${company}/heartbeat-runs?limit=1000`)
  const runs = rows(response)
  const since = now.getTime() - Number(days) * 86_400_000
  const groups = {}
  for (const run of runs) {
    const at = Date.parse(run.createdAt || run.startedAt || '')
    if (!Number.isFinite(at) || at < since || at > now.getTime()) continue
    const usage = run.usageJson || {}, agent = byId[run.agentId], name = agent?.name || run.agentId || 'unknown'
    const group = groups[name] ||= { adapter: agent?.adapterType || '-', model: '', billing: new Set(), runs: 0, failed: 0, cancelled: 0, input: 0, output: 0, cached: 0, cost: 0, wake: {} }
    group.runs++
    if (run.status === 'failed') group.failed++
    if (run.status === 'cancelled') group.cancelled++
    group.input += number(usage.inputTokens)
    group.output += number(usage.outputTokens)
    group.cached += number(usage.cachedInputTokens)
    group.cost += number(usage.costUsd)
    if (usage.model) group.model = usage.model
    if (usage.billingType) group.billing.add(usage.billingType)
    const wake = run.contextSnapshot?.wakeReason || run.wakeReason || '-'
    group.wake[wake] = (group.wake[wake] || 0) + 1
  }
  const list = Object.entries(groups).sort((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output))
  const totals = list.reduce((sum, [, group]) => ({ runs:sum.runs + group.runs, io:sum.io + group.input + group.output, cached:sum.cached + group.cached, cost:sum.cost + group.cost }), { runs:0, io:0, cached:0, cost:0 })
  const timestamps = runs.map(run => Date.parse(run.createdAt || run.startedAt || '')).filter(Number.isFinite)
  const oldest = timestamps.length ? Math.min(...timestamps) : now.getTime()
  const windowShort = oldest > since
  const lines = [
    `# 用量日报（最近 ${days} 天，UTC+7）`, '',
    `生成：${localDateTime(now.getTime())}；数据：运行记录最近 1000 条（最早一条 ${localDateTime(oldest)}）${windowShort ? '——**窗口比所选天数短，数字偏小**' : ''}。`,
    '来源是只读 GET；订阅计费不报金额，“记录成本”只是平台记下的 costUsd，不是账单。', '',
    `合计：运行 ${totals.runs} 次，输入+输出 ${millions(totals.io)} M token，缓存输入 ${millions(totals.cached)} M，记录成本 $${totals.cost.toFixed(2)}`, '',
    '| 岗位 | 适配器 | 模型 | 计费 | 运行 | 失败/取消 | 输入+输出 (M) | 占比 | 缓存输入 (M) | 记录成本 $ | 前两位唤醒原因 |',
    '|---|---|---|---|---:|---:|---:|---:|---:|---:|---|',
  ]
  for (const [name, group] of list) {
    const io = group.input + group.output
    const top = Object.entries(group.wake).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([wake, count]) => `${wake}×${count}`).join('、')
    lines.push(`| ${name} | ${group.adapter} | ${group.model || '-'} | ${[...group.billing].join('/') || '-'} | ${group.runs} | ${group.failed}/${group.cancelled} | ${millions(io)} | ${totals.io ? Math.round(io / totals.io * 100) : 0}% | ${millions(group.cached)} | ${group.cost.toFixed(2)} | ${top} |`)
  }
  return { markdown: lines.join('\n') + '\n', totals: { ...totals, windowShort, oldest: localDateTime(oldest), day: localDay(now.getTime()) } }
}

const arg = (key, fallback) => { const index = process.argv.indexOf(key); return index >= 0 ? process.argv[index + 1] || fallback : fallback }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!COMPANY) throw new Error('缺少 PAPERCLIP_COMPANY_ID 或 company-id.txt')
  const days = Number(arg('--days', '1'))
  const outDir = arg('--out', path.join(HERE, '..', 'dispatch', '_BACKLOG', '用量日报'))
  const report = await buildUsageReport({ days })
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `用量日报-${report.totals.day}.md`)
  fs.writeFileSync(file, report.markdown)
  console.log(file)
  console.log(report.markdown.split('\n').slice(4, 8).join('\n'))
}
