/**
 * Reverse tunnel through a `TRUSTED` peer (T3.17, TP-16).
 *
 * ── The deployment this exists for ─────────────────────────────────────────────────
 * `Plans/06` §7: "Node behind CGNAT serving clients — not possible directly. Reverse tunnel
 * through a TRUSTED reachable peer." Federation itself never needed this (FD-11: a CGNAT
 * node opens the connections and federates fully in both directions). What CANNOT work is a
 * PHONE reaching that node: the client has no peer relationship and no outbound stream to
 * ride. So a reachable trusted peer accepts client traffic on the unreachable node's behalf
 * and hands it down a connection the unreachable node opened.
 *
 * ── Why long-poll and not a WebSocket ──────────────────────────────────────────────
 * A held-open HTTP request IS the "outbound stream" TP-16 asks for, and it needs no new
 * runtime dependency on the resilience path — the P2 image failed to boot because a
 * transitive dependency was resolved only by hoisting (L-20), and this is the last code path
 * that should acquire one. It also survives the middleboxes a shutdown-era network is full
 * of: an HTTP request that takes 25 seconds to answer is unremarkable, whereas an `Upgrade`
 * is the first thing a filtering proxy refuses.
 *
 * ── This is a last resort, and it is honest about it ───────────────────────────────
 * Every byte of a tunnelled request is visible to the exit node, which is why TP-16 requires
 * the peer to be `TRUSTED` and why the client shows the tunnel in its scope indicator rather
 * than hiding it. Content is still self-authenticating — the exit node cannot forge an
 * envelope, because it cannot sign one — but it can see and drop traffic, so choosing the
 * peer is an operator decision and not an automatic one.
 */

import type { Clock } from '../ports/system.port.js';

export interface TunnelRequest {
  readonly method: string;
  /** Path plus query, relative to the tunnelled node's root. */
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Base64. Absent for a body-less request. */
  readonly body?: string;
}

export interface TunnelJob extends TunnelRequest {
  readonly id: string;
  readonly queuedAtMs: number;
}

export interface TunnelResponse {
  readonly id: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface TunnelSession {
  readonly serverId: string;
  readonly connectedAtMs: number;
  readonly lastPollAtMs: number;
  readonly pending: number;
  readonly served: number;
}

export interface ReverseTunnelDeps {
  readonly clock: Clock;
  /** How long a client waits for the tunnelled node to answer before 504. */
  readonly requestTimeoutMs?: number;
  /** How long a poll is held open before returning empty. */
  readonly pollTimeoutMs?: number;
  /** Bound so an absent node cannot turn the exit node into a memory sink. */
  readonly maxQueued?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_QUEUED = 64;

interface Waiter {
  readonly job: TunnelJob;
  readonly resolve: (response: TunnelResponse) => void;
  readonly timer: NodeJS.Timeout;
}

interface Endpoint {
  readonly connectedAtMs: number;
  lastPollAtMs: number;
  served: number;
  readonly queue: TunnelJob[];
  readonly waiters: Map<string, Waiter>;
  poller: ((job: TunnelJob | null) => void) | null;
  pollTimer: NodeJS.Timeout | null;
}

export class ReverseTunnelExchange {
  private readonly endpoints = new Map<string, Endpoint>();
  private sequence = 0;

  constructor(private readonly deps: ReverseTunnelDeps) {}

