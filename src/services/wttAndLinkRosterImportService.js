/**
 * WTT & Link Roster Enterprise Excel Import Service
 * ─────────────────────────────────────────────────────────────────────
 * Extracts, parses, normalizes and synchronizes Working Time Tables (WTT)
 * and Link Rosters across all BMRCL Line 2 operational schedules:
 * WEEKDAY, MONDAY, SATURDAY & GH, and SUNDAY.
 * ─────────────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx';
import { db } from '../firebase.js';
import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  serverTimestamp 
} from 'firebase/firestore';
import { computeDutyLegKms } from '../utils/kmCalculator.js';

// Canonical BMRCL Line 2 station sequences
export const DN_STATIONS = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
export const UP_STATIONS = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

export const SCHEDULE_DAYS = [
  { id: 'WEEKDAY', label: 'WEEKDAY SCHEDULE' },
  { id: 'MONDAY', label: 'MONDAY SCHEDULE' },
  { id: 'SATURDAY', label: 'SAT & GH ROSTER' },
  { id: 'SUNDAY', label: 'SUNDAY SCHEDULE' }
];

/**
 * Standardize single-digit duty IDs (1 -> "01", 9 -> "09")
 */
export function normalizeDutyId(id) {
  const s = String(id || '').trim();
  if (/^[1-9]$/.test(s)) return '0' + s;
  return s;
}

/**
 * Normalizes schedule type string to canonical token:
 * "WEEKDAY" | "MONDAY" | "SATURDAY" | "SUNDAY"
 */
export function normalizeScheduleType(rawType) {
  if (!rawType) return 'WEEKDAY';
  const s = String(rawType).trim().toUpperCase();
  if (s.includes('MON')) return 'MONDAY';
  if (s.includes('SAT') || s.includes('GH') || s.includes('HOLIDAY')) return 'SATURDAY';
  if (s.includes('SUN')) return 'SUNDAY';
  return 'WEEKDAY';
}

/**
 * Converts Excel cell values (fraction of day number, string, time) into HH:MM:SS format
 * while preserving operational text strings (e.g. "NGSA UP to BIET UP", "NLC UP PF").
 */
