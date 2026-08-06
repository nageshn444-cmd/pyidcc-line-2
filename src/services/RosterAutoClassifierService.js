// src/services/RosterAutoClassifierService.js
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const isTimeValue = (val) => {
  if (!val) return false;
  const s = String(val).trim();
  return /^\d{1,2}:\d{2}(\s*-\s*\d{1,2}:\d{2})?$/.test(s) || /^\d+(\.\d+)?$/.test(s) || /^\d{2}-[A-Za-z]{3}$/.test(s);
};

export const formatExcelTime = (val) => {
  if (!val) return '06:00';
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return String(val).trim();
};

export const isValidOperatorName = (name) => {
  if (!name) return false;
  const s = String(name).trim().toUpperCase();
  return (
    s !== '' &&
    s !== '--' &&
    s !== 'UNASSIGNED' &&
    !isTimeValue(s) &&
    !/^\d+$/.test(s) &&
    !['LEAVE', 'CL', 'EL', 'GHEL', 'HPL', 'ML', 'PL', 'WEEKLY OFF', 'WO', 'BMRTI', 'CRT', 'STBK', 'OR', 'PME', 'LRD', 'CC1', 'CC2', 'CC3', 'BRMM', 'CRRC VIVA', 'REL'].includes(s)
  );
};

