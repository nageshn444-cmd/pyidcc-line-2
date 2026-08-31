/**
 * Emergency Crew Relief Allocator & Decision Support Engine
 * BMRCL PYIDCC Line 2
 *
 * ── Advanced allocation core ─────────────────────────────────────────────
 * Beyond the original single-train, greedy "best candidate first" logic,
 * this module now solves crew relief as a proper combinatorial optimization
 * problem so that Crew Controllers can resolve an entire OCC train swap, a
 * cascading delay chain, or several simultaneous incidents in ONE decision
 * instead of manually re-running the recommendation train-by-train:
 *
 *  - hungarianAlgorithm(): classic Kuhn-Munkres minimum-cost assignment
 *    (O(n^3)). Used to match many "trains needing a new operator" against
 *    many "candidate relievers" GLOBALLY OPTIMALLY, instead of picking the
 *    top score for train #1 and possibly starving train #2 of the reliever
 *    it actually needed most.
 *  - resolveMultiTrainRelief(): builds that cost matrix from the existing
 *    business rules (duty-hour protection, FIFO break rules, pool
 *    priority, travel time, etc.), runs the optimizer, then layers on:
 *      • hand-off dependency detection — a chosen reliever may currently be
 *        driving ANOTHER train that is also being resolved in this batch
 *        (this is exactly what happens on an OCC train swap). Those are
 *        modeled as a directed graph.
 *      • Tarjan's strongly-connected-components algorithm to find
 *        hand-off cycles: a direct 2-train swap is safe to execute in
 *        parallel; longer cycles (A needs B's operator, B needs C's, C
 *        needs A's) are flagged with a concrete break-point suggestion.
 *      • Critical-Path-Method (CPM) scheduling over the resulting DAG to
 *        report the fastest possible wall-clock time to clear every
 *        pending manual assignment in the batch.
 *      • constraint relaxation: an incident that has no fully-compliant
 *        reliever is not simply left blank — the engine retries with a
 *        clearly flagged, minimally-relaxed rule set so the controller
 *        always has an actionable (but labelled) fallback.
 *  - evaluateCascadingDelayRelief() now delegates to the same optimizer
 *    (previously it assigned relievers to the primary + downstream trains
 *    one at a time, greedily). Its public input/output shape is unchanged
 *    so existing UI code keeps working.
 *
 * ── Real crew-compliance gates (BMRCL PYIDCC hard rules) ─────────────────
 * Beyond duty-hour/break rules, this module now checks whether a candidate is
 * actually AVAILABLE today at all, using the same data the rest of the app
 * already trusts:
 *   - `deployments[].status` (ON_LEAVE / ABSENT / AB / NOT_REPORTING / NR —
 *     the exact codes used across AutomatedDispatchGate, LeaveRequestManager,
 *     etc.) is a hard exclusion.
 *   - STANDING_GROUPS (Pink Line 4 support, BMRTI nomination) from
 *     data/dayTypeProfiles.js mirrors the roster generator's own H7 rule
 *     (services/dutyConstraintEngine.js): these employees are never rostered
 *     on mainline train operations and must never be offered as relievers.
 *   - `crewRegistry` (already an accepted-but-previously-unused parameter on
 *     evaluateReliefCandidates) is now actually consulted: activeCrew,
 *     isRelieved, status ('MATERNITY_LEAVE'), and availableForRelief /
 *     availableForDeployment flags all gate whether someone can be offered.
 *   - an optional `leaveRequests` + `todayDateStr` pair cross-checks the
 *     `leave_requests` collection (status === 'APPROVED', date range covers
 *     today) as defense-in-depth in case a deployment row hasn't caught up
 *     with a newly approved leave.
 * Every exclusion surfaces as an ordinary REJECTED candidate with a clear
 * rejectionReason, exactly like the existing duty-hour/break rules.
 */

import { STANDING_GROUPS } from '../data/dayTypeProfiles.js';

// Deployment/roster status codes that mean "not actually available to drive right
// now", regardless of what pool/duty they are nominally rostered against.
const UNAVAILABLE_STATUS_CODES = new Set(['ON_LEAVE', 'ABSENT', 'AB', 'NOT_REPORTING', 'NR']);

// Employees barred from mainline emergency relief duty under H7 (Duty Constraint
// Engine): Pink Line 4 support secondment and BMRTI open-ended training nomination.
const STANDING_GROUP_BLOCKED_IDS = new Set(
  [...(STANDING_GROUPS.PINK_LINE_4 || []), ...(STANDING_GROUPS.BMRTI_R5 || [])].map(String)
);

/**
 * Determines, from the same live data the rest of the app already relies on, whether
 * an employee can be offered as an emergency reliever at all today — independent of
 * the time-of-day duty-hour/break rules in scoreCandidateForIncident(). Returns a
 * human-readable block reason, or null if nothing disqualifies them (unknown/missing
 * data never blocks — only an explicit disqualifying signal does).
 */
const deriveHardBlockReason = (empId, { rawStatus, crewRegistryByEmpId, leaveRequestsByEmpId, todayDateStr }) => {
  if (rawStatus && UNAVAILABLE_STATUS_CODES.has(String(rawStatus).toUpperCase())) {
    return `Marked ${String(rawStatus).toUpperCase()} in Today's Deployment`;
  }

  if (STANDING_GROUP_BLOCKED_IDS.has(String(empId))) {
    return "H7: Standing Group Restriction (Pink Line 4 / BMRTI Nomination)";
  }

  const registryDoc = crewRegistryByEmpId?.get(String(empId));
  if (registryDoc) {
    if (registryDoc.isRelieved === true) return `Relieved / Transferred${registryDoc.relievedReason ? ` (${registryDoc.relievedReason})` : ''}`;
    if (registryDoc.activeCrew === false) return "Not Active PYID Crew";
    if (registryDoc.status === 'MATERNITY_LEAVE') return "On Maternity Leave";
    if (registryDoc.availableForRelief === false) return "Not Registered Available For Relief";
    if (registryDoc.availableForDeployment === false) return "Not Registered Available For Deployment";
  }

  if (todayDateStr) {
    const activeLeave = leaveRequestsByEmpId?.get(String(empId));
    if (activeLeave) {
      return `On Approved Leave (${activeLeave.leaveType || 'Leave'})`;
    }
  }

  return null;
};

// Station indexing for distance and travel time calculation (DN order)
export const STATION_INDEX = {
  "BIET": 0,
  "JIDL": 1,
  "MNJN": 2,
  "NGSA": 3,
  "DSH": 4,
  "JLHL": 5,
  "PYID": 6,
  "PEYA": 7,
  "YPI": 8,
  "YPM": 9,
  "SSFY": 10,
  "MHLI": 11,
  "RJNR": 12,
  "KVPR": 13,
  "SPRU": 14,
  "SPGD": 15,
  "KGWA": 16,
  "CKPE": 17,
  "KRMT": 18,
  "NLC": 19,
  "LBGH": 20,
  "SECE": 21,
  "JYN": 22,
  "RVR": 23,
  "BSNK": 24,
  "JPN": 25,
  "PUTH": 26,
  "APRC": 27,
  "KLPK": 28,
  "VJRH": 29,
  "TGTP": 30,
  "APTS": 31
};

