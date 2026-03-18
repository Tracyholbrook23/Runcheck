# RunCheck — Project Memory Snapshot
_Last updated: 2026-03-17_

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
- `RANKS` in `config/ranks.js` is the single source of truth for tier definitions (thresholds, colors, glow, perks). `POINT_VALUES` in `config/points.js` owns point awards. `PERK_DEFINITIONS` in `config/perks.js` owns perk metadata. `utils/badges.js` is a deprecated re-export shim.
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
- Badge/rank system: Bronze/Silver/Gold/Platinum/Diamond/Legend (6 tiers) with distinct colors and centralized perk config
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
- **Gym request system (2026-03-15)**: Users can submit gym requests via Cloud Function with server-enforced 1-per-7-day rate limit. "My Gym Requests" screen in Profile tab shows real-time status with pending-only badge. Entry point in ViewRunsScreen ("Don't see your gym?"). Admin workflow: review in Firebase Console → add gym via `seedProductionGyms.js` → update request doc.
- **Gym image migration to Firebase Storage (2026-03-15)**: Storage path convention `gymImages/{gymId}.jpg`. Public read, admin-only write. Seed script warns on external image URLs. Fitness Connection is the first gym migrated to Firebase Storage.
- **Reporting system (2026-03-15)**: Users can report clips, players, runs, and gyms via `ReportModal` component. Reports submitted via `submitReport` Cloud Function with server-side duplicate prevention (one report per user per item). Reports stored in `reports` Firestore collection with `targetOwnerId` resolved per type (player→targetId, clip→uploaderUid, run→creatorId, gym→null). Admin Tools has a live "Reports / Moderation" screen (`AdminReportsScreen`) with real-time `onSnapshot` listener, type/status badges, and pending count. Admins can mark reports as "reviewed" or "resolved" and attach optional notes via the `moderateReport` Cloud Function. No user bans or content deletion yet.
- **Moderation system (2026-03-16)**: Full auto-moderation + admin moderation pipeline. `moderationHelpers.ts` is the single source of truth for all enforcement logic (hide clip, remove run, suspend user, unsuspend user, unhide clip, resolve report). Auto-moderation thresholds: clip→3 reports, run→3 reports, player→5 reports — triggered inside `submitReport` when pending report count reaches the threshold. Timed suspension escalation: `ESCALATION_DAYS = [1, 3, 7, 30, 365]` based on `suspensionLevel` on the user doc. Admin callables: `hideClip`, `removeRun`, `suspendUser`, `unsuspendUser`, `unhideClip`, `moderateReport` — all require `users/{uid}.isAdmin === true`. Client calls via `callFunction('functionName', payload)` from `config/firebase.js`.
- **Admin dashboards (2026-03-16)**: Admin Tools hub screen (`AdminToolsScreen`) with live pending counts per tool. Sub-screens: `AdminGymRequestsScreen` (with detail view), `AdminReportsScreen` (type/status badges, resolve/review actions), `AdminSuspendedUsersScreen` (user avatar, suspendedBy resolved to display name, unsuspend action), `AdminHiddenClipsScreen` (clip thumbnail preview, play icon overlay, hiddenBy resolved to display name, uploader avatar, unhide action, tappable thumbnails to view video in ClipPlayerScreen). All admin screens gated by `useIsAdmin` hook. Admin badge on Profile → Admin Tools row counts total workload: pending gym requests + pending reports + currently suspended users + hidden clips.
- **Profile badges (2026-03-16)**: "My Gym Requests" badge on Profile now counts only `status === 'pending'` requests (was total count). Uses `pendingCount` from `useMyGymRequests` hook. Badge disappears when all requests are approved/rejected/duplicate.
- **Clip tagging V1 (2026-03-17)**: Users can tag up to 5 friends when posting a clip. Backend validates tags in `finalizeClipUpload` (dedupe, verify uid exists, trim displayName). Tags displayed as tappable `@Name` chips on ClipPlayerScreen. TrimClipScreen has a collapsible friend picker.
- **Tagged clip awareness + approval V1 (2026-03-17)**: Tagged users see clips they appear in via "Tagged In" section on ProfileScreen (own profile only) and can approve clips to appear on their public "Featured In" section on UserProfileScreen. Approval flow: `addClipToProfile` Cloud Function (backend-controlled, per-user ownership). `useTaggedClips` hook fetches + client-side filters recent clips. Refetches on screen focus via `useFocusEffect`.
- **Clip posting audit hardening (2026-03-17)**: Per-session duplicate guard now explicitly blocks soft-deleted clips (`isDeletedByUser === true` → slot consumed). Weekly free-tier cap (`FREE_CLIPS_PER_WEEK = 3`) now excludes soft-deleted clips (deleting restores weekly slot). `pointsAwarded: boolean` scaffolded on clip docs for future rewards system.
- **Upcoming Runs participant modal (2026-03-16)**: The `+N` overflow bubble on Upcoming Runs cards in `RunDetailsScreen` is now tappable — opens a bottom-sheet modal listing all participants for that run with avatar, display name, and chevron. Tapping a participant navigates to their profile via `navigation.navigate('Home', { screen: 'UserProfile', params: { userId } })`.
- **Player Reviews (RC-007)**: `gyms/{gymId}/reviews` subcollection; eligibility via `runGyms OR gymVisits`; one active review/reward per user per gym; "Verified Run" badge for run-completion reviewers only; rating summary + sort + reviewer run count + tappable profile navigation
- **Weekly Winners (Top 3)**: `weeklyWinners/{YYYY-MM-DD}` stores podium (1st/2nd/3rd) with `winners` array + `firstPlace` convenience field; `weeklyWinnersService.js` + `useWeeklyWinners` hook (exposes `recordedAt` for 24h celebration); LeaderboardScreen "Last Week's Winners" card; HomeScreen temporary celebration card (24h visibility after reset); automated via `weeklyReset` Cloud Function (Monday 00:05 CT); manual script retained as admin backup
- **Run Activation (Post-Core Polish, 2026-03-17)**: Runs now derive "live" state client-side using presence ∩ participants — no backend state added (intentional). `runHereCountMap` in RunDetailsScreen cross-references `runParticipantsMap` userIds with `uniqueActivePresences` odIds via Set intersection. Display shows: "N going" (planned, hereCount === 0), "N here · M going" (live, partial arrival), "N here" (fully arrived) with green LIVE dot. Live runs sorted above planned runs via `sortedRuns` useMemo. Zero schema changes, zero new Firestore reads, zero backend changes. When scaling: if presence list grows large, consider moving the intersection to a lightweight Cloud Function or adding a `checkedInUserIds` array on the run doc.

