import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LAYOUT_V3 } from '../office-layout.js'

const plan = JSON.parse(readFileSync(new URL('./v3-layout-align-plan.json', import.meta.url), 'utf8'))
const { regions, workstations, displaySeats, site, island } = plan
const area = region => (region.x1 - region.x0) * (region.z1 - region.z0)
const inside = (point, region) => point.x > region.x0 && point.x < region.x1 && point.z > region.z0 && point.z < region.z1
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0))
const radialDistance = region => {
  const x = Math.max(region.x0, Math.min(island.center.x, region.x1))
  const z = Math.max(region.z0, Math.min(island.center.z, region.z1))
  return Math.max(0, Math.hypot(x - island.center.x, z - island.center.z) - island.ring.outer)
}

const failures = []
for (let index = 0; index < regions.length; index++) {
  for (const other of regions.slice(index + 1)) {
    const square = overlap(regions[index], other)
    if (square) failures.push(`区域重叠 ${regions[index].id}/${other.id}: ${square}m²`)
  }
}
for (const workstation of workstations) {
  const open = regions.filter(region => region.kind === 'open' && inside(workstation, region))
  const blocked = regions.filter(region => ['room', 'display'].includes(region.kind) && inside(workstation, region))
  if (open.length !== 1) failures.push(`工位 ${workstation.name} 位于 ${open.length} 个开放区`)
  if (blocked.length) failures.push(`工位 ${workstation.name} 落入 ${blocked.map(region => region.id).join(',')}`)
  if (open[0]?.id !== workstation.region) failures.push(`工位 ${workstation.name} region=${workstation.region}，实际=${open[0]?.id || '无'}`)
}
const expectedWorkers = Object.keys(LAYOUT_V3.seats).sort()
const actualWorkers = workstations.map(item => item.name).sort()
if (JSON.stringify(actualWorkers) !== JSON.stringify(expectedWorkers)) failures.push('25 个真实工位名称未与 LAYOUT_V3.seats 一一对应')
for (const seat of displaySeats) {
  const region = regions.find(item => item.id === seat.region && item.kind === 'display')
  if (!region || !inside(seat, region)) failures.push(`展示席 ${seat.id} 不在四角展示区`)
}
if (displaySeats.length !== 12) failures.push(`展示席数量为 ${displaySeats.length}，应为 12`)

const openRegions = regions.filter(region => region.kind === 'open')
const nearOrTouching = (a, b) =>
  Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1)) <= 2 &&
  Math.max(0, Math.max(a.z0 - b.z1, b.z0 - a.z1)) <= 2
const components = []
const unvisited = new Set(openRegions.map(region => region.id))
while (unvisited.size) {
  const component = [], queue = [unvisited.values().next().value]
  while (queue.length) {
    const id = queue.pop()
    if (!unvisited.delete(id)) continue
    const region = openRegions.find(item => item.id === id)
    component.push(region)
    for (const candidate of openRegions) if (unvisited.has(candidate.id) && nearOrTouching(region, candidate)) queue.push(candidate.id)
  }
  components.push(component)
}
const componentInfo = component => {
  const x0 = Math.min(...component.map(region => region.x0)), x1 = Math.max(...component.map(region => region.x1))
  const z0 = Math.min(...component.map(region => region.z0)), z1 = Math.max(...component.map(region => region.z1))
  return { ids: component.map(region => region.id), area: component.reduce((sum, region) => sum + area(region), 0), width: x1 - x0, depth: z1 - z0 }
}
const westIsland = componentInfo(components.find(component => component.some(region => region.id === 'west-open')) || [])
if (westIsland.area < 140 || Math.min(westIsland.width, westIsland.depth) < 10) failures.push(`西侧开放岛不达标：${westIsland.area}m² ${westIsland.width}×${westIsland.depth}m`)
const plannedMeetingSeats = plan.meetingRooms.reduce((sum, room) => sum + room.seats, 0)
const layoutMeetingSeats = Object.values(LAYOUT_V3.meetingSeats).reduce((sum, seats) => sum + seats, 0)
if (plannedMeetingSeats !== layoutMeetingSeats) failures.push(`会议席位 ${plannedMeetingSeats}，LAYOUT_V3 为 ${layoutMeetingSeats}`)

