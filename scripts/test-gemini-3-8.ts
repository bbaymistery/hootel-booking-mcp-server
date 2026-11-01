import { GoogleGenAI, Type } from '@google/genai';
import 'dotenv/config';

try {
  process.loadEnvFile?.();
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function testTool() {
  console.log('Testing gemini-3.8-flash with MCP-like tool calling...');
  const resp = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: 'What rooms are available for 2 guests from Dec 10 to Dec 15, 2026?',
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'check_availability',
              description: 'Check vacant rooms',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  check_in: { type: Type.STRING },
                  check_out: { type: Type.STRING },
                  guests: { type: Type.INTEGER },
                },
                required: ['check_in', 'check_out', 'guests'],
              },
            },
          ],
        },
      ],
    },
  });

  console.log('Candidate function calls:', resp.functionCalls);
  console.log('Response text:', resp.text);
}

testTool().catch(console.error);
