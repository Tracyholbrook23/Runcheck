# RunCheck — Parking Lot

Good ideas that are **not launch-critical**. They live here so they don't get lost and don't cause scope creep.

Nothing in this file should be worked on during a session unless the user explicitly promotes it. If an idea gets promoted to active work, move it to `LAUNCH_CHECKLIST.md` or a task definition and remove it from here.

---

## Clips & Media Enhancements

- Clip reactions beyond likes (fire, cold, etc.)
- Clip comments / threaded discussion
- Clip categories and filtering (dunks, assists, defense, etc.)
- Auto-generated highlight reels from a session's clips
- Clip sharing to Instagram Stories / TikTok with RunCheck watermark
- Background music / audio overlay on clips
- Slow-motion playback toggle in ClipPlayerScreen
- Premium clip features: longer duration, more weekly uploads, priority processing

---

## Social Features

- In-app messaging / chat (DMs or gym-level group chat)
- "Challenge" system (1v1 or crew vs crew invites)
- Crew/team creation and management
- Follow other players (not just gyms)
- Notification system (push notifications for runs, tags, friend activity)
- "Who's going tonight?" pre-commitment feed

---

## Check-in & Presence

- **Smart proximity check-in prompt** — When the app is open and the user is within a gym's `checkInRadiusMeters`, show a user-confirmed prompt: "Looks like you're at [Gym Name]. Check in now?" Reduces friction without auto-check-in risks (privacy, permissions, App Store, wrong-gym false positives). Revisit after launch once core check-in reliability is proven.

---

## Discovery & Recommendations

- "Suggested gyms" based on location and play history
- "Players like you" recommendations based on skill level and gym overlap
- Gym search by amenities, court type, hours
- City-level discovery page (browse gyms outside home city)
- Trending gyms / hot spots indicator
- Integration with Google Maps for directions

---

## Gamification & Competition

- Badges / achievements (streak badges, gym explorer, early bird, etc.)
- Seasonal leaderboard resets with rewards
- XP multiplier events (double points weekends)
- Rank decay for inactivity (use it or lose it)
- Gym-level leaderboards (top players at each gym)
- "Run streak" tracking (consecutive weeks with a completed run)

---

## UI & Polish

- Dark mode refinement and per-screen audit
- Animated transitions between screens
- Skeleton loading screens (replace spinners with content placeholders)
- Haptic feedback on key actions (check-in, join run, post clip)
- Pull-to-refresh on all list screens
- Onboarding tutorial / walkthrough for new users
- Accessibility audit (VoiceOver, Dynamic Type, contrast)

---

## Monetization & Growth

- Premium subscription tier (expanded clip limits, exclusive perks, priority support)
- Gym partnership program (verified gym pages, promoted listings)
- Referral system (invite friends, earn bonus points)
- Sponsored runs or events
- Merchandise / swag store integration
- Analytics dashboard for gym owners

---

## Technical Improvements (Non-Blocking)

- **GPS timeout + stale-fix hardening** — `getCurrentPositionAsync` in `locationUtils.js` currently uses no explicit `timeout` or `maximumAge`. Add `timeout: 15000` (15s hard ceiling) and `maximumAge: 30000` (reject fixes older than 30s) to prevent indefinite spinner hangs indoors and reduce stale-cache risk. 2-line change, existing catch block already handles the thrown error. Low risk.
- **Silent-error banners on core screens** — HomeScreen, ViewRunsScreen, and RunDetailsScreen currently swallow fetch/snapshot errors and fall back to empty states silently. Add a dismissible error banner ("Something went wrong — pull to refresh") so users know data may be stale vs. genuinely empty. Low risk, post-launch quality improvement.
- **Deduplicate reliability subscriptions on ProfileScreen** — `useReliability()` hook and an inline `onSnapshot` both listen to `users/{uid}` and both extract `reliability`. The inline listener also reads `receivedRequests` and other fields, so it can't be removed outright, but the `reliability` state variable (line ~215) is redundant with the hook's `stats` return value. Consolidate to a single source when convenient.
- Migrate remaining gym images to Firebase Storage
- Switch `useTaggedClips` to native `taggedUserIds` array-contains query
- Server-side presence auto-expiry Cloud Function
- Composite Firestore indexes for scale (`activity`, `gymClips`)
- Deprecate stale `addGym` Cloud Function
- End-to-end test suite for critical flows
- CI/CD pipeline for automated builds and deploys
- Firestore Security Rules audit and tightening

---

_Last updated: 2026-03-17_
_To add an idea: append it to the relevant section with a brief description. Do not act on it without explicit approval._
