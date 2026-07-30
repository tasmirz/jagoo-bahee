import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads `backend/.env` into `process.env` before the composition root reads it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────
 * The composition root treats `MONGO_URL` as opt-in: unset means the in-memory doubles
 * (app.module.ts, MONGO_RUNTIME). That is correct for tests and the dependency-free
 * `smoke:local` gate, but it also meant a developer who ran `pnpm ops:up` and then
 * `pnpm dev:backend` got a node that reported itself `ready`, served every route, and
 * silently discarded every envelope on restart while Docker Mongo sat idle and empty.
 * A durable-looking node backed by a heap is worse than a node that refuses to start.
 *
 * The default stays in-memory — absent `.env`, nothing here changes behaviour.
 *
 * ── Resolution is anchored to the package, not the cwd ───────────────────────────────
 * `dotenv`'s default resolves against `process.cwd()`. The justfile launches the backend
 * from a detached `cmd.exe` whose cwd is the repository root, not `backend/`, so the
 * default would silently find nothing — reintroducing the exact failure this fixes, but
 * only on Windows and only via `just dev`. `__dirname` is `backend/{src,dist}/composition`
 * under tsx and under `nest build` alike, so `../..` is the package root either way.
 *
 * ── Never overrides a real environment variable ──────────────────────────────────────
 * `override` stays false (dotenv's default). Docker Compose, CI and the two-node
 * federation harness all inject configuration through the real environment; a stray
 * developer `.env` inside a built image must not be able to repoint a node's database.
 */
config({ path: resolve(__dirname, '..', '..', '.env'), quiet: true });