## Planned: Verified Run History (post-launch, not a launch blocker)

Captures proof that a run happened and how many people showed up. Designed 2026-03-17.

- **Phase 1 (approved, post-TestFlight):** Add two new fields to `runs/{runId}` — `joinedCount` (total unique users who ever joined, never decremented) and `peakParticipantCount` (high-water mark of `participantCount`). Both written inside the existing `joinRun` transaction in `runService.js`, guarded by the same `!alreadyJoined` check that protects `participantCount`. ~5 lines, one file, no backend deploy, no UI changes. Silently accumulates data for future use.
- **Phase 2 (deferred — post-launch, stable user base):** Formal run completion: `status: 'completed'`, `completedAt`, `actualAttendees[]`, `attendedCount`, `durationMinutes`. Triggered in `leaveRun` when `participantCount → 0`. Also needs a `completeStaleRuns` Cloud Function for abandoned runs. Medium risk — changes run lifecycle state irreversibly.
- **Phase 3 (deferred — growth phase):** Analytics and aggregation. Per-user "Runs Attended" history, turnout estimates, `runHistory` collection, gym trust signals.

---

## Files Modified Recently (2026-03-17 session — Suspension Enforcement, Debug Log Cleanup, Launch Checklist Hardening, Run Activation)

### Code changes

- **`services/presenceService.js`** — Added suspension guard to `checkIn()`. Reads `users/{uid}`, checks `isSuspended` + `suspensionEndsAt`, throws clear error. Matches `runService.js` pattern.
- **`runcheck-backend/functions/src/checkIn.ts`** — Added backend suspension guard after auth check, before any branching. Same pattern as `clipFunctions.ts`. **Deploy required.**
- **`runcheck-backend/functions/src/createRun.ts`** — Added backend suspension guard after auth check, before input validation. Moved `const db` up to support the early read. **Deploy required.**
- **`screens/HomeScreen.js`** — Gated 5 `console.error`/`console.warn` calls behind `__DEV__`. No behavior change.
- **`screens/RunDetailsScreen.js`** — Removed 3 ungated temporary debug `console.log` calls (clips effect tracing). Gated 12 remaining `console.error`/`console.warn`/`console.log` calls behind `__DEV__`. No behavior change.
- **`screens/ProfileScreen.js`** — Gated 1 stray `console.log` (photoURL sync) behind `__DEV__`. No behavior change.

### Additional code changes (same session, later tasks)

- **`screens/RunDetailsScreen.js`** — Run activation: added `runHereCountMap` (useMemo, ~8 lines) cross-referencing run participants with active presences. Added `sortedRuns` (useMemo, ~10 lines) sorting live runs above planned. Updated `renderRunParticipantAvatars` to show "N here · M going" with green LIVE dot when hereCount > 0. Added 3 new styles (`runLiveRow`, `runLiveDot`, `runLiveText`). ~45 lines total. No backend changes.
- **`utils/locationUtils.js`** — Fixed dev GPS bypass coordinates: old `(30.4692, -97.5963)` was 595m from Cowboys Fit (outside 100m check-in radius). Updated to `(30.4673, -97.6021)` matching `seedProductionGyms.js`.
- **`eas.json`** — Added `"appVersionSource": "remote"` to `cli` block. Resolves EAS warning.

### Investigations (no code changes needed)

- **Admin badge counts on ProfileScreen** — Confirmed correct: 4 real-time `onSnapshot` queries match AdminToolsScreen exactly.
- **Full moderation cycle (report → auto-mod → enforce → resolve)** — Confirmed complete pipeline with no missing links.
- **ProfileScreen empty/error states** — Confirmed all fields have safe fallbacks, all error callbacks resolve loading, no blank-screen scenarios.

### Launch checklist items closed this session

1. ✅ Verify suspended users are actually blocked from app actions (check-in, posting, joining runs)
2. ✅ Confirm admin badge counts on ProfileScreen reflect real pending items
3. ✅ Test full report → auto-moderate → enforce → resolve cycle end-to-end
4. ✅ Remove or gate `__DEV__` debug logs in HomeScreen.js and RunDetailsScreen.js
5. ✅ Empty/error states on ProfileScreen if Firestore data is missing or loading fails

### Deploy reminder

```bash
cd ~/Desktop/runcheck-backend && firebase deploy --only functions:checkIn,functions:createRun
```

---

## Files Modified Recently (2026-03-17 session — Clip Tagging, Awareness, Approval, Posting Audit)

### Backend files changed (in runcheck-backend)
| File | What changed |
|---|---|
| `functions/src/clipFunctions.ts` | Added `TaggedPlayer` interface, `MAX_TAGGED_PLAYERS = 5`, `taggedPlayers` + `taggedUserIds` fields to `ProcessingClipDocument`, tagging validation in `finalizeClipUpload` (dedupe, verify uid, trim name). Phase 8A: hardened per-session guard to block soft-deleted clips. Phase 8B: `pointsAwarded: boolean` scaffold. Weekly cap now excludes `isDeletedByUser === true` clips. |
| `functions/src/addClipToProfile.ts` | **New file** — Callable Cloud Function: validates auth, verifies caller is in `taggedPlayers`, sets `addedToProfile: true` on caller's entry only. Idempotent. |
| `functions/src/index.ts` | Added `addClipToProfile` export. |
| `firestore.rules` | Removed `isValidTaggedProfileUpdate` (was temporary). gymClips update rule is back to like/unlike only. Comment documents that taggedPlayers writes go through Cloud Function. |

