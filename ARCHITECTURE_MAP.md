# RunCheck — Architecture Map

This file maps every significant source file to a feature zone. Use it before starting any task to identify which files are in scope and where zone boundaries lie.

Zone assignments are based on file content, service dependencies, and the data model in `BACKEND_MEMORY.md`. Files that serve two zones are listed under both with a cross-reference note. Files whose ownership is genuinely ambiguous are listed under **Possible Zone Overlap**.

---

## Zone 1 — Run Lifecycle

**Responsibility:** Everything related to creating, joining, leaving, and displaying group runs. Manages the `runs` and `runParticipants` Firestore collections. Owns the merge rule (±60-minute window per gym), participant count denormalization, and real-time run subscriptions.

### Service Layer
| File | Role |
|------|------|
| `services/runService.js` | Core logic: `startOrJoinRun`, `joinExistingRun`, `leaveRun`, `subscribeToGymRuns`, `subscribeToUserRunsAtGym`, `subscribeToRunParticipants`, `subscribeToAllUpcomingRuns` |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useGymRuns.js` | Real-time subscription to runs at a gym; exposes `runs`, `joinedRunIds`, `userParticipants` |

### Screen Layer
| File | Role |
|------|------|
| `screens/RunDetailsScreen.js` | Per-gym detail view; renders run cards, join/leave buttons, participant count. Chat button (participants-only, hidden from non-participants) navigates to RunChatScreen. |
| `screens/ViewRunsScreen.js` | Browse all gyms; shows activity-level badges and navigates to RunDetails. Header/search/filters render immediately (no full-screen loading spinner — spinner is inline within the gym list). |
| `screens/RunsScreen.js` | Tab-level wrapper for the Runs navigation stack |

### Test Layer
| File | Role |
|------|------|
| `__tests__/screens/RunDetailsScreen.test.js` | Tests for RunDetailsScreen |
| `__tests__/screens/ViewRunsScreen.test.js` | Tests for ViewRunsScreen |

### Service Layer (continued)
| File | Role |
|------|------|
| `services/runChatService.js` | Run chat: `subscribeToRunMessages(runId, callback)` (real-time ordered listener), `sendRunMessage({runId, senderId, senderName, senderAvatar, text})` (validates + trims + writes). Error callback calls `callback([], error)` to surface Firestore errors to the component. |

### Screen Layer (continued)
| File | Role |
|------|------|
| `screens/RunChatScreen.js` | Participants-only group chat. Route params: `runId`, `gymId`, `gymName`. Reads participation via `useGymRuns(gymId).joinedRunIds`. Five render states: participant loading → non-participant gate → Firestore error gate → messages loading → live chat. Subscription guarded by `participantLoading` in deps to prevent React Strict Mode double-invocation from opening a premature subscription. Chat button entry point in `RunDetailsScreen` is hidden behind `{isJoined && (...)}`. |

### Key Firestore Collections
- `runs/{autoId}` — one document per run
- `runParticipants/{runId}_{userId}` — one document per participant per run
- `runs/{runId}/messages/{autoId}` — chat messages subcollection (participants-only read + create)

### Known Issues (see DEV_TASKS.md)
- **RC-001**: Empty runs remain visible when `participantCount` reaches 0
- `increment(-1)` in `leaveRun` is not clamped — counter can go negative (treat `<= 0` as empty)
- `'joined a run at'` activity writes should be removed (see Zone 2)

---

## Zone 2 — Activity Feed

**Responsibility:** Writing and displaying the community activity feed. Activity documents record user actions (`'checked in at'`, `'planned a visit to'`, `'started a run at'`) and are displayed on the Home screen. Owns the `activity` Firestore collection.

### Service Layer
| File | Role |
|------|------|
| `services/presenceService.js` | Writes `'checked in at'` and `'planned a visit to'` activity docs as a fire-and-forget side effect of `checkIn` |
| `services/runService.js` | Writes `'started a run at'` (and currently `'joined a run at'`) activity docs — **see Known Issues** |

### Screen Layer
| File | Role |
|------|------|
| `screens/HomeScreen.js` | Queries `activity` collection in real time; renders the "Recent Activity" feed section |

### Key Firestore Collections
- `activity/{autoId}` — one document per user action

### Known Issues (see DEV_TASKS.md)
- **RC-002**: Stale activity entries for empty/expired runs remain in the feed
- `'joined a run at'` writes in `runService.js` create feed spam; only `'started a run at'` should be kept (BACKEND_MEMORY Known Issue #6)

### Zone Overlap
- `services/runService.js` is primary owner of Zone 1 (Run Lifecycle) but also writes to the activity feed. Changes to run activity writes must be evaluated against both zones.
- `screens/HomeScreen.js` is primary owner of Zone 4 (Home Screen / UI) but also owns the activity feed query and render logic.

---

## Zone 3 — Profile / Reliability

**Responsibility:** Displaying and computing user reliability scores, session statistics, and profile data. Reliability writes are owned exclusively by Cloud Functions (backend). The client is read-only for reliability data. Owns display logic for score tiers, stats grid, and attendance rate.

### Service Layer
| File | Role |
|------|------|
| `services/reliabilityService.js` | **READ-ONLY on client.** `getUserReliability`, `getReliabilityTier`, `calculateReliabilityScore` (display fallback) |
| `services/scheduleService.js` | Schedule CRUD: `createSchedule`, `cancelSchedule`, `markScheduleAttended`, `markScheduleNoShow`, `findMatchingSchedule` |
| `services/intentService.js` | Future gym visit scheduling: `getIntentId`, `formatTimeSlot`, `getAvailableTimeSlots` |
| `services/pointsService.js` | Point awards: `awardPoints`, `handleFollowPoints` — single source of truth for all point writes |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useReliability.js` | Real-time `onSnapshot` on `users/{uid}.reliability`; derives score, tier, and stats |
| `hooks/useProfile.js` | Real-time subscription to `users/{uid}`; exposes `profile`, `followedGyms`, `loading` |
| `hooks/useSchedules.js` | Queries scheduled sessions by user; exposes `schedules`, `todaySchedules`, `tomorrowSchedules` |
| `hooks/useAuth.js` | Firebase Auth state; exposes `user`, `loading` |
| `hooks/usePresence.js` | User's own active presence; exposes `activePresence`, `checkIn`, `checkOut` |

