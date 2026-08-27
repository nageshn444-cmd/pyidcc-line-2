/**
 * BMRCL Line 2 - Roster Export Service
 * Generates official BMRCL Duty Roster Excel matching Print Wd & Indv Duties sheets
 */
import * as XLSX from 'xlsx';
import { formatDutyTypeLink, formatTo24HourTime } from '../utils/timeHelpers';

export function exportRosterToExcel({
  targetDate,
  dayType,
  planTitle,
  assignments = [],
  qualityScore = 95
}) {
  const wb = XLSX.utils.book_new();

  // Partition assignments strictly by operational category
  const runningDuties = assignments.filter(a => 
    a.status === 'ASSIGNED' && 
    !['CC', 'LRD', 'LEAVE', 'MATERNITY_LEAVE', 'WEEK_OFF', 'BOOK_OFF', 'TRAINING', 'CRT', 'PINK_LINE_4', 'JMD_STANDBY'].includes(a.specialTag) &&
    !['ML', 'HPL', 'CL', 'EL', 'WO', 'BOOK_OFF', 'SPECIAL_DUTY', 'TEST_TRACK'].includes(a.assignedDutyCode) &&
    !a.assignedDutyCode?.startsWith('CC')
  ).sort((a, b) => (a.dutyNo || 0) - (b.dutyNo || 0));

  const ccDuties = assignments.filter(a => a.specialProfile === 'CC' || a.dutyType === 'CC' || a.role?.includes('CC') || a.assignedDutyCode?.startsWith('CC'));
  const specialDuties = assignments.filter(a => a.assignedDutyCode === 'SPECIAL_DUTY' || a.assignedDutyCode === 'TEST_TRACK' || a.status === 'SPECIAL_DUTY' || a.status === 'TEST_TRACK');
  const trainingDuties = assignments.filter(a => a.status === 'TRAINING' || a.status === 'CRT' || ['TRAINING', 'CRT'].includes(a.assignedDutyCode));
  const lrdDuties = assignments.filter(a => a.status === 'LRD' || a.assignedDutyCode === 'LRD');
  const woDuties = assignments.filter(a => a.status === 'WEEK_OFF' || a.assignedDutyCode === 'WO');
  const leaveDuties = assignments.filter(a => ['LEAVE', 'MATERNITY_LEAVE', 'BOOK_OFF'].includes(a.status) || ['ML', 'HPL', 'CL', 'EL', 'BOOK_OFF'].includes(a.assignedDutyCode));

  // 1. Build Print Wd Sheet (Daily Duty Allocation)
  const printWdRows = [
    ['', `BMRCL LINE 2 - PEENYA INDUSTRY DEPOT CREW CONTROL DAILY DUTY ROSTER`, '', '', '', '', '', '', ''],
    ['', `Date: ${targetDate}`, `Day Type: ${dayType}`, `Plan: ${planTitle}`, `Quality Score: ${qualityScore}/100`, '', '', '', ''],
    [''],
    ['Duty No', 'Duty Type / Link', 'Shift', 'Sign On Time', 'Sign On Location', 'Train Operator Name', 'Emp ID', 'Sign Off Time', 'Sign Off Location', 'Train No', 'Status', 'Notes']
  ];

  // A. Mainline Running Duties (Duty #01 to #79/82)
  runningDuties.forEach((a, idx) => {
    printWdRows.push([
      a.dutyNo || (idx + 1),
      formatDutyTypeLink(a),
      a.shift || '--',
      a.sOnTime || '--',
      a.sOnLoc || '--',
      a.name || '--',
      a.empId || '--',
      formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift) || '--',
      a.sOffLoc || '--',
      a.trainNo || '--',
      'MAINLINE DRIVING',
      a.reason || ''
    ]);
  });

  // Section Separators
  if (ccDuties.length > 0) {
    printWdRows.push(['', '--- CREW CONTROLLERS (CC DESK) ---', '', '', '', '', '', '', '', '', '', '']);
    ccDuties.forEach(a => {
      printWdRows.push([
        'CC',
        a.assignedDutyCode,
        a.shift,
        a.sOnTime,
        a.sOnLoc,
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift),
        a.sOffLoc,
        '--',
        'CREW CONTROLLER',
        a.reason || 'OCC Desk Control'
      ]);
    });
  }

  if (specialDuties.length > 0) {
    printWdRows.push(['', '--- SPECIAL DUTY & TEST TRACK ---', '', '', '', '', '', '', '', '', '', '']);
    specialDuties.forEach(a => {
      printWdRows.push([
        'SPEC',
        a.assignedDutyCode,
        a.shift,
        a.sOnTime,
        a.sOnLoc,
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift),
        a.sOffLoc,
        '--',
        'SPECIAL DUTY',
        a.reason || 'Depot Standby / Test Track'
      ]);
    });
  }

  if (trainingDuties.length > 0) {
    printWdRows.push(['', '--- TRAINING & CRT REFRESHER ---', '', '', '', '', '', '', '', '', '', '']);
    trainingDuties.forEach(a => {
      printWdRows.push([
        'TRG',
        a.assignedDutyCode,
        a.shift,
        a.sOnTime,
        a.sOnLoc,
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift),
        a.sOffLoc,
        '--',
        'TRAINING',
        a.reason || 'Training Refresher'
      ]);
    });
  }

  if (lrdDuties.length > 0) {
    printWdRows.push(['', '--- LEARNING ROAD DUTY (LRD) ---', '', '', '', '', '', '', '', '', '', '']);
    lrdDuties.forEach(a => {
      printWdRows.push([
        'LRD',
        'LRD',
        '07:00–15:00',
        '07:00',
        'PYID',
        a.name,
        a.empId,
        '15:00',
        'PYID',
        '--',
        'LRD',
        'Route Learning Refresher'
      ]);
    });
  }

  if (woDuties.length > 0) {
    printWdRows.push(['', '--- WEEKLY OFF (REST) ---', '', '', '', '', '', '', '', '', '', '']);
    woDuties.forEach(a => {
      printWdRows.push([
        'WO',
        'WO',
        'REST',
        '--',
        '--',
        a.name,
        a.empId,
        '--',
        '--',
        '--',
        'WEEK_OFF',
        a.reason || 'Weekly Off'
      ]);
    });
  }

  if (leaveDuties.length > 0) {
    printWdRows.push(['', '--- LEAVES & MATERNITY LEAVE (ML) ---', '', '', '', '', '', '', '', '', '', '']);
    leaveDuties.forEach(a => {
      printWdRows.push([
        'LEAVE',
        a.assignedDutyCode,
        'LEAVE',
        '--',
        '--',
        a.name,
        a.empId,
        '--',
        '--',
        '--',
        a.status,
        a.reason || 'Approved Leave'
      ]);
    });
  }

  const wsPrintWd = XLSX.utils.aoa_to_sheet(printWdRows);

  // Set column widths
  wsPrintWd['!cols'] = [
    { wch: 10 }, // Duty No
    { wch: 18 }, // Duty Link
    { wch: 10 }, // Shift
    { wch: 14 }, // Sign On
    { wch: 16 }, // Sign On Loc
    { wch: 28 }, // Name
    { wch: 12 }, // Emp ID
    { wch: 14 }, // Sign Off
    { wch: 16 }, // Sign Off Loc
    { wch: 10 }, // Train No
    { wch: 16 }, // Status
    { wch: 32 }  // Notes
  ];

  XLSX.utils.book_append_sheet(wb, wsPrintWd, 'Print Wd');

  // 2. Build Summary Sheet
  const summaryRows = [
    ['BMRCL CREW CONTROL - DAILY ROSTER SUMMARY REPORT'],
    ['Generated On', new Date().toLocaleString()],
    ['Target Date', targetDate],
    ['Day Schedule Type', dayType],
    ['Optimization Plan', planTitle],
    ['Overall Quality Score', `${qualityScore} / 100`],
    [''],
    ['Operational Category', 'Count'],
    ['Active Mainline Driving Duties', runningDuties.length],
    ['Crew Controllers (CC Desk)', ccDuties.length],
    ['Special Duty & Test Track', specialDuties.length],
    ['Training & CRT Refresher', trainingDuties.length],
    ['LRD (Learning Road Duty)', lrdDuties.length],
    ['Weekly Off (Rest)', woDuties.length],
    ['Leaves, ML & Book-Off', leaveDuties.length],
    ['Total Active Crew Accounted For', assignments.length]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Export File
  const filename = `BMRCL_Line2_Daily_Roster_${targetDate}_${dayType}.xlsx`;
  XLSX.writeFile(wb, filename);

  return filename;
}
