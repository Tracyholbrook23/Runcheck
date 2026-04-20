# RunCheck — Gym Location Audit Tracker

_Last updated: 2026-04-14_

---

## Purpose

This file is the working audit log for the **Launch-Critical Data Integrity** task in `LAUNCH_CHECKLIST.md`. It does not replace that file — it supports it.

`LAUNCH_CHECKLIST.md` tracks whether the gym audit is *done*. This file tracks the audit *gym by gym*, so you can pick up where you left off across sessions and have a written record of every decision made.

When every active gym in this file reaches `VERIFIED` or `FIXED` status, and any `REMOVE` decisions have been applied to Firestore, check off the relevant items in `LAUNCH_CHECKLIST.md`.

**The single rule:** A smaller list of accurate gyms is better than a larger list of inaccurate ones. Users who check in somewhere and it doesn't work, or navigate to a wrong location, lose trust immediately. When in doubt, archive.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| `NOT_STARTED` | Not yet reviewed |
| `NEEDS_REVIEW` | Something looks off — needs investigation before deciding |
| `VERIFIED` | Gym confirmed real, courts confirmed, address and coordinates confirmed correct |
| `FIXED` | Had issues; corrections applied to `seedProductionGyms.js` and re-seeded |
| `REMOVE` | Should be archived — set `status: 'archived'` in seed file and re-seed |

---

## ⚠️ Known Issues (Documented in Seed File)

These issues are grounded in existing comments inside `seedProductionGyms.js`. Review these **first** — the problems are already partially identified.

### Coordinate Inheritance Problems (4 active gyms)

When problematic gyms were archived and replaced with corrected entries, the *coordinates from the wrong location* appear to have been carried over to the replacement. Each of these 4 gyms has identical coordinates to its archived predecessor:

| Active Gym | Its Archived Predecessor | Shared Coordinates | Why This Is a Problem |
|---|---|---|---|
| `northwest-family-ymca-austin` (5807 McNeil Dr) | `ymca-northwest-austin` (12741 N Lamar — not a real YMCA) | `30.4460811, -97.7338527` | Coordinates may point to the wrong Lamar Blvd address, not McNeil Dr |
| `twin-lakes-ymca-cedar-park` (204 E Little Elm Trail) | `cedar-park-ymca` (701 S Bell Blvd — wrong location) | `30.493670200000004, -97.8096247` | Coordinates may point to S Bell, not Little Elm Trail |
| `chasco-family-ymca-round-rock` (1801 N IH-35) | `ymca-round-rock` (301 W Bagdad — not a YMCA) | `30.5263004, -97.68809499999999` | Coordinates may point to Bagdad Ave, not IH-35 |
| `la-fitness-south-lamar` (4001 S Lamar Blvd) | `la-fitness-south-austin` (4501 W William Cannon — archived wrong address) | `30.2348134, -97.79176489999999` | Coordinates may point to William Cannon, not S Lamar Blvd |

### Cowboys Fit Coordinates (1 active gym)

- `cowboys-fit-pflugerville` — was explicitly flagged in `LAUNCH_CHECKLIST.md`'s original Post-Launch section as "Verify Cowboys Fit coordinates with manual Google Maps pin." That note has since been superseded by this full audit, but the underlying concern was never resolved.

### Michigan Batch (Batch 8 — 13 active gyms)

The seed file contains an explicit warning block for all Batch 8 Michigan gyms:

> ⚠️ COORDINATE NOTICE: All Michigan coordinates are best-estimate based on known addresses. Before going live, right-click each location in Google Maps → "What's here?" and replace latitude / longitude with the exact building or court pin. Do NOT rely solely on these estimates.

All 13 active Michigan gyms need coordinate verification before they should be shown to users.

---

## Recommended Audit Workflow

Work through gyms in this order:

**Step 1 — Verify the gym still exists**
- Search the gym name + city on Google Maps. If you see it, it exists. If it's closed, archived, or replaced, mark `REMOVE`.
- Check Google Maps street view / recent photos for signs of permanent closure (boarded windows, "Permanently Closed" label, etc.).

**Step 2 — Confirm basketball courts exist**
- Look at the gym's Google Maps listing. Check "See photos" for court photos. Check "Popular times" (basketball gyms usually show activity peaks). Check reviews that mention basketball.
- For commercial gyms, check the gym's website amenity list.
- If you can't confirm courts exist: call the gym or mark `NEEDS_REVIEW` with a note.

