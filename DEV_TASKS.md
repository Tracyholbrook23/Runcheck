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
- [x] The feed continues to show check-in and plan activity correctly

### Notes
- Per BACKEND_MEMORY Known Issue #6: `'joined a run at'` writes in `joinExistingRun` and the merge-join branch of `startOrJoinRun` should be removed. This is a prerequisite or concurrent fix.
- Preferred approach: filter at query time in HomeScreen using a join/lookup on the run's `participantCount`, OR remove activity writes for join events entirely.
- Do not modify Firestore schema without a separate instruction.

### What Was Fixed (2026-03-12)
- Removed both `'joined a run at'` `addDoc` writes from `runService.js` (`startOrJoinRun` merge-join branch and `joinExistingRun`). No new join events will be written going forward.
- Added `if (item.action === 'joined a run at') return false` to the HomeScreen activity filter. Already-written `'joined a run at'` docs in Firestore are suppressed immediately in the UI.

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

_Last updated: 2026-03-12_
