# Current Focus — Beta Prep (2 weeks out)

Texas gyms: ✅ complete. Michigan Batch 8 gyms: ✅ audit complete (all verified, fixed, or archived as of 2026-04-19). Active focus has shifted from gym expansion to beta readiness.

## Session Summary — 2026-04-22

Beta prep session. Two deliverables shipped:

### 1. Last-leaver bug — FIXED
Bug: when the last non-creator participant tried to leave a run, the transaction failed with `Missing or insufficient permissions`. Root cause: `leaveRun` wrote `status: 'cancelled'` alongside `participantCount: 0`, but the Firestore rule for non-creator `runs/{runId}` updates only allowed `hasOnly(['participantCount', 'lastMessageAt'])`. Fix landed in two places:
- **Client** (`services/runService.js`) — dropped the `status: 'cancelled'` write from the `leaveRun` transaction (now writes only `participantCount: increment(-1)`). Added a `participantCount > 0` filter to the `startOrJoinRun` merge query so users aren't re-added to zombie runs. Large explanatory comments in both spots.
- **Backend rules** (`runcheck-backend/firestore.rules`, deployed 2026-04-22) — added a narrow carve-out allowing a non-creator to write `participantCount` + `status` together ONLY IF `status == 'cancelled'` and `participantCount == 0`. Makes the old pre-OTA client code work too. Safe: no one can cancel an active run through this path.

Verified fixed on physical device by Tracy after rules deploy. Simulator verified earlier.

**Gotcha discovered:** physical devices did not pull the `eas update --branch preview` push — simulator ran the new JS from Metro, but phones stayed on the old bundle. Rules fix is what actually unstuck real devices. **OTA delivery needs investigation before beta** — likely a channel/branch mapping issue in the EAS dashboard, or the installed preview build isn't linked to the `preview` branch.

### 2. Hide-for-beta sweep — PLAN DELIVERED, NOT IMPLEMENTED
`BETA_HIDE_CHECKLIST.md` at repo root. 7 conservative items with file paths, line numbers, and recommended actions. Top hides: Clips (all surfaces), Premium teaser + Private/Paid Run entry points, "Last Week's Winners" leaderboard section, and the disabled Push Notifications toggle in Settings. Rollup proposal: single `config/betaFlags.js` with 4 toggles.

### Files changed this session
- `services/runService.js` — last-leaver fix (two edits, with comments)
- `runcheck-backend/firestore.rules` — non-creator last-leaver carve-out (deployed)
- `BETA_HIDE_CHECKLIST.md` — NEW, hide-for-beta plan
- `PARKING_LOT.md` — added zombie-run cleanup follow-up under Technical Improvements

### Open follow-ups for next session
- Implement `BETA_FLAGS` module and wire up the hide-for-beta toggles
- Fix leaderboard "week of" copy (item 3 in BETA_HIDE_CHECKLIST)
- QA-pass the gym review system on device (item 5)
- Investigate EAS OTA delivery to physical devices
- Zombie-run cleanup Cloud Function (parked, post-beta)

---

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
