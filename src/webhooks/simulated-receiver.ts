import type { WebhookEvent } from '../models/webhook.model.js';

export interface ReceiverDeliveryResult {
  status: number;
  duplicate: boolean;
  message: string;
}

export class SimulatedWebhookReceiver {
  private readonly processedEventIds = new Set<string>();
  private shouldSimulateFailure = false;

  /**
   * For testing resilience and retry backoff.
   */
  public setFailureMode(fail: boolean): void {
    this.shouldSimulateFailure = fail;
  }

  public isProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  public getProcessedCount(): number {
    return this.processedEventIds.size;
  }

  public clear(): void {
    this.processedEventIds.clear();
    this.shouldSimulateFailure = false;
  }

  public async receiveEvent(event: WebhookEvent): Promise<ReceiverDeliveryResult> {
    if (this.shouldSimulateFailure) {
      console.error(
        `[SIMULATED WEBHOOK RECEIVER] [FAILED] Injected simulation error for Event ID: ${event.id}`
      );
      throw new Error(`Injected simulated webhook endpoint network/server failure for ${event.id}`);
    }

    if (this.processedEventIds.has(event.id)) {
      console.error(
        `[SIMULATED WEBHOOK RECEIVER] [IDEMPOTENT IGNORE] Duplicate Event ID ${event.id} already processed. Suppressing duplicate side effects.`
      );
      return {
        status: 200,
        duplicate: true,
        message: 'Duplicate event ignored'
      };
    }

    this.processedEventIds.add(event.id);

    // Format output strictly to stderr so stdout is reserved for MCP JSON-RPC protocol
    console.error('================== [SIMULATED WEBHOOK RECEIVER] ==================');
    console.error(`Status         : 200 OK (Event Delivered)`);
    console.error(`Event ID       : ${event.id}`);
    console.error(`Event Type     : ${event.event_type}`);
    console.error(`Attempt Count  : ${event.retry_count + 1}`);
    console.error(`Created At     : ${event.created_at}`);
    console.error('Payload Details:');
    console.error(JSON.stringify(event.payload, null, 2));
    console.error('==================================================================');

    return {
      status: 200,
      duplicate: false,
      message: 'Event successfully received and acknowledged'
    };
  }
}

// Global singleton receiver instance
export const simulatedReceiver = new SimulatedWebhookReceiver();
