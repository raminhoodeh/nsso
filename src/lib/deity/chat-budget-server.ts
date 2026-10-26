import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { ChatAllowanceError } from "./chat-allowance";

// Micro-USD rates: Flash 2.5 text input $0.30/M; output including thinking $2.50/M.
// Embeddings are conservatively charged at the text-input rate, with UTF-8 bytes as an upper bound.
export const CHAT_MODEL = "gemini-2.5-flash";
export const CHAT_OUTPUT_TOKENS = 2048;
const INPUT_RATE = 0.3;
const OUTPUT_RATE = 2.5;
type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export function clientIpHash(request: Request, env = process.env): string {
  const secret = env.NSSO_CHAT_IP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new ChatAllowanceError("chat_budget_unavailable", 503);
  let ip = "127.0.0.1";
  if (env.VERCEL === "1") {
    ip = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  } else if (env.NODE_ENV === "production") {
    throw new ChatAllowanceError("chat_budget_unavailable", 503);
  }
  if (!isIP(ip)) throw new ChatAllowanceError("chat_budget_unavailable", 503);
  // URL serialization canonicalizes equivalent IPv6 representations.
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(ip);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    ip = [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export class ChatBudget {
  private embeddingMicros = 0;
  private embeddingTokens = 0;
  private reserved = 10_000;
  private finished = false;
  private rpc: Rpc;
  private ipHash: string;
  private route: string;
  private id: string;
  constructor(rpc: Rpc, ipHash: string, route: string, id = randomUUID()) {
    this.rpc = rpc; this.ipHash = ipHash; this.route = route; this.id = id;
  }

  get requestId() { return this.id; }

  async reserve(micros = 10_000) {
    const { data, error } = await this.rpc("reserve_nsso_chat_budget", {
      p_ip_hash: this.ipHash, p_request_id: this.id, p_route: this.route, p_micros: micros,
    });
    if (error || !data || typeof data !== "object") throw new ChatAllowanceError("chat_budget_unavailable", 503);
    const reply = data as { allowed?: boolean; code?: string; reset_at?: string };
    if (reply.allowed !== true) throw new ChatAllowanceError(reply.code || "chat_budget_unavailable", reply.code?.startsWith("daily_") || reply.code === "chat_busy" ? 429 : 503, reply.reset_at);
    this.reserved = Math.max(this.reserved, micros);
  }

  addEmbedding(text: string) {
    const tokens = Buffer.byteLength(text, "utf8") + 512;
    if (this.embeddingTokens + tokens > 22_000) throw new ChatAllowanceError("chat_prompt_too_large", 413);
    this.embeddingTokens += tokens;
    this.embeddingMicros += Math.ceil(tokens * INPUT_RATE);
  }

  async prepare(promptTokens: number, outputTokens: number) {
    if (!Number.isSafeInteger(promptTokens) || promptTokens < 1 || promptTokens > 100_000 || outputTokens > 4096 || outputTokens < 1) {
      throw new ChatAllowanceError("chat_prompt_too_large", 413);
    }
    // Reserve the maximum possible completion, not an average response cost.
    await this.reserve(Math.max(10_000, Math.ceil((promptTokens + 2048) * INPUT_RATE + outputTokens * OUTPUT_RATE + this.embeddingMicros)));
  }

  async finish(usage?: Usage) {
    if (this.finished) return;
    this.finished = true;
    const numbers = [usage?.promptTokenCount, usage?.candidatesTokenCount, usage?.thoughtsTokenCount ?? 0];
    const confirmed = numbers.every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0);
    const micros = confirmed ? Math.ceil(numbers[0]! * INPUT_RATE + (numbers[1]! + numbers[2]!) * OUTPUT_RATE + this.embeddingMicros) : this.reserved;
    try {
      const { error } = await this.rpc("finish_nsso_chat_budget", { p_request_id: this.id, p_micros: micros, p_confirmed: confirmed });
      if (error) console.error("Chat budget settlement unavailable; reservation retained");
    } catch { console.error("Chat budget settlement unavailable; reservation retained"); }
  }
}

export async function openChatBudget(request: Request, route: "chat" | "places" | "editorial") {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    throw new ChatAllowanceError("chat_origin_denied", 403);
  }
  const ipHash = clientIpHash(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ChatAllowanceError("chat_budget_unavailable", 503);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) }) } });
  const budget = new ChatBudget((name, args) => client.rpc(name, args), ipHash, route);
  try { await budget.reserve(); } catch (error) {
    if (error instanceof ChatAllowanceError) throw error;
    throw new ChatAllowanceError("chat_budget_unavailable", 503);
  }
  return budget;
}