**Step 3 — Verify the address**
- Confirm the address in the seed file matches what's on Google Maps. Pay attention to suite numbers and frontage road vs. main road differences.

**Step 4 — Verify coordinates**
- In Google Maps, right-click the actual building entrance or court area → "What's here?" → note the exact latitude/longitude.
- Compare to the `location` field in `seedProductionGyms.js`. If off by more than a few hundredths of a degree, the check-in radius may not work correctly at the real location.
- For outdoor courts, pin the court itself (not the park entrance).
- Do NOT use a geocoder or address search for coordinates — those return parcel centroids, not building pins. Right-click only.

**Step 5 — Test directions**
- On your phone, open the app, tap directions on the gym card, and confirm Apple Maps / Google Maps opens to the correct building. If the pin drops somewhere wrong, the coordinates need correction.

**Step 6 — Validate check-in radius**
- After correcting coordinates, mentally verify that the `checkInRadiusMeters` (200m default) would cover the actual court. For large campuses or outdoor parks with a distant parking lot, 200m is usually enough. For tiny inline gyms or mall tenants, verify the pin is on the right side of the building.

**Step 7 — Record your findings**
- Update the gym's entry in this file with the correct address/coordinates, status, and notes.
- If changes are needed: update `seedProductionGyms.js`, then re-run `node seedProductionGyms.js` to push corrections to Firestore.

---

## Decision Rules

Use these rules to decide whether to fix or archive a gym:

| Situation | Decision |
|---|---|
| Gym no longer exists (closed, demolished, converted) | `REMOVE` — archive immediately |
| Gym exists but has no basketball courts | `REMOVE` — archive immediately |
| Gym exists, has courts, but address is wrong | `FIXED` — correct address in seed, re-seed |
| Gym exists, has courts, but coordinates are wrong | `FIXED` — correct coordinates in seed, re-seed |
| Gym exists but access is restricted to a group that excludes most users (e.g. private HOA, university-only) | Decision call — if general public cannot realistically access it, consider archiving |
| Gym status is uncertain and you can't confirm | `NEEDS_REVIEW` — leave marked until confirmed; do not show uncertain gyms at launch |
| Two gyms in the list appear to be the same physical location | Keep the one with the better address/coordinates; `REMOVE` the duplicate |

**When in doubt, archive.** Removing a gym you later re-add is much better than keeping a gym that sends users to the wrong place.

---

## Reusable Entry Template

Copy this block for each gym you audit. Delete lines that don't apply.

```
### [Gym Name] — `gym-id`

**Batch:** [1–8]
**Type:** indoor / outdoor
**Access:** paid / free
**Current App Address:** [address from seedProductionGyms.js]
**Current App Coordinates:** [lat, lng from seedProductionGyms.js]

#### Verification Checklist
- [ ] Gym still exists and is operating
- [ ] Basketball courts confirmed present
- [ ] Address verified correct
- [ ] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes / No / Unknown
**Verified Basketball Courts?** Yes / No / Unknown
**Correct Address:** [leave blank if same as current]
**Correct Coordinates:** [leave blank if same as current]
**Apple Maps Correct?** Yes / No / N/A
**Google Maps Correct?** Yes / No / N/A
**Check-In Location Valid?** Yes / No / Needs retest after coord fix

**Status:** NOT_STARTED / NEEDS_REVIEW / VERIFIED / FIXED / REMOVE
**Notes:** [anything else relevant — hours, access restrictions, seasonal closure, court quality, etc.]
```

---

## Priority Gyms — Review First

These gyms have documented issues grounded in the seed file. Audit these before moving to the general list.

---

### Cowboys Fit - Pflugerville — `cowboys-fit-pflugerville`

**Batch:** 1 (fully enriched)
**Type:** indoor | **Access:** paid
**Current App Address:** 1401 Town Center Dr, Pflugerville, TX 78660
**Current App Coordinates:** 30.4656098, -97.60126939999999

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-14. All checks passed — gym exists, courts confirmed, address correct, coordinates correct, directions work in both map apps, check-in location valid.

---

### YMCA - Northwest Family — `northwest-family-ymca-austin`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 5807 McNeil Dr, Austin, TX 78729
**Current App Coordinates:** 30.4460811, -97.7338527

