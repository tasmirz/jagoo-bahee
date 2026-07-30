/**
 * One runner for every user-triggered action that can block.
 *
 * ── Why a request that may never return needs its own state machine ─────────────────
 * Offline is the default assumption here, and the screens that matter most are used on the
 * worst links there are. A promise from a node behind a dying uplink does not reject — it
 * hangs. A screen that only tracks `busy` therefore shows a spinner forever, and the person
 * holding the phone cannot tell a slow shelter listing from a dead one. "Renders from cache,
 * shows its staleness honestly, and never blocks on a request that may never return" is the
 * rule; this is the piece that makes the last clause true.
 *
 * So an action has four states, not two: idle, running, **running-and-late**, and settled.
 * `SLOW_AFTER_MS` is when we stop pretending it is normal and hand the decision back to the
 * user — keep waiting, or cancel.
 *
 * ── Cancel is honest about what it can and cannot undo ──────────────────────────────
 * Cancelling aborts the in-flight HTTP request through an `AbortSignal`, which
 * `data/request.ts` already honours on both the direct and Tor paths. It does NOT unmake a
 * signed envelope: once bytes are signed the author has published, and the outbox may still
 * deliver them. Cancel means "stop making me wait", never "that never happened" — anything
 * else would be a client-side approval gate wearing a friendlier name.
 *
 * Argon2id on the Signal and Forum registration paths is synchronous and CPU-bound, so it
 * cannot be interrupted mid-hash. It is deliberately still allowed to time out: telling
 * someone their phone is working hard beats an unexplained frozen screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * When to stop calling it normal.
 *
 * Long enough that an Argon2id solve or a Tor circuit build does not trip it on every run,
 * short enough that nobody stares at a dead spinner. Both of those routinely take several
 * seconds on the low-end Android hardware this has to work on.
 */
export const SLOW_AFTER_MS = 12_000;

export interface AsyncActionState {
  /** An action is in flight. */
  readonly busy: boolean;
  /** What it is doing, in the user's words. '' when idle. */
  readonly label: string;
  /** It has passed `SLOW_AFTER_MS` and the user has not yet said to keep waiting. */
  readonly late: boolean;
  /** How long the current action has been running, ms. 0 when idle. */
  readonly elapsedMs: number;
  /** Last failure, cleared when the next action starts. */
  readonly error: string;
}

export interface AsyncActionRunner extends AsyncActionState {
  /** Run `operation`, showing `label` while it does. Resolves to the result, or null. */
  run<T>(label: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T | null>;
  /** Dismiss the late prompt and let the action continue. */
  keepWaiting(): void;
  /** Abort the in-flight request. See the note on what cancel can and cannot undo. */
  cancel(): void;
  clearError(): void;
}

const IDLE: AsyncActionState = { busy: false, label: '', late: false, elapsedMs: 0, error: '' };

export class ActionCancelled extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'ActionCancelled';
  }
}

export function useAsyncAction(slowAfterMs: number = SLOW_AFTER_MS): AsyncActionRunner {
  const [state, setState] = useState<AsyncActionState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);

  /**
   * Clears BOTH the late timeout and the elapsed ticker.
   *
   * They are tracked together because the case this hook exists for — an operation that
   * never settles — is exactly the case where a `finally` never runs. A ticker cleaned up
   * only on completion would keep firing forever against the one request that hung, which is
   * a battery drain on the device least able to afford it.
   */
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) {
      clearTimeout(timer);
      clearInterval(timer as unknown as ReturnType<typeof setInterval>);
    }
    timers.current = [];
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      // Leaving the screen must not leave a socket open on a link that is already struggling.
      controller.current?.abort();
    };
  }, [clearTimers]);

  const run = useCallback(
    async <T,>(label: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      clearTimers();

      const startedAtMs = Date.now();
      setState({ busy: true, label, late: false, elapsedMs: 0, error: '' });

      // One timer for the late threshold, then a ticking elapsed counter so the prompt can
      // say how long it has actually been rather than just "a while".
      timers.current.push(
        setTimeout(() => {
          if (mounted.current && !active.signal.aborted) {
            setState((current) => (current.busy ? { ...current, late: true } : current));
          }
        }, slowAfterMs),
      );
      timers.current.push(
        setInterval(() => {
          if (mounted.current) {
            setState((current) =>
              current.busy ? { ...current, elapsedMs: Date.now() - startedAtMs } : current,
            );
          }
        }, 1000) as unknown as ReturnType<typeof setTimeout>,
      );

      try {
        const result = await operation(active.signal);
        if (mounted.current && controller.current === active) setState(IDLE);
        return result;
      } catch (error) {
        const cancelled = active.signal.aborted || error instanceof ActionCancelled;
        if (mounted.current && controller.current === active) {
          setState({
            ...IDLE,
            error: cancelled ? '' : error instanceof Error ? error.message : 'Something went wrong.',
          });
        }
        if (cancelled) return null;
        throw error;
      } finally {
        clearTimers();
      }
    },
    [clearTimers, slowAfterMs],
  );

  const keepWaiting = useCallback(() => {
    setState((current) => (current.busy ? { ...current, late: false } : current));
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    clearTimers();
    setState(IDLE);
  }, [clearTimers]);

  const clearError = useCallback(() => setState((current) => ({ ...current, error: '' })), []);

  return { ...state, run, keepWaiting, cancel, clearError };
}
