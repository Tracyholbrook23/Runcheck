# RunCheck Workflow

Rules for every Claude session. Read this first.

## Session Start

1. Read `runcheck-brain/00_PROJECT_OVERVIEW.md`, `01_CURRENT_FOCUS.md`, and this file.
2. Summarize current focus in 3 lines. Ask what to work on.
3. Do NOT start coding until the user picks a task.

## Scope Gate

Before starting any task, one of these must be true:
- The task is on `LAUNCH_CHECKLIST.md`, OR
- The user explicitly approved it this session.

If neither: add it to `PARKING_LOT.md` and ask "proceed anyway?"

## Two Modes

- **Planning** (default): summarize, confirm, ask. No code.
- **Execution**: only after a task is picked. Follow the rules below.

## Core Rules

1. Make the smallest safe change. No unrelated cleanup or refactors.
2. List the files you will modify before editing. Do not touch files outside that list.
3. Do NOT change Firestore schema or Cloud Function logic unless explicitly asked.
4. The client is read-only for reliability, moderation, gym docs, and `taggedPlayers`.
5. Do NOT scan the whole project. Read only the files you need.

## Sources of Truth

- `ARCHITECTURE_MAP.md` — file-to-zone mapping. Load only the relevant zone.
- `BACKEND_MEMORY.md` — schema, services, indexes. Load only the relevant section.
- If a file's owner or rule is ambiguous, flag it. Do not guess.

## After Implementing

1. List files changed and what changed in each.
2. Note anything considered but left alone, and why.
3. Add follow-ups to `PARKING_LOT.md`.
4. Update `ARCHITECTURE_MAP.md` or `BACKEND_MEMORY.md` only if structure or schema moved.

## Deploying to TestFlight (Physical Device)

The TestFlight build was built with the `production` profile (`eas.json`) and is linked to the `production` channel. The `preview` profile has no channel and cannot receive OTA updates.

**To push JS changes to the physical device:**
```
cd RunCheck
eas update --channel production --message "<short description>"
```

Then on the phone: fully close the app (swipe away from app switcher) and reopen it. It downloads the update on first launch and applies it on the next open — so two full close+reopens may be needed.

The simulator picks up changes directly from Metro (no OTA needed). Physical device always requires `eas update --channel production`.
