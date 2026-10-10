/* eslint-disable react/prop-types */
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, deleteDoc, setDoc, writeBatch, serverTimestamp, query, where, doc, onSnapshot } from 'firebase/firestore';
import {
  Search, RefreshCw, ArrowDownCircle, ArrowUpCircle, Train,
  Trash2, RotateCcw, AlertTriangle, Clock, UploadCloud, Calendar, Download, Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry';
import { buildWeekdayLiveTrainTrackingMap, buildLiveTrainTrackingMap } from '../data/weekdayReliefIdChartRegistry';

import { lazyWithRetry } from '../utils/lazyWithRetry';

// ── Lazy-loaded role-based Layout chunks with retry resilience ──
const SuperAdminLayout        = lazyWithRetry(() => import('./layout/SuperAdminLayout'));
const AdminSSLayout           = lazyWithRetry(() => import('./layout/AdminSSLayout'));
const OccControllerLayout     = lazyWithRetry(() => import('./layout/OccControllerLayout'));
const CrewControllerLayout    = lazyWithRetry(() => import('./layout/CrewControllerLayout'));
const StationControllerLayout = lazyWithRetry(() => import('./layout/StationControllerLayout'));
const TrainOperatorPwa        = lazyWithRetry(() => import('./layout/TrainOperatorPwa'));
const ViewerLayout            = lazyWithRetry(() => import('./layout/ViewerLayout'));

// Data
import { BMRCL_CREW_REGISTRY, BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import { 
  WEEKDAY_MASTER_LINKS,
  SATURDAY_MASTER_LINKS,
  SUNDAY_MASTER_LINKS,
  MONDAY_MASTER_LINKS,
  getMasterLinksForDay
} from '../data/canonicalDayLinksRegistry';
import { getOperatorForDuty } from '../data/weekdayMasterDutyRoster';

// ── Global Suspense fallback shown while lazy chunks download ──
const ModuleLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent" />
    <p className="text-sm text-gray-400 animate-pulse tracking-widest uppercase font-mono">Loading PYIDCC Module...</p>
  </div>
);

// Convert file to Base64 part for Gemini
const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: reader.result.split(',')[1],
          mimeType: file.type || "image/jpeg" // Fallback type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// ── Duty ID Utilities ──
// Normalize: "1" → "01", "9" → "09", "duty_09" → "09"; leaves "10", "CC1", "SB12" etc. unchanged
const normalizeDutyId = (id) => {
  const s = String(id || '').trim();
  const clean = s.replace(/^duty[_\s-]*/i, '');
  const crMatch = clean.match(/^CR(?:RC)?[-\s]?(\d{1,3})$/i);
  if (crMatch) {
    const num = parseInt(crMatch[1], 10);
    return num < 10 ? '0' + num : String(num);
  }
  if (/^[0-9]$/.test(clean)) return '0' + clean;
  if (/^\d{1,2}$/.test(clean)) return clean.padStart(2, '0');
  if (/^\d{3}$/.test(clean)) return clean;
  return clean || s;
};

// Robust schedule type normalization across tabs, Excel uploads, and Firestore documents
const normalizeScheduleType = (type, docId = '') => {
  const s = String(type || '').trim().toUpperCase();
  if (s === 'SAT & GH' || s === 'GH' || s === 'SATURDAY & GH' || s === 'SATURDAY' || s.includes('SAT')) return 'SATURDAY';
  if (s === 'SUNDAY' || s === 'SUN' || s.includes('SUN')) return 'SUNDAY';
  if (s === 'MONDAY' || s === 'MON' || s.includes('MON')) return 'MONDAY';
  if (s === 'WEEKDAY' || s === 'WD' || s.includes('WEEKDAY')) return 'WEEKDAY';
  const idStr = String(docId || '').toLowerCase();
  if (idStr.includes('sat')) return 'SATURDAY';
  if (idStr.includes('sun')) return 'SUNDAY';
  if (idStr.includes('mon')) return 'MONDAY';
  if (idStr.includes('weekday')) return 'WEEKDAY';
  return 'WEEKDAY';
};

// Validate: rejects malformed IDs like "6Z", "1A", empty strings, etc.
// Valid forms: numeric-only (00 to 999), CR00-CR999 OR known special prefixes (CC, SB, RR, PRO)
const isValidDutyId = (id) => {
  const s = String(id || '').trim();
  if (!s || s === '--' || s === 'UNASSIGNED') return false;
  // Accept: pure numeric (0-999)
  if (/^\d{1,3}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 0 && n <= 999;
  }
  // Accept: CR00 - CR999
  if (/^CR(?:RC)?[-\s]?\d{1,3}$/i.test(s)) {
    const m = s.match(/\d{1,3}/);
    if (m) {
      const n = parseInt(m[0], 10);
      return n >= 0 && n <= 999;
    }
  }
  // Accept: special duty prefixes CC, SB, RR, PRO, EX, ST followed by digits
  if (/^(CC|SB|RR|PRO|EX|ST|CR)\d+$/i.test(s)) return true;
  return false;
};

// Deduplicate: given an array of link/deployment objects keyed by normalized dutyId,
// keep only the best entry per duty (prefer the one with an operator assigned,
// prefer the zero-padded document ID over the bare numeric one).
const deduplicateByDutyId = (items, getIdFn = (x) => x.dutyId) => {
  const seen = new Map();
  for (const item of items) {
    const raw = String(getIdFn(item) || '').trim();
    if (!raw) continue;
    const norm = normalizeDutyId(raw);
    if (!seen.has(norm)) {
      seen.set(norm, { ...item, dutyId: norm });
    } else {
      const existing = seen.get(norm);
      const existingHasOp = existing.empName && existing.empName !== '--';
      const currentHasOp = (item.empName && item.empName !== '--') ||
                           (item.name && item.name !== '--');
      // Replace existing if current has an operator and existing does not
      if (!existingHasOp && currentHasOp) {
        seen.set(norm, { ...item, dutyId: norm });
      }
      // Otherwise keep existing (already normalized ID)
    }
  }
  return Array.from(seen.values());
};

const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const findClosestRegistryEmployeeByName = (extractedName) => {
  if (!extractedName || extractedName === '--') return null;
  const cleanExtracted = extractedName.toLowerCase().replace(/[^a-z]/g, '');
  if (cleanExtracted.length < 3) return null;

  let bestMatch = null;
  let bestScore = 999;

  for (const emp of BMRCL_CREW_REGISTRY) {
    const cleanReg = emp.name.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanReg === cleanExtracted) return emp;
    if (cleanReg.length >= 4 && cleanExtracted.length >= 4) {
      if (cleanReg.includes(cleanExtracted) || cleanExtracted.includes(cleanReg)) {
        return emp;
      }
    }
    const dist = levenshteinDistance(cleanReg, cleanExtracted);
    const maxAllowedDist = Math.max(2, Math.floor(cleanReg.length / 4));
    if (dist <= maxAllowedDist && dist < bestScore) {
      bestScore = dist;
      bestMatch = emp;
    }
  }
  return bestMatch;
};

const alignRecordWithRegistry = (record) => {
  let empNo = String(record.employeeId || record.empNo || '').trim();
  let name = String(record.name || '').trim();

  // Safeguard 1: Swap check
  const empNoIsDigits = /^\d+$/.test(empNo);
  const nameIsDigits = /^\d+$/.test(name);
  if (!empNoIsDigits && nameIsDigits) {
    const temp = empNo;
    empNo = name;
    name = temp;
  }

  // Safeguard 2: empNo has letters, name is empty or digits
  if (!/^\d+$/.test(empNo) && empNo !== '' && empNo !== '--') {
    const matchedByNameInEmpNo = findClosestRegistryEmployeeByName(empNo);
    if (matchedByNameInEmpNo) {
      if (/^\d+$/.test(name)) {
        empNo = name;
        name = matchedByNameInEmpNo.name;
      } else {
        empNo = matchedByNameInEmpNo.id;
        name = matchedByNameInEmpNo.name;
      }
    }
  }

  // Safeguard 3: empNo is digits (ID) but name is empty, auto-fill name
  if (/^\d+$/.test(empNo) && (!name || name === '--' || name === '')) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      return {
        ...record,
        employeeId: empNo,
        name: matchById.name
      };
    }
  }

  // Safeguard 4: empNo is empty but name has letters, auto-fill ID
  if ((!empNo || empNo === '--' || empNo === '') && name && name !== '--') {
    const matchedByName = findClosestRegistryEmployeeByName(name);
    if (matchedByName) {
      return {
        ...record,
        employeeId: matchedByName.id,
        name: matchedByName.name
      };
    }
  }

  // General registry alignment
  if (empNo && /^\d+$/.test(empNo)) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      const cleanRegistryName = matchById.name.toLowerCase().replace(/[^a-z]/g, '');
      const cleanExtractedName = name.toLowerCase().replace(/[^a-z]/g, '');
      const firstWordExtracted = name.split(/[\s.]+/)[0].toLowerCase();
      const firstWordRegistry = matchById.name.split(/[\s.]+/)[0].toLowerCase();

      const isMatch = cleanRegistryName.includes(cleanExtractedName) ||
        cleanExtractedName.includes(cleanRegistryName) ||
        firstWordExtracted === firstWordRegistry ||
        levenshteinDistance(cleanRegistryName, cleanExtractedName) <= 3;

      if (isMatch) {
        return {
          ...record,
          employeeId: empNo,
          name: matchById.name
        };
      } else {
        const matchedByFuzzyName = findClosestRegistryEmployeeByName(name);
        if (matchedByFuzzyName) {
          return {
            ...record,
            employeeId: matchedByFuzzyName.id,
            name: matchedByFuzzyName.name
          };
        }
      }
    }
  }

  return {
    ...record,
    employeeId: empNo,
    name
  };
};


