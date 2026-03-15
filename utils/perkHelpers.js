/**
 * perkHelpers.js — Perk Resolution Utilities
 *
 * Read-only helpers that resolve which perks a user has based on their
 * rank and Premium status. Display/config groundwork for this phase —
 * no feature enforcement is wired up yet.
 *
 * All perk definitions come from config/perks.js.
 * All rank definitions come from config/ranks.js.
 */

import { PERK_DEFINITIONS, PREMIUM_OVERRIDES } from '../config/perks';

/**
 * getUserPerks — Returns an array of resolved perk definition objects
 * for the given rank, with Premium overrides applied.
 *
 * For quota perks sharing the same `feature` group, only the highest
 * quota perk from the rank is included. If Premium overrides that
 * feature, the quota is replaced with an unlimited entry.
 *
 * @param {object}  rank      — A RANKS entry from config/ranks.js.
 * @param {boolean} isPremium — Whether the user has an active Premium subscription.
 * @returns {object[]} Array of perk definition objects.
 */
export const getUserPerks = (rank, isPremium = false) => {
  if (!rank || !rank.perks) return [];

  // Resolve rank perks from the definition registry
  const resolved = [];
  const quotaByFeature = {}; // feature → highest quota perk

  for (const perkId of rank.perks) {
    const def = PERK_DEFINITIONS[perkId];
    if (!def) continue;

    if (def.type === 'quota' && def.feature) {
      // Track the highest quota perk per feature group
      const existing = quotaByFeature[def.feature];
      if (!existing || def.quota > existing.quota) {
        quotaByFeature[def.feature] = def;
      }
    } else {
      resolved.push(def);
    }
  }

  // Add the winning quota perk for each feature group
  for (const feature of Object.keys(quotaByFeature)) {
    if (isPremium && PREMIUM_OVERRIDES[feature]) {
      // Premium overrides this feature — skip the rank quota perk.
      // The caller can check PREMIUM_OVERRIDES directly for display.
      continue;
    }
    resolved.push(quotaByFeature[feature]);
  }

  return resolved;
};

/**
 * hasPerk — Checks whether the user has a specific perk (by ID).
 *
 * @param {object}  rank      — A RANKS entry.
 * @param {boolean} isPremium — Whether the user has Premium.
 * @param {string}  perkId    — The perk ID to check.
 * @returns {boolean}
 */
export const hasPerk = (rank, isPremium, perkId) => {
  if (!rank || !rank.perks) return false;

  // Direct rank perk check
  if (rank.perks.includes(perkId)) return true;

  // Premium override check — match by feature if the perk is a quota type
  const def = PERK_DEFINITIONS[perkId];
  if (def?.type === 'quota' && def.feature && isPremium) {
    return !!PREMIUM_OVERRIDES[def.feature];
  }

  return false;
};

/**
 * getFeatureQuota — Returns the quota limit for a feature, or Infinity
 * if Premium makes it unlimited.
 *
 * @param {object}  rank       — A RANKS entry.
 * @param {boolean} isPremium  — Whether the user has Premium.
 * @param {string}  featureId  — The feature group id (e.g. 'private_runs').
 * @returns {number} The quota limit, or Infinity, or 0 if no access.
 */
export const getFeatureQuota = (rank, isPremium, featureId) => {
  // Premium override — unlimited
  if (isPremium && PREMIUM_OVERRIDES[featureId]?.unlimited) {
    return Infinity;
  }

  if (!rank || !rank.perks) return 0;

  // Find the highest quota perk for this feature in the rank's perk list
  let maxQuota = 0;
  for (const perkId of rank.perks) {
    const def = PERK_DEFINITIONS[perkId];
    if (def?.type === 'quota' && def.feature === featureId) {
      maxQuota = Math.max(maxQuota, def.quota);
    }
  }

  return maxQuota;
};

/**
 * getRankPerksForDisplay — Returns perk definitions for a rank, suitable
 * for rendering in UI cards (e.g. the "Why Rank Matters" section).
 *
 * Deduplicates quota perks by feature group (keeps highest quota only).
 *
 * @param {object} rank — A RANKS entry.
 * @returns {object[]} Array of perk definition objects.
 */
export const getRankPerksForDisplay = (rank) => {
  if (!rank || !rank.perks || rank.perks.length === 0) return [];

  const resolved = [];
  const quotaByFeature = {};

  for (const perkId of rank.perks) {
    const def = PERK_DEFINITIONS[perkId];
    if (!def) continue;

    if (def.type === 'quota' && def.feature) {
      const existing = quotaByFeature[def.feature];
      if (!existing || def.quota > existing.quota) {
        quotaByFeature[def.feature] = def;
      }
    } else {
      resolved.push(def);
    }
  }

  // Append deduplicated quota perks
  for (const def of Object.values(quotaByFeature)) {
    resolved.push(def);
  }

  return resolved;
};
