# Prompt for Antigravity — Interconnect the `pyidcc` App

> **How to use this:** Paste Section A directly into Antigravity as your instruction. Section B is the evidence/reasoning behind it — keep it open so you can answer Antigravity's follow-up questions accurately, and paste specific parts of it in if Antigravity asks "why" or "show me". I built this by opening every relevant file in your `C:\Users\nages\pyidcc` repo, not by guessing — every claim below points at a real file and line.

---

## SECTION A — Paste this into Antigravity

```
TASK: Interconnect the pyidcc app so a change in one module propagates automatically
everywhere else that depends on the same data. Right now the app has TWO PARALLEL,
DISCONNECTED DATA UNIVERSES for the same underlying entities, and I need you to merge
them into one.

BACKGROUND (verified by reading the codebase):

1. The "main app" (~26 components: ActiveCrewRegistry, Dashboard, LeaveBookOffManager,
   ShiftExchange, AutomatedDispatchGate, RosterPublisherBoard, EmergencyReliefEngine,
   GccRosterUploader, LeaveRequestManager, ManualOverrideForm, TrainOperatorPerformance,
   MultiDayKMCalculator, UserControlCenter, UserManagement, JmdDrivingHours, and the
   layout files under components/layout/) IS already properly interconnected. It goes
   through:
     - context/OperationalEngine.jsx (OperationalEngineProvider), which holds
       live Firestore onSnapshot listeners for: users, crewRegistry, crew_final_links,
       crew_daily_deployment, leave_requests, shift_exchanges, wtt_final_matrix,
       wtt_live_incidents, automated_dispatch_gate — and exposes them via
       useOperationalEngine().
     - Firestore project pyidline2crew-41022 (src/firebase.js) as the real-time
       source of truth. Writes from any one component (e.g. approving a leave in
       LeaveBookOffManager) show up live in every other component that reads the
       same collection, because they all share the same onSnapshot subscriptions
       via OperationalEngineProvider.
   This part works. Do not rebuild it — extend it.

2. The ENTIRE Duty Generator module (src/pages/AutoDutyGeneratorPage.jsx ->
   src/components/dutyGenerator/*.jsx — 11 components — and its services in
   src/services/dutyOptimizerEngine.js, dutyConstraintEngine.js,
   rosterIntegrityValidator.js) is a COMPLETELY ISOLATED ISLAND:
     - It never imports or calls useOperationalEngine() or useAuth(). Verified:
       zero matches for "useAuth|currentUser" anywhere under components/dutyGenerator.
     - It never calls onSnapshot, setDoc, updateDoc, or addDoc anywhere. Verified:
       zero Firestore read/write calls in the whole module. The "Publish Roster"
       button in GeneratorDraftConsole.jsx only does local setState — nothing is
       ever persisted or broadcast to the rest of the app.
     - Instead of reading the live `crewRegistry` Firestore collection (used by
       everything else), it reads its own separate static JS array,
       EMPLOYEE_MASTER_REGISTRY, from src/data/employeeProfileMaster.js — a
       136-record file that is manually maintained and has already been caught
       drifting out of sync with reality (it was missing 4 of the app's 7 real
       Crew Controllers until a recent manual patch).
     - The rest of the app's "real" employee data lives in the crewRegistry
       Firestore collection, originally seeded from src/data/bmrclCrewRegistry.js
       (see src/utils/dbSeeder.js) and used live by 17 other files.
   These two "employee master" data sets have no relationship to each other at
   runtime. Editing an operator in ActiveCrewRegistry.jsx (which writes to the
   crewRegistry collection) has zero effect on the Duty Generator, and generating
   a roster in the Duty Generator has zero effect on anything else in the app
   (Dashboard, AutomatedDispatchGate, RosterPublisherBoard never see it).

3. Two more disconnected/dead pieces to fix at the same time:
     - src/data/bmrclWeeklyOffSchedule.js is imported nowhere except itself —
       dead code that should either be wired in or removed.
     - The Duty Generator's manual-override "Authorizing Controller" field
       (GeneratorDraftConsole.jsx) is a free-text input defaulting to a hardcoded
       string instead of pulling the real logged-in user from AuthContext/useAuth(),
       so audit log entries don't actually know who made the change.

WHAT I NEED YOU TO DO:

Step 1 — Produce a written migration plan FIRST, before touching code. List every
file in src/components/dutyGenerator, src/services (the duty-generator-related
ones), and src/data (employeeProfileMaster.js, historicalRosterIntelligence.js,
dutyTemplatesRegistry.js, ccRosterRegistry.js, specialAuxDutyRegistry.js) and state,
per file, exactly what Firestore collection or OperationalEngine field it should
read/write from instead of its current static import or local-only state. Show me
this plan before writing any code — this refactor touches a lot of files and I want
to review the plan first.

Step 2 — Make crewRegistry the single source of truth for employee data. Extend
the crewRegistry Firestore documents (not a second collection) with whatever fields
the Duty Generator needs that crewRegistry doesn't already have: isOfficialCC,
ccWilling, ccShiftCycle (or link to a cc_roster sub-collection if the per-day CC
shift cycle is too large to embed), fixedWo, lrd {required, daysRequired,
daysCompleted}, maternityLeave, specialProfile, nightTarget, boardingStation,
competency, activeCrew, isRelieved. Write a one-time migration script (can reuse the
dbSeeder.js pattern) that merges the current employeeProfileMaster.js values into
the matching crewRegistry documents by empId, then confirms no data is lost. After
migration, the Duty Generator must read crew data via useOperationalEngine()'s
crewRegistry, exactly like every other module — delete the static import of
EMPLOYEE_MASTER_REGISTRY from every dutyGenerator component and from
dutyOptimizerEngine.js once the live path works.

Step 3 — Make roster generation write through. When a roster is generated/edited/
published in GeneratorDraftConsole.jsx, it must setDoc into the SAME
crew_daily_deployment collection that RosterAutoClassifierService.autoDeployClassifiedData
already writes to and that AutomatedDispatchGate/OperationalEngine already read —
reuse the existing document shape, don't invent a new one. "Publish Roster" must
actually persist, not just flip a local isPublished flag.

Step 4 — Wire in the real logged-in user. Replace the free-text "Authorizing
Controller" input with the current user's name/role from useAuth(), the same way
the rest of the app already does it (see context/AuthContext.jsx for the pattern).

Step 5 — Decide what to do with src/data/bmrclWeeklyOffSchedule.js (wire it into
the real weekly-off logic, or remove it if it's superseded by the fixedWo field on
crewRegistry) and tell me which you recommend and why before deleting anything.

Step 6 — After each step, give me a short list of "before vs after" — which
component now reacts live to which collection — so I can verify interconnection
myself by editing a record in one screen and confirming it updates in another
without a page reload.

Do NOT do a big-bang rewrite. Go collection-by-collection / component-by-component,
and after each step confirm the app still builds and the existing rest-of-app
functionality (leave requests, shift exchange, dispatch gate) still works before
moving to the next step.
```

