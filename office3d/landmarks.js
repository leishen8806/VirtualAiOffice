import * as THREE from 'three'

// 高棉地标（程序生成的写意造型，比例做了压缩，不是测绘级复刻）：
//   正后方：吴哥窟（护城河、外墙、西门楼、参道与那伽栏杆、藏经阁、倒影池、三层回廊、五座莲花塔）
//   左侧：独立纪念碑（金边）    右侧：王宫登基殿（金边）    左前：塔仔山
export function buildLandmarks(scene, { rnd, leafMs, renderer }) {
  // ── 材质 ──
  const canvasTex = (w, h, draw, rep) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    if (rep) t.repeat.set(rep[0], rep[1])
    t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return t
  }
  // 砂岩：石块横缝 + 风化斑点
  const stoneTex = (base, line) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 3500; i++) { const v = rnd(); g.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2) }
    g.strokeStyle = line
    g.lineWidth = 1.5
    for (let y = 0; y < h; y += 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
      const off = (y / 16) % 2 ? 0 : 20
      for (let x = off; x < w; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke() }
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,70,50,${0.05 + rnd() * 0.1})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 4 + rnd() * 14, 0, Math.PI * 2); g.fill() } // 青苔
  }, [2, 2])
  const sand = new THREE.MeshStandardMaterial({ map: stoneTex('#a79a80', 'rgba(70,60,45,.35)'), roughness: 0.92 })
  const sandDark = new THREE.MeshStandardMaterial({ map: stoneTex('#8c7f66', 'rgba(50,42,30,.4)'), roughness: 0.95 })
  const laterite = new THREE.MeshStandardMaterial({ map: stoneTex('#9a6a52', 'rgba(60,35,25,.35)'), roughness: 0.95 })
  const redSand = new THREE.MeshStandardMaterial({ map: stoneTex('#b07a5c', 'rgba(80,45,30,.35)'), roughness: 0.9 })
  const white = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.7 })
  const yellowWall = new THREE.MeshStandardMaterial({ color: 0xe9cf7a, roughness: 0.75 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd7a83e, roughness: 0.35, metalness: 0.75 })
  const roofY = new THREE.MeshStandardMaterial({ color: 0xd99a2b, roughness: 0.55, flatShading: true })
  const roofG = new THREE.MeshStandardMaterial({ color: 0x2f6f4f, roughness: 0.6, flatShading: true })
  const roofB = new THREE.MeshStandardMaterial({ color: 0x3b5d8f, roughness: 0.6, flatShading: true })
  const water = new THREE.MeshStandardMaterial({ color: 0x4d7d8c, roughness: 0.08, metalness: 0.3 })
  const lawn = new THREE.MeshStandardMaterial({ color: 0x6c8d4b, roughness: 1 })

  const box = (parent, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.receiveShadow = true; parent.add(m); return m }
  const mesh = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m }
  // 坡屋顶：三角形截面沿长度拉伸
  const gable = (parent, len, span, height, mat, x, y, z, rotY = 0) => {
    const s = new THREE.Shape()
    s.moveTo(-span / 2, 0); s.lineTo(span / 2, 0); s.lineTo(0, height); s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false })
    g.translate(0, 0, -len / 2)
    const m = mesh(parent, g, mat, x, y, z)
    m.rotation.y = rotY
    return m
  }

  // 莲花塔：十字形塔座 + 九层收分的莲花苞塔身，每层一圈装饰小尖（批量实例化）
  const antefix = { pos: [], scl: [] }
  const lotusTower = (parent, x, y, z, h, r, mat) => {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    box(g, r * 2.2, h * 0.16, r * 2.2, mat, 0, 0, 0)
    for (const [dx, dz, w, d] of [[r * 1.4, 0, r * 0.9, r * 1.2], [-r * 1.4, 0, r * 0.9, r * 1.2], [0, r * 1.4, r * 1.2, r * 0.9], [0, -r * 1.4, r * 1.2, r * 0.9]]) {
      box(g, w, h * 0.13, d, mat, dx, 0, dz) // 四面门廊
      gable(g, Math.max(w, d), Math.min(w, d) * 1.1, h * 0.06, mat, dx, h * 0.13, dz, dx ? Math.PI / 2 : 0)
    }
    const pts = [[1, 0], [1, 0.05]]
    const tiers = 9
    for (let i = 0; i < tiers; i++) {
      const y0 = 0.05 + i * 0.085, rr = 1 - i * 0.085
      pts.push([rr * 0.9, y0 + 0.02], [rr * 0.97, y0 + 0.05], [rr * 0.82, y0 + 0.085])
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8
        antefix.pos.push(new THREE.Vector3(x + Math.cos(a) * rr * r * 0.98, y + h * 0.16 + (y0 + 0.06) * h * 0.84, z + Math.sin(a) * rr * r * 0.98))
        antefix.scl.push(r * 0.1 * (1 - i * 0.06))
      }
    }
    pts.push([0.16, 0.86], [0.12, 0.93], [0.03, 1])
    const lathe = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a * r, b * h * 0.84)), 16)
    const t = mesh(g, lathe, mat, 0, h * 0.16, 0)
    t.castShadow = false
    parent.add(g)
    return g
  }
  // 柱廊：一圈方柱（实例化）+ 叠涩屋顶
  const pillars = []
  const gallery = (parent, ox, oy, oz, w, d, h, mat, roofMat) => {
    for (const [len, span, x, z, rot] of [[w, 4, 0, -d / 2, 0], [w, 4, 0, d / 2, 0], [d, 4, -w / 2, 0, Math.PI / 2], [d, 4, w / 2, 0, Math.PI / 2]]) {
      box(parent, rot ? 4 : len, h * 0.25, rot ? len : 4, mat, ox + x, oy + h, oz + z) // 檐口
      gable(parent, len + 4, 5.2, h * 0.45, roofMat, ox + x, oy + h * 1.25, oz + z, rot)
      const n = Math.max(2, Math.round(len / 3.2))
      for (let i = 0; i <= n; i++) {
        const tpos = -len / 2 + (len * i) / n
        for (const side of [-1.4, 1.4]) pillars.push(rot ? new THREE.Vector3(ox + x + side, oy, oz + tpos) : new THREE.Vector3(ox + tpos, oy, oz + z + side))
      }
    }
  }
  const stairs = (parent, x, y, z, w, h, depth, dir) => {
    const n = 14
    for (let i = 0; i < n; i++) {
      const d = depth * (1 - i / n)
      const dx = dir === 'x' ? d / 2 : 0, dz = dir === 'z' ? d / 2 : 0
      box(parent, dir === 'x' ? d : w, h / n, dir === 'z' ? d : w, sandDark, x + dx * Math.sign(x || 1), y + (h * i) / n, z + dz * Math.sign(z || 1))
    }
  }

  // ════════ 1) 吴哥窟 ════════
  {
    const g = new THREE.Group()
    g.position.set(0, -0.6, -340)
    scene.add(g)
    box(g, 330, 0.3, 290, water, 0, -0.1, 0) // 护城河
    box(g, 270, 1.2, 230, lawn, 0, 0, 0) // 内岛
    // 外墙（红土石）+ 四角
    for (const [w, d, x, z] of [[262, 2, 0, -113], [262, 2, 0, 113], [2, 226, -130, 0], [2, 226, 130, 0]]) box(g, w, 4.5, d, laterite, x, 1.2, z)
    // 西门楼（面向镜头）：长廊 + 三座塔
    box(g, 120, 6, 8, sand, 0, 1.2, 113)
    gable(g, 124, 9, 4, sandDark, 0, 7.2, 113)
    lotusTower(g, 0, 7, 113, 20, 3.6, sand)
    lotusTower(g, -22, 7, 113, 14, 2.6, sand)
    lotusTower(g, 22, 7, 113, 14, 2.6, sand)
    // 护城河上的堤道 + 门楼到主殿的参道（两侧那伽栏杆）
    box(g, 12, 1.4, 34, sandDark, 0, 0, 132)
    box(g, 10, 1.6, 64, sandDark, 0, 1.2, 78)
    const railM = new THREE.MeshStandardMaterial({ color: 0x8c7f66, roughness: 0.9 })
    for (const sx of [-5.4, 5.4]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 64, 8), railM)
      rail.rotation.x = Math.PI / 2
      rail.position.set(sx, 3.6, 78)
      g.add(rail)
      for (let i = 0; i < 16; i++) box(g, 0.5, 1.2, 0.5, railM, sx, 2.8, 48 + i * 4)
      const head = mesh(g, new THREE.ConeGeometry(1.6, 3.4, 7, 1, false, 0, Math.PI), railM, sx, 4.6, 110) // 那伽头（扇形）
      head.rotation.set(Math.PI / 2.2, 0, 0)
    }
    // 两座藏经阁 + 两个倒影池
    for (const sx of [-1, 1]) {
      box(g, 14, 5, 9, sand, sx * 28, 1.2, 80)
      gable(g, 15, 10, 4, sandDark, sx * 28, 6.2, 80, Math.PI / 2)
      gable(g, 10, 15, 4, sandDark, sx * 28, 6.2, 80)
      box(g, 22, 0.25, 16, water, sx * 22, 1.25, 58)
    }
    // 十字平台
    box(g, 26, 2.2, 10, sandDark, 0, 1.2, 52)
    box(g, 10, 2.2, 22, sandDark, 0, 1.2, 52)
    // 第一层回廊（浮雕长廊）
    box(g, 116, 2.4, 96, sand, 0, 1.2, 0)
    gallery(g, 0, 3.6, 0, 112, 92, 5, sand, sandDark)
    for (const [x, z] of [[-56, -46], [56, -46], [-56, 46], [56, 46]]) lotusTower(g, x, 3.6, z, 11, 2.4, sand)
    // 第二层回廊
    box(g, 80, 8, 66, sand, 0, 3.6, 0)
    gallery(g, 0, 11.6, 0, 76, 62, 4.5, sand, sandDark)
    for (const [x, z] of [[-38, -31], [38, -31], [-38, 31], [38, 31]]) lotusTower(g, x, 11.6, z, 14, 2.8, sand)
    stairs(g, 0, 3.6, 33, 8, 8, 6, 'z')
    // 第三层（巴肯）：陡峭台基、四面陡梯、四角塔 + 中央主塔
    box(g, 50, 13, 50, sand, 0, 11.6, 0)
    for (let i = 0; i < 4; i++) box(g, 50 + i * 1.2, 0.6, 50 + i * 1.2, sandDark, 0, 11.6 + i * 3.2, 0) // 台基线脚
    gallery(g, 0, 24.6, 0, 46, 46, 4, sand, sandDark)
    stairs(g, 0, 11.6, 25, 5, 13, 9, 'z')
    stairs(g, 0, 11.6, -25, 5, 13, 9, 'z')
    stairs(g, 25, 11.6, 0, 5, 13, 9, 'x')
    stairs(g, -25, 11.6, 0, 5, 13, 9, 'x')
    for (const [x, z] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) lotusTower(g, x, 24.6, z, 22, 4.2, sand)
    lotusTower(g, 0, 24.6, 0, 34, 6, sand)
    // 实例化：柱子与塔身小尖
    const pg = new THREE.BoxGeometry(0.7, 5, 0.7)
    pg.translate(0, 2.5, 0)
    const pi = new THREE.InstancedMesh(pg, sandDark, pillars.length)
    const mtx = new THREE.Matrix4()
    pillars.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); pi.setMatrixAt(i, mtx) })
    pi.receiveShadow = true
    g.add(pi)
    const ag = new THREE.ConeGeometry(1, 2.2, 5)
    const ai = new THREE.InstancedMesh(ag, sand, antefix.pos.length)
    const q = new THREE.Quaternion(), sc = new THREE.Vector3()
    antefix.pos.forEach((p, i) => { const s = antefix.scl[i]; sc.set(s, s, s); mtx.compose(p, q, sc); ai.setMatrixAt(i, mtx) })
    g.add(ai)
    // 岛上的糖棕与树
    for (let i = 0; i < 30; i++) {
      const x = (rnd() - 0.5) * 240, z = (rnd() - 0.5) * 200
      if (Math.abs(x) < 64 && Math.abs(z) < 56) continue
      if (Math.abs(x) < 12) continue
      mesh(g, new THREE.IcosahedronGeometry(3 + rnd() * 2, 0), leafMs[i % leafMs.length], x, 4 + rnd() * 2, z)
    }
  }

  // ════════ 2) 独立纪念碑（左侧）：环岛草坪 + 三层台基 + 五层那伽莲花塔 ════════
  {
    const g = new THREE.Group()
    g.position.set(-112, -0.6, -118)
    scene.add(g)
    const lawnDisc = mesh(g, new THREE.CylinderGeometry(30, 30, 0.6, 40), lawn, 0, 0.3, 0)
    lawnDisc.receiveShadow = true
    mesh(g, new THREE.TorusGeometry(33, 3, 4, 48), new THREE.MeshStandardMaterial({ color: 0x45484d, roughness: 0.9 }), 0, 0.2, 0).rotation.x = Math.PI / 2 // 环岛路
    let y = 0.6
    for (const [w, h] of [[22, 1], [18, 1], [15, 1.2]]) { box(g, w, h, w, redSand, 0, y, 0); y += h }
    const nagaM = redSand
    for (let i = 0; i < 5; i++) {
      const w = 11 - i * 1.9, h = 4.2 - i * 0.35
      box(g, w, h, w, redSand, 0, y, 0)
      box(g, w + 0.6, 0.5, w + 0.6, laterite, 0, y + h - 0.5, 0)
      // 每层四边各三只、四角各一只那伽（扇形蛇头）
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2
        for (const off of [-0.32, 0, 0.32]) {
          const px = Math.cos(a) * (w / 2 + 0.2) - Math.sin(a) * off * w, pz = Math.sin(a) * (w / 2 + 0.2) + Math.cos(a) * off * w
          const n = mesh(g, new THREE.ConeGeometry(0.9 - i * 0.1, 2.6 - i * 0.2, 6, 1, false, 0, Math.PI), nagaM, px, y + h + 0.9, pz)
          n.rotation.y = -a + Math.PI / 2
        }
        const cx = Math.cos(a + Math.PI / 4) * (w / 2) * Math.SQRT2, cz = Math.sin(a + Math.PI / 4) * (w / 2) * Math.SQRT2
        mesh(g, new THREE.ConeGeometry(0.8 - i * 0.08, 3.4 - i * 0.3, 6), nagaM, cx, y + h + 1.2, cz)
      }
      y += h
    }
    mesh(g, new THREE.ConeGeometry(2, 4, 8), redSand, 0, y + 2, 0)
    mesh(g, new THREE.ConeGeometry(0.7, 6, 8), gold, 0, y + 6, 0)
  }

  // ════════ 3) 王宫登基殿（右侧）：黄色宫墙、白墙殿身、三重叠檐黄瓦绿边、四面佛尖顶 ════════
  {
    const g = new THREE.Group()
    g.position.set(118, -0.6, -125)
    g.rotation.y = -0.2
    scene.add(g)
    // 宫墙 + 门楼尖顶
    for (const [w, d, x, z] of [[96, 1.4, 0, -40], [96, 1.4, 0, 40], [1.4, 80, -48, 0], [1.4, 80, 48, 0]]) box(g, w, 4, d, yellowWall, x, 0, z)
    for (const x of [-20, 20]) { box(g, 7, 7, 3, yellowWall, x, 0, 40); mesh(g, new THREE.ConeGeometry(2.2, 9, 4), gold, x, 11.5, 40).rotation.y = Math.PI / 4 }
    box(g, 90, 0.3, 76, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }), 0, 0, 0) // 庭院铺地
    // 登基殿：十字形平面
    box(g, 44, 1.6, 30, white, 0, 0, 0)
    box(g, 36, 9, 14, white, 0, 1.6, 0)
    box(g, 14, 9, 30, white, 0, 1.6, 0)
    const layered = (y, len1, len2, span, h) => {
      gable(g, len1, span, h, roofY, 0, y, 0)
      gable(g, len2, span, h, roofY, 0, y, 0, Math.PI / 2)
      gable(g, len1 + 0.6, span + 0.6, 0.5, roofG, 0, y - 0.2, 0)
      gable(g, len2 + 0.6, span + 0.6, 0.5, roofG, 0, y - 0.2, 0, Math.PI / 2)
    }
    layered(10.6, 42, 34, 18, 7)
    layered(14.5, 34, 26, 13, 6.5)
    layered(18.2, 26, 19, 9, 6)
    // 屋脊「乔法」（尖角饰）
    for (const [x, z] of [[-21, 0], [21, 0], [0, -17], [0, 17]]) { const c = mesh(g, new THREE.ConeGeometry(0.35, 3.2, 6), gold, x, 15.5, z); c.rotation.z = x ? -Math.sign(x) * 0.6 : 0; c.rotation.x = z ? Math.sign(z) * 0.6 : 0 }
    // 尖顶：方座 + 四面佛龛 + 多层金环 + 尖针
    box(g, 6, 4, 6, white, 0, 23.5, 0)
    for (let i = 0; i < 4; i++) mesh(g, new THREE.CylinderGeometry(0.9, 1.2, 2.6, 8), gold, Math.cos((i * Math.PI) / 2) * 3, 25.5, Math.sin((i * Math.PI) / 2) * 3)
    let y = 27.5
    for (let i = 0; i < 7; i++) { mesh(g, new THREE.CylinderGeometry(2.2 - i * 0.28, 2.4 - i * 0.28, 1.2, 12), gold, 0, y, 0); y += 1.3 }
    mesh(g, new THREE.ConeGeometry(0.6, 12, 8), gold, 0, y + 6, 0)
    // 院内两座小亭（银殿方向）
    for (const x of [-32, 32]) {
      box(g, 12, 5, 9, white, x, 0.3, 18)
      gable(g, 13, 10, 5, roofB, x, 5.3, 18, Math.PI / 2)
      gable(g, 13.6, 10.6, 0.4, roofG, x, 5.1, 18, Math.PI / 2)
      mesh(g, new THREE.ConeGeometry(0.8, 6, 6), gold, x, 12, 18)
    }
  }

  // ════════ 4) 塔仔山（左前）：绿色小山 + 白色佛塔 ════════
  {
    const g = new THREE.Group()
    g.position.set(-150, -0.6, 40)
    scene.add(g)
    const hill = mesh(g, new THREE.SphereGeometry(30, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f8a3c, roughness: 1, flatShading: true }), 0, 0, 0)
    hill.scale.y = 0.45
    const bell = [[1, 0], [1, 0.08], [0.82, 0.12], [0.95, 0.3], [0.9, 0.45], [0.6, 0.55], [0.35, 0.62], [0.3, 0.72], [0.16, 0.8], [0.12, 0.92], [0.02, 1]]
    mesh(g, new THREE.LatheGeometry(bell.map(([a, b]) => new THREE.Vector2(a * 5.5, b * 22)), 16), white, 0, 13.4, 0)
    mesh(g, new THREE.ConeGeometry(0.6, 4, 8), gold, 0, 13.4 + 23.5, 0)
    for (let i = 0; i < 18; i++) { const a = rnd() * Math.PI * 2, r = 10 + rnd() * 16; mesh(g, new THREE.IcosahedronGeometry(2 + rnd() * 1.5, 0), leafMs[i % leafMs.length], Math.cos(a) * r, 9 - r * 0.25, Math.sin(a) * r) }
  }
}
