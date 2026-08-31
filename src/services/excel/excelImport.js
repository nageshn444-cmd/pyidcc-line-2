/**
 * Enterprise Excel Import Service
 * Handles XLSX/CSV parsing on-demand and converts PYIDCC operational data into spreadsheet worksheets.
 */

import { colIndexToLetter } from './formulaEngine';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { WTT_MASTER_REGISTRY } from '../../data/wttMasterRegistry';

/**
 * Parses an uploaded File (.xlsx, .xls, .csv) into workbook sheet objects.
 * Uses dynamic import('xlsx') for lazy-loaded performance.
 */
export async function parseExcelFile(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellFormula: true,
    cellStyles: true,
    cellDates: true
  });

  const parsedSheets = {};
  let firstSheetId = null;

  workbook.SheetNames.forEach((name, idx) => {
    const ws = workbook.Sheets[name];
    const sheetId = `sheet_${Date.now()}_${idx}`;
    if (!firstSheetId) firstSheetId = sheetId;

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z50');
    const rowCount = Math.max(50, range.e.r + 1);
    const colCount = Math.max(26, range.e.c + 1);
    const data = {};

    for (let r = 0; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = ws[cellAddress];
        if (cell) {
          const raw = cell.f ? `=${cell.f}` : (cell.v !== undefined ? cell.v : '');
          const val = cell.v !== undefined ? cell.v : (cell.w || '');
          data[cellAddress] = {
            raw: String(raw),
            value: val,
            type: cell.t || 's',
            bold: Boolean(cell.s?.font?.bold),
            italic: Boolean(cell.s?.font?.italic)
          };
        }
      }
    }

    parsedSheets[sheetId] = {
      id: sheetId,
      name,
      rowCount,
      colCount,
      data,
      colWidths: {},
      rowHeights: {},
      frozenRows: 0,
      frozenCols: 0,
      merges: ws['!merges'] ? ws['!merges'].map(m => XLSX.utils.encode_range(m)) : []
    };
  });

  return {
    id: `wb_${Date.now()}`,
    name: file.name.replace(/\.[^/.]+$/, ''),
    activeSheetId: firstSheetId,
    sheets: parsedSheets,
    version: 1,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Converts a 2D Array of rows into a clean Sheet object.
 */
export function matrixToSheet(sheetName, matrix, headerRow = true) {
  const sheetId = `sheet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const rowCount = Math.max(50, matrix.length + 10);
  const colCount = Math.max(26, Math.max(...matrix.map(r => r.length), 0) + 5);
  const data = {};

  matrix.forEach((row, rIdx) => {
    row.forEach((val, cIdx) => {
      if (val !== null && val !== undefined && val !== '') {
        const key = `${colIndexToLetter(cIdx)}${rIdx + 1}`;
        const strVal = String(val);
        const isFormula = strVal.startsWith('=');
        data[key] = {
          raw: strVal,
          value: isFormula ? strVal : (isNaN(Number(val)) ? val : Number(val)),
          bold: headerRow && rIdx === 0,
          type: typeof val === 'number' ? 'n' : 's'
        };
      }
    });
  });

  return {
    id: sheetId,
    name: sheetName,
    rowCount,
    colCount,
    data,
    colWidths: {},
    rowHeights: {},
    frozenRows: headerRow ? 1 : 0,
    frozenCols: 0,
    merges: []
  };
}

/**
 * Creates a ready-to-use worksheet populated with the active PYIDCC Crew Directory.
 */
export function generateCrewRegistrySheet(crewList = EMPLOYEE_MASTER_REGISTRY) {
  const headers = ['Emp ID', 'Staff Name', 'Gender', 'Status', 'Fixed WO', 'Night Target', 'Competency', 'Base Depot', 'Role'];
  const rows = [headers];

  crewList.forEach(emp => {
    rows.push([
      emp.empId || '',
      emp.name || '',
      emp.gender || 'MALE',
      emp.status || 'ACTIVE',
      emp.fixedWo || 'MON',
      emp.nightTarget || 6,
      emp.competency || 'MAINLINE_CERTIFIED',
      emp.boardingStation || 'PYID',
      emp.role || 'Train Operator'
    ]);
  });

  return matrixToSheet('Crew Registry', rows, true);
}

/**
 * Creates a ready-to-use worksheet populated with WTT Master Schedule (Weekday / Monday / Sat / Sun).
 */
export function generateWttScheduleSheet(dayKey = 'WEEKDAY') {
  const timetable = WTT_MASTER_REGISTRY[dayKey] || WTT_MASTER_REGISTRY.WEEKDAY || [];
  const headers = [
    'Trip No', 'Down Train', 'Down Dept', 'Down Arrival', 'Down Origin', 'Down Dest', 'Down KMS',
    'Up Train', 'Up Dept', 'Up Arrival', 'Up Origin', 'Up Dest', 'Up KMS'
  ];
  const rows = [headers];

  timetable.slice(0, 350).forEach((row, idx) => {
    const dn = row.downTrip || {};
    const up = row.upTrip || {};
    rows.push([
      idx + 1,
      dn.trainNo || dn.tripNo || '',
      dn.departure || dn.depTime || '',
      dn.arrival || dn.arrTime || '',
      dn.from || dn.origin || 'NAGASANDRA',
      dn.to || dn.dest || 'SILK INSTITUTE',
      dn.distance || 30.5,
      up.trainNo || up.tripNo || '',
      up.departure || up.depTime || '',
      up.arrival || up.arrTime || '',
      up.from || up.origin || 'SILK INSTITUTE',
      up.to || up.dest || 'NAGASANDRA',
      up.distance || 30.5
    ]);
  });

  return matrixToSheet(`WTT ${dayKey}`, rows, true);
}
