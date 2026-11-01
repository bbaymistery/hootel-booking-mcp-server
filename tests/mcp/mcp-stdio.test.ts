import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getPrismaClient } from '../../src/db/prisma.js';

interface TextContentBlock {
  type: 'text';
  text: string;
}

function getTextContent(content: unknown): TextContentBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(
    (item): item is TextContentBlock =>
      typeof item === 'object' && item !== null && 'type' in item && item.type === 'text' && 'text' in item
  );
}

describe('MCP Stdio Subprocess Transport Integration Test', () => {
  const tempDbPath = path.resolve(process.cwd(), `test_mcp_stdio_${Date.now()}.db`);
  let transport: StdioClientTransport;
  let client: Client;

  beforeAll(async () => {
    const prisma = getPrismaClient();
    await prisma.booking.deleteMany({
      where: {
        room_id: 'room_deluxe_101',
        check_in: { gte: new Date('2029-06-01T00:00:00.000Z') },
        check_out: { lte: new Date('2029-06-30T00:00:00.000Z') },
      },
    });

    // Connect to actual server running as a subprocess via standard input/output
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.resolve(process.cwd(), 'dist/src/index.js')],
      env: {
        ...process.env,
        HOTEL_DB_PATH: tempDbPath
      }
    });

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    await client.connect(transport);
  }, 15000);

  afterAll(async () => {
    try {
      await client.close();
    } catch {
      // ignore close errors during teardown
    }

    // Clean up temp database
    for (const ext of ['', '-wal', '-shm']) {
      const file = tempDbPath + ext;
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {
          // ignore cleanup lock errors
        }
      }
    }
  });

  it('successfully discovers registered tools via tools/list', async () => {
    const response = await client.listTools();
    const toolNames = response.tools.map((t) => t.name);

    expect(toolNames).toContain('check_availability');
    expect(toolNames).toContain('book_room');
  });

  it('executes check_availability tool over stdio transport', async () => {
    const response = await client.callTool({
      name: 'check_availability',
      arguments: {
        check_in: '2029-06-10',
        check_out: '2029-06-14',
        guests: 2
      }
    });

    expect(response.isError).toBeFalsy();
    const blocks = getTextContent(response.content);
    expect(blocks.length).toBeGreaterThan(0);

    const firstBlock = blocks[0];
    expect(firstBlock).toBeDefined();
    if (firstBlock) {
      const parsed = JSON.parse(firstBlock.text) as {
        currency: string;
        available_rooms_count: number;
        rooms: Array<{ room_id: string }>;
      };
      expect(parsed.currency).toBe('USD');
      expect(parsed.available_rooms_count).toBeGreaterThan(0);
      expect(parsed.rooms.some((r) => r.room_id === 'room_deluxe_101')).toBe(true);
    }
  });

  it('executes book_room tool over stdio transport and verifies confirmed response', async () => {
    const response = await client.callTool({
      name: 'book_room',
      arguments: {
        room_id: 'room_deluxe_101',
        customer_name: 'Stdio Test User',
        customer_email: 'stdio.user@example.com',
        check_in: '2029-06-10',
        check_out: '2029-06-14',
        guests: 2,
        idempotency_key: 'stdio_test_idem_' + Date.now()
      }
    });

    expect(response.isError).toBeFalsy();
    const blocks = getTextContent(response.content);
    expect(blocks.length).toBeGreaterThan(0);

    const firstBlock = blocks[0];
    expect(firstBlock).toBeDefined();
    if (firstBlock) {
      const parsed = JSON.parse(firstBlock.text) as {
        confirmation_status: string;
        booking_id: string;
        currency: string;
        booking_dates: { total_price_cents: number };
      };
      expect(parsed.confirmation_status).toBe('CONFIRMED');
      expect(parsed.booking_id).toMatch(/^bkg_/);
      expect(parsed.currency).toBe('USD');
      expect(parsed.booking_dates.total_price_cents).toBe(88000);
    }
  });

  it('returns structured isError response over stdio when validation fails', async () => {
    const response = await client.callTool({
      name: 'check_availability',
      arguments: {
        check_in: '2026-11-15',
        check_out: '2026-11-10', // check_out before check_in
        guests: 2
      }
    });

    expect(response.isError).toBe(true);
    const blocks = getTextContent(response.content);
    const firstBlock = blocks[0];
    expect(firstBlock).toBeDefined();
    if (firstBlock) {
      const parsed = JSON.parse(firstBlock.text) as {
        error: { code: string; message: string };
      };
      expect(parsed.error.code).toBe('INVALID_INPUT');
      expect(parsed.error.message).toContain('check_out must be strictly after check_in');
    }
  });
});
