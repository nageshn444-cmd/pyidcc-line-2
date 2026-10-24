/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * WTT-Correlated Operational Location & Track Line Resolver Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-references Working Time Tables (WTT) to pinpoint the exact:
 * 1. Station Code (e.g. PYID, KGWA, PUTH, APTS, BIET, NGSA, NLC, RVR, YPM, RJNR)
 * 2. Track Line Direction (UP Line Northbound vs DOWN Line Southbound)
 * 3. Platform / Siding Designation (PF, Siding, Depot Rd-3, Buffer End)
 *
 * Automatically keeps all subsequent modules synchronized when WTT & Link Roster are uploaded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry.js';
import { 
  normalizeScheduleDay, 
  getTrainInductionsForDay, 
  getTrainStablingForDay 
} from '../data/weekdayReliefIdChartRegistry.js';

// Canonical BMRCL Line 2 Station metadata
export const LINE2_STATION_NAMES = {
  BIET: 'Madavara (BIET)',
  NGSA: 'Nagasandra (NGSA)',
  PYID: 'Peenya Industry (PYID)',
  YPM: 'Yeshwanthpur (YPM)',
  RJNR: 'Rajajinagar (RJNR)',
  KGWA: 'Majestic (KGWA)',
  NLC: 'National College (NLC)',
  RVR: 'RV Road (RVR)',
  PUTH: 'Yelachenahalli (PUTH)',
  APTS: 'Silk Institute (APTS)',
  SPGD: 'Sompura Goods Depot Siding (SPGD)',
  JIDL: 'Jalahalli Siding (JIDL)',
  BT: 'Buffer Track End (BT)'
};

/**
 * Resolves the exact Station Code along with UP or DN line from the day's WTT.
 *
 * @param {string} scheduleType - 'WEEKDAY' | 'MONDAY' | 'SATURDAY' | 'SUNDAY' | 'GH'
 * @param {string|number} trainId - e.g. '201', '214'
 * @param {string} timeStr - 'HH:MM' or 'HH:MM:SS'
 * @param {string} [explicitHint=''] - Paper chart text e.g. 'PYID', 'SPGD DN PF', 'P DHO'
 * @param {Array} [customWttRows=null] - Optional Firestore live uploaded WTT rows
 * @returns {string} Fully-qualified location: e.g. 'PYID UP PF', 'KGWA DN PF', 'B DHO'
 */
