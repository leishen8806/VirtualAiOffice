import { createSampleBatch } from './batch.js'
import { appendOfficePlaza } from './plaza.js'
import { officeSampleRequested } from './host.js'

export function buildOfficePlazaHost({ THREE, root, layout, search, collision, low = false }) {
  if (layout.version !== 3 || !officeSampleRequested(search)) return { dispose() {} }
  if (!collision?.add || !collision?.remove) throw new Error('Plaza needs removable collision registration')
  root.userData.dynamic = true
  const batch = createSampleBatch(THREE), proxies = []
  let visual, disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const proxy of proxies) { collision.remove(proxy); proxy.removeFromParent(); proxy.geometry.dispose(); proxy.material.dispose() }
    visual?.dispose()
  }
  try {
    const placements = appendOfficePlaza({ THREE, batch, layout, low }).map(p => ({ ...p, interaction: 'inspect-only' }))
    visual = batch.build(root, 'office-plaza-props')
    for (const placement of placements) {
      const b = placement.bounds, height = layout.variant === 'align' && placement.kind === 'vendors' ? b.y1 - b.y0 : Math.min(2, b.y1 - b.y0)
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, height, b.z1 - b.z0), new THREE.MeshBasicMaterial())
      proxy.position.set((b.x0 + b.x1) / 2, b.y0 + height / 2, (b.z0 + b.z1) / 2)
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