### Screen Layer
| File | Role |
|------|------|
| `screens/ProfileScreen.js` | Full profile dashboard: reliability score card, session stats grid, courts list, friends, settings, sign-out. Admin Tools badge (Zone 7 overlap). My Clips + Tagged In + Featured In (Zone 8 overlap). |
| `screens/UserProfileScreen.js` | View another user's profile (read-only). "Message" button → DMConversationScreen. |
| `screens/EditProfileScreen.js` | Edit Display Name + Skill Level. Read-only: Email, Username. In ProfileStack. Added 2026-03-22. |
| `screens/LoginScreen.js` | Auth: email/password sign-in |
| `screens/SignupScreen.js` | Auth: new account registration. Collects username, firstName, lastName. Firestore write deferred to VerifyEmailScreen. |

### Test Layer
| File | Role |
|------|------|
| `__tests__/screens/ProfileScreen.test.js` | Tests for ProfileScreen |
| `__tests__/screens/LoginScreen.test.js` | Tests for LoginScreen |
| `__tests__/screens/SignupScreen.test.js` | Tests for SignupScreen |

### Utility Layer
| File | Role |
|------|------|
| `config/ranks.js` | Single source of truth for rank tier definitions (`RANKS` — 6 tiers: Bronze→Legend, with perks) |
| `config/points.js` | Single source of truth for point values (`POINT_VALUES`, `ACTION_LABELS`) |
| `config/perks.js` | Perk definitions registry (`PERK_DEFINITIONS`, `PREMIUM_OVERRIDES`) |
| `utils/rankHelpers.js` | Rank computation helpers (`getUserRank`, `getProgressToNextRank`, `getNextRank`, `getRankById`) |
| `utils/perkHelpers.js` | Perk resolution helpers (`getUserPerks`, `hasPerk`, `getFeatureQuota`, `getRankPerksForDisplay`) |
| `utils/badges.js` | **DEPRECATED** re-export shim — forwards to `config/ranks`, `config/points`, `utils/rankHelpers` |
| `utils/locationUtils.js` | GPS utility module: `isLocationGranted`, `requestLocationPermission`, `getCurrentLocation`, `calculateDistanceMeters`. Dev mode returns Cowboys Fit coords. Used by `useProximityCheckIn`. |
| `utils/haptics.js` | Haptic feedback helpers with no-op fallbacks: `hapticSuccess`, `hapticLight`, `hapticMedium`, `hapticHeavy`. Used in CheckInScreen, RunDetailsScreen, RecordClipScreen, TrimClipScreen. |
| `utils/sanitize.js` | **Centralized input sanitizer** (added 2026-03-25). Seven pure sanitizer functions: `sanitizeUsername`, `sanitizeName`, `sanitizePersonName`, `sanitizeSearch`, `sanitizeFreeText`, `sanitizeAddress`, `sanitizeState`. All are safe to call on every keystroke (O(n), no throws). |

