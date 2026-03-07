# RunCheck — Project Memory Snapshot
_Last updated: 2026-03-06_

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

## Key Architectural Decisions
- Presence doc ID is a compound key `{userId}_{gymId}` — prevents duplicate active presences
- `Timestamp.now()` (not `serverTimestamp()`) for activity `createdAt` — required so docs appear immediately in `>=` inequality queries
- `presenceService` is the single owner of activity feed writes on check-in; `CheckInScreen` does not write activity docs
- `checkOut(isManual)` param gates point deduction and activity deletion — manual=true deducts 10 pts, auto-expiry=false keeps them
- `RANKS` in `utils/badges.js` is the single source of truth for tier colors, thresholds, and glow values
- Skill level valid values are `['Casual', 'Competitive', 'Either']`; all screens normalize legacy values to `'Casual'`
- **Single source of truth for player counts**: always derive from real-time `livePresenceMap` / `presences` — never from `gym.currentPresenceCount` (that's a stale Firestore counter)
- **Deduplication**: a user can have two presence docs in edge cases; always dedup by `odId` using a `Set` before counting or rendering

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
- Live Runs section on HomeScreen: real-time cards with avatars, player count, energy label, empty state
- RunDetailsScreen: Now Playing list deduped by odId; playerCount matches row count
- PresenceList navigation fixed (nested navigator path)

## Files Modified Recently (2026-03-05 session)
| File | What changed |
|---|---|
| `components/PresenceList.js` | Fixed nested nav: `navigate('Home', { screen: 'UserProfile', params })` |
| `screens/HomeScreen.js` | Energy labels, totalActive from livePresenceMap, empty state with Check In button, per-card dedup + guard, debug logs |
| `screens/RunDetailsScreen.js` | Removed fake data (fakePlayers etc.), added uniqueActivePresences useMemo, playerCount from unique count, debug logs |

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
- `gym.currentPresenceCount` is a stale denormalized counter — do NOT use it for display; always use real-time presence data

## Next Tasks
1. Remove `__DEV__` debug logs from HomeScreen.js and RunDetailsScreen.js (after confirming counts look correct)
2. Re-enable GPS distance enforcement in `usePresence.js` and `presenceService.js` (remove the commented-out blocks)
3. Build the Cloud Function for auto-expiry: mark presence expired + decrement gym count + clear `activePresence`, call `checkOut(isManual=false)`
4. Add a Firestore composite index for the `activity` collection on `(createdAt DESC)` and confirm the HomeScreen feed query is covered
5. Set `cli.appVersionSource` in eas.json (EAS warned this will be required in the future)

## How to Give Claude Context at Start of Each Session
Tell Claude: "Read PROJECT_MEMORY.md in my Runcheck folder before we start."
Or just open a new Cowork session — Claude will find and read this file automatically.
