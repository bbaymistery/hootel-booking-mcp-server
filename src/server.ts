import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from './db/prisma.js';
import { AvailabilityService } from './services/availability.service.js';
import { BookingService } from './services/booking.service.js';
import { WebhookService } from './services/webhook.service.js';
import { registerCheckAvailabilityTool } from './tools/check-availability.tool.js';
import { registerBookRoomTool } from './tools/book-room.tool.js';

export interface ServerServices {
  availabilityService?: AvailabilityService;
  bookingService?: BookingService;
  webhookService?: WebhookService;
}

export function createHotelBookingMcpServer(
  prisma: PrismaClient = getPrismaClient(),
  customServices?: ServerServices
): McpServer {
  const server = new McpServer({
    name: 'hotel-booking-mcp-server',
    version: '1.2.1'
  });

  const webhookService = customServices?.webhookService ?? new WebhookService(prisma);
  const availabilityService =
    customServices?.availabilityService ?? new AvailabilityService(prisma);
  const bookingService =
    customServices?.bookingService ?? new BookingService(prisma, webhookService);

  registerCheckAvailabilityTool(server, availabilityService);
  registerBookRoomTool(server, bookingService);

  return server;
}
