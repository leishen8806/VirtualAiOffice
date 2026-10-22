// 小镇生活家 · 经济引擎（纯函数底座）
// 纯虚拟游戏经济，与真实金钱毫无关系；所有函数无副作用，输入输出均为普通对象。
// DR 币（DRC）：内部一律整数「分」，每个明细行 half-up 四舍五入到分后再求和。
// 时区：金边（UTC+7）；月份用 YYYY-MM；统计窗口 = 自然月。
import { createHash } from 'node:crypto'

// —— 内部工具 ——

// half-up 四舍五入到分（金额均为非负，Math.round 即 half-up）
const roundHUp = (x) => Math.round(x)

// half-up 保留 4 位小数（系数用）
const round4 = (x) => Math.round(x * 10000) / 10000

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

// 金边本地时间的年月日时分（Intl 处理 UTC 偏移；柬埔寨无夏令时情况）
function goldParts(nowIso) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(new Date(nowIso))
  const pick = (t) => Number(parts.find((p) => p.type === t).value)
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute') }
}

function prevMonthLabel(year, month) {
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

// 判定 nowIso 对应的金边时间是否已到发薪时刻（每月 payDay 日 payHour 时起），返回应发的自然月
function calcPayMonth(nowIso, cfg) {
  const g = goldParts(nowIso)
  const started = g.day > cfg.payDay || (g.day === cfg.payDay && g.hour >= cfg.payHour)
  return started ? prevMonthLabel(g.year, g.month) : null
}

// 岗位名解析为档次信息；未登记岗位一律抛错
function resolveTier(agent, cfg) {
  const tierId = cfg.roles[agent]
  if (!tierId || !cfg.tiers[tierId]) {
    const err = new Error(`未登记岗位：${agent}`)
    err.code = 'UNREGISTERED_ROLE'
    throw err
  }
  return { tierId, def: cfg.tiers[tierId] }
}

const isGatekeeper = (def) => Boolean(def.gatekeeper)

// —— 一 ~ 七节：七个基础纯函数 ——

// 计薪天数封顶 30
export function workedDaysCap(days) {
  return Math.min(30, days)
}

// 考核系数：守门岗固定 1.0；数据不足/缺失 1.0（不扣分）；否则按质量综合分分段线性
export function assessmentCoefficient(input, cfg) {
  const { role, observedDays, evaluatedTasks, firstPassRate, avgReworkRounds, blockedShare, successRate } = input
  let tierDef = null
  if (cfg.roles[role] && cfg.tiers[cfg.roles[role]]) tierDef = cfg.tiers[cfg.roles[role]]
  if (tierDef && isGatekeeper(tierDef)) return { value: 1.0, reason: 'gatekeeper' }

  const ratios = [firstPassRate, blockedShare, successRate]
  const insufficient =
    observedDays < cfg.assessment.minSamples.observedDays ||
    evaluatedTasks < cfg.assessment.minSamples.evaluatedTasks ||
    ratios.some((r) => r === null || r === undefined) ||
    avgReworkRounds === null || avgReworkRounds === undefined
  if (insufficient) return { value: 1.0, reason: 'insufficient' }

  const w = cfg.assessment.weights
  const f = clamp(firstPassRate, 0, 1)
  const b = clamp(blockedShare, 0, 1)
  const s = clamp(successRate, 0, 1)
  const reworkScore = Math.max(0, 1 - avgReworkRounds / cfg.assessment.reworkCapRounds)
  const S = 100 * (w.firstPass * f + w.rework * reworkScore + w.unblocked * (1 - b) + w.success * s)

  if (S >= 100) return { value: 1.5, reason: 'formula' }
  if (S > 60) return { value: round4(1.0 + ((S - 60) / 40) * (cfg.assessment.max - cfg.assessment.mid)), reason: 'formula' }
  if (S === 60) return { value: cfg.assessment.mid, reason: 'formula' }
  if (S > 0) return { value: round4(cfg.assessment.min + (S / cfg.assessment.midScore) * (cfg.assessment.mid - cfg.assessment.min)), reason: 'formula' }
  return { value: cfg.assessment.min, reason: 'formula' }
}

// 工龄奖：每满 6 个月 +2，封顶 11
export function seniorityBonus(monthsOfService, cfg) {
  return Math.min(cfg.allowances.seniorityCap, cfg.allowances.seniorityPerHalfYear * Math.floor(monthsOfService / 6))
}

// 娱乐型外快「矿洞探险」：确定性（同一人同一天结果恒定），产出 0–3 DR 币/日
export function mineAdventure(agent, date) {
  const digest = createHash('sha256').update(`${agent}|${date}|dr-town-v1`, 'utf8').digest()
  return digest[0] % 4
}

// 生成工资条；金额单位 DR 币，内部转分、每行 half-up 到分，totalCents 严格等于各行之和
export function buildPayslip(input, cfg) {
  const { agent, month, daysInMonth, workedDays, availableDays, monthsOfService, metrics } = input
  const { tierId, def } = resolveTier(agent, cfg)
  if (!Number.isInteger(daysInMonth) || daysInMonth < 28 || daysInMonth > 31) {
    throw new Error(`无效天数 daysInMonth=${daysInMonth}（应为 28–31）`)
  }
  if (!Number.isInteger(workedDays) || workedDays < 0 || workedDays > daysInMonth) {
    throw new Error(`无效出勤 workedDays=${workedDays}（应为 0–${daysInMonth} 的整数）`)
  }
  if (!Number.isInteger(availableDays) || availableDays < 0 || availableDays > daysInMonth) {
    throw new Error(`无效应出勤 availableDays=${availableDays}（应为 0–${daysInMonth} 的整数）`)
  }

  const warnings = []
  const lines = []
  const push = (key, label, amountCents, basis = '') => lines.push({ key, label, amountCents, basis })

  const coeff = assessmentCoefficient({ role: agent, ...metrics }, cfg)
  const paidDays = workedDaysCap(workedDays)
  const baseMonthly = def.monthly
  const proratedBaseCents = roundHUp((baseMonthly * coeff.value * paidDays / 30) * 100)
  push('base', '基本工资', proratedBaseCents, `${month} 出勤 ${paidDays}/${daysInMonth} · 系数 ${coeff.value}`)

  // 全勤奖：当月应出勤且实际出勤都等于自然日数才发（不满月的入职月份不发）
  const fullDuty = availableDays === daysInMonth && workedDays === daysInMonth
  push(
    'full_attendance',
    '全勤奖',
    fullDuty ? roundHUp(cfg.allowances.fullAttendance * 100) : 0,
    fullDuty ? `${workedDays}/${daysInMonth} 满勤` : `出勤 ${workedDays}/${availableDays} 未满勤`
  )

  push('meal', '餐补', roundHUp(cfg.allowances.mealPerDay * paidDays * 100), `${paidDays} 天 × ${cfg.allowances.mealPerDay}`)
  push('transport', '交通补助', roundHUp(cfg.allowances.transportMonthly * paidDays / 30 * 100), `${paidDays}/30 折算`)
  const sen = seniorityBonus(monthsOfService, cfg)
  push('seniority', '工龄奖', roundHUp(sen * 100), `工龄 ${monthsOfService} 个月`)

  const gatekeeper = isGatekeeper(def)

  if (gatekeeper) {
    // 廉洁津贴：当月有「确认违规」则不发（明细写明违规任务编号）
    const violations = Array.isArray(input.confirmedViolations) ? input.confirmedViolations : []
    if (violations.length > 0) {
      push('integrity_allowance', '廉洁津贴', 0, `有确认违规，本月停发：${violations.map((v) => v.task || v.reason).join('、')}`)
    } else {
      push('integrity_allowance', '廉洁津贴', roundHUp(def.integrityAllowance * 100), '无确认违规')
    }
    // 守门岗薪酬与审查结果脱钩：结果挂钩奖励一律不收（传入则忽略并警告）
    if (Array.isArray(input.projectBonuses) && input.projectBonuses.length > 0) {
      warnings.push('守门岗不领取结果挂钩奖励（项目奖金已忽略）')
    }
    if (Array.isArray(input.firstPassRewards) && input.firstPassRewards.length > 0) {
      warnings.push('守门岗不领取结果挂钩奖励（一次通过奖励已忽略）')
    }
    // 守门岗只允许知识贡献类外快；作者必须不等于审核人（本函数不判断，仅提醒）
    for (const item of Array.isArray(input.recordIncome) ? input.recordIncome : []) {
      if (item.kind === 'knowledge_contribution') {
        warnings.push('知识贡献外快：请确保作者与审核人不是同一人')
      } else {
        warnings.push(`守门岗只允许知识贡献类外快，类别 ${item.kind} 已忽略`)
      }
    }
  } else {
    // 项目奖金：每项按配置计入，四舍五入到分
    for (const b of Array.isArray(input.projectBonuses) ? input.projectBonuses : []) {
      push('project_bonus', '项目奖金', roundHUp(Number(b.amount) * 100), [b.reason, b.basis].filter(Boolean).join(' · '))
    }
    // 一次通过奖励
    for (const rw of Array.isArray(input.firstPassRewards) ? input.firstPassRewards : []) {
      push('first_pass', '一次通过奖励', roundHUp(Number(rw.amount) * 100), rw.task ? `任务 ${rw.task}` : '')
    }
    // 真实记录型外快：金额 × min(次数, 月上限)
    for (const item of Array.isArray(input.recordIncome) ? input.recordIncome : []) {
      const conf = cfg.sideIncome.recordBased[item.kind]
      if (!conf) {
        warnings.push(`未知外快类别 ${item.kind}（已忽略）`)
        continue
      }
      const count = Math.min(Number(item.count) || 0, conf.monthlyMax)
      push(`record_income:${item.kind}`, '记录型外快', roundHUp(conf.amount * count * 100), `${item.kind} · ${count}/${conf.monthlyMax} 次`)
    }
  }

  // 娱乐型外快「矿洞探险」：只统计 eligible 的日期，同日取一次；每日 ≤3；当月累计 ≤ floor(月薪基数×10%)
  const monthlyCap = Math.floor(baseMonthly * cfg.sideIncome.mineAdventureMonthlyShareOfBase)
  const byDay = new Map()
  for (const d of Array.isArray(input.mineAdventureDays) ? input.mineAdventureDays : []) {
    if (d && d.eligible && !byDay.has(d.date)) byDay.set(d.date, mineAdventure(agent, d.date))
  }
  let mineTotal = 0
  for (const [date, coins] of byDay) {
    if (mineTotal >= monthlyCap) break // 已达月度上限，此后不再发
    const amount = Math.min(coins, monthlyCap - mineTotal)
    mineTotal += amount
    const capped = amount < coins
    push('mine_adventure', '矿洞探险（虚拟）', roundHUp(amount * 100), `${date}${capped ? ' · 已达月度上限' : ''}`)
  }

  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0)
  return { agent, month, tier: tierId, lines, totalCents, coefficient: { value: coeff.value, reason: coeff.reason }, warnings }
}

