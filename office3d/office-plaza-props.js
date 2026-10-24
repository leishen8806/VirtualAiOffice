import { OFFICE_THEME_V2 as THEME } from './office-theme-v2.js'

export const PLAZA_PROP_CATALOG = Object.freeze({
  vendors: Object.freeze([
    Object.freeze({ id: 'awning-cart', kind: 'awning-cart', x: -8, z: -3, yaw: .12 }),
    Object.freeze({ id: 'square-kiosk', kind: 'square-kiosk', x: 0, z: -4, yaw: 0 }),
    Object.freeze({ id: 'flower-stall', kind: 'flower-stall', x: 8, z: -3, yaw: -.12 }),
  ]),
  cafe: Object.freeze([
    Object.freeze({ id: 'cafe-west', x: -7, z: 5, yaw: 0 }),
    Object.freeze({ id: 'cafe-east', x: 7, z: 5, yaw: 0 }),
  ]),
  lamps: Object.freeze([
    Object.freeze({ id: 'lamp-nw', x: -12, z: -7, yaw: 0 }),
    Object.freeze({ id: 'lamp-ne', x: 12, z: -7, yaw: 0 }),
    Object.freeze({ id: 'lamp-sw', x: -12, z: 7, yaw: 0 }),
    Object.freeze({ id: 'lamp-se', x: 12, z: 7, yaw: 0 }),
  ]),
  benches: Object.freeze([
    Object.freeze({ id: 'bench-west', x: -11, z: 1, yaw: Math.PI / 2 }),
    Object.freeze({ id: 'bench-east', x: 11, z: 1, yaw: -Math.PI / 2 }),
    Object.freeze({ id: 'bench-south-west', x: -4, z: 8, yaw: Math.PI }),
    Object.freeze({ id: 'bench-south-east', x: 4, z: 8, yaw: Math.PI }),
  ]),
  flowers: Object.freeze([
    Object.freeze({ id: 'flowers-west', x: -12, z: 4, yaw: Math.PI / 2 }),
    Object.freeze({ id: 'flowers-east', x: 12, z: 4, yaw: Math.PI / 2 }),
    Object.freeze({ id: 'flowers-south', x: 0, z: 9, yaw: 0 }),
  ]),
  trees: Object.freeze([
    Object.freeze({ id: 'broadleaf-round', kind: 'broadleaf-round', x: -14, z: -1, yaw: 0 }),
    Object.freeze({ id: 'broadleaf-layered', kind: 'broadleaf-layered', x: 14, z: -1, yaw: 0 }),
    Object.freeze({ id: 'palm-fan', kind: 'palm-fan', x: -14, z: 8, yaw: .2 }),
    Object.freeze({ id: 'palm-crown', kind: 'palm-crown', x: 14, z: 8, yaw: -.2 }),
  ]),
})

const CATEGORY_ORDER = Object.freeze(['vendors', 'cafe', 'lamps', 'benches', 'flowers', 'trees'])
const validPlacement = item => item && typeof item.id === 'string' && item.id.trim().length > 0 &&
  Number.isFinite(item.x) && Number.isFinite(item.z) && Number.isFinite(item.yaw)

export function plazaPlacements(value = PLAZA_PROP_CATALOG) {
  const output = {}
  for (const category of CATEGORY_ORDER) {
    const rows = Array.isArray(value?.[category]) ? value[category] : []
    output[category] = rows.filter(validPlacement).map(item => Object.freeze({ ...item }))
  }
  return Object.freeze(output)
}

