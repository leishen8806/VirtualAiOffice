import crypto from 'node:crypto'
import fs from 'node:fs'
import * as layout from '../office-layout.js'

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

const payload = {
  LAYOUT_V1: stable(layout.LAYOUT_V1),
  LAYOUT_V2: stable(layout.LAYOUT_V2),
}
const output = process.argv[2]
const text = JSON.stringify(payload, null, 2) + '\n'
if (output) fs.writeFileSync(output, text, 'utf8')
else process.stdout.write(text)
process.stderr.write(`sha256=${crypto.createHash('sha256').update(text).digest('hex')}\n`)
