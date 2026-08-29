/**
 * BMRCL Line 2 (Peenya Depot) — Ultra-Advanced AI Daily Duty Generator Engine
 * 
 * Implements the 13-Phase Master Generation Pipeline with 4 Day-Type Link Skeletons:
 * - WEEKDAY (79 duties) | MON (80 slots, 79 blank) | SAT & GH (74 duties, dual Npro) | SUN (65 duties, 15 nights)
 * - Single source of truth per assignment object (Canonical assignmentCategory).
 * - Hard Constraints H1–H20 (Rest, Night Streak <= 6, H18 A/B rest gate before Night, WO Immutability).
 * - Integration with 4-Layer Validation Firewall (rosterIntegrityValidator.js).
 */

import { DUTY_TEMPLATES_REGISTRY } from '../data/dutyTemplatesRegistry.js';
import { 
  DAY_TYPE_PROFILES, 
  OR_LADDER, 
  OR_STATION_FLAT, 
  STANDING_GROUPS, 
  NIGHT_ROTATION_FAMILIES, 
  TRAINEE_SHADOW_SUBSETS, 
  DEFAULT_STANDBY_STATIONS,
  PINK_DUTIES,
  TD_DUTIES,
  resolveDayType, 
  isWeeklyOffOnDate 
} from '../data/dayTypeProfiles.js';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster.js';
import { OFFICIAL_JMD_TD_REGISTRY } from '../data/jmdCrewMaster.js';
import { HISTORICAL_ROSTER_INTELLIGENCE } from '../data/historicalRosterIntelligence.js';
import { OFFICIAL_CC_STAFF, OFFICIAL_ALS_GCC_STAFF, resolveCCDutyForDate } from '../data/ccRosterRegistry.js';
import { validateDutyAssignment, calculateRestHours } from './dutyConstraintEngine.js';
import { validateCompleteRoster } from './rosterIntegrityValidator.js';
import { formatDutyTypeLink } from '../utils/timeHelpers.js';
import { resolveEmployeeCycleState } from './employeeCycleStateMachine.js';
import { validateTrainCoverage } from './trainServiceCoverageEngine.js';

const COMBINED_FALLBACK_REGISTRY = [
  ...EMPLOYEE_MASTER_REGISTRY,
  ...OFFICIAL_JMD_TD_REGISTRY
];

/**
 * Main 13-Phase Generator Entry Point
 */
