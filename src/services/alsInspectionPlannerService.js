// =========================================================================================
// BMRCL LINE 2 (PEENYA INDUSTRY DEPOT) - ALS CAB INSPECTION PLANNER ENGINE
// Calculates the easiest, most accurate cab inspection plan for Assistant Loco Superintendents
// Integrates:
// 1. Official ALS Nomination Lists (Harsh Joshi, Aruna Kumar DS, Shantiraj)
// 2. Working Time Table (WTT) & Green Line Station Runtimes
// 3. Master Reliever ID Chart (Train Driving Segments & Reliever Handover Points)
// 4. @DISPATCH GATEWAY CORE live active deployed operators
// =========================================================================================

import { 
  WEEKDAY_RELIEF_ID_CHART_2024, 
  SATURDAY_RELIEF_ID_CHART, 
  SUNDAY_RELIEF_ID_CHART, 
  MONDAY_RELIEF_ID_CHART,
  normalizeScheduleDay,
  normalizeDutyId
} from '../data/weekdayReliefIdChartRegistry.js';
import { getOperatorForDuty } from '../data/weekdayMasterDutyRoster.js';
import { getMentorByName } from '../data/mentorTrainOperatorRegistry.js';

// Green Line sequence
export const GREEN_LINE_STATIONS_LIST = [
  { code: "BIET", name: "Madavara", km: 0 },
  { code: "JIDL", name: "Chikkabidarakallu", km: 1.5 },
  { code: "MNJN", name: "Manjunathanagar", km: 3.0 },
  { code: "NGSA", name: "Nagasandra", km: 4.2 },
  { code: "DSH", name: "Dasarahalli", km: 5.5 },
  { code: "JLHL", name: "Jalahalli", km: 6.8 },
  { code: "PYID", name: "Peenya Industry", km: 8.1 },
  { code: "PEYA", name: "Peenya", km: 9.3 },
  { code: "YPI", name: "Goraguntepalya", km: 10.8 },
  { code: "YPM", name: "Yeshwanthpur", km: 12.3 },
  { code: "SSFY", name: "Sandal Soap Factory", km: 13.6 },
  { code: "MHLI", name: "Mahalakshmi", km: 14.8 },
  { code: "RJNR", name: "Rajajinagar", km: 16.0 },
  { code: "KVPR", name: "Mahakavi Kuvempu Road", km: 17.2 },
  { code: "SPRU", name: "Srirampura", km: 18.5 },
  { code: "SPGD", name: "Mantri Square Sampige Road", km: 19.8 },
  { code: "KGWA", name: "Nadaprabhu Kempegowda", km: 21.0 },
  { code: "CKPE", name: "Chickpete", km: 22.2 },
  { code: "KRMT", name: "Krishna Rajendra Market", km: 23.4 },
  { code: "NLC", name: "National College", km: 24.6 },
  { code: "LBGH", name: "Lalbagh", km: 25.8 },
  { code: "SECE", name: "South End Circle", km: 27.0 },
  { code: "JYN", name: "Jayanagar", km: 28.2 },
  { code: "RVR", name: "Rashtreeya Vidyalaya Road", km: 29.4 },
  { code: "BSNK", name: "Banashankari", km: 30.6 },
  { code: "JPN", name: "Jaya Prakash Nagar", km: 31.8 },
  { code: "PUTH", name: "Yelachenahalli", km: 33.1 },
  { code: "APRC", name: "Konanakunte Cross", km: 34.3 },
  { code: "KLPK", name: "Doddakallasandra", km: 35.6 },
  { code: "VJRH", name: "Vajarahalli", km: 36.9 },
  { code: "TGTP", name: "Thalaghattapura", km: 38.2 },
  { code: "APTS", name: "Silk Institute", km: 39.5 }
];

export const STATION_NAMES_MAP = GREEN_LINE_STATIONS_LIST.reduce((acc, st) => {
  acc[st.code] = st.name;
  return acc;
}, {});

