/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Master Reliever ID Chart Excel Export Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Formats Excel exports in the exact 3-train-per-block layout matching the official
 * physical printed BMRCL ID Chart ("CC COPY"):
 * 
 * Block 1: Train 201 | Train 202 | Train 203  (Cols A-E, F-J, K-O)
 * Block 2: Train 204 | Train 205 | Train 206
 * Block 3: Train 207 | Train 208 | Train 209
 * Block 4: Train 210 | Train 211 | Train 212
 * Block 5: Train 213 | Train 214 | Train 215
 * Block 6: Train 216 | Train 217 | Train 218
 * Block 7: Train 219 | Train 220 | Train 221
 * Block 8: Train 222 | Train 223 | Counselling (or Counselling)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx';
import { 
  getReliefIdChartForDay, 
  normalizeScheduleDay, 
  getTrainInductionsForDay, 
  getTrainStablingForDay,
  timeStringToSeconds
} from '../data/weekdayReliefIdChartRegistry.js';
import { enrichMasterIdChartWithWttLocations } from './wttLocationResolverEngine.js';
import { getOperatorForDuty } from '../data/weekdayMasterDutyRoster.js';

const ALL_FLEET_ORDER = [
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210',
  '211', '212', '213', '214', '215', '216', '217', '218', '219', '220',
  '221', '222', '223', 'Couns'
];

/**
 * Builds the official 3-trains-per-block worksheet matching the BMRCL printed ID Chart.
 */
