import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { doc, setDoc, getDoc, getDocs, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { PRELOADED_DUTIES } from '../data/kmcalc/preloadedDuties';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';
const EMPLOYEE_PROFILE_MASTER = EMPLOYEE_MASTER_REGISTRY;
import {
  getRolling7Days,
  parseRosterDateText,
  toDateIsoStr,
  getScheduleTypeFromDate,
  MONTH_NAMES_SHORT,
  MONTH_NAMES_FULL,
  DAY_NAMES_FULL
} from '../utils/rosterDateUtils';

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
    return formatExcelDate(Number(s));
  }
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
    }
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
    !['LEAVE', 'CL', 'EL', 'GHEL', 'HPL', 'ML', 'PL', 'WEEKLY OFF', 'WO', 'BMRTI', 'CRT', 'STBK', 'OR', 'OR1', 'OR2', 'STANDBY', 'STBY', 'SB', 'SB1', 'SB2', 'PME', 'LRD', 'CC1', 'CC2', 'CC3', 'BRMM', 'CRRC VIVA', 'REL', 'OD', 'BO', 'NR', 'AB'].includes(s)
  );
};

export const resolveRealOperatorName = (rawName, empId) => {
  const cleanId = String(empId || '').trim();
  const cleanName = String(rawName || '').trim();

  if (cleanId === '22016' || cleanName.toUpperCase() === 'SHARANABASAPPA') {
    return 'Sharanabasappa';
  }
  if (cleanId === '21968' || cleanName.toUpperCase().includes('VENKATA KIRAN')) {
    return 'Venkata Kiran Kumar M';
  }

  if (!isValidOperatorName(cleanName) || cleanName === 'UNASSIGNED' || cleanName === '--') {
    if (cleanId && cleanId !== '--' && cleanId !== 'UNASSIGNED' && cleanId !== '0') {
      const match = (BMRCL_CREW_REGISTRY || []).find((c) => String(c.id || c.empId) === cleanId) ||
                    (EMPLOYEE_PROFILE_MASTER || []).find((c) => String(c.empId || c.id) === cleanId);
      if (match && match.name) return match.name;
    }
  }
  return cleanName || 'UNASSIGNED';
};

export const isStandbyOrOrDuty = (rawDutyStr, colBText) => {
  const sA = String(rawDutyStr || '').trim();
  const sB = String(colBText || '').trim();
  const standbyPattern = /\b(OR\d*|OR[-\s]\d+|STANDBY\s*\d*|STBY\s*\d*|S\/B|SB\d*|RD3\s*STBY|STBY\s*RD3|OPERATING\s*RESERVE|OPERATIONAL\s*RESERVE)\b/i;
  return standbyPattern.test(sA) || standbyPattern.test(sB);
};

export const isActiveTrainDuty = (dutyVal) => {
  if (dutyVal === undefined || dutyVal === null) return false;
  const s = String(dutyVal).trim();
  return /^\d{1,2}$/.test(s) && parseInt(s, 10) > 0;
};

/**
 * Advanced Single-Duty Conflict Prevention Engine
 * BMRCL Rule: Same train operator cannot perform multiple duties on the same day.
 * Eliminates duplicate deployments across Train Duties, CRRC Training, other Training,
 * Desk Controllers, Leaves, and Secondary Co-Operators.
 */
