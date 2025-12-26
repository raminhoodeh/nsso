// Earnings utility functions and constants

export const PREMIUM_PRICE = 8.00; // £8 per month
export const COMMISSION_RATE = 0.40; // 40% commission

/**
 * Calculate expected monthly earnings based on active referrals
 */
export function calculateExpectedEarnings(activeReferralCount: number): number {
    return activeReferralCount * PREMIUM_PRICE * COMMISSION_RATE;
}

/**
 * Format earnings amount as currency string
 */
export function formatEarnings(amount: number): string {
    return `£${amount.toFixed(2)}`;
}

/**
 * Validate PayPal.me slug format
 * Should be alphanumeric, hyphens, underscores only
 */
export function validatePayPalSlug(slug: string): boolean {
    if (!slug || slug.length === 0) return true; // Allow empty
    if (slug.length > 50) return false; // Max length

    // Allow alphanumeric, hyphens, underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(slug);
}

/**
 * Generate referral code in format: NEWCV + 3 digits
 * Note: Actual generation happens in database for uniqueness guarantee
 */
export function generateReferralCodeFormat(): string {
    const randomDigits = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `NEWCV${randomDigits}`;
}

export interface EarningsStats {
    referralCode: string;
    activeReferrals: number;
    expectedEarnings: number;
    paypalMeSlug: string | null;
}