### Service Layer
| File | Role |
|------|------|
| `services/dmService.js` | DM service: `openOrCreateConversation` (idempotent, deterministic `conversationId`), `subscribeToConversations`, `subscribeToConversationMessages`, `sendDMMessage`, `markConversationSeen`, `blockUser`, `unblockUser`, `muteConversation`, `unmuteConversation`, `getConversationMuteState`. |

### Key Firestore Collections
- `users/{uid}` — profile, reliability sub-object, activePresence (denormalized)
- `usernames/{usernameLower}` — username reservation docs `{ uid, createdAt }`. Uniqueness enforced; written atomically with `users/{uid}` in Firestore transaction. Added 2026-03-22.
- `schedules/{scheduleId}` — individual schedule records
- `friendRequests/{autoId}` — incoming/outgoing friend requests
- `conversations/{conversationId}` — DM conversation docs (deterministic ID: `[uid_a, uid_b].sort().join('_')`). Firestore rules deployed 2026-03-25 (verified 2026-03-26).
- `conversations/{conversationId}/messages/{autoId}` — DM message subcollection. Firestore rules deployed 2026-03-25 (verified 2026-03-26).

### Known Issues (see DEV_TASKS.md)
- **RC-003**: Reliability score card may not reflect latest Cloud Function writes
- **RC-004**: Session stats card may show zeroes or stale values

### Important Constraints
- Do NOT add reliability writes to `reliabilityService.js` — Cloud Functions own these
- `calculateReliabilityScore` in `reliabilityService.js` is a display fallback only

---

## Zone 4 — Home Screen / UI

**Responsibility:** The main dashboard experience, navigation structure, shared UI components, theming, and design tokens. Owns the app's visual language and the Home tab display (live players, quick actions, LIVE indicator).

### App Shell
| File | Role |
|------|------|
| `App.js` | Root navigation tree: Root Stack + MainTabs (Home, Runs, CheckIn, Plan, Profile) |
| `index.js` | Expo entry point |

### Screen Layer
| File | Role |
|------|------|
| `screens/HomeScreen.js` | Main dashboard: hero section, Presence Card, Quick Actions, LIVE indicator, Live Runs scroll, Recent Activity feed |
| `screens/SplashScreen.jsx` | Animated intro/loading screen |
| `screens/OnboardingRegionScreen.js` | First-time onboarding step 0: Austin TX geographic focus notice. Added 2026-03-21. |
| `screens/OnboardingWelcomeScreen.js` | First-time onboarding step 1: branded welcome |
| `screens/OnboardingHomeCourtScreen.js` | First-time onboarding step 2: gym/home court picker |
| `screens/OnboardingFinishScreen.js` | First-time onboarding step 3: location permission + finish |
| `screens/VerifyEmailScreen.js` | Email verification gate (post-signup / post-login). On new-user path: writes Firestore profile + reserves `usernames/{usernameLower}` in a single transaction. |
| `screens/ClaimUsernameScreen.js` | Username migration gate for existing users without a `username` field. Validates via `USERNAME_REGEX`, reserves via Firestore transaction. Routes to Main if `onboardingCompleted`, else OnboardingWelcome. Added 2026-03-22. |
| `screens/SettingsScreen.js` | Account settings: sign out, delete account, preferences, "Account Info" row → EditProfileScreen |
| `screens/EditProfileScreen.js` | Edit Display Name (Firestore + Firebase Auth `displayName`) and Skill Level. Username shown read-only. Accessible via ProfileStack → Settings → Account Info. Added 2026-03-22. |
| `screens/SearchUsersScreen.js` | User search by username prefix (live suggestions) |
| `screens/MessagesScreen.js` | Unified Messages inbox. `SectionList` with two sections: (1) Direct Messages ordered by `lastActivityAt`; (2) Run Chats for active run group chats. Search bar debounces Firestore `usernameLower` prefix query for new conversation starters. Entry point: HomeScreen header icon + ProfileScreen "Messages" row. Added 2026-03-21. |
| `screens/DMConversationScreen.js` | 1:1 DM chat screen. Calls `markConversationSeen` on mount. Real-time message subscription. FlatList + text input. Tapping other user's name/avatar → UserProfileScreen. Added 2026-03-21. |
| `screens/PremiumScreen.js` | Premium features screen |
| `screens/CreatePrivateRunScreen.js` | **UI-only Premium teaser** for Private Run and Paid Run features. Interactive form with payout calculator. CTA shows "Coming Soon" modal → navigates to PremiumScreen. No Firestore writes. |
| `screens/LeaderboardScreen.js` | Community leaderboard |
| `screens/CheckInScreen.js` | GPS check-in flow |
| `screens/PlanVisitScreen.js` | Schedule a future gym visit. Co-planner signal layer: derives `coPlannersCount` from `gyms.scheduleCounts` (in-memory, no extra reads). Tiered signal badges (1 other / 2 others / 3+ "Run forming"). Start Run shortcut on visit cards when `otherCount >= 2 && !hasExistingRun`. Step 4 confirmation with 5-state contextual copy (0/1/2/3+ co-planners + existing run). "Join Run" CTA on run cards when `hasMatchingVisit && !isJoined` (uses `joinExistingRun` — not `startOrJoinRun`). |
| `screens/GymMapScreen.js` | Map view of nearby gyms |
| `screens/GymReviewsScreen.js` | Reviews for a specific gym |
| `screens/GymsScreen.js` | Gym listing (possible Zone 1 overlap — see below) |
| `screens/ClipPlayerScreen.js` | Video clip playback |
| `screens/RecordClipScreen.js` | Video clip recording |
| `screens/TrimClipScreen.js` | Video clip trimming |

