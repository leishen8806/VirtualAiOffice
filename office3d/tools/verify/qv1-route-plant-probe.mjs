import { createOfficeR1Layout } from '../../office-vis2/r1-site.js'
import { r1DensePlan } from '../../office-vis2/r1-dense-garden.js'
import { plantFootprintSamples } from '../../tests/helpers/r1-plant-footprints.mjs'
const layout = createOfficeR1Layout()
const segment=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)}
const p = r1DensePlan(layout)
for (const row of [...p.plants, ...p.troughs, ...p.gardens]) for (const q of plantFootprintSamples(row)) for (const route of layout.r1.routes) { const pts = route.points_m.map(([x,y])=>[x-26,18-y]), rad = layout.r1.data.bodyProfiles[route.body_profile].radius_m; for (let i=1;i<pts.length;i++){ const m = segment(q.x,q.z,pts[i-1],pts[i])-q.r-rad; if (m < .3-1e-6) console.log(row.id, 'layout', (q.x+26).toFixed(2), (18-q.z).toFixed(2), 'r', q.r, route.id, 'seg', route.points_m[i-1]+'->'+route.points_m[i], 'margin', m.toFixed(3)) } }
