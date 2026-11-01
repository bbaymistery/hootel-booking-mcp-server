import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import { createHotelBookingMcpServer } from '../server.js';
import { AvailabilityService } from './availability.service.js';
import { BookingService } from './booking.service.js';
import { WebhookService } from './webhook.service.js';

export interface McpClientBundle {
  client: Client;
  listTools: () => Promise<Array<{
    name: string;
    description?: string | undefined;
    inputSchema: Record<string, unknown>;
  }>>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{
    isError?: boolean | undefined;
    content: Array<{ type: string; text?: string | undefined }>;
  }>;
  close: () => Promise<void>;
}

/**
 * Creates a genuine MCP Client linked to the official McpServer instance
 * using the official MCP SDK and InMemoryTransport (or Streamable HTTP).
 */
export async function createLocalMcpClient(
  prisma: PrismaClient = getPrismaClient(),
  customServices?: {
    availabilityService?: AvailabilityService;
    bookingService?: BookingService;
    webhookService?: WebhookService;
  }
): Promise<McpClientBundle> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const webhookService = customServices?.webhookService ?? new WebhookService(prisma);
  const availabilityService =
    customServices?.availabilityService ?? new AvailabilityService(prisma);
  const bookingService =
    customServices?.bookingService ?? new BookingService(prisma, webhookService);

  const server = createHotelBookingMcpServer(prisma, {
    availabilityService,
    bookingService,
    webhookService,
  });

  await server.connect(serverTransport);

  const client = new Client(
    { name: 'gemini-hotel-mcp-client', version: '1.2.1' },
    { capabilities: {} }
  );

  await client.connect(clientTransport);

  return {
    client,
    listTools: async () => {
      const response = await client.listTools();
      return response.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({
        name,
        arguments: args,
      });
      return {
        isError: Boolean(result.isError),
        content: (result.content as Array<{ type: string; text?: string }>).map((c) => ({
          type: c.type,
          text: c.text,
        })),
      };
    },
    close: async () => {
      try {
        await client.close();
      } catch {
        // ignore
      }
      try {
        await server.close();
      } catch {
        // ignore
      }
    },
  };
}
