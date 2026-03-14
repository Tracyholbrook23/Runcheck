# RunCheck — Project Memory Snapshot
_Last updated: 2026-03-13_

## Goal
A React Native mobile app where basketball players check into gyms in real time, see who's playing, earn rank points, and follow gyms.

## Tech Stack
- React Native 0.81.5 + Expo SDK 54 + React 19.1.0
- React Navigation v7
- Firebase v12 (Firestore, Auth, Storage)
- firebase-admin (migration scripts only — devDependency)
- expo-dev-client ~6.0.20 (custom dev build — NOT Expo Go)
- react-native-reanimated ~4.1.1, react-native-maps 1.20.1
- DropDownPicker, Ionicons, Animated API, BlurView

## Build Environment (STABLE as of 2026-03-06)
- Node: v20.20.1 via nvm (`/Users/tracy/.nvm/versions/node/v20.20.1/bin/node`)
- npm: 10.8.2
- EAS CLI: active, using profile `development`
- Bundle ID: `com.runcheck.app`
- EAS Project: `@tracyholbrook23/runcheck-new`
- Last successful build: 2026-03-06
  - Build URL: https://expo.dev/accounts/tracyholbrook23/projects/runcheck-new/builds/450f8aea-ecb3-4c0b-9a22-36807a01e11b
- Apple Distribution Certificate: expires Mar 2027
- Provisioning Profile: active (68UP4NV263), 3 devices registered

## How to Rebuild from Scratch (if environment breaks again)
```bash
cd ~/Desktop/Runcheck
mv node_modules /tmp/nm_old && rm -rf /tmp/nm_old &   # fast delete
rm -rf ios android .expo dist package-lock.json
npm install
npx expo prebuild --clean
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform ios --profile development
```
**Do NOT use `rm -rf node_modules` directly** — it hangs on macOS due to deeply nested dirs. Use the `mv` trick above.

## Navigation Structure
- Root navigator contains tab navigator
- Tab navigator has: Home, CheckIn, (others)
- **Home tab** contains a stack with: HomeScreen → UserProfile, RunDetailsScreen, etc.
- To navigate to a nested screen from a child component (e.g. PresenceList):
  ```js
  navigation.navigate('Home', { screen: 'UserProfile', params: { userId } })
  // NOT navigation.push('UserProfile') — that throws "not handled by any navigator"
  ```
- **Check In tab is a status screen, not a gym picker.** Primary check-in path: Runs tab → RunDetailsScreen → "Check In Here" button. The tab shows: (a) not-checked-in state with "Find a Run" CTA + followed-gym shortcuts; (b) active session state with gym name, time remaining, "View This Run", and "Check Out". Do not add a gym picker back to this tab.

