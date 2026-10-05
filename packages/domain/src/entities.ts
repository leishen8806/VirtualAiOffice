// Core entities of Virtual AI Office.
//
// Design rules (ADR-001):
// - No dependency on UI, model vendors, CLI tools or database implementation.
// - Minimal fields: only what Stage 0 contracts need. Later stages add fields, not concepts.
// - Status fields are readonly. They change only through the state machines in ./state-machines.

export type Id = string
/** ISO-8601 timestamp, e.g. `2026-10-05T13:00:00.000Z`. */
export type Timestamp = string

// ---- Workspace ------------------------------------------------------------------------------

/**
 * One AI + human office. Owns everything that is shared across projects: executor configuration
 * and quotas (subscription limits are per account, not per project), the role catalog, execution
 * policies and office configuration.
 */
export interface Workspace {
  readonly id: Id
  readonly name: string
  readonly executors: readonly ExecutorConfig[]
  readonly executionPolicies: readonly ExecutionPolicy[]
  readonly office: OfficeConfig
  readonly createdAt: Timestamp
}

/**
 * A configured executor instance. `adapter` names an adapter implementation (opaque string);
 * the domain never interprets it, so no vendor appears in domain logic.
 */
export interface ExecutorConfig {
  readonly id: Id
  readonly adapter: string
  readonly displayName: string
  /** Workspace-wide concurrency quota for this executor. */
  readonly maxConcurrency: number
  readonly enabled: boolean
  /** Adapter-specific settings. Secrets are referenced by name, never stored inline. */
  readonly settings: Readonly<Record<string, unknown>>
}

export interface OfficeConfig {
  readonly renderer: string
  readonly skin?: string
}

// ---- Project / Repository -------------------------------------------------------------------

/** Owns requirements, decisions, artifacts, tasks, approvals and quality configuration. */
export interface Project {
  readonly id: Id
  readonly workspaceId: Id
  readonly name: string
  readonly status: 'active' | 'archived'
  readonly quality: QualityProfile
  readonly createdAt: Timestamp
}

/** The machine checks a task in this project must pass. Confirmed by a human at Gate 1. */
export interface QualityProfile {
  readonly checks: readonly QualityCheck[]
}

export interface QualityCheck {
  readonly kind: MachineEvidenceKind
  readonly command: string
}

/** Source-control location of a project. */
export interface Repository {
  readonly id: Id
  readonly projectId: Id
  readonly localPath: string
  readonly remoteUrl?: string
  readonly defaultBranch: string
  /** Prefix for per-requirement integration branches, e.g. `vao/req-`. */
  readonly integrationBranchPrefix: string
}

// ---- Members and roles ----------------------------------------------------------------------

export type MemberKind = 'human' | 'agent'

/** One abstraction for humans and agents: tasks, activity and approvals all point at a Member. */
export interface Member {
  readonly id: Id
  readonly workspaceId: Id
  readonly kind: MemberKind
  readonly displayName: string
  readonly avatar?: string
}

export type Permission = 'analyze' | 'plan' | 'execute' | 'review' | 'approve' | 'administer'

/**
 * A responsibility, never a model. "Architect" is a Role; which executor performs it is decided by
 * an ExecutionPolicy. Roles carry no vendor or model field on purpose.
 */
export interface Role {
  readonly id: Id
  readonly workspaceId: Id
  readonly name: string
  readonly description: string
  readonly permissions: readonly Permission[]
  /** Standing instructions for agent members holding this role (from skills/*.md). */
  readonly instructions: string
  readonly executionPolicyId?: Id
}

/** Member x Project x Role. A person can be Owner in one project and Reviewer in another. */
export interface RoleBinding {
  readonly id: Id
  readonly projectId: Id
  readonly memberId: Id
  readonly roleId: Id
}

export type RiskLevel = 'L1' | 'L2' | 'L3' | 'L4'

/** Role -> ExecutionPolicy -> executor candidates. Data, not code. */
export interface ExecutionPolicy {
  readonly id: Id
  readonly roleId: Id
  readonly rules: readonly ExecutionRule[]
}

export interface ExecutionRule {
  readonly risk: RiskLevel
  /** Ordered ExecutorConfig ids; later entries are escalation targets. */
  readonly candidates: readonly Id[]
  /** Failed attempts on one executor before moving to the next candidate. */
  readonly escalateAfterFailures: number
  /** Total attempts before the task is given up (Task -> FAILED). */
  readonly maxAttempts: number
  readonly budgetUsd?: number
}

// ---- Requirements, decisions, artifacts ------------------------------------------------------

export const REQUIREMENT_STATES = ['DRAFT', 'ANALYZING', 'WAITING_APPROVAL', 'APPROVED', 'PLANNED', 'DELIVERED'] as const
export type RequirementState = (typeof REQUIREMENT_STATES)[number]