/**
 * Helper to convert HH:MM:SS or HH:MM to seconds from midnight.
 * Handles late-night shifts (before 3 AM) by adding 24 hours.
 */
export const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
  const parts = timeStr.split(':');
  let secs = 0;
  if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
  if (parts[1]) secs += parseInt(parts[1], 10) * 60;
  if (parts[2]) secs += parseInt(parts[2], 10);

  // Shift late-night train trips (00:00 to 02:59) to the next day for sorting/chronological consistency
  if (secs < 3 * 3600) {
    secs += 24 * 3600;
  }
  return secs;
};

/**
 * Helper to convert seconds to HH:MM:SS format
 */
export const secondsToTime = (secs) => {
  if (secs >= 999999) return '--';
  const shiftedSecs = secs >= 24 * 3600 ? secs - 24 * 3600 : secs;
  const h = Math.floor(shiftedSecs / 3600).toString().padStart(2, '0');
  const m = Math.floor((shiftedSecs % 3600) / 60).toString().padStart(2, '0');
  const s = (shiftedSecs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

/**
 * Calculates travel time between two stations in minutes
 * Assumes 3 minutes travel time per station hop + 2 minutes fixed overhead buffer
 */
export const calculateTravelTimeMinutes = (fromStation, toStation) => {
  const fromIdx = STATION_INDEX[fromStation];
  const toIdx = STATION_INDEX[toStation];

  if (fromIdx === undefined || toIdx === undefined) return 15; // default fallback travel time
  if (fromIdx === toIdx) return 2; // same station buffer

  return Math.abs(fromIdx - toIdx) * 3 + 2;
};

/**
 * Determines the current scheduled location of an operator based on their roster legs
 */
export const determineOperatorLocation = (operator, currentTimeSecs) => {
  const legs = operator.rawLegs;
  if (!legs) return operator.signOnLocation || "PYID";

  const l1Start = timeToSeconds(legs.l1Start);
  const l1End = timeToSeconds(legs.l1End);
  const l2Start = timeToSeconds(legs.l2Start);
  const l2End = timeToSeconds(legs.l2End);
  const l3Start = timeToSeconds(legs.l3Start);
  const l3End = timeToSeconds(legs.l3End);
  const l4Start = timeToSeconds(legs.l4Start);
  const l4End = timeToSeconds(legs.l4End);

  if (currentTimeSecs < l1Start) {
    return operator.signOnLocation || "PYID";
  }
  if (currentTimeSecs >= l1Start && currentTimeSecs <= l1End) {
    return legs.l1End && legs.l1End !== '--' ? legs.l1End : "PYID";
  }
  if (currentTimeSecs > l1End && currentTimeSecs < l2Start) {
    // Rest / break between Leg 1 and Leg 2
    return legs.l1End || legs.l2Start || "PYID";
  }
  if (currentTimeSecs >= l2Start && currentTimeSecs <= l2End) {
    return legs.l2End && legs.l2End !== '--' ? legs.l2End : "APTS";
  }
  if (currentTimeSecs > l2End && currentTimeSecs < l3Start) {
    // Rest / break between Leg 2 and Leg 3
    return legs.l2End || legs.l3Start || "APTS";
  }
  if (currentTimeSecs >= l3Start && currentTimeSecs <= l3End) {
    return legs.l3End && legs.l3End !== '--' ? legs.l3End : "PYID";
  }
  if (currentTimeSecs > l3End && currentTimeSecs < l4Start) {
    // Rest / break between Leg 3 and Leg 4
    return legs.l3End || legs.l4Start || "PYID";
  }
  if (currentTimeSecs >= l4Start && currentTimeSecs <= l4End) {
    return legs.l4End && legs.l4End !== '--' ? legs.l4End : "APTS";
  }

  return operator.signOffLocation || "PYID";
};

/**
 * Extracts a canonical BMRCL Line 2 Train ID (201-223) from a string or number
 */
export const extractBmrclTrainId = (val) => {
  if (!val || val === '--' || val === '-') return null;
  const str = String(val).trim();
  const match = str.match(/\b(20[1-9]|21[0-9]|22[0-3])\b/);
  return match ? match[1] : null;
};

/**
 * Resolves the active Train ID (preferring 201-223 range) from a deployment record
 */
export const resolveDepTrainId = (dep) => {
  if (!dep) return null;
  const candidates = [
    dep.trainId,
    dep.trainNo,
    dep.rakeId,
    dep.rawLegs?.l1Train,
    dep.rawLegs?.l2Train,
    dep.rawLegs?.l3Train,
    dep.rawLegs?.l4Train,
    dep.leg1TrainNo,
    dep.leg2TrainNo,
    dep.leg3TrainNo,
    dep.leg4TrainNo
  ];
  for (const c of candidates) {
    const tid = extractBmrclTrainId(c);
    if (tid) return tid;
  }
  const raw = dep.trainId || dep.rawLegs?.l1Train;
  if (raw && raw !== '--' && raw !== '-') {
    return String(raw).trim();
  }
  return null;
};

/**
 * Builds the shared pool of every candidate that could physically be pulled in as a
 * Builds the shared pool of candidates available for relief, drawn directly from
 * the BMRCL Line 2 Peenya Depot Roster Desk Console deployments: Standby, STBK,
 * PRO, and TGTP train operators, followed by active roster operators.
 *
 * @param {Object} params
 * @param {Array} params.deployments
 * @param {Set<string>} [params.excludeEmployeeIds]
 */
export const buildSharedCandidatePool = ({
  deployments = [],
  consoleData = null,
  excludeEmployeeIds = new Set(),
  crewRegistry = [],
  leaveRequests = [],
  todayDateStr = null
}) => {
  const candidatesMap = new Map();

  // 1. Ingest Standby, STBK, OR, and PRO operators directly from BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
  if (consoleData) {
    // A. Standbys & OR operators (@Standby, @OR)
    (consoleData.standbys || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--' || empId === '-' || excludeEmployeeIds.has(empId) || candidatesMap.has(empId)) return;
      const codeUpper = String(item.code || item.label || 'OR').toUpperCase();
      const isOR = codeUpper.startsWith('OR') || codeUpper.includes(' OR ');
      candidatesMap.set(empId, {
        employeeId: empId,
        employeeName: item.name || 'Standby Operator',
        currentLocation: 'PYID',
        rawLegs: null,
        currentDuty: item.code || item.label || (isOR ? 'OR' : 'STANDBY'),
        currentTrainId: null,
        signOnTime: item.time ? String(item.time).split('-')[0].trim() : '06:00:00',
        signOffTime: item.time && item.time.includes('-') ? String(item.time).split('-')[1].trim() : '14:00:00',
        pool: 'STANDBY',
        tripCount: 0,
        remarks: isOR ? 'Operating Reserve (OR) Standby Peenya' : 'Standby Operator Peenya'
      });
    });

    // B. STBK (Outstation Step-back) operators (@STBK)
    (consoleData.outstationStepbacks || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--' || empId === '-' || excludeEmployeeIds.has(empId) || candidatesMap.has(empId)) return;
      candidatesMap.set(empId, {
        employeeId: empId,
        employeeName: item.name || 'STBK Operator',
        currentLocation: item.station || item.loc || 'PYID',
        rawLegs: null,
        currentDuty: 'STBK',
        currentTrainId: null,
        signOnTime: item.time ? String(item.time).split('-')[0].trim() : '06:00:00',
        signOffTime: '14:00:00',
        pool: 'STBK',
        tripCount: 0,
        remarks: 'STBK Peenya Step-Back Operator'
      });
    });

    // C. PRO & TGTP & customRegisters (@PRO, @TGTP, @RD3)
    if (consoleData.customRegisters) {
      Object.entries(consoleData.customRegisters).forEach(([tag, list]) => {
        if (!Array.isArray(list)) return;
        const tagUpper = tag.toUpperCase();
        const isPro = tagUpper.includes('PRO') || tagUpper.includes('NPRO');
        const isTgtp = tagUpper.includes('TGTP');
        const isRd3 = tagUpper.includes('RD3') || tagUpper.includes('RD-3');
        const poolType = isPro ? 'PRO' : isTgtp ? 'TGTP' : isRd3 ? 'RD3' : null;
        if (!poolType) return;

        list.forEach(item => {
          const empId = String(item.empNo || item.empId || '').trim();
          if (!empId || empId === '--' || empId === '-' || excludeEmployeeIds.has(empId) || candidatesMap.has(empId)) return;
          candidatesMap.set(empId, {
            employeeId: empId,
            employeeName: item.name || `${poolType} Operator`,
            currentLocation: isTgtp ? 'TGTP' : 'PYID',
            rawLegs: null,
            currentDuty: tag,
            currentTrainId: null,
            signOnTime: item.info || item.time || '06:00:00',
            signOffTime: '14:00:00',
            pool: poolType,
            tripCount: 0,
            remarks: `${poolType} Standby Operator`
          });
        });
      });
    }
  }

  const crewRegistryByEmpId = new Map(
    crewRegistry
      .map(c => [String(c.empId ?? c.employeeId ?? c.id ?? ''), c])
      .filter(([id]) => id)
  );

  const leaveRequestsByEmpId = new Map();
  if (todayDateStr) {
    leaveRequests.forEach(req => {
      if (String(req.status).toUpperCase() !== 'APPROVED') return;
      const start = req.startDate || todayDateStr;
      const end = req.endDate || req.startDate || todayDateStr;
      if (todayDateStr >= start && todayDateStr <= end) {
        const empId = String(req.empId ?? req.employeeId ?? '');
        if (empId) leaveRequestsByEmpId.set(empId, req);
      }
    });
  }

  deployments.forEach(dep => {
    const empId = String(dep.empId || dep.empNo || '').trim();
    if (!empId || empId === '--' || empId === '-' || empId === 'UNASSIGNED') return;
    if (excludeEmployeeIds.has(empId)) return;
    if (candidatesMap.has(empId)) return;

    const combinedStr = [
      dep.dutyId,
      dep.dutyType,
      dep.dutyNo,
      dep.code,
      dep.remarks,
      dep.role,
      dep.trainId
    ].filter(Boolean).join(" ").toUpperCase();

    const isStbk = combinedStr.includes("STBK") || combinedStr.includes("STEPBACK");
    const isStandby = combinedStr.includes("STANDBY") || combinedStr.includes("STBY") || combinedStr.startsWith("OR") || combinedStr.includes(" OR ") || combinedStr.startsWith("SB");
    const isPro = combinedStr.includes("PRO") || combinedStr.includes("NPRO");
    const isTgtp = combinedStr.includes("TGTP");
    const isRd3 = combinedStr.includes("RD3") || combinedStr.includes("RD-3");

    let poolType = "ACTIVE";
    let poolLabel = "Active Roster TO";
    let defaultLocation = "PYID";

    if (isStandby) {
      poolType = "STANDBY";
      poolLabel = "Standby / OR Peenya Operator";
      defaultLocation = dep.signOnLocation || dep.station || dep.loc || "PYID";
    } else if (isStbk) {
      poolType = "STBK";
      poolLabel = "STBK / Step-Back Peenya Operator";
      defaultLocation = dep.signOnLocation || dep.station || dep.loc || "PYID";
    } else if (isPro) {
      poolType = "PRO";
      poolLabel = "PRO Pilot Standby";
      defaultLocation = dep.signOnLocation || dep.station || dep.loc || "PYID";
    } else if (isTgtp) {
      poolType = "TGTP";
      poolLabel = "TGTP Standby Operator";
      defaultLocation = dep.signOnLocation || dep.station || dep.loc || "TGTP";
    } else if (isRd3) {
      poolType = "RD3";
      poolLabel = "RD3 Standby Duty";
      defaultLocation = dep.signOnLocation || dep.station || dep.loc || "PYID";
    }

    const trainId = resolveDepTrainId(dep);

    candidatesMap.set(empId, {
      employeeId: empId,
      employeeName: dep.empName || dep.name || 'Train Operator',
      currentLocation: defaultLocation,
      rawLegs: dep.rawLegs,
      currentDuty: dep.dutyId || dep.dutyNo || poolType,
      currentTrainId: trainId,
      signOnTime: dep.signOnTime || "06:00:00",
      signOffTime: dep.rawLegs?.l4End || dep.rawLegs?.l3End || dep.signOffTime || "14:00:00",
      pool: poolType,
      tripCount: 2,
      remarks: poolLabel,
      hardBlockReason: deriveHardBlockReason(empId, { rawStatus: dep.status, crewRegistryByEmpId, leaveRequestsByEmpId, todayDateStr })
    });
  });

  return Array.from(candidatesMap.values());
};

