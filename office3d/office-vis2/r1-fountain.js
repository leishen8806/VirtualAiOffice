import { createSampleBatch } from './batch.js'

// Textures and droplets are deterministic; no asset downloads or shared random state.
function waterTextures(THREE) {
  const make = (size, pixel) => {
    const data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(pixel(x / size, y / size), (y * size + x) * 4)
    const texture = new THREE.DataTexture(data, size, size)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
  }
  const normal = make(256, (u, v) => {
    let dx = 0, dy = 0
    for (let i = 1; i <= 9; i++) {
      const a = (u * (i + 2) + v * ((i * 7) % 11 + 1)) * Math.PI * 2
      dx += Math.cos(a) * .06; dy += Math.sin(a) * .06
    }
    return [128 + dx * 127, 128 + dy * 127, 250, 255]
  })
  normal.repeat.set(6, 6)
  const streak = make(256, (u, v) => {
    const stripe = Math.pow(Math.max(0, Math.sin(u * Math.PI * 62 + Math.sin(u * 44) * 3)), 8)
    return [221, 243, 250, (35 + 150 * stripe) * (.65 + .35 * Math.cos(v * Math.PI * 2))]
  })
  streak.repeat.set(10, 1)
  const foam = make(128, (u, v) => {
    const r = Math.hypot(u - .5, v - .5) * 2
    const grain = .5 + .5 * Math.sin(u * 417 + Math.sin(v * 239) * 12)
    return [235, 250, 255, Math.max(0, 1 - r) * (90 + grain * 165)]
  })
  const drop = make(32, (u, v) => [242, 251, 255, Math.max(0, 1 - Math.hypot(u - .5, v - .5) * 2) ** 2 * 255])
  return { normal, streak, foam, drop }
}

