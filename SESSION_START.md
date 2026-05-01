# RunCheck — Session Start

Read this file first at the beginning of every Claude session.
It defines what RunCheck is, what phase we are in, and what kind of work is allowed.

---

## What is RunCheck?

RunCheck is a React Native (Expo) + Firebase mobile app for pickup basketball players. Users can find gyms, start or join group runs, see who is playing in real time, track their reliability score, earn rank points, and share short basketball clips.

Tech: React Native 0.81.5 + Expo SDK 54 + Firebase v12 (Firestore, Auth, Storage). Cloud Functions handle server-side logic. No custom backend server.

---

## Deploy Commands

**OTA update** (JS/asset changes — no new build needed):
```
eas update --channel production
```

**New native iOS build** (required after any native/config change):
```
eas build --platform ios --profile production
```
Build number auto-increments. No manual edits needed.

**Cloud Functions deploy:**
```
cd ~/runcheck-backend/functions && npm run deploy
```

**Firestore rules deploy:**
```
cd ~/runcheck-backend && firebase deploy --only firestore:rules
```

---

## Current Phase

**PRE-LAUNCH / FOUNDATION MODE**

We are stabilizing launch-critical core flows. The app works end-to-end but needs hardening before it ships.

Focus areas right now:
- Run lifecycle reliability and cleanup (empty runs, stale participants, accurate counts)
- Moderation foundation (reporting, auto-moderation, admin tools)
- Core clip and profile usability
- Stability of main user flows (check-in, scheduling, runs, activity feed)
- Error, loading, and empty state handling across key screens

We are **NOT** in feature expansion mode. New features, advanced polish, and speculative improvements belong in `PARKING_LOT.md` unless the user explicitly approves them for this session.

---

## What Kind of Work is Allowed

### Allowed (default)
- Bug fixes on existing features
- Stability improvements to launched flows
- Items on `LAUNCH_CHECKLIST.md`
- Small, targeted changes that harden the foundation
- Documentation updates

### Requires Explicit Approval
- Any new feature not on the launch checklist
- UI redesigns or layout restructuring
- New Firestore collections or schema changes
- New Cloud Functions
- Refactors that touch more than 2 zones

### Not Allowed (defer to PARKING_LOT.md)
- Speculative features ("what if we added...")
- Advanced gamification, social features, or monetization
- Performance optimization that isn't blocking launch
- "While we're here" cleanup of unrelated code

---

## Required Startup Reading Order

At the start of every session, read these files in this order before doing any work:

1. **SESSION_START.md** — this file (project context, phase, rules)
2. **LAUNCH_CHECKLIST.md** — what's blocking launch and current status
3. **ARCHITECTURE_MAP.md** — zone map of every file in the project
4. **CLAUDE_WORKFLOW.md** — implementation rules and constraints
5. **PROJECT_MEMORY.md** — recent work history, tech stack, known issues
6. **BACKEND_MEMORY.md** — Firestore schema, services, Cloud Functions, business rules
7. **PARKING_LOT.md** — deferred ideas (optional; read only when relevant to the session)

After reading, confirm context with a short summary and wait for the user to assign a task.

---

## Session Rules

1. **Declare intent before coding.** State what you plan to change and why before writing any code.
2. **Check the launch checklist first.** If the task isn't on `LAUNCH_CHECKLIST.md` and wasn't explicitly requested, ask before proceeding.
3. **One task at a time.** Complete the current task before starting another. Do not bundle unrelated fixes.
4. **Smallest safe change.** Touch the fewest files and lines necessary. See `CLAUDE_WORKFLOW.md` for full implementation rules.
5. **Capture stray ideas.** If a good idea surfaces that isn't the current task, add it to `PARKING_LOT.md` — do not act on it.
6. **No silent scope expansion.** If a fix requires touching files outside the declared scope, pause and flag it before proceeding.

---

## End-of-Session Updates

After each meaningful session (any session where code or architecture changed), update the relevant documentation:

| What changed | Update this file |
|---|---|
| Any code changes | `PROJECT_MEMORY.md` — add to "Files Modified Recently" with session date and summary |
| Backend architecture, schema, or business rules | `BACKEND_MEMORY.md` — update affected sections |
| New files added or file ownership changed | `ARCHITECTURE_MAP.md` — add to the correct zone |
| Launch checklist item completed or status changed | `LAUNCH_CHECKLIST.md` — check off or update status |
| New ideas surfaced but deferred | `PARKING_LOT.md` — add with brief description |
| Session was documentation-only | Note it briefly; no memory update required |

Always reconcile: compare what was planned at session start vs. what actually happened. Flag any drift.

---

---

## Quick Handoff — Start Here (2026-04-02 session end)

