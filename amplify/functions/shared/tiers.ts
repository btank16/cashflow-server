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
  dailyLimit: number | null;      // null = unlimited
  monthlyLimit: number | null;    // null = unlimited
  features: string[];
  color: string;                  // For UI display
  emoji: string;
}

// Feature flags
export const FEATURES = {
  RESIDENT_AI: 'resident-ai',
  BASIC_CALCULATORS: 'basic-calculators',
  SAVE_CALCULATIONS: 'save-calculations',
} as const;

export const TIERS: Record<TierName, TierConfig> = {
  basic: {
    displayName: 'Free',
    dailyLimit: 0,
    monthlyLimit: 0,
    features: [FEATURES.BASIC_CALCULATORS, FEATURES.SAVE_CALCULATIONS],
    color: '#8E8E93',
    emoji: '🆓',
  },
  beta: {
    displayName: 'Beta Tester',
    dailyLimit: 3,
    monthlyLimit: null,  // No monthly limit for beta users
    features: [
      FEATURES.BASIC_CALCULATORS,
      FEATURES.SAVE_CALCULATIONS,
      FEATURES.RESIDENT_AI,
    ],
    color: '#AF52DE',
    emoji: '🧪',
  },
  premium: {
    displayName: 'Premium',
    dailyLimit: 25,
    monthlyLimit: 500,
    features: [
      FEATURES.BASIC_CALCULATORS,
      FEATURES.SAVE_CALCULATIONS,
      FEATURES.RESIDENT_AI,
    ],
    color: '#007AFF',
    emoji: '⭐',
  },
  platinum: {
    displayName: 'Platinum',
    dailyLimit: 100,
    monthlyLimit: 2000,
    features: [
      FEATURES.BASIC_CALCULATORS,
      FEATURES.SAVE_CALCULATIONS,
      FEATURES.RESIDENT_AI,
    ],
    color: '#FF9500',
    emoji: '🚀',
  },
  admin: {
    displayName: 'Admin',
    dailyLimit: null,
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
