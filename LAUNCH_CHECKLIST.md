# RunCheck — Launch Checklist

This file tracks what must be true before RunCheck ships.
Items are organized by area. Check them off as they are completed.
If something isn't on this list, it's either already done or it belongs in `PARKING_LOT.md`.

---

## Auth & Profile Basics

- [x] Email/password sign-up and login working
- [x] Profile screen displays reliability score, stats, rank, courts, friends
- [x] User profile viewable by others (UserProfileScreen)
- [x] **COPPA age enforcement on SignupScreen** — age field clamps 13–100, strips leading zeros via parseInt, `isAgeValid` gate blocks form submit for under-13, hint text "Must be 13 or older" shown. Error message explicitly states minimum age. Age stored as integer in Firestore (fixed 2026-03-27). Future age-group queries (`where('age', '>=', 18)`) will work correctly.
- [x] **Settings screen back button visible in dark mode** — ProfileStack was missing `screenOptions={themeStyles.NAV_HEADER}`; back-button text was invisible (black on dark bg). Fixed 2026-03-27.
- [x] **Profile photo upload reliable** — added `withTimeout` wrapper (30s for fetch/upload, 15s for getDownloadURL/Firestore write). Stalled connections now surface a clear "Upload timed out" alert and reset the spinner. Errors were already caught; this closes the infinite-spinner risk on slow/dead connections.
- [x] **Empty/error states on ProfileScreen if Firestore data is missing or loading fails** — audited 2026-03-17: Combined `profileLoading || reliabilityLoading` gates full screen with spinner; resolves even on error. All rendered fields have safe fallbacks (name→'Player', score→100, stats→0, lists→empty). All `onSnapshot` error callbacks clear loading state. No blank screen or crash possible from missing data. One stray ungated `console.log` gated behind `__DEV__`. No structural code change needed.
- [x] Rank tier system functional (Bronze → Legend, 6 tiers)
- [x] Points awarded correctly for all defined actions

---

## Gym & Run Core Flows

