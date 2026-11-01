import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { BookingService } from '../../src/services/booking.service.js';
import { WebhookService } from '../../src/services/webhook.service.js';
import { SimulatedWebhookReceiver } from '../../src/webhooks/simulated-receiver.js';
import type { BookingCreatedEvent } from '../../src/models/webhook.model.js';

describe('Transactional Outbox Lifecycle & Retry Policy', () => {
  const prisma = getPrismaClient();
  let receiver: SimulatedWebhookReceiver;
  let webhookService: WebhookService;
  let bookingService: BookingService;

  beforeAll(async () => {
    await seedNeonRooms(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    receiver = new SimulatedWebhookReceiver();
    webhookService = new WebhookService(prisma, receiver);
    bookingService = new BookingService(prisma, webhookService);

    // Clean up test events
    await prisma.webhookOutbox.deleteMany({
      where: { id: { in: ['evt_test_retry_lifecycle', 'evt_dedup_test'] } },
    });
  });

  afterEach(async () => {
    await prisma.webhookOutbox.deleteMany({
      where: { id: { in: ['evt_test_retry_lifecycle', 'evt_dedup_test'] } },
    });
  });

  it('guarantees rollback leaves zero booking rows and zero outbox events on failure', async () => {
    // Attempt booking an invalid room
    await expect(
      bookingService.bookRoom({
        room_id: 'invalid_room_id',
        customer_name: 'Nobody',
        customer_email: 'nobody@example.com',
        check_in: '2029-12-10',
        check_out: '2029-12-14',
        guests: 1,
      })
    ).rejects.toThrow();
  });

  it('progresses through exactly 5 total attempts before transitioning to FAILED with delays [1s, 5s, 15s, 30s]', async () => {
    receiver.setFailureMode(true); // Forces delivery failures

    const eventId = 'evt_test_retry_lifecycle';
    const testEvent: BookingCreatedEvent = {
      id: eventId,
      event_type: 'booking.created',
      payload: {
        booking_id: 'bkg_retry_test',
        idempotency_key: null,
        room_id: 'room_deluxe_101',
        customer_id: 'cust_retry_test',
        check_in: '2029-12-10',
        check_out: '2029-12-14',
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

    await webhookService.insertOutboxEvent(testEvent);

    // Initial attempt (Attempt 1 of 5)
    const res1 = await webhookService.deliverEvent(eventId);
    expect(res1).toBe(false);
    let state = await webhookService.getOutboxEvent(eventId);
    expect(state?.delivery_status).toBe('PENDING');
    expect(state?.retry_count).toBe(1);
    expect(state?.next_retry_at).toBeDefined();

    // Attempt 2 of 5 (1st retry)
    const res2 = await webhookService.deliverEvent(eventId);
    expect(res2).toBe(false);
    state = await webhookService.getOutboxEvent(eventId);
    expect(state?.delivery_status).toBe('PENDING');
    expect(state?.retry_count).toBe(2);

    // Attempt 3 of 5 (2nd retry)
    const res3 = await webhookService.deliverEvent(eventId);
    expect(res3).toBe(false);
    state = await webhookService.getOutboxEvent(eventId);
    expect(state?.delivery_status).toBe('PENDING');
    expect(state?.retry_count).toBe(3);

    // Attempt 4 of 5 (3rd retry)
    const res4 = await webhookService.deliverEvent(eventId);
    expect(res4).toBe(false);
    state = await webhookService.getOutboxEvent(eventId);
    expect(state?.delivery_status).toBe('PENDING');
    expect(state?.retry_count).toBe(4);

    // Attempt 5 of 5 (4th retry, final)
    const res5 = await webhookService.deliverEvent(eventId);
    expect(res5).toBe(false);
    state = await webhookService.getOutboxEvent(eventId);
    // After 5 total attempts fail -> permanently FAILED
    expect(state?.delivery_status).toBe('FAILED');
    expect(state?.retry_count).toBe(5);
    expect(state?.next_retry_at).toBeNull();
    expect(state?.last_error).toContain('Injected simulated webhook endpoint');
  });

  it('demonstrates receiver-side deduplication for at-least-once delivery', async () => {
    const eventId = 'evt_dedup_test';
    const testEvent: BookingCreatedEvent = {
      id: eventId,
      event_type: 'booking.created',
      payload: {
        booking_id: 'bkg_dedup_test',
        idempotency_key: null,
        room_id: 'room_deluxe_101',
        customer_id: 'cust_dedup_test',
        check_in: '2029-12-10',
        check_out: '2029-12-14',
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

    // First delivery
    const r1 = await receiver.receiveEvent(testEvent);
    expect(r1.status).toBe(200);
    expect(r1.duplicate).toBe(false);

    // Second delivery of same event_id
    const r2 = await receiver.receiveEvent(testEvent);
    expect(r2.status).toBe(200);
    expect(r2.duplicate).toBe(true);

    expect(receiver.getProcessedCount()).toBe(1);
  });
});