### Component Layer
| File | Role |
|------|------|
| `components/Button.js` | Shared button component |
| `components/Card.js` | Shared card container |
| `components/Input.js` | Shared text input |
| `components/Logo.js` | RunCheck logo component |
| `components/PresenceList.js` | Renders a list of active presences |
| `components/index.js` | Barrel export for all components |

### Context / Theme Layer
| File | Role |
|------|------|
| `contexts/ThemeContext.js` | Dark/light mode state; `useTheme` hook; `ThemeProvider` |
| `contexts/index.js` | Barrel export for contexts |
| `constants/theme.js` | Design tokens: `FONT_SIZES`, `SPACING`, `RADIUS`, `SHADOWS`, `FONT_WEIGHTS` |
| `constants/branding.js` | Brand colors, logo assets |
| `constants/gymAssets.js` | Local gym image map (`GYM_LOCAL_IMAGES`) |
| `constants/theme 2.js` | Duplicate/legacy theme file — verify if still in use |
| `design/DESIGN_SYSTEM.md` | Design system documentation |
| `design/THEME_AUDIT.md` | Theme audit notes |

### Hook Layer (shared UI hooks)
| File | Role |
|------|------|
| `hooks/useGym.js` | Real-time subscription to a single gym document |
| `hooks/useGyms.js` | Real-time subscription to all gyms |
| `hooks/useGymPresences.js` | Real-time presences at a specific gym |
| `hooks/useGymSchedules.js` | Scheduled visits at a specific gym |
| `hooks/useLivePresenceMap.js` | Aggregated live presence data across all gyms (used by HomeScreen LIVE indicator) |
| `hooks/useLocation.js` | Expo Location GPS hook |
| `hooks/useProximityCheckIn.js` | Smart proximity hook. Polls GPS every 30s while foregrounded; surfaces `nearbyGym` when user is inside a gym's `checkInRadiusMeters`. 30-min per-gym dismiss cooldown. Accuracy gate (>100m GPS fixes ignored). Used in CheckInScreen and RunDetailsScreen. |
| `hooks/index.js` | Barrel export for all hooks |

### Test Layer
| File | Role |
|------|------|
| `__tests__/screens/HomeScreen.test.js` | Tests for HomeScreen |
| `__tests__/screens/CheckInScreen.test.js` | Tests for CheckInScreen |
| `__tests__/screens/GymMapScreen.test.js` | Tests for GymMapScreen |
| `__tests__/helpers/renderWithTheme.js` | Test helper: wraps components in ThemeProvider |

### Zone Overlap
- `screens/HomeScreen.js` also owns the activity feed render (Zone 2 overlap)
- `hooks/useGymPresences.js` and `hooks/useGymSchedules.js` serve both Zone 4 (RunDetails display) and Zone 1 (run context within gym detail)

---

## Zone 6 — Gym Requests & Onboarding

**Responsibility:** User-submitted gym requests, request status tracking, and the admin gym approval workflow. Users submit requests via Cloud Function (no direct Firestore writes). Admins review in Firebase Console, add approved gyms via `seedProductionGyms.js`, and update the request document. Owns the `gymRequests` Firestore collection.

