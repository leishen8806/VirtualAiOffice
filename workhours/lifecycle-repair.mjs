// 仅供 workhours 对本程序暂停且卡在 paused/pausing 的同事做受限修复；不打印连接串。
import fs from 'node:fs'
import { createRequire } from 'node:module'

const pgRequire = createRequire('C:/Users/Administrator/AppData/Local/npm-cache/_npx/43414d9b790239bb/node_modules/x.js')
const terminal = "'succeeded','failed','cancelled','timed_out','interrupted'"
const legacyUnacknowledged = "status = 'cancelled' and process_pid is null and process_group_id is null and runtime_mode = 'legacy' and coalesce(result_json->'executionCancellation'->>'state', '') <> 'acknowledged'"

export async function defaultDbFactory() {
  let Client
  try { ({ Client } = pgRequire('pg')) } catch { return null }
  const bat = fs.readFileSync('C:/Users/Administrator/.paperclip/run_paperclip.bat', 'utf8')
  const url = bat.match(/DATABASE_URL=(\S+)/)?.[1]
  if (!url) return null
  const client = new Client({ connectionString: url })
  await client.connect()
  return client
}

export function createLifecycleRepair({ dbFactory = defaultDbFactory, backupFile, now = () => new Date(), appendFile = fs.appendFileSync } = {}) {
  const stamp = () => now().toISOString()
  return async function repair(agent, { dryRun = false, log = () => {} } = {}) {
    if (dryRun) { log(`演练：将会核对 ${agent.name} 的三项暂停收尾前提，不写数据库、不发恢复`); return { kind: 'dry-run' } }
    let db
    try { db = await dbFactory() } catch { db = null }
    if (!db) { log(`恢复降级：${agent.name} 未找到 pg，仅保留恢复请求`); return { kind: 'pg-missing' } }
    try {
      const id = agent.id
      const [nonterminal, leases, finalizations] = await Promise.all([
        db.query(`select agent_id, id, status, controller_lease_expires_at from heartbeat_runs where agent_id = $1 and (status not in (${terminal}) or controller_lease_expires_at > now())`, [id]),
        db.query(`select l.id, l.status, l.cleanup_status, l.released_at from environment_leases l join heartbeat_runs h on h.id = l.heartbeat_run_id where h.agent_id = $1 and ((l.released_at is null and not (l.status = 'retained' and l.cleanup_status = 'success')) or l.status = 'pending_cleanup' or l.cleanup_status = 'failed')`, [id]),
        db.query(`select run_id from native_run_finalizations where run_id in (select id from heartbeat_runs where agent_id = $1)`, [id]),
      ])
      log(`前提：${agent.name} 未结束运行 ${nonterminal.rows.length}，未释放租约 ${leases.rows.length}，原生收尾 ${finalizations.rows.length}`)
      if (nonterminal.rows.length || leases.rows.length || finalizations.rows.length) {
        const reason = nonterminal.rows.length ? '未结束运行' : leases.rows.length ? '未释放租约' : '收尾记录'
        log(`需人工：${agent.name} 有${reason}`)
        return { kind: 'manual', reason }
      }
      const [runs, hosts] = await Promise.all([
        db.query(`select id, finished_at from heartbeat_runs where agent_id = $1 and ${legacyUnacknowledged} order by created_at`, [id]),
        db.query(`select id, name, lifecycle_version, lifecycle_operation from agents where id = $1 and lifecycle_state = 'pausing' and coalesce((lifecycle_operation->>'hostComplete')::boolean, false) = false`, [id]),
      ])
      if (hosts.rows.length !== 1) { log(`需人工：${agent.name} 生命周期状态已变化`); return { kind: 'changed' } }
      const host = hosts.rows[0]
      await db.query('begin')
      try {
        for (const run of runs.rows) {
          const patch = { executionCancellation: { state: 'acknowledged', acknowledgedAt: (run.finished_at || now()).toISOString() }, lifecycleRepair: { at: stamp(), by: 'workhours', reason: 'legacy cancelled run lacked stop proof; blocked agent pause completion' } }
          const updated = await db.query(`update heartbeat_runs set result_json = coalesce(result_json, '{}'::jsonb) || $2::jsonb where id = $1 and ${legacyUnacknowledged}`, [run.id, JSON.stringify(patch)])
          if (updated.rowCount !== 1) throw new Error(`ack-rowcount:${run.id}`)
        }
        const updatedHost = await db.query(`update agents set lifecycle_operation = lifecycle_operation || '{"hostComplete": true}'::jsonb where id = $1 and lifecycle_state = 'pausing' and lifecycle_version = $2 and coalesce((lifecycle_operation->>'hostComplete')::boolean, false) = false`, [host.id, host.lifecycle_version])
        if (updatedHost.rowCount !== 1) throw new Error(`host-rowcount:${host.id}`)
        appendFile(backupFile, JSON.stringify({ at: stamp(), id: host.id, name: host.name, lifecycle_version: host.lifecycle_version, lifecycle_operation: host.lifecycle_operation }) + '\n')
        await db.query('commit')
      } catch (error) { await db.query('rollback').catch(() => {}); log(`需人工：${agent.name} 修复已回滚（${error.message}）`); return { kind: 'rollback' } }
      log(`补确认：${agent.name} ${runs.rows.length} 条；hostComplete：${agent.name} v${host.lifecycle_version}`)
      return { kind: 'repaired', acknowledgements: runs.rows.length }
    } finally { await db.end?.().catch?.(() => {}) }
  }
}
