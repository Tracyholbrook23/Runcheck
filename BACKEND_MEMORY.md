# RunCheck — Backend Memory Snapshot
_Last updated: 2026-03-13_

## Overview
Firebase-only backend. No custom server. Logic lives in:
- `services/` — Firestore read/write logic (client-side)
- `hooks/` — React hooks that wrap services with real-time subscriptions
- `config/firebase.js` — Firebase app init (db, auth, storage exports)
- `utils/badges.js` — Single source of truth for rank tiers + point values
- Cloud Functions — handles server-side reliability scoring (separate deploy)

---

## Firestore Collections

### `users/{uid}`
```js
{
  odId: string,              // Firebase Auth UID
  email, name, age,
  skillLevel: 'Casual' | 'Competitive' | 'Either',
  photoURL: string | null,
  totalPoints: number,
  profileCompletionAwarded: boolean,   // one-time bonus guard
  pointsAwarded: {
    checkins: { [sessionKey]: true },        // idempotency guard per check-in session
    followedGyms: string[],                  // gymIds currently earning follow points
    lastCheckinAt: { [gymId]: Timestamp },   // cooldown guard — when points were last awarded per gym
    runs: { [runId]: true },                 // runComplete reward idempotency guard (one per run)
    runGyms: string[],                       // gymIds where user earned runComplete bonus; "Verified Run" badge signal
    gymVisits: string[],                     // gymIds where user earned check-in points; widened review-eligibility signal
    reviewedGyms: string[],                  // gymIds where review reward was already earned; one-time-per-gym guard
  },
  reliability: {
    score: number,          // 0–100, starts at 100
    totalScheduled, totalAttended, totalNoShow, totalCancelled,
    lastUpdated: Timestamp,
  },
  activePresence: {         // denormalized — null if not checked in
    odId, gymId, gymName, checkedInAt, expiresAt
  } | null,
  createdAt, updatedAt: Timestamp,
}
```

### `gyms/{gymId}`
```js
{
  name, address, city, state,
  type: 'indoor' | 'outdoor',
  accessType: 'paid' | 'free',
  notes, imageUrl,
  location: { latitude, longitude },
  checkInRadiusMeters: number,   // default: 100
  currentPresenceCount: number,  // ⚠️ stale counter — do NOT use for UI, use real-time presences
  scheduleCounts: { [isoHourSlot]: number },
  autoExpireMinutes: number,     // default: 120 (2 hours)
  createdAt, updatedAt: Timestamp,
}
```

### `presence/{uid}_{gymId}`   ← compound doc ID
```js
{
  odId: string,              // userId — always dedup on this field in UI
  userName, userAvatar,
  gymId, gymName,
  status: 'active' | 'checked_out' | 'expired',
  skillLevel: 'Casual' | 'Competitive' | 'Either',
  checkInLocation: { latitude, longitude },
  distanceFromGym: number,
  checkedInAt: Timestamp,    // use Timestamp.now() not serverTimestamp() — see note below
  expiresAt: Timestamp,
  checkedOutAt: Timestamp | null,
  scheduleId: string | null, // links to fulfilled schedule
  createdAt: Timestamp,
}
```
> ⚠️ **`Timestamp.now()` vs `serverTimestamp()`**: `checkedInAt` and `activity.createdAt` use `Timestamp.now()` (client-side) because `serverTimestamp()` leaves a pending-write placeholder that Firestore excludes from inequality queries (`>=`) until the server round-trip completes. This is intentional and must NOT be changed.

### `schedules/{scheduleId}`
```js
{
  odId, userName,
  gymId, gymName,
  status: 'scheduled' | 'attended' | 'no_show' | 'cancelled',
  scheduledTime: Timestamp,
  timeSlot: string,          // ISO hour string e.g. "2024-02-01T18:00"
  createdAt, attendedAt, cancelledAt, markedNoShowAt: Timestamp | null,
  presenceId: string | null,
}
```

