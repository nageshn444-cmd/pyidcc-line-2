import React, { useState, useRef, useMemo, useEffect, Suspense, lazy } from 'react';
import { db } from '../../firebase';
import { writeBatch, doc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { provisioningService } from '../../services/ProvisioningService';
import { 
  Shield, Users, Activity, Table, CalendarClock, GraduationCap, 
  Settings, Key, AlertTriangle, Sparkles, LayoutGrid, Search, Maximize2, 
  Minimize2, CheckSquare, FileText, ClipboardList, RefreshCw, Cpu, 
  Train, Calendar, Radio, ShieldAlert, Trash2, RotateCcw, UploadCloud,
  MessageSquare, BookOpen, Calculator, Sliders, Repeat, Clock, Copy, Plus
} from 'lucide-react';

import { lazyWithRetry } from '../../utils/lazyWithRetry';

// ── Lazy-loaded chunks: split each heavy panel into its own async bundle with retry resilience ──
const LiveTrainPositionTracker   = lazyWithRetry(() => import('../LiveTrainPositionTracker'));
const AutomatedDispatchGate      = lazyWithRetry(() => import('../AutomatedDispatchGate'));
const CrewDirectory              = lazyWithRetry(() => import('../CrewDirectory'));
const TrainOperatorPerformance   = lazyWithRetry(() => import('../TrainOperatorPerformance'));
const ReportsCenter              = lazyWithRetry(() => import('../ReportsCenter'));
const AdminPanel                 = lazyWithRetry(() => import('../AdminPanel'));
const ThemeSettings              = lazyWithRetry(() => import('../ThemeSettings'));
const AiAssistantSidebar         = lazyWithRetry(() => import('../AiAssistantSidebar'));
const AIALSCabInspectionPlanner  = lazyWithRetry(() => import('../ai/AIALSCabInspectionPlanner'));
const WTTPage                    = lazyWithRetry(() => import('../../pages/WTTPage'));
const ShiftExchange              = lazyWithRetry(() => import('../ShiftExchange'));
const TrainRakeRegistry          = lazyWithRetry(() => import('../TrainRakeRegistry'));
const LeaveRequestManager        = lazyWithRetry(() => import('../LeaveRequestManager'));
const GCCControl                 = lazyWithRetry(() => import('../GCCControl'));
const TORequestForm              = lazyWithRetry(() => import('../TORequestForm'));
const EmergencyReliefEngine      = lazyWithRetry(() => import('../EmergencyReliefEngine'));
const ManualOverrideForm         = lazyWithRetry(() => import('../ManualOverrideForm'));
const GccRosterUploader          = lazyWithRetry(() => import('../GccRosterUploader'));
const RollingStockFaultLog       = lazyWithRetry(() => import('../RollingStockFaultLog'));
const PerformanceMetrics         = lazyWithRetry(() => import('../PerformanceMetrics'));
const CrewKMCalculatorSuite      = lazyWithRetry(() => import('../kmcalc/CrewKMCalculatorSuite'));
const JmdDrivingHours            = lazyWithRetry(() => import('../JmdDrivingHours'));
const LeaveBookOffManager        = lazyWithRetry(() => import('../LeaveBookOffManager'));
const ShiftHandoverReportView    = lazyWithRetry(() => import('../ShiftHandoverReportView'));
const ChangeoverLink             = lazyWithRetry(() => import('../admin/ChangeoverLink'));
const ChangeoverDashboard        = lazyWithRetry(() => import('../admin/ChangeoverDashboard'));
const DailyDutyGeneratorSuite    = lazyWithRetry(() => import('../dutyGenerator/DailyDutyGeneratorSuite'));

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import { computeDutyLegKms } from '../../utils/kmCalculator'; // WTT km calculation engine

// ── Tab-level Suspense fallback ──
const TabLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
    <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-500 border-t-transparent" />
    <p className="text-xs text-gray-500 animate-pulse tracking-widest uppercase">Loading Panel...</p>
  </div>
);

// Normalize duty ID: "1" → "01", "9" → "09" (pure single digits only)
const normalizeDutyId = (id) => {
  const s = String(id || '').trim();
  if (/^[1-9]$/.test(s)) return '0' + s;
  return s;
};

const dayTabs = [
  { id: 'WEEKDAY', label: 'WEEKDAY SCHEDULE' },
  { id: 'MONDAY', label: 'MONDAY SCHEDULE' },
  { id: 'SATURDAY', label: 'SAT & GH ROSTER' },
  { id: 'SUNDAY', label: 'SUNDAY SCHEDULE' }
];

