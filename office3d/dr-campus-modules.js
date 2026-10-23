import { buildCampusShell, CAMPUS_FINISHED_FLOOR_Y } from './dr-campus-shell.js'
import { buildCampusRacks } from './dr-campus-racks.js'
import { buildCampusMotion } from './dr-campus-motion.js'
import { buildCampusShuttle } from './dr-campus-shuttle.js'
import { buildVis2RackCell } from './dr-vis2-rack-cell.js'

const buildVis2Rack = (context) => {
  const cell = buildVis2RackCell({ ...context, baseY: CAMPUS_FINISHED_FLOOR_Y })
  context.root.userData.vis2RackCell = cell
  return {
    ...cell,
    dispose() {
      cell.dispose()
      if (context.root.userData.vis2RackCell === cell) delete context.root.userData.vis2RackCell
    },
  }
}

export const campusModules = Object.freeze([
  ['shell', (context) => buildCampusShell(context)],
  ['vis2Rack', buildVis2Rack],
  ['racks', (context) => buildCampusRacks({ ...context, replaceRackCell: Boolean(context.root.userData.vis2RackCell) })],
  ['motion', (context) => buildCampusMotion(context)],
  ['shuttle', (context) => buildCampusShuttle(context)],
])