### Cloud Function (in runcheck-backend)
| File | Role |
|------|------|
| `functions/src/submitGymRequest.ts` | Callable: validates input, enforces 1-per-7-day rate limit, writes to `gymRequests` collection. Returns `resource-exhausted` if rate limited. |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useMyGymRequests.js` | Real-time subscription to current user's `gymRequests` docs, ordered newest-first; exposes `{ requests, loading, count, pendingCount }` |

### Screen Layer
| File | Role |
|------|------|
| `screens/RequestGymScreen.js` | Gym request submission form. Calls `submitGymRequest` Cloud Function — no direct Firestore writes. Fixed bottom bar with submit button. |
| `screens/MyGymRequestsScreen.js` | Displays user's submitted requests with status badges (pending/approved/duplicate/rejected), admin notes, and contextual hints for approved/duplicate outcomes. |

### Entry Points
| Location | How it connects |
|----------|----------------|
| `screens/ViewRunsScreen.js` | "Don't see your gym? Request it" link at bottom of gym list → navigates to RequestGymScreen |
| `screens/ProfileScreen.js` | "My Gym Requests" row with orange count badge → navigates to MyGymRequestsScreen |

### Key Firestore Collections
- `gymRequests/{autoId}` — one document per user request (see BACKEND_MEMORY.md for schema)

### Navigation
- RequestGymScreen is in RunsStack (`App.js`)
- MyGymRequestsScreen is in ProfileStack (`App.js`)

---

## Zone 7 — Moderation & Admin

**Responsibility:** Report submission, auto-moderation enforcement, admin dashboards for managing reports, suspended users, hidden clips, and gym requests. All enforcement logic lives in `moderationHelpers.ts` (backend). Admin screens are gated by `useIsAdmin`. All moderation writes go through Cloud Functions — the client is read-only for moderation fields.

### Backend (in runcheck-backend)
| File | Role |
|------|------|
| `functions/src/moderationHelpers.ts` | **Single source of truth** for enforcement: `enforceHideClip`, `enforceRemoveRun`, `enforceSuspendUser`, `enforceUnsuspendUser`, `enforceUnhideClip`, `resolveRelatedReport` |
| `functions/src/submitReport.ts` | User callable: report submission + auto-moderation trigger |
| `functions/src/moderateReport.ts` | Admin callable: mark reports reviewed/resolved |
| `functions/src/hideClip.ts` | Admin callable: hide a clip |
| `functions/src/removeRun.ts` | Admin callable: remove a run |
| `functions/src/suspendUser.ts` | Admin callable: suspend a user (escalating) |
| `functions/src/unsuspendUser.ts` | Admin callable: unsuspend a user |
| `functions/src/unhideClip.ts` | Admin callable: unhide a clip |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useIsAdmin.js` | Admin gate: checks `users/{uid}.isAdmin === true` |

### Screen Layer
| File | Role |
|------|------|
| `screens/AdminToolsScreen.js` | Admin hub: live pending counts per tool, navigation to sub-screens |
| `screens/AdminGymRequestsScreen.js` | Admin gym request review list |
| `screens/AdminGymRequestDetailScreen.js` | Detail view for individual gym requests |
| `screens/AdminReportsScreen.js` | Reports moderation: type/status badges, resolve/review actions |
| `screens/AdminSuspendedUsersScreen.js` | Suspended users: avatar, resolved names, unsuspend action |
| `screens/AdminHiddenClipsScreen.js` | Hidden clips: thumbnail preview, video playback, unhide action |
| `screens/AdminAllClipsScreen.js` | Full clip browser: filter by All / By Gym / Hidden / Featured; Feature, Unfeature, Hide, Unhide actions; real-time snapshot (limit 25) |
| `screens/AdminFeaturedClipsScreen.js` | Featured clips admin view: lists clips with `isDailyHighlight === true`; Unfeature action via `callFunction`. |
| `screens/MyReportsScreen.js` | **User-facing read-only** view of the signed-in user's own submitted reports (`reports` where `reportedBy == uid`, sorted newest-first). Status badges only — no edit/delete actions. Not an admin screen. |

### Component Layer
| File | Role |
|------|------|
| `components/ReportModal.js` | Reusable bottom-sheet modal for reporting content (used by ClipPlayerScreen, UserProfileScreen, RunDetailsScreen) |

### Entry Points
| Location | How it connects |
|----------|----------------|
| `screens/ProfileScreen.js` | Admin Tools row (admin-only) with workload badge → AdminToolsScreen |
| `screens/ClipPlayerScreen.js` | Flag button → ReportModal (type="clip") |
| `screens/UserProfileScreen.js` | Flag button → ReportModal (type="player") |
| `screens/RunDetailsScreen.js` | Report pill/flag → ReportModal (type="gym" or "run") |

### Key Firestore Collections
- `reports/{autoId}` — one document per user report
- `gymClips/{autoId}` — moderation fields: `isHidden`, `hiddenBy`, `hiddenAt`, etc.
- `runs/{autoId}` — moderation fields: `isRemoved`, `removedBy`, `removedAt`, etc.
- `users/{uid}` — suspension fields: `isSuspended`, `suspensionLevel`, `suspensionEndsAt`, etc.

