/**
 * ranks.js — Centralized Rank Tier Configuration
 *
 * Single source of truth for every rank tier in the RunCheck badge system.
 * Import rank data from this file — never hard-code tier thresholds elsewhere.
 *
 * Tier ladder (total points):
 *   🥉 Bronze   —     0–199
 *   🥈 Silver   —   200–599
 *   ✨ Gold     —   600–1,499
 *   💎 Platinum — 1,500–3,499
 *   💠 Diamond  — 3,500–7,499
 *   👑 Legend   — 7,500+
 *
 * Each rank carries a `perks` array of perk IDs (defined in config/perks.js).
 * Perks are display/config groundwork — enforcement is handled separately.
 *
 * Point values and action labels live in config/points.js (not here).
 * Rank computation helpers live in utils/rankHelpers.js.
 *
 * Field notes:
 *   `label` — Canonical display name (preferred for new code).
 *   `name`  — Backward-compatible alias for `label`. Existing screens and
 *             services reference `rank.name` extensively; this field avoids
 *             a big-bang rename across every consumer.
 *   `maxPoints`  — Upper bound of this tier (null for max rank).
 *   `nextRankAt` — Backward-compatible alias: minPoints of the next tier,
 *                  or null if max rank. Existing screens use this for
 *                  progress bars and "X pts to next rank" display.
 */

const RANKS = [
  {
    id: 'bronze',
    label: 'Bronze',
    name: 'Bronze',
    minPoints: 0,
    maxPoints: 199,
    nextRankAt: 200,
    icon: '🥉',
    color: '#CD7F32',
    glowColor: '#CD7F3260',
    perks: [],
  },
  {
    id: 'silver',
    label: 'Silver',
    name: 'Silver',
    minPoints: 200,
    maxPoints: 599,
    nextRankAt: 600,
    icon: '🥈',
    color: '#A8A9AD',
    glowColor: '#A8A9AD60',
    perks: ['player_spotlight_eligible', 'private_runs_weekly_1'],
  },
  {
    id: 'gold',
    label: 'Gold',
    name: 'Gold',
    minPoints: 600,
    maxPoints: 1499,
    nextRankAt: 1500,
    icon: '✨',
    color: '#FFD700',
    glowColor: '#FFD70060',
    perks: ['player_spotlight_eligible', 'private_runs_weekly_1', 'profile_border'],
  },
  {
    id: 'platinum',
    label: 'Platinum',
    name: 'Platinum',
    minPoints: 1500,
    maxPoints: 3499,
    nextRankAt: 3500,
    icon: '💎',
    color: '#E8F4FD',
    glowColor: '#E8F4FD60',
    perks: ['player_spotlight_eligible', 'private_runs_weekly_2', 'profile_border', 'profile_glow'],
  },
  {
    id: 'diamond',
    label: 'Diamond',
    name: 'Diamond',
    minPoints: 3500,
    maxPoints: 7499,
    nextRankAt: 7500,
    icon: '💠',
    color: '#B9F2FF',
    glowColor: '#B9F2FF60',
    perks: ['player_spotlight_eligible', 'private_runs_weekly_3', 'profile_border', 'profile_glow'],
  },
  {
    id: 'legend',
    label: 'Legend',
    name: 'Legend',
    minPoints: 7500,
    maxPoints: null,
    nextRankAt: null,
    icon: '👑',
    color: '#FF4500',
    glowColor: '#FF450060',
    perks: ['player_spotlight_eligible', 'private_runs_weekly_5', 'profile_border', 'profile_glow', 'hall_of_fame'],
  },
];

export { RANKS };
