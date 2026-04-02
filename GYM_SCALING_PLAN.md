# Gym Scaling System Design — RunCheck

*Planning document — 2026-03-15. No code changes yet.*

---

## A. Current State Findings

### A1. Gym Data Model (actual Firestore fields from seedProductionGyms.js)

Every gym document lives at `gyms/{gymId}`. The seed script writes these fields:

| Field | Type | Present in all 5 gyms | Documented in models.js |
|---|---|---|---|
| name | string | Yes | Yes |
| address | string | Yes | Yes |
| city | string | Yes | No |
| state | string | Yes | No |
| type | `"indoor"` or `"outdoor"` | Yes | Yes |
| accessType | `"paid"` or `"free"` | Yes | No |
| notes | string (can be empty) | Yes | Yes |
| imageUrl | string (URL) | 4 of 5 (Cowboys Fit omits it) | Yes (marked optional) |
| location | `{ latitude, longitude }` | Yes | Yes |
| checkInRadiusMeters | number | Yes (all 100) | Yes |
| currentPresenceCount | number | Yes (seeded as 0) | Yes |
| scheduleCounts | object | Yes (seeded as {}) | Yes |
| autoExpireMinutes | number | Yes (all 120) | Yes |
| createdAt | Timestamp | Not set by seed script | Documented but never written |
| updatedAt | Timestamp | Not set by seed script | Documented but never written |

**Key gaps:**
- `accessType` is used by both ViewRunsScreen (line 321) and RunDetailsScreen (line 1307) but is not documented in `models.js`.
- `city` and `state` are written by the seed script but not documented in `models.js`.
- `createdAt` and `updatedAt` are documented in `models.js` but never actually written by the seed script.
- There is no `enabled` / `active` / `status` field — every gym in the collection is assumed to be live.

### A2. Gym IDs

Convention is a kebab-case slug: `cowboys-fit-pflugerville`, `clay-madsen-round-rock`, `pan-american-recreation-center`, `lifetime-austin-north`, `golds-gym-hesters-crossing`.

The slug is used as the Firestore document ID and as a key in `GYM_LOCAL_IMAGES`, in compound presence IDs (`{odId}_{gymId}`), and in schedule lookups. Changing a gym's ID after it has presence/schedule history would orphan that data.

### A3. Image Handling

Three-tier resolution in ViewRunsScreen and CheckInScreen:
1. `GYM_LOCAL_IMAGES[gym.id]` → bundled local asset (only Cowboys Fit currently)
2. `gym.imageUrl` → remote URL from Firestore
3. Fallback → `require('../assets/images/court-bg.jpg')`

Only one gym (Cowboys Fit) has a local override. The other four use `imageUrl` strings that point to Yelp, Google, Cloudinary, and Life Time CDNs — URLs that could break at any time with no notification.

### A4. Coordinate Accuracy

Cowboys Fit coordinates are still approximate (address-parcel level, not building-level). The other four were corrected in the earlier session via Nominatim geocoding. There is no automated validation that a coordinate actually falls on or near the stated address.

### A5. Screens That Consume Gym Data

| Screen | Hook(s) | What it uses |
|---|---|---|
| ViewRunsScreen | useGyms, useLivePresenceMap, useProfile | Full gym list, presence counts, followedGyms |
| GymMapScreen | useGyms | gym.location for map pins, gym.type for marker color |
| RunDetailsScreen | useGym, useGymPresences, useGymSchedules | Single gym detail, presence list, schedules |
| CheckInScreen | useGyms, useProfile | Followed gym shortcuts with images |
| ProfileScreen | useLivePresenceMap | Presence counts (indirect gym reference) |

### A6. Services That Write to Gym Documents

- `presenceService.js` — increments/decrements `currentPresenceCount` on check-in/check-out
- `scheduleService.js` — updates `scheduleCounts` map on schedule create/cancel
- `gymService.updateGymLocation()` — admin utility (unused in normal app flow)
- `seedProductionGyms.js` — sole admin writer for all other gym fields

### A7. What's Missing for Scaling

