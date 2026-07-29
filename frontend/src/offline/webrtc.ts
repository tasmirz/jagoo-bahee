import * as Crypto from 'expo-crypto';
import {
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  MESH_MAX_FRAME_BYTES,
  decodeMeshFrame,
  decodeMeshPairing,
  encodeMeshFrame,
  encodeMeshPairing,
  type MeshFrame,
  type MeshPairing,
} from './mesh';

const base64url = (value: Uint8Array): string =>
  globalThis
    .btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');

async function randomNonce(): Promise<string> {
  return base64url(await Crypto.getRandomBytesAsync(16));
}

function description(value: string): { readonly type: 'offer' | 'answer'; readonly sdp: string } {
  const parsed = JSON.parse(value) as { readonly type?: string; readonly sdp?: string };
  if ((parsed.type !== 'offer' && parsed.type !== 'answer') || !parsed.sdp) {
    throw new Error('invalid WebRTC session description');
  }
  return { type: parsed.type, sdp: parsed.sdp };
}

async function waitForIce(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const listener = () => {
      if (connection.iceGatheringState !== 'complete') return;
      connection.onicegatheringstatechange = null;
      resolve();
    };
    connection.onicegatheringstatechange = listener;
    setTimeout(() => {
      connection.onicegatheringstatechange = null;
      resolve();
    }, 5_000);
  });
}

interface MeshDataChannel {
  readonly readyState: string;
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

/**
 * A host-candidate-only data channel. Offer and answer are carried by QR, so no signalling,
 * STUN, TURN, DNS, or backend is required for devices on the same reachable network.
 */
export class NativeMeshTransport {
  readonly id = 'mesh';
  readonly mtu = MESH_MAX_FRAME_BYTES;
  private readonly connection = new RTCPeerConnection({ iceServers: [] });
  private channel: MeshDataChannel | null = null;
  private listeners = new Set<(frame: MeshFrame) => void>();
  private pairingNonce: string | null = null;

  constructor(readonly peerId: string) {
    this.connection.ondatachannel = ((event: unknown) => {
      this.attach((event as { readonly channel: MeshDataChannel }).channel);
    }) as typeof this.connection.ondatachannel;
  }

  private attach(channel: MeshDataChannel): void {
    this.channel = channel;
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const frame = decodeMeshFrame(event.data);
      this.listeners.forEach((listener) => listener(frame));
    };
  }

  async createOffer(nowMs = Date.now()): Promise<string> {
    this.attach(this.connection.createDataChannel('jagoo-mesh-v1', { ordered: true }));
    const offer = await this.connection.createOffer({});
    await this.connection.setLocalDescription(offer);
    await waitForIce(this.connection);
    const local = this.connection.localDescription;
    if (!local) throw new Error('WebRTC offer was not created');
    this.pairingNonce = await randomNonce();
    return encodeMeshPairing({
      version: 1,
      peerId: this.peerId,
      role: 'offer',
      sessionDescription: JSON.stringify(local.toJSON()),
      nonce: this.pairingNonce,
      expiresAtMs: nowMs + 10 * 60 * 1000,
    });
  }

  async acceptOffer(encoded: string, nowMs = Date.now()): Promise<string> {
    const pairing = decodeMeshPairing(encoded, nowMs);
    if (pairing.role !== 'offer') throw new Error('expected an offer pairing');
    this.pairingNonce = pairing.nonce;
    await this.connection.setRemoteDescription(
      new RTCSessionDescription(description(pairing.sessionDescription)),
    );
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    await waitForIce(this.connection);
    const local = this.connection.localDescription;
    if (!local) throw new Error('WebRTC answer was not created');
    const response: MeshPairing = {
      version: 1,
      peerId: this.peerId,
      role: 'answer',
      sessionDescription: JSON.stringify(local.toJSON()),
      nonce: pairing.nonce,
      expiresAtMs: nowMs + 10 * 60 * 1000,
    };
    return encodeMeshPairing(response);
  }

  async acceptAnswer(encoded: string, nowMs = Date.now()): Promise<void> {
    const pairing = decodeMeshPairing(encoded, nowMs);
    if (pairing.role !== 'answer') throw new Error('expected an answer pairing');
    if (!this.pairingNonce || pairing.nonce !== this.pairingNonce) {
      throw new Error('pairing answer fingerprint does not match the offer');
    }
    await this.connection.setRemoteDescription(
      new RTCSessionDescription(description(pairing.sessionDescription)),
    );
  }

  available(): boolean {
    return this.channel?.readyState === 'open';
  }

  pairingNonceMatches(nonce: string): boolean {
    return Boolean(this.pairingNonce && nonce === this.pairingNonce);
  }

  pairingNonceValue(): string {
    return this.pairingNonce ?? '';
  }

  send(frame: MeshFrame): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('mesh data channel is not open');
    }
    this.channel.send(encodeMeshFrame(frame));
  }

  subscribe(listener: (frame: MeshFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.channel?.close();
    this.connection.close();
  }
}
