# RunCheck — Beta Hide-For-Launch Checklist

Conservative sweep of features that should be **hidden**, **disabled**, or marked **Coming Soon** before the beta ships. Goal: reduce confusion, protect trust, let testers see only polished/core functionality.

No code changes implied by this list — decisions first, implementation separately.

---

## 1. Clips (highlight video recording, posting, tagging, featuring)

**Why hide:** User flagged as "not ready." `LAUNCH_CHECKLIST.md` already has an open scope decision ("Clips feature scope decision") recommending Option A (disable for MVP) unless on-device QA comes back clean. Many surfaces, high support cost if it's flaky.

**Likely files involved:**
- `App.js` (lines 40, 41, 58, 72, 115, 149–152, 224 — RecordClipScreen, TrimClipScreen, ClipPlayerScreen, CreatePrivateRunScreen registered in nav stacks)
- `screens/RunDetailsScreen.js` (Gym Highlights section ~line 2086; `handlePostClip` + Post tile ~lines 1185, 2104–2153; clip tiles FlatList ~line 2128)
- `screens/ProfileScreen.js` (My Clips section ~line 1068; Tagged In section ~line 1158; Featured In section ~line 1231; `useUserClips`/`useTaggedClips` imports line 56)
- `screens/UserProfileScreen.js` (Clips + Featured In sections — confirm in file)
- `screens/HomeScreen.js` (featured clip spotlight card ~line 1114; `useFeaturedClip` import line 55, usage line 165)
- `screens/RecordClipScreen.js`, `screens/TrimClipScreen.js`, `screens/ClipPlayerScreen.js`
- `hooks/useUserClips.js`, `hooks/useTaggedClips.js`, `hooks/useFeaturedClip.js`
- `modules/video-trimmer/` (native module)

**Recommended action:** **Hide.** Comment out nav registrations for Record/Trim/ClipPlayer screens; gate the Post Clip tile, Gym Highlights section, HomeScreen spotlight card, and Profile clip sections behind a single `BETA_FLAGS.clipsEnabled = false` constant so they render nothing in beta. Leave the Cloud Functions and Firestore rules alone — no backend change. Keep admin clip screens accessible only to admins (already gated by `useIsAdmin`).

---

## 2. Premium page + Private Run / Paid Run entry points

**Why hide:** User flagged "Premium page is poorly positioned / users don't feel incentive." `LAUNCH_CHECKLIST.md` explicitly lists "Premium/monetization features (PremiumScreen exists but no billing)" under Post-Launch. Showing paywalled features with no billing wired is confusing.

**Likely files involved:**
- `screens/PremiumScreen.js` (full premium pitch screen)
- `screens/CreatePrivateRunScreen.js` (UI-only teaser, already shows "Coming Soon" modal)
- `screens/ProfileScreen.js` — **Premium Teaser card** ~line 1335, `navigate('Premium')` ~line 1339. Already labeled "Coming Soon" but still drives traffic into an unpolished screen.
- `screens/HomeScreen.js` — **type sheet Private Run + Paid Run options with ⚡ Premium chips** ~lines 1489–1538. Both navigate to `CreatePrivateRunScreen`.
- `App.js` — `Premium` and `CreatePrivateRun` screens registered in nav (lines 147, 148, 208)
- `config/perks.js` — `PREMIUM_OVERRIDES`, `private_runs` perk

**Recommended action:** **Hide both entry points** for beta. Specifically: remove the Premium Teaser card from `ProfileScreen.js` and the Private Run + Paid Run options from the HomeScreen type sheet (leave only Open Run). Leave `PremiumScreen` + `CreatePrivateRunScreen` registered in nav so deep links don't crash, but no UI should link to them. Revisit value prop / positioning post-beta before re-exposing.

---

## 3. Leaderboard "Last Week's Winners" (confusing date copy)

**Why hide:** User flagged the "week of April 20" text as confusing. Ambiguous whether it's the week that just ended or the current week. Small surface, easy to hide until copy is fixed.

**Likely files involved:**
- `screens/LeaderboardScreen.js` — "Last Week's Winners" section ~lines 393–479; `formatWeekOf` helper ~line 306; `winnersSubtitle` ~line 401

