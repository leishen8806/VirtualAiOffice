import type { ExecutorEvent } from '../activity.js'

export function mapLegacyActivity(value: any): ExecutorEvent | null {
  return value?.activity ? { kind: 'activity', at: new Date().toISOString(), activity: value.activity } : null
}
