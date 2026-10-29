import { r1ToWorld, runtimeYawFromFacing } from './office-r1-layout.js'

export const R1_WALK_RADIUS = .6
export const R1_GRID = .25
export const R1_RESERVED_SEATS = Object.freeze(['08-CH-011', '08-CH-012', '08-CH-013'])

// R4: real-mesh sweep and connected exit measurements, reproduced by the delivery solver.
export const R1_SEAT_TRANSITIONS = Object.freeze(Object.fromEntries(Object.entries({
  "Architect": {
    "home": [
      6.03,
      -17.8,
      -1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "Backend1": {
    "home": [
      15.67,
      -14.74,
      0
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "Backend2": {
    "home": [
      17.07,
      -14.74,
      0
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "BackendSenior": {
    "home": [
      10.57,
      -19.2,
      -1.5707963267948966
    ],
    "distance": 0.34,
    "degrees": -40,
    "turn": 0
  },
  "DBEngineer": {
    "home": [
      13.54,
      4.8,
      -1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "Frontend1": {
    "home": [
      12.89,
      -19.2,
      1.5707963267948966
    ],
    "distance": 0.34,
    "degrees": 40,
    "turn": 0
  },
  "Frontend2": {
    "home": [
      10.57,
      -17.8,
      -1.5707963267948966
    ],
    "distance": 0.34,
    "degrees": 40,
    "turn": 0
  },
  "FrontendSenior": {
    "home": [
      12.89,
      -17.8,
      1.5707963267948966
    ],
    "distance": 0.34,
    "degrees": -40,
    "turn": 0
  },
  "Go1": {
    "home": [
      15.86,
      3.4,
      1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "Go2": {
    "home": [
      15.86,
      2,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "GoSenior": {
    "home": [
      15.86,
      4.8,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "KnowledgeKeeper": {
    "home": [
      15.67,
      -17.06,
      -3.141592653589793
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "Lead": {
    "home": [
      8.35,
      -17.8,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "LedgerAuditor": {
    "home": [
      13.54,
      3.4,
      -1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "Localizer": {
    "home": [
      15.86,
      -6.4,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "OpsEngineer": {
    "home": [
      -20.44,
      4,
      1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "OpsLead": {
    "home": [
      -20.44,
      5.4,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "PM": {
    "home": [
      8.35,
      -19.2,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "QAAutomation": {
    "home": [
      -20.44,
      2.6,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "React1": {
    "home": [
      15.86,
      -5,
      1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": 0,
    "turn": 0
  },
  "ReactSenior": {
    "home": [
      13.54,
      2,
      -1.5707963267948966
    ],
    "distance": 0.25,
    "degrees": 0,
    "turn": 0
  },
  "Reviewer1": {
    "home": [
      -22.76,
      5.4,
      -1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": -50,
    "turn": 0
  },
  "Reviewer2": {
    "home": [
      -22.76,
      4,
      -1.5707963267948966
    ],
    "distance": 0.67,
    "degrees": 50,
    "turn": -85
  },
  "SecurityReviewer": {
    "home": [
      -22.76,
      2.6,
      -1.5707963267948966
    ],
    "distance": 0.25,
    "degrees": 0,
    "turn": 0
  },
  "UIUX": {
    "home": [
      6.03,
      -19.2,
      -1.5707963267948966
    ],
    "distance": 0.26,
    "degrees": -10,
    "turn": 0
  }
}).map(([name, row]) => [name, Object.freeze({ ...row, home: Object.freeze(row.home) })])))

// R6: measured public-seat transitions; four sofa point lists approved verbatim.
export const R1_PUBLIC_TRANSITIONS = Object.freeze(Object.fromEntries(Object.entries({"02-CH-001":[[-16.5,-17.8],[-16.5,-16.89]],"02-CH-002":[[-16.5,-20.2],[-16.5,-21.11]],"02-CH-003":[[-15.3,-17.8],[-15.3,-16.89]],"02-CH-004":[[-15.3,-20.2],[-15.3,-21.11]],"02-CH-005":[[-14.1,-17.8],[-14.1,-16.89]],"02-CH-006":[[-14.1,-20.2],[-14.1,-21.11]],"02-CH-007":[[-12.9,-17.8],[-12.9,-16.89]],"02-CH-008":[[-12.9,-20.2],[-12.9,-21.11]],"02-CH-009":[[-11.7,-17.8],[-11.7,-16.89]],"02-CH-010":[[-11.7,-20.2],[-11.7,-21.11]],"02-CH-011":[[-10.5,-17.8],[-10.5,-16.89]],"02-CH-012":[[-10.5,-20.2],[-10.5,-21.11]],"02-CH-013":[[-17.55,-19],[-18.46,-19]],"02-CH-014":[[-9.45,-19],[-8.54,-19]],"03-CH-001":[[-2.55,-16],[-1.6399999999999997,-16]],"03-CH-002":[[-3.6,-17.05],[-3.6,-17.96]],"03-CH-003":[[-4.65,-16],[-5.5600000000000005,-16]],"03-CH-004":[[-3.6,-14.95],[-3.5999999999999996,-14.04]],"03-CH-005":[[-2.55,-21.9],[-1.6399999999999997,-21.9]],"03-CH-006":[[-3.6,-22.95],[-3.6,-23.86]],"03-CH-007":[[-4.65,-21.9],[-5.5600000000000005,-21.9]],"03-CH-008":[[-3.6,-20.85],[-3.5999999999999996,-19.94]],"07-CH-001":[[-1.85274,-2.697717],[-1.9968682035659249,-1.8803266031045756]],"07-CH-002":[[-1.140782,-1.464571],[-0.9966535353203152,-0.6471806491460909]],"07-CH-003":[[-0.05,-0.549296],[0.3649998548795946,0.16950516892636958]],"07-CH-004":[[1.288042,-0.062288],[1.9238590040182766,0.4712255775228431]],"07-CH-005":[[2.711958,-0.062288],[3.4919028134078394,0.2215888888765185]],"07-CH-006":[[4.05,-0.549296],[3.6350001451204053,0.16950516892636958]],"07-CH-007":[[5.140782,-1.464571],[5.920727040987603,-1.7484472636058994]],"07-CH-008":[[5.85274,-2.697717],[6.4885567467379195,-3.2312308841376183]],"07-CH-009":[[6.1,-4.1],[6.515,-4.818801085141084]],"07-CH-010":[[5.85274,-5.502283],[5.996868203565925,-6.319673396895425]],"07-CH-011":[[5.140782,-6.735429],[4.725781580343225,-7.454229842851968]],"07-CH-012":[[-1.140782,-6.735429],[-0.7257815803432253,-7.454229842851968]],"07-CH-013":[[-1.85274,-5.502283],[-2.48855674673792,-4.968769115862382]],"07-CH-014":[[-2.1,-4.1],[-2.515,-3.3811989148589157]],"10-CH-001":[[-15.3,11.75],[-15.3,10.9]],"10-CH-002":[[-13.95,11.75],[-13.95,10.9]],"10-CH-003":[[-12.6,11.75],[-12.6,10.9]],"10-CH-004":[[-11.25,11.75],[-11.25,10.9]],"10-CH-005":[[-9.9,11.75],[-9.9,10.9]],"10-CH-006":[[-14.4,14.6],[-13.49,14.6]],"10-CH-007":[[-15.9,13.733975],[-15.11191697441717,13.278974840892102]],"10-CH-008":[[-15.9,15.466025],[-15.120577227445551,15.916025157359458]],"10-CH-009":[[-8.4,15],[-7.49,15]],"10-CH-010":[[-9.9,14.133975],[-9.11191697441717,13.678974840892103]],"10-CH-011":[[-9.9,15.866025],[-9.120577227445551,16.31602515735946]],"14-BN-001":[[-8,35],[-8,34.12]],"14-BN-002":[[11,35],[11,34.12]],"14-BN-003":[[22.5,29],[21.62,29]],"14-BN-004":[[-18,33],[-18,32.12]],"14-CH-001":[[-15,29],[-14.09,29]],"14-CH-002":[[-16,28],[-16,27.09]],"14-CH-003":[[-17,29],[-17.91,29]],"14-CH-004":[[-16,30],[-16,30.91]],"14-CH-005":[[-16.5,24],[-15.59,24]],"14-CH-006":[[-17.5,23],[-17.5,22.09]],"14-CH-007":[[-18.5,24],[-19.41,24]],"14-CH-008":[[-17.5,25],[-17.5,25.91]],"12-SF-001":[[14.039365,12.400265],[14.409738692692903,12.551338914892755],[15.4,11.775]],"12-SF-002":[[14.518558,14.814065],[14.789034554390293,14.519374597161436],[15.4,11.775]],"12-SF-003":[[17.025029,15.08122],[16.833645159613894,14.729976173521775],[16.6,11.775]],"12-SF-004":[[17.960623,12.757641],[17.57043111283354,12.845676738137861],[16.6,11.775]]}).map(([id, points]) => [id, Object.freeze(points.map(([x, z]) => Object.freeze({ x, z })))])))

const distance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2)
const cache = new WeakMap()
class Heap {
  rows = { length: 0 }
  first = { id: 0, g: 0, f: 0 }
  ids = new Int32Array(4096)
  gs = new Float64Array(4096)
  fs = new Float64Array(4096)
  push(id, g, f) {
    let i = this.rows.length++
    if (i === this.ids.length) for (const key of ['ids', 'gs', 'fs']) { const next = new this[key].constructor(i * 2); next.set(this[key]); this[key] = next }
    while (i) { const p = (i - 1) >> 1; if (this.fs[p] <= f) break; this.ids[i] = this.ids[p]; this.gs[i] = this.gs[p]; this.fs[i] = this.fs[p]; i = p }
    this.ids[i] = id; this.gs[i] = g; this.fs[i] = f
  }
  pop() {
    const first = this.first, n = --this.rows.length; first.id = this.ids[0]; first.g = this.gs[0]; first.f = this.fs[0]
    if (n) {
      const id = this.ids[n], g = this.gs[n], f = this.fs[n]; let i = 0
      while (i * 2 + 1 < n) { let c = i * 2 + 1; if (c + 1 < n && this.fs[c + 1] < this.fs[c]) c++; if (this.fs[c] >= f) break; this.ids[i] = this.ids[c]; this.gs[i] = this.gs[c]; this.fs[i] = this.fs[c]; i = c }
      this.ids[i] = id; this.gs[i] = g; this.fs[i] = f
    }
    return first
  }
}

export function createR1Navigation(layout) {
  if (cache.has(layout)) return cache.get(layout)
  let collision, bodies = [], dynamic = [], cells = new Map(), revision = 0, mask = null
  const bodyIndex = new Map()
  const fine = .05, cols = Math.ceil((layout.site.x1 - layout.site.x0) / fine), rows = Math.ceil((layout.site.z1 - layout.site.z0) / fine)
  const width = Math.floor((layout.site.x1 - layout.site.x0) / R1_GRID) + 1, height = Math.floor((layout.site.z1 - layout.site.z0) / R1_GRID) + 1, size = width * height
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]
  const gridPoints = Array.from({ length: size }, (_, id) => ({ x: layout.site.x0 + (id % width) * R1_GRID, z: layout.site.z0 + Math.floor(id / width) * R1_GRID }))
  const directionLengths = directions.map(([x, z]) => Math.hypot(x, z) * R1_GRID)
  let edges = null, staticBlocked = null, integral = null, prepared = false
  const jumpSegments = []
  const jumpEdges = new Map(), reverseJumps = new Map(), landmarkCosts = [], reverseCosts = []
  const search = { blocked: new Int8Array(size), links: new Uint32Array(size), estimates: new Float64Array(size), costs: new Float64Array(size), previous: new Int32Array(size), closed: new Uint8Array(size), open: new Heap(), peopleFlags: new Uint32Array(size), reached: new Uint8Array(size), queue: new Int32Array(size) }
  const preparation = { milliseconds: 0, searchWarmup: [] }
  const bodyMasks = new Map()
  const currentMasks = new WeakMap()
  const stations = new Map(layout.r1.workstations.map(w => [w.business_id, { ...w, home: layout.seats[w.business_id][4] }]))
  const ownedChairs = new Set([...stations.values()].map(s => s.chair_id)), parameters = new Map()
  const identity = b => b.group.userData.r1Id || b.group.name
  const movable = b => ownedChairs.has(identity(b)) || !!b.group.userData.r1Door
  const bodyFor = id => bodyIndex.get(id)
  const square = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`
  function attach(value) {
    collision = value; bodies = collision.navigationBodies(); dynamic = bodies.filter(movable); cells = new Map()
    bodyIndex.clear(); for (const body of bodies) if (!bodyIndex.has(identity(body))) bodyIndex.set(identity(body), body)
    for (const source of bodies) {
      if (ownedChairs.has(identity(source))) continue
      // Planning includes the parked, fully open leaf; runtime additionally checks its current moving pose.
      const body = source.group.userData.r1Door ? { ...source, box: source.box.clone(), triangles: source.triangles.map(t => t.clone()) } : source
      for (const tri of body.triangles) {
        const x0 = Math.floor((Math.min(tri.a.x, tri.b.x, tri.c.x) - .8) / 2), x1 = Math.floor((Math.max(tri.a.x, tri.b.x, tri.c.x) + .8) / 2)
        const z0 = Math.floor((Math.min(tri.a.z, tri.b.z, tri.c.z) - .8) / 2), z1 = Math.floor((Math.max(tri.a.z, tri.b.z, tri.c.z) + .8) / 2)
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, new Map()); const cell = cells.get(key)
          if (!cell.has(body.group)) cell.set(body.group, { ...body, triangles: [] }); cell.get(body.group).triangles.push(tri)
        }
      }
    }
    cells = new Map([...cells].map(([k, v]) => [k, [...v.values()]])); parameters.clear(); revision++
    for (const [name, s] of stations) {
      const own = bodyFor(s.chair_id), desk = bodyFor(s.desk_id), ignore = new Set([own?.group, desk?.group]), back = { x: Math.sin(s.home.yaw), z: Math.cos(s.home.yaw) }
      const frozen = R1_SEAT_TRANSITIONS[name]
      if (frozen && [s.home.x, s.home.z, s.home.yaw].some((v, i) => Math.abs(v - frozen.home[i]) > 1e-9)) throw new Error(`R1 ${name}: frozen workstation changed`)
      let exit
      if (frozen) {
        const a = s.home.yaw + frozen.degrees * Math.PI / 180
        exit = { x: s.home.x + Math.sin(a) * frozen.distance, z: s.home.z + Math.cos(a) * frozen.distance, distance: frozen.distance, degrees: frozen.degrees }
        if (query(exit, name) || !clear(s.home, exit, name, .6, ignore)) throw new Error(`R1 ${name}: frozen exit obstructed`)
      }
      for (let cm = 0; cm <= 120 && !exit; cm++) for (const degrees of [0, -10, 10, -20, 20, -30, 30, -40, 40, -50, 50, -60, 60]) {
        const a = degrees * Math.PI / 180, dx = back.x * Math.cos(a) + back.z * Math.sin(a), dz = back.z * Math.cos(a) - back.x * Math.sin(a)
        const p = { x: s.home.x + dx * cm / 100, z: s.home.z + dz * cm / 100 }
        if (query(p, name) || !clear(s.home, p, name, .6, ignore)) continue
        exit = { ...p, distance: cm / 100, degrees }; break
      }
      if (!exit) throw new Error(`R1 ${name}: no exit within 1.2 m / 60 degrees`)
      parameters.set(name, Object.freeze({ name, chairId: s.chair_id, deskId: s.desk_id, standing: { ...s.home }, exit, slide: .8, turn: frozen?.turn || 0, riseSeconds: .8, restoreSeconds: .6, back }))
    }
    return nav
  }
  function refreshChairs() { dynamic = collision.navigationBodies().filter(movable); revision++ }
  function query(p, name, radius = .6, ignore) {
    if (!collision) throw new Error('R1 navigation is not attached to real collision geometry')
    const s = stations.get(name), excluded = ignore || new Set(s ? [bodyFor(s.chair_id)?.group] : [])
    const { x0, x1, z0, z1 } = layout.site
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || p.x < x0 + radius || p.x > x1 - radius || p.z < z0 + radius || p.z > z1 - radius) return { kind: 'site-boundary' }
    return collision.navigationHit(p.x, p.z, radius, excluded, cells.get(square(p.x, p.z)) || []) || collision.navigationHit(p.x, p.z, radius, excluded, dynamic)
  }
  function clear(a, b, name, radius = .6, ignore) {
    const n = Math.max(1, Math.ceil(distance(a, b) / .04))
    for (let i = 0; i <= n; i++) if (query({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n }, name, radius, ignore)) return false
    return true
  }
  async function prepare() {
    if (mask) return
    const started = performance.now()
    const next = new Uint8Array(cols * rows), radius = .6 + Math.SQRT2 * fine / 2
    for (let iz = 0; iz < rows; iz++) {
      const z = layout.site.z0 + (iz + .5) * fine
      for (let ix = 0; ix < cols; ix++) {
        const x = layout.site.x0 + (ix + .5) * fine
        const candidates = cells.get(square(x, z)) || []
        const outside = x < layout.site.x0 + .6 || x > layout.site.x1 - .6 || z < layout.site.z0 + .6 || z > layout.site.z1 - .6
        next[iz * cols + ix] = outside ? 1 : !collision.navigationHit(x, z, radius, null, candidates) ? 0 : collision.navigationHit(x, z, .6 - Math.SQRT2 * fine / 2, null, candidates) ? 1 : 2
      }
      if (iz % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    mask = next
    // Skip only samples already proven clear by the conservative raster.
    integral = new Uint32Array((cols + 1) * (rows + 1))
    for (let z = 0; z < rows; z++) {
      let sum = 0
      for (let x = 0; x < cols; x++) { sum += mask[z * cols + x] !== 0; integral[(z + 1) * (cols + 1) + x + 1] = integral[z * (cols + 1) + x + 1] + sum }
    }
    staticBlocked = new Uint8Array(size); edges = new Uint32Array(size)
    for (let id = 0; id < size; id++) staticBlocked[id] = !rasterFree(point(id % width, Math.floor(id / width)))
    for (let iz = 0; iz < height; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const id = iz * width + ix
        if (staticBlocked[id]) continue
        const a = point(ix, iz)
        directions.forEach(([dx, dz], bit) => {
          const x = ix + dx, z = iz + dz
          if (x >= 0 && z >= 0 && x < width && z < height && !staticBlocked[z * width + x] && staticClear(a, point(x, z))) edges[id] |= 1 << bit
        })
      }
      if (iz % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    // Geometry-derived visible grid edges bridge narrow diagonal passages; no fixed waypoints.
    for (let iz = 1; iz < height - 1; iz++) {
      for (let ix = 1; ix < width - 1; ix++) {
        const id = iz * width + ix
        if (staticBlocked[id] || (edges[id] & 255) === 255) continue
        const a = point(ix, iz), jumps = []
        for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) < 3 || dx * dx + dz * dz > 100) continue
          const x = ix + dx, z = iz + dz, next = z * width + x
          if (x < 0 || z < 0 || x >= width || z >= height || staticBlocked[next]) continue
          const b = point(x, z)
          if (staticClear(a, b)) {
            const edge = jumpSegments.length
            jumpSegments.push([a, b]); jumps.push([next, Math.hypot(dx, dz) * R1_GRID, edge])
          }
        }
        if (jumps.length) jumpEdges.set(id, jumps)
      }
      if (iz % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    search.jumpBlocked = new Uint8Array(jumpSegments.length)
    // Directed landmark distances bound the search without prescribing waypoints.
    const freeIds = [], chosen = new Set()
    for (const [id, jumps] of jumpEdges) for (const [next, length, edge] of jumps) {
      if (!reverseJumps.has(next)) reverseJumps.set(next, [])
      reverseJumps.get(next).push([id, length, edge])
    }
    for (let id = 0; id < size; id++) if (!staticBlocked[id]) freeIds.push(id)
    const fields = (source, reverse) => {
      const costs = new Float64Array(size).fill(Infinity), open = new Heap(); costs[source] = 0; open.push(source, 0, 0)
      while (open.rows.length) {
        const row = open.pop(), id = row.id
        if (row.g > costs[id]) continue
        const relax = (next, length) => { const g = row.g + length; if (g < costs[next]) { costs[next] = g; open.push(next, g, g) } }
        directions.forEach(([dx, dz], bit) => { if (edges[id] & (1 << bit)) relax(id + dz * width + dx, directionLengths[bit]) })
        for (const [next, length] of (reverse ? reverseJumps : jumpEdges).get(id) || []) relax(next, length)
      }
      return costs
    }
    for (let k = 0; k < 24 && k < freeIds.length; k++) {
      let source = freeIds[0], farthest = -1
      for (const id of freeIds) {
        if (chosen.has(id)) continue
        let nearest = Infinity
        for (const costs of landmarkCosts) nearest = Math.min(nearest, costs[id])
        if (nearest > farthest) { farthest = nearest; source = id }
      }
      chosen.add(source); landmarkCosts.push(fields(source, false)); reverseCosts.push(fields(source, true))
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    for (const body of dynamic) {
      if (body.group.userData.r1Door) continue
      bodyMask(body, .6); bodyMask(body, .24)
      const p = [...parameters.values()].find(p => p.chairId === identity(body))
      if (p) {
        const open = { ...body, box: body.box.clone().makeEmpty(), triangles: body.triangles.map(t => t.clone()) }, co = Math.cos(p.turn * Math.PI / 180), si = Math.sin(p.turn * Math.PI / 180)
        for (const t of open.triangles) for (const v of [t.a, t.b, t.c]) {
          const x = v.x - p.standing.x, z = v.z - p.standing.z
          v.x = p.standing.x + co * x + si * z + p.back.x * p.slide; v.z = p.standing.z - si * x + co * z + p.back.z * p.slide; open.box.expandByPoint(v)
        }
        bodyMask(open, .6); bodyMask(open, .24)
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    // Warm the real search during initialization; report this cost separately and retain no routes.
    const probes = [...chosen].filter(id => !query(gridPoints[id]) && Number.isFinite(landmarkCosts[0][id]))
    for (let i = 1; i < Math.min(9, probes.length); i++) {
      const start = performance.now(), path = plan(gridPoints[probes[i - 1]], gridPoints[probes[i]])
      preparation.searchWarmup.push({ reachable: !!path, milliseconds: performance.now() - start })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    preparation.milliseconds = performance.now() - started
    prepared = true
  }
  function rasterFree(p) {
    const x = Math.floor((p.x - layout.site.x0) / fine), z = Math.floor((p.z - layout.site.z0) / fine)
    if (x < 0 || x >= cols || z < 0 || z >= rows) return false
    const state = mask[z * cols + x]
    return state === 0 || state === 2 && !collision.navigationHit(p.x, p.z, .6, null, cells.get(square(p.x, p.z)) || [])
  }
  function dynamicFree(p, name) {
    const owner = stations.get(name)?.chair_id
    for (const b of dynamic) {
      if (b.group.userData.r1Door) continue
      const radius = identity(b) === owner ? .24 : .6
      const dx = Math.max(b.box.min.x - p.x, 0, p.x - b.box.max.x), dz = Math.max(b.box.min.z - p.z, 0, p.z - b.box.max.z)
      if (dx * dx + dz * dz < radius * radius && collision.navigationHit(p.x, p.z, radius, null, [b])) return false
    }
    return true
  }
  function movingClear(a, b, name, candidates = dynamic, fixedRadius) {
    const owner = stations.get(name)?.chair_id, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
    for (const body of candidates) {
      if (body.group.userData.r1Door) continue
      const radius = fixedRadius ?? (identity(body) === owner ? .24 : .6), box = body.box
      if (Math.max(a.x, b.x) < box.min.x - radius || Math.min(a.x, b.x) > box.max.x + radius || Math.max(a.z, b.z) < box.min.z - radius || Math.min(a.z, b.z) > box.max.z + radius) continue
      let lo = 0, hi = 1
      for (const [origin, delta, min, max] of [[a.x, dx, box.min.x - radius, box.max.x + radius], [a.z, dz, box.min.z - radius, box.max.z + radius]]) {
        if (Math.abs(delta) < 1e-12) { if (origin < min || origin > max) lo = 2 }
        else { const p = (min - origin) / delta, q = (max - origin) / delta; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)) }
      }
      if (lo > hi) continue
      const raster = bodyMask(body, radius, false)?.raster, n = Math.max(1, Math.ceil((hi - lo) * Math.sqrt(length2) / .0125))
      for (let i = 0; i <= n; i++) {
        const t = lo + (hi - lo) * i / n, x = a.x + dx * t, z = a.z + dz * t
        if (!raster) { if (collision.navigationHit(x,z,radius,null,[body])) return false; continue }
        const ix = Math.floor((x - raster.x0) / .025), iz = Math.floor((z - raster.z0) / .025)
        const state = ix < 0 || iz < 0 || ix >= raster.width || iz >= raster.height ? 0 : raster.cells[iz * raster.width + ix]
        if (state === 1 || state === 2 && collision.navigationHit(x, z, radius, null, [body])) return false
      }
    }
    return true
  }
  function staticClear(a, b, name, connector = false) {
    const length = distance(a, b), n = Math.max(1, Math.ceil(length / (fine / 2))), dx = (b.x - a.x) / n, dz = (b.z - a.z) / n
    // Reject proven solid samples before expensive triangle checks near other boundaries.
    if (length > 1) for (let i = 0; i <= n; i++) {
      if (connector && Math.min(i, n - i) * length / n <= .1) continue
      const x = Math.floor((a.x + dx * i - layout.site.x0) / fine), z = Math.floor((a.z + dz * i - layout.site.z0) / fine)
      if (x >= 0 && x < cols && z >= 0 && z < rows && mask[z * cols + x] === 1) return false
    }
    function range(lo, hi) {
      const ax = a.x + dx * lo, az = a.z + dz * lo, bx = a.x + dx * hi, bz = a.z + dz * hi
      const x0 = Math.floor((Math.min(ax, bx) - layout.site.x0) / fine), x1 = Math.floor((Math.max(ax, bx) - layout.site.x0) / fine) + 1
      const z0 = Math.floor((Math.min(az, bz) - layout.site.z0) / fine), z1 = Math.floor((Math.max(az, bz) - layout.site.z0) / fine) + 1
      if (integral && x0 >= 0 && z0 >= 0 && x1 <= cols && z1 <= rows && integral[z1 * (cols + 1) + x1] - integral[z0 * (cols + 1) + x1] - integral[z1 * (cols + 1) + x0] + integral[z0 * (cols + 1) + x0] === 0) return true
      if (hi - lo > 8) { const mid = (lo + hi) >> 1; return range(lo, mid) && range(mid + 1, hi) }
      for (let i = lo; i <= hi; i++) {
        const p = { x: a.x + dx * i, z: a.z + dz * i }
        if (!rasterFree(p) && !(connector && Math.min(i, n - i) * length / n <= .1 && !query(p, name))) return false
      }
      return true
    }
    return range(0, n)
  }
  function clearFast(a, b, name, connector = false) {
    if (!mask) return clear(a, b, name)
    return staticClear(a, b, name, connector) && movingClear(a, b, name)
  }
  const point = (ix, iz) => ix >= 0 && iz >= 0 && ix < width && iz < height ? gridPoints[iz * width + ix] : ({ x: layout.site.x0 + ix * R1_GRID, z: layout.site.z0 + iz * R1_GRID })
  function bodyMask(body, radius, build = true) {
    const box = body.box, first = body.triangles[0]?.a
    let current = currentMasks.get(body)
    if (!current || current.x0 !== box.min.x || current.z0 !== box.min.z || current.x1 !== box.max.x || current.z1 !== box.max.z || current.x !== first?.x || current.z !== first?.z) {
      current = { x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, x: first?.x, z: first?.z, radii: new Map() }; currentMasks.set(body, current)
    }
    if (current.radii.has(radius)) return current.radii.get(radius)
    const key = `${identity(body)}:${radius}:${box.min.x.toFixed(6)},${box.min.z.toFixed(6)},${box.max.x.toFixed(6)},${box.max.z.toFixed(6)},${first?.x.toFixed(6)},${first?.z.toFixed(6)}`
    if (bodyMasks.has(key)) { current.radii.set(radius, bodyMasks.get(key)); return bodyMasks.get(key) }
    if (!build) return null
    const blocked = [], links = [], nearby = []
    const x0 = Math.max(0, Math.floor((box.min.x - radius - .75 - layout.site.x0) / R1_GRID)), x1 = Math.min(width - 1, Math.ceil((box.max.x + radius + .75 - layout.site.x0) / R1_GRID))
    const z0 = Math.max(0, Math.floor((box.min.z - radius - .75 - layout.site.z0) / R1_GRID)), z1 = Math.min(height - 1, Math.ceil((box.max.z + radius + .75 - layout.site.z0) / R1_GRID))
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const id = z * width + x, p = point(x, z)
      nearby.push(id)
      if (collision.navigationHit(p.x, p.z, radius, null, [body])) { blocked.push(id); continue }
      let bits = 65535
      directions.forEach(([dx, dz], bit) => {
        if (edges && !(edges[id] & (1 << bit))) return
        const n = Math.ceil(Math.hypot(dx, dz) * R1_GRID / .01)
        for (let i = 1; i <= n; i++) if (collision.navigationHit(p.x + dx * R1_GRID * i / n, p.z + dz * R1_GRID * i / n, radius, null, [body])) { bits &= ~(1 << bit); break }
      })
      if (bits !== 65535) links.push([id, bits])
    }
    const fine = .025, margin = Math.SQRT2 * fine / 2, raster = { x0: box.min.x - radius - fine, z0: box.min.z - radius - fine, width: Math.ceil((box.max.x - box.min.x + radius * 2 + fine * 2) / fine), height: Math.ceil((box.max.z - box.min.z + radius * 2 + fine * 2) / fine) }
    raster.cells = new Uint8Array(raster.width * raster.height)
    for (let z = 0; z < raster.height; z++) for (let x = 0; x < raster.width; x++) {
      const px = raster.x0 + (x + .5) * fine, pz = raster.z0 + (z + .5) * fine
      raster.cells[z * raster.width + x] = !collision.navigationHit(px, pz, radius + margin, null, [body]) ? 0 : collision.navigationHit(px, pz, radius - margin, null, [body]) ? 1 : 2
    }
    const result = { blocked, links, nearby, raster, jumps: [] }; bodyMasks.set(key, result); current.radii.set(radius, result)
    for (let i = 0; i < jumpSegments.length; i++) {
      const [a,b] = jumpSegments[i]
      if (Math.max(a.x,b.x) < box.min.x-radius || Math.min(a.x,b.x)>box.max.x+radius || Math.max(a.z,b.z)<box.min.z-radius || Math.min(a.z,b.z)>box.max.z+radius) continue
      // The single-body mask is already cached, so this cannot recurse.
      if (!movingClear(a,b, undefined, [body], radius)) result.jumps.push(i)
    }
    return result
  }
  function smoothPath(path, name) {
    if (path.length < 3) return path
    const out = [path[0]]
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1], ab = distance(a, b), bc = distance(b, c)
      let curve = null
      for (let radius = Math.min(.2, ab / 3, bc / 3); radius >= .0125; radius /= 2) {
        const enter = { x: b.x + (a.x - b.x) * radius / ab, z: b.z + (a.z - b.z) * radius / ab }, leave = { x: b.x + (c.x - b.x) * radius / bc, z: b.z + (c.z - b.z) * radius / bc }
        const points = [], n = Math.max(4, Math.ceil(radius * 2 / .02))
        for (let j = 0; j <= n; j++) { const t = j / n, u = 1 - t; points.push({ x: u * u * enter.x + 2 * u * t * b.x + t * t * leave.x, z: u * u * enter.z + 2 * u * t * b.z + t * t * leave.z }) }
        if (points.every((p, j) => j === 0 || clearFast(points[j - 1], p, name))) { curve = points; break }
      }
      out.push(...(curve || [b]))
    }
    out.push(path.at(-1)); return out
  }
  // A valid local seat approach must also join the walkable component outside the furniture.
  function reachableFrom(start, name) {
    const blocked = staticBlocked.slice(), links = edges.slice(), owner = stations.get(name)?.chair_id
    for (const body of dynamic) {
      if (body.group.userData.r1Door) continue
      const cached = bodyMask(body, identity(body) === owner ? .24 : .6)
      for (const id of cached.blocked) blocked[id] = 1
      for (const [id, bits] of cached.links) links[id] &= bits
    }
    const seen = new Uint8Array(size), queue = new Int32Array(size); let head = 0, tail = 0
    const connectors = (p, accept) => {
      const cx = Math.round((p.x - layout.site.x0) / R1_GRID), cz = Math.round((p.z - layout.site.z0) / R1_GRID)
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const x = cx + dx, z = cz + dz, id = z * width + x
        if (x >= 0 && z >= 0 && x < width && z < height && !blocked[id] && accept(id, point(x, z))) return true
      }
      return false
    }
    connectors(start, (id, p) => { if (!seen[id] && clearFast(start, p, name, true)) { seen[id] = 1; queue[tail++] = id }; return false })
    while (head < tail) {
      const id = queue[head++], x = id % width, z = Math.floor(id / width)
      directions.forEach(([dx, dz], bit) => {
        if (!(links[id] & (1 << bit))) return
        const nx = x + dx, nz = z + dz, next = nz * width + nx
        if (nx >= 0 && nz >= 0 && nx < width && nz < height && !blocked[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next }
      })
    }
    return p => !query(p, name) && connectors(p, (id, q) => seen[id] && clearFast(p, q, name, true))
  }
  function plan(start, end, name, people = []) {
    const peopleClear = (a, b) => {
      if (!people.length) return true
      const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz
      for (const p of people) { const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (length2 || 1))); const x = p.x - a.x - t * dx, z = p.z - a.z - t * dz; if(x * x + z * z < .25) return false }
      return true
    }
    const visible = (a, b, connector = false) => peopleClear(a, b) && clearFast(a, b, name, connector)
    if (query(start, name) || query(end, name)) return null
    if (visible(start, end, true)) return [{ ...start }, { ...end }]
    const uncached = [], owner = stations.get(name)?.chair_id
    const { blocked, links, jumpBlocked } = search; blocked.fill(-1); if (edges) links.set(edges); jumpBlocked?.fill(0)
    if (staticBlocked) {
      blocked.set(staticBlocked)
      for (const b of dynamic) {
        if (b.group.userData.r1Door) continue
        const cached = bodyMask(b, identity(b) === owner ? .24 : .6, false)
        if (!cached) { uncached.push(b); continue }
        for (const id of cached.blocked) blocked[id] = 1
        for (const [id, bits] of cached.links) links[id] &= bits
        for (const edge of cached.jumps) jumpBlocked[edge] = 1
      }
    }
    const free = (id, p) => { if (blocked[id] < 0) blocked[id] = (mask ? rasterFree(p) && dynamicFree(p, name) : !query(p, name)) ? 0 : 1; return !blocked[id] && peopleClear(p, p) && !uncached.some(b => collision.navigationHit(p.x,p.z,identity(b) === owner ? .24 : .6,null,[b])) }
    // A grid edge is at most 2.5 m: only people within 3 m of its start can intersect it.
    const flags = search.peopleFlags; flags.fill(0)
    for (let i = 0; i < people.length; i++) {
      const p = people[i], x0 = Math.max(0, Math.floor((p.x - 3.01 - layout.site.x0) / R1_GRID)), x1 = Math.min(width-1, Math.ceil((p.x + 3.01 - layout.site.x0) / R1_GRID))
      const z0 = Math.max(0, Math.floor((p.z - 3.01 - layout.site.z0) / R1_GRID)), z1 = Math.min(height-1, Math.ceil((p.z + 3.01 - layout.site.z0) / R1_GRID))
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)flags[z*width+x] |= 1<<i
    }
    const edgePeopleClear = (id,a,b) => {
      const bits=flags[id];if(!bits)return true
      const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz
      for(let i=0;i<people.length;i++)if(bits&(1<<i)){const p=people[i],t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(length2||1))),x=p.x-a.x-t*dx,z=p.z-a.z-t*dz;if(x*x+z*z<.25)return false}
      return true
    }
    const goals = [], ex = Math.round((end.x - layout.site.x0) / R1_GRID), ez = Math.round((end.z - layout.site.z0) / R1_GRID)
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const x = ex + dx, z = ez + dz, id = z * width + x
      if (x >= 0 && z >= 0 && x < width && z < height && free(id, point(x, z)) && visible(point(x, z), end, true)) goals.push([id, distance(point(x, z), end)])
    }
    if (!goals.length) return null
    const goalDistances = landmarkCosts.map(costs => Math.min(...goals.map(([id, length]) => costs[id] + length))), reverseGoals = reverseCosts.map(costs => Math.min(...goals.map(([id, length]) => costs[id] + length))), estimates = search.estimates; estimates.fill(-1)
    const originId = Math.round((start.z - layout.site.z0) / R1_GRID) * width + Math.round((start.x - layout.site.x0) / R1_GRID)
    // A 2% weighted A* budget reduces expansion; independent any-angle checks enforce the overall 5% limit.
    const ranked = landmarkCosts.map((costs, i) => ({ i, bound: Math.max(Number.isFinite(goalDistances[i] - costs[originId]) ? goalDistances[i] - costs[originId] : 0, Number.isFinite(reverseCosts[i][originId] - reverseGoals[i]) ? reverseCosts[i][originId] - reverseGoals[i] : 0) })).sort((a,b) => b.bound - a.bound).map(r => r.i)
    const selected = ranked.slice(0, 4)
    const heuristic = id => {
      if (estimates[id] >= 0) return estimates[id]
      let h = distance(gridPoints[id], end)
      for (const i of selected) {
        if (Number.isFinite(goalDistances[i]) && Number.isFinite(landmarkCosts[i][id])) h = Math.max(h, goalDistances[i] - landmarkCosts[i][id])
        if (Number.isFinite(reverseGoals[i]) && Number.isFinite(reverseCosts[i][id])) h = Math.max(h, reverseCosts[i][id] - reverseGoals[i])
      }
      return estimates[id] = h
    }
    const { costs, previous, closed, open } = search; costs.fill(Infinity); previous.fill(-2); closed.fill(0); open.rows.length = 0
    const sx = Math.round((start.x - layout.site.x0) / R1_GRID), sz = Math.round((start.z - layout.site.z0) / R1_GRID)
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const x = sx + dx, z = sz + dz, id = z * width + x, p = point(x, z)
      if (x < 0 || z < 0 || x >= width || z >= height || !free(id, p) || !visible(start, p, true)) continue
      costs[id] = distance(start, p); previous[id] = -1; open.push(id, costs[id], costs[id] + 1.02 * heuristic(id))
    }
    // A temporarily sealed destination must not trigger an exhaustive search of the whole site.
    const { reached, queue } = search; reached.fill(0); let head = 0, tail = 0, connected = false
    for (const [id] of goals) { reached[id] = 1; queue[tail++] = id }
    while (head < tail && head < 128 && !connected) {
      const id = queue[head++], here = gridPoints[id]
      if (Number.isFinite(costs[id])) { connected = true; break }
      const visit = (from, edge) => {
        if (blocked[from] || reached[from] || edge !== undefined && jumpBlocked[edge]) return
        const p = gridPoints[from]
        if (!edgePeopleClear(from,p,here) || uncached.length && !movingClear(p,here,name,uncached)) return
        reached[from] = 1; queue[tail++] = from
      }
      for (const [from, , edge] of reverseJumps.get(id) || []) visit(from,edge)
      const x = id % width, z = Math.floor(id / width)
      for (let bit = 0; bit < directions.length; bit++) {
        const [dx,dz] = directions[bit], px=x-dx, pz=z-dz, from=id-dz*width-dx
        if (px>=0 && px<width && pz>=0 && pz<height && links[from] & (1<<bit)) visit(from)
      }
    }
    if (!connected && head === tail) return null
    while (open.rows.length) {
      const row = open.pop(), id = row.id
      if (closed[id] || row.g > costs[id]) continue
      closed[id] = 1
      const x = id % width, z = Math.floor(id / width), here = gridPoints[id]
      if (Math.abs(here.x - end.x) <= 1.125 && Math.abs(here.z - end.z) <= 1.125 && visible(here, end, true)) {
        const result = [{ ...end }]
        for (let i = id; i >= 0; i = previous[i]) result.unshift(gridPoints[i])
        result.unshift({ ...start })
        for (let i = result.length - 2; i > 0; i--) {
          const a = result[i - 1], b = result[i], c = result[i + 1]
          if (Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-9) result.splice(i, 1)
        }
        for (let i = 0; i < result.length - 2; i++) { let j = result.length - 1; while (j > i + 1 && !visible(result[i], result[j], i === 0 || j === result.length - 1)) j--; result.splice(i + 1, j - i - 1) }
        return result
      }
      for (const [next, length, edge] of jumpEdges.get(id) || []) {
        if (closed[next] || blocked[next]) continue
        const g = row.g + length
        if (g >= costs[next]) continue
        const p = gridPoints[next]
        if (jumpBlocked[edge] || !edgePeopleClear(id,here,p) || uncached.length && !movingClear(here,p,name,uncached)) continue
        costs[next] = g; previous[next] = id; open.push(next, g, g + 1.02 * heuristic(next))
      }
      for (let bit = 0; bit < directions.length; bit++) {
        if (!(links[id] & (1 << bit))) continue
        const [dx, dz] = directions[bit], next = id + dz * width + dx
        if (closed[next] || blocked[next]) continue
        const g = row.g + directionLengths[bit]
        if (g >= costs[next]) continue
        const p = gridPoints[next]
        if (!edgePeopleClear(id,here,p) || uncached.length && !movingClear(here,p,name,uncached)) continue
        costs[next] = g; previous[next] = id; open.push(next, g, g + 1.02 * heuristic(next))
      }
    }
    return null
  }

  const seats = layout.r1.elements.filter(e => ['02', '03', '07', '10', '12', '14'].includes(e.regionId) && ['椅子', '吧凳', '弧形沙发段', '室外长椅'].includes(e.category)).map(e => ({ id: e.id, category: e.category, ...r1ToWorld(e.xM, e.yM), yaw: e.facingLocal ? runtimeYawFromFacing(e.facingLocal[0], -e.facingLocal[1]) : -Number(e.yawDeg || 0) * Math.PI / 180, zone: e.regionId, meeting: e.regionId === '02', room: 'A', pose: ['弧形沙发段', '室外长椅'].includes(e.category) ? 'lounge' : 'sit' }))
  const gate = r1ToWorld(28, 0), roomAt = (x, z) => layout.regions.find(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
  const trip = (from, to) => {
    if (!prepared) return []
    const owner = [...stations].find(([, s]) => distance(s.home, from) < .001)?.[0]
    const start = owner ? parameters.get(owner).exit : from
    return plan(start, to, owner) || []
  }
  const nav = { attach, prepare, preparationInfo: () => structuredClone(preparation), prepared: () => prepared, query, clear, lineClear: clearFast, plan, smoothPath, reachableFrom, refreshChairs, parameters, stations, bodyFor, roomAt, ready: () => !!collision, revision: () => revision,
    standAt: p => ({ x: p.x, z: p.z }), officeExit: p => [p], corridorPath: trip, loungeTrip: trip, meetingTrip: trip, officeTrip: trip, boardTrip: trip, consumerTrip: trip, foyerTrip: trip, plazaTrip: trip, foyerReturnTrip: trip,
    consumerAdvance: (_, p) => [p], consumerDeparture: (_, p) => [p], consumerTargets: {}, consumerQueues: { waiting: [] },
    ENTRANCE: { x0: gate.x - 3.5, x1: gate.x + 3.5, inner: { x: gate.x, z: gate.z - 2 }, gate: [{ x: gate.x, z: gate.z - 2 }, { x: gate.x, z: gate.z + 2 }] },
    CORRIDOR_X: 2, BOARD_DOOR: gate, FOYER_Z: gate.z, AISLE_OFFSET: 0, LOUNGE_AREA: { x: 16, z: 13, width: 10, depth: 9, entryZ: 13 }, LOUNGE_SEATS: seats, COFFEE_SEATS: seats.filter(s => s.zone === '10') }
  cache.set(layout, nav); return nav
}