// 发薪日历：金边时间每月 payDay 日 payHour 时起发放上一个自然月
export function payCalendar(cfg) {
  const payMonthFor = (nowIso) => calcPayMonth(nowIso, cfg)
  const isPayDay = (nowIso) => calcPayMonth(nowIso, cfg) !== null
  return { payMonthFor, isPayDay }
}

// 直接调用版本（便于测试）
export function payMonthFor(nowIso, cfg) {
  return calcPayMonth(nowIso, cfg)
}
export function isPayDay(nowIso, cfg) {
  return calcPayMonth(nowIso, cfg) !== null
}

// 通胀报告：娱乐型外快占工资总额比例，超过 8% 阈值时 exceeded
export function inflationReport(payslips, cfg) {
  const list = Array.isArray(payslips) ? payslips : []
  const sideIncomeCents = list.reduce(
    (s, p) => s + (Array.isArray(p.lines) ? p.lines.filter((l) => l.key === 'mine_adventure').reduce((a, l) => a + l.amountCents, 0) : 0),
    0
  )
  const payrollCents = list.reduce((s, p) => s + p.totalCents, 0)
  const share = payrollCents > 0 ? sideIncomeCents / payrollCents : 0
  const exceeded = share > cfg.sideIncome.inflationGuardShareOfPayroll
  return { payrollCents, sideIncomeCents, share: round4(share), exceeded }
}

