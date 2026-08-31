import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import ExcelToolbar from '../components/excel/ExcelToolbar';
import ExcelFormulaBar from '../components/excel/ExcelFormulaBar';
import ExcelGrid from '../components/excel/ExcelGrid';
import ExcelSheetTabs from '../components/excel/ExcelSheetTabs';
import ExcelStatusBar from '../components/excel/ExcelStatusBar';
import ExcelImportDialog from '../components/excel/ExcelImportDialog';
import ExcelExportDialog from '../components/excel/ExcelExportDialog';
import ExcelFindReplace from '../components/excel/ExcelFindReplace';

import { 
  cellCoordsToKey, 
  keyToCellCoords, 
  colIndexToLetter, 
  evaluateFormula, 
  recalculateSheetFormulas 
} from '../services/excel/formulaEngine';
import { 
  saveWorkbookLocally, 
  loadLastActiveWorkbook 
} from '../services/excel/excelStorage';
import { 
  saveWorkbookToFirestore 
} from '../services/excel/excelFirebase';
import { 
  parseExcelFile, 
  generateCrewRegistrySheet, 
  generateWttScheduleSheet 
} from '../services/excel/excelImport';
import { 
  exportWorkbookToExcel, 
  exportSheetToCsv, 
  printSpreadsheet 
} from '../services/excel/excelExport';
import { logExcelAction } from '../services/excel/excelAudit';

// Default starter workbook
function createDefaultWorkbook() {
  const defaultSheetId = 'sheet_default_1';
  return {
    id: `wb_${Date.now()}`,
    name: 'BMRCL Line 2 Master Spreadsheet',
    activeSheetId: defaultSheetId,
    sheets: {
      [defaultSheetId]: {
        id: defaultSheetId,
        name: 'Sheet1',
        rowCount: 100,
        colCount: 26,
        data: {
          A1: { raw: 'BMRCL LINE 2 — ENTERPRISE SPREADSHEET', value: 'BMRCL LINE 2 — ENTERPRISE SPREADSHEET', bold: true, type: 's' },
          A2: { raw: 'Train Operator', value: 'Train Operator', bold: true, type: 's' },
          B2: { raw: 'Trips', value: 'Trips', bold: true, type: 's' },
          C2: { raw: 'Kilometers', value: 'Kilometers', bold: true, type: 's' },
          D2: { raw: 'Night Shifts', value: 'Night Shifts', bold: true, type: 's' },
          A3: { raw: 'Operator A', value: 'Operator A', type: 's' },
          B3: { raw: '4', value: 4, type: 'n' },
          C3: { raw: '122.4', value: 122.4, type: 'n' },
          D3: { raw: '2', value: 2, type: 'n' },
          A4: { raw: 'Operator B', value: 'Operator B', type: 's' },
          B4: { raw: '5', value: 5, type: 'n' },
          C4: { raw: '153.0', value: 153.0, type: 'n' },
          D4: { raw: '1', value: 1, type: 'n' },
          A5: { raw: 'Total', value: 'Total', bold: true, type: 's' },
          B5: { raw: '=SUM(B3:B4)', value: 9, bold: true, type: 'n' },
          C5: { raw: '=SUM(C3:C4)', value: 275.4, bold: true, type: 'n' },
          D5: { raw: '=SUM(D3:D4)', value: 3, bold: true, type: 'n' }
        },
        colWidths: { A: 180, B: 90, C: 110, D: 110 },
        rowHeights: { 0: 32, 1: 28 },
        frozenRows: 0,
        frozenCols: 0,
        merges: []
      }
    },
    version: 1,
    updatedAt: new Date().toISOString()
  };
}

