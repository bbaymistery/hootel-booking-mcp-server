import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

try {
  process.loadEnvFile?.();
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const candidateModels = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.5-pro',
];

async function testModels() {
  console.log('Testing Gemini models with current API Key...\n');
  for (const model of candidateModels) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: 'Say hi in one word.',
      });
      console.log(`✅ [${model}] SUCCESS: ${resp.text?.trim()}`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      const is404 = msg.includes('404') || msg.includes('not found');
      console.log(`❌ [${model}] FAILED: ${isQuota ? '429 Quota Exceeded' : is404 ? '404 Model Not Found' : msg.slice(0, 100)}`);
    }
  }
}

testModels();