- No `functions/` directory — there are no Cloud Functions. Any future admin approval workflow or automated validation would need this created from scratch.
- `firestore.rules` is empty — the Firestore database has no security rules deployed from this repo. Any client can currently read and write anything. This is a security concern independent of gym scaling, but it becomes more urgent once user-submitted data (gymRequests) enters the picture.
- No concept of gym "status" or "visibility" — if a gym document exists, it's live.
- No validation script — the seed script trusts whatever data is in its array.

---

## B. Recommended Approved Gym Schema

This is the canonical shape every gym document in `gyms/{gymId}` should have before it goes live.

### Required Fields (seed script must enforce)

| Field | Type | Rule |
|---|---|---|
| name | string | Non-empty. Human-readable gym name. |
| address | string | Full street address including city, state, ZIP. |
| city | string | City name (used for future filtering/grouping). |
| state | string | Two-letter state code, e.g. `"TX"`. |
| type | string | Must be `"indoor"` or `"outdoor"`. Use the `GYM_TYPE` constant. |
| accessType | string | Must be `"paid"` or `"free"`. |
| location | object | `{ latitude: number, longitude: number }`. Must be **building-level accurate** — verified by dropping a pin in Google Maps on the actual court/gym building, not from an address geocoder. |
| checkInRadiusMeters | number | Positive integer. Default 100. May need to be larger for outdoor courts or multi-building campuses. |
| autoExpireMinutes | number | Positive integer. Default 120. |

### Optional Fields

| Field | Type | Rule |
|---|---|---|
| notes | string | Freeform. Can be empty string. |
| imageUrl | string | Valid HTTPS URL to a gym photo. If omitted, the app falls back to `GYM_LOCAL_IMAGES` or the default court image. Prefer images you control (e.g., Firebase Storage) over third-party CDN URLs that can break. |

### System-Managed Fields (never set manually in seed data)

| Field | Type | Managed By |
|---|---|---|
| currentPresenceCount | number | presenceService (atomic increment/decrement) |
| scheduleCounts | object | scheduleService (per-slot counts) |
| createdAt | Timestamp | Should be set by seed script on first write only |
| updatedAt | Timestamp | Should be set by seed script on every write |

**Change from current behavior:** The seed script currently seeds `currentPresenceCount: 0` and `scheduleCounts: {}` on every run. Because it uses `merge: true`, this overwrites live counts back to zero if the script runs while players are checked in. These two fields should be removed from the seed data and only initialized on first creation (or not at all — let the services create them on first use).

### ID Convention

Format: `{name-slug}-{city-or-neighborhood}` in kebab-case. Examples: `cowboys-fit-pflugerville`, `golds-gym-hesters-crossing`. The ID is permanent once created — it's referenced by presence documents, schedule documents, followed-gym arrays, and potentially analytics. Never rename a gym ID after it has been used.

---

## C. Recommended Gym Request Schema

New collection: `gymRequests/{requestId}`

This is where user-submitted gym suggestions land. They are never visible in the main app until an admin reviews, verifies, and promotes them to the `gyms` collection.

### Proposed Fields

| Field | Type | Notes |
|---|---|---|
| requestId | string (auto-generated) | Firestore auto-ID. Not a slug — these aren't stable references. |
| gymName | string | User-provided name. May be informal ("the Y on Parmer"). |
| address | string | User-provided address. May be incomplete or wrong. |
| city | string | Optional. User-provided. |
| state | string | Optional. User-provided. |
| type | string | `"indoor"` / `"outdoor"` / `"unknown"`. |
| notes | string | Optional freeform from the user ("they have 2 courts, open 6am-10pm"). |
| location | object or null | `{ latitude, longitude }` if the user dropped a pin or shared location. Null if they only typed an address. |
| submittedBy | string | The user's `odId` (Firebase Auth UID). |
| submitterName | string | Display name at time of submission. |
| status | string | `"pending"` → `"approved"` / `"rejected"` / `"duplicate"`. |
| adminNotes | string | Notes from the admin during review (e.g., "merged with existing gym X"). |
| reviewedBy | string or null | Admin UID who reviewed it. |
| reviewedAt | Timestamp or null | When the review happened. |
| createdAt | Timestamp | Server timestamp at submission. |
| updatedAt | Timestamp | Server timestamp on any status change. |
| promotedGymId | string or null | If approved, the `gymId` of the resulting gym in the `gyms` collection. Links the request to its outcome. |