// Helper: convert HH:MM:SS or HH:MM to minutes
export function timeStrToMins(tStr) {
  if (!tStr || tStr === '--' || tStr === '-') return 999999;
  const parts = String(tStr).split(':');
  if (parts.length < 2) return 999999;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// Helper: convert minutes to HH:MM format
export function minsToTimeStr(mVal) {
  if (mVal >= 999999) return '--:--';
  const h = Math.floor(mVal / 60) % 24;
  const m = Math.floor(mVal % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Get active Relief ID Chart for the given day type
 */
export function getReliefChartForDay(dayType = 'WEEKDAY') {
  const norm = normalizeScheduleDay(dayType);
  if (norm === 'SUNDAY') return SUNDAY_RELIEF_ID_CHART;
  if (norm === 'SATURDAY' || norm === 'GH') return SATURDAY_RELIEF_ID_CHART;
  if (norm === 'MONDAY') return MONDAY_RELIEF_ID_CHART;
  return WEEKDAY_RELIEF_ID_CHART_2024;
}

/**
 * Resolves all active train driving duties and their current operators.
 * Ingests authoritative @DISPATCH GATEWAY CORE cache, Firestore records, and default roster.
 */
export function resolveActiveDrivingOperatorsMap(deployments = []) {
  const map = new Map();

  // 1. Authoritative cache from @DISPATCH GATEWAY CORE in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem('pyidcc_active_dispatch_deployments');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(d => {
            const rawDuty = d.dutyNo || d.dutyId || d.rawDutyId;
            if (rawDuty) {
              const normDuty = normalizeDutyId(rawDuty);
              const opName = d.operatorName || d.empName || d.name;
              const opId = d.operatorId || d.empId || d.id;
              if (opName && opName !== '--' && !opName.startsWith('Duty ')) {
                map.set(normDuty, {
                  dutyId: normDuty,
                  empName: opName,
                  empId: String(opId || '--').trim(),
                  trainId: d.trainId || null,
                  rawLegs: d.rawLegs || null,
                  source: 'DISPATCH_GATEWAY_CORE'
                });
              }
            }
          });
        }
      }
    } catch (_e) {}
  }

  // 2. Ingest explicitly passed deployments
  (deployments || []).forEach(d => {
    const rawDuty = d.dutyId || d.dutyNo;
    if (rawDuty) {
      const normDuty = normalizeDutyId(rawDuty);
      const opName = d.empName || d.operatorName || d.name;
      const opId = d.empId || d.operatorId || d.id;
      if (opName && opName !== '--' && !opName.startsWith('Duty ') && !map.has(normDuty)) {
        map.set(normDuty, {
          dutyId: normDuty,
          empName: opName,
          empId: String(opId || '--').trim(),
          trainId: d.trainId || null,
          rawLegs: d.rawLegs || null,
          source: 'DEPLOYMENT_ROSTER'
        });
      }
    }
  });

  return map;
}

/**
 * Main ALS Cab Inspection Planning Engine
 * Computes the easiest, sequential, station-by-station plan for the ALS
 */