### `activity/{autoId}`
```js
{
  userId, userName, userAvatar,
  action: 'checked in at',   // also: 'planned a visit to', 'started a run at'
  gymId, gymName,
  createdAt: Timestamp,      // Timestamp.now() — see note above
  plannedTime: Timestamp,    // only present on 'planned a visit to' events
  runId: string,             // only present on run events
}
```

### `runs/{autoId}`
```js
{
  gymId, gymName,
  createdBy: string,         // userId of the user who started the run
  creatorName: string,
  startTime: Timestamp,
  status: 'upcoming',        // only status for MVP
  participantCount: number,  // denormalized; kept in sync via runTransaction
  createdAt: Timestamp,      // serverTimestamp()
}
```

### `runParticipants/{runId}_{userId}`   ← compound doc ID
```js
{
  runId, userId, userName, userAvatar,
  joinedAt: Timestamp,       // Timestamp.now()
  status: 'going',
  gymId,                     // denormalized for userId+gymId query in subscribeToUserRunsAtGym
}
```
> Compound key `{runId}_{userId}` makes joins idempotent (setDoc overwrites) and leaveRun O(1) (delete by ID, no query). Ownership enforced via the `userId` field since Firestore rules cannot split the doc ID string.

### `gyms/{gymId}/reviews/{autoId}`   ← subcollection per gym
```js
{
  userId, userName, userAvatar,
  rating: number,               // 1–5
  text: string,
  verifiedAttendee: boolean,    // true only if reviewer had pointsAwarded.runGyms.includes(gymId) at submit time
  createdAt: Timestamp,         // serverTimestamp()
}
```
> One active review per user per gym enforced at submit time in `reviewService.submitReview` via `getDocs` existence check.
> `verifiedAttendee` reflects the **run-completion path only** — session-only check-in reviewers get `verifiedAttendee: false`. This is intentional; see RC-007.

### `weeklyWinners/{YYYY-MM-DD}`   ← one doc per weekly reset
```js
{
  weekOf: string,                 // "YYYY-MM-DD", mirrors doc ID
  recordedAt: Timestamp,          // when the reset script ran
  firstPlace: {                   // convenience shortcut for quick reads
    uid: string,
    name: string,
    photoURL: string | null,
    weeklyPoints: number,
  },
  winners: [                      // up to 3 entries, ordered by place
    {
      uid: string,
      name: string,
      photoURL: string | null,
      weeklyPoints: number,
      place: 1 | 2 | 3,
    },
  ],
}
```
> Written exclusively by `scripts/weeklyReset.js` (manual, not automated). Read on client by `weeklyWinnersService.js`. The `firstPlace` field is a convenience duplicate of `winners[0]` for lightweight reads that only need the top winner.

---

## Services

### `presenceService.js`
- **`checkIn(odId, gymId, userLocation, options)`** — GPS validation → Firestore transaction:
  1. Creates presence doc `{uid}_{gymId}`
  2. Increments `gym.currentPresenceCount`
  3. Sets `user.activePresence`
  4. Fire-and-forget `activity` write
  5. Links to matching schedule if found
- **`checkOut(isManual = true)`** — Transaction:
  - Marks presence `checked_out`, decrements gym count, clears `user.activePresence`
  - `isManual=true` → also deletes `activity` entry (user reversed their check-in)
  - `isManual=false` → no activity delete (auto-expiry path, user attended)
  - Points are NOT deducted on checkout (removed — previous versions did this)
- **`subscribeToGymPresences(gymId, callback)`** → real-time `onSnapshot`, filters `status==ACTIVE && expiresAt > now`, triggers `markPresenceExpired` in background for stale docs
- **`subscribeToUserPresence(odId, callback)`** → watches user's own active presence
- **`expireStalePresences()`** → client-side cleanup job (temporary; Cloud Function needed)
- **`getPresenceId(uid, gymId)`** → `"${uid}_${gymId}"`
- ⚠️ GPS distance check is **commented out** — must re-enable before launch:
  ```js
  // if (distanceFromGym > checkInRadius) { throw new Error(...) }
  ```