function build3TrainBlockWorksheet(rawChart, dayType, meta) {
  const normSchedule = normalizeScheduleDay(dayType);
  const dayInductions = getTrainInductionsForDay(normSchedule);
  const dayStablings = getTrainStablingForDay(normSchedule);

  // 1. Determine train list in canonical sequence
  let fleetKeys = [];
  if (normSchedule === 'SUNDAY') {
    fleetKeys = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219'];
  } else if (normSchedule === 'SATURDAY' || normSchedule === 'GH') {
    fleetKeys = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', 'Couns'];
  } else {
    // WEEKDAY / MONDAY
    fleetKeys = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223', 'Couns'];
  }

  // 2. Partition into triplets of 3 trains
  const blocks = [];
  for (let i = 0; i < fleetKeys.length; i += 3) {
    blocks.push(fleetKeys.slice(i, i + 3));
  }

  const rows = [];
  const merges = [];

  // Title Row (Row 0): matches exact header in CC copy
  let titleStr = '';
  if (normSchedule === 'SATURDAY' || normSchedule === 'GH') {
    titleStr = 'iD Chart for Saturday/GH Link WEF 15/Mar/2025 (APTS - BIET)                                                        CC COPY';
  } else if (normSchedule === 'SUNDAY') {
    titleStr = 'iD Chart for Sunday Link WEF 08/Dec/2024 (BIET - APTS)                                                               CC COPY';
  } else if (normSchedule === 'MONDAY') {
    titleStr = 'iD Chart for Monday Link WEF 06/Jan/2025 (APTS - BIET)                                                               CC COPY';
  } else {
    titleStr = 'iD Chart for Weekday Link WEF 22/Nov/2024 (APTS - BIET)                                                              CC COPY';
  }

  rows.push([titleStr, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 14 } });

  // 3. Build each 3-trains block
  blocks.forEach(block => {
    const t1 = block[0] || null;
    const t2 = block[1] || null;
    const t3 = block[2] || null;

    const rowIdxStart = rows.length;

    // Header 1: Train IDs merged across 5 columns each
    const label1 = t1 ? (t1 === 'Couns' ? 'Counselling' : t1) : '';
    const label2 = t2 ? (t2 === 'Couns' ? 'Counselling' : t2) : '';
    const label3 = t3 ? (t3 === 'Couns' ? 'Counselling' : t3) : '';

    rows.push([
      label1, '', '', '', '',
      label2, '', '', '', '',
      label3, '', '', '', ''
    ]);

    if (t1) merges.push({ s: { r: rowIdxStart, c: 0 }, e: { r: rowIdxStart, c: 4 } });
    if (t2) merges.push({ s: { r: rowIdxStart, c: 5 }, e: { r: rowIdxStart, c: 9 } });
    if (t3) merges.push({ s: { r: rowIdxStart, c: 10 }, e: { r: rowIdxStart, c: 14 } });

    // Header 2: Duty | TOC | From | To | HOC for all 3 train columns
    rows.push([
      'Duty', 'TOC', 'From', 'To', 'HOC',
      t2 ? 'Duty' : '', t2 ? 'TOC' : '', t2 ? 'From' : '', t2 ? 'To' : '', t2 ? 'HOC' : '',
      t3 ? 'Duty' : '', t3 ? 'TOC' : '', t3 ? 'From' : '', t3 ? 'To' : '', t3 ? 'HOC' : ''
    ]);

    // Format individual leg
    const formatLeg = (tid, leg, idx, totalLegs) => {
      if (!leg) return ['', '', '', '', ''];
      const duty = leg.duty || leg.dutyId || '';
      const from = leg.from || '';
      const to = (leg.to === '--' || !leg.to) ? '' : leg.to;

      // Leg 0 TOC is the canonical morning induction location
      let toc = leg.toc || '';
      if (idx === 0 && dayInductions[tid]) {
        toc = dayInductions[tid];
      }

      // Final Leg HOC is the canonical night stabling location
      let hoc = leg.hoc || '';
      if (idx === totalLegs - 1 && dayStablings[tid]) {
        hoc = dayStablings[tid];
      }

      return [duty, toc, from, to, hoc];
    };

    const legs1 = t1 ? (rawChart[t1] || []) : [];
    const legs2 = t2 ? (rawChart[t2] || []) : [];
    const legs3 = t3 ? (rawChart[t3] || []) : [];

    const maxLegs = Math.max(legs1.length, legs2.length, legs3.length, 7);

    for (let r = 0; r < maxLegs; r++) {
      const c1 = formatLeg(t1, legs1[r], r, legs1.length);
      const c2 = t2 ? formatLeg(t2, legs2[r], r, legs2.length) : ['', '', '', '', ''];
      const c3 = t3 ? formatLeg(t3, legs3[r], r, legs3.length) : ['', '', '', '', ''];

      rows.push([...c1, ...c2, ...c3]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths to match physical print sheet
  ws['!cols'] = [
    { wch: 7 },  { wch: 14 }, { wch: 8 },  { wch: 8 },  { wch: 14 }, // Col A-E (Train 1)
    { wch: 7 },  { wch: 14 }, { wch: 8 },  { wch: 8 },  { wch: 14 }, // Col F-J (Train 2)
    { wch: 7 },  { wch: 14 }, { wch: 8 },  { wch: 8 },  { wch: 14 }  // Col K-O (Train 3)
  ];

  ws['!merges'] = merges;
  return ws;
}

/**
 * Builds the Fleet Stabling & Induction Master Summary sheet.
 */
function buildSummaryWorksheet(dayTypes, customWttRows) {
  const rows = [
    ['BMRCL LINE-2 (PEENYA DEPOT) • FLEET INDUCTION & STABLING MASTER AUDIT SUMMARY'],
    [`Generated On: ${new Date().toLocaleString()} • BMRCL Line 2 Operations`],
    ['Verified WTT & Night Changeover Canonical Induction / Stabling Terminal Locations'],
    [],
    [
      'Schedule Day',
      'Train ID',
      'Total Legs',
      'Induction Time',
      'Morning Induction Location (TOC)',
      'First Duty',
      'Stabling Time',
      'Night Stabling Location (HOC)',
      'Final Duty',
      'Run Status',
      'Mid-Day Stabling Breaks'
    ]
  ];

  dayTypes.forEach(day => {
    const data = getReliefIdChartForDay(day);
    const rawChart = data.chart || data;
    const enriched = enrichMasterIdChartWithWttLocations(rawChart, day, customWttRows);
    const dayInductions = getTrainInductionsForDay(day);
    const dayStablings = getTrainStablingForDay(day);

    const trains = ALL_FLEET_ORDER.filter(tid => tid !== 'Couns' && (rawChart[tid] || dayInductions[tid]));

    trains.forEach(tid => {
      const legs = enriched[tid] || [];
      if (legs.length === 0) {
        rows.push([
          day,
          tid,
          0,
          '--',
          dayInductions[tid] || 'PYID Depot SBL',
          '--',
          '--',
          dayStablings[tid] || 'PYID Depot SBL',
          '--',
          'Stabled Full-Day',
          'No Mainline Service (Depot Reserve)'
        ]);
        return;
      }

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      // Audit breaks
      const breaks = [];
      for (let i = 0; i < legs.length - 1; i++) {
        const currToSec = timeStringToSeconds(legs[i].to);
        const nextFromSec = timeStringToSeconds(legs[i + 1].from);
        const gapSec = nextFromSec - currToSec;
        if (gapSec > 300) {
          breaks.push(`${legs[i].to}➔${legs[i + 1].from} (${Math.round(gapSec / 60)}m, D${legs[i].duty}➔D${legs[i + 1].duty})`);
        }
      }

      rows.push([
        day,
        tid,
        legs.length,
        firstLeg.from || '--',
        firstLeg.toc || dayInductions[tid] || 'PYID Depot',
        firstLeg.duty || '--',
        lastLeg.to || '--',
        lastLeg.hoc || dayStablings[tid] || 'PYID Depot SBL',
        lastLeg.duty || '--',
        breaks.length === 0 ? 'Continuous Mainline Run' : `Split-Shift (${breaks.length} Break${breaks.length > 1 ? 's' : ''})`,
        breaks.length === 0 ? 'None (Continuous)' : breaks.join('; ')
      ]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, // Schedule Day
    { wch: 10 }, // Train ID
    { wch: 10 }, // Total Legs
    { wch: 15 }, // Induction Time
    { wch: 30 }, // Morning Induction Loc
    { wch: 12 }, // First Duty
    { wch: 14 }, // Stabling Time
    { wch: 30 }, // Night Stabling Loc
    { wch: 12 }, // Final Duty
    { wch: 22 }, // Run Status
    { wch: 45 }  // Mid-Day Stabling Breaks
  ];
  return ws;
}

/**
 * Builds a flat list sheet for database filtering, analytics, and duty cross-checks.
 */
function buildFlatLegsWorksheet(dayTypes, customWttRows, dispatchDutyOperatorMap = {}) {
  const rows = [
    ['BMRCL LINE-2 • MASTER ID CHART FLAT LEGS & OPERATOR REGISTRY'],
    [`Generated On: ${new Date().toLocaleString()}`],
    [],
    [
      'Schedule Day',
      'Train ID',
      'Leg #',
      'Duty No',
      'Assigned Operator',
      'Employee ID',
      'TOC (Take Over Location)',
      'Time From',
      'Time To',
      'HOC (Hand Over / Stabling Location)',
      'Operational Role'
    ]
  ];

  dayTypes.forEach(day => {
    const data = getReliefIdChartForDay(day);
    const rawChart = data.chart || data;
    const enriched = enrichMasterIdChartWithWttLocations(rawChart, day, customWttRows);

    ALL_FLEET_ORDER.forEach(tid => {
      const legs = enriched[tid] || [];
      const totalLegs = legs.length;

      legs.forEach((leg, idx) => {
        const normD = String(leg.duty || leg.dutyId || '').padStart(2, '0');
        const defaultOp = getOperatorForDuty(normD);
        const dispatchOp = dispatchDutyOperatorMap[normD];

        const opName = dispatchOp?.empName || defaultOp?.empName || '--';
        const empId = dispatchOp?.empId || defaultOp?.empId || '--';

        let role = 'Mid-Day Mainline Handover';
        if (idx === 0) role = 'Morning Induction (First Leg)';
        else if (idx === totalLegs - 1) role = 'Night Stabling (Final Leg)';

        rows.push([
          day,
          tid,
          idx + 1,
          leg.duty || leg.dutyId || '--',
          opName,
          empId,
          leg.toc || '--',
          leg.from || '--',
          leg.to || '--',
          leg.hoc || '--',
          role
        ]);
      });
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, // Schedule Day
    { wch: 10 }, // Train ID
    { wch: 8 },  // Leg #
    { wch: 10 }, // Duty No
    { wch: 22 }, // Assigned Operator
    { wch: 14 }, // Employee ID
    { wch: 24 }, // TOC
    { wch: 11 }, // Time From
    { wch: 11 }, // Time To
    { wch: 26 }, // HOC
    { wch: 28 }  // Operational Role
  ];
  return ws;
}

/**
 * Main export function for Master ID Chart.
 * Produces the exact 3-train-per-block layout matching the official physical BMRCL ID Chart,
 * complete with all TOC and HOC station names across all train legs and days.
 */
export function exportMasterIdChartToExcel({
  scope = 'ALL_DAYS', // 'ALL_DAYS' | 'ACTIVE_DAY'
  activeDay = 'WEEKDAY',
  activeMasterIdChart = null,
  customWttRows = null,
  dispatchDutyOperatorMap = {}
}) {
  const wb = XLSX.utils.book_new();

  const dayTypes = scope === 'ACTIVE_DAY' 
    ? [normalizeScheduleDay(activeDay)] 
    : ['WEEKDAY', 'MONDAY', 'SATURDAY', 'GH', 'SUNDAY'];

  if (scope === 'ALL_DAYS') {
    // Multi-Day Workbook:
    // 1. Sheet: Master Induction & Stabling Summary
    const wsSummary = buildSummaryWorksheet(dayTypes, customWttRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Stabling & Induction');

    // 2. Sheets: Visual 3-Train-Block Matrix Grid for each Day Type with accurate TOC & HOC station names
    dayTypes.forEach(day => {
      const data = getReliefIdChartForDay(day);
      const rawChart = (day === normalizeScheduleDay(activeDay) && activeMasterIdChart)
        ? activeMasterIdChart
        : (data.chart || data);
      const meta = data.meta;
      const enrichedChart = (day === normalizeScheduleDay(activeDay) && activeMasterIdChart)
        ? activeMasterIdChart
        : enrichMasterIdChartWithWttLocations(rawChart, day, customWttRows);

      const sheetName = day === 'GH' ? 'GH (Holiday)' : day;
      const wsMatrix = build3TrainBlockWorksheet(enrichedChart, day, meta);
      XLSX.utils.book_append_sheet(wb, wsMatrix, sheetName);
    });

    // 3. Sheet: All Legs Flat Registry
    const wsFlat = buildFlatLegsWorksheet(dayTypes, customWttRows, dispatchDutyOperatorMap);
    XLSX.utils.book_append_sheet(wb, wsFlat, 'All Legs Registry');
  } else {
    // Single Day (e.g. WEEKDAY) Workbook:
    // Primary Sheet: Visual 3-Train-Block Matrix Grid matching paper chart with accurate TOC & HOC
    const targetDay = dayTypes[0];
    const data = getReliefIdChartForDay(targetDay);
    const meta = data.meta;
    const enrichedChart = (targetDay === normalizeScheduleDay(activeDay) && activeMasterIdChart)
      ? activeMasterIdChart
      : enrichMasterIdChartWithWttLocations(data.chart || data, targetDay, customWttRows);

    const wsMatrix = build3TrainBlockWorksheet(enrichedChart, targetDay, meta);
    XLSX.utils.book_append_sheet(wb, wsMatrix, `${targetDay} ID Chart`);

    // Stabling & Induction Summary
    const wsSummary = buildSummaryWorksheet([targetDay], customWttRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Stabling & Induction');

    // All Legs Registry
    const wsFlat = buildFlatLegsWorksheet([targetDay], customWttRows, dispatchDutyOperatorMap);
    XLSX.utils.book_append_sheet(wb, wsFlat, 'Legs Registry');
  }

  // Format filename with timestamp
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = scope === 'ACTIVE_DAY'
    ? `BMRCL_Master_ID_Chart_${normalizeScheduleDay(activeDay)}_${dateStr}.xlsx`
    : `BMRCL_Line2_Master_ID_Chart_All_Days_${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename);
  return filename;
}