/**
 * Resolves a candidate's live location for a given evaluation time (Extra Operators are
 * stationary at their registered standby point; roster-linked candidates move through
 * their duty legs).
 */
const resolveCandidateLocation = (candidate, currentTimeSecs) => {
  if (["STANDBY", "STBK", "PRO", "TGTP", "RD3"].includes(candidate.pool)) {
    return candidate.currentLocation || "PYID";
  }
  return determineOperatorLocation(candidate, currentTimeSecs);
};

/**
 * Scores ONE candidate against ONE incident (a train needing a new operator right now),
 * applying every business rule from the original engine: duty-hour protection, FIFO break
 * completion, pool priority (Standby, STBK, PRO, TGTP from Roster Desk Console),
 * short-loop bonus, duty-balance fairness and travel-time distance penalty.
 *
 * @param {Object} candidate - from buildSharedCandidatePool()
 * @param {Object} ctx
 * @param {number} ctx.currentTimeSecs
 * @param {string} ctx.incidentLocation
 * @param {string|null} [ctx.currentOperatorEmployeeId] - the operator currently on the
 *        incident train (a candidate can never relieve their own train).
 * @param {Array} [ctx.reliefReports]
 * @param {number} [ctx.avgDutyHours]
 * @param {boolean} [ctx.allowRelaxed] - when true, near-miss duty/break violations are
 *        returned as ELIGIBLE-but-flagged instead of hard REJECTED, so the controller
 *        always has a fallback option rather than a dead end.
 */
