/**
 * Enterprise Excel Export Service
 * Exports multi-sheet workbooks to .xlsx, .csv, and printable layouts.
 * Uses dynamic import('xlsx') for lazy-loaded performance.
 */

import { colIndexToLetter, letterToColIndex } from './formulaEngine';

/**
 * Exports entire workbook (all worksheets) to a .xlsx file.
 */
export async function exportWorkbookToExcel(workbook, filename = '') {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const sheets = Object.values(workbook.sheets || {});
  sheets.forEach(sheet => {
    const wsData = [];
    const maxRow = sheet.rowCount || 50;
    const maxCol = sheet.colCount || 26;

    for (let r = 0; r < maxRow; r++) {
      const rowArr = [];
      let hasRowContent = false;
      for (let c = 0; c < maxCol; c++) {
        const key = `${colIndexToLetter(c)}${r + 1}`;
        const cell = sheet.data?.[key];
        const val = cell?.value !== undefined ? cell.value : (cell?.raw || '');
        rowArr.push(val);
        if (val !== '' && val !== null && val !== undefined) hasRowContent = true;
      }
      wsData.push(rowArr);
    }

    // Trim trailing empty rows
    while (wsData.length > 0 && wsData[wsData.length - 1].every(v => v === '' || v === null)) {
      wsData.pop();
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply column widths if specified
    if (sheet.colWidths && Object.keys(sheet.colWidths).length > 0) {
      ws['!cols'] = [];
      for (let c = 0; c < maxCol; c++) {
        const colLetter = colIndexToLetter(c);
        const w = sheet.colWidths[colLetter];
        ws['!cols'].push({ wch: w ? Math.round(w / 8) : 12 });
      }
    }

    // Apply merges if any
    if (sheet.merges && sheet.merges.length > 0) {
      ws['!merges'] = sheet.merges.map(m => XLSX.utils.decode_range(m));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)); // Excel 31-char sheet name limit
  });

  const outName = (filename || workbook.name || 'PYIDCC_Spreadsheet').replace(/\.xlsx$/, '') + '.xlsx';
  XLSX.writeFile(wb, outName);
}

/**
 * Exports a single sheet to a CSV file.
 */
export async function exportSheetToCsv(sheet, filename = '') {
  const XLSX = await import('xlsx');
  const wsData = [];
  const maxRow = sheet.rowCount || 50;
  const maxCol = sheet.colCount || 26;

  for (let r = 0; r < maxRow; r++) {
    const rowArr = [];
    for (let c = 0; c < maxCol; c++) {
      const key = `${colIndexToLetter(c)}${r + 1}`;
      const cell = sheet.data?.[key];
      rowArr.push(cell?.value !== undefined ? cell.value : (cell?.raw || ''));
    }
    wsData.push(rowArr);
  }

  while (wsData.length > 0 && wsData[wsData.length - 1].every(v => v === '' || v === null)) {
    wsData.pop();
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const csv = XLSX.utils.sheet_to_csv(ws);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${(filename || sheet.name || 'Sheet').replace(/\.csv$/, '')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers window print for spreadsheet data.
 */
export function printSpreadsheet(sheetName) {
  const originalTitle = document.title;
  document.title = `${sheetName} - PYIDCC Line 2 Crew Control`;
  window.print();
  document.title = originalTitle;
}
