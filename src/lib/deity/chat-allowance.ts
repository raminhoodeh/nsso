export const ALLOWANCE_CTA_URL = "https://www.linkedin.com/in/raminhoodeh/";
export const ALLOWANCE_CTA_LABEL = "Request more access on LinkedIn";

export class ChatAllowanceError extends Error {
  code: string;
  status: number;
  resetAt?: string;
  constructor(code: string, status = 429, resetAt?: string) {
    super(code === "daily_ip_allowance_exhausted"
      ? "You've reached today's complimentary AI allowance for this internet connection. It resets at midnight Dubai time."
      : code === "daily_shared_allowance_exhausted"
        ? "Today's shared AI allowance has been reached. Please come back after midnight Dubai time or request more access."
        : code === "chat_prompt_too_large" || code === "invalid_chat_request"
          ? "That message or conversation is too long or could not be read. Please start a shorter chat."
        : code === "chat_origin_denied"
          ? "Please open AI chat from nsso."
        : code === "chat_authentication_required" || code === "chat_account_changed"
          ? "Deity could not verify this signed-in account. Nothing was changed. Please sign in again before asking for a profile change."
        : code === "chat_authentication_unavailable"
          ? "Deity could not verify your account just now. Nothing was changed. Please try again shortly."
        : code === "chat_profile_context_unavailable"
          ? "Deity could not load your profile just now. Nothing was changed. Please try again shortly."
        : code === "chat_busy"
          ? "Please wait a minute before sending another message."
          : "Paid AI chat is temporarily unavailable. Please try again later.");
    this.code = code; this.status = status; this.resetAt = resetAt;
  }
}

export function isDailyAllowanceCode(code: unknown): boolean {
  return code === "daily_ip_allowance_exhausted" || code === "daily_shared_allowance_exhausted";
}

export function allowanceResponse(error: ChatAllowanceError): Response {
  const seconds = error.resetAt ? Math.max(1, Math.ceil((Date.parse(error.resetAt) - Date.now()) / 1000)) : 60;
  return Response.json({ error: error.message, code: error.code, resetAt: error.resetAt,
    ...(isDailyAllowanceCode(error.code) ? { cta: { label: ALLOWANCE_CTA_LABEL, href: ALLOWANCE_CTA_URL } } : {}),
  }, { status: error.status, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } });
}

export function boundedChatHistory<T extends { role: string; content: string; id?: string; responseError?: boolean; allowanceCta?: boolean }>(messages: T[]) {
  const history = messages.filter(m => m.content.trim() && !['welcome', 'tip'].includes(m.id || '') && !m.responseError && !m.allowanceCta)
    .slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (new TextEncoder().encode(JSON.stringify(history)).length > 36_000) history.shift();
  return history;
}
