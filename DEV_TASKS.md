# RunCheck — Dev Tasks

Active development tasks tracked here. One task per implementation session.
Update status inline. Do not begin a new task until the current one is complete.

---

## Status Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked / needs investigation

---

## RC-001 — Empty Run Cleanup
**Status:** `[x]`
**Priority:** High

### Goal
When the final participant leaves a run, the run should no longer appear on the gym screen.

### Observed Issue
Two users joined a run and both left. The run card remained visible even though `participantCount` reached 0 (or below). The `subscribeToGymRuns` query filters on `status == 'upcoming'` and a grace window on `startTime`, but does not filter on `participantCount > 0`. As a result, empty run cards persist until the grace window expires.

### Files Likely Involved
- `services/runService.js` — `leaveRun`, `subscribeToGymRuns`
- `hooks/useGymRuns.js` — consumes the subscription; may need client-side filter
- `screens/RunDetailsScreen.js` — renders run cards; may need empty-run guard

### Acceptance Criteria
- [x] A run with `participantCount === 0` is never shown to any user on the gym screen
- [x] Leaving a run when you are the last participant clears the card immediately
- [x] No regression: runs with 1+ participants continue to display normally

### Notes
- `increment(-1)` in `leaveRun` is not clamped — a retry race could push counter negative. Treat `<= 0` as empty.
- Do not delete the run document — preserve data for history / analytics.
- Preferred fix: filter `participantCount > 0` in the Firestore query in `subscribeToGymRuns`, OR add a client-side filter in `useGymRuns`. Evaluate which approach avoids extra index requirements.

### Locked Files
- `services/runService.js`
- `hooks/useGymRuns.js`

---

## RC-002 — Stale Activity Cleanup
**Status:** `[~]` Partial — `'joined a run at'` resolved; stale `'started a run at'` is a follow-up
**Priority:** Medium

### Goal
Remove or hide activity feed items such as `"started a run at"` or `"joined a run at"` when the related run is no longer active (i.e., all participants have left or the run grace window has expired).

### Observed Issue
Activity feed entries referencing runs that have zero participants (or are past their grace window) continue to surface on the Home screen feed, giving the impression that a live run is still happening.