### Key Design Decisions

**Why a separate collection instead of a `status` field on `gyms`?** Three reasons. First, the client currently does `subscribeToGyms()` which fetches the entire `gyms` collection with a real-time listener. If unapproved requests lived in the same collection, every client would download them, and you'd need to add a `where('status', '==', 'approved')` filter everywhere — a brittle change across 5+ screens and hooks. Second, gym requests may contain bad data (wrong coordinates, duplicate names, spam) and should never risk appearing in the live app due to a missed filter. Third, Firestore security rules are much cleaner when trusted data and untrusted data live in separate collections — you can allow users to create `gymRequests` documents but block them from writing to `gyms`.

**Why auto-generated IDs?** Requests are throwaway — the user doesn't control the slug. If the request is approved, the admin assigns a proper kebab-case slug when promoting it to `gyms`.

---

## D. Gym Onboarding Workflow

### Adding a New Approved Gym (admin flow, now)

1. **Gather info**: Name, address, type (indoor/outdoor), access type (paid/free), notes.
2. **Get coordinates**: Open Google Maps, navigate to the gym, right-click the exact building/court → "What's here?" → copy the latitude/longitude. Do NOT use an address geocoder — it returns parcel centroids, not building pins.
3. **Get image**: Either take/find a photo and upload to Firebase Storage (preferred) or use a stable image URL you control. Avoid Yelp/Google/CDN hotlinks.
4. **Choose an ID**: `{name-slug}-{city}` in kebab-case. Check that this ID doesn't already exist in Firestore.
5. **Add to seed script**: Add the new entry to the `gyms` array in `seedProductionGyms.js`.
6. **Run validation** (proposed — does not exist yet): A script that checks all required fields, validates coordinate ranges, confirms the ID is unique, and optionally reverse-geocodes to sanity-check the pin is near the stated address.
7. **Run seed**: `node seedProductionGyms.js`
8. **Verify in app**: Open the app, confirm the gym appears in the list, map pin is correct, "Get Directions" works, image loads.
9. **Optional: add local image override**: If the gym should use a bundled asset instead of a URL, add an entry in `constants/gymAssets.js`.

### Promoting a User Request to Approved Gym (admin flow, future)

1. Review request in admin panel or Firebase console.
2. Verify/correct all fields (name, address, coordinates, type, access).
3. Assign a permanent kebab-case gym ID.
4. Add to `seedProductionGyms.js` (or use an admin tool that writes directly to `gyms`).
5. Run seed / write to Firestore.
6. Update the `gymRequests` document: set `status: 'approved'`, `promotedGymId`, `reviewedBy`, `reviewedAt`.
7. The client picks up the new gym automatically.

---

## E. Validation / Guardrails

### Problems the Current Seed Script Can Cause

1. **Overwrites live counts**: `currentPresenceCount: 0` and `scheduleCounts: {}` are in the seed data. A re-run during active play resets them.
2. **No field validation**: The script trusts whatever is in the array. A missing `location` or a typo in `type` would create a broken gym.
3. **No coordinate sanity check**: Nothing confirms the latitude/longitude is in Texas, let alone near the stated address.
4. **No duplicate detection**: Nothing prevents two entries with the same `id` in the array (the second would silently overwrite the first).
5. **Fragile image URLs**: Four of five gyms use third-party CDN URLs.

### Recommended Guardrails (to build as a validation utility)

A `validateGymData.js` script (or a `--dry-run` flag on the seed script) that runs before seeding and checks:

