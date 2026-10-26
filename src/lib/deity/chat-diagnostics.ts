export type ChatPhase = "request" | "allowance" | "context" | "query_embedding" | "profile_embedding"
  | "retrieval" | "link_checks" | "count_tokens" | "completion_allowance" | "generation" | "stream";

export function chatFailureDetails(error: unknown, phase: ChatPhase, requestId: string) {
  const value = error && typeof error === "object" ? error as { status?: unknown; name?: unknown } : {};
  const status = typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 400 && value.status < 600 ? value.status : undefined;
  const code = status === 404 && ["generation", "count_tokens", "stream"].includes(phase)
    ? "chat_model_unavailable"
    : status === 401 || status === 402 || status === 403
      ? "chat_provider_access_unavailable"
      : phase === "stream" ? "chat_response_interrupted" : "chat_provider_unavailable";
  const message = code === "chat_model_unavailable"
    ? "Deity's AI model is temporarily unavailable. The service needs attention; please try again later."
    : code === "chat_provider_access_unavailable"
      ? "Deity's AI provider is temporarily unavailable. Please try again later."
      : phase === "stream"
        ? "Deity's response was interrupted. Please try again; no automatic retry was made."
        : "Deity couldn't complete a response just now. Please try again later.";
  // Never include exception messages, request URLs, keys, prompts, profile data or raw IPs.
  return { code, message: `${message} Reference: ${requestId}.`, requestId, phase, upstreamStatus: status };
}
