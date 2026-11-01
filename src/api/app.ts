import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'crypto';
import express, { type Express } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../db/prisma.js';
import { AvailabilityService } from '../services/availability.service.js';
import { BookingService } from '../services/booking.service.js';
import { WebhookService } from '../services/webhook.service.js';
import { createHotelBookingMcpServer } from '../server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRoomsRouter } from './routes/rooms.router.js';
import { createAvailabilityRouter } from './routes/availability.router.js';
import { createBookingRouter } from './routes/booking.router.js';
import { createChatRouter } from './routes/chat.router.js';
import { GeminiChatService } from '../services/gemini-chat.service.js';
import { apiErrorHandler } from './middleware/error-handler.js';

export interface AppDependencies {
  prisma?: PrismaClient;
  availabilityService?: AvailabilityService;
  bookingService?: BookingService;
  webhookService?: WebhookService;
  chatService?: GeminiChatService;
}

export function createExpressApp(deps: AppDependencies = {}): Express {
  const prisma = deps.prisma ?? getPrismaClient();
  const webhookService = deps.webhookService ?? new WebhookService(prisma);
  const availabilityService = deps.availabilityService ?? new AvailabilityService(prisma);
  const bookingService = deps.bookingService ?? new BookingService(prisma, webhookService);
  const chatService = deps.chatService ?? new GeminiChatService({ prisma });

  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', async (_req, res) => {
    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      database_type: 'Neon PostgreSQL (Prisma 7)',
      mcp_endpoint: '/mcp'
    });
  });

  // REST API Routes
  app.use('/api/rooms', createRoomsRouter(prisma));
  app.use('/api/availability', createAvailabilityRouter(availabilityService));
  app.use('/api/bookings', createBookingRouter(prisma, bookingService));
  app.use('/api/chat', createChatRouter(chatService));

  // Remote Streamable HTTP MCP Transport Endpoint (/mcp)
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

  app.all('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Existing active session
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // Check if client provided an invalid session ID
      if (sessionId && !sessions.has(sessionId)) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null
        });
        return;
      }

      // Initialize new session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
      });
      const mcpServer = createHotelBookingMcpServer(prisma, {
        availabilityService,
        bookingService,
        webhookService
      });
      await mcpServer.connect(transport);

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      await transport.handleRequest(req, res, req.body);

      if (transport.sessionId && !sessions.has(transport.sessionId)) {
        sessions.set(transport.sessionId, { transport });
      }
    } catch (err: unknown) {
      console.error('[MCP Request Error]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'MCP Transport Error' });
      }
    }
  });

  // Static client serving if built
  const clientDist = path.resolve(process.cwd(), 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
        return res.sendFile(path.join(clientDist, 'index.html'));
      }
      next();
    });
  }

  // Central error handler
  app.use(apiErrorHandler);

  return app;
}
