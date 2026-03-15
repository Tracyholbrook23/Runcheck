/**
 * perks.js — Perk Definitions & Premium Overrides
 *
 * Registry of all perks that can be attached to rank tiers. Each rank in
 * config/ranks.js carries a `perks` array of perk IDs that reference
 * entries in PERK_DEFINITIONS below.
 *
 * This file is display/config groundwork. Enforcement logic (e.g. private-run
 * quota checking) is NOT wired up in this phase. Helper functions for
 * resolving perks live in utils/perkHelpers.js.
 *
 * Design rule:
 *   Ranks provide LIMITED perks (prestige + capped quotas).
 *   Premium provides UNLIMITED tool/convenience features.
 *   Premium does NOT grant prestige cosmetics (profile_border, profile_glow).
 */

export const PERK_DEFINITIONS = {
  player_spotlight_eligible: {
    id: 'player_spotlight_eligible',
    label: 'Player Spotlight',
    description: 'Eligible for weekly player spotlight on socials.',
    icon: 'megaphone-outline',
    iconColor: '#5B8FF9',
    type: 'boolean',
  },
  private_runs_weekly_1: {
    id: 'private_runs_weekly_1',
    label: 'Private Runs',
    description: '1 private run per week.',
    icon: 'lock-closed-outline',
    iconColor: '#52C41A',
    type: 'quota',
    quota: 1,
    period: 'weekly',
    feature: 'private_runs',
  },
  private_runs_weekly_2: {
    id: 'private_runs_weekly_2',
    label: 'Private Runs',
    description: '2 private runs per week.',
    icon: 'lock-closed-outline',
    iconColor: '#52C41A',
    type: 'quota',
    quota: 2,
    period: 'weekly',
    feature: 'private_runs',
  },
  private_runs_weekly_3: {
    id: 'private_runs_weekly_3',
    label: 'Private Runs',
    description: '3 private runs per week.',
    icon: 'lock-closed-outline',
    iconColor: '#52C41A',
    type: 'quota',
    quota: 3,
    period: 'weekly',
    feature: 'private_runs',
  },
  private_runs_weekly_5: {
    id: 'private_runs_weekly_5',
    label: 'Private Runs',
    description: '5 private runs per week.',
    icon: 'lock-closed-outline',
    iconColor: '#52C41A',
    type: 'quota',
    quota: 5,
    period: 'weekly',
    feature: 'private_runs',
  },
  profile_border: {
    id: 'profile_border',
    label: 'Profile Border',
    description: 'Colored border around your profile avatar.',
    icon: 'ellipse-outline',
    iconColor: '#FFD700',
    type: 'boolean',
  },
  profile_glow: {
    id: 'profile_glow',
    label: 'Profile Glow',
    description: 'Animated glow effect on your profile.',
    icon: 'sparkles-outline',
    iconColor: '#E8F4FD',
    type: 'boolean',
  },
  hall_of_fame: {
    id: 'hall_of_fame',
    label: 'Hall of Fame',
    description: 'Permanent spot in the Hall of Fame.',
    icon: 'star-outline',
    iconColor: '#FF4500',
    type: 'boolean',
  },
};

/**
 * PREMIUM_OVERRIDES — Features that Premium unlocks beyond any rank limit.
 *
 * Scoped to tool/convenience features only. Prestige cosmetics
 * (profile_border, profile_glow) are intentionally excluded — those
 * remain rank-based rewards.
 */
export const PREMIUM_OVERRIDES = {
  private_runs: { unlimited: true, label: 'Unlimited Private Runs' },
};
