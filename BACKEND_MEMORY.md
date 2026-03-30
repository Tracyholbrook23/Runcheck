# RunCheck — Backend Memory Snapshot
_Last updated: 2026-03-26 (2026-03-26 session B: backend fully deployed and verified — all Cloud Functions including Phase 2 push notifications (notifyFollowersRunCreated, notifyFollowersPresenceMilestone, onGymPresenceUpdated, detectRunNoShows, onScheduleWrite) confirmed live; Firestore rules deployed and verified matching local file; serviceAccountKey.json confirmed not in git history — no rotation required. 2026-03-26 session A: hooks updated with InteractionManager deferred subscriptions. 2026-03-25: added repairReliabilityScores.js admin script, Phase 2 CF notifyFollowersPresenceMilestone + onGymPresenceUpdated. 2026-03-24: added adminActions collection, isRemoved fields on DM messages, messageContext on reports, blockedUsers on users, mutedBy on conversations, skillLevel+gymName on runParticipants; added removeDmMessage CF, onDmMessageCreated CF; updated dmService with block/mute functions; updated moderationHelpers with enforceRemoveDmMessage)_

## Overview
Firebase-only backend. No custom server. Logic lives in:
- `services/` — Firestore read/write logic (client-side)
- `hooks/` — React hooks that wrap services with real-time subscriptions
- `config/firebase.js` — Firebase app init (db, auth, storage exports)
- `config/ranks.js` — Single source of truth for rank tiers (6 tiers: Bronze→Legend)
- `config/points.js` — Single source of truth for point values
- `config/perks.js` — Perk definitions + premium overrides
- Cloud Functions — handles server-side reliability scoring (separate deploy)

---

## Firestore Collections

### `usernames/{usernameLower}`
```js
{
  uid: string,               // Firebase Auth UID of the owner
  createdAt: Date,           // client-side Date (not serverTimestamp)
}
```
> Written atomically with `users/{uid}` in a Firestore transaction during signup (VerifyEmailScreen) or username migration (ClaimUsernameScreen). Uniqueness enforced by checking existence before writing. `usernameLower` is the doc ID — always lowercase. Display-case `username` is stored on the user doc.

### `users/{uid}`
```js
{
  odId: string,              // Firebase Auth UID
  email, name, age,
  firstName: string,         // added 2026-03-22; split from `name`
  lastName: string,          // added 2026-03-22; split from `name`
  username: string,          // display-case username (e.g. "HoopKing23")
  usernameLower: string,     // lowercase mirror for case-insensitive lookups
  phoneNumber: null,         // always null for now; reserved for future SMS auth
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
  isAdmin: boolean,              // true for admin users
  // ── Suspension fields (written by enforceSuspendUser / enforceUnsuspendUser) ──
  isSuspended: boolean,
  suspendedBy: string,           // admin UID or 'auto-moderation'
  suspendedAt: Timestamp,
  suspensionReason: string | null,
  suspensionLevel: number,       // escalation level (1-indexed), persists across unsuspends
  suspensionEndsAt: Timestamp,   // when the timed suspension expires
  unsuspendedBy: string,         // admin UID who lifted suspension
  unsuspendedAt: Timestamp,
  unsuspendReason: string | null,
  autoModerated: boolean,        // true if suspended by auto-moderation
  // ── DM Blocking (written by dmService.blockUser / dmService.unblockUser) ──
  blockedUsers: string[],        // UIDs blocked by this user (arrayUnion/arrayRemove). Added 2026-03-24.
                                 // Firestore rules: existing "write own doc" rule already covers this field.
  // ── Push Notifications (written by utils/notifications.js on app launch) ──
  pushToken: string | null,      // Expo push token — saved by registerPushToken(); null if not granted
  // ── Notification deduplication (written by Phase 1 Cloud Functions) ──
  notifCooldowns: {              // map of cooldown keys → last-sent Timestamp (written lazily)
    [key: string]: Timestamp,    // e.g. "runReminder_{runId}", "participantJoined_{runId}", "runMilestone_{runId}_5"
  },                             // ⚠️ will grow unboundedly — migrate to subcollection before ~500 active users (see Known Issues #9)
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
  chatExpiresAt: Timestamp,  // startTime + 4 hours — when the run's group chat closes.
                             // Written by startOrJoinRun() at run creation.
                             // Absent on runs created before 2026-03-22 (treated as non-expiring by rules).
                             // Single source of truth: RUN_CHAT_EXPIRY_MS in runChatService.js
  status: 'upcoming',        // only status for MVP
  participantCount: number,  // denormalized; kept in sync via runTransaction
  runLevel: 'casual' | 'mixed' | 'competitive',
                             // Competitiveness tag set by run creator at creation.
                             // Default: 'mixed'. Absent on runs created before 2026-03-22;
                             // treat as 'mixed' in all UI reads (use `run.runLevel ?? 'mixed'`).
                             // Added 2026-03-22. Client-side only — no Cloud Function involvement.
  lastMessageAt: Timestamp | null,
                             // Stamped by sendRunMessage() (fire-and-forget) each time a message
                             // is sent to the run chat. Used by useMyRunChats to detect unread chats.
                             // Absent on runs with no messages yet; treated as read (no phantom badge).
                             // Added 2026-03-22.
  noShowProcessedAt: Timestamp | null,
                             // Stamped by detectRunNoShows Cloud Function after all committed
                             // participants have been evaluated for this run. Absent on runs that
                             // have not yet been processed (created before this field was introduced,
                             // or not yet overdue). detectRunNoShows skips runs where this field is
                             // present (idempotency guard). Never written by the client.
                             // Added 2026-03-23.
  createdAt: Timestamp,      // serverTimestamp()
}
```
> **chatExpiresAt lifecycle**: after this timestamp, `useMyRunChats` hides the chat from the Messages inbox, `RunChatScreen` shows a read-only "Chat has ended" banner, and the Firestore `isChatActive()` rule hard-blocks new message writes. Old messages remain in Firestore for history/admin purposes.

