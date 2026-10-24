import { plazaFlowerArcs } from './plaza.js'
import { planWorkstationIslands } from './align-zones.js'
import { appendOfficeGardenBed } from './plants.js'
import { officeFurnitureV2Spec } from '../office-furniture-v2.js'

// 装饰只占既有桌面、墙面或绿化保留带；不增加席位或改变通行占地。
export function wholeFloorSpec(layout) {
  const details = [], beds = []
  const box = (kind, x, y, z, w, h, d, color, owner) => details.push({ kind, x, y, z, w, h, d, color, owner })
  for (const [id, [, x, z]] of Object.entries(layout.seats)) {
    // 物品留在桌沿，避开中部显示器和键鼠。
    box('desk-tray', x + .51, .795, z - .2, .22, .06, .2, '#596455', id)
    for (let i = 0; i < 3; i++) box('desk-book', x - .51 + i * .045, .88, z - .23, .035, .22 - i * .025, .14, ['#C0AA82', '#71826C', '#E4DDCE'][i], id)
  }
  if (layout.variant === 'align') {
    const furniture = officeFurnitureV2Spec(layout)
    for (const shelf of furniture.shelves) {
      // 原 bookcaseOpen.glb 缩放至1.85m后的层板上表面；避开既有中层书组。
      for (const base of [.277, .781, 1.286]) for (let i = 0; i < Math.floor((shelf.w - .24) / .11); i++) {
        const dx = -shelf.w / 2 + .17 + i * .11, height = .25 + (i % 4) * .025
        if (base === .781 && Math.abs(dx) < shelf.w * .36) continue
        box('shelf-book', shelf.x + dx, base + height / 2, shelf.z + .035, .075 + (i % 2) * .018, height, .29,
          ['#B7C2B4', '#CCB58C', '#E9E1D4', '#826E56', '#58705C'][i % 5], 'kb')
      }
    }
    for (const table of [...furniture.meetings, { ...furniture.board, region: 'board' }]) {
      const y = table.round ? .824 : .767, w = table.round ? 1.2 : table.w, d = table.round ? 1.2 : table.d
      box('meeting-runner', table.x, y, table.z, w * .72, .01, d * .32, '#A6B39E', table.region)
      box('meeting-console', table.x, y + .026, table.z, .19, .04, .13, '#566257', table.region)
      for (const side of [-1, 1]) {
        box('meeting-paper', table.x + side * w * .32, y + .012, table.z + d * .26, .22, .008, .28, '#F4F1EA', table.region)
        box('meeting-folder', table.x + side * w * .32, y + .005, table.z + d * .26, .24, .006, .30, '#C6AF87', table.region)
      }
    }
  }
  for (const room of layout.regions) {
    const middle = (room.x0 + room.x1) / 2, width = room.x1 - room.x0
    const seats = Object.values(layout.seats).filter(([region]) => region === room.id)
    if (layout.variant==='align' && seats.length) {
      for(const group of planWorkstationIslands(layout,room).groups){
        const b=group.groupBounds
        box('desk-group-inlay',(b.x0+b.x1)/2,.145,(b.z0+b.z1)/2,b.x1-b.x0,.003,b.z1-b.z0,'#A99D87',group.id)
        box('desk-group-rug',(b.x0+b.x1)/2,.148,(b.z0+b.z1)/2,b.x1-b.x0-.08,.002,b.z1-b.z0-.08,'#C9CABD',group.id)
      }
    } else if (seats.length > 1) {
      const xs = seats.map(([,x])=>x), zs = seats.map(([,,z])=>z)
      const x0 = Math.min(...xs)-.82, x1 = Math.max(...xs)+.82, z0 = Math.min(...zs)-.5, z1 = Math.max(...zs)+.9
      box('desk-group-inlay', (x0+x1)/2, .091, (z0+z1)/2, x1-x0, .003, z1-z0, '#BEB6A3', room.id)
      box('desk-group-rug', (x0+x1)/2, .094, (z0+z1)/2, x1-x0-.09, .002, z1-z0-.09, '#D0C9B7', room.id)
    }
    // 顶部仅保留边带，俯视下不盖住工位；全部高于人物通行体积。
    if (layout.variant === 'align' && room.walled !== true) continue
    box('ceiling-edge', middle, 3.05, room.z0 + .21, width - .4, .16, .42, '#CDB18A', room.id)
    box('light-recess', middle, 2.955, room.z0 + .21, width - .65, .035, .12, '#F3D8A1', room.id)
    box('ceiling-edge', room.x0 + .2, 3.05, (room.z0 + room.z1) / 2, .4, .16, room.z1 - room.z0 - .45, '#D8BC94', room.id)
    // 竖向木饰面在原墙体厚度内，不把书柜放进椅后路线。
    const panelWidth = Math.min(2.4, width * .28)
    for (let x = room.x0 + .35; x < room.x0 + .35 + panelWidth; x += .13) {
      box('wall-slat', x, 1.42, room.z0 + .07, .065, 2.36, .065, '#B89D77', room.id)
    }
  }
  const b = layout.greenBuffer, w = b.width
  for (let x = b.x0 + 1.4; x < b.x1 - 1; x += 2.4) {
    beds.push({ x, z: b.z0 + w / 2, w: 2.37, d: 1.8, side: 'north' })
    if (x + 1.185 < layout.doors.south.x0 - .5 || x - 1.185 > layout.doors.south.x1 + .5) beds.push({ x, z: b.z1 - w / 2, w: 2.37, d: 1.8, side: 'south' })
  }
  for (let z = b.z0 + w + 1.2; z < b.z1 - w - .5; z += 2.4) {
    beds.push({ x: b.x0 + w / 2, z, w: 1.8, d: 2.37, side: 'west' }, { x: b.x1 - w / 2, z, w: 1.8, d: 2.37, side: 'east' })
  }
  // 弧形花境替代同位置的矩形绿化格，避免两套花槽穿插。
  const arcs = plazaFlowerArcs(layout)
  return { referenceFinish: layout.variant === 'align', details, beds: beds.filter(p => !arcs.some(({ bounds: b }) => p.x + p.w / 2 > b.x0 && p.x - p.w / 2 < b.x1 && p.z + p.d / 2 > b.z0 && p.z - p.d / 2 < b.z1)) }
}