function buildSelection({ THREE, root, canvasTex, low = false, placements = PLAZA_PROP_CATALOG, categories = CATEGORY_ORDER }) {
  const plan = plazaPlacements(placements)
  const group = new THREE.Group()
  group.name = 'office3-plaza-props'
  const geometries = new Map(), batches = new Map(), ownedMaterials = [], ownedTextures = []
  const lowInstances = { solid: [], leaf: [] }
  const counts = Object.fromEntries(CATEGORY_ORDER.map(key => [key, 0]))
  const color = value => new THREE.Color(value)
  const palette = {
    white: color(THEME.nameplate),
    stone: color(THEME.exteriorWall).lerp(color(THEME.interiorWall), .42),
    wood: color(THEME.trim).lerp(color(THEME.nameplate), .2),
    dark: color(THEME.nameplateText),
    gold: color(THEME.trim),
    green: color(THEME.glass).offsetHSL(.06, .36, -.25),
    green2: color(THEME.glass).offsetHSL(.12, .28, -.13),
    pink: color(THEME.floor).offsetHSL(.88, .25, -.04),
    purple: color(THEME.glass).offsetHSL(.72, .42, -.08),
    yellow: color(THEME.floor).offsetHSL(.04, .2, -.08),
  }
  let awningTexture = null
  if (!low && typeof canvasTex === 'function') {
    awningTexture = canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = THEME.nameplate
      ctx.fillRect(0, 0, w, h)
      const stripe = w / 8
      ctx.fillStyle = THEME.trim
      for (let i = 0; i < 8; i += 2) ctx.fillRect(i * stripe, 0, stripe, h)
      ctx.strokeStyle = THEME.nameplateText
      ctx.lineWidth = Math.max(2, w / 96)
      ctx.strokeRect(1, 1, w - 2, h - 2)
    })
    if (awningTexture) ownedTextures.push(awningTexture)
  }
  const material = (key, options) => {
    const value = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, ...options })
    ownedMaterials.push(value)
    batches.set(key, { material: value, parts: [] })
  }
  material('solid', {})
  if (low) {
    material('leaf', { flatShading: true })
  } else {
    material('metal', { roughness: .48, metalness: .45 })
    material('leaf', { flatShading: true })
    material('flower', { flatShading: true, roughness: .72 })
    material('accent', { map: awningTexture || null, roughness: .7 })
  }
  const batchKey = key => low ? (key === 'leaf' || key === 'flower' ? 'leaf' : 'solid') : key
  const base = (key, create) => {
    if (!geometries.has(key)) geometries.set(key, create())
    return geometries.get(key)
  }
  const box = (w, h, d) => base(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d))
  const cylinder = (rt, rb, h, n) => base(`cyl:${rt}:${rb}:${h}:${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n))
  const sphere = (r, ws, hs) => base(`sphere:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs))
  const cone = (r, h, n) => base(`cone:${r}:${h}:${n}`, () => new THREE.ConeGeometry(r, h, n))
  const dummy = new THREE.Object3D()
  function add(geometry, batch, tint, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    dummy.position.set(x, y, z)
    dummy.rotation.set(rx, ry, rz)
    dummy.scale.set(sx, sy, sz)
    dummy.updateMatrix()
    if (low) {
      geometry.computeBoundingBox()
      const center = geometry.boundingBox.getCenter(new THREE.Vector3())
      const size = geometry.boundingBox.getSize(new THREE.Vector3())
      const local = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
        .multiply(new THREE.Matrix4().makeScale(size.x, size.y, size.z))
      lowInstances[batchKey(batch)].push({ matrix: dummy.matrix.clone().multiply(local), color: tint.clone() })
      return
    }
    const value = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    value.applyMatrix4(dummy.matrix)
    const positions = value.attributes.position, colors = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) colors.set([tint.r, tint.g, tint.b], i * 3)
    value.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    if (!value.attributes.uv) {
      const uv = new Float32Array(positions.count * 2)
      for (let i = 0; i < positions.count; i++) {
        uv[i * 2] = positions.getX(i)
        uv[i * 2 + 1] = positions.getZ(i)
      }
      value.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    }
    batches.get(batchKey(batch)).parts.push(value)
  }
  const at = (placement, lx, lz) => ({
    x: placement.x + Math.cos(placement.yaw) * lx + Math.sin(placement.yaw) * lz,
    z: placement.z - Math.sin(placement.yaw) * lx + Math.cos(placement.yaw) * lz,
  })
  const put = (placement, geometry, batch, tint, lx, y, lz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const p = at(placement, lx, lz)
    add(geometry, batch, tint, p.x, y, p.z, sx, sy, sz, rx, ry + placement.yaw, rz)
  }
  const wheel = (p, x, z) => put(p, cylinder(.24, .24, .12, low ? 8 : 14), 'metal', palette.dark, x, .27, z, 1, 1, 1, Math.PI / 2, 0, 0)
  function vendor(p) {
    counts.vendors++
    if (p.kind === 'awning-cart') {
      put(p, box(3.2, 1.15, 1.55), 'solid', palette.white, 0, .9, 0)
      put(p, box(3.35, .16, 1.7), 'accent', palette.white, 0, 1.56, 0)
      put(p, box(1.7, .08, 3.6), 'accent', palette.white, 0, 2.45, 0, 1, 1, 1, 0, 0, Math.PI / 18)
      for (const x of [-1.3, 1.3]) for (const z of [-.68, .68]) wheel(p, x, z)
      for (const x of [-1.45, 1.45]) put(p, cylinder(.035, .045, 1.8, 8), 'metal', palette.dark, x, 1.75, 0)
    } else if (p.kind === 'square-kiosk') {
      put(p, box(3, 2.25, 2.4), 'solid', palette.stone, 0, 1.15, 0)
      put(p, box(3.3, .22, 2.7), 'accent', palette.gold, 0, 2.38, 0)
      put(p, box(2.1, 1.05, .08), 'metal', palette.dark, 0, 1.3, -1.23)
      put(p, box(2.35, .16, .5), 'solid', palette.wood, 0, .98, -1.48)
    } else {
      put(p, box(3.1, 1.15, 1.7), 'solid', palette.white, 0, .72, 0)
      put(p, box(3.35, .18, 1.95), 'accent', palette.gold, 0, 1.4, 0)
      for (const x of [-1.4, 1.4]) put(p, cylinder(.04, .05, 1.55, 8), 'metal', palette.dark, x, 2, 0)
      put(p, box(3.6, .16, 2.2), 'accent', palette.white, 0, 2.78, 0)
      for (let i = 0; i < (low ? 5 : 11); i++) {
        const x = -1.25 + (i % 6) * .5, z = -.48 + Math.floor(i / 6) * .85
        put(p, sphere(.18, low ? 6 : 9, low ? 4 : 6), 'flower', [palette.pink, palette.purple, palette.yellow][i % 3], x, 1.52, z)
      }
    }
  }
  function cafe(p) {
    counts.cafe++
    put(p, cylinder(.76, .76, .09, low ? 10 : 20), 'solid', palette.wood, 0, .78, 0)
    put(p, cylinder(.06, .08, .75, 8), 'metal', palette.dark, 0, .38, 0)
    put(p, cylinder(.055, .07, 2.5, 8), 'metal', palette.dark, 0, 2, 0)
    put(p, cone(1.85, .52, low ? 10 : 24), 'accent', palette.white, 0, 3.15, 0)
    const seats = low ? 3 : 4
    for (let i = 0; i < seats; i++) {
      const a = i * Math.PI * 2 / seats, x = Math.cos(a) * 1.35, z = Math.sin(a) * 1.35
      put(p, cylinder(.28, .28, .12, low ? 8 : 12), 'solid', palette.stone, x, .52, z)
      put(p, cylinder(.04, .05, .45, 7), 'metal', palette.dark, x, .25, z)
    }
  }
  function lamp(p) {
    counts.lamps++
    put(p, cylinder(.07, .1, 3.7, 8), 'metal', palette.dark, 0, 1.85, 0)
    put(p, cylinder(.28, .34, .16, low ? 8 : 16), 'metal', palette.gold, 0, 3.77, 0)
    put(p, sphere(.24, low ? 7 : 12, low ? 5 : 8), 'solid', palette.yellow, 0, 3.61, 0)
  }
  function bench(p) {
    counts.benches++
    for (const z of [-.28, .28]) put(p, box(2.8, .12, .34), 'solid', palette.wood, 0, .58, z)
    put(p, box(2.8, .75, .12), 'solid', palette.wood, 0, .98, .48, 1, 1, 1, -.14, 0, 0)
    for (const x of [-1.12, 1.12]) for (const z of [-.34, .34]) put(p, box(.1, .5, .1), 'metal', palette.dark, x, .3, z)
  }
  function flowers(p) {
    counts.flowers++
    put(p, box(4.2, .42, 1.15), 'solid', palette.stone, 0, .21, 0)
    const total = low ? 7 : 18
    for (let i = 0; i < total; i++) {
      const x = -1.8 + (i % 9) * .45, z = -.3 + Math.floor(i / 9) * .58
      put(p, sphere(.2 + (i % 3) * .035, low ? 6 : 9, low ? 4 : 6), 'flower',
        [palette.pink, palette.purple, palette.yellow][i % 3], x, .55 + (i % 2) * .08, z)
    }
  }
  function tree(p) {
    counts.trees++
    const palm = p.kind.startsWith('palm')
    put(p, cylinder(palm ? .16 : .2, palm ? .28 : .34, palm ? 3.9 : 3.15, low ? 7 : 10), 'solid', palette.wood, 0, palm ? 1.95 : 1.575, 0)
    if (!palm) {
      const crowns = p.kind === 'broadleaf-layered' ? 4 : 3
      for (let i = 0; i < crowns; i++) {
        const a = i * Math.PI * 2 / crowns, r = i ? .65 : 0
        put(p, sphere(p.kind === 'broadleaf-layered' ? 1.05 : 1.25, low ? 7 : 12, low ? 5 : 8),
          'leaf', i % 2 ? palette.green2 : palette.green, Math.cos(a) * r, 3.25 + (i % 2) * .55, Math.sin(a) * r)
      }
    } else {
      const leaves = low ? 6 : (p.kind === 'palm-fan' ? 12 : 16)
      for (let i = 0; i < leaves; i++) {
        const a = i * Math.PI * 2 / leaves
        put(p, sphere(.55, low ? 6 : 9, low ? 4 : 6), 'leaf', i % 2 ? palette.green2 : palette.green,
          Math.cos(a) * 1.05, 4 + Math.sin(i * 1.7) * .18, Math.sin(a) * 1.05, 1.5, .28, .55, 0, -a, -.28)
      }
    }
  }
  const builders = { vendors: vendor, cafe, lamps: lamp, benches: bench, flowers, trees: tree }
  for (const category of categories) for (const placement of plan[category] || []) builders[category](placement)

  if (low) {
    for (const [key, rows] of Object.entries(lowInstances)) {
      if (!rows.length) continue
      const geometry = key === 'leaf' ? new THREE.IcosahedronGeometry(.5, 0) : new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.InstancedMesh(geometry, batches.get(key).material, rows.length)
      mesh.name = `office3-plaza-props-${key}`
      rows.forEach((row, index) => {
        mesh.setMatrixAt(index, row.matrix)
        mesh.setColorAt(index, row.color)
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = false
      mesh.receiveShadow = true
      group.add(mesh)
    }
  } else {
    for (const [key, batch] of batches) {
      if (!batch.parts.length) continue
      const merged = new THREE.BufferGeometry()
      for (const [attribute, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
        const length = batch.parts.reduce((sum, geometry) => sum + geometry.attributes[attribute].array.length, 0)
        const array = new Float32Array(length)
        let offset = 0
        for (const geometry of batch.parts) {
          array.set(geometry.attributes[attribute].array, offset)
          offset += geometry.attributes[attribute].array.length
        }
        merged.setAttribute(attribute, new THREE.BufferAttribute(array, size))
      }
      batch.parts.forEach(geometry => geometry.dispose())
      const mesh = new THREE.Mesh(merged, batch.material)
      mesh.name = `office3-plaza-props-${key}`
      mesh.castShadow = false
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }
  geometries.forEach(geometry => geometry.dispose())
  root.add(group)
  let disposed = false
  return {
    root: group,
    counts: Object.freeze({ ...counts }),
    summary: () => ({
      calls: group.children.filter(item => item.isMesh && item.visible).length,
      triangles: group.children.filter(item => item.isMesh && item.visible)
        .reduce((sum, item) => sum + (item.geometry.index?.count || item.geometry.attributes.position.count) / 3 *
          (item.isInstancedMesh ? item.count : 1), 0),
      instances: Object.values(counts).reduce((sum, value) => sum + value, 0),
      counts: { ...counts },
      low,
    }),
    dispose() {
      if (disposed) return
      disposed = true
      group.traverse(item => { if (item.isMesh) item.geometry.dispose() })
      ownedMaterials.forEach(value => value.dispose())
      ownedTextures.forEach(value => value.dispose?.())
      group.removeFromParent()
    },
  }
}

export const buildPlazaVendors = options => buildSelection({ ...options, categories: ['vendors'] })
export const buildPlazaCafeSets = options => buildSelection({ ...options, categories: ['cafe'] })
export const buildPlazaLamps = options => buildSelection({ ...options, categories: ['lamps'] })
export const buildPlazaBenches = options => buildSelection({ ...options, categories: ['benches'] })
export const buildPlazaFlowers = options => buildSelection({ ...options, categories: ['flowers'] })
export const buildPlazaTrees = options => buildSelection({ ...options, categories: ['trees'] })
export const buildOfficePlazaProps = options => buildSelection(options)