### `runParticipants/{runId}_{userId}`   ← compound doc ID
```js
{
  runId, userId, userName, userAvatar,
  joinedAt: Timestamp,       // Timestamp.now()
  status: 'going',
  gymId,                     // denormalized for userId+gymId query in subscribeToUserRunsAtGym
  lastReadAt: Timestamp | null,
                             // Written by markRunChatSeen() when the user opens the run chat.
                             // Compared against runs/{runId}.lastMessageAt by useMyRunChats to
                             // compute isUnread / runChatUnreadCount. Added 2026-03-22.
  skillLevel: 'Casual' | 'Competitive' | 'Either' | null,
                             // Snapshot of the participant's skillLevel at RSVP time. Written by
                             // joinRun() in runService.js via fetchUserDisplayInfo(). Absent on
                             // participant docs written before 2026-03-24 — use presence cross-
                             // reference (V1 fallback) for those. Added 2026-03-24.
  gymName: string,           // Denormalized gym name — written by joinRun() at join time.
                             // Already present via runService fetchUserDisplayInfo. Added 2026-03-24.
}
```
> Compound key `{runId}_{userId}` makes joins idempotent (setDoc overwrites) and leaveRun O(1) (delete by ID, no query). Ownership enforced via the `userId` field since Firestore rules cannot split the doc ID string.

### `runs/{runId}/messages/{autoId}`   ← subcollection per run (Run Chat)
```js
{
  senderId: string,          // Firebase Auth UID — must match request.auth.uid on create
  senderName: string,        // denormalized display name; defaults to 'Player' if blank
  senderAvatar: string|null, // denormalized avatar URL; null if none
  text: string,              // trimmed + capped at 500 chars before write
  createdAt: Timestamp,      // serverTimestamp() — used for ASC ordering
  type: 'text',              // reserved for future message types
}
```
> **Access control**: read + create require `exists(runParticipants/{runId}_{uid})`. Update/delete always denied (no editing or deleting messages). Participation is confirmed by doc existence — the `runParticipants` doc is **deleted** (not status-updated) on `leaveRun`, so `exists()` is the correct and cheapest check (one read, no field comparison).
> **Ordering**: `orderBy('createdAt', 'asc')` — oldest first. `serverTimestamp()` is safe here (unlike `presence.checkedInAt`) because messages are never used in Firestore `>=` inequality queries.
> **Client-side validation**: `sendRunMessage` in `runChatService.js` trims text, rejects empty strings, enforces 500-char cap, and requires `runId` and `senderId` before writing.

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
> Written by the `weeklyReset` Cloud Function (automated every Monday 00:05 CT) and optionally by `scripts/weeklyReset.js` (manual backup/admin tool). Read on client by `weeklyWinnersService.js`. The `firstPlace` field is a convenience duplicate of `winners[0]` for lightweight reads that only need the top winner.

### `reports/{autoId}`
```js
{
  reportedBy: string,            // UID of the reporter
  reporterName: string,
  type: 'clip' | 'player' | 'run' | 'gym',
  targetId: string,              // ID of the reported item
  targetOwnerId: string | null,  // resolved per type: player→targetId, clip→uploaderUid, run→creatorId, gym→null
  reason: string,                // selected reason category
  description: string | null,    // optional free-text details
  status: 'pending' | 'reviewed' | 'resolved',
  reviewedBy: string | null,     // admin UID who reviewed
  reviewedAt: Timestamp | null,
  adminNotes: string | null,
  autoModerated: boolean,        // true if resolved by auto-moderation
  autoModerationReason: string | null,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  // ── Message reports (present only when type === 'message') ──
  messageContext: {              // Added 2026-03-24.
    conversationId: string,
    messageId: string,
    senderId: string,
    messageText: string,         // sanitized excerpt (client-trimmed before submit)
    messageSentAt: Timestamp | null,
  } | undefined,
}
```
> Duplicate prevention: composite unique on `reportedBy + type + targetId`. Auto-moderation in `submitReport` checks pending count against thresholds (clip→3, run→3, player→5) and triggers enforcement helpers. For `type='message'`, `targetOwnerId` is set to `messageContext.senderId`. No auto-moderation threshold for message reports in V1.

