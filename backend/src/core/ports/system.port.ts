/**
 * System ports — the two that make `core/domain` deterministic.
 *
 * `Date.now()` and `Math.random()` are lint-banned inside `core/domain` (AR-02). These are
 * why: injecting them makes the validation pipeline and the path selector unit-testable
 * with no infrastructure and no fake timers, and makes a clock-skew test a matter of
 * passing a number rather than mocking global state.
 */

export abstract class Clock {
  abstract nowMs(): number;
}

export abstract class RandomSource {
  abstract bytes(n: number): Uint8Array;
}
