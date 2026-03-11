/**
 * gymAssets.js — Per-gym local image overrides
 *
 * Maps Firestore gym IDs to bundled local assets. When an entry exists here
 * the local image is used instead of gym.imageUrl from Firestore, so the
 * correct branded image is shown even if the remote URL changes or is absent.
 *
 * Add an entry here whenever a gym should use a local asset rather than a
 * remote URL. Keyed by the exact Firestore document ID (gym slug).
 */
export const GYM_LOCAL_IMAGES = {
  'cowboys-fit-pflugerville': require('../assets/cowboyfitgym.png'),
};
