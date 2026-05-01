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
- ~~In-app messaging / DMs~~ — **Code complete 2026-03-21.** Full DM system built: `openOrCreateConversation`, `DMConversationScreen`, `MessagesScreen` (SectionList with DMs + Run Chats), unread count badge on home screen Messages icon. `onDmMessageCreated` Cloud Function implemented and exported in `index.ts`. Firestore rules deployed 2026-03-25 (verified 2026-03-26).
- **Audio messages in DM chat** — record and send voice clips. Needs `expo-av` for recording + playback, waveform/progress UI, Firebase Storage upload. Good feature but low priority for Austin/Lansing launch demographics.
- **Reply-to-message in DM chat** — quote a specific message above your reply. Stores `replyTo: { messageId, text, senderName }` on the new message doc. Needs quoted preview bubble, scroll-to-referenced-message, and deleted message fallback handling.
- **Stickers in DM chat** — curated static pack or Giphy `/stickers/search` endpoint. GIF picker already covers the main use case.
- "Challenge" system (1v1 or crew vs crew invites)
- Crew/team creation and management
- Follow other players (not just gyms)
- ~~**Notification system — gym follow alerts (Phase 2 N-05)**~~ — **Done 2026-03-25.** `notifyFollowersRunCreated` Cloud Function deployed. Notifies gym followers when a new future run is created. Deduped per follower per run. Needs `firebase deploy --only functions:notifyFollowersRunCreated` to go live.
- ~~**Notification system — live activity alerts (Phase 2 V2 N-06)**~~ — **Done 2026-03-25.** `onGymPresenceUpdated` + `notifyFollowersPresenceMilestone` implemented. Two-function design: trigger stamps a pending milestone marker on upward threshold crossings (3, 6 players); scheduler confirms 5-min stability then notifies followers with 3-hour cooldown. Needs `firebase deploy --only functions:onGymPresenceUpdated,functions:notifyFollowersPresenceMilestone` to go live.
- **Notification system — V3 deferred items** (do not implement until approved):
  - `notifyFollowersRunActive` — alert when a run transitions to `active`. Needs consistent `status` writes.
  - Per-gym mute preferences (`users/{uid}.notifPrefs.mutedGyms[]`)
  - Daily notification cap across all followed-gym alerts
  - `notifyFollowersPresenceMilestone` pagination for large follower counts (>500 per gym)
  - Follower query pagination for gyms with 500+ followers
  - **`notifyFollowersRunCreated` pagination** — current query loads all followers into memory; paginate with `startAfter` when any gym exceeds ~500 followers
- Notification system (push notifications for tags, friend activity)
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
- **Run level badge on ViewRunsScreen has no context** — The gym card on the Find a Run screen shows a run level badge (e.g., "Competitive") but it appears out of nowhere with no label or explanation. Users won't know what it means or who set it. Options to consider: (1) add a small label above or beside it like "Vibe:" or "Level:", (2) show it only when a run is actually active (not on "No run yet" cards), (3) add a tooltip or info icon that explains the levels. The badge is rendered in `ViewRunsScreen.js` / `HomeScreen.js` gym card. Current run levels are: `mixed`, `casual`, `competitive`.

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
- **Zombie-run cleanup Cloud Function** — As of the 2026-04-22 last-leaver fix (`services/runService.js`), `leaveRun` no longer writes `status: 'cancelled'` when the last participant leaves, because Firestore rules on `runs/{runId}` only allow non-creator updates that `hasOnly(['participantCount','lastMessageAt'])`. Runs whose count hits 0 now stay as `status: 'upcoming'` with `participantCount: 0`. All client queries already filter `participantCount <= 0` out (ViewRunsScreen, HomeScreen feed, startOrJoinRun merge-match), so users don't see them — but the docs accumulate. Post-beta, add a scheduled Cloud Function that flips `status: 'cancelled'` on any `runs` doc where `participantCount <= 0` and `startTime` is in the past (or older than ~10 minutes). Alternative: expand the Firestore rule carve-out to include `status` alongside `participantCount`, and restore the client-side status write — heavier surface-area change, defer unless another caller needs it.
- **Composite Firestore indexes for scale** (`activity`, `gymClips`) — also need `clips/taggedUserIds + createdAt` index for `useTaggedClips` (auto-create link shown in console)
- End-to-end test suite for critical flows
- CI/CD pipeline for automated builds and deploys
- Firestore Security Rules audit and tightening
- **✅ Skeleton screens frozen until touch/scroll — RESOLVED 2026-03-26** — RunDetailsScreen and ViewRunsScreen skeletons were getting stuck indefinitely. Investigation went through three phases: (1) `InteractionManager.runAfterInteractions()` removed from all six hooks — React StrictMode + new arch runs cleanup before deferred callbacks fire; (2) `setTimeout(350ms)` tried and also failed for the same reason; (3) hooks changed to immediate `onSnapshot` — these three were necessary prerequisites but did not fully resolve the freeze. **True root cause:** the Runs tab `tabPress` listener was calling `navigation.navigate('Runs', { screen: 'ViewRunsMain' })`, which triggered a pop animation on RunsStack while the user could immediately push a new RunDetailsScreen. Competing animations in new arch caused the React reconciler to run effect cleanup+remount cycles on the new screen before the push animation settled, leaving loading flags permanently stuck at `true`. **Fix:** `App.js` tabPress listener replaced with `StackActions.popToTop()` dispatched with `target: runsStackState.key` so the action routes directly to RunsStack (not the root navigator). All six hooks remain on immediate subscribe. Confirmed resolved by Tracy 2026-03-26.

---

## Gym Data & Onboarding at Scale

- **Bulk gym import pipeline** — Currently adding gyms one at a time: manually searching, verifying address, and finding a basketball-court photo for each location. This doesn't scale. Need a smarter approach before expanding to new cities. Options to explore:
  - **Google Places API** — Query `type=gym` or keyword `"basketball"` within a radius, get name/address/coordinates/photos automatically. Could build a one-time import script that writes directly to Firestore `gyms` collection with a `status: 'pending_review'` flag so they can be spot-checked before going live.
  - **Yelp Fusion API** — Similar to Google Places, searchable by category and location. May surface rec centers and public courts that Google misses.
  - **OpenStreetMap / Overpass API** — Free, no API key, can query `leisure=sports_centre` + `sport=basketball` nodes by bounding box. Good for public parks and rec centers.
  - **Photos** — Google Places API returns up to 10 place photos per result; can pull the best one and store the URL (or download to Firebase Storage). Avoids manually hunting for images.
  - **Admin review flow** — After bulk import, build a simple admin screen (or script) to flip `status: 'pending_review'` → `status: 'active'` after spot-checking name, address, and photo quality.
  - **Suggested by users** — The existing `RequestGymScreen` flow already lets users submit gyms. Could combine: bulk import for known venues + user requests for anything missed.

---

_Last updated: 2026-03-26_
_To add an idea: append it to the relevant section with a brief description. Do not act on it without explicit approval._