export const scoreCandidateForIncident = (candidate, ctx) => {
  const {
    currentTimeSecs,
    incidentLocation = "PYID",
    currentOperatorEmployeeId = null,
    reliefReports = [],
    avgDutyHours = 8,
    allowRelaxed = false
  } = ctx;

  // A candidate can never relieve the very train they are currently driving.
  if (currentOperatorEmployeeId && candidate.employeeId === String(currentOperatorEmployeeId)) {
    return {
      ...candidate,
      status: "REJECTED",
      rejectionReason: "Already Assigned To This Train",
      recommendationScore: 0,
      breakTime: "--"
    };
  }

  // Real crew-compliance gate (H7 standing groups, leave/absence, active-crew status) —
  // computed once at pool-build time in buildSharedCandidatePool(). This always wins over
  // score/time-based rules: an absent or barred employee is never a "candidate", full stop.
  if (candidate.hardBlockReason) {
    return {
      ...candidate,
      status: "REJECTED",
      rejectionReason: candidate.hardBlockReason,
      recommendationScore: 0,
      breakTime: "--"
    };
  }

  const currentLocation = ["STANDBY", "STBK", "PRO", "TGTP", "RD3"].includes(candidate.pool) && candidate.currentLocation
    ? candidate.currentLocation
    : resolveCandidateLocation(candidate, currentTimeSecs);

  const signOnSecs = timeToSeconds(candidate.signOnTime || currentTimeSecs);
  const parsedSignOff = timeToSeconds(candidate.signOffTime);
  const signOffSecs = parsedSignOff > 0 ? parsedSignOff : signOnSecs + 8 * 3600;

  // A. Duty Hour Protection
  const dutyDurationSecs = currentTimeSecs - signOnSecs;
  const isDutyDurationExceeded = dutyDurationSecs > 8 * 3600;
  const isSignOffExceeded = currentTimeSecs >= signOffSecs;
  const dutyOverageMinutes = Math.max(
    isDutyDurationExceeded ? (dutyDurationSecs - 8 * 3600) / 60 : 0,
    isSignOffExceeded ? (currentTimeSecs - signOffSecs) / 60 : 0
  );

  if (isDutyDurationExceeded || isSignOffExceeded) {
    const canRelax = allowRelaxed && dutyOverageMinutes > 0 && dutyOverageMinutes <= 30;
    if (!canRelax) {
      return {
        ...candidate,
        status: "REJECTED",
        rejectionReason: "Duty Hour Limit Exceeded",
        recommendationScore: 0,
        breakTime: "--"
      };
    }
  }

  // B. FIFO break time checks
  const operatorReliefs = reliefReports
    .filter(r => String(r.reliefOperator?.employeeId || r.reliefOperatorId) === candidate.employeeId)
    .sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds || b.incidentTime - a.incidentTime);

  let lastRelievedSecs = 0;
  let hasRecentRelief = false;
  let timeSinceLastRelief = 999999;
  let breakShortfallMinutes = 0;

  if (operatorReliefs.length > 0) {
    const lastRelief = operatorReliefs[0];
    const reliefTimeStr = lastRelief.incidentTime || secondsToTime(lastRelief.timestamp?.seconds || 0);
    lastRelievedSecs = timeToSeconds(reliefTimeStr);
    timeSinceLastRelief = currentTimeSecs - lastRelievedSecs;

    if (timeSinceLastRelief >= 0 && timeSinceLastRelief < 15 * 60) {
      hasRecentRelief = true;
      breakShortfallMinutes = (15 * 60 - timeSinceLastRelief) / 60;
    }
  }

  if (hasRecentRelief) {
    const canRelax = allowRelaxed && breakShortfallMinutes <= 5;
    if (!canRelax) {
      return {
        ...candidate,
        status: "REJECTED",
        rejectionReason: "Break Not Completed",
        recommendationScore: 0,
        breakTime: `${Math.round(timeSinceLastRelief / 60)} Mins Ago`
      };
    }
  }

  // C. Score Calculation (Standby, STBK, PRO, TGTP from Roster Desk Console)
  let score = 0;
  const scoreBreakdown = [];
  let overrideRequired = false;

  if (candidate.pool === "STANDBY") {
    score += 100;
    scoreBreakdown.push({ label: "Standby / OR Operator Available", points: 100 });
  } else if (candidate.pool === "STBK") {
    score += 95;
    scoreBreakdown.push({ label: "STBK Peenya Operator Available", points: 95 });
  } else if (candidate.pool === "PRO") {
    score += 85;
    scoreBreakdown.push({ label: "PRO Standby Operator Available", points: 85 });
  } else if (candidate.pool === "TGTP") {
    score += 80;
    scoreBreakdown.push({ label: "TGTP Standby Operator Available", points: 80 });
  } else if (candidate.pool === "RD3") {
    score += 75;
    scoreBreakdown.push({ label: "RD3 Standby Operator Available", points: 75 });
  }

  const candidateDurationHours = (currentTimeSecs - signOnSecs) / 3600;
  if (candidateDurationHours > 4) {
    score += 60;
    scoreBreakdown.push({ label: "FIFO Eligible (Continuous Work)", points: 60 });
  }

  if (["STANDBY", "STBK", "PRO", "TGTP", "RD3"].includes(candidate.pool) || (operatorReliefs.length > 0 && timeSinceLastRelief >= 15 * 60)) {
    score += 50;
    scoreBreakdown.push({ label: "15-Minute Break Completed", points: 50 });
  }

  let isShortLoop = false;
  if (incidentLocation === "PYID" && currentOperatorEmployeeId) {
    const currOpReliefs = reliefReports.filter(r => String(r.originalOperator?.employeeId || r.originalOperatorId) === String(currentOperatorEmployeeId));
    if (currOpReliefs.length > 0) {
      const lastReliefTime = timeToSeconds(currOpReliefs[0].incidentTime);
      if (currentTimeSecs - lastReliefTime >= 15 * 60) {
        isShortLoop = true;
      }
    }
  }
  if (isShortLoop) {
    score += 40;
    scoreBreakdown.push({ label: "Short Loop Possible (PYID UP → DN)", points: 40 });
  }

  if (candidateDurationHours < avgDutyHours) {
    score += 30;
    scoreBreakdown.push({ label: "Duty Balance Improvement", points: 30 });
  }

  const travelTime = calculateTravelTimeMinutes(currentLocation, incidentLocation);
  const distancePenalty = Math.min(20, travelTime * 2);
  score -= distancePenalty;
  if (distancePenalty > 0) {
    scoreBreakdown.push({ label: `Distance Penalty (${travelTime} min travel)`, points: -distancePenalty });
  }

  if (dutyOverageMinutes > 0) {
    overrideRequired = true;
    score -= 70;
    scoreBreakdown.push({ label: `Override: ${Math.round(dutyOverageMinutes)} min past duty limit`, points: -70 });
  }
  if (hasRecentRelief) {
    overrideRequired = true;
    score -= 40;
    scoreBreakdown.push({ label: `Override: break ${Math.round(breakShortfallMinutes)} min short`, points: -40 });
  }

  const isActiveElsewhere = candidate.pool === "ACTIVE" && candidate.currentTrainId;

  const breakTimeText = operatorReliefs.length > 0
    ? `${Math.round(timeSinceLastRelief / 60)} Mins Rested`
    : "Full Shift Available";

  return {
    ...candidate,
    currentLocation,
    status: "ELIGIBLE",
    dutyHours: `${Math.floor(candidateDurationHours)}h ${Math.round((candidateDurationHours % 1) * 60)}m`,
    breakTime: breakTimeText,
    recommendationScore: Math.max(0, score),
    rawScore: score,
    scoreBreakdown,
    travelTimeMinutes: travelTime,
    overrideRequired,
    vacatesTrainId: isActiveElsewhere ? candidate.currentTrainId : null
  };
};

