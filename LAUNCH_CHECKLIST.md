# RunCheck — Launch Checklist

This file tracks what must be true before RunCheck ships.
Items are organized by area. Check them off as they are completed.
If something isn't on this list, it's either already done or it belongs in `PARKING_LOT.md`.

**Priority order:** Launch-Critical → High-Priority Functional → Reliability & Trust → Core UX → UI Polish → Post-Launch.

---

## ⚠️ Launch-Critical Data Integrity

- [x] **Gym existence audit** — All currently active gyms verified as real, operating facilities. Non-existent/unconfirmed gyms archived. (2026-04-23)
- [x] **Basketball court verification** — All active gyms confirmed to have playable basketball courts. (2026-04-23)
- [x] **Address accuracy** — Addresses, cities, and states verified for all active gyms. (2026-04-23)
- [x] **Coordinate audit** — Coordinates verified for all active gyms. Prior sessions corrected multiple Michigan gyms (IM West, IM Circle, Court One, etc.). (2026-04-23)
- [x] **Directions test (Apple Maps + Google Maps)** — Verified alongside coordinate audit. (2026-04-23)
- [x] **Check-in radius re-validation** — Confirmed for all active gyms following coordinate corrections. (2026-04-23)

---

## High-Priority Functional Fixes

- [x] **Email verification flow** — Replaced Firebase's default email delivery with branded flow via Resend from `noreply@theruncheck.app`. RunCheck logo, dark template, confirmed working on device. (2026-04-23)
- [x] **Leaderboard score floor — weekly points must never go negative** — `penalizePoints` was clamping `totalPoints` correctly but applying the same deduction to `weeklyPoints` unchecked, allowing weekly scores to go negative (e.g. −15 on leaderboard). Fixed: each field is now clamped independently using its own current value. Same fix applied to `handleFollowPoints` unfollow path. File: `services/pointsService.js`. (2026-04-23)
- [x] **Profile picture not updating across the app** — Added `spreadPhotoURL()` fan-out in `ProfileScreen.handlePickImage`. After writing `photoURL` to the user doc, it batch-updates `userAvatar` on all matching `runParticipants` and `presences` docs for that user. Leaderboard already reads live from `users` collection — not affected. Fan-out is fire-and-forget (non-critical). File: `ProfileScreen.js`. (2026-04-23)
- [x] **Map opens on Austin instead of user's location** — Added `mapRef` + `animateToRegion` effect to re-center on user GPS once `useLocation()` resolves. Austin fallback only fires when GPS is unavailable. Added `minZoomLevel={8}` to prevent scrolling out to world view. File: `GymMapScreen.js`. (2026-04-23)
- [ ] **Optimistic UI for check-in and join/start run buttons** — Buttons currently show a loading spinner until Firebase confirms, which can take several seconds and feels slow. Apply optimistic local state update immediately on press (show checked-in / joined state) and revert only if the server returns an error.

---

## Reliability & Trust

- [x] Reliability score reads from Cloud Functions (client is read-only)
- [x] **RC-003** — `useReliability` uses `onSnapshot`, fully real-time. No code change needed.
- [x] **RC-004** — Session Stats reads from `useReliability().stats`, no flash-of-zeroes. Fixed.
- [x] **Verify schedule no-show detection works end-to-end** — `detectNoShows` Cloud Function deployed, queries overdue schedules every 15 min.
- [x] **Cancel-penalty threshold aligned** — `LATE_CANCEL_THRESHOLD_MS` in backend aligned to 60 min, matching client.
- [ ] **Reliability score end-to-end accuracy test** — Manually walk through: schedule a visit → attend → confirm score goes up. Schedule → no-show → confirm penalty applied. Join run → leave within 60 min → confirm late-cancel penalty. Verify no edge cases produce wrong scores or stuck states.
- [x] **Reliability pop-up on first impactful action** — Created `ReliabilityIntroModal` component (bottom-sheet, explains score impact of no-shows and late cancels). Gated by `users/{uid}.hasSeenReliabilityWarning` flag — shown once, then never again. Wired into `RunDetailsScreen` (join run + start run) and `PlanVisitScreen` (schedule visit) via `withReliabilityGate()` helper. (2026-04-23)
- [x] **Run creation limits** — (1) Weekly cap: 3 runs/week max for free tier. (2) Reliability gate: score < 50 blocks new run creation (exempt until 3+ sessions attended). Guards added to both `runService.js` (`assertCanStartRun`) and `createRun.ts` backend (defense in depth). Errors surface the exact reason to the user. Limits shown on `PremiumScreen` — premium tier listed as unlimited. (2026-04-23)

---

## Auth & Profile Basics

