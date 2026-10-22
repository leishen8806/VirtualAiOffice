export const ENVELOPE_VERSION = 1
export const EVENT_NAMESPACES = Object.freeze([
  'workspace',
  'project',
  'requirement',
  'task',
  'execution',
  'evidence',
  'approval',
  'meeting',
  'member',
  'artifact',
])
export const EVENT_TYPES = Object.freeze({
  speak: 'execution.activity',
  dispatch: 'task.started',
  report: 'execution.activity',
  celebrate: 'member.celebrated',
  board_decision: 'approval.decided',
  submit_to_board: 'approval.requested',
})

const EVENT_TYPE_RE = /^(workspace|project|requirement|task|execution|evidence|approval|meeting|member|artifact)\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const MAX_PAYLOAD_BYTES = 4096
const REQUIRED = Object.freeze(['v', 'id', 'ts', 'workspaceId', 'type', 'subject', 'payload'])
const PROJECT_NAMESPACES = new Set(['project', 'requirement', 'task', 'execution', 'evidence', 'approval', 'meeting', 'artifact'])
const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+[A-Za-z0-9._~+/=-]{24,}$/i,
  /^sk-[A-Za-z0-9_-]{24,}$/i,
  /^[0-9a-f]{32,}$/i,
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
  /^-----BEGIN [A-Z0-9 ]+-----/,
]
const KNOWN_KEYS = new Set(['v', 'id', 'seq', 'ts', 'workspaceId', 'projectId', 'type', 'subject', 'actor', 'payload'])

function text(value, max = 400) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function byteLength(value) {
  return Buffer.byteLength(String(value), 'utf8')
}

