import { buildCampusShell } from './dr-campus-shell.js'
import { buildCampusRacks } from './dr-campus-racks.js'
import { buildCampusInterior } from './dr-campus-interior.js'
import { buildCampusMotion } from './dr-campus-motion.js'
import { buildCampusShuttle } from './dr-campus-shuttle.js'
import { buildCampusYardDocks } from './dr-campus-yard-docks.js'

export const campusModules = Object.freeze([
  ['shell', (context) => buildCampusShell(context)],
  ['racks', (context) => buildCampusRacks(context)],
  ['interior', (context) => buildCampusInterior(context)],
  ['yard-docks', (context) => buildCampusYardDocks(context)],
  ['motion', (context) => buildCampusMotion(context)],
  ['shuttle', (context) => buildCampusShuttle(context)],
])
