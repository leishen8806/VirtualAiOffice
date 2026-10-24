import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3 } from '../office-layout.js'
import { buildOfficeShellV3 } from '../office-layout-v3-scene.js'
import { buildOfficeAlignedShell, officeShellFinishSpec } from '../office-vis2/shell-finish.js'
import { placeOfficeFurnitureV2 } from '../office-furniture-v2.js'
import { mergeOfficeStatic } from '../office-v2-registry.js'
import { buildOfficeAlignedZones } from '../office-vis2/zone-finish.js'
import { buildOfficeZones } from '../office-zones.js'

function fixture(search = '') {
  const boxes = []
  return { THREE, root: new THREE.Group(), layout: LAYOUT_V3, search, boxes, collision: { add(mesh, label) {
    boxes.push({ label, position: mesh.position.toArray(), scale: mesh.scale.toArray() })
  } } }
}
const serialize = root => { const result = []; root.traverse(o => { if (o.isMesh) result.push({ name: o.name, count: o.count, visible: o.visible, material: o.material.type, color: o.material.color.getHexString(), matrix: o.instanceMatrix ? Array.from(o.instanceMatrix.array) : null }) }); return result }

test('full-office finish is default closed and keeps exact legacy geometry/materials', () => {
  for (const search of ['', '?officeSample=0', '?officeSample=yes', '?officeSample=1&officeSample=1']) {
    const a = fixture(), b = fixture(search), old = buildOfficeShellV3(a), current = buildOfficeAlignedShell(b)
    assert.deepEqual(serialize(b.root), serialize(a.root)); assert.deepEqual(b.boxes, a.boxes)
    old.dispose(); current.dispose()
  }
})

test('opt-in glass, frames and floor retain all 25 seats, collision boxes and door clearance', () => {
  const a = fixture(), b = fixture('?officeSample=1'), before = JSON.stringify(LAYOUT_V3)
  const old = buildOfficeShellV3(a), current = buildOfficeAlignedShell(b)
  assert.deepEqual(a.boxes, b.boxes); assert.equal(JSON.stringify(LAYOUT_V3), before); assert.equal(Object.keys(LAYOUT_V3.seats).length, 25)
  const spec = current.finishSpec
  assert.ok(spec.panes.length > 20); assert.equal(current.walls.visible, false)
  const glass = b.root.getObjectByName('office-aligned-clear-glass')
  assert.equal(glass.material.opacity, .085); assert.equal(glass.material.color.getHexString(), 'ffffff')
  for (const p of [...spec.solid, ...spec.panes]) for (const key of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(p[key]))
  for (const p of spec.solid.filter(p => p.workstation)) {
    const [, x, z] = LAYOUT_V3.seats[p.workstation]
    assert.ok(p.x - p.w / 2 >= x - .7 && p.x + p.w / 2 <= x + .7)
    assert.ok(p.z - p.d / 2 >= z - .35 && p.z + p.d / 2 <= z + .35)
    assert.ok(p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= .76)
  }
  assert.equal(new Set(spec.solid.filter(p => p.workstation).map(p => p.workstation)).size, 25)
  assert.ok(b.root.getObjectByName('office-aligned-plaza-paving'))
  assert.equal(current.green.count, old.green.count)
  assert.deepEqual(Array.from(current.green.instanceMatrix.array), Array.from(old.green.instanceMatrix.array))
  assert.deepEqual(Array.from(current.green.geometry.attributes.position.array), Array.from(old.green.geometry.attributes.position.array))
  assert.equal(current.green.material.color.getHexString(), '4d6a46')
  for (const p of spec.panes) {
    assert.ok(p.h > 0 && p.y - p.h / 2 >= .31)
    assert.ok(p.y + p.h / 2 < LAYOUT_V3.wallHeight.standard)
    if (p.outer && ['north', 'south'].includes(p.side)) {
      const door = LAYOUT_V3.doors[p.side]
      assert.ok(p.hi <= door.x0 || p.lo >= door.x1, 'glazing does not cover an entrance')
    }
  }
  for (const room of LAYOUT_V3.regions) for (const door of room.doors || []) {
    const vertical = ['east','west'].includes(door.side)
    const fixed = door.side === 'west' ? room.x0 + .07 : door.side === 'east' ? room.x1 - .07 : door.side === 'north' ? room.z0 + .07 : room.z1 - .07
    for (const p of spec.panes) if (Math.abs((vertical ? p.x : p.z) - fixed) < .001) {
      const center = vertical ? p.z : p.x, width = vertical ? p.d : p.w
      assert.ok(center + width / 2 <= door.at - door.width / 2 || center - width / 2 >= door.at + door.width / 2, 'glass preserves room doorway')
    }
  }
  const owned = new Set(), released = new Set()
  for (const mesh of [b.root.getObjectByName('office-aligned-frames-and-inlays'), glass]) for (const resource of [mesh, mesh.geometry, mesh.material]) { owned.add(resource.uuid); resource.addEventListener('dispose', () => released.add(resource.uuid)) }
  owned.add(current.ground.material.uuid)
  // The material is restored during dispose: retain its identity for the assertion.
  const floorId = current.ground.material.uuid
  current.ground.material.addEventListener('dispose', () => released.add(floorId))
  current.dispose(); current.dispose(); old.dispose()
  for (const id of owned) assert.ok(released.has(id), 'owned resource released')
  assert.equal(b.root.children.length, 0)
})

