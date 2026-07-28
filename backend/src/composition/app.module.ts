import { Module } from '@nestjs/common';

/**
 * The composition root (Plans/07-ARCHITECTURE.md §6, ADR-002). This is the only place
 * a port is bound to an adapter — nothing under core/ or features/ constructs one itself.
 * Empty until P1 wires the first port + adapter pair (T0.18).
 */
@Module({})
export class AppModule {}
