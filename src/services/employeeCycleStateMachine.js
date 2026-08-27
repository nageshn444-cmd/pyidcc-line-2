/**
 * BMRCL Line 2 (Peenya Depot) — Employee Cycle State Machine & Dual Ledger Engine
 * 
 * CORE PRINCIPLES:
 * 1. Dual-Ledger Architecture:
 *    - ROTATION_LEDGER: Controls persistent rotation phase (e.g. A, B, N, PINK, WO-target).
 *    - ATTENDANCE_LEDGER: Records what the employee actually did (Duty, EL, CL, HPL, ML, WO, Book-off, etc.).
 * 2. 6-Day Cycle is a ROTATION STATE, NOT 6 mandatory attendance days.
 * 3. Leave is an availability interruption: It does NOT advance bands merely because calendar days pass,
 *    does NOT consume worked cycle positions, and does NOT force "make-up" duties.
 * 4. Night Cycle Engine: Target 6 nights for continuously available eligible operators;
 *    pauses/replans upon approved leave and closes with mandatory rest/recovery.
 */

import { isWeeklyOffOnDate } from '../data/dayTypeProfiles.js';

export const CYCLE_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED_LEAVE: 'PAUSED_LEAVE',
  PAUSED_TRAINING: 'PAUSED_TRAINING',
  PAUSED_MEDICAL: 'PAUSED_MEDICAL',
  PAUSED_BOOKOFF: 'PAUSED_BOOKOFF',
  WAITING_FOR_WO: 'WAITING_FOR_WO',
  NIGHT_CYCLE: 'NIGHT_CYCLE',
  PINK_CYCLE: 'PINK_CYCLE',
  COMPLETED: 'COMPLETED',
  REPLANNING: 'REPLANNING'
};

/**
 * Initializes or resolves current cycle state for an employee on a target date
 */
export function resolveEmployeeCycleState({
  employee,
  targetDate,
  historicalRecords = [],
  activeLeave = null,
  activeRequests = [],
  isPinkEligible = false
}) {
  if (!employee) return null;

  const empId = employee.empId || employee.employeeId;
  const isWO = isWeeklyOffOnDate(employee, targetDate);

  // Check if active pregnancy / pink restriction
  const isPink = isPinkEligible || employee.specialProfile === 'PINK' || employee.isPregnant || employee.maternityStatus === 'PREGNANT';

  // Base state definition
  let currentBand = employee.currentBand || employee.band || (isPink ? 'PINK' : 'A');
  let cycleDay = employee.cycleDay || 1;
  let nightCycleDay = employee.nightCycleDay || 0;
  let cycleStatus = CYCLE_STATUS.ACTIVE;

  // 1. Check WO status
  if (isWO) {
    cycleStatus = CYCLE_STATUS.WAITING_FOR_WO;
    return {
      empId,
      targetDate,
      currentBand,
      cycleDay,
      isWO: true,
      cycleStatus: CYCLE_STATUS.WAITING_FOR_WO,
      attendanceType: 'WO',
      canWorkDuty: false,
      reason: 'Scheduled Immutable Weekly Off'
    };
  }

  // 2. Check Approved Leave status (CL, EL, HPL, ML, PL, GHEL)
  if (activeLeave) {
    const leaveKind = activeLeave.kind || activeLeave.leaveType || 'LEAVE';
    return {
      empId,
      targetDate,
      currentBand,
      cycleDay,
      isWO: false,
      cycleStatus: CYCLE_STATUS.PAUSED_LEAVE,
      attendanceType: leaveKind,
      canWorkDuty: false,
      reason: `Approved Leave: ${leaveKind} (Rotation State Preserved)`
    };
  }

  // 3. Check Pink Cycle state
  if (isPink) {
    return {
      empId,
      targetDate,
      currentBand: 'PINK',
      cycleDay,
      isWO: false,
      cycleStatus: CYCLE_STATUS.PINK_CYCLE,
      attendanceType: 'PENDING_ASSIGNMENT',
      canWorkDuty: true,
      nightRestricted: true,
      reason: 'Pink Maternity Rotation'
    };
  }

  // 4. Night Cycle Evaluation
  if (currentBand === 'N' || employee.inNightCycle) {
    // Check if continuing an existing night block
    if (nightCycleDay >= 6) {
      // Reached 6-night target -> Requires recovery / WO transition
      return {
        empId,
        targetDate,
        currentBand: 'A', // Rotate back to Day band after recovery
        cycleDay: 1,
        nightCycleDay: 0,
        isWO: false,
        cycleStatus: CYCLE_STATUS.COMPLETED,
        attendanceType: 'RECOVERY',
        canWorkDuty: false,
        reason: 'Completed 6-Night Cycle Target -> Mandatory Recovery'
      };
    }

    return {
      empId,
      targetDate,
      currentBand: 'N',
      cycleDay,
      nightCycleDay: nightCycleDay + 1,
      isWO: false,
      cycleStatus: CYCLE_STATUS.NIGHT_CYCLE,
      attendanceType: 'PENDING_ASSIGNMENT',
      canWorkDuty: true,
      reason: `Night Block Rotation (N${nightCycleDay + 1})`
    };
  }

  // 5. Standard Active Day Band (A or B)
  return {
    empId,
    targetDate,
    currentBand,
    cycleDay,
    isWO: false,
    cycleStatus: CYCLE_STATUS.ACTIVE,
    attendanceType: 'PENDING_ASSIGNMENT',
    canWorkDuty: true,
    reason: `Active ${currentBand}-Band Rotation (Day ${cycleDay})`
  };
}

/**
 * Evaluates whether an employee can start or continue a Night Block (H5, H18, H22)
 */
export function validateNightCycleEligibility({
  employee,
  targetDate,
  historicalData = {},
  restHours = 16
}) {
  const empId = employee.empId || employee.employeeId;

  // H22: Pink / Pregnant staff NEVER on night band
  if (employee.specialProfile === 'PINK' || employee.isPregnant || employee.maternityStatus === 'PREGNANT') {
    return { eligible: false, reason: 'H22: Pink / Maternity staff restricted from night duty' };
  }

  // H3: Minimum 8h rest (Comfort >= 12h)
  if (restHours < 8.0) {
    return { eligible: false, reason: `H3: Insufficient rest (${restHours.toFixed(1)}h < 8.0h hard minimum)` };
  }

  // H18: Reject if previous day was A or B shift with rest < 12h
  const hist = historicalData[empId] || { nightCount: 0, nightStreak: 0, recentDuties: [] };
  const prevDuty = hist.recentDuties && hist.recentDuties.length > 0 ? hist.recentDuties[hist.recentDuties.length - 1] : null;
  if (prevDuty && (prevDuty.shift === 'A' || prevDuty.shift === 'B') && restHours < 12.0) {
    return { eligible: false, reason: 'H18: Minimum 12h rest required transitioning from A/B shift to Night' };
  }

  // H5: Maximum 6 consecutive nights
  if ((hist.nightStreak || 0) >= 6) {
    return { eligible: false, reason: 'H5: Maximum 6 consecutive nights reached. Mandatory recovery required' };
  }

  return { eligible: true, reason: 'Eligible for Night rotation' };
}
