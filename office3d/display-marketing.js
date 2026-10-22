import { buildDisplayDepartments } from './display-departments.js'
export const buildDisplayMarketing = context => buildDisplayDepartments({ ...context, departments: ['marketing'] })
