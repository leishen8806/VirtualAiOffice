import { readFileSync } from 'node:fs'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) throw new Error('usage: node tools/env-snapshot-compare.mjs <before.json> <after.json>')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const key = item => JSON.stringify({ ...item, order: undefined })
const counts = list => list.reduce((map, item) => map.set(key(item), (map.get(key(item)) || 0) + 1), new Map())
const before = read(beforePath), after = read(afterPath), a = counts(before), b = counts(after)
const removed = [], added = []
for (const [value, count] of a) for (let i = b.get(value) || 0; i < count; i++) removed.push(JSON.parse(value))
for (const [value, count] of b) for (let i = a.get(value) || 0; i < count; i++) added.push(JSON.parse(value))
const [x, , z] = removed[0]?.position || []
const palm = removed.length === 1 && removed[0].type === 'Group' && removed[0].children === 15 && x >= -46 && x < -45 && z >= 30 && z < 31
console.log(JSON.stringify({ before: before.length, after: after.length, removed, added, pass: palm && added.length === 0 }, null, 2))
if (!palm || added.length) process.exitCode = 1
