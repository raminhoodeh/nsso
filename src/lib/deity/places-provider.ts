import { generateOpenAI, responseInputBound } from "./openai-provider";
import type { PlacesProvider } from "./places-service";
import type { ChatBudget } from "./chat-budget-server";

const string = { type: "string" } as const;
const recommendation: Record<string, any> = {
  type: "object",
  properties: { placeId: string, reason: string, eventId: string },
  required: ["placeId", "reason"],
};

const responseSchema: Record<string, any> = {
  type: "object",
  properties: {
    message: string,
    recommendations: { type: "array", items: recommendation, maxItems: 6 },
    itinerary: {
      type: ["object", "null"],
      properties: {
        title: string, summary: string, date: string,
        stops: {
          type: "array", minItems: 1, maxItems: 6,
          items: { type: "object", properties: { ...recommendation.properties, timeLabel: string }, required: ["placeId", "reason", "timeLabel"] },
        },
      },
      required: ["title", "summary", "stops"],
    },
  },
  required: ["message", "recommendations", "itinerary"],
};

export function placesGenerationOptions({ system, user }: Parameters<PlacesProvider>[0]) {
  return { system, messages: [{ role: 'user' as const, content: user }], maxOutputTokens: 4096, schema: responseSchema };
}

/** Server-only, budgeted OpenAI generation for the separate personal Places app. */
export const openAIPlacesProvider = async (prompt: Parameters<PlacesProvider>[0], budget: ChatBudget) => {
  const configuredTimeout = Number(process.env.DEITY_PLACES_TIMEOUT_MS || 22_000);
  const timeout = Math.min(25_000, Math.max(1_000, Number.isFinite(configuredTimeout) ? configuredTimeout : 22_000));
  const options = placesGenerationOptions(prompt);
  try {
    await budget.prepare(responseInputBound(options), 4096);
    const result = await generateOpenAI(options, AbortSignal.timeout(timeout));
    await budget.finish(result.usage);
    return result.text;
  } catch (error) { await budget.blockOnProviderFailure(error); await budget.finish(); throw error; }
};
