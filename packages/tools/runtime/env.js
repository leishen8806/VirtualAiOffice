import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
import { fileURLToPath } from 'node:url'

/**
 * 严格环境展开：缺失 `${VAR}` 不做空替换，返回 MissingEnvError。
 * 兼容型的宽松 fillEnv 留在 executors/runtime/text.js（Legacy 仍用它）。
 */
export class MissingEnvError extends Error {
  constructor(name) {
    super(`missing env ${name}`)
    this.name = 'MissingEnvError'
    this.envName = name
  }
}

export function expandEnv(value, env = process.env) {
  if (typeof value !== 'string') return value
  return value.replace(/\$\{(\w+)\}/g, (_, k) => {
    const v = env[k]
    if (v === undefined || v === null) throw new MissingEnvError(k)
    return v
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