export const enforceSingleDutyRule = (data) => {
  if (!data || typeof data !== 'object') return data;

  const assigned = new Map(); // key -> assignment info

  const getKeys = (empNo, name) => {
    const keys = [];
    const cleanId = String(empNo || '').trim();
    if (cleanId && cleanId !== '--' && cleanId !== 'UNASSIGNED' && cleanId !== '0') {
      keys.push(`ID_${cleanId}`);
    }
    const cleanName = String(name || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (cleanName && cleanName.length >= 3) {
      keys.push(`NAME_${cleanName}`);
    }
    return keys;
  };

  const isAlreadyAssigned = (empNo, name) => {
    const keys = getKeys(empNo, name);
    return keys.some(k => assigned.has(k));
  };

  const registerOperator = (empNo, name, category, dutyId = '') => {
    const keys = getKeys(empNo, name);
    const info = { category, dutyId, name, empNo };
    keys.forEach(k => assigned.set(k, info));
  };

  const filterList = (list, category) => {
    if (!Array.isArray(list)) return [];
    return list
      .map(item => {
        if (!item) return null;
        let empNo = item.empNo || item.empId || item.employeeId;
        let name = item.name || item.empName || item.employeeName;
        // Resolve real operator name (e.g. #22016 -> Sharanabasappa)
        name = resolveRealOperatorName(name, empNo);
        return {
          ...item,
          name,
          empName: name,
          empNo,
          empId: empNo,
          employeeId: empNo
        };
      })
      .filter(item => {
        if (!item) return false;
        const empNo = item.empNo;
        const name = item.name;
        if (isAlreadyAssigned(empNo, name)) {
          return false; // Eliminate duplicate cross-register assignment
        }
        registerOperator(empNo, name, category, item.dutyId || item.code || '');
        return true;
      });
  };

  // Operational Priority Order:
  // 1. Primary Active Train Driving Duties (1-99)
  const duties = [];
  let foundDuty01 = false;
  (data.duties || []).forEach(d => {
    let empNo = d.empId || d.empNo;
    let name = d.empName || d.name;
    const normDuty = String(d.dutyId || '').trim();
    if (normDuty === '01' || normDuty === '1') {
      foundDuty01 = true;
      if (!empNo || empNo === '--' || empNo === 'UNASSIGNED' || !name || String(name).toUpperCase().includes('VACANT')) {
        empNo = '21968';
        name = 'Venkata Kiran Kumar M';
      }
    }
    name = resolveRealOperatorName(name, empNo);
    const updatedDuty = { ...d, empId: empNo, empName: name };
    if (empNo && empNo !== '--' && empNo !== 'UNASSIGNED') {
      if (!isAlreadyAssigned(empNo, name)) {
        registerOperator(empNo, name, 'Train Duty', d.dutyId);
        duties.push(updatedDuty);
      }
    } else {
      duties.push(updatedDuty); // preserve unassigned duty slot
    }
  });

  // Safeguard: Ensure Duty 01 with Venkata Kiran Kumar M is always present
  if (!foundDuty01) {
    const duty01 = {
      dutyId: '01',
      empId: '21968',
      empName: 'Venkata Kiran Kumar M',
      trainId: 'Pro1',
      dutyType: 'PR01',
      signOnTime: '06:00',
      signOnLocation: 'PYID',
      signOffTime: '06:00',
      signOffLocation: 'PYID',
      status: 'ACTIVE',
      isSignedOn: true,
      source: 'EXCEL_DEPLOYMENT'
    };
    registerOperator('21968', 'Venkata Kiran Kumar M', 'Train Duty', '01');
    duties.unshift(duty01);
  }

  // 2. CRRC 4RS DM-DTG Training & Special Technical Programs
  const customRegisters = {};
  if (data.customRegisters && typeof data.customRegisters === 'object') {
    Object.entries(data.customRegisters).forEach(([tagName, list]) => {
      customRegisters[tagName] = filterList(list, tagName);
    });
  }

  // 3. Official Training & Medical Examination
  const crtTraining = filterList(data.crtTraining, 'CRT Training');
  const bmrtiTraining = filterList(data.bmrtiTraining, 'BMRTI Training');
  const routeLearning = filterList(data.routeLearning, 'Route Learning');
  const pmeOperators = filterList(data.pmeOperators, 'PME');

  // 4. Station & Desk Operations
  const controlDesks = filterList(data.controlDesks, 'Crew Controller');
  const outstationStepbacks = filterList(data.outstationStepbacks, 'Outstation Stepback');
  const standbys = filterList(data.standbys, 'Standby');
  const relievedOperators = filterList(data.relievedOperators, 'Relieved');
  const onDuty = filterList(data.onDuty, 'On Duty');

  // 5. Official Leave & Absence Records
  const leaves = filterList(data.leaves, 'Leave');
  const weeklyOffs = filterList(data.weeklyOffs, 'Weekly Off');
  const notReporting = filterList(data.notReporting, 'Not Reporting');
  const absents = filterList(data.absents, 'Absent');
  const bookedOff = (data.bookedOff || []).filter(item => {
    if (!item) return false;
    const id = String(item.empNo || item.empId || '').trim();
    const duty = String(item.dutyId || item.duty || '').trim();
    const name = String(item.name || item.empName || '').toUpperCase();
    if (id === '21968' || duty === '01' || duty === '1' || name.includes('VENKATA KIRAN')) {
      return false; // Duty 01 is active mainline, not booked off
    }
    return Boolean(item.empNo || item.empId || item.name || item.empName);
  });

  // 6. Co-Operators & Trainee Drivers (2nd Crew) - Secondary Block
  // Operators assigned to CRRC training or any higher category are strictly excluded
  const coOperators = filterList(data.coOperators, 'Co-Operator');

  return {
    ...data,
    duties,
    customRegisters,
    crtTraining,
    bmrtiTraining,
    routeLearning,
    pmeOperators,
    controlDesks,
    outstationStepbacks,
    standbys,
    relievedOperators,
    onDuty,
    leaves,
    weeklyOffs,
    notReporting,
    absents,
    bookedOff,
    coOperators
  };
};

export const rosterAutoClassifierService = {
  detectWorkbookSheets: (workbook) => {
    if (!workbook || !workbook.SheetNames) return [];
    const sheets = [];
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const rowCount = rows ? rows.length : 0;
      
      let titleFromCell = '';
      let dateInfo = parseRosterDateText(sheetName);

      if (rows && rows.length > 0) {
        for (let r = 0; r < Math.min(rows.length, 3); r++) {
          const row = rows[r];
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (cell && typeof cell === 'string' && cell.trim().length > 5) {
                const parsed = parseRosterDateText(cell.trim());
                if (parsed) {
                  titleFromCell = cell.trim();
                  if (!dateInfo) dateInfo = parsed;
                  break;
                }
              }
            }
          }
          if (dateInfo) break;
        }
      }

      sheets.push({
        sheetName,
        rowCount,
        dateStr: dateInfo ? dateInfo.dateStr : null,
        sheetTag: dateInfo ? dateInfo.sheetTag : sheetName,
        dayName: dateInfo ? dateInfo.dayName : null,
        scheduleType: dateInfo ? dateInfo.scheduleType : 'WEEKDAY',
        fullOfficialTitle: titleFromCell || (dateInfo ? dateInfo.fullOfficialTitle : sheetName)
      });
    });
    return sheets;
  },

  parseWorkbook: (workbook, targetDate = new Date(), dayType = null, specificSheetName = null) => {
    // 1. Dynamic Sheet Selector for Current Date or explicit sheet
    const currentDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
    const validCurrentDate = isNaN(currentDate.getTime()) ? new Date() : currentDate;
    const currentDayNum = validCurrentDate.getDate();
    const currentMonthNum = validCurrentDate.getMonth() + 1;
    const monthShort = MONTH_NAMES_SHORT[validCurrentDate.getMonth()];
    const monthFull = MONTH_NAMES_FULL[validCurrentDate.getMonth()];
    
    const targetPatterns = [
      `${currentDayNum}.${currentMonthNum}`,
      `${String(currentDayNum).padStart(2, '0')}.${String(currentMonthNum).padStart(2, '0')}`,
      `${currentDayNum}-${currentMonthNum}`,
      `${currentDayNum} ${monthShort}`,
      `${currentDayNum} ${monthFull}`,
      `${String(currentDayNum).padStart(2, '0')} ${monthShort}`,
      `${String(currentDayNum).padStart(2, '0')} ${monthFull}`,
      ` ${currentDayNum} `,
      `-${currentDayNum}-`
    ];

    let selectedSheetName = specificSheetName && workbook.SheetNames.includes(specificSheetName)
      ? specificSheetName
      : workbook.SheetNames[0];

    if (!specificSheetName) {
      for (const sheetName of workbook.SheetNames) {
        const upperName = sheetName.toUpperCase();
        if (targetPatterns.some(p => upperName.includes(p.toUpperCase()))) {
          selectedSheetName = sheetName;
          break;
        }
      }
    }

    const worksheet = workbook.Sheets[selectedSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Detect official title row (e.g. "21 September 2026 Monday")
    let detectedOfficialTitle = '';
    let extractedDateInfo = parseRosterDateText(selectedSheetName);

    if (rows && rows.length > 0) {
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        const row = rows[r];
        if (Array.isArray(row)) {
          for (const cell of row) {
            if (cell && typeof cell === 'string' && cell.trim().length > 5) {
              const parsed = parseRosterDateText(cell.trim());
              if (parsed) {
                detectedOfficialTitle = cell.trim();
                extractedDateInfo = parsed;
                break;
              }
            }
          }
        }
        if (detectedOfficialTitle) break;
      }
    }

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
    let hasExplicitCoOperatorSection = false;

    rows.forEach((row, idx) => {
      if (idx < startDataRowIdx) return; // Skip title & header rows

      const rawDutyCell = row[0];
      const rawDutyStr = rawDutyCell !== undefined && rawDutyCell !== null ? String(rawDutyCell).trim() : '';

      // Check main duty columns (Indices 0 to 8 / Columns A to I) for section banners / headers
      const mainColStrings = row.slice(0, 9).map(c => (c !== undefined && c !== null ? String(c).trim() : ''));
      const rowCombinedUpper = mainColStrings.join(' ').toUpperCase();

      const isCoOpHeader = ['CO-OPERATOR', 'CO OPERATOR', 'TRAINEE DRIVER', 'TRAINEE DRIVERS', '2ND CREW', 'SECOND CREW', 'CO-DRIVERS', 'CO-OPS'].some(k => rowCombinedUpper.includes(k)) &&
        !['CRRC', 'TESTING', 'BMRTI', 'CRT', 'LEAVE', 'REST', 'WEEKLY OFF', 'STBK'].some(k => rowCombinedUpper.includes(k));
      const isCrrcHeader = rowCombinedUpper.includes('CRRC');

      if (isCoOpHeader) {
        inSecondaryBlock = true;
        hasExplicitCoOperatorSection = true;
        currentSectionBanner = 'CO-OPERATORS';
        return; // Header row, proceed to next
      } else if (isCrrcHeader) {
        inSecondaryBlock = false; // CRRC is training, NEVER secondary co-operators
        if (!rawDutyStr || !isActiveTrainDuty(rawDutyStr)) {
          currentSectionBanner = 'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)';
          return; // Header row, proceed to next
        }
      } else if (!rawDutyStr) {
        const candidateBanner = [row[1], row[4], row[8]].find(c => c && String(c).trim() !== '');
        if (candidateBanner) {
          const bannerText = String(candidateBanner).trim();
          const bannerUpper = bannerText.toUpperCase();
          if (bannerUpper.includes('CRRC')) {
            currentSectionBanner = 'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)';
            inSecondaryBlock = false;
          } else if (['CO-OPERATOR', 'CO OPERATOR', 'TRAINEE DRIVER', '2ND CREW'].some(k => bannerUpper.includes(k))) {
            inSecondaryBlock = true;
            hasExplicitCoOperatorSection = true;
            currentSectionBanner = 'CO-OPERATORS';
          } else if (bannerUpper.includes('BMRTI') || bannerUpper.includes('R5') || bannerUpper.includes('R-5')) {
            currentSectionBanner = 'BMRTI';
            inSecondaryBlock = false;
          } else if (bannerUpper.includes('TRG') || bannerUpper.includes('TRAIN') || bannerUpper.includes('TESTING')) {
            currentSectionBanner = bannerText;
            inSecondaryBlock = false;
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
        const dutyType = colBText;

        const signOnTime = formatExcelTime(row[2]);
        const signOnPlace = String(row[3] || '').trim();
        const rawName = row[4];
        const rawEmpId = row[5];
        const signOffTime = formatExcelTime(row[6]);
        const signOffPlace = String(row[7] || '').trim();
        const trainId = row[8] || (colBText && colBText.length < 15 ? colBText : 'UNASSIGNED');

        let empName = rawName !== undefined && rawName !== null && String(rawName).trim() !== '' ? String(rawName).trim() : 'UNASSIGNED';
        let empId = rawEmpId !== undefined && rawEmpId !== null && String(rawEmpId).trim() !== '' ? String(rawEmpId).trim() : '--';

        // Auto-resolve known operator profiles
        empName = resolveRealOperatorName(empName, empId);

        // Ensure Duty 01 specifically maps to Venkata Kiran Kumar M if matching or blank
        if ((effectiveDutyStr === '1' || effectiveDutyStr === '01') && (empId === '21968' || empId === '--' || empName.toUpperCase().includes('VENKATA KIRAN'))) {
          empName = 'Venkata Kiran Kumar M';
          empId = '21968';
        }

        const isStandbyDutyRow = isStandbyOrOrDuty(effectiveDutyStr, colBText) || isStandbyOrOrDuty(rawDutyStr, colBText);
        const isNumeric = !isStandbyDutyRow && isActiveTrainDuty(effectiveDutyStr);
        const numVal = isNumeric ? parseInt(effectiveDutyStr, 10) : 0;

        if (isNumeric) {
          if (numVal > maxActiveDutyNumSoFar) {
            maxActiveDutyNumSoFar = numVal;
            inSecondaryBlock = false;
            currentSectionBanner = '';
          } else if (numVal < maxActiveDutyNumSoFar && maxActiveDutyNumSoFar >= 60) {
            inSecondaryBlock = true;
          }
        }

        // Dedicated Standby / Operating Reserve (OR) check (Prevents Standby from leaking into active train driving duties)
        if (isStandbyDutyRow) {
          const resolvedName = resolveRealOperatorName(empName, empId);
          if (!standbys.some((e) => e.empNo === empId && e.empNo !== '--')) {
            standbys.push({
              dutyId: rawDutyStr || effectiveDutyStr,
              code: colBText || rawDutyStr || effectiveDutyStr || 'OR',
              name: resolvedName,
              empNo: empId,
              time: `${signOnTime} - ${signOffTime}`,
              station: signOnPlace || 'PYID',
              trainId: String(trainId || '').trim()
            });
          }
        } else if (!isNumeric && (
          (currentSectionBanner && /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(currentSectionBanner)) ||
          /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(rawDutyUpper)
        )) {
          // CRRC training section rows: NEVER add to Co-Operators or Primary Train Duties
          const crrcKey = 'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)';
          if (!customRegisters[crrcKey]) customRegisters[crrcKey] = [];
          if (isValidOperatorName(empName) || (empId && empId !== '--' && empId !== 'UNASSIGNED')) {
            const resolvedName = resolveRealOperatorName(empName, empId);
            if (!customRegisters[crrcKey].some((e) => e.empNo === empId || e.name === resolvedName)) {
              customRegisters[crrcKey].push({
                name: resolvedName,
                empNo: empId,
                tag: crrcKey,
                info: signOnTime || 'CRRC DM-DTG',
                trainId: String(trainId || '').trim()
              });
            }
          }
        } else {
          // 1. ACTIVE PRIMARY NUMERIC TRAIN DUTY (Duties 01 - 99)
          if (isNumeric && !inSecondaryBlock) {
            maxActiveDutyNumSoFar = Math.max(maxActiveDutyNumSoFar, numVal);

            // Extract values for dynamic extra columns
            const extraColumns = {};
            extraColumnMap.forEach((headerName, colIdx) => {
              if (row[colIdx] !== undefined && row[colIdx] !== null && String(row[colIdx]).trim() !== '') {
                extraColumns[headerName] = String(row[colIdx]).trim();
              }
            });

            // Determine if status is NOT REPORTING or ABSENT from raw fields using word boundaries
            let initialStatus = 'PENDING';
            const combinedRowStr = (String(empName) + ' ' + String(empId) + ' ' + String(trainId)).toUpperCase();
            if (/\b(NOT\s*REPORTING|NR)\b/i.test(combinedRowStr)) {
              initialStatus = 'NOT_REPORTING';
              if (empId && empId !== '--') notReporting.push({ name: empName, empNo: empId, dutyId: String(effectiveDutyStr) });
            } else if (/\b(ABSENT|AB)\b/i.test(combinedRowStr)) {
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
          } else if (isNumeric && inSecondaryBlock && hasExplicitCoOperatorSection) {
            // 2. EXPLICIT SECONDARY CO-OPERATOR / TRAINEE DRIVER BLOCK ONLY
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
          } else if (isValidOperatorName(empName) || (empId && empId !== '--' && empId !== 'UNASSIGNED')) {
            // 3. DESK DUTY / AUXILIARY REGISTER IN MAIN COLUMN (Strict Word-Boundary Token Matching)
            const resolvedName = resolveRealOperatorName(empName, empId);
            const deskEntry = {
              time: `${signOnTime} - ${signOffTime}`,
              name: resolvedName,
              empNo: empId,
              station: /\b(STBK|STEPBACK|PUTH)\b/i.test(rawDutyUpper) ? 'PUTH' : (signOnPlace || 'PYID')
            };

            if (/\b(NOT\s*REPORTING|NR)\b/i.test(rawDutyUpper)) {
              if (!notReporting.some((e) => e.empNo === empId)) notReporting.push({ name: resolvedName, empNo: empId, type: 'NOT_REPORTING' });
            } else if (/\b(ABSENT|AB)\b/i.test(rawDutyUpper)) {
              if (!absents.some((e) => e.empNo === empId)) absents.push({ name: resolvedName, empNo: empId, type: 'ABSENT' });
            } else if (/\b(REL|RELIEF|RELIEVED)\b/i.test(rawDutyUpper) || /^\s*REL\s*$/i.test(rawDutyUpper)) {
              if (!relievedOperators.some((e) => e.empNo === empId)) relievedOperators.push({ ...deskEntry, time: signOnTime });
            } else if (/\b(CC\d*|CC[-\s]\d+|CREW\s*CONTROLLER|PICKUP)\b/i.test(rawDutyUpper)) {
              if (!controlDesks.some((e) => e.empNo === empId)) controlDesks.push({ ...deskEntry, code: rawDutyUpper });
            } else if (/\b(LRD|ROUTE\s*LEARNING)\b/i.test(rawDutyUpper)) {
              if (!routeLearning.some((e) => e.empNo === empId)) routeLearning.push(deskEntry);
            } else if (/\b(PME|PERIODIC\s*MEDICAL)\b/i.test(rawDutyUpper)) {
              if (!pmeOperators.some((e) => e.empNo === empId)) pmeOperators.push(deskEntry);
            } else if (/\b(CRT|CRT\s*TRAINING)\b/i.test(rawDutyUpper)) {
              if (!crtTraining.some((e) => e.empNo === empId)) crtTraining.push(deskEntry);
            } else if (/\b(OR\d*|OR[-\s]\d+|STANDBY|STBY|S\/B|SB\d*|RD3\s*STBY)\b/i.test(rawDutyUpper)) {
              if (!standbys.some((e) => e.empNo === empId)) standbys.push({ ...deskEntry, code: rawDutyUpper });
            } else if (/\b(WEEKLY\s*OFF|WO|REST)\b/i.test(rawDutyUpper)) {
              if (!weeklyOffs.some((e) => e.empNo === empId)) weeklyOffs.push({ name: resolvedName, empNo: empId });
            } else if (/\b(OD|ON\s*DUTY)\b/i.test(rawDutyUpper)) {
              if (!onDuty.some((e) => e.empNo === empId)) onDuty.push({ name: resolvedName, empNo: empId, info: signOnTime, remark: rawDutyUpper });
            } else if (/\b(CL|EL|GHEL|HPL|ML|PL|LEAVE)\b/i.test(rawDutyUpper)) {
              const leaveType = /\bEL\b/i.test(rawDutyUpper) ? 'EL' : /\bGHEL\b/i.test(rawDutyUpper) ? 'GHEL' : /\bHPL\b/i.test(rawDutyUpper) ? 'HPL' : /\bML\b/i.test(rawDutyUpper) ? 'ML' : /\bPL\b/i.test(rawDutyUpper) ? 'PL' : 'CL';
              if (!leaves.some((e) => e.empNo === empId)) leaves.push({ name: resolvedName, empNo: empId, type: leaveType, from: signOnTime });
            } else if (/\b(STBK|STEPBACK)\b/i.test(rawDutyUpper)) {
              if (!outstationStepbacks.some((e) => e.empNo === empId)) outstationStepbacks.push({ ...deskEntry, station: 'PUTH' });
            } else if (/\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(rawDutyUpper) || (currentSectionBanner && /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(currentSectionBanner))) {
              const crrcKey = 'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)';
              if (!customRegisters[crrcKey]) customRegisters[crrcKey] = [];
              if (!customRegisters[crrcKey].some((e) => e.empNo === empId)) {
                customRegisters[crrcKey].push({ name: resolvedName, empNo: empId, tag: crrcKey, info: signOnTime || 'CRRC DM-DTG' });
              }
            } else if (/\b(BMRTI|TRNR|BRMM|CRRC\s*VIVA|VIVA|TRAINING)\b/i.test(rawDutyUpper) || (currentSectionBanner && /\b(BMRTI|TRAINING)\b/i.test(currentSectionBanner))) {
              if (!bmrtiTraining.some((e) => e.empNo === empId)) bmrtiTraining.push({ ...deskEntry, date: signOnTime || 'BMRTI' });
            } else if (rawDutyUpper && rawDutyUpper !== 'GENERAL') {
              if (!customRegisters[rawDutyUpper]) customRegisters[rawDutyUpper] = [];
              if (!customRegisters[rawDutyUpper].some((e) => e.empNo === empId)) {
                customRegisters[rawDutyUpper].push({ name: resolvedName, empNo: empId, tag: rawDutyUpper, info: signOnTime });
              }
            }
          }
        }
      }

      // ── B. RIGHT-SIDE AUXILIARY REGISTERS (Strict Vertical Block Scan from Column J / Index 9) ──
      const colJ = row[9];  // Category / Marker
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

      if ((isValidOperatorName(rawNameRight) || rawNameRight) && rawEmpIdRight !== undefined && rawEmpIdRight !== null && String(rawEmpIdRight).trim() !== '' && String(rawEmpIdRight).trim() !== '--') {
        const empNo = String(rawEmpIdRight).trim();
        const resolvedName = resolveRealOperatorName(rawNameRight, empNo);
        const timeFrom = formatExcelTime(colK);
        const timeTo = formatExcelTime(colN);
        const subTag = colO ? String(colO).trim().toUpperCase() : '';
        const combinedContext = (activeSectionTag + ' ' + subTag).toUpperCase();

        const entry = {
          time: `${timeFrom} - ${timeTo}`,
          name: resolvedName,
          empNo,
          station: /\b(STBK|STEPBACK|PUTH)\b/i.test(combinedContext) ? activeSectionTag : ''
        };

        // ── STRICT ROUTING PRIORITY (Using Word-Boundary Token Regexes) ──
        if (/\b(NOT\s*REPORTING|NR)\b/i.test(combinedContext)) {
          if (!notReporting.some((e) => e.empNo === empNo)) {
            notReporting.push({ name: resolvedName, empNo, type: 'NOT_REPORTING' });
          }
        } else if (/\b(ABSENT|AB)\b/i.test(combinedContext)) {
          if (!absents.some((e) => e.empNo === empNo)) {
            absents.push({ name: resolvedName, empNo, type: 'ABSENT' });
          }
        } else if (/\b(REL|RELIEF|RELIEVED)\b/i.test(combinedContext) || /^\s*REL\s*$/i.test(activeSectionTag)) {
          if (!relievedOperators.some((e) => e.empNo === empNo)) {
            relievedOperators.push({ ...entry, time: timeFrom || formatExcelTime(colK) });
          }
        } else if (/\b(CC\d*|CC[-\s]\d+|CREW\s*CONTROLLER|PICKUP)\b/i.test(combinedContext)) {
          if (!controlDesks.some((e) => e.empNo === empNo)) {
            controlDesks.push({ ...entry, code: subTag || activeSectionTag });
          }
        } else if (/\b(LRD|ROUTE\s*LEARNING)\b/i.test(combinedContext)) {
          if (!routeLearning.some((e) => e.empNo === empNo)) {
            routeLearning.push(entry);
          }
        } else if (/\b(PME|PERIODIC\s*MEDICAL)\b/i.test(combinedContext)) {
          if (!pmeOperators.some((e) => e.empNo === empNo)) {
            pmeOperators.push(entry);
          }
        } else if (/\b(CRT|CRT\s*TRAINING)\b/i.test(combinedContext)) {
          if (!crtTraining.some((e) => e.empNo === empNo)) {
            crtTraining.push(entry);
          }
        } else if (/\b(OR\d*|OR[-\s]\d+|STANDBY|STBY|S\/B|SB\d*|RD3\s*STBY)\b/i.test(combinedContext)) {
          if (!standbys.some((e) => e.empNo === empNo)) {
            standbys.push({ ...entry, code: subTag || activeSectionTag || 'OR' });
          }
        } else if (/\b(WEEKLY\s*OFF|WO|REST)\b/i.test(combinedContext)) {
          if (!weeklyOffs.some((e) => e.empNo === empNo)) {
            weeklyOffs.push({ name: resolvedName, empNo, date: formatExcelDate(colK) });
          }
        } else if (/\b(OD|ON\s*DUTY)\b/i.test(combinedContext) || /^\s*OD\s*$/i.test(activeSectionTag)) {
          if (!onDuty.some((e) => e.empNo === empNo)) {
            onDuty.push({ name: resolvedName, empNo, info: formatExcelDate(colK) || 'OD', remark: subTag || 'On Duty' });
          }
        } else if (/\b(CL|EL|GHEL|HPL|ML|PL|LEAVE)\b/i.test(combinedContext)) {
          const leaveType = /\bEL\b/i.test(combinedContext) ? 'EL' : /\bGHEL\b/i.test(combinedContext) ? 'GHEL' : /\bHPL\b/i.test(combinedContext) ? 'HPL' : /\bML\b/i.test(combinedContext) ? 'ML' : /\bPL\b/i.test(combinedContext) ? 'PL' : 'CL';
          if (!leaves.some((e) => e.empNo === empNo)) {
            leaves.push({ name: resolvedName, empNo, type: leaveType, from: formatExcelDate(colK) || '', dateCode: formatExcelDate(colK) || '' });
          }
        } else if (/\b(STBK|STEPBACK)\b/i.test(combinedContext)) {
          if (!outstationStepbacks.some((e) => e.empNo === empNo)) {
            outstationStepbacks.push({ ...entry, station: activeSectionTag });
          }
        } else if (/\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(combinedContext) || /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(activeSectionTag) || (currentSectionBanner && /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(currentSectionBanner))) {
          const crrcKey = 'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)';
          if (!customRegisters[crrcKey]) customRegisters[crrcKey] = [];
          if (!customRegisters[crrcKey].some((e) => e.empNo === empNo)) {
            customRegisters[crrcKey].push({ name: resolvedName, empNo, tag: crrcKey, info: formatExcelDate(colK) || subTag || 'CRRC DM-DTG' });
          }
        } else if (/\b(BMRTI|TRNR|BRMM|CRRC\s*VIVA|VIVA|TRAINING)\b/i.test(combinedContext) || /\b(BMRTI|TRAINING)\b/i.test(activeSectionTag) || (currentSectionBanner && /\b(BMRTI|TRAINING)\b/i.test(currentSectionBanner))) {
          if (!bmrtiTraining.some((e) => e.empNo === empNo)) {
            bmrtiTraining.push({ ...entry, date: formatExcelDate(colK) || 'BMRTI' });
          }
        } else if (activeSectionTag && activeSectionTag !== 'GENERAL') {
          if (!customRegisters[activeSectionTag]) {
            customRegisters[activeSectionTag] = [];
          }
          if (!customRegisters[activeSectionTag].some((e) => e.empNo === empNo)) {
            customRegisters[activeSectionTag].push({ name: resolvedName, empNo, tag: activeSectionTag, info: formatExcelDate(colK) || subTag || '' });
          }
        }
      }
    });

    const parsedDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const computedDateStr = extractedDateInfo ? extractedDateInfo.dateStr : validDate.toISOString().split('T')[0];
    const computedScheduleType = dayType || (extractedDateInfo ? extractedDateInfo.scheduleType : getScheduleTypeFromDate(validDate));
    const computedOfficialTitle = detectedOfficialTitle || (extractedDateInfo ? extractedDateInfo.fullOfficialTitle : `${selectedSheetName}`);
    const computedSheetTag = extractedDateInfo ? extractedDateInfo.sheetTag : `${validDate.getDate()}.${validDate.getMonth() + 1}`;
    const dynamicExtraHeaders = Array.from(dynamicExtraHeadersSet);

    const rawResult = {
      sheetName: selectedSheetName,
      dateStr: computedDateStr,
      dayType: computedScheduleType,
      fullOfficialTitle: computedOfficialTitle,
      sheetTag: computedSheetTag,
      isPublishedForOperators: true,
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
      coOperators: hasExplicitCoOperatorSection ? coOperators : [],
      customRegisters,
      dynamicExtraHeaders,
      dynamicColumns: {
        'CREW CONTROLLERS': controlDesks,
        'CO-OPERATORS & TRAINEES': hasExplicitCoOperatorSection ? coOperators : [],
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

    return enforceSingleDutyRule(rawResult);
  },

  publishRosterForDate: async (dateStr, isPublished = true) => {
    try {
      const snapRef = doc(db, 'dispatch_excel_cache', dateStr);
      await setDoc(snapRef, {
        isPublishedForOperators: isPublished,
        publishedAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (err) {
      console.error('publishRosterForDate error:', err);
      throw err;
    }
  },

  updateRosterCacheForDate: async (dateStr, updatedData) => {
    try {
      if (!dateStr) return;
      const todayStr = new Date().toISOString().split('T')[0];
      const snapRef = doc(db, 'dispatch_excel_cache', dateStr);
      await setDoc(snapRef, {
        ...updatedData,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      if (dateStr === todayStr) {
        await setDoc(doc(db, 'dispatch_excel_cache', 'current'), {
          ...updatedData,
          lastUpdated: serverTimestamp()
        }, { merge: true });
        await setDoc(doc(db, 'roster_desk_console', 'current'), {
          ...updatedData,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      console.error('updateRosterCacheForDate error:', err);
    }
  },

  autoDeployClassifiedData: async (classifiedData, user = 'GCC Controller', notes = '') => {
    const sanitized = enforceSingleDutyRule(classifiedData);
    const dateStr = sanitized.dateStr || new Date().toISOString().split('T')[0];
    const dayType = sanitized.dayType || 'WEEKDAY';
    const todayStr = new Date().toISOString().split('T')[0];

    const consoleSnapshot = {
      date: dateStr,
      dayType,
      sheetName: sanitized.sheetName || 'Roster Sheet',
      fullOfficialTitle: sanitized.fullOfficialTitle || `${dateStr} ${dayType}`,
      sheetTag: sanitized.sheetTag || '',
      isPublishedForOperators: true,
      publishedAt: serverTimestamp(),
      publishedBy: user,
      duties: sanitized.duties || [],
      controlDesks: sanitized.controlDesks || [],
      coOperators: sanitized.coOperators || [],
      leaves: sanitized.leaves || [],
      standbys: sanitized.standbys || [],
      outstationStepbacks: sanitized.outstationStepbacks || [],
      crtTraining: sanitized.crtTraining || [],
      bmrtiTraining: sanitized.bmrtiTraining || [],
      weeklyOffs: sanitized.weeklyOffs || [],
      relievedOperators: sanitized.relievedOperators || [],
      pmeOperators: sanitized.pmeOperators || [],
      routeLearning: sanitized.routeLearning || [],
      notReporting: sanitized.notReporting || [],
      absents: sanitized.absents || [],
      bookedOff: sanitized.bookedOff || [],
      onDuty: sanitized.onDuty || [],
      customRegisters: sanitized.customRegisters || {},
      dynamicExtraHeaders: sanitized.dynamicExtraHeaders || [],
      isExplicitlyCleared: false,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, 'dispatch_excel_cache', dateStr), consoleSnapshot, { merge: true });
    
    // If deploying for today, also update current active console
    if (dateStr === todayStr) {
      await setDoc(doc(db, 'dispatch_excel_cache', 'current'), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'roster_desk_console', 'current'), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'roster_desk_console', 'latest'), consoleSnapshot, { merge: true });
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pyidcc_roster_desk_console_cache', JSON.stringify(consoleSnapshot));
      }
    } catch (e) {
      console.warn("LocalStorage cache error:", e);
    }

    const dutiesToDeploy = (sanitized.duties || []).filter(d => d && d.dutyId);
    if (dutiesToDeploy.length > 0) {
      const batch = writeBatch(db);
      for (const d of dutiesToDeploy) {
        const docId = `gcc_deploy_${dayType.toLowerCase()}_duty_${d.dutyId}`;
        batch.set(doc(db, 'crew_daily_deployment', docId), {
          ...d,
          date: dateStr,
          targetDate: dateStr,
          scheduleType: dayType,
          autoDeployed: true,
          isLocked: true,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
    }

    // Comprehensive Cross-Page Deployment to Dedicated Registers:
    try {
      const regBatch = writeBatch(db);
      let opCount = 0;

      // 1. Leaves -> leave_requests
      (sanitized.leaves || []).forEach((item) => {
        if (!item.empNo) return;
        regBatch.set(
          doc(db, "leave_requests", `leave_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            leaveType: item.type || "CL",
            startDate: dateStr,
            endDate: dateStr,
            status: "APPROVED",
            reason: "Auto-Deployed Roster Leave",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        opCount++;
      });

      // 2. Weekly Offs -> weekly_off_register
      (sanitized.weeklyOffs || []).forEach((item) => {
        if (!item.empNo) return;
        regBatch.set(
          doc(db, "weekly_off_register", `wo_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            date: dateStr,
            status: "WEEKLY_OFF",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        opCount++;
      });

      // 3. Absents & Not Reporting -> absent_bookoff_register
      [...(sanitized.absents || []), ...(sanitized.notReporting || [])].forEach((item) => {
        if (!item.empNo) return;
        const kind = (sanitized.absents || []).includes(item) ? "ABSENT" : "NOT_REPORTING";
        regBatch.set(
          doc(db, "absent_bookoff_register", `${kind.toLowerCase()}_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            date: dateStr,
            status: kind,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        opCount++;
      });

      // 4. Dynamic Category Pages -> roster_category_pages
      if (sanitized.customRegisters && typeof sanitized.customRegisters === "object") {
        Object.entries(sanitized.customRegisters).forEach(([catTitle, items]) => {
          const safeSlug = catTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          if (safeSlug) {
            regBatch.set(
              doc(db, "roster_category_pages", `${safeSlug}_${dateStr}`),
              {
                categoryTitle: catTitle,
                categorySlug: safeSlug,
                date: dateStr,
                dayType,
                staffCount: (items || []).length,
                staff: items || [],
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            opCount++;
          }
        });
      }

      if (opCount > 0) {
        await regBatch.commit();
      }
    } catch (regErr) {
      console.warn("Cross-register deployment non-fatal warning:", regErr);
    }

    try {
      await rosterAutoClassifierService.saveToMonthlyArchive(sanitized);
    } catch (archiveErr) {
      console.warn("Monthly archive write warning:", archiveErr);
    }

    return {
      dutiesCount: (sanitized.duties || []).length,
      coOperatorsCount: (sanitized.coOperators || []).length,
      weeklyOffsCount: (sanitized.weeklyOffs || []).length,
      leavesCount: (sanitized.leaves || []).length,
      standbysCount: (sanitized.standbys || []).length,
      trainingCount: (sanitized.bmrtiTraining || []).length
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
