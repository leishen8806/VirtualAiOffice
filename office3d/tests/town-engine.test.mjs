// T20 小镇经济引擎测试：A–I 算例逐字断言、配置真实读取、100 组固定种子随机 half-up、第八节金库与经济循环阈值、静态自检。
// 运行：node --test tests/town-engine.test.mjs
// 口径：DR 币内部一律整数分、每明细行 half-up 到分再求和；金边时区；计薪天数封顶 30；工资总额（25 位满勤）≈14,505 DR/月。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  workedDaysCap,
  assessmentCoefficient,
  seniorityBonus,
  mineAdventure,
  buildPayslip,
  payMonthFor,
  isPayDay,
  inflationReport,
  livingCostFor,
  taxFor,
  hoardFee,
  fundingPlan,
  adjustHoardRate,
  treasuryOverflow,
  priceIndex,
  itemPrice,
  monetaryReport,
  simulateMonths,
} from '../town/town-engine.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) // 本文件位于 office3d/tests/ → 项目根在上一级
const TOWN = path.join(ROOT, '..', 'town')

function collectTownSources(dir) {
  const out = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (path.relative(dir, full).split(path.sep).includes('data')) continue
        walk(full)
      } else if (entry.isFile() && /\.(?:mjs|js)$/i.test(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out.sort()
}

// 真实配置文件（从磁盘加载，断言引擎确实读它）
const cfg = JSON.parse(fs.readFileSync(path.join(TOWN, 'town-config.json'), 'utf8'))
const ROSTER = Object.keys(cfg.roles).map((agent) => ({ agent, monthsOfService: 1 }))
assert.equal(ROSTER.length, 25, '真实花名册应为 25 位同事')

// 整月满勤（含全部固定津贴）工资总额，分；用于第八节基线
function fullPayrollCents() {
  let total = 0
  for (const agent of ROSTER.map((r) => r.agent)) {
    const def = cfg.tiers[cfg.roles[agent]]
    let w = def.monthly * 100
    w += (cfg.allowances.fullAttendance + cfg.allowances.mealPerDay * 30 + cfg.allowances.transportMonthly) * 100
    if (def.gatekeeper) w += def.integrityAllowance * 100
    total += w
  }
  return total
}

// 评定综合分 = 60（系数 1.0）的标准指标
const metrics60 = { observedDays: 30, evaluatedTasks: 10, firstPassRate: 0.5, avgReworkRounds: 0, blockedShare: 0.5, successRate: 1 / 3 }

function inputOf(agent, over = {}) {
  return {
    agent,
    month: '2026-11',
    daysInMonth: 30,
    workedDays: 30,
    availableDays: 30,
    monthsOfService: 1,
    metrics: metrics60,
    projectBonuses: [],
    firstPassRewards: [],
    recordIncome: [],
    mineAdventureDays: [],
    confirmedViolations: [],
    ...over,
  }
}

// 固定种子 PRNG（mulberry32），供随机 half-up 与随机外快范围测试
function mulberry32(seed) {
  let a = seed
  return function () {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 费率等浮点结果用容差断言（0.03+0.005 在二进制浮点里不是精确 0.035）
function sameRate(a, b) {
  assert.ok(Math.abs(a - b) < 1e-9, `费率 ${a} ≠ ${b}`)
}

// ───── 第四节：A–I 算例（数字逐字断言）─────

test('A：整月基准考核 Frontend1（T1）＝368.00，明细逐字', () => {
  const ps = buildPayslip(inputOf('Frontend1'), cfg)
  assert.equal(ps.tier, 'T1')
  assert.deepEqual(ps.coefficient, { value: 1, reason: 'formula' })
  const byKey = Object.fromEntries(ps.lines.map((l) => [l.key, l.amountCents]))
  assert.equal(byKey.base, 33600)          // 336.00
  assert.equal(byKey.full_attendance, 1000) // 10.00 满勤
  assert.equal(byKey.meal, 1500)            // 0.5×30
  assert.equal(byKey.transport, 700)        // 7×30/30
  assert.equal(byKey.seniority, 0)          // 工龄 1 个月 < 6
  assert.equal(ps.totalCents, 36800)        // 368.00
  assert.equal(ps.totalCents, ps.lines.reduce((s, l) => s + l.amountCents, 0))
})

test('B：不满月 10 月 15—31 日共 17 天＝202.87，交通补 3.97（half-up）', () => {
  const ps = buildPayslip(inputOf('Frontend1', { month: '2026-10', daysInMonth: 31, workedDays: 17, availableDays: 17 }), cfg)
  const byKey = Object.fromEntries(ps.lines.map((l) => [l.key, l.amountCents]))
  assert.equal(byKey.base, 19040)           // 336/30×17 = 190.40
  assert.equal(byKey.full_attendance, 0)    // 不满月不发全勤奖
  assert.equal(byKey.meal, 850)             // 0.5×17 = 8.50
  assert.equal(byKey.transport, 397)        // 7×17/30 = 3.9666… → 3.97（half-up 到分）
  assert.equal(ps.totalCents, 20287)        // 202.87
})

test('C：守门岗整月 Reviewer1（GA）＝907.00；有确认违规时廉洁津贴停发＝827.00 且写明违规任务', () => {
  const clean = buildPayslip(inputOf('Reviewer1'), cfg)
  assert.deepEqual(clean.coefficient, { value: 1, reason: 'gatekeeper' })
  const ck = Object.fromEntries(clean.lines.map((l) => [l.key, l.amountCents]))
  assert.equal(ck.base, 79500)
  assert.equal(ck.integrity_allowance, 8000)
  assert.equal(ck.full_attendance, 1000)
  assert.equal(ck.meal, 1500)
  assert.equal(ck.transport, 700)
  assert.equal(clean.totalCents, 90700)     // 907.00
  assert.deepEqual(clean.warnings, [])

  const dirty = buildPayslip(inputOf('Reviewer1', { confirmedViolations: [{ task: 'CMP-77', reason: '违规放行' }] }), cfg)
  const dk = Object.fromEntries(dirty.lines.map((l) => [l.key, l.amountCents]))
  assert.equal(dk.integrity_allowance, 0)
  assert.ok(dirty.lines.find((l) => l.key === 'integrity_allowance').basis.includes('CMP-77'), '明细里写明违规任务编号')
  assert.equal(dirty.totalCents, 82700)     // 827.00
})

test('D：考核封顶 Backend1（T1，S=100 系数 1.5）＝536.00', () => {
  const ps = buildPayslip(
    inputOf('Backend1', { metrics: { observedDays: 30, evaluatedTasks: 10, firstPassRate: 1, avgReworkRounds: 0, blockedShare: 0, successRate: 1 } }),
    cfg
  )
  assert.equal(ps.coefficient.value, 1.5)
  assert.equal(ps.lines.find((l) => l.key === 'base').amountCents, 50400) // 336×1.5 = 504.00
  assert.equal(ps.totalCents, 53600) // +全勤10+餐补15+交通7
})

test('E：分段线性系数 S=30→0.9、S=80→1.25、S=0→0.8、S=100→1.5；数据不足 →1.0(insufficient)', () => {
  const at = (over) => ({ role: 'Backend1', observedDays: 30, evaluatedTasks: 10, firstPassRate: 0, avgReworkRounds: 0, blockedShare: 0, successRate: 0, ...over })
  assert.equal(assessmentCoefficient(at({ firstPassRate: 0, avgReworkRounds: 0.6, blockedShare: 0.5 }), cfg).value, 0.9)    // S=30
  assert.equal(assessmentCoefficient(at({ firstPassRate: 1, avgReworkRounds: 0, blockedShare: 1, successRate: 1 }), cfg).value, 1.25) // S=80
  assert.equal(assessmentCoefficient(at({ firstPassRate: 0, avgReworkRounds: 3, blockedShare: 1, successRate: 0 }), cfg).value, 0.8)   // S=0
  assert.equal(assessmentCoefficient(at({ firstPassRate: 1, avgReworkRounds: 0, blockedShare: 0, successRate: 1 }), cfg).value, 1.5)   // S=100
  assert.deepEqual(assessmentCoefficient(at({ observedDays: 6 }), cfg), { value: 1, reason: 'insufficient' })
  assert.deepEqual(assessmentCoefficient({ role: 'Reviewer1', observedDays: 2, evaluatedTasks: 1, firstPassRate: null, avgReworkRounds: null, blockedShare: null, successRate: null }, cfg), {
    value: 1,
    reason: 'gatekeeper',
  })
})

test('F：守门岗忽略项目奖金与一次通过奖励，warnings 各一条，总额不变', () => {
  const ps = buildPayslip(
    inputOf('Reviewer1', { projectBonuses: [{ reason: '里程碑', amount: 100, basis: 'A' }], firstPassRewards: [{ task: 'CMP-1', amount: 20 }] }),
    cfg
  )
  assert.equal(ps.warnings.length, 2)
  assert.equal(ps.warnings.filter((w) => w.includes('守门岗不领取结果挂钩奖励')).length, 2)
  assert.equal(ps.totalCents, 90700) // 与 C 相同
})

test('G：矿洞探险确定性与范围；每月累计超 33 封顶；eligible:false 恒为 0', () => {
  // 100 次重复结果相同
  const first = mineAdventure('Frontend1', '2026-11-03')
  for (let i = 0; i < 100; i++) assert.equal(mineAdventure('Frontend1', '2026-11-03'), first)
  // 1000 组（固定种子）随机 (agent,date) 结果都在 0–3 整数
  const rnd = mulberry32(20261020)
  const agents = Object.keys(cfg.roles)
  for (let i = 0; i < 1000; i++) {
    const a = agents[Math.floor(rnd() * agents.length)]
    const d = `2026-11-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`
    const v = mineAdventure(a, d)
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 3, `${a}|${d} → ${v}`)
  }
  // 每月总和 ≤ floor(336×0.10)=33；eligible:false 的日子不产生收入
  const days = Array.from({ length: 20 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, eligible: true }))
  const ps = buildPayslip(inputOf('Frontend1', { mineAdventureDays: days }), cfg)
  const mines = ps.lines.filter((l) => l.key === 'mine_adventure')
  assert.ok(mines.length > 0)
  const mineCents = mines.reduce((s, l) => s + l.amountCents, 0)
  assert.ok(mineCents <= 3300, `矿洞探险累计 ${mineCents} ≤ 3300 分（33 DR）`)
  // 逐日 ≤3 由 mineAdventure 保证；再用 eligible:false 验证不计入
  const off = buildPayslip(inputOf('Frontend1', { mineAdventureDays: [{ date: '2026-11-03', eligible: false }] }), cfg)
  assert.equal(off.lines.filter((l) => l.key === 'mine_adventure').length, 0)
  assert.equal(off.totalCents, 36800)
})

test('H：发薪日历——金边每月 15 日 09:00 起发上一个自然月，跨 UTC 日界正确', () => {
  assert.equal(payMonthFor('2026-11-14T09:30:00+07:00', cfg), null)
  assert.equal(payMonthFor('2026-11-15T08:59:00+07:00', cfg), null)
  assert.equal(payMonthFor('2026-11-15T09:00:00+07:00', cfg), '2026-10')
  assert.equal(payMonthFor('2026-12-15T10:00:00+07:00', cfg), '2026-11')
  assert.equal(payMonthFor('2027-01-15T09:00:00+07:00', cfg), '2026-12')
  // 跨 UTC 日界：UTC 仍是 14 日但金边已 15 日 05:00 → 未到 09:00 不发
  assert.equal(payMonthFor('2026-11-14T22:00:00Z', cfg), null)
  // 金边 15 日 09:00 对应 UTC 15 日 02:00 → 应发 2026-10
  assert.equal(payMonthFor('2026-11-15T02:00:00Z', cfg), '2026-10')
  assert.equal(isPayDay('2026-11-15T09:00:00+07:00', cfg), true)
  assert.equal(isPayDay('2026-11-15T08:59:00+07:00', cfg), false)
})

test('I：未登记岗位与非法出勤天数一律拒绝，不发放', () => {
  assert.throws(() => buildPayslip(inputOf('苏晨'), cfg), /未登记岗位/)
  assert.throws(() => buildPayslip(inputOf('Unknown'), cfg), /未登记岗位/)
  for (const badDays of [-1, 2.5, 31]) {
    assert.throws(() => buildPayslip(inputOf('Frontend1', { daysInMonth: 30, workedDays: badDays }), cfg), /无效出勤/)
  }
  assert.throws(() => buildPayslip(inputOf('Frontend1', { daysInMonth: 30, availableDays: 31 }), cfg), /无效应出勤/)
})

// ───── 配置真实读取：改配置里的数字，结果随之改变 ─────
test('配置真被读取：磁盘配置字段正确；改档次月薪/全勤奖/考核权重后结果变化', () => {
  assert.equal(cfg.currency, 'DRC')
  assert.equal(cfg.baseWage, 280)
  assert.equal(cfg.payDay, 15)
  assert.equal(cfg.payHour, 9)
  assert.equal(cfg.tiers.T1.monthly, 336)
  assert.equal(cfg.tiers.GA.integrityAllowance, 80)
  assert.equal(cfg.assessment.weights.firstPass, 0.4)

  const alt = structuredClone(cfg)
  alt.tiers.T1.monthly = 340                      // 档次月薪 336 → 340
  alt.allowances.fullAttendance = 20              // 全勤奖 10 → 20
  alt.assessment.weights.firstPass = 0.7          // 权重变化
  const ps = buildPayslip(inputOf('Frontend1', { metrics: metrics60 }), alt)
  const byKey = Object.fromEntries(ps.lines.map((l) => [l.key, l.amountCents]))
  assert.equal(byKey.base, 40375)                 // 340 DR × 系数 1.1875（0.7 权重下 S=75 → 1.1875）
  assert.equal(byKey.full_attendance, 2000)       // 全勤奖来自配置
  const sw = assessmentCoefficient({ role: 'Backend1', observedDays: 30, evaluatedTasks: 10, firstPassRate: 1, avgReworkRounds: 1, blockedShare: 0, successRate: 0 }, alt)
  const sw0 = assessmentCoefficient({ role: 'Backend1', observedDays: 30, evaluatedTasks: 10, firstPassRate: 1, avgReworkRounds: 1, blockedShare: 0, successRate: 0 }, cfg)
  assert.notEqual(sw.value, sw0.value, '考核权重变更后系数随之改变')
})

// ───── half-up 随机不动点：100 组固定种子，总额=明细和、全部整数分 ─────
test('100 组固定种子随机工资条：全部明细为整数分且 totalCents 严格等于各行之和', () => {
  const rnd = mulberry32(985211)
  const agents = Object.keys(cfg.roles)
  const kinds = ['knowledge_contribution', 'proposal_adopted', 'defect_found', 'nonsense_kind']
  for (let i = 0; i < 100; i++) {
    const agent = agents[Math.floor(rnd() * agents.length)]
    const daysInMonth = 28 + Math.floor(rnd() * 4)
    const workedDays = Math.floor(rnd() * (daysInMonth + 1))
    const availableDays = Math.floor(rnd() * (daysInMonth + 1))
    const m = {
      observedDays: Math.floor(rnd() * 31),
      evaluatedTasks: Math.floor(rnd() * 11),
      firstPassRate: rnd() < 0.1 ? null : rnd(),
      avgReworkRounds: Math.floor(rnd() * 6),
      blockedShare: rnd(),
      successRate: rnd(),
    }
    const mineAdventureDays = Array.from({ length: Math.floor(rnd() * 10) }, (_, k) => ({ date: `2026-11-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`, eligible: rnd() < 0.7 }))
    const recordIncome = Array.from({ length: Math.floor(rnd() * 3) }, () => ({ kind: kinds[Math.floor(rnd() * kinds.length)], count: Math.floor(rnd() * 8), basis: `r${i}` }))
    const ps = buildPayslip(
      inputOf(agent, {
        month: '2026-11',
        daysInMonth,
        workedDays,
        availableDays,
        monthsOfService: Math.floor(rnd() * 37),
        metrics: m,
        mineAdventureDays,
        recordIncome,
        projectBonuses: rnd() < 0.4 ? [{ reason: 'P', amount: Math.floor(rnd() * 100) + 1, basis: 'B' }] : [],
        firstPassRewards: rnd() < 0.4 ? [{ task: `CMP-${i}`, amount: Math.floor(rnd() * 50) + 1 }] : [],
      }),
      cfg
    )
    for (const l of ps.lines) {
      assert.ok(Number.isInteger(l.amountCents) && l.amountCents >= 0, `第 ${i} 组 ${l.key} 金额非法：${l.amountCents}`)
    }
    assert.ok(Number.isInteger(ps.totalCents), `第 ${i} 组 totalCents 非整数：${ps.totalCents}`)
    assert.equal(ps.totalCents, ps.lines.reduce((s, l) => s + l.amountCents, 0), `第 ${i} 组总额≠明细和`)
  }
})

// ───── 第七节：基础函数不动点 ─────
test('workedDaysCap 封顶 30；seniorityBonus 每满 6 个月 +2 封顶 11', () => {
  assert.equal(workedDaysCap(30), 30)
  assert.equal(workedDaysCap(35), 30)
  assert.equal(workedDaysCap(0), 0)
  assert.equal(seniorityBonus(1, cfg), 0)
  assert.equal(seniorityBonus(6, cfg), 2)
  assert.equal(seniorityBonus(12, cfg), 4)
  assert.equal(seniorityBonus(40, cfg), 11)
})

test('inflationReport：娱乐型外快占工资比例超过 8% 时 exceeded', () => {
  const mk = (monthly, mine) => ({
    totalCents: monthly,
    lines: [{ key: 'mine_adventure', amountCents: mine }],
  })
  assert.equal(inflationReport([mk(36800, 3000)], cfg).exceeded, true)   // 3000/36800 = 8.15% > 8%
  const r = inflationReport([mk(36800, 3000)], cfg)
  assert.equal(r.share, 0.0815)                   // round4(3000/36800)
  assert.equal(r.sideIncomeCents, 3000)
  assert.equal(r.payrollCents, 36800)
  assert.equal(inflationReport([mk(36800, 4000)], cfg).exceeded, true)   // 4000/36800 = 10.9% > 8%
  assert.equal(inflationReport([mk(36800, 0)], cfg).exceeded, false)
  assert.equal(inflationReport([], cfg).share, 0)
})

// ───── 第八节：金库与经济循环底座 ─────
test('工资总额：25 位满勤整月工资条合计 = 14,505 DR（断言区间 14,000–15,000）', () => {
  const P = fullPayrollCents()
  assert.equal(P, 1450500)
  assert.ok(P >= 1400000 && P <= 1500000, `工资总额 ${P} 应在 [1,400,000, 1,500,000]`)
  // 与逐人 buildPayslip（满勤、S=60 系数 1.0）之和一致
  let sum = 0
  for (const agent of ROSTER.map((r) => r.agent)) {
    sum += buildPayslip(inputOf(agent, { metrics: metrics60 }), cfg).totalCents
  }
  assert.equal(sum, P)
})

test('场景 D（36 个月，全机制）：发放比例≥0.99、流通量≤上限×1.05、第36月新发行≤15%、24–36月增幅≤3%、守恒恒真、金库非负且≤上限×1.02', () => {
  const P = fullPayrollCents()
  const D = simulateMonths({ roster: ROSTER, months: 36, cfg, params: { fullAllowances: true } })
  for (const r of D) {
    assert.ok(r.fundingRatio >= 0.99, `fundingRatio=${r.fundingRatio}`)
    assert.ok(r.treasury >= 0)
    assert.equal(r.conserved, true)
  }
  const maxSupply = Math.max(...D.map((r) => r.supply))
  assert.ok(maxSupply <= 6 * P * 1.05, `maxSupply=${maxSupply} > 6×P×1.05=${6 * P * 1.05}`)
  const lastMint = D[35].minted - D[34].minted
  assert.ok(lastMint <= 0.15 * P, `第36月新发行 ${lastMint} > 15%P=${Math.round(0.15 * P)}`)
  for (let t = 24; t <= 35; t++) {
    const g = D[t].supply / D[t - 1].supply - 1
    assert.ok(g <= 0.03, `m${t + 1} 增幅 ${(g * 100).toFixed(3)}% > 3%`)
  }
  const maxTreasury = Math.max(...D.map((r) => r.treasury))
  assert.ok(maxTreasury <= 2 * P * 1.02, `maxTreasury=${maxTreasury} > 2P×1.02=${Math.round(2 * P * 1.02)}`)
  assert.equal(D[35].fundingRatio, 1, '有回收机制时第 36 月仍全额发放')
})

test('场景 E（24 个月，对照：无回收/无保管费/消费25%/无商品）：流通量≥2倍D 且稳定期发放比例<0.6', () => {
  const D = simulateMonths({ roster: ROSTER, months: 36, cfg, params: { fullAllowances: true } })
  // 对照关闭全部钱包→金库回流与稳定机制（保管费/溢出/流通量暂停/生活成本/税），仅保留任务要求的日常消费 25%
  const E = simulateMonths({ roster: ROSTER, months: 24, cfg, params: { fullAllowances: true, livingCost: false, tax: false, daily: 0.25, goods: 0, hoardFee: false, savings: false, overflow: false, pause: false } })
  assert.ok(E[23].supply >= 2 * D[23].supply, `E@24=${E[23].supply} < 2×D@24=${2 * D[23].supply}`)
  const stableMin = Math.min(...E.slice(12, 24).map((r) => r.fundingRatio))
  assert.ok(stableMin < 0.6, `E 稳定期最小发放比例 ${stableMin} ≥ 0.6（泡沫化未显现）`)
  for (const r of E) assert.equal(r.conserved, true)
})

test('产出锚定：outputIndex=0 不发行（minted 恒定、比例下降）；outputIndex=0.5 新发行恰为上限', () => {
  const P = fullPayrollCents()
  const Z = simulateMonths({ roster: ROSTER, months: 12, cfg, params: { fullAllowances: true, outputIndex: 0 } })
  assert.equal(new Set(Z.map((r) => r.minted)).size, 1, 'outputIndex=0 时每月 minted 必须恒定（绝不为凑工资发行）')
  assert.equal(Z[0].minted, P, '开办拨入视为首次发行（minted = 金库开办额）')
  assert.ok(Z[Z.length - 1].fundingRatio < 1, '金库用完后发放比例下降')
  assert.ok(Z[0].fundingRatio === 1)

  const Cap0 = fundingPlan({ treasuryCents: 0, payrollCents: P, supplyCents: 0, outputIndex: 0 }, cfg)
  assert.deepEqual({ ...Cap0, fundingRatio: Cap0.fundingRatio }, { fundingRatio: 0, fromTreasury: 0, minted: 0, paused: true })

  const capHalf = Math.floor(0.5 * 0.25 * P)
  const H = simulateMonths({ roster: ROSTER, months: 24, cfg, params: { fullAllowances: true, outputIndex: 0.5 } })
  let maxDelta = 0
  for (let t = 1; t < 24; t++) maxDelta = Math.max(maxDelta, H[t].minted - H[t - 1].minted)
  assert.ok(maxDelta > 0)
  assert.ok(maxDelta <= capHalf, `outputIndex=0.5 最大月新发行 ${maxDelta} > 上限 ${capHalf}`)
  const planDot5 = fundingPlan({ treasuryCents: 0, payrollCents: P, supplyCents: 0, outputIndex: 0.5 }, cfg)
  assert.equal(planDot5.minted, capHalf, 'outputIndex=0.5 时新发行恰为 0.5×25%×工资总额')
  assert.equal(planDot5.fundingRatio, Math.round((capHalf / P) * 10000) / 10000)
  assert.equal(planDot5.paused, true)
})

test('自适应保管费：流通量越过上限 → 费率 +0.5%/月到 10% 封顶且发行暂停；回落到下限带以下 → 降到 1% 封底', () => {
  const P = fullPayrollCents()
  // 无消费无回收：钱包累积使流通量穿越 6 个月目标上限，费率逐月上调并暂停新发行
  const UP = simulateMonths({ roster: ROSTER, months: 60, cfg, params: { fullAllowances: true, livingCost: false, tax: false, daily: 0, goods: 0, overflow: false } })
  sameRate(UP[0].hoardRate, 0.025)   // 首月流通量=1 个月工资（低于下限带 3.6）→ 先降 0.5%
  sameRate(UP[59].hoardRate, 0.1, '费率应升到 10% 封顶')
  let upOk = 0
  for (let t = 1; t < 60; t++) { if (UP[t].hoardRate > UP[t - 1].hoardRate) upOk++ }
  assert.ok(upOk > 10, `费率应逐月 +0.5% 累计（实际 ${upOk} 次上调）`)
  const frozenAt = UP.findIndex((r, t1) => t1 > 0 && r.minted === UP[t1 - 1].minted)
  assert.ok(frozenAt >= 0, '发行应被暂停（存在某月 minted 不再增长）')
  assert.ok(UP[frozenAt].fundingRatio < 1, '暂停时发放比例 < 1')

  // 产出锚定 0：流通量固定在开办额 1 个月工资（低于下限带 6×0.6=3.6 个月）→ 费率下调到 1% 封底
  const DOWN = simulateMonths({ roster: ROSTER, months: 60, cfg, params: { fullAllowances: true, outputIndex: 0 } })
  assert.ok(DOWN.some((r) => r.supply / P < 6 * 0.6), '流通量应回落到下限带以下')
  sameRate(DOWN[59].hoardRate, 0.01, '费率应降到 1% 封底')
  let downOk = 0
  for (let t = 1; t < 60; t++) { if (DOWN[t].hoardRate < DOWN[t - 1].hoardRate) downOk++ }
  assert.ok(downOk >= 3, '费率应回到下调方向（首月内部 0.03→0.025，此后逐月 −0.5% 直至 1%）')
})

test('调整保管费率原语：档位/下限带边界/封顶封底', () => {
  sameRate(adjustHoardRate({ supply: 6.1, rate: 0.03 }, cfg).rate, 0.035)  // 越过上限 → +0.5%
  sameRate(adjustHoardRate({ supply: 6.1, rate: 0.095 }, cfg).rate, 0.1)   // 封顶 10%
  sameRate(adjustHoardRate({ supply: 3.5, rate: 0.03 }, cfg).rate, 0.025)  // 低于下限带（6×0.6=3.6）→ −0.5%
  sameRate(adjustHoardRate({ supply: 3.5, rate: 0.01 }, cfg).rate, 0.01)   // 封底 1%
  sameRate(adjustHoardRate({ supply: 6.0, rate: 0.03 }, cfg).rate, 0.03)   // 恰在上限：不变
  sameRate(adjustHoardRate({ supply: 3.6, rate: 0.03 }, cfg).rate, 0.03)   // 恰在界限内：不变
})

test('金库溢出与生活成本/税/保管费/物价原语（half-up 到分、逐字）', () => {
  const P = fullPayrollCents()
  assert.equal(treasuryOverflow(Math.round(P * 2.5), P, cfg), Math.round(P * 0.5)) // 超过 2 个月部分转 public
  assert.equal(treasuryOverflow(Math.round(P * 1.9), P, cfg), 0)
  assert.equal(treasuryOverflow(Math.round(P * 2), P, cfg), 0) // 恰在上限不转

  assert.equal(livingCostFor(336, 1), Math.round(0.37 * 336 * 100))    // (0.32+0.05)×336 → 124.32
  assert.equal(livingCostFor(336, 0.5), Math.round(0.37 * 336 * 0.5 * 100))
  assert.equal(taxFor(400, cfg), 1200)   // max(0,400−300)×12% = 12
  assert.equal(taxFor(200, cfg), 0)
  assert.equal(hoardFee(400, 100, 0.03), 300)   // (400−3×100)×3% = 3
  assert.equal(hoardFee(300, 100, 0.03), 0)
  assert.equal(hoardFee(1000, 100, 0.1), 7000)  // (1000−300)×10% = 70

  assert.equal(itemPrice(100, 1.23), 123)
  assert.equal(itemPrice(100, 0.8), 80)
  assert.equal(priceIndex({ supply: 1000, population: 5, avgMonthlyIncome: 100 }, cfg), 1)   // 人均 200 = 目标 2 个月基薪 → CPI 1
  assert.equal(priceIndex({ supply: 100, population: 5, avgMonthlyIncome: 100 }, cfg), 0.8)  // 夹到下界
  assert.equal(priceIndex({ supply: 10000, population: 5, avgMonthlyIncome: 100 }, cfg), 1.5) // 夹到上界
})

test('monetaryReport：守恒判定与标准基尼（整数运算）', () => {
  // Σwallet + treasury = minted − public
  const r = monetaryReport(
    { wallets: { A: 40000, B: 60000 }, treasuryCents: 0, population: 2, avgMonthlyIncomeCents: 50000, mintedCents: 100000, publicSpendCents: 0, hoardRate: 0.03 },
    cfg
  )
  assert.equal(r.supply, 100000)
  assert.equal(r.conserved, true)
  assert.equal(r.gini, 0.1) // [40000, 60000]：标准基尼 = (2×160000)/(2×100000) − 3/2

  const r2 = monetaryReport({ wallets: { A: 50000, B: 50000 }, treasuryCents: 0, population: 2, avgMonthlyIncomeCents: 50000, mintedCents: 100000, publicSpendCents: 0, hoardRate: 0.03 }, cfg)
  assert.equal(r2.gini, 0)
  assert.equal(r2.conserved, true)

  const r3 = monetaryReport({ wallets: { A: 40000 }, treasuryCents: 0, population: 1, avgMonthlyIncomeCents: 50000, mintedCents: 60000, publicSpendCents: 0, hoardRate: 0.03 }, cfg)
  assert.equal(r3.conserved, false) // 100000 − 60000 = 40000 ≠ 40000 → 守恒破坏可被发现
})

// ───── 静态自检：town/ 源码不含禁用词与网络/进程调用 ─────
test('静态自检：town/ 全部源文件不含网络/进程调用与禁用账务词汇', () => {
  const bannedNetwork = ['fetch(', 'http', "require('net')", 'child_process']
  const bannedWords = ['提现', '入账', '转账', '兑换', '挖矿']
  const files = collectTownSources(TOWN)
  assert.ok(files.length >= 7, `town/ 应有至少 7 个源码文件（实际 ${files.length}；仅扫描 .mjs/.js 普通文件，跳过 town/data 运行时目录）`)
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const f = path.relative(TOWN, file)
    for (const b of bannedNetwork) assert.ok(!text.includes(b), `${f} 含网络/进程标记 ${b}`)
    for (const w of bannedWords) assert.ok(!text.includes(w), `${f} 含禁用词「${w}」`)
  }
})

test('静态自检跳过 town/data 运行时数据但仍检查临时源码', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'town-scan-'))
  try {
    fs.mkdirSync(path.join(root, 'data', 'home'), { recursive: true })
    fs.writeFileSync(path.join(root, 'data', 'home', 'x.json'), '{"source":"http","note":"提现"}')
    fs.writeFileSync(path.join(root, 'safe.mjs'), 'export const ok = true')
    assert.deepEqual(collectTownSources(root).map((file) => path.basename(file)), ['safe.mjs'])
    fs.writeFileSync(path.join(root, 'unsafe.mjs'), 'fetch("http://example.test")')
    const sources = collectTownSources(root)
    assert.equal(sources.some((file) => path.basename(file) === 'unsafe.mjs'), true)
    assert.equal(fs.readFileSync(sources.find((file) => path.basename(file) === 'unsafe.mjs'), 'utf8').includes('fetch('), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
