// R1 synthetic adapter: reads versioned input and emits a read-only trial result.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPayslip } from './town-engine.mjs'

const DEFAULT_INPUT = new URL('./phase1-r1-input.json', import.meta.url)
const DEFAULT_OUTPUT = new URL('./phase1-r1-result.json', import.meta.url)
const CONFIRMED_TIERS = { Lead2: 'T4', GoSenior2: 'T3', React2: 'T1', Reviewer3: 'GA', SecurityReviewer2: 'GA' }
const EXCLUDED = new Set(['Go1', 'Go2', 'GoSenior', 'GoSenior2', 'OpsEngineer', 'Backend2', 'Reviewer3'])

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))
const syntheticInput = (job, month) => ({
  agent: job.agent,
  month,
  daysInMonth: 30,
  workedDays: 30,
  availableDays: 30,
  monthsOfService: 0,
  metrics: { observedDays: 30, evaluatedTasks: 3, firstPassRate: 1, avgReworkRounds: 0, blockedShare: 0, successRate: 1 },
  recordIncome: [],
  mineAdventureDays: [],
})

export function buildReadOnlyResult(input, config) {
  if (input.schema !== 'town-econ-phase1-r1-input' || input.version !== 1) throw new Error('R1 输入版本不匹配')
  if (!Array.isArray(input.jobs) || input.jobs.length !== 30) throw new Error('R1 必须包含 30 个岗位')
  const names = new Set(input.jobs.map((job) => job.agent))
  if (names.size !== 30) throw new Error('R1 岗位名必须唯一')

  const roles = { ...config.roles }
  for (const [agent, tier] of Object.entries(CONFIRMED_TIERS)) {
    const job = input.jobs.find((item) => item.agent === agent)
    if (!job || job.tier !== tier || job.confirmation !== '董事会确认记录第 56 条') throw new Error(`第 56 条档次确认缺失：${agent}`)
    roles[agent] = tier
  }
  for (const job of input.jobs) {
    if (roles[job.agent] !== job.tier) throw new Error(`岗位档次不匹配：${job.agent}`)
  }
  const trialConfig = { ...config, roles }
  const included = []
  const excluded = []
  for (const job of input.jobs) {
    if (EXCLUDED.has(job.agent)) {
      excluded.push({ agent: job.agent, tier: job.tier, state: job.state, reason: job.reason || '暂停或报错岗位，不参与试算' })
      continue
    }
    const payslip = buildPayslip(syntheticInput(job, input.month), trialConfig)
    included.push({ agent: job.agent, tier: job.tier, state: job.state, payslip })
  }
  return {
    schema: 'town-econ-phase1-r1-result',
    version: 1,
    mode: 'readonly-synthetic-trial',
    month: input.month,
    currency: input.currency,
    roleCount: input.jobs.length,
    includedCount: included.length,
    excludedCount: excluded.length,
    excludedJobs: excluded,
    jobs: included,
    totals: { payrollCents: included.reduce((sum, job) => sum + job.payslip.totalCents, 0) },
    ledger: null,
    realData: false,
    notes: ['所有输入为合成数据', '暂停或报错岗位不参与试算', '未执行任何真实经济动作、未生成正式账本']
  }
}

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
