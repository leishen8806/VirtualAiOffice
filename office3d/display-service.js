import { buildDisplayDepartments } from './display-departments.js'
export const buildDisplayService = context => buildDisplayDepartments({ ...context, departments: ['service'] })
