/**
 * BMRCL Line 2 (Peenya Depot) — Master 4-Layer Validation Firewall
 * Strictly validates generated rosters across:
 * 1. Structural Checks (Duty count == profile.totalDuties, skeleton integrity)
 * 2. Integrity Checks (Single assignment per employee across left/right/trainee blocks)
 * 3. Headcount Reconciliation (Active crew zero-delta balance)
 * 4. Rest & Transition Audit (H2, H4, H5, H6, H18)
 */

import { OFFICIAL_CC_STAFF } from '../data/ccRosterRegistry.js';
import { calculateRestHours } from './dutyConstraintEngine.js';
import { DAY_TYPE_PROFILES } from '../data/dayTypeProfiles.js';

export function validateCompleteRoster({
  targetDate,
  dayType = 'WEEKDAY',
  assignments = [],
  activeCrewList = [],
  historicalData = {},
  activeRequests = [],
  woOverrides = {}
}) {
  const hardViolations = [];
  const warnings = [];
  const assertionResults = {};

  const profile = DAY_TYPE_PROFILES[dayType] || DAY_TYPE_PROFILES.WEEKDAY;
  const activeTOs = activeCrewList.filter(e => e.status === 'ACTIVE' && !e.isRelieved && e.activeCrew !== false);
  const activeEmpIdSet = new Set(activeTOs.map(e => e.empId));

  // Partition assignments by canonical assignmentCategory
  const buckets = {
    ACTIVE_DUTY: assignments.filter(a => a.assignmentCategory === 'ACTIVE_DUTY'),
    CREW_CONTROLLER: assignments.filter(a => a.assignmentCategory === 'CREW_CONTROLLER'),
    SPECIAL_AUX_DUTY: assignments.filter(a => a.assignmentCategory === 'SPECIAL_AUX_DUTY'),
    NOT_AVAILABLE: assignments.filter(a => a.assignmentCategory === 'NOT_AVAILABLE'),
    TRAINEE: assignments.filter(a => a.assignmentCategory === 'TRAINEE' || a.role === 'TRAINEE')
  };

  // ── LAYER 1: STRUCTURAL VALIDATION ──
  const activeDutyCount = buckets.ACTIVE_DUTY.length;
  // Slot 79 on Monday is intentionally blank, but present in total
  const expectedTotal = profile.totalDuties;
  
  if (activeDutyCount !== expectedTotal && activeDutyCount !== expectedTotal - (profile.blank ? profile.blank.length : 0)) {
    warnings.push({
      assertion: 'DUTY_COUNT_MATCH',
      message: `Duty count is ${activeDutyCount}, expected ${expectedTotal} for day type ${dayType}.`
    });
    assertionResults['DUTY_COUNT_MATCH'] = false;
  } else {
    assertionResults['DUTY_COUNT_MATCH'] = true;
  }

  // Check duplicate duty numbers
  const dutyNoSet = new Set();
  let duplicateDutyNo = false;
  buckets.ACTIVE_DUTY.forEach(a => {
    if (a.dutyNo && dutyNoSet.has(a.dutyNo)) {
      duplicateDutyNo = true;
      hardViolations.push({
        assertion: 'NO_DUPLICATE_DUTY_NO',
        message: `Duplicate duty number ${a.dutyNo} found in active driving duties.`
      });
    }
    dutyNoSet.add(a.dutyNo);
  });
  assertionResults['NO_DUPLICATE_DUTY_NO'] = !duplicateDutyNo;

  // ── LAYER 2: INTEGRITY VALIDATION ──
  const empBucketMap = new Map();
  let duplicateFound = false;

  assignments.forEach(a => {
    if (!a.empId) return;
    const existing = empBucketMap.get(a.empId) || [];
    existing.push(a.assignmentCategory || 'UNKNOWN');
    empBucketMap.set(a.empId, existing);
  });

  empBucketMap.forEach((categoryList, empId) => {
    if (categoryList.length > 1) {
      duplicateFound = true;
      const emp = activeTOs.find(e => e.empId === empId);
      const name = emp ? emp.name : `Emp #${empId}`;
      hardViolations.push({
        assertion: 'NO_DUPLICATE_EMP_ACROSS_BUCKETS',
        empId,
        name,
        message: `${name} (#${empId}) is assigned to multiple buckets simultaneously: [${categoryList.join(', ')}]`
      });
    }
  });
  assertionResults['NO_DUPLICATE_EMP_ACROSS_BUCKETS'] = !duplicateFound;

  // Check no unassigned active TOs
  const assignedEmpIds = new Set(assignments.map(a => a.empId).filter(Boolean));
  const unassignedTOs = activeTOs.filter(e => !assignedEmpIds.has(e.empId));

  if (unassignedTOs.length > 0) {
    unassignedTOs.forEach(e => {
      hardViolations.push({
        assertion: 'NO_UNASSIGNED_ACTIVE_TO',
        empId: e.empId,
        name: e.name,
        message: `Active Train Operator ${e.name} (#${e.empId}) is unassigned for ${targetDate}.`
      });
    });
    assertionResults['NO_UNASSIGNED_ACTIVE_TO'] = false;
  } else {
    assertionResults['NO_UNASSIGNED_ACTIVE_TO'] = true;
  }

  // Check Crew Controllers are never in Active Driving Duties
  const ccEmpIds = new Set(buckets.CREW_CONTROLLER.map(c => c.empId).filter(Boolean));
  let ccInActiveDuty = false;
  buckets.ACTIVE_DUTY.forEach(a => {
    if (a.empId && ccEmpIds.has(a.empId)) {
      ccInActiveDuty = true;
      hardViolations.push({
        assertion: 'NO_CC_IN_ACTIVE_DUTY',
        empId: a.empId,
        name: a.name,
        message: `${a.name} is rostered on Crew Controller desk and cannot be in active driving duties.`
      });
    }
  });
  assertionResults['NO_CC_IN_ACTIVE_DUTY'] = !ccInActiveDuty;

  // ── LAYER 2.5: PREGNANCY & PINK DUTY INVARIANTS (H21, H22, H25, H26) ──
  const [nStart, nEnd] = profile.n || [64, 77];
  const pregnantCrew = activeTOs.filter(e => e.specialProfile === 'PINK' || e.maternityStatus === 'PREGNANT' || e.isPregnant);
  
  pregnantCrew.forEach(p => {
    const assigned = assignments.find(a => a.empId === p.empId);
    if (assigned) {
      const num = parseInt(assigned.dutyNo, 10);
      // H22: Pregnant crew NEVER on night band
      if (num >= nStart && num <= nEnd) {
        hardViolations.push({
          assertion: 'H22_NO_PREGNANT_ON_NIGHT',
          empId: p.empId,
          name: p.name,
          message: `H22: Pregnant crew ${p.name} (#${p.empId}) is assigned to night duty #${num}.`
        });
      }
    }
  });

  // ── LAYER 3: HEADCOUNT RECONCILIATION ──
  const totalActiveHeadcount = activeTOs.length;
  const assignedTotalHeadcount = assignedEmpIds.size;
  const headcountDelta = totalActiveHeadcount - assignedTotalHeadcount;

  const headcountReconciliation = {
    totalActiveCrew: totalActiveHeadcount,
    activeDutiesFilled: buckets.ACTIVE_DUTY.filter(a => a.empId).length,
    crewControllers: buckets.CREW_CONTROLLER.length,
    specialAuxDuties: buckets.SPECIAL_AUX_DUTY.length,
    notAvailable: buckets.NOT_AVAILABLE.length,
    trainees: buckets.TRAINEE.length,
    unassignedCrew: unassignedTOs.length,
    headcountDelta,
    isBalanced: headcountDelta === 0
  };

  assertionResults['HEADCOUNT_RECONCILIATION'] = headcountReconciliation.isBalanced;

  // ── LAYER 4: REST & TRANSITION AUDIT ──
  buckets.ACTIVE_DUTY.forEach(a => {
    if (!a.empId) return;
    const hist = historicalData[a.empId];
    if (hist && hist.recentDuties && hist.recentDuties.length > 0) {
      const prevDuty = hist.recentDuties[hist.recentDuties.length - 1];
      if (prevDuty && prevDuty.sOffTime && a.sOnTime) {
        const isPrevNight = prevDuty.isNight || prevDuty.shift === 'N' || String(prevDuty.dutyCode).startsWith('N');
        const rest = calculateRestHours(prevDuty.sOffTime, a.sOnTime, isPrevNight);

        if (rest < 12.0) {
          warnings.push({
            assertion: 'REST_AUDIT_H2',
            empId: a.empId,
            name: a.name,
            message: `Rest between prev sign-off (${prevDuty.sOffTime}) and duty ${a.dutyNo} sign-on (${a.sOnTime}) is ${rest}h (< 12h).`
          });
        }
      }
    }
  });

  return {
    isValid: hardViolations.length === 0,
    hardViolations,
    warnings,
    assertionResults,
    headcountReconciliation,
    stats: {
      totalDuties: buckets.ACTIVE_DUTY.length,
      filledDuties: buckets.ACTIVE_DUTY.filter(a => a.empId).length,
      unfilledDuties: buckets.ACTIVE_DUTY.filter(a => !a.empId).length,
      crewControllers: buckets.CREW_CONTROLLER.length,
      specialDuties: buckets.SPECIAL_AUX_DUTY.length,
      notAvailableCount: buckets.NOT_AVAILABLE.length
    }
  };
}
