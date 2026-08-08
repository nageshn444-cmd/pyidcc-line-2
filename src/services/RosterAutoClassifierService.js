// src/services/RosterAutoClassifierService.js
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, setDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';

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
    const notReporting = [];
    const absents = [];
    const onDuty = [];
    const customRegisters = {};

    // Header Recognition & Dynamic Column Detection Engine
    let headerRowIdx = -1;
    const extraColumnMap = new Map();
    const dynamicExtraHeadersSet = new Set();

    // Standard column keyword checks
    const isStandardHeader = (hdrStr) => {
      const s = String(hdrStr || '').toLowerCase();
      return (
        s.includes('duty') ||
        s.includes('type') ||
        s.includes('depot') ||
        s.includes('sign') ||
        s.includes('s on') ||
        s.includes('s off') ||
        s.includes('name') ||
        s.includes('operator') ||
        s.includes('emp') ||
        s.includes('id') ||
        s.includes('train') ||
        s.includes('rake')
      );
    };

    // Scan first 5 rows to locate header row and dynamic extra columns
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(cell => cell ? String(cell).toLowerCase() : '');
      const hasDuty = rowStr.some(c => c.includes('duty'));
      const hasSign = rowStr.some(c => c.includes('sign') || c.includes('s on') || c.includes('ontime'));
      if (hasDuty || hasSign) {
        headerRowIdx = i;
        row.forEach((cell, cIdx) => {
          if (!cell) return;
          const cellStr = String(cell).trim();
          // Columns A to I (Indices 0 to 8) are main duty columns
          if (cIdx < 9 && !isStandardHeader(cellStr)) {
            extraColumnMap.set(cIdx, cellStr);
            dynamicExtraHeadersSet.add(cellStr);
          }
        });
        break;
      }
    }

    const startDataRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 2;
    let activeSectionTag = 'GENERAL';

    rows.forEach((row, idx) => {
      if (idx < startDataRowIdx) return; // Skip title & header rows

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

        // Extract values for dynamic extra columns
        const extraColumns = {};
        extraColumnMap.forEach((headerName, colIdx) => {
          if (row[colIdx] !== undefined && row[colIdx] !== null && String(row[colIdx]).trim() !== '') {
            extraColumns[headerName] = String(row[colIdx]).trim();
          }
        });

        // Determine if status is NOT REPORTING or ABSENT from raw fields
        let initialStatus = 'PENDING';
        const combinedRowStr = (String(empName) + ' ' + String(empId) + ' ' + String(trainId)).toUpperCase();
        if (combinedRowStr.includes('NOT REPORTING') || combinedRowStr.includes(' NR ') || combinedRowStr.endsWith(' NR')) {
          initialStatus = 'NOT_REPORTING';
          if (empId && empId !== '--') notReporting.push({ name: empName, empNo: empId, dutyId: String(dutyNo) });
        } else if (combinedRowStr.includes('ABSENT') || combinedRowStr.includes(' AB ') || combinedRowStr.endsWith(' AB')) {
          initialStatus = 'ABSENT';
          if (empId && empId !== '--') absents.push({ name: empName, empNo: empId, dutyId: String(dutyNo) });
        }

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
          status: initialStatus,
          extraColumns
        });
      }

      // ── B. RIGHT-SIDE AUXILIARY REGISTERS (Strict Vertical Block Scan from Column J / Index 9) ──
      const colJ = row[9];  // Category / Marker (CC1, CRT, OR, WEEKLY OFF, CL, EL, GHEL, PUTH STBK, BMRTI, LRD, PME, REL, NR, AB)
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

        // ── STRICT ROUTING PRIORITY (Check REL & NR/AB first before general leave checks) ──
        if (combinedContext.includes('NR') || combinedContext.includes('NOT REPORTING')) {
          if (!notReporting.some(e => e.empNo === empNo)) {
            notReporting.push({ name, empNo, type: 'NOT_REPORTING' });
          }
        } else if (combinedContext.includes('AB') || combinedContext.includes('ABSENT')) {
          if (!absents.some(e => e.empNo === empNo)) {
            absents.push({ name, empNo, type: 'ABSENT' });
          }
        } else if (combinedContext.includes('REL') || activeSectionTag.toUpperCase() === 'REL') {
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
        } else if (combinedContext.includes('WEEKLY OFF') || combinedContext.includes('WO')) {
          if (!weeklyOffs.some(e => e.empNo === empNo)) {
            weeklyOffs.push({ name, empNo });
          }
        } else if (combinedContext.includes('OD') || activeSectionTag.toUpperCase() === 'OD') {
          if (!onDuty.some(e => e.empNo === empNo)) {
            onDuty.push({ name, empNo, info: colK || 'OD', remark: subTag || 'On Duty' });
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
        } else if (activeSectionTag && activeSectionTag !== 'GENERAL') {
          if (!customRegisters[activeSectionTag]) {
            customRegisters[activeSectionTag] = [];
          }
          if (!customRegisters[activeSectionTag].some(e => e.empNo === empNo)) {
            customRegisters[activeSectionTag].push({ name, empNo, tag: activeSectionTag, info: colK || subTag || '' });
          }
        }
      }
    });

    const parsedDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const dateStr = validDate.toISOString().split('T')[0];
    const dynamicExtraHeaders = Array.from(dynamicExtraHeadersSet);

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
      notReporting,
      absents,
      onDuty,
      customRegisters,
      dynamicExtraHeaders,
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
        'LRD': routeLearning,
        'NOT REPORTING (NR)': notReporting,
        'ABSENT (AB)': absents,
        'ON DUTY (OD)': onDuty
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
      notReporting: classifiedData.notReporting || [],
      absents: classifiedData.absents || [],
      onDuty: classifiedData.onDuty || [],
      customRegisters: classifiedData.customRegisters || {},
      dynamicExtraHeaders: classifiedData.dynamicExtraHeaders || [],
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

    try {
      await rosterAutoClassifierService.saveToMonthlyArchive(classifiedData);
    } catch (archiveErr) {
      console.warn("Monthly archive write warning:", archiveErr);
    }

    return {
      dutiesCount: (classifiedData.duties || []).length,
      weeklyOffsCount: (classifiedData.weeklyOffs || []).length,
      leavesCount: (classifiedData.leaves || []).length,
      standbysCount: (classifiedData.standbys || []).length,
      trainingCount: (classifiedData.bmrtiTraining || []).length
    };
  },

  saveToMonthlyArchive: async (classifiedData, user = 'GCC Controller', notes = '') => {
    try {
      const dateStr = classifiedData.dateStr || new Date().toISOString().split('T')[0];
      const monthKey = dateStr.substring(0, 7);
      const dayType = classifiedData.dayType || 'WEEKDAY';

      const archiveRecord = {
        date: dateStr,
        monthKey,
        dayType,
        sheetName: classifiedData.sheetName || 'Roster Sheet',
        confirmedBy: user,
        confirmedNotes: notes,
        confirmedAt: serverTimestamp(),
        dutiesCount: (classifiedData.duties || []).length,
        duties: classifiedData.duties || [],
        consoleData: {
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
          notReporting: classifiedData.notReporting || [],
          absents: classifiedData.absents || [],
          onDuty: classifiedData.onDuty || [],
          customRegisters: classifiedData.customRegisters || {}
        }
      };

      await setDoc(doc(db, 'monthly_roster_archives', monthKey, 'daily_records', dateStr), archiveRecord, { merge: true });

      await setDoc(doc(db, 'monthly_roster_archives', monthKey), {
        monthKey,
        lastUpdatedDate: dateStr,
        lastUpdatedBy: user,
        updatedAt: serverTimestamp()
      }, { merge: true });

      return archiveRecord;
    } catch (err) {
      console.error("Monthly Archive Save Error:", err);
      throw err;
    }
  },

  fetchMonthlyArchiveData: async (monthKey) => {
    try {
      const recordsSnap = await getDocs(collection(db, 'monthly_roster_archives', monthKey, 'daily_records'));
      const list = [];
      recordsSnap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return list;
    } catch (err) {
      console.error("Fetch Monthly Archive Error:", err);
      return [];
    }
  },

  fetchDailyArchiveSnapshot: async (monthKey, dateStr) => {
    try {
      const snap = await getDoc(doc(db, 'monthly_roster_archives', monthKey, 'daily_records', dateStr));
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.error("Fetch Daily Archive Error:", err);
      return null;
    }
  },

  prefetchNextDayRoster: (workbook, currentDate = new Date(), dayType = 'WEEKDAY') => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    return rosterAutoClassifierService.parseWorkbook(workbook, nextDate, dayType);
  }
};