---

## SECTION B — Supporting evidence (for your reference, not to paste)

### B.1 The two parallel universes, mapped exactly

**Universe 1 — the connected main app** (reads/writes through `OperationalEngineProvider` + Firestore project `pyidline2crew-41022`):

| Firestore collection | Who writes it | Who reads it (via `onSnapshot`) |
|---|---|---|
| `crewRegistry` | seeded from `bmrclCrewRegistry.js` via `dbSeeder.js`; edited by `ActiveCrewRegistry.jsx` | `ActiveCrewRegistry`, `Dashboard`, `AutomatedDispatchGate`, `AiAssistantSidebar`, `AiDataExtractorEngine`, `CrewDirectory`, `GccRosterUploader`, `CrewControllerLayout`, `SuperAdminLayout`, `LeaveBookOffManager`, `LeaveRequestManager`, `ManualOverrideForm`, `MultiDayKMCalculator`, `ShiftExchange`, `TrainOperatorPerformance`, `aiService.js` |
| `crew_daily_deployment` | `RosterAutoClassifierService.autoDeployClassifiedData` | `OperationalEngine` (`deployments`), `AutomatedDispatchGate` |
| `leave_requests` | `LeaveBookOffManager`, `LeaveRequestManager` | `OperationalEngine`, `Dashboard`, others |
| `shift_exchanges` | `ShiftExchange` | `OperationalEngine`, others |
| `automated_dispatch_gate` | `runRecommendationEngine` (`firebase.js`) | `AutomatedDispatchGate`, `OperationalEngine` |
| `users`, `crew_final_links`, `wtt_final_matrix`, `wtt_live_incidents`, `crew_live_attendance` | various | `OperationalEngine` and consumers |

**Universe 2 — the isolated Duty Generator island** (100% static, in-memory only, resets on every page reload, never touches Firestore):

