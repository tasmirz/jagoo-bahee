/**
 * Peer-to-peer messaging over the local network, with no server and no pairing step.
 *
 * ── What this adds, and what was already here ──────────────────────────────────────
 * `mesh.ts` already implements the whole protocol: frames, envelope verification against the
 * signature, content-ID dedupe, hop limits, TTL, per-peer quotas and the store-and-forward
 * log. `webrtc.ts` already carries those frames between two devices. The only thing missing
 * was finding the other device: pairing meant pointing a camera at another phone's QR code to
 * swap a WebRTC offer, which works for two people standing together and does not scale to a
 * room.
 *
 * `modules/jagoo-lan` advertises `_jagoo._tcp` over mDNS and moves opaque strings over TCP.
 * This file is the join: it drives the existing protocol over that pipe. Nothing about the
 * rules lives here or in the native module — a peer's bytes are still verified by
 * `MeshRouter`, which is pure TypeScript with tests.
 *
 * ── Trust is unchanged, which is the point ─────────────────────────────────────────
 * Discovery is not authentication. Anyone on the Wi-Fi can advertise this service and claim
 * any name, so a peer is nothing but a socket to send bytes at. Every envelope that arrives
 * re-runs signature verification and the content ID is recomputed from the bytes
 * (`verifyMeshEnvelope`), exactly as it does over Reticulum or a QR pack. What a peer can do
 * by lying about who they are is waste our quota.
 */

import JagooLan, { type LanPeer } from '../../modules/jagoo-lan';
import { verifyCachedMeshCertificate } from './certificate-cache';
import {
  MeshRouter,
  MeshStore,
  decodeMeshFrame,
  encodeMeshFrame,
  meshEnvelopeFrame,
  type MeshFrame,
} from './mesh';
import { envelopeBytes, listOutbox } from './outbox';
import { projectLocalSignalEnvelope, sealSignalPrekeyEnvelope } from '../signer/signal';

export interface LanState {
  readonly available: boolean;
  readonly running: boolean;
  readonly name: string;
  readonly peers: readonly LanPeer[];
}

/** Mesh frames carry envelopes base64url-encoded; `mesh.ts` keeps its own copy private. */
const unbase64url = (value: string): Uint8Array => {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0));
};

const store = new MeshStore();
const router = new MeshRouter(store, verifyCachedMeshCertificate);

let peers: readonly LanPeer[] = [];
let running = false;
let localName = '';
let listeners: { remove: () => void }[] = [];
const watchers = new Set<(state: LanState) => void>();

function publish(): void {
  const state = snapshotLan();
  watchers.forEach((watcher) => watcher(state));
}

export function snapshotLan(): LanState {
  return { available: JagooLan !== null, running, name: localName, peers };
}

export function watchLan(watcher: (state: LanState) => void): () => void {
  watchers.add(watcher);
  watcher(snapshotLan());
  return () => watchers.delete(watcher);
}

async function sendFrame(peer: LanPeer, frame: MeshFrame): Promise<void> {
  if (!JagooLan) return;
  // A peer that has walked out of range is the ordinary case, not an error to report.
  await JagooLan.send(peer.host, peer.port, encodeMeshFrame(frame)).catch(() => false);
}

/**
 * Everything this device holds that a peer might not.
 *
 * Both the store-and-forward log AND the outbox: an envelope that cannot reach the node is
 * exactly the one a nearby peer should be offered, and it is the whole reason to carry it by
 * hand. Queued envelopes are already signed and final, so handing them to a peer needs no
 * further consent — their content ID cannot change.
 */
