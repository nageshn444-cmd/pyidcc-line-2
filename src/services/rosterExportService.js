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
  runningDuties: propRunning,
  ccDuties: propCC,
  specialDuties: propSpecial,
  reservePool: propReserve,
  stationStandbyDuties: propSTBK,
  weekOffStaff: propWO,
  leaveStaff: propLeave,
  pinkLine4Staff: propPink,
  trainingStaff: propTraining,
  lrdDuties: propLRD,
  traineeStaff: propTrainee,
  qualityScore = 95
}) {
  const wb = XLSX.utils.book_new();

  // Partition assignments strictly by operational category (use props if passed, otherwise derive)
  const runningDuties = propRunning || assignments.filter(a => 
    a.status === 'ASSIGNED' && 
    !['CC', 'LRD', 'LEAVE', 'MATERNITY_LEAVE', 'WEEK_OFF', 'BOOK_OFF', 'TRAINING', 'CRT', 'PINK_LINE_4', 'JMD_STANDBY'].includes(a.specialTag) &&
    !['ML', 'HPL', 'CL', 'EL', 'WO', 'BOOK_OFF', 'SPECIAL_DUTY', 'TEST_TRACK'].includes(a.assignedDutyCode) &&
    !a.assignedDutyCode?.startsWith('CC') &&
    a.isStationStandby !== true
  ).sort((a, b) => (parseInt(a.dutyNo, 10) || 0) - (parseInt(b.dutyNo, 10) || 0));

  const ccDuties = propCC || assignments.filter(a => a.specialProfile === 'CC' || a.dutyType === 'CC' || a.role?.includes('CC') || a.assignedDutyCode?.startsWith('CC'));
  
  const specialDuties = propSpecial || assignments.filter(a => {
    const sub = (a.assignmentSubType || '').toUpperCase();
    const code = (a.dutyCode || a.assignedDutyCode || '').toUpperCase();
    if (sub === 'WO' || code === 'WO' || a.status === 'WEEK_OFF') return false;
    if (code === 'OR_SPARE' || sub === 'OR SPARE POOL') return false;
    if (a.isStationStandby === true) return false;
    return a.assignedDutyCode === 'SPECIAL_DUTY' || a.assignedDutyCode === 'TEST_TRACK' || a.status === 'SPECIAL_DUTY' || a.status === 'TEST_TRACK' || a.assignmentCategory === 'SPECIAL_AUX_DUTY';
  });

  const reserveDuties = propReserve || assignments.filter(a => {
    const code = (a.dutyCode || a.assignedDutyCode || '').toUpperCase();
    const sub = (a.assignmentSubType || '').toUpperCase();
    return code === 'OR_SPARE' || sub === 'OR SPARE POOL' || a.status === 'RESERVE';
  });

  const stbkDuties = propSTBK || assignments.filter(a => a.isStationStandby === true);

  const woDuties = propWO || assignments.filter(a => a.status === 'WEEK_OFF' || a.assignedDutyCode === 'WO' || a.assignmentSubType === 'WO');

  const leaveDuties = propLeave || assignments.filter(a => 
    ['LEAVE', 'MATERNITY_LEAVE', 'BOOK_OFF'].includes(a.status) || 
    ['ML', 'HPL', 'CL', 'EL', 'MS', 'GHEL', 'BOOK_OFF'].includes(a.assignedDutyCode) ||
    ['CL', 'EL', 'HPL', 'ML', 'MS', 'GHEL', 'SPECIAL', 'BOOK_OFF'].includes(a.assignmentSubType)
  );

  const pinkDuties = propPink || assignments.filter(a => a.specialProfile === 'PINK_LINE_4' || a.notes?.includes('Pink Line 4'));

  const trainingDuties = propTraining || assignments.filter(a => a.status === 'TRAINING' || a.status === 'CRT' || ['TRAINING', 'CRT'].includes(a.assignedDutyCode) || ['TRAINING', 'CRT'].includes(a.assignmentSubType));

  const lrdDuties = propLRD || assignments.filter(a => a.status === 'LRD' || a.assignedDutyCode === 'LRD' || a.assignmentSubType === 'LRD');

  const trainees = propTrainee || assignments.filter(a => a.role === 'TRAINEE');

  // 1. Build Print Wd Sheet (Daily Duty Allocation)
  const printWdRows = [
    ['', `BMRCL LINE 2 - PEENYA INDUSTRY DEPOT CREW CONTROL DAILY DUTY ROSTER`, '', '', '', '', '', '', ''],
    ['', `Date: ${targetDate}`, `Day Type: ${dayType}`, `Plan: ${planTitle}`, `Quality Score: ${qualityScore}/100`, '', '', '', ''],
    [''],
    ['Duty No', 'Duty Type / Link', 'Shift', 'Sign On Time', 'Sign On Location', 'Train Operator Name', 'Emp ID', 'Sign Off Time', 'Sign Off Location', 'Train No', 'Status', 'Notes']
  ];

  // 1. Active Mainline Running Duties (Duty #01 to #77/82)
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

  // 2. CC Desk
  if (ccDuties.length > 0) {
    printWdRows.push(['', '--- 🎛️ CREW CONTROLLERS (CC DESK) ---', '', '', '', '', '', '', '', '', '', '']);
    ccDuties.forEach(a => {
      printWdRows.push([
        'CC',
        a.assignedDutyCode || a.role || 'CC',
        a.shift || 'G',
        a.sOnTime || '--',
        a.sOnLoc || 'PYID',
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift) || '--',
        a.sOffLoc || 'PYID',
        '--',
        'CREW CONTROLLER',
        a.reason || 'CC Desk Management'
      ]);
    });
  }

  // 3. Special Duty & Test Track
  if (specialDuties.length > 0) {
    printWdRows.push(['', '--- ⭐ SPECIAL DUTY & TEST TRACK ---', '', '', '', '', '', '', '', '', '', '']);
    specialDuties.forEach(a => {
      printWdRows.push([
        'SPEC',
        a.assignedDutyCode || 'SPECIAL_DUTY',
        a.shift || '--',
        a.sOnTime || '--',
        a.sOnLoc || 'PYID',
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift) || '--',
        a.sOffLoc || 'PYID',
        '--',
        'SPECIAL DUTY',
        a.reason || 'Depot Standby / Test Track'
      ]);
    });
  }

  // 4. Available Reserve Pool
  if (reserveDuties.length > 0) {
    printWdRows.push(['', '--- 🔄 AVAILABLE RESERVE POOL (STANDBY CREW) ---', '', '', '', '', '', '', '', '', '', '']);
    reserveDuties.forEach(a => {
      printWdRows.push([
        'RSV',
        'AVAILABLE RESERVE',
        'STANDBY',
        '--',
        'PYID',
        a.name,
        a.empId,
        '--',
        'PYID',
        '--',
        'AVAILABLE RESERVE',
        a.fixedWo ? `WO: ${a.fixedWo} · Active Reserve` : 'Available Reserve (No driving duty slot)'
      ]);
    });
  }

  // 5. Station Standby (STBK)
  if (stbkDuties.length > 0) {
    printWdRows.push(['', '--- 🏢 STATION STANDBY (STBK) — PRIORITY ALLOCATED ---', '', '', '', '', '', '', '', '', '', '']);
    stbkDuties.forEach(a => {
      printWdRows.push([
        'STBK',
        `${a.stbkStation || a.assignedDutyCode || 'STBK'} (Shift ${a.stbkShift || 'A'})`,
        a.stbkShift === 'B' ? '14:00–21:30' : '06:30–14:00',
        a.stbkShift === 'B' ? '14:00' : '06:30',
        a.stbkStation || 'PYID',
        a.name,
        a.empId,
        a.stbkShift === 'B' ? '21:30' : '14:00',
        a.stbkStation || 'PYID',
        '--',
        'STATION STANDBY',
        `Station: ${a.stbkStation || 'STBK'} · Shift ${a.stbkShift || 'A'}`
      ]);
    });
  }

  // 6. Weekly Off (Rest / WO)
  if (woDuties.length > 0) {
    printWdRows.push(['', '--- 🔒 WEEKLY OFF (REST / WO) ---', '', '', '', '', '', '', '', '', '', '']);
    woDuties.forEach(a => {
      printWdRows.push([
        'WO',
        'WEEK_OFF',
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

  // 7. Leaves, Maternity (ML) & HPL / Book-Off
  if (leaveDuties.length > 0) {
    printWdRows.push(['', '--- 🌸 LEAVES, MATERNITY (ML) & HPL ---', '', '', '', '', '', '', '', '', '', '']);
    leaveDuties.forEach(a => {
      const lp = a.leavePeriod;
      const leaveNote = lp && lp.fromDate ? `${lp.leaveType || 'Leave'}: ${lp.fromDate} → ${lp.toDate} (${lp.durationDays}d)` : (a.reason || 'Approved Leave');
      printWdRows.push([
        'LEAVE',
        a.assignedDutyCode || a.assignmentSubType || 'LEAVE',
        'LEAVE',
        '--',
        '--',
        a.name,
        a.empId,
        '--',
        '--',
        '--',
        a.status || 'LEAVE',
        leaveNote
      ]);
    });
  }

  // 8. Pink Line 4 Staff
  if (pinkDuties.length > 0) {
    printWdRows.push(['', '--- 🌸 PINK LINE 4 STAFF ---', '', '', '', '', '', '', '', '', '', '']);
    pinkDuties.forEach(a => {
      printWdRows.push([
        'PINK',
        'PINK LINE 4',
        '--',
        '--',
        '--',
        a.name,
        a.empId,
        '--',
        '--',
        '--',
        'PINK_LINE_4',
        a.notes || 'Pink Line 4 Dedicated Staff Pool'
      ]);
    });
  }

  // 9. Training & CRT Refresher
  if (trainingDuties.length > 0) {
    printWdRows.push(['', '--- 🎓 TRAINING & CRT REFRESHER ---', '', '', '', '', '', '', '', '', '', '']);
    trainingDuties.forEach(a => {
      printWdRows.push([
        'TRG',
        a.assignedDutyCode || 'TRAINING',
        a.shift || '--',
        a.sOnTime || '--',
        a.sOnLoc || 'PYID',
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift) || '--',
        a.sOffLoc || 'PYID',
        '--',
        'TRAINING',
        a.reason || 'Training Refresher'
      ]);
    });
  }

  // 10. Learning Road Duty (LRD)
  if (lrdDuties.length > 0) {
    printWdRows.push(['', '--- 🧭 LEARNING ROAD DUTY (LRD) ---', '', '', '', '', '', '', '', '', '', '']);
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

  // 11. Trainees
  if (trainees.length > 0) {
    printWdRows.push(['', '--- 👥 JMD TD\'s (CONTRACT TRAINEES) ---', '', '', '', '', '', '', '', '', '', '']);
    trainees.forEach(a => {
      printWdRows.push([
        a.dutyNo || 'TD',
        formatDutyTypeLink(a),
        a.shift || '--',
        a.sOnTime || '--',
        a.sOnLoc || 'PYID',
        a.name,
        a.empId,
        formatTo24HourTime(a.sOffTime, a.sOnTime, a.shift) || '--',
        a.sOffLoc || 'PYID',
        '--',
        'TRAINEE',
        a.mentorName ? `Shadow with ${a.mentorName}` : 'Contract Trainee Shadow'
      ]);
    });
  }

  const wsPrintWd = XLSX.utils.aoa_to_sheet(printWdRows);

  // Set column widths
  wsPrintWd['!cols'] = [
    { wch: 10 }, // Duty No
    { wch: 22 }, // Duty Link
    { wch: 12 }, // Shift
    { wch: 14 }, // Sign On
    { wch: 16 }, // Sign On Loc
    { wch: 28 }, // Name
    { wch: 12 }, // Emp ID
    { wch: 14 }, // Sign Off
    { wch: 16 }, // Sign Off Loc
    { wch: 10 }, // Train No
    { wch: 18 }, // Status
    { wch: 36 }  // Notes
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
    ['1. Active Mainline Driving Duties', runningDuties.length],
    ['2. Crew Controllers (CC Desk)', ccDuties.length],
    ['3. Special Duty & Test Track', specialDuties.length],
    ['4. Available Reserve Pool (Standby)', reserveDuties.length],
    ['5. Station Standby (STBK - 5 Stations)', stbkDuties.length],
    ['6. Weekly Off (Rest / WO)', woDuties.length],
    ['7. Leaves, Maternity (ML) & HPL', leaveDuties.length],
    ['8. 🌸 Pink Line 4 Staff Pool', pinkDuties.length],
    ['9. Training & CRT Refresher', trainingDuties.length],
    ['10. Learning Road Duty (LRD)', lrdDuties.length],
    ['11. Contract Trainees (JMD TD)', trainees.length],
    ['Total Active Crew Accounted For', assignments.length]
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Export File
  const filename = `BMRCL_Line2_Daily_Roster_${targetDate}_${dayType}.xlsx`;
  XLSX.writeFile(wb, filename);

  return filename;
}