#### Verification Checklist
- [ ] Gym still exists and is operating
- [ ] Basketball courts confirmed present
- [ ] Address verified correct
- [ ] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?**
**Verified Basketball Courts?**
**Correct Address:**
**Correct Coordinates:**
**Apple Maps Correct?**
**Google Maps Correct?**
**Check-In Location Valid?**

**Status:** NEEDS_REVIEW
**Notes:** ⚠️ COORDINATE INHERITANCE ISSUE. These coordinates (30.4460811, -97.7338527) are identical to the archived `ymca-northwest-austin`, which was archived because 12741 N Lamar Blvd is not a real YMCA location. The replacement entry has the correct address (5807 McNeil Dr) but may have inherited the wrong coordinates. Right-click 5807 McNeil Dr in Google Maps to get correct coordinates before any users attempt check-in here.

---

### YMCA - Twin Lakes — `twin-lakes-ymca-cedar-park`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 204 E Little Elm Trail, Cedar Park, TX 78613
**Current App Coordinates:** 30.493670200000004, -97.8096247

#### Verification Checklist
- [ ] Gym still exists and is operating
- [ ] Basketball courts confirmed present
- [ ] Address verified correct
- [ ] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?**
**Verified Basketball Courts?**
**Correct Address:**
**Correct Coordinates:**
**Apple Maps Correct?**
**Google Maps Correct?**
**Check-In Location Valid?**

**Status:** NEEDS_REVIEW
**Notes:** ⚠️ COORDINATE INHERITANCE ISSUE. These coordinates are identical to the archived `cedar-park-ymca` (701 S Bell Blvd, archived because it was the wrong address). The replacement entry has the correct address (204 E Little Elm Trail) but may have inherited wrong coordinates. Right-click the Little Elm Trail location in Google Maps.

---

### CHASCO Family YMCA — `chasco-family-ymca-round-rock`

**Batch:** 4
**Type:** indoor | **Access:** paid
**Current App Address:** 1801 N Interstate 35, Round Rock, TX 78664
**Current App Coordinates:** 30.5263004, -97.68809499999999

#### Verification Checklist
- [ ] Gym still exists and is operating
- [ ] Basketball courts confirmed present
- [ ] Address verified correct
- [ ] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?**
**Verified Basketball Courts?**
**Correct Address:**
**Correct Coordinates:**
**Apple Maps Correct?**
**Google Maps Correct?**
**Check-In Location Valid?**

**Status:** NEEDS_REVIEW
**Notes:** ⚠️ COORDINATE INHERITANCE ISSUE. These coordinates are identical to the archived `ymca-round-rock` (301 W Bagdad Ave, which was archived because it is not a YMCA location). The replacement entry has the correct address (1801 N IH-35) but may have inherited wrong coordinates. Right-click the IH-35 location in Google Maps. The seed file comment confirms: "correct Round Rock YMCA is Chasco at 1801 N IH-35."

---

### LA Fitness - South Lamar — `la-fitness-south-lamar`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 4001 S Lamar Blvd, Austin, TX 78704
**Current App Coordinates:** 30.2348134, -97.79176489999999

#### Verification Checklist
- [ ] Gym still exists and is operating
- [ ] Basketball courts confirmed present
- [ ] Address verified correct
- [ ] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?**
**Verified Basketball Courts?**
**Correct Address:**
**Correct Coordinates:**
**Apple Maps Correct?**
**Google Maps Correct?**
**Check-In Location Valid?**

**Status:** NEEDS_REVIEW
**Notes:** ⚠️ COORDINATE INHERITANCE ISSUE. These coordinates are identical to the archived `la-fitness-south-austin` (4501 W William Cannon Dr — archived as "wrong address"). This gym's correct address is 4001 S Lamar Blvd. Coordinates may point to William Cannon rather than S Lamar. Right-click 4001 S Lamar in Google Maps to confirm. Also verify basketball courts still exist — LA Fitness has removed courts at some locations.

---

### All Batch 8 Michigan Gyms (13 active)

The seed file includes the following explicit warning for every Michigan gym:

> ⚠️ COORDINATE NOTICE: All Michigan coordinates are best-estimate based on known addresses. Before going live, right-click each location in Google Maps → "What's here?" and replace latitude / longitude with the exact building or court pin. Do NOT rely solely on these estimates.

**Until Michigan gyms are coordinate-verified, consider hiding them in Firestore** (`status: 'hidden'`) to prevent users from navigating to wrong pins or failing check-in. The 13 active Michigan gyms are listed in the Full Gym Table below.

