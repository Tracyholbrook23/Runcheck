# Current Focus — Michigan Gym Expansion

Texas gyms: ✅ complete. Michigan Batch 8 gyms: ✅ audit complete (all verified, fixed, or archived as of 2026-04-19).

## Session Summary — 2026-04-19

### Completed today
- **IM West** (`msu-im-west`) — coordinates corrected twice; final verified coords: `42.72904384119816, -84.4870783518538` via Google Maps pin
- **IM Circle** (`msu-im-circle`) — coordinates fixed: `42.73186045039393, -84.48576466431427`, address: `308 W Circle Dr, East Lansing, MI 48824`
- **Patriarche Park** — archived (`status: 'archived'`), unconfirmed basketball courts
- **The Club at Chandler Crossings** (`club-chandler-crossings`) — NEW gym added: `3850 Coleman Rd, East Lansing, MI 48823`, coords `42.77254580224525, -84.48743187233903`, photo uploaded to Firebase Storage as `cover.jpg`
- **Hannah Community Center** — photo re-uploaded as `cover2.jpg` to bust CDN cache; seed file already has correct URL

### Still needed before Michigan goes live
- Run `node seedProductionGyms.js` from the RunCheck folder to push all today's changes to Firestore
- Confirm hidden school gyms (Holt, East Lansing HS, Lansing Catholic, Waverly) before activating
- More new Michigan gyms to be added (in progress — user adding additional locations)

## Michigan Batch 8 — Final Status

| Gym | Status |
|---|---|
| Alfreda Schmidt Community Center | VERIFIED |
| Court One Athletic Club (East/North) | FIXED |
| Court One Lake Lansing | FIXED |
| Foster Community Center | FIXED |
| Gier Community Center | FIXED |
| Hannah Community Center | FIXED (photo: cover2.jpg) |
| The Club at Chandler Crossings | FIXED (new — added 2026-04-19) |
| MSU IM East | FIXED |
| MSU IM West | VERIFIED (coords: 42.72904384119816, -84.4870783518538) |
| MSU IM Circle | FIXED (coords: 42.73186045039393, -84.48576466431427) |
| Frances Park | ARCHIVED |
| Hunter Park | ARCHIVED |
| Quentin Park | ARCHIVED |
| Patriarche Park | ARCHIVED |

## Active Now

1. **Add more Michigan gyms.** User is continuing to add new Michigan locations — same workflow: address + coords + photo → `seedProductionGyms.js` → seed script.
2. **Auto-remove empty runs.** When the last player leaves a run, delete or mark it ended.
3. **Reliability of join/leave flow.** Confirm leave action consistently triggers empty-run cleanup in production.
4. **Pre-launch smoke test.** Walk the find → join → leave → schedule path on a real device.

## Key Scripts & Workflow

- **Add/update gym data:** edit `RunCheck/seedProductionGyms.js` → run `node seedProductionGyms.js`
- **Upload gym photo:** `node scripts/uploadGymImage.js --gymId <id> --image <url-or-path> [--filename cover2.jpg]`
  - Use `--filename cover2.jpg` (or cover3, etc.) if CDN is caching the old image
  - Copy printed Storage URL into `imageUrl` and `photoGallery` in `seedProductionGyms.js`
- **Audit tracker:** `RunCheck/GYM_LOCATION_AUDIT.md`

## Paused

- New app features (chat, notifications, profiles, social, stats)
- UI redesigns, animation polish
- Refactors, dependency upgrades
- Schema changes to Firestore or new Cloud Functions unless explicitly required
