# BMRCL Line 2 (Peenya Depot) — Advanced AI Duty Generator
## Master Requirements & Build Prompt (v1.0 — 19 Aug 2026)

> **How to use this document:** Paste this whole file to your coding AI (or hand it to a developer) as the single source of truth for rebuilding/fixing `src/components/dutyGenerator`. It is written from (a) a line-by-line review of your actual code in `pyidcc/src/components/dutyGenerator`, `src/services`, `src/data`, `src/constants`, and (b) a cell-by-cell analysis of your real published rosters for July and August 2026 (`Roster 6 August_2026.xlsb`, `Roster 7 July_2026.xlsb`, `Roster 8 Aug_2026.xlsb`). Every rule below is either a direct quote of something your real roster already enforces, or a fix for a bug I found in your current code. Nothing here is generic boilerplate — it's tailored to your exact files.

---

## 0. Data-source note (please read first)

The three uploaded files did **not** actually contain June data. Their real internal sheet contents are:

| File name you gave me | Actual sheets inside | Real coverage |
|---|---|---|
| `Roster 6 August_2026.xlsb` | `1.8 … 31.8` (+ stray `2.7,3.7,4.7`) | Full **August** 2026 (an earlier/base publish) |
| `Roster 7 July_2026.xlsb` | `1.7 … 31.7` | Full **July** 2026 |
| `Roster 8 Aug_2026.xlsb` | `31.7, 1.8 … 23.8` | **August** 2026, partial, more recent revision (matches "up to date" since today is 19 Aug) |

So you actually have **two independent snapshots of August** (Roster 6 = full-month advance publish, Roster 8 = latest actuals up to the 23rd) plus **one July**. There is no June file among these three. I built the rules below from all three anyway since two of them disagree with each other on some days — which is itself useful: it shows me which parts of the roster get revised after first publish (leave approvals, relief swaps) versus which parts never change (duty templates, station codes, timings). I flagged this instead of silently assuming — tell me if you actually want June data reviewed too and I'll pull it in.

---

## 1. Objective

Build a **single-source-of-truth, self-validating daily/monthly duty generator** for 135–139 active Train Operators (TOs) at Peenya Industry Depot, Line 2, that:

1. Never lets a Crew Controller (CC) or a Special/Auxiliary-Duty operator appear in the Active Mainline Driving Duty list on a day they are rostered as CC/Special duty — **this is the bug you reported, and I found exactly why it happens (Section 3).**
2. Reproduces every rule your human-prepared rosters already implicitly follow (rest hours, night rotation, weekly-off integrity, LRD, maternity, etc.).
3. Runs a **hard validation firewall** before anything is shown as "generated" or allowed to be published, so a bad roster is structurally impossible, not just unlikely.

---

## 2. Root cause analysis of the reported bug (verified against your code)

I read `GeneratorDraftConsole.jsx`, `dutyOptimizerEngine.js`, `dutyConstraintEngine.js`, `RosterAutoClassifierService.js`, `employeeProfileMaster.js`, and `dutyTemplatesRegistry.js`. There are **three separate, concrete defects**, not one:

### 2.1 Field-name mismatch in the display filter (`GeneratorDraftConsole.jsx`)
- `dutyOptimizerEngine.js` tags an official Crew Controller with `specialTag: 'OFFICIAL_CC'` and a relief CC with `specialTag: 'CC_RELIEF'` (see the `ccDutySlots.forEach` block).
- But `GeneratorDraftConsole.jsx`'s `runningDuties` filter excludes people from the Active Duty table only if `!['CC','LRD','LEAVE',...].includes(a.specialTag)`. It checks for the literal string `'CC'`, which **never matches** `'OFFICIAL_CC'` or `'CC_RELIEF'`.
- Result: every Crew Controller passes the exclusion test and lands in the "Active Mainline Driving Duties" table **at the same time** they correctly also appear in the "Crew Controllers (CC Desk)" panel (which matches on `specialProfile === 'CC'` instead, a different field). **This is the exact defect you're seeing.**
- **Fix:** use one canonical field (`assignmentCategory`, see Section 4.1) everywhere, never branch display logic on three different fields (`specialTag`, `specialProfile`, `role`) that can silently drift out of sync.