export default function SuperAdminLayout({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay,
  setActiveDay,
  onOneClickAuthorize,

  // Additional Roster grid props
  filteredLinks = [],
  editingCell,
  setEditingCell,
  editValue,
  setEditValue,
  handleCellSave,
  handleDeleteRow,
  searchTerm = '',
  setSearchTerm,
  trackerSearchTerm = '',
  setTrackerSearchTerm,
  filteredTrackingKeys = [],
  dnStationOrder = [],
  upStationOrder = [],
  handleWttCellSave,
  handleWttBulkSave,
  handleDeleteTripRow,
  addDelayToTime,
  handleRosterReset: providedHandleRosterReset,
  handleGccRosterUpload,
  targetTid,
  setTargetTid,
  delayMinutes,
  setDelayMinutes,
  incidentReason,
  setIncidentReason,
  handleIncidentLogSubmit
}) {
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const defaultHeaders = [
    // Leg 1
    { key: 'signOnTime', label: 'Sign On Time' },
    { key: 'signOnLocation', label: 'Sign On Loc' },
    { key: 'trainId', label: 'Train No' },
    { key: 'leg1TimeFrom', label: 'Board Time' },
    { key: 'leg1TimeTo', label: 'Deboard Time' },
    { key: 'leg1TripTime', label: 'Trip Time' },
    { key: 'leg1HandoverLoc', label: 'Deboard Loc' },
    { key: 'leg1Km', label: 'Leg 1 KM' },
    // Leg 2
    { key: 'leg2DepLoc', label: 'Board Loc' },
    { key: 'leg2TrainNo', label: 'Train No' },
    { key: 'leg2DepTime', label: 'Board Time' },
    { key: 'leg2ArrTime', label: 'Deboard Time' },
    { key: 'leg2TimeTo', label: 'Trip Time' },
    { key: 'leg2ArrLoc', label: 'Deboard Loc' },
    { key: 'leg2Km', label: 'Leg 2 KM' },
    // Leg 3
    { key: 'leg3DepLoc', label: 'Board Loc' },
    { key: 'leg3TrainNo', label: 'Train No' },
    { key: 'leg3DepTime', label: 'Board Time' },
    { key: 'leg3ArrTime', label: 'Deboard Time' },
    { key: 'leg3TimeTo', label: 'Trip Time' },
    { key: 'leg3ArrLoc', label: 'Deboard Loc' },
    { key: 'leg3Km', label: 'Leg 3 KM' },
    // Leg 4
    { key: 'leg4FinalDepLoc', label: 'Board Loc' },
    { key: 'leg4TrainNo', label: 'Train No' },
    { key: 'leg4FinalDepTime', label: 'Board Time' },
    { key: 'leg4FinalArrTime', label: 'Deboard Time' },
    { key: 'leg4TimeTo', label: 'Trip Time' },
    { key: 'leg4FinalArrLoc', label: 'Deboard Loc' },
    { key: 'leg4Km', label: 'Leg 4 KM' },
    // Summary
    { key: 'signOffTime', label: 'Sign Off Time' },
    { key: 'signOffLocation', label: 'Sign Off Loc' },
    { key: 'totalHours', label: 'Total Hours' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'totalKm', label: 'Total KM' }
  ];

  const [headers, setHeaders] = useState(() => {
    const saved = localStorage.getItem('pyidcc_roster_headers_v4');
    return saved ? JSON.parse(saved) : defaultHeaders;
  });

  const [rosterDutySearch, setRosterDutySearch] = useState('');

  // ── Ordered column field list (matches table render order) ──
  const ROSTER_COL_FIELDS = [
    'signOnTime','signOnLocation','trainId',
    'leg1TimeFrom','leg1TimeTo','leg1TripTime','leg1HandoverLoc','leg1Km',
    'leg2DepLoc','leg2TrainNo','leg2DepTime','leg2ArrTime','leg2TimeTo','leg2ArrLoc','leg2Km',
    'leg3DepLoc','leg3TrainNo','leg3DepTime','leg3ArrTime','leg3TimeTo','leg3ArrLoc','leg3Km',
    'leg4FinalDepLoc','leg4TrainNo','leg4FinalDepTime','leg4FinalArrTime','leg4TimeTo','leg4FinalArrLoc','leg4Km',
    'signOffTime','signOffLocation','totalHours','remarks','totalKm'
  ];

  // ── Cell-Level Copy/Paste States ──
  const [cellClipboard, setCellClipboard] = useState(null); // { value, fieldName }  (single-cell, for right-click context menu)
  const [contextMenu, setContextMenu] = useState(null);     // { x, y, value, rowId, fieldName }

  // ── Multi-cell Range Selection States ──
  const [rangeAnchor, setRangeAnchor] = useState(null);     // { rowIndex, colIndex } — where selection started
  const [rangeFocus, setRangeFocus] = useState(null);       // { rowIndex, colIndex } — current extent of selection
  const [isRangeSelecting, setIsRangeSelecting] = useState(false);
  const [rangeClipboard, setRangeClipboard] = useState(null); // { grid: string[][], rowCount, colCount, startColIndex }
  const [isPasteMode, setIsPasteMode] = useState(false);    // true = next cell click pastes
  const [flashCells, setFlashCells] = useState(new Set());  // set of "rowId:fieldName" flashing green after paste

  const handleContextMenuDismiss = () => setContextMenu(null);

  // ── Multi-cell Range Handlers ──
  const getRangeRect = () => {
    if (!rangeAnchor || !rangeFocus) return null;
    const r1 = Math.min(rangeAnchor.rowIndex, rangeFocus.rowIndex);
    const r2 = Math.max(rangeAnchor.rowIndex, rangeFocus.rowIndex);
    const c1 = Math.min(rangeAnchor.colIndex, rangeFocus.colIndex);
    const c2 = Math.max(rangeAnchor.colIndex, rangeFocus.colIndex);
    return { r1, r2, c1, c2 };
  };

  const isCellInRange = (rowIndex, colIndex) => {
    const rect = getRangeRect();
    if (!rect) return false;
    return rowIndex >= rect.r1 && rowIndex <= rect.r2 && colIndex >= rect.c1 && colIndex <= rect.c2;
  };

  const handleRangeCopy = (rows) => {
    const rect = getRangeRect();
    if (!rect) return alert('Select a cell range first (click a cell, then Shift+click another).');
    const cellCount = (rect.r2 - rect.r1 + 1) * (rect.c2 - rect.c1 + 1);
    if (cellCount > 500) return alert(`Selection too large (${cellCount} cells). Max 500 cells at once.`);
    // Build 2D grid of values
    const grid = [];
    for (let ri = rect.r1; ri <= rect.r2; ri++) {
      const row = [];
      const duty = rows[ri];
      for (let ci = rect.c1; ci <= rect.c2; ci++) {
        const field = ROSTER_COL_FIELDS[ci];
        row.push(duty ? (duty[field] || '--') : '--');
      }
      grid.push(row);
    }
    setRangeClipboard({ grid, rowCount: grid.length, colCount: grid[0]?.length || 0, startColIndex: rect.c1 });
    setIsPasteMode(true);
    alert(`✅ Copied ${cellCount} cells (${grid.length} rows × ${grid[0]?.length} cols). Now click the TOP-LEFT target cell to paste.`);
  };

  const handleRangePaste = async (targetRowIndex, targetColIndex, rows) => {
    if (!rangeClipboard) return;
    const { grid, colCount } = rangeClipboard;
    const totalCells = grid.length * colCount;
    if (!window.confirm(`Paste ${totalCells} cells (${grid.length} rows × ${colCount} cols) starting from this cell?`)) {
      setIsPasteMode(false);
      return;
    }
    try {
      const { writeBatch: wb2, doc: fdoc2, serverTimestamp: sts2 } = await import('firebase/firestore');
      const { db: db2 } = await import('../../firebase');
      const batch = wb2(db2);
      const newFlash = new Set();
      grid.forEach((rowVals, ri) => {
        const duty = rows[targetRowIndex + ri];
        if (!duty) return;
        const updates = { lastModified: sts2() };
        rowVals.forEach((val, ci) => {
          const field = ROSTER_COL_FIELDS[targetColIndex + ci];
          if (field) {
            updates[field] = val;
            newFlash.add(`${duty.id}:${field}`);
          }
        });
        batch.update(fdoc2(db2, 'crew_final_links', duty.id), updates);
      });
      await batch.commit();
      setFlashCells(newFlash);
      setTimeout(() => setFlashCells(new Set()), 1800);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert('Paste failed: ' + err.message);
    }
    setIsPasteMode(false);
    setRangeAnchor(null);
    setRangeFocus(null);
  };

  // Keyboard Ctrl+C / Ctrl+V support
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Ctrl+C: only if a range is selected
        if (rangeAnchor && rangeFocus) {
          e.preventDefault();
          // rangeClipboard built on toolbar button click; this just signals
          document.getElementById('btnRangeCopy')?.click();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isPasteMode) {
          e.preventDefault();
          // Paste mode is activated; user still needs to click the target cell
        }
      }
      if (e.key === 'Escape') {
        setIsPasteMode(false);
        setRangeAnchor(null);
        setRangeFocus(null);
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rangeAnchor, rangeFocus, isPasteMode]);

  // ── Bulk Roster Operations States & Handlers ──
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [clipboard, setClipboard] = useState([]);
  const [bulkEditField, setBulkEditField] = useState('');
  const [bulkEditValue, setBulkEditValue] = useState('');

  const handleToggleSelectRow = (id) => {
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAllRows = (e) => {
    if (e.target.checked) {
      setSelectedRowIds(finalRosterLinks.map(l => l.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleBulkCopy = () => {
    const targets = finalRosterLinks.filter(l => selectedRowIds.includes(l.id));
    if (targets.length === 0) return alert("Select at least one duty to copy.");
    const copies = targets.map(l => {
      const copy = { ...l };
      delete copy.id;
      return copy;
    });
    setClipboard(copies);
    alert(`Copied ${copies.length} crew links to clipboard.`);
  };

  const handleBulkDelete = async () => {
    if (selectedRowIds.length === 0) return alert("Select at least one duty to delete.");
    if (!window.confirm(`⛔ CRITICAL ACTION: Permanently delete all ${selectedRowIds.length} selected crew links from the database?`)) return;

    try {
      const batch = writeBatch(db);
      selectedRowIds.forEach(id => {
        batch.delete(doc(db, 'crew_final_links', id));
      });
      await batch.commit();
      setSelectedRowIds([]);
      alert(`Deleted ${selectedRowIds.length} crew links successfully.`);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to delete selected crew links.");
    }
  };

  const handleBulkPaste = async () => {
    if (clipboard.length === 0) return alert("Clipboard is empty.");
    if (!window.confirm(`Paste ${clipboard.length} copied crew links into ${activeDay} schedule?`)) return;

    try {
      const batch = writeBatch(db);
      clipboard.forEach(link => {
        const dutyId = String(link.dutyId).padStart(2, '0');
        const docId = `link_${activeDay.toLowerCase()}_duty_${dutyId}`;
        const newLink = {
          ...link,
          scheduleType: activeDay,
          lastModified: serverTimestamp()
        };
        batch.set(doc(db, 'crew_final_links', docId), newLink);
      });
      await batch.commit();
      setClipboard([]);
      setSelectedRowIds([]);
      alert(`✅ Pasted ${clipboard.length} crew links successfully into ${activeDay}.`);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to paste crew links.");
    }
  };

  const handleBulkEditSubmit = async (e) => {
    e.preventDefault();
    if (!bulkEditField) return alert("Please select a field to modify.");
    if (selectedRowIds.length === 0) return alert("Select at least one duty to modify.");
    if (!window.confirm(`Apply value "${bulkEditValue}" to column "${bulkEditField}" for all ${selectedRowIds.length} selected duties?`)) return;

    try {
      const batch = writeBatch(db);
      selectedRowIds.forEach(id => {
        batch.update(doc(db, 'crew_final_links', id), {
          [bulkEditField]: bulkEditValue,
          lastModified: serverTimestamp()
        });
      });
      await batch.commit();
      setBulkEditValue('');
      setBulkEditField('');
      setSelectedRowIds([]);
      alert(`✅ Bulk updated ${selectedRowIds.length} crew links successfully.`);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to update selected crew links.");
    }
  };

  React.useEffect(() => {
    setSelectedRowIds([]);
  }, [activeDay]);

  const finalRosterLinks = useMemo(() => {
    if (!rosterDutySearch) return filteredLinks;
    const query = rosterDutySearch.toLowerCase().trim();
    
    // Extract numeric values for exact numeric matching
    const cleanQuery = query.replace(/\D/g, '');
    const queryNum = cleanQuery ? parseInt(cleanQuery, 10) : NaN;
    
    return filteredLinks.filter(l => {
      const dutyStr = String(l.dutyId || '').toLowerCase().trim();
      const cleanDuty = dutyStr.replace(/\D/g, '');
      const dutyNum = cleanDuty ? parseInt(cleanDuty, 10) : NaN; // base 10
      
      if (!isNaN(queryNum) && !isNaN(dutyNum)) {
        return dutyNum === queryNum;
      }
      
      // Fallback for non-numeric search
      return dutyStr.includes(query);
    });
  }, [filteredLinks, rosterDutySearch]);

  const [editingHeaderIdx, setEditingHeaderIdx] = useState(null);
  const [editHeaderValue, setEditHeaderValue] = useState('');

  const handleHeaderSave = (idx) => {
    const updated = [...headers];
    updated[idx].label = editHeaderValue;
    setHeaders(updated);
    localStorage.setItem('pyidcc_roster_headers_v3', JSON.stringify(updated));
    setEditingHeaderIdx(null);
  };

  const handleResetHeaders = () => {
    if (window.confirm("Reset all table column headers back to defaults?")) {
      setHeaders(defaultHeaders);
      localStorage.removeItem('pyidcc_roster_headers_v3');
    }
  };

  const handleNormalizeDutyIds = async () => {
    if (!window.confirm("This will migrate all duty IDs '1'-'9' to '01'-'09' in the database (crew_final_links and crew_daily_deployment) to enable exact filtering. Proceed?")) return;

    try {
      const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore');
      const { db } = await import('../../firebase');
      
      // 1. Migrate crew_final_links
      const linksSnap = await getDocs(collection(db, 'crew_final_links'));
      const batch = writeBatch(db);
      let linksCount = 0;

      linksSnap.forEach((document) => {
        const data = document.data();
        const rawId = String(data.dutyId || '').trim();
        if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(rawId)) {
          const paddedId = '0' + rawId;
          const newDocId = document.id.replace(`_${rawId}`, `_${paddedId}`);
          
          // Set new document
          const newDocRef = doc(db, 'crew_final_links', newDocId);
          batch.set(newDocRef, {
            ...data,
            dutyId: paddedId
          });

          // Delete old document
          const oldDocRef = doc(db, 'crew_final_links', document.id);
          batch.delete(oldDocRef);

          linksCount++;
        }
      });

      // 2. Migrate crew_daily_deployment
      const deploySnap = await getDocs(collection(db, 'crew_daily_deployment'));
      let deployCount = 0;

      deploySnap.forEach((document) => {
        const data = document.data();
        const rawId = String(data.dutyId || '').trim();
        if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(rawId)) {
          const paddedId = '0' + rawId;
          const newDocId = document.id.replace(`_${rawId}`, `_${paddedId}`);

          // Set new document
          const newDocRef = doc(db, 'crew_daily_deployment', newDocId);
          batch.set(newDocRef, {
            ...data,
            dutyId: paddedId
          });

          // Delete old document
          const oldDocRef = doc(db, 'crew_daily_deployment', document.id);
          batch.delete(oldDocRef);

          deployCount++;
        }
      });

      if (linksCount > 0 || deployCount > 0) {
        await batch.commit();
        alert(`Migration successful! Normalized ${linksCount} links and ${deployCount} daily deployments.`);
      } else {
        alert("No single-digit duty IDs (1-9) found to normalize.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to normalize duty IDs: " + err.message);
    }
  };

  const handleFixRosterConflicts = async () => {
    if (!window.confirm("This will automatically resolve Devaraj B (ID: 21482) double booking conflicts by unassigning him from duplicate duties in the database. Proceed?")) return;

    try {
      const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore');
      const { db } = await import('../../firebase');
      
      const deploySnap = await getDocs(collection(db, "crew_daily_deployment"));
      const devarajDocs = [];
      deploySnap.forEach(d => {
        const data = d.data();
        if (data.empId === '21482') {
          devarajDocs.push({ id: d.id, ...data });
        }
      });
      
      if (devarajDocs.length > 1) {
        const batch = writeBatch(db);
        // Keep the first duty and unassign others
        console.log(`Found ${devarajDocs.length} duties for Devaraj B. Keeping ${devarajDocs[0].dutyId} and unassigning others.`);
        for (let i = 1; i < devarajDocs.length; i++) {
          const docRef = doc(db, 'crew_daily_deployment', devarajDocs[i].id);
          batch.update(docRef, {
            empId: '--',
            empName: '--',
            remarks: 'Unassigned duplicate booking - Automated Fix'
          });
        }
        await batch.commit();
        alert(`Successfully resolved Devaraj B double bookings! Kept Duty ${devarajDocs[0].dutyId} and unassigned others.`);
      } else {
        alert("No duplicate deployments found for Devaraj B in the database.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to fix roster conflicts: " + err.message);
    }
  };

  const handleRosterReset = async () => {
    if (!window.confirm(`Reset Daily Roster for ${activeDay}? This will clear all deployed operators for ${activeDay} from the database.`)) return;
    try {
      const { collection, getDocs, writeBatch } = await import('firebase/firestore');
      const { db } = await import('../../firebase');
      
      const snap = await getDocs(collection(db, 'crew_daily_deployment'));
      const batch = writeBatch(db);
      let count = 0;

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const sched = String(data.scheduleType || '').toUpperCase();
        if (!sched || sched === String(activeDay).toUpperCase() || sched === 'ACTIVE_RUN') {
          batch.delete(docSnap.ref);
          count++;
        }
      });

      await batch.commit();
      alert(`Daily Roster for ${activeDay} reset successfully! Removed ${count} deployment records.`);
      if (fetchLiveData) fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to reset daily roster: " + err.message);
    }
  };
  const { theme, rawTheme, setTheme, accessibility, setAccessibility } = useTheme();
  const { userProfile, logout, hasPermission, permissions } = useAuth();
  const isTrainOperator = !['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'JMD'].includes(userProfile?.role) && 
                          !String(userProfile?.role || '').toLowerCase().includes('admin') && (
                            userProfile?.role === 'TRAIN_OPERATOR' || 
                            userProfile?.role === 'STATION_CONTROLLER' || 
                            userProfile?.role === 'VIEWER' ||
                            String(userProfile?.role || '').toLowerCase().includes('operator') ||
                            String(userProfile?.role || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                            String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('viewer')
                          );
  const [showThemeSettingsModal, setShowThemeSettingsModal] = useState(false);

  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeRequestPopup, setActiveRequestPopup] = useState(null);
  const [dismissedPopupIds, setDismissedPopupIds] = useState(new Set());
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('Not Operational Crew');
  const [customRejectionReason, setCustomRejectionReason] = useState('');
  
  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.15);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.2);
      }, 150);
    } catch (e) {
      console.warn("Audio Context alert failed to play:", e);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'login_requests'), where('requestStatus', '==', 'Pending'));
    const unsub = onSnapshot(q, (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setPendingRequests(prev => {
        if (reqs.length > prev.length) {
          playAlertSound();
        }
        return reqs;
      });

      if (reqs.length > 0) {
        setActiveRequestPopup(prev => {
          const active = reqs.find(r => !dismissedPopupIds.has(r.requestId));
          return active || null;
        });
      } else {
        setActiveRequestPopup(null);
      }
    });

    return () => unsub();
  }, [dismissedPopupIds]);

  const handleApproveRequest = async (req) => {
    try {
      await provisioningService.approveLoginRequest(req, userProfile?.employeeName || 'System Admin');
      alert(`Login Request approved for ${req.employeeName || 'Unknown'}`);
      setDismissedPopupIds(prev => {
        const next = new Set(prev);
        next.add(req.requestId);
        return next;
      });
      setActiveRequestPopup(null);
    } catch (err) {
      alert("Failed to approve request: " + err.message);
    }
  };

  const handleRejectRequestSubmit = async () => {
    if (!activeRequestPopup) return;
    const finalReason = rejectionReason === 'Others' ? customRejectionReason : rejectionReason;
    try {
      await provisioningService.rejectLoginRequest(
        activeRequestPopup, 
        userProfile?.employeeName || 'System Admin', 
        finalReason
      );
      alert(`Login Request rejected for ${activeRequestPopup.employeeName || 'Unknown'}`);
      setShowRejectReasonModal(false);
      setDismissedPopupIds(prev => {
        const next = new Set(prev);
        next.add(activeRequestPopup.requestId);
        return next;
      });
      setActiveRequestPopup(null);
    } catch (err) {
      alert("Failed to reject request: " + err.message);
    }
  };

  // Dynamic header badge based on role
  const getBadgeDetails = () => {
    const role = userProfile?.role || 'VIEWER';
    if (role === 'SUPER_ADMIN' || role === 'JMD') {
      return { text: 'SA', bg: 'bg-amber-500', shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.4)]', textCol: 'text-slate-950', title: 'SUPER ADMIN DESK', subtitleColor: 'text-amber-400' };
    }
    if (role === 'ADMIN_Station_Superintendent' || role === 'ADMIN_SS') {
      return { text: 'SS', bg: 'bg-blue-600', shadow: 'shadow-[0_0_15px_rgba(37,99,235,0.4)]', textCol: 'text-white', title: 'STATION SUPERINTENDENT', subtitleColor: 'text-blue-400' };
    }
    if (role === 'CREW_CONTROLLER') {
      return { text: 'CC', bg: 'bg-lime-600', shadow: 'shadow-[0_0_15px_rgba(132,204,22,0.4)]', textCol: 'text-slate-950', title: 'CREW CONTROLLER CONSOLE', subtitleColor: 'text-lime-400' };
    }
    if (role === 'STATION_CONTROLLER') {
      return { text: 'SC', bg: 'bg-purple-600', shadow: 'shadow-[0_0_15px_rgba(147,51,234,0.4)]', textCol: 'text-white', title: 'STATION CONTROLLER', subtitleColor: 'text-purple-400' };
    }
    if (role === 'TRAIN_OPERATOR') {
      return { text: 'TO', bg: 'bg-indigo-600', shadow: 'shadow-[0_0_15px_rgba(79,70,229,0.4)]', textCol: 'text-white', title: 'TRAIN OPERATOR CONSOLE', subtitleColor: 'text-indigo-400' };
    }
    return { text: 'VW', bg: 'bg-slate-600', shadow: 'shadow-[0_0_15px_rgba(71,85,105,0.4)]', textCol: 'text-white', title: 'SYSTEM VIEWER', subtitleColor: 'text-slate-400' };
  };

  const badge = getBadgeDetails();

  // Grab-to-scroll vertical/horizontal table management
  const rosterScrollRef = useRef(null);
  const [isRosterDragging, setIsRosterDragging] = useState(false);
  const [rosterStartX, setRosterStartX] = useState(0);
  const [rosterStartY, setRosterStartY] = useState(0);
  const [rosterScrollLeft, setRosterScrollLeft] = useState(0);
  const [rosterScrollTop, setRosterScrollTop] = useState(0);

  const onRosterMouseDown = (e) => {
    // Ignore input text paste, select dropdowns, or delete buttons clicks
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button') || e.target.closest('input')) return;
    setIsRosterDragging(true);
    setRosterStartX(e.pageX - rosterScrollRef.current.offsetLeft);
    setRosterStartY(e.pageY - rosterScrollRef.current.offsetTop);
    setRosterScrollLeft(rosterScrollRef.current.scrollLeft);
    setRosterScrollTop(rosterScrollRef.current.scrollTop);
  };

  const onRosterMouseLeave = () => {
    setIsRosterDragging(false);
  };

  const onRosterMouseUp = () => {
    setIsRosterDragging(false);
  };

  const onRosterMouseMove = (e) => {
    if (!isRosterDragging) return;
    e.preventDefault();
    const x = e.pageX - rosterScrollRef.current.offsetLeft;
    const y = e.pageY - rosterScrollRef.current.offsetTop;
    const walkX = (x - rosterStartX) * 1.5;
    const walkY = (y - rosterStartY) * 1.5;
    rosterScrollRef.current.scrollLeft = rosterScrollLeft - walkX;
    rosterScrollRef.current.scrollTop = rosterScrollTop - walkY;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const menuItems = [
    { id: 'DASHBOARD', label: 'Command Overview', icon: LayoutGrid, module: 'Dashboard' },
    { id: 'DISPATCH', label: 'Automated Dispatch', icon: Table, module: 'Automated Dispatch Gate' },
    { id: 'WTT', label: 'WTT Timetable', icon: Activity, module: 'Duty Roster' },
    { id: 'ROSTER', label: 'Link Roster', icon: ClipboardList, module: 'Duty Roster' },
    { id: 'DUTY_GENERATOR', label: 'Duty Generator Suite', icon: Sparkles, module: 'Duty Roster' },
    { id: 'CREW', label: 'Crew Registry', icon: Users, module: 'Crew Registry' },
    { id: 'EXCHANGE', label: 'Shift Exchange', icon: RefreshCw, module: 'Shift Exchange' },
    { id: 'REPORTS', label: 'Reports Desk', icon: FileText, module: 'Reports Center' },
    { id: 'KM_CALC_SUITE', label: 'KM Calculator Suite', icon: Calculator, module: 'KM Calculator Suite' },
    { id: 'JMD_DRIVING_HOURS', label: "JMD TO's Driving Hours", icon: Clock, module: 'KM Calculator Suite' },
    { id: 'RAKE', label: 'Rake Registry', icon: Train, module: 'Rake Registry' },
    { id: 'LEAVE', label: 'Leave Requests', icon: Calendar, module: 'Leave Requests' },
    { id: 'LEAVE_BO', label: 'Leave & Absent (BO)', icon: CalendarClock, module: 'Leave Requests' },
    { id: 'MODULES', label: 'OCC Modules Suite', icon: Radio, module: 'Dashboard' },
    { id: 'EMERGENCY_RELIEF', label: 'Emergency Relief', icon: ShieldAlert, module: 'Emergency Relief Module' },
    { id: 'NIGHT_CHANGEOVER', label: 'Night Changeover', icon: Clock, module: 'Shift Exchange' },
    { id: 'CHANGEOVER_LINK', label: 'Changeover Link', icon: Repeat, module: 'Shift Exchange' },
    { id: 'ALS_PLANNER', label: 'AI ALS Cab Inspection', icon: Sparkles, module: 'AI ALS Cab Inspection' },
    { id: 'ADMIN', label: 'System Settings', icon: Settings, module: 'User Control Center' }
  ];

  const allowedMenuItems = menuItems.filter(item => {
    return hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own');
  });

  const [activeTab, setActiveTab] = useState(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    return visible.length > 0 ? visible[0].id : 'DASHBOARD';
  });

  useEffect(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    if (visible.length > 0 && !visible.some(item => item.id === activeTab)) {
      setActiveTab(visible[0].id);
    }
  }, [permissions, activeTab]);

  return (
    <div className={`min-h-screen flex bg-slate-950 font-mono text-slate-200 ${theme}`}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 1. Left Mega Navigation */}
      <aside className={`fixed lg:static top-0 left-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 select-none z-50 overflow-y-auto transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="space-y-6">
          {/* Brand header */}
          <div className="flex items-center gap-2.5 pb-3 mb-2 border-b border-slate-800">
            <div className={`h-8 w-8 ${badge.bg} rounded flex items-center justify-center font-black ${badge.textCol} ${badge.shadow}`}>
              {badge.text}
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-100 tracking-wider">PYIDCC PLATFORM</h2>
              <span className={`text-[9px] ${badge.subtitleColor} font-bold uppercase tracking-widest`}>{badge.title}</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {allowedMenuItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs font-bold transition-all ${activeTab === item.id ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === 'ADMIN' && pendingRequests.length > 0 && (
                  <span className="ml-auto bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="border-t border-slate-850 pt-4 mt-6 space-y-3">
          <div className="text-[9px] text-slate-500 uppercase">
            Logged In: {userProfile?.employeeName || 'SuperAdmin'}
          </div>
          <button 
            onClick={logout}
            className="w-full bg-rose-950/20 border border-rose-900/40 hover:bg-rose-900/20 text-rose-400 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-wider text-center"
          >
            Terminal Sign-Off
          </button>
        </div>
      </aside>

      {/* 2. Main Workstation Space */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        
        {/* Top Control Bar */}
        <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-3 lg:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-sm">
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white transition"
              title="Toggle navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping hidden sm:block"></span>
            <span className="text-xs font-bold uppercase text-slate-400 hidden sm:block">System Telemetry Network Status: Operational</span>
          </div>

          <div className="flex items-center gap-4">
            
            {/* Control Ribbon (Upload, Day Switcher, Search) */}
            <div className="hidden lg:flex items-center gap-3">
              <input id="superadminlayout-i1" name="superadminlayout-i1" 
                type="text" 
                placeholder="Filter Matrix..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none w-36" 
              />
              <button 
                onClick={fetchLiveData} 
                className="bg-slate-950 border border-slate-800 p-1.5 rounded text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Global Theme Selector */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-500 px-1 font-bold">THEME:</span>
              <select id="superadminlayout-i2" name="superadminlayout-i2" 
                value={rawTheme} 
                onChange={(e) => setTheme(e.target.value)}
                className="bg-transparent border-none text-amber-400 font-bold outline-none cursor-pointer"
              >
                <option value="theme-occ-dark">Metro OCC Dark</option>
                <option value="theme-occ-light">Metro OCC Light</option>
                <option value="theme-night-ops">Night Operations</option>
                <option value="theme-comfort-day">Eye Comfort Day</option>
                <option value="theme-comfort-night">Eye Comfort Night</option>
                <option value="theme-contrast">High Contrast</option>
                <option value="theme-emerald-ops">Emerald Operations</option>
                <option value="theme-bmrcl">BMRCL Classic</option>
                <option value="theme-auto">Auto Theme</option>
              </select>
            </div>

            {/* Accessibility scale */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-500 px-1 font-bold">FONT:</span>
              <select id="superadminlayout-i3" name="superadminlayout-i3" 
                value={accessibility.fontSize} 
                onChange={(e) => setAccessibility({ fontSize: e.target.value })}
                className="bg-transparent border-none text-cyan-400 font-bold outline-none cursor-pointer"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="xlarge">Extra Large</option>
              </select>
            </div>

            {/* Fullscreen Button */}
            <button 
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              title="Fullscreen Mode"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            {/* Theme Settings Gear */}
            <button 
              onClick={() => setShowThemeSettingsModal(true)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
              title="Workstation Theme & Comfort Settings"
            >
              <Settings size={14} />
            </button>

            {/* Excel Workspace Link */}
            <a 
              href="/excel-workspace"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 font-bold text-[10px] px-3 py-1.5 rounded-lg transition uppercase tracking-widest"
              title="Open Enterprise Excel Workspace"
            >
              <Table className="h-3.5 w-3.5 text-emerald-400" />
              <span>Excel Sheet</span>
            </a>

            {/* AI Assistant Trigger */}
            <button 
              onClick={() => setIsAiOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-slate-950 font-black text-[10px] px-3.5 py-1.5 rounded-lg transition shadow-lg shadow-cyan-900/10 uppercase tracking-widest"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Ask AI</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-3 lg:p-6 overflow-y-auto min-w-0">
          <Suspense fallback={<TabLoader />}>
          {activeTab === 'DASHBOARD' ? (
            <div className="space-y-6">
              
              {/* Interactive transit map */}
              <LiveTrainPositionTracker 
                liveTrainTrackingMap={liveTrainTrackingMap}
                activeDay={activeDay}
              />

              {/* System Health Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Active Fleet</span>
                  <div className="text-2xl font-black text-cyan-400 mt-2">{Object.keys(liveTrainTrackingMap).length} Trains</div>
                  <span className="text-[9px] text-slate-400 mt-1 uppercase">Line 2 tracking active</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Standby Operators</span>
                  <div className="text-2xl font-black text-emerald-400 mt-2">
                    {deployments.filter(d => d.status === 'STANDBY').length} Available
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 uppercase">Relief reserves ready</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Active Delays</span>
                  <div className="text-2xl font-black text-rose-500 mt-2">
                    {liveIncidents.filter(i => i.status !== 'RESOLVED').length} Active
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 uppercase">Downstream propagate logs</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Roster Schedule</span>
                  <div className="text-2xl font-black text-amber-500 mt-2">{activeDay}</div>
                  <span className="text-[9px] text-slate-400 mt-1 uppercase">Syncing to live services</span>
                </div>
              </div>
            </div>
          ) : activeTab === 'DISPATCH' ? (
            <div className="space-y-4">
              <div className="flex justify-end gap-2 bg-slate-900 p-3 rounded-lg border border-slate-850">
                <button onClick={handleRosterReset} className="flex items-center bg-rose-950/45 border border-rose-900/50 hover:bg-rose-900/30 transition px-3 py-1.5 rounded text-xs font-mono text-rose-400 font-bold uppercase tracking-wide">
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> RESET DAILY ROSTER
                </button>
                <div className="flex items-center bg-slate-950 border border-slate-800 px-3 py-1.5 rounded cursor-pointer relative hover:bg-slate-850 transition">
                  <UploadCloud className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                  <span className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wide">UPLOAD GCC ROSTER</span>
                  <input id="superadminlayout-i4" name="superadminlayout-i4" type="file" accept=".csv, .txt, .xlsx, .xls, .pdf, image/*" onChange={handleGccRosterUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>
              <AutomatedDispatchGate 
                deployments={deployments}
                loading={loading}
                activeDay={activeDay}
                setActiveDay={setActiveDay}
                runningFleetCount={Object.keys(liveTrainTrackingMap).length}
                onAuthorize={onOneClickAuthorize}
                onImportComplete={fetchLiveData}
              />
            </div>
          ) : activeTab === 'WTT' ? (
            <div className="space-y-4">
              {/* Day Selector Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select Schedule Day:</span>
                  <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                    {dayTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDay(tab.id)}
                        className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                          activeDay === tab.id 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                            : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900 border border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs font-bold font-mono text-slate-450 uppercase">
                  ACTIVE WTT: <span className="text-amber-400">{activeDay} SCHEDULE</span>
                </div>
              </div>
              <WTTPage
                trackerSearchTerm={trackerSearchTerm}
                setTrackerSearchTerm={setTrackerSearchTerm}
                filteredTrackingKeys={filteredTrackingKeys}
                liveTrainTrackingMap={liveTrainTrackingMap}
                targetTid={targetTid}
                setTargetTid={setTargetTid}
                delayMinutes={delayMinutes}
                setDelayMinutes={setDelayMinutes}
                incidentReason={incidentReason}
                setIncidentReason={setIncidentReason}
                handleIncidentLogSubmit={handleIncidentLogSubmit}
                liveIncidents={liveIncidents}
                filteredUnifiedRows={unifiedRows.filter(row => String(row.trainId || '').toLowerCase().includes(searchTerm.toLowerCase()))}
                dnStationOrder={dnStationOrder}
                upStationOrder={upStationOrder}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                editValue={editValue}
                setEditValue={setEditValue}
                handleWttCellSave={handleWttCellSave}
                handleWttBulkSave={handleWttBulkSave}
                handleDeleteTripRow={handleDeleteTripRow}
                addDelayToTime={addDelayToTime}
                activeDay={activeDay}
              />
            </div>
          ) : activeTab === 'ROSTER' ? (
            <div className="space-y-4">
              {/* Day Selector Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select Schedule Day:</span>
                  <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                    {dayTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveDay(tab.id)}
                        className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                          activeDay === tab.id 
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]' 
                            : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900 border border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Dedicated Duty ID Search */}
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input id="superadminlayout-i5" name="superadminlayout-i5" 
                      type="text" 
                      placeholder="Search Duty ID (e.g. D10)..." 
                      value={rosterDutySearch} 
                      onChange={(e) => setRosterDutySearch(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  {!isTrainOperator && (
                    <>
                      <button 
                        onClick={handleNormalizeDutyIds} 
                        className="flex items-center bg-slate-950 hover:bg-emerald-950/40 text-emerald-400 border border-slate-800/85 hover:border-emerald-800/80 px-2.5 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide transition-all"
                        title="Convert duty IDs '1'-'9' to '01'-'09' in database for precise search/filtering"
                      >
                        <Sliders className="h-3 w-3 mr-1 text-emerald-400" /> Normalize Duty IDs
                      </button>
                      <button 
                        onClick={handleFixRosterConflicts} 
                        className="flex items-center bg-slate-950 hover:bg-rose-950/40 text-rose-400 border border-slate-800/85 hover:border-rose-800/80 px-2.5 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide transition-all"
                        title="Automatically resolve Devaraj B double booking conflicts in database"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1 text-rose-400" /> Fix Roster Conflicts
                      </button>
                      <button 
                        onClick={handleResetHeaders} 
                        className="flex items-center bg-slate-950 hover:bg-slate-850 text-amber-500 border border-slate-800/85 hover:border-slate-700/80 px-2.5 py-1.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide transition-all"
                      >
                        <RotateCcw className="h-3 w-3 mr-1 text-amber-500" /> Reset Headers
                      </button>
                    </>
                  )}
                  <div className="text-xs font-bold font-mono text-slate-450 uppercase">
                    ACTIVE ROSTER: <span className="text-amber-400">{activeDay} SCHEDULE</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="px-4 py-2.5 bg-slate-955 border-b border-slate-800 flex justify-between items-center text-blue-400 font-mono text-xs font-bold">
                  <span>DYNAMIC CONTROL ROSTER OPERATIONAL MONITOR TERMINAL</span>
                </div>
                {(selectedRowIds.length > 0 || clipboard.length > 0) && (
                  <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs border-t border-slate-800/55">
                    <div className="flex items-center gap-3 text-slate-300">
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/35 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                        {selectedRowIds.length} Selected
                      </span>
                      {clipboard.length > 0 && (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/35 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                          {clipboard.length} Copied
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {selectedRowIds.length > 0 && (
                        <>
                          <button
                            onClick={handleBulkCopy}
                            className="bg-slate-900 hover:bg-slate-850 text-amber-400 border border-slate-800 hover:border-amber-500/30 px-3 py-1.5 rounded font-bold uppercase text-[10px] tracking-wider transition-all flex items-center gap-1"
                            title="Copy selected duties"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copy Selected
                          </button>
                          
                          <button
                            onClick={handleBulkDelete}
                            className="bg-slate-900 hover:bg-rose-955/20 text-rose-450 border border-slate-800 hover:border-rose-500/30 px-3 py-1.5 rounded font-bold uppercase text-[10px] tracking-wider transition-all flex items-center gap-1"
                            title="Delete selected duties"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                          </button>

                          <form onSubmit={handleBulkEditSubmit} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-2 py-0.5">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Modify Column:</span>
                            <select id="superadminlayout-i6" name="superadminlayout-i6"
                              value={bulkEditField}
                              onChange={(e) => setBulkEditField(e.target.value)}
                              className="bg-slate-950 text-slate-250 border-none text-[10px] font-bold focus:outline-none focus:ring-0 py-0.5"
                              required
                            >
                              <option value="">-- Select Field --</option>
                              <option value="signOnTime">Sign On Time</option>
                              <option value="signOnLocation">Sign On Loc</option>
                              <option value="trainId">Train No</option>
                              <option value="remarks">Remarks</option>
                              <option value="signOffTime">Sign Off Time</option>
                              <option value="signOffLocation">Sign Off Loc</option>
                            </select>
                            <input id="superadminlayout-i7" name="superadminlayout-i7"
                              type="text"
                              placeholder="New Value..."
                              value={bulkEditValue}
                              onChange={(e) => setBulkEditValue(e.target.value)}
                              className="bg-slate-950 text-slate-200 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] w-24 focus:outline-none focus:border-amber-500"
                              required
                            />
                            <button
                              type="submit"
                              className="bg-amber-500 hover:bg-amber-450 text-slate-950 px-2 py-0.5 rounded text-[10px] font-black uppercase transition-colors"
                            >
                              Apply
                            </button>
                          </form>
                        </>
                      )}

                      {clipboard.length > 0 && (
                        <button
                          onClick={handleBulkPaste}
                          className="bg-emerald-500 hover:bg-emerald-450 text-slate-950 px-3.5 py-1.5 rounded font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse"
                          title={`Paste ${clipboard.length} copied links into ${activeDay}`}
                        >
                          <Plus className="h-3.5 w-3.5" /> Paste to {activeDay} ({clipboard.length})
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div
                  ref={rosterScrollRef}
                  onMouseDown={onRosterMouseDown}
                  onMouseLeave={onRosterMouseLeave}
                  onMouseUp={onRosterMouseUp}
                  onMouseMove={onRosterMouseMove}
                  className="overflow-auto w-full max-h-[62vh] cursor-grab active:cursor-grabbing select-none border border-slate-800 rounded-lg"
                >
                  {/* ── Range Copy/Paste Banner ── */}
                  {(rangeAnchor || isPasteMode || rangeClipboard) && (
                    <div className={`sticky top-0 z-20 flex items-center gap-3 px-3 py-2 font-mono text-[11px] border-b ${isPasteMode ? 'bg-amber-950/80 border-amber-700/50' : 'bg-blue-950/80 border-blue-700/50'}`}>
                      {isPasteMode ? (
                        <>
                          <span className="text-amber-400 font-black uppercase tracking-wider animate-pulse">📋 Paste Mode — Click the TOP-LEFT cell where you want to paste</span>
                          <span className="text-amber-300 ml-1">({rangeClipboard?.rowCount} rows × {rangeClipboard?.colCount} cols = {(rangeClipboard?.rowCount || 0) * (rangeClipboard?.colCount || 0)} cells)</span>
                          <button
                            onClick={() => { setIsPasteMode(false); setRangeAnchor(null); setRangeFocus(null); }}
                            className="ml-auto bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 border border-amber-500/40 rounded px-2 py-0.5 text-[10px] font-black uppercase"
                          >✕ Cancel</button>
                        </>
                      ) : (
                        <>
                          <span className="text-blue-400 font-bold">
                            {(() => { const r = getRangeRect(); return r ? `${r.r2 - r.r1 + 1} rows × ${r.c2 - r.c1 + 1} cols selected` : 'No selection'; })()}
                          </span>
                          <button
                            id="btnRangeCopy"
                            onClick={() => handleRangeCopy(finalRosterLinks)}
                            className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 border border-blue-500/40 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wide transition-all flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" /> Copy Range (Ctrl+C)
                          </button>
                          <button
                            onClick={() => { setRangeAnchor(null); setRangeFocus(null); setRangeClipboard(null); }}
                            className="bg-slate-700/50 hover:bg-slate-700 text-slate-400 border border-slate-600/40 rounded px-2 py-0.5 text-[10px] font-black uppercase transition-all"
                          >✕ Clear</button>
                          <span className="ml-auto text-slate-500 text-[9px]">Shift+click to extend · Drag to select · Esc to cancel</span>
                        </>
                      )}
                    </div>
                  )}
                  <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[3050px] table-fixed">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-center font-bold uppercase tracking-wider">
                        {!isTrainOperator && <th className="w-[60px] bg-slate-950">Kill</th>}
                        <th className="w-[80px] bg-slate-950 border-r border-slate-800">Duty ID</th>
                        <th className="w-[150px] bg-slate-950 border-r border-slate-800 text-emerald-400">Train Operator</th>
                        <th colSpan="8" className="py-2 border-r border-slate-800 text-blue-400 bg-blue-950/5">LEG 1: Primary Sign-On Duty Frame</th>
                        <th colSpan="7" className="py-2 border-r border-slate-800 text-amber-400 bg-amber-950/5">LEG 2: Mid-Shift Operational Workings</th>
                        <th colSpan="7" className="py-2 border-r border-slate-800 text-cyan-400 bg-cyan-950/5">LEG 3: Secondary Handover Working Loop</th>
                        <th colSpan="7" className="py-2 border-r border-slate-800 text-purple-400 bg-purple-950/5">LEG 4: Final Closing Target Leg</th>
                        <th colSpan="5" className="py-2 text-slate-300 bg-slate-900">Total Shift Summary</th>
                      </tr>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-center font-semibold">
                      {!isTrainOperator && (
                        <th className="py-2 px-1 border-r border-slate-800 text-center w-[60px] select-none">
                          <input id="superadminlayout-i8" name="superadminlayout-i8"
                            type="checkbox"
                            checked={finalRosterLinks.length > 0 && selectedRowIds.length === finalRosterLinks.length}
                            onChange={handleSelectAllRows}
                            className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer mx-auto"
                          />
                        </th>
                      )}
                      <th className="py-2 px-2 border-r border-slate-800/50 w-[80px]">Duty ID</th>
                      <th className="py-2 px-2 border-r border-slate-800/50 w-[150px]">Operator Name</th>
                      {headers.map((hdr, idx) => {
                        // Section borders logic
                        const isSectionEnd = ['leg1Km', 'leg2Km', 'leg3Km', 'leg4Km', 'leg1HandoverLoc', 'leg2ArrLoc', 'leg3ArrLoc', 'leg4FinalArrLoc'].includes(hdr.key);
                        const borderClass = isSectionEnd ? 'border-r border-slate-800' : 'border-r border-slate-800/50';
                        
                        // Width classes matching original columns
                        let widthClass = 'w-[100px]';
                        if (hdr.key.endsWith('Km') || hdr.key === 'totalKm') widthClass = 'w-[85px]';
                        else if (hdr.key === 'signOnLocation' || hdr.key === 'signOffLocation') widthClass = 'w-[110px]';
                        else if (hdr.key === 'trainId' || hdr.key === 'leg2TrainNo' || hdr.key === 'leg3TrainNo' || hdr.key === 'leg4TrainNo') widthClass = 'w-[90px]';
                        else if (hdr.key === 'remarks') widthClass = 'text-left w-[240px] px-4';
                        
                        const isEditing = editingHeaderIdx === idx;
                        
                        if (isEditing) {
                          return (
                            <th key={hdr.key} className={`py-1 px-1 ${borderClass} ${widthClass} bg-slate-950`}>
                              <input id="superadminlayout-i9" name="superadminlayout-i9" 
                                type="text" 
                                value={editHeaderValue} 
                                onChange={(e) => setEditHeaderValue(e.target.value)} 
                                onBlur={() => handleHeaderSave(idx)} 
                                onKeyDown={(e) => e.key === 'Enter' && handleHeaderSave(idx)} 
                                className="w-full bg-slate-900 text-amber-400 font-bold border border-amber-500 rounded px-1 py-0.5 text-center focus:outline-none text-xs" 
                                autoFocus 
                              />
                            </th>
                          );
                        }
                        
                        return (
                          <th 
                            key={hdr.key} 
                            onDoubleClick={() => {
                              if (isTrainOperator) return;
                              setEditingHeaderIdx(idx);
                              setEditHeaderValue(hdr.label);
                            }}
                            className={`py-2 px-2 ${borderClass} ${widthClass} ${!isTrainOperator ? 'cursor-pointer hover:bg-slate-900/60 hover:text-slate-200' : ''} transition-colors select-none`}
                            title={!isTrainOperator ? "Double click to edit column header name" : ""}
                          >
                            {hdr.label}
                          </th>
                        );
                      })}
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-350 text-center">
                      {finalRosterLinks.map((dutyRaw, idx) => {
                        const computedLegs = computeDutyLegKms(dutyRaw, activeDay);
                        const formatCellVal = (rawVal, compVal) => {
                          if (typeof compVal === 'number' && compVal > 0) return `${compVal} km`;
                          if (typeof rawVal === 'number' && rawVal > 0) return `${rawVal} km`;
                          if (typeof rawVal === 'string' && rawVal.trim() !== '' && rawVal.trim() !== '--' && rawVal.trim() !== '0' && rawVal.trim() !== '0 km') {
                            return rawVal.includes('km') ? rawVal : `${rawVal} km`;
                          }
                          return compVal > 0 ? `${compVal} km` : '--';
                        };
                        const duty = {
                          ...dutyRaw,
                          leg1Km: formatCellVal(dutyRaw.leg1Km, computedLegs.leg1Km),
                          leg2Km: formatCellVal(dutyRaw.leg2Km, computedLegs.leg2Km),
                          leg3Km: formatCellVal(dutyRaw.leg3Km, computedLegs.leg3Km),
                          leg4Km: formatCellVal(dutyRaw.leg4Km, computedLegs.leg4Km),
                          totalKm: formatCellVal(dutyRaw.totalKm, computedLegs.totalKm),
                        };
                        const rowBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";
                        const stickyDutyBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950";
                        const matchedDeploy = deployments.find(d =>
                          normalizeDutyId(d.dutyId) === normalizeDutyId(duty.dutyId)
                        );
                        const operatorName = matchedDeploy ? matchedDeploy.empName : '--';
                        const operatorId = matchedDeploy ? matchedDeploy.empId : '--';

                        const renderCell = (fieldName, customStyle = "text-slate-300") => {
                          const colIndex = ROSTER_COL_FIELDS.indexOf(fieldName);
                          const isEditing = editingCell?.rowId === duty.id && editingCell?.station === fieldName && !editingCell?.isDeployment;
                          const displayVal = duty[fieldName] || '--';
                          const isSelected = isCellInRange(idx, colIndex);
                          const isFlashing = flashCells.has(`${duty.id}:${fieldName}`);

                          if (isEditing) {
                            return (
                              <td key={fieldName} className="p-1 border-r border-slate-800/40 bg-slate-950">
                                <div className="flex items-center gap-1">
                                  <input id="superadminlayout-i10" name="superadminlayout-i10"
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => handleCellSave(duty.id, fieldName)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCellSave(duty.id, fieldName)}
                                    className="w-full bg-slate-950 text-emerald-400 font-bold border border-emerald-500 rounded px-1 py-0.5 text-center focus:outline-none text-[11px]"
                                    autoFocus
                                  />
                                  {cellClipboard && (
                                    <button
                                      type="button"
                                      onMouseDown={(e) => { e.preventDefault(); setEditValue(cellClipboard.value); }}
                                      className="shrink-0 bg-amber-500/20 hover:bg-amber-500/40 text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wide transition-all"
                                      title={`Paste: "${cellClipboard.value}"`}
                                    >Paste</button>
                                  )}
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={fieldName}
                              onMouseDown={(e) => {
                                 if (e.button !== 0 || isTrainOperator) return;
                                 if (isPasteMode) {
                                   // Paste mode: clicking any cell pastes the range starting here
                                   handleRangePaste(idx, colIndex, finalRosterLinks);
                                   return;
                                 }
                                 if (e.shiftKey && rangeAnchor) {
                                   // Extend selection
                                   setRangeFocus({ rowIndex: idx, colIndex });
                                 } else {
                                   // Start new selection
                                   setRangeAnchor({ rowIndex: idx, colIndex });
                                   setRangeFocus({ rowIndex: idx, colIndex });
                                   setIsRangeSelecting(true);
                                   setRangeClipboard(null);
                                   setIsPasteMode(false);
                                 }
                               }}
                               onMouseEnter={() => {
                                 if (isRangeSelecting && !isTrainOperator) {
                                   setRangeFocus({ rowIndex: idx, colIndex });
                                 }
                               }}
                               onMouseUp={() => setIsRangeSelecting(false)}
                               onDoubleClick={() => {
                                 if (isPasteMode || isTrainOperator) return;
                                 setEditingCell({ rowId: duty.id, direction: 'ROSTER', station: fieldName, isTid: false, isDeployment: false });
                                 setEditValue(displayVal);
                               }}
                               onContextMenu={(e) => {
                                 if (isTrainOperator) return;
                                 e.preventDefault();
                                 setContextMenu({ x: e.clientX, y: e.clientY, value: displayVal, rowId: duty.id, fieldName });
                               }}
                              className={[
                                'py-2 px-2 border-r border-slate-800/40 truncate select-none relative group/cell text-center text-[11px]',
                                customStyle,
                                isPasteMode ? 'cursor-crosshair' : 'cursor-pointer',
                                isFlashing ? 'bg-emerald-500/30 transition-colors' : '',
                                isSelected && !isFlashing ? 'bg-blue-500/20 outline outline-1 outline-blue-400/60' : '',
                                !isSelected && !isFlashing ? 'hover:bg-slate-850/40' : '',
                              ].join(' ')}
                            >
                              {displayVal}
                              {!isPasteMode && (
                                <span className="absolute right-0.5 top-1/2 -translate-y-1/2 hidden group-hover/cell:flex items-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCellClipboard({ value: displayVal, fieldName });
                                      navigator.clipboard?.writeText(displayVal).catch(() => {});
                                    }}
                                    className="bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 p-0.5 rounded transition-all"
                                    title={`Quick-copy: "${displayVal}"`}
                                  >
                                    <Copy className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              )}
                              {isPasteMode && (
                                <span className="absolute inset-0 flex items-center justify-center bg-amber-500/10 text-amber-400 text-[8px] font-black">PASTE HERE</span>
                              )}
                            </td>
                          );
                        };
                        return (
                          <tr key={duty.id} className={`${rowBgClass} ${selectedRowIds.includes(duty.id) ? 'bg-amber-500/5' : ''} hover:bg-slate-850/20 border-b border-slate-800/40 transition-colors`}>
                            {!isTrainOperator && (
                              <td className="py-2 border-r border-slate-800 text-center font-bold flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input id="superadminlayout-i11" name="superadminlayout-i11"
                                  type="checkbox"
                                  checked={selectedRowIds.includes(duty.id)}
                                  onChange={() => handleToggleSelectRow(duty.id)}
                                  className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                                />
                                <button onClick={() => handleDeleteRow(duty.id)} className="text-rose-500 hover:text-rose-450 p-0.5 transition-colors" title="Delete single duty"><Trash2 className="h-3.5 w-3.5" /></button>
                              </td>
                            )}
                            <td className={`py-2 px-2 text-center border-r border-slate-800 font-bold text-blue-400 sticky left-0 z-10 shadow-sm ${stickyDutyBgClass}`}>{duty.dutyId}</td>
                            <td className={`py-2 px-2 text-center border-r border-slate-800 relative group ${matchedDeploy?.isExchanged ? 'bg-yellow-500/10 border-l border-r border-yellow-500/20' : ''}`}>
                              <div className="font-bold text-emerald-400 text-[11px] truncate max-w-[145px]">{operatorName}</div>
                              {operatorId && operatorId !== '--' && (
                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">ID: {operatorId}</div>
                              )}
                              {matchedDeploy?.isExchanged && (
                                <>
                                  <div className="mt-1 flex items-center justify-center gap-0.5 text-[8.5px] font-black uppercase tracking-widest text-yellow-455 bg-yellow-500/10 border border-yellow-500/30 px-1 py-0.5 rounded mx-auto w-fit">
                                    <Repeat className="h-2 w-2 animate-spin-slow" />
                                    🔄 EXCHANGED
                                  </div>

                                  <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 bg-slate-950 border border-yellow-500/30 p-2.5 rounded-lg shadow-2xl hidden group-hover:block z-50 text-[10px] space-y-1 w-64 text-left font-mono normal-case">
                                    <div className="font-bold text-yellow-500 border-b border-slate-900 pb-1 flex items-center gap-1 uppercase tracking-wider">
                                      <Repeat className="h-3 w-3" /> Duty Exchanged
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Original Operator:</span>
                                      <div className="text-slate-300 font-bold uppercase">{matchedDeploy.originalEmpName || '--'} <span className="text-slate-500 normal-case">(Duty {matchedDeploy.originalDutyId || matchedDeploy.dutyId})</span></div>
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Current Operator:</span>
                                      <div className="text-emerald-400 font-bold uppercase">{matchedDeploy.empName || '--'} <span className="text-slate-500 normal-case">(Duty {matchedDeploy.dutyId})</span></div>
                                    </div>
                                    <div className="border-t border-slate-850 pt-1 text-[8.5px] text-slate-500 space-y-0.5">
                                      <div>Approved By: {matchedDeploy.approvedBy || "Crew Controller"}</div>
                                      <div>Approval Date: {matchedDeploy.approvedDateTime ? new Date(matchedDeploy.approvedDateTime).toLocaleString() : "--"}</div>
                                      <div className="text-slate-650 truncate mt-0.5">ID: {matchedDeploy.exchangeId}</div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </td>
                            {renderCell('signOnTime', 'text-emerald-400 font-bold')}{renderCell('signOnLocation', 'text-slate-400')}{renderCell('trainId', 'text-slate-100 font-bold')}{renderCell('leg1TimeFrom')}{renderCell('leg1TimeTo')}{renderCell('leg1TripTime')}{renderCell('leg1HandoverLoc')}{renderCell('leg1Km', 'text-blue-400 font-bold bg-blue-950/20')}
                            {renderCell('leg2DepLoc')}{renderCell('leg2TrainNo', 'text-amber-400 font-bold')}{renderCell('leg2DepTime')}{renderCell('leg2ArrTime')}{renderCell('leg2TimeTo')}{renderCell('leg2ArrLoc')}{renderCell('leg2Km', 'text-amber-400 font-bold bg-amber-950/20')}
                            {renderCell('leg3DepLoc')}{renderCell('leg3TrainNo', 'text-cyan-400 font-bold')}{renderCell('leg3DepTime')}{renderCell('leg3ArrTime')}{renderCell('leg3TimeTo')}{renderCell('leg3ArrLoc')}{renderCell('leg3Km', 'text-cyan-400 font-bold bg-cyan-950/20')}
                            {renderCell('leg4FinalDepLoc')}{renderCell('leg4TrainNo', 'text-purple-400 font-bold')}{renderCell('leg4FinalDepTime')}{renderCell('leg4FinalArrTime')}{renderCell('leg4TimeTo')}{renderCell('leg4FinalArrLoc')}{renderCell('leg4Km', 'text-purple-400 font-bold bg-purple-950/20')}
                            {renderCell('signOffTime', 'text-rose-400 font-semibold')}{renderCell('signOffLocation', 'text-slate-400')}{renderCell('totalHours', 'text-emerald-400 font-bold')}{renderCell('remarks', 'text-left text-slate-400 italic px-4 max-w-[240px] truncate')}{renderCell('totalKm', 'text-emerald-400 font-black bg-emerald-950/30')}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Cell Right-Click Context Menu ── */}
              {contextMenu && (
                <>
                  {/* Invisible backdrop to dismiss */}
                  <div
                    className="fixed inset-0 z-[90]"
                    onClick={handleContextMenuDismiss}
                    onContextMenu={(e) => { e.preventDefault(); handleContextMenuDismiss(); }}
                  />
                  {/* Floating menu */}
                  <div
                    className="fixed z-[91] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-[210px] font-mono text-xs"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                  >
                    <div className="px-2 py-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-800 mb-1">
                      Cell: <span className="text-slate-400">{contextMenu.fieldName}</span>
                    </div>
                    <div className="px-2 py-1 text-[10px] text-slate-300 bg-slate-800/50 rounded mb-1 font-bold truncate">
                      "{contextMenu.value}"
                    </div>
                    <button
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-cyan-400 hover:bg-slate-800 rounded transition-colors font-bold uppercase tracking-wider text-[10px]"
                      onClick={() => {
                        setCellClipboard({ value: contextMenu.value, fieldName: contextMenu.fieldName });
                        navigator.clipboard?.writeText(contextMenu.value).catch(() => {});
                        handleContextMenuDismiss();
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy Cell Value
                    </button>
                    {cellClipboard && (
                      <button
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-amber-400 hover:bg-slate-800 rounded transition-colors font-bold uppercase tracking-wider text-[10px]"
                        onClick={async () => {
                          if (!window.confirm(`Paste "${cellClipboard.value}" into this cell?`)) return;
                          try {
                            await import('firebase/firestore').then(({ doc: fdoc, updateDoc }) =>
                              updateDoc(fdoc(db, 'crew_final_links', contextMenu.rowId), {
                                [contextMenu.fieldName]: cellClipboard.value
                              })
                            );
                            fetchLiveData();
                          } catch (err) {
                            console.error(err);
                            alert('Failed to paste value.');
                          }
                          handleContextMenuDismiss();
                        }}
                      >
                        <Plus className="h-3 w-3" /> Paste: "{cellClipboard.value}"
                      </button>
                    )}
                    <button
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:bg-slate-800 rounded transition-colors font-bold uppercase tracking-wider text-[10px] mt-0.5 border-t border-slate-800/60 pt-1.5"
                      onClick={() => {
                        setEditingCell({ rowId: contextMenu.rowId, direction: 'ROSTER', station: contextMenu.fieldName, isTid: false, isDeployment: false });
                        setEditValue(contextMenu.value);
                        handleContextMenuDismiss();
                      }}
                    >
                      ✏️ Edit Cell
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : activeTab === 'CREW' ? (
            <CrewDirectory crewData={BMRCL_CREW_REGISTRY} isAdmin={true} />
          ) : activeTab === 'EXCHANGE' ? (
            <ShiftExchange />
          ) : activeTab === 'REPORTS' ? (
            <div className="space-y-6">
              <TrainOperatorPerformance />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <PerformanceMetrics incidents={liveIncidents} />
              </div>
              <ReportsCenter />
            </div>
          ) : activeTab === 'RAKE' ? (
            <div className="space-y-6">
              <TrainRakeRegistry />
              <RollingStockFaultLog />
            </div>
          ) : activeTab === 'LEAVE' ? (
            <div className="space-y-6">
              {!isTrainOperator && <GCCControl onOpenWindow={(d) => console.log(d)} />}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-amber-400 font-bold mb-2">Train Operator Form</h4>
                  <TORequestForm />
                </div>
                <div>
                  <h4 className="text-cyan-400 font-bold mb-2">Leave Desk Manager</h4>
                  <LeaveRequestManager userRole={userProfile?.role || 'VIEWER'} />
                </div>
              </div>
            </div>
          ) : activeTab === 'LEAVE_BO' ? (
            <LeaveBookOffManager />
          ) : activeTab === 'NIGHT_CHANGEOVER' ? (
            <ChangeoverDashboard onRefresh={fetchLiveData} />
          ) : activeTab === 'CHANGEOVER_LINK' ? (
            <ChangeoverLink />
          ) : activeTab === 'MODULES' ? (
            <div className="space-y-8 p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
                <h2 className="text-2xl font-black text-emerald-400 tracking-wider flex items-center gap-3">
                  <Radio size={28} /> OCC SYSTEM MODULES SUITE
                </h2>
                <span className="bg-slate-800 text-slate-400 text-xs px-4 py-1.5 rounded-full font-bold shadow-inner">V 2.0 INTEGRATED</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className={`border border-amber-500/30 p-5 rounded-xl bg-slate-950 ${isTrainOperator ? 'xl:col-span-2' : ''}`}>
                  <h3 className="text-amber-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-850 pb-2 uppercase tracking-wider text-sm">
                    <AlertTriangle className="h-4 w-4" /> 2. Manual Override System
                  </h3>
                  <ManualOverrideForm />
                </div>

                {!isTrainOperator && (
                  <div>
                    <GccRosterUploader />
                  </div>
                )}


              </div>
            </div>
          ) : activeTab === 'EMERGENCY_RELIEF' ? (
            <EmergencyReliefEngine />
          ) : activeTab === 'ANALYTICS' ? (
            <div className="space-y-6">
              <TrainOperatorPerformance />
            </div>
          ) : activeTab === 'ADMIN' ? (
            <div className="space-y-6">
              <AdminPanel />
            </div>
          ) : activeTab === 'KM_CALC_SUITE' ? (
            <CrewKMCalculatorSuite />
          ) : activeTab === 'JMD_DRIVING_HOURS' ? (
            <JmdDrivingHours />
          ) : activeTab === 'ALS_PLANNER' ? (
            <AIALSCabInspectionPlanner />
          ) : activeTab === 'DUTY_GENERATOR' ? (
            <DailyDutyGeneratorSuite />
          ) : null}
          </Suspense>
        </main>
      </div>

      {/* Theme & Comfort Settings Modal */}
      {showThemeSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-center items-center p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-400">Workstation Theme & Comfort Preferences</h3>
              <button 
                onClick={() => setShowThemeSettingsModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-450 hover:text-white px-2.5 py-1 rounded text-[10px] uppercase font-black tracking-widest"
              >
                ✕ Close Settings
              </button>
            </div>
            <div className="pt-2">
              <ThemeSettings />
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant Sidebar */}
      <AiAssistantSidebar 
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        liveIncidents={liveIncidents}
        deployments={deployments}
        liveTrainTrackingMap={liveTrainTrackingMap}
      />

      {/* ── REAL-TIME NEW LOGIN REQUEST POPUP ── */}
      {activeRequestPopup && (
        <div className="fixed bottom-6 right-6 z-[60] w-full max-w-sm bg-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] backdrop-blur-md text-slate-100 font-mono flex flex-col gap-4 animate-bounce-short">
          <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-3">
            <AlertTriangle className="h-5 w-5 animate-pulse text-amber-500" />
            <h3 className="text-xs font-black tracking-widest uppercase">NEW LOGIN REQUEST</h3>
            <span className="ml-auto bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] px-1.5 py-0.5 rounded font-black">LIVE</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Employee :</span>
              <div className="text-xs font-black text-slate-200">{activeRequestPopup.employeeId}</div>
              <div className="text-xs font-black text-slate-350">{activeRequestPopup.employeeName}</div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Designation :</span>
              <div className="text-xs font-bold text-slate-300">{activeRequestPopup.designation}</div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Depot :</span>
              <div className="text-xs font-bold text-slate-300">{activeRequestPopup.depot}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-850 pt-2.5">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Requested Login :</span>
                <div className="text-xs font-black text-cyan-400">{activeRequestPopup.loginMethod}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Requested Role :</span>
                <div className="text-xs font-black text-amber-400">{activeRequestPopup.requestedRole}</div>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-0.5">Requested Time :</span>
              <div className="text-[11px] font-bold text-slate-400">{activeRequestPopup.requestDate} {activeRequestPopup.requestTime}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            <button 
              onClick={() => handleApproveRequest(activeRequestPopup)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-2 rounded-lg text-center uppercase tracking-wider text-[11px] transition-all shadow-md shadow-emerald-950/20"
            >
              Approve
            </button>
            <button 
              onClick={() => setShowRejectReasonModal(true)}
              className="bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 font-black py-2 rounded-lg text-center uppercase tracking-wider text-[11px] transition-all"
            >
              Reject
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => {
                setActiveTab('ADMIN');
                setDismissedPopupIds(prev => {
                  const next = new Set(prev);
                  next.add(activeRequestPopup.requestId);
                  return next;
                });
                setActiveRequestPopup(null);
              }}
              className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold py-1.5 rounded-lg text-center uppercase tracking-wider text-[10px] transition-all"
            >
              View Details
            </button>
            <button 
              onClick={() => {
                setDismissedPopupIds(prev => {
                  const next = new Set(prev);
                  next.add(activeRequestPopup.requestId);
                  return next;
                });
                setActiveRequestPopup(null);
              }}
              className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 font-bold py-1.5 rounded-lg text-center uppercase tracking-wider text-[10px] transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── REJECTION REASON MODAL ── */}
      {showRejectReasonModal && activeRequestPopup && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 font-mono">
            <div className="flex items-center gap-2 text-rose-500 border-b border-slate-850 pb-2">
              <ShieldAlert size={20} />
              <h3 className="text-xs font-black uppercase tracking-wider">Reject Login Request</h3>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Specify reason for rejecting <span className="text-white font-bold">{activeRequestPopup.employeeName}</span> ({activeRequestPopup.employeeId}):
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5" htmlFor="superadminlayout-l1">Select Reason</label>
                <select id="superadminlayout-i12" name="superadminlayout-i12" 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="Not Operational Crew">Not Operational Crew</option>
                  <option value="Wrong Employee">Wrong Employee</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Retired">Retired</option>
                  <option value="Duplicate Request">Duplicate Request</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {rejectionReason === 'Others' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5" htmlFor="superadminlayout-l2">Custom Reason</label>
                  <input id="superadminlayout-i13" name="superadminlayout-i13"
                    type="text"
                    required
                    placeholder="Enter custom reason..."
                    value={customRejectionReason}
                    onChange={(e) => setCustomRejectionReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-2 border-t border-slate-800">
              <button 
                onClick={() => setShowRejectReasonModal(false)}
                className="bg-slate-850 hover:bg-slate-800 text-white px-3 py-2 rounded uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleRejectRequestSubmit}
                className="bg-rose-600 hover:bg-rose-500 text-slate-950 px-3 py-2 rounded uppercase"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
