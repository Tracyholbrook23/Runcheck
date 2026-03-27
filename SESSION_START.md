# RunCheck — Session Start

Read this file first at the beginning of every Claude session.
It defines what RunCheck is, what phase we are in, and what kind of work is allowed.

---

## What is RunCheck?

RunCheck is a React Native (Expo) + Firebase mobile app for pickup basketball players. Users can find gyms, start or join group runs, see who is playing in real time, track their reliability score, earn rank points, and share short basketball clips.

Tech: React Native 0.81.5 + Expo SDK 54 + Firebase v12 (Firestore, Auth, Storage). Cloud Functions handle server-side logic. No custom backend server.

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

## Quick Handoff — Start Here Tomorrow (2026-03-27 session end)

**What was fixed today:**
- AdminAllClipsScreen composite index errors (isHidden+hiddenAt, isDeletedByUser+deletedAt)
- expireClips.ts: raw file deletion guard prevents permanently broken clips
- storagePath vs finalStoragePath: reverted incorrect client-side changes across 7 files — storagePath is always authoritative
- Age validation: COPPA-compliant (13–100), integer stored in Firestore
- OnboardingHomeCourtScreen: location button, search bar, request-gym row, distance labels
- RequestGym navigation error from onboarding: registered in root stack
- ProfileStack dark-mode back button: added screenOptions NAV_HEADER

**Root causes discovered:**
- finalStoragePath is written at finalization as a reserved path but may point to a non-existent file if processor failed. storagePath is always the live playback field.
- expireClips was deleting raw files for clips where raw was the only copy (storagePath === rawStoragePath). Now guarded.

**What still needs manual action:**
1. Firebase Console → Firestore → `gymClips/presence_cowboys-fit-pflugerville_SMQUyWWMUOZpBHYN7pWlt15b6CB3` → set `isHidden = true`
2. `firebase deploy --only firestore:indexes` (isHidden+hiddenAt and isDeletedByUser+deletedAt indexes)
3. `firebase deploy --only functions:expireClips` (raw deletion guard)
4. Fresh iOS build (~April 1 when EAS quota resets) — current TestFlight binary missing OTA channel header
5. Full real-device QA pass after fresh build

**First recommended task tomorrow:**
Run the two pending deploys (#2 and #3 above), then do manual Firestore fix (#1). After that: real-device QA pass on onboarding flow (location button, home court selection, request-gym nav) and verify AdminAllClipsScreen Hidden/Deleted tabs load without errors.

_Last updated: 2026-03-27_
