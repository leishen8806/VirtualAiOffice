// R2 synthetic adapter: state and assessment metrics come from the versioned input.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPayslip } from './town-engine.mjs'

const DEFAULT_INPUT = new URL('./phase1-r2-input.json', import.meta.url)
const DEFAULT_OUTPUT = new URL('./phase1-r2-result.json', import.meta.url)
const CONFIRMED_TIERS = { Lead2: 'T4', GoSenior2: 'T3', React2: 'T1', Reviewer3: 'GA', SecurityReviewer2: 'GA' }
const DEFAULT_METRICS = { observedDays: 30, evaluatedTasks: 3, firstPassRate: 0.8, avgReworkRounds: 1, blockedShare: 0.1, successRate: 0.85 }
const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))
const syntheticInput = (job, month) => ({ agent: job.agent, month, daysInMonth: 30, workedDays: 30, availableDays: 30, monthsOfService: 0, metrics: { ...DEFAULT_METRICS, ...(job.metrics || {}) }, recordIncome: [], mineAdventureDays: [] })

export function buildReadOnlyResult(input, config) {
  if (input.schema !== 'town-econ-phase1-r2-input' || input.version !== 2) throw new Error('R2 输入版本不匹配')
  if (!Array.isArray(input.jobs) || input.jobs.length !== 30) throw new Error('R2 必须包含 30 个岗位')
  const names = new Set(input.jobs.map((job) => job.agent))
  if (names.size !== 30) throw new Error('R2 岗位名必须唯一')
  const roles = { ...config.roles }
  for (const [agent, tier] of Object.entries(CONFIRMED_TIERS)) {
    const job = input.jobs.find((item) => item.agent === agent)
    if (!job || job.tier !== tier || job.confirmation !== '董事会确认记录第 56 条') throw new Error(`第 56 条档次确认缺失：${agent}`)
    roles[agent] = tier
  }
  for (const job of input.jobs) if (roles[job.agent] !== job.tier) throw new Error(`岗位档次不匹配：${job.agent}`)
  const trialConfig = { ...config, roles }
  const included = [], excluded = []
  for (const job of input.jobs) {
    if (job.state !== 'active') {
      excluded.push({ agent: job.agent, tier: job.tier, state: job.state, reason: job.reason || '岗位状态不是 active，不参与试算' })
      continue
    }
    const payslip = buildPayslip(syntheticInput(job, input.month), trialConfig)
    included.push({ agent: job.agent, tier: job.tier, state: job.state, payslip })
  }
  return { schema: 'town-econ-phase1-r2-result', version: 2, mode: 'readonly-synthetic-trial', month: input.month, currency: input.currency, roleCount: input.jobs.length, includedCount: included.length, excludedCount: excluded.length, excludedJobs: excluded, jobs: included, totals: { payrollCents: included.reduce((sum, job) => sum + job.payslip.totalCents, 0) }, ledger: null, realData: false, notes: ['所有输入为合成数据', '岗位是否参与完全由输入文件 state 决定', '未执行任何真实经济动作、未生成正式账本'] }
}

export function readTrialResult(resultUrl = DEFAULT_OUTPUT) {
  const result = readJson(resultUrl)
  if (result.schema !== 'town-econ-phase1-r2-result' || result.version !== 2 || result.realData !== false) throw new Error('R2 结果文件格式不对')
  return result
}

export function trialAccessStatus({ lanUser = false, wallScope = false } = {}) { return lanUser || wallScope ? 403 : 200 }

export function run(inputUrl = DEFAULT_INPUT, outputUrl = DEFAULT_OUTPUT) {
  const config = readJson(new URL('./town-config.json', import.meta.url))
  const result = buildReadOnlyResult(readJson(inputUrl), config)
  writeFileSync(outputUrl, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv[2] ? new URL(process.argv[2], `file://${process.cwd()}/`) : DEFAULT_INPUT
  const output = process.argv[3] ? new URL(process.argv[3], `file://${process.cwd()}/`) : DEFAULT_OUTPUT
  const result = run(input, output)
  console.log(JSON.stringify({ roleCount: result.roleCount, includedCount: result.includedCount, excludedCount: result.excludedCount, payrollCents: result.totals.payrollCents }, null, 2))
}