const step = .5, vacant = new Set(), key = (x, z) => `${x}|${z}`
for (let x = site.x0; x < site.x1; x += step) for (let z = site.z0; z < site.z1; z += step) {
  const point = { x: x + step / 2, z: z + step / 2 }
  const inRegion = regions.some(region => inside(point, region))
  const radius = Math.hypot(point.x - island.center.x, point.z - island.center.z)
  const inRing = radius >= island.ring.inner && radius <= island.ring.outer
  if (!inRegion && !inRing) vacant.add(key(x, z))
}
const blanks = []
while (vacant.size) {
  const first = vacant.values().next().value, queue = [first], block = []
  vacant.delete(first)
  while (queue.length) {
    const current = queue.pop(), [x, z] = current.split('|').map(Number)
    block.push({ x, z })
    for (const neighbor of [[x - step, z], [x + step, z], [x, z - step], [x, z + step]]) {
      const next = key(...neighbor)
      if (vacant.delete(next)) queue.push(next)
    }
  }
  if (block.length * step * step >= 4) blanks.push({ area: block.length * step * step, x0: Math.min(...block.map(p => p.x)), x1: Math.max(...block.map(p => p.x)) + step, z0: Math.min(...block.map(p => p.z)), z1: Math.max(...block.map(p => p.z)) + step })
}

const rectangleDistance = (point, region) => Math.hypot(
  Math.max(region.x0 - point.x, 0, point.x - region.x1),
  Math.max(region.z0 - point.z, 0, point.z - region.z1),
)
const wideVoid = new Set()
for (let x = site.x0; x < site.x1; x += step) for (let z = site.z0; z < 12; z += step) {
  const point = { x: x + step / 2, z: z + step / 2 }
  const nearRegion = regions.some(region => rectangleDistance(point, region) <= 2)
  const nearIsland = Math.hypot(point.x - island.center.x, point.z - island.center.z) <= island.ring.outer + 2
  if (!nearRegion && !nearIsland) wideVoid.add(key(x, z))
}
const voidBlocks = []
while (wideVoid.size) {
  const first = wideVoid.values().next().value, queue = [first], block = []
  wideVoid.delete(first)
  while (queue.length) {
    const current = queue.pop(), [x, z] = current.split('|').map(Number)
    block.push({ x, z })
    for (const neighbor of [[x - step, z], [x + step, z], [x, z - step], [x, z + step]]) {
      const next = key(...neighbor)
      if (wideVoid.delete(next)) queue.push(next)
    }
  }
  voidBlocks.push({ area: block.length * step * step, x0: Math.min(...block.map(p => p.x)), x1: Math.max(...block.map(p => p.x)) + step, z0: Math.min(...block.map(p => p.z)), z1: Math.max(...block.map(p => p.z)) + step })
}

console.log(`PLAN regions=${regions.length} area=${regions.reduce((sum, region) => sum + area(region), 0)}m² workers=${workstations.length} displaySeats=${displaySeats.length}`)
console.log(`PLAN island counter=${island.counterRadius} collision=${island.collisionRadius} ring=${island.ring.inner}..${island.ring.outer}`)
console.log(`PLAN overlap=0 workers=25 displaySeats=12`)
console.log(`PLAN open-components ${components.map(component => { const info = componentInfo(component); return `${info.ids.join('+')}:${info.area}m²/${info.width}x${info.depth}m` }).join(', ')}`)
console.log(`PLAN west-open=${westIsland.area}m²/${westIsland.width}x${westIsland.depth}m meetingSeats=${plannedMeetingSeats}/${layoutMeetingSeats}`)
console.log(`PLAN ring-near ${regions.filter(region => radialDistance(region) < 10).map(region => `${region.id}:${radialDistance(region).toFixed(2)}m`).join(', ')}`)
console.log(`PLAN blank>=4 ${blanks.map(block => `${block.area.toFixed(2)}m²@${block.x0}..${block.x1},${block.z0}..${block.z1}`).join('; ') || 'none'} (预期为环路外连接带、绿化/景观余量；实施前转为走廊或缓冲带)`)
console.log(`PLAN wide-void(z<12) ${voidBlocks.map(block => `${block.area.toFixed(2)}m²@${block.x0}..${block.x1},${block.z0}..${block.z1}`).join('; ') || 'none'}`)
assert.deepEqual(failures, [], failures.join('\n'))
console.log('PLAN PASS')