### Frontend files changed
| File | What changed |
|---|---|
| `screens/ClipPlayerScreen.js` | Delete button fix (useAuth hook). Tagged players display as tappable `@Name` chips. "Add to my profile" button calls `addClipToProfile` Cloud Function (was `updateDoc`, now backend-controlled). "On your profile" badge. Removed `updateDoc` import. |
| `screens/TrimClipScreen.js` | Player tagging UI: friends fetch, collapsible tag picker with horizontal ScrollView, `toggleTagPlayer` with max-5 enforcement, passes `taggedPlayers` in `finalizeClipUpload` payload. |
| `hooks/useTaggedClips.js` | **New file** — Queries 100 recent clips, client-side filters for tagged user. Returns `allTagged`, `featuredIn`, `videoUrls`, `thumbnails`, `loading`, `refetch`. Refetch via `fetchKey` counter. |
| `hooks/index.js` | Added `useTaggedClips` export. |
| `screens/ProfileScreen.js` | Added "Tagged In" section (own profile only, horizontal FlatList). Added "Featured In" section (approved clips). Added `useFocusEffect` + `refetch` on screen focus. |
| `screens/UserProfileScreen.js` | Added public "Featured In" section (horizontal FlatList, same tile pattern). Added `useFocusEffect` + `refetch` on screen focus. |
| `screens/RunDetailsScreen.js` | Fixed back navigation: changed 5 cross-stack `navigation.navigate('Home', { screen: 'UserProfile' })` calls to same-stack `navigation.navigate('UserProfile', { userId })`. |
| `App.js` | Added `UserProfile` to RunsStack for same-stack navigation fix. |

## Files Modified Recently (2026-03-16 session — Moderation System, Admin Dashboards, UX Polish)

### Backend files changed (in runcheck-backend)
| File | What changed |
|---|---|
| `functions/src/moderationHelpers.ts` | **New file** — Shared enforcement logic: `enforceHideClip`, `enforceRemoveRun`, `enforceSuspendUser`, `enforceUnsuspendUser`, `enforceUnhideClip`, `resolveRelatedReport`. Single source of truth for all moderation actions. Escalation table: `ESCALATION_DAYS = [1, 3, 7, 30, 365]`. |
| `functions/src/hideClip.ts` | **New file** — Admin callable: validates auth + admin, calls `enforceHideClip`. |
| `functions/src/removeRun.ts` | **New file** — Admin callable: validates auth + admin, calls `enforceRemoveRun`. |
| `functions/src/suspendUser.ts` | **New file** — Admin callable: validates auth + admin, calls `enforceSuspendUser`. Returns suspension level + duration. |
| `functions/src/unsuspendUser.ts` | **New file** — Admin callable: validates auth + admin, calls `enforceUnsuspendUser`. |
| `functions/src/unhideClip.ts` | **New file** — Admin callable: validates auth + admin, calls `enforceUnhideClip`. |
| `functions/src/moderateReport.ts` | **New file** — Admin callable: mark reports as reviewed/resolved with optional admin notes. |
| `functions/src/submitReport.ts` | Updated — auto-moderation: after writing report, checks pending count against thresholds (clip→3, run→3, player→5) and triggers enforcement helpers + resolves all related reports. |
| `functions/src/index.ts` | Added exports: `hideClip`, `removeRun`, `suspendUser`, `unsuspendUser`, `unhideClip`, `moderateReport`. |

### Frontend files changed
| File | What changed |
|---|---|
| `screens/AdminToolsScreen.js` | **New file** — Admin hub with live pending counts per tool category. Navigation to all admin sub-screens. |
| `screens/AdminGymRequestsScreen.js` | **New file** — Admin gym request review list. |
| `screens/AdminGymRequestDetailScreen.js` | **New file** — Detail view for individual gym requests. |
| `screens/AdminReportsScreen.js` | **New file** — Reports moderation list with type/status badges, resolve/review actions via `moderateReport` callable. |
| `screens/AdminSuspendedUsersScreen.js` | **New file** — Suspended users list with avatar, resolved names, unsuspend action. |
| `screens/AdminHiddenClipsScreen.js` | **New file** — Hidden clips list with thumbnails, video playback, unhide action. |
| `screens/ProfileScreen.js` | Admin Tools badge counts all 4 categories. My Gym Requests badge uses `pendingCount`. |
| `screens/RunDetailsScreen.js` | +N bubble on Upcoming Runs opens participant list bottom-sheet modal. |
| `hooks/useMyGymRequests.js` | Added `pendingCount` to return value. |
| `hooks/useIsAdmin.js` | **New file** — Admin gate hook. |
| `App.js` | Added all admin screen routes + ClipPlayer in ProfileStack. |

