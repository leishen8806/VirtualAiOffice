import fs from 'node:fs'
import path from 'node:path'

export function createGovernanceFileReader({ dir, fsModule = fs }) {
  const cache = new Map()
  return name => {
    const file = path.join(dir, name)
    try {
      const mtimeMs = fsModule.statSync(file).mtimeMs
      const cached = cache.get(name)
      if (cached?.mtimeMs === mtimeMs) return cached.value
      const value = JSON.parse(fsModule.readFileSync(file, 'utf8'))
      cache.set(name, { mtimeMs, value })
      return value
    } catch {
      return {}
    }
  }
}
