import { resolveDragStart, trayModel, validateItemParameter } from './home-editor-logic.js'

const CATALOG = [
  ['bed_single', '单人床', 4, 3, 'floor', true],
  ['sofa_two', '双人沙发', 4, 2, 'floor', true],
  ['table_dining', '餐桌', 3, 2, 'floor', true],
  ['chair_wood', '木椅', 1, 1, 'floor', true],
  ['desk_work', '书桌', 3, 2, 'floor', true],
  ['wardrobe', '衣柜', 2, 1, 'floor', true],
  ['bookshelf', '书架', 3, 1, 'wall', true],
  ['tv_stand', '电视柜', 3, 1, 'wall', true],
  ['plant_pot', '盆栽', 1, 1, 'floor', true],
  ['lamp_floor', '落地灯', 1, 1, 'floor', true],
  ['rug_round', '圆形地毯', 4, 4, 'rug', false],
  ['frame_art', '挂画', 2, 1, 'wall', false],
]
const byId = new Map(CATALOG.map(([id, name, w, d, layer, blocks]) => [id, { id, name, footprint: { w, d }, layer, blocks }]))
const clone = (value) => JSON.parse(JSON.stringify(value))
const cellsFor = (item, placement) => {
  const rotated = placement.rot === 90 || placement.rot === 270
  const width = rotated ? item.footprint.d : item.footprint.w
  const depth = rotated ? item.footprint.w : item.footprint.d
  return Array.from({ length: width * depth }, (_, index) => ({
    cx: placement.cx + index % width,
    cz: placement.cz + Math.floor(index / width),
  }))
}
const occupied = (layout, candidate) => {
  const item = byId.get(candidate.itemId)
  const cells = cellsFor(item, candidate)
  return layout.placements.some((entry) => {
    const other = byId.get(entry.itemId)
    if (!other || entry.itemInstanceId === candidate.itemInstanceId) return false
    if (item.layer === 'rug' || other.layer === 'rug') return item.layer === other.layer && cells.some((a) => cellsFor(other, entry).some((b) => a.cx === b.cx && a.cz === b.cz))
    return item.layer === 'floor' && other.layer === 'floor' && cells.some((a) => cellsFor(other, entry).some((b) => a.cx === b.cx && a.cz === b.cz))
  })
}
const reasonFor = (layout, candidate) => {
  const item = byId.get(candidate.itemId)
  const cells = cellsFor(item, candidate)
  if (cells.some((cell) => cell.cx < 0 || cell.cz < 0 || cell.cx >= 16 || cell.cz >= 12)) return '超出房间'
  if (item.blocks && cells.some((cell) => cell.cx >= 6 && cell.cx <= 9 && cell.cz >= 10)) return '会挡住入口'
  if (occupied(layout, candidate)) return '与已有物品重叠'
  if (item.layer === 'wall' && !cells.some((cell) => cell.cx === 0 || cell.cx === 15 || cell.cz === 0 || cell.cz === 11)) return '墙面物品要贴墙'
  return ''
}