## Files Modified Recently (2026-03-15 session — Gym Requests, Image Migration, Fitness Connection)
| File | What changed |
|---|---|
| `screens/RequestGymScreen.js` | **New file** — Gym request submission form. Calls `submitGymRequest` Cloud Function. Fixed bottom bar for submit button. Handles rate-limit errors. |
| `screens/MyGymRequestsScreen.js` | **New file** — Displays user's gym requests with status badges (pending/approved/duplicate/rejected), admin notes, contextual hints. Dark mode support. Empty state. |
| `hooks/useMyGymRequests.js` | **New file** — Real-time Firestore listener on `gymRequests` where `submittedBy == uid`, ordered newest-first. Returns `{ requests, loading, count, pendingCount }`. |
| `hooks/index.js` | Added `useMyGymRequests` export. |
| `App.js` | Added RequestGymScreen to RunsStack. Added MyGymRequestsScreen to ProfileStack with themed header. |
| `screens/ViewRunsScreen.js` | Added "Don't see your gym? Request it" entry point at bottom of gym list. |
| `screens/ProfileScreen.js` | Added "My Gym Requests" row with orange count badge (uses `useMyGymRequests` hook). |
| `seedProductionGyms.js` | Added Fitness Connection gym (`fitness-connection-austin-north`). Image URL now points to Firebase Storage. Added validation warning for non-Firebase-Storage image URLs. Total: 6 gyms. |
| `services/gymService.js` | `subscribeToGyms` and `getAllGyms` now filter client-side by `status === 'active'`. |
| `services/models.js` | Added `GYM_STATUS` and `GYM_ACCESS_TYPE` constants. Updated gym schema documentation. |

## Files Modified Recently (2026-03-15 session — Reporting System + Veterans Park)
| File | What changed |
|---|---|
| `components/ReportModal.js` | **New file** — Reusable bottom-sheet modal for reporting content. Radio-button reason selector (5 options), optional description, `submitReport` Cloud Function call. Keyboard avoidance with scroll-to-input, iOS InputAccessoryView "Done" button. |
| `screens/AdminReportsScreen.js` | **New file** — Admin reports list with real-time `onSnapshot` on `reports` collection. Cards with type/status badges, reason, description, targetId, targetOwnerId, reporter name, relative time. Summary bar with pending pill. Admin-gated. |
| `screens/ClipPlayerScreen.js` | Added flag button + ReportModal for type="clip". |
| `screens/UserProfileScreen.js` | Added flag icon button (other users only) + ReportModal for type="player". |
| `screens/RunDetailsScreen.js` | Added "Report" pill for gym reports + flag icon on run cards + shared ReportModal. |
| `screens/AdminToolsScreen.js` | Activated reports-moderation tool, added navigation to AdminReports. |
| `components/index.js` | Added `ReportModal` export. |
| `App.js` | Added AdminReportsScreen route in stack navigator. |
| `screens/RequestGymScreen.js` | Updated Notes placeholder text. |
| `seedProductionGyms.js` | Added Veterans Park (8th gym). Updated coordinates. Total: 8 gyms. |

### Backend files changed (in runcheck-backend)
| File | What changed |
|---|---|
| `functions/src/submitReport.ts` | **New file** — Cloud Function: auth, validation, duplicate prevention (`reportedBy+type+targetId`), `targetOwnerId` resolution, writes to `reports` collection with status "pending". |
| `functions/src/submitGymRequest.ts` | Admin cooldown bypass — admins skip 7-day rate limit. |
| `functions/src/index.ts` | Added `submitReport` export. |
| `firestore.rules` | Added `reports` collection rules: admin can read all + update; users can read own reports; create/delete blocked (Cloud Function only). |
| `firestore.indexes.json` | Added composite index for reports duplicate check: `reportedBy+type+targetId`. |

## Files Modified Recently (2026-03-15 session — Gym System Refactor: Firestore as Source of Truth)
| File | What changed |
|---|---|
| `services/gymService.js` | `seedGyms()` converted to deprecated no-op — no longer writes to Firestore or deletes gym docs. Hardcoded gym array removed. Unused imports removed (`setDoc`, `deleteDoc`, `GYM_TYPE`, `DEFAULT_EXPIRE_MINUTES`). All read functions unchanged. |
| `hooks/useGyms.js` | Removed `seedGyms()` import and mount call. Removed `ensureGymsExist` from hook return. Hook is now a pure Firestore reader. |
| `screens/ViewRunsScreen.js` | Removed `ensureGymsExist` from destructured `useGyms()`. `onRefresh` simplified to a visual-only spinner (data is live via listener). |
| `seedProductionGyms.js` | Promoted to single canonical admin seed script. Now contains all 5 gyms with complete, aligned fields. `autoExpireMinutes` aligned to 120. Added `state`, `accessType`, `notes`, `scheduleCounts` to all entries. |
| `__tests__/screens/ViewRunsScreen.test.js` | Removed `ensureGymsExist` from mock `useGyms` return values. |
| `__tests__/screens/CheckInScreen.test.js` | Removed `ensureGymsExist` from mock `useGyms` return values (3 occurrences). |
| `__tests__/screens/GymMapScreen.test.js` | Removed `ensureGymsExist` from mock `useGyms` return value. |
| `BACKEND_MEMORY.md` | Updated `gymService.js` docs to reflect deprecated `seedGyms` and new read-only architecture. Updated `useGyms` hook signature. |

## Files Modified Recently (2026-03-15 session — Rank System Refactor)
| File | What changed |
|---|---|
| `config/ranks.js` | **New file** — Single source of truth for 6 rank tiers (Bronze→Legend) with thresholds, icons, colors, glow, perks arrays |
| `config/points.js` | **New file** — `POINT_VALUES` and `ACTION_LABELS` extracted from former `utils/badges.js` |
| `config/perks.js` | **New file** — `PERK_DEFINITIONS` registry (8 perks) + `PREMIUM_OVERRIDES` (tool/convenience only, no prestige cosmetics) |
| `utils/rankHelpers.js` | **New file** — `getUserRank`, `getProgressToNextRank`, `getNextRank`, `getRankById` |
| `utils/perkHelpers.js` | **New file** — `getUserPerks`, `hasPerk`, `getFeatureQuota`, `getRankPerksForDisplay` (display/config groundwork only) |
| `utils/badges.js` | Replaced 178-line monolith with 19-line deprecated re-export shim forwarding to `config/ranks`, `config/points`, `utils/rankHelpers` |
| `services/pointsService.js` | Imports updated to `config/points` + `utils/rankHelpers`; stale comment fixed; zero logic changes |
| `screens/LeaderboardScreen.js` | Imports updated; `RANK_PERKS` → `RANK_DESCRIPTIONS` with Diamond/Legend entries; `RankBadgePill` extended for 6 tiers; "Why Rank Matters" shows perk labels via `getRankPerksForDisplay` |
| `screens/ProfileScreen.js` | Imports updated; Platinum-only pulse glow extended to Diamond/Legend via `HIGH_GLOW_TIERS`; max rank emoji → 👑 |
| `screens/UserProfileScreen.js` | Import updated to `utils/rankHelpers` |

