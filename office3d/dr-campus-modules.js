import { buildCampusVehicleMarkings } from './dr-campus-vehicles.js'
import { buildCampusShell, CAMPUS_FINISHED_FLOOR_Y } from './dr-campus-shell.js'
import { buildCampusRacks } from './dr-campus-racks.js'
import { buildCampusInterior } from './dr-campus-interior.js'
import { buildCampusMotion } from './dr-campus-motion.js'
import { buildCampusShuttle } from './dr-campus-shuttle.js'
import { buildCampusYardDocks } from './dr-campus-yard-docks.js'
import { buildVis2RackCell } from './dr-vis2-rack-cell.js'
import { buildCampusWorkstations } from './dr-campus-workstations.js'
import { buildVis2DispatchSuite } from './dr-vis2-dispatch-suite.js'
import { sharedDemoSnapshotAt } from './dr-demo-snapshot.js'

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

const buildDispatchSuite = (context) => {
  const suite = buildVis2DispatchSuite({ ...context, snapshot: sharedDemoSnapshotAt(0) })
  suite.group.position.y = CAMPUS_FINISHED_FLOOR_Y
  context.root.userData.dispatchSuite = suite
  return {
    ...suite,
    dispose() {
      suite.dispose()
      if (context.root.userData.dispatchSuite === suite) delete context.root.userData.dispatchSuite
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
  ['dispatch-suite', buildDispatchSuite],
  ['interior', (context) => buildCampusInterior({ ...context, replaceDispatch: Boolean(context.root.userData.dispatchSuite) })],
  ['yard-docks', (context) => buildCampusYardDocks(context)],
  ['vehicle-markings', (context) => buildCampusVehicleMarkings(context)],
  ['motion', (context) => buildCampusMotion(context)],
  ['shuttle', (context) => buildCampusShuttle(context)],
])
