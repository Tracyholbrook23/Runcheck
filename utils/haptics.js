/**
 * haptics.js — Lightweight haptic feedback helpers
 *
 * Wraps expo-haptics with safe no-op fallbacks so calls never crash
 * on devices/simulators without haptic support.
 *
 * Usage:
 *   import { hapticSuccess, hapticLight, hapticMedium } from '../utils/haptics';
 *   hapticSuccess(); // check-in, post clip, join run
 *   hapticMedium();  // record button press
 *   hapticLight();   // minor interactions
 */

import * as Haptics from 'expo-haptics';

/** Success notification — use for check-in, join run, post clip */
export const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
};

/** Light impact — use for minor taps, toggles */
export const hapticLight = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
};

/** Medium impact — use for record button, significant interactions */
export const hapticMedium = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
};

/** Heavy impact — use sparingly */
export const hapticHeavy = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
};
