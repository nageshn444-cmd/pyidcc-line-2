/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Master Reliever ID Chart Excel Export Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates official multi-sheet and single-day Excel workbooks containing:
 * 1. Visual Matrix Grid matching the Master ID Chart on-screen (Train columns x Leg rows)
 * 2. Fleet Stabling & Induction Master Summary across all schedule day types
 * 3. Flat Train Leg Registry with full Duty, Time From/To, TOC, HOC and Operator mapping
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
 * Builds a visual matrix worksheet matching the on-screen Master ID Chart table.
 */
function buildMatrixWorksheet(enrichedChart, dayType, meta) {
  const trainKeys = ALL_FLEET_ORDER.filter(tid => enrichedChart[tid] && enrichedChart[tid].length > 0);
  
  // Find maximum legs among all trains in this day
  let maxLegs = 0;
  trainKeys.forEach(tid => {
    const count = (enrichedChart[tid] || []).length;
    if (count > maxLegs) maxLegs = count;
  });

  const rows = [];
  const merges = [];

  // Title rows
  rows.push([`BMRCL LINE-2 (PEENYA DEPOT) • MASTER ID RELIEF CHART • ${dayType} SCHEDULE`]);
  rows.push([
    `Timetable: ${meta?.title || dayType} • Total Trains: ${trainKeys.length} • Generated: ${new Date().toLocaleString()}`
  ]);
  rows.push([
    `Legend: TOC = Take Over Location (Induction) • HOC = Hand Over Location (Stabling / Handover)`
  ]);
  rows.push([]); // blank separator

  // Header Row 1: Train ID spanning 5 columns each
  const headerRow1 = ['Leg #'];
  const headerRow2 = ['Leg #'];
  const colsConfig = [{ wch: 8 }]; // Leg # column width

  trainKeys.forEach((tid, trainIdx) => {
    const startCol = 1 + trainIdx * 5;
    headerRow1.push(`TRAIN ${tid}`, '', '', '', '');
    headerRow2.push('Duty', 'TOC (Takeover)', 'From', 'To', 'HOC (Handover / Stabling)');

    // Merge Train ID header across its 5 columns (row index 4, 0-indexed)
    merges.push({
      s: { r: 4, c: startCol },
      e: { r: 4, c: startCol + 4 }
    });

    colsConfig.push(
      { wch: 8 },  // Duty
      { wch: 15 }, // TOC
      { wch: 9 },  // From
      { wch: 9 },  // To
      { wch: 18 }  // HOC
    );
  });

  rows.push(headerRow1);
  rows.push(headerRow2);

  // Data Rows: Leg 1 to maxLegs
  for (let legIdx = 0; legIdx < maxLegs; legIdx++) {
    const row = [`Leg ${legIdx + 1}`];
    trainKeys.forEach(tid => {
      const legs = enrichedChart[tid] || [];
      const leg = legs[legIdx];
      if (leg) {
        row.push(
          leg.duty || leg.dutyId || '-',
          leg.toc || '-',
          leg.from || '-',
          leg.to || '-',
          leg.hoc || '-'
        );
      } else {
        row.push('-', '-', '-', '-', '-');
      }
    });
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = colsConfig;
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
 * Supports downloading ALL day types in one comprehensive workbook or ACTIVE day.
 */
export function exportMasterIdChartToExcel({
  scope = 'ALL_DAYS', // 'ALL_DAYS' | 'ACTIVE_DAY'
  activeDay = 'WEEKDAY',
  customWttRows = null,
  dispatchDutyOperatorMap = {}
}) {
  const wb = XLSX.utils.book_new();

  const dayTypes = scope === 'ACTIVE_DAY' 
    ? [normalizeScheduleDay(activeDay)] 
    : ['WEEKDAY', 'MONDAY', 'SATURDAY', 'GH', 'SUNDAY'];

  // 1. Sheet: Master Induction & Stabling Summary
  const wsSummary = buildSummaryWorksheet(dayTypes, customWttRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Stabling & Induction');

  // 2. Sheets: Visual Matrix Grid for each Day Type
  dayTypes.forEach(day => {
    const data = getReliefIdChartForDay(day);
    const rawChart = data.chart || data;
    const meta = data.meta;
    const enriched = enrichMasterIdChartWithWttLocations(rawChart, day, customWttRows);

    const sheetName = day === 'GH' ? 'GH (Holiday)' : day;
    const wsMatrix = buildMatrixWorksheet(enriched, day, meta);
    XLSX.utils.book_append_sheet(wb, wsMatrix, sheetName);
  });

  // 3. Sheet: All Legs Flat Registry
  const wsFlat = buildFlatLegsWorksheet(dayTypes, customWttRows, dispatchDutyOperatorMap);
  XLSX.utils.book_append_sheet(wb, wsFlat, 'All Legs Registry');

  // Format filename with timestamp
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = scope === 'ACTIVE_DAY'
    ? `BMRCL_Master_ID_Chart_${normalizeScheduleDay(activeDay)}_${dateStr}.xlsx`
    : `BMRCL_Line2_Master_ID_Chart_All_Days_${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename);
  return filename;
}
