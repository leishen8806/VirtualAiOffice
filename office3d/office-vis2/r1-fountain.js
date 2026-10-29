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
  const joined = (name, parts, material) => {
    const geometry = new THREE.BufferGeometry(), expanded = parts.map(g => g.toNonIndexed())
    for (const key of ['position', 'normal', 'uv']) {
      const size = expanded[0].attributes[key].itemSize
      const data = new Float32Array(expanded.reduce((sum, g) => sum + g.attributes[key].array.length, 0))
      let offset = 0
      for (const g of expanded) { data.set(g.attributes[key].array, offset); offset += g.attributes[key].array.length }
      geometry.setAttribute(key, new THREE.BufferAttribute(data, size))
    }
    ;[...parts, ...expanded].forEach(g => g.dispose())
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name; group.add(mesh); meshes.push(mesh)
    return mesh
  }
  const water = joined('r1-fountain-water', [disk(3.6, .34), disk(1.36, 1.67), disk(.66, 2.5)],
    new THREE.MeshPhysicalMaterial({ color: '#2E7C8C', roughness: .05, transparent: true, opacity: .78, clearcoat: 1, clearcoatRoughness: .05, normalMap: textures.normal, normalScale: new THREE.Vector2(.35, .35) }))
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
  const particleCount = 2380, positions = new Float32Array(particleCount * 3), seeds = new Float32Array(particleCount * 3)
  let seed = 11
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < seeds.length; i++) seeds[i] = random()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4.2)
  const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ map: textures.drop, color: '#F2FBFF', size: .07, transparent: true, opacity: .85, depthWrite: false }))
  particles.name = 'r1-fountain-droplets'; group.add(particles)
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.15, .5, 128), new THREE.MeshBasicMaterial({ visible: false }))
  proxy.position.y = .25; proxy.name = 'r1-collision-fountain'; proxy.userData.collisionProxy = true
  group.add(proxy); group.updateWorldMatrix(true, true); collision?.add(proxy, 'r1-fountain')
  let elapsed = 0, lastStamp = null, disposed = false
  const updateDrops = () => {
    for (let i = 0; i < particleCount; i++) {
      const k = i * 3, a = seeds[k], b = seeds[k + 1], d = seeds[k + 2]
      let r, y, angle
      if (i < 1280) {
        const t = (a + elapsed * .65) % 1
        angle = Math.floor(i / 80) * Math.PI / 8
        r = 3.5 - 1.45 * t; y = .4 + Math.sin(Math.PI * t) * 1.15 - .06 * t + (b - .5) * .025
      } else if (i < 1600) {
        const t = (a + elapsed * 1.6) % 1
        angle = Math.floor((i - 1280) / 20) * Math.PI / 8 + (b - .5) * .09
        r = 2.05 + (d - .5) * .25 * t; y = .35 + .25 * Math.sin(Math.PI * t)
      } else if (i < 2020) {
        const t = (a + elapsed * .9) % 1
        angle = b * Math.PI * 2; r = (i < 1780 ? .05 : .32) * t * d
        y = 2.72 + (i < 1780 ? 1.05 : .65) * Math.sin(Math.PI * t)
      } else {
        const t = (a + elapsed * 1.2) % 1
        angle = b * Math.PI * 2; r = 1.62 + (d - .5) * .3; y = .35 + Math.sin(Math.PI * t) * .18
      }
      positions[k] = Math.cos(angle) * r; positions[k + 1] = y; positions[k + 2] = Math.sin(angle) * r
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
    updateDrops()
  }
  updateDrops(); onFrame(0)
  return {
    root: group, water, curtains, foam, particles, proxy, particleCount, onFrame,
    dispose() {
      if (disposed) return
      disposed = true; collision?.remove?.(proxy); solid.dispose()
      for (const mesh of [...meshes, particles, proxy]) { mesh.geometry.dispose(); mesh.material.dispose() }
      Object.values(textures).forEach(texture => texture.dispose()); group.removeFromParent()
    },
  }
}
