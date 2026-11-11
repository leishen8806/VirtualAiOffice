// 样板开启后以实际台体和独立座椅三角面取代整岛禁入盒；不改公共半径或胶囊参数。
export function registerOfficeBarCollision({ THREE, root, collision, counter, counterVertices, stools, sofas, pool }) {
  const material = new THREE.MeshBasicMaterial({ visible: false }), bodies = [], owned = []
  let disposed = false
  const dispose = () => {
    if (disposed) return; disposed = true
    for (const body of bodies) { collision.remove?.(body); body.removeFromParent() }
    for (const geometry of owned) geometry.dispose()
    material.dispose()
  }
  try {
    root.updateWorldMatrix(true, true)
    const inverse = root.matrixWorld.clone().invert()
    const add = (geometry, matrix, name, kind) => {
      const body = new THREE.Mesh(geometry, material); body.name = name; body.visible = false
      body.applyMatrix4(matrix); root.add(body); bodies.push(body)
      collision.add(body, kind)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(counter.geometry.attributes.position.array.slice(0, counterVertices * 3), 3)); owned.push(geometry)
    add(geometry, inverse.clone().multiply(counter.matrixWorld), 'sample-bar-physical-counter', 'officeBar')
    for (const [source, kind] of [[stools, 'officeBarStool'], [sofas, 'officeBarSofa']]) for (let i = 0; i < source.count; i++) {
      const instance = new THREE.Matrix4(); source.getMatrixAt(i, instance)
      add(source.geometry, inverse.clone().multiply(source.matrixWorld).multiply(instance), `${source.name}-collision-${i}`, kind)
    }
    add(pool.geometry, inverse.clone().multiply(pool.matrixWorld), 'sample-bar-physical-tree-pool', 'officeTreePool')
    return { bodies, dispose }
  } catch (error) { dispose(); throw error }
}
