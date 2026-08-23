export const JOHN_BIO_PREVIEW = 'Most founders who struggle in the UAE do not lack ambition. They lack access. I learned that firsthand after relocating to Dubai with a business idea and no introductions, local contacts, or shortcuts. Building a trusted network from scratch showed me that access is not a soft advantage here; it is the infrastructure that commercial progress runs on.'

export function getProfileBioPreview(username: string | null | undefined, bio: string) {
    if (username?.toLowerCase() !== 'john' || !bio.startsWith(JOHN_BIO_PREVIEW)) {
        return undefined
    }

    return JOHN_BIO_PREVIEW
}
