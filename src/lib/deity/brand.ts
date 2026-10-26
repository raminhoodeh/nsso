export const NSSO_BRAND_RULE = 'Always write the product name as "nsso" in lowercase, including at the start of a sentence, in headings and in link labels. Preserve URLs and technical identifiers exactly.';

// Apply to visible assistant prose, never URLs, user messages or action payloads.
export function normalizeNssoBrand(text: string): string {
  return text.replace(/\bnsso\b/gi, 'nsso');
}
