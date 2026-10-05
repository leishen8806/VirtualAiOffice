import { IllegalTransitionError } from '../errors.js'

/** Every machine event has a discriminating `type`. */
export interface MachineEvent {
  readonly type: string
}

/**
 * One rule: either a fixed target state, or a resolver that inspects the event payload, enforces
 * invariants (by throwing) and returns the target state.
 */
export type Rule<S extends string, E extends MachineEvent> = S | ((event: E) => S)

/** `table[state][eventType]` = rule. A missing entry means the event is illegal in that state. */
export type TransitionTable<S extends string, E extends MachineEvent> = {
  readonly [K in S]: { readonly [T in E['type']]?: Rule<S, Extract<E, { type: T }>> }
}

export interface Machine<S extends string, E extends MachineEvent> {
  readonly name: string
  readonly states: readonly S[]
  /** The only way to compute a next state. Throws IllegalTransitionError or InvariantViolationError. */
  transition(from: S, event: E): S
  /** Whether `eventType` has a rule from `from` (payload invariants are not checked). */
  can(from: S, eventType: E['type']): boolean
  allowedEvents(from: S): ReadonlyArray<E['type']>
  isTerminal(state: S): boolean
}

export function createMachine<S extends string, E extends MachineEvent>(
  name: string,
  states: readonly S[],
  table: TransitionTable<S, E>,
): Machine<S, E> {
  const rowOf = (from: S): Readonly<Record<string, Rule<S, E> | undefined>> => {
    const row = (table as Readonly<Record<string, Readonly<Record<string, Rule<S, E> | undefined>> | undefined>>)[from]
    if (!row) throw new IllegalTransitionError(name, String(from), '(unknown state)')
    return row
  }
  return {
    name,
    states,
    transition(from, event) {
      const rule = rowOf(from)[event.type]
      if (rule === undefined) throw new IllegalTransitionError(name, from, event.type)
      return typeof rule === 'function' ? rule(event) : rule
    },
    can(from, eventType) {
      return rowOf(from)[eventType] !== undefined
    },
    allowedEvents(from) {
      return Object.keys(rowOf(from)) as Array<E['type']>
    },
    isTerminal(state) {
      return Object.keys(rowOf(state)).length === 0
    },
  }
}
