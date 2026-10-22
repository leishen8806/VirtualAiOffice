// 小镇生活家 · 试算命令行（只读）
// 用法：node town/town-cli.mjs --month 2026-10 --input <json文件> [--json]
// 只读调用方给的输入文件（格式同 buildPayslip 的 input 数组）和本目录的 town-config.json，
// 输出每人工资条 + inflationReport；不写账本、不联网、不读 town/ 之外的任何文件。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPayslip, inflationReport } from './town-engine.mjs'

const cfg = JSON.parse(readFileSync(fileURLToPath(new URL('./town-config.json', import.meta.url)), 'utf8'))

function parseArgs() {
  const a = process.argv.slice(2)
  const pick = (name) => {
    const i = a.indexOf(name)
    if (i >= 0 && i + 1 < a.length) return a[i + 1]
    return null
  }
  const month = pick('--month')
  const input = pick('--input')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    console.error('用法：node town/town-cli.mjs --month 2026-10 --input <json文件> [--json]')
    process.exit(2)
  }
  if (!input) {
    console.error('缺少 --input <json文件>')
    process.exit(2)
  }
  return { month, input, json: a.includes('--json') }
}

const fmtDr = (cents) => (cents / 100).toFixed(2)

function main() {
  const { month, input, json } = parseArgs()
  const raw = readFileSync(input, 'utf8')
  let list
  try {
    list = JSON.parse(raw)
  } catch (e) {
    console.error(`输入文件不是合法 JSON：${e.message}`)
    process.exit(1)
  }
  if (!Array.isArray(list)) {
    console.error('输入文件必须是数组（buildPayslip 的 input 数组）')
    process.exit(1)
  }

  const payslips = list.map((item) => buildPayslip(item, cfg))
  const report = inflationReport(payslips, cfg)

  if (json) {
    console.log(JSON.stringify({ month, payslips, inflation: report }, null, 2))
    return
  }

  console.log(`月份：${month}（试算，纯虚拟 · 仅装饰）`)
  for (const p of payslips) {
    console.log(`\n【${p.agent}】档次 ${p.tier} · 考核系数 ${p.coefficient.value.toFixed(4)}（${p.coefficient.reason}）`)
    for (const l of p.lines) {
      console.log(`  ${l.label.padEnd(14)} ${fmtDr(l.amountCents).padStart(9)}  DR  ${l.basis || ''}`)
    }
    console.log(`  合计                        ${fmtDr(p.totalCents).padStart(9)}  DR`)
    for (const w of p.warnings) console.log(`  提示：${w}`)
  }
  console.log('\n通胀报告（娱乐型外快监控）')
  console.log(`  工资总额        ${fmtDr(report.payrollCents)} DR`)
  console.log(`  娱乐外快        ${fmtDr(report.sideIncomeCents)} DR`)
  console.log(`  占比            ${(report.share * 100).toFixed(2)}%${report.exceeded ? '（超出 8% 阈值）' : ''}`)
  console.log('（以上金额均为虚拟 DR 币，仅装饰用途，与真实金钱无关）')
}

try {
  main()
} catch (e) {
  console.error(e.message || String(e))
  process.exit(1)
}