import { ChatAllowanceError } from "./chat-allowance";

export async function readChatRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ChatAllowanceError("invalid_chat_request", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ChatAllowanceError("invalid_chat_request", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) { await reader.cancel(); throw new ChatAllowanceError("invalid_chat_request", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ChatAllowanceError("invalid_chat_request", 400); }
  if (!data || typeof data.message !== "string" || !data.message.trim() || data.message.length > 4000
    || (data.category != null && (typeof data.category !== "string" || data.category.length > 100))
    || (data.disableTools != null && typeof data.disableTools !== "boolean")
    || (data.expectedAccountId != null && (typeof data.expectedAccountId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.expectedAccountId)))) throw new ChatAllowanceError("invalid_chat_request", 400);
  const history = data.history ?? [];
  if (!Array.isArray(history) || history.length > 10 || history.some(m => !m || !["user", "model"].includes(m.role)
    || typeof m.content !== "string" || m.content.length > 2000)) throw new ChatAllowanceError("invalid_chat_request", 400);
  // UI greetings and clipped leading model turns are not prior user conversations.
  const firstUser = history.findIndex(m => m.role === 'user');
  const conversation = firstUser < 0 ? [] : history.slice(firstUser);
  return { message: data.message as string, category: data.category as string | undefined,
    history: conversation as { role: "user" | "model"; content: string }[], disableTools: data.disableTools === true,
    // A consistency assertion, never an identity or authorization source.
    expectedAccountId: data.expectedAccountId as string | undefined };
}
