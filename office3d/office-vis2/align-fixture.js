import { LAYOUT_V3 } from '../office-layout.js'

export function islandAlignFixture(sofaOuter = 5.8) {
  return { ...LAYOUT_V3, island: { ...LAYOUT_V3.island, barOuter: 3.5, sofaOuter }, bar: { ...LAYOUT_V3.bar, radius: 6 } }
}

// 方案甲 83ecc1b；仅用于独立预览，不登记真实工位或替换主场景布局。
export const WEST_OPEN_FIXTURE = {
  area: { x0: -28, x1: -8.5, z0: -4.5, z1: 5.5 },
  workstations: [
    { name: 'QAAutomation', x: -15, z: -1, radius: 1 }, { name: 'Reviewer1', x: -12, z: -1, radius: 1 },
    { name: 'Reviewer2', x: -15, z: 2, radius: 1 }, { name: 'SecurityReviewer', x: -12, z: 2, radius: 1 },
    { name: 'OpsLead', x: -25, z: -1, radius: 1 }, { name: 'OpsEngineer', x: -21.5, z: -1, radius: 1 },
  ],
  corridors: [{ x0: -18.9, x1: -17.5, z0: -4.5, z1: 5.5 }, { x0: -28, x1: -8.5, z0: 3.8, z1: 5.2 }],
}
