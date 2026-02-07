/**
 * Tier Configuration for Cashflow Beta Access System
 *
 * Maps to existing Cognito groups: basic, beta, premium, platinum, admin
 */

/**
 * Cognito group names - centralized constants
 */
export const COGNITO_GROUPS = {
  BASIC: 'basic',
  BETA: 'beta',
  PREMIUM: 'premium',
  PLATINUM: 'platinum',
  ADMIN: 'admin',
} as const;

export type TierName = 'basic' | 'beta' | 'premium' | 'platinum' | 'admin';

export interface TierConfig {
  displayName: string;
  monthlyLimit: number | null;    // null = unlimited
  features: string[];
  color: string;                  // For UI display
  emoji: string;
}

// Feature flags
export const FEATURES = {
  RESIDENT_AI: 'resident-ai',
  CALCULATION_DATABASE: 'calculation-database',
  EXPENSE_DATABASE: 'expense-database',
  GEMINI_ARTICLES: 'gemini-articles',
  INTEREST_RATE_LOOKUP: 'interest-rate-lookup',
  OFFER_LETTER: 'offer-letter',
  BRANDED_PDF: 'branded-pdf',
} as const;

export const TIERS: Record<TierName, TierConfig> = {
  basic: {
    displayName: 'Free',
    monthlyLimit: 3,
    features: [
      FEATURES.RESIDENT_AI,
      FEATURES.CALCULATION_DATABASE,
      FEATURES.INTEREST_RATE_LOOKUP,
    ],
    color: '#8E8E93',
    emoji: '🆓',
  },
  beta: {
    displayName: 'Beta Tester',
    monthlyLimit: 50,
    features: [
      FEATURES.RESIDENT_AI,
      FEATURES.CALCULATION_DATABASE,
      FEATURES.EXPENSE_DATABASE,
      FEATURES.GEMINI_ARTICLES,
      FEATURES.INTEREST_RATE_LOOKUP,
      FEATURES.OFFER_LETTER,
      FEATURES.BRANDED_PDF,
    ],
    color: '#AF52DE',
    emoji: '🧪',
  },
  premium: {
    displayName: 'Premium',
    monthlyLimit: 50,
    features: [
      FEATURES.RESIDENT_AI,
      FEATURES.CALCULATION_DATABASE,
      FEATURES.EXPENSE_DATABASE,
      FEATURES.GEMINI_ARTICLES,
      FEATURES.INTEREST_RATE_LOOKUP,
    ],
    color: '#007AFF',
    emoji: '⭐',
  },
  platinum: {
    displayName: 'Platinum',
    monthlyLimit: 200,
    features: [
      FEATURES.RESIDENT_AI,
      FEATURES.CALCULATION_DATABASE,
      FEATURES.EXPENSE_DATABASE,
      FEATURES.GEMINI_ARTICLES,
      FEATURES.INTEREST_RATE_LOOKUP,
      FEATURES.OFFER_LETTER,
      FEATURES.BRANDED_PDF,
    ],
    color: '#FF9500',
    emoji: '🚀',
  },
  admin: {
    displayName: 'Admin',
    monthlyLimit: null,
    features: ['all'],
    color: '#34C759',
    emoji: '👑',
  },
};

/**
 * Determine tier from Cognito groups (priority order: highest tier wins)
 */
export function getTierFromCognitoGroups(groups: string[]): TierName {
  if (groups.includes(COGNITO_GROUPS.ADMIN)) return 'admin';
  if (groups.includes(COGNITO_GROUPS.PLATINUM)) return 'platinum';
  if (groups.includes(COGNITO_GROUPS.PREMIUM)) return 'premium';
  if (groups.includes(COGNITO_GROUPS.BETA)) return 'beta';
  return 'basic';
}

/**
 * Check if a tier has access to a specific feature
 */
export function tierHasFeature(tier: TierName, feature: string): boolean {
  const tierConfig = TIERS[tier];
  return tierConfig.features.includes('all') || tierConfig.features.includes(feature);
}

/**
 * Get tier configuration by name
 */
export function getTierConfig(tier: TierName): TierConfig {
  return TIERS[tier];
}

/**
 * Tier ranking for upgrade/downgrade detection
 */
const TIER_RANK: Record<TierName, number> = {
  basic: 0,
  beta: 1,
  premium: 2,
  platinum: 3,
  admin: 4,
};

/**
 * Check if a tier change is an upgrade (higher tier)
 */
export function isUpgrade(fromTier: TierName, toTier: TierName): boolean {
  return TIER_RANK[toTier] > TIER_RANK[fromTier];
}

/**
 * Check if a tier change is a downgrade (lower tier)
 */
export function isDowngrade(fromTier: TierName, toTier: TierName): boolean {
  return TIER_RANK[toTier] < TIER_RANK[fromTier];
}
