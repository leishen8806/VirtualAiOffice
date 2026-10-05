import type { Approval, ApprovalGate, Evidence, MemberKind, Requirement, Task } from '../dist/index.js'

export const NOW = '2026-10-05T12:00:00.000Z'

export function approval(over: {
  gate: ApprovalGate
  subject: Approval['subject']
  decision?: Approval['decision']
  by?: MemberKind | null
}): Approval {
  const base: Approval = {
    id: `ap-${over.gate}-${over.subject.id}`,
    projectId: 'p1',
    gate: over.gate,
    subject: over.subject,
    decision: over.decision ?? 'approved',
    requestedAt: NOW,
  }
  return over.by === null ? base : { ...base, decidedBy: { memberId: over.by === 'agent' ? 'agent-1' : 'owner', memberKind: over.by ?? 'human' }, decidedAt: NOW }
}

export function requirement(status: Requirement['status'] = 'DRAFT'): Requirement {
  return { id: 'r1', projectId: 'p1', title: '登录页', rawText: '做一个登录页', status, artifactIds: [], createdBy: 'owner', createdAt: NOW, updatedAt: NOW }
}

export function task(status: Task['status'] = 'PENDING'): Task {
  return {
    id: 't1',
    projectId: 'p1',
    requirementId: 'r1',
    title: '登录接口',
    instructions: '实现 POST /login',
    acceptanceCriteria: ['单元测试通过'],
    roleId: 'primary-engineer',
    risk: 'L2',
    status,
    dependsOn: [],
    createdAt: NOW,
    updatedAt: NOW,
  }
}

let n = 0
export function evidence(over: Partial<Evidence> & Pick<Evidence, 'kind' | 'source' | 'status'>): Evidence {
  n++
  return { id: `ev${n}`, taskId: 't1', commitSha: 'abc123', summary: '', createdAt: `2026-10-05T12:00:${String(n).padStart(2, '0')}.000Z`, ...over }
}