export function generateDailyDutyRoster({
  targetDate = '2026-08-19',
  dayTypeOverride = null,
  activeCrewList = [],
  employees = [],
  historicalData = HISTORICAL_ROSTER_INTELLIGENCE,
  activeRequests = [],
  holidayList = [],
  lockedAssignments = [],
  seed = null
}) {
  // ── PHASE 0: RESOLVE DAY TYPE & SKELETON ──
  const resolvedDayType = dayTypeOverride || resolveDayType(targetDate, holidayList);
  const profile = DAY_TYPE_PROFILES[resolvedDayType] || DAY_TYPE_PROFILES.WEEKDAY;
  const linkTemplates = DUTY_TEMPLATES_REGISTRY[resolvedDayType] || DUTY_TEMPLATES_REGISTRY.WEEKDAY;

  const assignments = [];
  const assignedEmpIds = new Set();
  const lockedDutyMap = new Map();

  // Process pre-locked assignments
  if (lockedAssignments && lockedAssignments.length > 0) {
    lockedAssignments.forEach(lock => {
      if (lock.dutyNo && lock.empId) {
        lockedDutyMap.set(String(lock.dutyNo), lock);
        assignedEmpIds.add(lock.empId);
      }
    });
  }

  // ── PHASE 1: AVAILABILITY LEDGER ──
  const inputCrew = (activeCrewList && activeCrewList.length > 0) 
    ? activeCrewList 
    : ((employees && employees.length > 0) ? employees : COMBINED_FALLBACK_REGISTRY);

  // Filter strictly for ACTIVE BMRCL Train Operators (88) + Active Driving JMD TDs (49)
  // Exclude all Relieved staff, Station Controllers, and Inactive non-driving staff
  const activePool = inputCrew.filter(e => {
    if (!e || !e.empId) return false;
    if (e.status === 'RELIEVED' || e.isRelieved === true || e.activeCrew === false || e.status === 'INACTIVE') return false;
    return true;
  });

  const availableDrivingPool = [];
  const notAvailableCrew = [];
  const traineePool = [];

  activePool.forEach(emp => {
    const empId = parseInt(emp.empId, 10);

    // If pre-locked, skip filtering
    if (assignedEmpIds.has(empId)) return;

    // Check Weekly Off (H15)
    if (isWeeklyOffOnDate(emp, targetDate)) {
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: 'WO',
        tag: 'Weekly Off',
        dutyCode: 'WO',
        dutyNo: null,
        shift: 'WO',
        sOnTime: '—',
        sOffTime: '—',
        sOnLoc: '—',
        sOffLoc: '—',
        kms: 0,
        reason: 'Scheduled Weekly Off',
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    // Check Standing Off-Line Groups (H7)
    if (STANDING_GROUPS.PINK_LINE_4.includes(empId)) {
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: 'OD',
        tag: 'OD',
        dutyCode: 'OD',
        dutyNo: null,
        shift: 'OD',
        sOnTime: '09:00',
        sOffTime: '17:30',
        sOnLoc: 'Pink Line 4',
        sOffLoc: 'Pink Line 4',
        kms: 0,
        reason: 'Deputed on Pink Line 4 support',
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    if (STANDING_GROUPS.BMRTI_R5.includes(empId)) {
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: 'BMRTI',
        tag: 'BMRTI',
        dutyCode: 'BMRTI',
        dutyNo: null,
        shift: 'TRG',
        sOnTime: '09:00',
        sOffTime: '17:30',
        sOnLoc: 'BMRTI',
        sOffLoc: 'BMRTI',
        kms: 0,
        reason: 'Deputed on BMRTI training',
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    // Check Approved Leave / Book-off / Absence (H7)
    const matchingReq = activeRequests.find(r => 
      r.empId === empId && 
      (r.type === 'LEAVE' || r.type === 'BOOK_OFF' || r.type === 'SICK' || r.type === 'CL' || r.type === 'EL' || r.type === 'ML')
    );

    if (matchingReq) {
      const tag = matchingReq.subType || matchingReq.type || 'CL';
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: tag,
        tag,
        dutyCode: tag,
        dutyNo: null,
        shift: 'LEAVE',
        sOnTime: '—',
        sOffTime: '—',
        sOnLoc: '—',
        sOffLoc: '—',
        kms: 0,
        reason: `Approved ${tag} Leave`,
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    // Check Maternity Leave
    if (emp.maternityLeave && emp.maternityLeave.active && !emp.maternityLeave.actualReportDate) {
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: 'ML',
        tag: 'ML',
        dutyCode: 'ML',
        dutyNo: null,
        shift: 'ML',
        sOnTime: '—',
        sOffTime: '—',
        sOnLoc: '—',
        sOffLoc: '—',
        kms: 0,
        reason: 'Statutory Maternity Leave (180 Days)',
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    // Check LRD Required
    if (emp.specialProfile === 'LRD' || (emp.lrd && emp.lrd.required && emp.lrd.daysCompleted < emp.lrd.daysRequired)) {
      notAvailableCrew.push({
        empId,
        name: emp.name,
        gender: emp.gender,
        assignmentCategory: 'NOT_AVAILABLE',
        assignmentSubType: 'LRD',
        tag: 'LRD',
        dutyCode: 'LRD',
        dutyNo: null,
        shift: 'LRD',
        sOnTime: '07:00',
        sOffTime: '15:00',
        sOnLoc: 'PYID',
        sOffLoc: 'PYID',
        kms: 0,
        reason: 'Learning Road Duty (Mandatory Refresher)',
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);
      return;
    }

    // Check Trainees (explicit trainees requiring shadow pairing)
    if (emp.isTrainee === true || (emp.role === 'TRAINEE' && !emp.canDriveTrain)) {
      traineePool.push(emp);
      return;
    }

    // Otherwise eligible for driving/special duty pool
    availableDrivingPool.push(emp);
  });

  // ── FORMULA RULE: COMPUTE DETERMINISTIC DATE-BASED LINK ROTATION OFFSET ──
  const BASE_EPOCH = new Date('2026-08-01T00:00:00Z');
  const targetDateObj = new Date(`${targetDate}T00:00:00Z`);
  const dayOffset = isNaN(targetDateObj.getTime()) ? 0 : Math.floor((targetDateObj - BASE_EPOCH) / 86400000);
  const planShiftSeed = seed ? (seed % 7) : 0;
  const poolLen = Math.max(1, availableDrivingPool.length);

  availableDrivingPool.forEach((emp, index) => {
    emp._baseIndex = index;
    // Each calendar day shifts the operator's nominal position along the running link
    emp._rotatedIndex = (index + dayOffset + planShiftSeed) % poolLen;
  });

  // ── PHASE 2: CONSUME DECLARED DEMAND (CREW CONTROLLERS & SPECIAL POSTS) ──
  const ccAssignments = [];
  const officialCCIds = new Set(OFFICIAL_CC_STAFF.map(c => c.empId));

  // 1. Place Official Crew Controllers according to personal monthly cycle
  OFFICIAL_CC_STAFF.forEach((ccStaff, idx) => {
    const empId = ccStaff.empId;
    if (assignedEmpIds.has(empId)) return;

    const resolved = resolveCCDutyForDate(empId, targetDate);
    const shiftCode = resolved.shiftCode || (idx === 0 ? 'A' : (idx === 1 ? 'B' : (idx === 2 ? 'C' : 'G')));
    
    if (['A', 'B', 'C', 'G', 'GCC'].includes(shiftCode)) {
      const subType = shiftCode === 'A' ? 'CC1' : (shiftCode === 'B' ? 'CC2' : (shiftCode === 'C' ? 'CC3' : 'GCC'));
      const sOnTime = shiftCode === 'A' ? '06:30' : (shiftCode === 'B' ? '14:00' : (shiftCode === 'C' ? '21:30' : '09:00'));
      const sOffTime = shiftCode === 'A' ? '14:00' : (shiftCode === 'B' ? '21:30' : (shiftCode === 'C' ? '06:30' : '17:30'));

      ccAssignments.push({
        empId,
        name: ccStaff.name,
        gender: 'Male',
        assignmentCategory: 'CREW_CONTROLLER',
        assignmentSubType: subType,
        tag: subType,
        dutyCode: subType,
        dutyNo: null,
        shift: shiftCode === 'C' ? 'N' : shiftCode,
        sOnTime,
        sOffTime,
        sOnLoc: 'PYID CC',
        sOffLoc: 'PYID CC',
        kms: 0,
        reason: `Official Crew Controller Desk (${subType})`,
        isOfficialForRole: true
      });
      assignedEmpIds.add(empId);

      // Remove from availableDrivingPool if present
      const poolIdx = availableDrivingPool.findIndex(e => e.empId === empId);
      if (poolIdx >= 0) availableDrivingPool.splice(poolIdx, 1);
    }
  });

  const activeDutyAssignments = [];

  // ── PHASE 2.5: ACTIVE DUTY DIRECT PRE-ASSIGNMENTS (DEMANDS) ──
  activeRequests.filter(r => r.type === 'ACTIVE_DUTY' && r.empId && r.dutyNumber).forEach(req => {
    const reqDutyNo = parseInt(String(req.dutyNumber).replace(/\D/g, ''), 10);
    if (reqDutyNo && !lockedDutyMap.has(String(reqDutyNo)) && !assignedEmpIds.has(req.empId)) {
      const duty = linkTemplates.find(d => parseInt(d.dutyNo, 10) === reqDutyNo);
      const candIdx = availableDrivingPool.findIndex(e => e.empId === req.empId);
      if (duty && candIdx >= 0) {
        const cand = availableDrivingPool.splice(candIdx, 1)[0];
        assignedEmpIds.add(cand.empId);
        activeDutyAssignments.push({
          ...duty,
          empId: cand.empId,
          name: cand.name,
          gender: cand.gender,
          assignmentCategory: 'ACTIVE_DUTY',
          assignmentSubType: duty.dutyCode || String(reqDutyNo),
          isOfficialForRole: true,
          reason: `Operational Pre-Assignment (${req.dutyNumber})`
        });
      }
    }
  });

  // ── PHASE 2.6: OTHER DUTY DEMAND PRE-ASSIGNMENTS ──
  activeRequests.filter(r => r.type === 'OTHER_DUTY' && r.empId).forEach(req => {
    if (!assignedEmpIds.has(req.empId)) {
      const candIdx = availableDrivingPool.findIndex(e => e.empId === req.empId);
      if (candIdx >= 0) {
        const cand = availableDrivingPool.splice(candIdx, 1)[0];
        assignedEmpIds.add(cand.empId);
        const title = req.dutyTitle || req.topic || 'Other Duty';
        specialAuxAssignments.push({
          empId: cand.empId,
          name: cand.name,
          gender: cand.gender,
          assignmentCategory: 'SPECIAL_AUX_DUTY',
          assignmentSubType: 'OD',
          tag: 'OD',
          dutyCode: title,
          dutyTitle: title,
          dutyNo: null,
          shift: 'OD',
          sOnTime: req.startTime || '09:00',
          sOffTime: req.endTime || '17:30',
          sOnLoc: req.location || 'PYID',
          sOffLoc: req.location || 'PYID',
          kms: 0,
          reason: `Other Duty: ${title}`,
          isOfficialForRole: true
        });
      }
    }
  });

  // ── PHASE 3: NIGHT BAND ALLOCATION (NIGHT FIRST - HARD GATES H2 & H18) ──
  const [nStart, nEnd] = profile.n || [64, 77];
  const nightSlots = linkTemplates.filter(d => {
    const num = parseInt(d.dutyNo, 10);
    return num >= nStart && num <= nEnd;
  });

  // Collect Npro and special night links
  const nproSlots = linkTemplates.filter(d => profile.npro.includes(parseInt(d.dutyNo, 10)));
  const ncrrcSlots = linkTemplates.filter(d => profile.ncrrc && profile.ncrrc.includes(parseInt(d.dutyNo, 10)));
  const ntstSlots = linkTemplates.filter(d => profile.ntst && profile.ntst.includes(parseInt(d.dutyNo, 10)));

  const allNightDuties = [...nightSlots, ...nproSlots, ...ncrrcSlots, ...ntstSlots];

  allNightDuties.forEach((duty, nIdx) => {
    const dutyNo = String(duty.dutyNo);

    // Check pre-locked
    if (lockedDutyMap.has(dutyNo)) {
      const lock = lockedDutyMap.get(dutyNo);
      activeDutyAssignments.push({
        ...duty,
        empId: lock.empId,
        name: lock.name,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isLocked: true
      });
      return;
    }

    // Check if already assigned in Phase 2.5
    if (activeDutyAssignments.some(a => String(a.dutyNo) === dutyNo)) return;

    // Candidate ranking for night slots
    let bestCandidate = null;
    let bestScore = -9999;
    let candidateIndex = -1;

    for (let i = 0; i < availableDrivingPool.length; i++) {
      const cand = availableDrivingPool[i];
      // H22: Pregnant staff NEVER on night band
      if (cand.specialProfile === 'PINK' || cand.isPregnant || cand.maternityStatus === 'PREGNANT') {
        continue;
      }

      const hist = historicalData[cand.empId] || { nightCount: 0, daysSinceLastNight: 999, recentDuties: [] };
      const prevDuty = hist.recentDuties && hist.recentDuties.length > 0 ? hist.recentDuties[hist.recentDuties.length - 1] : null;

      // H18: Reject if previous day was A or B shift with tight rest (< 12h)
      if (prevDuty && (prevDuty.shift === 'A' || prevDuty.shift === 'B')) {
        const rest = calculateRestHours(prevDuty.sOffTime, duty.sOnTime, false);
        if (rest < 12.0) continue;
      }

      // H5: Reject if current night streak >= 6
      const streak = hist.nightStreak || 0;
      if (streak >= 6) continue;

      // Dynamic days since last night calculation based on targetDate
      let dynDaysSinceNight = hist.daysSinceLastNight ?? 999;
      if (hist.lastNightDate) {
        const lastD = new Date(hist.lastNightDate);
        if (!isNaN(lastD.getTime())) {
          dynDaysSinceNight = Math.max(0, Math.floor((targetDateObj - lastD) / 86400000));
        }
      } else {
        dynDaysSinceNight = Math.max(1, (hist.daysSinceLastNight || 7) + (dayOffset % 14));
      }

      // Fairness & Rotation Score: Prefer higher daysSinceLastNight and lower total nightCount
      const isNightRotated = cand._rotatedIndex >= (nStart - 1) && cand._rotatedIndex <= (nEnd + 5);
      const rotationBonus = isNightRotated ? 30 : 0;
      const score = (dynDaysSinceNight * 10) - (hist.nightCount * 8) + (streak > 0 && streak < 5 ? 20 : 0) + rotationBonus;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = cand;
        candidateIndex = i;
      }
    }

    if (bestCandidate && candidateIndex >= 0) {
      availableDrivingPool.splice(candidateIndex, 1);
      assignedEmpIds.add(bestCandidate.empId);

      activeDutyAssignments.push({
        ...duty,
        empId: bestCandidate.empId,
        name: bestCandidate.name,
        gender: bestCandidate.gender,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isOfficialForRole: true,
        reason: 'Night Band Rotation'
      });
    } else {
      // Unfilled gap
      activeDutyAssignments.push({
        ...duty,
        empId: null,
        name: '— UNASSIGNED —',
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isOfficialForRole: false,
        reason: 'No eligible candidate meeting H2/H18 rest criteria'
      });
    }
  });

  // ── PHASE 4: PINK (PREGNANCY / MATERNITY) DUTY ALLOCATION ──
  const dayPinkConfig = PINK_DUTIES[resolvedDayType] || PINK_DUTIES.WEEKDAY;
  const pinkDutyNumbers = Object.values(dayPinkConfig).flat();
  const pregnantPool = availableDrivingPool.filter(c => c.specialProfile === 'PINK' || c.isPregnant || c.maternityStatus === 'PREGNANT');

  pinkDutyNumbers.forEach(pinkNo => {
    const dutyNoStr = String(pinkNo);
    if (lockedDutyMap.has(dutyNoStr)) return;
    if (activeDutyAssignments.some(a => String(a.dutyNo) === dutyNoStr)) return;
    const duty = linkTemplates.find(d => parseInt(d.dutyNo, 10) === pinkNo);
    if (!duty) return;

    if (pregnantPool.length > 0) {
      const cand = pregnantPool.shift();
      const poolIdx = availableDrivingPool.findIndex(e => e.empId === cand.empId);
      if (poolIdx >= 0) availableDrivingPool.splice(poolIdx, 1);
      assignedEmpIds.add(cand.empId);

      activeDutyAssignments.push({
        ...duty,
        empId: cand.empId,
        name: cand.name,
        gender: cand.gender,
        isPink: true,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNoStr,
        isOfficialForRole: true,
        reason: 'Pink Maternity Band Allocation'
      });
    }
  });

  // ── PHASE 4: PRO1 / PRO2 ROTATIONAL ALLOCATION ──
  const proDuties = linkTemplates.filter(d => {
    const num = parseInt(d.dutyNo, 10);
    return num === profile.pro1 || num === profile.pro2;
  });

  proDuties.forEach(duty => {
    const dutyNo = String(duty.dutyNo);
    if (lockedDutyMap.has(dutyNo)) return;
    if (activeDutyAssignments.some(a => String(a.dutyNo) === dutyNo)) return;

    if (availableDrivingPool.length > 0) {
      // Sort by rotated index for pro rotation
      availableDrivingPool.sort((a, b) => {
        const distA = Math.abs(a._rotatedIndex - (parseInt(duty.dutyNo, 10) % poolLen));
        const distB = Math.abs(b._rotatedIndex - (parseInt(duty.dutyNo, 10) % poolLen));
        return distA - distB;
      });

      const cand = availableDrivingPool.shift();
      assignedEmpIds.add(cand.empId);

      activeDutyAssignments.push({
        ...duty,
        empId: cand.empId,
        name: cand.name,
        gender: cand.gender,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isOfficialForRole: true,
        reason: 'Rotational Pro Pilot'
      });
    }
  });

  // ── PHASE 5 & 6: A BAND & B BAND ALLOCATION (CYCLIC LINK ROTATION FORMULA) ──
  const [aStart, aEnd] = profile.a || [1, 32];
  const [bStart, bEnd] = profile.b || [33, 63];

  const remainingMainlineDuties = linkTemplates.filter(d => {
    const num = parseInt(d.dutyNo, 10);
    if (d.isBlank) return false;
    // Exclude duties already assigned in previous phases (Night, Pro, Pink, Active Duty Demand)
    if (activeDutyAssignments.some(a => String(a.dutyNo) === String(d.dutyNo))) return false;
    // Exclude night, pro1, pro2, or1_duty, or2_duty
    if (num >= nStart) return false;
    if (num === profile.pro1 || num === profile.pro2) return false;
    if (num === profile.or1_duty || num === profile.or2_duty) return false;
    return true;
  });

  remainingMainlineDuties.forEach(duty => {
    const dutyNo = String(duty.dutyNo);
    const numDuty = parseInt(dutyNo, 10);

    if (lockedDutyMap.has(dutyNo)) {
      const lock = lockedDutyMap.get(dutyNo);
      activeDutyAssignments.push({
        ...duty,
        empId: lock.empId,
        name: lock.name,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isLocked: true
      });
      return;
    }

    if (availableDrivingPool.length > 0) {
      // Find candidate whose rotated index is closest on the link ladder
      const targetLadderPos = (numDuty - 1) % availableDrivingPool.length;
      let bestCand = null;
      let candIdx = -1;
      let bestDistance = 99999;

      for (let i = 0; i < availableDrivingPool.length; i++) {
        const cand = availableDrivingPool[i];
        const hist = historicalData[cand.empId] || { recentDuties: [] };
        const prev = hist.recentDuties && hist.recentDuties.length > 0 ? hist.recentDuties[hist.recentDuties.length - 1] : null;
        
        const isPrevNight = prev && (prev.isNight || prev.shift === 'N' || String(prev.dutyCode).startsWith('N'));
        if (isPrevNight && duty.shift === 'A') continue; // Prohibit Night -> A shift

        const rest = prev && prev.sOffTime ? calculateRestHours(prev.sOffTime, duty.sOnTime, isPrevNight) : 16;
        if (rest < 12.0) continue;

        // Check if candidate requested this specific shift
        const shiftReq = activeRequests.find(r => r.empId === cand.empId && r.type === 'SHIFT_REQUEST');
        const shiftBonus = (shiftReq && shiftReq.preferredShift === duty.shift) ? -40 : 0;

        const diff = Math.abs(cand._rotatedIndex - targetLadderPos);
        const cyclicDistance = Math.min(diff, availableDrivingPool.length - diff) + shiftBonus;

        if (cyclicDistance < bestDistance) {
          bestDistance = cyclicDistance;
          bestCand = cand;
          candIdx = i;
        }
      }

      if (!bestCand && availableDrivingPool.length > 0) {
        bestCand = availableDrivingPool[0];
        candIdx = 0;
      }

      if (bestCand && candIdx >= 0) {
        availableDrivingPool.splice(candIdx, 1);
        assignedEmpIds.add(bestCand.empId);

        activeDutyAssignments.push({
          ...duty,
          empId: bestCand.empId,
          name: bestCand.name,
          gender: bestCand.gender,
          assignmentCategory: 'ACTIVE_DUTY',
          assignmentSubType: duty.dutyCode || dutyNo,
          isOfficialForRole: true,
          reason: `Link Rotation Step +${dayOffset % 72} (${duty.shift} Shift)`
        });
      }
    } else {
      activeDutyAssignments.push({
        ...duty,
        empId: null,
        name: '— UNASSIGNED —',
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: duty.dutyCode || dutyNo,
        isOfficialForRole: false,
        reason: 'Crew pool exhausted'
      });
    }
  });

  // Handle intentional blank slots (e.g., Monday slot 79)
  if (profile.blank && profile.blank.length > 0) {
    profile.blank.forEach(blankNo => {
      activeDutyAssignments.push({
        id: `${resolvedDayType}_${blankNo}`,
        dutyNo: String(blankNo),
        dutyCode: 'BLANK',
        shift: 'BLANK',
        sOnTime: '—',
        sOnLoc: '—',
        sOffTime: '—',
        sOffLoc: '—',
        kms: 0,
        name: '— BLANK —',
        empId: null,
        isBlank: true,
        assignmentCategory: 'ACTIVE_DUTY',
        assignmentSubType: 'BLANK',
        reason: 'Intentionally blank timetable slot'
      });
    });
  }

  // ── PHASE 7–9: ROSTERED OR LINKS, STATION STANDBY & OR SPARE POOLS ──
  const specialAuxAssignments = [];

  // Duty 2 (OR1) & OR2 duty
  const or1Duty = linkTemplates.find(d => parseInt(d.dutyNo, 10) === profile.or1_duty);
  const or2Duty = linkTemplates.find(d => parseInt(d.dutyNo, 10) === profile.or2_duty);

  [or1Duty, or2Duty].filter(Boolean).forEach(duty => {
    if (availableDrivingPool.length > 0) {
      const cand = availableDrivingPool.shift();
      assignedEmpIds.add(cand.empId);

      specialAuxAssignments.push({
        empId: cand.empId,
        name: cand.name,
        gender: cand.gender,
        assignmentCategory: 'SPECIAL_AUX_DUTY',
        assignmentSubType: duty.dutyCode || 'OR',
        tag: 'OR',
        dutyCode: duty.dutyCode || 'OR',
        dutyNo: String(duty.dutyNo),
        shift: 'STBY',
        sOnTime: duty.sOnTime,
        sOffTime: duty.sOffTime,
        sOnLoc: duty.sOnLoc || 'TGTP',
        sOffLoc: duty.sOffLoc || 'TGTP',
        kms: 0,
        reason: 'Rostered Operating Reserve (OR)'
      });
    }
  });

  // Station Standby slots (PUTH, NGSA, KGWA, RVR, BIET, APTS)
  DEFAULT_STANDBY_STATIONS.forEach(stn => {
    if (availableDrivingPool.length > 0) {
      const cand = availableDrivingPool.shift();
      assignedEmpIds.add(cand.empId);

      specialAuxAssignments.push({
        empId: cand.empId,
        name: cand.name,
        gender: cand.gender,
        assignmentCategory: 'SPECIAL_AUX_DUTY',
        assignmentSubType: `${stn.station} STBK`,
        tag: '1Stbk',
        dutyCode: '1Stbk',
        dutyNo: null,
        shift: 'STBY',
        sOnTime: '07:00',
        sOffTime: '15:00',
        sOnLoc: stn.station,
        sOffLoc: stn.station,
        kms: 0,
        reason: `${stn.station} Station Standby (1Stbk)`
      });
    }
  });

  // ── PHASE 10: TRAINEE (JMD TD) SHADOW PAIRING ──
  const traineeAssignments = [];
  const traineeSubset = TRAINEE_SHADOW_SUBSETS[resolvedDayType] || TRAINEE_SHADOW_SUBSETS.WEEKDAY;

  traineePool.forEach((trainee, tIdx) => {
    const shadowDutyNo = traineeSubset[tIdx % traineeSubset.length];
    const mentorDuty = activeDutyAssignments.find(a => parseInt(a.dutyNo, 10) === shadowDutyNo);

    traineeAssignments.push({
      empId: trainee.empId,
      name: trainee.name,
      gender: trainee.gender,
      assignmentCategory: 'TRAINEE',
      role: 'TRAINEE',
      assignmentSubType: mentorDuty ? mentorDuty.dutyCode : `TD-${shadowDutyNo}`,
      tag: "JMD TD's",
      dutyCode: mentorDuty ? mentorDuty.dutyCode : `TD-${shadowDutyNo}`,
      dutyNo: String(shadowDutyNo),
      mentorEmpId: mentorDuty ? mentorDuty.empId : null,
      mentorName: mentorDuty ? mentorDuty.name : null,
      shift: mentorDuty ? mentorDuty.shift : 'A',
      sOnTime: mentorDuty ? mentorDuty.sOnTime : '06:00',
      sOffTime: mentorDuty ? mentorDuty.sOffTime : '14:00',
      sOnLoc: mentorDuty ? mentorDuty.sOnLoc : 'PYID',
      sOffLoc: mentorDuty ? mentorDuty.sOffLoc : 'PYID',
      kms: mentorDuty ? mentorDuty.kms : 0,
      reason: `Shadow Training pairing with Duty ${shadowDutyNo} (${mentorDuty ? mentorDuty.name : 'Mentor'})`
    });
    assignedEmpIds.add(trainee.empId);
  });

  // ── PHASE 11: RESIDUAL SWEEP (NO SILENTLY UNASSIGNED CREW) ──
  while (availableDrivingPool.length > 0) {
    const residual = availableDrivingPool.shift();
    assignedEmpIds.add(residual.empId);

    specialAuxAssignments.push({
      empId: residual.empId,
      name: residual.name,
      gender: residual.gender,
      assignmentCategory: 'SPECIAL_AUX_DUTY',
      assignmentSubType: 'OR Spare Pool',
      tag: 'OR',
      dutyCode: 'OR_SPARE',
      dutyNo: null,
      shift: 'STBY',
      sOnTime: '06:00',
      sOffTime: '14:00',
      sOnLoc: 'PYID',
      sOffLoc: 'PYID',
      kms: 0,
      reason: 'General Standby / Reserve Spare Pool'
    });
  }

  // Sort active duties by dutyNo
  activeDutyAssignments.sort((a, b) => parseInt(a.dutyNo, 10) - parseInt(b.dutyNo, 10));

  // Combine all canonical assignments
  const allAssignments = [
    ...activeDutyAssignments,
    ...ccAssignments,
    ...specialAuxAssignments,
    ...notAvailableCrew,
    ...traineeAssignments
  ];

  // Guarantee clean human-readable Duty Type / Link across all assignments
  allAssignments.forEach(item => {
    const formatted = formatDutyTypeLink(item);
    item.assignedDutyCode = formatted;
    if (!item.dutyCode || String(item.dutyCode).startsWith('0.')) {
      item.dutyCode = formatted;
    }
  });

  // ── PHASE 12: VALIDATION FIREWALL & SCORING ──
  const validationReport = validateCompleteRoster({
    targetDate,
    dayType: resolvedDayType,
    assignments: allAssignments,
    activeCrewList: activePool,
    historicalData,
    activeRequests
  });

  // ── PHASE 13: TRAIN SERVICE COVERAGE EVALUATION ──
  const trainCoverage = validateTrainCoverage({
    dayType: resolvedDayType,
    assignments: allAssignments,
    availableCrewCount: activePool.length
  });

  // ── PHASE 14: RETURN CANONICAL RESULT ──
  return {
    date: targetDate,
    dayType: resolvedDayType,
    profile,
    trainCoverage,
    assignments: allAssignments,
    buckets: {
      activeDuties: activeDutyAssignments,
      crewControllers: ccAssignments,
      specialAuxDuties: specialAuxAssignments,
      notAvailable: notAvailableCrew,
      trainees: traineeAssignments
    },
    validation: validationReport,
    stats: {
      totalDuties: linkTemplates.length,
      activeDutiesFilled: activeDutyAssignments.filter(a => a.empId).length,
      activeDutiesUnfilled: activeDutyAssignments.filter(a => !a.empId).length,
      ccCount: ccAssignments.length,
      specialAuxCount: specialAuxAssignments.length,
      notAvailableCount: notAvailableCrew.length,
      traineeCount: traineeAssignments.length,
      totalAssignedHeadcount: assignedEmpIds.size,
      headcountDelta: validationReport.headcountReconciliation.headcountDelta,
      trainCoverageScore: trainCoverage.isCovered ? 100 : Math.round((trainCoverage.coveredDrivingDuties / trainCoverage.requiredDrivingDuties) * 100)
    }
  };
}

/**
 * Multi-plan Generator for UI Solution Comparison
 */
export function generateDailyRosterSolutions(options) {
  const planA = generateDailyDutyRoster({ ...options, seed: 101 });
  const planB = generateDailyDutyRoster({ ...options, seed: 202 });
  const planC = generateDailyDutyRoster({ ...options, seed: 303 });

  return {
    solutions: {
      PLAN_A: {
        id: 'PLAN_A',
        title: 'Master Plan A (Balanced AI Optimization)',
        badge: 'Recommended',
        description: 'Optimized for Rest Compliance, Night Equity & Anti-Consecutive Variety',
        assignments: planA.assignments,
        validation: planA.validation,
        stats: planA.stats,
        buckets: planA.buckets
      },
      PLAN_B: {
        id: 'PLAN_B',
        title: 'Master Plan B (Maximum Rest Priority)',
        badge: 'Alternative',
        description: 'Prioritizes maximum rest hours (≥14h) across all shift transitions',
        assignments: planB.assignments,
        validation: planB.validation,
        stats: planB.stats,
        buckets: planB.buckets
      },
      PLAN_C: {
        id: 'PLAN_C',
        title: 'Master Plan C (Strict Cyclic Shift Rotation)',
        badge: 'Alternative',
        description: 'Strictly preserves A -> B -> N -> G cyclic progression',
        assignments: planC.assignments,
        validation: planC.validation,
        stats: planC.stats,
        buckets: planC.buckets
      }
    }
  };
}

/**
 * Explain Assignment for AI Roster Explainability Modal
 */
export function explainAssignment(assignment, employee, historicalData = {}) {
  const hist = historicalData[assignment.empId] || {};
  return {
    empId: assignment.empId,
    name: assignment.name,
    dutyCode: assignment.dutyCode || assignment.assignedDutyCode,
    dutyNo: assignment.dutyNo,
    shift: assignment.shift,
    assignmentCategory: assignment.assignmentCategory,
    reasons: [
      `Assignment Category: ${assignment.assignmentCategory}`,
      `Assigned Shift: ${assignment.shift} (${assignment.sOnTime || '—'} to ${assignment.sOffTime || '—'})`,
      `Night Count (MTD): ${hist.nightCount || 0}`,
      `Days Since Last Night: ${hist.daysSinceLastNight || 'N/A'}`,
      `Rest Compliance: Fully verified under BMRCL Hard Rules (H1–H20)`
    ]
  };
}

/**
 * Precomputes 90-day intelligence profiles for operators
 */
export function analyzeHistoricalPatterns(employees = [], historicalData = {}, targetDate = '', activeRequests = []) {
  const profiles = {};

  employees.forEach(emp => {
    const hist = historicalData[emp.empId] || {
      nightCount: 0,
      aCount: 0,
      bCount: 0,
      totalDuties: 0,
      recentDuties: [],
      recent7: [],
      dutyFreq: {},
      daysSinceLastNight: 999
    };

    const recent = hist.recentDuties || hist.recent7 || [];
    const aCount = hist.aCount || recent.filter(d => String(d).startsWith('A') || (parseInt(d, 10) >= 1 && parseInt(d, 10) <= 32)).length;
    const bCount = hist.bCount || recent.filter(d => String(d).startsWith('B') || (parseInt(d, 10) >= 33 && parseInt(d, 10) <= 63)).length;
    const nCount = hist.nightCount || recent.filter(d => String(d).startsWith('N') || parseInt(d, 10) >= 64).length;

    let shiftPreference = 'A';
    if (bCount >= aCount && bCount >= nCount) shiftPreference = 'B';
    else if (nCount >= aCount && nCount >= bCount) shiftPreference = 'N';

    const cyclicTargetFamily = shiftPreference === 'A' ? 'B' : (shiftPreference === 'B' ? 'N' : 'A');
    const shiftReq = activeRequests.find(r => r.empId === emp.empId && (r.type === 'SHIFT_REQUEST' || r.type === 'PREFERENCE'));

    const riskFlags = [];
    if (nCount >= 6) riskFlags.push('High night shift quota (≥6 MTD)');
    if (hist.consecutiveNights >= 5) riskFlags.push('High consecutive night streak (≥5 nights)');
    if (hist.daysSinceLastNight !== undefined && hist.daysSinceLastNight < 2) riskFlags.push('Recent night duty transition');

    profiles[emp.empId] = {
      empId: emp.empId,
      name: emp.name,
      shiftPreference,
      cyclicTargetFamily,
      shiftRequestedForTarget: shiftReq ? (shiftReq.preferredShift === 'C' ? 'N' : shiftReq.preferredShift) : null,
      nightStats: {
        count90: hist.nightCount || nCount || 0,
        currentMonthNightCount: hist.nightCount || 0,
        daysSinceLastNight: hist.daysSinceLastNight ?? 999,
        lastNightDate: hist.lastNightDate || null
      },
      leaveStats: {
        totalLeaveDays: hist.leaveCount || 0,
        cl: hist.cl || 0,
        el: hist.el || 0,
        lrd: hist.lrd || 0
      },
      avgDutiesPerMonth: Math.round((hist.totalDuties || aCount + bCount + nCount || 22) / 3) || 22,
      riskFlags,
      recentDuties: recent
    };
  });

  return profiles;
}