### Auto-Moderation Thresholds
- Clip: 3 pending reports → hide clip + resolve reports
- Run: 3 pending reports → remove run + resolve reports
- Player: 5 pending reports → suspend player + resolve reports

### Important Constraints
- All moderation writes go through Cloud Functions — never write moderation fields directly from the client
- `moderationHelpers.ts` is the single source of truth — never duplicate enforcement logic in individual callable files
- Admin screens use `useIsAdmin` hook for gating — non-admin users see an Access Denied screen
- Admin auth in Cloud Functions: `context.auth` + `getDoc('users/{uid}').isAdmin === true`

### Zone Overlap
- `screens/ProfileScreen.js` (Zone 3) owns the Admin Tools badge counting pending items across all 4 categories
- `components/ReportModal.js` is used by screens in Zone 1 (RunDetailsScreen) and Zone 4 (ClipPlayerScreen, UserProfileScreen)
- `functions/src/submitReport.ts` bridges Zone 7 (moderation) and Zone 2 (activity feed) via auto-moderation's activity cleanup in `enforceRemoveRun`

---

## Zone 8 — Clips (Recording, Posting, Tagging, Approval)

**Responsibility:** Recording, trimming, uploading, playing, tagging, and approving gym clips. Owns the `gymClips` Firestore collection (top-level, flat). Clip lifecycle: `pending → ready_raw → processing → ready`. Tagging writes and approval flow are backend-controlled via Cloud Functions.