export default function Dashboard({ initialTab = 'DISPATCH' }) {
  const { hasPermission, userProfile } = useAuth();
  const isOperatorOrViewer = userProfile?.role === 'TRAIN_OPERATOR' || userProfile?.role === 'VIEWER';

  const hasAdminRights = () => {
    return hasPermission("User Management", "Full") || userProfile?.role === 'CREW_CONTROLLER';
  };

  const allowedTabs = React.useMemo(() => {
    const allTabs = [
      { id: 'DISPATCH', label: 'DISPATCH GATE', module: 'Dashboard', permission: 'View' },
      { id: 'WTT', label: 'WTT', module: 'Dashboard', permission: 'View' },
      { id: 'ROSTER', label: 'ROSTER', module: 'Duty Roster', permission: 'Own' },
      { id: 'DUTY_GENERATOR', label: 'DUTY GENERATOR', module: 'Duty Roster', permission: 'Own' },
      { id: 'CREW', label: 'CREW', module: 'Crew Registry', permission: 'View' },
      { id: 'REPORTS', label: 'REPORTS', module: 'Reports', permission: 'View' },
      { id: 'ADMIN', label: 'ADMIN', module: 'Settings', permission: 'Full' },
      { id: 'EXCHANGE', label: 'SHIFT EXCHANGE', module: 'Shift Exchange', permission: 'Request' },
      { id: 'RAKE', label: 'RAKE', module: 'Dashboard', permission: 'View' },
      { id: 'LEAVE', label: 'LEAVE REQUEST', module: 'Dashboard', permission: 'View' },
      { id: 'MODULES', label: 'MODULES', module: 'Dashboard', permission: 'View' },
      { id: 'EMERGENCY_RELIEF', label: 'EMERGENCY RELIEF', module: 'Emergency Relief Module', permission: 'View' },
      { id: 'KM_CALC_SUITE', label: 'KM CALCULATOR SUITE', module: 'Dashboard', permission: 'View' }
    ];

    return allTabs.filter(tab => {
      if (tab.roleRequired && userProfile?.role !== tab.roleRequired) return false;
      return hasPermission(tab.module, tab.permission);
    });
  }, [userProfile?.role, hasPermission]);

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.some(t => t.id === activeTab)) {
      setActiveTab(allowedTabs[0].id);
    }
  }, [allowedTabs, activeTab]);
  const [wttActiveView, setWttActiveView] = useState('MATRIX');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDay, setActiveDay] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('pyidcc_active_day_override') || window.localStorage.getItem('pyidcc_target_deployment_day');
        if (saved) return normalizeScheduleType(saved);
      }
    } catch (e) {}
    const day = new Date().getDay(); // 0=Sun, 1=Mon, 2=Tue ... 6=Sat
    if (day === 0) return 'SUNDAY';
    if (day === 6) return 'SATURDAY';
    if (day === 1) return 'MONDAY';
    return 'WEEKDAY';
  });

  // Keep activeDay synchronized with Step 1 Deployment Target Day across all components
  useEffect(() => {
    const handleActiveDaySync = (e) => {
      const day = e?.detail?.dayType || e?.detail;
      if (day) {
        const norm = normalizeScheduleType(day);
        setActiveDay(norm);
      }
    };
    const handleStorage = (e) => {
      if (e.key === 'pyidcc_active_day_override' || e.key === 'pyidcc_target_deployment_day') {
        if (e.newValue) setActiveDay(normalizeScheduleType(e.newValue));
      }
    };
    window.addEventListener('pyidcc-active-day-changed', handleActiveDaySync);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('pyidcc-active-day-changed', handleActiveDaySync);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);
  const [unifiedRows, setUnifiedRows] = useState([]);
  const [links, setLinks] = useState([]);
  const [dailyDeployment, setDailyDeployment] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staticWtt, setStaticWtt] = useState([]);
  const [staticLinks, setStaticLinks] = useState([]);
  const [deploymentsData, setDeploymentsData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [incidentsData, setIncidentsData] = useState([]);
  const [exchangesData, setExchangesData] = useState([]);
  const [reportsSubTab, setReportsSubTab] = useState('PERFORMANCE'); // 'EXPORTS' or 'PERFORMANCE'
  const [toViewMode, setToViewMode] = useState('CONSOLE'); // 'CONSOLE' (Full Operational Workstation) | 'PWA' (Mobile View)

  const liveWttDataRef = useRef(WTT_MASTER_REGISTRY);
  const liveLinksDataRef = useRef(WEEKDAY_MASTER_LINKS);

  // Incident Control States
  const [targetTid, setTargetTid] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [incidentReason, setIncidentReason] = useState('Signal Fluctuation');

  // automated_dispatch_gate
  const [dispatchGateConfig, setDispatchGateConfig] = useState({
    "incidentId": "string",
    "trainId": "string",
    "incidentType": "string",
    "recommendations": [
      { "empId": "string", "empName": "string", "score": "number", "dutyId": "string", "remainingHours": "number" }
    ],
    "status": "RECOMMENDED",
    "timestamp": "serverTimestamp"
  });



  // Train ID Swap Panel States
  const [swapFromTid, setSwapFromTid] = useState('');
  const [swapToTid, setSwapToTid] = useState('');



  // Grid Inline Editing States
  const [editingCell, setEditingCell] = useState({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false });
  const [editValue, setEditValue] = useState('');

  // Reports Center States
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  const handleDownloadAllReports = async () => {
    if (!reportStartDate || !reportEndDate) {
      alert("Please select a time duration period (Start and End date) to download all reports.");
      return;
    }

    const reports = ["Attendance Logs", "Delay Logs", "Incident Reports", "Crew Utilization", "Shift Handover Reports", "Shift Exchange Reports", "Competency Reports", "Training Reports", "Asset Reports", "Rake Registry Reports", "Leave Request Reports", "Dispatch Reports"];
    let downloadedCount = 0;

    for (const report of reports) {
      const success = await handleDownloadReport(report, true);
      if (success) {
        downloadedCount++;
        await new Promise(res => setTimeout(res, 500)); // Delay to prevent browser blocking multiple downloads
      }
    }
    if (downloadedCount === 0) {
      alert("No data found for any reports in this selected period.");
    }
  };

  const handleDownloadReport = async (reportName, silent = false) => {
    if (!reportStartDate || !reportEndDate) {
      if (!silent) alert(`Please select a time duration period (Start and End date) to download the ${reportName}.`);
      return false;
    }

    try {
      let collectionName = '';
      let dateField = 'timestamp';
      let isDateString = false;

      switch (reportName) {
        case "Attendance Logs": collectionName = 'crew_live_attendance'; break;
        case "Delay Logs": case "Incident Reports": collectionName = 'wtt_live_incidents'; break;
        case "Crew Utilization": case "Dispatch Reports": collectionName = 'crew_daily_deployment'; dateField = 'lastUpdated'; break;
        case "Shift Handover Reports": case "Shift Handover Notes": collectionName = 'shift_handover_notes'; break;
        case "Shift Exchange Reports": collectionName = 'shift_exchanges'; break;
        case "Competency Reports": case "Master Crew Registry": collectionName = 'crewRegistry'; dateField = 'updatedAt'; break;
        case "Training Reports": case "JMD Crew Registry": collectionName = 'jmd_crew_registry'; dateField = 'lastUpdated'; break;
        case "Asset Reports": case "Rolling Stock Faults": collectionName = 'rolling_stock_faults'; break;
        case "Rake Registry Reports": collectionName = 'rake_registry'; dateField = 'registryDate'; isDateString = true; break;
        case "Leave Request Reports": collectionName = 'leave_requests'; break;
        case "Safety Incidents": collectionName = 'safety_incidents'; break;
        case "Daily Safety Checklists": collectionName = 'daily_safety_checklists'; break;
        case "ALS Inspections": collectionName = 'alsCompletedInspection'; break;
        case "Absent Book-Off Register": collectionName = 'absent_bookoff_register'; dateField = 'date'; isDateString = true; break;
        case "Weekly Off Register": collectionName = 'weekly_off_register'; dateField = 'date'; isDateString = true; break;
        case "Leave Balances": collectionName = 'leave_balances'; dateField = 'lastUpdated'; break;
        case "Outstation Stepback Operations": collectionName = 'stepback_duties'; break;
        case "Manual Overrides": collectionName = 'manual_overrides'; dateField = 'createdAt'; break;
        case "Audit Logs": collectionName = 'auditLogs'; break;
        case "Integrity Audit Logs": collectionName = 'integrity_audit_logs'; break;
        case "Login History": collectionName = 'login_history'; break;
        default: return;
      }

      const q = query(collection(db, collectionName));
      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => doc.data());

      if (!isDateString) {
        const startD = new Date(`${reportStartDate}T00:00:00`).getTime();
        const endD = new Date(`${reportEndDate}T23:59:59`).getTime();

        data = data.filter(item => {
          const ts = item[dateField] || item.timestamp || item.lastUpdated || item.dispatchTime || item.createdAt;
          if (!ts) return true;
          let itemTime = 0;
          if (ts.toDate) itemTime = ts.toDate().getTime();
          else itemTime = new Date(ts).getTime();
          return itemTime >= startD && itemTime <= endD;
        });
      } else {
        data = data.filter(item => {
          const dateStr = item[dateField];
          if (!dateStr) return true;
          return dateStr >= reportStartDate && dateStr <= reportEndDate;
        });
      }

      if (data.length === 0) {
        if (!silent) alert(`No data found for ${reportName} in this period.`);
        return false;
      }

      // Sort data chronologically before generating CSV
      data.sort((a, b) => {
        const tsA = a[dateField] || a.timestamp || a.lastUpdated || a.dispatchTime || a.createdAt;
        const tsB = b[dateField] || b.timestamp || b.lastUpdated || b.dispatchTime || b.createdAt;

        let timeA = 0;
        let timeB = 0;

        if (tsA) timeA = tsA.toDate ? tsA.toDate().getTime() : new Date(tsA).getTime();
        if (tsB) timeB = tsB.toDate ? tsB.toDate().getTime() : new Date(tsB).getTime();

        return timeA - timeB;
      });

      const allKeys = new Set();
      data.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
      const headers = Array.from(allKeys);
      if (!headers.includes('Report Generated At')) headers.push('Report Generated At');

      let csvRows = [headers.join(",")];
      data.forEach(item => {
        const row = headers.map(header => {
          if (header === 'Report Generated At') return new Date().toLocaleString();
          let val = item[header];
          if (val && val.toDate) val = val.toDate().toLocaleString();
          else if (typeof val === 'object') val = JSON.stringify(val).replace(/,/g, ';');
          else if (val === undefined || val === null) val = '--';
          return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(","));
      });

      const blob = new Blob([csvRows.join('\n')], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.setAttribute("href", URL.createObjectURL(blob));
      link.setAttribute("download", `${reportName.replace(/\s+/g, '_')}_${reportStartDate}_to_${reportEndDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch (err) {
      console.error(`Error downloading ${reportName}:`, err);
      if (!silent) alert("Failed to download report. Please try again.");
      return false;
    }
  };

  // INJECTED STATE FOR CHRONOLOGICAL TRAIN AND OPERATOR RELIEF TRACKING
  const [liveTrainTrackingMap, setLiveTrainTrackingMap] = useState({});

  // NEW SEARCH STATE DEDICATED FOR IMMEDIATE TRACKING MATRIX FILTERING
  const [trackerSearchTerm, setTrackerSearchTerm] = useState('');

  const dayTabs = [
    { id: 'WEEKDAY', label: 'WEEKDAY SCHEDULE' },
    { id: 'MONDAY', label: 'MONDAY SCHEDULE' },
    { id: 'SATURDAY', label: 'SAT & GH ROSTER' },
    { id: 'SUNDAY', label: 'SUNDAY SCHEDULE' }
  ];

  const dnStationOrder = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
  const upStationOrder = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

  const getEarliestTimeSeconds = (row) => {
    const times = [];
    if (row.downTrip?.stations) {
      Object.values(row.downTrip.stations).forEach(t => { if (t && t !== '--' && t !== '-') times.push(timeToSeconds(t)); });
    }
    if (row.upTrip?.stations) {
      Object.values(row.upTrip.stations).forEach(t => { if (t && t !== '--' && t !== '-') times.push(timeToSeconds(t)); });
    }
    return times.length === 0 ? 999999 : Math.min(...times);
  };

  const timeToSeconds = (timeStr) => {
    if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
    if (parts[1]) secs += parseInt(parts[1], 10) * 60;
    if (parts[2]) secs += parseInt(parts[2], 10);
    // Shift late-night train trips (00:00 to 02:59) to the next day for sorting purposes
    if (secs < 3 * 3600) {
      secs += 24 * 3600;
    }
    return secs;
  };

  const secondsToTime = (secs) => {
    if (secs >= 999999) return '--';
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const addDelayToTime = (timeStr, mins) => {
    if (!timeStr || timeStr === '--' || timeStr === '-') return '--';
    const totalSecs = timeToSeconds(timeStr) + (parseInt(mins, 10) * 60);
    return secondsToTime(totalSecs);
  };

  const processAndSyncData = (wttData, linksData, deployData, attData, incData) => {
    try {
      const targetSchedule = normalizeScheduleType(activeDay);

      // Check if liveWttDataRef / Firestore / state has uploaded or custom WTT timetable rows for targetSchedule
      const sourceWtt = (liveWttDataRef.current && liveWttDataRef.current.length > 0) ? liveWttDataRef.current : wttData;
      const uploadedTargetWtt = (sourceWtt || []).filter(d => 
        normalizeScheduleType(d.scheduleType, d.id) === targetSchedule &&
        (d.downTrip || d.upTrip) &&
        !d.parentRowId // Exclude direct sub-trip copies
      );

      let dayTrips;
      if (uploadedTargetWtt.length >= 50) {
        // High-fidelity full uploaded timetable from management takes 100% full precedence for this day!
        dayTrips = uploadedTargetWtt;
      } else {
        // Base canonical day trips from WTT_MASTER_REGISTRY
        const canonicalMaster = WTT_MASTER_REGISTRY.filter(t => normalizeScheduleType(t.scheduleType, t.id) === targetSchedule);
        if (uploadedTargetWtt.length > 0) {
          // Merge custom/edited uploaded trips onto canonical master trips without losing the rest of the schedule
          const map = new Map();
          canonicalMaster.forEach(c => map.set(String(c.id), c));
          uploadedTargetWtt.forEach(u => {
            const existing = map.get(String(u.id));
            map.set(String(u.id), existing ? { ...existing, ...u } : u);
          });
          dayTrips = Array.from(map.values());
        } else {
          dayTrips = canonicalMaster;
        }
      }

      const getTripDirection = (trip) => {
        if (trip.stations) {
          const stOrder = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
          let firstIdx = -1;
          let firstTime = 999999;
          let lastIdx = -1;
          let lastTime = -1;
          for (let i = 0; i < stOrder.length; i++) {
            const t = timeToSeconds(trip.stations[stOrder[i]]);
            if (t !== 999999) {
              if (firstIdx === -1) { firstIdx = i; firstTime = t; }
              lastIdx = i; lastTime = t;
            }
          }
          if (firstIdx !== -1 && lastIdx !== -1 && firstIdx !== lastIdx) {
            return firstTime < lastTime ? 'DN' : 'UP';
          }
        }
        const route = String(trip.terminalLoopRoute || '').toLowerCase();
        if (route.includes('(up)') || route.includes('apts-biet')) return 'UP';
        return 'DN';
      };

      // Deduplicate WTT rows directly by ID to assemble clean, unique chronological matrix rows
      const rowMap = new Map();
      dayTrips.forEach(row => {
        if (!row) return;
        const rowId = row.id || `${row.trainId}_${row.excelRow || Math.random()}`;
        if (!rowMap.has(rowId)) {
          rowMap.set(rowId, row);
        }
      });

      const synchronizedPairs = Array.from(rowMap.values());
      synchronizedPairs.sort((a, b) => getEarliestTimeSeconds(a) - getEarliestTimeSeconds(b));
      setUnifiedRows(synchronizedPairs);

      // Deduplicate links
      let rawDayLinks = linksData.filter(l =>
        normalizeScheduleType(l.scheduleType, l.id) === targetSchedule &&
        isValidDutyId(l.dutyId)
      );

      // Check if DB has uploaded / custom links for this targetSchedule
      const hasUploadedLinks = rawDayLinks.some(l => l.isUploaded === true);

      // Fallback ONLY when database has zero links for this schedule day (initial load before upload)
      if (rawDayLinks.length === 0) {
        if (targetSchedule === 'SATURDAY') {
          rawDayLinks = SATURDAY_MASTER_LINKS;
        } else if (targetSchedule === 'SUNDAY') {
          rawDayLinks = SUNDAY_MASTER_LINKS;
        } else if (targetSchedule === 'MONDAY') {
          rawDayLinks = MONDAY_MASTER_LINKS;
        } else {
          rawDayLinks = WEEKDAY_MASTER_LINKS;
        }
      }

      const dedupedLinks = deduplicateByDutyId(rawDayLinks);
      const currentDayLinks = dedupedLinks.map(l => {
        const normId = normalizeDutyId(l.dutyId);
        return {
          ...l,
          id: l.id || `link_${targetSchedule.toLowerCase()}_duty_${normId}`,
          dutyId: normId
        };
      }).sort((a, b) =>
        String(a.dutyId).localeCompare(String(b.dutyId), undefined, { numeric: true })
      );
      setLinks(currentDayLinks);

      // Merge active duties from AutomatedDispatchGate / Roster Desk Console cache (Zero Manual Entry Engine • 7-Day Rolling Roster)
      const effectiveDeployData = [...(deployData || [])];
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const addCachedDuties = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach(cd => {
              const rawDuty = cd.dutyNo || cd.dutyId || cd.rawDutyId;
              if (!rawDuty) return;
              const normCdDuty = normalizeDutyId(rawDuty);
              if (!normCdDuty || normCdDuty === 'UNASSIGNED') return;
              const idx = effectiveDeployData.findIndex(d => normalizeDutyId(d.dutyId || d.dutyNo) === normCdDuty);
              if (idx >= 0) {
                effectiveDeployData[idx] = { ...effectiveDeployData[idx], ...cd, dutyId: normCdDuty };
              } else {
                effectiveDeployData.push({ ...cd, dutyId: normCdDuty, scheduleType: targetSchedule });
              }
            });
          };

          // 1. Active dispatch deployments from gateway
          const activeRaw = window.localStorage.getItem('pyidcc_active_dispatch_deployments');
          if (activeRaw) addCachedDuties(JSON.parse(activeRaw));

          // 2. Date-specific roster console cache
          const targetDate = window.localStorage.getItem('pyidcc_target_deployment_date');
          if (targetDate) {
            const dateCacheRaw = window.localStorage.getItem(`pyidcc_roster_desk_console_cache_${targetDate}`);
            if (dateCacheRaw) {
              const parsedDate = JSON.parse(dateCacheRaw);
              addCachedDuties(parsedDate?.duties);
            }
          }

          // 3. General console cache
          const cached = window.localStorage.getItem('pyidcc_roster_desk_console_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            addCachedDuties(parsed?.duties);
          }

          // 4. Staged multi-day drafts
          const stagedRaw = window.localStorage.getItem('pyidcc_staged_rosters_by_date');
          if (stagedRaw) {
            const stagedMap = JSON.parse(stagedRaw);
            Object.values(stagedMap || {}).forEach(staged => {
              addCachedDuties(staged?.duties);
            });
          }
        } catch (e) {
          // ignore
        }
      }

      // Build deployments
      const activeDeployments = currentDayLinks.map(link => {
        const normLinkId = normalizeDutyId(link.dutyId);
        const matchingGcc = effectiveDeployData.find(d =>
          normalizeDutyId(d.dutyId) === normLinkId &&
          normalizeScheduleType(d.scheduleType, d.id) === targetSchedule
        );
        const matchedAtt = attData.find(a =>
          normalizeDutyId(a.dutyId) === normLinkId &&
          normalizeScheduleType(a.scheduleType, a.id) === targetSchedule
        );
        const isOfficialSpecial = Boolean(matchingGcc?.isExchanged || matchingGcc?.status === 'SWAPPED_BY_CC' || matchingGcc?.status === 'RELIEF_DISPATCHED');
        const isJmdMisassigned = matchingGcc?.empId && String(matchingGcc.empId).startsWith('88');
        const defaultOp = getOperatorForDuty(normLinkId);

        // Strict Single-Duty validation: If Prakash P (22319) is on Duty 66 in matchingGcc,
        // but Duty 69 is assigned to Prakash P, reject matchingGcc on Duty 66 and use defaultOp (Sooraj)
        const isDuty66Mismatch = (normLinkId === '66' || normLinkId === '066') && 
          (String(matchingGcc?.empId).trim() === '22319' || String(matchingGcc?.empName || '').toUpperCase().includes('PRAKASH'));

        const hasValidGccDeploy = matchingGcc?.empName && 
          matchingGcc.empName !== '--' && 
          matchingGcc.empName !== '-' && 
          !matchingGcc.empName.startsWith('Train Operator') && 
          !matchingGcc.empName.startsWith('Duty ') &&
          !isJmdMisassigned &&
          !isDuty66Mismatch;

        const resolvedEmpId = (isOfficialSpecial && matchingGcc?.empId)
          ? matchingGcc.empId
          : hasValidGccDeploy
            ? (matchingGcc.empId || matchingGcc.empNo || defaultOp?.empId || '--')
            : (defaultOp?.empId || '--');

        const resolvedEmpName = (isOfficialSpecial && matchingGcc?.empName)
          ? matchingGcc.empName
          : hasValidGccDeploy
            ? matchingGcc.empName
            : (defaultOp?.empName || '--');

        return {
          id: link.id,
          dutyId: normLinkId,
          signOnTime: matchingGcc?.signOnTime || link.signOnTime,
          signOnLocation: matchingGcc?.signOnLocation || link.signOnLocation,
          signOffLocation: matchingGcc?.signOffLocation || link.signOffLocation || '--',
          dutyType: matchingGcc?.dutyType || link.dutyType || '--',
          trainId: matchingGcc?.trainId || link.trainId,
          empId: resolvedEmpId,
          empName: resolvedEmpName,
          remarks: matchingGcc?.remarks || (defaultOp?.empName ? 'Official Weekday Roster' : 'Pending GCC Load'),
          status: matchingGcc?.status || null,
          isSignedOn: !!matchedAtt,
          signOnTimestamp: matchedAtt ? matchedAtt.signOnTimeActual : null,
          date: matchingGcc?.date || matchingGcc?.deploymentDate || new Date().toISOString().split("T")[0],
          deploymentDate: matchingGcc?.deploymentDate || matchingGcc?.date || new Date().toISOString().split("T")[0],
          scheduleType: targetSchedule,
          isExchanged: matchingGcc?.isExchanged || false,
          originalEmpId: matchingGcc?.originalEmpId || '',
          originalEmpName: matchingGcc?.originalEmpName || '',
          exchangeId: matchingGcc?.exchangeId || '',
          approvedBy: matchingGcc?.approvedBy || '',
          approvedDateTime: matchingGcc?.approvedDateTime || '',
          rawLegs: {
            l1Train: matchingGcc?.rawLegs?.l1Train || link.trainId || '--',
            l1Start: matchingGcc?.rawLegs?.l1Start || link.leg1TimeFrom || link.signOnTime || '--',
            l1End: matchingGcc?.rawLegs?.l1End || link.leg1TimeTo || '--',
            l2Train: matchingGcc?.rawLegs?.l2Train || link.leg2TrainNo || '--',
            l2Start: matchingGcc?.rawLegs?.l2Start || link.leg2DepTime || '--',
            l2End: matchingGcc?.rawLegs?.l2End || link.leg2ArrTime || '--',
            l3Train: matchingGcc?.rawLegs?.l3Train || link.leg3TrainNo || '--',
            l3Start: matchingGcc?.rawLegs?.l3Start || link.leg3DepTime || '--',
            l3End: matchingGcc?.rawLegs?.l3End || link.leg3ArrTime || '--',
            l4Train: matchingGcc?.rawLegs?.l4Train || link.leg4TrainNo || '--',
            l4Start: matchingGcc?.rawLegs?.l4Start || link.leg4FinalDepTime || '--',
            l4End: matchingGcc?.rawLegs?.l4End || link.leg4FinalArrTime || '--'
          }
        };
      });

      const dedupedDeployData = deduplicateByDutyId(
        effectiveDeployData.filter(d => normalizeScheduleType(d.scheduleType, d.id) === targetSchedule)
      );
      const linkedDutyIds = new Set(currentDayLinks.map(l => normalizeDutyId(l.dutyId)));
      const aiOnlyDeployments = dedupedDeployData
        .filter(d => {
          const dDuty = normalizeDutyId(d.dutyId || '');
          return isValidDutyId(d.dutyId) && dDuty && dDuty !== 'UNASSIGNED' && !linkedDutyIds.has(dDuty);
        })
        .map(d => {
          const normId = normalizeDutyId(d.dutyId);
          const matchedAtt = attData.find(a => normalizeDutyId(a.dutyId) === normId && normalizeScheduleType(a.scheduleType, a.id) === targetSchedule);
          const isOfficialSpecial = Boolean(d.isExchanged || d.status === 'SWAPPED_BY_CC' || d.status === 'RELIEF_DISPATCHED');
          const isJmdMisassigned = d.empId && String(d.empId).startsWith('88');
          const defaultOp = getOperatorForDuty(normId);

          const hasValidDeploy = d.empName && 
            d.empName !== '--' && 
            d.empName !== '-' && 
            !d.empName.startsWith('Train Operator') && 
            !d.empName.startsWith('Duty ') &&
            !isJmdMisassigned;

          const resolvedEmpId = (isOfficialSpecial && d.empId)
            ? d.empId
            : hasValidDeploy
              ? (d.empId || d.empNo || defaultOp?.empId || '--')
              : (defaultOp?.empId || '--');

          const resolvedEmpName = (isOfficialSpecial && d.empName)
            ? d.empName
            : hasValidDeploy
              ? d.empName
              : (defaultOp?.empName || `Duty ${normId}`);

          return {
            id: d.id,
            dutyId: normId,
            signOnTime: d.signOnTime || '--',
            signOnLocation: d.signOnLocation || d.signOnPlace || '--',
            signOffLocation: d.signOffLocation || d.signOffPlace || '--',
            dutyType: d.dutyType || '--',
            trainId: d.trainId || '--',
            empId: resolvedEmpId,
            empName: resolvedEmpName,
            remarks: d.remarks || 'AI Ingest',
            status: d.status || null,
            isSignedOn: !!matchedAtt,
            signOnTimestamp: matchedAtt ? matchedAtt.signOnTimeActual : null,
            date: d.date || d.deploymentDate || new Date().toISOString().split("T")[0],
            deploymentDate: d.deploymentDate || d.date || new Date().toISOString().split("T")[0],
            scheduleType: targetSchedule,
            _aiImported: true,
            isExchanged: d.isExchanged || false,
            originalEmpId: d.originalEmpId || '',
            originalEmpName: d.originalEmpName || '',
            exchangeId: d.exchangeId || '',
            approvedBy: d.approvedBy || '',
            approvedDateTime: d.approvedDateTime || '',
            rawLegs: d.rawLegs || {
              l1Train: d.trainId || '--',
              l1Start: d.signOnTime || '--',
              l1End: '--',
              l2Train: '--', l2Start: '--', l2End: '--',
              l3Train: '--', l3Start: '--', l3End: '--',
              l4Train: '--', l4Start: '--', l4End: '--'
            }
          };
        });

      const allDeployments = [...activeDeployments, ...aiOnlyDeployments];
      dailyDeploymentRef.current = allDeployments;
      setDailyDeployment(allDeployments);
      setAttendanceLogs(attData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));

      // BACKGROUND COMPUTATION ENGINE FOR TRAIN & RELIEVER TRACKING
      const currentSecs = (() => {
        const now = new Date();
        const secs = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
        return secs < 3 * 3600 ? secs + 24 * 3600 : secs;
      })();

      // Unified Live Train & Reliever Tracking Calculation for all day types
      const calculatedTracking = buildLiveTrainTrackingMap(allDeployments, currentSecs, targetSchedule);

      setLiveTrainTrackingMap(calculatedTracking);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveData = async () => {
    try {
      setLoading(true);
      const [wttSnapshot, linksSnapshot, deploySnapshot, attSnapshot, incSnapshot] = await Promise.all([
        getDocs(collection(db, "wtt_final_matrix")),
        getDocs(collection(db, "crew_final_links")),
        getDocs(collection(db, "crew_daily_deployment")),
        getDocs(collection(db, "crew_live_attendance")),
        getDocs(collection(db, "wtt_live_incidents"))
      ]);
      const wttData = wttSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const linksData = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const deployData = deploySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const incData = incSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (wttData.length > 0) liveWttDataRef.current = wttData;
      if (linksData.length > 0) liveLinksDataRef.current = linksData;

      setLiveIncidents(incData);
      processAndSyncData(wttData, linksData, deployData, attData, incData);
    } catch (error) {
      console.error("fetchLiveData error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Real-time Firestore synchronization.
  // Render canonical Line-2 local data immediately; hydrate Firestore in background.
  useEffect(() => {
    setLoading(false);
    let wttData = (liveWttDataRef.current && liveWttDataRef.current.length > 0) ? liveWttDataRef.current : WTT_MASTER_REGISTRY;
    let linksData = (liveLinksDataRef.current && liveLinksDataRef.current.length > 0) ? liveLinksDataRef.current : (activeDay === 'WEEKDAY' ? WEEKDAY_MASTER_LINKS : []);
    let deployData = [];
    let attData = [];
    let incData = [];
    let animFrameId = null;

    const runProcessing = () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(() => {
        const activeWtt = (wttData && wttData.length > 0) ? wttData : WTT_MASTER_REGISTRY;
        processAndSyncData(activeWtt, linksData, deployData, attData, incData);
      });
    };

    // First paint uses current active/cached data immediately
    runProcessing();

    const fetchBase = async () => {
      try {
        const [wttSnapshot, linksSnapshot] = await Promise.all([
          getDocs(collection(db, "wtt_final_matrix")),
          getDocs(collection(db, "crew_final_links"))
        ]);
        const remoteWtt = wttSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const remoteLinks = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (remoteWtt.length > 0) {
          wttData = remoteWtt;
          liveWttDataRef.current = remoteWtt;
        }
        if (remoteLinks.length > 0) {
          linksData = remoteLinks;
          liveLinksDataRef.current = remoteLinks;
        }
        runProcessing();
      } catch (err) {
        console.warn("Background WTT/link refresh failed; using local master data:", err);
      }
    };
    fetchBase();

    const unsubDeploy = onSnapshot(collection(db, "crew_daily_deployment"), (snap) => {
      deployData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      runProcessing();
    });

    const unsubAtt = onSnapshot(collection(db, "crew_live_attendance"), (snap) => {
      attData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      runProcessing();
    });

    const unsubInc = onSnapshot(collection(db, "wtt_live_incidents"), (snap) => {
      incData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLiveIncidents(incData);
      runProcessing();
    });

    const unsubWtt = onSnapshot(collection(db, "wtt_final_matrix"), (snap) => {
      if (!snap.empty) {
        wttData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        liveWttDataRef.current = wttData;
        runProcessing();
      }
    });

    const unsubLinks = onSnapshot(collection(db, "crew_final_links"), (snap) => {
      if (!snap.empty) {
        linksData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        liveLinksDataRef.current = linksData;
        runProcessing();
      }
    });

    const unsubEmployees = onSnapshot(collection(db, "crewRegistry"), (snap) => {
      if (snap.empty) {
        BMRCL_CREW_REGISTRY.length = 0;
        BMRCL_CREW_MASTER_BACKUP.forEach(emp => {
          BMRCL_CREW_REGISTRY.push(emp);
        });
        runProcessing();
        return;
      }

      const activeList = [];
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const active = (data.operationalCrew === 'YES' || data.operationalCrew === true) && data.deleted !== true;
        if (active) {
          activeList.push({
            id: String(data.employeeId || data.id || docSnap.id),
            name: data.employeeName || data.name || '',
            designation: data.designation || '',
            contact: data.mobileNumber || data.contact || '',
            email: data.email || '',
            competencyExpiry: data.competencyExpiry || '',
            activeCrew: true,
            department: data.department || 'Operations',
            role: data.role || 'Train Operator',
            depot: data.depot || 'Peenya Depot (PYID)',
            badgeNumber: data.badgeNumber || '',
            competencyNumber: data.competencyNumber || '',
            competencyValidTill: data.competencyValidTill || '',
            medicalValidTill: data.medicalValidTill || '',
            doj: data.doj || '',
            retirementDate: data.retirementDate || '',
            currentStatus: data.currentStatus || 'DUTY',
            bloodGroup: data.bloodGroup || '',
            emergencyContact: data.emergencyContact || '',
            remarks: data.remarks || '',
            photo: data.photo || '',
            systemUser: data.systemUser || false,
            activeUser: data.activeUser || false,
            availableForDeployment: data.availableForDeployment !== false,
            availableForRelief: data.availableForRelief !== false
          });
        }
      });

      BMRCL_CREW_REGISTRY.length = 0;
      activeList.forEach(emp => {
        BMRCL_CREW_REGISTRY.push(emp);
      });
      runProcessing();
    });

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      unsubDeploy();
      unsubAtt();
      unsubInc();
      unsubEmployees();
      unsubWtt();
      unsubLinks();
    };
  }, [activeDay]);

  // ── Real-Time Dynamic Ticker for Live Train & Reliever Tracking Handover ──
  // Re-evaluates handover times every 5 seconds so transitions (e.g. 10:58, 13:13) happen seamlessly
  const dailyDeploymentRef = useRef([]);

  useEffect(() => {
    dailyDeploymentRef.current = dailyDeployment;
  }, [dailyDeployment]);

  useEffect(() => {
    const updateTracking = () => {
      const now = new Date();
      const secs = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
      const currentSecs = secs < 3 * 3600 ? secs + 24 * 3600 : secs;
      const targetSchedule = normalizeScheduleType(activeDay);
      const tracking = buildLiveTrainTrackingMap(dailyDeploymentRef.current || [], currentSecs, targetSchedule);
      setLiveTrainTrackingMap(tracking);
    };

    updateTracking();
    const ticker = setInterval(updateTracking, 5000);
    return () => clearInterval(ticker);
  }, [activeDay, dailyDeployment]);


  const handleGccRosterUpload = async (e) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot upload rosters.");
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const isSpreadsheet = file.type.includes('spreadsheet') || file.type.includes('csv') || file.type.includes('excel') || ['xlsx', 'xls', 'csv'].includes(fileExt);

      let parsedDuties = [];

      if (isSpreadsheet) {
        // Dynamically load XLSX only when spreadsheet is uploaded
        const XLSX = await import('xlsx');
        // Read file as binary string to parse Excel or CSV locally
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });

        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        let headerRowIdx = -1;
        let dutyColIdx = 0;
        let nameColIdx = 4; // 5th column by default
        let empColIdx = 5;  // 6th column by default

        // 1. Scan the first 10 rows to find the header row
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;

          const hasDuty = row.some(cell => cell && String(cell).toLowerCase().includes('duty'));
          const hasSignOn = row.some(cell => cell && String(cell).toLowerCase().includes('sign') || String(cell).toLowerCase().includes('s on'));

          if (hasDuty || hasSignOn) {
            headerRowIdx = i;
            row.forEach((cell, colIdx) => {
              if (!cell) return;
              const cellStr = String(cell).toLowerCase();
              if (cellStr.includes('duty')) dutyColIdx = colIdx;
              else if (cellStr.includes('train') || cellStr.includes('rake')) { /* Skip train/rake column to avoid matching it as ID */ }
              else if (
                cellStr.includes('name') || 
                cellStr.includes('operator') || 
                cellStr === 'to' || cellStr === 't.o' || cellStr === 't.o.' ||
                cellStr.includes('t.o ') || cellStr.includes(' to ') || cellStr.includes('t.o. ')
              ) nameColIdx = colIdx;
              else if (
                (cellStr.includes('emp') || cellStr.includes('employ') || cellStr.includes('id')) &&
                !cellStr.includes('duty') &&
                !cellStr.includes('train') &&
                !cellStr.includes('rake')
              ) empColIdx = colIdx;
            });
            break;
          }
        }

        const startRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

        for (let i = startRowIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const dutyId = row[dutyColIdx];
          if (dutyId === undefined || dutyId === null || String(dutyId).trim() === '') continue;

          let employeeId = row[empColIdx] !== undefined && row[empColIdx] !== null ? String(row[empColIdx]).trim() : '';
          let name = row[nameColIdx] !== undefined && row[nameColIdx] !== null ? String(row[nameColIdx]).trim() : '';

          const aligned = alignRecordWithRegistry({
            dutyNo: String(dutyId).trim(),
            employeeId,
            name
          });

          parsedDuties.push(aligned);
        }
      }

      // If local spreadsheet/CSV parsing did not yield results, or if it is a text/PDF/image file, use Gemini AI
      if (parsedDuties.length === 0) {
        const apiKeyToUse = localStorage.getItem('custom_gemini_api_key') ||
          import.meta.env.VITE_GEMINI_API_KEY ||
          '';

        const genAI = new GoogleGenerativeAI(apiKeyToUse);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const promptText = `Analyze this roster document (which could be plain text, a table screenshot, or a PDF). Extract all rows of crew roster assignments.
For each row, extract the following columns:
1. "Duty No" (the duty number/id, e.g. 1, 2, 3, CC1, CC2, etc.)
2. "NAME" (the operator's name, extracted from the 5th column of the table, e.g. Sooraj, Sunil PN, Mohammed Rafiq)
3. "Emp No" (the operator's employee number, extracted from the 6th column of the table, e.g. 22296, 22240, 22297)

Return the output as a JSON object with key:
- "duties": array of objects, where each object has keys: "dutyNo", "name", "employeeId"

Format the response strictly as a single JSON object.`;

        let contentParts = [];

        const isTextFile = file.type.startsWith('text/') || ['txt', 'csv', 'json'].includes(fileExt);

        if (isTextFile) {
          const textContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          contentParts.push(`Here is the roster text contents:\n\`\`\`\n${textContent}\n\`\`\`\n\n${promptText}`);
        } else {
          // PDF or Image binary
          const filePart = await fileToGenerativePart(file);
          contentParts.push(promptText);
          contentParts.push(filePart);
        }

        const result = await model.generateContent(contentParts);
        const responseText = result.response.text();

        const cleanJsonString = (str) => {
          let cleaned = str.trim();
          try {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              return cleaned.substring(firstBrace, lastBrace + 1);
            }
          } catch (e) {
            console.error("JSON extraction helper failed:", e);
          }
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
            cleaned = cleaned.replace(/\n```$/, '');
          }
          return cleaned.trim();
        };

        const cleanedText = cleanJsonString(responseText);
        const responseJson = JSON.parse(cleanedText);
        const duties = responseJson.duties || [];

        parsedDuties = duties.map(d => {
          let employeeId = String(d.employeeId || d.empId || d["Emp No"] || d["EmpNo"] || d["Employee ID"] || "");
          let name = String(d.name || d.empName || d["NAME"] || d["Name"] || "");

          return alignRecordWithRegistry({
            dutyNo: String(d.dutyNo || d.dutyId || d["Duty No"] || d["DutyNo"] || ""),
            name,
            employeeId
          });
        }).filter(d => d.dutyNo);
      }

      if (parsedDuties.length > 0) {
        const batch = writeBatch(db);
        parsedDuties.forEach(row => {
          const normalizedDutyNo = normalizeDutyId(row.dutyNo);
          const docId = `gcc_deploy_${activeDay.toLowerCase()}_duty_${normalizedDutyNo}`;
          batch.set(doc(db, "crew_daily_deployment", docId), {
            scheduleType: activeDay,
            dutyId: normalizedDutyNo,
            empId: String(row.employeeId),
            empName: String(row.name),
            remarks: "GCC Verified Ingest (AI Multimodal)",
            lastUpdated: serverTimestamp()
          }, { merge: true });
        });

        await batch.commit();
        alert(`✅ GCC Master Deployment Loaded. Ingested ${parsedDuties.length} duties successfully.`);
        fetchLiveData();
      } else {
        alert("❌ Ingestion failed: No valid roster entries could be extracted from the file.");
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
      alert(`❌ Roster Ingestion failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRosterReset = async (targetDateParam) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot reset rosters.");
      return;
    }
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const targetDate = targetDateParam || todayStr;
    if (window.confirm(`Reset GCC rosters for ${activeDay} (${targetDate})? This will ONLY clear deployed records for ${targetDate}. Other dates will NOT be affected.`)) {
      try {
        setLoading(true);
        const targetSched = normalizeScheduleType(activeDay).toUpperCase();
        const rawTargetDay = String(activeDay || "").trim().toUpperCase();

        // Helper to safely commit deletions in chunks of 400
        const deleteDocRefsInBatches = async (refs) => {
          let b = writeBatch(db);
          let count = 0;
          for (let i = 0; i < refs.length; i++) {
            b.delete(refs[i]);
            count++;
            if (count >= 400) {
              await b.commit();
              b = writeBatch(db);
              count = 0;
            }
          }
          if (count > 0) {
            await b.commit();
          }
        };

        // 1. Delete matching crew_daily_deployment docs STRICTLY for targetDate
        const deploySnap = await getDocs(collection(db, "crew_daily_deployment"));
        const deployRefsToDelete = [];
        deploySnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const docDate = data.targetDate || data.date || data.deploymentDate;
          if (docDate) {
            const normDocDate = String(docDate).trim();
            if (normDocDate !== targetDate) {
              // Belongs to another date - KEEP IT SAFE!
              return;
            }
            deployRefsToDelete.push(docSnap.ref);
          } else {
            const idDateMatch = docSnap.id.match(/\d{4}-\d{2}-\d{2}/);
            if (idDateMatch) {
              if (idDateMatch[0] !== targetDate) return;
              deployRefsToDelete.push(docSnap.ref);
            } else if (targetDate === todayStr) {
              const sched = String(data.scheduleType || "").trim().toUpperCase();
              const docIdLower = docSnap.id.toLowerCase();
              const targetSchedLower = targetSched.toLowerCase();
              const rawTargetLower = rawTargetDay.toLowerCase();

              const matchesSchedule =
                normalizeScheduleType(data.scheduleType, docSnap.id) === targetSched ||
                sched === targetSched ||
                sched === rawTargetDay ||
                sched === "ACTIVE_RUN" ||
                docIdLower.includes(targetSchedLower) ||
                docIdLower.includes(rawTargetLower) ||
                (targetSched === "WEEKDAY" && (sched === "GENERAL" || docIdLower.includes("weekday") || docIdLower.includes("active_run")));

              if (matchesSchedule) {
                deployRefsToDelete.push(docSnap.ref);
              }
            }
          }
        });
        await deleteDocRefsInBatches(deployRefsToDelete);

        // 2. Delete matching crew_live_attendance records STRICTLY for targetDate
        try {
          const attSnap = await getDocs(collection(db, "crew_live_attendance"));
          const attRefsToDelete = [];
          attSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const docDate = data.targetDate || data.date;
            if (docDate) {
              if (String(docDate).trim() === targetDate) {
                attRefsToDelete.push(docSnap.ref);
              }
            } else if (targetDate === todayStr) {
              const sched = String(data.scheduleType || "").trim().toUpperCase();
              if (sched === targetSched || sched === rawTargetDay) {
                attRefsToDelete.push(docSnap.ref);
              }
            }
          });
          await deleteDocRefsInBatches(attRefsToDelete);
        } catch (attErr) {
          console.warn("Could not clear crew_live_attendance on reset:", attErr);
        }

        // 3. Clear all dispatch_deployments for targetDate
        const altDate = targetDate.includes('-') && targetDate.split('-')[0].length === 4
          ? targetDate.split('-').reverse().join('-')
          : targetDate;
        try {
          const depSnap = await getDocs(collection(db, "dispatch_deployments"));
          depSnap.docs.forEach((docSnap) => {
            const docId = docSnap.id;
            const data = docSnap.data();
            const docDate = data.deploymentDate || data.targetDate || data.date || data.dateStr;
            const normDDate = docDate ? formatOperationalDate(docDate) : "";
            if (
              normDDate === targetDate ||
              normDDate === altDate ||
              docId.startsWith(targetDate) ||
              (altDate && docId.startsWith(altDate))
            ) {
              deleteDoc(docSnap.ref);
            }
          });
        } catch (_) {}

        // 4. Clear console cache docs
        const emptyConsoleDoc = {
          controlDesks: [],
          coOperators: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          notReporting: [],
          absents: [],
          bookedOff: [],
          onDuty: [],
          customRegisters: {},
          isExplicitlyCleared: true,
          updatedAt: serverTimestamp(),
        };

        const metaBatch = writeBatch(db);
        metaBatch.set(doc(db, "dispatch_excel_cache", targetDate), emptyConsoleDoc);
        if (altDate) {
          metaBatch.set(doc(db, "dispatch_excel_cache", altDate), emptyConsoleDoc);
        }
        metaBatch.set(doc(db, "roster_desk_console", "current"), emptyConsoleDoc);
        metaBatch.set(doc(db, "roster_desk_console", "latest"), emptyConsoleDoc);
        metaBatch.delete(doc(db, "roster_desk_console", "latest_deployment_meta"));
        metaBatch.set(doc(db, "dispatch_excel_cache", "current"), emptyConsoleDoc);
        await metaBatch.commit();

        // 5. Clear local storage unconditionally
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.removeItem(`pyidcc_roster_desk_console_cache_${targetDate}`);
            if (altDate) {
              window.localStorage.removeItem(`pyidcc_roster_desk_console_cache_${altDate}`);
            }
            window.localStorage.removeItem("pyidcc_roster_desk_console_cache");
            window.localStorage.removeItem("pyidcc_roster_desk_meta");
            window.localStorage.removeItem(`pyidcc_roster_desk_meta_${targetDate}`);
            if (altDate) {
              window.localStorage.removeItem(`pyidcc_roster_desk_meta_${altDate}`);
            }
          }
        } catch (e) {
          console.warn("Could not clear cache on reset", e);
        }

        alert(`✅ Daily Roster Reset for ${activeDay} (${targetDate}). Cleared ${deployRefsToDelete.length} deployment record(s).`);
        fetchLiveData();
      } catch (err) {
        console.error("handleRosterReset failed:", err);
        alert(`❌ Failed to reset roster: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUpdateMasterScheduleLinks = async (targetDay = activeDay) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot modify schedule links.");
      return;
    }
    const normDay = normalizeScheduleType(targetDay);
    const dayLinks = getMasterLinksForDay(normDay);
    const dayLabel = normDay === 'SATURDAY' ? 'Saturday & GH' : normDay === 'SUNDAY' ? 'Sunday' : normDay === 'MONDAY' ? 'Monday' : 'Weekday';
    const dutyCount = dayLinks.length;

    if (!window.confirm(`Update and save ${dayLabel} Link Roster with verified schedule (${dutyCount} Duties) to database (crew_final_links)? This will synchronize the canonical ${dayLabel} link roster.`)) return;
    try {
      setLoading(true);
      const batch = writeBatch(db);
      dayLinks.forEach(duty => {
        const docRef = doc(db, 'crew_final_links', duty.id);
        batch.set(docRef, {
          ...duty,
          lastModified: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
      alert(`✅ ${dayLabel} Link Roster successfully updated and saved to database with verified ${dutyCount} duties!`);
      fetchLiveData();
    } catch (err) {
      console.error(`Failed to update ${normDay} links in database:`, err);
      setLinks(dayLinks);
      alert(`⚠️ Local ${dayLabel} Link view refreshed with verified ${dutyCount} duties. Database sync: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMasterWeekdayLinks = () => handleUpdateMasterScheduleLinks('WEEKDAY');

  const handleWttImported = async ({ scheduleType, rows }) => {
    const norm = normalizeScheduleType(scheduleType);
    if (norm) setActiveDay(norm);

    // 1. Purge live delay incidents for this schedule so trains are strictly on-schedule
    setLiveIncidents(prev => prev.filter(i => normalizeScheduleType(i.scheduleType) !== norm));

    // 2. Dynamically mutate in-memory WTT_MASTER_REGISTRY so the whole system reflects new scheduled times
    try {
      const remaining = WTT_MASTER_REGISTRY.filter(r => normalizeScheduleType(r.scheduleType, r.id) !== norm);
      WTT_MASTER_REGISTRY.length = 0;
      if (Array.isArray(rows) && rows.length > 0) {
        WTT_MASTER_REGISTRY.push(...remaining, ...rows);
      } else {
        WTT_MASTER_REGISTRY.push(...remaining);
      }
    } catch (e) {
      console.warn("Could not mutate WTT_MASTER_REGISTRY in-memory:", e);
    }

    // 3. Update live ref so switching days retains the new data immediately
    liveWttDataRef.current = [...WTT_MASTER_REGISTRY];

    // 4. Update unified rows directly
    if (Array.isArray(rows) && rows.length > 0) {
      const sorted = [...rows].sort((a, b) => getEarliestTimeSeconds(a) - getEarliestTimeSeconds(b));
      setUnifiedRows(sorted);
    } else {
      setUnifiedRows([]);
    }
  };

  const handleLinkRosterImported = async ({ scheduleType, duties }) => {
    if (scheduleType) setActiveDay(scheduleType);
    if (Array.isArray(duties) && duties.length > 0) {
      setLinks(duties);
      liveLinksDataRef.current = duties;
    }
    if (typeof fetchLiveData === 'function') {
      await fetchLiveData();
    }
  };

  const handleIncidentLogSubmit = async (e) => {
    e.preventDefault();
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot log delay incidents.");
      return;
    }
    if (!targetTid || !delayMinutes) return;
    try {
      const incId = `incident_t${targetTid}_${Date.now()}`;
      await setDoc(doc(db, "wtt_live_incidents", incId), { trainId: String(targetTid), delayMins: parseInt(delayMinutes, 10), reason: incidentReason, scheduleType: activeDay, timestamp: serverTimestamp() });
      alert("⚠️ Delay variance logged."); setTargetTid(''); setDelayMinutes(''); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleClearAllIncidents = async () => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot clear delay incidents.");
      return;
    }
    if (window.confirm("Restore all line movements back to strict master WTT schedules?")) {
      const snapshot = await getDocs(collection(db, "wtt_live_incidents"));
      const batch = writeBatch(db); snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit(); alert("Line status restored."); fetchLiveData();
    }
  };

  const handleOneClickAuthorize = async (rowOrRows) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot authorize dispatch.");
      return;
    }
    try {
      const actualTimeStr = new Date().toTimeString().split(' ')[0];
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const batch = writeBatch(db);

      rows.forEach(row => {
        const docRef = doc(db, "crew_live_attendance", `signon_${activeDay.toLowerCase()}_duty_${row.dutyId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
        batch.set(docRef, {
          scheduleType: activeDay,
          dutyId: String(row.dutyId),
          empId: row.empId,
          empName: row.empName,
          signOnTimeScheduled: row.signOnTime,
          signOnTimeActual: actualTimeStr,
          status: "AUTHORIZED_OK",
          timestamp: serverTimestamp()
        });
      });

      await batch.commit();
      alert(rows.length === 1 ? "Operator Authorized!" : `${rows.length} Operators Authorized successfully!`);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to authorize: " + err.message);
    }
  };



  const handleTrainIdSwap = async (e) => {
    e.preventDefault();
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot execute Train ID swaps.");
      return;
    }
    if (!swapFromTid || !swapToTid) return;
    try {
      const q1 = query(collection(db, "wtt_final_matrix"), where("trainId", "==", swapFromTid));
      const q2 = query(collection(db, "wtt_final_matrix"), where("trainId", "==", swapToTid));

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const batch = writeBatch(db);

      snap1.docs.forEach(docSnap => batch.update(docSnap.ref, { trainId: swapToTid }));
      snap2.docs.forEach(docSnap => batch.update(docSnap.ref, { trainId: swapFromTid }));

      await batch.commit();
      alert(`✅ Advanced Train ID Swap executed: TID ${swapFromTid} ⇄ TID ${swapToTid}`);
      setSwapFromTid(''); setSwapToTid('');
      fetchLiveData();
    } catch (err) { console.error("Train ID Swap failed:", err); }
  };

  const handleDeploymentCellSave = async (rowId, fieldName, dutyId) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot edit deployment records.");
      return;
    }
    try {
      await setDoc(doc(db, "crew_daily_deployment", `gcc_deploy_${activeDay.toLowerCase()}_duty_${dutyId}`), { [fieldName]: editValue }, { merge: true });
      fetchLiveData(); setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false });
    } catch (err) { console.error(err); }
  };

  const handleWttCellSave = async (row, direction, stationName, isTidField, isModeField = false) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot edit WTT records.");
      return;
    }
    try {
      const targetTrip = direction === 'DN' ? row.downTrip : row.upTrip; if (!targetTrip) return;
      const targetId = targetTrip.id || `wtt_${activeDay.toLowerCase()}_${row.trainId}_${direction.toLowerCase()}`;
      if (isTidField) {
        await setDoc(doc(db, "wtt_final_matrix", targetId), { trainId: editValue, scheduleType: activeDay }, { merge: true });
      } else if (isModeField) {
        const modeVal = (editValue || 'ATO').toUpperCase();
        await setDoc(doc(db, "wtt_final_matrix", targetId), {
          trainId: row.trainId || '',
          scheduleType: activeDay,
          terminalLoopRoute: direction,
          mode: modeVal,
          ...(direction === 'DN' ? { dnMode: modeVal } : { upMode: modeVal }),
        }, { merge: true });
        const parentId = targetTrip.parentRowId || row.id;
        if (parentId && parentId !== targetId) {
          await setDoc(doc(db, "wtt_final_matrix", parentId), {
            ...(direction === 'DN' ? { dnMode: modeVal, mode: modeVal } : { upMode: modeVal }),
          }, { merge: true });
        }
      } else {
        await setDoc(doc(db, "wtt_final_matrix", targetId), {
          trainId: row.trainId || '',
          scheduleType: activeDay,
          terminalLoopRoute: direction,
          stations: { ...(targetTrip.stations || {}), [stationName]: editValue }
        }, { merge: true });
      }
      setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isMode: false, isDeployment: false }); fetchLiveData();
    } catch (err) { console.error("Error saving WTT cell:", err); }
  };

  const handleWttBulkSave = async (editedRows) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot edit WTT records.");
      return;
    }
    try {
      const batch = writeBatch(db);
      for (const row of editedRows) {
        if (row.downTrip) {
          const docId = row.downTrip.id || `wtt_${activeDay.toLowerCase()}_row_${row.trainId}_dn`;
          const dnMode = row.downTrip.mode || row.dnMode || row.mode || 'ATO';
          batch.set(doc(db, "wtt_final_matrix", docId), {
            trainId: row.trainId || '',
            scheduleType: activeDay,
            terminalLoopRoute: "DN",
            mode: dnMode,
            dnMode: dnMode,
            stations: row.downTrip.stations || {}
          }, { merge: true });
        }
        if (row.upTrip) {
          const docId = row.upTrip.id || `wtt_${activeDay.toLowerCase()}_row_${row.trainId}_up`;
          const upMode = row.upTrip.mode || row.upMode || row.mode || 'ATO';
          batch.set(doc(db, "wtt_final_matrix", docId), {
            trainId: row.trainId || '',
            scheduleType: activeDay,
            terminalLoopRoute: "UP",
            mode: upMode,
            upMode: upMode,
            stations: row.upTrip.stations || {}
          }, { merge: true });
        }
        if (row.id) {
          batch.set(doc(db, "wtt_final_matrix", row.id), {
            trainId: row.trainId || '',
            scheduleType: activeDay,
            mode: row.mode || row.dnMode || row.upMode || 'ATO',
            dnMode: row.dnMode || row.downTrip?.mode || 'ATO',
            upMode: row.upMode || row.upTrip?.mode || 'ATO',
          }, { merge: true });
        }
      }
      await batch.commit();
      alert("WTT Matrix changes saved successfully.");
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to save WTT Matrix changes: " + err.message);
    }
  };

  const handleCellSave = async (rowId, fieldName) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot edit link roster records.");
      return;
    }
    try {
      await updateDoc(doc(db, "crew_final_links", rowId), { [fieldName]: editValue });
      setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false }); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteRow = async (rowId) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot delete link roster records.");
      return;
    }
    if (window.confirm("Confirm deletion of this crew link run file?")) {
      await deleteDoc(doc(db, "crew_final_links", rowId));
      setLinks(prev => prev.filter(item => item.id !== rowId));
    }
  };

  const handleDeleteTripRow = async (row) => {
    if (isOperatorOrViewer) {
      alert("Read-Only Mode: Train Operators cannot delete WTT trips.");
      return;
    }
    if (window.confirm(`Delete Train ID ${row.trainId} trip pair block?`)) {
      if (row.downTrip) await deleteDoc(doc(db, "wtt_final_matrix", row.downTrip.id));
      if (row.upTrip) await deleteDoc(doc(db, "wtt_final_matrix", row.upTrip.id));
      fetchLiveData();
    }
  };

  const filteredUnifiedRows = unifiedRows.filter(row => String(row.trainId || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredLinks = links.filter(l => String(l.dutyId || '').toLowerCase().includes(searchTerm.toLowerCase()));

  // FILTERED TRACKING ENGINE COMPLETED IN REAL-TIME
  const filteredTrackingKeys = Object.keys(liveTrainTrackingMap).sort((a, b) => {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }).filter(tid => {
    const tracking = liveTrainTrackingMap[tid];
    const matchStr = trackerSearchTerm.toLowerCase();
    return (
      String(tid).toLowerCase().includes(matchStr) ||
      String(tracking?.current?.empName || '').toLowerCase().includes(matchStr) ||
      String(tracking?.current?.dutyId || '').toLowerCase().includes(matchStr) ||
      String(tracking?.previous?.empName || '').toLowerCase().includes(matchStr) ||
      String(tracking?.nextReliver?.empName || '').toLowerCase().includes(matchStr)
    );
  });

  return (
    <Suspense fallback={<ModuleLoader />}>
      {(() => {
        const userRole = userProfile?.role || 'VIEWER';

        if (
          userRole === 'SUPER_ADMIN' || 
          userRole === 'JMD' || 
          userRole === 'ADMIN_Station_Superintendent' || 
          userRole === 'ADMIN_SS' || 
          userRole === 'CREW_CONTROLLER' ||
          userRole === 'ADMIN' ||
          userRole === 'VIEWER' ||
          (userRole === 'TRAIN_OPERATOR' && toViewMode === 'CONSOLE')
        ) {
          return (
            <SuperAdminLayout
              liveTrainTrackingMap={liveTrainTrackingMap}
              unifiedRows={unifiedRows}
              liveIncidents={liveIncidents}
              deployments={dailyDeployment}
              attendanceLogs={attendanceLogs}
              loading={loading}
              fetchLiveData={fetchLiveData}
              activeDay={activeDay}
              setActiveDay={setActiveDay}
              onOneClickAuthorize={isOperatorOrViewer ? undefined : handleOneClickAuthorize}
              filteredLinks={filteredLinks}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              editValue={editValue}
              setEditValue={setEditValue}
              handleCellSave={isOperatorOrViewer ? undefined : handleCellSave}
              handleDeleteRow={isOperatorOrViewer ? undefined : handleDeleteRow}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              trackerSearchTerm={trackerSearchTerm}
              setTrackerSearchTerm={setTrackerSearchTerm}
              filteredTrackingKeys={filteredTrackingKeys}
              dnStationOrder={dnStationOrder}
              upStationOrder={upStationOrder}
              handleWttCellSave={isOperatorOrViewer ? undefined : handleWttCellSave}
              handleWttBulkSave={isOperatorOrViewer ? undefined : handleWttBulkSave}
              handleDeleteTripRow={isOperatorOrViewer ? undefined : handleDeleteTripRow}
              addDelayToTime={addDelayToTime}
              handleRosterReset={isOperatorOrViewer ? undefined : handleRosterReset}
              handleUpdateMasterScheduleLinks={isOperatorOrViewer ? undefined : handleUpdateMasterScheduleLinks}
              handleUpdateMasterWeekdayLinks={isOperatorOrViewer ? undefined : handleUpdateMasterWeekdayLinks}
              handleGccRosterUpload={isOperatorOrViewer ? undefined : handleGccRosterUpload}
              targetTid={targetTid}
              setTargetTid={setTargetTid}
              delayMinutes={delayMinutes}
              setDelayMinutes={setDelayMinutes}
              incidentReason={incidentReason}
              setIncidentReason={setIncidentReason}
              handleIncidentLogSubmit={isOperatorOrViewer ? undefined : handleIncidentLogSubmit}
              onWttImported={handleWttImported}
              onLinkRosterImported={handleLinkRosterImported}
              onSwitchViewMode={() => setToViewMode('PWA')}
            />
          );
        }

        if (
          userRole === 'GCC_OCC_CONTROLLER' || 
          userRole === 'OCC_CONTROLLER' || 
          userRole === 'GCC' || 
          userRole === 'OCC'
        ) {
          return (
            <OccControllerLayout
              liveTrainTrackingMap={liveTrainTrackingMap}
              unifiedRows={unifiedRows}
              liveIncidents={liveIncidents}
              deployments={dailyDeployment}
              attendanceLogs={attendanceLogs}
              loading={loading}
              fetchLiveData={fetchLiveData}
              activeDay={activeDay}
            />
          );
        }

        if (userRole === 'STATION_CONTROLLER') {
          return (
            <StationControllerLayout
              liveTrainTrackingMap={liveTrainTrackingMap}
              unifiedRows={unifiedRows}
              liveIncidents={liveIncidents}
              deployments={dailyDeployment}
              attendanceLogs={attendanceLogs}
              loading={loading}
              fetchLiveData={fetchLiveData}
              activeDay={activeDay}
            />
          );
        }

        if (userRole === 'TRAIN_OPERATOR') {
          return (
            <TrainOperatorPwa
              liveTrainTrackingMap={liveTrainTrackingMap}
              unifiedRows={unifiedRows}
              liveIncidents={liveIncidents}
              deployments={dailyDeployment}
              attendanceLogs={attendanceLogs}
              loading={loading}
              fetchLiveData={fetchLiveData}
              activeDay={activeDay}
              onSwitchViewMode={() => setToViewMode('CONSOLE')}
            />
          );
        }

    return (
      <ViewerLayout
        liveTrainTrackingMap={liveTrainTrackingMap}
        unifiedRows={unifiedRows}
        liveIncidents={liveIncidents}
        deployments={dailyDeployment}
        attendanceLogs={attendanceLogs}
        loading={loading}
        fetchLiveData={fetchLiveData}
        activeDay={activeDay}
      />
    );
      })()} 
    </Suspense>
  );
}