export interface Requirement {
  readonly id: Id
  readonly projectId: Id
  readonly title: string
  /** What the human actually wrote. Never overwritten by analysis. */
  readonly rawText: string
  readonly status: RequirementState
  readonly analysis?: RequirementAnalysis
  readonly artifactIds: readonly Id[]
  readonly createdBy: Id
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

/** Structured output of requirement analysis, reviewed by a human at Gate 1. */
export interface RequirementAnalysis {
  readonly goal: string
  readonly scenarios: readonly string[]
  readonly scope: readonly string[]
  readonly nonScope: readonly string[]
  readonly businessRules: readonly string[]
  readonly risks: readonly string[]
  readonly openQuestions: readonly string[]
  readonly acceptanceCriteria: readonly string[]
}

export interface Decision {
  readonly id: Id
  readonly projectId: Id
  readonly title: string
  readonly body: string
  readonly source: 'meeting' | 'approval' | 'member'
  readonly requirementId?: Id
  readonly createdAt: Timestamp
}

/** Original files, extracted content and AI interpretations are separate layers of one concept. */
export type ArtifactLayer = 'original' | 'extracted' | 'interpretation'

export interface Artifact {
  readonly id: Id
  readonly projectId: Id
  readonly layer: ArtifactLayer
  /** The artifact this one was derived from (extracted/interpretation layers). */
  readonly parentId?: Id
  readonly name: string
  readonly mime: string
  readonly sha256?: string
  readonly sizeBytes?: number
  readonly producedBy?: { readonly kind: 'member' | 'extractor' | 'model'; readonly id: string; readonly version?: string }
  readonly createdAt: Timestamp
}

// ---- Tasks, executions, evidence --------------------------------------------------------------

export const TASK_STATES = ['PENDING', 'READY', 'RUNNING', 'VERIFYING', 'WAITING_HUMAN', 'BLOCKED', 'DONE', 'FAILED', 'CANCELLED'] as const
export type TaskState = (typeof TASK_STATES)[number]

/** Work that must be completed. A task is NOT an attempt: retries and repairs are Executions. */
export interface Task {
  readonly id: Id
  readonly projectId: Id
  readonly requirementId: Id
  readonly title: string
  readonly instructions: string
  readonly acceptanceCriteria: readonly string[]
  /** The responsibility needed, not the executor. */
  readonly roleId: Id
  readonly risk: RiskLevel
  readonly status: TaskState
  readonly dependsOn: readonly Id[]
  readonly assigneeId?: Id
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export const EXECUTION_STATES = ['RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED'] as const
export type ExecutionState = (typeof EXECUTION_STATES)[number]
export type ExecutionKind = 'initial' | 'retry' | 'repair'

/** One attempt to perform a Task. */
export interface Execution {
  readonly id: Id
  readonly taskId: Id
  readonly kind: ExecutionKind
  /** 1-based attempt number within the task. */
  readonly attempt: number
  /** ExecutorConfig id chosen by the execution policy. */
  readonly executorId: Id
  /** Member performing the attempt (agent or human). */
  readonly memberId: Id
  readonly status: ExecutionState
  readonly workdir: string
  /** Model actually used, as reported by the executor (may differ from the requested one). */
  readonly actualModel?: string
  readonly costUsd?: number
  readonly tokensIn?: number
  readonly tokensOut?: number
  readonly error?: string
  readonly startedAt: Timestamp
  readonly endedAt?: Timestamp
}

export const MACHINE_EVIDENCE_KINDS = ['build', 'lint', 'typecheck', 'unit_test', 'integration_test', 'e2e_test'] as const
export type MachineEvidenceKind = (typeof MACHINE_EVIDENCE_KINDS)[number]
export type EvidenceKind = MachineEvidenceKind | 'diff' | 'review' | 'approval'
export const EVIDENCE_KINDS: readonly EvidenceKind[] = [...MACHINE_EVIDENCE_KINDS, 'diff', 'review', 'approval']

/** Who produced the evidence. Only `machine` evidence counts for machine checks. */
export type EvidenceSource = 'machine' | 'ai' | 'human'
export const EVIDENCE_SOURCES: readonly EvidenceSource[] = ['machine', 'ai', 'human']
export type EvidenceStatus = 'pass' | 'fail' | 'error' | 'skipped'
export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = ['pass', 'fail', 'error', 'skipped']

/** Proof (or disproof) of completion. */
export interface Evidence {
  readonly id: Id
  readonly taskId: Id
  readonly executionId?: Id
  /** The commit the evidence was produced against. Machine evidence without it does not count. */
  readonly commitSha?: string
  readonly kind: EvidenceKind
  readonly source: EvidenceSource
  readonly status: EvidenceStatus
  readonly command?: string
  readonly exitCode?: number
  readonly durationMs?: number
  readonly logArtifactId?: Id
  readonly summary: string
  readonly createdBy?: Id
  readonly createdAt: Timestamp
}

// ---- Approvals ------------------------------------------------------------------------------

export type ApprovalGate = 'requirement' | 'delivery' | 'task_start' | 'task_acceptance' | 'task_resume' | 'merge'
export type ApprovalDecision = 'pending' | 'approved' | 'rejected'

/** A human decision. Agents can request approvals but never decide them. */
export interface Approval {
  readonly id: Id
  readonly projectId: Id
  readonly gate: ApprovalGate
  readonly subject: { readonly kind: 'requirement' | 'task'; readonly id: Id }
  readonly decision: ApprovalDecision
  /** Snapshot of who decided and what kind of member they were at decision time. */
  readonly decidedBy?: { readonly memberId: Id; readonly memberKind: MemberKind }
  readonly comment?: string
  readonly requestedAt: Timestamp
  readonly decidedAt?: Timestamp
}
