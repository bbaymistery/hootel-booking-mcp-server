import { randomUUID } from 'crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createHotelBookingMcpServer } from '../src/server.js';
import { getDb } from '../src/db/connection.js';

const db = getDb();
const app = express();
app.use(express.json());

const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

app.all('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    });
    const server = createHotelBookingMcpServer(db);
    await server.connect(transport);

    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport });
    }
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, { transport });
    }
  } catch (err) {
    console.error('MCP Handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

const server = app.listen(3099, async () => {
  console.log('Test server listening on 3099');

  try {
    const initRes = await fetch('http://localhost:3099/mcp', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      })
    });

    console.log('Init status:', initRes.status);
    console.log('Init headers:', Object.fromEntries(initRes.headers.entries()));
    const text = await initRes.text();
    console.log('Init response body:\n', text);
  } finally {
    server.close();
    process.exit(0);
  }
});