| File | Role | Imported by |
|---|---|---|
| `data/employeeProfileMaster.js` | Static 136-employee array — a *second, separately maintained* copy of what `crewRegistry` already holds | `DailyDutyGeneratorSuite`, `DutyHistoryIntelligence`, `GeneratorDraftConsole`, `NextDayRequirementsCenter`, `NightShiftBalancingDesk`, `WeekOffControlManager`, `WhatIfSimulator`, `dutyOptimizerEngine.js` |
| `data/historicalRosterIntelligence.js` | Static per-employee history — no link to real duty history in Firestore | `DutyHistoryIntelligence`, `GeneratorDraftConsole`, `NightShiftBalancingDesk`, `dutyOptimizerEngine.js` |
| `data/dutyTemplatesRegistry.js` | Static duty-template catalogue | `GeneratorDraftConsole`, `WhatIfSimulator`, `dutyOptimizerEngine.js` |
| `data/ccRosterRegistry.js`, `data/specialAuxDutyRegistry.js` | The CC/Special-duty fixes from the previous review — correct internally, but only wired into `dutyOptimizerEngine.js` and `rosterIntegrityValidator.js`, not into the rest of the app | `dutyOptimizerEngine.js`, `rosterIntegrityValidator.js`, (`specialAuxDutyRegistry` also in `GeneratorDraftConsole.jsx`) |

**Zero overlap between the two tables above.** No file in Universe 2 imports `db`, `firebase`, `onSnapshot`, `OperationalEngine`, or `AuthContext`. This is why nothing you do in the Duty Generator today can ever "automatically update" anywhere else, and vice versa — they are architecturally two different apps sharing one router.

### B.2 Why this matters concretely

- Mark someone "relieved" in `ActiveCrewRegistry` → the Duty Generator still happily schedules them, because it never reads `crewRegistry`.
- Add a new Crew Controller in real life → you have to hand-edit `employeeProfileMaster.js` (a 114 KB static file) *in addition to* whatever the main app's crew-management UI does, or the Duty Generator won't know.
- Click "Publish Roster" in the Duty Generator → nothing happens outside that browser tab. `AutomatedDispatchGate`, `Dashboard`, `RosterPublisherBoard` never learn a roster was generated, because nothing gets written to Firestore.
- This is also almost certainly why the Crew-Controller/Special-Duty bug from before kept slipping through: even after fixing the generator's internal logic, the underlying employee data it reasons about is a hand-maintained snapshot that's already been caught drifting from reality once.

### B.3 A note on scale/risk

`bmrclCrewRegistry.js` (450 KB), `historicalRosterIntelligence.js` (480 KB), `wttMasterRegistry.js` (692 KB) and `employeeProfileMaster.js` (114 KB) are large hand-authored/generated files. A blind merge could silently drop or corrupt data. That's why Section A asks Antigravity to (1) plan before coding, and (2) write a migration script that *merges and verifies*, not one that overwrites blind. Insist on seeing a diff/verification step (e.g. "print how many employees matched, how many were unmatched, how many fields were added") before it deletes the old static file.

### B.4 Quick way to sanity-check Antigravity's work when it says "done"

1. Open the app, go to Duty Generator, generate a roster, click Publish.
2. Open Firestore console (or `AutomatedDispatchGate`/`Dashboard` in another tab) and confirm a new/updated `crew_daily_deployment` doc appeared without a manual refresh.
3. Edit an employee's `fixedWo` or relieve them in `ActiveCrewRegistry`.
4. Go back to Duty Generator (no reload) and confirm the change is reflected.
5. If both directions update live without a page reload, the modules are genuinely interconnected — that's the real acceptance test, not "the code compiles."

---

*Built from a direct read of: `App.jsx`, `firebase.js`, `context/OperationalEngine.jsx`, `context/AuthContext.jsx`, `utils/dbSeeder.js`, `pages/AutoDutyGeneratorPage.jsx`, and a full import-graph search (`grep -rl`) across every `.jsx`/`.js` file in `src/` for `EMPLOYEE_MASTER_REGISTRY`, `HISTORICAL_ROSTER_INTELLIGENCE`, `DUTY_TEMPLATES_REGISTRY`, `CC_ROSTER_REGISTRY`, `SPECIAL_AUX_DUTY_REGISTRY`, `bmrclCrewRegistry`, `bmrclWeeklyOffSchedule`, `wttMasterRegistry`, `onSnapshot`, `setDoc/updateDoc/addDoc`, and `useAuth/currentUser`.*
