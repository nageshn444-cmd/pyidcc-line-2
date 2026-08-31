import { Parser } from 'hot-formula-parser';

/**
 * Converts 0-based column index to Excel column letter (0 -> 'A', 25 -> 'Z', 26 -> 'AA', etc.)
 */
export function colIndexToLetter(colIndex) {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Converts Excel column letter to 0-based index ('A' -> 0, 'Z' -> 25, 'AA' -> 26, etc.)
 */
export function letterToColIndex(letter) {
  let column = 0;
  const str = String(letter).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    column = column * 26 + (str.charCodeAt(i) - 64);
  }
  return column - 1;
}

/**
 * Formats row and col index to cell key, e.g. (0, 0) -> "A1"
 */
export function cellCoordsToKey(row, col) {
  return `${colIndexToLetter(col)}${row + 1}`;
}

/**
 * Parses cell key to row and col index, e.g. "B5" -> { row: 4, col: 1 }
 */
export function keyToCellCoords(key) {
  if (!key || typeof key !== 'string') return { row: 0, col: 0 };
  const match = key.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { row: 0, col: 0 };
  return {
    col: letterToColIndex(match[1]),
    row: parseInt(match[2], 10) - 1
  };
}

/**
 * Evaluates a single formula string using the workbook context.
 *
 * @param {string} formula - The formula string (e.g. "=SUM(A1:A10)")
 * @param {object} workbook - The full workbook state object
 * @param {string} currentSheetId - The active sheet ID
 * @param {Set<string>} callStack - Call stack tracking for circular dependency detection
 * @returns {any} Result value or error string (e.g. '#CIRCULAR!', '#ERROR!')
 */
export function evaluateFormula(formula, workbook, currentSheetId, callStack = new Set()) {
  if (!formula || typeof formula !== 'string') return formula;
  const rawExpression = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim();
  if (!rawExpression) return '';

  const parser = new Parser();

  // Helper to resolve sheet data given an optional sheet name
  const resolveSheet = (sheetName) => {
    if (!sheetName) return workbook?.sheets?.[currentSheetId];
    const cleanName = String(sheetName).replace(/^['"]|['"]$/g, '').trim().toLowerCase();
    const sheets = Object.values(workbook?.sheets || {});
    return sheets.find(s => s.name?.toLowerCase() === cleanName) || workbook?.sheets?.[currentSheetId];
  };

  // Helper to extract numeric or typed value from cell data
  const getCellValue = (sheet, cellKey) => {
    if (!sheet || !sheet.data) return 0;
    const cell = sheet.data[cellKey];
    if (!cell) return 0;
    
    // If cell contains a formula, evaluate it recursively with circular check
    const cellRaw = String(cell.raw ?? cell.value ?? '');
    if (cellRaw.startsWith('=')) {
      const callKey = `${sheet.id}:${cellKey}`;
      if (callStack.has(callKey)) {
        return '#CIRCULAR!';
      }
      const nextStack = new Set(callStack);
      nextStack.add(callKey);
      return evaluateFormula(cellRaw, workbook, sheet.id, nextStack);
    }

    const val = cell.value ?? cell.raw;
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val;
    const num = Number(val);
    return isNaN(num) ? val : num;
  };

  // 1. Single cell reference handler
  parser.on('callCellValue', (cellCoord, done) => {
    const sheet = resolveSheet(cellCoord.sheet);
    const colLetter = colIndexToLetter(cellCoord.column.index);
    const rowNum = cellCoord.row.index + 1;
    const key = `${colLetter}${rowNum}`;
    const value = getCellValue(sheet, key);
    done(value);
  });

  // 2. Range reference handler (e.g. A1:B10)
  parser.on('callRangeValue', (startCellCoord, endCellCoord, done) => {
    const sheet = resolveSheet(startCellCoord.sheet || endCellCoord.sheet);
    const minRow = Math.min(startCellCoord.row.index, endCellCoord.row.index);
    const maxRow = Math.max(startCellCoord.row.index, endCellCoord.row.index);
    const minCol = Math.min(startCellCoord.column.index, endCellCoord.column.index);
    const maxCol = Math.max(startCellCoord.column.index, endCellCoord.column.index);

    const matrix = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowArr = [];
      for (let c = minCol; c <= maxCol; c++) {
        const key = `${colIndexToLetter(c)}${r + 1}`;
        rowArr.push(getCellValue(sheet, key));
      }
      matrix.push(rowArr);
    }
    done(matrix);
  });

  try {
    const parsed = parser.parse(rawExpression);
    if (parsed.error) {
      return String(parsed.error);
    }
    return parsed.result !== undefined ? parsed.result : '';
  } catch (err) {
    return '#ERROR!';
  }
}

/**
 * Recalculates all formula cells in a specific sheet.
 */
export function recalculateSheetFormulas(sheet, workbook) {
  if (!sheet || !sheet.data) return sheet;
  const nextData = { ...sheet.data };
  let hasChanges = false;

  Object.entries(sheet.data).forEach(([key, cell]) => {
    const raw = String(cell?.raw ?? '');
    if (raw.startsWith('=')) {
      const computed = evaluateFormula(raw, workbook, sheet.id);
      if (cell.value !== computed) {
        nextData[key] = {
          ...cell,
          value: computed
        };
        hasChanges = true;
      }
    }
  });

  return hasChanges ? { ...sheet, data: nextData } : sheet;
}
