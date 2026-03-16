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
| `screens/RunDetailsScreen.js` | Per-gym detail view; renders run cards, join/leave buttons, participant count |
| `screens/ViewRunsScreen.js` | Browse all gyms; shows activity-level badges and navigates to RunDetails |
| `screens/RunsScreen.js` | Tab-level wrapper for the Runs navigation stack |

### Test Layer
| File | Role |
|------|------|
| `__tests__/screens/RunDetailsScreen.test.js` | Tests for RunDetailsScreen |
| `__tests__/screens/ViewRunsScreen.test.js` | Tests for ViewRunsScreen |

### Key Firestore Collections
- `runs/{autoId}` — one document per run
- `runParticipants/{runId}_{userId}` — one document per participant per run

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
| `screens/ProfileScreen.js` | Full profile dashboard: reliability score card, session stats grid, courts list, friends, settings, sign-out |
| `screens/UserProfileScreen.js` | View another user's profile (read-only) |
| `screens/LoginScreen.js` | Auth: email/password sign-in |
| `screens/SignupScreen.js` | Auth: new account registration |

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

### Key Firestore Collections
- `users/{uid}` — profile, reliability sub-object, activePresence (denormalized)
- `schedules/{scheduleId}` — individual schedule records
- `friendRequests/{autoId}` — incoming/outgoing friend requests

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
| `screens/CityGateScreen.js` | One-time post-signup city availability gate |
| `screens/PremiumScreen.js` | Premium features screen |
| `screens/LeaderboardScreen.js` | Community leaderboard |
| `screens/CheckInScreen.js` | GPS check-in flow |
| `screens/PlanVisitScreen.js` | Schedule a future gym visit |
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
| `hooks/useMyGymRequests.js` | Real-time subscription to current user's `gymRequests` docs, ordered newest-first; exposes `{ requests, loading, count }` |

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
| `screens/PlanVisitScreen.js` | Zone 1 + Zone 4 | Subscribes to `subscribeToAllUpcomingRuns` (Zone 1) for "Runs Being Planned" section; navigates to RunDetailsScreen. Primary home is Zone 4. |
| `services/presenceService.js` | Zone 2 + Zone 5 | Writes activity docs (Zone 2) AND owns check-in/check-out logic (Zone 5 / shared) |
| `hooks/useGymPresences.js` | Zone 1 + Zone 4 | Used by RunDetailsScreen (Zone 1) and presence display in HomeScreen (Zone 4) |
| `hooks/useGymSchedules.js` | Zone 1 + Zone 4 | Used by RunDetailsScreen (Zone 1) for scheduled visit counts |
| `screens/GymsScreen.js` | Zone 1 + Zone 4 | Possibly an earlier version of ViewRunsScreen or a gym-list component — verify before editing |
| `constants/theme 2.js` | Zone 4 | Appears to be a duplicate of `theme.js` — may be safe to delete but verify no imports first |

---

## Files Not Yet Classified

| File | Notes |
|------|-------|
| `modules/video-trimmer/` | Native Expo module for video trimming; used by TrimClipScreen and RecordClipScreen. Not clearly within any of the five feature zones — treat as a standalone native module. |
| `__mocks__/` | Test mocks for Expo vector icons and React Native vector icons. Infrastructure, not a feature zone. |
| `jest.setup.js` | Test infrastructure. |

---

_Last updated: 2026-03-15_
_Zones determined by: file name patterns, service dependency analysis, screen comment headers, and BACKEND_MEMORY.md data model._