export function parseExcelTime(val) {
  if (val === null || val === undefined || val === '') return '--';

  // Handle Date objects if passed
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // Excel stores time as floating point fraction of 24h day (e.g. 0.25 = 06:00:00)
  if (typeof val === 'number') {
    let dayFraction = val;
    if (val >= 2.0) {
      const frac = val - Math.floor(val);
      if (frac > 0.0001) {
        dayFraction = frac;
      } else {
        return String(val);
      }
    } else if (val >= 1.0) {
      dayFraction = val - Math.floor(val);
    }
    const totalSecs = Math.round(dayFraction * 86400);
    const h = String(Math.floor(totalSecs / 3600) % 24).padStart(2, '0');
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const s = String(totalSecs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  const str = String(val).trim();
  if (str === '-' || str === '--') return '--';

  // If XLSX or browser converted time into Date string (e.g. "Sat Dec 30 1899 06:18:00 GMT+...")
  if (str.includes('1899') || str.includes('1900') || str.includes('GMT') || str.includes('Standard Time')) {
    const m = str.match(/\b([0-2]?\d):([0-5]\d)(?::([0-5]\d))?\b/);
    if (m) {
      const h = String(parseInt(m[1], 10)).padStart(2, '0');
      const min = String(parseInt(m[2], 10)).padStart(2, '0');
      const s = m[3] ? String(parseInt(m[3], 10)).padStart(2, '0') : '00';
      return `${h}:${min}:${s}`;
    }
  }

  // If numeric string representing day fraction e.g. "0.25" or composite "52.2138888888889"
  const num = parseFloat(str);
  if (!isNaN(num) && !str.includes(':')) {
    let dayFraction = num;
    if (num >= 2.0) {
      const frac = num - Math.floor(num);
      if (frac > 0.0001) dayFraction = frac;
      else return str;
    } else if (num >= 1.0) {
      dayFraction = num - Math.floor(num);
    }
    if (dayFraction > 0 && dayFraction < 1.0) {
      const totalSecs = Math.round(dayFraction * 86400);
      const h = String(Math.floor(totalSecs / 3600) % 24).padStart(2, '0');
      const min = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const s = String(totalSecs % 60).padStart(2, '0');
      return `${h}:${min}:${s}`;
    }
  }

  // Check if string is already formatted as HH:MM or HH:MM:SS
  const timeMatch = str.match(/^([0-2]?\d):([0-5]\d)(?::([0-5]\d))?$/);
  if (timeMatch) {
    const h = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const min = String(parseInt(timeMatch[2], 10)).padStart(2, '0');
    const s = timeMatch[3] ? String(parseInt(timeMatch[3], 10)).padStart(2, '0') : '00';
    return `${h}:${min}:${s}`;
  }

  // Return text annotations as-is (e.g. "NGSA UP to BIET UP", "SPOD DN PF", "APTS DN", "P DHO")
  return str;
}

/**
 * Detects whether an Excel workbook is a Working Time Table (WTT) or a Link Roster
 */
export function detectExcelType(sheetData) {
  for (let r = 0; r < Math.min(15, sheetData.length); r++) {
    const row = sheetData[r] || [];
    const rowStr = row.map(c => String(c || '').toUpperCase()).join(' ');

    if (rowStr.includes('DUTY NO') || rowStr.includes('DUTYNO') || rowStr.includes('S ON TIME') || rowStr.includes('SIGN ON')) {
      return 'LINK_ROSTER';
    }

    const stationHits = DN_STATIONS.filter(st => rowStr.includes(st)).length;
    if (stationHits >= 4) {
      return 'WTT';
    }
  }
  return 'UNKNOWN';
}

/**
 * Detects schedule day type (WEEKDAY, MONDAY, SATURDAY, SUNDAY) from filename, sheet name, or contents
 */
export function detectScheduleDay(filename = '', sheetName = '', sheetData = []) {
  const combinedText = [
    filename,
    sheetName,
    ...(sheetData.slice(0, 5).map(r => (r || []).join(' ')))
  ].join(' ').toUpperCase();

  if (combinedText.includes('MON')) return 'MONDAY';
  if (combinedText.includes('SAT') || combinedText.includes('GH') || combinedText.includes('HOLIDAY')) return 'SATURDAY';
  if (combinedText.includes('SUN')) return 'SUNDAY';
  if (combinedText.includes('WEEKDAY') || combinedText.includes('WD') || combinedText.includes('REGULAR')) return 'WEEKDAY';

  return 'WEEKDAY';
}

/* ─────────────────────────────────────────────────────────────────────────────
   1. WORKING TIME TABLE (WTT) PARSER
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Normalizes Mode of Operation string ("ATO" or "ATP")
 */
export function normalizeMode(val) {
  if (!val || val === '--' || val === '-') return '';
  const s = String(val).trim().toUpperCase();
  if (s.includes('ATP')) return 'ATP';
  if (s.includes('ATO')) return 'ATO';
  return '';
}

/**
 * Intelligently select the best WTT timetable matrix sheet from a multi-sheet workbook
 */
export function selectBestWttSheet(wb, targetSchedule = '') {
  let bestSheet = wb.SheetNames[0];
  let highestScore = -1;
  const targetNorm = normalizeScheduleType(targetSchedule);

  for (const sName of wb.SheetNames) {
    const ws = wb.Sheets[sName];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    let score = 0;
    const nameUpper = sName.toUpperCase();
    if (targetNorm && nameUpper.includes(targetNorm)) score += 30;
    if (nameUpper.includes('PRINT TT') || nameUpper.includes('WTT') || nameUpper.includes('TIME TABLE') || nameUpper.includes('TIMETABLE')) score += 40;
    // Strongly penalize Link / Roster sheets if this is WTT
    if (nameUpper.includes('LINK') || nameUpper.includes('ROSTER')) score -= 100;

    for (let r = 0; r < Math.min(15, data.length); r++) {
      const row = data[r] || [];
      const rowStr = row.map(c => String(c || '').toUpperCase()).join(' ');
      if (rowStr.includes('DOWN LINE') && rowStr.includes('UP LINE')) score += 100;
      const stHits = DN_STATIONS.filter(st => rowStr.includes(st)).length;
      if (stHits >= 4) score += stHits * 15;
      if (rowStr.includes('MODE') && (rowStr.includes('TID') || rowStr.includes('TR NO') || rowStr.includes('TRAIN'))) score += 30;
    }

    if (score > highestScore) {
      highestScore = score;
      bestSheet = sName;
    }
  }
  return bestSheet;
}

/**
 * Parses an uploaded Excel File or ArrayBuffer into structured WTT matrix rows
 * matching PYIDCC's unified Chronological Matrix data structure, including Mode of Operation (ATO/ATP).
 */
export async function parseWttExcel(fileOrBuffer, targetScheduleType = null) {
  let buffer;
  let filename = '';
  if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
    filename = fileOrBuffer.name || '';
    buffer = await fileOrBuffer.arrayBuffer();
  } else {
    buffer = fileOrBuffer;
  }

  const wb = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    raw: true
  });

  const targetDayHint = targetScheduleType || '';
  const sheetName = selectBestWttSheet(wb, targetDayHint);
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const detectedDay = detectScheduleDay(filename, sheetName, data);
  const activeSchedule = normalizeScheduleType(targetScheduleType || detectedDay);

  // 1. Locate the Station Header row
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(15, data.length); r++) {
    const row = data[r] || [];
    const stationCount = row.filter(c => {
      const s = String(c || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
      return DN_STATIONS.includes(s);
    }).length;
    if (stationCount >= 4) {
      headerRowIdx = r;
      break;
    }
  }

  // Fallback to threshold of 3 if 4 was not found
  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(15, data.length); r++) {
      const row = data[r] || [];
      const stationCount = row.filter(c => {
        const s = String(c || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        return DN_STATIONS.includes(s);
      }).length;
      if (stationCount >= 3) {
        headerRowIdx = r;
        break;
      }
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Unable to locate Station Header row in the uploaded Excel file. Ensure BIET, NGSA, PYID, etc., are present.');
  }

  const headerRow = data[headerRowIdx] || [];
  const prevRow = headerRowIdx > 0 ? (data[headerRowIdx - 1] || []) : [];
  const prevPrevRow = headerRowIdx > 1 ? (data[headerRowIdx - 2] || []) : [];

  // 2. Identify the boundary between DOWN LINE and UP LINE
  // APTS appears twice: once at the end of DOWN LINE, once at the start of UP LINE
  let firstAptsCol = -1;
  let secondAptsCol = -1;
  headerRow.forEach((c, idx) => {
    const s = String(c || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (s === 'APTS') {
      if (firstAptsCol === -1) firstAptsCol = idx;
      else if (secondAptsCol === -1) secondAptsCol = idx;
    }
  });

  // Check rows above for "UP LINE"
  let upLineTextCol = -1;
  for (let c = 0; c < Math.max(headerRow.length, prevRow.length, prevPrevRow.length); c++) {
    const t1 = String(prevRow[c] || '').toUpperCase();
    const t2 = String(prevPrevRow[c] || '').toUpperCase();
    if (t1.includes('UP LINE') || t2.includes('UP LINE')) {
      upLineTextCol = c;
      break;
    }
  }

  let upLineStartCol = -1;
  if (upLineTextCol !== -1) {
    upLineStartCol = upLineTextCol;
  } else if (secondAptsCol !== -1) {
    // Mode and TID columns usually precede second APTS
    upLineStartCol = Math.max(0, secondAptsCol - 2);
  } else {
    upLineStartCol = Math.floor(headerRow.length / 2);
  }

  // Find Mode and Train ID column indices (TID / Mode)
  let dnModeCol = -1;
  let upModeCol = -1;
  let dnTidCol = -1;
  let upTidCol = -1;

  headerRow.forEach((c, idx) => {
    const s = String(c || '').trim().toUpperCase();
    if (s.includes('MODE')) {
      if (idx < upLineStartCol && dnModeCol === -1) dnModeCol = idx;
      else if (idx >= upLineStartCol && upModeCol === -1) upModeCol = idx;
    }
    if (s.includes('TID') || s.includes('TR NO') || s.includes('TRAIN')) {
      if (idx < upLineStartCol && dnTidCol === -1) dnTidCol = idx;
      else if (idx >= upLineStartCol && upTidCol === -1) upTidCol = idx;
    }
  });

  // Fallback checks for Mode columns if header wasn't labeled with "MODE"
  if (dnModeCol === -1 && dnTidCol > 0) {
    // Column 0 is conventionally Mode
    dnModeCol = 0;
  }
  if (upModeCol === -1 && upTidCol > upLineStartCol) {
    upModeCol = upTidCol - 1;
  } else if (upModeCol === -1 && upLineStartCol >= 0) {
    upModeCol = upLineStartCol;
  }

  // 3. Map Down Line and Up Line station column indices accurately
  const dnCols = {};
  const upCols = {};
  const dnBoundary = secondAptsCol !== -1 ? secondAptsCol : upLineStartCol;

  headerRow.forEach((cell, cIdx) => {
    const s = String(cell || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (cIdx < dnBoundary) {
      if (DN_STATIONS.includes(s) && dnCols[s] === undefined) {
        dnCols[s] = cIdx;
      }
    } else {
      if (UP_STATIONS.includes(s) && upCols[s] === undefined) {
        upCols[s] = cIdx;
      }
    }
  });

  // 4. Extract data rows
  const parsedRows = [];
  let dnTripsCount = 0;
  let upTripsCount = 0;
  let atoTripsCount = 0;
  let atpTripsCount = 0;

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length === 0) continue;

    const dnTid = dnTidCol >= 0 ? String(row[dnTidCol] || '').trim() : '';
    const upTid = upTidCol >= 0 ? String(row[upTidCol] || '').trim() : '';
    let trainId = dnTid || upTid;

    // Read Mode of Operation (ATO / ATP)
    const rawDnMode = dnModeCol >= 0 ? row[dnModeCol] : '';
    const rawUpMode = upModeCol >= 0 ? row[upModeCol] : '';
    const dnMode = normalizeMode(rawDnMode);
    const upMode = normalizeMode(rawUpMode);

    // Read station times
    const dnStationTimes = {};
    let hasDnTimes = false;
    for (const st of DN_STATIONS) {
      const col = dnCols[st];
      const val = col !== undefined ? parseExcelTime(row[col]) : '--';
      dnStationTimes[st] = val;
      if (val && val !== '--' && val !== '-') hasDnTimes = true;
    }

    const upStationTimes = {};
    let hasUpTimes = false;
    for (const st of UP_STATIONS) {
      const col = upCols[st];
      const val = col !== undefined ? parseExcelTime(row[col]) : '--';
      upStationTimes[st] = val;
      if (val && val !== '--' && val !== '-') hasUpTimes = true;
    }

    // Try finding train ID if not in identified TID column
    if (!trainId && (hasDnTimes || hasUpTimes)) {
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const v = String(row[c] || '').trim();
        if (/^\d{3}$/.test(v)) { trainId = v; break; }
      }
    }

    // Skip empty separator rows or notes-only rows
    if (!trainId && !hasDnTimes && !hasUpTimes) continue;
    if (!trainId) trainId = `TR_${parsedRows.length + 1}`;

    const effectiveMode = dnMode || upMode || (hasDnTimes || hasUpTimes ? 'ATO' : '');
    if (effectiveMode === 'ATO') atoTripsCount++;
    if (effectiveMode === 'ATP') atpTripsCount++;

    const rowSeq = parsedRows.length + 1;
    const rowDocId = `wtt_${activeSchedule.toLowerCase()}_row_${rowSeq}`;

    const downTrip = hasDnTimes ? {
      id: `${rowDocId}_dn`,
      scheduleType: activeSchedule,
      trainId: dnTid || trainId,
      terminalLoopRoute: 'BIET - APTS (DN)',
      mode: dnMode || effectiveMode || 'ATO',
      stations: dnStationTimes
    } : null;

    const upTrip = hasUpTimes ? {
      id: `${rowDocId}_up`,
      scheduleType: activeSchedule,
      trainId: upTid || trainId,
      terminalLoopRoute: 'APTS - BIET (UP)',
      mode: upMode || effectiveMode || 'ATO',
      stations: upStationTimes
    } : null;

    if (downTrip) dnTripsCount++;
    if (upTrip) upTripsCount++;

    parsedRows.push({
      id: rowDocId,
      scheduleType: activeSchedule,
      rowSeq: rowSeq,
      excelRow: r + 1,
      trainId: trainId,
      dnTid: dnTid || (downTrip ? trainId : ''),
      upTid: upTid || (upTrip ? trainId : ''),
      mode: effectiveMode || 'ATO',
      dnMode: downTrip ? (dnMode || downTrip.mode || 'ATO') : '--',
      upMode: upTrip ? (upMode || upTrip.mode || 'ATO') : '--',
      downTrip: downTrip,
      upTrip: upTrip,
      isUploaded: true,
      updatedAt: new Date().toISOString()
    });
  }

  return {
    scheduleType: activeSchedule,
    detectedDay,
    sheetName,
    rows: parsedRows,
    stats: {
      totalRows: parsedRows.length,
      dnTripsCount,
      upTripsCount,
      atoTripsCount,
      atpTripsCount,
      dnStationCount: Object.keys(dnCols).length,
      upStationCount: Object.keys(upCols).length
    },
    warnings: parsedRows.length === 0 ? ['No timetable rows found in sheet.'] : []
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. LINK ROSTER PARSER
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Parses an uploaded Excel File or ArrayBuffer into structured Link Roster duties
 * matching BMRCL Line 2 Master Links format (Leg 1, Leg 2, Leg 3, Leg 4, KMs, Hours).
 */
export async function parseLinkRosterExcel(fileOrBuffer, targetScheduleType = null) {
  let buffer;
  let filename = '';
  if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
    filename = fileOrBuffer.name || '';
    buffer = await fileOrBuffer.arrayBuffer();
  } else {
    buffer = fileOrBuffer;
  }

  const wb = XLSX.read(buffer, {
    type: 'array',
    cellDates: false,
    raw: true
  });

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const detectedDay = detectScheduleDay(filename, sheetName, data);
  const activeSchedule = normalizeScheduleType(targetScheduleType || detectedDay);

  // 1. Locate the Header row (contains "Duty No" or "S ON Time")
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(12, data.length); r++) {
    const row = data[r] || [];
    if (row.some(c => typeof c === 'string' && c.toUpperCase().replace(/\s+/g, '').includes('DUTYNO'))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(12, data.length); r++) {
      const row = data[r] || [];
      if (row.some(c => typeof c === 'string' && c.toUpperCase().includes('SIGN ON'))) {
        headerRowIdx = r;
        break;
      }
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Unable to locate Duty Header row in the uploaded Excel file. Ensure "Duty No" or "Sign ON" is present.');
  }

  const headerRow = (data[headerRowIdx] || []).map(c => 
    String(c || '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').toUpperCase()
  );

  // Scan for secondary header row (e.g. night duties header with "Night Kms", "Morn Kms")
  let nightHeaderRowIdx = -1;
  let nightHeaderRow = [];
  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r] || [];
    if (row.some(c => typeof c === 'string' && c.toUpperCase().includes('NIGHT KMS'))) {
      nightHeaderRowIdx = r;
      nightHeaderRow = row.map(c => String(c || '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').toUpperCase());
      break;
    }
  }

  // 2. Identify core column indices
  let dutyNoCol = -1;
  let sOnTimeCol = -1;
  let sOnLocCol = -1;
  let sOffTimeCol = -1;
  let sOffLocCol = -1;
  let kmsCol = -1;
  let dutyHrsCol = -1;
  let drivingHrsCol = -1;
  let breakCol = -1;
  let counsellingCol = -1;
  let dutyTypeCol = -1;

  headerRow.forEach((s, idx) => {
    if (s.includes('DUTY NO') || s === 'DUTY') {
      if (dutyNoCol === -1) dutyNoCol = idx;
    } else if (s === 'S ON TIME' || s === 'SIGN ON TIME' || s === 'S ON') {
      if (sOnTimeCol === -1) sOnTimeCol = idx;
    } else if (s.includes('SIGN ON LOC') || s.includes('SIGNON LOCATION') || s === 'SIGN ON') {
      if (sOnLocCol === -1) sOnLocCol = idx;
    } else if (s === 'S OFF TIME' || s === 'SIGN OFF TIME' || s === 'S OFF') {
      if (sOffTimeCol === -1) sOffTimeCol = idx;
    } else if (s.includes('SIGN OFF LOC') || s.includes('SIGNOFF LOCATION') || s === 'SIGN OFF') {
      if (sOffLocCol === -1) sOffLocCol = idx;
    } else if (s === 'KMS' || s === 'KM' || s === 'TOTAL KMS' || s === 'TOTAL KM') {
      if (kmsCol === -1) kmsCol = idx;
    } else if (s === 'DUTY HRS' || s === 'TOTAL HOURS' || s === 'DUTY HOURS' || s === 'DUTY HR') {
      if (dutyHrsCol === -1) dutyHrsCol = idx;
    } else if (s === 'DRIVING HRS' || s === 'DRIVING HOURS' || s === 'DRIVING HR') {
      if (drivingHrsCol === -1) drivingHrsCol = idx;
    } else if (s === 'DUTY TYPE' || s === 'DUTY PROFILE' || s === 'REMARKS' || s === 'REMARK') {
      if (dutyTypeCol === -1) dutyTypeCol = idx;
    } else if (s === 'COUNSELLING' || s.includes('COUNS')) {
      if (counsellingCol === -1) counsellingCol = idx;
    } else if ((s === 'BREAK' || s === 'BRK') && (sOffTimeCol !== -1 ? idx > sOffTimeCol : idx >= 28)) {
      if (breakCol === -1) breakCol = idx;
    }
  });

  // Secondary scan for summary Break if not found yet (must be after sign off columns)
  if (breakCol === -1) {
    headerRow.forEach((s, idx) => {
      if ((s === 'BREAK' || s === 'BRK' || s.includes('BREAK')) && idx >= 24 && idx !== sOffTimeCol && idx !== sOffLocCol) {
        if (breakCol === -1) breakCol = idx;
      }
    });
  }

  // Fallback defaults if header variations occurred
  if (dutyNoCol === -1) dutyNoCol = 0;
  if (sOnTimeCol === -1) sOnTimeCol = 1;
  if (sOnLocCol === -1) sOnLocCol = 2;
  if (sOffTimeCol === -1) sOffTimeCol = 24;
  if (sOffLocCol === -1) sOffLocCol = sOffTimeCol + 1;
  if (kmsCol === -1) kmsCol = sOffTimeCol >= 28 ? 31 : 26;
  if (dutyHrsCol === -1) dutyHrsCol = sOffTimeCol >= 28 ? 32 : 27;
  if (drivingHrsCol === -1) drivingHrsCol = sOffTimeCol >= 28 ? 31 : 28;
  if (breakCol === -1) breakCol = sOffTimeCol >= 28 ? 33 : 29;
  if (counsellingCol === -1) counsellingCol = sOffTimeCol >= 28 ? 34 : 30;
  if (dutyTypeCol === -1) dutyTypeCol = sOffTimeCol >= 28 ? 35 : 31;

  // Find all train number columns before the main summary section (sOffTimeCol)
  const trainCols = [];
  headerRow.forEach((s, idx) => {
    if (idx < sOffTimeCol && (
      s === 'TRAIN NO' || 
      s === 'TRAIN' || 
      s === 'TR NO' || 
      s === 'TRAIN NUMBER' ||
      (s.includes('TRAIN') && !s.includes('TYPE') && !s.includes('OPERATOR'))
    )) {
      trainCols.push(idx);
    }
  });

  // Fallbacks for standard train columns if not explicitly detected
  if (trainCols.length === 0) {
    if (sOffTimeCol >= 28) {
      trainCols.push(3, 10, 17, 24); // 4-leg standard layout
    } else {
      trainCols.push(3, 11, 19); // 3-leg standard layout
    }
  }

  // 3. Night Duty Follow Section detection
  let followStartCol = -1;
  let nightKmsCol = -1;
  let mornKmsCol = -1;

  if (nightHeaderRow.length > 0) {
    nightHeaderRow.forEach((s, idx) => {
      if (s.includes('NIGHT KMS') || s === 'NIGHT KM') nightKmsCol = idx;
      else if (s.includes('MORN KMS') || s === 'MORN KM') mornKmsCol = idx;
      else if (idx >= 12 && (s.includes('TAKEOVER') || (s.includes('TRAIN') && !s.includes('NIGHT')))) {
        if (followStartCol === -1) followStartCol = s.includes('TRAIN') ? idx - 1 : idx;
      }
    });
  }

  if (nightKmsCol === -1) nightKmsCol = 10;
  if (mornKmsCol === -1) mornKmsCol = 14;

  const candidateFollowCols = [];
  if (followStartCol >= 12) candidateFollowCols.push(followStartCol);
  [36, 26, 23, 18].forEach(c => {
    if (!candidateFollowCols.includes(c)) candidateFollowCols.push(c);
  });

  const parsedDuties = [];
  let totalKmsSum = 0;

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length === 0) continue;

    const rawDutyNo = row[dutyNoCol];
    if (rawDutyNo === null || rawDutyNo === undefined || rawDutyNo === '') continue;

    const dutyId = normalizeDutyId(rawDutyNo);
    const dutyInt = parseInt(dutyId, 10);
    // Ignore non-duty text rows (like summary footers or section dividers)
    if (!dutyId || isNaN(dutyInt)) continue;

    // Detect if this row is a Night Duty with a Morning Follow trip or night standby
    const rawNightKm = row[nightKmsCol] !== undefined ? row[nightKmsCol] : row[10];
    const hasNightKm = rawNightKm !== undefined && rawNightKm !== null && rawNightKm !== '' && !isNaN(Number(rawNightKm)) && Number(rawNightKm) >= 1;
    const sOnTimeRaw = parseExcelTime(row[sOnTimeCol]);
    const sOnHour = (sOnTimeRaw && !sOnTimeRaw.startsWith('--')) ? parseInt(sOnTimeRaw.split(':')[0], 10) : 0;
    const isNightTime = sOnHour >= 20 || sOnHour <= 3;

    let isNightDuty = false;
    if (nightHeaderRowIdx !== -1) {
      // If a secondary night header row exists, night duties are strictly located after this header row
      isNightDuty = r > nightHeaderRowIdx;
    } else {
      // Otherwise fallback to late night sign-on time (>= 20:00) and duty number / night km presence
      isNightDuty = isNightTime && (dutyInt >= 50 || hasNightKm);
    }

    let dutyObj;

    if (isNightDuty) {
      let l1Train = String(row[trainCols[0] || 3] || '--').trim();
      let l1TimeFrom = parseExcelTime(row[(trainCols[0] || 3) + 1]);
      let l1TimeTo = parseExcelTime(row[(trainCols[0] || 3) + 2]);
      let l1TripTime = parseExcelTime(row[(trainCols[0] || 3) + 3]);
      let l1HandoverLoc = String(row[(trainCols[0] || 3) + 4] || '--').trim();
      const sOnLoc = String(row[sOnLocCol] || '--').trim();

      // Check if standby duty (Pro / CC)
      const isStandby = l1Train.toLowerCase().includes('pro') || 
                        l1Train.toLowerCase().includes('cc') || 
                        String(rawDutyNo).toLowerCase().includes('pro') || 
                        String(rawDutyNo).toLowerCase().includes('cc') ||
                        String(row[19] || '').toLowerCase().includes('pro') ||
                        String(row[19] || '').toLowerCase().includes('cc');

      let fTakeover = '--', fTrain = '--', fFrom = '--', fTo = '--', fTrip = '--', fHandover = '--', fSOff = '--', fSOffLoc = '--';

      if (isStandby) {
        if (l1Train === '--' || l1Train === '') {
          l1Train = String(row[19] || rawDutyNo).trim();
        }
        l1TimeFrom = sOnTimeRaw && !sOnTimeRaw.startsWith('--') ? sOnTimeRaw : '21:30:00';
        l1TimeTo = parseExcelTime(row[sOffTimeCol] || row[32] || row[24]) || '06:30:00';
        if (l1TimeTo.startsWith('--')) l1TimeTo = '06:30:00';
        l1HandoverLoc = 'PYID';
        l1TripTime = '09:00:00';
        fSOff = l1TimeTo;
        fSOffLoc = 'PYID';
      } else {
        // 1. Specific match for Duty 77 style (PDC at 24, trains at 26, times at 28, 29)
        if (String(row[24] || '').includes('PDC') || String(row[26] || '').includes('213;')) {
          fTakeover = 'PDC';
          fTrain = String(row[26] || '213; 214; 215').trim();
          fFrom = parseExcelTime(row[28]);
          fTo = parseExcelTime(row[29]);
          fTrip = parseExcelTime(row[30]);
          fHandover = String(row[31] || 'PYID').trim();
          fSOff = parseExcelTime(row[32]);
          fSOffLoc = String(row[33] || 'PYID').trim();
        }
        // 2. Specific match for Saturday Duty 66/67 style (Ntest at 18, PDC 214,216 at 19)
        else if (String(row[18] || '').includes('Ntest')) {
          fTakeover = 'Depot/CC';
          fTrain = String(row[19] || 'Ntest').trim();
          fFrom = parseExcelTime(row[20] || '00:40:00');
          fTo = parseExcelTime(row[21] || '06:00:00');
          fTrip = parseExcelTime(row[22] || '--');
          fHandover = String(row[23] || 'Depot').trim();
          fSOff = parseExcelTime(row[24] || row[32] || '06:30:00');
          fSOffLoc = String(row[25] || row[33] || 'Depot').trim();
        }
        // 3. Specific match for Weekday Duty 70 style (Depot/CC at 26, Ntest at 27, 00:40 at 28, 06:00 at 29)
        else if (String(row[26] || '').includes('Depot/CC') || String(row[27] || '').includes('Ntest')) {
          fTakeover = 'Depot/CC';
          fTrain = 'Ntest';
          fFrom = parseExcelTime(row[28]);
          fTo = parseExcelTime(row[29]);
          fTrip = parseExcelTime(row[30]);
          fHandover = String(row[31] || 'Depot').trim();
          fSOff = parseExcelTime(row[32]);
          fSOffLoc = String(row[33] || 'Depot').trim();
        }
        // 4. Candidate follow columns scan: check 18 (Saturday), 26 (Weekday/Monday/Sunday), 36 (wide Monday)
        else {
          const candidateStarts = [];
          if (followStartCol >= 12 && !candidateStarts.includes(followStartCol)) {
            candidateStarts.push(followStartCol);
          }
          [18, 26, 36].forEach(c => {
            if (!candidateStarts.includes(c)) candidateStarts.push(c);
          });

          for (const startCol of candidateStarts) {
            const cTakeover = row[startCol];
            const cTrain = row[startCol + 1];
            const cFrom = row[startCol + 2];
            const cTo = row[startCol + 3];
            const cTrip = row[startCol + 4];
            const cHandover = row[startCol + 5];
            const cSOff = row[startCol + 6];
            const cSOffLoc = row[startCol + 7];

            if (cTrain === undefined || cTrain === null || cTrain === '') continue;

            // A valid train number CANNOT be a fraction of day time number (< 1)
            if (typeof cTrain === 'number' && cTrain < 1) continue;

            const sTrain = String(cTrain).trim();
            const isTrainNum = /^\d{3,4}$/.test(sTrain);
            const isTrainMulti = sTrain.includes(';') || sTrain.includes(',');
            const isSpecialTrain = /^(pro|cc|ntest|pdc)/i.test(sTrain);

            if (!isTrainNum && !isTrainMulti && !isSpecialTrain) continue;

            // Check if cFrom or cTo is a valid time
            const parsedFrom = parseExcelTime(cFrom);
            const parsedTo = parseExcelTime(cTo);
            const hasValidTime = (parsedFrom && parsedFrom !== '--' && /^\d{2}:\d{2}/.test(parsedFrom)) ||
                                 (parsedTo && parsedTo !== '--' && /^\d{2}:\d{2}/.test(parsedTo));

            if (hasValidTime) {
              fTakeover = String(cTakeover || '--').trim();
              fTrain = sTrain;
              fFrom = parsedFrom;
              fTo = parsedTo;
              fTrip = parseExcelTime(cTrip);
              fHandover = String(cHandover || '--').trim();
              fSOff = parseExcelTime(cSOff);
              fSOffLoc = String(cSOffLoc || '--').trim();
              break;
            }
          }
        }
      }

      if (/couns(?:\([^)]*\))?/i.test(l1HandoverLoc)) l1HandoverLoc = 'PYID';
      if (/couns(?:\([^)]*\))?/i.test(fTakeover)) fTakeover = 'PYID';
      if (/couns(?:\([^)]*\))?/i.test(fHandover)) fHandover = 'PYID';

      // If handover location is missing or '--', fall back to sign off location
      if ((fHandover === '--' || fHandover === '') && fSOffLoc !== '--' && fSOffLoc !== '') {
        fHandover = fSOffLoc;
      }
      if (fTakeover === '--' || fTakeover === '') {
        fTakeover = l1HandoverLoc !== '--' ? l1HandoverLoc : sOnLoc;
      }

      // Check for pilot movement in row
      let pilotMovement = '--';
      for (let c = 8; c < 26; c++) {
        const val = String(row[c] || '').trim();
        if (val.toLowerCase().includes('pilot')) {
          pilotMovement = val;
          break;
        }
      }

      // KMs calculation
      const nightKms = (rawNightKm !== undefined && rawNightKm !== null && !isNaN(Number(rawNightKm))) ? Number(rawNightKm) : 0;
      const rawMornKm = row[mornKmsCol] !== undefined ? row[mornKmsCol] : (row[22] !== undefined ? row[22] : (row[16] !== undefined ? row[16] : (row[24] !== undefined ? row[24] : 0)));
      const mornKms = (rawMornKm !== undefined && rawMornKm !== null && !isNaN(Number(rawMornKm)) && Number(rawMornKm) >= 1) ? Number(rawMornKm) : 0;
      const explicitTotalKm = Number(row[kmsCol]) || Number(row[34]) || Number(row[26]) || 0;
      const combinedKm = explicitTotalKm > 0 ? explicitTotalKm : (nightKms + mornKms);
      totalKmsSum += combinedKm;

      const finalSignOffTime = (fSOff && fSOff !== '--') ? fSOff : parseExcelTime(row[sOffTimeCol] || row[32] || row[24] || row[42]);
      const finalSignOffLoc = (fSOffLoc && fSOffLoc !== '--') ? fSOffLoc : String(row[sOffLocCol] || row[33] || row[25] || row[43] || '--').trim();
      const rawDutyHrs = row[dutyHrsCol] !== undefined ? row[dutyHrsCol] : (row[36] !== undefined ? row[36] : (row[28] !== undefined ? row[28] : row[27]));
      const rawDrivingHrs = row[drivingHrsCol] !== undefined ? row[drivingHrsCol] : (row[35] !== undefined ? row[35] : (row[27] !== undefined ? row[27] : row[28]));
      const rawBreak = row[breakCol] !== undefined ? row[breakCol] : (row[37] !== undefined ? row[37] : (row[29] !== undefined ? row[29] : row[8]));
      const rawCouns = row[counsellingCol] !== undefined ? row[counsellingCol] : (row[38] !== undefined ? row[38] : (row[30] !== undefined ? row[30] : '--'));
      const rawType = row[dutyTypeCol] || row[39] || row[31] || `N${dutyId}`;

      const docId = `link_${activeSchedule.toLowerCase()}_duty_${dutyId}`;

      // Build structured trips array for night duty
      const trips = [];
      if (l1Train !== '--' && l1Train !== '') {
        trips.push({
          trainNo: l1Train,
          timeFrm: l1TimeFrom,
          timeTo: l1TimeTo,
          takeoverLocation: sOnLoc,
          handoverLocation: l1HandoverLoc !== '--' ? l1HandoverLoc : fTakeover,
          tripTime: l1TripTime,
          calculatedKms: nightKms > 0 ? nightKms : 0
        });
      }
      if (fTrain !== '--' && fTrain !== '') {
        trips.push({
          trainNo: fTrain,
          timeFrm: fFrom,
          timeTo: fTo,
          takeoverLocation: fTakeover,
          handoverLocation: fHandover !== '--' ? fHandover : finalSignOffLoc,
          tripTime: fTrip,
          calculatedKms: mornKms > 0 ? mornKms : 0
        });
      }

      dutyObj = {
        id: docId,
        docId: docId,
        dutyNo: String(rawDutyNo).trim(),
        dutyId: dutyId,
        scheduleType: activeSchedule,
        signOnTime: sOnTimeRaw,
        signOnLocation: sOnLoc,
        trainId: l1Train !== '--' ? l1Train : (fTrain !== '--' ? fTrain : '--'),

        // Leg 1 (Night Trip)
        leg1TrainNo: l1Train,
        leg1DepLoc: sOnLoc,
        leg1DepTime: l1TimeFrom,
        leg1ArrTime: l1TimeTo,
        leg1TimeFrom: l1TimeFrom,
        leg1TimeTo: l1TimeTo,
        leg1TripTime: l1TripTime,
        leg1HandoverLoc: l1HandoverLoc !== '--' ? l1HandoverLoc : fTakeover,
        leg1ArrLoc: l1HandoverLoc !== '--' ? l1HandoverLoc : fTakeover,
        leg1Km: nightKms > 0 ? nightKms : '--',
        nightKms: nightKms,

        // Leg 2 (Morning Follow Trip)
        leg2DepLoc: fTakeover !== '--' ? fTakeover : (l1HandoverLoc !== '--' ? l1HandoverLoc : '--'),
        leg2TrainNo: fTrain,
        leg2DepTime: fFrom,
        leg2ArrTime: fTo,
        leg2TimeTo: fTrip,
        leg2ArrLoc: fHandover !== '--' ? fHandover : (fTrain !== '--' ? finalSignOffLoc : '--'),
        leg2Km: mornKms > 0 ? mornKms : '--',
        mornKms: mornKms,

        // Leg 3 & 4 (None for split night duty)
        leg3DepLoc: '--',
        leg3TrainNo: '--',
        leg3DepTime: '--',
        leg3ArrTime: '--',
        leg3TimeTo: '--',
        leg3ArrLoc: '--',
        leg3Km: '--',

        leg4FinalDepLoc: '--',
        leg4TrainNo: '--',
        leg4FinalDepTime: '--',
        leg4FinalArrTime: '--',
        leg4TimeTo: '--',
        leg4FinalArrLoc: '--',
        leg4Km: '--',

        // Structured Trips Array
        trips: trips,

        // Pilot Movement (if any)
        pilotMovement: pilotMovement,

        // Summary
        signOffTime: finalSignOffTime,
        signOffLocation: finalSignOffLoc,
        totalHours: parseExcelTime(rawDutyHrs),
        dutyHrs: parseExcelTime(rawDutyHrs),
        drivingHrs: parseExcelTime(rawDrivingHrs),
        breakTime: parseExcelTime(rawBreak),
        counselling: parseExcelTime(rawCouns),
        kms: combinedKm,
        totalKm: combinedKm > 0 ? combinedKm : '--',
        remarks: String(rawType).trim(),
        dutyProfile: String(rawType).trim(),
        isUploaded: true,
        lastModified: new Date().toISOString()
      };
    } else {
      // Standard Day Duty
      const rawKms = row[kmsCol];
      const kmsNum = rawKms !== undefined && rawKms !== null && rawKms !== '' 
        ? (typeof rawKms === 'number' ? rawKms : Number(rawKms) || 0) 
        : 0;
      totalKmsSum += kmsNum;

      const sOnLoc = String(row[sOnLocCol] || '--').trim();
      const sOffTime = parseExcelTime(row[sOffTimeCol]);
      const sOffLoc = String(row[sOffLocCol] || '--').trim();

      // Extract each leg dynamically from trainCols
      const legsData = [];
      let extractedCouns = null;

      trainCols.forEach((tCol, legIdx) => {
        const trainNo = String(row[tCol] || '--').trim();
        const timeFrom = parseExcelTime(row[tCol + 1]);
        const timeTo = parseExcelTime(row[tCol + 2]);
        const tripTime = parseExcelTime(row[tCol + 3]);
        let handoverLoc = String(row[tCol + 4] || '--').trim();
        let takeoverLoc = legIdx > 0 ? String(row[tCol - 1] || '--').trim() : sOnLoc;

        // Counselling mentioned behind/after the trip (e.g. Couns(12:30), Couns(13:00))
        // Due to space constraints, GCC wrote Couns(...) in the location column.
        // It must NOT cancel the active train trip's KM calculation.
        // The train trip ends at PYID crew base where counselling occurs.
        if (/couns(?:\([^)]*\))?/i.test(handoverLoc)) {
          const m = handoverLoc.match(/couns(?:\(([^)]*)\))?/i);
          if (m && m[1]) extractedCouns = m[1].trim();
          else if (!extractedCouns) extractedCouns = 'Counselling';
          handoverLoc = 'PYID';
        }
        if (/couns(?:\([^)]*\))?/i.test(takeoverLoc)) {
          const m = takeoverLoc.match(/couns(?:\(([^)]*)\))?/i);
          if (m && m[1]) extractedCouns = m[1].trim();
          else if (!extractedCouns) extractedCouns = 'Counselling';
          takeoverLoc = 'PYID';
        }

        legsData.push({
          takeoverLoc,
          trainNo,
          timeFrom,
          timeTo,
          tripTime,
          handoverLoc
        });
      });

      const leg1 = legsData[0] || { takeoverLoc: sOnLoc, trainNo: '--', timeFrom: '--', timeTo: '--', tripTime: '--', handoverLoc: '--' };
      const leg2 = legsData[1] || { takeoverLoc: '--', trainNo: '--', timeFrom: '--', timeTo: '--', tripTime: '--', handoverLoc: '--' };
      const leg3 = legsData[2] || { takeoverLoc: '--', trainNo: '--', timeFrom: '--', timeTo: '--', tripTime: '--', handoverLoc: '--' };
      const leg4 = legsData[3] || { takeoverLoc: '--', trainNo: '--', timeFrom: '--', timeTo: '--', tripTime: '--', handoverLoc: '--' };

      // Deboard Location inference when cell was omitted in spreadsheet
      let l1To = leg1.handoverLoc;
      let l2From = leg2.takeoverLoc;
      let l2To = leg2.handoverLoc;
      let l3From = leg3.takeoverLoc;
      let l3To = leg3.handoverLoc;
      let l4From = leg4.takeoverLoc;
      let l4To = leg4.handoverLoc;

      if ((l1To === '--' || l1To === '') && l2From !== '--' && l2From !== '') l1To = l2From;
      if ((l2To === '--' || l2To === '') && l3From !== '--' && l3From !== '') l2To = l3From;
      if ((l3To === '--' || l3To === '') && l4From !== '--' && l4From !== '') l3To = l4From;

      // Forward-fill takeover locations if omitted and previous leg had known handover location
      if ((l2From === '--' || l2From === '') && l1To !== '--' && l1To !== '') l2From = l1To;
      if ((l3From === '--' || l3From === '') && l2To !== '--' && l2To !== '') l3From = l2To;
      if ((l4From === '--' || l4From === '') && l3To !== '--' && l3To !== '') l4From = l3To;

      // Special check: Depot / Dpo - Rd3 induction for RVR short loop
      // Trip starts Depot -> PYID Rd3 -> RVR Dn -> Turn back at RVR 6 car stopping -> RVR -> PYID Up
      if ((leg1.takeoverLoc.toLowerCase().includes('dpo') || leg1.takeoverLoc.toLowerCase().includes('depot')) && (l1To === '--' || l1To === '')) {
        l1To = 'PYID Up';
        if (l2From === '--' || l2From === '') l2From = 'PYID Up';
      }

      // Final leg connects to sign off location
      if (leg4.trainNo !== '--' && (l4To === '--' || l4To === '') && sOffLoc !== '--') l4To = sOffLoc;
      else if (leg3.trainNo !== '--' && (l3To === '--' || l3To === '') && sOffLoc !== '--') l3To = sOffLoc;
      else if (leg2.trainNo !== '--' && (l2To === '--' || l2To === '') && sOffLoc !== '--') l2To = sOffLoc;
      else if (leg1.trainNo !== '--' && (l1To === '--' || l1To === '') && sOffLoc !== '--') l1To = sOffLoc;

      const mainTrainId = leg1.trainNo !== '--' ? leg1.trainNo : 
        (leg2.trainNo !== '--' ? leg2.trainNo : 
        (leg3.trainNo !== '--' ? leg3.trainNo : leg4.trainNo));

      const docId = `link_${activeSchedule.toLowerCase()}_duty_${dutyId}`;

      dutyObj = {
        id: docId,
        docId: docId,
        dutyNo: String(rawDutyNo).trim(),
        dutyId: dutyId,
        scheduleType: activeSchedule,
        signOnTime: sOnTimeRaw,
        signOnLocation: sOnLoc,
        trainId: mainTrainId,

        // Leg 1
        leg1TrainNo: leg1.trainNo,
        leg1DepLoc: sOnLoc,
        leg1DepTime: leg1.timeFrom,
        leg1ArrTime: leg1.timeTo,
        leg1TimeFrom: leg1.timeFrom,
        leg1TimeTo: leg1.timeTo,
        leg1TripTime: leg1.tripTime,
        leg1HandoverLoc: l1To,
        leg1ArrLoc: l1To,
        leg1Km: '--',

        // Leg 2
        leg2DepLoc: l2From,
        leg2TrainNo: leg2.trainNo,
        leg2DepTime: leg2.timeFrom,
        leg2ArrTime: leg2.timeTo,
        leg2TimeTo: leg2.tripTime,
        leg2ArrLoc: l2To,
        leg2Km: '--',

        // Leg 3
        leg3DepLoc: l3From,
        leg3TrainNo: leg3.trainNo,
        leg3DepTime: leg3.timeFrom,
        leg3ArrTime: leg3.timeTo,
        leg3TimeTo: leg3.tripTime,
        leg3ArrLoc: l3To,
        leg3Km: '--',

        // Leg 4
        leg4FinalDepLoc: l4From,
        leg4TrainNo: leg4.trainNo,
        leg4FinalDepTime: leg4.timeFrom,
        leg4FinalArrTime: leg4.timeTo,
        leg4TimeTo: leg4.tripTime,
        leg4FinalArrLoc: l4To,
        leg4Km: '--',

        // Summary
        signOffTime: sOffTime,
        signOffLocation: sOffLoc,
        totalHours: parseExcelTime(row[dutyHrsCol]),
        dutyHrs: parseExcelTime(row[dutyHrsCol]),
        drivingHrs: parseExcelTime(row[drivingHrsCol]),
        breakTime: parseExcelTime(row[breakCol]),
        counselling: (row[counsellingCol] !== undefined && row[counsellingCol] !== null && String(row[counsellingCol]).trim() !== '' && String(row[counsellingCol]).trim() !== '--') 
          ? parseExcelTime(row[counsellingCol]) 
          : (extractedCouns || '--'),
        kms: kmsNum,
        totalKm: kmsNum,
        remarks: String(row[dutyTypeCol] || '--').trim(),
        dutyProfile: String(row[dutyTypeCol] || '--').trim(),
        isUploaded: true,
        lastModified: new Date().toISOString()
      };

      // High-precision distance calculation per leg
      try {
        if (typeof computeDutyLegKms === 'function') {
          const comp = computeDutyLegKms(dutyObj, activeSchedule);
          if (comp) {
            if (comp.leg1Km > 0) dutyObj.leg1Km = comp.leg1Km;
            if (comp.leg2Km > 0) dutyObj.leg2Km = comp.leg2Km;
            if (comp.leg3Km > 0) dutyObj.leg3Km = comp.leg3Km;
            if (comp.leg4Km > 0) dutyObj.leg4Km = comp.leg4Km;
            if ((!dutyObj.kms || dutyObj.kms <= 2) && comp.totalKm > 0) {
              dutyObj.kms = comp.totalKm;
              dutyObj.totalKm = comp.totalKm;
            }
          }
        }
      } catch {
        // gracefully keep defaults
      }

      // Populate structured trips array for day duty
      const trips = [];
      [
        { trainNo: leg1.trainNo, timeFrm: leg1.timeFrom, timeTo: leg1.timeTo, takeoverLocation: leg1.takeoverLoc, handoverLocation: l1To, tripTime: leg1.tripTime, calculatedKms: dutyObj.leg1Km !== '--' ? Number(dutyObj.leg1Km) || 0 : 0 },
        { trainNo: leg2.trainNo, timeFrm: leg2.timeFrom, timeTo: leg2.timeTo, takeoverLocation: l2From, handoverLocation: l2To, tripTime: leg2.tripTime, calculatedKms: dutyObj.leg2Km !== '--' ? Number(dutyObj.leg2Km) || 0 : 0 },
        { trainNo: leg3.trainNo, timeFrm: leg3.timeFrom, timeTo: leg3.timeTo, takeoverLocation: l3From, handoverLocation: l3To, tripTime: leg3.tripTime, calculatedKms: dutyObj.leg3Km !== '--' ? Number(dutyObj.leg3Km) || 0 : 0 },
        { trainNo: leg4.trainNo, timeFrm: leg4.timeFrom, timeTo: leg4.timeTo, takeoverLocation: l4From, handoverLocation: l4To, tripTime: leg4.tripTime, calculatedKms: dutyObj.leg4Km !== '--' ? Number(dutyObj.leg4Km) || 0 : 0 }
      ].forEach(t => {
        if (t.trainNo && t.trainNo !== '--') {
          trips.push(t);
        }
      });
      dutyObj.trips = trips;
    }

    parsedDuties.push(dutyObj);
  }

  return {
    scheduleType: activeSchedule,
    detectedDay,
    sheetName,
    duties: parsedDuties,
    stats: {
      totalDuties: parsedDuties.length,
      totalKms: totalKmsSum,
      withDrivingHours: parsedDuties.filter(d => d.drivingHrs !== '--' && d.drivingHrs !== '00:00:00').length
    },
    warnings: parsedDuties.length === 0 ? ['No duty rows found in sheet.'] : []
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. FIRESTORE PERSISTENCE & SYSTEM-WIDE BROADCAST
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Saves parsed WTT timetable rows into Firestore collection 'wtt_final_matrix'
 * using chunks of 400 operations per batch to satisfy Firestore limits.
 */
export async function saveWttToFirestore(wttRows, scheduleType, onProgress = () => {}) {
  const normSchedule = normalizeScheduleType(scheduleType);
  if (!Array.isArray(wttRows) || wttRows.length === 0) {
    throw new Error('No WTT rows to save.');
  }

  // 0. Immediately mutate in-memory WTT_MASTER_REGISTRY so entire system has new scheduled times with 0ms delay
  try {
    const { WTT_MASTER_REGISTRY } = await import('../data/wttMasterRegistry.js');
    if (Array.isArray(WTT_MASTER_REGISTRY)) {
      const remainingMaster = WTT_MASTER_REGISTRY.filter(r => normalizeScheduleType(r.scheduleType, r.id) !== normSchedule);
      WTT_MASTER_REGISTRY.length = 0;
      WTT_MASTER_REGISTRY.push(...remainingMaster, ...wttRows);
    }
  } catch (err) {
    console.warn('In-memory registry update:', err);
  }

  onProgress({ stage: 'SAVING', message: `Preparing ${wttRows.length} trips...`, progress: 30 });

  // 1. Collect existing documents for this scheduleType to cleanly purge all old data
  const wttCol = collection(db, 'wtt_final_matrix');
  const existingDocIds = new Set();
  const dayTag = normSchedule.toLowerCase();

  // Pre-seed known row IDs from previous editions up to 650 so orphaned rows are purged immediately without waiting
  for (let i = wttRows.length + 1; i <= 650; i++) {
    existingDocIds.add(`wtt_${dayTag}_row_${i}`);
    existingDocIds.add(`wtt_${dayTag}_row_${i}_dn`);
    existingDocIds.add(`wtt_${dayTag}_row_${i}_up`);
  }

  // Fast scoped query with 1.5s timeout protection
  const fetchOldPromise = (async () => {
    try {
      const q = query(wttCol, where('scheduleType', '==', normSchedule));
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ docs: [] }), 1500));
      const snap = await Promise.race([getDocs(q), timeoutPromise]);
      snap.docs.forEach(d => {
        const docId = d.id;
        const docIdLower = docId.toLowerCase();
        if (docIdLower.startsWith(`wtt_${dayTag}`) || docIdLower.includes(dayTag)) {
          existingDocIds.add(docId);
        }
      });
    } catch (err) {
      console.warn('Could not query old wtt_final_matrix documents:', err);
    }
  })();

  // Purge any stale delay incidents for this schedule with 1.5s timeout
  const incRefsToDelete = [];
  const fetchIncPromise = (async () => {
    try {
      const qInc = query(collection(db, 'wtt_live_incidents'), where('scheduleType', '==', normSchedule));
      const timeoutInc = new Promise(resolve => setTimeout(() => resolve({ docs: [] }), 1500));
      const incSnap = await Promise.race([getDocs(qInc), timeoutInc]);
      incSnap.docs.forEach(d => incRefsToDelete.push(d.ref));
    } catch (err) {
      console.warn('Could not query old wtt_live_incidents:', err);
    }
  })();

  // 2. Prepare batches (max 400 ops per batch)
  const BATCH_LIMIT = 400;
  const operations = [];
  const newDocIdsSet = new Set();

  wttRows.forEach(row => {
    // 2a. Save full row document
    const rowDocRef = doc(db, 'wtt_final_matrix', row.id);
    newDocIdsSet.add(row.id);
    operations.push({
      type: 'set',
      ref: rowDocRef,
      data: {
        id: row.id,
        scheduleType: normSchedule,
        rowSeq: row.rowSeq,
        trainId: row.trainId,
        dnTid: row.dnTid || '',
        upTid: row.upTid || '',
        mode: row.mode || row.dnMode || row.upMode || 'ATO',
        dnMode: row.downTrip ? (row.dnMode || row.downTrip?.mode || 'ATO') : '--',
        upMode: row.upTrip ? (row.upMode || row.upTrip?.mode || 'ATO') : '--',
        downTrip: row.downTrip || null,
        upTrip: row.upTrip || null,
        isUploaded: true,
        lastUpdated: serverTimestamp()
      }
    });

    // 2b. Also save direct Down Trip document for telemetry/sub-systems
    if (row.downTrip) {
      const dnDocId = row.downTrip.id || `${row.id}_dn`;
      const dnDocRef = doc(db, 'wtt_final_matrix', dnDocId);
      newDocIdsSet.add(dnDocId);
      operations.push({
        type: 'set',
        ref: dnDocRef,
        data: {
          id: dnDocId,
          parentRowId: row.id,
          trainId: row.downTrip.trainId || row.trainId,
          scheduleType: normSchedule,
          terminalLoopRoute: 'DN',
          mode: row.downTrip.mode || row.dnMode || row.mode || 'ATO',
          stations: row.downTrip.stations || {},
          isUploaded: true,
          lastUpdated: serverTimestamp()
        }
      });
    }

    // 2c. Also save direct Up Trip document for telemetry/sub-systems
    if (row.upTrip) {
      const upDocId = row.upTrip.id || `${row.id}_up`;
      const upDocRef = doc(db, 'wtt_final_matrix', upDocId);
      newDocIdsSet.add(upDocId);
      operations.push({
        type: 'set',
        ref: upDocRef,
        data: {
          id: upDocId,
          parentRowId: row.id,
          trainId: row.upTrip.trainId || row.trainId,
          scheduleType: normSchedule,
          terminalLoopRoute: 'UP',
          mode: row.upTrip.mode || row.upMode || row.mode || 'ATO',
          stations: row.upTrip.stations || {},
          isUploaded: true,
          lastUpdated: serverTimestamp()
        }
      });
    }
  });

  // Await fast fetch of old documents & incidents (max 1.5s)
  await Promise.all([fetchOldPromise, fetchIncPromise]);

  // Delete orphaned / obsolete documents from prior schedule editions
  existingDocIds.forEach(oldId => {
    if (!newDocIdsSet.has(oldId)) {
      operations.push({
        type: 'delete',
        ref: doc(db, 'wtt_final_matrix', oldId)
      });
    }
  });

  // Purge old delay incidents for this schedule so trains are strictly on-schedule
  incRefsToDelete.forEach(ref => {
    operations.push({
      type: 'delete',
      ref: ref
    });
  });

  onProgress({ stage: 'COMMITTING', message: `Committing ${operations.length} operations in parallel...`, progress: 70 });

  // 3. Execute chunked batches concurrently using Promise.all for maximum speed
  const chunks = [];
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    chunks.push(operations.slice(i, i + BATCH_LIMIT));
  }

  await Promise.all(chunks.map(async (chunk) => {
    const batch = writeBatch(db);
    chunk.forEach(op => {
      if (op.type === 'set') {
        // CLEAN OVERWRITE (NO merge: true) to completely replace old scheduled times & stations
        batch.set(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    });
    await batch.commit();
  }));

  onProgress({
    stage: 'COMMITTED',
    progress: 100,
    message: `Deployed ${wttRows.length} trips successfully!`
  });

  return {
    success: true,
    scheduleType: normSchedule,
    savedTripsCount: wttRows.length
  };
}

/**
 * Saves parsed Link Roster duties into Firestore collection 'crew_final_links'
 * using chunks of 400 operations per batch to satisfy Firestore limits.
 */
export async function saveLinkRosterToFirestore(duties, scheduleType, onProgress = () => {}, options = { eraseOld: true }) {
  const normSchedule = normalizeScheduleType(scheduleType);
  if (!Array.isArray(duties) || duties.length === 0) {
    throw new Error('No Link Roster duties to save.');
  }

  onProgress({ stage: 'FETCH_EXISTING', message: 'Checking existing link roster in Firestore...' });

  const linksCol = collection(db, 'crew_final_links');
  const q = query(linksCol, where('scheduleType', '==', normSchedule));
  const existingSnap = await getDocs(q);
  const existingDocIds = new Set(existingSnap.docs.map(d => d.id));

  // Pre-seed common IDs up to 150 for this schedule to ensure complete purge of older editions
  const dayTag = normSchedule.toLowerCase();
  for (let i = 1; i <= 150; i++) {
    const pad = String(i).padStart(2, '0');
    existingDocIds.add(`link_${dayTag}_duty_${i}`);
    existingDocIds.add(`link_${dayTag}_duty_${pad}`);
    existingDocIds.add(`duty_${dayTag}_${i}`);
    existingDocIds.add(`duty_${dayTag}_${pad}`);
  }

  onProgress({ stage: 'SAVING', message: `Writing ${duties.length} duties to Firestore...` });

  const BATCH_LIMIT = 400;
  const operations = [];

  duties.forEach(duty => {
    const docRef = doc(db, 'crew_final_links', duty.id);
    operations.push({
      type: 'set',
      ref: docRef,
      data: {
        ...duty,
        scheduleType: normSchedule,
        isUploaded: true,
        lastModified: serverTimestamp()
      }
    });
    existingDocIds.delete(duty.id);
  });

  // Delete orphaned duties from previous schedule edition for that day
  if (options.eraseOld !== false) {
    existingDocIds.forEach(oldId => {
      operations.push({
        type: 'delete',
        ref: doc(db, 'crew_final_links', oldId)
      });
    });
  }

  let committedCount = 0;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);

    chunk.forEach(op => {
      if (op.type === 'set') {
        // Clean overwrite (NO merge) so only latest uploaded duty fields are kept
        batch.set(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    });

    await batch.commit();
    committedCount += chunk.length;
    onProgress({
      stage: 'COMMITTED',
      progress: Math.min(100, Math.round((committedCount / operations.length) * 100)),
      message: `Committed ${committedCount} of ${operations.length} duties...`
    });
  }

  // Synchronize in-memory canonical registry so all Line 2 crew controls reflect new roster immediately
  try {
    const { getMasterLinksForDay } = await import('../data/canonicalDayLinksRegistry.js');
    const dayLinks = getMasterLinksForDay(normSchedule);
    if (Array.isArray(dayLinks)) {
      dayLinks.length = 0;
      dayLinks.push(...duties);
    }
  } catch (err) {
    console.warn('In-memory canonical links update:', err);
  }

  // Auto-sync dynamic night changeover links across transition pairs (e.g. WEEKDAY ➔ SATURDAY, SATURDAY ➔ SUNDAY, etc.)
  try {
    const { syncLinkRosterWithChangeoverTransitions } = await import('./changeoverService.js');
    await syncLinkRosterWithChangeoverTransitions(normSchedule, duties);
  } catch (err) {
    console.warn('Auto-sync changeover transitions warning:', err);
  }

  // Broadcast system-wide event for all Line 2 crew controls & dashboards
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pyidcc:link_roster_updated', {
        detail: { scheduleType: normSchedule, duties, timestamp: Date.now() }
      }));
    }
  } catch {}

  return {
    success: true,
    scheduleType: normSchedule,
    savedDutiesCount: duties.length
  };
}

