import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.resolve(here, '../../town-map-data/m0/derived/town-map-v0.json')
const output = path.resolve(here, '../town-map-data.js')
const data = JSON.parse(fs.readFileSync(source, 'utf8'))

fs.writeFileSync(output, `// 来源：town-map-v0.json；© OpenStreetMap contributors，ODbL 1.0\nexport default ${JSON.stringify(data)}\n`)
console.log(`generated ${path.basename(output)} (${fs.statSync(output).size} bytes)`)