- [x] Email/password sign-up and login working
- [x] Profile screen displays reliability score, stats, rank, courts, friends
- [x] User profile viewable by others (UserProfileScreen)
- [x] **COPPA age enforcement** — age field clamps 13–100, blocks under-13 on submit. Age stored as integer.
- [x] **Settings screen back button visible in dark mode** — Fixed 2026-03-27.
- [x] **Profile photo upload reliable** — `withTimeout` wrapper, stalled uploads surface clear alert.
- [x] **Empty/error states on ProfileScreen** — All fields have safe fallbacks, no blank screen risk.
- [x] Rank tier system functional (Bronze → Legend, 6 tiers)
- [x] Points awarded correctly for all defined actions
- [x] **Signup screen — add Lansing, MI as second target city** — First bullet in `OnboardingRegionScreen.js` updated to "active in Austin, TX and Lansing, MI — with more cities coming soon." (2026-04-23)
- [ ] **Rank tiers — make them feel incentivizing** — Current tier display is functional but doesn't motivate players to level up. Needs visual polish and copy that makes each tier feel meaningful and worth chasing before beta. File: rank display in `ProfileScreen.js` and `constants/ranks.js`.

---

## Gym & Run Core Flows

- [x] Gym list displays with live player counts
- [x] Check-in flow works end-to-end
- [x] Run creation with ±60-min merge rule
- [x] Join/leave run with participant count sync
- [x] **RC-001** — Empty runs filtered client-side.
- [x] **RC-002** — Stale activity cleanup fully resolved 2026-03-26.
- [x] **RC-007** — Participant count floor, no negative counts.
- [x] PlanVisitScreen uses `useLivePresenceMap` for counts.
- [x] Run subscription filtering works.
- [x] **Gym follow button — clarify it enables notifications** — Button relabeled from "Follow" / "Following" to "Notify Me" / "Notified" with a bell icon (outline when off, filled when on). `flexDirection: 'row'` added to button style. File: `ViewRunsScreen.js` `GymCard`. (2026-04-23)
- [ ] **Player review section — end-to-end test** — Verify that users can leave a review after visiting a gym, reviews render correctly on the gym profile, and the flow is bulletproof. Test: check in → leave → navigate to gym reviews → submit review → confirm it appears. File: `GymReviewsScreen.js`, `submitReport` or review Cloud Function.

---

## Content / Asset Cleanup

- [x] **Gym thumbnail / image audit** — Images verified for all active gyms. (2026-04-23)

---

## Scope Decisions Before Launch

- [x] **Clips feature** — Disabled for beta. All clips UI replaced with Coming Soon teasers. Re-enable post-launch. (2026-04-23)

---

## Moderation & Admin

- [x] Report submission via Cloud Function (`submitReport`)
- [x] Auto-moderation thresholds (clip: 3, run: 3, player: 5 reports)
- [x] Admin screens: Reports, Suspended Users, Hidden Clips, Gym Requests
- [x] `moderationHelpers.ts` is single source of truth for enforcement
- [x] Suspension escalation (1, 3, 7, 30, 365 days)
- [x] Suspended users blocked from check-in, posting, joining runs
- [x] Admin badge counts reflect real pending items
- [x] Full report → auto-moderate → enforce → resolve cycle confirmed

---

## Stability / Loading / Empty / Error States

- [x] HomeScreen handles empty activity feed gracefully
- [x] ViewRunsScreen handles zero gyms or zero runs without crashing
- [x] RunDetailsScreen handles 0-participant run edge case
- [x] CheckInScreen shows clear feedback when GPS fails or is denied
- [x] PlanVisitScreen handles no scheduled visits and no upcoming runs
- [x] All screens handle Firestore offline/reconnect without permanent spinners
- [x] Skeleton screen freeze on RunDetailsScreen / Runs tab — RESOLVED 2026-03-26
- [x] Error boundaries audited — try/catch + Alert on all user actions

---

## GPS & Location

- [x] GPS distance enforcement re-enabled on check-in
- [x] `checkInRadiusMeters` per-gym config respected on both client and backend
- [x] GPS timeout handled gracefully with clear user feedback

---

## App Store Readiness

- [x] `cli.appVersionSource` set to remote in `eas.json`
- [x] App icons and splash screen finalized
- [x] Privacy policy URL ready
- [x] TestFlight build distributed
- [x] `__DEV__` debug logs gated in HomeScreen and RunDetailsScreen
- [x] All Cloud Functions deployed and verified (2026-04-23)
- [x] Firestore security rules deployed and verified
- [x] `serviceAccountKey.json` not in git history
- [x] AdminAllClipsScreen composite indexes fixed and deployed
- [x] `expireClips` raw-file deletion safety guard deployed
- [x] Onboarding home court screen improved
- [ ] **App Store screenshots prepared**
- [ ] **Fresh iOS build** — current TestFlight binary missing OTA channel header. Run `eas build --platform ios --profile production` to get a new binary with `"channel": "production"` baked in. Required for OTA updates to reach users.

---

## Post-Launch / Not Required for Beta

- Upcoming run section UI in gym detail — needs visual polish but not blocking
- UI cards on main screen — excess whitespace under gym thumbnails
- Auto check-in based on GPS proximity + auto check-out when user leaves
- Gym website link for membership/day pass gyms
- Server-side presence auto-expiry Cloud Function
- Composite Firestore index for `activity` collection (needed at scale)
- Migrate remaining gym images to Firebase Storage
- Switch `useTaggedClips` to native `array-contains` query
- Premium/monetization features (PremiumScreen exists, no billing yet)

---

_Last updated: 2026-04-23_