### Files Likely Involved
- `screens/HomeScreen.js` — renders the Recent Activity feed; reads from `activity` collection
- `services/runService.js` — writes `'started a run at'` and `'joined a run at'` activity docs (known issue per BACKEND_MEMORY #6)
- `services/presenceService.js` — also writes to `activity` collection on check-in

### Acceptance Criteria
- [ ] Activity items for runs are hidden when `participantCount === 0` or run is past grace window
- [x] Only `'started a run at'` action is created going forward (not `'joined a run at'`) — see BACKEND_MEMORY Known Issue #6
- [x] Community Activity section renamed from "Recent Activity" and filtered to high-value events only (`'started a run at'`, `'joined a run at'`, `'clip_posted'`)
- [x] Low-signal events (`'checked in at'`, `'planned a visit to'`) suppressed from Community Activity section
- [x] Friends Activity feed unchanged

### Notes
- Per BACKEND_MEMORY Known Issue #6: `'joined a run at'` writes in `joinExistingRun` and the merge-join branch of `startOrJoinRun` should be removed. This is a prerequisite or concurrent fix.
- Preferred approach: filter at query time in HomeScreen using a join/lookup on the run's `participantCount`, OR remove activity writes for join events entirely.
- Do not modify Firestore schema without a separate instruction.

### What Was Fixed (2026-03-12)
- Removed both `'joined a run at'` `addDoc` writes from `runService.js` (`startOrJoinRun` merge-join branch and `joinExistingRun`). No new join events will be written going forward.
- Added `if (item.action === 'joined a run at') return false` to the HomeScreen activity filter. Already-written `'joined a run at'` docs in Firestore are suppressed immediately in the UI.

### What Was Fixed (2026-03-13) — Community Activity filter
- Renamed "Recent Activity" section → "Community Activity" in `HomeScreen.js`.
- Added `COMMUNITY_ACTIONS` allowlist (`Set(['started a run at', 'joined a run at', 'clip_posted'])`).
- Derived `communityDisplayFeed` from the existing `communityActivity` / `activityFeed` partition, filtered through the allowlist. `'checked in at'` and `'planned a visit to'` are now excluded from the section.
- Friends Activity section untouched.

### Follow-up Required — Stale `'started a run at'` entries
`'started a run at'` activity docs remain visible for up to 2 hours after a run empties. Fully solving this requires one of:
- A cross-reference lookup per feed item against `runs.participantCount` (additional Firestore read per item)
- A Cloud Function that deletes or marks the activity doc when `participantCount` reaches 0
This is out of scope for the current fix and should be tracked as a separate task if needed.

### Locked Files
- `services/runService.js`
- `screens/HomeScreen.js`

---

## RC-003 — Reliability Score Card
**Status:** `[ ]`
**Priority:** Medium

### Goal
Ensure the reliability score displayed on the Profile screen updates correctly and reflects actual participation behavior (scheduled / attended / no-show / cancelled counts).

### Observed Issue
Score may not update in real time or may not reflect the most recent Cloud Function writes. Additionally, the score tier labels and progress bar may display stale data if the hook reads a cached value.

### Files Likely Involved
- `hooks/useReliability.js` — real-time `onSnapshot` subscription to `users/{uid}.reliability`
- `services/reliabilityService.js` — `getUserReliability`, `getReliabilityTier`, `calculateReliabilityScore`
- `screens/ProfileScreen.js` — renders reliability score card, tier badge, progress bar

### Acceptance Criteria
- [ ] Score on Profile screen reflects the value last written by Cloud Functions without requiring a logout/login
- [ ] Tier badge (Elite / Trusted / Reliable / Developing) is derived from the live score, not a cached value
- [ ] Progress bar percentage is accurate relative to the 0–100 scale
- [ ] If reliability data is missing or `null`, the card falls back gracefully (shows 100 or placeholder)

### Notes
- Reliability writes are owned by Cloud Functions — do NOT add client-side writes.
- `useReliability` already uses `onSnapshot`; verify the subscription is not being torn down prematurely.
- Check that `getReliabilityTier` thresholds match the labels shown in the UI.

---

## RC-004 — Session Stats Card
**Status:** `[ ]`
**Priority:** Medium

### Goal
Ensure the session stats card on the Profile screen displays accurate and current counts for scheduled, attended, no-show, and cancelled sessions, along with a correct attendance rate.

### Observed Issue
Stats card may show zeroes, stale values, or incorrect attendance rate if the underlying data source (`useReliability` or `useSchedules`) is not providing current values.

### Files Likely Involved
- `screens/ProfileScreen.js` — renders the 4-stat grid and Attendance Rate
- `hooks/useReliability.js` — provides `totalScheduled`, `totalAttended`, `totalNoShow`, `totalCancelled` from `users/{uid}.reliability`
- `hooks/useSchedules.js` — provides individual schedule documents (may be used for count fallback)
- `services/reliabilityService.js` — `getUserReliability` (used for initial fetch if hook not wired)

### Acceptance Criteria
- [ ] Stats grid shows correct `totalScheduled`, `totalAttended`, `totalNoShow`, `totalCancelled`
- [ ] Attendance Rate = `totalAttended / totalScheduled * 100`, rounded to one decimal; shows `—` if `totalScheduled === 0`
- [ ] Stats update without a screen reload when Cloud Functions update reliability data
- [ ] No `NaN` or `undefined` values rendered in any stat cell

### Notes
- Source of truth for stats is `users/{uid}.reliability` (written by Cloud Functions).
- Do not compute stats from the `schedules` collection directly — use the denormalized reliability object for performance.
- Verify `useReliability` exposes all four counters; if not, that is the fix.

---

---

## RC-005 — Check-in Reward Abuse Prevention
**Status:** `[x]`
**Priority:** High

### Goal
Prevent users from farming leaderboard points by repeatedly checking in and out of the same gym within a short window. Check-in presence, reliability tracking, and session stats must remain unaffected.

### Root Cause
`presenceService.checkIn()` builds a `sessionKey = ${presenceId}_${timestamp}` to make every check-in idempotent. This was intentional (allows points on a second visit the next day), but it also means rapid check-in/check-out cycling generates a fresh key each time and awards full points each cycle.

### Fix Applied (2026-03-13)
Added a 4-hour per-user per-gym cooldown on check-in point awards inside `awardPoints()`.

**Schema addition** — `users/{uid}.pointsAwarded.lastCheckinAt.{gymId}: Timestamp`
Written atomically inside the existing checkin transaction when points are awarded.
Read on the next check-in; if `now - lastCheckinAt[gymId] < 4 hours`, points are skipped.

**Test bypass** — set `TEST_USER_UIDS` in `pointsService.js` with test account UIDs to use a 30-second cooldown instead of 4 hours.

### Files Modified
- `services/pointsService.js` — Timestamp import, 3 cooldown constants, new `gymId` param, cooldown check + `lastCheckinAt` write inside transaction
- `services/presenceService.js` — passes `gymId` as 4th arg to `awardPoints` call

### Acceptance Criteria
- [x] Checking in/out/in at the same gym within 4 hours does NOT award duplicate points
- [x] A genuine return visit after 4 hours DOES award points normally
- [x] Presence tracking, reliability stats, session stats are NOT affected
- [x] Test UIDs in `TEST_USER_UIDS` use a 30-second cooldown for easy manual testing

### Remaining Risks / Follow-ups
- **Client-side only** — this guard runs in the app. A determined bad actor could manipulate the client to skip it. A Cloud Function hook on `presence` creation would be the server-side enforcement path for production hardening.
- **`lastCheckinAt` map growth** — one entry per gym the user has ever checked into. At realistic gym counts this is negligible. No cleanup needed for MVP.
- **Add your test UID** — open `services/pointsService.js`, find `TEST_USER_UIDS`, and paste your Firebase Auth UID to enable 30-second cooldown for your account.

---

---

## RC-006 — Run Reward & Accountability
**Status:** `[x]`
**Priority:** High

### Goal
Reward users who join a run *and actually show up*, and penalize users who cancel too close to the run's start time. Joining a run alone earns nothing — follow-through earns the reward.

### Product Rules
- **Show-up reward** — Check in at the same gym within the valid window (startTime − 30 min to startTime + 60 min), run has ≥ 2 participants, and creator also checked in during that window → +10 pts (`runComplete`)
- **Late-cancel penalty (creator)** — Leave a run < 60 minutes before `startTime` → −15 pts
- **Late-cancel penalty (participant)** — Leave a run < 60 minutes before `startTime` → −5 pts
- Leaving > 60 min before start: no penalty
- Leaving after the run has already started: no penalty
- Points floor at 0 — never go negative

### Legitimacy rules enforced in `evaluateRunReward`
All four must pass before `runComplete` is awarded:
1. User has a `runParticipants` doc at this gym with `status: 'going'`
2. Check-in falls within `[startTime − 30 min, startTime + 60 min]`
3. `participantCount >= 2` on the run doc (not a solo run)
4. Creator has a `presence` doc at the same gym with `checkedInAt` in the same window (skipped if user IS the creator — their current check-in satisfies this)

### Files Modified
- `utils/badges.js` — Added `runComplete: 10` to `POINT_VALUES`; added `runComplete` entry to `ACTION_LABELS`
- `services/pointsService.js` — Renamed `presenceId` param → `idempotencyKey`; added `runComplete` transactional case with `pointsAwarded.runs.{runId}` guard; added `penalizePoints(uid, amount)` export
- `services/runService.js` — Added `awardPoints` import; added `evaluateRunReward(uid, gymId, checkInTime)` export at end of file; expanded `leaveRun()` with late-cancel penalty
- `services/presenceService.js` — Added `evaluateRunReward` import; replaced 40-line inline IIFE with single `evaluateRunReward(odId, gymId, now)` fire-and-forget call

### Schema additions
- `users/{uid}.pointsAwarded.runs.{runId}: true` — written atomically when `runComplete` is awarded; serves as idempotency guard

No new collections required.

### Acceptance Criteria
- [x] User joins run, checks in within valid window, run has ≥ 2 participants, creator also checked in → +10 pts awarded
- [x] User checks in at gym with no matching run → no bonus
- [x] User is sole participant (solo run) → no bonus
- [x] Creator never checked in → participant receives no bonus
- [x] Check-in > 60 min before run start or > 60 min after → no bonus
- [x] Second check-in during same window → idempotency guard blocks duplicate award
- [x] Creator leaves run < 60 min before start → −15 pts
- [x] Participant leaves run < 60 min before start → −5 pts
- [x] Anyone leaves run > 60 min before start → no penalty
- [x] Points never go below 0
- [x] Reliability tracking unaffected (Cloud Function-owned — not touched)

### Known Limitations
- **Creator presence uses the most recent check-in doc** — `presence/{createdBy}_{gymId}` is a single reused doc. If the creator checked out and back in during the window, `checkedInAt` reflects their latest check-in and the check passes correctly. If they checked in during the window then checked out before the participant's check-in, the doc's `checkedInAt` is still in the window and the check still passes — which is the right behaviour.
- **`participantCount` is denormalized and client-maintained** — a race between two `leaveRun` calls theoretically makes it go stale for milliseconds. This is an existing constraint of the data model, not new to this feature.
- **Creator bypass** — when the evaluating user is the creator (Case A), the creator-presence read is skipped and the check trivially passes. A participant can still farm if they convince a friend to join without the creator ever showing up. Full mitigation requires a Cloud Function.

---

## RC-007 — Player Reviews (Verified Attendee System)

**Status:** `[x]`
**Priority:** High
**Description:** Review system for gyms on RunDetailsScreen. Eligibility gated on meaningful gym participation: run completion (`runGyms`) OR any check-in that earned points (`gymVisits`). "Verified Run" badge shown only for run completions. One active review per user per gym. One reward per user per gym, forever.

### Design Decisions
- **Eligibility signals (two-signal model):** `checkReviewEligibility(uid, gymId)` reads one user doc and returns `{ canReview, hasVerifiedRun }`.
  - `canReview = runGyms.includes(gymId) || gymVisits.includes(gymId)` — gates the review form
  - `hasVerifiedRun = runGyms.includes(gymId)` — gates the "Verified Run" badge only
  - `gymVisits` written atomically inside the `checkin`/`checkinWithPlan` points transaction via `arrayUnion`
  - `runGyms` written atomically inside the `runComplete` points transaction via `arrayUnion`
- **Badge semantics:** `verifiedAttendee: true` on a review doc means the reviewer had a completed run at that gym. Session-only check-in reviewers can post reviews but receive no badge. This split is intentional.
- **Review reward idempotency:** `pointsAwarded.reviewedGyms: arrayUnion(gymId)` — written in a transaction in `pointsService`. Delete-and-repost cannot earn a second reward.
- **`review` points are awaited:** `submitReview()` awaits `awardPoints()` rather than fire-and-forget, so errors surface at the call site.
- **One active review per user per gym:** enforced in `submitReview` via a `getDocs` existence check before `addDoc`.

### Files Modified
- `services/pointsService.js`
  - `runComplete` transaction: added `pointsAwarded.runGyms: arrayUnion(gymId)` write (when gymId provided) — enables eligibility reads and badge signal downstream
  - `checkin`/`checkinWithPlan` transaction: added `pointsAwarded.gymVisits: arrayUnion(gymId)` write (when gymId provided) — widened review-eligibility signal
  - Added transactional `'review'` case with `pointsAwarded.reviewedGyms` guard; replaces former unconditional increment path
  - Updated JSDoc throughout
- `services/runService.js`
  - `evaluateRunReward`: changed `awardPoints(uid, 'runComplete', runId)` → `awardPoints(uid, 'runComplete', runId, gymId)` to pass gymId into the runComplete transaction
- `services/reviewService.js` *(new)*
  - `checkReviewEligibility(uid, gymId)` → `Promise<{ canReview, hasVerifiedRun }>`: single user doc read; checks `runGyms` (run-completion path) and `gymVisits` (check-in path) independently
  - `submitReview(uid, gymId, userName, userAvatar, rating, text, isVerified)` → enforces one-active-review guard, writes review doc, awaits points award
- `screens/RunDetailsScreen.js`
  - Removed `awardPoints` import (no longer called directly for reviews)
  - Added `import { checkReviewEligibility, submitReview } from '../services/reviewService'`
  - Two state vars: `hasRunAttended` (= `canReview`, gates the form) and `hasVerifiedRun` (= badge signal only)
  - `handleSubmitReview` delegates to `reviewService.submitReview`; passes `hasVerifiedRun` (not `hasRunAttended`) as `isVerified` — ensures badge is never set for session-only reviewers
  - Rating summary (avg score, stars, review count) repositioned above the review CTA
  - Review sort: verifiedAttendee desc → rating desc → createdAt desc
  - Verified badge: `Ionicons checkmark-circle` + "Verified Run" label; shown only when `verifiedAttendee === true`
  - Gate copy: "Check in here to leave a review" (widened from run-only)
  - `reviewerStatsMap` lazy-cache (following `clipUserMap` pattern) fetches `reliability.totalAttended` per reviewer uid; guarded by `resolvedReviewerUidsRef` (useRef Set) to prevent duplicate in-flight reads across snapshot re-fires
  - Reviewer avatar and name tappable → `navigation.navigate('Home', { screen: 'UserProfile', params: { userId } })`

### Schema additions
- `users/{uid}.pointsAwarded.runGyms: string[]` — gymIds where user has earned a runComplete bonus; run-eligibility and "Verified Run" badge signal
- `users/{uid}.pointsAwarded.gymVisits: string[]` — gymIds where user has earned check-in points; widened review-eligibility signal (written in checkin/checkinWithPlan transaction)
- `users/{uid}.pointsAwarded.reviewedGyms: string[]` — gymIds where user has received the review reward; one-time-per-gym idempotency guard
- `gyms/{gymId}/reviews/{autoId}.verifiedAttendee: boolean` — true only when reviewer had `runGyms.includes(gymId)` at submit time (run-completion path only)

### Acceptance Criteria
- [x] User with no check-in or run at a gym sees "Check in here to leave a review" lock gate
- [x] User who has checked in (gymVisits, no run) sees "Leave a Review" button; no "Verified Run" badge on their review
- [x] User who has completed a run (runGyms) sees "Leave a Review" button; review gets "Verified Run" badge
- [x] User who has already reviewed sees "You've reviewed this gym" confirmation
- [x] Review reward awarded at most once per user per gym (transactional reviewedGyms guard)
- [x] Delete-and-repost cannot earn a second reward
- [x] Points call is awaited — errors surface immediately rather than silently
- [x] Rating summary (avg, stars, count) visible when ≥1 review exists, positioned above review CTA
- [x] Reviews sorted: verified attendees first → highest rating → newest
- [x] Reviewer run count (`reliability.totalAttended`) shown next to name when > 0
- [x] Reviewer avatar and name tappable to UserProfile
- [x] `alreadyReviewed` service-layer guard blocks duplicate submissions even if UI bypassed

### Known Limitations
- **`canReview`/`hasVerifiedRun` are read once on mount.** If a user earns eligibility while the screen is already open, the gate won't update until they navigate away and return. Acceptable for MVP.
- **Delete is still possible from the UI** (trash icon). Deleting and reposting creates a second review doc. The reward won't double (guard in pointsService), but the one-active-review rule is only enforced at submit time.
- **Eligibility vs badge split is intentional.** `canReview` (gate) is wider than `verifiedAttendee` (badge). Session-only players can review; only run-completion players appear as verified.
- **`gymVisits` is additive, never pruned.** One entry per gym per user. At realistic gym counts this is negligible.

---

## RC-008 — Plan Tab Stale Presence Count Fix

**Status:** `[x]`
**Priority:** Medium

### Problem
Plan > Schedule a Visit > Select a Gym screen showed "X here" badges sourced from `gym.currentPresenceCount` — a stale denormalized Firestore counter that is never filtered by `expiresAt` client-side. Presence docs whose timers had lapsed still inflated the count. This was a data-trust issue: the planning screen was the only screen in the app still using the stale counter.

### Root Cause
`PlanVisitScreen.js` was never migrated to `useLivePresenceMap`. Every other screen (HomeScreen, ViewRunsScreen, ProfileScreen) already uses `useLivePresenceMap`, which subscribes to the `presence` collection, drops expired docs client-side (`expiresAt < now`), and deduplicates by `odId`. `PlanVisitScreen` was reading `gym.currentPresenceCount` directly from the gym doc via `useGyms`.

### Fix Applied
Replaced `gym.currentPresenceCount` with `countMap[gym.id]` from `useLivePresenceMap`.

### Files Modified
- `screens/PlanVisitScreen.js`
  - Import: added `useLivePresenceMap` to the existing `'../hooks'` import
  - Hook call: `const { countMap } = useLivePresenceMap();`
  - Badge render: `gym.currentPresenceCount > 0` → `(countMap[gym.id] ?? 0) > 0`; label value `gym.currentPresenceCount` → `countMap[gym.id]`

### Acceptance Criteria
- [x] Plan > Select Gym "X here" badge now matches HomeScreen for the same gym
- [x] Expired presences no longer inflate the count on this screen
- [x] No badge shown when no non-expired active presences exist
- [x] No regression to HomeScreen, ViewRunsScreen, or any other screen

---

_Last updated: 2026-03-13 (RC-007: review system, widened eligibility, UI refinements; RC-008: Plan tab stale count fix)_
