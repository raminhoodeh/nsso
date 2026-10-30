import type { TahoeDisplacementField } from './optics'

/** Provider-owned LRU for immutable geometry; it never retains DOM elements. */
export class TahoeDisplacementFieldCache {
    private readonly entries = new Map<string, TahoeDisplacementField>()
    private retainedPixels = 0

    constructor(private readonly maxEntries = 32, private readonly maxPixels = 2 * 1024 * 1024) {}

    get size() { return this.entries.size }
    get pixels() { return this.retainedPixels }

    getOrCreate(key: string, create: () => TahoeDisplacementField | null): TahoeDisplacementField | null {
        const cached = this.entries.get(key)
        if (cached) {
            this.entries.delete(key)
            this.entries.set(key, cached)
            return cached
        }
        const field = create()
        if (!field) return null
        const pixels = field.pixelWidth * field.pixelHeight
        if (this.maxEntries <= 0 || pixels > this.maxPixels) return field
        while (this.entries.size && (this.entries.size >= this.maxEntries || this.retainedPixels + pixels > this.maxPixels)) {
            const oldestKey = this.entries.keys().next().value!
            const oldest = this.entries.get(oldestKey)!
            this.retainedPixels -= oldest.pixelWidth * oldest.pixelHeight
            this.entries.delete(oldestKey)
        }
        this.entries.set(key, field)
        this.retainedPixels += pixels
        return field
    }

    clear(): void {
        this.entries.clear()
        this.retainedPixels = 0
    }
}
