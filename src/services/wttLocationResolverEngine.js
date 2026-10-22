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

  // 1. Preserved special operational terminal/depot codes & canonical train inductions
  if (upHint.includes('DHO')) {
    // Depot Handover (e.g. 'B DHO' = BIET Depot Handover, 'P DHO' = Peenya Depot Handover)
    return upHint.includes('B') ? 'B DHO (BIET SBL)' : 'P DHO (Peenya Depot SBL)';
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
    // If the explicit hint has extra detail (e.g. SPGD or specific Siding), merge it
    if (upHint.includes('SPGD')) return 'SPGD DN PF';
    if (upHint.includes('JIDL')) return `JIDL ${bestMatch.dir} PF`;
    return `${bestMatch.stn} ${bestMatch.dir} PF`;
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
