// Minimal SQLite schema for Stage 0 (docs/architecture/persistence.md).
//
// - One database file per Workspace, so the events table's global sequence is the workspace sequence.
// - Allowed status values are generated from the domain constants: the schema cannot drift from
//   the state machines.
// - Two invariants are enforced again at the database level (defense in depth): approvals are
//   decided only by real human members (CHECK + triggers against members.kind), and events are append-only.
// - Plain SQL strings, no driver import: the same migrations run on node:sqlite or any SQLite driver.

import {
  EVIDENCE_KINDS,
  EVIDENCE_SOURCES,
  EVIDENCE_STATUSES,
  EXECUTION_STATES,
  REQUIREMENT_STATES,
  TASK_STATES,
} from '@vao/domain'

export interface Migration {
  readonly id: number
  readonly name: string
  readonly sql: string
}

const list = (values: readonly string[]): string => values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')

/** Connection settings every driver must apply right after opening the database. */
export const CONNECTION_PRAGMAS: readonly string[] = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  // WAL suits a desktop app with one writer and SSE readers; ignored for in-memory databases.
  'PRAGMA journal_mode = WAL',
]

const RISK_LEVELS = ['L1', 'L2', 'L3', 'L4'] as const
const EXECUTION_KINDS = ['initial', 'retry', 'repair'] as const
const APPROVAL_GATES = ['requirement', 'delivery', 'task_start', 'task_acceptance', 'task_resume', 'merge'] as const
const APPROVAL_DECISIONS = ['pending', 'approved', 'rejected'] as const

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'stage0_foundation',
    sql: `
CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- executors (with quotas), execution policies and office configuration, as JSON
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  quality_json TEXT NOT NULL DEFAULT '{"checks":[]}',
  created_at   TEXT NOT NULL
);

CREATE TABLE repositories (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL REFERENCES projects(id),
  local_path                TEXT NOT NULL,
  remote_url                TEXT,
  default_branch            TEXT NOT NULL,
  integration_branch_prefix TEXT NOT NULL DEFAULT 'vao/req-'
);

CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind         TEXT NOT NULL CHECK (kind IN ('human', 'agent')),
  display_name TEXT NOT NULL,
  avatar       TEXT
);

CREATE TABLE roles (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  permissions_json    TEXT NOT NULL DEFAULT '[]',
  instructions        TEXT NOT NULL DEFAULT '',
  execution_policy_id TEXT
);

CREATE TABLE role_bindings (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  role_id    TEXT NOT NULL REFERENCES roles(id),
  UNIQUE (project_id, member_id, role_id)
);

CREATE TABLE requirements (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id),
  title             TEXT NOT NULL,
  raw_text          TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN (${list(REQUIREMENT_STATES)})),
  analysis_json     TEXT,
  artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  created_by        TEXT NOT NULL REFERENCES members(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX requirements_project ON requirements(project_id, status);

CREATE TABLE tasks (
  id                       TEXT PRIMARY KEY,
  project_id               TEXT NOT NULL REFERENCES projects(id),
  requirement_id           TEXT NOT NULL REFERENCES requirements(id),
  title                    TEXT NOT NULL,
  instructions             TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  role_id                  TEXT NOT NULL REFERENCES roles(id),
  risk                     TEXT NOT NULL CHECK (risk IN (${list(RISK_LEVELS)})),
  status                   TEXT NOT NULL CHECK (status IN (${list(TASK_STATES)})),
  assignee_id              TEXT REFERENCES members(id),
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE INDEX tasks_project_status ON tasks(project_id, status);
CREATE INDEX tasks_requirement ON tasks(requirement_id);

CREATE TABLE task_deps (
  task_id       TEXT NOT NULL REFERENCES tasks(id),
  depends_on_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

CREATE TABLE executions (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id),
  kind         TEXT NOT NULL CHECK (kind IN (${list(EXECUTION_KINDS)})),
  attempt      INTEGER NOT NULL CHECK (attempt >= 1),
  -- ExecutorConfig id from workspaces.settings_json (adapter-neutral)
  executor_id  TEXT NOT NULL,
  member_id    TEXT NOT NULL REFERENCES members(id),
  status       TEXT NOT NULL CHECK (status IN (${list(EXECUTION_STATES)})),
  workdir      TEXT NOT NULL,
  actual_model TEXT,
  cost_usd     REAL,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  error        TEXT,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  UNIQUE (task_id, attempt)
);
CREATE INDEX executions_running ON executions(status) WHERE status = 'RUNNING';

CREATE TABLE evidence (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  execution_id    TEXT REFERENCES executions(id),
  commit_sha      TEXT,
  kind            TEXT NOT NULL CHECK (kind IN (${list(EVIDENCE_KINDS)})),
  source          TEXT NOT NULL CHECK (source IN (${list(EVIDENCE_SOURCES)})),
  status          TEXT NOT NULL CHECK (status IN (${list(EVIDENCE_STATUSES)})),
  command         TEXT,
  exit_code       INTEGER,
  duration_ms     INTEGER,
  -- artifacts table arrives with Stage 3; until then this is an opaque reference
  log_artifact_id TEXT,
  summary         TEXT NOT NULL DEFAULT '',
  created_by      TEXT REFERENCES members(id),
  created_at      TEXT NOT NULL
);
CREATE INDEX evidence_task ON evidence(task_id, kind, created_at);

CREATE TABLE approvals (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  gate            TEXT NOT NULL CHECK (gate IN (${list(APPROVAL_GATES)})),
  subject_kind    TEXT NOT NULL CHECK (subject_kind IN ('requirement', 'task')),
  subject_id      TEXT NOT NULL,
  decision        TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN (${list(APPROVAL_DECISIONS)})),
  decided_by      TEXT REFERENCES members(id),
  decided_by_kind TEXT,
  comment         TEXT,
  requested_at    TEXT NOT NULL,
  decided_at      TEXT,
  -- Only humans decide approvals; a pending approval has no decider.
  CHECK (
    (decision = 'pending' AND decided_by IS NULL AND decided_by_kind IS NULL AND decided_at IS NULL)
    OR (decision <> 'pending' AND decided_by IS NOT NULL AND decided_by_kind = 'human' AND decided_at IS NOT NULL)
  )
);
CREATE INDEX approvals_subject ON approvals(subject_kind, subject_id);

-- decided_by_kind is only a claim; check it against the real member record (INSERT and UPDATE).
CREATE TRIGGER approvals_decider_is_human_insert BEFORE INSERT ON approvals
WHEN NEW.decision <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM members WHERE id = NEW.decided_by AND kind = 'human')
BEGIN SELECT RAISE(ABORT, 'approvals can only be decided by a human member'); END;
CREATE TRIGGER approvals_decider_is_human_update BEFORE UPDATE ON approvals
WHEN NEW.decision <> 'pending'
  AND NOT EXISTS (SELECT 1 FROM members WHERE id = NEW.decided_by AND kind = 'human')
BEGIN SELECT RAISE(ABORT, 'approvals can only be decided by a human member'); END;
-- A member who decided approvals cannot later be turned into an agent.
CREATE TRIGGER members_human_decider_kind_locked BEFORE UPDATE OF kind ON members
WHEN NEW.kind <> 'human' AND EXISTS (SELECT 1 FROM approvals WHERE decided_by = OLD.id)
BEGIN SELECT RAISE(ABORT, 'a member who decided approvals must stay human'); END;

CREATE TABLE events (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  id              TEXT NOT NULL UNIQUE,
  v               INTEGER NOT NULL,
  ts              TEXT NOT NULL,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id),
  project_id      TEXT REFERENCES projects(id),
  type            TEXT NOT NULL,
  subject_kind    TEXT NOT NULL,
  subject_id      TEXT NOT NULL,
  actor_member_id TEXT,
  payload_json    TEXT NOT NULL
);
CREATE INDEX events_project_seq ON events(project_id, seq);
CREATE INDEX events_subject_seq ON events(subject_kind, subject_id, seq);

CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
`,
  },
]

/** Bookkeeping table created before any migration runs. */
export const MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

export const STAGE0_TABLES = [
  'workspaces',
  'projects',
  'repositories',
  'members',
  'roles',
  'role_bindings',
  'requirements',
  'tasks',
  'task_deps',
  'executions',
  'evidence',
  'approvals',
  'events',
] as const

/**
 * Migrations not yet applied, in order. `appliedIds` comes from `SELECT id FROM schema_migrations`.
 * The driver runs each one in its own transaction together with its bookkeeping insert.
 */
export function pendingMigrations(appliedIds: readonly number[]): readonly Migration[] {
  const done = new Set(appliedIds)
  return MIGRATIONS.filter((m) => !done.has(m.id))
}
