import path from 'node:path';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface TextContentBlock {
  type: 'text';
  text: string;
}

function parseMcpText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('No content returned from tool call');
  }
  const block = content[0] as TextContentBlock;
  return block.text;
}

async function runLiveDemonstration(): Promise<void> {
  const serverPath = path.resolve(process.cwd(), 'dist/src/index.js');
  const dbPath = path.resolve(process.cwd(), 'hotel_booking.db');

  console.log('======================================================================');
  console.log('          HOTEL BOOKING MCP SERVER - LIVE DEMONSTRATION               ');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // STEP 1 & 2: Start MCP Server & Connect Actual MCP Client
  // -------------------------------------------------------------------------
  console.log('[STEP 1 & 2] Spawning real MCP Server subprocess over stdio...');
  console.log(`Server Executable: ${serverPath}`);
  console.log(`Target Database  : ${dbPath}`);

  let transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      HOTEL_DB_PATH: dbPath
    }
  });

  let client = new Client(
    { name: 'live-demonstration-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('>>> MCP Client connected successfully via JSON-RPC 2.0 (stdio).\n');

  // Verify tools/list
  console.log('--- Discovering Available Tools (tools/list) ---');
  const toolsList = await client.listTools();
  for (const tool of toolsList.tools) {
    console.log(`Tool: [${tool.name}] - ${tool.description}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 3: Call check_availability
  // -------------------------------------------------------------------------
  const checkIn = '2026-12-01';
  const checkOut = '2026-12-05';
  const guests = 2;

  console.log(`[STEP 3] Calling MCP tool [check_availability] for ${checkIn} -> ${checkOut} (${guests} guests)...`);
  const availResponse = await client.callTool({
    name: 'check_availability',
    arguments: {
      check_in: checkIn,
      check_out: checkOut,
      guests
    }
  });

  const availRawText = parseMcpText(availResponse.content);
  const availResult = JSON.parse(availRawText) as {
    available_rooms_count: number;
    currency: string;
    rooms: Array<{ room_id: string; name: string; price_per_night_formatted: string; total_price_formatted: string }>;
  };

  console.log('>>> [check_availability] Live Response from Server:');
  console.log(JSON.stringify(availResult, null, 2));
  console.log(`Found ${availResult.available_rooms_count} available rooms.\n`);

  const selectedRoom = availResult.rooms[0];
  if (!selectedRoom) {
    throw new Error('No rooms available for demonstration');
  }

  // -------------------------------------------------------------------------
  // STEP 4 & 5: Call book_room & Show Booking Confirmation
  // -------------------------------------------------------------------------
  const idempotencyKey = `live_demo_key_${Date.now()}`;
  console.log(`[STEP 4] Calling MCP tool [book_room] for room: ${selectedRoom.room_id} (${selectedRoom.name})...`);
  console.log(`Using Idempotency Key: ${idempotencyKey}`);

  const bookResponse = await client.callTool({
    name: 'book_room',
    arguments: {
      room_id: selectedRoom.room_id,
      customer_name: 'Alex Interviewer',
      customer_email: 'alex.interviewer@ai-demo.org',
      check_in: checkIn,
      check_out: checkOut,
      guests,
      idempotency_key: idempotencyKey
    }
  });

  const bookRawText = parseMcpText(bookResponse.content);
  const bookResult = JSON.parse(bookRawText) as {
    booking_id: string;
    confirmation_status: string;
    is_idempotent_replay: boolean;
    currency: string;
    room: { room_id: string; name: string };
    booking_dates: { check_in: string; check_out: string; nights: number; total_price_formatted: string };
  };

  console.log('\n[STEP 5] Live Booking Confirmation Returned by MCP Server:');
  console.log(JSON.stringify(bookResult, null, 2));
  console.log();

  // Allow async post-commit dispatch microtask to finish
  await new Promise((r) => setTimeout(r, 100));

  // -------------------------------------------------------------------------
  // STEP 6 & 7: Inspect SQLite Database (bookings & webhook_outbox)
  // -------------------------------------------------------------------------
  console.log('[STEP 6 & 7] Verifying direct SQLite database file state...');
  const db = new Database(dbPath);

  const bookingRow = db
    .prepare('SELECT * FROM bookings WHERE id = ?')
    .get(bookResult.booking_id);
  console.log('\n>>> Corresponding Row in SQLite [bookings] table:');
  console.log(bookingRow);

  const outboxRow = db
    .prepare('SELECT id, event_type, delivery_status, retry_count, created_at, payload FROM webhook_outbox WHERE payload LIKE ?')
    .get(`%${bookResult.booking_id}%`);
  console.log('\n>>> Matching Event in SQLite [webhook_outbox] table:');
  console.log(outboxRow);

  db.close();

  // -------------------------------------------------------------------------
  // STEP 8: Restart MCP Server & Verify Persistence
  // -------------------------------------------------------------------------
  console.log('\n[STEP 8] Demonstrating persistence across complete server restart...');
  console.log('Terminating initial MCP Client and Server process...');
  await client.close();
  console.log('>>> Initial server process terminated.\n');

  console.log('Booting a BRAND NEW MCP Server subprocess from dist/src/index.js...');
  transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      HOTEL_DB_PATH: dbPath
    }
  });

  client = new Client(
    { name: 'second-client-after-restart', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('>>> Connected to NEW MCP server instance.');

  console.log(`Re-querying availability for the same room (${selectedRoom.room_id}) and dates (${checkIn} -> ${checkOut})...`);
  const recheckResponse = await client.callTool({
    name: 'check_availability',
    arguments: {
      check_in: checkIn,
      check_out: checkOut,
      guests
    }
  });

  const recheckText = parseMcpText(recheckResponse.content);
  const recheckResult = JSON.parse(recheckText) as {
    available_rooms_count: number;
    rooms: Array<{ room_id: string; name: string }>;
  };

  const isRoomStillAvailable = recheckResult.rooms.some((r) => r.room_id === selectedRoom.room_id);
  console.log(`Is booked room '${selectedRoom.room_id}' still listed as available? ${isRoomStillAvailable ? 'YES (UNEXPECTED)' : 'NO (CORRECT - Reserved in SQLite)'}`);

  // Also query the row again directly
  const dbAfterRestart = new Database(dbPath);
  const recheckBookingRow = dbAfterRestart
    .prepare('SELECT id, room_id, customer_id, check_in, check_out, total_price_cents, status FROM bookings WHERE id = ?')
    .get(bookResult.booking_id);
  console.log('\nDirect SQLite query after server reboot confirming persisted booking:');
  console.log(recheckBookingRow);
  dbAfterRestart.close();

  await client.close();

  console.log('\n======================================================================');
  console.log('           LIVE MCP DEMONSTRATION COMPLETED SUCCESSFULLY              ');
  console.log('======================================================================');
}

runLiveDemonstration().catch((err: unknown) => {
  console.error('[Demo Error]', err);
  process.exit(1);
});