## Key Architectural Decisions
- Presence doc ID is a compound key `{userId}_{gymId}` — prevents duplicate active presences
- `Timestamp.now()` (not `serverTimestamp()`) for activity `createdAt` — required so docs appear immediately in `>=` inequality queries
- `presenceService` is the single owner of activity feed writes on check-in; `CheckInScreen` does not write activity docs
- `checkOut(isManual)` param gates point deduction and activity deletion — manual=true deducts 10 pts, auto-expiry=false keeps them
- `RANKS` in `utils/badges.js` is the single source of truth for tier colors, thresholds, and glow values
- Skill level valid values are `['Casual', 'Competitive', 'Either']`; all screens normalize legacy values to `'Casual'`
- **Single source of truth for player counts**: always derive from real-time `livePresenceMap` / `presences` — never from `gym.currentPresenceCount` (that's a stale Firestore counter)
- **Deduplication**: a user can have two presence docs in edge cases; always dedup by `odId` using a `Set` before counting or rendering
- **Player count display format**: use run-quality labels, not `{count}/15`. Public gyms have no hard cap. Labels: Empty / Light Run · N playing / Building · N playing / Good Run · N playing / Packed · N playing / Jumping · N playing. See `getRunStatusLabel` in ViewRunsScreen.js and `getRunEnergyLabel` in HomeScreen.js.

## Presence Doc Shape
```js
{
  id,           // compound key: {userId}_{gymId}
  odId,         // userId (this is the field to dedup on)
  gymId,
  status,       // 'ACTIVE' | 'EXPIRED'
  checkedInAt,  // Firestore Timestamp
  expiresAt,    // Firestore Timestamp
  userName,
  userAvatar,
}
```

## Data Flow: Live Runs
```
subscribeToGymPresences (presenceService.js)
  → filters status == ACTIVE && expiresAt > now
  → returns presence docs

useGymPresences (hook) → { presences, loading, count }
  → count: presences.length (not used for display — use uniqueActivePresences instead)

HomeScreen:
  livePresenceMap[gymId] = presence[]
  Per card: dedup by odId → activePresences → activeCount, visibleAvatars, overflow, startedAgo
  totalActive = sum of all per-gym deduped counts (from livePresenceMap, NOT gym.currentPresenceCount)

RunDetailsScreen:
  presences (raw) → uniqueActivePresences (deduped useMemo) → playerCount, PresenceList
```

## Run Energy Labels (HomeScreen cards)
```js
const getRunEnergyLabel = (count) => {
  if (count >= 15) return { label: '🔥🔥 Packed Run', color: '#FF3B30' };
  if (count >= 10) return { label: 'Good Run',        color: '#34C759' };
  if (count >= 5)  return { label: 'Games Forming',   color: '#FF9500' };
  return                   { label: 'Starting Up',    color: 'rgba(255,255,255,0.50)' };
};
```

## Currently Working
- Check-in flow: GPS validation (disabled for testing), presence write, activity feed write, points award
- Check-out flow: manual deducts 10 pts + deletes activity entry; auto-expiry preserves points
- Activity feed on HomeScreen with tappable rows navigating to UserProfileScreen
- Badge/rank system: Bronze/Silver/Gold/Platinum with correct distinct colors
- Skill level migration script at `scripts/migrateSkillLevels.js`
- UserProfileScreen and ProfileScreen normalize legacy skill level values
- Live Runs section on HomeScreen: real-time cards with avatars, player count, energy label, empty state; gym photo background (opacity 0.30) + dark overlay; city label from `gym.city`; top LIVE banner removed (was redundant)
- RunDetailsScreen: Now Playing list deduped by odId; playerCount matches row count
- PresenceList navigation fixed (nested navigator path)
- Clip posting: record (≤30s) or pick from library → trim UI (≤10s) → on-device trim → upload → feed playback; `createClipSession` called only at post time; `video-trimmer` native module handles trimming (iOS: AVFoundation, Android: Media3)
- RunCheck Premium: UI-only teaser card on ProfileScreen (below Current Status, above Settings) → PremiumScreen with 5 feature cards ($4.99/mo · $29.99/yr) + Alert-based CTA; zero billing logic
- Check In tab: repurposed as session status screen (see Navigation Structure); gym picker removed
- Find a Run (ViewRunsScreen): gym search bar with local-only filter against name + address; input sanitized (strip non-`[a-zA-Z0-9 '.-&]`, max 50 chars)
- **Start a Run / Join a Run MVP**: any user can start a group run at a gym; others can join with one tap; merge rule prevents duplicate runs within ±60 min at the same gym; runs display participant count and who's going; grace window keeps runs visible 30 min after startTime so late arrivals can still join
- **UI polish pass (2026-03-13)**: Consistent LinearGradient headers across CheckInScreen, ViewRunsScreen, PlanVisitScreen using `['#3D1E00', '#1A0A00', colors.background]` with `locations={[0, 0.55, 1]}`; GymThumbnail pattern (local image → imageUrl → fallback icon) replicated from ProfileScreen; RunCheck Logo on CheckInScreen empty state
- **Run accountability (RC-006)**: `evaluateRunReward` awards `+10 pts` for genuine run follow-through; late-cancel penalties apply; solo farming blocked; creator-presence legitimacy check; idempotency via `pointsAwarded.runs[runId]`
- **Player Reviews (RC-007)**: `gyms/{gymId}/reviews` subcollection; eligibility via `runGyms OR gymVisits`; one active review/reward per user per gym; "Verified Run" badge for run-completion reviewers only; rating summary + sort + reviewer run count + tappable profile navigation

## Files Modified Recently (2026-03-13 session — UI polish + Runs Being Planned)
| File | What changed |
|---|---|
| `screens/CheckInScreen.js` | UI polish: LinearGradient header, Logo component (medium), "Your Gyms" → "Your Courts", GymThumbnail pattern matching ProfileScreen |
| `screens/ViewRunsScreen.js` | UI polish: LinearGradient header wrapping title + search bar, white title/subtitle text |
| `screens/PlanVisitScreen.js` | UI polish: LinearGradient on all 3 wizard steps, GymThumbnail on intent cards, improved empty state. **New feature**: "Runs Being Planned" section showing community runs across all gyms via `subscribeToAllUpcomingRuns`; run cards with gym thumbnail, time, creator, participant count, "View" button → RunDetailsScreen |
| `services/runService.js` | Added `subscribeToAllUpcomingRuns(callback)` — real-time subscription to all upcoming runs across all gyms (no gymId filter), 30-min grace window, filters out runs with 0 participants |

## Files Modified Recently (2026-03-13 session — Reviews)
| File | What changed |
|---|---|
| `services/reviewService.js` | **New file** — `checkReviewEligibility(uid, gymId)` → `{ canReview, hasVerifiedRun }`; `submitReview(...)` with one-active-review guard, review doc write to `gyms/{gymId}/reviews`, awaited `awardPoints` call |
| `services/pointsService.js` | Added transactional `'review'` case guarded by `pointsAwarded.reviewedGyms`; `runComplete` transaction now writes `pointsAwarded.runGyms: arrayUnion(gymId)`; `checkin`/`checkinWithPlan` transactions now write `pointsAwarded.gymVisits: arrayUnion(gymId)`; added `penalizePoints` export |
| `services/runService.js` | `evaluateRunReward` passes `gymId` as 4th arg to `awardPoints` so `runComplete` transaction can write `runGyms` |
| `screens/RunDetailsScreen.js` | Full review section: `reviewerStatsMap` lazy-cache for `totalAttended`; review sort (verifiedAttendee→rating→date); "Verified Run" badge (`checkmark-circle`); rating summary above CTA; eligibility split into `hasRunAttended` (gate) + `hasVerifiedRun` (badge); reviewer avatar + name tappable to UserProfile |
| `screens/PlanVisitScreen.js` | Fixed stale "X here" badge: `gym.currentPresenceCount` → `countMap[gym.id]` from `useLivePresenceMap` (RC-008) |

## Files Modified Recently (2026-03-12 session)
| File | What changed |
|---|---|
| `screens/HomeScreen.js` | Planned visit filter now enforces upper bound: only shows plan items where `plannedTime > now AND plannedTime <= now + 60 min` |
| `services/runService.js` | **New file** — full runs MVP: `startOrJoinRun`, `joinExistingRun`, `leaveRun`, `subscribeToGymRuns`, `subscribeToUserRunsAtGym`, `subscribeToRunParticipants` |
| `hooks/useGymRuns.js` | **New file** — composes two Firestore subscriptions; exposes `{ runs, loading, joinedRunIds, userParticipants }` |
| `screens/RunDetailsScreen.js` | Added runs section (run cards, Start a Run modal with day/time picker, Join/Leave handlers); new styles block |
| `firestore.rules` | **New file** — Firestore security rules for all collections including `runs` and `runParticipants` |
| `firebase.json` | **New file** — Firebase CLI config pointing to `firestore.rules` for `firebase deploy --only firestore:rules` |

## Start a Run / Join a Run — Architecture Notes
- **Collections**: `runs/{autoId}` and `runParticipants/{runId}_{userId}` (compound key)
- **Merge rule**: client-side ±60 min check after a single `gymId + status` query — avoids needing a composite index on two range fields
- **`startOrJoinRun`**: validates `startTime > now` and `startTime <= now + 7 days`; checks for a mergeable run; creates or joins
- **`joinExistingRun`**: joins a known run by ID, bypasses time validation — required for grace-window runs whose `startTime` is in the past
- **`joinRun` (internal)**: runs a `runTransaction`; compound participant key makes joins idempotent; `!alreadyJoined` guard prevents double-counting `participantCount`
- **`leaveRun`**: transaction deletes participant doc + `increment(-1)` on `participantCount`; no-op if user isn't in the run
- **Grace window**: `subscribeToGymRuns` shows runs whose `startTime >= now - 30 min`; late joiners use `joinExistingRun`, not `startOrJoinRun`
- **Activity feed**: `'started a run at'` is written fire-and-forget on run creation. `'joined a run at'` writes exist in the code but are **flagged for removal** before commit — they would cause feed spam when multiple users join the same run (see Known Issues)
- **Plan a Visit — now shows community runs** — `PlanVisitScreen` subscribes to `subscribeToAllUpcomingRuns` (Zone 1 overlap) and displays a "Runs Being Planned" section separate from personal scheduled visits. Personal visits still use `scheduleService`/`useSchedules`

## Files Modified Recently (2026-03-11 session)
| File | What changed |
|---|---|
| `services/presenceService.js` | `checkIn()` now calls `awardPoints()` (client-side, idempotent via `sessionKey`) and increments `reliability.totalAttended` + recalculates `reliability.score` |
| `services/presenceService.js` | `checkOut()` deletes the "checked in at" activity feed entry (keeps feed live); attendance is tracked separately in `reliability.totalAttended` and is unaffected |
| `services/presenceService.js` | `markPresenceExpired()` now also deletes the "checked in at" activity feed entry — consistent with checkout behaviour |
| `screens/RunDetailsScreen.js` | Removed defunct `httpsCallable(getFunctions(), 'checkIn')` call; removed dead imports; `handleCheckInHere` uses `checkinResult.scheduleId` for points label |
| `screens/CheckInScreen.js` | Fixed stale "−10 pts have been deducted" alert text |
| `screens/PlanVisitScreen.js` | Plan activity docs now include `plannedTime` field so the feed can filter out past plans |
| `screens/HomeScreen.js` | Activity snapshot callback now filters out `planned a visit to` items whose `plannedTime` has passed |

## Activity Feed Architecture (as of 2026-03-11)
- `activity` collection is **ephemeral display data only** — not used for attendance tracking
- **Check-in activity** (`action: 'checked in at'`): created on check-in, deleted on checkout AND on auto-expiry → feed only shows currently active sessions
- **Plan activity** (`action: 'planned a visit to'`): created when a plan is saved, includes `plannedTime` field; deleted on cancellation; HomeScreen filters out items where `plannedTime < now`
- **No checkout events** are ever written to the activity feed
- HomeScreen subscribes: `createdAt >= twoHoursAgo` (computed at mount), `limit(10)`, plan items additionally filtered client-side by `plannedTime`
- **Planned visit visibility window**: `plannedTime > now AND plannedTime <= now + 60 minutes`. Both bounds enforced. Items outside this window are filtered out. Old docs lacking `plannedTime` pass through as always-visible.
- Old activity docs (pre-March 2026) lack a `plannedTime` field — these are treated as always-visible by the filter (`!item.plannedTime` passes through)
- **Run activity events** (`'started a run at'`) pass through the filter via the `return true` branch — they have no `plannedTime` so no extra filtering applies. `'joined a run at'` writes are present in `runService.js` but flagged for removal before commit (see Known Issues)

## Review System Architecture (as of 2026-03-13)
- **Collection**: `gyms/{gymId}/reviews/{autoId}` — subcollection per gym
- **Service**: `services/reviewService.js` — owns `checkReviewEligibility` and `submitReview`
- **Eligibility (two-signal model)** — single `getDoc` on `users/{uid}` on screen mount:
  - `canReview` = `pointsAwarded.runGyms.includes(gymId) || pointsAwarded.gymVisits.includes(gymId)` — gates the review form
  - `hasVerifiedRun` = `pointsAwarded.runGyms.includes(gymId)` — controls "Verified Run" badge only
  - `gymVisits` written atomically in the `checkin`/`checkinWithPlan` points transaction
  - `runGyms` written atomically in the `runComplete` points transaction
- **Badge semantics**: `verifiedAttendee: true` on a review doc means run completion at that gym. Session-only reviewers (`canReview` via `gymVisits`) can post reviews but receive no badge. Intentional design.
- **One active review per user per gym**: enforced by `submitReview` querying before writing
- **One-time reward per user per gym**: `pointsAwarded.reviewedGyms` guard in `pointsService` transaction — delete/repost cannot re-earn
- **Display**: rating summary above CTA, 3-level sort (verifiedAttendee→rating→date), reviewer run count via lazy `reviewerStatsMap` cache, tappable avatar/name → UserProfile

## Attendance / Points Architecture (as of 2026-03-11)
- **Check-in = attended session** — every successful `presenceService.checkIn()` call awards points AND increments `reliability.totalAttended`
- `awardPoints()` in `pointsService.js` handles all point writes (idempotent via `sessionKey = \`${presenceId}_${now.getTime()}\``) — the timestamp suffix ensures each visit to the same gym gets its own unique award slot, even though the presence document ID itself is reused
- `reliability.totalAttended` and `reliability.score` are written client-side on check-in (no Cloud Function dependency for the MVP)
- `reliability.score` is recalculated on each check-in using `calculateReliabilityScore({ totalAttended, totalNoShow })`
- **Checkout does NOT deduct points, does NOT decrement `totalAttended`, does NOT remove the activity feed entry**
- Session Stats on ProfileScreen reads `users/{uid}.reliability.totalAttended` (now correctly updates)
- Leaderboard reads `users/{uid}.totalPoints` (now correctly updates on check-in)

## Files Modified Recently (2026-03-05 session)
| File | What changed |
|---|---|
| `components/PresenceList.js` | Fixed nested nav: `navigate('Home', { screen: 'UserProfile', params })` |
| `screens/HomeScreen.js` | Energy labels, totalActive from livePresenceMap, empty state with Check In button, per-card dedup + guard, debug logs |
| `screens/RunDetailsScreen.js` | Removed fake data (fakePlayers etc.), added uniqueActivePresences useMemo, playerCount from unique count, debug logs |

## Files Modified Recently (2026-03-10 session)
| File | What changed |
|---|---|
| `screens/TrimClipScreen.js` | Full rewrite: trim UI (3 PanResponders), TRIMMING upload state, on-device trim before upload, real `durationSec` passed to finalize |
| `screens/RunDetailsScreen.js` | `uploadFromLibrary` no longer calls `createClipSession`; navigates directly to TrimClipScreen with `presenceId` |
| `screens/RecordClipScreen.js` | Removed stale `loadingLibrary` references; re-added `ActivityIndicator` import |
| `modules/video-trimmer/` | New local Expo native module: iOS (AVFoundation) + Android (Media3 Transformer) |
| `modules/video-trimmer/ios/VideoTrimmer.podspec` | New — required for CocoaPods autolinking |
| `package.json` | Added `"video-trimmer": "file:./modules/video-trimmer"` dependency |

## Files Modified Recently (2026-03-09 session)
| File | What changed |
|---|---|
| `screens/ProfileScreen.js` | Added Premium teaser card (below Current Status, above Settings) |
| `screens/PremiumScreen.js` | Created new screen: 5 feature cards, pricing tiles, Alert-based CTA, no billing |
| `App.js` | Registered PremiumScreen in ProfileStack |
| `screens/CheckInScreen.js` | Replaced gym-picker form with status screen; removed DropDownPicker |
| `screens/ViewRunsScreen.js` | Fixed player counts (liveCountMap subscription); run status labels; gym search bar |
| `screens/HomeScreen.js` | Live Run card gym photo backgrounds + overlay + city label; removed top LIVE banner; fixed stale session bug (presence query now uses `PRESENCE_STATUS.ACTIVE` constant + client-side `expiresAt > now` filter, matching `subscribeToGymPresences` logic; added `PRESENCE_STATUS` import from `services/models`) |
| `screens/LeaderboardScreen.js` | Leaderboard rows now tappable (`TouchableOpacity`, `disabled` on own row, chevron affordance for others); added `RANK_PERKS` display-only copy object; added "Why Rank Matters" card (4-tier list with icon, color, description, "You" badge on current tier); Rank Tiers section now shows `rank.icon` emoji instead of small colored dot; new styles: `tierIcon`, `perksRow`, `perksInfo`, `perksDesc`, `currentBadge`, `currentBadgeText` |
| `App.js` | Added `UserProfile` screen to `ProfileStack` so leaderboard row taps navigate correctly from the Profile tab entry point |

## Debug Logs (intentionally left in, remove after confirming)
Both `HomeScreen.js` and `RunDetailsScreen.js` have `__DEV__`-guarded console logs:
- `[LiveRun:{gym.name}] activeUniqueCount=N userIds=[...]`
- `[LiveRun:{gym.name}] startedAt=... startedAgo="..."`
- `[RunDetails] raw presences: N ids: [...]`
- `[RunDetails] unique presences: N ids: [...]`
- `[RunDetails] missing profiles (will show placeholder): [...]`

## Known Issues / Risks
- GPS distance enforcement is commented out in both `usePresence.js` and `presenceService.js` — must be re-enabled before launch
- Auto-expiry is client-side only; a Cloud Function is needed to expire presences server-side without deducting points
- No composite Firestore index for `activity` collection query (`createdAt >= X, orderBy createdAt`) — may need manual index creation for scale
- `gym.currentPresenceCount` is a stale denormalized counter — do NOT use it for display; always use `useLivePresenceMap` / `subscribeToGymPresences`. All screens now use the correct source (`PlanVisitScreen` was the last violation; fixed 2026-03-13)
- `reliability.totalScheduled` is NOT incremented on plain check-ins (only via `createSchedule`) — this is intentional; the Session Stats "Scheduled" column reflects explicit planned visits
- When Cloud Functions are eventually deployed for reliability/no-show tracking, the client-side `reliability.totalAttended` increment in `presenceService.checkIn()` should be removed to avoid double-counting
- The compound presenceId (`{userId}_{gymId}`) is reused when a user checks in, checks out, and re-checks into the same gym — this is intentional for duplicate-prevention; the points idempotency key is separately `{presenceId}_{checkinTimestampMs}` so repeat visits earn points correctly
- **`'joined a run at'` activity writes** are present in `runService.js` (both `joinExistingRun` and the merge-join branch of `startOrJoinRun`) but should be removed before commit — with many users joining one run, the feed fills with identical join events. Only `'started a run at'` should remain. The code change is two `addDoc` call deletions in `runService.js`.

## Next Tasks
1. Remove `__DEV__` debug logs from HomeScreen.js and RunDetailsScreen.js (after confirming counts look correct)
2. Re-enable GPS distance enforcement in `usePresence.js` and `presenceService.js` (remove the commented-out blocks)
3. Build the Cloud Function for auto-expiry: mark presence expired + decrement gym count + clear `activePresence`, call `checkOut(isManual=false)`
4. Add a Firestore composite index for the `activity` collection on `(createdAt DESC)` and confirm the HomeScreen feed query is covered
5. Set `cli.appVersionSource` in eas.json (EAS warned this will be required in the future)
6. ~~Consider switching to timestamp-based presenceIds~~ — resolved: points idempotency key is now `{presenceId}_{checkinTimestampMs}` so each session earns points correctly; the doc ID stays as `{userId}_{gymId}` for duplicate prevention

## How to Give Claude Context at Start of Each Session
Tell Claude: "Read PROJECT_MEMORY.md in my Runcheck folder before we start."
Or just open a new Cowork session — Claude will find and read this file automatically.

## Weekly Leaderboard System
RunCheck includes a weekly competition system alongside the permanent leaderboard.
Key design decisions:
- User documents store both `totalPoints` (all-time) and `weeklyPoints`.
- All point-awarding logic increments both values simultaneously in `pointsService.js`.
- The leaderboard UI supports two views: **All Time** and **This Week**.
- Player rank tiers always derive from `totalPoints`.
- The weekly leaderboard only changes the ordering and displayed points.

Weekly winners are stored in:
weeklyWinners/{YYYY-MM-DD}
Document structure:
{ uid, name, photoURL, weeklyPoints, weekOf, recordedAt}

A reset script (`scripts/weeklyReset.js`) records the winner and clears `weeklyPoints` for the next competition cycle.

## Clips Feature

### Clip flow
```
RunDetailsScreen
  └─ "Post Clip" bottom sheet
       ├─ Record  → RecordClipScreen → TrimClipScreen
       └─ Upload  → TrimClipScreen
```

### Session timing — critical rule
`createClipSession` (Cloud Function) is called **only inside `TrimClipScreen.handlePostClip`**, after the user taps Post and after on-device trimming completes. It is never called during recording or library selection. Backing out of the preview/trim screen never reserves a backend slot or consumes a weekly limit.

Upload state machine: `IDLE → TRIMMING → CREATING → UPLOADING → FINALIZING`

### Duration constraints
| Stage | Limit |
|---|---|
| Recording (RecordClipScreen) | Max 30 seconds |
| Posted clip | Max 10 seconds |

If the source video is > 10 s, `TrimClipScreen` shows a trim UI and performs on-device trimming before upload. The trimmed file is what gets uploaded to Firebase Storage.

### On-device trimming — `video-trimmer` local Expo module
A local Expo native module at `modules/video-trimmer/` handles all trimming (no ffmpeg-kit, which is archived).

```
modules/video-trimmer/
├── package.json                   # name: "video-trimmer"
├── expo-module.config.json        # registers VideoTrimmerModule (iOS + Android)
├── src/index.ts                   # JS API: trimVideo(uri, startSec, endSec): Promise<string>
├── ios/
│   ├── VideoTrimmerModule.swift   # AVFoundation — AVAssetExportSession
│   └── VideoTrimmer.podspec       # ← required for CocoaPods autolinking (see below)
└── android/
    ├── build.gradle               # androidx.media3:media3-transformer:1.4.1
    └── src/.../VideoTrimmerModule.kt  # Media3 Transformer
```

**Autolinking rule:** `expo-modules-autolinking` searches one level deep inside subdirectories of the module root — not the root itself. The podspec **must** be at `ios/VideoTrimmer.podspec`. Without it the module is silently skipped: absent from `Podfile.lock` and `ExpoModulesProvider.swift`, unregistered at runtime. After any change to the module, run `cd ios && pod install && cd ..` then rebuild.

### Trim UI (TrimClipScreen)
Three interaction zones on the timeline bar:
- **Left handle** — moves `trimStart` only (resize from left)
- **Right handle** — moves `trimEnd` only (resize from right; capped at `trimStart + 10s`)
- **Center region** — moves both together (slides the window, preserves duration)

Implemented with three `PanResponder` instances. State is mirrored into refs so callbacks always read fresh values without stale closures.

---

## Instagram Integration (Home Screen)
RunCheck includes Instagram entry points to connect the app with the community page.
Key elements:
- `INSTAGRAM_URL` constant defined in `HomeScreen.js`
- Header icon order: **Instagram → Trophy → Profile**
- Instagram icon uses `Ionicons` (`logo-instagram`)
- A community card is placed between the **Recent Activity feed** and the **footer tagline**

Both entry points open the RunCheck Instagram page using:
Linking.openURL(INSTAGRAM_URL)
