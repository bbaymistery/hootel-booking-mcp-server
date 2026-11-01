import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

try {
  process.loadEnvFile?.();
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function listAll() {
  console.log('Listing all models for this key:');
  const pager = await ai.models.list();
  const validModels: string[] = [];
  for await (const m of pager) {
    const name = m.name?.replace('models/', '') ?? '';
    console.log(`- ${name}`);
    validModels.push(name);
  }

  console.log('\n--- Testing generateContent on each model ---');
  for (const m of validModels) {
    if (!m.includes('gemini')) continue;
    try {
      const resp = await ai.models.generateContent({
        model: m,
        contents: 'hi',
      });
      console.log(`✅ [${m}] WORKS! Output: ${resp.text?.trim()}`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      console.log(`❌ [${m}] FAILED: ${is429 ? '429 QUOTA EXCEEDED' : msg.slice(0, 80)}`);
    }
  }
}

listAll().catch(console.error);