Additionally, `aim-high-sports-complex` (Dimondale, MI) is already archived in the seed file — "Facility permanently closed."

---

## Full Gym Audit Table

Track audit progress for every active gym here. Archived and hidden gyms are in their own section.

**Columns:** `ID slug` | `City` | `Batch` | `T` = Indoor/Outdoor | `Access` | `Audit Status` | `Flag`

### Texas — Active Gyms

| Gym Name | ID | City | Batch | T | Access | Audit Status | Flag |
|---|---|---|---|---|---|---|---|
| Cowboys Fit - Pflugerville | `cowboys-fit-pflugerville` | Pflugerville | 1 | I | paid | VERIFIED | ✅ 2026-04-14 |
| Clay Madsen Recreation Center | `clay-madsen-round-rock` | Round Rock | 1 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Pan American Recreation Center | `pan-american-recreation-center` | Austin | 1 | I | free | VERIFIED | ✅ 2026-04-18 |
| Life Time Austin North | `lifetime-austin-north` | Austin | 1 | I | paid | VERIFIED | ✅ 2026-04-18 |
| Gold's Gym Hester's Crossing | `golds-gym-hesters-crossing` | Round Rock | 1 | I | paid | VERIFIED | ✅ 2026-04-18 |
| Fitness Connection (Tech Ridge) | `fitness-connection-austin-north` | Austin | 1 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Montopolis Recreation Center | `montopolis-rec-center-austin` | Austin | 1 | I | free | VERIFIED | ✅ 2026-04-18 |
| House of Gainz | `house-of-gainz-austin` | Austin | 1 | I | paid | VERIFIED | ✅ 2026-04-18 |
| Veterans Park | `veterans-park-round-rock` | Round Rock | 1 | O | free | NOT_STARTED | |
| YMCA of Austin - Downtown | `ymca-downtown-austin` | Austin | 2 | I | paid | NOT_STARTED | |
| Cedar Park Recreation Center | `cedar-park-recreation-center` | Cedar Park | 2 | I | paid | VERIFIED | ✅ 2026-04-16 |
| LA Fitness - Cedar Park | `la-fitness-cedar-park` | Cedar Park | 2 | I | paid | NOT_STARTED | |
| Dittmar Recreation Center | `dittmar-recreation-center` | Austin | 2 | I | free | NOT_STARTED | |
| Metz Recreation Center | `metz-recreation-center` | Austin | 2 | I | free | NOT_STARTED | |
| Northwest Recreation Center | `northwest-recreation-center-austin` | Austin | 2 | I | free | NOT_STARTED | |
| Old Settlers Park | `old-settlers-park-round-rock` | Round Rock | 2 | O | free | NOT_STARTED | |
| Gregory Gymnasium (UT) | `gregory-gymnasium-austin` | Austin | 3 | I | paid | VERIFIED | ✅ 2026-04-18 |
| UT Rec Sports Center | `ut-rec-sports-center-austin` | Austin | 3 | I | paid | VERIFIED | ✅ 2026-04-18 |
| YMCA - East Communities | `east-communities-ymca-austin` | Austin | 3 | I | paid | NOT_STARTED | |
| YMCA - Southwest Family | `southwest-family-ymca-austin` | Austin | 3 | I | paid | NOT_STARTED | |
| YMCA - Northwest Family | `northwest-family-ymca-austin` | Austin | 3 | I | paid | NEEDS_REVIEW | ⚠️ coord |
| YMCA - North Austin | `north-austin-ymca` | Austin | 3 | I | paid | NOT_STARTED | |
| YMCA - Twin Lakes | `twin-lakes-ymca-cedar-park` | Cedar Park | 3 | I | paid | NEEDS_REVIEW | ⚠️ coord |
| YMCA - Hays Communities | `ymca-hays-communities-buda` | Buda | 3 | I | paid | NOT_STARTED | |
| YMCA - Four Points | `ymca-four-points-austin` | Austin | 3 | I | paid | NOT_STARTED | |
| Austin Recreation Center | `austin-recreation-center-shoal-creek` | Austin | 3 | I | free | VERIFIED | ✅ 2026-04-16 |
| South Austin Recreation Center | `south-austin-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Givens Recreation Center | `givens-recreation-center-austin` | Austin | 3 | I | free | VERIFIED | ✅ 2026-04-16 |
| Gus Garcia Recreation Center | `gus-garcia-recreation-center` | Austin | 3 | I | free | VERIFIED | ✅ 2026-04-18 |
| Parque Zaragoza Recreation Center | `parque-zaragoza-recreation-center` | Austin | 3 | I | free | VERIFIED | ✅ 2026-04-18 |
| Virginia L. Brown Recreation Center | `virginia-brown-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Dottie Jordan Recreation Center | `dottie-jordan-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Turner Roberts Recreation Center | `turner-roberts-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Dove Springs Recreation Center | `dove-springs-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| West Austin Recreation Center | `west-austin-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Rosewood Recreation Center | `rosewood-recreation-center-austin` | Austin | 3 | I | free | NOT_STARTED | |
| Wells Branch Recreation Center | `wells-branch-recreation-center` | Austin | 3 | I | free | NOT_STARTED | |
| Del Valle Recreation Center | `del-valle-recreation-center` | Del Valle | 3 | I | free | NOT_STARTED | |
| Austin Sports Center - Central | `austin-sports-center-central` | Austin | 3 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Austin Sports Center - North | `austin-sports-center-north` | Austin | 3 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Life Time Fitness - South Austin | `lifetime-south-austin` | Austin | 3 | I | paid | VERIFIED | ✅ 2026-04-18 |
| LA Fitness - South Lamar | `la-fitness-south-lamar` | Austin | 3 | I | paid | NEEDS_REVIEW | ⚠️ coord |
| Georgetown Recreation Center | `georgetown-recreation-center` | Georgetown | 3 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Pflugerville Recreation Center | `pflugerville-recreation-center` | Pflugerville | 3 | I | paid | VERIFIED | ✅ 2026-04-18 |
| NE Metro Park Recreation Center | `northeast-metro-park-rec-center` | Pflugerville | 3 | I | free | NOT_STARTED | |
| Brushy Creek Community Center | `brushy-creek-community-center` | Round Rock | 3 | I | paid | VERIFIED | ✅ 2026-04-16 |
| Kyle Recreation Center | `kyle-recreation-center` | Kyle | 3 | I | free | NOT_STARTED | |
| Lakeway Activity Center | `lakeway-activity-center` | Lakeway | 3 | I | paid | NOT_STARTED | |
| Bee Cave Central Park Gymnasium | `bee-cave-central-park-gym` | Bee Cave | 3 | I | free | NOT_STARTED | |
| Round Rock Sports Center | `round-rock-sports-center` | Round Rock | 4 | I | free | VERIFIED | ✅ 2026-04-18 |
| CHASCO Family YMCA | `chasco-family-ymca-round-rock` | Round Rock | 4 | I | paid | NEEDS_REVIEW | ⚠️ coord |
| LA Fitness - AW Grimes | `la-fitness-aw-grimes-round-rock` | Round Rock | 4 | I | paid | NOT_STARTED | |
| LA Fitness - RM 620 | `la-fitness-rm620-round-rock` | Round Rock | 4 | I | paid | NOT_STARTED | |
| Hutto Family YMCA | `hutto-family-ymca` | Hutto | 4 | I | paid | VERIFIED | ✅ 2026-04-18 |
| Alamo Pocket Park | `alamo-pocket-park` | Austin | 5 | O | free | NOT_STARTED | |
| Shipe Neighborhood Park | `shipe-neighborhood-park` | Austin | 5 | O | free | NOT_STARTED | |
| Northwest District Park | `northwest-district-park` | Austin | 5 | O | free | NOT_STARTED | |
| Hancock Rec Center (Outdoor) | `hancock-rec-center-outdoor` | Austin | 5 | O | free | NOT_STARTED | |
| Givens Rec Center (Outdoor) | `givens-rec-outdoor` | Austin | 5 | O | free | NOT_STARTED | |
| Buttermilk Neighborhood Park | `buttermilk-neighborhood-park` | Austin | 5 | O | free | NOT_STARTED | |
| South Austin Rec Center (Outdoor) | `south-austin-rec-outdoor` | Austin | 5 | O | free | NOT_STARTED | |
| Dottie Jordan Neighborhood Park (Outdoor) | `dottie-jordan-outdoor` | Austin | 5 | O | free | NOT_STARTED | |
| Eastwoods Park | `eastwoods-park` | Austin | 5 | O | free | NOT_STARTED | |
| Frontier Park | `frontier-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Lake Creek Park | `lake-creek-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Green Slopes Park | `green-slopes-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Dell Way Park | `dell-way-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Settlement Park | `settlement-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Chandler Creek Park | `chandler-creek-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Cat Hollow Park | `cat-hollow-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Sendero Springs Park | `sendero-springs-park-round-rock` | Round Rock | 6 | O | free | NOT_STARTED | |
| Pfluger Park | `pfluger-park-pflugerville` | Pflugerville | 6 | O | free | NOT_STARTED | |
| Highland Park | `highland-park-pflugerville` | Pflugerville | 6 | O | free | NOT_STARTED | |
| Heatherwilde Park | `heatherwilde-park-pflugerville` | Pflugerville | 6 | O | free | NOT_STARTED | |
| Hutto Community Park | `hutto-community-park` | Hutto | 6 | O | free | NOT_STARTED | |
| Fritz Park | `fritz-park-hutto` | Hutto | 6 | O | free | NOT_STARTED | |
| Brushy Creek Sports Park | `brushy-creek-sports-park-cedar-park` | Cedar Park | 6 | O | free | NOT_STARTED | |
| Milburn Park | `milburn-park-cedar-park` | Cedar Park | 6 | O | free | NOT_STARTED | |
| Nelson Ranch Park | `nelson-ranch-park-cedar-park` | Cedar Park | 6 | O | free | NOT_STARTED | |
| Creekside Park | `creekside-park-cedar-park` | Cedar Park | 6 | O | free | NOT_STARTED | |
| HOA Harris Branch Basketball Court | `hoa-harris-branch-basketball-court` | Austin | 7 | O | free | VERIFIED | ✅ 2026-04-18 |

### Michigan (Batch 8) — Active Gyms

> ⚠️ ALL Michigan gyms need coordinate verification before going live. The seed file explicitly documents that all Batch 8 coordinates are best-estimate only. Consider hiding these (`status: 'hidden'`) until verified.

| Gym Name | ID | City | T | Access | Audit Status | Flag |
|---|---|---|---|---|---|---|
| Court One Athletic Club - East | `court-one-east-lansing` | Okemos | I | paid | FIXED | ✅ 2026-04-19 |
| Court One Athletic Club - North | `court-one-north-lansing` | Lansing | I | paid | FIXED | ✅ 2026-04-19 |
| MSU IM West | `msu-im-west` | East Lansing | I | paid | VERIFIED | ✅ 2026-04-19 coords re-verified via Google Maps |
| MSU IM Circle | `msu-im-circle` | East Lansing | I | paid | FIXED | ✅ 2026-04-19 |
| The Club at Chandler Crossings | `club-chandler-crossings` | East Lansing | I | paid | FIXED | ✅ 2026-04-19 |
| MSU IM East | `msu-im-east` | East Lansing | I | paid | FIXED | ✅ 2026-04-19 |
| Alfreda Schmidt Community Center | `alfreda-schmidt-community-center` | Lansing | I | free | FIXED | ✅ 2026-04-19 |
| Foster Community Center | `foster-community-center-lansing` | Lansing | I | free | FIXED | ✅ 2026-04-19 |
| Gier Community Center | `gier-community-center-lansing` | Lansing | I | free | FIXED | ✅ 2026-04-19 |
| Hannah Community Center | `hannah-community-center-east-lansing` | East Lansing | I | paid | FIXED | ✅ 2026-04-19 |
| Patriarche Park | `patriarche-park-east-lansing` | East Lansing | O | free | REMOVE | ✅ 2026-04-19 archived |
| Hunter Park | `hunter-park-lansing` | Lansing | O | free | REMOVE | 🚫 court unconfirmed |
| Quentin Park | `quentin-park-lansing` | Lansing | O | free | REMOVE | 🚫 court unconfirmed |
| Frances Park | `frances-park-lansing` | Lansing | O | free | REMOVE | 🚫 court unconfirmed |

### Michigan (Batch 8) — Hidden Gyms (pending access confirmation)

These are set to `status: 'hidden'` in the seed file. Before making any active, confirm open-gym / public access.

| Gym Name | ID | Notes |
|---|---|---|
| Holt High School Gymnasium | `holt-high-school-gym` | Hidden — confirm open-gym program |
| East Lansing High School Gymnasium | `east-lansing-high-school-gym` | Hidden — confirm open-gym program |
| Lansing Catholic High School Gymnasium | `lansing-catholic-high-school-gym` | Hidden — confirm community access |
| Waverly High School Gymnasium | `waverly-high-school-gym` | Hidden — confirm open-gym program |
| Everett High School Gymnasium | `everett-high-school-gym` | Hidden — confirm open-gym program |
| Eastern HS - Don Johnson Field House | `eastern-hs-don-johnson-field-house` | Hidden — confirm community / open-gym access |
| Sexton High School Gymnasium | `sexton-high-school-gym` | Hidden — confirm open-gym program |

---

## Detail Entries — Verified / Fixed Gyms

---

### Austin Recreation Center — `austin-recreation-center-shoal-creek`

**Batch:** 3
**Type:** indoor | **Access:** free
**Current App Address:** 1301 Shoal Creek Blvd, Austin, TX 78701
**Current App Coordinates:** 30.2781438, -97.74897039999999

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All launch-critical checks passed — gym exists, basketball courts confirmed, address correct, coordinates correct, directions work in both map apps, check-in location valid, image looks good.

---

### Austin Sports Center - Central — `austin-sports-center-central`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 425 Woodward St, Austin, TX 78704
**Current App Coordinates:** 30.2270143, -97.7558394

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

### Austin Sports Center - North — `austin-sports-center-north`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 1420 Toro Grande Blvd, Austin, TX 78728
**Current App Coordinates:** 30.5437927, -97.7769388

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

### Hannah Community Center — `hannah-community-center-east-lansing`

**Batch:** 8 (Michigan)
**Type:** indoor | **Access:** paid
**Current App Address:** 819 Abbot Rd, East Lansing, MI 48823
**Current App Coordinates (old):** 42.7373, -84.4891
**Corrected Coordinates:** 42.74165416356866, -84.4856027307667

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** 819 Abbot Rd, East Lansing, MI 48823 (same as current)
**Correct Coordinates:** 42.74165416356866, -84.4856027307667 (was 42.7373, -84.4891 — off by ~0.004°)
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** FIXED
**Notes:** Verified 2026-04-14. Coordinates corrected. Photo confirmed via Google Maps street view.
**Final Storage URL:** `https://storage.googleapis.com/runcheck-567a3.firebasestorage.app/gymImages/hannah-community-center-east-lansing/1.jpg`
**Action required:** Run `node scripts/uploadHannahPhoto.js` to upload the photo to Firebase Storage, then run `node seedProductionGyms.js` to push coordinates + photo URL to Firestore.