export function appendWholeFloorGarden({ THREE, batch, spec, low = false }) {
  const leaf = (x, y, z, angle, length, color) => {
    const g = new THREE.BufferGeometry(), a = Math.sin(angle), b = Math.cos(angle), width = length * .22
    const points = [0,0,0, a*length*.5+b*width,length*.43,b*length*.5-a*width, a*length,length*.25,b*length, a*length*.5-b*width,length*.43,b*length*.5+a*width]
    // 正反面独立顶点，避免相反法线相消导致叶片发黑。
    g.setAttribute('position',new THREE.Float32BufferAttribute([...points,...points],3));g.setIndex([0,1,2,0,2,3,6,5,4,7,6,4]);g.computeVertexNormals()
    batch.add(g,color,[x,y,z],0,.86)
  }
  for (const [index, bed] of spec.beds.entries()) {
    if (spec.referenceFinish) { appendOfficeGardenBed({ THREE, batch, bed, low, seed: index }); continue }
    batch.add(new THREE.BoxGeometry(bed.w,.11,bed.d),'#B8AE98',[bed.x,.065,bed.z],0,.94)
    batch.add(new THREE.BoxGeometry(bed.w-.12,.025,bed.d-.12),'#554E3C',[bed.x,.13,bed.z],0,1)
    const enhanced = spec.referenceFinish && !low, clumps = low ? 4 : enhanced ? 9 : 6, leaves = low ? 5 : enhanced ? 9 : 7
    for (let i=0;i<clumps;i++) {
      const x=bed.x+((i%3)-1)*bed.w*(enhanced?.2:.24),z=bed.z+(Math.floor(i/3)-(enhanced?1:.5))*bed.d*(enhanced?.2:.4)
      for(let j=0;j<leaves;j++) leaf(x,.15+(i%3)*(enhanced?.06:.035),z,j*2.399+index,(enhanced?.34:.31)+(j%3)*(enhanced?.08:.085),['#36573C','#527046','#6E8553'][j%3])
    }
    // 独立细叶有真实侧厚度与双面法线；不使用透明球冠或整树广告牌。
    if(index%3===0) {
      batch.add(new THREE.CylinderGeometry(.018,.028,.95,5),'#6E624A',[bed.x,.62,bed.z],0,.9)
      for(let j=0;j<(low?7:14);j++)leaf(bed.x,.65+(j%3)*.16,bed.z,j*2.399,.42+(j%2)*.15,j%4?'#3F6045':'#7A8D54')
    }
    if(index%2===0)for(let j=0;j<(low?2:5);j++) {
      const x=bed.x+Math.sin(j*2.4)*.34,z=bed.z+Math.cos(j*2.4)*.3
      batch.add(new THREE.CylinderGeometry(.035,.025,.07,5),'#C2A77D',[x,.48+(j%2)*.08,z],0,.9)
    }
  }
  for(const p of spec.details.filter(p=>p.kind==='desk-tray')) for(let j=0;j<5;j++)leaf(p.x,.83,p.z,j*2.399,.09+(j%2)*.025,j%2?'#49664B':'#71845A')
}
