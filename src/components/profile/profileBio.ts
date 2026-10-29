export const PROFILE_TEXT_PREVIEW_LIMIT = 75

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** An exact saved-text prefix, reserving one of the 75 characters for the ellipsis. */
export function getProfileTextPreview(text: string): string | undefined {
    if (!text.trim()) return undefined

    let count = 0
    let prefixEnd = 0
    for (const part of graphemes.segment(text)) {
        if (count === PROFILE_TEXT_PREVIEW_LIMIT) return text.slice(0, prefixEnd).trimEnd()
        count += 1
        if (count < PROFILE_TEXT_PREVIEW_LIMIT) prefixEnd = part.index + part.segment.length
    }
    return undefined
}

/** Keep callers compatible; profile identity does not change the shared limit. */
export function getProfileBioPreview(username: string | null | undefined, bio: string) {
    void username
    return getProfileTextPreview(bio)
}
