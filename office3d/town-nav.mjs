export function townNavEnabled(config) {
  return config?.enabled === true
}

export function townNavClientScript(enabled) {
  return `globalThis.__TOWN_NAV__=Object.freeze({enabled:${enabled === true}})\n`
}
