import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
const root = process.argv[2]
const { assessRun } = await import(new URL(`file:///${root}/scripts/vis3/assess.mjs`))
const { removeRegisteredDir } = await import(new URL(`file:///${root}/scripts/vis3/fixture.mjs`))
console.log('A7 旧报告没有 sha 字段:', assessRun({ exit: 0, report: { mandatory: { total: 9 } }, expectedSha: 'current-head' }))
const other = fs.mkdtempSync(path.join(os.tmpdir(), 'vis3-iso-other-run-'))
const r = removeRegisteredDir(other)
console.log('A8 删除"别的运行"的同前缀目录:', r, '目录还在?', fs.existsSync(other))
