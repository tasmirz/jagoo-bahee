/**
 * The production `Clock`.
 *
 * This is the ONLY place in the backend that reads wall-clock time. `Date.now()` is
 * lint-banned inside `core/domain` (AR-02) so that every step which depends on time takes
 * it as a parameter and stays deterministic — a clock-skew test becomes passing a number
 * rather than mocking global state.
 */

import { Clock } from '../../core/ports/system.port.js';

export class SystemClock extends Clock {
  nowMs(): number {
    return Date.now();
  }
}
