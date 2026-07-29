/**
 * Admission control for the real-infrastructure integration gates.
 *
 * Build log L-11: a gate that is only *configured* is not a gate. Both integration
 * suites previously opened with `describe.skipIf(!process.env.MONGO_URL)`, which means a
 * CI job that forgets — or mis-spells — the variable reports **green while running
 * nothing**. That is indistinguishable from the gate passing, which is the precise
 * failure mode these gates exist to catch elsewhere in the codebase.
 *
 * `JB_REQUIRE_INTEGRATION=1` (set by the CI step that starts Mongo and Redis) turns a
 * missing URL into a collection-time failure naming the variable. Locally, where there is
 * no infrastructure, the flag is unset and the suite skips — honestly, and visibly.
 */
export function integrationUrl(variable: string): string | null {
  const url = process.env[variable]?.trim();
  if (url) return url;

  if (process.env.JB_REQUIRE_INTEGRATION === '1') {
    throw new Error(
      `${variable} is required when JB_REQUIRE_INTEGRATION=1. ` +
        'This gate is mandatory in CI and must fail rather than skip when its ' +
        'infrastructure is missing (build log L-11).',
    );
  }

  return null;
}

/**
 * Hook budget for suites that dial real infrastructure.
 *
 * Vitest's 10 s default is shorter than a cold container handshake, so a genuine
 * connectivity fault surfaced as a bare "Hook timed out in 10000ms" that named neither
 * the host nor the cause. Pair this with a driver-level server-selection timeout
 * (`SERVER_SELECTION_TIMEOUT_MS`) so the driver's own diagnostic — which names the
 * unreachable host — wins the race and is what the log actually shows (L-16).
 */
export const INTEGRATION_HOOK_TIMEOUT_MS = 30_000;

/** Driver-level server selection budget. Must stay well under the hook budget. */
export const SERVER_SELECTION_TIMEOUT_MS = 5_000;
