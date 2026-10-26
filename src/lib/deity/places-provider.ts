import { GoogleGenerativeAI, SchemaType, type Schema, type ObjectSchema, type GenerationConfig } from "@google/generative-ai";
import type { PlacesProvider } from "./places-service";
import { CHAT_MODEL, type ChatBudget } from "./chat-budget-server";

const string = { type: SchemaType.STRING } as const;
const recommendation: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: { placeId: string, reason: string, eventId: string },
  required: ["placeId", "reason"],
};

const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    message: string,
    recommendations: { type: SchemaType.ARRAY, items: recommendation, maxItems: 6 },
    itinerary: {
      type: SchemaType.OBJECT, nullable: true,
      properties: {
        title: string, summary: string, date: string,
        stops: {
          type: SchemaType.ARRAY, minItems: 1, maxItems: 6,
          items: { type: SchemaType.OBJECT, properties: { ...recommendation.properties, timeLabel: string }, required: ["placeId", "reason", "timeLabel"] },
        },
      },
      required: ["title", "summary", "stops"],
    },
  },
  required: ["message", "recommendations", "itinerary"],
};

/** Same server-only Gemini SDK/key as the existing NSSO Deity and film assistant. */
export const geminiPlacesProvider = async ({ system, user }: Parameters<PlacesProvider>[0], budget: ChatBudget) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("Places provider is not configured");
  const configuredTimeout = Number(process.env.DEITY_PLACES_TIMEOUT_MS || 22_000);
  const timeout = Math.min(25_000, Math.max(1_000, Number.isFinite(configuredTimeout) ? configuredTimeout : 22_000));
  // The established SDK forwards generationConfig fields; its older type definitions
  // predate Gemini 2.5's thinkingConfig. Disable thinking for short, responsive map plans.
  const generationConfig: GenerationConfig & { thinkingConfig: { thinkingBudget: number } } = {
    responseMimeType: "application/json", responseSchema, temperature: 0.35, maxOutputTokens: 4_096,
    thinkingConfig: { thinkingBudget: 0 },
  };
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: CHAT_MODEL,
    systemInstruction: system,
    generationConfig,
  });
  try {
    const contents = [{ role: "user", parts: [{ text: user }] }];
    const counted = await model.countTokens({ contents }, { timeout: 10_000 });
    await budget.prepare(counted.totalTokens, 4096);
    const result = await model.generateContent({ contents }, { timeout, signal: AbortSignal.timeout(timeout) });
    await budget.finish(result.response.usageMetadata);
    return result.response.text();
  } catch (error) {
    await budget.finish();
    throw error;
  }
};
