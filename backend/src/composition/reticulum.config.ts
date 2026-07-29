import type { ReticulumTransport } from '../adapters/outbound/grpc/reticulum-transport.js';

export const RETICULUM_TRANSPORT = Symbol('ReticulumTransport');
export type OptionalReticulumTransport = ReticulumTransport | null;
