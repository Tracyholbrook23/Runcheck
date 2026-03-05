# RunCheck — Backend Memory Snapshot
_Last updated: 2026-03-05_

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
    checkins: { [presenceId]: true },  // idempotency guard per check-in
    followedGyms: string[],            // gymIds currently earning follow points
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
  action: 'checked in at',
  gymId, gymName,
  createdAt: Timestamp,      // Timestamp.now() — see note above
}
```

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
- **`awardPoints(uid, action, presenceId?)`** — Actions: `'checkin'`, `'checkinWithPlan'`, `'planVisit'`, `'review'`, `'followGym'`, `'completeProfile'`
  - `checkin`/`checkinWithPlan`: idempotent transaction — guards via `pointsAwarded.checkins[presenceId]`
  - `completeProfile`: one-time — guards via `profileCompletionAwarded` flag
  - Returns `{ newTotal, rankChanged, newRank, prevRank }` for rank-up UI
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

### `reliabilityService.js` — READ-ONLY on client
- `getUserReliability(uid)` — reads `users/{uid}.reliability`
- `getReliabilityTier(score)` — returns label/color for score display
- `calculateReliabilityScore(data)` — local fallback calculation for display
- ⚠️ Reliability writes (`updateReliabilityOnAttend`, `updateReliabilityOnNoShow`, etc.) are **deprecated on client** — Cloud Functions own these now

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
1. presence:  odId ASC, status ASC
2. presence:  gymId ASC, status ASC, checkedInAt DESC
3. presence:  status ASC, expiresAt ASC
4. schedules: odId ASC, status ASC, scheduledTime ASC
5. schedules: gymId ASC, status ASC, scheduledTime ASC
6. schedules: status ASC, scheduledTime ASC
7. activity:  createdAt DESC   ← may need composite index for HomeScreen query
```

---

## Known Issues / TODO (Backend)
1. **GPS enforcement is off** — re-enable the commented-out distance check in `presenceService.checkIn` before launch
2. **Auto-expiry is client-side only** — need Cloud Function to expire presences server-side without deducting points (call `checkOut(isManual=false)`)
3. **`gym.currentPresenceCount` lags real-time** — it's a denormalized counter updated by transactions. The UI must NOT use it for display — always use `subscribeToGymPresences` data
4. **`activity` index** — confirm composite Firestore index exists for `createdAt DESC` inequality query on HomeScreen feed
5. **Reliability writes** — currently all in Cloud Functions (backend). Do not re-add to client code.

---

## Config & Environment
- `config/firebase.js` — exports `db`, `auth`, `storage`
- `config/env.js` — environment variables
- `serviceAccountKey.json` — firebase-admin key for migration scripts only (never import in app code)