### `pointsService.js`
Single source of truth for all point writes. Never write `totalPoints` anywhere else.
- **`awardPoints(uid, action, idempotencyKey?, gymId?)`** — Actions: `'checkin'`, `'checkinWithPlan'`, `'planVisit'`, `'review'`, `'followGym'`, `'completeProfile'`, `'runComplete'`
  - `checkin`/`checkinWithPlan`: two atomic guards inside a transaction:
    1. **Idempotency** — skips if `pointsAwarded.checkins[sessionKey]` already exists (double-tap protection)
    2. **Cooldown** — skips if `pointsAwarded.lastCheckinAt[gymId]` is within 4 hours (production) / 30 seconds (test UIDs in `TEST_USER_UIDS` constant in `pointsService.js`). Presence and reliability tracking are **not** affected — only points are blocked.
    3. Writes `pointsAwarded.gymVisits: arrayUnion(gymId)` atomically (when gymId provided) — widened review-eligibility signal
  - `runComplete`: transactional guard via `pointsAwarded.runs[runId]`; writes `pointsAwarded.runGyms: arrayUnion(gymId)` — run-eligibility and badge signal. Idempotency key is the `runId`.
  - `review`: transactional guard via `pointsAwarded.reviewedGyms.includes(gymId)`; one reward per user per gym forever regardless of delete/repost.
  - `completeProfile`: one-time — guards via `profileCompletionAwarded` flag
  - Returns `{ newTotal, rankChanged, newRank, prevRank }` for rank-up UI
- **`penalizePoints(uid, amount)`** — Deducts points (floored at 0). Used by `leaveRun` for late-cancel penalties.
- **`handleFollowPoints(uid, gymId, isFollowing)`** — Follow/unfollow point management:
  - Follow: awards 2 pts, records `gymId` in `pointsAwarded.followedGyms`
  - Unfollow: deducts 2 pts, removes `gymId`
  - Guards against re-follow without unfollow (no double-counting)

### `gymService.js`
- `getAllGyms()`, `getGym(gymId)`, `subscribeToGyms(callback)`, `subscribeToGym(gymId, callback)`
- `seedGyms()` — safe to re-run; only creates missing docs, never overwrites existing

### `scheduleService.js`
- `createSchedule(odId, gymId, gymName, scheduledTime)` — max 5 active schedules per user, no overlapping times
- `cancelSchedule(scheduleId)` — reliability penalty if < 1hr before
- `markScheduleAttended(scheduleId, presenceId)` — called by `checkIn`
- `markScheduleNoShow(scheduleId)` — called by cleanup job
- `findMatchingSchedule(odId, gymId)` — finds a `SCHEDULED` session within grace period (60 min)

### `runService.js`
- **`startOrJoinRun(gymId, gymName, startTime)`** — merge rule: queries `upcoming` runs at this gym, joins an existing one if `|existingStartTime - requestedStartTime| <= 60 min`, otherwise creates a new run. Validates `startTime > now` and `<= now + 7 days`. Returns `{ runId, created: boolean }`.
- **`joinExistingRun(runId, gymId, gymName)`** — joins a known run by ID; skips time validation. Use this (not `startOrJoinRun`) for run cards shown in the grace window whose `startTime` is already in the past.
- **`leaveRun(runId)`** — transaction: deletes `runParticipants/{runId}_{uid}`, decrements `participantCount`. No-op if user isn't in the run.
- **`subscribeToGymRuns(gymId, callback)`** — real-time; filters `status == 'upcoming'`, grace window `startTime >= now - 30 min`.
- **`subscribeToUserRunsAtGym(userId, gymId, callback)`** — real-time; user's own participant docs at a specific gym (`userId + gymId + status == 'going'`).
- **`subscribeToRunParticipants(runId, callback)`** — real-time; all participants in a run (for future "who's going" list).
- **`subscribeToAllUpcomingRuns(callback)`** — real-time; all upcoming runs across all gyms (no `gymId` filter). Filters `status == 'upcoming'`, grace window `startTime >= now - 30 min`, `participantCount > 0`. Used by PlanVisitScreen "Runs Being Planned" section.
- Internal `joinRun` uses `runTransaction`: reads participant doc first; `increment(1)` only fires if `!alreadyJoined`.

