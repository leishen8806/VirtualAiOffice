import { buildOfficeZones } from '../office-zones.js'
import { officeSampleRequested } from './host.js'
import { createSampleBatch } from './batch.js'

// Keep the original zone boundaries and labels; replace only the existing block-seat silhouettes.
export function buildOfficeAlignedZones(context) {
  const legacy = buildOfficeZones(context)
  if (!officeSampleRequested(context.search)) return legacy
  const { THREE, root } = context, batch = createSampleBatch(THREE), hidden = [], bounds = []
  let fixed, disposed = false
  const box = (x, y, z, w, h, d, color, surface = '') => batch.add(new THREE.BoxGeometry(w, h, d), color, [x,y,z], 0, surface === 'fabric' ? .97 : .75, 0, surface)
  const cylinder = (x,y,z,r,h,color) => batch.add(new THREE.CylinderGeometry(r,r,h,context.low ? 10 : 20),color,[x,y,z],0,.65)
  try {
    for (const zone of legacy.zones) for (const mesh of zone.root.children) {
      if (!mesh.isMesh || !/-(sofa(-2)?|chair|high-stool|round-table|small-bar)$/.test(mesh.name)) continue
      const { x,y,z } = mesh.position, p = mesh.geometry.parameters
      const footprint = new THREE.Box3().setFromObject(mesh)
      bounds.push({ name: mesh.name, x0: footprint.min.x, x1: footprint.max.x, z0: footprint.min.z, z1: footprint.max.z })
      if (/sofa|chair/.test(mesh.name)) {
        const w = p.width, d = p.depth, sofa = mesh.name.includes('sofa'), back = mesh.name.endsWith('-2') ? -1 : 1
        box(x,.39,z,w,.16,d, '#506A5A','fabric')
        box(x,.65,z + back * (d / 2 - .05),w,.38,.1,'#506A5A','fabric')
        if (sofa) for (const side of [-1,1]) box(x + side * (w / 2 - .05),.51,z,.1,.32,d,'#B7C2B4','fabric')
        for (const dx of [-w / 2 + .09,w / 2 - .09]) for (const dz of [-d / 2 + .09,d / 2 - .09]) box(x+dx,.2,z+dz,.045,.28,.045,'#B89B64')
      } else if (mesh.name.endsWith('high-stool')) {
        cylinder(x,.69,z,p.radiusTop,.07,'#506A5A')
        cylinder(x,.37,z,.035,.58,'#756D60')
        cylinder(x,.09,z,.15,.03,'#756D60')
      } else {
        const r = p.radiusTop, top = y + p.height / 2
        cylinder(x,top-.04,z,r,.08,'#C49A6C')
        cylinder(x,(top+.08)/2,z,mesh.name.endsWith('small-bar') ? r*.62 : .1,top-.16,'#D9D3C6')
        cylinder(x,.1,z,Math.min(r*.7,.42),.04,'#756D60')
      }
      hidden.push(mesh)
    }
    fixed = batch.build(root, 'office-aligned-zone-seating')
    fixed.mesh.userData.dynamic = true; fixed.mesh.userData.qualityProxy = true
    hidden.forEach(mesh => { mesh.visible = false })
    return { ...legacy, visualBounds: bounds, dispose() {
      if (disposed) return; disposed = true
      fixed.dispose(); hidden.forEach(mesh => { mesh.visible = true }); legacy.dispose()
    } }
  } catch (error) {
    fixed?.dispose(); hidden.forEach(mesh => { mesh.visible = true })
    console.warn('[office-zone-finish] 保留原功能区：',error.message)
    return legacy
  }
}