export function resolveWttLocation(
  scheduleType = 'WEEKDAY',
  trainId = '',
  timeStr = '',
  explicitHint = '',
  customWttRows = null
) {
  const normSchedule = normalizeScheduleDay(scheduleType);
  const cleanTid = String(trainId || '').replace(/^Train\s*/i, '').trim();
  const rawHint = String(explicitHint || '').trim();
  const upHint = rawHint.toUpperCase();

  // If time is missing or not timetabled, fallback to sanitized hint
  if (!timeStr || timeStr === '--' || timeStr === '-') {
    return rawHint || '-';
  }

  // 2. Parse target time into seconds from midnight
  const parts = timeStr.split(':').map(Number);
  const targetSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);

  // 3. Select candidate WTT rows matching schedule and train ID
  const allRows = Array.isArray(customWttRows) && customWttRows.length > 0 
    ? customWttRows 
    : WTT_MASTER_REGISTRY;

  const candidateRows = allRows.filter(r => {
    const sType = normalizeScheduleDay(r.scheduleType);
    if (sType !== normSchedule) return false;
    const t = String(r.trainId || '').trim();
    const dt = String(r.dnTid || '').trim();
    const ut = String(r.upTid || '').trim();
    return t === cleanTid || dt === cleanTid || ut === cleanTid;
  });

  let bestMatch = null;
  let minDiff = 240; // Max 4 minutes tolerance for platform dwell/stopping

  candidateRows.forEach(r => {
    // DOWN TRIP (BIET -> APTS Southbound)
    if (r.downTrip && r.downTrip.stations) {
      Object.entries(r.downTrip.stations).forEach(([stn, tVal]) => {
        if (!tVal || tVal === '--' || tVal === '-' || !tVal.includes(':')) return;
        const [h, m, s] = tVal.split(':').map(Number);
        const sec = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
        const diff = Math.abs(sec - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = { stn: stn.toUpperCase(), dir: 'DN', diff };
        }
      });
    }

    // UP TRIP (APTS -> BIET Northbound)
    if (r.upTrip && r.upTrip.stations) {
      Object.entries(r.upTrip.stations).forEach(([stn, tVal]) => {
        if (!tVal || tVal === '--' || tVal === '-' || !tVal.includes(':')) return;
        const [h, m, s] = tVal.split(':').map(Number);
        const sec = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
        const diff = Math.abs(sec - targetSec);
        if (diff < minDiff) {
          minDiff = diff;
          bestMatch = { stn: stn.toUpperCase(), dir: 'UP', diff };
        }
      });
    }
  });

  // 4. Return formatted Station Code + Direction + PF if WTT match found
  if (bestMatch) {
    if (upHint.includes('SPGD')) return 'SPGD DN PF';
    if (upHint.includes('JIDL')) return `JIDL ${bestMatch.dir} PF`;
    return `${bestMatch.stn} ${bestMatch.dir} PF`;
  }

  // 1. Preserved special operational terminal/depot codes & canonical train inductions (when not on mainline)
  if (upHint.includes('DHO')) {
    // Depot Handover (e.g. 'B DHO' = BIET Depot Handover, 'P DHO' = Peenya Depot Handover)
    const isBDho = upHint.includes('B DHO') || upHint.includes('BDHO') || upHint.includes('BT DHO') || upHint.includes('BTDHO');
    return isBDho ? 'B DHO (BIET SBL)' : 'P DHO (Peenya Depot SBL)';
  }
  if (upHint.includes('PDC')) {
    return 'PDC (Peenya Depot Rd-3)';
  }

  // Exact canonical train induction locations from timetable
  if (upHint === 'SPGD DN' || upHint === 'SPGD DN PF') return 'SPGD DN';
  if (upHint === 'NGSA DN' || upHint === 'NGSA DN PF') return 'NGSA DN';
  if (upHint === 'BIET DN PF') return 'BIET DN PF';
  if (upHint === 'BIET UP PF') return 'BIET UP PF';
  if (upHint === 'BIET DN') return 'BIET DN';
  if (upHint === 'BIET UP') return 'BIET UP';
  if (upHint === 'NGSA UP' || upHint === 'NGSA UP PF') return 'NGSA UP';
  if (upHint.includes('JLHL DN')) return 'JLHL DN-PF';
  if (upHint === '-PYID UP-B' || upHint === 'PYID UP-B' || upHint === 'PYID UP-BE' || upHint === '-PYID UP-BE') return '-PYID UP-B';
  if (upHint === 'NLC UP' || upHint === 'NLC UP PF') return 'NLC UP';
  if (upHint === 'PUTHUP' || upHint === 'PUTH UP' || upHint === 'PUTH UP PF') return rawHint.includes(' ') ? 'PUTH UP' : 'PUTHUP';
  if (upHint === 'APTS UP' || upHint === 'APTS UP PF') return 'APTS UP';
  if (upHint === 'APTS DN' || upHint === 'APTS DN PF') return 'APTS DN';
  if (upHint === 'PUTH DN' || upHint === 'PUTH DN PF') return 'PUTH DN';
  if (upHint === 'PYID RD3' || upHint === 'PYID-RD3') return 'PYID RD3';
  if (upHint === 'DPO-RD3' || upHint === 'DPO - RD3') return 'Dpo-Rd3';
  if (upHint === 'DEPOT-RD3' || upHint === 'DEPOT - RD3') return 'DEPOT-RD3';
  if (upHint.includes('NGSA PKT')) return 'NGSA PKT';
  if (upHint === 'BIET BN BE' || upHint === 'BIET DN BE' || upHint.includes('BIET DN B/E') || upHint.includes('BIET DNBE')) return explicitHint.includes('BN') ? 'BIET BN BE' : 'BIET DN BE';
  if (upHint.includes('BT DN') || upHint.includes('BT') || upHint.includes('B/E')) {
    return 'BT DN BE';
  }
  if (upHint === 'JIDL UP' || upHint === 'JIDL UP PF') return 'JIDL UP';

  if (upHint.includes('RD3') || upHint.includes('DPO-RD3') || upHint.includes('DPO - RD3')) {
    return 'PYID Dpo-Rd3';
  }
  if (upHint.includes('DEPOT') && !upHint.includes('PF')) {
    return 'PYID Depot SBL';
  }
  if (upHint.includes('N PKT') || upHint.includes('PKT')) {
    return 'N PKT / Depot SBL';
  }

  // 5. Intelligent fallback using explicit hint or depot induction
  if (rawHint) {
    let cleanHint = rawHint.replace(/[\r\n]+/g, ' ').trim();
    if (cleanHint.toUpperCase().includes('UP') && !cleanHint.toUpperCase().includes('PF')) {
      return `${cleanHint} PF`;
    }
    if (cleanHint.toUpperCase().includes('DN') && !cleanHint.toUpperCase().includes('PF')) {
      return `${cleanHint} PF`;
    }
    return cleanHint;
  }

  // Midnight / Late night termination fallback (00:00 to 03:30)
  if (targetSec <= 3.5 * 3600) {
    const dayStablings = getTrainStablingForDay(normSchedule);
    if (cleanTid && dayStablings?.[cleanTid]) {
      return dayStablings[cleanTid];
    }
    return 'PYID Depot SBL';
  }

  // Early morning depot induction fallback (03:30 to 07:00)
  if (targetSec <= 7 * 3600) {
    const dayInductions = getTrainInductionsForDay(normSchedule);
    if (cleanTid && dayInductions?.[cleanTid]) {
      return dayInductions[cleanTid];
    }
    return 'PYID Dpo-Rd3';
  }

  return 'PYID UP PF';
}

