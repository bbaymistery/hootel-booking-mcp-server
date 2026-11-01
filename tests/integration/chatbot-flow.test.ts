import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { getPrismaClient, disconnectPrisma } from '../../src/db/prisma.js';
import { seedNeonRooms } from '../../prisma/seed.js';
import { createExpressApp } from '../../src/api/app.js';
import {
  GeminiChatService,
  type GenAiClientInterface,
} from '../../src/services/gemini-chat.service.js';
import { createLocalMcpClient } from '../../src/services/mcp-client.service.js';

describe('Chatbot to Genuine MCP to Neon PostgreSQL E2E Flow', () => {
  const prisma = getPrismaClient();

  beforeAll(async () => {
    await seedNeonRooms(prisma);

    // Clean up any previous test booking for Dec 10-15
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_queen_102',
        check_in: { gte: new Date('2026-12-10T00:00:00.000Z') },
        check_out: { lte: new Date('2026-12-15T00:00:00.000Z') },
      },
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_queen_102',
        check_in: { gte: new Date('2026-12-10T00:00:00.000Z') },
        check_out: { lte: new Date('2026-12-15T00:00:00.000Z') },
      },
    });
    await disconnectPrisma();
  });

  it('executes a complete conversational flow: availability inquiry -> MCP tool call -> confirmation request -> booking -> verification in Neon PostgreSQL', async () => {
    let turnCount = 0;

    // Simulated Gemini AI Client that makes tool calls and respects the confirmation requirement
    const mockGeminiClient: GenAiClientInterface = {
      models: {
        generateContent: async (params: any) => {
          const contents = params.contents as any[];
          const lastTurn = contents[contents.length - 1];

          // Check if previous turn was a function response from check_availability
          const hasCheckAvailabilityResponse = lastTurn?.parts?.some(
            (p: any) => p.functionResponse?.name === 'check_availability'
          );

          // Check if previous turn was a function response from book_room
          const hasBookRoomResponse = lastTurn?.parts?.some(
            (p: any) => p.functionResponse?.name === 'book_room'
          );

          if (hasCheckAvailabilityResponse) {
            const respPart = lastTurn.parts.find(
              (p: any) => p.functionResponse?.name === 'check_availability'
            );
            const rooms = respPart.functionResponse.response?.rooms ?? [];
            const cheapest = rooms[0];

            return {
              text: `I checked availability for December 10–15 (2 guests). The cheapest available option is the ${cheapest?.name ?? 'Standard Double Queen'} at $${(cheapest?.total_price_cents ?? 80000) / 100} total. Before I can book this, please provide your email address and explicitly confirm you want to proceed.`,
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        text: `I checked availability for December 10–15 (2 guests). The cheapest available option is the ${cheapest?.name ?? 'Standard Double Queen'} at $${(cheapest?.total_price_cents ?? 80000) / 100} total. Before I can book this, please provide your email address and explicitly confirm you want to proceed.`,
                      },
                    ],
                  },
                },
              ],
            };
          }

          if (hasBookRoomResponse) {
            const respPart = lastTurn.parts.find(
              (p: any) => p.functionResponse?.name === 'book_room'
            );
            const bkg = respPart.functionResponse.response;
            return {
              text: `Your reservation has been officially confirmed! Booking Reference ID: ${bkg.booking_id}. We look forward to hosting you at Grand Horizon Resort.`,
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        text: `Your reservation has been officially confirmed! Booking Reference ID: ${bkg.booking_id}. We look forward to hosting you at Grand Horizon Resort.`,
                      },
                    ],
                  },
                },
              ],
            };
          }

          // Initial user messages in the turn
          const userText = lastTurn?.parts?.[0]?.text ?? '';

          if (userText.includes('Find an available room') || userText.includes('cheapest option')) {
            turnCount++;
            // Model decides to call check_availability MCP tool
            return {
              text: undefined,
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          name: 'check_availability',
                          args: {
                            check_in: '2026-12-10',
                            check_out: '2026-12-15',
                            guests: 2,
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }

          if (userText.includes('confirm') || userText.includes('book the Standard Double Queen')) {
            turnCount++;
            // User confirmed and gave email -> Model calls book_room MCP tool
            return {
              text: undefined,
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          name: 'book_room',
                          args: {
                            room_id: 'room_queen_102',
                            customer_name: 'John Doe',
                            customer_email: 'john.doe@luxurytravel.com',
                            check_in: '2026-12-10',
                            check_out: '2026-12-15',
                            guests: 2,
                            idempotency_key: 'chat_e2e_idempotent_key_001',
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }

          return {
            text: 'How can I assist your stay today?',
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'How can I assist your stay today?' }],
                },
              },
            ],
          };
        },
      },
    };

    const mcpBundle = await createLocalMcpClient(prisma);
    const chatService = new GeminiChatService({
      prisma,
      aiClient: mockGeminiClient,
      mcpBundle,
    });

    const app = createExpressApp({ prisma, chatService });
    let server!: Server;
    let baseUrl = '';

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address !== null) {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    try {
      // === TURN 1: Guest asks for availability and cheapest option ===
      const turn1Raw = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Find an available room for 2 guests from December 10 to December 15 and book the cheapest option for John.',
          history: [],
        }),
      });

      expect(turn1Raw.status).toBe(200);
      const turn1Res = await turn1Raw.json() as any;

      expect(turn1Res.toolCalls).toHaveLength(1);
      expect(turn1Res.toolCalls[0].name).toBe('check_availability');
      expect(turn1Res.toolCalls[0].args).toEqual({
        check_in: '2026-12-10',
        check_out: '2026-12-15',
        guests: 2,
      });
      expect(turn1Res.toolCalls[0].isError).toBe(false);

      // Verify AI did NOT book yet, but asked for confirmation and details
      expect(turn1Res.booking).toBeNull();
      expect(turn1Res.reply).toContain('cheapest available option');
      expect(turn1Res.reply).toContain('confirm');

      // Verify in database: NO booking exists yet
      const dbBookingBefore = await prisma.booking.findFirst({
        where: {
          room_id: 'room_queen_102',
          check_in: new Date('2026-12-10T00:00:00.000Z'),
          check_out: new Date('2026-12-15T00:00:00.000Z'),
        },
      });
      expect(dbBookingBefore).toBeNull();

      // === TURN 2: Guest provides email and explicitly confirms booking ===
      const turn2Raw = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'My email is john.doe@luxurytravel.com. Yes, please confirm and book the Standard Double Queen for me.',
          history: turn1Res.history,
        }),
      });

      expect(turn2Raw.status).toBe(200);
      const turn2Res = await turn2Raw.json() as any;

      expect(turn2Res.toolCalls).toHaveLength(1);
      expect(turn2Res.toolCalls[0].name).toBe('book_room');
      expect(turn2Res.toolCalls[0].isError).toBe(false);

      // Verify booking returned
      const confirmedBooking = turn2Res.booking;
      expect(confirmedBooking).toBeDefined();
      expect(confirmedBooking.confirmation_status).toBe('CONFIRMED');
      expect(confirmedBooking.booking_id).toMatch(/^bkg_/);
      expect(confirmedBooking.room.room_id).toBe('room_queen_102');
      expect(turn2Res.reply).toContain('confirmed');
      expect(turn2Res.reply).toContain(confirmedBooking.booking_id);

      // === VERIFY IN NEON POSTGRESQL ===
      const dbBookingAfter = await prisma.booking.findUnique({
        where: { id: confirmedBooking.booking_id },
        include: { room: true, customer: true },
      });

      expect(dbBookingAfter).not.toBeNull();
      expect(dbBookingAfter?.status).toBe('CONFIRMED');
      expect(dbBookingAfter?.room_id).toBe('room_queen_102');
      expect(dbBookingAfter?.customer.email).toBe('john.doe@luxurytravel.com');
      expect(dbBookingAfter?.customer.name).toBe('John Doe');

      // === TURN 3: Subsequent search verifies room is no longer available ===
      const checkAvailabilityAgain = await mcpBundle.callTool('check_availability', {
        check_in: '2026-12-10',
        check_out: '2026-12-15',
        guests: 2,
      });

      const parsedAvailability = JSON.parse(checkAvailabilityAgain.content[0]?.text ?? '{}');
      const availableRoomIds = parsedAvailability.rooms.map((r: any) => r.room_id);

      // The booked room must NOT be in the available rooms list anymore!
      expect(availableRoomIds).not.toContain('room_queen_102');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mcpBundle.close();
    }
  });

  it('rejects empty message with 400 validation error', async () => {
    const app = createExpressApp({ prisma });
    let server!: Server;
    let baseUrl = '';

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address !== null) {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '   ' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error.code).toBe('INVALID_INPUT');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