test('low quality omits transparent layer and the spec is deterministic', () => {
  const f = fixture('?officeSample=1'); f.low = true
  const shell = buildOfficeAlignedShell(f)
  assert.equal(f.root.getObjectByName('office-aligned-clear-glass'), undefined)
  assert.deepEqual(shell.finishSpec, officeShellFinishSpec(LAYOUT_V3, shell.spec))
  shell.dispose()
})

test('finish ownership does not prevent host furniture batching', () => {
  const f = fixture('?officeSample=1'), shell = buildOfficeAlignedShell(f)
  const material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(1,1,1)
  for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(geometry, material); mesh.position.x = i * 2; f.root.add(mesh) }
  const merged = mergeOfficeStatic(THREE, f.root, 'finish-test')
  assert.ok(merged.removed >= 3)
  merged.dispose(); shell.dispose(); geometry.dispose(); material.dispose()
})

test('visual construction failure restores the complete legacy shell', () => {
  const f = fixture('?officeSample=1'), a = fixture()
  f.THREE = { ...THREE, InstancedMesh: class extends THREE.InstancedMesh {
    constructor(geometry, material, count) { if (material.opacity === .085) throw new Error('injected glass failure'); super(geometry, material, count) }
  } }
  const old = buildOfficeShellV3(a), current = buildOfficeAlignedShell(f)
  assert.deepEqual(serialize(f.root), serialize(a.root)); assert.deepEqual(f.boxes, a.boxes)
  assert.equal(current.finishSpec, undefined); old.dispose(); current.dispose()
})

test('warm furniture changes only vertex colors, keeping screens, handles, geometry and collision', () => {
  const build = warmPalette => {
    const scene = new THREE.Scene(), boxes = [], sourceMaterials = []
    const ctx = () => ({ fillRect() {}, fillText() {}, drawImage() {} })
    const names = ['desk','chairDesk','computerScreen','computerKeyboard','computerMouse','table','chairModernCushion','bookcaseOpen','books','pottedPlant']
    const A = { furn: Object.fromEntries(names.map(name => [name, true])) }
    const placeFurniture = (assets, name, x, z, { y = 0, rotY = 0 }) => {
      const group = new THREE.Group(), material = new THREE.MeshStandardMaterial({ name: name.includes('chair') ? 'carpet' : 'wood', color: '#aabbaa' })
      sourceMaterials.push(material); group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), material)); group.position.set(x,y,z); group.rotation.y = rotY
      return { group, size: new THREE.Vector3(1,1,1) }
    }
    const result = placeOfficeFurnitureV2({ THREE, scene, layout: LAYOUT_V3, A, placeFurniture, warmPalette,
      collision: { add(mesh, kind) { const bounds = new THREE.Box3().setFromObject(mesh); boxes.push({ kind, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } }) } },
      canvasTex: () => ({ image: { getContext: ctx }, dispose() {} }), makeScreenTexture: () => ({ctx:ctx(),tex:{dispose(){}}}) })
    const values = []
    result.root.traverse(mesh => { if(mesh.isMesh && mesh.visible) values.push({ p: Array.from(mesh.geometry.attributes.position.array), uv: Array.from(mesh.geometry.attributes.uv.array), color: Array.from(mesh.geometry.attributes.color.array) }) })
    return { result, boxes, values, sourceMaterials }
  }
  const a = build(false), b = build(true)
  assert.deepEqual(a.result.spec, b.result.spec); assert.deepEqual(a.boxes,b.boxes)
  assert.deepEqual(a.values.map(({p,uv})=>({p,uv})), b.values.map(({p,uv})=>({p,uv})))
  assert.ok(b.values.some((value,i)=>JSON.stringify(value.color)!==JSON.stringify(a.values[i].color)))
  assert.ok(b.sourceMaterials.every(m=>m.color.getHexString()==='aabbaa'), 'shared asset materials untouched')
  a.result.dispose(); b.result.dispose()
})

test('zone refinement preserves original floor footprints and is default closed', () => {
  const a = fixture(), b = fixture(), old = buildOfficeZones(a), closed = buildOfficeAlignedZones(b)
  assert.deepEqual(serialize(a.root), serialize(b.root)); old.dispose(); closed.dispose()
  for (const low of [false,true]) {
    const f = fixture('?officeSample=1'); f.low = low
    const value = buildOfficeAlignedZones(f), geometry = f.root.getObjectByName('office-aligned-zone-seating').geometry
    assert.ok(value.visualBounds.length > 8)
    const p = geometry.attributes.position
    for (let i = 0; i < p.count; i++) assert.ok(value.visualBounds.some(b => p.getX(i) >= b.x0 - 1e-5 && p.getX(i) <= b.x1 + 1e-5 && p.getZ(i) >= b.z0 - 1e-5 && p.getZ(i) <= b.z1 + 1e-5), 'new seating stays within prior furniture footprint')
    assert.ok(value.zones.every(z => z.seats.length === 0 && z.colliders.length === 0))
    value.dispose(); value.dispose(); assert.equal(f.root.children.length,0)
  }
})