export function createHomeEditor({ THREE, scene, camera, renderer, room, itemBuilder, persistAdapter = {} } = {}) {
  let openState = false
  let inventory = []
  let layout = { schemaVersion: 1, ownerId: 'demo', revision: 0, placements: [] }
  let selectedId = null
  let pending = null
  let history = []
  let future = []
  let drag = null
  let root
  let tray
  let message
  let raycaster
  let pointer
  const listeners = []
  const addListener = (target, type, handler, options) => {
    target.addEventListener(type, handler, options)
    listeners.push(() => target.removeEventListener(type, handler, options))
  }
  const snapshot = () => clone(layout)
  const commit = (next) => {
    history.push(snapshot())
    if (history.length > 50) history.shift()
    future = []
    layout = clone(next)
    room.setPlacements(layout.placements, inventory)
    renderTray()
  }
  const findPlacement = (id) => layout.placements.find((entry) => entry.itemInstanceId === id)
  const nextInstance = (itemId) => {
    const used = new Set(layout.placements.map((entry) => entry.itemInstanceId))
    return inventory.find((entry) => entry.itemId === itemId && !used.has(entry.itemInstanceId))
  }
  const placementAtPointer = (event, item, instanceId) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hit = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null
    const rotated = item.rot === 90 || item.rot === 270
    const width = rotated ? itemDef(item.itemId).footprint.d : itemDef(item.itemId).footprint.w
    const depth = rotated ? itemDef(item.itemId).footprint.w : itemDef(item.itemId).footprint.d
    return {
      itemInstanceId: instanceId,
      itemId: item.itemId,
      cx: Math.max(0, Math.min(16 - width, Math.round(hit.x / 0.5 + 8 - width / 2))),
      cz: Math.max(0, Math.min(12 - depth, Math.round(hit.z / 0.5 + 6 - depth / 2))),
      rot: item.rot,
      layer: itemDef(item.itemId).layer,
    }
  }
  const itemDef = (id) => byId.get(id)
  const showMessage = (text) => { if (message) message.textContent = text || '选择物品开始摆放' }
  const selectItem = (id) => {
    if (!validateItemParameter(id)) return false
    const entry = nextInstance(id)
    pending = null
    selectedId = null
    drag = null
    if (!entry) {
      showMessage(`${itemDef(id).name}暂无剩余，请移动已有物品`)
      return false
    }
    pending = { itemId: id, itemInstanceId: entry.itemInstanceId, rot: 0 }
    showMessage(`预览${itemDef(id).name}：移动指针选择位置`)
    return true
  }
  const renderTray = () => {
    if (!tray) return
    tray.replaceChildren()
    const counts = new Map(trayModel(inventory, layout).map((entry) => [entry.itemId, entry]))
    for (const item of CATALOG) {
      const [id, name] = item
      const count = counts.get(id) || { owned: 0, remaining: 0, disabled: true }
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = `${name} ${count.remaining}/${count.owned}`
      button.disabled = count.disabled
      button.setAttribute('aria-label', `选择${name}`)
      addListener(button, 'click', () => selectItem(id))
      tray.append(button)
    }
  }
  const renderFrame = () => {
    if (!root) return
    const selected = selectedId ? findPlacement(selectedId) : null
    root.querySelector('[data-selected]')?.removeAttribute('data-selected')
    if (selected) {
      const target = [...room.items.children].find((child) => child.userData.itemInstanceId === selectedId)
      if (target) target.setAttribute?.('data-selected', 'true')
    }
  }
  const applyUndo = () => {
    if (!history.length) return
    future.push(snapshot())
    layout = history.pop()
    room.setPlacements(layout.placements, inventory)
    renderTray()
  }
  const applyRedo = () => {
    if (!future.length) return
    history.push(snapshot())
    layout = future.pop()
    room.setPlacements(layout.placements, inventory)
    renderTray()
  }
  const pickObject = (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(room.items.children, true)
    let object = hits[0]?.object
    while (object && !object.userData?.itemInstanceId) object = object.parent
    return object?.userData?.itemInstanceId || null
  }
  const onPointerDown = (event) => {
    if (!openState) return
    const picked = pickObject(event)
    const start = resolveDragStart(pending, picked)
    if (start?.kind === 'existing') {
      if (start.clearPending) pending = null
      selectedId = start.id
      drag = { id: start.id }
      showMessage('已选中物品，可拖动移动')
      event.preventDefault()
      return
    }
    if (start?.kind === 'pending') drag = { id: start.id, pending: true }
  }
  const onPointerMove = (event) => {
    if (!drag) return
    const current = pending || findPlacement(drag.id)
    if (!current) return
    const candidate = placementAtPointer(event, current, drag.id)
    if (!candidate) return
    const base = layout.placements.filter((entry) => entry.itemInstanceId !== drag.id)
    const reason = reasonFor({ placements: base }, candidate)
    showMessage(reason || '位置可用，松开完成')
    drag.candidate = candidate
    event.preventDefault()
  }
  const onPointerUp = () => {
    if (!drag?.candidate) { drag = null; return }
    const candidate = drag.candidate
    const base = layout.placements.filter((entry) => entry.itemInstanceId !== drag.id)
    const reason = reasonFor({ placements: base }, candidate)
    if (!reason) {
      commit({ ...layout, placements: [...base, candidate] })
      pending = null
      selectedId = candidate.itemInstanceId
      showMessage('已放置，可继续调整')
    } else showMessage(reason)
    drag = null
  }
  const rotate = (delta) => {
    const target = selectedId ? findPlacement(selectedId) : pending
    if (!target) return
    const rotated = (target.rot + delta + 360) % 360
    const next = { ...target, rot: rotated }
    if (selectedId) commit({ ...layout, placements: layout.placements.map((entry) => entry.itemInstanceId === selectedId ? next : entry) })
    else pending = next
  }
  const remove = () => {
    if (!selectedId) return
    commit({ ...layout, placements: layout.placements.filter((entry) => entry.itemInstanceId !== selectedId) })
    selectedId = null
    showMessage('已移除')
  }
  const onKey = (event) => {
    if (!openState) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); applyUndo(); return }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); applyRedo(); return }
    if (event.key.toLowerCase() === 'r') rotate(90)
    if (event.key === 'Delete') remove()
    if (event.key === 'Escape') { pending = null; selectedId = null; showMessage('已取消选择') }
  }
  const createUI = () => {
    root = document.createElement('section')
    root.className = 'home-editor glass'
    root.setAttribute('aria-label', '个人空间编辑器')
    const tools = document.createElement('div')
    tools.className = 'home-editor-tools'
    const addButton = (label, action, aria) => {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', aria || label)
      addListener(button, 'click', action); tools.append(button)
      return button
    }
    addButton('↺', () => rotate(270), '逆时针旋转')
    addButton('↻', () => rotate(90), '顺时针旋转')
    addButton('删除', remove)
    addButton('撤销', applyUndo)
    addButton('重做', applyRedo)
    addButton('恢复默认', async () => {
      if (!window.confirm('确认恢复默认布置？')) return
      const result = await (persistAdapter.reset?.() || Promise.resolve({ ok: false, offline: true }))
      if (result.ok || result.offline) {
        commit({ ...layout, ...(result.layout || {}), placements: [] })
        showMessage(result.ok ? '已恢复默认并保存' : '已恢复默认（离线演示，刷新后不保留）')
      } else showMessage(result.message || '恢复默认失败，当前布置未改变')
    })
    const completeButton = addButton('完成', async () => {
      if (completeButton.disabled) return
      completeButton.disabled = true
      try {
        const result = await (persistAdapter.save?.(snapshot()) || Promise.resolve({ ok: false, offline: true }))
        if (result.ok) {
          if (result.layout) {
            layout = clone(result.layout)
            room.setPlacements(layout.placements, inventory)
            renderTray()
          }
          history = []
          future = []
          pending = null
          selectedId = null
          showMessage(result.message || '已保存')
          close()
        } else if (result.offline) {
          showMessage('已保留在离线演示中，刷新后不保留')
          close()
        } else showMessage(`${result.message || '保存失败，当前布置仍保留'}；点击完成重试`)
      } catch { showMessage('保存暂不可用，当前布置仍保留在页面内存；点击完成重试') }
      finally { completeButton.disabled = false }
    })
    message = document.createElement('div'); message.className = 'home-editor-message'; message.textContent = '选择物品开始摆放'
    tray = document.createElement('div'); tray.className = 'home-editor-tray'
    root.append(tools, message, tray)
    document.body.append(root)
    renderTray()
  }
  function open() {
    try {
      if (openState) return
      openState = true
      if (!raycaster) { raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2() }
      createUI()
      addListener(renderer.domElement, 'pointerdown', onPointerDown)
      addListener(renderer.domElement, 'pointermove', onPointerMove)
      addListener(renderer.domElement, 'pointerup', onPointerUp)
      addListener(window, 'keydown', onKey)
      showMessage('选择物品开始摆放')
    } catch { showMessage('编辑器暂不可用') }
  }
  function close() {
    openState = false
    pending = null
    selectedId = null
    while (listeners.length) listeners.pop()()
    root?.remove()
    root = null; tray = null; message = null; drag = null
  }
  function dispose() { close() }
  return {
    open,
    close,
    selectItem(id) {
      if (!validateItemParameter(id)) return false
      open()
      return openState && selectItem(id)
    },
    isOpen: () => openState,
    getLayout: () => snapshot(),
    isDirty: () => history.length > 0,
    setLayout(next, nextInventory) {
      layout = clone(next || layout)
      inventory = clone(nextInventory || inventory)
      history = []
      future = []
      room.setPlacements(layout.placements, inventory)
      renderTray()
    },
    dispose,
  }
}
