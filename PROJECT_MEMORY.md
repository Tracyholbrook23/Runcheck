# RunCheck — Project Memory Snapshot
_Last updated: 2026-02-24_

## Goal
A React Native mobile app where basketball players check into gyms in real time, see who's playing, earn rank points, and follow gyms.

## Tech Stack
- React Native (Expo) + React Navigation v7
- Firebase: Firestore, Auth, Storage
- firebase-admin (migration scripts only)
- DropDownPicker, Ionicons, Animated API

## Key Architectural Decisions
- Presence doc ID is a compound key `{userId}_{gymId}` — prevents duplicate active presences
- `Timestamp.now()` (not `serverTimestamp()`) for activity `createdAt` — required so docs appear immediately in `>=` inequality queries
- `presenceService` is the single owner of activity feed writes on check-in; `CheckInScreen` does not write activity docs
- `checkOut(isManual)` param gates point deduction and activity deletion — manual=true deducts 10 pts, auto-expiry=false keeps them
- `RANKS` in `utils/badges.js` is the single source of truth for tier colors, thresholds, and glow values
- Skill level valid values are `['Casual', 'Competitive', 'Either']`; all screens normalize legacy values to `'Casual'`

## Currently Working
- Check-in flow: GPS validation (disabled for testing), presence write, activity feed write, points award
- Check-out flow: manual deducts 10 pts + deletes activity entry; auto-expiry preserves points
- Activity feed on HomeScreen with tappable rows navigating to UserProfileScreen
- Badge/rank system: Bronze/Silver/Gold/Platinum with correct distinct colors
- Skill level migration script at `scripts/migrateSkillLevels.js`
- UserProfileScreen and ProfileScreen normalize legacy skill level values

## Known Issues / Risks
- GPS distance enforcement is commented out in both `usePresence.js` and `presenceService.js` — must be re-enabled before launch
- Auto-expiry is client-side only; a Cloud Function is needed to expire presences server-side without deducting points
- No composite Firestore index for `activity` collection query (`createdAt >= X, orderBy createdAt`) — may need manual index creation for scale

## Next 3 Tasks
1. Re-enable GPS distance enforcement in `usePresence.js` and `presenceService.js` (remove the commented-out blocks)
2. Build the Cloud Function for auto-expiry: mark presence expired + decrement gym count + clear `activePresence`, call `checkOut(isManual=false)`
3. Add a Firestore composite index for the `activity` collection on `(createdAt DESC)` and confirm the HomeScreen feed query is covered
