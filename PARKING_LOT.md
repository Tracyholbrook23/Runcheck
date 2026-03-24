# RunCheck — Parking Lot

Good ideas that are **not launch-critical**. They live here so they don't get lost and don't cause scope creep.

Nothing in this file should be worked on during a session unless the user explicitly promotes it. If an idea gets promoted to active work, move it to `LAUNCH_CHECKLIST.md` or a task definition and remove it from here.

---

## Clips & Media Enhancements

- Clip reactions beyond likes (fire, cold, etc.)
- Clip comments / threaded discussion
- Clip categories and filtering (dunks, assists, defense, etc.)
- Auto-generated highlight reels from a session's clips
- Clip sharing to Instagram Stories / TikTok with RunCheck watermark
- Background music / audio overlay on clips
- Slow-motion playback toggle in ClipPlayerScreen
- Premium clip features: longer duration, more weekly uploads, priority processing

---

## Social Features

- ~~**Run Chat**~~ — **Done 2026-03-20.** Per-run group chat fully implemented. `RunChatScreen` with real-time Firestore `onSnapshot`, access gated to run participants, Cloud Function push notifications to all participants, gym name + start time shown in Messages inbox, back button wired up in HomeStack and ProfileStack.
- ~~In-app messaging / DMs~~ — **Code complete 2026-03-21.** Full DM system built: `openOrCreateConversation`, `DMConversationScreen`, `MessagesScreen` (SectionList with DMs + Run Chats), unread count badge on home screen Messages icon. ⚠️ `onDmMessageCreated` Cloud Function (DM push notifications) is NOT yet built — App.js tap handler is wired and waiting. Firestore rules for `conversations` collection not yet deployed.
- "Challenge" system (1v1 or crew vs crew invites)
- Crew/team creation and management
- Follow other players (not just gyms)
- Notification system (push notifications for runs, tags, friend activity)
- "Who's going tonight?" pre-commitment feed

---

## Check-in & Presence

- ~~**Smart proximity check-in prompt**~~ — **Done 2026-03-18.** `useProximityCheckIn` hook polls GPS every 30 s (Balanced accuracy, ≤ 100m accuracy gate, 30-min dismiss cooldown per gym). CheckInScreen shows an orange prompt card when user is inside a gym's radius. One-tap Check In runs the full existing check-in flow; "Not now" suppresses for 30 min. Foreground-only, user-confirmed, no background location.

---

## Discovery & Recommendations

- "Suggested gyms" based on location and play history
- "Players like you" recommendations based on skill level and gym overlap
- Gym search by amenities, court type, hours
- City-level discovery page (browse gyms outside home city)
- Trending gyms / hot spots indicator
- ~~Integration with Google Maps for directions~~ — **Done.** `openDirections` utility already works on ViewRunsScreen and RunDetailsScreen.

---

## Gamification & Competition

- Badges / achievements (streak badges, gym explorer, early bird, etc.)
- Seasonal leaderboard resets with rewards
- XP multiplier events (double points weekends)
- Rank decay for inactivity (use it or lose it)
- Gym-level leaderboards (top players at each gym)
- "Run streak" tracking (consecutive weeks with a completed run)

---

## UI & Polish

- Dark mode refinement and per-screen audit
- ~~**Swipe between tabs**~~ — **Done 2026-03-22.** Swipe left/right navigation between Home, Runs, Check In, Plan, Profile implemented using `@react-navigation/material-top-tabs` + `react-native-pager-view`.
- Animated transitions between screens
- ~~**Skeleton loading screens**~~ — **Done 2026-03-22.** Replaced full-screen blank spinners on `UserProfileScreen`, `RunDetailsScreen`, and `ProfileScreen` with structural skeleton placeholders (grey placeholder boxes that mirror the real layout). Back button always tappable during load.
- ~~Haptic feedback on key actions (check-in, join run, post clip)~~ — **Done.** `utils/haptics.js` helper wrapping `expo-haptics`. Success haptic on check-in, join run, post clip. Medium impact on record button press. Light on checkout.
- ~~Pull-to-refresh on all list screens~~ — **Done.** Added to HomeScreen, ProfileScreen, RunDetailsScreen, LeaderboardScreen (plus ViewRunsScreen and admin screens already had it).
- ~~Onboarding tutorial / walkthrough for new users~~ — **Done.** 3-step onboarding flow implemented (Welcome → Home Court → Location + Finish).
- Accessibility audit (VoiceOver, Dynamic Type, contrast)

---

## Monetization & Growth

- **Run creation limits (free vs. premium)** — Free users get a daily cap on how many runs they can *start* (exact number TBD — 1 or 3 per day is the working range). Premium users get unlimited run creation. Joining an existing run would not count against the limit — only starting a new one. Implementation notes when ready: daily counter on `users/{uid}` (e.g. `runsStartedToday: { count, date }`) checked client-side + enforced in `startOrJoinRun` service function or a Cloud Function. Reset daily via Cloud Scheduler or lazy reset (compare `date` to today on each check-in call).

- Premium subscription tier (expanded clip limits, exclusive perks, priority support)
- Gym partnership program (verified gym pages, promoted listings)
- Referral system (invite friends, earn bonus points)
- Sponsored runs or events
- Merchandise / swag store integration
- Analytics dashboard for gym owners

---

## Technical Improvements (Non-Blocking)

- ~~**GPS timeout + stale-fix hardening**~~ — **Done.** Added `timeout: 15000` and `maximumAge: 30000` to `getCurrentPositionAsync` in `locationUtils.js`.
- ~~**Silent-error banners on core screens**~~ — **Done 2026-03-19.** Dismissible amber error banner added to HomeScreen, ViewRunsScreen, and RunDetailsScreen. Users see "Something went wrong — pull to refresh" instead of a silent empty state.
- ~~**Deduplicate reliability subscriptions on ProfileScreen**~~ — **Done 2026-03-19.** Removed redundant `reliability` state variable and `setReliability` call from inline `onSnapshot`. Display now uses `stats` from `useReliability` hook exclusively.
- ~~**Switch `useTaggedClips` to native `taggedUserIds` array-contains query**~~ — **Done 2026-03-19.** Replaced client-side filter of 100 docs with `where('taggedUserIds', 'array-contains', uid)`. Requires Firestore composite index on `clips` collection — auto-create link appears in dev console on first run.
- ~~**Deprecate stale `addGym` Cloud Function**~~ — **Done 2026-03-19.** Export commented out in `index.ts`; deprecation header added to `addGym.ts`.
- Migrate remaining gym images to Firebase Storage
- Server-side presence auto-expiry Cloud Function
- **Composite Firestore indexes for scale** (`activity`, `gymClips`) — also need `clips/taggedUserIds + createdAt` index for `useTaggedClips` (auto-create link shown in console)
- End-to-end test suite for critical flows
- CI/CD pipeline for automated builds and deploys
- Firestore Security Rules audit and tightening

---

_Last updated: 2026-03-22_
_To add an idea: append it to the relevant section with a brief description. Do not act on it without explicit approval._