**What was done 2026-04-02 — GPS enforcement fixed, race condition patched:**

- **GPS check-in enforcement confirmed working**: Root cause was `EXPO_PUBLIC_DEV_SKIP_GPS=true` baked into production bundle. Changed to `false` in `.env`. Additionally added `__DEV__ &&` guard to `locationUtils.js` so fake Cowboys Fit coordinates can physically never be used in a production build — regardless of env variable state. Pushed via OTA with `--clear-cache`.
- **Negative presence count race condition fixed**: `markPresenceExpired` in `presenceService.js` was non-atomic. Replaced with `runTransaction` + status guard to prevent double-decrement between client and Cloud Function. Included in same OTA push.
- **GPS diagnostic alert added and removed**: Temporary `Alert.alert` added to `usePresence.js` `checkIn` to show GPS debug values. Confirmed flag=false, real location used. Alert removed in final clean OTA push.

**What still needs action:**
1. **Full real-device QA pass** — check-in flow, notifications, location, clips, all core screens
2. **App Store screenshots** — iPhone 15 Pro / 16 Max sizes (last unchecked launch checklist item)
3. **Wire ToS URL** in `SettingsScreen.js` (pure JS change, OTA)
4. **Run enrichment pipeline** on Batches 2–6 gyms
5. **Verify Batch 2–6 gym coordinates** via Google Maps pin-drop

---

**What was done 2026-04-01 — Production iOS build shipped, app live on device:**

- **Cloud Function deployed**: `onRunCreatedNotifyScheduledVisitors` — notifies users with scheduled visits when a run is created at their gym. Unblocked by clean `npm install` in `functions/` to resolve mime/express version conflict.
- **app.json overhauled for production**:
  - Entire `plugins` array removed (config-plugins version mismatch was breaking local builds)
  - All required iOS App Store permission strings added directly to `ios.infoPlist` (no plugin needed): NSCameraUsageDescription, NSMicrophoneUsageDescription, NSPhotoLibraryUsageDescription, NSPhotoLibraryAddUsageDescription, NSLocationWhenInUseUsageDescription
  - `buildNumber: "2"` added after first EAS submission failed with "build number already used"
- **eas.json updated**: `autoIncrement: true` added to production profile — future builds will never hit the build number conflict again
- **Project artifacts cleaned up** — `.easignore` expanded significantly, duplicate files removed:
  - Deleted: `dist/`, `ios/RunCheck 2.xcodeproj`, `.expo 2/`, all `ios/* 2` duplicate files
  - Added to `.easignore`: `.expo`, `ios/build`, `android/.gradle`, `android/build`, `android/.cxx`, `modules/video-trimmer/android`, `__tests__`, `scripts`, `docs`, `design`, `seedProductionGyms.js`
- **EAS production iOS build succeeded**: Build ID `eaee52e1-12e5-4408-8ac1-e927d69a6853`, uploaded at 12.3 MB
- **App is now live on device via TestFlight** ✅

**Verified before build (all clear):**
- OTA chain: `updates.url` + `runtimeVersion` + `channel: "production"` all wired correctly ✅
- Location: foreground-only (`requestForegroundPermissionsAsync`) — `NSLocationWhenInUseUsageDescription` sufficient ✅
- Notifications: standard visible push only, no silent push, no UIBackgroundModes needed ✅
- All App Store required permission strings present ✅

**Known limitations accepted for v1.0:**
- No `plugins` array — Android notification branding (color/icon) not configured. Notifications work but show generic styling on Android.
- `UIBackgroundModes` not set — acceptable since RunCheck uses standard visible push only.

**What still needs action (from 2026-04-01):**
1. **Full real-device QA pass** — check-in flow, notifications, location, clips, all core screens on the new TestFlight build
2. **App Store screenshots** — iPhone 15 Pro / 16 Max sizes (last unchecked launch checklist item)
3. **Wire ToS URL** in `SettingsScreen.js` (pure JS change, can ship via OTA: `eas update --channel production`)
4. **Run enrichment pipeline** on Batches 2–6 gyms: `cd ~/runcheck-backend && node scripts/enrichGymsWithPlaces.js && node scripts/downloadGymPhotos.js && node scripts/selectBestGymPhoto.js && node scripts/seedGyms.js`
5. **Verify Batch 2–6 gym coordinates** via Google Maps pin-drop — current coords are best-effort estimates
6. **LAUNCH_CHECKLIST.md** — manually check off: Cloud Functions item ✅, EAS production build ✅

**OTA update flow (no new build needed for JS changes):**
```
eas update --channel production
```

**If a new native build is ever needed:**
```
eas build --platform ios --profile production
```
Build number will auto-increment. No manual edits needed.

_Last updated: 2026-04-02_