---

### Alfreda Schmidt Community Center — `alfreda-schmidt-community-center`

**Batch:** 8 (Michigan)
**Type:** indoor | **Access:** free
**Old Address:** 1619 Reo Ave, Lansing, MI 48910
**Correct Address:** 5825 Wise Rd, Lansing, MI 48911
**Old Coordinates:** 42.7201, -84.5793
**Correct Coordinates:** 42.67375028615337, -84.59064418650749

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [ ] Directions open correct destination in Apple Maps
- [ ] Directions open correct destination in Google Maps
- [ ] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** 5825 Wise Rd, Lansing, MI 48911
**Correct Coordinates:** 42.67375028615337, -84.59064418650749
**Apple Maps Correct?** Pending smoke test
**Google Maps Correct?** Pending smoke test
**Check-In Location Valid?** Pending smoke test

**Status:** FIXED
**Notes:** Fixed 2026-04-19. Address and coordinates both wrong in original seed (Reo Ave was incorrect; estimate coordinates were off). Corrected to 5825 Wise Rd, 48911 and verified pin. Re-seed required: run `node seedProductionGyms.js` to push to Firestore.

---

### Court One Athletic Club - East — `court-one-east-lansing`

**Batch:** 8 (Michigan)
**Type:** indoor | **Access:** paid
**Old Address:** 2291 Research Circle, Okemos, MI 48864
**Correct Address:** 2291 Research Dr, Okemos, MI 48864
**Old Coordinates:** 42.7183, -84.4077
**Correct Coordinates:** 42.70536236156866, -84.43527622883583

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** 2291 Research Dr, Okemos, MI 48864
**Correct Coordinates:** 42.70536236156866, -84.43527622883583
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** FIXED
**Notes:** Fixed 2026-04-19. Address corrected (Research Circle → Research Dr). Coordinates updated from estimate. Photo uploaded to Firebase Storage and seeded to Firestore.

