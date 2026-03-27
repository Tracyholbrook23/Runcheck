# RunCheck — Project Memory Snapshot
_Last updated: 2026-03-27 (2026-03-27: Firestore composite index fix for AdminAllClipsScreen; expireClips.ts raw-file safety guard; age validation + COPPA hardening on SignupScreen; OnboardingHomeCourtScreen overhaul with location + search + request-gym row; RequestGym navigation fixed for onboarding scope; ProfileStack back-button fixed; storagePath vs finalStoragePath root cause discovered and reverted across 7 files. 2026-03-26 session C: skeleton/freeze issue fully resolved — true root cause was App.js Runs tabPress listener using navigate() causing competing stack animations in new arch; fixed with StackActions.popToTop() targeted at RunsStack state key; all six subscription hooks also cleaned of InteractionManager/setTimeout delays and debug logs removed. 2026-03-26 session B: backend fully deployed and verified — all Cloud Functions including Phase 2 push notifications live; Firestore rules deployed and verified matching local; serviceAccountKey.json confirmed not in git history, no rotation required. 2026-03-26 session A: RC-002 complete fix — HomeScreen.js reactive run-doc subscriptions (onSnapshot per feed run) remove stale cards for all last-leaver scenarios; firestore.rules activity delete rule extended for 'started a run at' docs; leaveRun fire-and-forget delete now works for non-creator last-leavers; hooks refactored with InteractionManager deferred subscriptions (frozen-skeleton fix), utils/sanitize.js added as centralized input sanitizer, HomeScreen updated. 2026-03-25 session: added notifyFollowersRunCreated + notifyFollowersPresenceMilestone + onGymPresenceUpdated Cloud Functions (Phase 2 push notifications — gym follow alerts + live activity alerts), ViewRunsScreen UI polish pass (blinking status dots, follow banner, status color tiers), reliability formula repair + deploy-pending fix, repairReliabilityScores.js admin script added)_

## Goal
A React Native mobile app where basketball players check into gyms in real time, see who's playing, earn rank points, and follow gyms.
## Current Milestone

Primary Goal:
Launch a reliable core run experience for first users in Austin.

In Scope:
- stable signup / login / verification / onboarding flow
- gym discovery and home court selection
- start run / join run / leave run flow
- check-in and check-out reliability
- empty-run cleanup and stale activity cleanup
- basic reporting and admin moderation
- launch-readiness cleanup (permissions, logs, blockers, polish tied to launch)

