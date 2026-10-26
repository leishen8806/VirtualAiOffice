import { buildCampusVehicleMarkings } from './dr-campus-vehicles.js'
import { buildCampusShell, CAMPUS_FINISHED_FLOOR_Y } from './dr-campus-shell.js'
import { buildCampusRacks } from './dr-campus-racks.js'
import { buildCampusInterior } from './dr-campus-interior.js'
import { buildCampusMotion } from './dr-campus-motion.js'
import { buildCampusShuttle } from './dr-campus-shuttle.js'
import { buildCampusYardDocks } from './dr-campus-yard-docks.js'
import { buildVis2RackCell } from './dr-vis2-rack-cell.js'
import { buildCampusWorkstations } from './dr-campus-workstations.js'

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
  ['workstations', (context) => buildCampusWorkstations(context)],
  ['racks', (context) => buildCampusRacks({
    ...context,
    replaceRackCell: Boolean(context.root.userData.vis2RackCell),
    replaceStations: Boolean(context.root.userData.b3Workstations),
  })],
  ['interior', (context) => buildCampusInterior(context)],
  ['yard-docks', (context) => buildCampusYardDocks(context)],
  ['vehicle-markings', (context) => buildCampusVehicleMarkings(context)],
  ['motion', (context) => buildCampusMotion(context)],
  ['shuttle', (context) => buildCampusShuttle(context)],
])