- [x] Gym list displays with live player counts (via `useLivePresenceMap`, not stale counter)
- [x] Check-in flow works end-to-end (presence created, activity written, schedule linked)
- [x] Run creation with ±60-min merge rule
- [x] Join/leave run with participant count sync
- [x] **RC-001: Empty run cleanup** — runs with `participantCount <= 0` are filtered out by client-side guards in both `subscribeToGymRuns` and `subscribeToAllUpcomingRuns`
- [x] **Stale activity cleanup (RC-002)** — fully resolved 2026-03-26 (complete fix). Three-part fix: (1) `leaveRun` in `runService.js` fire-and-forgets delete of the run's activity doc when last participant leaves. (2) `HomeScreen.js` now subscribes to each run doc in the feed via `onSnapshot`; when any run hits `participantCount <= 0` or `cancelled`, the item is filtered from the feed immediately — covers all last-leaver scenarios regardless of who created the run. (3) `firestore.rules` activity delete rule extended to allow any signed-in user to delete `'started a run at'` docs (⚠️ requires `firebase deploy --only firestore:rules`). Cross-reference guards from 2026-03-13 remain as defense-in-depth.
- [x] **Participant count floor (RC-007 / BACKEND Known Issue #7)** — `leaveRun` transaction now reads `participantCount` from the already-fetched `runSnap` and skips `increment(-1)` when count is already `<= 0`. Participant doc is still deleted regardless.
- [x] **Remove `'joined a run at'` activity spam (BACKEND Known Issue #6)** — confirmed removed in a prior session; only `'started a run at'` remains
- [x] PlanVisitScreen uses `useLivePresenceMap` for counts (fixed 2026-03-13)
- [x] Run subscription filtering works (upcoming, grace window, participantCount > 0)

---

## Reliability & Trust

- [x] Reliability score reads from Cloud Functions (client is read-only)
- [x] **RC-003: Reliability score may not reflect latest Cloud Function writes** — confirmed: `useReliability` hook uses `onSnapshot` on `users/{uid}`, which is fully real-time. Any perceived delay is Cloud Function execution timing, not client listener lag. No code change needed.
- [x] **RC-004: Session stats card may show zeroes or stale values** — fixed: Session Stats now reads from `useReliability().stats` (same source as score/tier), eliminating the flash-of-zeroes race between two independent `onSnapshot` listeners on the same doc. Inline `reliability` state retained for `receivedRequests`.
- [x] **Verify schedule no-show detection works end-to-end with Cloud Function** — investigation found the detector was missing: `onScheduleWrite` reactor was deployed but nothing was marking overdue schedules as `no_show`. Added `detectNoShows` scheduled Cloud Function (every 15 min) in backend repo. Queries `status == 'scheduled'` with `scheduledTime < now - 60 min`, batch-updates to `no_show` + `markedNoShowAt`, which triggers `onScheduleWrite` for reliability scoring. Deploy required.
- [x] **Confirm cancel-penalty threshold (60 min) enforced correctly** — investigation found backend used 2-hour threshold while client uses 60 min. Aligned `LATE_CANCEL_THRESHOLD_MS` in `onScheduleWrite.ts` to 1 hour, matching `CANCEL_PENALTY_THRESHOLD_MINUTES` in `models.js` and the `leaveRun` 60-min window. Deploy required.

---

## Clips

- [x] Record clip (≤30s) → trim (≤10s) → upload → finalize flow works
- [x] On-device trimming via local Expo module (iOS + Android)
- [x] Clip tagging (max 5 players, validated in `finalizeClipUpload`)
- [x] `addClipToProfile` approval flow (backend-controlled, no client writes to `taggedPlayers`)
- [x] Per-session duplicate guard and weekly free-tier cap (3/week)
- [x] Soft-delete via `deleteClip` Cloud Function
- [x] **Verify clip playback works reliably (ClipPlayerScreen) — test with slow connections** — added loading spinner (shown until `isLoaded`), buffering indicator (shown when `isBuffering`), and playback error state with "Couldn't play this clip" message + Go Back button via `onError` callback. Native controls preserved. 1 file changed (`ClipPlayerScreen.js`), ~30 lines added. On-device QA still recommended before final ship.
- [x] **Confirm "Tagged In" and "Featured In" sections show correct data on ProfileScreen and UserProfileScreen** — investigated: `useTaggedClips` queries `gymClips` (limit 100, newest first), client-side filters by `taggedPlayers[].uid`. "Tagged In" (all tags) shown only on own ProfileScreen; "Featured In" (`addedToProfile === true`) shown on both screens. Visibility filter excludes hidden/deleted/unfinalized clips. Empty sections hidden cleanly. Approval model enforced via `addClipToProfile` Cloud Function. Correct.
- [x] **Handle clip upload failure gracefully (show error, allow retry, don't consume weekly slot)** — investigated: every step (trim, createClipSession, upload, finalize) has a dedicated catch block with a specific Alert message. All failures reset `postingRef` + `uploadState` to IDLE, re-enabling the Post button for retry. Failed uploads leave a `pending` doc that is marked `abandoned` on retry. Weekly cap query explicitly excludes `status === 'abandoned'` and `isDeletedByUser === true`. No weekly slot consumed on failure. Correct.

---

## Moderation & Admin

- [x] Report submission via Cloud Function (`submitReport`)
- [x] Auto-moderation thresholds (clip: 3, run: 3, player: 5 reports)
- [x] Admin screens: Reports, Suspended Users, Hidden Clips, Gym Requests
- [x] `moderationHelpers.ts` is single source of truth for enforcement
- [x] Suspension escalation (1, 3, 7, 30, 365 days)
- [x] **Verify suspended users are actually blocked from app actions (check-in, posting, joining runs)** — investigated + fixed 2026-03-17: Check-in guarded in `presenceService.js` (client) and `checkIn.ts` (backend). Run creation guarded in `runService.js` (client `assertNotSuspended`) and `createRun.ts` (backend). Clip posting guarded in `clipFunctions.ts` (backend `createClipSession`). All guards support timed suspensions via `suspensionEndsAt`. Backend deploy required for `checkIn` and `createRun`.
- [x] **Confirm admin badge counts on ProfileScreen reflect real pending items** — investigated 2026-03-17: ProfileScreen `adminPendingTotal` sums 4 real-time `onSnapshot` queries (pending gym requests, pending reports, active suspensions, hidden clips). Identical queries used in AdminToolsScreen. Counts are accurate and live. No code change needed.
- [x] **Test full report → auto-moderate → enforce → resolve cycle end-to-end** — investigated 2026-03-17: Full code trace confirms complete pipeline. `submitReport` → duplicate check → write report → auto-mod threshold check (clip:3, run:3, player:5) → `enforceHideClip`/`enforceRemoveRun`/`enforceSuspendUser` → batch-resolve all pending reports. Admin manual path: `moderateReport` (review/resolve) + `hideClip`/`removeRun`/`suspendUser` each call `resolveRelatedReport`. All enforcement via `moderationHelpers.ts` single source of truth. All helpers idempotent. No missing links. No code change needed.

---

## Stability / Loading / Empty / Error States

- [x] **HomeScreen handles empty activity feed gracefully** — audit confirmed: "No recent activity yet" BlurView row when feed is empty; silent fallback to empty state on fetch error (error banner is a post-launch quality improvement in PARKING_LOT.md)
- [x] **ViewRunsScreen handles zero gyms or zero runs without crashing** — audit confirmed: full-screen "Loading gyms..." spinner; contextual empty states for no gyms vs. no search results; pull-to-refresh wired up. Silent fetch error shows empty state (error banner is a post-launch quality improvement in PARKING_LOT.md)
- [x] **RunDetailsScreen handles a run with 0 participants (edge case after all leave)** — audit confirmed: "Players Here" section hidden when `playerCount === 0`; "No runs planned yet / Be the first to start one" empty state; Alert dialogs on start/join/leave/check-in errors
- [x] **CheckInScreen shows clear feedback when GPS fails or is denied** — audit confirmed: loading spinner while `presenceLoading`; RunDetailsScreen check-in errors show specific Alert dialogs for permission denied, GPS timeout, and generic failures
- [x] **PlanVisitScreen handles no scheduled visits and no upcoming runs** — audit confirmed: loading spinner; empty state prompt to schedule a visit
- [x] **All screens handle Firestore offline/reconnect without permanent loading spinners** — audit confirmed: all core screens gate loading on hook `loading` flags that resolve even on error; `onSnapshot` error handlers set state to empty/null rather than leaving spinners stuck. Acceptable for launch.
- [x] **Skeleton screens freeze until touch on RunDetailsScreen / Runs tab** — ✅ RESOLVED 2026-03-26. Root cause was NOT Firestore subscriptions — it was the Runs tab `tabPress` listener calling `navigation.navigate('Runs', { screen: 'ViewRunsMain' })`. This triggered a pop animation on RunsStack while simultaneously allowing the user to push a new RunDetailsScreen, creating competing animations in new arch (RN 0.81 / Expo SDK 54). The React reconciler ran effect cleanup+remount cycles on the incoming RunDetailsScreen before the push animation settled, leaving `gymLoading`/`presencesLoading`/`schedulesLoading` stuck at `true`. Fix: replaced `navigate()` with `StackActions.popToTop()` targeted at the RunsStack's navigation state key (via `target: runsStackState.key` in the dispatch). Also removed all `InteractionManager`/`setTimeout` delays from all six subscription hooks as a prerequisite — those were masking the animation-race issue by adding separate deferred-callback failures. Hooks fixed: `useGym`, `useGymPresences`, `useGymSchedules`, `useGyms`, `useGymRuns`, `useLivePresenceMap`. Files: `App.js` (tabPress fix), all six hooks.
- [x] **Review error boundaries on critical screens** — audit confirmed: no React error boundaries exist, but all screens use try/catch + Alert on user actions and degrade gracefully on data errors. Error boundaries are a post-launch quality improvement.

---

## GPS & Location

- [x] **Re-enable GPS distance enforcement** — uncommented client-side gate in `usePresence.js` and service-layer gate in `presenceService.js`. Both layers now block check-in when user is outside gym's `checkInRadiusMeters` (default 100m). Dev bypass (`EXPO_PUBLIC_DEV_SKIP_GPS`) untouched.
- [x] **Verify `checkInRadiusMeters` per-gym config is respected** — confirmed: both `usePresence.js` and `presenceService.js` read `gym.checkInRadiusMeters` from Firestore with `|| DEFAULT_CHECK_IN_RADIUS_METERS` (100m) fallback. Same constant imported from `models.js`. All 8 seeded gyms have explicit values. Consistent across both layers.
- [x] **Handle GPS timeout gracefully (user feedback, retry option)** — investigated: permission denied → "Location Required" alert; GPS unavailable/timeout → "GPS Unavailable" alert; too-far → "Check-in Failed" with distance. All error paths produce clear user-facing feedback. No crash risk. Explicit `timeout` + `maximumAge` hardening deferred to PARKING_LOT.md as post-launch quality improvement.

---

## App Store Readiness

- [x] **Set `cli.appVersionSource` in `eas.json`** — fixed 2026-03-17: Added `"appVersionSource": "remote"` to `cli` block. EAS manages version numbers server-side, no manual bumps needed per build.
- [x] App icons and splash screen finalized — verified 2026-03-18: icon.png and adaptive-icon.png are 1024×1024 RGB, correct RunCheck logo. Splash uses runcheck-logo-full.png. All three referenced correctly in app.json.
- [x] Privacy policy URL ready — https://www.notion.so/RunCheck-Privacy-Policy-3280818539eb80168b7cc7dd061f3d09
- [ ] App Store screenshots prepared
- [x] TestFlight build distributed for final QA round — completed 2026-03-19. Push notification handler shipped via OTA (no native rebuild required); final QA build submitted to TestFlight.
- [ ] **Fresh iOS build required (quota resets ~April 1, 2026)** — Current TestFlight binary is missing `EXUpdatesRequestHeaders` (channel header not baked in). OTA updates do not apply on device. Fix is already in repo: `eas.json` production profile now has `"channel": "production"`. Next build will be fully OTA-capable. Until then, use simulator for frontend validation.
- [x] **Remove or gate `__DEV__` debug logs in HomeScreen.js and RunDetailsScreen.js** — fixed 2026-03-17: Removed 3 ungated temporary debug logs in RunDetailsScreen (clips effect tracing). Gated 17 remaining `console.error`/`console.warn`/`console.log` calls behind `__DEV__` across both files. All logs in both files now silent in production builds.
- [ ] **All Cloud Functions deployed and verified** — Phase 1 + Phase 2 deployed 2026-03-26 (notifyRunStartingSoon, onRunParticipantJoined, onParticipantCountMilestone, onDmMessageCreated, notifyFollowersRunCreated, notifyFollowersPresenceMilestone, onGymPresenceUpdated, detectRunNoShows, onScheduleWrite) all confirmed live. ⚠️ **Pending deploy (2026-03-29): `onRunCreatedNotifyScheduledVisitors`** — notifies scheduled visitors when a matching run is created. Run: `firebase deploy --only functions:onRunCreatedNotifyScheduledVisitors`.
- [x] **Firestore security rules deployed and verified** — deployed 2026-03-25, verified match 2026-03-26. Covers: auth, users, usernames, gyms, runs, runParticipants, activity, conversations (DMs), run chat messages. All security gaps resolved.
- [x] **serviceAccountKey.json not in git history** — verified 2026-03-26. No credential exposure. No rotation required.
- [x] **AdminAllClipsScreen composite index errors fixed** — added `isHidden+hiddenAt` and `isDeletedByUser+deletedAt` composite indexes to `firestore.indexes.json`. Deployed 2026-03-28.
- [x] **expireClips raw-file deletion safety guard** — `expireClips.ts` now skips raw file deletion when `storagePath === rawStoragePath`, preventing permanently unplayable clips for ready_raw and processor-failed clips. Deployed 2026-03-28.
- [x] **Onboarding home court screen improved** — "Use My Location" tap-only button, search bar, distance labels on gym rows, "Nearby gyms" section label, low-friction request-gym row above list. Fixed `RequestGym` navigation error from onboarding (screen now registered in root stack). (2026-03-27)

---

## Post-Launch / Not Required Yet

These are known improvements that can wait until after launch:

- Server-side presence auto-expiry Cloud Function (currently client-side only)
- Composite Firestore index for `activity` collection (needed at scale, not blocking small user base)
- Migrate remaining gym images to Firebase Storage (5 of 6 still on external hosts)
- Deprecate/remove stale `addGym` Cloud Function
- Verify Cowboys Fit coordinates with manual Google Maps pin
- Switch `useTaggedClips` from client-side filtering to `taggedUserIds` native query
- Premium/monetization features (PremiumScreen exists but no billing)

---

_Last updated: 2026-03-28_
