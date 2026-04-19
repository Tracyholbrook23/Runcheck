# Current Focus — Launch Prep

One goal this phase: ship a reliable Texas launch. Nothing else.

## Active Now

1. **Fix gym coordinate accuracy.** Audit Texas gym docs, correct lat/lng so map pins land on the actual building.
2. **Auto-remove empty runs.** When the last player leaves a run, the run is deleted (or marked ended) so the live list stays clean.
3. **Data integrity sweep for Texas gyms.** Standardize names, addresses, hours, and required fields across all Texas gym documents.
4. **Reliability of join/leave flow.** Confirm the leave action consistently triggers the empty-run cleanup in production.
5. **Pre-launch smoke test.** Walk the find → join → leave → schedule path on a real device against production data.

## Paused

- New features of any kind (chat, notifications, profiles, social, stats).
- Expansion beyond Texas gyms.
- UI redesigns, theme changes, animation polish.
- Refactors, dependency upgrades, test framework changes.
- Schema changes to Firestore or new Cloud Functions not required by the five items above.
- Backend repo work that is not in service of the Active Now list.

## Rules for this phase

- If a task is not on the Active Now list, it goes to `PARKING_LOT.md`. No exceptions without explicit approval.
- Smallest safe change only. No drive-by cleanup.
- Client stays read-only for reliability, moderation, gym docs, and `taggedPlayers`.
- Do not modify Firestore schema or Cloud Function logic unless the task above requires it.
- Read only the files needed for the current task. No full-repo scans.
- "Nice to have" = paused. Only "blocks Texas launch" is Active Now.