export const rosterAutoClassifierService = {
  parseWorkbook: (workbook, targetDate = new Date(), dayType = 'WEEKDAY') => {
    // 1. Dynamic Sheet Selector for Current Date
    const currentDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
    const validCurrentDate = isNaN(currentDate.getTime()) ? new Date() : currentDate;
    const currentDayNum = validCurrentDate.getDate();
    const currentMonthNum = validCurrentDate.getMonth() + 1;
    
    const targetPatterns = [
      `${currentDayNum}.${currentMonthNum}`,
      `${currentDayNum} July`,
      `${String(currentDayNum).padStart(2, '0')} July`,
      ` ${currentDayNum} `,
      `-${currentDayNum}-`
    ];

    let selectedSheetName = workbook.SheetNames[0];
    for (const sheetName of workbook.SheetNames) {
      const upperName = sheetName.toUpperCase();
      if (targetPatterns.some(p => upperName.includes(p.toUpperCase()))) {
        selectedSheetName = sheetName;
        break;
      }
    }

    const worksheet = workbook.Sheets[selectedSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const duties = [];
    const controlDesks = [];
    const weeklyOffs = [];
    const leaves = [];
    const standbys = [];
    const outstationStepbacks = [];
    const crtTraining = [];
    const bmrtiTraining = [];
    const relievedOperators = [];
    const pmeOperators = [];
    const routeLearning = [];

    let activeSectionTag = 'GENERAL';

    rows.forEach((row, idx) => {
      if (idx < 2) return; // Skip title / header rows

      // ── A. MAIN DUTY EXTRACTION (Columns A to I -> Indices 0 to 8) ──
      const dutyNo = row[0];
      if (dutyNo !== undefined && dutyNo !== null && String(dutyNo).trim() !== '') {
        const dutyType = row[1] || 'PYID';
        const signOnTime = formatExcelTime(row[2]);
        const signOnPlace = String(row[3] || 'PYID').trim();
        const rawName = row[4];
        const rawEmpId = row[5];
        const signOffTime = formatExcelTime(row[6]);
        const signOffPlace = String(row[7] || 'PYID').trim();
        const trainId = row[8] || row[1] || 'UNASSIGNED';

        const empName = rawName !== undefined && rawName !== null && String(rawName).trim() !== '' ? String(rawName).trim() : 'UNASSIGNED';
        const empId = rawEmpId !== undefined && rawEmpId !== null && String(rawEmpId).trim() !== '' ? String(rawEmpId).trim() : '--';

        duties.push({
          dutyId: String(dutyNo).trim().padStart(2, '0'),
          dutyType: String(dutyType).trim(),
          signOnTime,
          signOnLocation: signOnPlace,
          empName,
          empId,
          signOffTime,
          signOffLocation: signOffPlace,
          trainId: String(trainId).trim(),
          scheduleType: dayType,
          status: 'PENDING'
        });
      }

      // ── B. RIGHT-SIDE AUXILIARY REGISTERS (Strict Vertical Block Scan from Column J / Index 9) ──
      const colJ = row[9];  // Category / Marker (CC1, CRT, OR, WEEKLY OFF, CL, EL, GHEL, PUTH STBK, BMRTI, LRD, PME, REL)
      const colK = row[10]; // From Time / Date
      const colL = row[11]; // Operator Name
      const colM = row[12]; // Emp Id
      const colN = row[13]; // To Time / Date
      const colO = row[14]; // Tag / Sub-category

      if (colJ !== undefined && colJ !== null && String(colJ).trim() !== '') {
        const marker = String(colJ).trim().toUpperCase();
        if (!isTimeValue(marker)) {
          activeSectionTag = marker;
        }
      }

      const rawNameRight = colL;
      const rawEmpIdRight = colM;

      if (isValidOperatorName(rawNameRight) && rawEmpIdRight !== undefined && rawEmpIdRight !== null) {
        const name = String(rawNameRight).trim();
        const empNo = String(rawEmpIdRight).trim();
        const timeFrom = formatExcelTime(colK);
        const timeTo = formatExcelTime(colN);
        const subTag = colO ? String(colO).trim().toUpperCase() : '';
        const combinedContext = (activeSectionTag + ' ' + subTag).toUpperCase();

        const entry = {
          time: `${timeFrom} - ${timeTo}`,
          name,
          empNo,
          station: combinedContext.includes('STBK') ? activeSectionTag : ''
        };

        // ── STRICT ROUTING PRIORITY (Check REL first before general leave checks) ──
        if (combinedContext.includes('REL') || activeSectionTag.toUpperCase() === 'REL') {
          if (!relievedOperators.some(e => e.empNo === empNo)) {
            relievedOperators.push({ ...entry, time: colK || timeFrom });
          }
        } else if (combinedContext.includes('CC') || combinedContext.includes('PICKUP')) {
          if (!controlDesks.some(e => e.empNo === empNo)) {
            controlDesks.push({ ...entry, code: subTag || activeSectionTag });
          }
        } else if (combinedContext.includes('LRD') || combinedContext.includes('ROUTE LEARNING')) {
          if (!routeLearning.some(e => e.empNo === empNo)) {
            routeLearning.push(entry);
          }
        } else if (combinedContext.includes('PME')) {
          if (!pmeOperators.some(e => e.empNo === empNo)) {
            pmeOperators.push(entry);
          }
        } else if (combinedContext.includes('CRT')) {
          if (!crtTraining.some(e => e.empNo === empNo)) {
            crtTraining.push(entry);
          }
        } else if (combinedContext.includes('OR') || combinedContext.includes('STANDBY')) {
          if (!standbys.some(e => e.empNo === empNo)) {
            standbys.push({ ...entry, code: subTag || 'OR' });
          }
        } else if (combinedContext.includes('WEEKLY OFF') || combinedContext.includes('WO') || combinedContext.includes('OD')) {
          if (!weeklyOffs.some(e => e.empNo === empNo)) {
            weeklyOffs.push({ name, empNo });
          }
        } else if (combinedContext.includes('CL') || combinedContext.includes('EL') || combinedContext.includes('GHEL') || combinedContext.includes('HPL') || combinedContext.includes('ML') || combinedContext.includes('PL') || combinedContext.includes('LEAVE')) {
          const leaveType = combinedContext.includes('EL') ? 'EL' : combinedContext.includes('GHEL') ? 'GHEL' : combinedContext.includes('HPL') ? 'HPL' : combinedContext.includes('ML') ? 'ML' : combinedContext.includes('PL') ? 'PL' : 'CL';
          if (!leaves.some(e => e.empNo === empNo)) {
            leaves.push({ name, empNo, type: leaveType, from: colK || '' });
          }
        } else if (combinedContext.includes('STBK')) {
          if (!outstationStepbacks.some(e => e.empNo === empNo)) {
            outstationStepbacks.push({ ...entry, station: activeSectionTag });
          }
        } else if (combinedContext.includes('BMRTI') || combinedContext.includes('TRG') || combinedContext.includes('CRRC VIVA') || combinedContext.includes('BRMM') || combinedContext.includes('TRNR')) {
          if (!bmrtiTraining.some(e => e.empNo === empNo)) {
            bmrtiTraining.push({ ...entry, date: colK || '' });
          }
        }
      }
    });

    const parsedDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const dateStr = validDate.toISOString().split('T')[0];

    return {
      sheetName: selectedSheetName,
      dateStr,
      dayType,
      duties,
      controlDesks,
      weeklyOffs,
      leaves,
      standbys,
      outstationStepbacks,
      crtTraining,
      bmrtiTraining,
      relievedOperators,
      pmeOperators,
      routeLearning,
      dynamicColumns: {
        'CREW CONTROLLERS': controlDesks,
        'LEAVES & REST': leaves,
        'STANDBY OPERATORS': standbys,
        'STEP-BACK STBK': outstationStepbacks,
        'CRT TRAINING': crtTraining,
        'BMRTI TRAINING': bmrtiTraining,
        'WEEKLY OFF': weeklyOffs,
        'REL': relievedOperators,
        'PME': pmeOperators,
        'LRD': routeLearning
      }
    };
  },

  autoDeployClassifiedData: async (classifiedData) => {
    const dateStr = classifiedData.dateStr || new Date().toISOString().split('T')[0];
    const dayType = classifiedData.dayType || 'WEEKDAY';

    const consoleSnapshot = {
      date: dateStr,
      dayType,
      sheetName: classifiedData.sheetName || 'Roster Sheet',
      controlDesks: classifiedData.controlDesks || [],
      leaves: classifiedData.leaves || [],
      standbys: classifiedData.standbys || [],
      outstationStepbacks: classifiedData.outstationStepbacks || [],
      crtTraining: classifiedData.crtTraining || [],
      bmrtiTraining: classifiedData.bmrtiTraining || [],
      weeklyOffs: classifiedData.weeklyOffs || [],
      relievedOperators: classifiedData.relievedOperators || [],
      pmeOperators: classifiedData.pmeOperators || [],
      routeLearning: classifiedData.routeLearning || [],
      isExplicitlyCleared: false,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, 'dispatch_excel_cache', dateStr), consoleSnapshot, { merge: true });
    await setDoc(doc(db, 'dispatch_excel_cache', 'current'), consoleSnapshot, { merge: true });
    await setDoc(doc(db, 'roster_desk_console', 'current'), consoleSnapshot, { merge: true });
    await setDoc(doc(db, 'roster_desk_console', 'latest'), consoleSnapshot, { merge: true });

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pyidcc_roster_desk_console_cache', JSON.stringify(consoleSnapshot));
      }
    } catch (e) {
      console.warn("LocalStorage cache error:", e);
    }

    for (const d of (classifiedData.duties || [])) {
      if (!d.dutyId) continue;
      const docId = `gcc_deploy_${dayType.toLowerCase()}_duty_${d.dutyId}`;
      await setDoc(doc(db, 'crew_daily_deployment', docId), {
        ...d,
        scheduleType: dayType,
        autoDeployed: true,
        isLocked: true,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    }

    return {
      dutiesCount: (classifiedData.duties || []).length,
      weeklyOffsCount: (classifiedData.weeklyOffs || []).length,
      leavesCount: (classifiedData.leaves || []).length,
      standbysCount: (classifiedData.standbys || []).length,
      trainingCount: (classifiedData.bmrtiTraining || []).length
    };
  },

  prefetchNextDayRoster: (workbook, currentDate = new Date(), dayType = 'WEEKDAY') => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    return rosterAutoClassifierService.parseWorkbook(workbook, nextDate, dayType);
  }
};