---

## Archived Gyms — No Action Needed

These gyms have `status: 'archived'` in `seedProductionGyms.js` and are not shown to users. Listed here for completeness. Do not un-archive without re-verifying.

| ID | Why Archived |
|---|---|
| `ymca-northwest-austin` | 12741 N Lamar Blvd is not a real YMCA location; replaced by `northwest-family-ymca-austin` |
| `ymca-round-rock` | 301 W Bagdad Ave is not a YMCA; replaced by `chasco-family-ymca-round-rock` |
| `la-fitness-south-austin` | Wrong address (4501 W William Cannon); replaced by `la-fitness-south-lamar` |
| `cedar-park-ymca` | 701 S Bell matched to Twin Lakes; replaced by `twin-lakes-ymca-cedar-park` |
| `24-hour-fitness-anderson-mill` | Location permanently closed (24 Hour Fitness bankruptcy 2020) |
| `24-hour-fitness-sport-austin` | Address unverified; enrichment pipeline matched wrong location |
| `la-fitness-research-blvd` | 10721 Research Blvd is now Orangetheory, not LA Fitness |
| `24-hour-fitness-round-rock` | Location closed; enrichment matched to a Crunch Fitness |
| `24-hour-fitness-pflugerville` | 1900 FM 685 address does not correspond to a 24 Hour Fitness |
| `aim-high-sports-complex` | Permanently closed (The Summit Sports and Ice Complex shut 2021) |