/**
 * Kuhn-Munkres (Hungarian) minimum-cost bipartite assignment algorithm, O(n^3).
 *
 * Given a cost matrix (rows = "jobs", columns = "workers"; non-square allowed), returns
 * the row→column assignment that minimizes total cost, matching each row to at most one
 * column and vice versa. Rows/columns that cannot be feasibly matched should carry
 * Infinity (or any non-finite number) — those pairings are only chosen if absolutely no
 * alternative exists elsewhere in the same row/column, and pure padding cells (added to
 * square the matrix) cost 0, so a genuinely infeasible pair will always lose to "leave it
 * unassigned" rather than being forced through.
 *
 * This is the core "advanced method" that turns crew relief from a sequence of greedy,
 * one-train-at-a-time picks into a single globally optimal batch decision — exactly what
 * is needed when OCC swaps trains and several operators must be re-seated at once.
 *
 * @param {number[][]} costMatrix
 * @returns {number[]} assignment where assignment[row] = matched column index, or -1
 */
export const hungarianAlgorithm = (costMatrix) => {
  const nRows = costMatrix.length;
  if (nRows === 0) return [];
  const nCols = costMatrix.reduce((mx, row) => Math.max(mx, row.length), 0);
  if (nCols === 0) return new Array(nRows).fill(-1);

  const size = Math.max(nRows, nCols);
  const BIG = 1e9;

  // 1-indexed padded square cost matrix, as used by the classic O(n^3) implementation.
  const a = Array.from({ length: size + 1 }, () => new Array(size + 1).fill(0));
  for (let i = 1; i <= size; i++) {
    for (let j = 1; j <= size; j++) {
      if (i <= nRows && j <= (costMatrix[i - 1]?.length || 0)) {
        const raw = costMatrix[i - 1][j - 1];
        a[i][j] = Number.isFinite(raw) ? raw : BIG;
      } else {
        a[i][j] = 0; // dummy padding row/col — "leave unassigned" always available
      }
    }
  }

  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0); // p[j] = row currently matched to column j
  const way = new Array(size + 1).fill(0);

  for (let i = 1; i <= size; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(size + 1).fill(INF);
    const used = new Array(size + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= size; j++) {
        if (!used[j]) {
          const cur = a[i0][j] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= size; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToCol = new Array(nRows).fill(-1);
  for (let j = 1; j <= size; j++) {
    const row = p[j] - 1;
    const col = j - 1;
    if (row >= 0 && row < nRows && col < nCols) {
      const rawCost = costMatrix[row]?.[col];
      if (Number.isFinite(rawCost) && rawCost < BIG) {
        rowToCol[row] = col;
      }
    }
  }
  return rowToCol;
};

/**
 * Tarjan's strongly-connected-components algorithm, used to find hand-off cycles in the
 * reliever dependency graph (e.g. a direct A↔B train swap, or a longer chain deadlock).
 * @param {number} n - number of nodes (0..n-1)
 * @param {Map<number, number[]>} adj - adjacency list, edge i -> j means "i must be
 *        resolved before j can start" (j depends on i)
 * @returns {number[][]} list of SCCs (each an array of node indices), size >= 1
 */
const tarjanSCC = (n, adj) => {
  let index = 0;
  const indices = new Array(n).fill(-1);
  const lowlink = new Array(n).fill(0);
  const onStack = new Array(n).fill(false);
  const stack = [];
  const result = [];

  const strongConnect = (v) => {
    indices[v] = index;
    lowlink[v] = index;
    index += 1;
    stack.push(v);
    onStack[v] = true;

    (adj.get(v) || []).forEach(w => {
      if (indices[w] === -1) {
        strongConnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], indices[w]);
      }
    });

    if (lowlink[v] === indices[v]) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      result.push(scc);
    }
  };

  for (let v = 0; v < n; v++) {
    if (indices[v] === -1) strongConnect(v);
  }
  return result;
};

/**
 * Global, multi-train relief optimizer.
 *
 * Feed it every train that currently needs a new operator right now — because OCC swapped
 * trains and displaced two or more operators, because a delay is cascading into several
 * following services, or simply because several unrelated incidents are live at once — and
 * it returns ONE globally-optimal set of assignments plus a concrete execution plan
 * (dependency order, hand-off cycle warnings, and the fastest possible time to fully clear
 * every pending manual reassignment).
 *
 * @param {Object} params
 * @param {string} params.currentTimeStr
 * @param {Object} params
 * @param {string} params.currentTimeStr
 * @param {Array<{trainId:string, incidentType?:string, location?:string}>} params.incidents
 * @param {Array} params.deployments
 * @param {Array} [params.reliefReports]
 * @param {boolean} [params.allowConstraintRelaxation=true]
 */
