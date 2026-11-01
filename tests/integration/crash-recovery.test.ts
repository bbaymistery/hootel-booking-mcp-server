import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';
import type { BookingCreatedEvent } from '../../src/models/webhook.model.js';

describe('Outbox Crash Recovery Routine', () => {
  const prisma = getPrismaClient();
  let receiver: SimulatedWebhookReceiver;
  let webhookService: WebhookService;

  beforeAll(async () => {
    await seedNeonRooms(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    receiver = new SimulatedWebhookReceiver();
    webhookService = new WebhookService(prisma, receiver);

    // Clean up crash test events
    await prisma.webhookOutbox.deleteMany({
      where: { id: { in: ['evt_crash_1', 'evt_crash_2'] } },
    });
  });

  afterEach(async () => {
    await prisma.webhookOutbox.deleteMany({
      where: { id: { in: ['evt_crash_1', 'evt_crash_2'] } },
    });
  });

  it('recovers undelivered pending outbox events on server boot', async () => {
    // Seed 2 pending events simulating power cut / process crash right after commit
    const event1: BookingCreatedEvent = {
      id: 'evt_crash_1',
      event_type: 'booking.created',
      payload: {
        booking_id: 'bkg_crash_1',
        idempotency_key: null,
        room_id: 'room_deluxe_101',
        customer_id: 'cust_crash_1',
        check_in: '2029-11-10',
        check_out: '2029-11-14',
        guests: 2,
        currency: 'USD',
        total_price_cents: 88000,
        created_at: new Date().toISOString(),
      },
      delivery_status: 'PENDING',
      retry_count: 0,
      next_retry_at: null,
      last_attempt_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
    };

    const event2: BookingCreatedEvent = {
      id: 'evt_crash_2',
      event_type: 'booking.created',
      payload: {
        booking_id: 'bkg_crash_2',
        idempotency_key: null,
        room_id: 'room_queen_102',
        customer_id: 'cust_crash_2',
        check_in: '2029-11-15',
        check_out: '2029-11-18',
        guests: 3,
        currency: 'USD',
        total_price_cents: 48000,
        created_at: new Date().toISOString(),
      },
      delivery_status: 'PENDING',
      retry_count: 0,
      next_retry_at: null,
      last_attempt_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
    };

    // Check how many pending events exist prior to inserting crash events
    const initialPending = await prisma.webhookOutbox.count({
      where: {
        delivery_status: 'PENDING',
        OR: [
          { next_retry_at: null },
          { next_retry_at: { lte: new Date() } },
        ],
      },
    });

    await webhookService.insertOutboxEvent(event1);
    await webhookService.insertOutboxEvent(event2);

    expect(receiver.getProcessedCount()).toBe(0);

    // Run recovery routine (simulates server startup)
    const recovered = await webhookService.recoverPendingEvents();
    expect(recovered).toBe(initialPending + 2);
    expect(receiver.getProcessedCount()).toBeGreaterThanOrEqual(2);

    // Verify both events in Neon are now DELIVERED
    const row1 = await webhookService.getOutboxEvent('evt_crash_1');
    const row2 = await webhookService.getOutboxEvent('evt_crash_2');

    expect(row1?.delivery_status).toBe('DELIVERED');
    expect(row2?.delivery_status).toBe('DELIVERED');
  });
});