---

### Brushy Creek Community Center — `brushy-creek-community-center`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 16318 Great Oaks Dr, Round Rock, TX 78681
**Current App Coordinates:** 30.4957609, -97.7355559

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

### Cedar Park Recreation Center — `cedar-park-recreation-center`

**Batch:** 2
**Type:** indoor | **Access:** paid
**Current App Address:** 1435 Main St, Cedar Park, TX 78613
**Current App Coordinates:** 30.5269428, -97.8258545

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

### Clay Madsen Recreation Center — `clay-madsen-round-rock`

**Batch:** 1
**Type:** indoor | **Access:** paid
**Current App Address:** 1600 Gattis School Rd, Round Rock, TX 78664
**Current App Coordinates:** 30.4971423, -97.6608628

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified (right-click → "What's here?" in Google Maps)
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Verified Gym Exists?** Yes
**Verified Basketball Courts?** Yes
**Correct Address:** Same as current
**Correct Coordinates:** Same as current
**Apple Maps Correct?** Yes
**Google Maps Correct?** Yes
**Check-In Location Valid?** Yes

**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

### Fitness Connection (Tech Ridge) — `fitness-connection-austin-north`

**Batch:** 1
**Type:** indoor | **Access:** paid
**Current App Address:** 12901 N Interstate Hwy 35 Suite 900, Austin, TX 78753
**Current App Coordinates:** 30.412062, -97.671535

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct. Cover image manually uploaded to Firebase Storage at gymImages/fitness-connection-austin-north/cover.jpg and set as imageUrl in seedProductionGyms.js.

