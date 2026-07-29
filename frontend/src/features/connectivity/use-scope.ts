/**
 * The client's live view of which network it is on (T3.20, TP-20, TG-10).
 *
 * ── The node states its own cadence; the client enforces the ceiling ───────────────
 * TG-10 requires the indicator to update within 30 seconds of a change. The node knows its
 * own probe interval and reports it as `refreshAfterMs`; polling on a client-side guess
 * would let the display be systematically staler than the truth, which is the one thing an
 * always-visible indicator may not be. `scopePollIntervalMs` clamps whatever the node asks
 * for into [5 s, 30 s] — a node asking to be polled less often than TG-10 allows does not
 * get its way.
 *
 * ── Layering ──────────────────────────────────────────────────────────────────────
 * Built on the generic `useNodeDocument` rather than a new hook in `data/`, so
 * `features/connectivity` owns its own wire parsing and `data/` never imports a feature.
 * `OfflineApi` underneath means the last known scope survives the request that fails —
 * which is precisely the moment the answer matters most.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNodeDocument } from '../../data/node';
import {
  MAX_SCOPE_POLL_MS,
  parseScopeStatus,
  scopePollIntervalMs,
  type ScopeStatus,
} from './scope';

export interface ScopeQuery {
  readonly status: ScopeStatus | null;
  /** True when the value on screen came from cache rather than the network (honest staleness). */
  readonly fromCache: boolean;
  readonly isLoading: boolean;
  readonly refetch: () => void;
}

export function useScopeStatus(baseUrl: string | null): ScopeQuery {
  // Starts at TG-10's ceiling and tightens to whatever the node asks for. It never loosens
  // past 30 s, so a misconfigured or hostile node cannot make the indicator lie by omission.
  const [intervalMs, setIntervalMs] = useState(MAX_SCOPE_POLL_MS);

  const query = useNodeDocument<unknown>(baseUrl, '/v1/transport/scope', {
    refetchInterval: intervalMs,
    retry: 0,
  });

  const status = useMemo(
    () => (query.data ? parseScopeStatus(query.data.value) : null),
    [query.data],
  );

  useEffect(() => {
    const next = scopePollIntervalMs(status);
    if (next !== intervalMs) setIntervalMs(next);
  }, [status, intervalMs]);

  return {
    status,
    fromCache: query.data?.source === 'cache',
    isLoading: query.isLoading,
    refetch: () => void query.refetch(),
  };
}
