/**
 * betaFlags.js — Beta feature toggles
 *
 * Centralized on/off switches for features that are hidden during the beta.
 * Flip a flag back to true here to re-enable the feature everywhere at once.
 *
 * No backend changes required for any of these flags — they are client-only gates.
 */

export const BETA_FLAGS = {
  /** Clips — recording, posting, gym highlights, profile sections. Not ready. */
  clipsEnabled: false,

  /** Premium page + Private/Paid Run entry points. Billing not wired. */
  premiumEnabled: false,

  /** Last Week's Winners leaderboard section. Date copy is confusing. */
  weeklyWinnersEnabled: false,

  /** Gym review submit button. Flip to false if device QA fails. */
  reviewsSubmitEnabled: true,
};