### `gymClips/{clipId}` — full schema (deterministic ID: `{scheduleId}_{uid}` or `presence_{gymId}_{uid}`)
```js
{
  // ── Core fields (written by finalizeClipUpload) ──
  uploaderUid: string,
  uploaderDisplayName: string,
  gymId: string,
  gymName: string,
  scheduleId: string,
  status: 'pending' | 'ready_raw' | 'processing' | 'ready',
  storagePath: string,
  rawStoragePath: string,
  finalStoragePath: string | null,
  thumbnailPath: string | null,
  source: 'camera' | 'library',
  trimStartSec: number,
  durationSecClient: number,
  caption: string | null,
  category: string | null,
  createdAt: Timestamp,
  likesCount: number,              // 0 at creation
  likedBy: { [uid]: true },        // O(1) like-state lookup
  reportsCount: number,            // 0 at creation
  isDailyHighlight: boolean,       // false at creation
  pointsAwarded: boolean,          // false at creation; future rewards system flips to true

  // ── Tagging (written by finalizeClipUpload, V1 2026-03-17) ──
  taggedPlayers: Array<{
    uid: string,
    displayName: string,
    addedToProfile?: boolean,      // set to true by addClipToProfile Cloud Function
  }>,
  taggedUserIds: string[],         // flat mirror of taggedPlayers[].uid — for Firestore rules

  // ── Soft-delete (written by deleteClip Cloud Function) ──
  isDeletedByUser: boolean,
  deletedAt: Timestamp,
  deletedByUid: string,

  // ── Moderation (written by hideClip/unhideClip/auto-moderation) ──
  isHidden: boolean,
  hiddenBy: string,              // admin UID or 'auto-moderation'
  hiddenAt: Timestamp,
  hiddenReason: string | null,
  autoModerated: boolean,
  autoModeratedAt: Timestamp,
  unhiddenBy: string,            // admin UID who unhid
  unhiddenAt: Timestamp,
  unhiddenReason: string | null,
}
```

### `gymRequests/{autoId}`
```js
{
  submittedBy: string,           // UID
  gymName: string,
  address: string,
  type: string,
  notes: string | null,
  status: 'pending' | 'approved' | 'rejected' | 'duplicate',
  adminNotes: string | null,
  createdAt: Timestamp,
}
```

### `adminActions/{autoId}`   ← Added 2026-03-24
```js
{
  actionType: 'remove_message' | 'suspend_user',
  adminId: string,               // UID of the admin who performed the action
  targetId: string,              // messageId (for remove_message) or userId (for suspend_user)
  conversationId: string | null, // present for remove_message
  reason: string | null,
  reportId: string | null,       // associated report, if action triggered from a report
  suspensionLevel: number | null, // present for suspend_user
  durationDays: number | null,   // present for suspend_user
  timestamp: Timestamp,          // serverTimestamp()
}
```
> Written only by Cloud Functions (Admin SDK) — no client read/write. Read via Firebase Console only in V1. No UI. Audit trail for admin enforcement actions. V1 coverage: message removal and user suspension. Does not yet cover `unsuspendUser` or `hideClip`.

---


### `conversations/{conversationId}`
Deterministic ID: `[uid_a, uid_b].sort().join('_')` — same two users always share one doc.
```js
{
  participantIds: string[],    // [uid_a, uid_b] — used for Firestore array-contains queries
  participants: {
    [uid]: { name: string, photoURL: string | null }
  },
  lastMessage: string,         // text of most recent message (for inbox preview)
  lastActivityAt: Timestamp,   // drives inbox ordering (desc)
  createdAt: Timestamp,
  lastSeenAt: {
    [uid]: Timestamp           // per-user last-seen timestamp; unread = lastActivityAt > lastSeenAt[uid]
  },
  mutedBy: {                   // per-user mute state. Written with dot-notation updateDoc.
    [uid]: true                // true = push notifications suppressed for this user. Absent if nobody muted.
  } | undefined,               // Cleared with deleteField() on unmute. Added 2026-03-24.
}
```

### `conversations/{conversationId}/messages/{autoId}`
```js
{
  senderId: string,    // Firebase Auth UID of sender
  text: string,
  createdAt: Timestamp,  // serverTimestamp() — drives message ordering
  // ── Moderation (written by removeDmMessage Cloud Function) ──
  isRemoved: boolean,        // true if admin soft-deleted. Added 2026-03-24.
  removedBy: string,         // admin UID
  removedAt: Timestamp,
  removedReason: string | null,
}
```
> Removed messages render a pill-style placeholder ("This message was removed") in `DMConversationScreen.js`. Hard delete intentionally out of scope for V1 (audit trail needed). Message doc is NOT deleted on removal.
Firestore rules for `conversations` collection **deployed 2026-03-25, verified match 2026-03-26.** Participant-only reads/writes enforced. DM messages gated by parent doc lookup + `isNotSuspended()` on create.
> **Suspended user rule (2026-03-24):** `isNotSuspended()` helper in `runcheck-backend/firestore.rules` blocks `allow create` on DM messages and run chat messages for suspended users. Server-enforced even if client bypass is attempted.

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


