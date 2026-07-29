import { createAuditLogServer } from './server.js';

const port = Number(process.env.PORT ?? 3100);
const app = createAuditLogServer();

await app.listen({ port, host: '0.0.0.0' });
