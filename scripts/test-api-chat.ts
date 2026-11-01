async function testChat() {
  console.log('Sending chat test to http://localhost:3001/api/chat with model gemini-3.8-flash...');
  const res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello! Please tell me about your hotel.',
      model: 'gemini-3.8-flash',
    }),
  });
  console.log('HTTP Status:', res.status);
  const data = await res.json();
  console.log('Assistant Reply:\n', data.reply);
}

testChat().catch(console.error);
