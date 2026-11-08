export { plantFootprintSamples, insidePlantEnvelope } from '../../office-vis2/r1-plant-footprints.js'
import { R1_PLANT_POSITION_OVERRIDES } from '../../office-r1-layout.js'

// Earlier-card invariants still compare every field, after the explicitly approved R3 translation.
export function withApprovedPlantMove(row) {
  const p=R1_PLANT_POSITION_OVERRIDES.find(p=>p.id===row.id||p.id===row.parentId)
  return p?{...row,xM:Number((row.xM+p.to.xM-p.from.xM).toFixed(6)),yM:Number((row.yM+p.to.yM-p.from.yM).toFixed(6))}:row
}
