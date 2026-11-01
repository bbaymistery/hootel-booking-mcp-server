try {
  process.loadEnvFile?.();
} catch {}

import { getPrismaClient } from '../db/prisma.js';
import { WebhookService } from '../services/webhook.service.js';
import { createExpressApp } from './app.js';
import { seedNeonRooms } from '../../prisma/seed.js';

export async function startHttpServer(port: number = Number(process.env['PORT'] ?? 3001)): Promise<void> {
  const prisma = getPrismaClient();

  const count = await prisma.room.count();
  if (count === 0) {
    console.error('[HTTP API Bootstrap] Seeding initial room catalog...');
    await seedNeonRooms(prisma);
  }

  // Crash recovery sweep for pending outbox events
  const webhookService = new WebhookService(prisma);
  const recovered = await webhookService.recoverPendingEvents();
  if (recovered > 0) {
    console.error(`[HTTP API Bootstrap] Recovered ${recovered} pending outbox events.`);
  }

  const app = createExpressApp({ prisma, webhookService });

  const host = process.env['HOST'] ?? '0.0.0.0';
  app.listen(port, host, () => {
    console.error(`[HTTP API Server] Hotel Booking API listening on http://${host}:${port}`);
    console.error(`[HTTP API Server] Endpoints available:`);
    console.error(` - GET  /api/health`);
    console.error(` - GET  /api/rooms`);
    console.error(` - GET  /api/availability?check_in=...&check_out=...&guests=...`);
    console.error(` - POST /api/bookings`);
    console.error(` - GET  /api/bookings/:id`);
  });
}

// Standalone execution
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startHttpServer().catch((err: unknown) => {
    console.error('[HTTP API Fatal]', err);
    process.exit(1);
  });
}
