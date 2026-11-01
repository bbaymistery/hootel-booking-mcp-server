async function testLiveMcpTools() {
  // 1. Initialize
  const initRes = await fetch('http://localhost:3001/mcp', {
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
        clientInfo: { name: 'inspector-test', version: '1.0.0' }
      }
    })
  });

  const sessionId = initRes.headers.get('mcp-session-id');
  console.log('Init Status:', initRes.status, 'Session ID:', sessionId);

  // 2. notifications/initialized
  await fetch('http://localhost:3001/mcp', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId!
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    })
  });

  // 3. tools/list
  const toolsRes = await fetch('http://localhost:3001/mcp', {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'mcp-session-id': sessionId!
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    })
  });

  console.log('Tools Status:', toolsRes.status);
  const toolsBody = await toolsRes.text();
  console.log('Tools Body:', toolsBody);
}

testLiveMcpTools().catch(console.error);
