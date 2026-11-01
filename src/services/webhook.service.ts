import { PrismaClient, type Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import { config } from '../config/index.js';
import type { WebhookEvent, WebhookDeliveryStatus } from '../models/webhook.model.js';
import { simulatedReceiver, SimulatedWebhookReceiver } from '../webhooks/simulated-receiver.js';

export class WebhookService {
  private readonly prisma: PrismaClient;
  private readonly receiver: SimulatedWebhookReceiver;

  constructor(prisma: PrismaClient = getPrismaClient(), receiver: SimulatedWebhookReceiver = simulatedReceiver) {
    this.prisma = prisma;
    this.receiver = receiver;
  }

  /**
   * Inserts an event into the transactional outbox table.
   * Executed inside the same transaction as the booking creation.
   */
  public async insertOutboxEvent(event: WebhookEvent, txPrisma?: Prisma.TransactionClient): Promise<void> {
    const client = txPrisma ?? this.prisma;
    await client.webhookOutbox.create({
      data: {
        id: event.id,
        event_type: event.event_type,
        payload: JSON.stringify(event.payload),
        delivery_status: event.delivery_status,
        retry_count: event.retry_count,
        next_retry_at: event.next_retry_at ? new Date(event.next_retry_at) : null,
        last_attempt_at: event.last_attempt_at ? new Date(event.last_attempt_at) : null,
        last_error: event.last_error,
        created_at: new Date(event.created_at),
      },
    });
  }

  /**
   * Retrieves an outbox event by ID.
   */
  public async getOutboxEvent(eventId: string): Promise<WebhookEvent | null> {
    const row = await this.prisma.webhookOutbox.findUnique({
      where: { id: eventId },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      event_type: row.event_type as 'booking.created',
      payload: JSON.parse(row.payload),
      delivery_status: row.delivery_status as WebhookDeliveryStatus,
      retry_count: row.retry_count,
      next_retry_at: row.next_retry_at ? row.next_retry_at.toISOString() : null,
      last_attempt_at: row.last_attempt_at ? row.last_attempt_at.toISOString() : null,
      last_error: row.last_error,
      created_at: row.created_at.toISOString(),
    };
  }

  /**
   * Executes a single delivery attempt for a given outbox event.
   * Updates delivery status, retry count, and backoff delay according to OpenSpec v1.2.1.
   */
  public async deliverEvent(eventId: string): Promise<boolean> {
    const event = await this.getOutboxEvent(eventId);
    if (!event) {
      console.error(`[WebhookService] Event not found for delivery: ${eventId}`);
      return false;
    }

    if (event.delivery_status === 'DELIVERED') {
      return true;
    }

    const now = new Date();

    try {
      await this.receiver.receiveEvent(event);

      // On successful delivery
      await this.prisma.webhookOutbox.update({
        where: { id: event.id },
        data: {
          delivery_status: 'DELIVERED',
          next_retry_at: null,
          last_attempt_at: now,
          last_error: null,
        },
      });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newRetryCount = event.retry_count + 1;

      if (newRetryCount >= config.maxDeliveryAttempts) {
        // Attempt 5 failed -> permanently mark FAILED
        await this.prisma.webhookOutbox.update({
          where: { id: event.id },
          data: {
            delivery_status: 'FAILED',
            retry_count: newRetryCount,
            next_retry_at: null,
            last_attempt_at: now,
            last_error: errorMessage,
          },
        });

        console.error(
          `[WebhookService] Event ${event.id} permanently FAILED after ${newRetryCount} total attempts. Error: ${errorMessage}`
        );
      } else {
        // Schedule next retry with delay: 1s, 5s, 15s, 30s
        const delayMs = config.retryDelaysMs[newRetryCount - 1] ?? 30000;
        const nextRetryDate = new Date(Date.now() + delayMs);

        await this.prisma.webhookOutbox.update({
          where: { id: event.id },
          data: {
            delivery_status: 'PENDING',
            retry_count: newRetryCount,
            next_retry_at: nextRetryDate,
            last_attempt_at: now,
            last_error: errorMessage,
          },
        });

        console.error(
          `[WebhookService] Delivery attempt ${newRetryCount} failed for event ${event.id}. Scheduled retry at ${nextRetryDate.toISOString()}. Error: ${errorMessage}`
        );
      }

      return false;
    }
  }

  /**
   * Non-blocking post-commit dispatch trigger.
   */
  public triggerAsyncDispatch(eventId: string): void {
    queueMicrotask(() => {
      this.deliverEvent(eventId).catch((err: unknown) => {
        console.error(`[WebhookService] Async dispatch failure for ${eventId}:`, err);
      });
    });
  }

  /**
   * Startup / periodic recovery routine to sweep undelivered pending events.
   */
  public async recoverPendingEvents(): Promise<number> {
    const now = new Date();
    const pending = await this.prisma.webhookOutbox.findMany({
      where: {
        delivery_status: 'PENDING',
        retry_count: { lt: config.maxDeliveryAttempts },
        OR: [{ next_retry_at: null }, { next_retry_at: { lte: now } }],
      },
      orderBy: { created_at: 'asc' },
    });

    if (pending.length === 0) {
      return 0;
    }

    console.error(`[WebhookService] Recovering ${pending.length} pending outbox events...`);

    let recoveredCount = 0;
    for (const row of pending) {
      const delivered = await this.deliverEvent(row.id);
      if (delivered) {
        recoveredCount++;
      }
    }

    return recoveredCount;
  }
}