async function offerable(): Promise<readonly MeshFrame[]> {
  const stored = await store.list();
  /*
    Our own prekey bundle leads, always.

    Opening a FIRST conversation needs the other side's bundle, and it was only obtainable
    from a node — so two phones that had never met one together could not start talking, in
    the exact situation the mesh exists for. Offering ours to every peer makes first contact
    symmetric: after one exchange, either device can open a session with the other and no node
    has been involved.

    It leads the list because it is the precondition for everything after it, and it is
    re-sealed each time rather than stored: a bundle carries an expiry and one-time prekeys,
    and handing out a stale one produces a session the recipient cannot open.
  */
  const prekeyFrames: MeshFrame[] = [];
  try {
    const prekey = await sealSignalPrekeyEnvelope();
    prekeyFrames.push(meshEnvelopeFrame(prekey.wireBytes, prekey.contentId));
  } catch {
    // The Signal vault is locked. Everything else this device holds is still offerable.
  }
  const frames: MeshFrame[] = stored.map((row) => ({
    version: 1,
    kind: 'envelope',
    contentId: row.contentId,
    envelope: row.envelope,
    originAtMs: row.originAtMs,
    expiresAtMs: row.expiresAtMs,
    hops: row.hops,
  }));
  const known = new Set(stored.map((row) => row.contentId));
  for (const record of await listOutbox()) {
    if (known.has(record.contentId)) continue;
    frames.push(meshEnvelopeFrame(envelopeBytes(record), record.contentId, record.queuedAtMs));
  }
  return [...prekeyFrames, ...frames];
}

/** Hand a peer everything it may be missing. Dedupe on their side makes repetition cheap. */
export async function syncWithPeer(peer: LanPeer): Promise<number> {
  const frames = await offerable();
  for (const frame of frames) await sendFrame(peer, frame);
  return frames.length;
}

async function onFrame(payload: string, fromHost: string): Promise<void> {
  let frame: MeshFrame;
  try {
    frame = decodeMeshFrame(payload);
  } catch {
    return; // Not our protocol, or malformed. Silence is the correct answer to both.
  }
  if (frame.kind !== 'envelope') return;
  const peer = peers.find((item) => item.host === fromHost);
  const { ack, relay } = await router.receive(peer?.id ?? fromHost, frame);

  /*
    Project it locally — this is what makes a message ARRIVE with no node.

    `MeshRouter` verified and stored it; storing is not delivery. The inbox used to be read
    from `/v1/signal/me/messages`, so an envelope could reach the recipient's phone and never
    be seen, because the node was doing the projection and during a shutdown there is no node.
    `projectLocalSignalEnvelope` decrypts it if it was sealed to this device and writes it
    into the same local history the thread already renders from.

    Only for envelopes newly stored: a duplicate has already been delivered, and re-projecting
    would be work for nothing. Anything not addressed here simply fails to open and is relayed
    onward unread, which is the whole point of a store-and-forward mesh.
  */
  if (ack.status === 'stored') {
    await projectLocalSignalEnvelope(unbase64url(frame.envelope)).catch(() => false);
  }
  // Relay onward to everyone else. `MeshRouter` returns null for a duplicate, so a frame
  // stops the first time it reaches a device that already had it — that is what terminates
  // the flood, not a counter.
  if (!relay) return;
  await Promise.all(
    peers.filter((item) => item.host !== fromHost).map((item) => sendFrame(item, relay)),
  );
}

/**
 * Start advertising and listening.
 *
 * `displayName` is broadcast in the clear to everyone on the segment, so it must never be an
 * identity — the caller passes something a human recognises, like a first name or a room.
 */
export async function startLan(displayName: string): Promise<LanState> {
  if (!JagooLan) return snapshotLan();
  if (running) return snapshotLan();
  const started = await JagooLan.start(displayName);
  localName = started.name;
  running = true;
  listeners = [
    JagooLan.addListener('onPeers', (event) => {
      const previous = new Set(peers.map((item) => item.id));
      peers = event.peers;
      publish();
      // A peer that has just appeared gets everything we are holding, immediately. Waiting
      // for a poll is what makes a mesh feel broken when someone walks into the room.
      peers
        .filter((item) => !previous.has(item.id))
        .forEach((item) => void syncWithPeer(item).catch(() => undefined));
    }),
    JagooLan.addListener('onFrame', (event) => {
      void onFrame(event.payload, event.from).catch(() => undefined);
    }),
  ];
  publish();
  return snapshotLan();
}

export async function stopLan(): Promise<void> {
  listeners.forEach((listener) => listener.remove());
  listeners = [];
  if (JagooLan) await JagooLan.stop().catch(() => undefined);
  running = false;
  peers = [];
  publish();
}

/** Push to every peer at once — used when this device has just queued something new. */
export async function broadcastToLan(): Promise<number> {
  if (!running || peers.length === 0) return 0;
  const results = await Promise.all(peers.map((peer) => syncWithPeer(peer).catch(() => 0)));
  return results.reduce((total, count) => total + count, 0);
}
