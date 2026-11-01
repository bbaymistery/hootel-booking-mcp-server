import { getPrismaClient, disconnectPrisma } from '../src/db/prisma.js';
import { seedNeonRooms } from '../prisma/seed.js';
import { createLocalMcpClient } from '../src/services/mcp-client.service.js';
import {
  GeminiChatService,
  type GenAiClientInterface,
} from '../src/services/gemini-chat.service.js';

async function runDemo() {
  const prisma = getPrismaClient();
  await seedNeonRooms(prisma);

  // Clean up any test booking for Dec 10-15
  await prisma.booking.deleteMany({
    where: {
      room_id: 'room_queen_102',
      check_in: { gte: new Date('2026-12-10T00:00:00.000Z') },
      check_out: { lte: new Date('2026-12-15T00:00:00.000Z') },
    },
  });

  const mockGeminiClient: GenAiClientInterface = {
    models: {
      generateContent: async (params: any) => {
        const contents = params.contents as any[];
        const lastTurn = contents[contents.length - 1];

        // Function response from check_availability
        const checkAvailResp = lastTurn?.parts?.find(
          (p: any) => p.functionResponse?.name === 'check_availability'
        );
        if (checkAvailResp) {
          const rooms = checkAvailResp.functionResponse.response?.rooms ?? [];
          const cheapest = rooms[0];
          return {
            text: `I have checked our live database for December 10–15 (2 guests, 5 nights):\n\n• Standard Double Queen (room_queen_102): $160/night — Total: $800\n• Deluxe Ocean View King (room_deluxe_101): $220/night — Total: $1,100\n\nThe cheapest option is the Standard Double Queen at $800 total.\n\nTo proceed with reserving this room for John, please provide your email address and confirm if you would like me to finalize this booking.`,
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      text: `I have checked our live database for December 10–15 (2 guests, 5 nights):\n\n• Standard Double Queen (room_queen_102): $160/night — Total: $800\n• Deluxe Ocean View King (room_deluxe_101): $220/night — Total: $1,100\n\nThe cheapest option is the Standard Double Queen at $800 total.\n\nTo proceed with reserving this room for John, please provide your email address and confirm if you would like me to finalize this booking.`,
                    },
                  ],
                },
              },
            ],
          };
        }

        // Function response from book_room
        const bookResp = lastTurn?.parts?.find(
          (p: any) => p.functionResponse?.name === 'book_room'
        );
        if (bookResp) {
          const bkg = bookResp.functionResponse.response;
          return {
            text: `🎉 Congratulations! Your reservation is officially confirmed.\n\n• Booking Reference: ${bkg.booking_id}\n• Room: ${bkg.room.name}\n• Dates: ${bkg.booking_dates.check_in} to ${bkg.booking_dates.check_out} (${bkg.booking_dates.nights} nights)\n• Guest: ${bkg.customer.name} (${bkg.customer.email})\n• Total Amount: ${bkg.booking_dates.total_price_formatted}\n\nA confirmation has been recorded in our Neon PostgreSQL system. We look forward to welcoming you to Grand Horizon!`,
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      text: `🎉 Congratulations! Your reservation is officially confirmed.\n\n• Booking Reference: ${bkg.booking_id}\n• Room: ${bkg.room.name}\n• Dates: ${bkg.booking_dates.check_in} to ${bkg.booking_dates.check_out} (${bkg.booking_dates.nights} nights)\n• Guest: ${bkg.customer.name} (${bkg.customer.email})\n• Total Amount: ${bkg.booking_dates.total_price_formatted}\n\nA confirmation has been recorded in our Neon PostgreSQL system. We look forward to welcoming you to Grand Horizon!`,
                    },
                  ],
                },
              },
            ],
          };
        }

        const userText = lastTurn?.parts?.[0]?.text ?? '';
        if (userText.includes('Find an available room') || userText.includes('cheapest option')) {
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
                          idempotency_key: `demo_chat_${Date.now()}`,
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
          text: 'Welcome to Grand Horizon! How may I assist you?',
          candidates: [{ content: { role: 'model', parts: [{ text: 'Welcome!' }] } }],
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

  console.log('================================================================================');
  console.log('🤖 GRAND HORIZON AI CONCIERGE — FULL MCP END-TO-END DEMO');
  console.log('================================================================================\n');

  // STEP 1: Availability
  console.log('👤 [CUSTOMER]: "Find an available room for 2 guests from December 10 to December 15 and book the cheapest option for John."\n');
  const step1 = await chatService.sendMessage({
    message: 'Find an available room for 2 guests from December 10 to December 15 and book the cheapest option for John.',
    history: [],
  });

  console.log('⚙️  [MCP TOOL INVOCATION]:');
  for (const tc of step1.toolCalls) {
    console.log(`   → Tool: ${tc.name}`);
    console.log(`   → Arguments: ${JSON.stringify(tc.args)}`);
    console.log(`   → Result: Found ${(tc.result as any).rooms?.length} rooms in Neon PostgreSQL`);
  }
  console.log('\n🤖 [AI CONCIERGE]:\n' + step1.reply + '\n');

  // STEP 2: Confirmation
  console.log('--------------------------------------------------------------------------------');
  console.log('👤 [CUSTOMER]: "My email is john.doe@luxurytravel.com. Yes, please confirm and book the Standard Double Queen for me."\n');
  const step2 = await chatService.sendMessage({
    message: 'My email is john.doe@luxurytravel.com. Yes, please confirm and book the Standard Double Queen for me.',
    history: step1.history,
  });

  console.log('⚙️  [MCP TOOL INVOCATION]:');
  for (const tc of step2.toolCalls) {
    console.log(`   → Tool: ${tc.name}`);
    console.log(`   → Arguments: ${JSON.stringify(tc.args)}`);
    console.log(`   → Status: ${(tc.result as any).confirmation_status}`);
    console.log(`   → Generated Booking ID: ${(tc.result as any).booking_id}`);
  }
  console.log('\n🤖 [AI CONCIERGE]:\n' + step2.reply + '\n');

  // STEP 3: DB Verification
  console.log('--------------------------------------------------------------------------------');
  console.log('🔍 [NEON POSTGRESQL DIRECT VERIFICATION]:');
  const savedBooking = await prisma.booking.findUnique({
    where: { id: (step2.booking as any).booking_id },
    include: { room: true, customer: true },
  });
  console.log(`   ✓ Found in Neon Database: ${savedBooking?.id}`);
  console.log(`   ✓ Status: ${savedBooking?.status}`);
  console.log(`   ✓ Room: ${savedBooking?.room.name} (${savedBooking?.room_id})`);
  console.log(`   ✓ Customer: ${savedBooking?.customer.name} <${savedBooking?.customer.email}>`);
  console.log(`   ✓ Dates: ${savedBooking?.check_in.toISOString().split('T')[0]} to ${savedBooking?.check_out.toISOString().split('T')[0]}`);
  console.log(`   ✓ Total Cents: ${savedBooking?.total_price_cents} ($${(savedBooking?.total_price_cents ?? 0) / 100})`);

  // STEP 4: Double Booking Protection Verification
  console.log('\n🔍 [AVAILABILITY EXCLUSION VERIFICATION]:');
  const subsequentCheck = await mcpBundle.callTool('check_availability', {
    check_in: '2026-12-10',
    check_out: '2026-12-15',
    guests: 2,
  });
  const availRooms = JSON.parse(subsequentCheck.content[0].text).rooms;
  const isQueenAvailable = availRooms.some((r: any) => r.room_id === 'room_queen_102');
  console.log(`   ✓ Is Standard Double Queen still available for Dec 10-15? ${isQueenAvailable ? 'YES (ERROR)' : 'NO (CORRECT - Successfully Booked)'}`);
  console.log('================================================================================');

  await mcpBundle.close();
  await disconnectPrisma();
}

runDemo().catch(console.error);
