import { latestSearch } from './place-mode.js'

export function prepareDrPage(mode, documentRef = document) {
  documentRef.title = mode.title
  documentRef.body.classList.add('place-dr')
  documentRef.body.dataset.place = 'dr'
  documentRef.querySelector('.brand h1').textContent = mode.brand
  documentRef.getElementById('connText').textContent = mode.subtitle
  documentRef.getElementById('loadText').textContent = '正在进入仓配园区…'
  const roomLink = documentRef.getElementById('drControlRoomLink')
  if (roomLink) {
    const warehouseSearch = latestSearch('drlife-warehouse')
    roomLink.href = mode.controlRoom
      ? `/${warehouseSearch}`
      : `/${warehouseSearch}&controlRoom=1`
    roomLink.textContent = mode.controlRoom ? '返回仓配全景' : '进入调度中控室'
  }
}

export function isolateDrPlace({
  scene,
  campusRoot,
  environmentRoots,
  labels,
  bubbles,
  zones,
  setGoal,
  keepRoots = [],
  documentRef = document,
}) {
  const officeRoots = []
  for (const root of scene.children) {
    if (root === campusRoot || keepRoots.includes(root) || root.isLight || environmentRoots.has(root)) continue
    root.visible = false
    officeRoots.push(root)
  }
  labels.replaceChildren()
  bubbles.replaceChildren()

  const search = documentRef.getElementById('drZoneSearch')
  const results = documentRef.getElementById('drZoneResults')
  const renderZones = () => {
    const term = search.value.trim().toLowerCase()
    results.replaceChildren()
    for (const zone of zones.filter((item) => !term || item.label.toLowerCase().includes(term))) {
      const button = documentRef.createElement('button')
      button.type = 'button'
      button.textContent = zone.label
      button.addEventListener('click', () => setGoal({
        az: -25,
        el: 44,
        r: Math.max(24, Math.max(zone.x1 - zone.x0, zone.z1 - zone.z0) * 2.2),
        t: [(zone.x0 + zone.x1) / 2, 0, (zone.z0 + zone.z1) / 2],
      }))
      results.appendChild(button)
    }
  }
  search.addEventListener('input', renderZones)
  renderZones()
  return officeRoots
}