### `dmService.js`
- **`openOrCreateConversation({currentUid, currentUserName, currentUserAvatar, otherUid, otherUserName, otherUserAvatar})`** — Idempotent. Slow path (new conversation) reads both user docs in parallel. Bidirectional block guard: throws if either party has blocked the other. Returns `conversationId`.
- **`subscribeToConversations(uid, callback)`** — Real-time inbox ordered by `lastActivityAt` desc. Queries `conversations` where `participantIds array-contains uid`.
- **`sendDMMessage({conversationId, senderId, recipientId?, text})`** — Reads sender's user doc to check `isSuspended`. If `recipientId` provided, reads recipient's `blockedUsers` and throws if sender is listed. Two sequential writes: (1) `addDoc` to messages subcollection with `serverTimestamp()`; (2) `updateDoc` on conversation doc. Not transactional.
- **`markConversationSeen(conversationId, uid)`** — Writes `lastSeenAt.${uid}` via dot-notation field path. Called on DM screen mount.
- **`blockUser(currentUid, targetUid)`** — `arrayUnion(targetUid)` on `users/{currentUid}.blockedUsers`. Idempotent. Added 2026-03-24.
- **`unblockUser(currentUid, targetUid)`** — `arrayRemove(targetUid)` on `users/{currentUid}.blockedUsers`. Added 2026-03-24.
- **`muteConversation(conversationId, uid)`** — Dot-notation `set mutedBy.{uid}: true` on conversation doc. Added 2026-03-24.
- **`unmuteConversation(conversationId, uid)`** — Dot-notation `deleteField()` on `mutedBy.{uid}`. Added 2026-03-24.
- **`getConversationMuteState(conversationId, uid)`** — One-shot `getDoc`, returns boolean. Added 2026-03-24.

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
- `updateGymLocation(gymId, location, checkInRadius)` — admin utility for updating GPS coordinates
- `getNearbyGyms(userLocation, maxDistanceMeters)` — client-side distance filter
- `seedGyms()` — **DEPRECATED NO-OP** (as of 2026-03-15). Previously seeded gyms from a hardcoded array on every app launch and deleted non-seed gym docs. Now returns `[]` and logs a dev warning. Gym data is managed exclusively via `seedProductionGyms.js` (firebase-admin, `set({ merge: true })`). Retained as an empty export to avoid breaking `scripts/seedDatabase.js`.

### `scheduleService.js`
- `createSchedule(odId, gymId, gymName, scheduledTime)` — max 5 active schedules per user, no overlapping times
- `cancelSchedule(scheduleId)` — reliability penalty if < 1hr before
- `markScheduleAttended(scheduleId, presenceId)` — called by `checkIn`
- `markScheduleNoShow(scheduleId)` — called by cleanup job
- `findMatchingSchedule(odId, gymId)` — finds a `SCHEDULED` session within grace period (60 min)

### `runService.js`
- **`startOrJoinRun(gymId, gymName, startTime, runLevel = 'mixed')`** — merge rule: queries `upcoming` runs at this gym, joins an existing one if `|existingStartTime - requestedStartTime| <= 60 min`, otherwise creates a new run. Validates `startTime > now` and `<= now + 7 days`. `runLevel` is set only on new run creation (joined runs keep their existing level). Returns `{ runId, created: boolean }`.
- **`joinExistingRun(runId, gymId, gymName)`** — joins a known run by ID; skips time validation. Use this (not `startOrJoinRun`) for run cards shown in the grace window whose `startTime` is already in the past.
- **`leaveRun(runId)`** — transaction: deletes `runParticipants/{runId}_{uid}`, decrements `participantCount` (guarded: skips decrement if count already `<= 0`). No-op if user isn't in the run.
- **`subscribeToGymRuns(gymId, callback)`** — real-time; filters `status == 'upcoming'`, grace window `startTime >= now - 30 min`.
- **`subscribeToUserRunsAtGym(userId, gymId, callback)`** — real-time; user's own participant docs at a specific gym (`userId + gymId + status == 'going'`).
- **`subscribeToRunParticipants(runId, callback)`** — real-time; all participants in a run (for future "who's going" list).
- **`subscribeToAllUpcomingRuns(callback)`** — real-time; all upcoming runs across all gyms (no `gymId` filter). Filters `status == 'upcoming'`, grace window `startTime >= now - 30 min`, `participantCount > 0`. Used by PlanVisitScreen "Runs Being Planned" section.
- **`subscribeToAllUserRuns(userId, callback)`** — real-time; all `runParticipants` docs where `userId` field matches. Used by `useMyRunChats` to build the Messages inbox Run Chats section.
- Internal `joinRun` uses `runTransaction`: reads participant doc first; `increment(1)` only fires if `!alreadyJoined`.

### `reviewService.js`
- **`checkReviewEligibility(uid, gymId)`** → `Promise<{ canReview, hasVerifiedRun }>`: single `getDoc` on `users/{uid}`; checks `pointsAwarded.runGyms` and `pointsAwarded.gymVisits` independently.
  - `canReview` = `runGyms.includes(gymId) || gymVisits.includes(gymId)` — gates the review submission form
  - `hasVerifiedRun` = `runGyms.includes(gymId)` — controls whether `verifiedAttendee: true` is written on the review doc
- **`submitReview(uid, gymId, userName, userAvatar, rating, text, isVerified)`** → one-active-review guard (getDocs query), writes to `gyms/{gymId}/reviews`, awaits `awardPoints(uid, 'review', null, gymId)`. Returns `{ success, alreadyReviewed, pointsResult }`.

### `reviewService.js`
- **`checkReviewEligibility(uid, gymId)`** → `Promise<{ canReview, hasVerifiedRun }>`: single `getDoc` on `users/{uid}`; checks `pointsAwarded.runGyms` (run-completion path) and `pointsAwarded.gymVisits` (check-in path) independently.
  - `canReview = runGyms.includes(gymId) || gymVisits.includes(gymId)` — gates the review submission form
  - `hasVerifiedRun = runGyms.includes(gymId)` — controls whether `verifiedAttendee: true` is written on the review doc
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
> ⚠️ **InteractionManager pattern (added 2026-03-26):** `useGym`, `useGymPresences`, `useGymRuns`, `useGyms`, and `useLivePresenceMap` all wrap Firestore subscriptions in `InteractionManager.runAfterInteractions()`. This defers the subscription until any active navigation animation is complete, preventing snapshot callbacks from competing for the JS thread and causing the "frozen skeleton until touch" symptom.