/**
 * Enriches an entire Master ID Chart with WTT-correlated Station Codes and UP/DN Lines.
 *
 * @param {Object} rawChart - Map of trainId -> legs array
 * @param {string} scheduleType - e.g. 'SATURDAY', 'WEEKDAY', 'MONDAY', 'SUNDAY'
 * @param {Array} [customWttRows=null] - Live WTT records from Firestore
 * @returns {Object} Deeply enriched chart with exact Station Codes and UP/DN lines
 */
export function enrichMasterIdChartWithWttLocations(
  rawChart = {},
  scheduleType = 'WEEKDAY',
  customWttRows = null
) {
  const enriched = {};
  const normSchedule = normalizeScheduleDay(scheduleType);
  const dayInductions = getTrainInductionsForDay(normSchedule);
  const dayStablings = getTrainStablingForDay(normSchedule);

  Object.entries(rawChart || {}).forEach(([tid, legs]) => {
    if (tid === 'Couns') {
      enriched[tid] = (legs || []).map(l => ({
        ...l,
        toc: l.toc || '-',
        hoc: l.hoc || '-',
        locationDetail: 'Peenya Depot Crew Control Counselling Room'
      }));
      return;
    }

    const enrichedLegs = [];
    const totalLegs = (legs || []).length;

    (legs || []).forEach((leg, idx) => {
      const fromTime = leg.from;
      const toTime = leg.to;

      // Leg 0 is the morning induction
      let hintToc = leg.toc || '';
      if (idx === 0 && dayInductions?.[tid]) {
        hintToc = dayInductions[tid];
      }

      // Last leg is the night stabling
      let hintHoc = leg.hoc || '';
      if (idx === totalLegs - 1 && dayStablings?.[tid]) {
        hintHoc = dayStablings[tid];
      }

      // Correlate Take Over Location (TOC)
      let resolvedToc = resolveWttLocation(
        scheduleType,
        tid,
        fromTime,
        hintToc,
        customWttRows
      );

      // Correlate Hand Over Location (HOC)
      let resolvedHoc = resolveWttLocation(
        scheduleType,
        tid,
        toTime,
        hintHoc,
        customWttRows
      );

      // For the final stabling leg, ensure canonical stabling location is locked in
      if (idx === totalLegs - 1 && dayStablings?.[tid]) {
        resolvedHoc = dayStablings[tid];
      }

      // Ensure sequential continuity: Next leg's TOC matches current leg's HOC if same train
      if ((!leg.toc || leg.toc === '-') && idx > 0 && enrichedLegs[idx - 1]?.hoc) {
        resolvedToc = enrichedLegs[idx - 1].hoc;
      }

      const enrichedLeg = {
        ...leg,
        toc: resolvedToc,
        hoc: resolvedHoc,
        rawToc: leg.toc || '',
        rawHoc: leg.hoc || '',
        fromLoc: resolvedToc,
        toLoc: resolvedHoc
      };
      enrichedLegs.push(enrichedLeg);
    });

    enriched[tid] = enrichedLegs;
  });

  return enriched;
}

