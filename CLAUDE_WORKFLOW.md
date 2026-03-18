# Claude Workflow — RunCheck

This file defines how Claude should operate when working in this repository.
These rules exist to keep changes safe, minimal, and auditable.

---

## Scope Gate (Read This First)

Before starting any task, verify one of the following is true:

1. **The task is on `LAUNCH_CHECKLIST.md`** — it's launch-critical and already approved.
2. **The user explicitly requested it this session** — even if it's not on the checklist, the user has approved it as an exception.

If neither is true, **do not start the work**. Instead:
- Note the idea in `PARKING_LOT.md` with a brief description.
- Tell the user: "This doesn't appear to be on the launch checklist. I've added it to PARKING_LOT.md. Want me to proceed anyway?"

This rule exists to prevent scope creep during pre-launch. It applies to all work — bug fixes, features, refactors, and polish.

---

## Core Principles

### 1. Make the Smallest Safe Change Possible
Every implementation should touch the fewest files and lines necessary to solve the declared problem. Avoid the temptation to clean up, reorganize, or improve adjacent code unless that work is explicitly part of the task.

### 2. Do Not Refactor Unrelated Code
If you notice a code smell, a naming inconsistency, or a pattern you would do differently, note it in a comment or in the task file — but do not fix it unless instructed. Unrelated changes make diffs harder to review and introduce risk.

### 3. Do Not Modify the Firestore Schema Unless Instructed
The Firestore collections and field definitions are documented in `BACKEND_MEMORY.md`. Do not add, rename, or remove fields on any Firestore document without an explicit instruction and a schema change note in `BACKEND_MEMORY.md`.

### 4. Do Not Modify Cloud Function Logic from the Client
Reliability writes (`updateReliabilityOnAttend`, `updateReliabilityOnNoShow`, etc.) are owned by the backend Cloud Functions. The client is read-only for these operations. Do not re-add these writes to any service or hook.

### 5. Identify Files Before Implementing
Before writing any code, list the files you plan to modify and state why each one needs to change. Do not modify files outside that declared set without flagging it first.

### 6. Avoid Editing Files Outside the Declared Scope
If a fix requires touching a file that wasn't in the original scope, pause and note it. Either expand the scope explicitly (update the task) or extract the adjacent change into a separate task.

### 7. Summarize Files Changed After Implementation
At the end of every implementation, provide a brief summary:
- Which files were modified and what changed in each
- Which files were considered but left unchanged, and why
- Any follow-up tasks identified during the work

---

## Pre-Implementation Checklist

Before writing any code for a task:

- [ ] Read the task definition in `DEV_TASKS.md`
- [ ] Read the relevant sections of `BACKEND_MEMORY.md` for any collections or services involved
- [ ] Identify the files in `ARCHITECTURE_MAP.md` that belong to the affected zone
- [ ] List the specific files you plan to modify
- [ ] Confirm the fix does not require a Firestore schema change
- [ ] Confirm the fix does not require a Cloud Function change (or flag it if it does)

---

## Implementation Rules

### Services (`services/`)
- Never add reliability writes — those belong to Cloud Functions
- Never add gym document writes — gym data is admin-only via `seedProductionGyms.js`. The client is read-only for the `gyms` collection.
- Never add direct writes to `gymRequests` — all writes go through the `submitGymRequest` Cloud Function
- Never write moderation fields directly from the client (`isHidden`, `isRemoved`, `isSuspended`, report `status`, etc.) — all moderation writes go through Cloud Functions. `moderationHelpers.ts` is the single source of truth for enforcement logic.
- **Never write `taggedPlayers` directly from the client** — all `taggedPlayers` mutations (specifically `addedToProfile`) go through the `addClipToProfile` Cloud Function. Firestore rules block client-side `taggedPlayers` writes on `gymClips`. The `taggedUserIds` flat array is backend-written and immutable from client.
- Prefer modifying query filters over adding new queries
- Do not change function signatures unless required; add optional parameters if needed
- All new Firestore reads must use existing indexes (check `BACKEND_MEMORY.md`)

### Hooks (`hooks/`)
- Hooks should remain thin wrappers over services
- Do not add business logic to hooks — put logic in services
- If a hook needs to expose a new derived value, compute it inside the hook from existing data rather than adding a new Firestore read

### Screens (`screens/`)
- Screens should not call Firestore directly — use hooks and services
- Exception: HomeScreen currently queries Firestore directly for the activity feed (known pattern, acceptable for now)
- Do not restructure screen layouts or component hierarchies as part of a bug fix

### Components (`components/`)
- Do not modify shared components as a side effect of a screen fix
- If a component needs to change, declare it as part of the task scope

---

## Testing
- Tests live in `__tests__/` and mirror the `screens/` and `services/` directory structure
- After any change to a service or screen, check whether an existing test covers the changed behavior
- Do not delete or skip existing tests
- New tests are encouraged but not required for every bug fix

---

## What to Do If You Are Unsure
- Check `BACKEND_MEMORY.md` first — it is the source of truth for data model and service behavior
- Check `ARCHITECTURE_MAP.md` to confirm which zone owns the code in question
- If a file's ownership is ambiguous, note it under "Possible Zone Overlap" rather than guessing
- If a fix would require changes in more than two zones simultaneously, flag it before proceeding

---

## End-of-Session Documentation

After every session where code or architecture changed, update documentation before closing out:

1. **`PROJECT_MEMORY.md`** — Add a "Files Modified Recently" entry with the session date, files touched, and what changed in each.
2. **`BACKEND_MEMORY.md`** — Update if any backend schema, service behavior, business rules, or Cloud Function logic changed.
3. **`ARCHITECTURE_MAP.md`** — Update if new files were created, files were moved, or zone ownership changed.
4. **`LAUNCH_CHECKLIST.md`** — Check off completed items. Update status notes on in-progress items.
5. **`PARKING_LOT.md`** — Add any ideas that surfaced during the session but were deferred.

Also reconcile: compare what was planned at session start vs. what actually happened. If the session drifted from the original task, note why.

If the session was documentation-only (like this one), no memory update is required beyond updating the files themselves.

---

_Last updated: 2026-03-18_
