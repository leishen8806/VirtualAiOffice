import { officePlan1Reception, officePlan1SouthHeight } from '../office-plan1-layout.js'
import { createSampleBatch } from './batch.js'

// Actual trapezoids, including their sloping caps; only their top vertices change during cutaway.
export function buildPlan1Facade(THREE, root, layout, segments, material) {
  const box = new THREE.BoxGeometry(1, 1, 1), unit = box.toNonIndexed(), source = unit.attributes.position
  box.dispose()
  const positions = new Float32Array(segments.length * 2 * source.count * 3), geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3))
  const style = layout.walls.outerSolid
  const states = segments.map(segment => {
    const south = !['north', 'west', 'east'].includes(segment.side)
    const heights = [segment.a, segment.b].map(p => south ? officePlan1SouthHeight(layout, p.x) : style.height)
    return { segment, heights, current: [...heights] }
  })
  function write() {
    let offset = 0
    for (const { segment: { a, b }, current: [ha, hb] } of states) {
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
      for (const cap of [false, true]) for (let i = 0; i < source.count; i++) {
        const t = source.getX(i) + .5, h = ha + (hb - ha) * t, y = source.getY(i) + .5, side = source.getZ(i) * style.thickness
        positions[offset++] = a.x + dx * t - dz / length * side
        positions[offset++] = cap ? h + y * style.capHeight : y * h
        positions[offset++] = a.z + dz * t + dx / length * side
      }
    }
    geometry.attributes.position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  }
  write(); unit.dispose()
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'office-plan1-sloped-facade'; mesh.userData.dynamic = true
  mesh.castShadow = mesh.receiveShadow = false; root.add(mesh)
  return { mesh, states, write, dispose() { geometry.dispose(); mesh.removeFromParent() } }
}

export function buildPlan1Reception({ THREE, root, layout, collision, low }) {
  const data = officePlan1Reception(layout), solid = createSampleBatch(THREE), panes = createSampleBatch(THREE), proxies = []
  const box = (batch, x0, x1, y, h, z0, z1, color, metal = 0) => batch.add(new THREE.BoxGeometry(x1-x0,h,z1-z0), color, [(x0+x1)/2,y+h/2,(z0+z1)/2], 0, .6, metal)
  const frame = '#AA9472', trim = '#B89B64', f = data.spec.frameWidth
  const wall = data.wall
  box(solid,wall.x0,wall.x1,0,wall.height,wall.z0,wall.z1,layout.walls.outerSolid.finish)
  for (const p of data.columns) {
    box(solid,p.x0,p.x1,0,p.height,p.z0,p.z1,'#F4F1EA')
    for (const y of [.12,p.height-.08]) box(solid,p.x0-.006,p.x1+.006,y,.05,p.z0-.006,p.z1+.006,trim,.55)
    box(solid,p.x0+.06,p.x1-.06,p.height,.18,p.z0+.06,p.z1-.06,'#D9D3C6')
    // Small owned foliage above the column planter, with fixed three-dimensional leaves.
    for (let i=0;i<(low?12:24);i++) {
      const a=i*2.399, g=new THREE.SphereGeometry(.1,5,3); g.scale(.55,1.8,1); g.rotateZ(.65); g.rotateY(a)
      solid.add(g,['#3F6341','#55764A','#748950'][i%3],[(p.x0+p.x1)/2+Math.sin(a)*.23,p.height+.28+(i%3)*.08,(p.z0+p.z1)/2+Math.cos(a)*.23])
    }
  }
  for (const p of [...data.partitions,...data.leaves]) {
    const leaf=p.kind==='leaf', x=(p.x0+p.x1)/2, z=(p.z0+p.z1)/2
    const glass=layout.walls.internalGlass.glassThickness/2
    box(panes,leaf?x-glass:p.x0+f,leaf?x+glass:p.x1-f,f,p.height-2*f,leaf?p.z0+f:z-glass,leaf?p.z1-f:z+glass,'#ffffff')
    for (const y of [0,p.height-f]) box(solid,p.x0,p.x1,y,f,p.z0,p.z1,frame,.5)
    if (leaf) for(const end of [p.z0,p.z1]) box(solid,p.x0,p.x1,0,p.height,end-f/2,end+f/2,frame,.5)
    else for(const end of [p.x0,p.x1]) box(solid,end-f/2,end+f/2,0,p.height,p.z0,p.z1,frame,.5)
    if(leaf) box(solid,x-.045,x+.045,1,.3,z-.015,z+.015,trim,.6)
  }
  for(const d of data.doors) {
    box(solid,d.x0,d.x1,d.height-f,f,d.z-f/2,d.z+f/2,frame,.5)
    // Jambs stay outside the net 2.6m passage.
    for(const x of [d.x0-f/2,d.x1+f/2]) box(solid,x-f/2,x+f/2,0,d.height,d.z-f/2,d.z+f/2,frame,.5)
  }
  const post = layout.walls.gatePost, gate=layout.doors.south
  for(const x of [gate.x0-post.width/2,gate.x1+post.width/2]) box(solid,x-post.width/2,x+post.width/2,0,post.height,gate.z-post.depth/2,gate.z+post.depth/2,post.color,.5)
  const opaque=solid.build(root,'office-plan1-reception-and-gate'), transparent=panes.build(root,'office-plan1-reception-glass')
  transparent.mesh.material.transparent=true; transparent.mesh.material.opacity=data.spec.glassOpacity; transparent.mesh.material.depthWrite=false
  transparent.mesh.material.side=THREE.DoubleSide; transparent.mesh.userData.dynamic=true
  for(const p of data.blockers) {
    const proxy=new THREE.Mesh(new THREE.BoxGeometry(p.x1-p.x0,p.height,p.z1-p.z0),opaque.mesh.material)
    proxy.position.set((p.x0+p.x1)/2,p.height/2,(p.z0+p.z1)/2);proxy.visible=false;proxy.name='office-plan1-reception-collision-'+p.id
    root.add(proxy);collision?.add(proxy,'office3-wall');proxies.push(proxy)
  }
  let disposed=false
  return {data,opaque,transparent,proxies,dispose(){if(disposed)return;disposed=true;for(const p of proxies){collision?.remove?.(p);p.geometry.dispose();p.removeFromParent()}opaque.dispose();transparent.dispose()}}
}