- **Required fields present**: Every gym has `name`, `address`, `city`, `state`, `type`, `accessType`, `location.latitude`, `location.longitude`, `checkInRadiusMeters`, `autoExpireMinutes`.
- **Type constraints**: `type` is `"indoor"` or `"outdoor"`. `accessType` is `"paid"` or `"free"`.
- **Coordinate bounds**: Latitude is between 29.0 and 32.0, longitude between -99.0 and -96.0 (rough Texas bounding box). This catches transposed or wildly wrong values.
- **No duplicate IDs**: All `id` values in the array are unique.
- **ID format**: Matches `/^[a-z0-9]+(-[a-z0-9]+)*$/` (kebab-case, no uppercase, no special characters).
- **Image URL reachable** (optional, slow): HTTP HEAD request to each `imageUrl` to confirm it returns 200.
- **No system-managed fields in seed data**: Warns if `currentPresenceCount` or `scheduleCounts` are present (they should be removed).
- **createdAt / updatedAt handling**: Seed script should use `admin.firestore.FieldValue.serverTimestamp()` for `updatedAt` on every run, and set `createdAt` only when the document doesn't already exist (check first, or use a conditional merge pattern).

---

## F. Phased Implementation Plan

### Phase 1: Pre-scaling cleanup (do now, before adding more gyms)

**Goal:** Make the seed script safe and reliable so adding gym #6 doesn't cause regressions.

1. **Remove `currentPresenceCount` and `scheduleCounts` from seed data.** These are system-managed fields. Seeding them overwrites live data. Instead, let the services initialize them on first use — `presenceService` already handles the increment, and a missing field treated as 0 is safe.

2. **Add `createdAt` / `updatedAt` to the seed script.** Use `serverTimestamp()` for `updatedAt` on every run. For `createdAt`, check if the document exists first and only set it on creation.

3. **Add `accessType` to the `models.js` documentation.** Also add `city` and `state`. These are real fields used by the app but not documented.

4. **Build a `--dry-run` / `--validate` mode for the seed script.** Before writing to Firestore, validate all entries against the rules in Section E. Print a report. Exit without writing if any entry fails. This can be as simple as a `validateGym(gym)` function called in a loop before the Firestore writes.

5. **Add the coordinate-selection rule to the seed script header comment.** Future-you (or any contributor) should see the instruction "get coordinates from Google Maps pin drop, not from a geocoder" right where the data lives.

### Phase 2: Add new gyms ✅ COMPLETE (2026-03-29)

**Goal:** Scale from 5 to N gyms safely using the improved seed script.

**Done:** 19 gyms total in Firestore as of 2026-03-29. Original 9 fully enriched (placeId, website, imageUrl, photoGallery). Batch 2 (10 gyms) seeded with core fields — enrichment pipeline still needs to run for photos.

**Batch 2 pending enrichment** (`cd ~/Desktop/runcheck-backend`):
```bash
node scripts/enrichGymsWithPlaces.js   # → enrichedGyms.json
node scripts/downloadGymPhotos.js      # → enrichedGymsWithImages.json + Firebase Storage
node scripts/seedGyms.js               # → writes placeId/website/imageUrl/photoGallery to Firestore
```

**Also needed:** Pin-drop coordinate verification for all 10 Batch 2 gyms (current coords are best-effort estimates from training data — verify each one in Google Maps).

### Phase 3: Gym request collection (do when ready for user-facing feature)

**Goal:** Let users submit gym suggestions without touching the approved gyms collection.

1. **Create `gymRequests` collection** with the schema from Section C.
2. **Add Firestore security rules:**
   - `gymRequests`: authenticated users can `create` (with field validation). Only admin can `update` or `delete`.
   - `gyms`: no client writes at all (admin SDK only). Clients can `read`.
3. **Build a simple request form** in the app (name, address, type, optional pin drop, notes).
4. **Build a `gymRequestService.js`** with `submitGymRequest(data)` that writes to `gymRequests`.
5. **No admin UI yet** — review requests in Firebase console.

### Phase 4: Admin review flow (defer)

**Goal:** Streamline the approval process.