### Backend (in runcheck-backend)
| File | Role |
|------|------|
| `functions/src/clipFunctions.ts` | `createClipSession` (reserves slot, per-session + weekly guards) + `finalizeClipUpload` (validates, writes clip doc with taggedPlayers + taggedUserIds) |
| `functions/src/deleteClip.ts` | User callable: soft-delete own clip. Admins can delete any. |
| `functions/src/addClipToProfile.ts` | User callable: tagged user sets own `addedToProfile: true`. **Only path for taggedPlayers client writes.** |
| `functions/src/featureClip.ts` | Admin callable: feature clip as daily highlight. |
| `functions/src/unfeatureClip.ts` | Admin callable: remove daily highlight. |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useUserClips.js` | User's own clips by `uploaderUid`. |
| `hooks/useTaggedClips.js` | Clips user is tagged in. V1 client-side filtering (100 recent clips). Returns `allTagged`, `featuredIn`, `refetch`. |

### Screen Layer
| File | Role |
|------|------|
| `screens/RecordClipScreen.js` | Camera recording (≤30s). |
| `screens/TrimClipScreen.js` | Trim UI + tag picker + post. Calls `createClipSession` + upload + `finalizeClipUpload`. |
| `screens/ClipPlayerScreen.js` | Full-screen playback, tagged player chips, like/delete/report, "Add to my profile" button. |

### Display Integration
| File | Role |
|------|------|
| `screens/ProfileScreen.js` | "My Clips" + "Tagged In" + "Featured In" sections (own profile). |
| `screens/UserProfileScreen.js` | "Clips" + "Featured In" sections (public profile). |
| `screens/RunDetailsScreen.js` | Clip tiles for the gym, "Post Clip" bottom sheet entry point. |

### Native Module
| File | Role |
|------|------|
| `modules/video-trimmer/` | On-device trim: iOS (AVFoundation), Android (Media3 Transformer). |

### Hook Layer
| File | Role |
|------|------|
| `hooks/useFeaturedClip.js` | Real-time subscription to `gymClips` where `isDailyHighlight == true` (limit 5). Client-side filters: not hidden, status ready/ready_raw, featuredAt within 24 hours. Resolves video URL, thumbnail, uploader info, gym name. Used by HomeScreen spotlight card. |

### Key Firestore Collections
- `gymClips/{clipId}` — deterministic ID (`{scheduleId}_{uid}` or `presence_{gymId}_{uid}`)

### Important Constraints
- **All writes to `taggedPlayers` go through `addClipToProfile` Cloud Function** — NEVER via client-side `updateDoc`. Firestore rules block client `taggedPlayers` writes.
- `taggedUserIds` is backend-written (immutable from client) — exists for Firestore rule compatibility.
- Per-session duplicate guard and weekly cap are independent: deleting restores weekly slot but NOT session slot.
- `useTaggedClips` uses client-side filtering (Firestore limitation: `array-contains` can't match sub-fields of map arrays). Future: use `taggedUserIds` for native query.

### Zone Overlap
- `screens/ProfileScreen.js` (Zone 3) renders "Tagged In" and "Featured In" sections.
- `screens/UserProfileScreen.js` (Zone 3) renders "Featured In" section.
- `screens/RunDetailsScreen.js` (Zone 1) is the entry point for clip posting and displays clip tiles.

---

## Zone 5 — Backend / Cloud Functions

**Responsibility:** Firebase configuration, client-side service layer for data reads/writes, migration scripts, and the interface to Cloud Functions. Cloud Functions themselves are deployed separately (no `/functions` directory exists in this repo at time of mapping — functions are managed in a separate project or deploy context).

### Firebase Config
| File | Role |
|------|------|
| `config/firebase.js` | Firebase app initialization; exports `db`, `auth`, `storage` |
| `config/env.js` | Environment variable access |
| `.env` | Local environment secrets (never commit) |
| `.env.example` | Template for required environment variables |

### Service Layer (shared across zones)
| File | Role |
|------|------|
| `services/gymService.js` | `getAllGyms`, `getGym`, `subscribeToGyms`, `subscribeToGym` (read-only; `seedGyms` deprecated) |
| `services/models.js` | Shared data model definitions / factory functions |
| `services/index.js` | Barrel export for all services |

### Migration / Seed Scripts
| File | Role |
|------|------|
| `scripts/migrateSkillLevels.js` | One-time migration for skill level normalization |
| `scripts/seedDatabase.js` | Seeds gym and test data |
| `scripts/testFirestore.js` | Ad-hoc Firestore query testing |
| `scripts/testFunctions.js` | Ad-hoc Cloud Function call testing |
| `scripts/verifyGymCoordinates.js` | Verifies gym location data |
| `scripts/weeklyReset.js` | Weekly stat reset — manual admin backup (dry-run by default; `COMMIT=true` to write) |
| `scripts/repairReliabilityScores.js` | **One-time admin repair script** (added 2026-03-25). Recalculates `reliability.score` for all users from stored counters using canonical formula. Dry-run by default; `DRY_RUN=false` to commit. Fixes scores written before the `totalAttended < 3` lock was added to `onScheduleWrite.ts` / `detectRunNoShows.ts`. |
| `runcheck-backend/functions/src/weeklyReset.ts` | **Automated** weekly reset Cloud Function — runs every Monday 00:05 CT via Cloud Scheduler; saves top 3 winners + batch-resets `weeklyPoints` |
| `seedProductionGyms.js` | **Single source of truth** for gym data. Validates all entries (required fields, enums, coordinates, ID format, image host). Seeds via `set(merge:true)`. Warns on non-Firebase-Storage image URLs. Run with `--validate` for dry run. |

### Test Layer
| File | Role |
|------|------|
| `__tests__/config/firebase.test.js` | Firebase config initialization tests |
| `__tests__/integration/checkIn.test.js` | Integration tests for check-in flow |
| `__tests__/services/gpsValidation.test.js` | Tests for GPS distance validation logic |

### Key Constraints
- Cloud Functions own all reliability writes — do not call deprecated methods from the client
- `serviceAccountKey.json` is for migration scripts only — never import in app code
- GPS distance check in `presenceService.checkIn` is currently commented out — do not remove the comment without an explicit task
- **Gym writes are admin-only** — the client app is read-only for the `gyms` collection. All gym data changes go through `seedProductionGyms.js`. Firestore rules block client `create` and `delete`; `update` is restricted to system-managed counter fields only.
- **Gym images are migrating to Firebase Storage** — path convention: `gymImages/{gymId}.jpg`. Storage rules: public read, write blocked (admin uploads via console/gsutil). The seed script warns on non-Firebase-hosted imageUrls.

---

## Possible Zone Overlap

The following files serve multiple zones and should be treated carefully when making changes. Modifying them may have effects outside the zone you are working in.

| File | Zones | Overlap Reason |
|------|-------|----------------|
| `services/runService.js` | Zone 1 + Zone 2 | Writes activity docs as a side effect of run creation/join |
| `screens/HomeScreen.js` | Zone 2 + Zone 4 | Owns the activity feed query (Zone 2) AND the main dashboard shell (Zone 4) |
| `screens/PlanVisitScreen.js` | Zone 1 + Zone 4 | Subscribes to `subscribeToAllUpcomingRuns` (Zone 1) for "Runs Being Planned" section; navigates to RunDetailsScreen. Also uses `joinExistingRun` (Zone 1) for the "Join Run" CTA on matching visit run cards. Uses `startOrJoinRun` (Zone 1) for the Step 4 and visit-card "Start Run" shortcuts. Visit scheduling signals now directly influence run discovery UX. Primary home is Zone 4. |
| `services/presenceService.js` | Zone 2 + Zone 5 | Writes activity docs (Zone 2) AND owns check-in/check-out logic (Zone 5 / shared) |
| `hooks/useGymPresences.js` | Zone 1 + Zone 4 | Used by RunDetailsScreen (Zone 1) and presence display in HomeScreen (Zone 4) |
| `hooks/useGymSchedules.js` | Zone 1 + Zone 4 | Used by RunDetailsScreen (Zone 1) for scheduled visit counts |
| `screens/GymsScreen.js` | Zone 1 + Zone 4 | Possibly an earlier version of ViewRunsScreen or a gym-list component — verify before editing |
| `constants/theme 2.js` | Zone 4 | Appears to be a duplicate of `theme.js` — may be safe to delete but verify no imports first |
| `components/ReportModal.js` | Zone 4 + Zone 7 | Shared report submission UI used by screens in multiple zones; moderation enforcement is handled server-side |
| `screens/ProfileScreen.js` | Zone 3 + Zone 7 + Zone 8 | Owns user profile (Zone 3), Admin Tools badge (Zone 7), and "Tagged In"/"Featured In" clip sections (Zone 8) |
| `screens/UserProfileScreen.js` | Zone 3 + Zone 8 | Owns public profile (Zone 3) and "Featured In" clip section (Zone 8) |
| `screens/ClipPlayerScreen.js` | Zone 4 + Zone 8 | Full-screen video player (Zone 4) with tagging display and approval button (Zone 8) |

---

## Files Not Yet Classified

| File | Notes |
|------|-------|
| `modules/video-trimmer/` | Native Expo module for video trimming; classified under Zone 8 (Clips). |
| `__mocks__/` | Test mocks for Expo vector icons and React Native vector icons. Infrastructure, not a feature zone. |
| `jest.setup.js` | Test infrastructure. |
| `utils/notifications.js` | Push notification utility: `registerPushToken` — requests permission, retrieves Expo push token, persists to Firestore (`users/{uid}.pushToken`). Called from `MainTabs` mount in `App.js`. Wired as of 2026-03-20. |
| `utils/openMapsDirections.js` | Opens native maps app with directions to a gym location. iOS: Apple Maps or Google Maps via ActionSheet. Android: `geo:` URI. |
| `screens/UsersScreen.js` | **Dev/debug only.** Fetches all `users` docs from the Firestore emulator and lists them. Not registered in production navigation. Used for emulator data verification only. |

---

### Phase 1 Push Notification Backend Files (in runcheck-backend)
| File | Role |
|------|------|
| `functions/src/notificationHelpers.ts` | Internal module (not a Cloud Function). `sendExpoPush()` — calls Expo Push API. `checkAndSetCooldown()` — Firestore transaction deduplication via `users/{uid}.notifCooldowns`. |
| `functions/src/notifyRunStartingSoon.ts` | Scheduled Cloud Function (every 5 min). Run start reminders → all participants. |
| `functions/src/onRunParticipantJoined.ts` | Firestore onCreate trigger on `runParticipants/{docId}`. Participant joined → run creator. |
| `functions/src/onParticipantCountMilestone.ts` | Firestore onUpdate trigger on `runs/{runId}`. Milestone crossed (5/10/20 players) → run creator. |
| `functions/src/notifyFollowersRunCreated.ts` | Firestore onCreate trigger on `runs/{runId}`. Run created → all gym followers (except creator). Cooldown key `followRunCreated_{runId}`, 24h TTL. |
| `functions/src/onRunCreatedNotifyScheduledVisitors.ts` | Firestore onCreate trigger on `runs/{runId}`. Run created → users with a matching scheduled visit at the same gym within ±60 min. Uses existing `(gymId, status, scheduledTime)` composite index. Cooldown key `scheduleRunCreated_{runId}`, 24h TTL. Added 2026-03-29. |

---

_Last updated: 2026-03-29 (Updated PlanVisitScreen role description — co-planner signal layer, Start Run shortcut, Join Run CTA, joinExistingRun usage. Updated PlanVisitScreen Zone Overlap entry to document joinExistingRun and startOrJoinRun dual usage. Added `notifyFollowersRunCreated.ts` and `onRunCreatedNotifyScheduledVisitors.ts` to Phase 1 Push Notification Backend Files table. Previous: 2026-03-26 — Added `utils/sanitize.js` to Zone 3 utility layer. Added `scripts/repairReliabilityScores.js` to Zone 5 migration scripts.)_
_Zones determined by: file name patterns, service dependency analysis, screen comment headers, and BACKEND_MEMORY.md data model._
