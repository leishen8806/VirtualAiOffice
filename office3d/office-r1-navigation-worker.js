import * as THREE from './vendor/three/three.module.js'
import { createFurnitureCollision } from './furniture-collision.js'
import { createR1Navigation } from './office-r1-navigation.js'

// Rebuild only the registered collision triangles, never the visible scene or assets.
self.onmessage = async ({ data: { layout, snapshot } }) => {
  try {
    const collision = createFurnitureCollision()
    for (const row of snapshot) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(row.vertices, 3))
      const mesh = new THREE.Mesh(geometry)
      mesh.name = row.name; mesh.userData.r1Id = row.id; mesh.userData.r1Door = row.door
      collision.add(mesh, row.kind)
      const body = collision.navigationBodies().at(-1)
      body.box.min.fromArray(row.box); body.box.max.fromArray(row.box, 3)
    }
    const nav = createR1Navigation(layout).attach(collision)
    await nav.prepare()
    const result = nav.exportPrepared(), buffers = new Set()
    const visit = value => {
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer)
      else if (value instanceof Map) for (const item of value.values()) visit(item)
      else if (value && typeof value === 'object') for (const item of Object.values(value)) visit(item)
    }
    visit(result)
    self.postMessage(result, [...buffers])
  } catch (error) { self.postMessage({ error: error.message }) }
}