/**
 * Normalizes location codes into clean, standard BMRCL Line 2 operational notation.
 * Preserves specific explicit hints (like 'Dpo - Rd3', 'KGWA Dn', 'PYID Up', 'P DHO', 'Depot', 'TGTP').
 * Converts verbose WTT strings (like 'PYID UP PF', 'KGWA DN PF') to clean 'PYID Up', 'KGWA Dn'.
 */
export function formatResolvedLocation(resolvedStr) {
  if (!resolvedStr || resolvedStr === '--' || resolvedStr === '-' || resolvedStr === 'null' || resolvedStr === 'undefined') return '--';
  let s = String(resolvedStr).trim();

  // Preserved special depot / siding codes
  if (/\b(P\s*DHO|B\s*DHO)\b/i.test(s)) {
    const isBDho = /\bB\s*DHO\b/i.test(s) || /BIET/i.test(s);
    return isBDho ? 'B DHO' : 'P DHO';
  }
  if (/\b(DPO[\s-]*RD3|PYID[\s-]*RD3)\b/i.test(s)) {
    return 'Dpo-Rd3';
  }
  if (/^PYID\s+Depot\s+SBL$/i.test(s) || /^Depot\s+SBL$/i.test(s)) {
    return 'Depot';
  }

  // Strip trailing 'PF' or 'PF-' and parenthetical expansions
  s = s.replace(/\s*\(Peenya Depot SBL\)/i, '');
  s = s.replace(/\s*\(BIET SBL\)/i, '');
  s = s.replace(/\s+PF$/i, '').trim();

  // Format direction cleanly: UP -> Up, DN -> Dn
  s = s.replace(/\s+UP$/i, ' Up').replace(/\s+DN$/i, ' Dn');
  return s;
}

/**
 * Automatically and accurately infers/updates the Takeover Location (TOC) and Handover Location (HOC)
 * for all legs (Leg 1, Leg 2, Leg 3, Leg 4) across any schedule day (Monday, Sunday, Saturday/GH, Weekday).
 *
 * Rules:
 * 1. Preserves already valid, explicit locations if provided.
 * 2. Cross-references the day's WTT timetable for each train number at board and deboard times.
 * 3. Handles Proctor (Pro 1, Pro 2), Standby (Stby), Counseling (Couns), and Reserve (Resv) base locations.
 * 4. Ensures operational continuity: Leg N+1 TOC matches Leg N HOC where trains are handed over.
 * 5. Grounding: Leg 1 TOC connects to signOnLocation; Final Leg HOC connects to signOffLocation.
 * 6. Night duties: Evening trip HOC connects to overnight stabling, Morning follow trip TOC takes over from stabling.
 * 7. Synchronizes the structured `trips` array inside the duty object as well.
 *
 * @param {Object} duty - Roster duty object
 * @param {string} scheduleType - 'WEEKDAY' | 'MONDAY' | 'SATURDAY' | 'SUNDAY' | 'GH'
 * @param {Array} [customWttRows=null] - Live WTT timetable rows
 * @returns {Object} Duty with complete, accurate TOC and HOC for all 4 legs
 */