---

### Georgetown Recreation Center — `georgetown-recreation-center`

**Batch:** 3
**Type:** indoor | **Access:** paid
**Current App Address:** 1003 N Austin Ave, Georgetown, TX 78626
**Current App Coordinates:** 30.651178, -97.673562

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct. Cover image manually uploaded to Firebase Storage at gymImages/georgetown-recreation-center/cover.jpg and added as imageUrl in seedProductionGyms.js.

---

### Givens Recreation Center — `givens-recreation-center-austin`

**Batch:** 3
**Type:** indoor | **Access:** free
**Current App Address:** 3811 E 12th St, Austin, TX 78721
**Current App Coordinates:** 30.276667, -97.690278

#### Verification Checklist
- [x] Gym still exists and is operating
- [x] Basketball courts confirmed present
- [x] Address verified correct
- [x] Coordinates verified
- [x] Directions open correct destination in Apple Maps
- [x] Directions open correct destination in Google Maps
- [x] Check-in radius valid at corrected location

#### Findings
**Status:** VERIFIED
**Notes:** Verified 2026-04-16. All checks passed — courts confirmed, directions accurate, coordinates correct, image acceptable.

---

## Session Notes

Use this section to record what you accomplished in each audit session, so you can resume efficiently.

```
### [Date] — Session Notes
Gyms audited this session:
- [gym name] → [VERIFIED / FIXED / REMOVE] — [brief note]
- ...

Gyms still in progress:
- ...

Next session should start with:
- ...
```
