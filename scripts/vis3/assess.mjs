// 自检判定：一次运行是否「通过」必须同时满足——
// 1) 退出码符合预期（0）；
// 2) 存在与本次运行标识匹配的有效报告：
//    - 报告缺失 / 解析失败 → 失败；
//    - 报告必须带 runId 且与本次运行标识一致（缺 runId、runId 不同都判残留旧报告）；
//    - 报告必须带 sha 且与当前 HEAD 一致（缺 sha、sha 不同都判残留旧报告）；
// 3) 报告中确实包含被检查的项目（mandatory.total > 0）。
import fs from 'node:fs'
import path from 'node:path'

export function readReport(out) {
  try { return JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')) } catch { return null }
}

export function assessRun({ exit, report, expectedRunId, expectedSha }) {
  // 调用方必须提供本次运行标识与当前 HEAD（sha），缺省（null/undefined/空字符串）直接判不通过——
  // 不给就放过与 R3 同型，绝不允许。
  if (expectedRunId == null || expectedRunId === '') return { ok: false, reason: '调用方未提供本次运行标识' }
  if (expectedSha == null || expectedSha === '') return { ok: false, reason: '调用方未提供本次 sha' }
  if (exit !== 0) return { ok: false, reason: `退出码 ${exit}（未运行 / NOT_RUN / 基础错误）` }
  if (!report) return { ok: false, reason: '报告缺失或解析失败' }
  if (report.status === 'NOT_RUN') return { ok: false, reason: report.reason || 'NOT_RUN' }
  // 运行标识：报告必须带 runId，且与本次一致（缺 runId 也算旧报告）。
  if (report.runId == null) return { ok: false, reason: '报告缺少 runId（不是本次运行生成）' }
  if (report.runId !== expectedRunId) return { ok: false, reason: '报告 runId 与本次运行不一致（残留旧报告）' }
  // sha 核对：报告必须带 sha，且与当前 HEAD 一致（缺 sha 也算旧报告）。
  if (report.sha == null) return { ok: false, reason: '报告缺少 sha（不是本次运行生成）' }
  if (report.sha !== expectedSha) return { ok: false, reason: '报告 sha 与当前 HEAD 不一致（残留旧报告）' }
  if ((report.mandatory?.total ?? 0) <= 0) return { ok: false, reason: '报告未包含被检查的项目' }
  return { ok: true, reason: '' }
}
