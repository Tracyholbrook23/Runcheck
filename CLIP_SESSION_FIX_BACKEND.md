# Backend Changes Required — Per-Session Clip Duplicate Fix
_Created: 2026-03-10_

## Context
The client (`RunDetailsScreen.js`) now passes `presenceId` when calling
`createClipSession`.  The Cloud Function must be updated to accept it, store
it on the `gymClips` doc, and use it in the duplicate check.

`presenceId` is the compound key `{uid}_{gymId}` written by
`presenceService.checkIn()` — e.g. `"abc123_clayMadsenGym456"`.

---

## 1. `createClipSession` — required changes

### New request payload field
```ts
{ gymId: string, presenceId: string | null }
```
`presenceId` may be `null` if the user is not checked in.  The function should
handle this gracefully (see duplicate-check logic below).

### Duplicate-check query — CHANGE THIS
```ts
// ❌ CURRENT (broken): blocks all users after one person posts
const existing = await db.collection('gymClips')
  .where('gymId', '==', gymId)
  .where('expiresAt', '>', now)
  .limit(1)
  .get();
if (!existing.empty) throw new HttpsError('already-exists', '...');

// ✅ CORRECT: scoped per user per session
if (presenceId) {
  // True per-session check — preferred path once presenceId is available
  const existing = await db.collection('gymClips')
    .where('uploaderUid', '==', uid)
    .where('presenceId', '==', presenceId)
    .limit(1)
    .get();
  if (!existing.empty) throw new HttpsError('already-exists',
    'You already posted a clip for this session.');
} else {
  // Fallback: presenceId not available (older client) — scope by user+gym+window
  const existing = await db.collection('gymClips')
    .where('gymId', '==', gymId)
    .where('uploaderUid', '==', uid)
    .where('expiresAt', '>', now)
    .limit(1)
    .get();
  if (!existing.empty) throw new HttpsError('already-exists',
    'You already posted a clip for this session.');
}
```

### Store presenceId on the new doc
```ts
await db.collection('gymClips').doc(clipId).set({
  gymId,
  uploaderUid: uid,
  presenceId: presenceId ?? null,   // ← ADD THIS FIELD
  status: 'reserved',
  storagePath,
  expiresAt,
  createdAt: FieldValue.serverTimestamp(),
  // ... other existing fields unchanged
});
```

---

## 2. Required Firestore index

Add a composite index to cover the per-session duplicate check:

```json
{
  "collectionGroup": "gymClips",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "uploaderUid", "order": "ASCENDING" },
    { "fieldPath": "presenceId",  "order": "ASCENDING" }
  ]
}
```

Add to `firestore.indexes.json` in the backend repo, or create manually in
the Firebase console under Firestore → Indexes → Composite.

The fallback query (uploaderUid + gymId + expiresAt) also needs an index:
```json
{
  "collectionGroup": "gymClips",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "gymId",       "order": "ASCENDING" },
    { "fieldPath": "uploaderUid", "order": "ASCENDING" },
    { "fieldPath": "expiresAt",   "order": "ASCENDING" }
  ]
}
```

---

## 3. `gymClips` document schema addition

```ts
{
  gymId:        string,
  uploaderUid:  string,
  presenceId:   string | null,   // ← NEW FIELD (compound key {uid}_{gymId})
  status:       'reserved' | 'ready_raw' | 'ready' | 'ready_processed',
  storagePath:  string,
  expiresAt:    Timestamp,
  createdAt:    Timestamp,
  // ... all other existing fields unchanged
}
```

---

## 4. No changes required

- `finalizeClipUpload` — does not need to change; presenceId is already on the
  doc when finalize runs.
- Client clips feed query (`RunDetailsScreen.js`) — unchanged; the query still
  filters by `gymId + expiresAt`.
- `ClipPlayerScreen`, `RecordClipScreen`, `TrimClipScreen` — unchanged.

---

## Deployment order

1. Deploy the updated `createClipSession` function.
2. Create the Firestore indexes (or let them auto-build from `firestore.indexes.json`).
3. No data migration needed — existing docs without `presenceId` are handled
   by the null-safe fallback path in the duplicate check.