// —— 第八节：金库与经济循环底座 ——

// 生活成本 =（房租 32% + 水电 5%）× 月薪基数 × 发放比例；返回分
export function livingCostFor(agentBase, fundingRatio) {
  const shares = 0.32 + 0.05 // 房租 + 水电，按规划定比
  return roundHUp(agentBase * shares * fundingRatio * 100)
}

// 个人税 = max(0, 月收入 − 起征点) × 税率；返回分
export function taxFor(pay, cfg) {
  const thr = cfg.economy.tax.threshold
  return roundHUp(Math.max(0, pay - thr) * cfg.economy.tax.rate * 100)
}

// 保管费：超过「本人 3 个月收入」部分 × 费率；返回分
export function hoardFee(balance, monthlyIncome, rate) {
  return roundHUp(Math.max(0, balance - 3 * monthlyIncome) * rate * 100)
}

// 发放计划：金库先付、不足才按产出锚定额度发行；绝不为凑齐工资突破发行上限
export function fundingPlan({ treasuryCents, payrollCents, supplyCents, outputIndex }, cfg) {
  const ec = cfg.economy
  const payroll = Number(payrollCents) || 0
  if (payroll <= 0) return { fundingRatio: 0, fromTreasury: 0, minted: 0, paused: true }
  const output = clamp(outputIndex === undefined ? ec.mint.outputIndexDefault : Number(outputIndex), 0, 1)
  const pauseThresholdCents = ec.mint.pauseWhenSupplyAboveMonths * payroll // 流通量超过此值时停止发行
  const allowMint = supplyCents > pauseThresholdCents ? 0 : Math.floor(ec.mint.maxShareOfPayroll * payroll * output)
  const fromTreasury = Math.min(Number(treasuryCents) || 0, payroll)
  const shortage = payroll - fromTreasury
  const minted = Math.min(allowMint, shortage)
  const funded = fromTreasury + minted
  const fundingRatio = round4(Math.min(1, funded / payroll))
  return { fundingRatio, fromTreasury, minted, paused: fundingRatio < 1 }
}

