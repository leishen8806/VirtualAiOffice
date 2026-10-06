import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
import { fileURLToPath } from 'node:url'

/**
 * Stage 1B-A placeholder (metadata only, not strict).
 *
 * Legacy ToolCatalog.spec() uses lenient fillEnv() from executors/runtime/text.js
 * (unset ${VAR} expands to empty to preserve legacy behavior).
 *
 * This module exists to hold the ENV-layer architecture symbols needed by the
 * shared package surface. STRICT ENV-VALIDATION / MissingEnvError FAIL-CLOSED
 * enforcement belongs to Stage 1B-B and is NOT performed here.
 */
export class MissingEnvError extends Error {
  constructor(name) {
    super(`missing env ${name} (Stage 1B-A placeholder — not thrown by Stage 1B-A runtime)`)
    this.name = 'MissingEnvError'
    this.envName = name
  }
}

/**
 * Stage 1B-A variant: LENIENT expansion (same semantics as legacy fillEnv).
 *
 * For Stage 1B-A we deliberately do NOT throw MissingEnvError — legacy code
 * paths (which are the ONLY consumers exercised today) rely on empty-string
 * fallbacks for unset variables. A future Stage 1B-B import will re-import a
 * strict variant here (or replace the implementation) once the new core wires
 * up orchestration-level env validation.
 */
export function expandEnv(value, env = process.env) {
  if (typeof value !== 'string') return value
  return value.replace(/\$\{(\w+)\}/g, (_, k) => {
    const v = env[k]
    return v === undefined || v === null ? '' : String(v)
  })
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function defaultHome() {
  return os.homedir()
}

export { HERE }