| Hook | Returns | Backed by |
|---|---|---|
| `useAuth` | `{ user, loading }` | Firebase Auth |
| `useGym(gymId)` | `{ gym, loading }` | `subscribeToGym` (InteractionManager deferred — 2026-03-26) |
| `useGyms()` | `{ gyms, loading, error, getActivityLevel }` | `subscribeToGyms` (InteractionManager deferred — 2026-03-26; pure reader — no seeding) |
| `useGymPresences(gymId)` | `{ presences, loading, count }` | `subscribeToGymPresences` (InteractionManager deferred — 2026-03-26) |
| `useGymSchedules(gymId)` | `{ schedules, loading }` | schedules query |
| `usePresence()` | `{ activePresence, loading, checkIn, checkOut }` | `subscribeToUserPresence` |
| `useProfile(uid)` | `{ profile, loading }` | users doc onSnapshot |
| `useSchedules(uid)` | `{ schedules, todaySchedules, tomorrowSchedules, loading }` | schedules query |
| `useReliability(uid)` | `{ reliability, loading }` | `getUserReliability` |
| `useLocation()` | `{ location, error, loading }` | Expo Location |
| `useGymRuns(gymId)` | `{ runs, loading, joinedRunIds, userParticipants }` | `subscribeToGymRuns` + `subscribeToUserRunsAtGym` (both InteractionManager deferred — 2026-03-26) |
| `useLivePresenceMap()` | `{ presenceMap, countMap }` | Single `presence` subscription (status==active, limit 200); client-side `expiresAt` guard; deduplicates by `odId` per gym. InteractionManager deferred (2026-03-26). **Canonical source** for all-gym player counts — use `countMap[gymId]` everywhere, never `gym.currentPresenceCount`. |
| `useWeeklyWinners()` | `{ winners, weekOf, recordedAt, loading }` | `getLatestWeeklyWinners` (one-shot fetch on mount). `recordedAt` used by HomeScreen to show a 24-hour celebration card after each weekly reset. |
| `useMyGymRequests()` | `{ requests, loading, count, pendingCount }` | Real-time subscription to current user's `gymRequests` docs. `pendingCount` filters `status === 'pending'` for badge display. |
| `useIsAdmin()` | `{ isAdmin, loading }` | Checks `users/{uid}.isAdmin === true`. Used to gate all admin screens. |
| `useUserClips(uid)` | `{ clips, videoUrls, thumbnails, loading }` | User's own clips (by `uploaderUid`). |
| `useTaggedClips(uid)` | `{ allTagged, featuredIn, videoUrls, thumbnails, loading, refetch }` | Clips user is tagged in. V1: queries 100 recent clips, client-side filters by `taggedPlayers[].uid`. `allTagged` = all tagged clips. `featuredIn` = clips where `addedToProfile === true`. `refetch` bumps internal counter to re-query. Called with `useFocusEffect` on ProfileScreen and UserProfileScreen. |

| `useConversations()` | `{ conversations, loading, unreadCount }` | `dmService.subscribeToConversations`. Unread = `lastActivityAt > lastSeenAt[uid]`. |
| `useMyRunChats()` | `{ runChats, loading, runChatUnreadCount }` | `runService.subscribeToAllUserRuns` + `getDoc` per run for gymName/startTime/chatExpiresAt/lastMessageAt. `runChatUnreadCount` = count of chats where `lastMessageAt > lastReadAt` on the participant doc. Expired chats (past `chatExpiresAt`) are hidden from the inbox. For Messages inbox Run Chats section. |
---

## Cloud Functions (in runcheck-backend)

All Cloud Functions use `onCall` from `firebase-functions/v2/https`. Deployed from `~/Desktop/runcheck-backend`. Client calls via `callFunction('name', payload)` from `config/firebase.js` (region: `us-central1`).

### Moderation Functions
| Function | File | Role |
|----------|------|------|
| `hideClip` | `hideClip.ts` | Admin callable: hides a clip. Delegates to `enforceHideClip`. |
| `removeRun` | `removeRun.ts` | Admin callable: removes a run + related activity. Delegates to `enforceRemoveRun`. |
| `suspendUser` | `suspendUser.ts` | Admin callable: suspends a user with escalating timed duration. Delegates to `enforceSuspendUser`. Returns `{ suspensionLevel, durationDays, endsAt }`. |
| `unsuspendUser` | `unsuspendUser.ts` | Admin callable: lifts a suspension. Delegates to `enforceUnsuspendUser`. |
| `unhideClip` | `unhideClip.ts` | Admin callable: unhides a clip. Delegates to `enforceUnhideClip`. |
| `moderateReport` | `moderateReport.ts` | Admin callable: marks reports as reviewed/resolved with optional admin notes. |
| `submitReport` | `submitReport.ts` | User callable: submits a report with duplicate prevention. **Triggers auto-moderation** when **pending** count reaches threshold. Supports `type='message'` with `messageContext` payload. Added message support 2026-03-24. |
| `removeDmMessage` | `removeDmMessage.ts` | Admin callable: soft-deletes a DM message (`isRemoved: true`). Accepts `{ conversationId, messageId, reason?, reportId? }`. Calls `enforceRemoveDmMessage` → optionally `resolveRelatedReport`. Writes to `adminActions/{autoId}`. Added 2026-03-24. |

### moderationHelpers.ts — Shared Enforcement Logic
Single source of truth for all moderation actions. Both admin callables and auto-moderation call these helpers so logic is never duplicated.

