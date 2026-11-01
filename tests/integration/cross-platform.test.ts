import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { BookingService } from '../../src/services/booking.service.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';
import { createExpressApp } from '../../src/api/app.js';
import { createHotelBookingMcpServer } from '../../src/server.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('Cross-Platform Integration: REST API to MCP Real-Time Reflection', () => {
  const prisma = getPrismaClient();
  let server: Server;
  let baseUrl: string;
  let mcpClient: Client;

  beforeAll(async () => {
    await seedNeonRooms(prisma);

    // Clean up test bookings for 2029-09 dates
    await prisma.booking.deleteMany({
      where: {
        check_in: { gte: new Date('2029-09-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-09-30T00:00:00.000Z') },
      },
    });

    const receiver = new SimulatedWebhookReceiver();
    const webhookService = new WebhookService(prisma, receiver);
    const availabilityService = new AvailabilityService(prisma);
    const bookingService = new BookingService(prisma, webhookService);

    // 1. Setup Express app sharing the exact same services & DB
    const app = createExpressApp({ prisma, availabilityService, bookingService, webhookService });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });

    // 2. Setup MCP Server sharing the exact same services & DB
    const mcpServer = createHotelBookingMcpServer(prisma, {
      availabilityService,
      bookingService,
      webhookService,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    mcpClient = new Client({ name: 'cross-platform-test-client', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await disconnectPrisma();
  });

  it('proves a booking created via REST API is immediately reflected as unavailable in MCP tool', async () => {
    const checkIn = '2029-09-10';
    const checkOut = '2029-09-15';
    const targetRoomId = 'room_deluxe_101';

    // Step 1: Check initial availability via MCP tool
    const initialMcpRes = await mcpClient.callTool({
      name: 'check_availability',
      arguments: { check_in: checkIn, check_out: checkOut, guests: 2 },
    });

    const initialContent = JSON.parse((initialMcpRes.content as any)[0].text);
    const initiallyAvailable = initialContent.rooms.some((r: any) => r.room_id === targetRoomId);
    expect(initiallyAvailable).toBe(true);

    // Step 2: Book the room via REST API (as a React user would)
    const restBookingRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: targetRoomId,
        customer_name: 'Cross Platform Tester',
        customer_email: 'cross.tester@test.com',
        check_in: checkIn,
        check_out: checkOut,
        guests: 2,
        idempotency_key: 'cross_platform_key_' + Date.now(),
      }),
    });

    expect(restBookingRes.status).toBe(201);
    const bookingData = (await restBookingRes.json()) as { confirmation_status: string; booking_id: string };
    expect(bookingData.confirmation_status).toBe('CONFIRMED');

    // Step 3: Immediately check availability again via MCP tool
    const afterMcpRes = await mcpClient.callTool({
      name: 'check_availability',
      arguments: { check_in: checkIn, check_out: checkOut, guests: 2 },
    });

    const afterContent = JSON.parse((afterMcpRes.content as any)[0].text);
    const stillAvailable = afterContent.rooms.some((r: any) => r.room_id === targetRoomId);

    // It must no longer be available in MCP!
    expect(stillAvailable).toBe(false);
  });
});
