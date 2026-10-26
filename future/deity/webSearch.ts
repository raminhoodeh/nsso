/**
 * Web Search Utility
 * Uses Google Custom Search API to find profile URLs
 */

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
    displayLink: string;
}

export interface ProfileSearchResult {
    platform: string;
    url: string;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Search the web using Google Custom Search API
 */
export async function searchWeb(query: string, limit: number = 5): Promise<SearchResult[]> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (!apiKey || !searchEngineId) {
        console.error('Missing Google Search API credentials');
        return [];
    }

    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${limit}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error('Google Search API error:', response.statusText);
            return [];
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            return [];
        }

        return data.items.map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet,
            displayLink: item.displayLink,
        }));
    } catch (error) {
        console.error('Error searching web:', error);
        return [];
    }
}

/**
 * Find a user's profile URL on a specific platform
 */
export async function findProfileUrl(
    fullName: string,
    platform: 'linkedin' | 'github' | 'twitter' | 'instagram' | 'facebook',
    additionalContext?: string
): Promise<ProfileSearchResult | null> {
    // Build search query
    let query = `${fullName} ${platform}`;
    if (additionalContext) {
        query += ` ${additionalContext}`;
    }

    const results = await searchWeb(query, 3);

    if (results.length === 0) {
        return null;
    }

    // Platform-specific URL patterns
    const platformPatterns: Record<string, RegExp> = {
        linkedin: /linkedin\.com\/in\/[\w-]+/i,
        github: /github\.com\/[\w-]+/i,
        twitter: /twitter\.com\/[\w]+|x\.com\/[\w]+/i,
        instagram: /instagram\.com\/[\w.]+/i,
        facebook: /facebook\.com\/[\w.]+/i,
    };

    const pattern = platformPatterns[platform];

    // Find first result matching the platform pattern
    for (const result of results) {
        if (pattern.test(result.link)) {
            // Determine confidence based on position and title match
            let confidence: 'high' | 'medium' | 'low' = 'medium';

            if (results.indexOf(result) === 0 && result.title.toLowerCase().includes(fullName.toLowerCase())) {
                confidence = 'high';
            } else if (results.indexOf(result) > 1) {
                confidence = 'low';
            }

            return {
                platform,
                url: result.link,
                confidence,
            };
        }
    }

    return null;
}

/**
 * Find multiple profile URLs for a user
 */
export async function findMultipleProfiles(
    fullName: string,
    platforms: Array<'linkedin' | 'github' | 'twitter' | 'instagram' | 'facebook'>,
    additionalContext?: string
): Promise<ProfileSearchResult[]> {
    const promises = platforms.map(platform =>
        findProfileUrl(fullName, platform, additionalContext)
    );

    const results = await Promise.all(promises);

    return results.filter((r): r is ProfileSearchResult => r !== null);
}

/**
 * Extract platform name from user intent
 */
export function detectPlatform(message: string): 'linkedin' | 'github' | 'twitter' | 'instagram' | 'facebook' | null {
    const messageLower = message.toLowerCase();

    if (messageLower.includes('linkedin')) return 'linkedin';
    if (messageLower.includes('github')) return 'github';
    if (messageLower.includes('twitter') || messageLower.includes('x.com')) return 'twitter';
    if (messageLower.includes('instagram') || messageLower.includes('insta')) return 'instagram';
    if (messageLower.includes('facebook') || messageLower.includes('fb')) return 'facebook';

    return null;
}

/**
 * Suggest link name based on platform
 */
export function suggestLinkNameForPlatform(platform: string): string {
    const nameMap: Record<string, string> = {
        linkedin: 'LinkedIn',
        github: 'GitHub',
        twitter: 'X (Twitter)',
        instagram: 'Instagram',
        facebook: 'Facebook',
    };

    return nameMap[platform.toLowerCase()] || platform;
}
