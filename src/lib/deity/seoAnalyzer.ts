
export interface SeoAnalysis {
    score: number // 0-10
    suggestions: string[]
}

const POWER_WORDS = [
    'building', 'creating', 'transforming', 'scaling', 'driving', 'leading',
    'innovative', 'strategic', 'data-driven', 'results-oriented', 'helping',
    'experienced', 'expert', 'passionate', 'dedicated', 'proven', 'track record'
]

const BUZZWORDS = [
    'ninja', 'rockstar', 'guru', 'wizard', 'hacker', 'visionary', 'disruptor'
]

export function analyzeSEO(text: string, type: 'bio' | 'headline' | 'description', context?: string): SeoAnalysis {
    if (!text) return { score: 0, suggestions: ['Content is empty'] }

    let score = 5 // Start baseline
    const suggestions: string[] = []
    const lowerText = text.toLowerCase()

    // 1. Length Check
    const length = text.length
    if (type === 'headline') {
        if (length < 20) {
            score -= 2
            suggestions.push('Too short. Add more detail about your role and value.')
        } else if (length > 120) {
            score -= 1
            suggestions.push('Bit long. Try to stay under 120 characters for best visibility.')
        } else if (length >= 40 && length <= 100) {
            score += 2
        }
    } else if (type === 'bio') {
        if (length < 50) {
            score -= 2
            suggestions.push('Bio is very short. Elaborate on your experience.')
        } else if (length > 300) {
            // Long bios are okay, but concise is better
            // score unchanged
        } else {
            score += 1
        }
    }

    // 2. Power Words
    const powerWordCount = POWER_WORDS.filter(w => lowerText.includes(w)).length
    if (powerWordCount > 0) {
        score += Math.min(powerWordCount, 3) // Max +3 for power words
    } else {
        suggestions.push('Consider using action verbs like "building", "scaling", or "helping".')
    }

    // 3. Buzzwords (Penalize)
    const buzzwordCount = BUZZWORDS.filter(w => lowerText.includes(w)).length
    if (buzzwordCount > 0) {
        score -= buzzwordCount
        suggestions.push(`Avoid overused clichés like "${BUZZWORDS.find(w => lowerText.includes(w))}"`)
    }

    // 4. Formatting (Headline specific)
    if (type === 'headline' && !text.includes('|') && !text.includes('•') && !text.includes('-')) {
        suggestions.push('Consider using separators (| or •) to organize your headline.')
        // e.g. "Role | Company"
    }

    // Cap score 0-10
    score = Math.max(0, Math.min(10, score))

    return {
        score,
        suggestions
    }
}
