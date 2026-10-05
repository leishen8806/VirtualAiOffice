/** A state machine was asked to apply an event that is not allowed from the current state. */
export class IllegalTransitionError extends Error {
  readonly machine: string
  readonly from: string
  readonly event: string

  constructor(machine: string, from: string, event: string) {
    super(`${machine}: event ${event} is not allowed from state ${from}`)
    this.name = 'IllegalTransitionError'
    this.machine = machine
    this.from = from
    this.event = event
  }
}

/** A transition was allowed by the table but its payload breaks a domain invariant. */
export class InvariantViolationError extends Error {
  readonly rule: string

  constructor(rule: string, message: string) {
    super(`${rule}: ${message}`)
    this.name = 'InvariantViolationError'
    this.rule = rule
  }
}