/**
 * Erases all old WTT timetable records for a specific schedule day from Firestore and in-memory registry.
 */
export async function clearWttScheduleForDay(scheduleType, onProgress = () => {}) {
  const normSchedule = normalizeScheduleType(scheduleType);
  const dayTag = normSchedule.toLowerCase();

  onProgress({ stage: 'CLEARING', message: `Erasing old ${normSchedule} WTT data...`, progress: 20 });

  // 1. Clear from in-memory WTT_MASTER_REGISTRY
  try {
    const { WTT_MASTER_REGISTRY } = await import('../data/wttMasterRegistry.js');
    if (Array.isArray(WTT_MASTER_REGISTRY)) {
      const remaining = WTT_MASTER_REGISTRY.filter(r => normalizeScheduleType(r.scheduleType, r.id) !== normSchedule);
      WTT_MASTER_REGISTRY.length = 0;
      WTT_MASTER_REGISTRY.push(...remaining);
    }
  } catch (err) {
    console.warn('In-memory registry clear warning:', err);
  }

  // 2. Query all existing Firestore docs for this day in wtt_final_matrix
  const wttCol = collection(db, 'wtt_final_matrix');
  const docRefsToDelete = [];

  try {
    const q = query(wttCol, where('scheduleType', '==', normSchedule));
    const snap = await getDocs(q);
    snap.docs.forEach(d => docRefsToDelete.push(d.ref));
  } catch (err) {
    console.warn('Query wtt_final_matrix for clear error:', err);
  }

  // Pre-seed known row IDs up to 650 so orphaned rows are purged even if unindexed
  for (let i = 1; i <= 650; i++) {
    docRefsToDelete.push(doc(db, 'wtt_final_matrix', `wtt_${dayTag}_row_${i}`));
    docRefsToDelete.push(doc(db, 'wtt_final_matrix', `wtt_${dayTag}_row_${i}_dn`));
    docRefsToDelete.push(doc(db, 'wtt_final_matrix', `wtt_${dayTag}_row_${i}_up`));
  }

  // Deduplicate refs by path
  const uniqueRefs = Array.from(new Map(docRefsToDelete.map(r => [r.path, r])).values());

  // Also clear live incidents for this schedule
  try {
    const qInc = query(collection(db, 'wtt_live_incidents'), where('scheduleType', '==', normSchedule));
    const incSnap = await getDocs(qInc);
    incSnap.docs.forEach(d => uniqueRefs.push(d.ref));
  } catch (err) {
    console.warn('Query incidents error:', err);
  }

  const BATCH_LIMIT = 400;
  for (let i = 0; i < uniqueRefs.length; i += BATCH_LIMIT) {
    const chunk = uniqueRefs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(r => batch.delete(r));
    await batch.commit();
  }

  onProgress({ stage: 'CLEARED', message: `Old ${normSchedule} WTT data erased successfully.`, progress: 100 });
  return { success: true, scheduleType: normSchedule };
}

