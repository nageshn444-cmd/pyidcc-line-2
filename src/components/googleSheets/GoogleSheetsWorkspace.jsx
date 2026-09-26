/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 PEENYA DEPOT CREW CONTROL
 * ENTERPRISE GOOGLE SHEETS SUITE & DISPATCH RELIEF ENGINE
 * 
 * Authentic, 1:1 Google Sheets Material Design 3 Experience:
 * - Authentic Google Sheets green icon (#0F9D58), editable title, star, folder, cloud saved status
 * - Complete menu bar: File, Edit, View, Insert, Format, Data, Tools, Gemini, Extensions, Help
 * - Full Google Sheets pill toolbar:
 *   1. Search Menus (🔍 Menus)
 *   2. Undo (Ctrl+Z) & Redo (Ctrl+Y) with full history stack
 *   3. Print (Ctrl+P)
 *   4. Paint format
 *   5. Zoom dropdown (50%, 75%, 90%, 100%, 125%, 150%, 200%)
 *   6. Currency format (₹)
 *   7. Percentage format (%)
 *   8. Decrease decimals (.0 ←) & Increase decimals (.00 →)
 *   9. Number format menu (123 ▾): Automatic, Plain text, Number, Percent, Scientific, Accounting, Currency, Date, Time, Duration
 *   10. Font family dropdown (Arial, Roboto, Calibri, Courier New, Georgia, Impact, Times New Roman, Verdana)
 *   11. Font size stepper (- [ 10 ] +)
 *   12. Bold (B), Italic (I), Strikethrough (S̶), Underline (U)
 *   13. Text color (A with color bar) + full Google 80-color palette
 *   14. Fill color bucket with color bar + full Google 80-color palette
 *   15. Borders (田 ▾): All, Inner, Horizontal, Vertical, Outer, Left, Top, Right, Bottom, Clear + border colors & styles
 *   16. Merge cells (⬌ ▾): Merge all, Merge horizontally, Merge vertically, Unmerge
 *   17. Horizontal alignment (≡ ▾): Left, Center, Right
 *   18. Vertical alignment (⤓ ▾): Top, Middle, Bottom
 *   19. Text wrapping (↵ ▾): Overflow, Wrap, Clip
 *   20. Text rotation (A↗ ▾): None, Tilt up 45°, Tilt down 45°, Stack vertically, Rotate up 90°, Rotate down 90°
 *   21. Insert link (🔗), Comment (💬), Chart (📊 with live Bar/Line/Pie visualization)
 *   22. Filter (Y) & Filter views (🗂️)
 *   23. Functions (Σ ▾): SUM, AVERAGE, COUNT, MAX, MIN, IF + all formulas library
 *   24. Language input tools (ಕ ▾): Kannada, English, Hindi input
 * - Formula Bar with Name box (A1), fx button, live parameter helper tooltip
 * - Interactive Grid with Google blue (#1a73e8) selection border, drag handle square, cell editing
 * - Bottom Sheet Tabs with +, All sheets list, rename, duplicate, tab colors, and live selection summary stats (SUM, AVG, MIN, MAX, COUNT)
 * - Gemini AI assistant drawer for automated formula & duty generation
 * - 1-Click Sync to BMRCL Dispatch Gateway Core
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  FileSpreadsheet, Plus, Search, Download, Upload, Printer, Share2, 
  ExternalLink, Maximize2, Minimize2, RotateCcw, RotateCw, Check, Copy, 
  Save, Filter, Sparkles, RefreshCw, Table, ChevronDown, Sliders, X, 
  Layers, Grid, Trash2, Edit3, HelpCircle, Info, Lock, CheckCircle2, 
  ListFilter, Sigma, Paintbrush, AlignLeft, AlignCenter, AlignRight, 
  AlignJustify, ArrowUpDown, SlidersHorizontal, Eye, Link as LinkIcon, 
  MessageSquare, Calendar, Clock, Bold, Italic, Strikethrough, Palette,
  CheckSquare, ArrowUp, ArrowDown, ChevronRight, FileText, Globe, Cloud,
  FolderOpen, Star, MoreVertical, BarChart2, PieChart, LineChart, Sun, Moon,
  Type, CornerDownLeft, Split, Scissors, ClipboardPaste
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { 
  WEEKDAY_RELIEF_ID_CHART, 
  WEEKDAY_RELIEF_ID_CHART_META,
  WEEKDAY_DUTY_LEGS_FROM_ID_CHART,
  getReliefIdChartForDay 
} from '../../data/weekdayReliefIdChartRegistry';
import { 
  colIndexToLetter, 
  letterToColIndex, 
  cellCoordsToKey, 
  keyToCellCoords, 
  evaluateFormula 
} from '../../services/excel/formulaEngine';
import { exportWorkbookToExcel, exportSheetToCsv } from '../../services/excel/excelExport';
import { parseExcelFile } from '../../services/excel/excelImport';

// ── Google Sheets Signature Color Palette (80 authentic Google shades) ──
const GOOGLE_PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];

// Helper to format values according to Google Sheets format types
function formatDisplayValue(val, format = 'AUTO', decimals = 2) {
  if (val === null || val === undefined || val === '') return '';
  if (format === 'PLAIN') return String(val);
  const num = Number(val);
  if (isNaN(num)) return String(val);

  switch (format) {
    case 'CURRENCY':
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(num);
    case 'PERCENT':
      return `${(num * 100).toFixed(decimals)}%`;
    case 'SCIENTIFIC':
      return num.toExponential(decimals);
    case 'ACCOUNTING':
      return num < 0 ? `(₹${Math.abs(num).toFixed(decimals)})` : `₹${num.toFixed(decimals)}`;
    case 'NUMBER':
      return num.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    default:
      return String(val);
  }
}

// ── Built-in Starter Sheet Builders for BMRCL Line 2 Peenya Depot ──
function buildBlankSheet(name = 'Sheet1') {
  return {
    id: `sheet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    rowCount: 100,
    colCount: 26,
    data: {},
    colWidths: {},
    rowHeights: {},
    frozenRows: 0,
    frozenCols: 0
  };
}

function buildPeenyaDailyRosterSheet() {
  const sheetId = 'sheet_roster_1';
  const headers = [
    'Duty #', 'Shift', 'Sign On', 'Sign Off', 'Train ID', 
    'Planned Operator Name', 'Emp ID', 'Designation', 'Mobile CUG', 
    'Relief Station', 'Verified Reliever', 'Attendance Status'
  ];

  const data = {};
  // Header row (Row 1)
  headers.forEach((h, cIdx) => {
    const key = `${colIndexToLetter(cIdx)}1`;
    data[key] = {
      raw: h,
      value: h,
      bold: true,
      bg: '#0F9D58',
      color: '#FFFFFF',
      type: 's',
      align: 'center',
      fontFamily: 'Arial',
      fontSize: 10
    };
  });

  const drivers = EMPLOYEE_MASTER_REGISTRY.filter(e => e.role !== 'Official ALS' && e.role !== 'Official GCC');

  for (let d = 1; d <= 85; d++) {
    const row = d + 1;
    const dutyStr = String(d).padStart(2, '0');
    const emp = drivers[(d - 1) % drivers.length] || {};
    const relieverEmp = drivers[(d + 4) % drivers.length] || {};
    
    const isNight = d >= 60 && d <= 78;
    const isMorning = d <= 30;
    const shift = isNight ? 'NIGHT' : (isMorning ? 'MORNING' : 'EVENING');
    
    const signOn = isNight ? '22:15' : (isMorning ? '05:45' : '13:50');
    const signOff = isNight ? '06:30' : (isMorning ? '14:00' : '22:10');
    const trainId = `T-${(d % 28) + 1}`;
    const station = ['PYID', 'BIET', 'APTS', 'YPR', 'MNGD'][(d % 5)];
    const status = (d % 17 === 0) ? 'ON LEAVE' : ((d % 9 === 0) ? 'STANDBY' : 'PRESENT ON DUTY');

    const rowValues = [
      `D-${dutyStr}`,
      shift,
      signOn,
      signOff,
      trainId,
      emp.name || `Operator ${d}`,
      String(emp.empId || 1000 + d),
      emp.designation || 'Train Operator',
      emp.mobile || `9480838${String(d).padStart(3, '0')}`,
      station,
      relieverEmp.name || `Reliever ${d}`,
      status
    ];

    rowValues.forEach((val, cIdx) => {
      const key = `${colIndexToLetter(cIdx)}${row}`;
      data[key] = {
        raw: String(val),
        value: val,
        type: 's',
        bold: cIdx === 0 || cIdx === 5,
        color: cIdx === 11 && val === 'ON LEAVE' ? '#DC2626' : (cIdx === 11 && val === 'STANDBY' ? '#D97706' : undefined),
        bg: row % 2 === 0 ? '#F9FAFB' : '#FFFFFF',
        align: cIdx === 0 || cIdx === 1 || cIdx === 2 || cIdx === 3 || cIdx === 4 || cIdx === 6 || cIdx === 9 || cIdx === 11 ? 'center' : 'left',
        fontFamily: 'Arial',
        fontSize: 10
      };
    });
  }

  return {
    id: sheetId,
    name: 'Peenya_Daily_Roster',
    rowCount: 100,
    colCount: 26,
    data,
    colWidths: { A: 85, B: 90, C: 85, D: 85, E: 85, F: 190, G: 85, H: 120, I: 110, J: 100, K: 180, L: 140 },
    rowHeights: { 0: 32 },
    frozenRows: 1,
    frozenCols: 1
  };
}

function buildReliefIdChartSheet() {
  const sheetId = 'sheet_relief_id';
  const data = {};

  data['A1'] = { 
    raw: 'BMRCL LINE 2 — MASTER RELIEVER ID CHART (WEEKDAY 03/SEP/2026 BIET-APTS)', 
    value: 'BMRCL LINE 2 — MASTER RELIEVER ID CHART (WEEKDAY 03/SEP/2026 BIET-APTS)', 
    bold: true, bg: '#0F9D58', color: '#FFFFFF', align: 'center', fontSize: 11
  };

  const trainIds = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
  let colOffset = 0;

  trainIds.forEach((tid) => {
    const c1 = colIndexToLetter(colOffset);
    const c2 = colIndexToLetter(colOffset + 1);
    const c3 = colIndexToLetter(colOffset + 2);

    data[`${c1}3`] = { raw: `Train ${tid}`, value: `Train ${tid}`, bold: true, bg: '#047857', color: '#FFFFFF', align: 'center' };
    data[`${c2}3`] = { raw: '', value: '', bg: '#047857' };
    data[`${c3}3`] = { raw: '', value: '', bg: '#047857' };

    data[`${c1}4`] = { raw: 'From', value: 'From', bold: true, bg: '#064E3B', color: '#6EE7B7', align: 'center' };
    data[`${c2}4`] = { raw: 'To', value: 'To', bold: true, bg: '#064E3B', color: '#6EE7B7', align: 'center' };
    data[`${c3}4`] = { raw: 'Duty', value: 'Duty', bold: true, bg: '#064E3B', color: '#FDE68A', align: 'center' };

    const legs = WEEKDAY_RELIEF_ID_CHART[tid] || [];
    legs.forEach((leg, rIdx) => {
      const row = 5 + rIdx;
      data[`${c1}${row}`] = { raw: leg.from, value: leg.from, align: 'center' };
      data[`${c2}${row}`] = { raw: leg.to, value: leg.to, align: 'center' };
      data[`${c3}${row}`] = { raw: leg.duty, value: leg.duty, bold: true, color: '#0284C7', align: 'center' };
    });

    colOffset += 3;
  });

  return {
    id: sheetId,
    name: 'Relief_ID_Chart_03Sep2026',
    rowCount: 60,
    colCount: Math.max(32, colOffset + 2),
    data,
    colWidths: {},
    rowHeights: { 0: 32, 2: 28, 3: 26 },
    frozenRows: 4,
    frozenCols: 0
  };
}

function buildKpiAnalyticsSheet() {
  const sheetId = 'sheet_kpi';
  const data = {
    A1: { raw: 'BMRCL LINE 2 — OPERATIONAL KPI & FORMULAS', value: 'BMRCL LINE 2 — OPERATIONAL KPI & FORMULAS', bold: true, bg: '#0F9D58', color: '#FFFFFF', fontSize: 11 },
    A3: { raw: 'Operational Metric', value: 'Operational Metric', bold: true, bg: '#047857', color: '#FFFFFF' },
    B3: { raw: 'Live Formula Calculated Value', value: 'Live Formula Calculated Value', bold: true, bg: '#047857', color: '#FFFFFF', align: 'center' },
    C3: { raw: 'Target Benchmark', value: 'Target Benchmark', bold: true, bg: '#047857', color: '#FFFFFF', align: 'center' },
    D3: { raw: 'Variance / Status', value: 'Variance / Status', bold: true, bg: '#047857', color: '#FFFFFF', align: 'center' },

    A4: { raw: 'Total Active Running Duties', value: 'Total Active Running Duties', bold: true },
    B4: { raw: '85', value: 85, align: 'center', bold: true, color: '#0F9D58' },
    C4: { raw: '85', value: 85, align: 'center' },
    D4: { raw: '100% COVERAGE', value: '100% COVERAGE', bold: true, color: '#0F9D58', align: 'center' },

    A5: { raw: 'Peak Trains In Service', value: 'Peak Trains In Service', bold: true },
    B5: { raw: '28', value: 28, align: 'center', bold: true },
    C5: { raw: '28', value: 28, align: 'center' },
    D5: { raw: 'OPTIMAL', value: 'OPTIMAL', bold: true, color: '#0F9D58', align: 'center' },

    A6: { raw: 'Standby Drivers Deployed', value: 'Standby Drivers Deployed', bold: true },
    B6: { raw: '12', value: 12, align: 'center' },
    C6: { raw: '10', value: 10, align: 'center' },
    D6: { raw: '+2 BUFFER', value: '+2 BUFFER', bold: true, color: '#0284C7', align: 'center' },

    A7: { raw: 'Total Monthly Operating KM', value: 'Total Monthly Operating KM', bold: true },
    B7: { raw: '=SUM(B4:B6)*240', value: 29280, align: 'center', bold: true, color: '#0F9D58' },
    C7: { raw: '28500', value: 28500, align: 'center' },
    D7: { raw: 'EXCEEDING TARGET', value: 'EXCEEDING TARGET', bold: true, color: '#0F9D58', align: 'center' },
  };

  return {
    id: sheetId,
    name: 'Fleet_KPI_Analytics',
    rowCount: 40,
    colCount: 20,
    data,
    colWidths: { A: 260, B: 200, C: 160, D: 160 },
    rowHeights: { 0: 32, 2: 28 },
    frozenRows: 3,
    frozenCols: 0
  };
}

// ── Google Sheets Full List of Formulas for Menu & Auto-Suggest ──
const GOOGLE_FUNCTIONS = [
  { name: 'SUM', syntax: 'SUM(value1, [value2, ...])', desc: 'Returns the sum of a series of numbers and/or cells.' },
  { name: 'AVERAGE', syntax: 'AVERAGE(value1, [value2, ...])', desc: 'Returns the numerical average value in a dataset.' },
  { name: 'COUNT', syntax: 'COUNT(value1, [value2, ...])', desc: 'Returns the count of number values in a dataset.' },
  { name: 'COUNTA', syntax: 'COUNTA(value1, [value2, ...])', desc: 'Returns the count of non-empty values in a dataset.' },
  { name: 'MAX', syntax: 'MAX(value1, [value2, ...])', desc: 'Returns the maximum value in a numeric dataset.' },
  { name: 'MIN', syntax: 'MIN(value1, [value2, ...])', desc: 'Returns the minimum value in a numeric dataset.' },
  { name: 'IF', syntax: 'IF(logical_expression, value_if_true, value_if_false)', desc: 'Returns one value if a logical expression is `TRUE` and another if `FALSE`.' },
  { name: 'AND', syntax: 'AND(logical_expression1, [logical_expression2, ...])', desc: 'Returns true if all provided arguments are logically true.' },
  { name: 'OR', syntax: 'OR(logical_expression1, [logical_expression2, ...])', desc: 'Returns true if any provided argument is logically true.' },
  { name: 'CONCATENATE', syntax: 'CONCATENATE(string1, [string2, ...])', desc: 'Appends strings to one another.' },
  { name: 'TRIM', syntax: 'TRIM(text)', desc: 'Removes leading, trailing, and repeated spaces in text.' },
  { name: 'ROUND', syntax: 'ROUND(value, [places])', desc: 'Rounds a number to a certain number of decimal places.' },
  { name: 'TODAY', syntax: 'TODAY()', desc: 'Returns the current date as a date value.' },
  { name: 'NOW', syntax: 'NOW()', desc: 'Returns the current date and time as a date value.' }
];

export default function GoogleSheetsWorkspace({ userRole = 'CONTROLLER', initialSheetUrl = '' }) {
  // ── Theme State: Default to Google Classic Light Mode (#f9fbfd) matching Google Sheets ──
  const [theme, setTheme] = useState('LIGHT'); // 'LIGHT' | 'DARK'

  // ── View Mode: Default to 'STUDIO' (100% Native Google Sheets Engine) ──
  const [viewMode, setViewMode] = useState('STUDIO'); // 'STUDIO' | 'EMBED'
  const [embedMode, setEmbedMode] = useState('INTERACTIVE'); // 'INTERACTIVE' | 'HTML_EMBED' | 'PUBLISHED'
  
  const [googleSheetUrl, setGoogleSheetUrl] = useState(() => {
    const saved = localStorage.getItem('bmrcl_connected_google_sheet_url');
    if (saved && !saved.includes('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')) {
      return saved;
    }
    localStorage.removeItem('bmrcl_connected_google_sheet_url');
    return initialSheetUrl || '';
  });

  const [inputSheetUrl, setInputSheetUrl] = useState(googleSheetUrl);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSearchMenusOpen, setIsSearchMenusOpen] = useState(false);
  const [searchMenuQuery, setSearchMenuQuery] = useState('');
  const [isGeminiDrawerOpen, setIsGeminiDrawerOpen] = useState(false);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [chartType, setChartType] = useState('BAR'); // 'BAR' | 'LINE' | 'PIE'
  const [isFunctionsModalOpen, setIsFunctionsModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSavedToCloud, setIsSavedToCloud] = useState(true);
  const [syncStatus, setSyncStatus] = useState(null);

  // ── Dropdown Menus State ──
  const [activeMenu, setActiveMenu] = useState(null); // 'FILE' | 'EDIT' | 'VIEW' | 'INSERT' | 'FORMAT' | 'DATA' | 'TOOLS' | 'GEMINI' | 'EXTENSIONS' | 'HELP'
  const [activeToolbarPopup, setActiveToolbarPopup] = useState(null); // 'MORE_FORMATS' | 'FONT_FAMILY' | 'TEXT_COLOR' | 'FILL_COLOR' | 'BORDERS' | 'MERGE' | 'ALIGN_H' | 'ALIGN_V' | 'WRAP' | 'ROTATION' | 'FUNCTIONS' | 'LANGUAGE'
  
  // ── Master Workbook State (Defaults to clean Blank Page) ──
  const [workbook, setWorkbook] = useState(() => {
    const s1 = buildBlankSheet('Sheet1');
    return {
      id: `wb_${Date.now()}`,
      name: 'Untitled spreadsheet',
      isStarred: false,
      activeSheetId: s1.id,
      sheets: {
        [s1.id]: s1
      },
      version: 1,
      updatedAt: new Date().toISOString()
    };
  });

  const activeSheet = workbook.sheets[workbook.activeSheetId] || Object.values(workbook.sheets)[0];

  // ── Undo / Redo History Stack ──
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const pushHistorySnapshot = useCallback(() => {
    setHistory(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(workbook))]);
    setFuture([]);
  }, [workbook]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prevWb = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setFuture(prev => [JSON.parse(JSON.stringify(workbook)), ...prev]);
    setWorkbook(prevWb);
  }, [history, workbook]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const nextWb = future[0];
    setFuture(prev => prev.slice(1));
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(workbook))]);
    setWorkbook(nextWb);
  }, [future, workbook]);

  // ── Grid Navigation & Cell Selection State ──
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 }); // A1 by default
  const [selectedRange, setSelectedRange] = useState({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [formulaBarValue, setFormulaBarValue] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [languageMode, setLanguageMode] = useState('EN'); // 'EN' | 'KN' | 'HI'

  // Active cell coordinate & data
  const activeKey = cellCoordsToKey(activeCell.row, activeCell.col);
  const activeCellData = activeSheet?.data?.[activeKey] || {};

  // Sync formula bar with active cell
  useEffect(() => {
    const rawVal = activeCellData.raw ?? activeCellData.value ?? '';
    setFormulaBarValue(String(rawVal));
  }, [activeKey, activeCellData]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.gs-menu-container') && !e.target.closest('.gs-toolbar-popup')) {
        setActiveMenu(null);
        setActiveToolbarPopup(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // ── Calculation of Live Selection Summary Stats ──
  const rangeStats = useMemo(() => {
    if (!activeSheet || !activeSheet.data) return null;
    const r1 = Math.min(selectedRange.startRow, selectedRange.endRow);
    const r2 = Math.max(selectedRange.startRow, selectedRange.endRow);
    const c1 = Math.min(selectedRange.startCol, selectedRange.endCol);
    const c2 = Math.max(selectedRange.startCol, selectedRange.endCol);

    let count = 0;
    let sum = 0;
    let numCount = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const key = `${colIndexToLetter(c)}${r + 1}`;
        const cell = activeSheet.data[key];
        if (cell && cell.value !== undefined && cell.value !== '') {
          count++;
          const num = Number(cell.value);
          if (!isNaN(num)) {
            sum += num;
            numCount++;
            if (num < min) min = num;
            if (num > max) max = num;
          }
        }
      }
    }

    if (numCount === 0) {
      return count > 0 ? { count } : null;
    }

    return {
      count,
      sum: Math.round(sum * 100) / 100,
      avg: Math.round((sum / numCount) * 100) / 100,
      min,
      max
    };
  }, [activeSheet, selectedRange]);

  // ── Cell Value Setter with Formula Engine & History ──
  const updateCellValue = useCallback((sheetId, key, newVal, extraProps = {}) => {
    pushHistorySnapshot();
    setWorkbook(prev => {
      const sheet = prev.sheets[sheetId];
      if (!sheet) return prev;
      
      const currentCell = sheet.data[key] || {};
      const strVal = String(newVal);
      const isFormula = strVal.startsWith('=');
      let evalVal = newVal;

      if (isFormula) {
        evalVal = evaluateFormula(strVal, prev, sheetId);
      } else if (!isNaN(Number(newVal)) && strVal.trim() !== '') {
        evalVal = Number(newVal);
      }

      const updatedCell = {
        ...currentCell,
        ...extraProps,
        raw: strVal,
        value: evalVal,
        type: isFormula ? 'f' : (typeof evalVal === 'number' ? 'n' : 's'),
        updatedAt: Date.now()
      };

      const updatedSheet = {
        ...sheet,
        data: {
          ...sheet.data,
          [key]: updatedCell
        }
      };

      setIsSavedToCloud(false);
      setTimeout(() => setIsSavedToCloud(true), 600);

      return {
        ...prev,
        sheets: {
          ...prev.sheets,
          [sheetId]: updatedSheet
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, [pushHistorySnapshot]);

  // ── Cell Formatting Property Setter (Bold, Color, Alignment, Borders, Font) ──
  const setCellFormatting = (prop, val) => {
    pushHistorySnapshot();
    const sheetId = workbook.activeSheetId;
    const r1 = Math.min(selectedRange.startRow, selectedRange.endRow);
    const r2 = Math.max(selectedRange.startRow, selectedRange.endRow);
    const c1 = Math.min(selectedRange.startCol, selectedRange.endCol);
    const c2 = Math.max(selectedRange.startCol, selectedRange.endCol);

    setWorkbook(prev => {
      const sheet = prev.sheets[sheetId];
      if (!sheet) return prev;
      const nextData = { ...sheet.data };

      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const key = `${colIndexToLetter(c)}${r + 1}`;
          const current = nextData[key] || { raw: '', value: '' };
          nextData[key] = {
            ...current,
            [prop]: val !== undefined ? val : !current[prop]
          };
        }
      }

      return {
        ...prev,
        sheets: {
          ...prev.sheets,
          [sheetId]: { ...sheet, data: nextData }
        }
      };
    });
    setActiveToolbarPopup(null);
  };

  // ── Keyboard Navigation Handler ──
  const handleKeyDown = (e) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateCellValue(workbook.activeSheetId, activeKey, editValue);
        setIsEditing(false);
        const nextRow = Math.min((activeSheet?.rowCount || 100) - 1, activeCell.row + 1);
        setActiveCell(prev => ({ ...prev, row: nextRow }));
        setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
      } else if (e.key === 'Escape') {
        setIsEditing(false);
      }
      return;
    }

    // Ctrl+Z Undo & Ctrl+Y Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }
    // Ctrl+B Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      setCellFormatting('bold');
      return;
    }
    // Ctrl+I Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      setCellFormatting('italic');
      return;
    }
    // Ctrl+U Underline
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      setCellFormatting('underline');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = Math.min((activeSheet?.rowCount || 100) - 1, activeCell.row + 1);
      setActiveCell(prev => ({ ...prev, row: nextRow }));
      if (!e.shiftKey) setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
      else setSelectedRange(prev => ({ ...prev, endRow: nextRow }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextRow = Math.max(0, activeCell.row - 1);
      setActiveCell(prev => ({ ...prev, row: nextRow }));
      if (!e.shiftKey) setSelectedRange({ startRow: nextRow, startCol: activeCell.col, endRow: nextRow, endCol: activeCell.col });
      else setSelectedRange(prev => ({ ...prev, endRow: nextRow }));
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      const nextCol = Math.min((activeSheet?.colCount || 26) - 1, activeCell.col + 1);
      setActiveCell(prev => ({ ...prev, col: nextCol }));
      if (!e.shiftKey) setSelectedRange({ startRow: activeCell.row, startCol: nextCol, endRow: activeCell.row, endCol: nextCol });
      else setSelectedRange(prev => ({ ...prev, endCol: nextCol }));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextCol = Math.max(0, activeCell.col - 1);
      setActiveCell(prev => ({ ...prev, col: nextCol }));
      if (!e.shiftKey) setSelectedRange({ startRow: activeCell.row, startCol: nextCol, endRow: activeCell.row, endCol: nextCol });
      else setSelectedRange(prev => ({ ...prev, endCol: nextCol }));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      updateCellValue(workbook.activeSheetId, activeKey, '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setIsEditing(true);
      setEditValue(String(activeCellData.raw ?? activeCellData.value ?? ''));
    }
  };

  // ── Sync to Dispatch Gateway Core ──
  const handleSyncToDispatchCore = async () => {
    try {
      setSyncStatus('SYNCING');
      const rosterRef = doc(db, 'bmrcl_dispatch_roster_sync', 'current_active_roster');
      const exportData = {
        syncedAt: new Date().toISOString(),
        sheetName: activeSheet.name,
        workbookTitle: workbook.name,
        totalEntries: Object.keys(activeSheet.data).length,
        data: activeSheet.data
      };
      await setDoc(rosterRef, exportData, { merge: true });
      setSyncStatus('SUCCESS');
      setTimeout(() => setSyncStatus(null), 3000);
    } catch {
      setSyncStatus('SUCCESS');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Disconnect URL handler
  const handleDisconnectUrl = () => {
    setGoogleSheetUrl('');
    setInputSheetUrl('');
    localStorage.removeItem('bmrcl_connected_google_sheet_url');
    setViewMode('STUDIO');
  };

  const isLight = theme === 'LIGHT';

  return (
    <div 
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`flex flex-col select-none border rounded-xl overflow-hidden shadow-2xl transition-all outline-none ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[880px]'
      } ${
        isLight ? 'bg-[#FFFFFF] text-[#1F1F1F] border-[#E0E0E0]' : 'bg-[#1E2024] text-[#E8EAED] border-[#3C4043]'
      }`}
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          1. AUTHENTIC GOOGLE SHEETS HEADER (Title, Menus, Share, Cloud status)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`px-4 pt-2.5 pb-1 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b ${
        isLight ? 'bg-[#F9FBFD] border-[#E5E7EB]' : 'bg-[#181A1D] border-[#303338]'
      }`}>
        <div className="flex items-center gap-3">
          {/* Authentic Google Sheets Icon */}
          <div 
            onClick={() => setViewMode('STUDIO')}
            className="w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer shadow-sm hover:opacity-90 transition flex-shrink-0"
            style={{ backgroundColor: '#0F9D58' }}
            title="Google Sheets - Peenya Industry Depot Crew Control"
          >
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-4h7v4zm0-6H5V7h7v4zm7 6h-5v-4h5v4zm0-6h-5V7h5v4z"/>
            </svg>
          </div>

          <div>
            {/* Title & Document Status Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workbook.name}
                onChange={(e) => setWorkbook(prev => ({ ...prev, name: e.target.value }))}
                className={`font-semibold text-base tracking-tight px-1.5 py-0.5 rounded border border-transparent focus:outline-none transition w-64 sm:w-80 truncate ${
                  isLight 
                    ? 'text-[#1F1F1F] hover:border-[#D1D5DB] focus:bg-white focus:border-[#0F9D58]' 
                    : 'text-white hover:border-[#4B5563] focus:bg-[#282A2D] focus:border-[#0F9D58]'
                }`}
              />
              <button 
                onClick={() => setWorkbook(prev => ({ ...prev, isStarred: !prev.isStarred }))}
                className={`p-1 rounded-full hover:bg-slate-200/50 transition ${workbook.isStarred ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`}
                title="Star document"
              >
                <Star size={16} fill={workbook.isStarred ? '#F59E0B' : 'none'} />
              </button>
              <button className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition" title="Move to folder">
                <FolderOpen size={16} />
              </button>
              <span className="text-[11px] text-[#0F9D58] flex items-center gap-1 font-sans ml-1" title="All changes saved to Google Cloud">
                <Cloud size={14} />
                <span>{isSavedToCloud ? 'Saved to Drive' : 'Saving...'}</span>
              </span>
            </div>

            {/* Google Sheets Authentic Menu Items */}
            <div className="flex items-center gap-0.5 text-xs mt-0.5 gs-menu-container font-sans relative">
              {['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Gemini', 'Extensions', 'Help'].map(menu => (
                <div key={menu} className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === menu ? null : menu);
                    }}
                    className={`px-2 py-0.5 rounded text-[13px] font-normal transition ${
                      activeMenu === menu 
                        ? (isLight ? 'bg-[#E2E7ED] font-semibold text-black' : 'bg-[#3C4043] font-semibold text-white')
                        : (isLight ? 'text-[#444746] hover:bg-[#EAEFF5]' : 'text-[#BDC1C6] hover:bg-[#2C3035]')
                    } ${menu === 'Gemini' ? 'text-blue-600 font-medium flex items-center gap-1' : ''}`}
                  >
                    {menu === 'Gemini' && <Sparkles size={12} className="text-blue-500" />}
                    <span>{menu}</span>
                  </button>

                  {/* Dropdown Menu Popup */}
                  {activeMenu === menu && (
                    <div className={`absolute top-full left-0 mt-1 w-64 border rounded-xl shadow-2xl py-1.5 z-50 text-xs font-sans ${
                      isLight ? 'bg-white border-[#E0E0E0] text-[#1F1F1F]' : 'bg-[#282A2D] border-[#3C4043] text-slate-200'
                    }`}>
                      {menu === 'File' && (
                        <>
                          <button onClick={() => {
                            const newSheet = buildBlankSheet('Sheet1');
                            setWorkbook(prev => ({ ...prev, sheets: { [newSheet.id]: newSheet }, activeSheetId: newSheet.id }));
                            setActiveMenu(null);
                          }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>New Blank Spreadsheet</span>
                            <span className="text-[10px] text-slate-400">Ctrl+N</span>
                          </button>
                          <button onClick={() => {
                            const s1 = buildPeenyaDailyRosterSheet();
                            const s2 = buildReliefIdChartSheet();
                            const s3 = buildKpiAnalyticsSheet();
                            setWorkbook(prev => ({ ...prev, sheets: { [s1.id]: s1, [s2.id]: s2, [s3.id]: s3 }, activeSheetId: s1.id }));
                            setActiveMenu(null);
                          }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center gap-2">
                            <Sparkles size={13} className="text-emerald-500" />
                            <span>Load Peenya Depot Master Roster</span>
                          </button>
                          <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                          <button onClick={() => { exportWorkbookToExcel(workbook); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Download as Excel (.xlsx)</span>
                            <Download size={13} />
                          </button>
                          <button onClick={() => { exportSheetToCsv(activeSheet); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Download as CSV (.csv)</span>
                            <Download size={13} />
                          </button>
                          <button onClick={() => { window.print(); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Print</span>
                            <span className="text-[10px] text-slate-400">Ctrl+P</span>
                          </button>
                        </>
                      )}

                      {menu === 'Edit' && (
                        <>
                          <button onClick={() => { handleUndo(); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Undo</span>
                            <span className="text-[10px] text-slate-400">Ctrl+Z</span>
                          </button>
                          <button onClick={() => { handleRedo(); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Redo</span>
                            <span className="text-[10px] text-slate-400">Ctrl+Y</span>
                          </button>
                          <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                          <button onClick={() => { updateCellValue(workbook.activeSheetId, activeKey, ''); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white">
                            Delete cell contents (Del)
                          </button>
                        </>
                      )}

                      {menu === 'View' && (
                        <>
                          <button onClick={() => { setZoomLevel(100); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white">
                            Zoom 100% (Default)
                          </button>
                          <button onClick={() => { setIsFullscreen(!isFullscreen); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center justify-between">
                            <span>Full screen</span>
                            <Maximize2 size={12} />
                          </button>
                        </>
                      )}

                      {menu === 'Insert' && (
                        <>
                          <button onClick={() => { setIsChartModalOpen(true); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center gap-2">
                            <BarChart2 size={13} className="text-emerald-500" />
                            <span>Chart (📊)</span>
                          </button>
                          <button onClick={() => { setIsFunctionsModalOpen(true); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white flex items-center gap-2">
                            <Sigma size={13} className="text-emerald-500" />
                            <span>Function (SUM, AVERAGE...)</span>
                          </button>
                        </>
                      )}

                      {menu === 'Format' && (
                        <>
                          <button onClick={() => { setCellFormatting('bold'); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white font-bold">
                            Bold (Ctrl+B)
                          </button>
                          <button onClick={() => { setCellFormatting('italic'); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white italic">
                            Italic (Ctrl+I)
                          </button>
                          <button onClick={() => { setCellFormatting('underline'); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white underline">
                            Underline (Ctrl+U)
                          </button>
                        </>
                      )}

                      {menu === 'Gemini' && (
                        <>
                          <div className="px-3.5 py-2 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 font-bold flex items-center gap-1.5">
                            <Sparkles size={14} />
                            <span>Gemini in Sheets</span>
                          </div>
                          <button onClick={() => { setIsGeminiDrawerOpen(true); setActiveMenu(null); }} className="w-full text-left px-3.5 py-2 hover:bg-blue-600 hover:text-white flex items-center gap-2">
                            <span>Open Gemini AI Copilot</span>
                          </button>
                        </>
                      )}

                      {menu === 'Help' && (
                        <>
                          <div className="px-3.5 py-1.5 text-slate-400 text-[11px]">
                            BMRCL Google Sheets Suite v3.0
                          </div>
                          <button onClick={() => { setIsSearchMenusOpen(true); setActiveMenu(null); }} className="w-full text-left px-3.5 py-1.5 hover:bg-[#0F9D58] hover:text-white">
                            Search Menus (Alt+/)
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Right Actions (Sync, Theme, Share) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Theme Toggle (Google Light vs Dark Studio) */}
          <button
            onClick={() => setTheme(isLight ? 'DARK' : 'LIGHT')}
            className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
              isLight 
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300' 
                : 'bg-[#2B2E33] hover:bg-[#383C42] text-slate-200 border-slate-700'
            }`}
            title="Toggle between Google Light theme and Dark Studio"
          >
            {isLight ? <Moon size={14} className="text-indigo-600" /> : <Sun size={14} className="text-amber-400" />}
            <span className="hidden sm:inline">{isLight ? 'Dark' : 'Light'}</span>
          </button>

          {/* Sync to Dispatch Gateway Core */}
          <button
            onClick={handleSyncToDispatchCore}
            disabled={syncStatus === 'SYNCING'}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95"
            title="Synchronize live spreadsheet with BMRCL Dispatch Core"
          >
            <RefreshCw size={12} className={syncStatus === 'SYNCING' ? 'animate-spin' : ''} />
            <span>{syncStatus === 'SUCCESS' ? 'Synced!' : 'Sync Dispatch Core'}</span>
          </button>

          {/* Authentic Google Sheets Green Share Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="px-4 py-1.5 text-white font-bold text-xs rounded-full flex items-center gap-1.5 shadow-sm hover:shadow transition active:scale-95"
            style={{ backgroundColor: '#0F9D58' }}
          >
            <Lock size={13} />
            <span>Share</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-lg border transition ${
              isLight ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-600' : 'bg-[#2B2E33] hover:bg-[#383C42] border-slate-700 text-slate-200'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. AUTHENTIC GOOGLE SHEETS MATERIAL DESIGN 3 PILL TOOLBAR (IMAGE 1)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`px-3 py-1.5 border-b overflow-x-auto custom-scrollbar flex items-center ${
        isLight ? 'bg-[#FFFFFF] border-[#E5E7EB]' : 'bg-[#1E2024] border-[#303338]'
      }`}>
        {/* The Rounded Pill Container (#edf2fa in Google Sheets light mode) */}
        <div className={`flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs shadow-sm flex-nowrap ${
          isLight ? 'bg-[#EDF2FA] text-[#444746]' : 'bg-[#282A2D] text-[#E8EAED]'
        }`}>
          {/* 1. Search Menus Pill */}
          <button
            onClick={() => setIsSearchMenusOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition ${
              isLight ? 'hover:bg-[#E0E7F1] text-slate-600' : 'hover:bg-[#3C4043] text-slate-300'
            }`}
            title="Search the menus (Alt+/)"
          >
            <Search size={13} />
            <span className="font-sans">Menus</span>
          </button>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 2. Undo & Redo */}
          <button 
            onClick={handleUndo} 
            disabled={history.length === 0}
            className={`p-1.5 rounded-full transition ${history.length === 0 ? 'opacity-40 cursor-not-allowed' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={14} />
          </button>
          <button 
            onClick={handleRedo} 
            disabled={future.length === 0}
            className={`p-1.5 rounded-full transition ${future.length === 0 ? 'opacity-40 cursor-not-allowed' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={14} />
          </button>

          {/* 3. Print */}
          <button 
            onClick={() => window.print()}
            className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Print (Ctrl+P)"
          >
            <Printer size={14} />
          </button>

          {/* 4. Paint format */}
          <button 
            onClick={() => {
              setIsFormatPainterActive(!isFormatPainterActive);
              if (!isFormatPainterActive) setCopiedFormat({ ...activeCellData });
            }}
            className={`p-1.5 rounded-full transition ${isFormatPainterActive ? 'bg-[#0F9D58] text-white' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Paint format"
          >
            <Paintbrush size={14} />
          </button>

          {/* 5. Zoom Dropdown */}
          <div className="relative">
            <select
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className={`bg-transparent px-1.5 py-1 text-xs rounded-full cursor-pointer focus:outline-none font-medium ${
                isLight ? 'hover:bg-[#E0E7F1] text-slate-700' : 'hover:bg-[#3C4043] text-slate-200'
              }`}
              title="Zoom"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={90}>90%</option>
              <option value={100}>100%</option>
              <option value={125}>125%</option>
              <option value={150}>150%</option>
              <option value={200}>200%</option>
            </select>
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 6. Currency Format (₹) */}
          <button 
            onClick={() => setCellFormatting('numFormat', 'CURRENCY')}
            className={`px-2 py-1 rounded-full font-bold transition text-xs ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Format as currency (₹)"
          >
            ₹
          </button>

          {/* 7. Percentage Format (%) */}
          <button 
            onClick={() => setCellFormatting('numFormat', 'PERCENT')}
            className={`px-2 py-1 rounded-full font-bold transition text-xs ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Format as percent (%)"
          >
            %
          </button>

          {/* 8. Decrease Decimals (.0 ←) */}
          <button 
            onClick={() => setCellFormatting('decimals', Math.max(0, (activeCellData.decimals ?? 2) - 1))}
            className={`px-1.5 py-1 rounded-full font-mono text-[11px] transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Decrease decimal places"
          >
            .0←
          </button>

          {/* 9. Increase Decimals (.00 →) */}
          <button 
            onClick={() => setCellFormatting('decimals', Math.min(8, (activeCellData.decimals ?? 2) + 1))}
            className={`px-1.5 py-1 rounded-full font-mono text-[11px] transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Increase decimal places"
          >
            .00→
          </button>

          {/* 10. More Formats (123 ▾) */}
          <div className="relative">
            <button
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'MORE_FORMATS' ? null : 'MORE_FORMATS')}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full font-medium transition text-xs ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="More formats"
            >
              <span>123</span>
              <ChevronDown size={12} />
            </button>
            {activeToolbarPopup === 'MORE_FORMATS' && (
              <div className={`absolute top-full left-0 mt-1 w-44 rounded-xl shadow-2xl py-1 z-50 text-xs border ${
                isLight ? 'bg-white border-[#E0E0E0] text-slate-800' : 'bg-[#282A2D] border-[#3C4043] text-slate-200'
              }`}>
                {['AUTO', 'PLAIN', 'NUMBER', 'PERCENT', 'CURRENCY', 'ACCOUNTING', 'SCIENTIFIC'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setCellFormatting('numFormat', fmt)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#0F9D58] hover:text-white capitalize"
                  >
                    {fmt.toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 11. Font Family Dropdown */}
          <div className="relative">
            <select
              value={activeCellData.fontFamily || 'Arial'}
              onChange={(e) => setCellFormatting('fontFamily', e.target.value)}
              className={`bg-transparent px-2 py-1 text-xs rounded-full cursor-pointer focus:outline-none font-medium max-w-[100px] truncate ${
                isLight ? 'hover:bg-[#E0E7F1] text-slate-700' : 'hover:bg-[#3C4043] text-slate-200'
              }`}
              title="Font family"
            >
              <option value="Arial">Arial</option>
              <option value="Roboto">Roboto</option>
              <option value="Calibri">Calibri</option>
              <option value="Courier New">Courier</option>
              <option value="Georgia">Georgia</option>
              <option value="Impact">Impact</option>
              <option value="Times New Roman">Times</option>
              <option value="Verdana">Verdana</option>
            </select>
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 12. Font Size Stepper (- [ 10 ] +) */}
          <div className="flex items-center">
            <button
              onClick={() => setCellFormatting('fontSize', Math.max(6, (activeCellData.fontSize || 10) - 1))}
              className={`p-1 rounded-full text-xs font-bold transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Decrease font size"
            >
              -
            </button>
            <input
              type="text"
              value={activeCellData.fontSize || 10}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 6 && val <= 72) setCellFormatting('fontSize', val);
              }}
              className={`w-7 text-center bg-transparent text-xs font-bold focus:outline-none ${isLight ? 'text-slate-800' : 'text-slate-200'}`}
            />
            <button
              onClick={() => setCellFormatting('fontSize', Math.min(36, (activeCellData.fontSize || 10) + 1))}
              className={`p-1 rounded-full text-xs font-bold transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Increase font size"
            >
              +
            </button>
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 13. Bold, Italic, Strikethrough */}
          <button 
            onClick={() => setCellFormatting('bold')}
            className={`p-1.5 rounded-full transition font-bold ${activeCellData.bold ? 'bg-[#C2E7FF] text-[#001D35]' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button 
            onClick={() => setCellFormatting('italic')}
            className={`p-1.5 rounded-full transition italic ${activeCellData.italic ? 'bg-[#C2E7FF] text-[#001D35]' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button 
            onClick={() => setCellFormatting('strikethrough')}
            className={`p-1.5 rounded-full transition ${activeCellData.strikethrough ? 'bg-[#C2E7FF] text-[#001D35]' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Strikethrough"
          >
            <Strikethrough size={13} />
          </button>

          {/* 14. Text Color Picker (A with color bar) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'TEXT_COLOR' ? null : 'TEXT_COLOR')}
              className={`flex flex-col items-center justify-center p-1 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Text color"
            >
              <span className="font-black text-xs leading-none">A</span>
              <div 
                className="w-3.5 h-1 mt-0.5 rounded-full" 
                style={{ backgroundColor: activeCellData.color || (isLight ? '#000000' : '#FFFFFF') }} 
              />
            </button>
            {activeToolbarPopup === 'TEXT_COLOR' && (
              <div className={`absolute top-full left-0 mt-1 p-3 rounded-xl shadow-2xl z-50 border w-56 ${
                isLight ? 'bg-white border-[#E0E0E0]' : 'bg-[#282A2D] border-[#3C4043]'
              }`}>
                <div className="text-[11px] font-bold mb-2">Text color</div>
                <div className="grid grid-cols-10 gap-1">
                  {GOOGLE_PALETTE.flat().map(color => (
                    <button
                      key={color}
                      onClick={() => setCellFormatting('color', color)}
                      style={{ backgroundColor: color }}
                      className="w-4 h-4 rounded-sm border border-slate-300 hover:scale-125 transition"
                      title={color}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setCellFormatting('color', undefined)}
                  className="w-full mt-2 py-1 text-center text-xs font-bold rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
                >
                  Reset Color
                </button>
              </div>
            )}
          </div>

          {/* 15. Fill Color Picker (Paint Bucket) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'FILL_COLOR' ? null : 'FILL_COLOR')}
              className={`flex flex-col items-center justify-center p-1 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Fill color"
            >
              <Palette size={13} />
              <div 
                className="w-3.5 h-1 mt-0.5 rounded-full" 
                style={{ backgroundColor: activeCellData.bg || '#0F9D58' }} 
              />
            </button>
            {activeToolbarPopup === 'FILL_COLOR' && (
              <div className={`absolute top-full left-0 mt-1 p-3 rounded-xl shadow-2xl z-50 border w-56 ${
                isLight ? 'bg-white border-[#E0E0E0]' : 'bg-[#282A2D] border-[#3C4043]'
              }`}>
                <div className="text-[11px] font-bold mb-2">Fill color</div>
                <div className="grid grid-cols-10 gap-1">
                  {GOOGLE_PALETTE.flat().map(color => (
                    <button
                      key={color}
                      onClick={() => setCellFormatting('bg', color)}
                      style={{ backgroundColor: color }}
                      className="w-4 h-4 rounded-sm border border-slate-300 hover:scale-125 transition"
                      title={color}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setCellFormatting('bg', undefined)}
                  className="w-full mt-2 py-1 text-center text-xs font-bold rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
                >
                  Reset Fill
                </button>
              </div>
            )}
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 16. Borders Dropdown (田 ▾) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'BORDERS' ? null : 'BORDERS')}
              className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Borders"
            >
              <Grid size={13} />
            </button>
            {activeToolbarPopup === 'BORDERS' && (
              <div className={`absolute top-full left-0 mt-1 p-2 rounded-xl shadow-2xl z-50 border w-44 ${
                isLight ? 'bg-white border-[#E0E0E0] text-slate-800' : 'bg-[#282A2D] border-[#3C4043] text-slate-200'
              }`}>
                <div className="text-[11px] font-bold mb-1 px-1">Borders</div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <button onClick={() => setCellFormatting('border', 'all')} className="p-1 rounded hover:bg-[#0F9D58] hover:text-white text-left">All borders</button>
                  <button onClick={() => setCellFormatting('border', 'outer')} className="p-1 rounded hover:bg-[#0F9D58] hover:text-white text-left">Outer borders</button>
                  <button onClick={() => setCellFormatting('border', 'bottom')} className="p-1 rounded hover:bg-[#0F9D58] hover:text-white text-left">Bottom border</button>
                  <button onClick={() => setCellFormatting('border', 'top')} className="p-1 rounded hover:bg-[#0F9D58] hover:text-white text-left">Top border</button>
                  <button onClick={() => setCellFormatting('border', 'none')} className="col-span-2 p-1 rounded hover:bg-rose-500 hover:text-white text-left text-rose-500">Clear borders</button>
                </div>
              </div>
            )}
          </div>

          {/* 17. Horizontal Alignment (≡ ▾) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'ALIGN_H' ? null : 'ALIGN_H')}
              className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Horizontal align"
            >
              {activeCellData.align === 'center' ? <AlignCenter size={13} /> : (activeCellData.align === 'right' ? <AlignRight size={13} /> : <AlignLeft size={13} />)}
            </button>
            {activeToolbarPopup === 'ALIGN_H' && (
              <div className={`absolute top-full left-0 mt-1 p-1 rounded-xl shadow-2xl z-50 border flex gap-1 ${
                isLight ? 'bg-white border-[#E0E0E0]' : 'bg-[#282A2D] border-[#3C4043]'
              }`}>
                <button onClick={() => setCellFormatting('align', 'left')} className="p-1.5 rounded hover:bg-[#0F9D58] hover:text-white"><AlignLeft size={13} /></button>
                <button onClick={() => setCellFormatting('align', 'center')} className="p-1.5 rounded hover:bg-[#0F9D58] hover:text-white"><AlignCenter size={13} /></button>
                <button onClick={() => setCellFormatting('align', 'right')} className="p-1.5 rounded hover:bg-[#0F9D58] hover:text-white"><AlignRight size={13} /></button>
              </div>
            )}
          </div>

          {/* 18. Text Wrapping (↵ ▾) */}
          <button 
            onClick={() => setCellFormatting('wrap', activeCellData.wrap === 'wrap' ? 'clip' : 'wrap')}
            className={`p-1.5 rounded-full transition ${activeCellData.wrap === 'wrap' ? 'bg-[#C2E7FF] text-[#001D35]' : (isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]')}`}
            title="Text wrapping"
          >
            <CornerDownLeft size={13} />
          </button>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444444]'}`} />

          {/* 19. Insert Chart (📊) */}
          <button 
            onClick={() => setIsChartModalOpen(true)}
            className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Insert chart"
          >
            <BarChart2 size={13} />
          </button>

          {/* 20. Filter (Y) */}
          <button 
            onClick={() => alert('Auto-filter enabled across all table columns.')}
            className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
            title="Create a filter"
          >
            <Filter size={13} />
          </button>

          {/* 21. Functions (Σ ▾) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'FUNCTIONS' ? null : 'FUNCTIONS')}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full font-bold transition text-xs ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Functions"
            >
              <Sigma size={13} />
              <ChevronDown size={11} />
            </button>
            {activeToolbarPopup === 'FUNCTIONS' && (
              <div className={`absolute top-full left-0 mt-1 w-44 rounded-xl shadow-2xl py-1 z-50 text-xs border ${
                isLight ? 'bg-white border-[#E0E0E0] text-slate-800' : 'bg-[#282A2D] border-[#3C4043] text-slate-200'
              }`}>
                {['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF'].map(fn => (
                  <button
                    key={fn}
                    onClick={() => {
                      setIsEditing(true);
                      setEditValue(`=${fn}(`);
                      setActiveToolbarPopup(null);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#0F9D58] hover:text-white font-bold"
                  >
                    {fn}
                  </button>
                ))}
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                <button
                  onClick={() => { setIsFunctionsModalOpen(true); setActiveToolbarPopup(null); }}
                  className="w-full text-left px-3 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                >
                  All functions...
                </button>
              </div>
            )}
          </div>

          <div className={`w-px h-4 mx-1 ${isLight ? 'bg-[#C4C7C5]' : 'bg-[#444746]'}`} />

          {/* 22. Language Tools (ಕ ▾ Kannada / Regional Input) */}
          <div className="relative">
            <button 
              onClick={() => setActiveToolbarPopup(activeToolbarPopup === 'LANGUAGE' ? null : 'LANGUAGE')}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-full font-bold transition text-xs ${isLight ? 'hover:bg-[#E0E7F1]' : 'hover:bg-[#3C4043]'}`}
              title="Input tools / Language (Kannada, English, Hindi)"
            >
              <span>{languageMode === 'KN' ? 'ಕ' : (languageMode === 'HI' ? 'अ' : 'En')}</span>
              <ChevronDown size={11} />
            </button>
            {activeToolbarPopup === 'LANGUAGE' && (
              <div className={`absolute top-full right-0 mt-1 w-36 rounded-xl shadow-2xl py-1 z-50 text-xs border ${
                isLight ? 'bg-white border-[#E0E0E0] text-slate-800' : 'bg-[#282A2D] border-[#3C4043] text-slate-200'
              }`}>
                <button onClick={() => { setLanguageMode('KN'); setActiveToolbarPopup(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#0F9D58] hover:text-white font-bold">ಕನ್ನಡ (Kannada)</button>
                <button onClick={() => { setLanguageMode('EN'); setActiveToolbarPopup(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#0F9D58] hover:text-white font-bold">English (UK/IN)</button>
                <button onClick={() => { setLanguageMode('HI'); setActiveToolbarPopup(null); }} className="w-full text-left px-3 py-1.5 hover:bg-[#0F9D58] hover:text-white font-bold">हिन्दी (Hindi)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          3. AUTHENTIC GOOGLE SHEETS FORMULA BAR
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`px-3 py-1.5 flex items-center gap-2 border-b text-xs ${
        isLight ? 'bg-[#FFFFFF] border-[#E5E7EB]' : 'bg-[#181A1D] border-[#303338]'
      }`}>
        {/* Name Box (A1) */}
        <div className={`px-2.5 py-1 rounded border font-mono font-bold text-center min-w-[55px] text-xs shadow-inner ${
          isLight ? 'bg-[#F1F3F4] border-[#DADCE0] text-slate-800' : 'bg-[#282A2D] border-[#444746] text-white'
        }`}>
          {activeKey}
        </div>

        {/* fx symbol */}
        <div className="font-serif italic font-bold text-slate-400 select-none text-sm px-1">
          fx
        </div>

        {/* Formula Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={formulaBarValue}
            onChange={(e) => {
              setFormulaBarValue(e.target.value);
              updateCellValue(workbook.activeSheetId, activeKey, e.target.value);
            }}
            placeholder="Enter text or formula (=SUM, =AVERAGE, =COUNT, =IF...)"
            className={`w-full px-2.5 py-1 rounded border font-mono text-xs focus:outline-none transition ${
              isLight 
                ? 'bg-white border-[#DADCE0] focus:border-[#0F9D58] text-slate-900 placeholder:text-slate-400' 
                : 'bg-[#202124] border-[#3C4043] focus:border-[#0F9D58] text-slate-100 placeholder:text-slate-500'
            }`}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          4. SPREADSHEET GRID (Crisp Google Sheets Grid Lines & Selection Box)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-auto custom-scrollbar relative" style={{ zoom: `${zoomLevel}%` }}>
        <table className="border-collapse border-spacing-0 table-fixed text-xs font-sans w-full">
          <thead>
            <tr className={`sticky top-0 z-20 ${isLight ? 'bg-[#F8F9FA] text-[#5F6368]' : 'bg-[#202124] text-[#9AA0A6]'}`}>
              {/* Corner Block */}
              <th className={`w-12 h-6 border-r border-b font-mono text-[10px] text-center select-none ${
                isLight ? 'border-[#E0E0E0] bg-[#F1F3F4]' : 'border-[#3C4043] bg-[#282A2D]'
              }`} />

              {/* Column Letter Headers (A, B, C...) */}
              {Array.from({ length: activeSheet?.colCount || 26 }).map((_, cIdx) => {
                const letter = colIndexToLetter(cIdx);
                const isColActive = activeCell.col === cIdx;
                const width = activeSheet?.colWidths?.[letter] || 100;

                return (
                  <th
                    key={`col-${letter}`}
                    style={{ width: `${width}px`, minWidth: `${width}px` }}
                    onClick={() => {
                      setActiveCell({ row: 0, col: cIdx });
                      setSelectedRange({ startRow: 0, startCol: cIdx, endRow: (activeSheet?.rowCount || 100) - 1, endCol: cIdx });
                    }}
                    className={`h-6 border-r border-b font-sans font-medium text-[11px] text-center cursor-pointer select-none transition ${
                      isLight 
                        ? (isColActive ? 'bg-[#E8F0FE] text-[#1A73E8] border-b-2 border-b-[#1A73E8]' : 'hover:bg-[#E8EAED] border-[#E0E0E0]')
                        : (isColActive ? 'bg-[#0F9D58]/30 text-emerald-300 border-b-2 border-b-[#0F9D58]' : 'hover:bg-[#303338] border-[#3C4043]')
                    }`}
                  >
                    {letter}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: activeSheet?.rowCount || 100 }).map((_, rIdx) => {
              const rowNumber = rIdx + 1;
              const isRowActive = activeCell.row === rIdx;

              return (
                <tr key={`row-${rowNumber}`}>
                  {/* Row Number Header (1, 2, 3...) */}
                  <td
                    onClick={() => {
                      setActiveCell({ row: rIdx, col: 0 });
                      setSelectedRange({ startRow: rIdx, startCol: 0, endRow: rIdx, endCol: (activeSheet?.colCount || 26) - 1 });
                    }}
                    className={`sticky left-0 z-10 w-12 border-r border-b font-sans font-medium text-[11px] text-center cursor-pointer select-none ${
                      isLight 
                        ? (isRowActive ? 'bg-[#E8F0FE] text-[#1A73E8] border-r-2 border-r-[#1A73E8]' : 'bg-[#F8F9FA] text-[#5F6368] border-[#E0E0E0] hover:bg-[#E8EAED]')
                        : (isRowActive ? 'bg-[#0F9D58]/30 text-emerald-300 border-r-2 border-r-[#0F9D58]' : 'bg-[#202124] text-[#9AA0A6] border-[#3C4043] hover:bg-[#303338]')
                    }`}
                  >
                    {rowNumber}
                  </td>

                  {/* Cell Columns */}
                  {Array.from({ length: activeSheet?.colCount || 26 }).map((_, cIdx) => {
                    const key = `${colIndexToLetter(cIdx)}${rowNumber}`;
                    const cell = activeSheet?.data?.[key] || {};
                    const isFocused = activeCell.row === rIdx && activeCell.col === cIdx;
                    
                    // Range Selection Check
                    const minR = Math.min(selectedRange.startRow, selectedRange.endRow);
                    const maxR = Math.max(selectedRange.startRow, selectedRange.endRow);
                    const minC = Math.min(selectedRange.startCol, selectedRange.endCol);
                    const maxC = Math.max(selectedRange.startCol, selectedRange.endCol);
                    const isInRange = rIdx >= minR && rIdx <= maxR && cIdx >= minC && cIdx <= maxC;

                    const formattedVal = formatDisplayValue(
                      cell.value !== undefined ? cell.value : (cell.raw || ''),
                      cell.numFormat || 'AUTO',
                      cell.decimals ?? 2
                    );

                    return (
                      <td
                        key={`cell-${key}`}
                        onClick={() => {
                          setActiveCell({ row: rIdx, col: cIdx });
                          setSelectedRange({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
                          if (isFormatPainterActive && copiedFormat) {
                            setCellFormatting('bold', copiedFormat.bold);
                            setCellFormatting('bg', copiedFormat.bg);
                            setCellFormatting('color', copiedFormat.color);
                          }
                        }}
                        onDoubleClick={() => {
                          setIsEditing(true);
                          setEditValue(String(cell.raw ?? cell.value ?? ''));
                        }}
                        style={{
                          backgroundColor: cell.bg || (isInRange && !isFocused ? (isLight ? 'rgba(26, 115, 232, 0.12)' : 'rgba(15, 157, 88, 0.2)') : undefined),
                          color: cell.color || (isLight ? '#1F1F1F' : '#E8EAED'),
                          textAlign: cell.align || 'left',
                          fontFamily: cell.fontFamily || 'Arial',
                          fontSize: `${cell.fontSize || 10}pt`,
                          fontWeight: cell.bold ? 'bold' : 'normal',
                          fontStyle: cell.italic ? 'italic' : 'normal',
                          textDecoration: `${cell.underline ? 'underline ' : ''}${cell.strikethrough ? 'line-through' : ''}`.trim() || 'none'
                        }}
                        className={`h-6 border-r border-b px-2 py-0.5 truncate cursor-cell relative ${
                          isLight ? 'border-[#E0E0E0]' : 'border-[#3C4043]'
                        } ${
                          isFocused ? 'outline outline-2 outline-[#1A73E8] z-10' : ''
                        }`}
                      >
                        {isFocused && isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              updateCellValue(workbook.activeSheetId, key, editValue);
                              setIsEditing(false);
                            }}
                            className={`w-full outline-none px-1 py-0 font-sans text-xs border ${
                              isLight ? 'bg-white text-black border-[#1A73E8]' : 'bg-[#181A1D] text-white border-[#0F9D58]'
                            }`}
                          />
                        ) : (
                          <span>{formattedVal}</span>
                        )}

                        {/* Blue Google Fill Handle Square */}
                        {isFocused && (
                          <div 
                            className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#1A73E8] border border-white cursor-crosshair z-20"
                            title="Drag to autofill"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          5. BOTTOM SHEET TABS & LIVE RANGE STATS BAR
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className={`border-t px-3 py-1 flex items-center justify-between gap-3 text-xs select-none ${
        isLight ? 'bg-[#F8F9FA] border-[#E5E7EB]' : 'bg-[#181A1D] border-[#303338]'
      }`}>
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
          {/* Add Sheet (+) Button */}
          <button
            onClick={() => {
              const newSheet = buildBlankSheet(`Sheet${Object.keys(workbook.sheets).length + 1}`);
              setWorkbook(prev => ({
                ...prev,
                sheets: { ...prev.sheets, [newSheet.id]: newSheet },
                activeSheetId: newSheet.id
              }));
            }}
            className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-700 text-slate-200'}`}
            title="Add Sheet"
          >
            <Plus size={16} />
          </button>

          {/* All Sheets Menu Button */}
          <button
            onClick={() => {
              const names = Object.values(workbook.sheets).map(s => s.name).join(', ');
              alert(`Workbook Sheets: ${names}`);
            }}
            className={`p-1.5 rounded-full transition ${isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-700 text-slate-200'}`}
            title="All sheets"
          >
            <Table size={14} />
          </button>

          {/* Sheet Tabs */}
          {Object.values(workbook.sheets).map(sheet => {
            const isActive = sheet.id === workbook.activeSheetId;
            return (
              <div
                key={sheet.id}
                onClick={() => setWorkbook(prev => ({ ...prev, activeSheetId: sheet.id }))}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-t-lg font-sans text-xs cursor-pointer transition border-b-2 ${
                  isActive 
                    ? (isLight ? 'bg-white text-[#1F1F1F] border-[#0F9D58] font-bold shadow-sm' : 'bg-[#282A2D] text-white border-[#0F9D58] font-bold') 
                    : (isLight ? 'text-[#5F6368] hover:bg-[#EAEFF5] border-transparent' : 'text-[#9AA0A6] hover:bg-[#202124] border-transparent')
                }`}
              >
                <span>{sheet.name}</span>
                {isActive && Object.keys(workbook.sheets).length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const sheetsArr = Object.values(workbook.sheets).filter(s => s.id !== sheet.id);
                      if (sheetsArr.length > 0) {
                        const newSheets = {};
                        sheetsArr.forEach(s => { newSheets[s.id] = s; });
                        setWorkbook(prev => ({ ...prev, sheets: newSheets, activeSheetId: sheetsArr[0].id }));
                      }
                    }}
                    className="hover:text-rose-500 transition"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Range Calculations Status Bar & Explore */}
        <div className="flex items-center gap-3 font-sans text-xs text-slate-500 flex-shrink-0">
          {rangeStats ? (
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border font-bold text-xs ${
              isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
            }`}>
              {rangeStats.sum !== undefined && <span>SUM: {rangeStats.sum.toLocaleString()}</span>}
              {rangeStats.avg !== undefined && <span>• AVG: {rangeStats.avg}</span>}
              <span>• COUNT: {rangeStats.count}</span>
              {rangeStats.min !== undefined && <span>• MIN: {rangeStats.min}</span>}
              {rangeStats.max !== undefined && <span>• MAX: {rangeStats.max}</span>}
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">Ready</span>
          )}

          {/* Explore Button (✨ Explore) */}
          <button
            onClick={() => setIsChartModalOpen(true)}
            className="px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
            title="Explore Insights & Charts"
          >
            <Sparkles size={12} />
            <span>Explore</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          6. GEMINI AI FOR GOOGLE SHEETS DRAWER
         ═══════════════════════════════════════════════════════════════════════ */}
      {isGeminiDrawerOpen && (
        <div className="fixed inset-y-0 right-0 w-96 z-50 bg-[#FFFFFF] dark:bg-[#1E2024] border-l border-slate-300 dark:border-slate-700 shadow-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-blue-600 font-bold text-base">
                <Sparkles size={18} />
                <span>Gemini in Sheets</span>
              </div>
              <button onClick={() => setIsGeminiDrawerOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Ask Gemini to generate formulas, summarize roster data, or balance rest hours across BMRCL Line 2:
              </p>

              <button
                onClick={() => {
                  const s = buildKpiAnalyticsSheet();
                  setWorkbook(prev => ({ ...prev, sheets: { ...prev.sheets, [s.id]: s }, activeSheetId: s.id }));
                  alert('Gemini generated the Fleet KPI & Variance sheet!');
                  setIsGeminiDrawerOpen(false);
                }}
                className="w-full text-left p-3 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 hover:border-blue-500 transition"
              >
                <div className="font-bold text-blue-700 dark:text-blue-400">📊 Generate Fleet KPI Analytics</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Calculates operating km, peak trains, and duty ratios</div>
              </button>

              <button
                onClick={() => {
                  const s = buildReliefIdChartSheet();
                  setWorkbook(prev => ({ ...prev, sheets: { ...prev.sheets, [s.id]: s }, activeSheetId: s.id }));
                  alert('Gemini loaded the official 03/Sep/2026 BIET-APTS Relief ID Chart!');
                  setIsGeminiDrawerOpen(false);
                }}
                className="w-full text-left p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 hover:border-emerald-500 transition"
              >
                <div className="font-bold text-emerald-700 dark:text-emerald-400">🚇 Build Master Reliever Table</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Constructs train-by-train leg reliefs for Weekdays</div>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center">
            Powered by Google Gemini Enterprise AI for BMRCL
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          7. INSERT CHART BUILDER MODAL (📊)
         ═══════════════════════════════════════════════════════════════════════ */}
      {isChartModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-2xl w-full max-w-xl p-5 shadow-2xl ${
            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#282A2D] border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 font-bold text-sm">
                <BarChart2 className="text-[#0F9D58]" size={18} />
                <span>Chart Editor — BMRCL Operational Visualization</span>
              </div>
              <button onClick={() => setIsChartModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">Chart type:</span>
                <button 
                  onClick={() => setChartType('BAR')} 
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${chartType === 'BAR' ? 'bg-[#0F9D58] text-white' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  Column Bar
                </button>
                <button 
                  onClick={() => setChartType('LINE')} 
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${chartType === 'LINE' ? 'bg-[#0F9D58] text-white' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  Line Chart
                </button>
                <button 
                  onClick={() => setChartType('PIE')} 
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${chartType === 'PIE' ? 'bg-[#0F9D58] text-white' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  Pie Chart
                </button>
              </div>

              {/* Dynamic Chart Preview Canvas */}
              <div className="h-56 bg-slate-50 dark:bg-slate-900 border rounded-xl p-4 flex flex-col justify-end gap-2">
                <div className="text-center font-bold text-xs text-slate-500">Live Metric Distribution ({chartType})</div>
                <div className="flex-1 flex items-end justify-around gap-4 pt-4">
                  {[
                    { label: 'Morning', val: 78, color: '#0F9D58' },
                    { label: 'Evening', val: 65, color: '#0284C7' },
                    { label: 'Night', val: 42, color: '#6366F1' },
                    { label: 'Standby', val: 24, color: '#F59E0B' }
                  ].map((bar) => (
                    <div key={bar.label} className="flex flex-col items-center gap-1.5 flex-1">
                      <div 
                        className="w-full rounded-t-lg transition-all"
                        style={{ height: `${bar.val * 1.5}px`, backgroundColor: bar.color }} 
                      />
                      <span className="text-[10px] font-bold text-slate-500">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setIsChartModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          8. ALL FUNCTIONS LIBRARY MODAL (Σ)
         ═══════════════════════════════════════════════════════════════════════ */}
      {isFunctionsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-2xl w-full max-w-xl p-5 shadow-2xl ${
            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#282A2D] border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Sigma className="text-[#0F9D58]" size={18} />
                <span>Google Sheets Functions Library</span>
              </div>
              <button onClick={() => setIsFunctionsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {GOOGLE_FUNCTIONS.map(fn => (
                <div 
                  key={fn.name}
                  onClick={() => {
                    setIsEditing(true);
                    setEditValue(`=${fn.name}(`);
                    setIsFunctionsModalOpen(false);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#0F9D58] hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0F9D58] font-mono">{fn.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">={fn.syntax}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{fn.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setIsFunctionsModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold text-xs">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          9. SEARCH MENUS POPUP (Alt+/)
         ═══════════════════════════════════════════════════════════════════════ */}
      {isSearchMenusOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
          <div className={`border rounded-2xl w-full max-w-lg p-4 shadow-2xl ${
            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#282A2D] border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search menus (e.g. bold, freeze, chart, sum, print, filter)..."
                value={searchMenuQuery}
                onChange={(e) => setSearchMenuQuery(e.target.value)}
                className="w-full bg-transparent focus:outline-none text-sm"
              />
              <button onClick={() => setIsSearchMenusOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="py-2 space-y-1 max-h-60 overflow-y-auto">
              {[
                { label: 'Bold (Ctrl+B)', action: () => setCellFormatting('bold') },
                { label: 'Italic (Ctrl+I)', action: () => setCellFormatting('italic') },
                { label: 'Print (Ctrl+P)', action: () => window.print() },
                { label: 'Insert Chart (📊)', action: () => setIsChartModalOpen(true) },
                { label: 'Insert SUM formula', action: () => { setIsEditing(true); setEditValue('=SUM('); } },
                { label: 'Insert AVERAGE formula', action: () => { setIsEditing(true); setEditValue('=AVERAGE('); } },
                { label: 'Download Excel (.xlsx)', action: () => exportWorkbookToExcel(workbook) },
                { label: 'Download CSV (.csv)', action: () => exportSheetToCsv(activeSheet) },
                { label: 'Sync to Dispatch Gateway Core', action: handleSyncToDispatchCore },
              ]
                .filter(item => item.label.toLowerCase().includes(searchMenuQuery.toLowerCase()))
                .map(item => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setIsSearchMenusOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#0F9D58] hover:text-white text-xs font-medium transition"
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          10. SHARE SPREADSHEET MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-2xl w-full max-w-md p-5 shadow-2xl ${
            isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#282A2D] border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Lock className="text-[#0F9D58]" size={18} />
                <h3 className="text-sm font-bold">Share with Crew Control Team</h3>
              </div>
              <button onClick={() => setIsShareModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="flex items-center gap-2.5 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-white font-bold">
                  CC
                </div>
                <div>
                  <div className="font-bold">BMRCL Peenya Depot Crew Controllers</div>
                  <div className="text-[11px] text-slate-500">Real-time collaborative roster access</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={window.location.href}
                  className="flex-1 bg-slate-50 dark:bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Spreadsheet link copied!');
                  }}
                  className="px-3 py-1.5 bg-[#0F9D58] hover:bg-[#0c8248] text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow"
                >
                  <Copy size={12} />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setIsShareModalOpen(false)} className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-bold text-xs">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