1. **Build a lightweight admin panel** (could be a simple web page using firebase-admin, or a Cloud Function with a basic UI).
2. **Approval action**: validates the request data, generates a gym ID, writes to `gyms`, updates the request status.
3. **Rejection action**: sets `status: 'rejected'` with `adminNotes`.
4. **Optional: notify the submitter** via push notification or in-app message.

### Phase 5: Cloud Functions for automation (defer)

**Goal:** Reduce manual work.

1. **Auto-geocode**: When a gym request is submitted, a Cloud Function reverse-geocodes the address to suggest coordinates (but an admin still verifies).
2. **Duplicate detection**: Cloud Function checks if a request name/address is suspiciously close to an existing gym.
3. **Image upload**: Allow users to attach a photo with their request; Cloud Function stores it in Firebase Storage.

### What stays admin-only (indefinitely)

- Writing to the `gyms` collection
- Choosing gym IDs
- Verifying coordinates
- Approving/rejecting gym requests
- Running the seed script
- Deleting gyms

### What becomes user-facing (Phase 3+)

- Submitting a gym request (read/write own requests only)
- Viewing status of own requests (optional, Phase 4)

---

## G. Risks / Things to Watch For

**1. Seed script overwrites live presence counts.**
This is the most urgent issue. If you run `node seedProductionGyms.js` while players are checked in at any gym, their `currentPresenceCount` gets reset to 0. The live presence map (useLivePresenceMap) will still show correct counts because it reads the `presence` collection directly, but `gym.currentPresenceCount` will be wrong until the next check-in/check-out recalculates it. Fix this in Phase 1 by removing those fields from the seed data.

**2. Third-party image URLs will break.**
Four gyms use hotlinked images from Yelp, Google Encrypted, Cloudinary, and Life Time's CDN. Any of these could change their URL structure, add hotlink protection, or remove the image. When this happens the gym card will show the generic fallback. Consider migrating to Firebase Storage or another CDN you control.

**3. No Firestore security rules.**
The rules file is empty. Any authenticated client (or anyone, depending on default config) can write directly to `gyms`, delete documents, or read `gymRequests`. This must be addressed before launching gym requests (Phase 3) — otherwise a user could write directly to `gyms` and bypass the approval flow.

**4. Activity level color inconsistency.**
`useGyms.js` and `useGym.js` define the same activity thresholds (0, 1-3, 4-7, 8+) but use different hex colors (e.g., green is `#22C55E` in one and `#4caf50` in the other). This isn't a scaling blocker but it's a code smell that will get worse with more gyms. Consider extracting activity levels to a shared constant.

**5. `merge: true` overwrites every field present in the data.**
This is the behavior that caused the coordinate regression earlier. If the seed script has a field and Firestore has a different value for that field, the seed script wins. This is correct for admin-managed fields (name, address, type) but dangerous for system-managed fields (counts, timestamps). The fix is simple: don't include system-managed fields in the seed data.

**6. Gym ID is permanent.**
Once a gym has check-in history, schedule history, and followed-gym references, its ID cannot be changed without migrating all that data. Choose IDs carefully. The `{name-slug}-{city}` convention works well but could collide if two gyms with similar names exist in the same city (e.g., two Gold's Gyms in Round Rock). Consider adding a neighborhood or cross-street to disambiguate.

**7. No "soft delete" mechanism.**
If a gym closes or needs to be temporarily hidden, the only option today is deleting the Firestore document. This would break any presence or schedule documents that reference it. Consider adding an `active: boolean` field to the gym schema (defaulting to `true`) and filtering on it in `subscribeToGyms`. This way a gym can be hidden without destroying its history. This is not urgent for 5-10 gyms but becomes important at scale.

**8. `subscribeToGyms` fetches all gyms with no limit.**
The current Firestore listener in `gymService.js` fetches the entire `gyms` collection ordered by name. This is fine for 5-20 gyms. At 50+ it could become slow on poor connections. At 200+ it would be a real performance concern. When the time comes, add geohash-based filtering or pagination. Not needed now.

---

*End of planning document. Ready for review before any implementation begins.*
