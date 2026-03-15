/**
 * badges.js — DEPRECATED Re-Export Shim
 *
 * This file previously contained all rank tier definitions, point values,
 * action labels, and rank computation helpers. Those have been split into:
 *
 *   config/ranks.js       — Rank tier definitions (RANKS)
 *   config/points.js      — Point values (POINT_VALUES) and action metadata (ACTION_LABELS)
 *   utils/rankHelpers.js  — Rank computation (getUserRank, getProgressToNextRank)
 *
 * This shim re-exports everything so existing imports continue to work.
 * New code should import directly from the canonical locations above.
 *
 * @deprecated — Import from config/ranks, config/points, or utils/rankHelpers instead.
 */

export { RANKS } from '../config/ranks';
export { POINT_VALUES, ACTION_LABELS } from '../config/points';
export { getUserRank, getProgressToNextRank } from '../utils/rankHelpers';
