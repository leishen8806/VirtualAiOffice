import { r1ToWorld } from '../office-r1-layout.js'
import { createSampleBatch } from './batch.js'

export const r1ReceptionCenter = Object.freeze([28, 2.7])
export const r1LoungeSpec = Object.freeze({ center: Object.freeze([42, 4.8]), inner: 1.9, outer: 2.7, angles: Object.freeze([[130, 190], [198, 258], [266, 326], [334, 410]].map(Object.freeze)) })

function arc(THREE, inner, outer, start, end, height) {
  const a = start * Math.PI / 180, b = end * Math.PI / 180, shape = new THREE.Shape()
  shape.absarc(0, 0, outer, a, b, false)
  shape.lineTo(inner * Math.cos(b), inner * Math.sin(b)); shape.absarc(0, 0, inner, b, a, true); shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48 })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

export function buildR1Lounge({ THREE, root, layout, collision }) {
  if (layout?.r1Phase !== 'R1') return { dispose() {} }
  const group = new THREE.Group(); group.name = 'r1-lounge'; group.userData.dynamic = true
  const batch = createSampleBatch(THREE), proxies = [], items = [], proxyMaterial = new THREE.MeshBasicMaterial({ visible: false })
  const add = (id, center, inner, outer, angles, layers) => {
    const row = layout.r1.elements.find(item => item.id === id), p = r1ToWorld(...center), startVertex = batch.triangles() * 3
    for (const [r0, r1, base, height, color, surface] of layers) batch.add(arc(THREE, r0, r1, ...angles, height), color, [p.x, base, p.z], 0, surface === 'fabric' ? .95 : .7, 0, surface)
    const proxy = new THREE.Mesh(arc(THREE, inner, outer, ...angles, row.heightM), proxyMaterial)
    proxy.position.set(p.x, row.zM, p.z); proxy.visible = false; proxy.userData = { r1Id: id, collisionProxy: true }; proxy.name = id
    collision?.add(proxy, id); proxies.push(proxy)
    items.push({ id, center, inner, outer, angles, startVertex, count: batch.triangles() * 3 - startVertex })
  }
  add('11-CT-001', r1ReceptionCenter, 1.8, 2.7, [30, 150], [[1.8, 2.7, 0, .94, '#b18a61', 'wood'], [1.8, 2.7, .94, .06, '#dfd6c6', 'stone']])
  r1LoungeSpec.angles.forEach((angles, i) => add(`12-SF-00${i + 1}`, r1LoungeSpec.center, 1.9, 2.7, angles,
    [[1.9, 2.7, 0, .35, '#42534c', 'fabric'], [1.9, 2.7, .35, .1, '#718272', 'fabric'], [2.52, 2.7, .45, .4, '#506a5a', 'fabric']]))
  const built = batch.build(group, 'r1-lounge-surfaces'); built.mesh.userData.itemIds = items.map(item => item.id); built.mesh.userData.items = items
  root.add(group); let disposed = false
  return { root: group, items, dispose() { if (disposed) return; disposed = true; proxies.forEach(proxy => { collision?.remove?.(proxy); proxy.geometry.dispose() }); proxyMaterial.dispose(); built.dispose(); group.removeFromParent() } }
}