export const resolveMultiTrainRelief = ({
  currentTimeStr,
  incidents = [],
  deployments = [],
  consoleData = null,
  reliefReports = [],
  crewRegistry = [],
  leaveRequests = [],
  todayDateStr = null,
  allowConstraintRelaxation = true
}) => {
  const currentTimeSecs = timeToSeconds(currentTimeStr);
  const incidentList = incidents.filter(inc => inc && inc.trainId);
  const incidentTrainIds = incidentList.map(inc => String(inc.trainId));

  // Who is currently driving each incident train (needed to (a) exclude them as their own
  // reliever and (b) detect hand-off dependencies between incidents in this same batch).
  const currentOperatorByTrain = new Map();
  // 1. Check if incidents provided currentOperator directly (e.g. from activeTrains in console)
  incidentList.forEach(inc => {
    if (inc.currentOperator && inc.currentOperator.employeeId && inc.currentOperator.employeeId !== '--') {
      currentOperatorByTrain.set(String(inc.trainId), {
        employeeId: String(inc.currentOperator.employeeId),
        employeeName: inc.currentOperator.employeeName || 'Active TO',
        dutyId: inc.currentOperator.dutyId || '--',
        rawLegs: inc.currentOperator.rawLegs || null
      });
    }
  });

  // 2. Query deployments with canonical BMRCL Train ID resolution
  deployments.forEach(dep => {
    const tid = resolveDepTrainId(dep);
    if (tid && incidentTrainIds.includes(String(tid)) && dep.empId && dep.empId !== '--' && !currentOperatorByTrain.has(String(tid))) {
      currentOperatorByTrain.set(String(tid), {
        employeeId: String(dep.empId),
        employeeName: dep.empName,
        dutyId: dep.dutyId,
        rawLegs: dep.rawLegs
      });
    }
  });

  // One shared candidate pool for the whole batch — a candidate can only relieve ONE
  // incident train even though they may be scored against several.
  const candidatesList = buildSharedCandidatePool({ deployments, consoleData, crewRegistry, leaveRequests, todayDateStr });

  // Average duty hours across active candidates, used for the Duty Balance bonus.
  let totalDutyHours = 0;
  let activeCount = 0;
  candidatesList.forEach(c => {
    if (c.pool === "ACTIVE") {
      const on = timeToSeconds(c.signOnTime);
      const off = timeToSeconds(c.signOffTime);
      totalDutyHours += (off - on) / 3600;
      activeCount++;
    }
  });
  const avgDutyHours = activeCount > 0 ? totalDutyHours / activeCount : 8;

  const scoreMatrixFor = (allowRelaxed) => incidentList.map((inc, rowIdx) => {
    const currentOp = inc.currentOperator || currentOperatorByTrain.get(String(inc.trainId));
    return candidatesList.map(candidate => {
      const evalResult = scoreCandidateForIncident(candidate, {
        currentTimeSecs,
        incidentLocation: inc.location || "PYID",
        currentOperatorEmployeeId: currentOp?.employeeId || null,
        reliefReports,
        avgDutyHours,
        allowRelaxed
      });
      return evalResult;
    });
  });

  // Pass 1: strict rules only.
  const strictEval = scoreMatrixFor(false);
  const strictCost = strictEval.map(row => row.map(r => (r.status === "ELIGIBLE" ? -r.recommendationScore : Infinity)));
  const strictAssignment = hungarianAlgorithm(strictCost);

  // Pass 2 (only for incidents pass 1 could not resolve, and only if allowed): relaxed rules,
  // restricted to candidates pass 1 did not already use, so nobody is double-booked.
  const usedCandidateIdx = new Set(strictAssignment.filter(c => c >= 0));
  const unresolvedRowIdx = strictAssignment
    .map((c, idx) => (c === -1 ? idx : -1))
    .filter(idx => idx !== -1);

  let relaxedAssignmentByRow = new Map();
  if (allowConstraintRelaxation && unresolvedRowIdx.length > 0) {
    const relaxedEvalFull = scoreMatrixFor(true);
    const remainingCandidateIdx = candidatesList.map((_, idx) => idx).filter(idx => !usedCandidateIdx.has(idx));
    if (remainingCandidateIdx.length > 0) {
      const relaxedCost = unresolvedRowIdx.map(rowIdx =>
        remainingCandidateIdx.map(colIdx => {
          const r = relaxedEvalFull[rowIdx][colIdx];
          return r.status === "ELIGIBLE" ? -r.recommendationScore : Infinity;
        })
      );
      const relaxedAssignment = hungarianAlgorithm(relaxedCost);
      relaxedAssignment.forEach((localCol, localRow) => {
        if (localCol >= 0) {
          const rowIdx = unresolvedRowIdx[localRow];
          const colIdx = remainingCandidateIdx[localCol];
          relaxedAssignmentByRow.set(rowIdx, { colIdx, evalResult: relaxedEvalFull[rowIdx][colIdx] });
        }
      });
    }
  }

  // Assemble final per-incident assignments (supporting multiple duty assignments per Train ID)
  const assignments = incidentList.map((inc, rowIdx) => {
    const currentOp = inc.currentOperator || currentOperatorByTrain.get(String(inc.trainId)) || null;
    let reliever = null;
    let overrideRequired = false;
    let vacatesTrainId = null;

    if (strictAssignment[rowIdx] >= 0) {
      const r = strictEval[rowIdx][strictAssignment[rowIdx]];
      reliever = r;
      vacatesTrainId = r.vacatesTrainId || null;
    } else if (relaxedAssignmentByRow.has(rowIdx)) {
      const { evalResult } = relaxedAssignmentByRow.get(rowIdx);
      reliever = evalResult;
      overrideRequired = true;
      vacatesTrainId = evalResult.vacatesTrainId || null;
    }

    return {
      trainId: String(inc.trainId),
      dutyId: inc.dutyId || currentOp?.dutyId || "--",
      incidentType: inc.incidentType || "Emergency",
      location: inc.location || "PYID",
      currentOperatorId: currentOp?.employeeId || "--",
      currentOperatorName: currentOp?.employeeName || "UNSCHEDULED",
      reliever: reliever ? {
        employeeId: reliever.employeeId,
        employeeName: reliever.employeeName,
        pool: reliever.pool,
        location: reliever.currentLocation,
        travelTimeMinutes: reliever.travelTimeMinutes,
        score: reliever.recommendationScore,
        dutyHours: reliever.dutyHours,
        breakTime: reliever.breakTime
      } : null,
      overrideRequired,
      vacatesTrainId
    };
  });

  // Hand-off dependency graph: incident i depends on incident j when i's reliever is
  // currently the operator driving j's train/duty (they must be freed from j first).
  const dependsOn = assignments.map(() => []);
  const adjForward = new Map(); // j -> [i, ...]  (j must finish before i starts)
  assignments.forEach((a, i) => {
    if (!a.reliever) return;
    assignments.forEach((other, j) => {
      if (i !== j && other.currentOperatorId && other.currentOperatorId !== '--' && other.currentOperatorId === a.reliever.employeeId) {
        dependsOn[i].push(j);
        if (!adjForward.has(j)) adjForward.set(j, []);
        adjForward.get(j).push(i);
      }
    });
  });

  // Detect cycles (SCCs of size > 1) among the dependency edges.
  const sccs = tarjanSCC(assignments.length, adjForward).filter(scc => scc.length > 1);
  const cycles = [];
  const brokenEdges = new Set(); // "i-j" pairs (i depends on j) to drop when scheduling

  sccs.forEach(scc => {
    const trains = scc.map(idx => assignments[idx].trainId);
    if (scc.length === 2) {
      cycles.push({ type: "PARALLEL_SWAP", trains, suggestion: "Direct operator swap — both hand-offs can be dispatched simultaneously." });
      // Both directions become concurrent (no ordering constraint between the pair).
      brokenEdges.add(`${scc[0]}-${scc[1]}`);
      brokenEdges.add(`${scc[1]}-${scc[0]}`);
    } else {
      // Break the cycle at the edge with the shortest travel time (cheapest to re-sequence
      // manually / cover with a temporary standby), and note it for the controller.
      let weakestEdge = null;
      let weakestCost = Infinity;
      scc.forEach(i => {
        (dependsOn[i] || []).forEach(j => {
          if (scc.includes(j)) {
            const cost = assignments[i].reliever?.travelTimeMinutes ?? 0;
            if (cost < weakestCost) {
              weakestCost = cost;
              weakestEdge = `${i}-${j}`;
            }
          }
        });
      });
      if (weakestEdge) brokenEdges.add(weakestEdge);
      cycles.push({
        type: "CHAIN_CYCLE",
        trains,
        suggestion: `${scc.length}-way hand-off deadlock — insert a temporary Extra/Standby operator on one train to break the loop, or coordinate a simultaneous radio hand-off across all ${scc.length} trains.`
      });
    }
  });

  // Critical-Path-Method scheduling over the (now acyclic) dependency graph.
  const DISPATCH_OVERHEAD_MIN = 3;
  const earliestStart = new Array(assignments.length).fill(0);
  const earliestFinish = new Array(assignments.length).fill(0);
  const duration = assignments.map(a => (a.reliever ? a.reliever.travelTimeMinutes + DISPATCH_OVERHEAD_MIN : 0));

  const effectiveDeps = assignments.map((_, i) => (dependsOn[i] || []).filter(j => !brokenEdges.has(`${i}-${j}`)));

  // Topological order via Kahn's algorithm (graph is now a DAG after cycle-breaking).
  const inDegree = assignments.map(() => 0);
  effectiveDeps.forEach((deps) => deps.forEach(() => {}));
  const forwardEdges = assignments.map(() => []);
  effectiveDeps.forEach((deps, i) => {
    deps.forEach(j => {
      forwardEdges[j].push(i);
      inDegree[i] += 1;
    });
  });
  const queue = [];
  for (let i = 0; i < assignments.length; i++) if (inDegree[i] === 0) queue.push(i);
  const topoOrder = [];
  const inDegreeCopy = [...inDegree];
  while (queue.length > 0) {
    const node = queue.shift();
    topoOrder.push(node);
    forwardEdges[node].forEach(next => {
      inDegreeCopy[next] -= 1;
      if (inDegreeCopy[next] === 0) queue.push(next);
    });
  }
  // Any nodes left out (shouldn't happen post cycle-break, but guard defensively) go last.
  assignments.forEach((_, i) => { if (!topoOrder.includes(i)) topoOrder.push(i); });

  topoOrder.forEach(i => {
    const deps = effectiveDeps[i];
    earliestStart[i] = deps.length > 0 ? Math.max(...deps.map(j => earliestFinish[j])) : 0;
    earliestFinish[i] = earliestStart[i] + duration[i];
  });

  const totalResolutionMinutes = assignments.length > 0 ? Math.max(...earliestFinish) : 0;

  const executionPlan = topoOrder.map((idx, seqPos) => ({
    sequence: seqPos + 1,
    trainId: assignments[idx].trainId,
    currentOperatorId: assignments[idx].currentOperatorId,
    currentOperatorName: assignments[idx].currentOperatorName,
    dutyId: assignments[idx].dutyId,
    reliever: assignments[idx].reliever,
    overrideRequired: assignments[idx].overrideRequired,
    dependsOn: effectiveDeps[idx].map(j => assignments[j].trainId),
    earliestStart: Math.round(earliestStart[idx]),
    earliestFinish: Math.round(earliestFinish[idx])
  }));

  return {
    assignments,
    executionPlan,
    cycles,
    unresolvedTrainIds: assignments.filter(a => !a.reliever).map(a => a.trainId),
    totalResolutionMinutes: Math.round(totalResolutionMinutes),
    resolvedCount: assignments.filter(a => a.reliever).length,
    totalCount: assignments.length
  };
};

