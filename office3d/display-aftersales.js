import { buildDisplayDepartments } from './display-departments.js'
export const buildDisplayAftersales = context => buildDisplayDepartments({ ...context, departments: ['aftersales'] })