function uuidFromId(value) {
  const hex = value.replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32)
  const chars = hex.split('')
  chars[12] = '5'
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16)
  return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20, 32).join('')}`
}

function hashId(value) {
  let h1 = 2166136261
  let h2 = 2654435761
  for (const char of String(value)) {
    h1 = Math.imul(h1 ^ char.charCodeAt(0), 16777619)
    h2 = Math.imul(h2 ^ char.charCodeAt(0), 2246822519)
  }
  return uuidFromId(`${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}${String(value).length.toString(16)}`)
}

function validIso(value) {
  return typeof value === 'string' && ISO_Z_RE.test(value) && Number.isFinite(Date.parse(value))
}

function scanPayloadValue(value) {
  if (typeof value === 'string') return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value.trim()))
  if (Array.isArray(value)) return value.some(scanPayloadValue)
  if (value && typeof value === 'object') return Object.values(value).some(scanPayloadValue)
  return false
}

function payloadSize(payload) {
  try {
    return byteLength(JSON.stringify(payload))
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function fieldError(field, code) {
  return { field, code }
}

function eventTypeFor(kind) {
  return EVENT_TYPES[kind] || null
}

function subjectKindFor(type) {
  return type.split('.')[0]
}

export function makeEnvelope(input = {}) {
  const record = input.record || input
  const type = input.type || input.event_type || eventTypeFor(record.kind)
  const oldId = record.id || input.id || `${record.kind || 'event'}:${record.at || ''}:${record.ref || ''}`
  const occurred = record.at || input.ts || input.occurred_at
  const envelope = {
    v: ENVELOPE_VERSION,
    id: input.id || input.event_id || hashId(oldId),
    ...(input.seq !== undefined ? { seq: input.seq } : {}),
    ts: occurred,
    workspaceId: input.workspaceId || input.tenant_id || 'zhixu',
    ...(input.projectId || input.project_id ? { projectId: input.projectId || input.project_id } : {}),
    type,
    subject: input.subject || {
      kind: input.entityType || input.entity_type || subjectKindFor(type || 'task.event'),
      id: input.entityId || input.entity_id || record.ref || record.id,
    },
    ...(input.actor || input.actor_type ? { actor: input.actor || { memberId: input.actor_type } } : {}),
    payload: input.payload || {},
  }
  return envelope
}

export function validateEnvelope(envelope, options = {}) {
  const errors = []
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { ok: false, errors: [fieldError('envelope', 'type')] }
  }
  for (const field of REQUIRED) if (envelope[field] === undefined) errors.push(fieldError(field, 'required'))
  if (envelope.v !== ENVELOPE_VERSION) errors.push(fieldError('v', 'unsupported_version'))
  if (typeof envelope.id !== 'string' || !UUID_RE.test(envelope.id)) errors.push(fieldError('id', 'uuid'))
  if (!validIso(envelope.ts)) errors.push(fieldError('ts', 'iso8601_z'))
  if (typeof envelope.workspaceId !== 'string' || !envelope.workspaceId.trim()) errors.push(fieldError('workspaceId', 'string'))
  if (typeof envelope.type !== 'string' || !EVENT_TYPE_RE.test(envelope.type)) errors.push(fieldError('type', 'event_name'))
  const namespace = typeof envelope.type === 'string' ? envelope.type.split('.')[0] : ''
  if (PROJECT_NAMESPACES.has(namespace) && (!envelope.projectId || typeof envelope.projectId !== 'string')) {
    errors.push(fieldError('projectId', 'required_for_namespace'))
  }
  if (!envelope.subject || typeof envelope.subject !== 'object' || typeof envelope.subject.kind !== 'string' || typeof envelope.subject.id !== 'string') {
    errors.push(fieldError('subject', 'kind_and_id'))
  }
  if (envelope.actor !== undefined && (!envelope.actor || typeof envelope.actor !== 'object')) errors.push(fieldError('actor', 'object'))
  if (!envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) errors.push(fieldError('payload', 'object'))
  if (payloadSize(envelope.payload) > (options.maxPayloadBytes || MAX_PAYLOAD_BYTES)) errors.push(fieldError('payload', 'too_large'))
  if (scanPayloadValue(envelope.payload)) errors.push(fieldError('payload', 'suspected_secret'))
  if (envelope.seq !== undefined && (!Number.isInteger(envelope.seq) || envelope.seq < 0)) errors.push(fieldError('seq', 'non_negative_integer'))
  return { ok: errors.length === 0, errors }
}

export function serializeEnvelope(envelope) {
  const check = validateEnvelope(envelope)
  if (!check.ok) return { ok: false, errors: check.errors, text: null }
  const ordered = {
    v: envelope.v,
    id: envelope.id,
    ...(envelope.seq === undefined ? {} : { seq: envelope.seq }),
    ts: envelope.ts,
    workspaceId: envelope.workspaceId,
    ...(envelope.projectId === undefined ? {} : { projectId: envelope.projectId }),
    type: envelope.type,
    subject: envelope.subject,
    ...(envelope.actor === undefined ? {} : { actor: envelope.actor }),
    payload: envelope.payload,
  }
  return { ok: true, errors: [], text: JSON.stringify(ordered) }
}

export function parseEnvelope(input, options = {}) {
  let value
  try {
    if (typeof input === 'string') {
      if (byteLength(input) > (options.maxBytes || 16384)) return { ok: false, errors: [fieldError('envelope', 'too_large')] }
      value = JSON.parse(input)
    } else value = input
  } catch {
    return { ok: false, errors: [fieldError('envelope', 'invalid_json')] }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: [fieldError('envelope', 'type')] }
  const unknownFields = Object.keys(value).filter((key) => !KNOWN_KEYS.has(key))
  const clean = Object.fromEntries(Object.entries(value).filter(([key]) => KNOWN_KEYS.has(key)))
  const validation = validateEnvelope(clean, options)
  return { ...validation, envelope: validation.ok ? clean : null, unknownFields, unknownCount: unknownFields.length }
}

export function fromLedgerEvent(record, { tenantId = 'zhixu', projectId } = {}) {
  if (!record || typeof record !== 'object') return { ok: false, errors: [fieldError('record', 'type')] }
  const type = eventTypeFor(record.kind)
  if (!type) return { ok: false, errors: [fieldError('kind', 'unknown_kind')] }
  const textValue = typeof record.text === 'string' ? record.text : ''
  const payload = {
    legacyId: String(record.id || ''),
    ...(record.ref ? { ref: String(record.ref) } : {}),
    ...(record.to ? { to: String(record.to) } : {}),
    textLength: [...textValue].length,
    hasQuestion: /[?？]/.test(textValue),
  }
  const envelope = makeEnvelope({
    id: hashId(record.id || `${record.kind}:${record.at}:${record.ref || ''}`),
    ts: record.at,
    workspaceId: tenantId,
    projectId: projectId || `legacy-${tenantId}`,
    type,
    subject: { kind: subjectKindFor(type), id: String(record.ref || record.id || '') },
    actor: { memberId: record.from === 'board' ? 'human' : 'agent' },
    payload,
  })
  const validation = validateEnvelope(envelope)
  return validation.ok ? { ok: true, envelope } : { ok: false, errors: validation.errors }
}

export function eventKey(envelope) {
  return envelope && typeof envelope.id === 'string' ? envelope.id : null
}

export function dedupe(list) {
  const unique = []
  const byId = new Map()
  const conflicts = []
  for (const envelope of Array.isArray(list) ? list : []) {
    const key = eventKey(envelope)
    if (!key) continue
    const serialized = JSON.stringify(envelope)
    if (!byId.has(key)) {
      byId.set(key, serialized)
      unique.push(envelope)
    } else if (byId.get(key) !== serialized) {
      conflicts.push({ eventId: key, code: 'CONFLICTING_EVENT' })
    }
  }
  return { unique, conflicts }
}
