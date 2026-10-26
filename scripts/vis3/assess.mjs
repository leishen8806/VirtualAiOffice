// 自检判定：一次运行是否「通过」必须同时满足——
// 1) 退出码符合预期（0）；
// 2) 存在与本次运行标识匹配的有效报告（报告缺失/解析失败/残留旧报告都算失败）；
// 3) 报告中确实包含被检查的项目（mandatory.total > 0）。
import fs from 'node:fs'
import path from 'node:path'

export function readReport(out) {
  try { return JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) } catch { return null }
}

export function assessRun({ exit, report, expectedSha }) {
  if (exit !== 0) return { ok: false, reason: `退出码 ${exit}（未运行 / NOT_RUN / 基础错误）` }
  if (!report) return { ok: false, reason: '报告缺失或解析失败' }
  if (report.status === 'NOT_RUN') return { ok: false, reason: report.reason || 'NOT_RUN' }
  if (expectedSha && report.sha && report.sha !== expectedSha) return { ok: false, reason: '报告 sha 与当前 HEAD 不一致（残留旧报告）' }
  if ((report.mandatory?.total ?? 0) <= 0) return { ok: false, reason: '报告未包含被检查的项目' }
  return { ok: true, reason: '' }
}