| Helper | Target | Action |
|--------|--------|--------|
| `enforceHideClip` | `gymClips/{clipId}` | Sets `isHidden: true` + audit fields |
| `enforceRemoveRun` | `runs/{runId}` | Sets `isRemoved: true` + marks related activity |
| `enforceSuspendUser` | `users/{userId}` | Sets `isSuspended: true` with escalating timed duration |
| `enforceUnsuspendUser` | `users/{userId}` | Clears `isSuspended`, preserves `suspensionLevel` for history |
| `enforceUnhideClip` | `gymClips/{clipId}` | Clears `isHidden`, preserves audit trail |
| `resolveRelatedReport` | `reports/{reportId}` | Sets `status: 'resolved'` with system note |
| `enforceRemoveDmMessage` | `conversations/{id}/messages/{msgId}` | Sets `isRemoved: true` + audit fields. Idempotent. Added 2026-03-24. |

**Auto-moderation thresholds** (in `submitReport.ts`):
- Clip: 3 pending reports → `enforceHideClip` + resolve all related reports
- Run: 3 pending reports → `enforceRemoveRun` + resolve all related reports
- Player: 5 pending reports → `enforceSuspendUser` + resolve all related reports

**Suspension escalation**: `ESCALATION_DAYS = [1, 3, 7, 30, 365]`. Level increments on each suspension. Expired suspensions allow re-suspension at the next level. Admin accounts are never suspended.

**Admin auth pattern**: All admin callables check `context.auth` then `getDoc('users/{uid}').isAdmin === true`. Throws `unauthenticated` or `permission-denied` on failure.

### Other Functions
| Function | File | Role |
|----------|------|------|
| `submitGymRequest` | `submitGymRequest.ts` | User callable: gym request with 7-day rate limit. |
| `weeklyReset` | `weeklyReset.ts` | Scheduled: Monday 00:05 CT. Saves top 3 winners, resets `weeklyPoints`. |
| `checkIn` | `checkIn.ts` | Check-in with GPS validation. Suspension guard added 2026-03-17 (reads `users/{uid}`, rejects if `isSuspended` + active `suspensionEndsAt`). |
| `createRun` | `createRun.ts` | Create a new run. Suspension guard added 2026-03-17 (reads `users/{uid}`, rejects if `isSuspended` + active `suspensionEndsAt`). |
| `expirePresence` | `expirePresence.ts` | Server-side presence expiry. |
| `onScheduleWrite` | `onScheduleWrite.ts` | Firestore trigger on schedule writes. |
| `createClipSession` | `clipFunctions.ts` | Clip session creation. |
| `finalizeClipUpload` | `clipFunctions.ts` | Clip upload finalization. |
| `expireClips` | `expireClips.ts` | Scheduled clip expiry. |
| `addFriend` | `addFriend.ts` | Friend request acceptance. |
| `declineFriendRequest` | `declineFriendRequest.ts` | Friend request decline. |
| `cancelFriendRequest` | `cancelFriendRequest.ts` | Friend request cancellation. |
| `removeFriend` | `removeFriend.ts` | Remove a friend. |
| `deleteClip` | `deleteClip.ts` | User callable: soft-deletes own clip (`isDeletedByUser: true`). Admins can delete any clip. Clears `isDailyHighlight` if active. |
| `featureClip` | `featureClip.ts` | Admin callable: features a clip as daily highlight. |
| `unfeatureClip` | `unfeatureClip.ts` | Admin callable: removes daily highlight. |
| `addClipToProfile` | `addClipToProfile.ts` | User callable: tagged user marks own `addedToProfile: true`. Validates caller is in `taggedPlayers`. Idempotent. **Only path for client-side taggedPlayers writes.** |

### Phase 1 Push Notification Functions (deployed 2026-03-20)
Shared helper: `notificationHelpers.ts` — `sendExpoPush()` (Expo Push API via Node `https`) + `checkAndSetCooldown()` (Firestore transaction dedup via `users/{uid}.notifCooldowns`). Not exported as a Cloud Function — internal module only.

| Function | File | Role |
|----------|------|------|
| `notifyRunStartingSoon` | `notifyRunStartingSoon.ts` | **Scheduled every 5 min.** Finds `runs` with `status=='upcoming'` and `startTime` in [now+25min, now+35min]. Sends "run starts soon" push to every participant. Cooldown key `runReminder_{runId}`, 24h TTL per participant. |
| `onRunParticipantJoined` | `onRunParticipantJoined.ts` | **Firestore onCreate** on `runParticipants/{docId}`. Notifies run creator when a new player joins. Skips self-join (creator joining their own run). Cooldown key `participantJoined_{runId}` on creator doc, 5-min TTL (batches rapid joins). |
| `onParticipantCountMilestone` | `onParticipantCountMilestone.ts` | **Firestore onUpdate** on `runs/{runId}`. Fires when `participantCount` crosses milestone thresholds [5, 10, 20]. Notifies creator once per milestone. Cooldown key `runMilestone_{runId}_{threshold}` on creator doc, 24h TTL. |
| `onDmMessageCreated` | `onDmMessageCreated.ts` | **Firestore onCreate** on `conversations/{id}/messages/{msgId}`. Sends push notification to the recipient. Mute guard: reads `conversationData.mutedBy?.[recipientUid]` (already loaded) — returns early if muted (no push, no cooldown penalty). Added 2026-03-24. |

### Phase 2 Push Notification Functions (deployed 2026-03-26)