export function generateALSCabInspectionPlan(params = {}) {
  const {
    mentorName = 'HARSH JOSHI',
    scheduleDay = 'WEEKDAY',
    shiftStartTime = '09:00',
    shiftEndTime = '17:30',
    baseStation = 'PYID',
    deployments = [],
    completedInspections = [],
    selectedOperatorIds = [] // Optional: if provided, focus on these; if empty, inspect ALL available mentees!
  } = params;

  const mentor = getMentorByName(mentorName);
  const assignedMentees = mentor?.assignedOperators || [];
  const assignedEmpIdSet = new Set(assignedMentees.map(m => String(m.empId).trim()));
  const menteeNameMap = new Map(assignedMentees.map(m => [String(m.empId).trim(), m.name]));

  const shiftStartMin = timeStrToMins(shiftStartTime);
  const shiftEndMin = timeStrToMins(shiftEndTime);

  // Active operator mapping from Dispatch Gateway Core
  const activeDutyOpMap = resolveActiveDrivingOperatorsMap(deployments);
  const reliefChart = getReliefChartForDay(scheduleDay);

  // Step 1: Scan all trains and intervals in Relief ID Chart to find all Driving Segments
  // where the driver is one of this ALS's nominated operators!
  const availableMenteeSegments = [];

  Object.entries(reliefChart || {}).forEach(([rawTrainId, legs]) => {
    const trainId = String(rawTrainId).replace(/\D/g, '') || rawTrainId;
    if (!Array.isArray(legs)) return;

    legs.forEach((leg, legIdx) => {
      const normDuty = normalizeDutyId(leg.duty);
      let opRecord = activeDutyOpMap.get(normDuty);
      if (!opRecord) {
        const defaultOp = getOperatorForDuty(normDuty);
        if (defaultOp) {
          opRecord = {
            dutyId: normDuty,
            empName: defaultOp.empName,
            empId: String(defaultOp.empId).trim(),
            source: 'CANONICAL_DEFAULT'
          };
        }
      }

      if (!opRecord || !opRecord.empId || opRecord.empId === '--') return;

      const empId = String(opRecord.empId).trim();
      const isNominatedMentee = assignedEmpIdSet.has(empId);

      if (!isNominatedMentee) return;

      const legStartMin = timeStrToMins(leg.from);
      let legEndMin = timeStrToMins(leg.to);
      if (legEndMin < legStartMin) legEndMin += 24 * 60; // Next day midnight wrap

      // Check if leg overlaps with ALS shift window
      if (legStartMin < shiftEndMin && legEndMin > shiftStartMin) {
        // Identify the Reliever who takes over this train at legEndMin
        let relieverName = 'End of Train Service / Stabled';
        let relieverDutyId = '--';
        let relieverEmpId = '--';

        if (legIdx + 1 < legs.length) {
          const nextLeg = legs[legIdx + 1];
          const nextDuty = normalizeDutyId(nextLeg.duty);
          relieverDutyId = nextDuty;
          const nextOpRecord = activeDutyOpMap.get(nextDuty) || getOperatorForDuty(nextDuty);
          if (nextOpRecord) {
            relieverName = nextOpRecord.empName;
            relieverEmpId = String(nextOpRecord.empId).trim();
          } else {
            relieverName = `Duty #${nextDuty}`;
          }
        }

        // Determine train direction & key stations based on leg time
        // Green Line trains run in 44-min loops between Madavara (BIET) and Silk Institute (APTS)
        // Peenya Industry (PYID) is the primary relief station!
        const effectiveStartMin = Math.max(legStartMin, shiftStartMin);
        const effectiveEndMin = Math.min(legEndMin, shiftEndMin);

        availableMenteeSegments.push({
          trainId,
          dutyId: normDuty,
          operatorId: empId,
          operatorName: opRecord.empName || menteeNameMap.get(empId) || `Operator #${empId}`,
          legFromTime: leg.from,
          legToTime: leg.to,
          legStartMin,
          legEndMin,
          effectiveStartMin,
          effectiveEndMin,
          relieverName,
          relieverDutyId,
          relieverEmpId,
          reliefStation: 'PYID (Peenya Industry)',
          rawLeg: leg
        });
      }
    });
  });

  // Sort available segments chronologically by their operational time
  availableMenteeSegments.sort((a, b) => a.legStartMin - b.legStartMin);

  // If user passed specific operators to inspect, filter to those; otherwise inspect ALL available!
  const targetFilterIds = Array.isArray(selectedOperatorIds) && selectedOperatorIds.length > 0 
    ? new Set(selectedOperatorIds.map(String)) 
    : null;

  const targetSegments = targetFilterIds 
    ? availableMenteeSegments.filter(s => targetFilterIds.has(s.operatorId)) 
    : availableMenteeSegments;

  // Deduplicate: If an operator drives multiple legs, keep their best/primary leg in shift
  const uniqueOperatorSegments = [];
  const seenOps = new Set();
  targetSegments.forEach(seg => {
    if (!seenOps.has(seg.operatorId)) {
      seenOps.add(seg.operatorId);
      uniqueOperatorSegments.push(seg);
    }
  });

  // Step 2: Build the ALS Step-by-Step Easiest Inspection Plan
  let currentTimeMin = shiftStartMin;
  let currentStation = baseStation;
  const steps = [];
  const inspectedOps = new Set();

  // Initial Step: Depart ALS Base Office
  steps.push({
    stepIndex: 1,
    time: minsToTimeStr(currentTimeMin),
    action: 'LEAVE',
    stationCode: currentStation,
    stationName: STATION_NAMES_MAP[currentStation] || 'Peenya Industry',
    platform: 'ALS Crew Control Office',
    details: `Start Cab Inspection Shift for ${mentor.name} at Peenya Industry Depot (ALS Office). Target: Inspect ${uniqueOperatorSegments.length} on-duty nominated Train Operators.`,
    badgeColor: 'bg-slate-900 border-slate-700 text-slate-300'
  });

  let stepSeq = 2;

  // Pathfinding: Loop through segments to build an easy, optimal sequence
  for (let i = 0; i < uniqueOperatorSegments.length; i++) {
    const seg = uniqueOperatorSegments[i];
    if (inspectedOps.has(seg.operatorId)) continue;

    // Boarding time: when the train is at or passing through currentStation (or PYID)
    let boardTimeMin = Math.max(currentTimeMin + 3, seg.legStartMin);
    if (boardTimeMin >= shiftEndMin - 20) break; // Shift ending soon

    // Alternating direction for easy round-trip coverage:
    // Leg 1: DN from Peenya Industry (PYID) towards Kempegowda (KGWA) / Silk Institute (APTS)
    // Leg 2: UP from KGWA/APTS back towards Peenya Industry (PYID) / Madavara (BIET)
    const isDownTrip = (stepSeq % 2 === 0);
    const direction = isDownTrip ? 'DN' : 'UP';
    const platform = isDownTrip ? 'Platform 2 (DN - towards Silk Institute)' : 'Platform 1 (UP - towards Madavara)';

    const boardStationCode = currentStation;
    const boardStationName = STATION_NAMES_MAP[boardStationCode] || 'Peenya Industry';

    // Inspection ride duration: 15 to 25 minutes (approx 6-8 stations, e.g. Peenya Industry to Kempegowda Majestic)
    const inspectionDuration = 18; // mins
    const deboardTimeMin = boardTimeMin + inspectionDuration;

    // Determine deboard station
    let deboardStationCode = 'KGWA'; // Kempegowda Majestic (central hub)
    if (boardStationCode === 'KGWA') deboardStationCode = 'PYID'; // Peenya Industry
    else if (boardStationCode === 'PYID' && !isDownTrip) deboardStationCode = 'BIET'; // Madavara
    else if (boardStationCode === 'BIET') deboardStationCode = 'PYID';

    const deboardStationName = STATION_NAMES_MAP[deboardStationCode] || 'Nadaprabhu Kempegowda';

    // 1. Walk / Platform Wait step if there is a gap
    if (boardTimeMin > currentTimeMin + 2) {
      steps.push({
        stepIndex: stepSeq++,
        time: `${minsToTimeStr(currentTimeMin)} - ${minsToTimeStr(boardTimeMin)}`,
        action: 'WAIT',
        stationCode: boardStationCode,
        stationName: boardStationName,
        platform,
        details: `Move to ${platform} at ${boardStationName}. Wait ${boardTimeMin - currentTimeMin} mins for incoming Train ${seg.trainId}.`,
        badgeColor: 'bg-amber-955/40 border-amber-800 text-amber-300'
      });
    }

    // 2. BOARD Step: Clear instruction on what Train ID, Station, Platform, and Time
    steps.push({
      stepIndex: stepSeq++,
      time: minsToTimeStr(boardTimeMin),
      action: 'BOARD',
      trainId: seg.trainId,
      dutyId: seg.dutyId,
      operatorId: seg.operatorId,
      operatorName: seg.operatorName,
      stationCode: boardStationCode,
      stationName: boardStationName,
      platform,
      direction,
      details: `Board Train ${seg.trainId} (${direction}) at ${boardStationName} ${platform}. Operator in Cab: ${seg.operatorName} (ID: #${seg.operatorId}, Duty: ${seg.dutyId}).`,
      badgeColor: 'bg-indigo-955 border-indigo-700 text-indigo-300'
    });

    // 3. CAB INSPECTION Step: The core inspection in progress
    steps.push({
      stepIndex: stepSeq++,
      time: `${minsToTimeStr(boardTimeMin)} - ${minsToTimeStr(deboardTimeMin)}`,
      action: 'INSPECT',
      trainId: seg.trainId,
      dutyId: seg.dutyId,
      operatorId: seg.operatorId,
      operatorName: seg.operatorName,
      fromStation: boardStationName,
      toStation: deboardStationName,
      direction,
      durationMins: inspectionDuration,
      relieverName: seg.relieverName,
      relieverDutyId: seg.relieverDutyId,
      relieverEmpId: seg.relieverEmpId,
      details: `Conduct Cab Inspection for Operator ${seg.operatorName} (ID: #${seg.operatorId}) on Train ${seg.trainId} running ${boardStationName} ➔ ${deboardStationName}. Check signal aspect call-outs, ATP curve compliance, and platform berthing accuracy.`,
      badgeColor: 'bg-cyan-955 border-cyan-700 text-cyan-300'
    });

    // 4. DEBOARD Step: Exact instruction where and when to deboard, plus who is the reliever!
    steps.push({
      stepIndex: stepSeq++,
      time: minsToTimeStr(deboardTimeMin),
      action: 'DEBOARD',
      trainId: seg.trainId,
      dutyId: seg.dutyId,
      operatorId: seg.operatorId,
      operatorName: seg.operatorName,
      stationCode: deboardStationCode,
      stationName: deboardStationName,
      relieverName: seg.relieverName,
      relieverDutyId: seg.relieverDutyId,
      relieverEmpId: seg.relieverEmpId,
      details: `Deboard Train ${seg.trainId} at ${deboardStationName}. Handover / Relief: ${seg.relieverName !== '--' ? `Reliever ${seg.relieverName} (Duty ${seg.relieverDutyId}) takes over Train ${seg.trainId}` : 'Train continues mainline run'}.`,
      badgeColor: 'bg-rose-955/60 border-rose-800 text-rose-300'
    });

    // 5. Transfer buffer
    const transferWait = 4; // mins to change platform
    currentTimeMin = deboardTimeMin + transferWait;
    currentStation = deboardStationCode;
    inspectedOps.add(seg.operatorId);

    // Platform crossover notice if more inspections remain
    if (i < uniqueOperatorSegments.length - 1 && currentTimeMin < shiftEndMin - 30) {
      const nextDir = isDownTrip ? 'UP (Platform 1)' : 'DN (Platform 2)';
      steps.push({
        stepIndex: stepSeq++,
        time: `${minsToTimeStr(deboardTimeMin)} - ${minsToTimeStr(currentTimeMin)}`,
        action: 'TRANSFER',
        stationCode: currentStation,
        stationName: deboardStationName,
        details: `Platform Crossover at ${deboardStationName}: Walk via concourse bridge to ${nextDir} for next intercept. (4 mins buffer).`,
        badgeColor: 'bg-purple-955 border-purple-800 text-purple-300'
      });
    }
  }

  // Final Step: Return to Base Station (Peenya Industry)
  if (currentStation !== baseStation) {
    const returnTripTime = 20;
    const finalDepTime = Math.min(currentTimeMin + 3, shiftEndMin - returnTripTime);
    const finalArrTime = finalDepTime + returnTripTime;

    steps.push({
      stepIndex: stepSeq++,
      time: minsToTimeStr(finalDepTime),
      action: 'BOARD',
      trainId: '211',
      direction: 'UP',
      stationCode: currentStation,
      stationName: STATION_NAMES_MAP[currentStation] || currentStation,
      platform: 'Platform 1 (UP)',
      details: `Board Train 211 (UP) at ${STATION_NAMES_MAP[currentStation]} for return transit to Peenya Industry base station.`,
      badgeColor: 'bg-indigo-955 border-indigo-700 text-indigo-300'
    });

    steps.push({
      stepIndex: stepSeq++,
      time: minsToTimeStr(finalArrTime),
      action: 'DEBOARD',
      stationCode: baseStation,
      stationName: 'Peenya Industry',
      details: `Arrive and Deboard Train 211 at Peenya Industry Station.`,
      badgeColor: 'bg-rose-955/60 border-rose-800 text-rose-300'
    });

    currentTimeMin = finalArrTime;
  }

  // Completion Step
  steps.push({
    stepIndex: stepSeq++,
    time: minsToTimeStr(currentTimeMin),
    action: 'COMPLETED',
    stationCode: baseStation,
    stationName: 'Peenya Industry',
    platform: 'ALS Crew Control Desk',
    details: `Official ALS Cab Inspection Shift Completed for ${mentor.name}. Total Operators Inspected: ${inspectedOps.size}. Submit completed inspection logs to CC Desk.`,
    badgeColor: 'bg-emerald-955 border-emerald-700 text-emerald-300'
  });

  return {
    isValid: true,
    mentorName: mentor.name,
    shiftStartTime,
    shiftEndTime,
    baseStation,
    scheduleDay,
    totalNominated: assignedMentees.length,
    activeInShiftCount: uniqueOperatorSegments.length,
    coveredInspectionsCount: inspectedOps.size,
    availableSegments: availableMenteeSegments,
    steps,
    efficiency: uniqueOperatorSegments.length > 0 ? Math.round((inspectedOps.size / uniqueOperatorSegments.length) * 100) : 100
  };
}