// 自适应保管费率：流通量（以月工资总额为单位）越过上限 → 每档 +0.5% 封顶；低于下限带 → 下调封底
export function adjustHoardRate({ supply, rate }, cfg) {
  const hf = cfg.economy.hoardFee
  const cap = cfg.economy.mint.pauseWhenSupplyAboveMonths // 目标上限（月工资倍数）
  const lowerBand = cap * hf.lowerBandShare
  let next = rate
  if (supply > cap) next = Math.min(hf.max, rate + hf.step)
  else if (supply < lowerBand) next = Math.max(hf.min, rate - hf.step)
  return { supply, rate: next }
}

// 金库溢出：超过上限（默认 2 个月工资）部分转公共项目，返回应转出的分
export function treasuryOverflow(treasuryCents, payrollCents, cfg) {
  const cap = cfg.economy.treasuryCapMonths * payrollCents
  return Math.max(0, treasuryCents - cap)
}

// 物价指数：人均存量 ÷ 目标人均存量，夹在 [cpiMin, cpiMax]
export function priceIndex({ supply, population, avgMonthlyIncome }, cfg) {
  const pr = cfg.economy.price
  if (!population || !avgMonthlyIncome) return pr.cpiMin
  const perCapita = supply / population
  const target = pr.targetPerCapitaMonthsOfIncome * avgMonthlyIncome
  return round4(clamp(perCapita / target, pr.cpiMin, pr.cpiMax))
}

