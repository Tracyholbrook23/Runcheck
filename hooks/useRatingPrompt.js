/**
 * useRatingPrompt.js — Contextual app rating prompt
 *
 * Fires a "Enjoying RunCheck?" interstitial at happy milestones:
 *   5th check-in, 20th, 50th (and every 50 after that).
 *
 * Flow:
 *   Happy moment fires → "Enjoying RunCheck?" modal
 *     ├─ "Yes, love it!"  → native StoreReview dialog (Apple rating sheet)
 *     └─ "Not really"     → opens support email (feedback instead of bad review)
 *
 * Throttle: AsyncStorage key `@runcheck_last_rating_prompt` stores the
 * attended-count at which we last asked. We never ask twice at the same
 * milestone even if the component remounts.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

// Replace with your App Store numeric ID once the app is live.
// For TestFlight, this opens the TestFlight listing instead.
const APP_STORE_URL = 'https://apps.apple.com/app/id<YOUR_APP_ID>?action=write-review';
const TESTFLIGHT_URL = 'https://testflight.apple.com';

const STORAGE_KEY = '@runcheck_last_rating_prompt_count';

// Milestones that trigger the prompt
const MILESTONES = [5, 20, 50];
const REPEAT_EVERY = 50; // after 50, repeat every 50

function isMilestone(count) {
  if (MILESTONES.includes(count)) return true;
  if (count > 50 && count % REPEAT_EVERY === 0) return true;
  return false;
}

/**
 * Returns a `checkForRatingPrompt(totalAttended, showModal)` function.
 * Call it right after a successful check-in, passing the updated attended count
 * and a `showModal` callback that opens your RatingModal.
 */
export function useRatingPrompt() {
  const checkForRatingPrompt = useCallback(async (totalAttended, showModal) => {
    if (!isMilestone(totalAttended)) return;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const lastPromptedAt = raw ? parseInt(raw, 10) : 0;

      // Don't re-prompt the same milestone
      if (lastPromptedAt >= totalAttended) return;

      // Save now so even if they kill the app we don't ask again
      await AsyncStorage.setItem(STORAGE_KEY, String(totalAttended));

      // Show the modal
      showModal();
    } catch {
      // Never crash the check-in flow
    }
  }, []);

  const handleLoveIt = useCallback(async () => {
    try {
      // Once the app is live on the App Store, swap TESTFLIGHT_URL → APP_STORE_URL.
      // For now this opens TestFlight so beta testers can leave feedback there.
      await Linking.openURL(TESTFLIGHT_URL);
    } catch {
      // Silent — never block the user
    }
  }, []);

  const handleNotReally = useCallback(() => {
    Linking.openURL(
      'mailto:hello@theruncheck.app?subject=RunCheck%20Feedback&body=Hey%20RunCheck%20team%2C%0A%0A'
    );
  }, []);

  return { checkForRatingPrompt, handleLoveIt, handleNotReally };
}