export function inferAllLegLocations(duty, scheduleType = 'WEEKDAY', customWttRows = null) {
  if (!duty) return duty;

  const clean = (val) => {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    return (s === '--' || s === '-' || s === 'null' || s === 'undefined') ? '' : s;
  };

  const isSpecialDuty = (trainNo) => {
    const t = String(trainNo || '').trim().toLowerCase();
    return t.startsWith('pro') || t.startsWith('stby') || t.startsWith('couns') || t.startsWith('resv');
  };

  const getSpecialLoc = (trainNo, defaultLoc = 'PYID') => {
    const t = String(trainNo || '').trim().toLowerCase();
    if (t.startsWith('couns')) return 'PYID';
    if (t.startsWith('pro')) return 'PYID';
    return defaultLoc || 'PYID';
  };

  const resolveAndFormat = (tid, time, hint) => {
    const rawRes = resolveWttLocation(scheduleType, tid, time, hint, customWttRows);
    return formatResolvedLocation(rawRes);
  };

  const sOnLoc = clean(duty.signOnLocation) || 'PYID';
  const sOffLoc = clean(duty.signOffLocation) || sOnLoc;

  // Extract raw or existing values for all 4 legs
  let l1Train = clean(duty.leg1TrainNo || duty.trainId);
  let l1DepT = clean(duty.leg1TimeFrom || duty.leg1DepTime);
  let l1ArrT = clean(duty.leg1TimeTo || duty.leg1ArrTime);
  let l1Toc = clean(duty.signOnLocation || duty.leg1DepLoc);
  let l1Hoc = clean(duty.leg1HandoverLoc || duty.leg1ArrLoc);

  let l2Train = clean(duty.leg2TrainNo || duty.followTrain);
  let l2DepT = clean(duty.leg2DepTime || duty.followTimeFrom);
  let l2ArrT = clean(duty.leg2ArrTime || duty.followTimeTo || duty.followArrTime);
  let l2Toc = clean(duty.leg2DepLoc || duty.followTakeoverLoc);
  let l2Hoc = clean(duty.leg2ArrLoc || duty.followHandoverLoc);

  let l3Train = clean(duty.leg3TrainNo);
  let l3DepT = clean(duty.leg3DepTime);
  let l3ArrT = clean(duty.leg3ArrTime);
  let l3Toc = clean(duty.leg3DepLoc);
  let l3Hoc = clean(duty.leg3ArrLoc);

  let l4Train = clean(duty.leg4TrainNo);
  let l4DepT = clean(duty.leg4FinalDepTime || duty.leg4DepTime);
  let l4ArrT = clean(duty.leg4FinalArrTime || duty.leg4ArrTime);
  let l4Toc = clean(duty.leg4FinalDepLoc || duty.leg4DepLoc);
  let l4Hoc = clean(duty.leg4FinalArrLoc || duty.leg4ArrLoc);

  // Fallback train numbers and locations from trips array if present
  if (Array.isArray(duty.trips) && duty.trips.length > 0) {
    if (!l1Train && duty.trips[0]?.trainNo) l1Train = clean(duty.trips[0].trainNo);
    if (!l1Toc && duty.trips[0]?.takeoverLocation) l1Toc = clean(duty.trips[0].takeoverLocation);
    if (!l1Hoc && duty.trips[0]?.handoverLocation) l1Hoc = clean(duty.trips[0].handoverLocation);

    if (duty.trips.length > 1) {
      if (!l2Train && duty.trips[1]?.trainNo) l2Train = clean(duty.trips[1].trainNo);
      if (!l2Toc && duty.trips[1]?.takeoverLocation) l2Toc = clean(duty.trips[1].takeoverLocation);
      if (!l2Hoc && duty.trips[1]?.handoverLocation) l2Hoc = clean(duty.trips[1].handoverLocation);
    }
    if (duty.trips.length > 2) {
      if (!l3Train && duty.trips[2]?.trainNo) l3Train = clean(duty.trips[2].trainNo);
      if (!l3Toc && duty.trips[2]?.takeoverLocation) l3Toc = clean(duty.trips[2].takeoverLocation);
      if (!l3Hoc && duty.trips[2]?.handoverLocation) l3Hoc = clean(duty.trips[2].handoverLocation);
    }
    if (duty.trips.length > 3) {
      if (!l4Train && duty.trips[3]?.trainNo) l4Train = clean(duty.trips[3].trainNo);
      if (!l4Toc && duty.trips[3]?.takeoverLocation) l4Toc = clean(duty.trips[3].takeoverLocation);
      if (!l4Hoc && duty.trips[3]?.handoverLocation) l4Hoc = clean(duty.trips[3].handoverLocation);
    }
  }

  // Determine active legs
  const hasL1 = Boolean(l1Train || l1DepT || l1ArrT || l1Toc || l1Hoc);
  const hasL2 = Boolean(l2Train || l2DepT || l2ArrT || l2Toc || l2Hoc);
  const hasL3 = Boolean(l3Train || l3DepT || l3ArrT || l3Toc || l3Hoc);
  const hasL4 = Boolean(l4Train || l4DepT || l4ArrT || l4Toc || l4Hoc);

  // 1. Leg 1 TOC
  if (hasL1) {
    const isGenericToc1 = !l1Toc || l1Toc === '--';
    if (isSpecialDuty(l1Train)) {
      if (isGenericToc1) l1Toc = getSpecialLoc(l1Train, sOnLoc);
    } else if (l1Train && l1DepT) {
      const resolved = resolveAndFormat(l1Train, l1DepT, isGenericToc1 ? sOnLoc : l1Toc);
      if (resolved && resolved !== '--') l1Toc = resolved;
    }
    if (!l1Toc) l1Toc = sOnLoc;
  }

  // 2. Leg 1 HOC
  if (hasL1) {
    const isGenericHoc1 = !l1Hoc || l1Hoc === '--' || l1Hoc === 'Depot';
    if (isSpecialDuty(l1Train)) {
      if (isGenericHoc1) l1Hoc = getSpecialLoc(l1Train, l1Toc || sOnLoc);
    } else if (l1Train && l1ArrT) {
      const resolved = resolveAndFormat(l1Train, l1ArrT, isGenericHoc1 ? (l2Toc || '') : l1Hoc);
      if (resolved && resolved !== '--') l1Hoc = resolved;
    }
    if (!l1Hoc && l2Toc) l1Hoc = l2Toc;
    if (!l1Hoc && !hasL2) l1Hoc = sOffLoc;
  }

  // 3. Leg 2 TOC
  if (hasL2) {
    const isGenericToc2 = !l2Toc || l2Toc === '--' || l2Toc === sOnLoc;
    if (isSpecialDuty(l2Train)) {
      if (isGenericToc2) l2Toc = getSpecialLoc(l2Train, l1Hoc || sOnLoc);
    } else if (l2Train && l2DepT) {
      const resolved = resolveAndFormat(l2Train, l2DepT, isGenericToc2 ? (l1Hoc || '') : l2Toc);
      if (resolved && resolved !== '--') l2Toc = resolved;
    }
    if (!l2Toc && l1Hoc) l2Toc = l1Hoc;
    if (!l2Toc) l2Toc = sOnLoc;
  }

  if (hasL1 && (!l1Hoc || l1Hoc === 'Depot' || l1Hoc === '--') && l2Toc) {
    l1Hoc = l2Toc;
  }

  // 4. Leg 2 HOC
  if (hasL2) {
    const isGenericHoc2 = !l2Hoc || l2Hoc === 'Depot' || l2Hoc === 'PYID Depot SBL' || l2Hoc === '--';
    if (isSpecialDuty(l2Train)) {
      if (isGenericHoc2) l2Hoc = getSpecialLoc(l2Train, l2Toc || sOffLoc);
    } else if (l2Train && l2ArrT) {
      const resolved = resolveAndFormat(l2Train, l2ArrT, isGenericHoc2 ? '' : l2Hoc);
      if (resolved && resolved !== '--') l2Hoc = resolved;
    }
    if (!l2Hoc && l3Toc) l2Hoc = l3Toc;
    if (!l2Hoc && !hasL3) l2Hoc = sOffLoc;
  }

  // 5. Leg 3 TOC
  if (hasL3) {
    const isGenericToc3 = !l3Toc || l3Toc === 'Depot' || l3Toc === 'PYID Depot SBL' || l3Toc === '--';
    if (isSpecialDuty(l3Train)) {
      if (isGenericToc3) l3Toc = getSpecialLoc(l3Train, l2Hoc || sOnLoc);
    } else if (l3Train && l3DepT) {
      const resolved = resolveAndFormat(l3Train, l3DepT, isGenericToc3 ? (l2Hoc || '') : l3Toc);
      if (resolved && resolved !== '--') l3Toc = resolved;
    }
    if (!l3Toc && l2Hoc) l3Toc = l2Hoc;
    if (!l3Toc) l3Toc = l1Hoc || sOnLoc;
  }

  if (hasL2 && (!l2Hoc || l2Hoc === 'Depot' || l2Hoc === '--') && l3Toc) {
    l2Hoc = l3Toc;
  }

  // 6. Leg 3 HOC
  if (hasL3) {
    const isGenericHoc3 = !l3Hoc || l3Hoc === '--';
    if (isSpecialDuty(l3Train)) {
      if (isGenericHoc3) l3Hoc = getSpecialLoc(l3Train, l3Toc || sOffLoc);
    } else if (l3Train && l3ArrT) {
      const resolved = resolveAndFormat(l3Train, l3ArrT, isGenericHoc3 ? (l4Toc || '') : l3Hoc);
      if (resolved && resolved !== '--') l3Hoc = resolved;
    }
    if (!l3Hoc && l4Toc) l3Hoc = l4Toc;
    if (!l3Hoc && !hasL4) l3Hoc = sOffLoc;
  }

  // 7. Leg 4 TOC
  if (hasL4 && !l4Toc) {
    if (isSpecialDuty(l4Train)) {
      l4Toc = getSpecialLoc(l4Train, l3Hoc || sOnLoc);
    } else if (l4Train && l4DepT) {
      const resolved = resolveAndFormat(l4Train, l4DepT, l3Hoc || '');
      if (resolved && resolved !== '--') l4Toc = resolved;
    }
    if (!l4Toc && l3Hoc) l4Toc = l3Hoc;
    if (!l4Toc) l4Toc = l2Hoc || sOnLoc;
  }

  if (hasL3 && !l3Hoc && l4Toc) {
    l3Hoc = l4Toc;
  }

  // 8. Leg 4 HOC
  if (hasL4 && !l4Hoc) {
    if (isSpecialDuty(l4Train)) {
      l4Hoc = getSpecialLoc(l4Train, l4Toc || sOffLoc);
    } else if (l4Train && l4ArrT) {
      const resolved = resolveAndFormat(l4Train, l4ArrT, sOffLoc);
      if (resolved && resolved !== '--') l4Hoc = resolved;
    }
    if (!l4Hoc) l4Hoc = sOffLoc;
  }

  // Single-leg safety
  if (hasL1 && !hasL2 && (!l1Hoc || l1Hoc === '--')) {
    l1Hoc = sOffLoc;
  }

  // Synchronize internal trips array
  const updatedTrips = Array.isArray(duty.trips) ? duty.trips.map((t, idx) => {
    if (idx === 0) {
      return { ...t, takeoverLocation: l1Toc || t.takeoverLocation || sOnLoc, handoverLocation: l1Hoc || t.handoverLocation || '--' };
    }
    if (idx === 1) {
      return { ...t, takeoverLocation: l2Toc || t.takeoverLocation || '--', handoverLocation: l2Hoc || t.handoverLocation || '--' };
    }
    if (idx === 2) {
      return { ...t, takeoverLocation: l3Toc || t.takeoverLocation || '--', handoverLocation: l3Hoc || t.handoverLocation || '--' };
    }
    if (idx === 3) {
      return { ...t, takeoverLocation: l4Toc || t.takeoverLocation || '--', handoverLocation: l4Hoc || t.handoverLocation || '--' };
    }
    return t;
  }) : undefined;

  return {
    ...duty,
    signOnLocation: l1Toc || sOnLoc,
    leg1DepLoc: l1Toc || sOnLoc,
    leg1HandoverLoc: l1Hoc || '--',
    leg1ArrLoc: l1Hoc || '--',

    leg2DepLoc: hasL2 ? (l2Toc || '--') : '--',
    leg2ArrLoc: hasL2 ? (l2Hoc || '--') : '--',

    leg3DepLoc: hasL3 ? (l3Toc || '--') : '--',
    leg3ArrLoc: hasL3 ? (l3Hoc || '--') : '--',

    leg4FinalDepLoc: hasL4 ? (l4Toc || '--') : '--',
    leg4DepLoc: hasL4 ? (l4Toc || '--') : '--',
    leg4FinalArrLoc: hasL4 ? (l4Hoc || '--') : '--',
    leg4ArrLoc: hasL4 ? (l4Hoc || '--') : '--',

    ...(updatedTrips ? { trips: updatedTrips } : {})
  };
}

