async function testQuota() {
  console.log('Testing model with exhausted quota (gemini-3-flash-preview)...');
  const res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello!',
      model: 'gemini-3-flash-preview',
    }),
  });
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Reply:\n', data.reply);
}

testQuota().catch(console.error);
