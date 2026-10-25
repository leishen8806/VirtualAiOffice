import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from '../vendor/three/three.module.js'
import { LAYOUT_V3_ALIGN as layout } from '../office-layout.js'
import { alignZoneObstaclePlan } from '../office-vis2/align-zones.js'
import { buildOpenFurnishing } from '../office-vis2/open-furnishing.js'

test('furnishing finish retains every group and measured collider from 2dbd13c at both qualities', () => {
  const before = JSON.stringify(layout)
  // 修改前真实构建的八区边界，浮点统一到微米；不是从新渲染器反向生成。
  const baseline = ['2fcc21647cbceca3d6c2bba3e5a91463a3233db374596d7569fa72aba2a52c1a', '6a7a62dad4088d97bf453a78ee4f98bdb87ce50c6ebe8ab69901d1960b5a3f65']
  for (const low of [false, true]) {
    const records = []
    for (const e of alignZoneObstaclePlan(layout)) {
      const root = new THREE.Group(), value = buildOpenFurnishing({THREE, root, plan:e.plan, low})
      if (e.id !== 'north-nook') records.push({id:e.id, colliders:value.colliders, groups:value.groups})
      assert.equal(root.children.length, 1); assert.equal(value.summary().calls, e.plan.placements.length ? 1 : 0)
      assert.ok(value.summary().triangles <= 8000, e.id + ' existing per-area budget')
      const g = value.root.geometry, released = new Set()
      for (const resource of [g, value.root.material]) resource.addEventListener('dispose', () => released.add(resource.uuid))
      value.dispose(); value.dispose(); assert.equal(released.size, 2); assert.equal(root.children.length, 0)
    }
    const json = JSON.stringify(records, (_, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)
    assert.equal(records.length,8,'all eight original furnishing zones remain in the frozen comparison')
    assert.equal(createHash('sha256').update(json).digest('hex'), baseline[Number(low)])
  }
  assert.equal(JSON.stringify(layout), before); assert.equal(Object.keys(layout.seats).length, 25)
})

test('actual upholstery has rounded edges and cabinet handles stand clear of the door faces', () => {
  const gold = new THREE.Color('#B89B64')
  for (const e of alignZoneObstaclePlan(layout)) {
    const root = new THREE.Group(), value = buildOpenFurnishing({THREE, root, plan:e.plan, low:false})
    try {
      const {position:p, normal:n, color:c, sampleSurface:s} = value.root.geometry.attributes
      for (const part of value.placements) {
        let rounded = 0, handle = -Infinity, door = -Infinity
        for (let i = part.vertices.start; i < part.vertices.start + part.vertices.count; i++) {
          if (s.getZ(i) === 3 && [n.getX(i), n.getY(i), n.getZ(i)].filter(v => Math.abs(v) > .1 && Math.abs(v) < .99).length >= 2) rounded++
          if (n.getZ(i) > .99 && p.getY(i) > .1 && p.getY(i) < .72) {
            if (s.getZ(i) === 1) door = Math.max(door, p.getZ(i))
            if (Math.abs(c.getX(i)-gold.r)+Math.abs(c.getY(i)-gold.g)+Math.abs(c.getZ(i)-gold.b) < 1e-5) handle = Math.max(handle, p.getZ(i))
          }
        }
        if (['bench', 'chair'].includes(part.kind)) assert.ok(rounded > 24, part.id + ' rounded upholstery')
        if (part.kind === 'planter-cabinet') assert.ok(handle - door > .008, part.id + ' handle/door clearance')
      }
    } finally { value.dispose() }
  }
})
