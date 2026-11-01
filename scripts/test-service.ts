import { GeminiChatService } from '../src/services/gemini-chat.service.js';

async function main() {
  console.log('Testing GeminiChatService directly...');
  const service = new GeminiChatService();
  const res = await service.sendMessage({
    message: 'Hello! What rooms do you have?',
    model: 'gemini-3.8-flash',
  });
  console.log('Result:', res.reply?.slice(0, 150));
}

main().catch(console.error);