export default function ExcelWorkspace() {
  const auth = useAuth();
  const currentUser = auth?.currentUser;

  // Primary Workbook State
  const [workbook, setWorkbook] = useState(() => createDefaultWorkbook());
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [selectedRange, setSelectedRange] = useState({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

  // Inline Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [formulaBarValue, setFormulaBarValue] = useState('');

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Save status & local restore
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [lastSavedTime, setLastSavedTime] = useState('');
  const [zoom, setZoom] = useState(100);

  // Dialog states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);

  // Active sheet reference
  const currentSheet = useMemo(() => {
    return workbook.sheets[workbook.activeSheetId] || Object.values(workbook.sheets)[0];
  }, [workbook]);

  const activeCellKey = useMemo(() => {
    return cellCoordsToKey(activeCell.row, activeCell.col);
  }, [activeCell]);

  // Load previous session on mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const lastWb = await loadLastActiveWorkbook();
        if (lastWb && lastWb.sheets && Object.keys(lastWb.sheets).length > 0) {
          setWorkbook(lastWb);
          setLastSavedTime(new Date(lastWb.updatedAt || Date.now()).toLocaleTimeString());
        }
      } catch (_) {}
    }
    restoreSession();
  }, []);

  // Update formula bar when active cell changes
  useEffect(() => {
    if (!isEditing && currentSheet?.data) {
      const cell = currentSheet.data[activeCellKey];
      const raw = cell?.raw ?? cell?.value ?? '';
      setFormulaBarValue(String(raw));
    }
  }, [activeCellKey, currentSheet, isEditing]);

  // Debounced auto-save to IndexedDB
  const autoSaveTimeoutRef = useRef(null);
  const triggerAutoSave = useCallback((updatedWb) => {
    setSaveStatus('Saving...');
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveWorkbookLocally(updatedWb);
        setSaveStatus('Saved');
        setLastSavedTime(new Date().toLocaleTimeString());
      } catch (err) {
        setSaveStatus('Save Failed');
      }
    }, 1200);
  }, []);

  // Push state snapshot to undo stack
  const pushUndo = useCallback((prevWb) => {
    setUndoStack(prev => [...prev.slice(-25), JSON.parse(JSON.stringify(prevWb))]);
    setRedoStack([]);
  }, []);

  // Cell Selection Handlers
  const handleSelectCell = useCallback((row, col) => {
    setActiveCell({ row, col });
    setSelectedRange({ startRow: row, startCol: col, endRow: row, endCol: col });
    setIsEditing(false);
  }, []);

  const handleSelectRange = useCallback((range) => {
    setSelectedRange(range);
    setActiveCell({ row: range.endRow, col: range.endCol });
  }, []);

  // Edit Handlers
  const handleStartEdit = useCallback((initialChar = '') => {
    const cell = currentSheet?.data?.[activeCellKey];
    const rawVal = initialChar || (cell?.raw ?? cell?.value ?? '');
    setEditValue(String(rawVal));
    setIsEditing(true);
  }, [currentSheet, activeCellKey]);

  const handleCommitEdit = useCallback(() => {
    if (!isEditing) return;
    setIsEditing(false);

    pushUndo(workbook);

    const valStr = editValue.trim();
    const isFormula = valStr.startsWith('=');
    let computedVal = valStr;

    if (isFormula) {
      computedVal = evaluateFormula(valStr, workbook, currentSheet.id);
    } else {
      const num = Number(valStr);
      if (!isNaN(num) && valStr !== '') {
        computedVal = num;
      }
    }

    const nextSheet = {
      ...currentSheet,
      data: {
        ...currentSheet.data,
        [activeCellKey]: {
          ...(currentSheet.data?.[activeCellKey] || {}),
          raw: valStr,
          value: computedVal,
          type: isFormula ? 'f' : (typeof computedVal === 'number' ? 'n' : 's')
        }
      }
    };

    // Recalculate any dependent formulas in this sheet
    const recalculatedSheet = recalculateSheetFormulas(nextSheet, workbook);

    const nextWorkbook = {
      ...workbook,
      sheets: {
        ...workbook.sheets,
        [currentSheet.id]: recalculatedSheet
      }
    };

    setWorkbook(nextWorkbook);
    triggerAutoSave(nextWorkbook);
  }, [isEditing, editValue, workbook, currentSheet, activeCellKey, pushUndo, triggerAutoSave]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    const cell = currentSheet?.data?.[activeCellKey];
    setEditValue(String(cell?.raw ?? cell?.value ?? ''));
  }, [currentSheet, activeCellKey]);

  // Undo / Redo Handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(workbook))]);
    setWorkbook(prev);
    triggerAutoSave(prev);
  }, [undoStack, workbook, triggerAutoSave]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(workbook))]);
    setWorkbook(next);
    triggerAutoSave(next);
  }, [redoStack, workbook, triggerAutoSave]);

  // Format Toggles (Bold, Italic, Underline, Align, Number Format)
  const handleToggleFormat = useCallback((formatProp) => {
    pushUndo(workbook);
    const cell = currentSheet?.data?.[activeCellKey] || {};
    const nextVal = !cell[formatProp];

    const nextSheet = {
      ...currentSheet,
      data: {
        ...currentSheet.data,
        [activeCellKey]: {
          ...cell,
          [formatProp]: nextVal
        }
      }
    };

    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCellKey, pushUndo, triggerAutoSave]);

  const handleSetTextAlign = useCallback((align) => {
    pushUndo(workbook);
    const cell = currentSheet?.data?.[activeCellKey] || {};
    const nextSheet = {
      ...currentSheet,
      data: {
        ...currentSheet.data,
        [activeCellKey]: { ...cell, textAlign: align }
      }
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCellKey, pushUndo, triggerAutoSave]);

  const handleSetNumberFormat = useCallback((format) => {
    pushUndo(workbook);
    const cell = currentSheet?.data?.[activeCellKey] || {};
    const nextSheet = {
      ...currentSheet,
      data: {
        ...currentSheet.data,
        [activeCellKey]: { ...cell, numberFormat: format }
      }
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCellKey, pushUndo, triggerAutoSave]);

  // Row & Col Operations
  const handleInsertRow = useCallback(() => {
    pushUndo(workbook);
    const targetRow = activeCell.row;
    const nextData = {};

    Object.entries(currentSheet.data || {}).forEach(([key, cell]) => {
      const coords = keyToCellCoords(key);
      if (coords.row >= targetRow) {
        const newKey = cellCoordsToKey(coords.row + 1, coords.col);
        nextData[newKey] = cell;
      } else {
        nextData[key] = cell;
      }
    });

    const nextSheet = {
      ...currentSheet,
      rowCount: currentSheet.rowCount + 1,
      data: nextData
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCell.row, pushUndo, triggerAutoSave]);

  const handleDeleteRow = useCallback(() => {
    pushUndo(workbook);
    const targetRow = activeCell.row;
    const nextData = {};

    Object.entries(currentSheet.data || {}).forEach(([key, cell]) => {
      const coords = keyToCellCoords(key);
      if (coords.row === targetRow) {
        // Skip deleted row
      } else if (coords.row > targetRow) {
        const newKey = cellCoordsToKey(coords.row - 1, coords.col);
        nextData[newKey] = cell;
      } else {
        nextData[key] = cell;
      }
    });

    const nextSheet = {
      ...currentSheet,
      rowCount: Math.max(1, currentSheet.rowCount - 1),
      data: nextData
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCell.row, pushUndo, triggerAutoSave]);

  const handleInsertCol = useCallback(() => {
    pushUndo(workbook);
    const targetCol = activeCell.col;
    const nextData = {};

    Object.entries(currentSheet.data || {}).forEach(([key, cell]) => {
      const coords = keyToCellCoords(key);
      if (coords.col >= targetCol) {
        const newKey = cellCoordsToKey(coords.row, coords.col + 1);
        nextData[newKey] = cell;
      } else {
        nextData[key] = cell;
      }
    });

    const nextSheet = {
      ...currentSheet,
      colCount: currentSheet.colCount + 1,
      data: nextData
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCell.col, pushUndo, triggerAutoSave]);

  const handleDeleteCol = useCallback(() => {
    pushUndo(workbook);
    const targetCol = activeCell.col;
    const nextData = {};

    Object.entries(currentSheet.data || {}).forEach(([key, cell]) => {
      const coords = keyToCellCoords(key);
      if (coords.col === targetCol) {
        // Skip deleted col
      } else if (coords.col > targetCol) {
        const newKey = cellCoordsToKey(coords.row, coords.col - 1);
        nextData[newKey] = cell;
      } else {
        nextData[key] = cell;
      }
    });

    const nextSheet = {
      ...currentSheet,
      colCount: Math.max(1, currentSheet.colCount - 1),
      data: nextData
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, activeCell.col, pushUndo, triggerAutoSave]);

  const handleResizeCol = useCallback((colLetter, width) => {
    const nextSheet = {
      ...currentSheet,
      colWidths: { ...(currentSheet.colWidths || {}), [colLetter]: width }
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, triggerAutoSave]);

  const handleResizeRow = useCallback((rowIdx, height) => {
    const nextSheet = {
      ...currentSheet,
      rowHeights: { ...(currentSheet.rowHeights || {}), [rowIdx]: height }
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, triggerAutoSave]);

  // Autofill Handler (Extends selection or series)
  const handleAutofill = useCallback((srcRange, targetRange) => {
    pushUndo(workbook);
    const nextData = { ...currentSheet.data };

    const minSrcR = Math.min(srcRange.startRow, srcRange.endRow);
    const maxSrcR = Math.max(srcRange.startRow, srcRange.endRow);
    const minSrcC = Math.min(srcRange.startCol, srcRange.endCol);
    const maxSrcC = Math.max(srcRange.startCol, srcRange.endCol);

    const srcHeight = maxSrcR - minSrcR + 1;
    const srcWidth = maxSrcC - minSrcC + 1;

    for (let r = targetRange.startRow; r <= targetRange.endRow; r++) {
      for (let c = targetRange.startCol; c <= targetRange.endCol; c++) {
        // Map back to corresponding source cell
        const relR = (r - targetRange.startRow) % srcHeight;
        const relC = (c - targetRange.startCol) % srcWidth;
        const srcKey = cellCoordsToKey(minSrcR + relR, minSrcC + relC);
        const targetKey = cellCoordsToKey(r, c);

        const srcCell = currentSheet.data?.[srcKey];
        if (srcCell) {
          nextData[targetKey] = {
            ...srcCell,
            raw: srcCell.raw,
            value: srcCell.value
          };
        }
      }
    }

    const nextSheet = recalculateSheetFormulas({ ...currentSheet, data: nextData }, workbook);
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    setSelectedRange(targetRange);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, pushUndo, triggerAutoSave]);

  // Copy & Paste Handlers
  const handleCopy = useCallback(() => {
    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

    const lines = [];
    for (let r = minR; r <= maxR; r++) {
      const rowVals = [];
      for (let c = minC; c <= maxC; c++) {
        const key = cellCoordsToKey(r, c);
        const cell = currentSheet.data?.[key];
        rowVals.push(cell?.raw ?? cell?.value ?? '');
      }
      lines.push(rowVals.join('\t'));
    }

    const tsv = lines.join('\n');
    try {
      navigator.clipboard.writeText(tsv);
    } catch (_) {}
  }, [selectedRange, currentSheet]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      pushUndo(workbook);

      const rows = text.split(/\r?\n/).map(r => r.split('\t'));
      const startR = activeCell.row;
      const startC = activeCell.col;
      const nextData = { ...currentSheet.data };

      rows.forEach((row, rOffset) => {
        row.forEach((val, cOffset) => {
          const r = startR + rOffset;
          const c = startC + cOffset;
          if (r < currentSheet.rowCount && c < currentSheet.colCount) {
            const key = cellCoordsToKey(r, c);
            const isNum = !isNaN(Number(val)) && val.trim() !== '';
            nextData[key] = {
              raw: val,
              value: isNum ? Number(val) : val,
              type: isNum ? 'n' : 's'
            };
          }
        });
      });

      const nextSheet = recalculateSheetFormulas({ ...currentSheet, data: nextData }, workbook);
      const nextWb = {
        ...workbook,
        sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
      };
      setWorkbook(nextWb);
      triggerAutoSave(nextWb);
    } catch (_) {}
  }, [workbook, currentSheet, activeCell, pushUndo, triggerAutoSave]);

  const handleClearSelection = useCallback(() => {
    pushUndo(workbook);
    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

    const nextData = { ...currentSheet.data };
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        delete nextData[cellCoordsToKey(r, c)];
      }
    }

    const nextSheet = { ...currentSheet, data: nextData };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [currentSheet.id]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, currentSheet, selectedRange, pushUndo, triggerAutoSave]);

  // Sheet Management Handlers
  const handleAddSheet = useCallback(() => {
    pushUndo(workbook);
    const count = Object.keys(workbook.sheets).length + 1;
    const newSheetId = `sheet_${Date.now()}`;
    const newSheetName = `Sheet${count}`;

    const nextWb = {
      ...workbook,
      activeSheetId: newSheetId,
      sheets: {
        ...workbook.sheets,
        [newSheetId]: {
          id: newSheetId,
          name: newSheetName,
          rowCount: 100,
          colCount: 26,
          data: {},
          colWidths: {},
          rowHeights: {},
          frozenRows: 0,
          frozenCols: 0,
          merges: []
        }
      }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('Sheet Created', workbook.id, { sheetName: newSheetName }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleRenameSheet = useCallback((sheetId, newName) => {
    pushUndo(workbook);
    const nextWb = {
      ...workbook,
      sheets: {
        ...workbook.sheets,
        [sheetId]: {
          ...workbook.sheets[sheetId],
          name: newName
        }
      }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('Sheet Renamed', workbook.id, { sheetId, newName }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleDeleteSheet = useCallback((sheetId) => {
    if (Object.keys(workbook.sheets).length <= 1) {
      alert('Cannot delete the only worksheet in this workbook.');
      return;
    }
    pushUndo(workbook);
    const nextSheets = { ...workbook.sheets };
    delete nextSheets[sheetId];
    const remainingIds = Object.keys(nextSheets);

    const nextWb = {
      ...workbook,
      activeSheetId: remainingIds[0],
      sheets: nextSheets
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('Sheet Deleted', workbook.id, { sheetId }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleDuplicateSheet = useCallback((sheetId) => {
    pushUndo(workbook);
    const srcSheet = workbook.sheets[sheetId];
    if (!srcSheet) return;

    const dupId = `sheet_${Date.now()}`;
    const dupName = `${srcSheet.name} (Copy)`;

    const nextWb = {
      ...workbook,
      activeSheetId: dupId,
      sheets: {
        ...workbook.sheets,
        [dupId]: {
          ...JSON.parse(JSON.stringify(srcSheet)),
          id: dupId,
          name: dupName
        }
      }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('Sheet Duplicated', workbook.id, { from: srcSheet.name, to: dupName }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleClearSheet = useCallback((sheetId) => {
    pushUndo(workbook);
    const nextSheet = {
      ...workbook.sheets[sheetId],
      data: {}
    };
    const nextWb = {
      ...workbook,
      sheets: { ...workbook.sheets, [sheetId]: nextSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
  }, [workbook, pushUndo, triggerAutoSave]);

  // Import Operations
  const handleImportFile = useCallback(async (file) => {
    pushUndo(workbook);
    const importedWb = await parseExcelFile(file);
    setWorkbook(importedWb);
    triggerAutoSave(importedWb);
    logExcelAction('Workbook Imported', importedWb.id, { fileName: file.name }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleImportCrewRegistry = useCallback(() => {
    pushUndo(workbook);
    const newSheet = generateCrewRegistrySheet();
    const nextWb = {
      ...workbook,
      activeSheetId: newSheet.id,
      sheets: { ...workbook.sheets, [newSheet.id]: newSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('PYIDCC Crew Imported', workbook.id, {}, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  const handleImportWttSchedule = useCallback((dayKey) => {
    pushUndo(workbook);
    const newSheet = generateWttScheduleSheet(dayKey);
    const nextWb = {
      ...workbook,
      activeSheetId: newSheet.id,
      sheets: { ...workbook.sheets, [newSheet.id]: newSheet }
    };
    setWorkbook(nextWb);
    triggerAutoSave(nextWb);
    logExcelAction('PYIDCC WTT Imported', workbook.id, { dayKey }, currentUser);
  }, [workbook, pushUndo, triggerAutoSave, currentUser]);

  // Cloud Save Operation
  const handleSaveCloud = useCallback(async () => {
    setSaveStatus('Saving to Cloud...');
    try {
      await saveWorkbookToFirestore(workbook, currentUser);
      setSaveStatus('Saved');
      alert(`✅ Workbook "${workbook.name}" successfully saved to Firebase Cloud!`);
      logExcelAction('Workbook Cloud Saved', workbook.id, {}, currentUser);
    } catch (err) {
      setSaveStatus('Cloud Save Failed');
      alert(`Cloud save failed: ${err.message}`);
    }
  }, [workbook, currentUser]);

  // Quick aggregate statistics for status bar
  const selectionStats = useMemo(() => {
    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);

    let count = 0;
    let sum = 0;
    let numCount = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        count++;
        const key = cellCoordsToKey(r, c);
        const cell = currentSheet?.data?.[key];
        const val = cell?.value !== undefined ? cell.value : cell?.raw;
        if (typeof val === 'number' && !isNaN(val)) {
          sum += val;
          numCount++;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }

    return {
      count,
      sum,
      avg: numCount > 0 ? sum / numCount : 0,
      min: numCount > 0 ? min : 0,
      max: numCount > 0 ? max : 0,
      hasNumbers: numCount > 0
    };
  }, [selectedRange, currentSheet]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Main Toolbar with Menus & Action Ribbon */}
      <ExcelToolbar
        workbookName={workbook.name}
        onRenameWorkbook={(newName) => {
          setWorkbook(prev => ({ ...prev, name: newName }));
          triggerAutoSave({ ...workbook, name: newName });
        }}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveManual={() => triggerAutoSave(workbook)}
        onSaveCloud={handleSaveCloud}
        saveStatus={saveStatus}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenFindReplace={() => setIsFindReplaceOpen(true)}
        onPrint={() => printSpreadsheet(currentSheet.name)}
        activeFormat={currentSheet?.data?.[activeCellKey] || {}}
        onToggleFormat={handleToggleFormat}
        onSetTextAlign={handleSetTextAlign}
        onSetNumberFormat={handleSetNumberFormat}
        onToggleWrapText={() => handleToggleFormat('wrapText')}
        onToggleMerge={() => {}}
        onInsertRow={handleInsertRow}
        onDeleteRow={handleDeleteRow}
        onInsertCol={handleInsertCol}
        onDeleteCol={handleDeleteCol}
        onSortAsc={() => {}}
        onSortDesc={() => {}}
        onToggleFreezeHeader={() => {
          const nextSheet = { ...currentSheet, frozenRows: currentSheet.frozenRows ? 0 : 1 };
          setWorkbook(prev => ({ ...prev, sheets: { ...prev.sheets, [currentSheet.id]: nextSheet } }));
        }}
        isHeaderFrozen={Boolean(currentSheet?.frozenRows)}
      />

      {/* 2. Formula Bar with Name Box */}
      <ExcelFormulaBar
        selectedCellKey={activeCellKey}
        formulaValue={isEditing ? editValue : formulaBarValue}
        onChange={(val) => {
          if (!isEditing) setIsEditing(true);
          setEditValue(val);
          setFormulaBarValue(val);
        }}
        onCommit={handleCommitEdit}
        onCancel={handleCancelEdit}
        isEditing={isEditing}
      />

      {/* 3. Central Virtualized Spreadsheet Grid */}
      <ExcelGrid
        sheet={currentSheet}
        activeCell={activeCell}
        selectedRange={selectedRange}
        isEditing={isEditing}
        editValue={editValue}
        onSelectCell={handleSelectCell}
        onSelectRange={handleSelectRange}
        onStartEdit={handleStartEdit}
        onCommitEdit={handleCommitEdit}
        onCancelEdit={handleCancelEdit}
        onEditChange={(val) => {
          setEditValue(val);
          setFormulaBarValue(val);
        }}
        onCellDoubleClick={handleStartEdit}
        onAutofill={handleAutofill}
        onResizeCol={handleResizeCol}
        onResizeRow={handleResizeRow}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onClearSelection={handleClearSelection}
        zoom={zoom}
      />

      {/* 4. Bottom Worksheet Tabs */}
      <ExcelSheetTabs
        sheets={workbook.sheets}
        activeSheetId={workbook.activeSheetId}
        onSelectSheet={(sheetId) => setWorkbook(prev => ({ ...prev, activeSheetId: sheetId }))}
        onAddSheet={handleAddSheet}
        onRenameSheet={handleRenameSheet}
        onDeleteSheet={handleDeleteSheet}
        onDuplicateSheet={handleDuplicateSheet}
        onClearSheet={handleClearSheet}
      />

      {/* 5. Bottom Status Bar */}
      <ExcelStatusBar
        selectionStats={selectionStats}
        isEditing={isEditing}
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        zoom={zoom}
        onZoomChange={setZoom}
      />

      {/* 6. Modals */}
      <ExcelImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportFile={handleImportFile}
        onImportCrewRegistry={handleImportCrewRegistry}
        onImportWttSchedule={handleImportWttSchedule}
      />

      <ExcelExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        activeSheetName={currentSheet.name}
        workbookName={workbook.name}
        onExportExcel={(fn) => exportWorkbookToExcel(workbook, fn)}
        onExportCsv={(fn) => exportSheetToCsv(currentSheet, fn)}
        onPrint={() => printSpreadsheet(currentSheet.name)}
      />

      <ExcelFindReplace
        isOpen={isFindReplaceOpen}
        onClose={() => setIsFindReplaceOpen(false)}
        onFindNext={() => {}}
        onFindPrev={() => {}}
        onReplace={() => {}}
        onReplaceAll={() => {}}
      />
    </div>
  );
}
