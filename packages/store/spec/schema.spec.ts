import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DatabaseSync } from 'node:sqlite'
import { EVIDENCE_KINDS, TASK_STATES, REQUIREMENT_STATES, applyTaskEvent } from '@vao/domain'
import type { Task } from '@vao/domain'
import { createEvent, serializeEvent } from '@vao/events'
import { CONNECTION_PRAGMAS, MIGRATIONS, MIGRATIONS_TABLE_SQL, STAGE0_TABLES, pendingMigrations } from '../dist/index.js'

// node:sqlite ships with Node >= 22.5. The schema is driver-neutral; on older Node these tests skip.
const sqlite = await import('node:sqlite').catch(() => null)
const skip = sqlite ? false : 'node:sqlite is not available in this Node version'
const NOW = '2026-10-05T12:00:00.000Z'

function open(): DatabaseSync {
  const db = new sqlite!.DatabaseSync(':memory:')
  for (const p of CONNECTION_PRAGMAS) db.exec(p)
  db.exec(MIGRATIONS_TABLE_SQL)
  const applied = (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map((r) => r.id)
  for (const m of pendingMigrations(applied)) {
    db.exec('BEGIN')
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, NOW)
    db.exec('COMMIT')
  }
  return db
}

function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO workspaces (id, name, created_at) VALUES ('w1', 'Lei 的办公室', '${NOW}');
    INSERT INTO projects (id, workspace_id, name, created_at) VALUES ('p1', 'w1', 'DAEN', '${NOW}');
    INSERT INTO members (id, workspace_id, kind, display_name) VALUES ('owner', 'w1', 'human', 'Lei'), ('agent-1', 'w1', 'agent', '主力工程师');
    INSERT INTO roles (id, workspace_id, name) VALUES ('primary-engineer', 'w1', 'Primary Engineer');
    INSERT INTO requirements (id, project_id, title, raw_text, status, created_by, created_at, updated_at)
      VALUES ('r1', 'p1', '登录页', '做一个登录页', 'PLANNED', 'owner', '${NOW}', '${NOW}');
    INSERT INTO tasks (id, project_id, requirement_id, title, instructions, role_id, risk, status, created_at, updated_at)
      VALUES ('t1', 'p1', 'r1', '登录接口', '实现 POST /login', 'primary-engineer', 'L2', 'PENDING', '${NOW}', '${NOW}');
  `)
}

const insertTask = (db: DatabaseSync, id: string, status: string) =>
  db
    .prepare(`INSERT INTO tasks (id, project_id, requirement_id, title, instructions, role_id, risk, status, created_at, updated_at) VALUES (?, 'p1', 'r1', 'x', 'x', 'primary-engineer', 'L1', ?, ?, ?)`)
    .run(id, status, NOW, NOW)

test('schema: migrations apply once and create the Stage 0 tables', { skip }, () => {
  const db = open()
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{ name: string }>).map((r) => r.name)
  for (const t of STAGE0_TABLES) assert.ok(tables.includes(t), `table ${t}`)
  assert.equal(STAGE0_TABLES.length, 13)
  assert.deepEqual(pendingMigrations(MIGRATIONS.map((m) => m.id)), [], 'nothing left to apply')
  assert.equal((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1)
  db.close()
})

test('schema: allowed statuses come from the domain state machines', { skip }, () => {
  const db = open()
  seed(db)
  TASK_STATES.forEach((s, i) => insertTask(db, `ok-${i}`, s))
  assert.throws(() => insertTask(db, 'bad', 'DOING'), /CHECK constraint failed/)
  const sql = MIGRATIONS[0]!.sql
  for (const s of [...TASK_STATES, ...REQUIREMENT_STATES, ...EVIDENCE_KINDS]) assert.ok(sql.includes(`'${s}'`), s)
  db.close()
})

test('schema: foreign keys and self-dependencies are rejected', { skip }, () => {
  const db = open()
  seed(db)
  assert.throws(
    () => db.prepare(`INSERT INTO tasks (id, project_id, requirement_id, title, instructions, role_id, risk, status, created_at, updated_at) VALUES ('t9', 'p1', 'nope', 'x', 'x', 'primary-engineer', 'L1', 'PENDING', ?, ?)`).run(NOW, NOW),
    /FOREIGN KEY constraint failed/,
  )
  assert.throws(() => db.exec(`INSERT INTO task_deps (task_id, depends_on_id) VALUES ('t1', 't1')`), /CHECK constraint failed/)
  db.close()
})

test('schema: only humans can decide approvals, even if the domain check is bypassed', { skip }, () => {
  const db = open()
  seed(db)
  const insert = db.prepare(
    `INSERT INTO approvals (id, project_id, gate, subject_kind, subject_id, decision, decided_by, decided_by_kind, requested_at, decided_at) VALUES (?, 'p1', 'requirement', 'requirement', 'r1', ?, ?, ?, ?, ?)`,
  )
  insert.run('a-pending', 'pending', null, null, NOW, null)
  insert.run('a-human', 'approved', 'owner', 'human', NOW, NOW)
  assert.throws(() => insert.run('a-agent', 'approved', 'agent-1', 'agent', NOW, NOW), /CHECK constraint failed|decided by a human member/)
  assert.throws(() => insert.run('a-nobody', 'approved', null, null, NOW, NOW), /CHECK constraint failed|decided by a human member/)
  assert.throws(() => db.exec(`UPDATE approvals SET decision = 'approved', decided_by = 'agent-1', decided_by_kind = 'agent', decided_at = '${NOW}' WHERE id = 'a-pending'`), /CHECK constraint failed|decided by a human member/)
  db.close()
})

test('schema: decided_by must be a real human member, not just claim decided_by_kind = human', { skip }, () => {
  const db = open()
  seed(db)
  const insert = db.prepare(
    `INSERT INTO approvals (id, project_id, gate, subject_kind, subject_id, decision, decided_by, decided_by_kind, requested_at, decided_at) VALUES (?, 'p1', 'requirement', 'requirement', 'r1', ?, ?, ?, ?, ?)`,
  )
  // Spoof: an existing agent member, claiming to be human.
  assert.throws(() => insert.run('a-spoof', 'approved', 'agent-1', 'human', NOW, NOW), /decided by a human member/)
  // Non-existent member: also rejected.
  assert.throws(() => insert.run('a-ghost', 'approved', 'ghost', 'human', NOW, NOW), /decided by a human member|FOREIGN KEY/)
  // UPDATE path: a pending approval cannot be decided by the agent with a spoofed kind.
  insert.run('a-pending', 'pending', null, null, NOW, null)
  assert.throws(() => db.exec(`UPDATE approvals SET decision = 'approved', decided_by = 'agent-1', decided_by_kind = 'human', decided_at = '${NOW}' WHERE id = 'a-pending'`), /decided by a human member/)
  // An already-decided approval cannot be re-pointed at the agent either.
  insert.run('a-human', 'approved', 'owner', 'human', NOW, NOW)
  assert.throws(() => db.exec(`UPDATE approvals SET decided_by = 'agent-1' WHERE id = 'a-human'`), /decided by a human member/)
  // The legitimate human path still works, including via UPDATE.
  db.exec(`UPDATE approvals SET decision = 'approved', decided_by = 'owner', decided_by_kind = 'human', decided_at = '${NOW}' WHERE id = 'a-pending'`)
  // A member who has decided approvals cannot be flipped to an agent afterwards.
  assert.throws(() => db.exec(`UPDATE members SET kind = 'agent' WHERE id = 'owner'`), /must stay human/)
  db.close()
})

test('schema: events are append-only with an increasing sequence', { skip }, () => {
  const db = open()
  seed(db)
  const insert = db.prepare(`INSERT INTO events (id, v, ts, workspace_id, project_id, type, subject_kind, subject_id, payload_json) VALUES (?, 1, ?, 'w1', 'p1', 'task.created', 'task', 't1', '{}') RETURNING seq`)
  const s1 = (insert.get('e1', NOW) as { seq: number }).seq
  const s2 = (insert.get('e2', NOW) as { seq: number }).seq
  assert.ok(s2 > s1)
  assert.throws(() => insert.get('e1', NOW), /UNIQUE constraint failed/)
  assert.throws(() => db.exec(`UPDATE events SET type = 'task.completed' WHERE id = 'e1'`), /append-only/)
  assert.throws(() => db.exec(`DELETE FROM events WHERE id = 'e1'`), /append-only/)
  db.close()
})

test('schema: a state change and its event commit together or not at all', { skip }, () => {
  const db = open()
  seed(db)
  const row = db.prepare(`SELECT * FROM tasks WHERE id = 't1'`).get() as Record<string, string>
  const task: Task = {
    id: row.id!, projectId: row.project_id!, requirementId: row.requirement_id!, title: row.title!, instructions: row.instructions!,
    acceptanceCriteria: [], roleId: row.role_id!, risk: 'L2', status: 'PENDING', dependsOn: [], createdAt: NOW, updatedAt: NOW,
  }
  const next = applyTaskEvent(task, { type: 'DEPENDENCIES_MET' }, NOW)
  let n = 0
  const event = createEvent({ type: 'task.transitioned', workspaceId: 'w1', projectId: 'p1', subject: { kind: 'task', id: 't1' }, payload: { from: task.status, to: next.status, event: 'DEPENDENCIES_MET' } }, { newId: () => `evt-${++n}`, now: () => new Date(NOW) })

  const commit = (failAfterStateWrite: boolean) => {
    db.exec('BEGIN')
    try {
      // Compare-and-set on the previous status.
      const changed = db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND status = ?`).run(next.status, NOW, task.id, task.status).changes
      if (changed !== 1) throw new Error('conflict')
      if (failAfterStateWrite) throw new Error('crash between state write and event append')
      const e = JSON.parse(serializeEvent(event)) as { payload: unknown }
      db.prepare(`INSERT INTO events (id, v, ts, workspace_id, project_id, type, subject_kind, subject_id, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(event.id, event.v, event.ts, event.workspaceId, event.projectId ?? null, event.type, event.subject.kind, event.subject.id, JSON.stringify(e.payload))
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
  const status = () => (db.prepare(`SELECT status FROM tasks WHERE id = 't1'`).get() as { status: string }).status
  const events = () => (db.prepare(`SELECT COUNT(*) AS n FROM events`).get() as { n: number }).n

  assert.throws(() => commit(true), /crash/)
  assert.equal(status(), 'PENDING', 'state write rolled back')
  assert.equal(events(), 0, 'no orphan event')
  commit(false)
  assert.equal(status(), 'READY')
  assert.equal(events(), 1)
  assert.throws(() => commit(false), /conflict/, 'a second writer with a stale status loses')
  db.close()
})
