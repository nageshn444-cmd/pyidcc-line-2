import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, setDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { PRELOADED_DUTIES } from '../data/kmcalc/preloadedDuties';

export const isTimeValue = (val) => {
  if (!val) return false;
  const s = String(val).trim();
  return /^\d{1,2}:\d{2}(\s*-\s*\d{1,2}:\d{2})?$/.test(s) || /^\d+(\.\d+)?$/.test(s) || /^\d{2}-[A-Za-z]{3}$/.test(s);
};

export const formatExcelDate = (val) => {
  if (!val && val !== 0) return '';
  if (typeof val === 'number') {
    if (val > 1000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const day = String(date.getUTCDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
      }
    }
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  if (/^\d{5}$/.test(s)) {
    const num = parseInt(s, 10);
    if (num > 30000 && num < 70000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const day = String(date.getUTCDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
      }
    }
  }
  return s;
};

export const formatExcelTime = (val) => {
  if (!val && val !== 0) return '06:00';
  if (typeof val === 'number') {
    if (val > 1000) {
      return formatExcelDate(val);
    }
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  if (/^\d{5}$/.test(s)) {
    return formatExcelDate(s);
  }
  return s;
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

export const isActiveTrainDuty = (dutyVal) => {
  if (dutyVal === undefined || dutyVal === null) return false;
  const s = String(dutyVal).trim();
  return /^\d{1,2}$/.test(s) && parseInt(s, 10) > 0;
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
    const coOperators = [];
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
    let currentSectionBanner = '';
    let maxActiveDutyNumSoFar = 0;
    let inSecondaryBlock = false;

    rows.forEach((row, idx) => {
      if (idx < startDataRowIdx) return; // Skip title & header rows

      const rawDutyCell = row[0];
      const rawDutyStr = rawDutyCell !== undefined && rawDutyCell !== null ? String(rawDutyCell).trim() : '';

      // Check if this row is a section header banner (e.g. 'CRRC-DTG Train Testing', 'CRRC-DTG Train 440kms Trg')
      if (!rawDutyStr) {
        const candidateBanner = [row[1], row[4], row[8]].find(c => c && String(c).trim() !== '');
        if (candidateBanner) {
          const bannerText = String(candidateBanner).trim();
          const bannerUpper = bannerText.toUpperCase();
          if (bannerUpper.includes('CRRC') || bannerUpper.includes('TRG') || bannerUpper.includes('TRAIN') || bannerUpper.includes('TESTING')) {
            currentSectionBanner = bannerText;
          }
        }
      }

      // ── A. MAIN DUTY EXTRACTION (Columns A to I -> Indices 0 to 8) ──
      const colBText = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
      const isColBNumeric = /^\d+$/.test(colBText);
      const isColBValidDutyType = Boolean(
        colBText &&
        !isColBNumeric &&
        (colBText.length <= 25 || ['TESTING', 'TRAINEER', 'TRAINEE', 'SHORT LOOP', 'STBY RD3', 'OR1', 'OR2', 'PRO1', 'PRO2', 'STBK', 'RD-3', 'TGTP', 'BT DN BE', 'NPRO'].some(k => colBText.toUpperCase().includes(k)))
      );

      // Support special rows where Duty No in Col A is blank, but Col B has a valid duty type (e.g. Testing, Traineer, Trainee on Saturday/Sunday)
      let effectiveDutyStr = rawDutyStr;
      if (!effectiveDutyStr && isColBValidDutyType) {
        effectiveDutyStr = String(maxActiveDutyNumSoFar + 1);
      }

      if (effectiveDutyStr !== '') {
        const rawDutyUpper = effectiveDutyStr.toUpperCase();
        // 100% Flexible Excel Column B extraction (matches exact uploaded sheet):
        const dutyType = colBText;

        const signOnTime = formatExcelTime(row[2]);
        const signOnPlace = String(row[3] || '').trim();
        const rawName = row[4];
        const rawEmpId = row[5];
        const signOffTime = formatExcelTime(row[6]);
        const signOffPlace = String(row[7] || '').trim();
        const trainId = row[8] || (colBText && colBText.length < 15 ? colBText : 'UNASSIGNED');

        const empName = rawName !== undefined && rawName !== null && String(rawName).trim() !== '' ? String(rawName).trim() : 'UNASSIGNED';
        const empId = rawEmpId !== undefined && rawEmpId !== null && String(rawEmpId).trim() !== '' ? String(rawEmpId).trim() : '--';

        const isNumeric = isActiveTrainDuty(effectiveDutyStr);
        const numVal = isNumeric ? parseInt(effectiveDutyStr, 10) : 0;

        // Transition to secondary co-operator block occurs ONLY when sequential duty numbers jump backwards (e.g. 76 -> 04, 12, 15)
        if (isNumeric) {
          if (numVal <= maxActiveDutyNumSoFar && maxActiveDutyNumSoFar > 0) {
            inSecondaryBlock = true;
          }
        }

        // 1. ACTIVE PRIMARY NUMERIC TRAIN DUTY
        if (isNumeric && !inSecondaryBlock) {
          maxActiveDutyNumSoFar = numVal;

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
            if (empId && empId !== '--') notReporting.push({ name: empName, empNo: empId, dutyId: String(effectiveDutyStr) });
          } else if (combinedRowStr.includes('ABSENT') || combinedRowStr.includes(' AB ') || combinedRowStr.endsWith(' AB')) {
            initialStatus = 'ABSENT';
            if (empId && empId !== '--') absents.push({ name: empName, empNo: empId, dutyId: String(effectiveDutyStr) });
          }

          duties.push({
            dutyId: String(effectiveDutyStr).padStart(2, '0'),
            dutyType: String(dutyType).trim(),
            signOnTime,
            signOnLocation: signOnPlace || 'PYID',
            empName,
            empId,
            signOffTime,
            signOffLocation: signOffPlace || 'PYID',
            trainId: String(trainId).trim(),
            scheduleType: dayType,
            status: initialStatus,
            extraColumns
          });
        } else if (isNumeric && inSecondaryBlock) {
          // 2. SECONDARY CO-OPERATOR / TRAINEE DRIVER BLOCK BELOW ACTIVE DUTIES
          // Bypass unassigned entries entirely; only deploy assigned co-operators to Roster Desk Console
          const hasValidOperator = isValidOperatorName(empName) && empId && empId !== '--' && empId !== 'UNASSIGNED';
          if (hasValidOperator) {
            coOperators.push({
              dutyId: String(effectiveDutyStr || rawDutyStr).trim().padStart(2, '0'),
              empNo: empId,
              name: empName,
              trainId: String(trainId).trim(),
              time: `${signOnTime} - ${signOffTime}`,
              signOn: signOnTime,
              signOff: signOffTime,
              role: 'Co-Operator / Trainee Driver'
            });
          }
          // Note: Unassigned rows in secondary block are intentionally bypassed/filtered out
        } else if (isValidOperatorName(empName) || (empId && empId !== '--' && empId !== 'UNASSIGNED')) {
          // 3. DESK DUTY / AUXILIARY REGISTER IN MAIN COLUMN
          const deskEntry = {
            time: `${signOnTime} - ${signOffTime}`,
            name: empName,
            empNo: empId,
            station: rawDutyUpper.includes('STBK') ? 'PUTH' : ''
          };

          if (rawDutyUpper.includes('NR') || rawDutyUpper.includes('NOT REPORTING')) {
            if (!notReporting.some(e => e.empNo === empId)) notReporting.push({ name: empName, empNo: empId, type: 'NOT_REPORTING' });
          } else if (rawDutyUpper.includes('AB') || rawDutyUpper.includes('ABSENT')) {
            if (!absents.some(e => e.empNo === empId)) absents.push({ name: empName, empNo: empId, type: 'ABSENT' });
          } else if (rawDutyUpper.includes('REL') || rawDutyUpper === 'REL') {
            if (!relievedOperators.some(e => e.empNo === empId)) relievedOperators.push({ ...deskEntry, time: signOnTime });
          } else if (rawDutyUpper.startsWith('CC') || rawDutyUpper.includes('CREW CONTROLLER') || rawDutyUpper.includes('PICKUP')) {
            if (!controlDesks.some(e => e.empNo === empId)) controlDesks.push({ ...deskEntry, code: rawDutyUpper });
          } else if (rawDutyUpper.includes('LRD') || rawDutyUpper.includes('ROUTE LEARNING')) {
            if (!routeLearning.some(e => e.empNo === empId)) routeLearning.push(deskEntry);
          } else if (rawDutyUpper.includes('PME')) {
            if (!pmeOperators.some(e => e.empNo === empId)) pmeOperators.push(deskEntry);
          } else if (rawDutyUpper.includes('CRT')) {
            if (!crtTraining.some(e => e.empNo === empId)) crtTraining.push(deskEntry);
          } else if (rawDutyUpper.includes('OR') || rawDutyUpper.includes('STANDBY') || rawDutyUpper.startsWith('SB')) {
            if (!standbys.some(e => e.empNo === empId)) standbys.push({ ...deskEntry, code: rawDutyUpper });
          } else if (rawDutyUpper.includes('WEEKLY OFF') || rawDutyUpper.includes('WO') || rawDutyUpper.includes('REST')) {
            if (!weeklyOffs.some(e => e.empNo === empId)) weeklyOffs.push({ name: empName, empNo: empId });
          } else if (rawDutyUpper.includes('OD') || rawDutyUpper.includes('ON DUTY')) {
            if (!onDuty.some(e => e.empNo === empId)) onDuty.push({ name: empName, empNo: empId, info: signOnTime, remark: rawDutyUpper });
          } else if (rawDutyUpper.includes('CL') || rawDutyUpper.includes('EL') || rawDutyUpper.includes('GHEL') || rawDutyUpper.includes('HPL') || rawDutyUpper.includes('ML') || rawDutyUpper.includes('PL') || rawDutyUpper.includes('LEAVE')) {
            const leaveType = rawDutyUpper.includes('EL') ? 'EL' : rawDutyUpper.includes('GHEL') ? 'GHEL' : rawDutyUpper.includes('HPL') ? 'HPL' : rawDutyUpper.includes('ML') ? 'ML' : rawDutyUpper.includes('PL') ? 'PL' : 'CL';
            if (!leaves.some(e => e.empNo === empId)) leaves.push({ name: empName, empNo: empId, type: leaveType, from: signOnTime });
          } else if (rawDutyUpper.includes('STBK') || rawDutyUpper.includes('STEPBACK')) {
            if (!outstationStepbacks.some(e => e.empNo === empId)) outstationStepbacks.push({ ...deskEntry, station: 'PUTH' });
          } else if (rawDutyUpper.includes('BMRTI') || rawDutyUpper.includes('TRG') || rawDutyUpper.includes('CRRC VIVA') || rawDutyUpper.includes('BRMM') || rawDutyUpper.includes('TRNR')) {
            if (!bmrtiTraining.some(e => e.empNo === empId)) bmrtiTraining.push({ ...deskEntry, date: signOnTime });
          } else if (rawDutyUpper && rawDutyUpper !== 'GENERAL') {
            if (!customRegisters[rawDutyUpper]) customRegisters[rawDutyUpper] = [];
            if (!customRegisters[rawDutyUpper].some(e => e.empNo === empId)) {
              customRegisters[rawDutyUpper].push({ name: empName, empNo: empId, tag: rawDutyUpper, info: signOnTime });
            }
          }
        }
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
            relievedOperators.push({ ...entry, time: timeFrom || formatExcelTime(colK) });
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
            weeklyOffs.push({ name, empNo, date: formatExcelDate(colK) });
          }
        } else if (combinedContext.includes('OD') || activeSectionTag.toUpperCase() === 'OD') {
          if (!onDuty.some(e => e.empNo === empNo)) {
            onDuty.push({ name, empNo, info: formatExcelDate(colK) || 'OD', remark: subTag || 'On Duty' });
          }
        } else if (combinedContext.includes('CL') || combinedContext.includes('EL') || combinedContext.includes('GHEL') || combinedContext.includes('HPL') || combinedContext.includes('ML') || combinedContext.includes('PL') || combinedContext.includes('LEAVE')) {
          const leaveType = combinedContext.includes('EL') ? 'EL' : combinedContext.includes('GHEL') ? 'GHEL' : combinedContext.includes('HPL') ? 'HPL' : combinedContext.includes('ML') ? 'ML' : combinedContext.includes('PL') ? 'PL' : 'CL';
          if (!leaves.some(e => e.empNo === empNo)) {
            leaves.push({ name, empNo, type: leaveType, from: formatExcelDate(colK) || '', dateCode: formatExcelDate(colK) || '' });
          }
        } else if (combinedContext.includes('STBK')) {
          if (!outstationStepbacks.some(e => e.empNo === empNo)) {
            outstationStepbacks.push({ ...entry, station: activeSectionTag });
          }
        } else if (combinedContext.includes('BMRTI') || combinedContext.includes('TRG') || combinedContext.includes('CRRC VIVA') || combinedContext.includes('BRMM') || combinedContext.includes('TRNR')) {
          if (!bmrtiTraining.some(e => e.empNo === empNo)) {
            bmrtiTraining.push({ ...entry, date: formatExcelDate(colK) || '' });
          }
        } else if (activeSectionTag && activeSectionTag !== 'GENERAL') {
          if (!customRegisters[activeSectionTag]) {
            customRegisters[activeSectionTag] = [];
          }
          if (!customRegisters[activeSectionTag].some(e => e.empNo === empNo)) {
            customRegisters[activeSectionTag].push({ name, empNo, tag: activeSectionTag, info: formatExcelDate(colK) || subTag || '' });
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
      coOperators,
      customRegisters,
      dynamicExtraHeaders,
      dynamicColumns: {
        'CREW CONTROLLERS': controlDesks,
        'CO-OPERATORS & TRAINEES': coOperators,
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
      coOperators: classifiedData.coOperators || [],
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
      coOperatorsCount: (classifiedData.coOperators || []).length,
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
          coOperators: classifiedData.coOperators || [],
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