## Files Modified Recently (2026-03-14 session — Weekly Winners + Automation)
| File | What changed |
|---|---|
| `scripts/weeklyReset.js` | Saves top 3 winners (was 1st only); `winners` array + `firstPlace` convenience field; podium logging with tie warnings |
| `services/weeklyWinnersService.js` | **New file** — `getLatestWeeklyWinners()` reads most recent `weeklyWinners` doc |
| `hooks/useWeeklyWinners.js` | **New file** — React hook wrapping `getLatestWeeklyWinners`, one-shot fetch on mount; now also exposes `recordedAt` for 24-hour celebration card |
| `screens/LeaderboardScreen.js` | "Last Week's Winners" card: trophy icons, avatars, names, weekly points; tappable rows navigate to UserProfile; card hidden when no data |
| `screens/HomeScreen.js` | Added 24-hour winners celebration card between Quick Actions and Live Runs; uses `useWeeklyWinners` hook with `recordedAt` visibility window; "View Leaderboard →" link |
| `runcheck-backend/functions/src/weeklyReset.ts` | **New file** (backend repo) — Scheduled Cloud Function: runs every Monday 00:05 CT; saves top 3 winners + batch-resets `weeklyPoints` |
| `runcheck-backend/functions/src/index.ts` | Added `export { weeklyReset }` |

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

> **Note:** `firestore.rules` and `firebase.json` were originally added to this repo on 2026-03-12 but have since been **removed**. Firestore security rules and Firebase CLI config live exclusively in the backend repo (`~/Desktop/runcheck-backend`). See BACKEND_MEMORY.md § Config & Environment.

## Start a Run / Join a Run — Architecture Notes
- **Collections**: `runs/{autoId}` and `runParticipants/{runId}_{userId}` (compound key)
- **Merge rule**: client-side ±60 min check after a single `gymId + status` query — avoids needing a composite index on two range fields
- **`startOrJoinRun`**: validates `startTime > now` and `startTime <= now + 7 days`; checks for a mergeable run; creates or joins
- **`joinExistingRun`**: joins a known run by ID, bypasses time validation — required for grace-window runs whose `startTime` is in the past
- **`joinRun` (internal)**: runs a `runTransaction`; compound participant key makes joins idempotent; `!alreadyJoined` guard prevents double-counting `participantCount`
- **`leaveRun`**: transaction deletes participant doc + `increment(-1)` on `participantCount` (guarded: skips decrement if count already `<= 0`); no-op if user isn't in the run
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

## Moderation System Architecture (as of 2026-03-16)
- **Enforcement logic**: `moderationHelpers.ts` in the backend repo is the single source of truth. Contains: `enforceHideClip`, `enforceRemoveRun`, `enforceSuspendUser`, `enforceUnsuspendUser`, `enforceUnhideClip`, `resolveRelatedReport`. All helpers are idempotent.
- **Auto-moderation**: Triggered inside `submitReport` when pending report count reaches threshold — clip: 3 reports, run: 3 reports, player: 5 reports. Auto-mod sets `autoModerated: true` and `actor: 'auto-moderation'`.
- **Timed suspension escalation**: `ESCALATION_DAYS = [1, 3, 7, 30, 365]`. `suspensionLevel` increments on each suspension. Expired suspensions allow re-suspension with escalation. Admins are never suspended.
- **User doc fields for suspension**: `isSuspended`, `suspendedBy`, `suspendedAt`, `suspensionReason`, `suspensionLevel`, `suspensionEndsAt`, `unsuspendedBy`, `unsuspendedAt`, `unsuspendReason`
- **Clip doc fields for hiding**: `isHidden`, `hiddenBy`, `hiddenAt`, `hiddenReason`, `autoModerated`, `autoModeratedAt`, `unhiddenBy`, `unhiddenAt`, `unhiddenReason`
- **Run doc fields for removal**: `isRemoved`, `removedBy`, `removedAt`, `removedReason`, `autoModerated`, `autoModeratedAt`
- **Admin callables**: All use `onCall` from `firebase-functions/v2/https`. Auth + admin check pattern: `context.auth` required, then `getDoc('users/{uid}').isAdmin === true`. Client calls via `callFunction('name', payload)`.
- **Admin screens**: All gated by `useIsAdmin` hook. Hub: `AdminToolsScreen` with pending counts. Sub-screens: `AdminGymRequestsScreen`, `AdminReportsScreen`, `AdminSuspendedUsersScreen`, `AdminHiddenClipsScreen`. Hidden clips screen allows admin video preview via ClipPlayerScreen.
- **Profile badges**: Admin Tools badge counts 4 categories (gym requests + reports + suspended users + hidden clips). My Gym Requests badge counts only `status === 'pending'`.
- **Name resolution pattern**: Collect unique UIDs from data → batch `getDoc` from `users` collection → store in state map `{ [uid]: { name, photoURL } }` → render with fallback to raw UID. Used consistently in AdminSuspendedUsersScreen and AdminHiddenClipsScreen.

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
| `screens/LeaderboardScreen.js` | Leaderboard rows now tappable (`TouchableOpacity`, `disabled` on own row, chevron affordance for others); added `RANK_PERKS` display-only copy object; added "Why Rank Matters" card (tier list with icon, color, description, "You" badge on current tier; later expanded to 6 tiers in rank refactor); Rank Tiers section now shows `rank.icon` emoji instead of small colored dot; new styles: `tierIcon`, `perksRow`, `perksInfo`, `perksDesc`, `currentBadge`, `currentBadgeText` |
| `App.js` | Added `UserProfile` screen to `ProfileStack` so leaderboard row taps navigate correctly from the Profile tab entry point |

