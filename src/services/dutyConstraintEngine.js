/**
 * BMRCL Line 2 (Peenya Depot) — Ultra-Advanced Duty Constraint Engine
 * Strictly enforces Hard Rules (H1–H20) and Soft Optimization scoring.
 */

import { isWeeklyOffOnDate, STANDING_GROUPS } from '../data/dayTypeProfiles.js';

/**
 * Parses time string 'HH:MM' or fractional day float into total minutes from midnight (0..1439)
 */
export function timeStringToMinutes(tStr) {
  if (typeof tStr === 'number') {
    return Math.round(tStr * 24 * 60) % 1440;
  }
  if (!tStr || typeof tStr !== 'string') return 0;
  const m = tStr.trim().match(/^([0-2]?\d):([0-5]\d)/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Calculates continuous rest hours between previous day sign-off and next day sign-on.
 * H2: Min 12h rest for normal shifts; wrap-aware across midnight.
 * For previous night duties (ending Day D morning), rest on Day D is nextMins - prevMins;
 * if nextMins < prevMins (e.g. 06:00 proposed on Day D vs 06:30 sign-off), rest is 0h (overlap).
 */
export function calculateRestHours(prevSignOffStr, nextSignOnStr, isPreviousDutyNight = false) {
  if (!prevSignOffStr || !nextSignOnStr) return 16.0; // Assume full rest if no previous record

  const prevMins = timeStringToMinutes(prevSignOffStr);
  const nextMins = timeStringToMinutes(nextSignOnStr);

  let restMins = 0;
  if (isPreviousDutyNight || prevMins <= 7 * 60) {
    // Previous duty finished in the morning of Day D (e.g. 06:30)
    if (nextMins < prevMins) {
      // Proposed duty starts BEFORE or AT previous night duty sign-off on Day D! Absolute overlap
      restMins = 0;
    } else {
      // Proposed duty starts later on Day D (e.g. 14:30) -> gap is difference on Day D
      restMins = nextMins - prevMins;
    }
  } else {
    // Normal previous day afternoon/evening sign-off (Day D-1) to next day sign-on (Day D)
    if (nextMins < prevMins) {
      restMins = (24 * 60 - prevMins) + nextMins;
    } else {
      restMins = 24 * 60 + (nextMins - prevMins);
    }
  }

  return Math.round((restMins / 60) * 10) / 10;
}

/**
 * Determines if a duty belongs to 1st Shift (A-shift / Morning duties).
 * Covers mainline A-band, PRO 1 (Pilot Relief), OR 1, Station Standby A, CC1, and morning standby (< 12:00 sign-on).
 */
export function isFirstShiftDuty(duty) {
  if (!duty) return false;
  if (duty.shift === 'A') return true;
  const num = parseInt(duty.dutyNo, 10);
  if (duty.shift === 'PRO' && num === 1) return true;
  if (duty.shift === 'STBY' && num === 2) return true;
  if (duty.tag === '1Stbk-A' || duty.stbkShift === 'A' || duty.slotCode === 'CC1') return true;
  const dutyCodeStr = String(duty.dutyCode || '').toUpperCase();
  if (dutyCodeStr.includes('PRO1') || dutyCodeStr.includes('OR1') || (dutyCodeStr.startsWith('A') && !dutyCodeStr.startsWith('AP') && !dutyCodeStr.startsWith('AU'))) {
    return true;
  }
  if (duty.sOnTime && duty.sOnTime !== '—') {
    const mins = timeStringToMinutes(duty.sOnTime);
    // Morning sign-on between 04:00 and 11:59
    if (mins >= 4 * 60 && mins < 12 * 60) return true;
  }
  return false;
}

/**
 * Determines if a duty belongs to 2nd Shift (B-shift / Afternoon duties).
 * Covers mainline B-band, PRO 2, OR 2, Station Standby B, CC2, and afternoon duties (12:00–19:59 sign-on).
 */
export function isSecondShiftDuty(duty) {
  if (!duty) return false;
  if (duty.shift === 'B') return true;
  const num = parseInt(duty.dutyNo, 10);
  if (duty.tag === '1Stbk-B' || duty.stbkShift === 'B' || duty.slotCode === 'CC2') return true;
  const dutyCodeStr = String(duty.dutyCode || '').toUpperCase();
  if (dutyCodeStr.includes('PRO2') || dutyCodeStr.includes('OR2') || (dutyCodeStr.startsWith('B') && !dutyCodeStr.startsWith('BM') && !dutyCodeStr.startsWith('BO'))) {
    return true;
  }
  if (duty.sOnTime && duty.sOnTime !== '—') {
    const mins = timeStringToMinutes(duty.sOnTime);
    if (mins >= 12 * 60 && mins < 20 * 60) return true;
  }
  return false;
}

/**
 * Validates all Hard Rules (H1–H20) for assigning a proposed duty to an employee on a target date.
 */
export function validateDutyAssignment({
  employee,
  proposedDuty, // { dutyCode, shift, sOnTime, sOffTime, isNight, isPinkSuitable, dutyNo }
  targetDate,   // YYYY-MM-DD
  previousDuty, // { dutyCode, shift, sOffTime, isNight } or null
  historicalStats = {}, // { nightStreak, consecutiveDays, recentDuties, lastNightCode, ... }
  activeRequests = [],
  dayType = 'WEEKDAY'
}) {
  const errors = [];
  const warnings = [];

  if (!employee || !proposedDuty) {
    return { valid: false, errors: ['Missing employee or duty specification'], warnings };
  }

  const empId = parseInt(employee.empId, 10);
  const isProposedWO = proposedDuty.dutyCode === 'WO' || proposedDuty.shift === 'WO';
  const isProposedLeave = ['CL', 'EL', 'HPL', 'GHEL', 'GH', 'SICK', 'ML', 'PL', 'BO', 'OD', 'REL', 'BMRTI'].includes(proposedDuty.dutyCode);

  // ── H7: NO DUTY WHILE ON LEAVE / ABSENT / STANDING GROUPS ──
  if (STANDING_GROUPS.PINK_LINE_4.includes(empId)) {
    if (!isProposedWO && proposedDuty.dutyCode !== 'OD') {
      errors.push(`H7: Employee ${employee.name} (${empId}) is assigned to Pink Line 4 support (OD). Cannot take mainline duties.`);
    }
  }
  if (STANDING_GROUPS.BMRTI_R5.includes(empId)) {
    if (proposedDuty.dutyCode !== 'BMRTI') {
      errors.push(`H7: Employee ${employee.name} (${empId}) is on BMRTI nomination. Mainline driving blocked.`);
    }
  }

  const matchingLeave = activeRequests.find(r => 
    r.empId === empId && 
    (r.type === 'LEAVE' || r.type === 'BOOK_OFF' || r.type === 'SICK' || r.type === 'CL' || r.type === 'EL' || r.type === 'ML')
  );
  if (matchingLeave && !isProposedLeave) {
    errors.push(`H7: Operator ${employee.name} is on approved ${matchingLeave.type || 'Leave'}.`);
  }

  // ── H15: WEEK-OFF (WO) IMMUTABILITY ──
  const isWO = isWeeklyOffOnDate(employee, targetDate);
  if (isWO && !isProposedWO && !isProposedLeave) {
    errors.push(`H15: Today is ${employee.name}'s scheduled Weekly Off (WO). WO is immutable.`);
  }

  // ── H18: NO A/B DUTY ON D-1 BEFORE NIGHT DUTY ON D ──
  const isTargetNight = proposedDuty.isNight || proposedDuty.shift === 'N' || String(proposedDuty.dutyCode).startsWith('N');
  if (isTargetNight && previousDuty && !previousDuty.isNight && previousDuty.shift !== 'N' && !String(previousDuty.dutyCode).startsWith('N')) {
    if (previousDuty.shift === 'A' || previousDuty.shift === 'B') {
      const rest = calculateRestHours(previousDuty.sOffTime, proposedDuty.sOnTime, false);
      if (rest < 12.0) {
        errors.push(`H18: Insufficient rest (${rest}h < 12.0h) between D-1 ${previousDuty.shift} shift sign-off (${previousDuty.sOffTime}) and Night sign-on (${proposedDuty.sOnTime}).`);
      }
    }
  }

  // ── H2: MINIMUM REST & SHIFT TRANSITION GATES ──
  if (previousDuty && !isProposedWO && !isProposedLeave && previousDuty.sOffTime) {
    const isPrevNight = previousDuty.isNight || previousDuty.shift === 'N' || String(previousDuty.dutyCode).startsWith('N');
    const restHours = calculateRestHours(previousDuty.sOffTime, proposedDuty.sOnTime, isPrevNight);

    // Rule 1: Night shift to A-shift / 1st Shift (including PRO 1, OR 1, morning standby) is strictly prohibited!
    if (isPrevNight && (proposedDuty.shift === 'A' || isFirstShiftDuty(proposedDuty))) {
      errors.push(`H2: Night shift to A-shift / 1st Shift (${proposedDuty.dutyCode || proposedDuty.dutyNo || proposedDuty.shift} · ${proposedDuty.sOnTime}) is strictly prohibited. PRO 1 and all A-shift duties are barred after night shift.`);
    }

    // Rule 2: Minimum 8 hours gap from Night shift without fail for ANY subsequent duty (including PRO 1, B-shift, etc.)
    if (isPrevNight) {
      if (restHours < 8.0) {
        errors.push(`H2: Mandatory 8-hour gap violation (${restHours}h < 8.0h) from previous Night sign-off (${previousDuty.sOffTime}) to duty (${proposedDuty.dutyCode || proposedDuty.dutyNo || proposedDuty.shift}) sign-on (${proposedDuty.sOnTime}). Must follow 8 hours gap from night shift without fail.`);
      }
    } else {
      // Standard rest between consecutive day shifts requires minimum 12.0 hours
      if (restHours < 12.0) {
        errors.push(`H2: Rest violation (${restHours}h < 12.0h) between previous sign-off (${previousDuty.sOffTime}) and next sign-on (${proposedDuty.sOnTime}).`);
      } else if (restHours < 14.0) {
        warnings.push(`Rest is ${restHours}h (Recommended: >=14h).`);
      }
    }
  }

  // ── H5: MAX 6 CONSECUTIVE NIGHTS (WARN > 5) ──
  const currentNightStreak = historicalStats.nightStreak || 0;
  if (isTargetNight) {
    if (currentNightStreak >= 6) {
      errors.push(`H5: Maximum 6 consecutive night duties reached (${currentNightStreak}). Operator must rotate off night block.`);
    } else if (currentNightStreak === 5) {
      warnings.push(`H5: Approaching 6-night cap (${currentNightStreak + 1}th night).`);
    }
  }

  // ── H6: MIN 1 FULL REST DAY AFTER A NIGHT BLOCK ENDS ──
  if (!isTargetNight && historicalStats.justFinishedNightBlock) {
    if (!isProposedWO && proposedDuty.shift === 'A') {
      errors.push(`H6: Minimum 1 full rest day required after completing a night shift block before 1st Shift (A).`);
    }
  }

  // ── H13: JMD TD SOLO CERTIFICATION GATE ──
  if (employee.role === 'JMD_TD' || employee.cadence === 'JMD_TD') {
    if (!employee.solo_certified_from && !employee.soloCertified) {
      // Must be shadow trainee, cannot be unmentored primary on mainline unless solo certified
      if (proposedDuty.role === 'PRIMARY' && !['PRO', 'STBY'].includes(proposedDuty.shift)) {
        warnings.push(`H13: JMD_TD trainee without solo certification assigned to mainline primary driving duty.`);
      }
    }
  }

  // ── H8 & H9: PDC, PME MEDICAL, LICENCE EXPIRY ──
  if (employee.pdc_valid_till && new Date(employee.pdc_valid_till) < new Date(targetDate)) {
    errors.push(`H8: PDC expired on ${employee.pdc_valid_till}. Cannot operate train.`);
  }
  if (employee.medical_valid_till && new Date(employee.medical_valid_till) < new Date(targetDate)) {
    errors.push(`H9: Medical (PME) fitness expired on ${employee.medical_valid_till}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Returns eligible boolean and concise diagnostic failure string for candidate selection drawers.
 */
export function getEligibilityDiagnostics(employee, proposedDuty, targetDate, historicalStats = {}, previousDuty = null) {
  const res = validateDutyAssignment({
    employee,
    proposedDuty,
    targetDate,
    previousDuty,
    historicalStats
  });

  return {
    emp_id: employee.empId,
    name: employee.name,
    eligible: res.valid,
    reason: res.valid ? 'Eligible' : (res.errors[0] || 'Constraint check failed'),
    warnings: res.warnings
  };
}

/**
 * Validates a proposed mutual shift exchange between Operator A and Operator B.
 */
export function validateMutualShiftExchange({
  operatorA,
  operatorB,
  dutyA,
  dutyB,
  targetDate,
  dayOfWeek,
  prevDutyA = null,
  prevDutyB = null,
  historyA = {},
  historyB = {}
}) {
  const checkA = validateDutyAssignment({
    employee: operatorA,
    proposedDuty: dutyB,
    targetDate,
    previousDuty: prevDutyA,
    historicalStats: historyA
  });

  const checkB = validateDutyAssignment({
    employee: operatorB,
    proposedDuty: dutyA,
    targetDate,
    previousDuty: prevDutyB,
    historicalStats: historyB
  });

  const valid = checkA.valid && checkB.valid;
  const errors = [...(checkA.errors || []), ...(checkB.errors || [])];
  const warnings = [...(checkA.warnings || []), ...(checkB.warnings || [])];

  return {
    valid,
    operatorAValid: checkA.valid,
    operatorBValid: checkB.valid,
    errors,
    warnings,
    summary: valid ? 'Mutual shift exchange is compliant with all BMRCL Hard Rules.' : 'Exchange violates one or more operational rest/quota constraints.'
  };
}

