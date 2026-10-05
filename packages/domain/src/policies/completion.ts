import type { Evidence, Id, MachineEvidenceKind, QualityProfile } from '../entities.js'

/**
 * What a task must prove before it can be DONE. Built from the project's QualityProfile plus the
 * task's risk level by the orchestration layer.
 */
export interface CompletionPolicy {
  readonly requiredChecks: readonly MachineEvidenceKind[]
  readonly requireAiReview: boolean
  readonly requireHumanApproval: boolean
}

export function completionPolicyFrom(
  quality: QualityProfile,
  options: { requireAiReview: boolean; requireHumanApproval: boolean },
): CompletionPolicy {
  return {
    requiredChecks: [...new Set(quality.checks.map((c) => c.kind))],
    requireAiReview: options.requireAiReview,
    requireHumanApproval: options.requireHumanApproval,
  }
}

/** `failed` = repairable (send back to READY); `needs_human` = nobody can tell, ask a person. */
export type CompletionOutcome = 'passed' | 'failed' | 'needs_human'

declare const completionDecisionBrand: unique symbol

/**
 * The only payload that can move a task from VERIFYING to DONE. The brand means it can only be
 * produced by `evaluateCompletion()` (forging one needs `as unknown as`, which review should reject):
 * an agent saying "done" is not a CompletionDecision.
 */
export interface CompletionDecision {
  readonly outcome: CompletionOutcome
  readonly reasons: readonly string[]
  /** Evidence that supports a `passed` outcome. */
  readonly evidenceIds: readonly Id[]
  readonly commitSha: string | null
  readonly [completionDecisionBrand]: true
}

/**
 * Fail-closed completion rule (ADR-001, Evidence-based Done):
 * - Machine checks count only if produced by the system (`source: 'machine'`) against the same commit.
 * - AI review and human approval evidence must also match the target commit exactly; evidence with no
 *   commit is usable only for non-code tasks (`target.commitSha === null`).
 * - Missing, errored, skipped, stale or unparseable evidence never passes; it needs a human.
 * - A failing check or a rejecting review is repairable (`failed`).
 * - With nothing configured to check, the task is unverified and needs a human.
 */
export function evaluateCompletion(
  policy: CompletionPolicy,
  evidence: readonly Evidence[],
  target: { taskId: Id; commitSha: string | null },
): CompletionDecision {
  const failed: string[] = []
  const unknown: string[] = []
  const supporting: Id[] = []
  const mine = evidence.filter((e) => e.taskId === target.taskId)
  // Evidence produced against another revision is stale. The match is strict for every kind
  // (machine, AI review, human approval): for a code-bearing target, unpinned evidence does not
  // count either, so a review cannot be reused across code revisions. Only a non-code target
  // (commitSha === null) accepts evidence that is not tied to a commit.
  const current = mine.filter((e) => (e.commitSha ?? null) === target.commitSha)

  const nothingRequired = policy.requiredChecks.length === 0 && !policy.requireAiReview && !policy.requireHumanApproval
  if (nothingRequired) unknown.push('no completion evidence is configured for this task, so it is unverified')

  if (policy.requiredChecks.length > 0 && target.commitSha === null) {
    unknown.push('machine checks are required but there is no commit to verify')
  } else {
    for (const kind of policy.requiredChecks) {
      const latest = newest(current.filter((e) => e.kind === kind && e.source === 'machine'))
      judge(kind, latest)
    }
  }
  if (policy.requireAiReview) judge('review', newest(current.filter((e) => e.kind === 'review' && e.source === 'ai')))
  if (policy.requireHumanApproval) {
    judge('approval', newest(current.filter((e) => e.kind === 'approval' && e.source === 'human')))
  }

  const outcome: CompletionOutcome = failed.length ? 'failed' : unknown.length ? 'needs_human' : 'passed'
  const decision = {
    outcome,
    reasons: [...failed, ...unknown],
    evidenceIds: outcome === 'passed' ? supporting : [],
    commitSha: target.commitSha,
  }
  // The only place a CompletionDecision is minted. Even a plain cast is rejected by the compiler.
  return decision as unknown as CompletionDecision

  function judge(label: string, e: Evidence | undefined): void {
    if (!e) unknown.push(`${label}: no evidence`)
    else if (e.status === 'pass') supporting.push(e.id)
    else if (e.status === 'fail') failed.push(`${label}: ${e.summary || 'failed'}`)
    else unknown.push(`${label}: ${e.status}${e.summary ? ` (${e.summary})` : ''}`)
  }
}

function newest(list: readonly Evidence[]): Evidence | undefined {
  let best: Evidence | undefined
  for (const e of list) if (!best || e.createdAt >= best.createdAt) best = e
  return best
}