/**
 * Main allocation scoring engine for a SINGLE train. Evaluates all candidates and
 * generates Best/Alt A/Alt B recommendations. (Unchanged public contract — internally now
 * shares buildSharedCandidatePool()/scoreCandidateForIncident() with the multi-train
 * optimizer so both paths always agree on the same rules.)
 */
export const evaluateReliefCandidates = ({
  currentTimeStr,
  incidentType,
  incidentLocation = "PYID",
  targetTrainId = "",
  currentOperator = null, // The operator currently on the train being relieved
  deployments = [],
  consoleData = null,
  reliefReports = [],
  crewRegistry = [],
  leaveRequests = [],
  todayDateStr = null
}) => {
  const currentTimeSecs = timeToSeconds(currentTimeStr);

  const excludeEmployeeIds = new Set();
  if (currentOperator) excludeEmployeeIds.add(String(currentOperator.employeeId));

  const candidatesList = buildSharedCandidatePool({ deployments, consoleData, excludeEmployeeIds, crewRegistry, leaveRequests, todayDateStr });

  // Helper stats for Duty Balance Improvement (+30)
  let totalDutyHours = 0;
  let activeCount = 0;
  candidatesList.forEach(c => {
    if (c.pool === "ACTIVE") {
      const signOn = timeToSeconds(c.signOnTime);
      const signOff = timeToSeconds(c.signOffTime);
      totalDutyHours += (signOff - signOn) / 3600;
      activeCount++;
    }
  });
  const avgDutyHours = activeCount > 0 ? totalDutyHours / activeCount : 8;

  const evaluatedCandidates = candidatesList.map(candidate => scoreCandidateForIncident(candidate, {
    currentTimeSecs,
    incidentLocation,
    currentOperatorEmployeeId: currentOperator?.employeeId || null,
    reliefReports,
    avgDutyHours,
    allowRelaxed: false
  }));

  // Sort eligible candidates by score descending, then by travel time ascending
  const eligibleCandidates = evaluatedCandidates
    .filter(c => c.status === "ELIGIBLE")
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.travelTimeMinutes - b.travelTimeMinutes);

  const rejectedCandidates = evaluatedCandidates.filter(c => c.status === "REJECTED");

  // 3. Assemble Relief Plans (Best, Alt A, Alt B)
  const bestOp = eligibleCandidates[0] || null;
  const altAOp = eligibleCandidates[1] || null;
  const altBOp = eligibleCandidates[2] || null;

  const generatePlanDescription = (op, planName) => {
    if (!op) return { planName, available: false, description: "No suitable relief operator found in pool." };

    let priorityText = "Priority 3 (Roster TO)";
    if (op.pool === "STANDBY" || op.pool === "STBK") priorityText = "Priority 1 (Standby / STBK Operator)";
    if (op.pool === "PRO" || op.pool === "RD3" || op.pool === "TGTP") priorityText = "Priority 2 (Standby TO)";

    const travelText = op.travelTimeMinutes === 2
      ? "already at station"
      : `requires ${op.travelTimeMinutes} mins travel from ${op.currentLocation}`;

    return {
      planName,
      available: true,
      operator: op,
      score: op.recommendationScore,
      recoveryTimeMinutes: op.travelTimeMinutes + 3, // travel time + dispatch setup
      description: `${op.employeeName} (${op.employeeId}) recommended on ${priorityText}. Currently ${travelText}. Duty Hours: ${op.dutyHours}. Rest Time: ${op.breakTime}.`
    };
  };

  return {
    bestPlan: generatePlanDescription(bestOp, "Best Relief Plan"),
    alternativePlanA: generatePlanDescription(altAOp, "Alternative Plan A"),
    alternativePlanB: generatePlanDescription(altBOp, "Alternative Plan B"),
    allEligible: eligibleCandidates,
    allRejected: rejectedCandidates,
    shortLoopPossible: incidentLocation === "PYID" && currentOperator && (evaluatedCandidates.some(c => c.scoreBreakdown?.some(b => b.label.includes("Short Loop"))))
  };
};