### 2.2 Special/Auxiliary Duty has no data model at all
- Your real Excel rosters have a distinct desk for station-based special duties: `OR1`, `OR2` (Operating Reserve), `1Stbk`/`2Stbk` (Standby), and location tags `NGSA`, `PUTH`, `KGWA`, `RVR`, `BYPH CC`, `RVR CC` (which station the reserve operator is posted at that day), plus `SPORTS` (sports-quota duty).
- In your code, `OR1`/`OR2` are defined in `dutyTemplatesRegistry.js` with `"shift": "STBY"` **inside the same array as ordinary train-driving duties**, and `dutyOptimizerEngine.js`'s Step 3 assigns them exactly like a normal driving duty. `GeneratorDraftConsole.jsx` has **zero UI bucket** for "Special/Reserve Duty" — no filter excludes `shift === 'STBY'` from `runningDuties`.
- Result: any operator on Operating Reserve / Standby gets shown as if they were driving a train, exactly the second half of your bug report ("special duty train operator must be at special duty column only").
- Note: your code already has a field called `SPECIAL_DUTY`, but it means something totally different in your data (Pink/pregnancy-restricted duty, see `NextDayRequirementsCenter.jsx` line ~120). **Do not reuse that name** — Section 4 below defines a distinct field so the two concepts stop colliding.

### 2.3 Your Crew Controller roster is missing 4 of 7 real Crew Controllers
- Your real Excel `CC Duty` sheet (the "L2 ALS/CC Roster") names **seven** designated Crew Controllers who rotate through shift codes `A/B/C/G/L/WO/CL/EL/GCC/CO`: **Harsh Joshi (20087), Arunakumar DS (20018), Shanthiraj S (20057), Manjunath BM (20019), Rashmi (20037), Deepa L (20038), Nagesh N (20726)**.
- Your `employeeProfileMaster.js` only marks **3 of these 7** as `isOfficialCC: true` (Deepa L, Nagesh N, Rashmi). Harsh Joshi, Arunakumar DS, Shanthiraj S, and Manjunath BM are **not represented as Crew Controllers anywhere in your data** — the generator has no way of knowing they're CCs, so on any day one of them is actually on CC duty, the algorithm is free to treat them as an ordinary Train Operator and assign them a driving duty. **This alone can independently reproduce your bug even if 2.1 and 2.2 are fixed.**
- Also: your engine hardcodes exactly 3 CC slots (`CC1`/`CC2`/`CC3`, one shift each, 06:30–14:00 / 14:00–21:30 / 21:30–06:30) with fixed default owners. Your real `CC Duty` sheet instead runs a **personal weekly-cycle roster per CC** (each of the 7 has their own sequence of A/B/C/G/L/WO/CL/EL/GCC/CO across the month, not a fixed 3-slot pool). The current model is a simplification that doesn't match reality and will keep breaking as soon as more than 3 people are ever on CC duty simultaneously (which your own sheet shows happens — e.g. two people on `GCC` on the same day).

### 2.4 Stale "source of truth" hygiene
- The `CC Duty` sheet inside `Roster 8 Aug_2026.xlsb` still carries the title "PYID CC Station Superintendents Monthly Duty Roster - **MAY 2026**" even though the workbook is for August. If the sheet that seeds your CC data is manually copy-pasted forward each month without updating its own header/dates, garbage can silently flow into the generator. Add an automated check (Section 6) that refuses to import a CC roster sheet whose header month doesn't match the target month.

---

## 3. Canonical data model (what "the four columns" must actually be)

Every day, every one of the ~139 active TOs must land in **exactly one** of these mutually exclusive buckets. This is the core invariant the whole engine must protect.

| # | Bucket (`assignmentCategory`) | Real Excel equivalent | Who can be in it |
|---|---|---|---|
| 1 | `ACTIVE_DUTY` | Left block, Duty No 1–~88, columns A–I | TOs driving a numbered mainline duty (Pro1/Pro2, A-series, B-series, N-series, T3/J/JM link variants) |
| 2 | `CREW_CONTROLLER` | Right block `CC1/CC2/CC3` rows, and the `CC Duty` sheet's 7-person roster | Only the 7 designated CC-competent staff, and only on days their `CC Duty` shift code is a working CC letter (A/B/C/G/GCC), not on their L/WO/CL/EL/CO days |
| 3 | `SPECIAL_AUX_DUTY` | Right block `OR1/OR2`, `1Stbk/2Stbk`, station tags `NGSA/PUTH/KGWA/RVR/BYPH CC/RVR CC`, `SPORTS` | Any active TO placed on reserve/standby or a station-support post |
| 4 | `NOT_AVAILABLE` | `WO`, `CL`, `EL`, `HPL`, `GHEL`, `GH`, `ML`, `PL`, `AB`, `BO`, `LRD`, `CRT`, `BMRTI`, `CRRC Tg`, `PME`, `Relv`/`REL`, `OD`, `AWP`, `R5`/`R6 Trg`, `VIVA`, etc. | TOs on leave, training, weekly-off, LRD refresher, relieved, or otherwise not driving |

