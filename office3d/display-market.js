import { buildDisplayDepartments } from './display-departments.js'
export const buildDisplayMarket = context => buildDisplayDepartments({ ...context, departments: ['market'] })
