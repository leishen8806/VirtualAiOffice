import { buildCampusShell } from './dr-campus-shell.js'
import { buildCampusRacks } from './dr-campus-racks.js'
import { buildCampusMotion } from './dr-campus-motion.js'
import { buildCampusShuttle } from './dr-campus-shuttle.js'

export const campusModules = Object.freeze([
  ['shell', (context) => buildCampusShell(context)],
  ['racks', (context) => buildCampusRacks(context)],
  ['motion', (context) => buildCampusMotion(context)],
  ['shuttle', (context) => buildCampusShuttle(context)],
])
