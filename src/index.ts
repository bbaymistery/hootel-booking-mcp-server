import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getPrismaClient } from './db/prisma.js';
import { WebhookService } from './services/webhook.service.js';
import { createHotelBookingMcpServer } from './server.js';
import { seedNeonRooms } from '../prisma/seed.js';

export async function main(): Promise<void> {
  const prisma = getPrismaClient();

  // Seed default rooms if table is empty
  const roomCount = await prisma.room.count();
  if (roomCount === 0) {
    console.error('[Bootstrap] No rooms detected. Seeding initial rooms catalog...');
    await seedNeonRooms(prisma);
  }

  // Crash recovery: resume undelivered outbox events on server startup
  const webhookService = new WebhookService(prisma);
  const recoveredCount = await webhookService.recoverPendingEvents();
  if (recoveredCount > 0) {
    console.error(`[Bootstrap] Recovered and dispatched ${recoveredCount} pending webhook events.`);
  }

  // Create MCP Server instance
  const server = createHotelBookingMcpServer(prisma, { webhookService });

  // Connect to stdio transport (stdout is strictly reserved for JSON-RPC 2.0 messages)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[MCP Server] Hotel Booking MCP Server active and listening on stdio.');
  console.error('[MCP Server] Available tools: check_availability, book_room.');
}

// Start application
main().catch((error: unknown) => {
  console.error('[Fatal Bootstrap Error]', error);
  process.exit(1);
});
