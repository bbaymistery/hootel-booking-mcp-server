import path from 'node:path';
import { createLocalMcpClient } from '../src/services/mcp-client.service.js';
import { disconnectPrisma } from '../src/db/prisma.js';

async function main() {
  const bundle = await createLocalMcpClient();
  const tools = await bundle.listTools();
  console.log('MCP Tools found:', tools.map(t => t.name));

  const res = await bundle.callTool('check_availability', {
    check_in: '2026-12-10',
    check_out: '2026-12-15',
    guests: 2
  });

  const parsed = JSON.parse(res.content[0]?.text || '{}');
  console.log('Available rooms count:', parsed.rooms?.length);
  console.log('Cheapest room:', parsed.cheapest_room?.name, parsed.cheapest_room?.price_per_night_formatted);

  await bundle.close();
  await disconnectPrisma();
}

main().catch(console.error);