## Debug Logs (intentionally left in, remove after confirming)
Both `HomeScreen.js` and `RunDetailsScreen.js` have `__DEV__`-guarded console logs:
- `[LiveRun:{gym.name}] activeUniqueCount=N userIds=[...]`
- `[LiveRun:{gym.name}] startedAt=... startedAgo="..."`
- `[RunDetails] raw presences: N ids: [...]`
- `[RunDetails] unique presences: N ids: [...]`
- `[RunDetails] missing profiles (will show placeholder): [...]`

## Known Issues / Risks
- **Firestore rules live in the backend repo only** — `~/Desktop/runcheck-backend/firestore.rules` is the single source of truth. This frontend repo no longer contains `firestore.rules` or `firebase.json`. All rule changes must be made in the backend repo and deployed with `cd ~/Desktop/runcheck-backend && firebase deploy --only firestore:rules`.
- GPS distance enforcement is commented out in both `usePresence.js` and `presenceService.js` — must be re-enabled before launch
- Auto-expiry is client-side only; a Cloud Function is needed to expire presences server-side without deducting points
- No composite Firestore index for `activity` collection query (`createdAt >= X, orderBy createdAt`) — may need manual index creation for scale
- `gym.currentPresenceCount` is a stale denormalized counter — do NOT use it for display; always use `useLivePresenceMap` / `subscribeToGymPresences`. All screens now use the correct source (`PlanVisitScreen` was the last violation; fixed 2026-03-13)
- `reliability.totalScheduled` is NOT incremented on plain check-ins (only via `createSchedule`) — this is intentional; the Session Stats "Scheduled" column reflects explicit planned visits
- When Cloud Functions are eventually deployed for reliability/no-show tracking, the client-side `reliability.totalAttended` increment in `presenceService.checkIn()` should be removed to avoid double-counting
- The compound presenceId (`{userId}_{gymId}`) is reused when a user checks in, checks out, and re-checks into the same gym — this is intentional for duplicate-prevention; the points idempotency key is separately `{presenceId}_{checkinTimestampMs}` so repeat visits earn points correctly
- ~~**`'joined a run at'` activity writes**~~ — **Resolved.** The join activity `addDoc` calls were removed in a prior session. Only `'started a run at'` remains in `runService.js`. Comments at the former write sites document the decision.
- **Gym images still on external hosts**: 5 of 6 gyms still use third-party image URLs (Yelp, gstatic, Cloudinary, Life Time CDN). Only Fitness Connection has been migrated to Firebase Storage. The seed script warns on each external URL during `--validate`. Migrate remaining gyms when convenient.
- **`addGym` Cloud Function is stale**: The existing `addGym` Cloud Function writes directly to the `gyms` collection, bypassing the seed script and not including the `status` field. Should be deprecated/removed.
- **Cowboys Fit coordinates approximate**: Still using approximate coordinates. User will manually verify exact building pin in Google Maps before updating.

## Next Tasks

Launch-critical tasks are now tracked in `LAUNCH_CHECKLIST.md`. Deferred improvements live in `PARKING_LOT.md`.

For reference, these items were previously listed here and have been moved:
- Remove `__DEV__` debug logs → **LAUNCH_CHECKLIST.md** (App Store Readiness)
- Re-enable GPS distance enforcement → **LAUNCH_CHECKLIST.md** (GPS & Location)
- Build Cloud Function for auto-expiry → **LAUNCH_CHECKLIST.md** (Post-Launch / Not Required Yet)
- Add Firestore composite index for `activity` → **LAUNCH_CHECKLIST.md** (Post-Launch / Not Required Yet)
- Set `cli.appVersionSource` in eas.json → **LAUNCH_CHECKLIST.md** (App Store Readiness)
- ~~Consider switching to timestamp-based presenceIds~~ — resolved (points idempotency key is `{presenceId}_{checkinTimestampMs}`)

## How to Give Claude Context at Start of Each Session

Read `SESSION_START.md` first — it defines the startup reading order, current project phase, and session rules. That file replaces the manual onboarding prompt.

## Weekly Leaderboard System
RunCheck includes a weekly competition system alongside the permanent leaderboard.
Key design decisions:
- User documents store both `totalPoints` (all-time) and `weeklyPoints`.
- All point-awarding logic increments both values simultaneously in `pointsService.js`.
- The leaderboard UI supports two views: **All Time** and **This Week**.
- Player rank tiers always derive from `totalPoints`.
- The weekly leaderboard only changes the ordering and displayed points.

### Weekly Winners (Top 3)
Weekly winners (up to 3) are stored in:
`weeklyWinners/{YYYY-MM-DD}`
Document structure:
```js
{
  weekOf, recordedAt,
  firstPlace: { uid, name, photoURL, weeklyPoints },   // convenience field
  winners: [
    { uid, name, photoURL, weeklyPoints, place: 1 },
    { uid, name, photoURL, weeklyPoints, place: 2 },
    { uid, name, photoURL, weeklyPoints, place: 3 },
  ]
}
```

**Read layer**: `weeklyWinnersService.js` → `getLatestWeeklyWinners()` fetches the most recent doc. `useWeeklyWinners` hook wraps it for React screens.

**Display**: LeaderboardScreen shows a "Last Week's Winners" card (below My Rank, above tab toggle) with gold/silver/bronze trophies, avatars, names, and weekly points. Card is hidden when no winner data exists.