**Recommended action:** **Hide the "Last Week's Winners" section** for beta (wrap the `{weeklyWinners.length > 0 && (...)}` block in a `BETA_FLAGS.weeklyWinnersEnabled` gate). Keep the main leaderboard list and current-week rankings — those are fine. Fix the copy to "Week ending [date]" post-beta and re-enable.

---

## 4. Rank tiers — review for motivation, not outright hide

**Why:** User said "rank tiers are not finalized or motivating yet," but the checklist already marks "Rank tier system functional (Bronze → Legend, 6 tiers)" as done. This feels like a copy/balance concern, not a broken feature. Hiding ranks removes a core gamification loop.

**Likely files involved:**
- `config/ranks.js` (tier definitions)
- `utils/rankHelpers.js` (computation)
- `screens/ProfileScreen.js` — rank card ~line 731
- `screens/LeaderboardScreen.js` — next-rank progress ~line 382

**Recommended action:** **Leave visible.** Flag for a copy/thresholds review post-beta. If you want a beta version, consider showing only the current tier and progress-to-next without the full 6-tier ladder, but that's heavier lift than the other items here.

---

## 5. Player/Gym Review system — QA gate, not a hide

**Why:** User said "Player review system needs full testing (must be reliable and display properly)." In the codebase this is actually the gym review feature ("Player Reviews" in docs = user-written reviews of gyms, `gyms/{gymId}/reviews`). It's wired and listed as functional but user wants confidence it renders correctly.

**Likely files involved:**
- `services/reviewService.js`
- `screens/GymReviewsScreen.js`
- `screens/RunDetailsScreen.js` — reviews section + submit modal ~line 2236

**Recommended action:** **QA gate, not a hide.** Spend 30 minutes on device: submit a review, edit, make sure star counts and "Verified Run" badges render, confirm one-review-per-gym guard works. If anything is broken, hide the submit button via a `BETA_FLAGS.reviewsSubmitEnabled` flag and keep the read path. If it works, ship it.

---

## 6. Push Notifications toggle in Settings (placeholder switch)

**Why hide:** `screens/SettingsScreen.js` ~line 239 renders a Push Notifications toggle that is `disabled` with no handler. Users see a switch they can't interact with — implies broken.

**Likely files involved:**
- `screens/SettingsScreen.js` lines 239–257

**Recommended action:** **Hide the row** (or remove the toggle and keep a subtitle "Push notifications are on" / "Managed by your device" if that matches reality). Also confirm that the 4 notification types the user expects (run starting soon, run created at followed gym, friend activity, leaderboard updates) are actually delivered. The backend has 5 notification Cloud Functions deployed per ARCHITECTURE_MAP.md Phase 1 table, but "friend activity" and "leaderboard updates" are not listed there — they likely don't exist yet. Separate item, not a hide, but worth flagging.

---

## 7. UsersScreen (dev/debug — already out of prod nav)

**Why hide:** Already not registered in production navigation per `ARCHITECTURE_MAP.md` ("Dev/debug only. Not registered in production navigation"). No action needed — just confirming it's correctly excluded.

**Likely files involved:** `screens/UsersScreen.js`

**Recommended action:** **Already hidden.** Verify it isn't accidentally added to any stack before beta ship.

---

## Suggested rollup

Add a single beta-flags module (new file `config/betaFlags.js`) that centralizes these toggles so everything can be flipped back on together post-launch without hunting through the codebase:

```
BETA_FLAGS = {
  clipsEnabled: false,           // hides clip post + sections + spotlight
  premiumEnabled: false,         // hides premium teaser + private/paid options
  weeklyWinnersEnabled: false,   // hides Last Week's Winners section
  reviewsSubmitEnabled: true,    // flip to false only if QA fails
}
```

This is the lowest-touch pattern for hide-for-beta: small, reversible, centralized. No backend changes. No schema changes. No data migrations. Everything flips back on with one commit post-beta.

---

_Generated 2026-04-22. Source: first-time user testing notes + targeted codebase recon._
