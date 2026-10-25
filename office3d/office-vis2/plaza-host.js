import { createSampleBatch } from './batch.js'
import { appendOfficePlaza } from './plaza.js'
import { officeSampleRequested } from './host.js'

export function buildOfficePlazaHost({ THREE, root, layout, search, collision, low = false }) {
  if (layout.version !== 3 || !officeSampleRequested(search)) return { dispose() {} }
  if (!collision?.add || !collision?.remove) throw new Error('Plaza needs removable collision registration')
  root.userData.dynamic = true
  const batch = createSampleBatch(THREE), leafBatch = layout.variant === 'align' && !low ? createSampleBatch(THREE) : batch, proxies = []
  let visual, foliage, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const proxy of proxies) { collision.remove(proxy); proxy.removeFromParent(); proxy.geometry.dispose(); proxy.material.dispose() }
    foliage?.dispose(); visual?.dispose()
  }
  try {
    const placements = appendOfficePlaza({ THREE, batch, leafBatch, layout, low }).map(p => ({ ...p, interaction: 'inspect-only' }))
    visual = batch.build(root, 'office-plaza-props')
    if (leafBatch !== batch) {
      foliage = leafBatch.build(root, 'office-plaza-foliage')
      foliage.mesh.material.side = THREE.DoubleSide
      foliage.mesh.userData.dynamic = true
    }
    for (const placement of placements) {
      const b = placement.bounds, height = layout.variant === 'align' && placement.kind === 'vendors' ? b.y1 - b.y0 : Math.min(2, b.y1 - b.y0)
      const corners = placement.footprint, edge = (a,c) => Math.hypot(c.x-a.x,c.z-a.z)
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(corners ? edge(corners[0],corners[1]) : b.x1-b.x0, height, corners ? edge(corners[1],corners[2]) : b.z1-b.z0), new THREE.MeshBasicMaterial())
      proxy.position.set(corners ? corners.reduce((s,p)=>s+p.x,0)/4 : (b.x0+b.x1)/2, b.y0+height/2, corners ? corners.reduce((s,p)=>s+p.z,0)/4 : (b.z0+b.z1)/2)
      if (corners) proxy.rotation.y = -Math.atan2(corners[1].z-corners[0].z,corners[1].x-corners[0].x)
      proxy.name = placement.id; proxy.visible = false; proxy.userData.placement = placement
      root.add(proxy); proxies.push(proxy); collision.add(proxy, `plaza-${placement.kind}`)
    }
    return {
      placements, dispose,
      pick(ray) {
        if (disposed) return null
        for (let p = root; p; p = p.parent) if (!p.visible) return null
        return ray.intersectObjects(proxies, false)[0]?.object.userData.placement || null
      },
    }
  } catch (error) { dispose(); throw error }
}
