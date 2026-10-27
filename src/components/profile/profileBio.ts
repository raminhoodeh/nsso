export const JOHN_BIO_PREVIEW = 'Most founders who struggle in the UAE do not lack ambition. They lack access. I learned that firsthand after relocating to Dubai with a business idea and no introductions, local contacts, or shortcuts. Building a trusted network from scratch showed me that access is not a soft advantage here; it is the infrastructure that commercial progress runs on.'

export function getProfileBioPreview(username: string | null | undefined, bio: string) {
    const text = bio.trimEnd()
    if (text.length <= 600) return undefined
    if (username?.toLowerCase() === 'john' && text.startsWith(JOHN_BIO_PREVIEW)) return JOHN_BIO_PREVIEW
    // Prefer a complete opening paragraph or sentence; keep the exact prefix so
    // expansion never duplicates or changes the author's content.
    const paragraphEnd = text.indexOf('\n\n', 240)
    if (paragraphEnd > 0 && paragraphEnd <= 600) return text.slice(0, paragraphEnd)
    const prefix = text.slice(0, 560)
    const sentenceEnd = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '))
    const breakAt = sentenceEnd >= 240 ? sentenceEnd + 1 : Math.max(prefix.lastIndexOf(' '), 400)
    return text.slice(0, breakAt)
}