/**
 * Cascading Delay & Multi-Train Relief Allocation Engine
 * When a primary train gets delayed by a technical issue, downstream trains on the same track
 * suffer secondary delay propagation. This function calculates projected delay for following trains
 * and assigns unique relievers from STBK, PRO, RD3 STBY, TGTP STBY, and STANDBY pools until train service normalizes.
 *
 * Internally this now runs the whole downstream chain through resolveMultiTrainRelief() — a single
 * globally optimal assignment across every impacted train.
 */
export const evaluateCascadingDelayRelief = ({
  currentTimeStr,
  primaryTrainId,
  delayMinutes = 15,
  incidentLocation = "PYID",
  deployments = [],
  consoleData = null,
  reliefReports = [],
  crewRegistry = [],
  leaveRequests = [],
  todayDateStr = null
}) => {
  const primaryDelay = Math.max(5, parseInt(delayMinutes, 10) || 15);
  const currentTimeSecs = timeToSeconds(currentTimeStr);

  // 1. Gather all active trains from deployments sorted chronologically
  const activeTrainMap = new Map();
  deployments.forEach(d => {
    const tid = resolveDepTrainId(d);
    if (tid && tid !== '--' && tid !== '-' && d.empId && d.empId !== '--') {
      if (!activeTrainMap.has(tid)) {
        activeTrainMap.set(tid, {
          trainId: tid,
          employeeId: d.empId,
          employeeName: d.empName,
          dutyId: d.dutyId,
          signOnTime: d.signOnTime || "06:00:00",
          signOffTime: d.rawLegs?.l4End || d.rawLegs?.l3End || "14:00:00",
          rawLegs: d.rawLegs
        });
      }
    }
  });

  const sortedTrains = Array.from(activeTrainMap.values()).sort((a, b) =>
    a.trainId.localeCompare(b.trainId, undefined, { numeric: true })
  );

  const primaryIdx = sortedTrains.findIndex(t => t.trainId === primaryTrainId);
  const targetChain = primaryIdx >= 0 ? sortedTrains.slice(primaryIdx) : sortedTrains.slice(0, 5);

  // Determine which trains in the chain actually still have a positive projected delay
  const chainInfo = [];
  let currentProjectedDelay = primaryDelay;
  targetChain.forEach((trainItem, index) => {
    if (currentProjectedDelay <= 0) return;
    const isPrimary = index === 0;
    const trainDelay = isPrimary
      ? primaryDelay
      : Math.max(0, currentProjectedDelay - Math.floor(index * 3));
    if (trainDelay <= 0) return;

    const scheduledSecs = currentTimeSecs + index * 600; // 10 min headway intervals
    const projectedSecs = scheduledSecs + trainDelay * 60;

    chainInfo.push({
      trainItem,
      index,
      isPrimary,
      trainDelay,
      scheduledSecs,
      projectedSecs
    });

    currentProjectedDelay = Math.max(0, trainDelay - 4);
  });

  const incidents = chainInfo.map(c => ({
    trainId: c.trainItem.trainId,
    incidentType: c.isPrimary ? "Train Technical Failure" : "Cascading Headway Delay",
    location: c.isPrimary ? incidentLocation : (c.trainItem.rawLegs?.l1End || incidentLocation),
    __projectedTimeStr: secondsToTime(c.projectedSecs)
  }));

  const latestProjectedTimeStr = incidents.length > 0
    ? secondsToTime(Math.max(...chainInfo.map(c => c.projectedSecs)))
    : currentTimeStr;

  const globalResult = resolveMultiTrainRelief({
    currentTimeStr: latestProjectedTimeStr,
    incidents,
    deployments,
    consoleData,
    reliefReports,
    crewRegistry,
    leaveRequests,
    todayDateStr
  });

  const assignmentByTrain = new Map(globalResult.assignments.map(a => [a.trainId, a]));

  const trainCascadePlans = chainInfo.map((c, seq) => {
    const assignment = assignmentByTrain.get(c.trainItem.trainId);
    const reliever = assignment?.reliever || null;

    return {
      sequence: seq + 1,
      trainId: c.trainItem.trainId,
      currentOperatorId: c.trainItem.employeeId,
      currentOperatorName: c.trainItem.employeeName,
      dutyId: c.trainItem.dutyId,
      isPrimary: c.isPrimary,
      delayMinutes: c.trainDelay,
      scheduledTime: secondsToTime(c.scheduledSecs),
      projectedTakeoverTime: secondsToTime(c.projectedSecs),
      location: c.isPrimary ? incidentLocation : (c.trainItem.rawLegs?.l1End || incidentLocation),
      suggestedReliever: reliever ? {
        employeeId: reliever.employeeId,
        employeeName: reliever.employeeName,
        pool: reliever.pool,
        dutyId: assignment.currentDuty,
        location: reliever.location,
        travelTimeMinutes: reliever.travelTimeMinutes,
        score: reliever.score,
        status: "RECOMMENDED"
      } : {
        employeeId: "--",
        employeeName: "NO RELIEVER AVAILABLE",
        pool: "NONE",
        dutyId: "--",
        location: "--",
        travelTimeMinutes: 0,
        score: 0,
        status: "UNASSIGNED"
      }
    };
  });

  const totalImpactedTrains = trainCascadePlans.length;
  const totalRelieversAssigned = trainCascadePlans.filter(p => p.suggestedReliever.employeeId !== "--").length;
  const estimatedNormalizationMinutes = primaryDelay + totalImpactedTrains * 3;

  return {
    primaryTrainId,
    primaryDelayMinutes: primaryDelay,
    totalImpactedTrains,
    totalRelieversAssigned,
    estimatedNormalizationMinutes,
    normalizationTimeStr: secondsToTime(currentTimeSecs + estimatedNormalizationMinutes * 60),
    cascadePlans: trainCascadePlans,
    // New: exposes the global-optimizer's own execution plan / dependency / cycle analysis for
    // callers that want the richer multi-train view instead of the legacy flat list.
    globalOptimization: globalResult
  };
};