// 商品价格 = 基准价 × CPI，四舍五入到分（基准价单位为分）
export function itemPrice(baseCents, cpi) {
  return roundHUp(baseCents * cpi)
}

// 标准基尼系数（对钱包余额数组，整数分参与计算）
function giniOf(values) {
  const xs = [...values].sort((a, b) => a - b)
  const n = xs.length
  if (n === 0) return 0
  const sum = xs.reduce((a, b) => a + b, 0)
  if (sum === 0) return 0
  const weighted = xs.reduce((acc, x, i) => acc + x * (i + 1), 0)
  return round4((2 * weighted) / (n * sum) - (n + 1) / n)
}

// 每月经济报告：供应量 / 金库 / 累计发行与回收 / 发放比例 / 人均 / 基尼 / CPI / 保管费率 / 守恒
export function monetaryReport(ledgerState, cfg) {
  const { wallets = {}, treasuryCents = 0 } = ledgerState
  const walletValues = Object.values(wallets).map(Number)
  const supply = walletValues.reduce((a, b) => a + b, 0) + treasuryCents
  const population = Number(ledgerState.population) || 0
  const avgMonthlyIncome = Number(ledgerState.avgMonthlyIncomeCents) || 0
  const cpi = priceIndex({ supply, population, avgMonthlyIncome }, cfg)
  const conserved =
    supply === (Number(ledgerState.mintedCents) || 0) - (Number(ledgerState.publicSpendCents) || 0)
  return {
    supply,
    treasury: treasuryCents,
    minted: Number(ledgerState.mintedCents) || 0,
    recycled: Number(ledgerState.recycledCents) || 0,
    publicSpend: Number(ledgerState.publicSpendCents) || 0,
    fundingRatio: ledgerState.fundingRatio ?? 0,
    perCapita: population > 0 ? Math.round(supply / population) : 0,
    gini: giniOf(walletValues),
    cpi,
    hoardRate: ledgerState.hoardRate ?? cfg.economy.hoardFee.start,
    conserved,
  }
}

// 某岗位整月收入（DR）：基础月薪 + 全勤 / 餐补 / 交通（按津贴开关）+ 守门岗廉洁津贴；与 payrollOfRoster 同口径
function monthlyIncomeDr(agent, cfg, fullAllowances) {
  const { def } = resolveTier(agent, cfg)
  let w = def.monthly
  if (fullAllowances) w += cfg.allowances.fullAttendance + cfg.allowances.mealPerDay * 30 + cfg.allowances.transportMonthly
  if (isGatekeeper(def)) w += def.integrityAllowance || 0
  return w
}

// 月工资总额：整月满勤、考核 1.0、含全部固定津贴的工资条（param 津贴开关走 params，这里按满编计）
// roster: [{ agent, monthsOfService }]；工资基数从 cfg.roles / cfg.tiers 解析
function payrollOfRoster(roster, cfg, params) {
  return roster.reduce((sum, r) => sum + Math.round(monthlyIncomeDr(r.agent, cfg, params.fullAllowances) * 100), 0)
}

