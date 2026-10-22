import { OFFICE_THEME_V2 as T } from './office-theme-v2.js'
import { displayConfig, displayRoster, displayRoute, displaySchedule, displayFrame } from './display-staff-logic.js'
import { displayAtlas } from './display-staff-mesh.js'

export function buildDisplayStaff({ THREE, root, layout, config, search = '', now = () => 0, low = false, seed = 2707, canvasTex }) {
  const group = new THREE.Group(); group.name = 'office2-display-staff'; group.userData.dynamic = true
  const roster = displayRoster(layout), routes = new Map()
  let enabled = displayConfig(config, search).enabled, disposed = false, meshes = [], texture = null
  let lastHour = null, schedule = [], lastTime = null, failure = null, frame = []
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const parts = 13
  const colors = [T.trim, T.glass, T.glass, T.nameplate, T.trim, T.nameplateText, T.nameplateText,
    T.nameplate, T.nameplate, T.glass, T.glass, T.nameplateText, T.nameplateText]
  function release() {
    meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); mesh.removeFromParent() })
    meshes = []; texture?.dispose(); texture = null
  }
  function create() {
    if (!enabled || low || disposed || meshes.length || roster.length !== 12) return
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: T.wallRoughness }), roster.length * parts)
    meshes = [body]; group.add(body)
    texture = displayAtlas(THREE, [['模拟']], canvasTex)
    const labels = new THREE.InstancedMesh(new THREE.PlaneGeometry(.8, .3), new THREE.MeshBasicMaterial({ map: texture, color: texture ? 0xffffff : T.nameplate, side: THREE.DoubleSide }), roster.length)
    body.name = 'display-simulated-body'; labels.name = 'display-simulated-badges'
    for (const mesh of [body, labels]) { mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false }
    group.add(labels)
    meshes = [body, labels]
    for (let i = 0; i < roster.length * parts; i++) body.setColorAt(i, color.set(colors[i % parts]))
    body.instanceColor.needsUpdate = true
  }
  function draw(time) {
    if (!meshes.length) return
    const hour = Math.floor(time / 3600000)
    if (hour !== lastHour) { schedule = displaySchedule(roster, routes, hour, seed); lastHour = hour }
    frame = displayFrame(roster, routes, schedule, time)
    const [body, labels] = meshes
    frame.forEach((p, index) => {
      const sit = p.state === 'seated', walk = p.state === 'outbound' || p.state === 'returning'
      const swing = walk ? Math.sin(p.phase) * .18 : 0, hip = sit ? .6 : 1
      const values = [
        [0, hip, 0, .34, .18, .24], [0, hip + .32, 0, .4, .48, .26],
        [0, hip + .58, 0, .38, .08, .27], [0, hip + .77, 0, .25, .28, .24],
        [0, hip + .94, .015, .27, .08, .25], [-.05, hip + .8, -.126, .022, .022, .008], [.05, hip + .8, -.126, .022, .022, .008],
        [-.26, hip + .25, sit ? -.17 : swing, .08, .38, .09], [.26, hip + .25, sit ? -.17 : -swing, .08, .38, .09],
        [-.1, sit ? .55 : .68, sit ? -.2 : -swing, .12, sit ? .13 : .48, sit ? .4 : .14],
        [.1, sit ? .55 : .68, sit ? -.2 : swing, .12, sit ? .13 : .48, sit ? .4 : .14],
        [-.1, .25, sit ? -.36 : -swing, .11, .4, .12], [.1, .25, sit ? -.36 : swing, .11, .4, .12],
      ]
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw)
      values.forEach(([x, y, z, w, h, d], j) => {
        dummy.position.set(p.x + x * c + z * s, y, p.z - x * s + z * c)
        dummy.rotation.set(0, p.yaw, 0); dummy.scale.set(w, h, d); dummy.updateMatrix()
        body.setMatrixAt(index * parts + j, dummy.matrix)
      })
      dummy.position.set(p.x, hip + 1.24, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1)
      dummy.updateMatrix(); labels.setMatrixAt(index, dummy.matrix)
    })
    body.instanceMatrix.needsUpdate = true; labels.instanceMatrix.needsUpdate = true
  }
  function update() {
    if (disposed || !enabled || low || !group.visible || failure) return
    try {
      const time = now()
      if (!Number.isFinite(time) || time < 0) throw new Error('DISPLAY_CLOCK_INVALID')
      if (time === lastTime) return
      if (!routes.size) roster.forEach(p => routes.set(p.id, displayRoute(layout, p)))
      create(); draw(time); lastTime = time
    } catch {
      failure = 'DISPLAY_UNAVAILABLE'; release()
    }
  }
  root.add(group); update()
  return { root: group, update, setEnabled(value) {
    enabled = value === true
    if (!enabled) { release(); frame = []; lastTime = null }
    else { failure = null; update() }
  }, setLow(value) {
    low = value === true; release(); frame = []; lastTime = null; update()
  }, summary: () => ({ enabled, low, count: meshes.length ? roster.length : 0, calls: meshes.length,
    triangles: meshes.reduce((n, m) => n + (m.geometry.index?.count || m.geometry.attributes.position.count) / 3 * m.count, 0),
    walking: frame.filter(p => ['outbound', 'returning'].includes(p.state)).length, resting: frame.filter(p => p.state === 'resting').length,
    failure, synthetic: true }), positions: () => frame.map(p => ({ ...p })),
    dispose() { if (disposed) return; disposed = true; release(); routes.clear(); group.removeFromParent() } }
}
