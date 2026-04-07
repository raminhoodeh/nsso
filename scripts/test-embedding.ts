import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
    for (const m of ['text-embedding-004', 'embedding-001', 'gemini-embedding-001']) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            let res;
            if (m === 'text-embedding-004') {
                 res = await model.embedContent('hello world'); // it failed last time
            } else {
                 res = await model.embedContent('hello world');
            }
            console.log(m, 'SUCCESS', res.embedding.values.length, 'dimensions');
            return;
        } catch(e: any) {
            console.log(m, 'FAILED:', e.message);
        }
    }
}
test();