### `reviewService.js`
- **`checkReviewEligibility(uid, gymId)`** → `Promise<{ canReview, hasVerifiedRun }>`: single `getDoc` on `users/{uid}`; checks `pointsAwarded.runGyms` and `pointsAwarded.gymVisits` independently.
  - `canReview` = `runGyms.includes(gymId) || gymVisits.includes(gymId)` — gates the review submission form
  - `hasVerifiedRun` = `runGyms.includes(gymId)` — controls whether `verifiedAttendee: true` is written on the review doc
- **`submitReview(uid, gymId, userName, userAvatar, rating, text, isVerified)`** → one-active-review guard (getDocs query), writes to `gyms/{gymId}/reviews`, awaits `awardPoints(uid, 'review', null, gymId)`. Returns `{ success, alreadyReviewed, pointsResult }`.

### `reliabilityService.js` — READ-ONLY on client
- `getUserReliability(uid)` — reads `users/{uid}.reliability`
- `getReliabilityTier(score)` — returns label/color for score display
- `calculateReliabilityScore(data)` — local fallback calculation for display
- ⚠️ Reliability writes (`updateReliabilityOnAttend`, `updateReliabilityOnNoShow`, etc.) are **deprecated on client** — Cloud Functions own these now

### `weeklyWinnersService.js` — READ-ONLY on client
- **`getLatestWeeklyWinners()`** → `Promise<{ id, weekOf, recordedAt, firstPlace, winners } | null>`: queries `weeklyWinners` ordered by `weekOf` desc, limit 1. Returns `null` when no winners have been recorded yet.

---

## Hooks
| Hook | Returns | Backed by |
|---|---|---|
| `useAuth` | `{ user, loading }` | Firebase Auth |
| `useGym(gymId)` | `{ gym, loading }` | `subscribeToGym` |
| `useGyms()` | `{ gyms, loading }` | `subscribeToGyms` |
| `useGymPresences(gymId)` | `{ presences, loading, count }` | `subscribeToGymPresences` |
| `useGymSchedules(gymId)` | `{ schedules, loading }` | schedules query |
| `usePresence()` | `{ activePresence, loading, checkIn, checkOut }` | `subscribeToUserPresence` |
| `useProfile(uid)` | `{ profile, loading }` | users doc onSnapshot |
| `useSchedules(uid)` | `{ schedules, todaySchedules, tomorrowSchedules, loading }` | schedules query |
| `useReliability(uid)` | `{ reliability, loading }` | `getUserReliability` |
| `useLocation()` | `{ location, error, loading }` | Expo Location |
| `useGymRuns(gymId)` | `{ runs, loading, joinedRunIds, userParticipants }` | `subscribeToGymRuns` + `subscribeToUserRunsAtGym` |
| `useLivePresenceMap()` | `{ presenceMap, countMap }` | Single `presence` subscription (status==active, limit 200); client-side `expiresAt` guard; deduplicates by `odId` per gym. **Canonical source** for all-gym player counts — use `countMap[gymId]` everywhere, never `gym.currentPresenceCount`. |
| `useWeeklyWinners()` | `{ winners, weekOf, loading }` | `getLatestWeeklyWinners` (one-shot fetch on mount) |

---

## Points & Ranks
Defined in `utils/badges.js` — single source of truth.
```js
POINT_VALUES = {
  checkin: 10,
  checkinWithPlan: 15,    // bonus for honoring a schedule
  planVisit: 5,
  review: 3,
  followGym: 2,
  completeProfile: 20,
}
RANKS = [Bronze, Silver, Gold, Platinum]  // each has: name, minPoints, color, glow
```
`getUserRank(totalPoints)` → returns the RANKS entry the user currently belongs to.