**Hard rule:** a `(empId, date)` pair may appear in **one and only one** bucket. The generator must be structurally incapable of writing the same `empId` into two buckets for the same date — this is enforced by construction (remove from the candidate pool the instant they're placed anywhere, see Section 5) *and* re-checked by an independent post-generation auditor (Section 6) that fails loudly if it ever finds a duplicate.

### 3.1 Rename fields to stop the drift that caused the bug
Replace the three-different-fields-that-can-disagree pattern (`specialTag`, `specialProfile`, `role`) with **one single source of truth per assignment object**:

```js
{
  empId, name, gender,
  assignmentCategory: 'ACTIVE_DUTY' | 'CREW_CONTROLLER' | 'SPECIAL_AUX_DUTY' | 'NOT_AVAILABLE',
  assignmentSubType: 'CC1' | 'CC2' | 'CC3' | 'OR1' | 'OR2' | '1Stbk' | 'WO' | 'CL' | ... ,   // the exact duty/desk code
  dutyCode, dutyNo, shift, sOnTime, sOffTime, sOnLoc, sOffLoc, kms,
  isOfficialForRole: boolean,   // true = permanent CC/role holder, false = relief/temp cover
  reason, warnings, qualityPenalty
}
```
Every UI bucket, every export, every validator reads **only** `assignmentCategory`. Never branch on a `.startsWith('CC')` string match or a `role?.includes(...)` — that pattern is exactly what let the bug through in the first place (2.1).

---

## 4. Full rule set to encode

### 4.1 Crew Controller rules
1. The CC pool is **exactly the 7 named staff** in the `CC Duty` sheet (Harsh Joshi, Arunakumar DS, Shanthiraj S, Manjunath BM, Rashmi, Deepa L, Nagesh N) unless the user explicitly adds/removes someone via the CC management screen. All 7 need `isOfficialCC: true` in the employee registry — fix the 4 missing ones immediately (Section 2.3).
2. Each CC has their **own personal monthly shift cycle** (letters `A`, `B`, `C`(night), `G`, `GCC`, plus off-codes `L`, `WO`, `CL`, `EL`, `CO`) exactly like the `CC Duty` sheet shows — this is not a shared 3-slot pool with generic fallback logic. Model it as its own registry (`CC_ROSTER_REGISTRY`), separate from `DUTY_TEMPLATES_REGISTRY`.
3. On any day a CC's own code is a working code (A/B/C/G/GCC), they are placed in `CREW_CONTROLLER` and **removed from the Active-Duty candidate pool for that date, unconditionally, before Active Duty assignment even runs.**
4. On any day a CC's own code is an off-code (L/WO/CL/EL/CO), they fall through to `NOT_AVAILABLE` with the correct sub-reason, and only then may they optionally be picked as backup TO if genuinely needed and if they still hold `canDriveTrain: true` competency — but this must be an explicit, logged override (Section 4.4), never silent.
5. If a CC slot has no coverage (all 7 on leave/WO that day — rare but must be handled), fall back to the CC-willing relief pool exactly as your current code does, but tag the result `isOfficialForRole: false` and surface it as a loud warning, never silently swap.

### 4.2 Special/Auxiliary Duty rules
1. `OR1`, `OR2`, `1Stbk`, `2Stbk` and their station-location pairing (`NGSA/PUTH/KGWA/RVR/BYPH CC/RVR CC`) belong to `SPECIAL_AUX_DUTY`, never to `ACTIVE_DUTY`, even though today they live in the same `DUTY_TEMPLATES_REGISTRY` array with `shift: 'STBY'`. Split them into a separate `SPECIAL_AUX_DUTY_REGISTRY` so a future engineer can't accidentally re-merge them into the driving-duty pool the way the current code does.
2. `SPORTS` duty (sports-quota deputation) is rare (appeared once in 3 months of data) but must route to `SPECIAL_AUX_DUTY`, not to a generic catch-all bucket, so it never leaks into Active Duty either.
3. Standby/Reserve operators (`1Stbk`/`2Stbk`) should still be usable as the **first call** when someone books off same-day (this mirrors your existing `reoptimizeForBookOff` logic in `dutyOptimizerEngine.js` — keep that mechanism, just repoint it at the `SPECIAL_AUX_DUTY` pool instead of the generic `RESERVE` pool it currently reads from).

### 4.3 Active Duty rules (mostly already correct in your code — keep these, just re-verify against the corrected pools above)
1. Minimum 8h00m continuous rest between sign-off and next sign-on; 8–10h logs a warning, <8h is a hard rejection. (`dutyConstraintEngine.js` — keep, it's solid.)
2. Night (`N`) duty is never immediately followed by an `A`-shift (1st shift) duty; `N`→`B` requires ≥8h rest. Night is never assigned as the first working day after a Week-Off.
3. Gender-based monthly night quota: 6 nights for male TOs, 5 for female TOs (matches your `nightTarget` field already in `employeeProfileMaster.js`).
4. 26-day minimum recurrence gap before the *same* night duty code repeats for the same operator.
5. Canonical shift-family rotation `A → B → N(Night/C) → G → A` across each operator's working block, broken only by Weekly Off.
6. Anti-repetition: never assign the exact same duty code as the immediately preceding day; flag (don't block) if the same code repeats twice within 7 days.
7. Pink-Duty profile (pregnancy/restricted): never assign Night shift; only daylight/standby/PRO-type duty; still logged under `ACTIVE_DUTY` or `SPECIAL_AUX_DUTY` as appropriate, never CC.
8. LRD (Learning Road Duty, 07:00–15:00 PYID): mandatory before any passenger driving duty for staff returning from ≥3 months absence (1 day) or ≥6 months absence (3 days) — this must be a hard block, not a soft warning, exactly as your `dutyConstraintEngine.js` already does. Keep it, but route LRD to `NOT_AVAILABLE`, not `ACTIVE_DUTY`.
9. Statutory Maternity Leave (180 days, Karnataka norms) is a hard block on any active/CC/special assignment until the actual-report date is set.

### 4.4 Cross-cutting integrity rules (new — these are what actually stop the bug from ever coming back)
1. **Single-assignment invariant**: before adding any person to any bucket, check they are not already in `assignedEmpIds`. This already exists in your engine for the from-scratch generator path — extend the *same* guarantee to the Excel-import path (`RosterAutoClassifierService.js`), which currently has **no cross-check at all** between the left block (Duty No columns A–I, driven purely by "is column A numeric") and the right block (CC/Special-duty columns J–O). Today a name could physically appear in both blocks of an uploaded Excel sheet and the importer would happily create two separate records for the same person with no dedup, no warning. Add: after parsing both blocks, build an `empId → [buckets found in]` map; if any empId appears in more than one bucket, raise a `DUPLICATE_ASSIGNMENT` error that blocks import/publish until a human resolves it (never auto-pick one silently).
2. **Category completeness check**: every active TO (status `ACTIVE`, not relieved) must appear in *exactly one* bucket for the target date. Zero appearances = `UNASSIGNED_OPERATOR` error. More than one = `DUPLICATE_ASSIGNMENT` error. Both are hard-blocking, not warnings.
3. **CC/Special-duty exclusion is evaluated first, always.** Pipeline order must be: (1) Maternity/LRD/Leave/Book-off → `NOT_AVAILABLE`, (2) Crew Controller roster lookup → `CREW_CONTROLLER`, (3) Special/Auxiliary duty needs → `SPECIAL_AUX_DUTY`, (4) whatever remains → `ACTIVE_DUTY` candidate pool. Never assign Active Duty first and try to "subtract out" CC/Special people afterward — that ordering is exactly the shape of bug 2.1/2.2.
4. **One rendering source of truth**: `GeneratorDraftConsole.jsx`'s four (or more) display buckets must be computed with a single `groupBy(assignments, 'assignmentCategory')`, never with four independently-written `.filter()` predicates that each guess at field names. If a fifth bucket is ever added (e.g. Pink Line 4, JMD Standby), it must be a `assignmentSubCategory` under one of the four top-level buckets, not a fifth parallel filter that can also drift out of sync.

---

## 5. Generation pipeline (explicit order — implement exactly this sequence)

```
FOR target date D:
  1. Load active TO roster (status=ACTIVE, isRelieved=false, activeCrew!=false)
  2. Load CC_ROSTER_REGISTRY, resolve each of the 7 CCs' shift code for date D
     -> place working-code CCs into CREW_CONTROLLER; off-code CCs proceed to step 3
  3. Resolve Maternity / LRD-mandatory / approved Leave / Book-off / Training / Test-track
     for every remaining TO -> place into NOT_AVAILABLE with correct subType
  4. Resolve Weekly-Off (fixed day-of-week, honoring any woOverride) for every remaining TO
     -> NOT_AVAILABLE
  5. Resolve Special/Auxiliary Duty requirements (OR1/OR2/Standby/station posts, Pink-duty
     daylight assignment, sports deputation) for every remaining TO -> SPECIAL_AUX_DUTY
  6. Remaining TOs enter the Active Duty solver (existing scoring/fairness engine in
     dutyOptimizerEngine.js) -> ACTIVE_DUTY, or STANDBY_RESERVE if no duty left to assign
  7. Run the Section 6 validation firewall over the COMPLETE assignment set (all 4 buckets)
  8. Only if the firewall returns zero hard violations: allow "Publish". Otherwise force the
     UI into an unpublishable state and show exactly which rule + which employee failed.
```

Steps 2–5 must **remove** the person from the candidate pool the instant they're placed — never leave them "eligible" for a later step to also grab.

---

## 6. Mandatory pre-publish validation firewall (new service, e.g. `rosterIntegrityValidator.js`)

Run this over the full generated/edited/imported roster before it can be exported or published. Every check below should be a discrete, named assertion so failures are traceable to one line, not a vague "something's wrong":

1. `NO_DUPLICATE_EMP_ACROSS_BUCKETS` — every `empId` appears in exactly one of the 4 buckets for date D.
2. `NO_UNASSIGNED_ACTIVE_TO` — every active TO appears somewhere for date D.
3. `CC_ROSTER_MATCHES_REGISTRY` — everyone in `CREW_CONTROLLER` bucket is one of the 7 registered CCs (or an explicitly logged relief override).
4. `NO_CC_IN_ACTIVE_DUTY` — literal re-check: no `empId` present in `CREW_CONTROLLER` also present in `ACTIVE_DUTY`, and vice versa for `SPECIAL_AUX_DUTY`. (This is the direct regression test for the bug you reported — keep it forever, run it on every generation, every manual edit, every import.)
5. `REST_HOURS_OK` — ≥8h rest for every active-duty transition (existing `calculateRestHours` logic).
6. `NIGHT_TRANSITION_OK` — no N→A, no N→B with <8h rest, no night on first day after WO.
7. `NIGHT_QUOTA_OK` — night count ≤ 6 (male) / 5 (female) unless explicitly force-overridden with a logged reason.
8. `NIGHT_RECURRENCE_OK` — ≥26 days since the same night duty code for the same operator.
9. `WEEKLY_OFF_INTEGRITY` — nobody works on their fixed WO day unless a logged `woOverride` exists for that date.
10. `LRD_GATE_OK` — nobody with incomplete mandatory LRD is in `ACTIVE_DUTY`.
11. `MATERNITY_GATE_OK` — nobody in active maternity window is in `ACTIVE_DUTY`, `CREW_CONTROLLER`, or `SPECIAL_AUX_DUTY`.
12. `PINK_DUTY_NO_NIGHT` — nobody with Pink/pregnancy profile is assigned a night shift.
13. `SOURCE_SHEET_DATE_MATCH` — if importing from an Excel `CC Duty`/roster sheet, its own header month/year must match the target month; block import otherwise (fixes the stale-May-header issue found in Section 2.4).
14. `MANPOWER_COVERAGE` — total active-duty assignments ≥ the day-type's required duty count (WEEKDAY/SATURDAY/SUNDAY/GH templates each have their own total, matching your `DAY_TYPE_CONFIGS`); shortfall triggers a named warning listing exactly which duty numbers are unfilled.

Any failure in checks 1–4, 10, 11, 13 is a **hard block** (cannot publish). Checks 5–9, 12, 14 may be soft warnings **only if** a Crew Controller explicitly force-overrides with a reason, which must be captured in the existing audit log mechanism (`auditLogs` in `GeneratorDraftConsole.jsx` — keep that, it's good).

---

## 7. Data fixes to make immediately (small, mechanical, unblock everything else)

1. In `employeeProfileMaster.js`, add `isOfficialCC: true` + `role: 'OFFICIAL_CREW_CONTROLLER'` for Harsh Joshi (20087), Arunakumar DS (20018), Shanthiraj S (20057), Manjunath BM (20019) — bringing the CC roster to the real 7 people.
2. Create `CC_ROSTER_REGISTRY` in `src/data/` modeled on the real `CC Duty` sheet: `{ empId, name, monthlyShiftCycle: [{date, code}], validFromDate }`. Populate at least the current month from the `CC Duty` sheet, and add a monthly refresh step (with the date-match guard from rule 13 above) so it can never go stale like the "MAY 2026" header did.
3. Create `SPECIAL_AUX_DUTY_REGISTRY` in `src/data/`, splitting `OR1`/`OR2`/`1Stbk`/`2Stbk`/station-tag entries **out of** `DUTY_TEMPLATES_REGISTRY` so they can never again be scored/assigned by the same code path as mainline driving duties.
4. Normalize numeric-duty-number parsing: your aggregated data shows raw values like `"1.0"`/`"2.0"` leaking into duty codes from Excel float coercion — cast all duty numbers through `parseInt` at the ingestion boundary, not downstream.
5. Confirm the meaning of these observed-but-unresolved codes with your ops team before encoding them (I did not guess at these — better to ask you than assume): `AWP`, `SEP`, `SCL`, `G21`/`G22`, `R5`/`R6 Trg`, `N IPL`, `Ntst`/`Ntest`/`N Test`. They appear real and recurring (5–312 occurrences each across 3 months) but their exact bucket (Active/Special/NotAvailable) should come from you, not be inferred from the abbreviation alone.

---

## 8. Regression test fixtures (use your own real data — you already have it)

Treat the three uploaded workbooks as your **golden regression set**:
- For each of the ~85 days across the three files, the CC1/CC2/CC3 (and where present, the 7-person `CC Duty` roster) names must **never** also appear as a numbered Active Duty (columns A–I) name on the same sheet/day.
- Write an automated test that loads each daily sheet, extracts the two name-sets (Active-Duty names vs CC/Special-Duty names), and asserts they're disjoint. Run this against your **real historical files** first — if it fails on the human-prepared originals too, that tells you the source data itself has the same disease and needs a process fix upstream, not just a code fix.
- Keep this test in CI permanently as the direct regression guard for the bug you reported today.

---

## 9. Open questions for you (please answer before final build sign-off)

1. Do you want June 2026 data included in the historical baseline? The files you sent don't contain it.
2. For the two overlapping August files (Roster 6 = full-month advance publish, Roster 8 = latest actuals through the 23rd) — should the generator treat Roster 8 as authoritative wherever the two disagree, or do you want a diff report surfaced instead?
3. Confirm exact meaning of `AWP`, `SEP`, `SCL`, `G21`/`G22`, `R5`/`R6 Trg`, `N IPL` so they can be bucketed correctly (Section 7.5).
4. Should relief/backup CCs (currently modeled as `ccWilling`) be limited to a pre-approved list, or can the algorithm nominate anyone competent who's free that day?
5. Confirm the CC3 (night desk) duty count asymmetry I noticed (roughly 2.5× the count of CC1/CC2 across 3 months of data) — is that because the night desk genuinely needs 2 people most nights, or is it a data artifact of the shift spanning midnight and being logged on both calendar days? This affects whether `CC_ROSTER_REGISTRY` needs a `headcountPerShift` field.

---

*Prepared from: `dutyGenerator/*.jsx` (11 components), `services/dutyOptimizerEngine.js`, `services/dutyConstraintEngine.js`, `services/RosterAutoClassifierService.js`, `services/rosterExportService.js`, `services/ValidationService.js`, `data/employeeProfileMaster.js`, `data/dutyTemplatesRegistry.js`, `data/bmrclWeeklyOffSchedule.js`, `constants/rosterTransitions.js`, and full-workbook analysis of `Roster 6 August_2026.xlsb`, `Roster 7 July_2026.xlsb`, `Roster 8 Aug_2026.xlsb` (sheets: daily print sheets, `Indv Duties`, `WO`, `CC Duty`, `Print Wd`).*