  /**
   * Queue a client request for a tunnelled node and wait for its answer.
   *
   * A 504 on timeout rather than a hang: the client is on a phone during an outage, and a
   * request that never returns is the one failure mode `CLAUDE.md` §6 says a screen may never
   * have. The caller learns the node is unreachable and falls back to its cache.
   */
  async exchange(serverId: string, request: TunnelRequest): Promise<TunnelResponse> {
    const endpoint = this.endpoints.get(serverId);
    if (!endpoint) {
      return {
        id: '',
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: encodeBody(JSON.stringify({ error: 'no tunnel is registered for this node' })),
      };
    }
    if (endpoint.waiters.size + endpoint.queue.length >= (this.deps.maxQueued ?? DEFAULT_MAX_QUEUED)) {
      return {
        id: '',
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: encodeBody(JSON.stringify({ error: 'tunnel queue is full' })),
      };
    }

    this.sequence += 1;
    const job: TunnelJob = {
      ...request,
      id: `${this.deps.clock.nowMs()}-${this.sequence}`,
      queuedAtMs: this.deps.clock.nowMs(),
    };

    return new Promise<TunnelResponse>((resolve) => {
      const timer = setTimeout(() => {
        endpoint.waiters.delete(job.id);
        resolve({
          id: job.id,
          status: 504,
          headers: { 'content-type': 'application/json' },
          body: encodeBody(JSON.stringify({ error: 'the tunnelled node did not answer' })),
        });
      }, this.deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
      timer.unref?.();
      endpoint.waiters.set(job.id, { job, resolve, timer });

      // Hand it straight to a waiting poller when there is one; otherwise it waits in the
      // queue for the next poll. Both paths matter: the first is the steady state, the second
      // is the gap between one poll returning and the next arriving.
      const poller = endpoint.poller;
      if (poller) {
        endpoint.poller = null;
        if (endpoint.pollTimer) clearTimeout(endpoint.pollTimer);
        endpoint.pollTimer = null;
        poller(job);
      } else {
        endpoint.queue.push(job);
      }
    });
  }

  /** The tunnelled node's held-open request. Resolves with a job, or null on timeout. */
  async poll(serverId: string): Promise<TunnelJob | null> {
    const endpoint = this.endpoints.get(serverId) ?? this.register(serverId);
    endpoint.lastPollAtMs = this.deps.clock.nowMs();

    const queued = endpoint.queue.shift();
    if (queued) return queued;

    // Only one poller per node. A second concurrent poll displaces the first with an empty
    // answer rather than queueing, because two pollers would race for each job and one of
    // them would always lose a request.
    endpoint.poller?.(null);
    if (endpoint.pollTimer) clearTimeout(endpoint.pollTimer);

    return new Promise<TunnelJob | null>((resolve) => {
      endpoint.poller = resolve;
      const timer = setTimeout(() => {
        if (endpoint.poller === resolve) endpoint.poller = null;
        endpoint.pollTimer = null;
        resolve(null);
      }, this.deps.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS);
      timer.unref?.();
      endpoint.pollTimer = timer;
    });
  }

  /** The tunnelled node's answer. Unknown ids are dropped — the client already timed out. */
  respond(serverId: string, response: TunnelResponse): boolean {
    const endpoint = this.endpoints.get(serverId);
    const waiter = endpoint?.waiters.get(response.id);
    if (!endpoint || !waiter) return false;
    clearTimeout(waiter.timer);
    endpoint.waiters.delete(response.id);
    endpoint.served += 1;
    waiter.resolve(response);
    return true;
  }

  close(serverId: string): void {
    const endpoint = this.endpoints.get(serverId);
    if (!endpoint) return;
    endpoint.poller?.(null);
    if (endpoint.pollTimer) clearTimeout(endpoint.pollTimer);
    for (const waiter of endpoint.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({
        id: waiter.job.id,
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: encodeBody(JSON.stringify({ error: 'the tunnel closed' })),
      });
    }
    this.endpoints.delete(serverId);
  }

  sessions(): readonly TunnelSession[] {
    return [...this.endpoints.entries()].map(([serverId, endpoint]) => ({
      serverId,
      connectedAtMs: endpoint.connectedAtMs,
      lastPollAtMs: endpoint.lastPollAtMs,
      pending: endpoint.waiters.size + endpoint.queue.length,
      served: endpoint.served,
    }));
  }

  private register(serverId: string): Endpoint {
    const endpoint: Endpoint = {
      connectedAtMs: this.deps.clock.nowMs(),
      lastPollAtMs: this.deps.clock.nowMs(),
      served: 0,
      queue: [],
      waiters: new Map(),
      poller: null,
      pollTimer: null,
    };
    this.endpoints.set(serverId, endpoint);
    return endpoint;
  }
}

export function encodeBody(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}