/**
 * Erases all old Link Roster duties for a specific schedule day from Firestore.
 */
export async function clearLinkRosterForDay(scheduleType, onProgress = () => {}) {
  const normSchedule = normalizeScheduleType(scheduleType);
  const dayTag = normSchedule.toLowerCase();

  onProgress({ stage: 'CLEARING', message: `Erasing old ${normSchedule} Link Roster data...`, progress: 20 });

  const linksCol = collection(db, 'crew_final_links');
  const docRefsToDelete = [];

  try {
    const q = query(linksCol, where('scheduleType', '==', normSchedule));
    const snap = await getDocs(q);
    snap.docs.forEach(d => docRefsToDelete.push(d.ref));
  } catch (err) {
    console.warn('Query crew_final_links for clear error:', err);
  }

  // Pre-seed known duty IDs up to 150 (both padded and unpadded)
  for (let i = 1; i <= 150; i++) {
    const pad = String(i).padStart(2, '0');
    docRefsToDelete.push(doc(db, 'crew_final_links', `link_${dayTag}_duty_${i}`));
    docRefsToDelete.push(doc(db, 'crew_final_links', `link_${dayTag}_duty_${pad}`));
    docRefsToDelete.push(doc(db, 'crew_final_links', `duty_${dayTag}_${i}`));
    docRefsToDelete.push(doc(db, 'crew_final_links', `duty_${dayTag}_${pad}`));
  }

  const uniqueRefs = Array.from(new Map(docRefsToDelete.map(r => [r.path, r])).values());

  const BATCH_LIMIT = 400;
  for (let i = 0; i < uniqueRefs.length; i += BATCH_LIMIT) {
    const chunk = uniqueRefs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach(r => batch.delete(r));
    await batch.commit();
  }

  onProgress({ stage: 'CLEARED', message: `Old ${normSchedule} Link Roster erased successfully.`, progress: 100 });
  return { success: true, scheduleType: normSchedule };
}