export function buildR1Fountain({ THREE, root, layout, collision, quality, low = false }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group()
  group.name = 'r1-fountain'; group.userData.dynamic = true
  group.position.set(2, 0, 28); root.add(group)
  const textures = waterTextures(THREE), batch = createSampleBatch(THREE)
  const lathe = (points, segments = 64) => new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), segments)
  const stone = points => batch.add(lathe(points), '#CDC4B4', [0, 0, 0], 0, .85, 0, 'stone')
  stone([[3.62, .05], [3.62, .33], [3.6, .4], [3.62, .46], [3.85, .5], [4.12, .48], [4.15, .42], [4.05, .38], [4.05, 0]])
  batch.add(lathe([[3.6, .05], [3.6, .36]]), '#6E6A62', [0, 0, 0], 0, .35, .05)
  const disk = (radius, y) => new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2).translate(0, y, 0)
  batch.add(disk(3.6, .003), '#2F5560')
  stone([[0, .3], [.8, .3], [.75, .45], [.5, .55], [.32, .7], [.22, 1.1], [.26, 1.3], [.18, 1.4], [0, 1.4]])
  stone([[0, 1.35], [.4, 1.38], [1, 1.48], [1.42, 1.62], [1.5, 1.7], [1.44, 1.73], [1.3, 1.66], [0, 1.6]])
  stone([[0, 1.62], [.16, 1.62], [.12, 1.9], [.16, 2.2], [.1, 2.3], [0, 2.3]])
  stone([[0, 2.25], [.25, 2.28], [.62, 2.38], [.8, 2.5], [.76, 2.54], [.6, 2.48], [0, 2.44]])
  stone([[0, 2.44], [.09, 2.48], [.12, 2.6], [.05, 2.72], [0, 2.75]])
  const solid = batch.build(group, 'r1-fountain-stone')
  solid.mesh.material.userData.officeFineStone = true
  solid.mesh.material.side = THREE.DoubleSide
  const meshes = []
  const mergeParts = (parts, keys = ['position', 'normal', 'uv']) => {
    const geometry = new THREE.BufferGeometry(), expanded = parts.map(g => g.toNonIndexed())
    for (const key of keys) {
      const size = expanded[0].attributes[key].itemSize
      const data = new Float32Array(expanded.reduce((sum, g) => sum + g.attributes[key].array.length, 0))
      let offset = 0
      for (const g of expanded) { data.set(g.attributes[key].array, offset); offset += g.attributes[key].array.length }
      geometry.setAttribute(key, new THREE.BufferAttribute(data, size))
    }
    ;[...parts, ...expanded].forEach(g => g.dispose())
    return geometry
  }
  const joined = (name, parts, material, parent = group, keys) => {
    const mesh = new THREE.Mesh(mergeParts(parts, keys), material)
    mesh.name = name; parent.add(mesh); meshes.push(mesh)
    return mesh
  }
  const water = joined('r1-fountain-water', [disk(3.6, .34), disk(1.36, 1.67), disk(.66, 2.5)],
    // opacity 从 .78 降到 .34：水先画鱼再混在上面，.78 时鱼只占像素的两成，
    // 再鲜艳的橙红也被水色压成灰白（Q-V1 R2 退回）。法线扰动 + clearcoat 高光仍在，水面依旧成立。
    new THREE.MeshPhysicalMaterial({ color: '#2E7C8C', roughness: .05, transparent: true, opacity: .34, clearcoat: 1, clearcoatRoughness: .05, normalMap: textures.normal, normalScale: new THREE.Vector2(.35, .35) }))
  const curtain = (top, bottom, y0, y1) => new THREE.CylinderGeometry(top, bottom, y1 - y0, 72, 1, true).translate(0, (y0 + y1) / 2, 0)
  const curtains = joined('r1-fountain-curtains', [curtain(1.52, 1.62, .36, 1.68), curtain(.82, .9, 1.68, 2.5)],
    new THREE.MeshBasicMaterial({ map: textures.streak, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }))
  const ring = (r, width, y) => {
    const g = new THREE.RingGeometry(r - width, r + width, 96).rotateX(-Math.PI / 2).translate(0, y, 0)
    // Tile the same radial foam texture around the ring rather than stretching one spot over its diameter.
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (i % 97) / 96 * 24, Math.floor(i / 97))
    return g
  }
  const foamParts = [ring(1.62, .22, .352), ring(.9, .14, 1.682)], jets = []
  for (let j = 0; j < 16; j++) {
    const angle = j * Math.PI / 8, c = Math.cos(angle), s = Math.sin(angle)
    const points = Array.from({ length: 21 }, (_, k) => {
      const t = k / 20, r = 3.5 - 1.45 * t
      return new THREE.Vector3(c * r, .4 + Math.sin(Math.PI * t) * 1.15 - .06 * t, s * r)
    })
    jets.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, .012, 6, false))
    foamParts.push(disk(.24, .352).translate(c * 2.05, 0, s * 2.05))
  }
  joined('r1-fountain-jets', jets, new THREE.MeshBasicMaterial({ color: '#EAF8FF', transparent: true, opacity: .28, depthWrite: false }))
  const foam = joined('r1-fountain-foam', foamParts, new THREE.MeshBasicMaterial({ map: textures.foam, transparent: true, opacity: .9, depthWrite: false }))
  // OFFICE-R1-POND：落水点与池壁之间的开阔外环放荷叶与荷花，水面下放慢游的锦鲤。
  // 三个合批挂在 r1-fountain-life 子组里，既不进碰撞，也不改水池本身的可见批次数。
  const life = new THREE.Group(); life.name = 'r1-fountain-life'; group.add(life)
  const WATER_Y = .34, POND_KEYS = ['position', 'normal', 'uv', 'color']
  const FOAM_EDGE = 2.05 + .24 + .05, PAD_EDGE = 3.35
  let pondSeed = 20261029
  const pondRandom = () => { pondSeed = (Math.imul(pondSeed, 1664525) + 1013904223) >>> 0; return pondSeed / 4294967296 }
  // 把颜色烤进顶点色：锦鲤用无光材质，靠 lit 的法线项补出背亮腹暗，省一个光照批次。
  const paint = (geometry, colour, lit = 0) => {
    const position = geometry.attributes.position, normal = geometry.attributes.normal
    const base = new THREE.Color(colour), data = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i++) {
      const shade = 1 - lit + lit * Math.max(0, normal.getY(i))
      data.set([base.r * shade, base.g * shade, base.b * shade], i * 3)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3))
    return geometry
  }
  const onRing = (r, angle) => ({ x: Math.cos(angle) * r, z: Math.sin(angle) * r })
  // 簇心取在相邻两道喷射弧的中线上（喷射弧在 j·π/8）。
  const padClusters = [1.5, 6.5, 9.5, 13.5].map(j => j * Math.PI / 8)
  const padGreens = ['#3F7F3A', '#4F9244', '#336B35']
  const pads = [], padParts = []
  for (const centre of padClusters) {
    const base = 2.62 + pondRandom() * .32
    for (let k = 0; k < 7; k++) {
      const radius = .16 + pondRandom() * .16
      const low = Math.max(2.35, FOAM_EDGE + radius), high = Math.min(3.4, PAD_EDGE - radius)
      const r = Math.min(high, Math.max(low, base + (pondRandom() - .5) * .6))
      const spot = onRing(r, centre + (pondRandom() - .5) * .52)
      const pad = { ...spot, y: WATER_Y + .006 + pondRandom() * .005, radius }
      pads.push(pad)
      // 带缺口、略微内凹的圆盘；缺口朝向随机，贴着水面但留出毫米级高差。
      const leaf = new THREE.CircleGeometry(radius, 24, pondRandom() * Math.PI * 2, Math.PI * 2 - .5)
      const p = leaf.attributes.position
      for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getY(i)) / radius; p.setZ(i, d * d * .03) }
      leaf.rotateX(-Math.PI / 2); leaf.computeVertexNormals()
      leaf.translate(pad.x, pad.y, pad.z)
      padParts.push(paint(leaf, padGreens[Math.floor(pondRandom() * padGreens.length)]))
    }
  }
  const padMesh = joined('r1-fountain-lotus-pads', padParts,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), life, POND_KEYS)
  padMesh.receiveShadow = true
  const petalTemplate = new THREE.SphereGeometry(1, 8, 5)
  const flowers = [], buds = [], bloomParts = []
  for (let i = 0; i < padClusters.length; i++) {
    for (let k = 0; k < 2; k++) {
      const spot = onRing(2.6 + pondRandom() * .38, padClusters[i] + (pondRandom() - .5) * .34)
      const bloom = { ...spot, height: .1 + pondRandom() * .13, radius: .16, crown: .16 }
      flowers.push(bloom)
      for (const [count, tilt, colour, size] of [[8, .72, '#F2A4BE', 1], [6, .34, '#FBE3EC', .82]]) {
        for (let n = 0; n < count; n++) {
          const petal = petalTemplate.clone()
          petal.scale(.03 * size, .094 * size, .055 * size); petal.translate(0, .085 * size, 0)
          petal.rotateX(tilt); petal.rotateY(n / count * Math.PI * 2 + (size < 1 ? .35 : 0))
          petal.translate(bloom.x, WATER_Y + bloom.height, bloom.z)
          bloomParts.push(paint(petal, colour))
        }
      }
      bloomParts.push(paint(new THREE.CylinderGeometry(.032, .026, .026, 10).translate(bloom.x, WATER_Y + bloom.height + .062, bloom.z), '#E8C24A'))
      bloomParts.push(paint(new THREE.CylinderGeometry(.009, .013, bloom.height, 6).translate(bloom.x, WATER_Y + bloom.height / 2, bloom.z), '#3C7A41'))
    }
  }
  for (const centre of [padClusters[0], padClusters[2]]) {
    const spot = onRing(2.62 + pondRandom() * .3, centre + (pondRandom() - .5) * .3)
    const bud = { ...spot, height: .09 + pondRandom() * .07, radius: .07, crown: .11 }
    buds.push(bud)
    bloomParts.push(paint(new THREE.SphereGeometry(1, 8, 6).scale(.042, .078, .042).translate(bud.x, WATER_Y + bud.height + .05, bud.z), '#EFA3BD'))
    bloomParts.push(paint(new THREE.CylinderGeometry(.009, .013, bud.height, 6).translate(bud.x, WATER_Y + bud.height / 2, bud.z), '#3C7A41'))
  }
  petalTemplate.dispose()
  const flowerMesh = joined('r1-fountain-lotus-blooms', bloomParts,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: THREE.DoubleSide }), life, POND_KEYS)
  // 锦鲤：一套几何按体长归一到 1 m，实例矩阵带朝向与缩放，实例色给出五种花色。
  const koiBody = new THREE.SphereGeometry(1, 10, 6); koiBody.scale(.34, .085, .115); koiBody.translate(.08, 0, 0)
  const koiCrest = new THREE.SphereGeometry(1, 6, 4); koiCrest.scale(.13, .085, .085); koiCrest.translate(.1, .014, 0)
  const koiFleck = new THREE.SphereGeometry(1, 6, 4); koiFleck.scale(.07, .07, .07); koiFleck.translate(-.1, .012, 0)
  const koiTail = new THREE.ConeGeometry(.11, .2, 3); koiTail.rotateZ(-Math.PI / 2); koiTail.scale(1, 1, .32); koiTail.translate(-.3, 0, 0)
  // 花色烤得更艳、lit 从 .26 收到 .12：侧面不再整体压暗四分之一，近景平视也看得出橙红。
  const koiGeometry = mergeParts([paint(koiBody, '#FFFFFF', .12), paint(koiCrest, '#FF3B1E', .12), paint(koiFleck, '#FF5A2A', .12), paint(koiTail, '#FFE2CF', .12)], POND_KEYS)
  koiGeometry.computeBoundingBox()
  const span = koiGeometry.boundingBox.max.x - koiGeometry.boundingBox.min.x
  koiGeometry.translate(-(koiGeometry.boundingBox.max.x + koiGeometry.boundingBox.min.x) / 2, 0, 0)
  koiGeometry.scale(1 / span, 1 / span, 1 / span)
  const koi = []
  for (let i = 0; i < 9; i++) koi.push({
    radius: 2.32 + pondRandom() * .56, amplitude: .08 + pondRandom() * .07,
    harmonic: 2 + Math.floor(pondRandom() * 2), speed: .13 + pondRandom() * .12,
    direction: pondRandom() > .5 ? 1 : -1, phase: pondRandom() * Math.PI * 2,
    depth: .238 + pondRandom() * .03, length: .29 + pondRandom() * .12,
    beat: 2.4 + pondRandom() * 1.2, bob: .5 + pondRandom() * .4,
  })
  // toneMapped: false —— ACES 色调映射会把高饱和的橙红压成灰褐，锦鲤这一批不参与。
  const koiMesh = new THREE.InstancedMesh(koiGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), koi.length)
  koiMesh.name = 'r1-fountain-koi'; koiMesh.frustumCulled = false
  // 红白（白身红斑）、橙红、金黄、橙、朱红；原来的米白 / 奶油色去掉，九条里有四条都读成灰白。
  const koiColours = ['#FFFFFF', '#FF5A1E', '#FFC02A', '#FF8030', '#FF4A2A'], tint = new THREE.Color()
  koi.forEach((_, i) => koiMesh.setColorAt(i, tint.set(koiColours[i % koiColours.length])))
  life.add(koiMesh); meshes.push(koiMesh)
  const koiMatrix = new THREE.Matrix4(), koiSpin = new THREE.Quaternion(), koiUp = new THREE.Vector3(0, 1, 0)
  const koiScale = new THREE.Vector3(), koiHere = new THREE.Vector3(), koiAhead = new THREE.Vector3()
  // r(θ) = R + A·sin(kθ)，k 取整数，整条路径闭合；朝向取路径切线。
  const koiPoint = (fish, time, out) => {
    const theta = fish.phase + fish.direction * fish.speed / fish.radius * time
    const r = fish.radius + fish.amplitude * Math.sin(fish.harmonic * theta)
    return out.set(Math.cos(theta) * r, 0, Math.sin(theta) * r)
  }
  const particleCount = 2380, positions = new Float32Array(particleCount * 3), trajectories = new Float32Array(particleCount * 9)
  let seed = 11
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  // phase, speed, cos, sin, radius, radial slope, height, arc height, vertical slope.
  for (let i = 0; i < particleCount; i++) {
    const a = random(), b = random(), d = random()
    let angle, speed, r, dr, y, arc, dy = 0
    if (i < 1280) {
      angle = Math.floor(i / 80) * Math.PI / 8; speed = .65; r = 3.5; dr = -1.45
      y = .4 + (b - .5) * .025; arc = 1.15; dy = -.06
    } else if (i < 1600) {
      angle = Math.floor((i - 1280) / 20) * Math.PI / 8 + (b - .5) * .09; speed = 1.6
      r = 2.05; dr = (d - .5) * .25; y = .35; arc = .25
    } else if (i < 2020) {
      angle = b * Math.PI * 2; speed = .9; r = 0; dr = (i < 1780 ? .05 : .32) * d
      y = 2.72; arc = i < 1780 ? 1.05 : .65
    } else {
      angle = b * Math.PI * 2; speed = 1.2; r = 1.62 + (d - .5) * .3; dr = 0; y = .35; arc = .18
    }
    trajectories.set([a, speed, Math.cos(angle), Math.sin(angle), r, dr, y, arc, dy], i * 9)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4.2)
  const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ map: textures.drop, color: '#F2FBFF', size: .07, transparent: true, opacity: .85, depthWrite: false }))
  particles.name = 'r1-fountain-droplets'; group.add(particles)
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.15, .5, 128), new THREE.MeshBasicMaterial({ visible: false }))
  proxy.position.y = .25; proxy.name = 'r1-collision-fountain'; proxy.userData.collisionProxy = true
  group.add(proxy); group.updateWorldMatrix(true, true); collision?.add(proxy, 'r1-fountain')
  let elapsed = 0, lastStamp = null, disposed = false
  const updateKoi = () => {
    for (let i = 0; i < koi.length; i++) {
      const fish = koi[i]
      koiPoint(fish, elapsed, koiHere); koiPoint(fish, elapsed + .05, koiAhead)
      const heading = Math.atan2(-(koiAhead.z - koiHere.z), koiAhead.x - koiHere.x)
      koiHere.y = fish.depth + Math.sin(elapsed * fish.bob + fish.phase) * .006
      koiSpin.setFromAxisAngle(koiUp, heading + Math.sin(elapsed * fish.beat + fish.phase) * .13)
      koiMesh.setMatrixAt(i, koiMatrix.compose(koiHere, koiSpin, koiScale.setScalar(fish.length)))
    }
    koiMesh.instanceMatrix.needsUpdate = true
  }
  const updateDrops = () => {
    for (let i = 0; i < particleCount; i++) {
      const k = i * 3, j = i * 9, t = (trajectories[j] + elapsed * trajectories[j + 1]) % 1
      const r = trajectories[j + 4] + trajectories[j + 5] * t
      positions[k] = trajectories[j + 2] * r
      positions[k + 1] = trajectories[j + 6] + trajectories[j + 7] * Math.sin(Math.PI * t) + trajectories[j + 8] * t
      positions[k + 2] = trajectories[j + 3] * r
    }
    geometry.attributes.position.needsUpdate = true
  }
  const onFrame = (dt = 0) => {
    if (disposed) return
    // The existing registry supplies zero dt without shared.now; keep this clock local to the fountain.
    const stamp = performance.now(), delta = dt > 0 ? dt : lastStamp === null ? 0 : (stamp - lastStamp) / 1000
    lastStamp = stamp
    const animated = quality ? quality.tier !== 'low' : !low
    particles.visible = foam.visible = animated
    if (!animated) return
    elapsed += Math.max(0, Math.min(delta, .1))
    textures.streak.offset.y = elapsed * .7 % 1
    textures.normal.offset.set(elapsed * .008 % 1, elapsed * .005 % 1)
    updateDrops(); updateKoi()
  }
  updateDrops(); updateKoi(); onFrame(0)
  return {
    root: group, water, curtains, foam, particles, proxy, particleCount, onFrame,
    // 低档选择：锦鲤静止（保持可见，不再更新实例矩阵），与泡沫、水滴一起停在 onFrame 的同一个分支上。
    pond: { group: life, padMesh, flowerMesh, koiMesh, pads, flowers, buds, koi, padClusters },
    dispose() {
      if (disposed) return
      disposed = true; collision?.remove?.(proxy); solid.dispose()
      for (const mesh of [...meshes, particles, proxy]) { mesh.geometry.dispose(); mesh.material.dispose() }
      Object.values(textures).forEach(texture => texture.dispose()); group.removeFromParent()
    },
  }
}
