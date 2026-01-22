/**
 * Link Validation Utility
 * Checks link health, validates URLs, and detects issues
 */

export interface LinkValidation {
    linkId: string;
    url: string;
    status: 'valid' | 'invalid' | 'redirect' | 'slow' | 'unknown';
    statusCode?: number;
    responseTime?: number;
    finalUrl?: string; // if redirected
    error?: string;
}

/**
 * Validate a single URL
 */
export async function validateUrl(url: string): Promise<Omit<LinkValidation, 'linkId'>> {
    const startTime = Date.now();

    try {
        // Ensure URL has protocol
        const urlToCheck = url.startsWith('http') ? url : `https://${url}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(urlToCheck, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        // Determine status
        let status: LinkValidation['status'] = 'valid';
        if (response.status >= 400) {
            status = 'invalid';
        } else if (response.redirected) {
            status = 'redirect';
        } else if (responseTime > 3000) {
            status = 'slow';
        }

        return {
            url: urlToCheck,
            status,
            statusCode: response.status,
            responseTime,
            finalUrl: response.redirected ? response.url : undefined,
        };
    } catch (error: any) {
        return {
            url,
            status: 'invalid',
            error: error.message || 'Failed to reach URL',
        };
    }
}

/**
 * Validate multiple links in parallel
 */
export async function validateLinks(links: Array<{ id: string; url: string }>): Promise<LinkValidation[]> {
    const validationPromises = links.map(async (link) => {
        const result = await validateUrl(link.url);
        return {
            linkId: link.id,
            ...result,
        };
    });

    return Promise.all(validationPromises);
}

/**
 * Check if URL is a known dead platform
 */
export function isDeadPlatform(url: string): boolean {
    const deadPlatforms = [
        'myspace.com',
        'vine.co',
        'googleplus.com',
        'plus.google.com',
        'friendster.com',
        'orkut.com',
    ];

    return deadPlatforms.some(platform => url.toLowerCase().includes(platform));
}

/**
 * Suggest better link name based on URL
 */
export function suggestLinkName(url: string, currentName: string): string | null {
    const urlLower = url.toLowerCase();

    const suggestions: Record<string, string> = {
        'linkedin.com/in': 'LinkedIn',
        'github.com': 'GitHub',
        'twitter.com': 'X (Twitter)',
        'x.com': 'X (Twitter)',
        'instagram.com': 'Instagram',
        'facebook.com': 'Facebook',
        'youtube.com': 'YouTube',
        'tiktok.com': 'TikTok',
        'behance.net': 'Behance',
        'dribbble.com': 'Dribbble',
        'medium.com': 'Medium',
        'substack.com': 'Newsletter',
    };

    for (const [pattern, suggestion] of Object.entries(suggestions)) {
        if (urlLower.includes(pattern) && currentName !== suggestion) {
            return suggestion;
        }
    }

    // Suggest "Portfolio" for personal domains
    if (currentName.toLowerCase().includes('website') || currentName.toLowerCase().includes('my site')) {
        return 'Portfolio';
    }

    return null;
}

/**
 * Get optimal link order based on industry best practices
 */
export function suggestLinkOrder(links: Array<{ id: string; name: string; url: string }>): string[] {
    const priorityOrder = [
        'linkedin',
        'github',
        'portfolio',
        'website',
        'twitter',
        'x ',
        'medium',
        'youtube',
        'instagram',
        'facebook',
        'tiktok',
    ];

    return links
        .sort((a, b) => {
            const aIndex = priorityOrder.findIndex(p =>
                a.name.toLowerCase().includes(p) || a.url.toLowerCase().includes(p)
            );
            const bIndex = priorityOrder.findIndex(p =>
                b.name.toLowerCase().includes(p) || b.url.toLowerCase().includes(p)
            );

            // If both match, use their priority index
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }

            // If only one matches, it comes first
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;

            // Neither matches, maintain original order
            return 0;
        })
        .map(link => link.id);
}