**Automated reset**: `weeklyReset` Cloud Function in the backend repo (`runcheck-backend/functions/src/weeklyReset.ts`) runs every Monday at 00:05 America/Chicago via Cloud Scheduler. Saves top 3 winners then batch-deletes `weeklyPoints` for all users.

**Manual backup**: `scripts/weeklyReset.js` remains available for dry-run verification, overrides (pinned `WEEK_OF`), and emergency re-runs. Dry-run by default; use `COMMIT=true` to write.

**Home screen celebration**: HomeScreen shows a temporary "Last Week's Winners" card for 24 hours after `recordedAt`. Uses `useWeeklyWinners` hook's `recordedAt` field. Auto-hides after the window expires — no cleanup needed.

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

## Clip Tagging & Approval Architecture (as of 2026-03-17)

### Data Model
- `gymClips/{clipId}.taggedPlayers: Array<{ uid, displayName, addedToProfile? }>` — max 5 entries, written by `finalizeClipUpload`
- `gymClips/{clipId}.taggedUserIds: string[]` — flat mirror of `taggedPlayers[].uid`, written once by backend, never mutated by client. Exists for Firestore rule compatibility (array-contains can't match sub-fields of map arrays).
- `addedToProfile` is per-user within the array. Default `undefined`/`false`. Set to `true` via `addClipToProfile` Cloud Function.

### Approval Flow (CRITICAL — backend-controlled)
- **All writes to `taggedPlayers` MUST go through the `addClipToProfile` Cloud Function.** The client NEVER writes `taggedPlayers` directly.
- The Cloud Function validates: (1) auth, (2) caller's uid exists in `taggedPlayers`, (3) only modifies caller's own entry.
- Firestore rules do NOT allow client-side `taggedPlayers` writes. The gymClips `allow update` rule permits only like/unlike.
- This eliminates the edge case where a tagged user could theoretically modify another user's `addedToProfile` via a client-side array replacement.

### Display Logic
- **"Tagged In"** (ProfileScreen, own profile only): All clips where user appears in `taggedPlayers` — `useTaggedClips.allTagged`
- **"Featured In"** (ProfileScreen + UserProfileScreen, any profile): Clips where user's `addedToProfile === true` — `useTaggedClips.featuredIn`
- A clip can appear in BOTH sections simultaneously. Approval does not remove from "Tagged In".
- Sections hidden when empty (guarded by `.length > 0`).

### Refresh Pattern
- `useTaggedClips` exposes a `refetch` callback (increments internal `fetchKey` counter).
- Both ProfileScreen and UserProfileScreen call `refetch` via `useFocusEffect` on screen focus.
- This ensures fresh data after navigating back from ClipPlayerScreen (where approval happens).

### Firestore Limitation
- `array-contains` requires exact object match — cannot filter by sub-field of array element.
- V1 uses client-side filtering: query 100 recent clips, filter for `taggedPlayers` containing target uid.
- Future optimization: use `taggedUserIds` flat array for a native `array-contains` query.

### Clip Posting Limits (Hardened 2026-03-17)
- **Per-session duplicate guard**: Deterministic clipId + transaction check. Soft-deleted clips (`isDeletedByUser === true`) still consume the session slot — cannot repost for the same run.
- **Weekly free-tier cap** (`FREE_CLIPS_PER_WEEK = 3`): Counts exclude `status === 'abandoned'` AND `isDeletedByUser === true`. Deleting a clip restores the weekly posting slot.
- These two rules are intentionally independent: deleting restores the weekly slot but NOT the session slot.

## Instagram Integration (Home Screen)
RunCheck includes Instagram entry points to connect the app with the community page.
Key elements:
- `INSTAGRAM_URL` constant defined in `HomeScreen.js`
- Header icon order: **Instagram → Trophy → Profile**
- Instagram icon uses `Ionicons` (`logo-instagram`)
- A community card is placed between the **Recent Activity feed** and the **footer tagline**

Both entry points open the RunCheck Instagram page using:
Linking.openURL(INSTAGRAM_URL)

## Identity Upgrade V1 — Username + Email Verification (2026-03-17)

### What was added
- **Required username at signup**: New `username` field on SignupScreen with client-side regex validation (`^[a-zA-Z][a-zA-Z0-9._]{2,19}$`). Casing preserved for display, lowercase used for uniqueness.
- **Atomic username reservation**: Firestore transaction writes both `usernames/{usernameLower}` reservation doc and `users/{uid}` profile doc atomically. If the username is taken, the transaction aborts.
- **Email verification gate**: After signup, `sendEmailVerification` is called. New `VerifyEmailScreen` blocks access until `emailVerified === true`. Resend button with 60-second cooldown.
- **Existing user migration**: New `ClaimUsernameScreen` for logged-in, verified users whose profile is missing `username`. Same transaction-based claim flow.
- **Auth-aware SplashScreen routing**: SplashScreen now checks auth state, email verification, and username presence to route to the correct screen.
- **Login routing**: LoginScreen now routes to VerifyEmail or ClaimUsername as needed instead of always going to Main.

### New Firestore fields on `users/{uid}`
- `username: string` — display-cased
- `usernameLower: string` — lowercase for lookups
- `phoneNumber: string | null` — reserved for future use

### New Firestore collection
- `usernames/{usernameLower}` — `{ uid, createdAt }` — uniqueness reservation

### Files modified
- `hooks/useAuth.js` — added `emailVerified`, `hasUsername`, `profileLoading`
- `screens/SignupScreen.js` — username field, transaction, email verification
- `screens/LoginScreen.js` — auth-aware routing after login
- `screens/SplashScreen.jsx` — auth-aware routing instead of blind timer
- `screens/VerifyEmailScreen.js` — new file
- `screens/ClaimUsernameScreen.js` — new file
- `App.js` — registered VerifyEmail and ClaimUsername routes
- `firestore.rules` — added `usernames` collection rules
- `BACKEND_MEMORY.md` — documented new collection + user fields

### Navigation gate order
1. Not logged in → Login
2. Logged in, email not verified → VerifyEmail
3. Logged in, verified, no username → ClaimUsername
4. Logged in, verified, has username → Main

## Account Deletion (2026-03-17)

### What was added
- **Delete Account button** on ProfileScreen below Sign Out — muted style, confirmation alert
- **`deleteAccount` Cloud Function** — server-side cleanup of all user data across 12 Firestore collections + Firebase Auth deletion via Admin SDK
- Username reservation (`usernames/{usernameLower}`) is freed on deletion
- Friends/requests arrays are cleaned bidirectionally
- Clips are soft-deleted (Storage files preserved for future cleanup)
- Run participations deleted + participantCount decremented

### Files changed
- `screens/ProfileScreen.js` — added `handleDeleteAccount` handler + Delete Account button + styles
- `runcheck-backend/functions/src/deleteAccount.ts` — new Cloud Function
- `runcheck-backend/functions/src/index.ts` — added `deleteAccount` export
- `BACKEND_MEMORY.md` — documented cleanup steps and limitations

### V1 limitations
- Historical `weeklyWinners` entries retain deleted user's name/photo
- `likedBy` keys on other users' clips become stale (no UI impact)
- `taggedPlayers` on other users' clips show stale name (no crash)
- Firebase Storage files not purged (soft-delete flags prevent display)

### Deploy required
```bash
cd ~/Desktop/runcheck-backend && firebase deploy --only functions:deleteAccount
```

## Settings Screen (2026-03-17)

### What was added
- **SettingsScreen** — new screen with Preferences (Dark Mode toggle) and Account (Sign Out, Delete Account) sections
- **Settings row on ProfileScreen** — replaces the old bottom-of-page Sign Out + Delete Account buttons with a single "Settings" menu row using the same `gymRequestsRow` pattern
- Sign Out and Delete Account logic moved to SettingsScreen (unchanged behavior)
- Unused imports removed from ProfileScreen (`Switch`, `signOut`, `toggleTheme`)

### Files changed
- `screens/SettingsScreen.js` — new file
- `screens/ProfileScreen.js` — removed Sign Out/Delete Account buttons + handlers, added Settings nav row, cleaned unused imports/styles
- `App.js` — imported SettingsScreen, registered in ProfileStack with themed header

## Identity & Verification Polish (2026-03-17)

### What was changed
- **VerifyEmailScreen** — Improved messaging: initial text clarifies email was already sent, mentions spam folder. Rate-limit errors now show friendly "already sent" message instead of raw error. Cooldown button text changed to "Email Sent — Check Inbox". Switched `console.error` to `console.warn` for non-fatal auth errors.
- **@username on profiles** — ProfileScreen shows `@username` below display name (uses `profile?.username || liveProfile?.username`, null-safe). UserProfileScreen shows `@username` below name (null-safe, hidden when missing).
- **User search** — New `SearchUsersScreen` with prefix search on `usernameLower`. Entry point: person-add icon in My Crew header on ProfileScreen. Results show avatar, name, @username. Tap navigates to UserProfile. Current user excluded from results.

### Files changed
- `screens/VerifyEmailScreen.js` — polished messaging, friendlier error handling, cleaner logs
- `screens/ProfileScreen.js` — added @username text, search button in My Crew header, `usernameText`/`crewSearchButton` styles
- `screens/UserProfileScreen.js` — added @username text, `usernameText` style, adjusted name marginBottom
- `screens/SearchUsersScreen.js` — new file
- `App.js` — imported SearchUsersScreen, registered in ProfileStack

### Search behavior
- Prefix match on `usernameLower` using Firestore >= / < range query
- Minimum 2 characters to trigger search
- Max 20 results per query
- Requires Firestore index on `usernameLower ASC` (auto-created by first query or add to `firestore.indexes.json`)

## First-Time Onboarding (2026-03-18)

### What was added
- **3-step onboarding flow** for first-time users: Welcome → Pick Home Court → Location Permission + Finish
- **OnboardingWelcomeScreen** — branded welcome with "Find runs. Show up. Hoop." headline
- **OnboardingHomeCourtScreen** — gym picker using existing `useGyms` hook, saves `homeCourtId` to profile, skippable
- **OnboardingFinishScreen** — location permission request with explanation + "You're All Set" state, saves `onboardingCompleted: true`, final button goes to Runs tab
- **Navigation gate** added to SplashScreen, LoginScreen, VerifyEmailScreen, and ClaimUsernameScreen — routes to onboarding when `onboardingCompleted` is falsy

### New fields on `users/{uid}`
- `onboardingCompleted: boolean` — flag to skip onboarding on subsequent launches
- `homeCourtId: string | null` — already used by ProfileScreen/UserProfileScreen, now set during onboarding

### Navigation gate order (updated)
1. Not logged in → Login
2. Logged in, email not verified → VerifyEmail
3. Logged in, verified, no username → ClaimUsername
4. Logged in, verified, username exists, onboarding incomplete → OnboardingWelcome
5. Logged in, verified, username exists, onboarding complete → Main

### Files changed
- `hooks/useAuth.js` — added `onboardingCompleted` to profile snapshot + return value
- `screens/OnboardingWelcomeScreen.js` — new file
- `screens/OnboardingHomeCourtScreen.js` — new file
- `screens/OnboardingFinishScreen.js` — new file
- `screens/SplashScreen.jsx` — added onboarding gate
- `screens/LoginScreen.js` — added onboarding gate
- `screens/VerifyEmailScreen.js` — added onboarding gate
- `screens/ClaimUsernameScreen.js` — routes to onboarding or Main based on flag
- `App.js` — registered 3 onboarding routes
- `BACKEND_MEMORY.md` — documented new fields