---

## Business Rules (key ones)
- One active presence per user at a time (compound doc ID enforces this)
- GPS check-in radius: 100m default (per gym configurable) — **currently disabled for testing**
- Auto-expire: 120 min default (per gym configurable)
- Max 5 active scheduled sessions per user
- Schedule grace period: 60 min (user can check in up to 60 min after scheduled time and have it count)
- Cancel penalty threshold: 60 min (no penalty if cancelled 1hr+ before)
- `skillLevel` valid values: `'Casual' | 'Competitive' | 'Either'` — always normalize legacy values

---

## Required Firestore Indexes
```
1.  presence:        odId ASC, status ASC
2.  presence:        gymId ASC, status ASC, checkedInAt DESC
3.  presence:        status ASC, expiresAt ASC
4.  schedules:       odId ASC, status ASC, scheduledTime ASC
5.  schedules:       gymId ASC, status ASC, scheduledTime ASC
6.  schedules:       status ASC, scheduledTime ASC
7.  activity:        createdAt DESC   ← may need composite index for HomeScreen query
8.  runs:            gymId ASC, status ASC, startTime ASC   ← subscribeToGymRuns + startOrJoinRun
9.  runParticipants: userId ASC, gymId ASC, status ASC      ← subscribeToUserRunsAtGym
10. runParticipants: runId ASC, status ASC, joinedAt ASC    ← subscribeToRunParticipants
11. runs:            status ASC, startTime ASC              ← subscribeToAllUpcomingRuns (cross-gym)
```

---

## Known Issues / TODO (Backend)
1. **GPS enforcement is off** — re-enable the commented-out distance check in `presenceService.checkIn` before launch
2. **Auto-expiry is client-side only** — need Cloud Function to expire presences server-side without deducting points (call `checkOut(isManual=false)`)
3. **`gym.currentPresenceCount` lags real-time** — it's a denormalized counter updated by transactions; not filtered by `expiresAt`. The UI must NOT use it for display — always use `useLivePresenceMap` / `subscribeToGymPresences`. All screens now use the correct source. (`PlanVisitScreen` was the last remaining violation; fixed 2026-03-13 — replaced with `countMap[gym.id]` from `useLivePresenceMap`.)
4. **`activity` index** — confirm composite Firestore index exists for `createdAt DESC` inequality query on HomeScreen feed
5. **Reliability writes** — currently all in Cloud Functions (backend). Do not re-add to client code.
6. **`'joined a run at'` activity writes** — present in `runService.js` but should be removed before commit. With multiple users joining one run, the feed produces identical spam entries. Only `'started a run at'` should be kept. Requires deleting the `addDoc` calls inside `joinExistingRun` and the merge-join branch of `startOrJoinRun`.
7. **`participantCount` floor** — `increment(-1)` in `leaveRun` is not clamped. A retry race could push the counter negative. Acceptable for MVP; add a Security Rule floor (`participantCount >= 0`) or Cloud Function validation before launch.
8. **Runs indexes** — three new composite indexes required (see Required Firestore Indexes #8–10). Create these in the Firebase console or `firestore.indexes.json` to avoid "index required" errors at query time.

---

## Config & Environment
- `config/firebase.js` — exports `db`, `auth`, `storage`
- `config/env.js` — environment variables
- `serviceAccountKey.json` — firebase-admin key for migration scripts only (never import in app code)
- ~~`firestore.rules`~~ — **Removed from this repo.** Firestore security rules live in the backend repo (`~/Desktop/runcheck-backend/firestore.rules`). Deploy from there: `cd ~/Desktop/runcheck-backend && firebase deploy --only firestore:rules`
- ~~`firebase.json`~~ — **Removed from this repo.** Firebase CLI config lives in the backend repo (`~/Desktop/runcheck-backend/firebase.json`). The backend repo's `.firebaserc` binds to project `runcheck-567a3`.