| Function | File | Role |
|----------|------|------|
| `notifyFollowersRunCreated` | `notifyFollowersRunCreated.ts` | **Firestore onCreate** on `runs/{runId}`. Queries all users whose `followedGyms` contains the run's `gymId`. Skips: private runs, past-start runs, the creator, users with no push token. Dedup: cooldown key `followRunCreated_{runId}` on each follower doc, 24h TTL (one notification per run per follower). Falls back to `gyms/{gymId}.name` when `gymName` is absent from the run doc (Cloud Function-created runs don't include it). Notification copy: Title `"New run at {gymName}"`, Body `"{Day} at {time} — tap to join"` (America/Chicago timezone). Deep link data: `{ screen: 'RunDetails', runId, gymId }`. |
| `onGymPresenceUpdated` | `notifyFollowersPresenceMilestone.ts` | **Firestore onDocumentUpdated** on `gyms/{gymId}`. Watches `currentPresenceCount` for upward crossings of thresholds [3, 6]. On crossing, writes a pending milestone marker to the gym doc (`presenceMilestonePending`, `presenceMilestoneThreshold`, `presenceMilestoneReachedAt`). Does NOT send notifications directly — defers to the scheduler for stability validation. Clears the marker if count drops below all thresholds. |
| `notifyFollowersPresenceMilestone` | `notifyFollowersPresenceMilestone.ts` | **Scheduled every 5 min.** Finds gyms with `presenceMilestonePending == true`. For each, checks that the milestone has been stable for 5+ minutes (`STABILITY_MS`) and that the current count is still at/above the threshold. Notifies all followers of the gym. Dedup: cooldown key `presenceMilestone_{gymId}` on each follower doc, 3-hour TTL (one live-activity alert per gym per user per 3 hours). Notification copy: Title `"🏀 {gymName} is live"`, Body `"{count} players are hooping — tap to join!"`. Deep link data: `{ screen: 'GymDetail', gymId }`. |

**New Firestore fields on `gyms/{gymId}` (written by `onGymPresenceUpdated`):**
- `presenceMilestonePending: boolean` — true when a threshold crossing is awaiting stability confirmation
- `presenceMilestoneThreshold: number` — which threshold (3 or 6) is pending
- `presenceMilestoneReachedAt: Timestamp` — when the threshold was first crossed (used for stability check)

**What was intentionally deferred to V3 (do not implement until approved):**
- `notifyFollowersRunActive` — alert when a run's status transitions to 'active'. Needs `status` field to be written consistently before this is reliable.
- Per-gym mute preferences (`users/{uid}.notifPrefs.mutedGyms[]`).
- Daily notification cap across all followed-gym alerts.
- Follower query pagination for gyms with 500+ followers (currently loads all into memory).

### Scheduled Visitor Run Notifications (Phase 2, added 2026-03-29)

| Function | File | Role |
|----------|------|------|
| `onRunCreatedNotifyScheduledVisitors` | `onRunCreatedNotifyScheduledVisitors.ts` | **Firestore onCreate** on `runs/{runId}`. Notifies users who have an active scheduled visit at the same gym within ±60 min of the run's `startTime`. |

**Trigger:** `onDocumentCreated('runs/{runId}')`

**Matching logic:**
- `schedules.gymId === run.gymId` (exact match)
- `schedules.status === 'scheduled'` (not cancelled / attended / no_show)
- `schedules.scheduledTime` within ±60 min of `run.startTime`
- The ±60-min window intentionally mirrors the `startOrJoinRun` merge rule — every user whose visit falls inside the merge window is notified

**Firestore query:** `schedules where gymId == X AND status == 'scheduled' AND scheduledTime >= (startTime − 60min) AND scheduledTime <= (startTime + 60min)`
Served by the existing composite index `(gymId ASC, status ASC, scheduledTime ASC)` in `firestore.indexes.json`. **No new index required.**

**Exclusions:**
- Run creator (`run.createdBy` / `run.creatorId`) — they just started it
- Private runs (`run.isPrivate === true`) — same guard as `notifyFollowersRunCreated`
- Users with no `pushToken`
- Stale runs: `startTime` more than 10 min in the past (same cold-start grace window as `notifyFollowersRunCreated`)

**Deduplication:** Cooldown key `scheduleRunCreated_{runId}` on `users/{uid}.notifCooldowns`, 24h TTL.

**Notification copy:**
- Title: `"🏀 A run just started at {gymName}"`
- Body: `"You planned to be here at {timeLabel}. Tap to join the run."`
- Data payload: `{ type: 'run_created_for_schedule', runId, gymId }`

**Time formatting:** Uses `formatRunTime()` helper (same logic as `notifyFollowersRunCreated`): "Today at 6:00 PM" / "Tomorrow at 6:00 PM" / "Tue, Mar 28 at 6:00 PM". Timezone: America/Chicago.

**⚠️ Known V1 limitation — duplicate notifications:** A user who both follows the gym AND has a scheduled visit will receive two notifications on run creation — one from `notifyFollowersRunCreated` (key `followRunCreated_{runId}`) and one from this function (key `scheduleRunCreated_{runId}`). These are independent cooldown keys; both fire. Acceptable for V1 (small user base, rare overlap). See PARKING_LOT.md: "Unified run-created notification dedup (followRunCreated + scheduleRunCreated)".

**Deploy:** `firebase deploy --only functions:onRunCreatedNotifyScheduledVisitors`

---