// 确定性月度模拟：不接随机数；每月 发放 → 消费 → 利息 → 金库溢出 → 自适应保管费
export function simulateMonths({ roster, months, cfg, params = {} }) {
  const p = {
    outputIndex: 1.0,
    fullAllowances: false,
    livingCost: true,
    tax: true,
    daily: cfg.economy.spendPropensity.daily,
    goods: cfg.economy.spendPropensity.goods,
    hoardFee: true,
    savings: true,
    overflow: true, // 金库溢出转公共项目（回收机制），对照场景可关闭
    pause: true, // 流通量超过目标上限时的「暂停新发行」配套（8.4 自适应保管费用）；对照场景关闭
    ...params,
  }
  const pop = roster.length
  const payrollCents = payrollOfRoster(roster, cfg, p)

  const wallets = {}
  for (const r of roster) wallets[r.agent] = 0
  // 开办拨入（1 个月工资）视为首次发行 mint→treasury，保证守恒不变量 Σwallet+treasury = minted−public 恒成立
  let treasury = Math.round(cfg.economy.treasuryEndowmentMonths * payrollCents)
  let mintedCum = treasury
  let publicCum = 0
  let recycledCum = 0
  let rate = cfg.economy.hoardFee.start
  const reports = []

  for (let t = 1; t <= months; t++) {
    const supplyBefore = Object.values(wallets).reduce((a, b) => a + b, 0) + treasury
    const plan = fundingPlan(
      { treasuryCents: treasury, payrollCents, supplyCents: p.pause ? supplyBefore : 0, outputIndex: p.outputIndex },
      cfg
    )

    // 按发放计划发工资：总额精确采用 fundingPlan 返回的整数分（金库先付 + 产出锚定发行），
    // 避免按 round4 比值重算导致的浮点差（否则 outputIndex=0 时仍会冒出微小 mint）
    const paidTotal = plan.fromTreasury + plan.minted
    const treasuryPaid = plan.fromTreasury
    const minted = plan.minted
    treasury -= treasuryPaid
    mintedCum += minted

    let distributed = 0
    const shares = roster.map((r) => {
      const w = Math.round((payrollCents / pop) * plan.fundingRatio)
      distributed += w
      return w
    })
    const diff = paidTotal - distributed
    for (let i = 0; i < roster.length; i++) {
      const w = shares[i] + (i === 0 ? diff : 0)
      wallets[roster[i].agent] += w
    }

    // 消费：各类支出按「当月实际收入」为基数（含津贴 × 发放比例），从钱包扣，回金库；余额不足则不触发
    let refund = 0
    const wantList = []
    for (const r of roster) {
      const agent = r.agent
      const incomeDr = monthlyIncomeDr(agent, cfg, p.fullAllowances)
      const paidDr = incomeDr * plan.fundingRatio // 本月实际发放（DR，含津贴）
      let wants = 0
      if (p.livingCost) wants += livingCostFor(incomeDr, plan.fundingRatio) // 分
      if (p.tax) wants += taxFor(paidDr, cfg) // 分
      if (p.daily > 0) wants += Math.round(paidDr * p.daily * 100)
      if (p.goods > 0) wants += Math.round(paidDr * p.goods * 100)
      if (p.hoardFee) wants += hoardFee(wallets[agent] / 100, incomeDr, rate)
      wantList.push(Math.max(0, wants))
    }
    for (let i = 0; i < roster.length; i++) {
      const agent = roster[i].agent
      const take = Math.min(wantList[i], wallets[agent])
      wallets[agent] -= take
      refund += take
    }
    treasury += refund
    recycledCum += refund

    // 储蓄利息（0.2%/月，由金库付）：金库不足时本月不发利息
    if (p.savings) {
      const interest = Object.values(wallets).reduce((a, b) => a + Math.round(b * cfg.economy.savings.monthlyInterest), 0)
      if (interest <= treasury) {
        treasury -= interest
        for (const r of roster) wallets[r.agent] += Math.round(wallets[r.agent] * cfg.economy.savings.monthlyInterest)
      }
    }

    // 金库溢出 → 公共项目（永久回收）；对照场景可整体关闭
    const overflow = p.overflow ? treasuryOverflow(treasury, payrollCents, cfg) : 0
    if (overflow > 0) {
      treasury -= overflow
      publicCum += overflow
    }

    // 自适应保管费率（supply 单位为月工资总额）
    const supplyAfter = Object.values(wallets).reduce((a, b) => a + b, 0) + treasury
    rate = adjustHoardRate({ supply: supplyAfter / payrollCents, rate }, cfg).rate

    reports.push(
      monetaryReport(
        {
          wallets,
          treasuryCents: treasury,
          mintedCents: mintedCum,
          recycledCents: recycledCum,
          publicSpendCents: publicCum,
          population: pop,
          avgMonthlyIncomeCents: payrollCents / pop,
          fundingRatio: plan.fundingRatio,
          hoardRate: rate,
        },
        cfg
      )
    )
  }
  return reports
}