Out of Scope (for now):
- major clip feature expansion
- advanced social systems
- heavy visual redesign
- deep analytics
- experimental monetization work
- non-launch backend refactors

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
- `checkOut(isManual)` param is kept for API compatibility but has NO behavioral difference — points are awarded at check-in and are NEVER deducted on checkout (manual or auto-expiry). The `isManual` flag only existed in an older version that deducted points; that behavior was removed. Activity feed entry is deleted in both paths.
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
- **Moderation system (2026-03-16, hardened 2026-03-24)**: Full auto-moderation + admin moderation pipeline. `moderationHelpers.ts` is the single source of truth for all enforcement logic (hide clip, remove run, suspend user, unsuspend user, unhide clip, resolve report). Auto-moderation thresholds: clip→3 reports, run→3 reports, player→5 reports — triggered inside `submitReport` when **pending** report count reaches the threshold (resolved/reviewed reports excluded from count). Timed suspension escalation: `ESCALATION_DAYS = [1, 3, 7, 30, 365]` based on `suspensionLevel` on the user doc. Admin callables: `hideClip`, `removeRun`, `suspendUser`, `unsuspendUser`, `unhideClip`, `moderateReport` — all require `users/{uid}.isAdmin === true`. Client calls via `callFunction('functionName', payload)` from `config/firebase.js`. Suspension enforced in: `presenceService.checkIn`, `runService.startOrJoinRun`, `dmService.sendDMMessage`, `createClipSession` Cloud Function.
- **Admin dashboards (2026-03-16)**: Admin Tools hub screen (`AdminToolsScreen`) with live pending counts per tool. Sub-screens: `AdminGymRequestsScreen` (with detail view), `AdminReportsScreen` (type/status badges, resolve/review actions), `AdminSuspendedUsersScreen` (user avatar, suspendedBy resolved to display name, unsuspend action), `AdminHiddenClipsScreen` (clip thumbnail preview, play icon overlay, hiddenBy resolved to display name, uploader avatar, unhide action, tappable thumbnails to view video in ClipPlayerScreen). All admin screens gated by `useIsAdmin` hook. Admin badge on Profile → Admin Tools row counts total workload: pending gym requests + pending reports + currently suspended users + hidden clips.
- **Profile badges (2026-03-16)**: "My Gym Requests" badge on Profile now counts only `status === 'pending'` requests (was total count). Uses `pendingCount` from `useMyGymRequests` hook. Badge disappears when all requests are approved/rejected/duplicate.
- **Clip tagging V1 (2026-03-17)**: Users can tag up to 5 friends when posting a clip. Backend validates tags in `finalizeClipUpload` (dedupe, verify uid exists, trim displayName). Tags displayed as tappable `@Name` chips on ClipPlayerScreen. TrimClipScreen has a collapsible friend picker.
- **Tagged clip awareness + approval V1 (2026-03-17)**: Tagged users see clips they appear in via "Tagged In" section on ProfileScreen (own profile only) and can approve clips to appear on their public "Featured In" section on UserProfileScreen. Approval flow: `addClipToProfile` Cloud Function (backend-controlled, per-user ownership). `useTaggedClips` hook fetches + client-side filters recent clips. Refetches on screen focus via `useFocusEffect`.
- **Clip posting audit hardening (2026-03-17)**: Per-session duplicate guard now explicitly blocks soft-deleted clips (`isDeletedByUser === true` → slot consumed). Weekly free-tier cap (`FREE_CLIPS_PER_WEEK = 3`) now excludes soft-deleted clips (deleting restores weekly slot). `pointsAwarded: boolean` scaffolded on clip docs for future rewards system.
- **Upcoming Runs participant modal (2026-03-16)**: The `+N` overflow bubble on Upcoming Runs cards in `RunDetailsScreen` is now tappable — opens a bottom-sheet modal listing all participants for that run with avatar, display name, and chevron. Tapping a participant navigates to their profile via `navigation.navigate('Home', { screen: 'UserProfile', params: { userId } })`.
- **Player Reviews (RC-007)**: `gyms/{gymId}/reviews` subcollection; eligibility via `runGyms OR gymVisits`; one active review/reward per user per gym; "Verified Run" badge for run-completion reviewers only; rating summary + sort + reviewer run count + tappable profile navigation
- **Weekly Winners (Top 3)**: `weeklyWinners/{YYYY-MM-DD}` stores podium (1st/2nd/3rd) with `winners` array + `firstPlace` convenience field; `weeklyWinnersService.js` + `useWeeklyWinners` hook (exposes `recordedAt` for 24h celebration); LeaderboardScreen "Last Week's Winners" card; HomeScreen temporary celebration card (24h visibility after reset); automated via `weeklyReset` Cloud Function (Monday 00:05 CT); manual script retained as admin backup
- **Run Activation (Post-Core Polish, 2026-03-17)**: Runs now derive "live" state client-side using presence ∩ participants — no backend state added (intentional). `runHereCountMap` in RunDetailsScreen cross-references `runParticipantsMap` userIds with `uniqueActivePresences` odIds via Set intersection. Display shows: "N going" (planned, hereCount === 0), "N here · M going" (live, partial arrival), "N here" (fully arrived) with green LIVE dot. Live runs sorted above planned runs via `sortedRuns` useMemo. Zero schema changes, zero new Firestore reads, zero backend changes. When scaling: if presence list grows large, consider moving the intersection to a lightweight Cloud Function or adding a `checkedInUserIds` array on the run doc.
- **Swipe tabs (2026-03-19)**: Main tab navigator swapped to `createMaterialTopTabNavigator` with `tabBarPosition="bottom"` and `swipeEnabled: true`. Swipe left/right between tabs works on physical device (requires native build; shipped in 2026-03-19 TestFlight build). `tabBarIndicatorStyle: { height: 0 }` removes the top-tab indicator bar.
- **Gradient avatar ring (2026-03-19)**: Orange/red/dark LinearGradient ring (`#FF4500 → #CC1100 → #1A0000 → #FF6B00`) on own profile (`ProfileScreen`) and other users' profiles (`UserProfileScreen`).
- **Rank card redesign (2026-03-19)**: Unified rank card on ProfileScreen — rank icon + name + skill badge + points + progress bar + "X pts to next rank" + leaderboard button all in one bordered card. Previous multi-card layout replaced.
- **Premium plan toggle (2026-03-19)**: Monthly/Annual pricing cards on PremiumScreen are `TouchableOpacity`. `selectedPlan` state defaults to `'annual'`. Selected card gets orange border; CTA button updates to reflect selected price.
- **Direct Messaging (DM) System (2026-03-21, hardened 2026-03-24)**: 1:1 private chat between any two users. `conversations/{conversationId}` (deterministic ID: `[uid_a, uid_b].sort().join('_')`) + `conversations/{id}/messages/{autoId}` subcollection. `dmService.js` is the full service. Unread count derived client-side from `lastActivityAt > lastSeenAt[uid]` (no extra reads). `MessagesScreen` is unified inbox for DMs + Run Chats with user search and new-conversation discovery. `DMConversationScreen` is the 1:1 chat view with a flag button in the header that opens `ReportModal` (type="player", targetId=otherUserId). `dmService.sendDMMessage` blocks suspended users (same pattern as presenceService). "Message" button on `UserProfileScreen` opens or creates conversation. Unread badge on HomeScreen header icon and ProfileScreen "Messages" row. DM notification taps (data.type === 'dm') navigate to DMConversationScreen from any stack. Firestore rules for `conversations` collection deployed 2026-03-25 (verified match 2026-03-26). `onDmMessageCreated` Cloud Function implemented and exported in `index.ts`.
- **OnboardingRegionScreen (2026-03-21)**: New step 0 in the onboarding flow. Shows 4 bullets about Austin TX geographic focus and gym request option. `VerifyEmailScreen` now routes to `OnboardingRegion` → `OnboardingWelcome` → `OnboardingHomeCourt` → `OnboardingFinish` after profile write. Navigation gate order updated: step 3b now goes to `OnboardingRegion` first.
- **Run Chat MVP (2026-03-20, simulator testing pending)**: Participants-only group chat on every run. `runs/{runId}/messages` subcollection with `serverTimestamp()` ordering. Access gated by `runParticipants/{runId}_{userId}` doc existence (Firestore rules + client-side). Chat button on RunDetailsScreen only visible to joined participants. Non-participants and Firestore errors both render clean gated states (no spinner hang, no red screen). React Strict Mode double-invocation handled by guarding the subscription on `participantLoading`. Firestore rules deployed 2026-03-25 (verified match 2026-03-26).
- **ViewRunsScreen immediate render (2026-03-20)**: Header gradient, title, search bar, and filter pills now render immediately on tab open. Loading spinner is inline within the gym list instead of a full-screen early return.
- **Phase 1 Push Notifications (2026-03-20, deployed)**: Permission prompt fires on first launch; Expo push token saved to `users/{uid}.pushToken` via `registerPushToken()` in `utils/notifications.js` (called on `MainTabs` mount in `App.js`). Foreground notification display wired via `Notifications.setNotificationHandler`. Three Cloud Functions deployed: `notifyRunStartingSoon` (scheduled every 5 min — reminds participants 25–35 min before run start), `onRunParticipantJoined` (Firestore onCreate trigger — notifies creator when someone joins, 5-min cooldown), `onParticipantCountMilestone` (onUpdate trigger — notifies creator at 5/10/20 player milestones). Cooldown deduplication via `users/{uid}.notifCooldowns` map. ⚠️ `notifCooldowns` will grow unboundedly — migrate to subcollection before ~500 active users (BACKEND Known Issue #9).
- **Open Run flow improvement (2026-03-20)**: HomeScreen "Open Run" quick-action now passes `openStartRun: true` param through ViewRunsScreen directly to RunDetailsScreen, which auto-opens the run creation modal (skipping the intermediate run-type picker). Reduces taps for the most common run creation path. "Start a Run" outlined button added at top of RunDetailsScreen next to "Check In Here". Upcoming Runs section moved above Now Playing in RunDetailsScreen.
- **OTA channel fix (2026-03-20, requires fresh build)**: `eas.json` production profile now has `"channel": "production"`. Current TestFlight binary is missing the channel header baked in; OTA updates do not apply until a fresh build is submitted (~April 1 when build quota resets). Simulator use recommended for frontend validation until then.
- **Run Level Phase 1 (2026-03-22)**: Runs now have a `runLevel` field (`'casual'|'mixed'|'competitive'`) set by the creator at run creation. Picker in the Start-a-Run modal (3 pills). Badge on run cards in RunDetailsScreen (Casual = green, Competitive = red, Mixed = hidden). Filter in ViewRunsScreen filter sheet (Any/Casual/Mixed/Competitive, client-side). Backwards compatible: old runs without the field are treated as `'mixed'`. Client-side only — no Cloud Function or backend schema deploy needed.
- **Run Level Phase 2 — Quality Indicators Expansion (2026-03-24)**: Two UI-only improvements, no backend changes. (1) `ViewRunsScreen` gym cards now show a run level badge ("Casual" / "Balanced" / "Competitive") when at least one upcoming run exists at that gym. Dominant level computed from `allUpcomingRuns` (already subscribed): competitive > casual > mixed priority. Badge reuses the `runLevelBadge` + `runLevelBadgeText` style pattern from RunDetailsScreen exactly (same hex colors, same `borderRadius`, same padding). (2) `RunDetailsScreen` run cards now show "Balanced" in neutral slate gray (`#94A3B8`) — all three labels always visible.
- **Run Level Phase 4 — Badge & Meter Explainers (2026-03-24)**: UI-only, no backend changes. Both run style badges and the competitive meter are now tappable and open contextual info sheets. `RunDetailsScreen`: single `infoSheetType` state (`null|'runLevel'|'meter'`) drives one shared Modal bottom sheet. Tapping the run style badge opens "Run Style" (😊 Casual / 🤝 Balanced / 🔥 Competitive + one-line descriptions); tapping the meter bars opens "Competitive Meter" (three example bars + fallback note). Sheet reuses the `participantModalOverlay` / `participantModalSheet` bottom-sheet pattern exactly. `ViewRunsScreen`: `runLevelInfoVisible` state + a second Modal using existing `sheetBackdrop` + `sheetHandle` styles; new `infoSheetContainer` mirrors `sheetContainer`. "Got it" button closes both sheets. No new Firestore reads; no imports added.
- **Run Level Phase 3 — Label Clarity + Competitive Meter (2026-03-24)**: Display-only pass, no schema changes. (A) Label "Mixed" renamed to "Balanced" everywhere in the UI: filter sheet pills, active filter chips, gym card badges, run card badges, start-run picker. Stored `runLevel` value in Firestore remains `'mixed'` — no migration needed. (B) Competitive meter added to run cards in `RunDetailsScreen`: 5 compact horizontal bars (12×5px each, 3px gap). Formula: cross-reference `runParticipantsMap` with `presences` (both already subscribed) to get `skillLevel` for checked-in participants; `Competitive→5`, `Either→3`, `Casual→1`; `Math.round(average)` → 1–5 filled bars. Fallback when <2 presences match: `competitive→5 bars`, `mixed→3 bars`, `casual→1 bar`. Color: red (bars≥4), slate (bars=3), green (bars≤2). Pure helper `getCompetitiveBars()` at module level in RunDetailsScreen. PlanVisitScreen: does not display runLevel (no change needed).
- **Run Chat expiry (2026-03-22)**: Each run's group chat is active for 4 hours after `startTime` (`chatExpiresAt = startTime + RUN_CHAT_EXPIRY_MS`). Written on run creation. `RunChatScreen` shows a read-only "This run chat has ended" banner replacing the input bar after expiry. `useMyRunChats` hides expired chats from the Messages inbox. Firestore `isChatActive()` rule hard-blocks new writes after expiry.
- **Run Chat unread detection (2026-03-22)**: `sendRunMessage` stamps `lastMessageAt` on `runs/{runId}` (fire-and-forget). `markRunChatSeen` writes `lastReadAt` on `runParticipants/{runId}_{uid}` when the user opens the chat. `useMyRunChats` derives `isUnread = lastMessageAt > lastReadAt`, exposes `runChatUnreadCount`. HomeScreen Messages badge now shows total unread = `dmUnreadCount + runChatUnreadCount`.
- **EditProfileScreen (2026-03-22)**: New screen for editing Display Name and Skill Level. Writes to Firestore `users/{uid}.name` and Firebase Auth `displayName`. Accessible via Settings → Account Info in ProfileStack.
- **Username system (2026-03-22, late)**: Every RunCheck account now has a unique `username`. Chosen during signup (new users) or via `ClaimUsernameScreen` (migration gate for existing accounts). Uniqueness enforced by a `usernames/{usernameLower}` reservation doc written atomically with the user profile in a Firestore transaction. `SignupScreen` now collects first name, last name, and username (plus previous fields); Firestore profile write deferred to `VerifyEmailScreen` (post email-confirmation) to avoid storing unverified accounts. `ClaimUsernameScreen` handles existing users missing the field — routes to Main if `onboardingCompleted`, else OnboardingWelcome. `users/{uid}` now includes `username`, `usernameLower`, `firstName`, `lastName`, `phoneNumber: null` fields.
- **Run Level Phase 2/3/4 (2026-03-24)**: UI-only display improvements — no backend changes. (2) ViewRunsScreen gym cards show dominant run level badge (Competitive/Casual/Balanced) when at least one upcoming run exists. (3) "Mixed" renamed to "Balanced" everywhere in UI; Firestore value `'mixed'` unchanged. Competitive Meter (5 horizontal bars) added to run cards — cross-references `runParticipants` `skillLevel` snapshots with presences; formula: Competitive→5, Either→3, Casual→1, avg rounded. Fallback to `runLevel` when <2 data points. (4) Run style badges and meter bars are now tappable — open contextual info sheets explaining each level. Shared bottom-sheet pattern reused throughout.
- **Competitive Meter Skill Snapshot (2026-03-24)**: `runService.fetchUserDisplayInfo` now reads `skillLevel` from `users/{uid}` and writes it to `runParticipants/{runId}_{uid}` at join time. `RunDetailsScreen.getCompetitiveBars()` prefers `participant.skillLevel` (V2 path) before falling back to presence cross-reference (V1 for older docs). Fixes "all runs showing Balanced" for upcoming runs with no check-ins.
- **DM User Blocking (2026-03-24)**: `dmService.blockUser(currentUid, targetUid)` and `unblockUser` write `blockedUsers: arrayUnion/arrayRemove` on `users/{currentUid}`. Block guard in `sendDMMessage` (reads recipient's `blockedUsers`, throws if sender listed). Bidirectional block guard in `openOrCreateConversation` (slow path only — reads both user docs in parallel, throws if either party blocked the other). Block/Unblock button added to `UserProfileScreen` (below Message button). Friend and Message buttons hidden when user is blocked.
- **DM Conversation Mute (2026-03-24)**: `muteConversation`, `unmuteConversation`, `getConversationMuteState` added to `dmService.js`. `mutedBy: { [uid]: true }` field on conversation docs (dot-notation writes, independent per user). Mute toggle (bell icon) in `DMConversationScreen` header — optimistic UI with revert on error. `onDmMessageCreated` Cloud Function checks `mutedBy[recipientUid]` before sending push — returns early if muted (no cooldown penalty). MessagesScreen shows mute icon on muted conversations.
- **Message-Level DM Reporting (2026-03-24)**: Long-press any non-own message in `DMConversationScreen` → `ReportModal` opens with message preview and reason selector. `submitReport` Cloud Function now supports `type='message'` with `messageContext: { conversationId, messageId, senderId, messageText, messageSentAt }`. Dedup is per-user per-messageId. `AdminReportsScreen` shows cyan "Message" badge + quoted excerpt + Sender/Received by/Sent meta rows for message-type reports.
- **Report + Block in One Flow (2026-03-24)**: `ReportModal` now accepts optional `blockSenderId` prop. For `type='message'` reports, an "Also block this user" toggle appears. If checked, `blockUser` is called after successful report submission. DMConversationScreen passes `blockSenderId={reportTarget.senderId}`.
- **Admin DM Message Enforcement (2026-03-24)**: `removeDmMessage` Cloud Function (new) soft-deletes a DM message (`isRemoved: true` + audit fields). Idempotent via `moderationHelpers.enforceRemoveDmMessage`. Writes to `adminActions/{autoId}` audit log. "Remove Message" action button added to `AdminReportsScreen` for message-type reports. Removed messages render as an italicized pill placeholder in `DMConversationScreen`.
- **Reliability Threshold + useReliability Rebuild (2026-03-24)**: `useReliability` hook rebuilt with `displayScore`, `displayTier`, `meetsThreshold` — score is pinned to 100 (`RELIABILITY_THRESHOLD = 3`) until the user has ≥3 processed reliability events, matching the backend `computeScore` guard. `ProfileScreen` now uses `useReliability` hook exclusively (was using a separate inline `onSnapshot`) — fixes RC-004 (flash of zeroes). `UserProfileScreen` applies same threshold display logic. Reliability info modal ("How Reliability Works") added to both screens.
- **PlanVisitScreen Start-a-Run Prompt (2026-03-24)**: Confirmation step (Step 4) now shows "Want others to join you?" + "Start a Run" button. Calls `startOrJoinRun` (same merge rule as RunDetailsScreen), then navigates to RunDetailsScreen. Wizard state reset after navigation.
- **Messaging & Moderation Hardening (2026-03-24)**: `isNotSuspended()` helper added to `runcheck-backend/firestore.rules` — applied to `allow create` on DM messages and run chat messages (server-enforced suspension). `suspendUser.ts` now writes to `adminActions/{autoId}` after suspension. `AdminReportsScreen` shows "Currently Suspended · Lvl N" / "Repeat Offender · Lvl N" badge on report cards for subjects with suspension history (zero extra reads — resolved from already-loaded user docs).
- **Phase 2 push notifications (2026-03-25, not yet deployed)**: `notifyFollowersRunCreated` (Firestore onCreate on `runs/{runId}` — notifies gym followers when a new run is created; 24h cooldown per run per follower) and `notifyFollowersPresenceMilestone` (scheduled every 5 min — notifies when gym presence count hits stable thresholds 3/6; 3h cooldown per gym per follower). `onGymPresenceUpdated` Firestore trigger stamps pending milestone markers on gym docs. New `gyms/{gymId}` fields: `presenceMilestonePending`, `presenceMilestoneThreshold`, `presenceMilestoneReachedAt`. **Require deploy before going live.**
- **ViewRunsScreen UI polish (2026-03-25)**: Blinking animated status dots on gym cards, "Follow gyms for live run updates" banner (contextual prompt for Phase 2 push), and status color tier updates for activity level display.
- **Reliability formula repair (2026-03-25)**: `scripts/repairReliabilityScores.js` — one-time admin repair script. Recalculates `reliability.score` from counters using the canonical formula (`totalAttended < 3 → 100`; else `clamp(100 − 20·noShows − 8·lateCancels, 0, 100)`). Dry-run by default; commit with `DRY_RUN=false`. Fixes scores written before the `totalAttended < 3` lock existed in backend.
- **`utils/sanitize.js` (2026-03-25)**: New centralized input sanitizer module. Pure, silent, O(n). Functions: `sanitizeUsername` ([a-z0-9._], max 20), `sanitizeName` (printable name chars, max 40), `sanitizePersonName` (max 30), `sanitizeSearch` ([a-zA-Z0-9 '.-&], max 50), `sanitizeFreeText` (strip control chars only, default max 500), `sanitizeAddress` (printable address chars, max 200), `sanitizeState` ([A-Z], max 2).
- **storagePath vs finalStoragePath root cause resolved (2026-03-27)**: `finalStoragePath` is written to every clip doc as a reserved destination path, but the file only exists there if Cloud Run processor succeeded. `storagePath` is always updated to whichever file actually exists. A prior session incorrectly changed 7 client files to prefer `finalStoragePath || storagePath` — reverted across all 7 call sites back to `storagePath`. Root: `expireClips` was deleting raw files for clips where raw was the only playback copy. Fixed with a one-line guard in `expireClips.ts`: if `data.storagePath === rawPath`, skip deletion and log a warning instead. ⚠️ Deploy required: `firebase deploy --only functions:expireClips`.
- **Permanently broken clip (2026-03-27)**: `gymClips/presence_cowboys-fit-pflugerville_SMQUyWWMUOZpBHYN7pWlt15b6CB3` — processor failed → storagePath set to raw path → expireClips deleted the raw before today's guard → both paths dead. Manual fix required: set `isHidden = true` on that Firestore doc in Firebase Console.
- **Firestore composite index fix (2026-03-27)**: AdminAllClipsScreen "Hidden" and "User-Deleted" tabs were throwing `FirebaseError: query requires an index`. Added two missing composite indexes to `firestore.indexes.json`: `isHidden+hiddenAt` and `isDeletedByUser+deletedAt`. ⚠️ Deploy required: `firebase deploy --only firestore:indexes`.
- **Age validation + COPPA hardening (2026-03-27)**: `SignupScreen` — age field strips non-digits, parseInt kills leading zeros, clamps at 100, `isAgeValid` gate (13–100) blocks form submit. Hint text "Must be 13 or older". Error: "You must be at least 13 years old to create an account." `VerifyEmailScreen` writes age as `parseInt(age, 10)` (integer) for future age-group queries (`where('age', '>=', 18)` etc).
- **OnboardingHomeCourtScreen overhaul (2026-03-27)**: Added "Use My Location" tap-only button (never auto-requested on mount) — calls `getCurrentLocation()` which handles permission internally; shows loading spinner + `'Location active'` state + error text. Added search bar to filter gyms by name. Added `formatDistance()` helper for miles display on gym rows. `filteredGyms` useMemo sorts by distance when location is active, then applies search filter. "Nearby gyms" label appears as `ListHeaderComponent` when location is active. Distance label appears on each gym row. Subtitle updated to "Pick the gym you play at most. We'll show runs near you." Request-gym row added above the list: low visual weight (near-transparent bg, barely-there border), tappable, "Your gym not listed? You can request it anytime." + "No need to do this now."
- **RequestGym navigation fix (2026-03-27)**: `navigation.navigate('RequestGym')` from onboarding was failing because `RequestGym` was only registered inside nested tab stacks. Fixed by adding `<Stack.Screen name="RequestGym">` to the root stack in `App.js` (between `OnboardingFinish` and `Main`).
- **ProfileStack back-button fix (2026-03-27)**: `ProfileStack`'s `Stack.Navigator` was missing `screenOptions={themeStyles.NAV_HEADER}`. All other stacks had it. Without it, the header tint was not themed in dark mode — the `< Profile` back-button text was invisible (black on dark bg). Added `screenOptions={themeStyles.NAV_HEADER}` to `ProfileStack`. `ProfileMain` retains `headerShown: false`.
- **Hooks InteractionManager deferred subscriptions (2026-03-26)**: All major hooks refactored to use `InteractionManager.runAfterInteractions()`. Fixes "frozen skeleton until touch" — snapshot callbacks were competing with navigation animations for the JS thread. Affected: `useGym`, `useGymPresences`, `useGymRuns` (both subscriptions), `useGyms`, `useLivePresenceMap`. Full JSDoc documentation added to all hooks. `useLivePresenceMap` is now a standalone file with canonical implementation (status=active, limit 200, client-side expiresAt guard, dedup by odId per gym).

## Planned: Verified Run History (post-launch, not a launch blocker)

Captures proof that a run happened and how many people showed up. Designed 2026-03-17.

- **Phase 1 (approved, post-TestFlight):** Add two new fields to `runs/{runId}` — `joinedCount` (total unique users who ever joined, never decremented) and `peakParticipantCount` (high-water mark of `participantCount`). Both written inside the existing `joinRun` transaction in `runService.js`, guarded by the same `!alreadyJoined` check that protects `participantCount`. ~5 lines, one file, no backend deploy, no UI changes. Silently accumulates data for future use.
- **Phase 2 (deferred — post-launch, stable user base):** Formal run completion: `status: 'completed'`, `completedAt`, `actualAttendees[]`, `attendedCount`, `durationMinutes`. Triggered in `leaveRun` when `participantCount → 0`. Also needs a `completeStaleRuns` Cloud Function for abandoned runs. Medium risk — changes run lifecycle state irreversibly.
- **Phase 3 (deferred — growth phase):** Analytics and aggregation. Per-user "Runs Attended" history, turnout estimates, `runHistory` collection, gym trust signals.

---

## Files Modified Recently (2026-03-27 — Bug Fixes, Onboarding Overhaul, COPPA Hardening)

| File | What changed |
|------|-------------|
| `runcheck-backend/firestore.indexes.json` | Added two missing composite indexes: `isHidden+hiddenAt` (DESCENDING) and `isDeletedByUser+deletedAt` (DESCENDING) on `gymClips`. Fixes AdminAllClipsScreen "Hidden" and "User-Deleted" tab query errors. Deploy: `firebase deploy --only firestore:indexes`. |
| `runcheck-backend/functions/src/expireClips.ts` | Added `storagePath?: string` to `ClipDocument` interface. Added safety guard: if `data.storagePath === rawPath`, skip raw file deletion and log a warning — prevents permanently unplayable clips where raw is the only playback copy (ready_raw or processor-failed clips). Deploy: `firebase deploy --only functions:expireClips`. |
| `screens/SignupScreen.js` | Age field strips non-digits, parseInt kills leading zeros, clamps at 100. `isAgeValid` computed (13–100) gates form submit button. Hint text "Must be 13 or older" shown below field. Error message updated for under-13 users. |
| `screens/VerifyEmailScreen.js` | Firestore write: `age: parseInt(age, 10)` — stores as integer instead of string. Enables future age-group queries. |
| `screens/OnboardingHomeCourtScreen.js` | Major overhaul: added `TextInput` search bar, "Use My Location" tap-only button (`handleUseLocation` → `getCurrentLocation()`), `locationLoading`/`locationError` state, `userLocation` state, `formatDistance()` helper, `filteredGyms` useMemo (distance-sort + name filter), distance labels on gym rows, "Nearby gyms" `ListHeaderComponent`, request-gym row (low visual weight, tappable, above list), subtitle update, `keyboardShouldPersistTaps="handled"`. |
| `App.js` | (1) Added `<Stack.Screen name="RequestGym" component={RequestGymScreen} options={{ headerShown: true, title: 'Request a Gym' }} />` to root stack between `OnboardingFinish` and `Main` — fixes navigation error when tapping request-gym from onboarding. (2) Added `screenOptions={themeStyles.NAV_HEADER}` to `ProfileStack`'s `Stack.Navigator` — fixes invisible back-button on Settings screen in dark mode. |

**Root causes discovered:**
- `finalStoragePath` vs `storagePath`: `finalStoragePath` is set at finalization as a destination path but the file may not be there (processor failure). `storagePath` is always the authoritative playback field. 7 client files were reverted from `finalStoragePath || storagePath` back to `storagePath`.
- `expireClips` raw deletion: function did not check whether `storagePath === rawStoragePath` before deleting, causing permanently broken clips when processor failed. Patched.

**⚠️ Manual action required:** Set `gymClips/presence_cowboys-fit-pflugerville_SMQUyWWMUOZpBHYN7pWlt15b6CB3.isHidden = true` in Firebase Console. Both storage paths for this clip are deleted and it cannot be repaired.

**⚠️ Deploy required:**
- `firebase deploy --only firestore:indexes` — for `isHidden+hiddenAt` and `isDeletedByUser+deletedAt` indexes
- `firebase deploy --only functions:expireClips` — for raw-file deletion safety guard

---

## Files Modified Recently (2026-03-26 — Hooks InteractionManager Refactor + Sanitize Utility)

| File | What changed |
|------|-------------|
| `hooks/useGym.js` | Wrapped Firestore subscription in `InteractionManager.runAfterInteractions()`. Added full JSDoc. Prevents JS thread contention with navigation animations. |
| `hooks/useGymPresences.js` | Same InteractionManager deferral pattern. Added full JSDoc. |
| `hooks/useGymRuns.js` | Both subscriptions (gym runs + user participants) deferred via InteractionManager. Added full JSDoc. |
| `hooks/useGyms.js` | InteractionManager deferral. `getActivityLevel` wrapped in `useCallback`. Added full JSDoc. |
| `hooks/useLivePresenceMap.js` | **Extracted into standalone file.** Full implementation: `status==active`, `limit(200)`, client-side `expiresAt` guard, dedup by `odId` per gym. InteractionManager deferred. Added full JSDoc with usage example. |
| `screens/HomeScreen.js` | Updated to use standalone `useLivePresenceMap` import cleanly. Minor adjustments post-hook refactor. |
| `utils/sanitize.js` | **NEW.** Centralized input sanitizer for all TextInput fields. Seven functions covering username, display name, person name, search, free text, address, and US state. |

**Root cause fixed (frozen skeleton):** Before this refactor, `onSnapshot` callbacks fired while React Navigation held the JS thread for animation work. State updates queued up but couldn't render until the animation completed, causing the loading skeleton to appear frozen until the user touched the screen. Deferring via `InteractionManager` lets the animation finish first, then the subscription opens — first data arrives to a ready UI.

---

## Files Modified Recently (2026-03-25 — ViewRunsScreen Polish + Reliability Repair + Sanitize Utility)

| File | What changed |
|------|-------------|
| `screens/ViewRunsScreen.js` | UI polish pass: (1) Blinking animated status dots on gym cards using `Animated.loop` — visual live indicator. (2) Follow banner added below the gym list ("Follow gyms for live run updates") — contextual prompt for Phase 2 push notifications. (3) Status color tiers updated for activity level display. |
| `scripts/repairReliabilityScores.js` | **NEW** one-time admin repair script. Reads all `users` docs, recalculates `reliability.score` from stored counters (`totalAttended`, `totalNoShow`, `totalLateCancelled`) using the canonical formula. Dry-run by default. Required to fix users whose scores were written by older backend code (before the `totalAttended < 3` lock existed). |
| `utils/sanitize.js` | **NEW** centralized input sanitizer. Seven pure sanitizer functions (see "Currently Working" above). |
| `services/runService.js` | Minor adjustments (exact change not documented; likely related to follow/notification context or sanitize integration). |

---

## Files Modified Recently (2026-03-25 — Phase 2 V2 Live Activity Push Notifications)

| File | What changed |
|------|-------------|
| `runcheck-backend/functions/src/notifyFollowersPresenceMilestone.ts` | New file. Two exports: (1) `onGymPresenceUpdated` — Firestore `onDocumentUpdated('gyms/{gymId}')` trigger that stamps a pending milestone marker when `currentPresenceCount` crosses 3 or 6 upward. (2) `notifyFollowersPresenceMilestone` — scheduled every 5 min, finds gyms with stable 5-min milestones and notifies followers with 3-hour cooldown. |
| `runcheck-backend/functions/src/index.ts` | Exported `onGymPresenceUpdated` and `notifyFollowersPresenceMilestone`. Updated Phase 2 comment block. |
| `Runcheck/BACKEND_MEMORY.md` | Added both new functions to Phase 2 Push Notification Functions table. Documented new `gyms/{gymId}` fields: `presenceMilestonePending`, `presenceMilestoneThreshold`, `presenceMilestoneReachedAt`. Updated V3 deferred list. |

**✅ Deployed 2026-03-26** — All Phase 2 functions live: `onGymPresenceUpdated`, `notifyFollowersPresenceMilestone`, `notifyFollowersRunCreated`, `detectRunNoShows`, `onScheduleWrite` and all previously pending functions deployed and confirmed.

---

## Files Modified Recently (2026-03-24 — Competitive Meter Skill Snapshot Fix)

| File | What changed |
|------|-------------|
| `services/runService.js` | `fetchUserDisplayInfo` now also reads `skillLevel` from `users/{uid}` and includes it in the returned object (falls back to `null`). `joinRun` (internal) now writes `skillLevel: userInfo.skillLevel \|\| null` onto the `runParticipants` doc at join time. No changes to function signatures — `startOrJoinRun` and `joinExistingRun` pass `userInfo` through as before. |
| `screens/RunDetailsScreen.js` | `getCompetitiveBars()` updated: now prefers `participant.skillLevel` directly (V2 snapshot path) before falling back to presence cross-reference (V1 path for older docs), then to `runLevel`. The computation chain: `participant.skillLevel` → `presenceByUid[participant.userId]?.skillLevel` → excluded. The `contributions.length >= 2` threshold and `runLevel` final fallback are unchanged. |
| `runcheck-backend/BACKEND_MEMORY.md` | `runParticipants` schema updated to document `skillLevel` and `gymName` fields. Added backward-compatibility note for older docs without the field. |

**Root cause fixed:** Future runs showed "Balanced" because the meter only had skill data for checked-in players. For runs days away, nobody is checked in, so `contributions.length < 2` and the meter fell back to creator-set `runLevel`. The fix snapshots each player's `skillLevel` at RSVP time so the meter reflects actual player composition regardless of check-in state.

**V1 limitation:** Existing participant docs written before this session have no `skillLevel` field. Those runs will continue to use the presence/runLevel fallback until those participants leave and rejoin. New joins from this point forward will snapshot correctly.

---

## Files Modified Recently (2026-03-24 — AdminReportsScreen Message Report Polish)

| File | What changed |
|------|-------------|
| `screens/AdminReportsScreen.js` | (1) `formatRelativeTime` now handles plain `{ seconds, nanoseconds }` objects (Firestore Timestamps serialized through callable functions) in addition to proper Timestamp instances and numeric values. Falls back to `'Unknown'` for any value that still produces an invalid Date — fixes "Sent: Invalid Date" on message report cards. (2) Target info row (`link-outline`) is now skipped for `type === 'message'` — the blue quoted excerpt already shows the message text, so the `Message: "..."` label was a duplicate. (3) `messageExcerpt.marginBottom` bumped from `6` → `SPACING.sm` for a small breathing room improvement before the Sender/Received by/Sent meta rows. |

---

## Files Modified Recently (2026-03-24 — Report + Block in One Flow + More Admin Context)

| File | What changed |
|------|-------------|
| `components/ReportModal.js` | Added `blockSenderId` optional prop. Added `alsoBlock` boolean state (default false), reset in `resetForm`. Imported `auth` from firebase config and `blockUser` from dmService. After successful `submitReport`, if `alsoBlock && blockSenderId`, calls `blockUser(currentUid, blockSenderId)` best-effort (errors swallowed). Success alert text varies: mentions block if block was performed. Added "Also block this user" toggle row (shown only for `type === 'message' && blockSenderId`) with sub-label "They won't be able to message you". Styles: `alsoBlockRow`, `alsoBlockLabel`, `alsoBlockSub`. |
| `screens/DMConversationScreen.js` | Message-level `<ReportModal>` now passes `blockSenderId={reportTarget?.senderId}`. |
| `screens/AdminReportsScreen.js` | "Owner:" label now shows "Sender:" for `type === 'message'` reports. Added two new meta rows for message reports only: "Received by:" showing `report.reporterName` (already on doc — zero extra reads), "Sent:" showing `formatRelativeTime(report.messageContext.messageSentAt)` (already on doc — zero extra reads). |

**User flow (Report + Block):** Long-press message → Report modal opens with message preview → choose reason → optionally toggle "Also block this user" → Submit → report created → block applied if toggled → single success alert.

**Admin additions (zero extra Firestore reads):** Message report cards now show Sender name (via existing ownerNames lookup, relabelled), Received by (reporterName already on doc), Sent time (messageSentAt already in messageContext on doc).

**V1 limitations:** `blockUser` is idempotent (`arrayUnion`), so toggling "Also block" when already blocked is a no-op. Toggle is always shown for message reports regardless of current block state. No undo from inside the report modal (user can unblock from UserProfileScreen).

---

## Files Modified Recently (2026-03-24 — Messaging & Moderation Hardening Pass)

| File | What changed |
|------|-------------|
| `runcheck-backend/firestore.rules` | Added `isNotSuspended()` helper function (reads `users/{uid}.isSuspended` + `suspensionEndsAt` vs `request.time`). Applied to `allow create` on DM messages (`conversations/{id}/messages`) and run chat messages (`runs/{id}/messages`). Server-enforced: suspended users cannot write messages even if they bypass the client. |
| `services/dmService.js` | `openOrCreateConversation` slow path (new conversation creation) now reads both user docs in parallel (`Promise.all`). Added bidirectional block guard: throws `'Cannot start a conversation with this user.'` if either party has blocked the other. Existing conversations are unaffected (message send guard already handles that). |
| `runcheck-backend/functions/src/removeDmMessage.ts` | Added `logger` import. Added fire-and-forget write to `adminActions/{autoId}` after successful message removal. Schema: `{ actionType: 'remove_message', adminId, targetId (messageId), conversationId, reason, reportId, timestamp }`. |
| `runcheck-backend/functions/src/suspendUser.ts` | Added `logger` import. Added fire-and-forget write to `adminActions/{autoId}` after successful suspension. Schema: `{ actionType: 'suspend_user', adminId, targetId (userId), reason, reportId, suspensionLevel, durationDays, timestamp }`. |

**Mute indicator in MessagesScreen (item 2)**: Already implemented in the prior session (swipe-to-mute). A small `notifications-off` icon (size 13, muted color) appears in `rowTopRight` next to the timestamp when `item.mutedBy[uid] === true`.

**New Firestore collection**: `adminActions/{autoId}` — lightweight audit log. Written only by Cloud Functions (Admin SDK). No client read/write rules needed (no client access). Read via Firebase Console.

**V1 limitations**:
- `isNotSuspended()` adds 1 extra Firestore read per message create rule evaluation (acceptable — within 5-get rule limit).
- Block guard in `openOrCreateConversation` is client-side only — a malicious client could bypass it by calling `setDoc` directly. The Firestore rules do not yet enforce block state on conversation creation (would require reading both users' docs in rules, expensive).
- `adminActions` has no UI — read-only via Firebase Console for now.
- `adminActions` does not cover `unsuspendUser` or `hideClip` yet.

---

## Files Modified Recently (2026-03-24 — V1 DM Conversation Mute)

| File | What changed |
|------|-------------|
| `runcheck-backend/functions/src/onDmMessageCreated.ts` | Added mute guard after recipient is identified. Reads `conversationData.mutedBy?.[recipientUid]` — zero extra Firestore reads (conversation doc already loaded). Returns early (skips notification) if muted. |
| `services/dmService.js` | Added `deleteField` to firebase/firestore imports. Added three new functions: `getConversationMuteState(conversationId, uid)` (one-shot getDoc, returns boolean), `muteConversation(conversationId, uid)` (dot-notation set `mutedBy.{uid}: true`), `unmuteConversation(conversationId, uid)` (dot-notation deleteField). |
| `screens/DMConversationScreen.js` | Imported the three new mute functions. Added `isMuted` state (initialized via `getConversationMuteState` on mount) and `muteLoading` state. Added `handleToggleMute` callback (optimistic toggle with revert on error). Added mute bell icon to header alongside existing flag button. `headerRight` style changed from single-icon fixed-width to `flexDirection: row` with two icons. |

**Data model**: New optional field `mutedBy: { [uid: string]: true }` on `conversations/{conversationId}`. Written with dot-notation `updateDoc` so each user's key is independent (same pattern as `lastSeenAt.{uid}`). Cleared with `deleteField()` on unmute. Field is absent on docs where nobody has muted.

**User flow**: Open a conversation → tap the bell icon in the header → icon toggles to filled bell-off (primary color) = muted. Tap again to unmute (icon returns to outline). Mute persists indefinitely across app sessions. Messages still arrive and are visible. Only push notifications are suppressed.

**Notification behavior after muting**: `onDmMessageCreated` checks `mutedBy[recipientUid]` before the cooldown check, before reading the push token. If `true`, the function logs and returns early — Expo Push API is never called. Cooldown is also not set, so the first message after unmuting is not penalized by the cooldown window.

**V1 limitations**: No mute indicator in the MessagesScreen inbox (conversation list). No mute expiry (indefinite). No "you have muted this conversation" banner in the chat screen (icon state is the only signal). Inbox could show a muted bell in a future session — the `mutedBy` data is already present on every conversation doc surfaced by `subscribeToConversations`.

---

## Files Modified Recently (2026-03-24 — V1 Admin DM Message Enforcement)

| File | What changed |
|------|-------------|
| `runcheck-backend/functions/src/moderationHelpers.ts` | Added `enforceRemoveDmMessage(db, conversationId, messageId, actor, reason)` helper. Sets `isRemoved: true` + `removedBy`, `removedAt`, `removedReason` on `conversations/{conversationId}/messages/{messageId}`. Idempotent — returns `{ alreadyDone: true }` if already removed. Message doc is NOT deleted (audit trail preserved). |
| `runcheck-backend/functions/src/removeDmMessage.ts` | New admin-only `onCall` Cloud Function. Accepts `{ conversationId, messageId, reason?, reportId? }`. Auth check → admin check (`isAdmin === true`) → input validation → calls `enforceRemoveDmMessage` → calls `resolveRelatedReport` if `reportId` provided. Returns `{ conversationId, messageId, removed: true }` or `{ alreadyRemoved: true }`. |
| `runcheck-backend/functions/src/index.ts` | Added `export { removeDmMessage } from './removeDmMessage'`. |
| `screens/DMConversationScreen.js` | `MessageBubble` now has an early-return path for `message.isRemoved === true`. Removed messages render a pill-style placeholder: "This message was removed" (italic, muted, border). No long-press handler on removed messages. Avatar spacer preserved for layout. Added `removedBubble` and `removedBubbleText` to `dmStyles`. |
| `screens/AdminReportsScreen.js` | Added `removingDmMessage` state. Added `handleRemoveDmMessage` callback — reads `conversationId` + `messageId` from `report.messageContext`, shows confirm Alert, calls `callFunction('removeDmMessage', payload)`. Added "Remove Message" action button in expanded panel for `report.type === 'message'` reports. Added `removeDmMessageBtn` and `removeDmMessageBtnText` styles (same red palette as other enforcement buttons). |

**Enforcement approach**: Soft-delete only. `isRemoved: true` on the message subcollection doc. Real-time `onSnapshot` listener propagates the change instantly to both participants who see the placeholder immediately. Hard delete intentionally out of scope for V1 (audit trail needed).

**Admin flow**: Open message report card → expand Actions → (optional) add note → tap "Remove Message" → confirm → both participants see placeholder within seconds. Report is auto-resolved.

**Suspend User button** also appears on message reports because `submitReport.ts` sets `targetOwnerId` to the sender's UID. So admins can remove the message AND suspend the sender independently.

---

## Files Modified Recently (2026-03-24 — V1 Message-Level DM Reporting)

| File | What changed |
|------|-------------|
| `runcheck-backend/functions/src/submitReport.ts` | Added `'message'` to `VALID_TYPES`. Added `MessageContext` interface `{ conversationId, messageId, senderId, messageText, messageSentAt? }`. Extended `SubmitReportData` with optional `messageContext?`. Extended `ReportDocument` with optional `messageContext?`. Added section 2e to validate and sanitize messageContext (required for type='message'). Added 'message' case to targetOwnerId resolution using `messageContext.senderId`. Stored validated messageContext on the report doc via spread. |
| `components/ReportModal.js` | Added optional `messageContext` prop. Forwarded `messageContext` in `submitReport` payload when present. Added `type === 'message'` to `typeLabel` switch. Added italicised message preview box between subtitle and reason selector when `messageContext.messageText` is present. Added `messagePreview` and `messagePreviewText` styles. |
| `screens/DMConversationScreen.js` | `MessageBubble` now accepts `onLongPress` prop — wraps the bubble `View` in a `TouchableOpacity` with `delayLongPress={400}`, disabled when no handler. `renderMessage` passes `onLongPress` for non-own messages that sets `reportTarget` state. Added `reportTarget` state `{ messageId, senderId, messageText, messageSentAt }`. Added second `<ReportModal>` bound to `reportTarget` with `type="message"` and full `messageContext` object. |
| `screens/AdminReportsScreen.js` | Added `message: { label: 'Message', icon: 'chatbubble-outline', color: '#0EA5E9' }` to `TYPE_CONFIG`. `resolveLabels` now handles `type === 'message'` by deriving label from `messageContext.messageText` (no extra Firestore reads). Report cards show a blue "quoted message" excerpt block for message-type reports. Added `messageExcerpt` and `messageExcerptText` styles. |

**Schema addition**: `reports/{id}` now has optional `messageContext: { conversationId, messageId, senderId, messageText, messageSentAt }` — only present for `type === 'message'` reports. Existing reports are unaffected.

**UX flow**: Long-press other user's message → `ReportModal` opens with message preview → user picks reason → submits → report lands in admin queue with full message context.

**Admin flow**: Message reports appear with cyan "Message" type badge + quoted message text visible in the card.

**V1 limitations**: No auto-moderation threshold for messages. No delete-message action from admin (out of scope). Dedup is per-user per-message (by messageId as targetId), so the same message can only be reported once per user.

---

## Files Modified Recently (2026-03-24 — V1 User Blocking for DMs)

| File | What changed |
|------|-------------|
| `services/dmService.js` | Added `arrayUnion`, `arrayRemove` to Firestore imports. `sendDMMessage` now accepts optional `recipientId` param and has a block guard: reads `users/{recipientId}.blockedUsers` and throws if sender is listed (generic error — no "you're blocked" signal). Added `blockUser(currentUid, targetUid)` and `unblockUser(currentUid, targetUid)` exports using `arrayUnion`/`arrayRemove` on `users/{currentUid}.blockedUsers`. |
| `screens/DMConversationScreen.js` | `handleSend` now passes `recipientId: otherUserId` to `sendDMMessage`. |
| `screens/UserProfileScreen.js` | Imported `blockUser`, `unblockUser` from dmService. Added `isBlocked` and `blocking` state. `currentUserSnap` read now also sets `isBlocked` from `blockedUsers` array. Added `handleBlock` (Alert confirm → `blockUser`) and `handleUnblock` (Alert confirm → `unblockUser`). Friend and Message buttons hidden when `isBlocked`. Added Block/Unblock button with `ban-outline` icon below Message button. Added `blockButton`, `blockButtonActive`, `blockButtonText`, `blockButtonTextActive` styles. |

**Data model**: `blockedUsers: string[]` on `users/{uid}` written by the blocking user. Matches the `friends`/`followedGyms` array pattern. Firestore rules need `blockedUsers` array write access for `users/{uid}` where `request.auth.uid == uid` (already covered by the existing "write own doc" rule).

---

## Files Modified Recently (2026-03-24 — Repeat-Offender Badge in AdminReportsScreen)

| File | What changed |
|------|-------------|
| `screens/AdminReportsScreen.js` | Added `suspensionLevels` state map `{ [uid]: { level, active } }`. `resolveLabels` now extracts `suspensionLevel` and `isSuspended` from the user docs it already reads (no extra Firestore reads). Report cards show a small inline badge: red "Currently Suspended · Lvl N" if active, amber "Repeat Offender · Lvl N" for prior history. Hidden for first-time subjects. |

---

## Files Modified Recently (2026-03-24 — Phase 1 Moderation Safety Fixes)

| File | What changed |
|------|-------------|
| `screens/DMConversationScreen.js` | Added `ReportModal` import and `showReport` state. Replaced header right spacer with a flag `TouchableOpacity` that opens `ReportModal` (type="player", targetId=otherUserId). Added `<ReportModal>` at bottom of render. |
| `services/dmService.js` | `sendDMMessage` now reads the sender's user doc before writing and throws if `isSuspended === true` and suspension hasn't expired. Same pattern as `presenceService.checkIn`. |
| `functions/src/submitReport.ts` *(backend)* | Auto-mod threshold query now adds `.where('status', '==', 'pending')` — only pending reports count toward the threshold. Resolved/reviewed reports no longer re-trigger enforcement. |
| `functions/src/clipFunctions.ts` *(backend)* | Suspension check in `createClipSession` confirmed already implemented (lines 454–466). No change required. |

---

## Files Modified Recently (2026-03-22 late / 2026-03-23 — Username system)

| File | What changed |
|------|-------------|
| `screens/SignupScreen.js` | Added `username` field (collected alongside first/last name). Added `USERNAME_REGEX`, `EMAIL_REGEX`, and `DOMAIN_TYPOS` typo detection. Firestore profile write moved out of this screen entirely — SignupScreen now only creates the Auth account and sends the verification email, then passes `signupData` to VerifyEmailScreen as route params. Password requirement checklist UI added. |
| `screens/VerifyEmailScreen.js` | On "I Verified, Continue": if `signupData` is present (new signup), writes the Firestore profile + reserves `usernames/{usernameLower}` atomically in a transaction. Idempotent: skips reservation if the doc already belongs to this uid. If returning user without `username` field, routes to `ClaimUsername`. |
| `screens/ClaimUsernameScreen.js` | **NEW** — Migration gate for existing accounts that pre-date the username system. Validates format via `USERNAME_REGEX`. Firestore transaction: reserve `usernames/{usernameLower}` + set-merge `users/{uid}` with username fields. Routes to Main if `onboardingCompleted`, else OnboardingWelcome. Uses `set({ merge: true })` to handle edge case where the user doc was never fully written. |

---

## Files Modified Recently (2026-03-22 session — Run Level Phase 1, Run Chat expiry + unread, EditProfileScreen)

| File | What changed |
|------|-------------|
| `screens/RunDetailsScreen.js` | Run level picker (Casual / Mixed / Competitive) added to Start-a-Run modal. `runLevel` state defaults to `'mixed'`, reset on modal close. Badge shown on run cards: Casual = green, Competitive = red, Mixed = hidden (neutral/default). Passes `runLevel` to `startOrJoinRun`. |
| `screens/ViewRunsScreen.js` | Run level filter added to the filter bottom sheet (Any / Casual / Mixed / Competitive). `runLevelFilter` state. Client-side filter treats absent `runLevel` as `'mixed'`. Active filter chip shown below the Filter button. `activeFilterCount` includes `runLevelFilter`. |
| `services/runService.js` | `startOrJoinRun` now accepts `runLevel = 'mixed'` parameter. Writes `runLevel` field on new run doc creation only (existing runs keep their level). Imports `RUN_CHAT_EXPIRY_MS` from `runChatService.js` and writes `chatExpiresAt = startTime + 4h` on run creation. |
| `services/runChatService.js` | Added `markRunChatSeen(runId, uid)` — writes `lastReadAt: serverTimestamp()` to `runParticipants/{runId}_{uid}`. `sendRunMessage` now also stamps `lastMessageAt: serverTimestamp()` on `runs/{runId}` (fire-and-forget). Exported `RUN_CHAT_EXPIRY_MS = 4 * 60 * 60 * 1000`. |
| `screens/RunChatScreen.js` | Chat expiry support: computes `isChatExpired` from `startTime + RUN_CHAT_EXPIRY_MS`. Expired chat shows a read-only "This run chat has ended" banner replacing the input bar. Calls `markRunChatSeen(runId, uid)` on mount to clear unread badge. |
| `hooks/useMyRunChats.js` | Fetches `chatExpiresAt` and `lastMessageAt` from run docs + `lastReadAt` from participant docs. Computes `isUnread = lastMessageAt > lastReadAt`. Filters out expired chats. Returns `runChatUnreadCount` (count of chats where `isUnread === true`). |
| `screens/HomeScreen.js` | `totalUnreadCount = dmUnreadCount + runChatUnreadCount` — Messages header badge now reflects both DM and Run Chat unreads. |
| `screens/EditProfileScreen.js` | **NEW** — Account Info screen. Editable fields: Display Name (Firestore + Firebase Auth `displayName`) and Skill Level (`'Casual' \| 'Competitive' \| 'Either'`). Read-only: Email (contact support note), Username (not changeable). Accessible via ProfileStack → Settings → Account Info. |
| `screens/SettingsScreen.js` | Added "Account Info" settings row that navigates to `EditProfile`. |
| `App.js` | Registered `EditProfileScreen` as `EditProfile` in ProfileStack. |

---

## Session History Summary (pre-2026-03-22)

Compressed for brevity. Full per-file tables live in the `docs/session-handoffs/` folder. All features below are reflected in "Currently Working" above.

**2026-03-21** — DM System, Messages Inbox, OnboardingRegion. New: `dmService.js`, `useConversations`, `useMyRunChats`, `MessagesScreen`, `DMConversationScreen`, `OnboardingRegionScreen`. Unread badge on HomeScreen + ProfileScreen. `subscribeToAllUserRuns` added to `runService.js`. DM notification tap handler wired in `App.js`. VerifyEmailScreen now routes to `OnboardingRegion` first.

**2026-03-20 (session 2)** — Run Chat MVP + ViewRunsScreen loading fix. New: `runChatService.js`, `RunChatScreen`. Chat button on RunDetailsScreen gated to joined participants. Full-screen loading spinner removed from ViewRunsScreen (now inline). `runcheck-backend/firestore.rules` updated with Run Chat rules (deployed 2026-03-25, verified 2026-03-26).

**2026-03-20 (session 1)** — Phase 1 Push Notifications + Open Run flow + OTA diagnosis. New: `notificationHelpers.ts`, `notifyRunStartingSoon`, `onRunParticipantJoined`, `onParticipantCountMilestone` (all deployed). `registerPushToken()` wired in `App.js`. `eas.json` production profile got `"channel": "production"` (takes effect on next build). Open Run quick-action streamlined to skip intermediate picker.

**2026-03-19 (session 2)** — Feature drop: Start a Run prominence, gym hours/website link, filter sheet, Premium UI. `HomeScreen` got "Start a Group Run" card and contextual check-in card. `ViewRunsScreen` filter upgraded to bottom sheet. `PremiumScreen` redesigned. `CreatePrivateRunScreen` completed as UI-only teaser (no Firestore writes, 5% platform fee).

**2026-03-19 (session 1)** — Proximity check-in, AdminAllClips, haptics, location utils. New: `useProximityCheckIn`, `locationUtils.js`, `haptics.js`, `AdminAllClipsScreen`, `CreatePrivateRunScreen`. Haptic feedback integrated in CheckIn, RecordClip, TrimClip. `addGym` Cloud Function deprecated.

**2026-03-18** — Backend deploy: `checkIn.ts` + `createRun.ts` suspension guards deployed. `utils/notifications.js` added (`registerPushToken`). Dev GPS bypass coordinates corrected.

**2026-03-17 (session 2)** — Suspension enforcement client-side + debug log cleanup + Run Activation. `presenceService.checkIn` gained suspension guard. `__DEV__` gating applied to all production-visible logs in HomeScreen + RunDetailsScreen + ProfileScreen. Run Activation: `runHereCountMap` + `sortedRuns` useMemos in RunDetailsScreen (live runs sort above planned, "N here · M going" display).

**2026-03-17 (session 1)** — Clip Tagging V1 + approval flow + posting audit hardening. `finalizeClipUpload` validates up to 5 tagged players. `addClipToProfile.ts` Cloud Function owns taggedPlayers writes (Firestore rules block client writes). `useTaggedClips` hook, "Tagged In" + "Featured In" on ProfileScreen + UserProfileScreen. Per-session duplicate guard hardened for soft-deleted clips.

**2026-03-16** — Full moderation system + admin dashboards. `moderationHelpers.ts` (single source of truth), 6 admin Cloud Functions deployed, 5 admin screens built. Auto-moderation thresholds: clip→3 reports, run→3 reports, player→5 reports. Escalating suspension (1/3/7/30/365 days).

**2026-03-15 (sessions)** — Reporting system, gym requests, gym image migration, rank system refactor, gym system Firestore-as-source-of-truth. `submitReport` Cloud Function + `ReportModal`. `submitGymRequest` Cloud Function + `RequestGymScreen` + `MyGymRequestsScreen`. `config/ranks.js`, `config/points.js`, `config/perks.js` extracted. Fitness Connection migrated to Firebase Storage. Veterans Park + Cowboys Fit added.

**2026-03-14** — Weekly Winners (top 3) + automated `weeklyReset` Cloud Function (Monday 00:05 CT). `weeklyWinnersService.js`, `useWeeklyWinners`, LeaderboardScreen "Last Week's Winners" card, HomeScreen 24h celebration card.

**2026-03-13** — UI polish pass (LinearGradient headers), "Runs Being Planned" section on PlanVisitScreen, Community Activity filter (allowlist: `started a run at`, `clip_posted`), RC-008 stale presence count fix in PlanVisitScreen. Review system (RC-007): `reviewService.js`, eligibility two-signal model, "Verified Run" badge, run completion signals (`runGyms`, `gymVisits` arrays on user doc).

**2026-03-12** — Start a Run / Join a Run MVP. `runService.js` and `useGymRuns.js` created. ±60-min merge rule, compound `runParticipants/{runId}_{userId}` key.

**Pre-2026-03-12** — Core presence/check-in flow, activity feed, points/rank system, clip recording/upload pipeline, on-device video trimming module, weekly leaderboard, proximity check-in hook, profile photo upload, and app navigation structure. See `docs/session-handoffs/` for full file-level details.

---

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

## iOS Build & OTA Status (updated 2026-03-20)

### Current situation
- **OTA is broken on the current TestFlight binary.** Root cause diagnosed: the binary was built without `channel: "production"` in `eas.json`, so `EXUpdatesRequestHeaders` was never injected into `Expo.plist`. The device sends update checks with no channel header → EAS Update server returns nothing.
- **The fix is already in place in `eas.json`** — `"channel": "production"` was added to the production build profile on 2026-03-20. It will take effect on the next build.
- **EAS free-plan iOS build quota is exhausted.** Quota resets ~April 1, 2026. No new iOS build until then.
- **Development workflow until quota resets:** Use simulator/local testing (`npx expo start`) to validate all frontend changes. OTA publishing is paused — don't bother pushing updates to the production branch until a new binary is installed.

### Next iOS build checklist (do all at once when quota resets)
- [ ] `eas.json` production profile already has `"channel": "production"` ✅
- [ ] `ios.runtimeVersion` is already `"1.0.0"` (string, not policy) ✅
- [ ] `expo-notifications` plugin already in `app.json` ✅
- [ ] All UI/navigation changes from 2026-03-20 session are already in the repo ✅
- [ ] After build installs: verify OTA with `eas update --branch production`, do 2 cold starts, confirm changes appear

---

## Known Issues / Risks

### ✅ Security Gaps (all resolved as of 2026-03-25 deploy, verified 2026-03-26)
- ~~**`usernames/` Firestore rules not written**~~ — **Resolved.** Rules deployed: read requires auth, create requires `uid == request.auth.uid`, update/delete blocked.
- ~~**`conversations/` Firestore rules not written**~~ — **Resolved.** Rules deployed: participant-only reads/writes enforced via `participantIds` array, update locked to lifecycle fields only, DM messages gated by parent doc lookup + `isNotSuspended()`.
- ~~**Run Chat Firestore rules not deployed**~~ — **Resolved.** Rules deployed: participant-only access via `runParticipants` exists() check, `isChatActive()` blocks writes after 4-hour expiry, `isNotSuspended()` enforced on create.

### Other Known Issues
- **Firestore rules live in the backend repo only** — `~/Desktop/runcheck-backend/firestore.rules` is the single source of truth. This frontend repo no longer contains `firestore.rules` or `firebase.json`. All rule changes must be made in the backend repo and deployed with `cd ~/Desktop/runcheck-backend && firebase deploy --only firestore:rules`.
- ~~GPS distance enforcement is commented out~~ — **Resolved.** Re-enabled in both `usePresence.js` (client-side gate) and `presenceService.js` (service-layer gate). Both throw user-facing errors when distance exceeds `checkInRadiusMeters`.
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

Read `docs/session_start.md` first — it defines the startup reading order, current project phase, and session rules. That file replaces the manual onboarding prompt.

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

### ✅ Deploy completed 2026-03-18

`deleteAccount` Cloud Function deployed successfully.

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

## Check-In UX + iOS Location Permission Fix (2026-03-18)

### What was changed
- **Check-in helper text** — Both CheckInScreen and RunDetailsScreen now tell users "You must be at the gym to check in" before they attempt to check in.
- **Location permission CTA** — CheckInScreen shows a full "Enable Location" card, RunDetailsScreen shows a compact CTA row. Both only appear when foreground location permission is not granted. Both disappear once permission is granted.
- **Permission request logic fixed** — `handleEnableLocation` now checks `canAskAgain` via `getForegroundPermissionsAsync()`. If undetermined: triggers the native iOS prompt. If permanently denied: opens device Settings. Previously it always called `requestForegroundPermissionsAsync()` which returned `denied` silently when the plist key was missing.
- **iOS Info.plist fix** — Added `locationWhenInUsePermission` to the `expo-location` plugin in `app.json`. Without this, `NSLocationWhenInUseUsageDescription` was never injected into Info.plist, so iOS silently blocked all foreground location requests and the app never appeared in Settings > Location Services. **This was the root cause of the permission issue.**
- **Expected check-in failures cleaned up** — "Too far away" errors now show a friendly "Too Far Away" alert with guidance copy. Permission denied errors now offer an "Enable Location" action in the alert. All expected failure logging downgraded from `console.error` to `console.warn` across `usePresence.js`, `presenceService.js`, `locationUtils.js`, and `RunDetailsScreen.js`.
- **CityGateScreen removed** — Dead code. No navigation path reached it after onboarding was added. File deleted, import + route removed from App.js.
- **Reliability hint in onboarding** — Added "Showing up builds your reputation — players trust reliable hoopers." to OnboardingFinishScreen's "You're All Set" state.
- **Home court accent bar** — ViewRunsScreen home court card now uses a 3px left accent bar instead of a full orange border.
- **Post-onboarding empty states** — ViewRunsScreen sorts home court first with "Your Home Court" badge. HomeScreen empty state shows a "Your Home Court" quick-action card and "Find a Gym" CTA.
- **Gym image consistency** — OnboardingHomeCourtScreen now uses the same `GYM_LOCAL_IMAGES` → `imageUrl` → fallback pattern as all other screens.

### Files changed
- `app.json` — added `locationWhenInUsePermission` to expo-location plugin
- `utils/locationUtils.js` — added `isLocationGranted()` helper, downgraded error logs to warn
- `screens/CheckInScreen.js` — added location CTA card + permission state tracking + helper text
- `screens/RunDetailsScreen.js` — added location CTA row + helper text + fixed check-in error alerts
- `hooks/usePresence.js` — downgraded expected failure logs from error to warn
- `services/presenceService.js` — downgraded "too far" log from error to warn
- `screens/OnboardingFinishScreen.js` — added reliability hint text
- `screens/ViewRunsScreen.js` — home court accent bar, sort logic, empty state improvements
- `screens/HomeScreen.js` — home court quick-action card, "Find a Gym" CTA in empty state
- `screens/OnboardingHomeCourtScreen.js` — added GYM_LOCAL_IMAGES for correct gym thumbnails, "Request gym" hint
- `App.js` — removed CityGateScreen

### Important: requires native rebuild (batching with push notifications)
The `app.json` change (adding `locationWhenInUsePermission`) only takes effect after `npx expo prebuild --clean` + a new EAS/Xcode build. The Info.plist must be regenerated. **Rebuild is being deferred and batched with push notifications setup**, which will also require a native rebuild. Do both at the same time.