## Points & Ranks
Ranks defined in `config/ranks.js`. Point values in `config/points.js`. Perk definitions in `config/perks.js`. Rank helpers in `utils/rankHelpers.js`. Perk helpers in `utils/perkHelpers.js`.
```js
POINT_VALUES = {
  checkin: 10,
  checkinWithPlan: 15,    // bonus for honoring a schedule
  runComplete: 10,
  review: 15,
  followGym: 2,
  completeProfile: 10,
}
RANKS = [Bronze (0), Silver (200), Gold (600), Platinum (1500), Diamond (3500), Legend (7500)]
// each has: id, label, name, minPoints, maxPoints, nextRankAt, icon, color, glowColor, perks[]
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
- **Clip tagging**: Max 5 tagged players per clip. Tags validated in `finalizeClipUpload`: dedupe by uid, verify each uid exists in `users` collection, trim displayName to 50 chars, fallback to Firestore displayName.
- **Clip approval (addedToProfile)**: Only the tagged user can set their own `addedToProfile: true` via `addClipToProfile` Cloud Function. Client NEVER writes `taggedPlayers` directly. Firestore rules block all client writes to `taggedPlayers`.
- **Per-session clip limit**: Deterministic clipId means one clip per user per session. Soft-deleted clips still consume the session slot (cannot repost for same run).
- **Weekly free-tier clip cap**: `FREE_CLIPS_PER_WEEK = 3`. Excludes `abandoned` and `isDeletedByUser === true` clips. Deleting a clip restores the weekly slot but NOT the session slot.

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
12. gymClips:        uploaderUid ASC, createdAt ASC         ← weekly clip count query in createClipSession
13. gymClips:        createdAt DESC                         ← useTaggedClips broad query (limit 100)
```

---

## Known Issues / TODO (Backend)
1. **GPS enforcement is off** — re-enable the commented-out distance check in `presenceService.checkIn` before launch
2. **Auto-expiry is client-side only** — need Cloud Function to expire presences server-side without deducting points (call `checkOut(isManual=false)`)
3. **`gym.currentPresenceCount` lags real-time** — it's a denormalized counter updated by transactions; not filtered by `expiresAt`. The UI must NOT use it for display — always use `useLivePresenceMap` / `subscribeToGymPresences`. All screens now use the correct source. (`PlanVisitScreen` was the last remaining violation; fixed 2026-03-13 — replaced with `countMap[gym.id]` from `useLivePresenceMap`.)
4. **`activity` index** — confirm composite Firestore index exists for `createdAt DESC` inequality query on HomeScreen feed
5. **Reliability writes** — currently all in Cloud Functions (backend). Do not re-add to client code.
6. **~~`'joined a run at'` activity writes~~** — ✅ RESOLVED. Activity writes removed from `runService.js`; existing Firestore docs suppressed by client-side filter in HomeScreen.js (`item.action === 'joined a run at'` → `return false`).
7. **~~`participantCount` floor~~** — ✅ RESOLVED. `leaveRun` transaction now reads `participantCount` from `runSnap` and skips `increment(-1)` when count is already `<= 0`. Existing negative counts (if any) are not repaired — only new negatives are prevented. A one-time cleanup script can fix historical data if needed.
8. **Runs indexes** — three new composite indexes required (see Required Firestore Indexes #8–10). Create these in the Firebase console or `firestore.indexes.json` to avoid "index required" errors at query time.
10. **~~Run Chat Firestore rules must be deployed~~** — ✅ RESOLVED. Deployed 2026-03-25, verified match 2026-03-26. `match /messages/{messageId}` inside `match /runs/{runId}` with participant-only access and `isChatActive()` + `isNotSuspended()` enforcement is live.

11. **~~`conversations` Firestore rules not written~~** — ✅ RESOLVED. Deployed 2026-03-25, verified match 2026-03-26. Participant-only reads/writes enforced via `participantIds` array. DM messages gated by parent doc lookup + `isNotSuspended()` on create.
13. **~~`usernames` Firestore rules not written~~** — ✅ RESOLVED. Deployed 2026-03-25, verified match 2026-03-26. Create requires `uid == request.auth.uid`; update and delete blocked.

9. **`notifCooldowns` map will grow unboundedly** — Phase 1 notifications store cooldown keys as a map on `users/{uid}.notifCooldowns`. Each key is unique per run (e.g. `runReminder_{runId}`, `participantJoined_{runId}`, `runMilestone_{runId}_5`). Power users who join hundreds of runs over time will accumulate a large map, approaching Firestore's 1 MB doc limit. **Migration plan:** Move to `users/{uid}/notifCooldowns/{key}` subcollection (one doc per cooldown key, `setAt: Timestamp`). Only `checkAndSetCooldown` in `notificationHelpers.ts` needs to change. Add a Firestore TTL policy on the subcollection to auto-delete docs after 48h. **Do this before serious marketing / ~500+ active users.**

---

## Config & Environment
- `config/firebase.js` — exports `db`, `auth`, `storage`
- `config/env.js` — environment variables
- `serviceAccountKey.json` — firebase-admin key for migration scripts only (never import in app code). ✅ Verified not in git history (2026-03-26) — no credential exposure, no rotation required.
- ~~`firestore.rules`~~ — **Removed from this repo.** Firestore security rules live in the backend repo (`~/Desktop/runcheck-backend/firestore.rules`). Deploy from there: `cd ~/Desktop/runcheck-backend && firebase deploy --only firestore:rules`
- ~~`firebase.json`~~ — **Removed from this repo.** Firebase CLI config lives in the backend repo (`~/Desktop/runcheck-backend/firebase.json`). The backend repo's `.firebaserc` binds to project `runcheck-567a3`.
