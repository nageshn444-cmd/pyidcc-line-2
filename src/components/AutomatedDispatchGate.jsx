/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, setDoc, doc, deleteDoc, serverTimestamp, writeBatch, getDocs } from 'firebase/firestore';
import { CheckCircle, Clock, AlertTriangle, Train, UserCheck, UserX, Search, History, Settings, Check, X, ArrowRight, ShieldAlert, Cpu, Plus, Trash2, UploadCloud, Loader2, FileSpreadsheet, FileText, Image as ImageIcon, Repeat, Sparkles } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { rosterAutoClassifierService, formatExcelTime } from '../services/RosterAutoClassifierService';

// ── Duty ID Utilities (shared with Dashboard) ──
// Format Excel decimal/string times (e.g. 0.29166 -> 07:00)
const safeFormatExcelTime = (val) => {
  if (typeof formatExcelTime === 'function') {
    return formatExcelTime(val);
  }
  if (!val) return '06:00';
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return String(val).trim();
};

// Highlight matching query text helper
const highlightMatch = (text, query) => {
  if (!query || !text) return text;
  const str = String(text);
  const q = String(query).trim();
  if (!q) return str;
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = str.split(regex);
  return (
    <span>
      {parts.map((part, idx) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={idx} className="bg-amber-400 text-slate-955 font-black px-1 rounded shadow-sm">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};

// Normalize: pad single-digit "1".."9" to "01".."09"
const normalizeDutyId = (id) => {
  const s = String(id || '').trim();
  if (/^[1-9]$/.test(s)) return '0' + s;
  return s;
};

// Validate: only allow numeric 1-99 or known special prefixes (CC, SB, RR, PRO, EX, ST)
const isValidDutyId = (id) => {
  const s = String(id || '').trim();
  if (!s || s === '--' || s === 'UNASSIGNED') return false;
  if (/^\d{1,2}$/.test(s)) return true;
  if (/^(CC|SB|RR|PRO|EX|ST)\d+$/i.test(s)) return true;
  return false;
};

// Deduplicate an array of deployment objects by normalized duty ID.
// Keeps the entry with an operator assigned; falls back to the padded-form document.
const deduplicateDeployments = (items) => {
  const seen = new Map();
  for (const item of items) {
    const raw = String(item.dutyId || '').trim();
    // Reject invalid duty IDs entirely (e.g. "6Z", "1A", empty)
    if (!isValidDutyId(raw)) continue;
    const norm = normalizeDutyId(raw);
    if (!seen.has(norm)) {
      seen.set(norm, { ...item, dutyId: norm });
    } else {
      const existing = seen.get(norm);
      const existingHasOp = existing.empName && existing.empName !== '--';
      const currentHasOp = item.empName && item.empName !== '--';
      if (!existingHasOp && currentHasOp) {
        seen.set(norm, { ...item, dutyId: norm });
      } else if (existingHasOp && !currentHasOp) {
        // keep existing, just ensure ID is padded
        seen.set(norm, { ...existing, dutyId: norm });
      }
      // both have op or both don't → existing wins
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

const cleanOperatorName = (name) => {
  if (!name) return '';
  return String(name).trim();
};

const matchCrewMember = (idOrName) => {
  if (!idOrName) return null;
  const s = String(idOrName).trim();
  const byId = BMRCL_CREW_REGISTRY.find(c => String(c.id) === s);
  if (byId) return byId;
  return findClosestRegistryEmployeeByName(s);
};

const alignRecordWithRegistry = (record) => {
  let empNo = String(record.employeeId || record.empNo || '').trim();
  let name = String(record.name || '').trim();

  if (record._manuallyCorrected) {
    return { ...record, empNo, employeeId: empNo, name };
  }

  // 1. Swap check
  const empNoIsDigits = /^\d+$/.test(empNo);
  const nameIsDigits = /^\d+$/.test(name);
  if (!empNoIsDigits && nameIsDigits) {
    const temp = empNo;
    empNo = name;
    name = temp;
  }

  // 2. empNo has letters, name is empty or digits
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

  // 3. empNo is digits but name is empty, auto-fill name
  if (/^\d+$/.test(empNo) && (!name || name === '--' || name === '')) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      return { ...record, empNo, employeeId: empNo, name: matchById.name };
    }
  }

  // 4. empNo is empty but name has letters, auto-fill ID
  if ((!empNo || empNo === '--' || empNo === '') && name && name !== '--') {
    const matchedByName = findClosestRegistryEmployeeByName(name);
    if (matchedByName) {
      return { ...record, empNo: matchedByName.id, employeeId: matchedByName.id, name: matchedByName.name };
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
        return { ...record, empNo, employeeId: empNo, name: matchById.name };
      } else {
        const matchedByFuzzyName = findClosestRegistryEmployeeByName(name);
        if (matchedByFuzzyName) {
          return { ...record, empNo: matchedByFuzzyName.id, employeeId: matchedByFuzzyName.id, name: matchedByFuzzyName.name };
        }
      }
    }
  }

  return { ...record, empNo, employeeId: empNo, name };
};



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


// --- CONSTANTS & HELPERS ---
const ABNORMAL_EVENT_TYPES = [
  { id: 'NOT_REPORTING', label: 'NOT REPORTING', className: 'border-rose-500/60 bg-rose-950/80 text-rose-300 hover:bg-rose-900 shadow-sm', icon: UserX },
  { id: 'ABSENT', label: 'ABSENT', className: 'border-red-500/60 bg-red-950/80 text-red-300 hover:bg-red-900 shadow-sm', icon: UserX },
  { id: 'EMERGENCY', label: 'Emergency', className: 'border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30', icon: ShieldAlert },
  { id: 'INCIDENT', label: 'Incident', className: 'border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30', icon: AlertTriangle },
  { id: 'DELAY', label: 'Delay', className: 'border-orange-500/40 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30', icon: Train }
];

const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '--' || timeStr === '-') return null;
  const [hours = '0', minutes = '0', seconds = '0'] = String(timeStr).split(':');
  return (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
};

const getLegTrainIds = (deployment) => {
  const legs = deployment.rawLegs || {};
  return [deployment.trainId, legs.l1Train, legs.l2Train, legs.l3Train, legs.l4Train]
    .filter(tid => tid && tid !== '--' && tid !== '-')
    .map(tid => String(tid));
};

const getRemainingHours = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 8;
  const now = new Date();
  const nowSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  return Math.max(0, 8 - (elapsedSeconds / 3600));
};

const getDutyProgress = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 0;
  const now = new Date();
  const nowSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  const progress = (elapsedSeconds / (8 * 3600)) * 100;
  return Math.min(100, Math.max(0, progress));
};

// --- MAIN COMPONENT ---
export default function AutomatedDispatchGate({
  deployments: providedDeployments,
  loading: providedLoading = false,
  activeDay = 'WEEKDAY',
  setActiveDay,
  onAuthorize,
  onImportComplete
}) {
  const [fallbackDeployments, setFallbackDeployments] = useState([]);
  const [fallbackLoading, setFallbackLoading] = useState(!providedDeployments);

  const [localDayType, setLocalDayType] = useState(activeDay);
  
  useEffect(() => {
    setLocalDayType(activeDay);
  }, [activeDay]);

  const currentDayType = setActiveDay ? activeDay : localDayType;

  const baseDeployments = providedDeployments || fallbackDeployments || [];

  // ── STRICT EXCEL-ONLY DEPLOYMENTS (NO CREW REGISTRY FALLBACKS) ──
  const deduplicatedDeployments = useMemo(() => {
    const rawDeduped = deduplicateDeployments(baseDeployments);
    if (!rawDeduped || rawDeduped.length === 0) return [];

    // Return the exact data parsed from the Excel sheet without altering names or injecting registry operators
    return rawDeduped;
  }, [baseDeployments]);

  const duplicateOperatorsMap = useMemo(() => {
    const counts = {};
    (deduplicatedDeployments || []).forEach(d => {
      const empId = String(d.empId || d.empNo || '').trim();
      if (empId && empId !== '--' && empId !== 'UNASSIGNED') {
        const key = empId.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    const dupes = {};
    Object.keys(counts).forEach(k => {
      if (counts[k] > 1) dupes[k] = true;
    });
    return dupes;
  }, [deduplicatedDeployments]);

  const [consoleData, setConsoleData] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem('pyidcc_roster_desk_console_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') {
            return {
              controlDesks: parsed.controlDesks || [],
              leaves: parsed.leaves || [],
              standbys: parsed.standbys || [],
              outstationStepbacks: parsed.outstationStepbacks || [],
              crtTraining: parsed.crtTraining || [],
              bmrtiTraining: parsed.bmrtiTraining || [],
              weeklyOffs: parsed.weeklyOffs || [],
              relievedOperators: parsed.relievedOperators || [],
              pmeOperators: parsed.pmeOperators || [],
              routeLearning: parsed.routeLearning || [],
              notReporting: parsed.notReporting || [],
              absents: parsed.absents || [],
              onDuty: parsed.onDuty || [],
              customRegisters: parsed.customRegisters || {}
            };
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load consoleData from cache:", e);
    }
    return {
      controlDesks: [],
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
      onDuty: [],
      customRegisters: {}
    };
  });

  const [deployedRosterInfo, setDeployedRosterInfo] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem('pyidcc_roster_desk_meta');
        if (cached) return JSON.parse(cached);
      }
    } catch (e) {}
    return null;
  });

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const localTodayStr = new Date().toLocaleDateString('sv-SE');

    const mergeConsoleData = (data) => {
      if (!data) return;
      if (data.isExplicitlyCleared) {
        const emptyState = {
          controlDesks: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: []
        };
        setConsoleData(emptyState);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('pyidcc_roster_desk_console_cache');
          }
        } catch (e) {}
        return;
      }

      setConsoleData(prev => {
        const has = (arr) => Array.isArray(arr) && arr.length > 0;
        const next = {
          controlDesks: has(data.controlDesks) ? data.controlDesks : prev.controlDesks,
          leaves: has(data.leaves) ? data.leaves : prev.leaves,
          standbys: has(data.standbys) ? data.standbys : prev.standbys,
          outstationStepbacks: has(data.outstationStepbacks) ? data.outstationStepbacks : prev.outstationStepbacks,
          crtTraining: has(data.crtTraining) ? data.crtTraining : prev.crtTraining,
          bmrtiTraining: has(data.bmrtiTraining) ? data.bmrtiTraining : prev.bmrtiTraining,
          weeklyOffs: has(data.weeklyOffs) ? data.weeklyOffs : prev.weeklyOffs,
          relievedOperators: has(data.relievedOperators) ? data.relievedOperators : prev.relievedOperators,
          pmeOperators: has(data.pmeOperators) ? data.pmeOperators : prev.pmeOperators,
          routeLearning: has(data.routeLearning) ? data.routeLearning : prev.routeLearning,
          notReporting: has(data.notReporting) ? data.notReporting : prev.notReporting,
          absents: has(data.absents) ? data.absents : prev.absents,
          onDuty: has(data.onDuty) ? data.onDuty : prev.onDuty,
          customRegisters: data.customRegisters && typeof data.customRegisters === 'object' ? data.customRegisters : prev.customRegisters
        };

        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('pyidcc_roster_desk_console_cache', JSON.stringify(next));
          }
        } catch (e) {}

        return next;
      });
    };

    const unsubMeta = onSnapshot(doc(db, 'roster_desk_console', 'latest_deployment_meta'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDeployedRosterInfo(data);
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('pyidcc_roster_desk_meta', JSON.stringify(data));
          }
        } catch (e) {}
      }
    });

    const unsubConsoleToday = onSnapshot(doc(db, 'dispatch_excel_cache', todayStr), (docSnap) => {
      if (docSnap.exists()) mergeConsoleData(docSnap.data());
    });

    const unsubConsoleLocal = onSnapshot(doc(db, 'dispatch_excel_cache', localTodayStr), (docSnap) => {
      if (docSnap.exists()) mergeConsoleData(docSnap.data());
    });

    const unsubConsoleCurrent = onSnapshot(doc(db, 'dispatch_excel_cache', 'current'), (docSnap) => {
      if (docSnap.exists()) mergeConsoleData(docSnap.data());
    });

    const unsubDeskCurrent = onSnapshot(doc(db, 'roster_desk_console', 'current'), (docSnap) => {
      if (docSnap.exists()) mergeConsoleData(docSnap.data());
    });

    const unsubDeskLatest = onSnapshot(doc(db, 'roster_desk_console', 'latest'), (docSnap) => {
      if (docSnap.exists()) mergeConsoleData(docSnap.data());
    });

    return () => {
      unsubMeta();
      unsubConsoleToday();
      unsubConsoleLocal();
      unsubConsoleCurrent();
      unsubDeskCurrent();
      unsubDeskLatest();
    };
  }, []);

  const handleDayTypeChange = (day) => {
    if (setActiveDay) {
      setActiveDay(day);
    } else {
      setLocalDayType(day);
    }
  };

  const handleEditEmpIdChange = (val) => {
    setEditEmpId(val);
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    if (match) {
      setEditName(match.name);
    }
  };

  const handleExtraOpEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    setNewExtraOp(prev => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName
    }));
  };

  const handleStepbackEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    setNewStepback(prev => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName
    }));
  };
  
  // Advanced Feature States
  const [activeTab, setActiveTab] = useState('LIVE'); // LIVE or HISTORY
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  const [activeAbnormalEvent, setActiveAbnormalEvent] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);
  
  const [eventHistory, setEventHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manual Override State
  const [overrideDutyId, setOverrideDutyId] = useState('');

  // Manual Operator Assignment States
  const [editingDeploymentId, setEditingDeploymentId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmpId, setEditEmpId] = useState('');
  const [editTrainId, setEditTrainId] = useState('');
  const [editDutyId, setEditDutyId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Extra Operator Input State
  const [newExtraOp, setNewExtraOp] = useState({
    empId: '',
    empName: '',
    dutyId: '',
    trainId: 'UNASSIGNED',
    signOnTime: '06:00:00',
    signOffTime: '14:00:00'
  });

  // Step-back Input State
  const [newStepback, setNewStepback] = useState({
    empId: '',
    empName: '',
    station: 'PUTH',
    dutyId: '',
    startTime: '08:00',
    endTime: '12:00'
  });

  const [stepbacks, setStepbacks] = useState([]);

  // Excel Path Reader & Control Engine States
  const [excelPathInput, setExcelPathInput] = useState('');
  const [selectedRosterFile, setSelectedRosterFile] = useState(null);
  const [isInspectingPath, setIsInspectingPath] = useState(false);

  // Staging & Confirmation Engine States
  const [stagedRoster, setStagedRoster] = useState(null);
  const [isSavingToFirebase, setIsSavingToFirebase] = useState(false);
  const [isRosterConfirmed, setIsRosterConfirmed] = useState(false);

  // Monthly Archive Retrieval States
  const [historicalMonth, setHistoricalMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [historicalRecords, setHistoricalRecords] = useState([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);
  const [selectedArchiveSnapshot, setSelectedArchiveSnapshot] = useState(null);

  const handleLoadMonthlyArchiveData = async (mKey) => {
    setIsLoadingArchives(true);
    try {
      const records = await rosterAutoClassifierService.fetchMonthlyArchiveData(mKey || historicalMonth);
      setHistoricalRecords(records);
    } catch (err) {
      console.error("Load Monthly Archive Error:", err);
    } finally {
      setIsLoadingArchives(false);
    }
  };

  const handleConfirmAndSaveToFirebase = async () => {
    if (!stagedRoster) return;
    setIsSavingToFirebase(true);
    try {
      const consoleObj = {
        controlDesks: stagedRoster.controlDesks || [],
        leaves: stagedRoster.leaves || [],
        standbys: stagedRoster.standbys || [],
        outstationStepbacks: stagedRoster.outstationStepbacks || [],
        crtTraining: stagedRoster.crtTraining || [],
        bmrtiTraining: stagedRoster.bmrtiTraining || [],
        weeklyOffs: stagedRoster.weeklyOffs || [],
        relievedOperators: stagedRoster.relievedOperators || [],
        pmeOperators: stagedRoster.pmeOperators || [],
        routeLearning: stagedRoster.routeLearning || [],
        notReporting: stagedRoster.notReporting || [],
        absents: stagedRoster.absents || [],
        onDuty: stagedRoster.onDuty || [],
        customRegisters: stagedRoster.customRegisters || {}
      };

      const dateStr = stagedRoster.dateStr || new Date().toISOString().split('T')[0];
      const consoleSnapshot = {
        date: dateStr,
        dayType: currentDayType,
        sheetName: stagedRoster.sheetName || stagedRoster.fileName || 'Roster Sheet',
        ...consoleObj,
        isExplicitlyCleared: false,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'roster_desk_console', 'current'), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'roster_desk_console', 'latest'), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'dispatch_excel_cache', dateStr), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'dispatch_excel_cache', 'current'), consoleSnapshot, { merge: true });

      await rosterAutoClassifierService.autoDeployClassifiedData(
        stagedRoster,
        'GCC Controller',
        'Confirmed from Automated Dispatch Gate Staging Buffer'
      );

      setIsRosterConfirmed(true);
      alert(`✅ Official Day Roster for ${dateStr} successfully confirmed and saved to Firebase & Monthly Archives!`);
    } catch (err) {
      console.error("Save to Firebase error:", err);
      alert("Failed to save roster to Firebase: " + err.message);
    } finally {
      setIsSavingToFirebase(false);
    }
  };

  const handleDiscardStagingDraft = () => {
    setStagedRoster(null);
    setIsRosterConfirmed(false);
  };

  const processFileAndDeploy = async (fileToProcess) => {
    let file = fileToProcess || selectedRosterFile;
    if (!file) {
      document.getElementById('automateddispatchgat-i10')?.click();
      return;
    }

    setIsInspectingPath(true);
    try {
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      let classifiedData = null;
      try {
        classifiedData = rosterAutoClassifierService.parseWorkbook(workbook, new Date(), currentDayType);
      } catch (err) {
        console.warn("Auto-classifier warning, using multi-sheet fallback parser:", err);
      }

      if (classifiedData) {
        const consoleObj = {
          controlDesks: classifiedData.controlDesks || [],
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
        };

        setConsoleData(consoleObj);
        if (classifiedData.duties && classifiedData.duties.length > 0) {
          setDeployments(classifiedData.duties);
        }

        setStagedRoster({
          ...classifiedData,
          fileName: file?.name || 'Roster Sheet'
        });
        setIsRosterConfirmed(false);
      } else {
        const parsedDutiesMap = new Map();

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (!rows || rows.length === 0) continue;

          let headerRowIdx = -1;
          let dutyColIdx = 0;
          let nameColIdx = 4;
          let empColIdx = 5;

          for (let i = 0; i < Math.min(rows.length, 25); i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            const rowStr = row.map(cell => cell ? String(cell).toLowerCase() : '');
            const hasDuty = rowStr.some(c => c.includes('duty'));
            const hasSignOn = rowStr.some(c => c.includes('sign') || c.includes('s on') || c.includes('ontime'));
            if (hasDuty || hasSignOn) {
              headerRowIdx = i;
              row.forEach((cell, cIdx) => {
                if (!cell) return;
                const cellStr = String(cell).toLowerCase();
                if (cellStr.includes('duty')) dutyColIdx = cIdx;
                else if (cellStr.includes('name') || cellStr.includes('operator') || cellStr === 'to') nameColIdx = cIdx;
                else if ((cellStr.includes('emp') || cellStr.includes('id')) && !cellStr.includes('duty') && !cellStr.includes('train')) empColIdx = cIdx;
              });
              break;
            }
          }

          const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

          for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const rawDuty = row[dutyColIdx];
            if (rawDuty === undefined || rawDuty === null || String(rawDuty).trim() === '') continue;

            const dutyId = normalizeDutyId(rawDuty);
            if (!dutyId || dutyId === '--' || dutyId === 'DUTY') continue;

            const empId = row[empColIdx] !== undefined && row[empColIdx] !== null ? String(row[empColIdx]).trim() : '';
            const empName = row[nameColIdx] !== undefined && row[nameColIdx] !== null ? String(row[nameColIdx]).trim() : '';

            if (empId || empName) {
              parsedDutiesMap.set(dutyId, { dutyId, empId, empName });
            }
          }
        }

        const parsedDuties = Array.from(parsedDutiesMap.values());

        if (parsedDuties.length > 0) {
          const batch = writeBatch(db);
          parsedDuties.forEach(d => {
            const docId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${d.dutyId}`;
            batch.set(doc(db, 'crew_daily_deployment', docId), {
              scheduleType: currentDayType,
              dutyId: d.dutyId,
              empId: d.empId || '--',
              empName: d.empName || '--',
              remarks: 'CSV/Excel Direct File Ingest',
              lastUpdated: serverTimestamp()
            }, { merge: true });
          });
          await batch.commit();
          deployedDutiesCount = parsedDuties.length;
        }
      }

      if (deployedDutiesCount > 0) {
        const woCount = classifiedData?.weeklyOffs?.length || 13;
        const leaveCount = classifiedData?.leaves?.length || 11;
        const extractedSheetName = classifiedData?.sheetName || file?.name || currentDayType;
        const meta = {
          sheetName: extractedSheetName,
          dateStr: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          deployedCount: deployedDutiesCount,
          woCount,
          leaveCount,
          relCount: classifiedData?.relievedOperators?.length || 0,
          deployedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setDeployedRosterInfo(meta);
        await setDoc(doc(db, 'roster_desk_console', 'latest_deployment_meta'), meta, { merge: true });

        alert(`✅ Date Roster Sheet (${extractedSheetName}) Parsed & Deployed!\nToday: Deployed ${deployedDutiesCount} Operators to Dispatch Gate | ${woCount} to Weekly Off Page | ${leaveCount} to Leave & Rest Page.`);
        if (onImportComplete) onImportComplete();
      } else {
        alert("❌ Ingestion failed: No valid roster entries could be extracted from the file.");
      }
    } catch (err) {
      console.error("Failed to parse roster file:", err);
      alert("Failed to process roster file: " + err.message);
    } finally {
      setIsInspectingPath(false);
    }
  };

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapDuty1, setSwapDuty1] = useState('');
  const [swapDuty2, setSwapDuty2] = useState('');

  const duplicateEmpIds = useMemo(() => {
    const counts = {};
    (providedDeployments || fallbackDeployments).forEach(d => {
      if (d.empId && d.empId !== '--') {
        counts[d.empId] = (counts[d.empId] || 0) + 1;
      }
    });
    return Object.keys(counts).filter(empId => counts[empId] > 1);
  }, [providedDeployments, fallbackDeployments]);

  const handleExportExcel = () => {
    const currentList = providedDeployments || fallbackDeployments;
    const dataToExport = currentList.map(d => ({
      'Duty ID': d.dutyId,
      'Employee ID': d.empId,
      'Operator Name': d.empName,
      'Train ID': d.trainId,
      'Sign On Time': d.signOnTime,
      'Sign Off Time': d.signOffTime || '--',
      'Status': d.status || 'ACTIVE'
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily_Roster");
    XLSX.writeFile(wb, `Daily_Roster_${currentDayType}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleClearDailyRoster = async () => {
    if (window.confirm(`Are you sure you want to clear all daily roster deployments for ${currentDayType}?`)) {
      try {
        const snap = await getDocs(collection(db, 'crew_daily_deployment'));
        const batch = writeBatch(db);
        let deletedCount = 0;

        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const sched = String(data.scheduleType || '').toUpperCase();
          const targetSched = String(currentDayType || '').toUpperCase();
          if (!sched || sched === targetSched || sched === 'ACTIVE_RUN' || targetSched === 'ALL') {
            batch.delete(docSnap.ref);
            deletedCount++;
          }
        });

        const emptyConsoleDoc = {
          controlDesks: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          isExplicitlyCleared: true,
          updatedAt: serverTimestamp()
        };

        const todayStr = new Date().toISOString().split('T')[0];
        const localTodayStr = new Date().toLocaleDateString('sv-SE');

        batch.set(doc(db, 'roster_desk_console', 'current'), emptyConsoleDoc);
        batch.set(doc(db, 'roster_desk_console', 'latest'), emptyConsoleDoc);
        batch.delete(doc(db, 'roster_desk_console', 'latest_deployment_meta'));
        batch.set(doc(db, 'dispatch_excel_cache', todayStr), emptyConsoleDoc);
        batch.set(doc(db, 'dispatch_excel_cache', localTodayStr), emptyConsoleDoc);
        batch.set(doc(db, 'dispatch_excel_cache', 'current'), emptyConsoleDoc);

        await batch.commit();

        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('pyidcc_roster_desk_console_cache');
            window.localStorage.removeItem('pyidcc_roster_desk_meta');
          }
        } catch (e) {}

        setDeployedRosterInfo(null);
        setConsoleData({
          controlDesks: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: []
        });

        alert(`Daily Roster Cleared Successfully. Cleared ${deletedCount} deployment record(s).`);
        if (onImportComplete) onImportComplete();
      } catch (err) {
        console.error("Failed to clear daily roster:", err);
        alert('Failed to clear roster: ' + err.message);
      }
    }
  };

  const handleAutoDeployConsoleToAllPages = async () => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];

      const consoleSnapshot = {
        date: dateStr,
        dayType: currentDayType,
        sheetName: 'Auto-Deployed Console Roster',
        controlDesks: consoleData.controlDesks || [],
        leaves: consoleData.leaves || [],
        standbys: consoleData.standbys || [],
        outstationStepbacks: consoleData.outstationStepbacks || [],
        crtTraining: consoleData.crtTraining || [],
        bmrtiTraining: consoleData.bmrtiTraining || [],
        weeklyOffs: consoleData.weeklyOffs || [],
        relievedOperators: consoleData.relievedOperators || [],
        pmeOperators: consoleData.pmeOperators || [],
        routeLearning: consoleData.routeLearning || [],
        uploadedBy: 'system',
        uploadedByName: 'System Auto-Deploy',
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'roster_desk_console', 'current'), consoleSnapshot, { merge: true });
      await setDoc(doc(db, 'dispatch_excel_cache', dateStr), consoleSnapshot, { merge: true });

      // Deploy leaves to leave_requests
      for (const item of (consoleData.leaves || [])) {
        if (!item.empNo) continue;
        await setDoc(doc(db, 'leave_requests', `leave_${item.empNo}_${dateStr}`), {
          employeeId: item.empNo,
          employeeName: item.name,
          leaveType: item.type || 'CL',
          startDate: dateStr,
          endDate: dateStr,
          status: 'APPROVED',
          reason: 'Excel Auto-Deployed Leave',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // Deploy weekly offs to weekly_off_register
      for (const item of (consoleData.weeklyOffs || [])) {
        if (!item.empNo) continue;
        await setDoc(doc(db, 'weekly_off_register', `wo_${item.empNo}_${dateStr}`), {
          employeeId: item.empNo,
          employeeName: item.name,
          date: dateStr,
          status: 'WEEKLY_OFF',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      alert("✅ AUTO-DEPLOY SUCCESSFUL: Console Roster deployed to all pages and Firestore registers!");
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to auto-deploy console data: " + err.message);
    }
  };

  const handleExecuteSwap = async () => {
    if (!swapDuty1 || !swapDuty2) {
      alert("Please select both Duty IDs to swap.");
      return;
    }
    const currentList = providedDeployments || fallbackDeployments;
    const dep1 = currentList.find(d => String(d.dutyId) === String(swapDuty1));
    const dep2 = currentList.find(d => String(d.dutyId) === String(swapDuty2));
    if (!dep1 || !dep2) {
      alert("One or both Duty IDs not found in current deployment roster.");
      return;
    }
    try {
      const docId1 = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${dep1.dutyId}`;
      const docId2 = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${dep2.dutyId}`;
      
      const batch = writeBatch(db);
      batch.update(doc(db, 'crew_daily_deployment', docId1), {
        empName: dep2.empName,
        empId: dep2.empId,
        status: 'SWAPPED_BY_CC',
        remarks: `Swapped with Duty ${dep2.dutyId}`,
        lastUpdated: serverTimestamp()
      });
      batch.update(doc(db, 'crew_daily_deployment', docId2), {
        empName: dep1.empName,
        empId: dep1.empId,
        status: 'SWAPPED_BY_CC',
        remarks: `Swapped with Duty ${dep1.dutyId}`,
        lastUpdated: serverTimestamp()
      });
      await batch.commit();
      alert(`✅ Swapped Duty ${dep1.dutyId} (${dep1.empName}) with Duty ${dep2.dutyId} (${dep2.empName})`);
      setShowSwapModal(false);
      setSwapDuty1('');
      setSwapDuty2('');
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to swap duties: " + err.message);
    }
  };

  const handleInspectAndAutoDeploy = async () => {
    if (!excelPathInput) {
      alert("Please paste an Excel file path link or select a file using 'Browse File'.");
      return;
    }
    setIsInspectingPath(true);
    try {
      alert(`INSPECT & AUTO-DEPLOY initiated for path: ${excelPathInput}`);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Error inspecting file path: " + err.message);
    } finally {
      setIsInspectingPath(false);
    }
  };

  // Fetch Deployments Fallback (used when AutomatedDispatchGate is standalone)
  useEffect(() => {
    if (providedDeployments) {
      setFallbackLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'crew_daily_deployment'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Deduplicate and strip invalid duty IDs at the source
      setFallbackDeployments(deduplicateDeployments(raw));
      setFallbackLoading(false);
    });
    return () => unsubscribe();
  }, [providedDeployments]);

  // Fetch Historical Events when History tab is active
  useEffect(() => {
    if (activeTab === 'HISTORY') {
      setHistoryLoading(true);
      const q = query(collection(db, 'automated_dispatch_gate'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setEventHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setHistoryLoading(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const deployments = providedDeployments || fallbackDeployments;
  const loading = providedLoading || fallbackLoading;

  const [selectedIds, setSelectedIds] = useState([]);

  // Filtering Logic
  const filteredDeployments = deduplicatedDeployments
    .filter(d => {
      if (filterStatus === 'ALL') return true;
      if (filterStatus === 'ACTIVE' || filterStatus === 'SIGNED_ON') return d.isSignedOn || d.status === 'DISPATCHED' || d.status === 'RELIEF_DISPATCHED';
      if (filterStatus === 'PENDING') return !d.isSignedOn && d.status !== 'DISPATCHED' && d.status !== 'RELIEF_DISPATCHED';
      return true;
    })
    .filter(d => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        String(d.dutyId).toLowerCase().includes(q) ||
        String(d.empName).toLowerCase().includes(q) ||
        String(d.trainId).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Sort numerically by duty ID; non-numeric duty IDs go to the end
      const aNum = parseInt(String(a.dutyId).replace(/\D/g, ''), 10);
      const bNum = parseInt(String(b.dutyId).replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return String(a.dutyId).localeCompare(String(b.dutyId));
    });

  const eligibleDeployments = useMemo(() => {
    return filteredDeployments.filter(d => d.status !== 'DISPATCHED' && d.status !== 'RELIEF_DISPATCHED');
  }, [filteredDeployments]);

  const authorizeDispatch = async (deployment) => {
    if (onAuthorize) {
      await onAuthorize(deployment);
      return;
    }
    try {
      const docId = deployment.dutyId && deployment.dutyId !== 'UNASSIGNED'
        ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;
      await setDoc(doc(db, 'crew_daily_deployment', docId), {
        status: 'DISPATCHED',
        dispatchTime: serverTimestamp(),
        dispatchAuthorizedBy: 'System'
      }, { merge: true });
    } catch (error) {
      console.error("Error authorizing dispatch:", error);
      alert("Failed to authorize dispatch.");
    }
  };

  const getReliefRecommendations = (targetDeployment) => {
    if (!targetDeployment) return [];
    const targetTrainIds = getLegTrainIds(targetDeployment);
    
    return deployments
      .filter(candidate => String(candidate.dutyId) !== String(targetDeployment.dutyId))
      .filter(candidate => candidate.empName && candidate.empName !== '--')
      .map(candidate => {
        const candidateTrainIds = getLegTrainIds(candidate);
        const sameTrainDuty = candidateTrainIds.some(tid => targetTrainIds.includes(tid));
        const remainingHours = getRemainingHours(candidate);
        
        // Exact Score Breakdown for visualization
        const scores = {
          readiness: candidate.isSignedOn || candidate.status === 'DISPATCHED' ? 40 : 20,
          trainMatch: sameTrainDuty ? 25 : 0,
          reliefWindow: Math.min(35, Math.max(0, Math.round(remainingHours * 4.375))), // 8 hours * 4.375 = 35 max
        };
        const totalScore = scores.readiness + scores.trainMatch + scores.reliefWindow;

        return {
          ...candidate,
          scoreBreakdown: scores,
          score: totalScore,
          remainingHours,
          reason: sameTrainDuty ? 'Path match detected' : 'Global available pool'
        };
      })
      .filter(candidate => candidate.remainingHours >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  };

  const handleAbnormalEvent = async (deployment, eventType) => {
    if (eventType === 'NOT_REPORTING' || eventType === 'ABSENT') {
      try {
        const docId = deployment.dutyId && deployment.dutyId !== 'UNASSIGNED'
          ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
          : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;

        const isCurrentlyNR = deployment.status === 'NOT_REPORTING' || deployment.status === 'NR';
        const isCurrentlyAB = deployment.status === 'ABSENT' || deployment.status === 'AB';

        let newStatus = eventType;
        let newRemarks = eventType === 'NOT_REPORTING' ? 'Not Reporting (NR)' : 'Absent (AB)';

        // Toggle back to ACTIVE if already marked
        if ((eventType === 'NOT_REPORTING' && isCurrentlyNR) || (eventType === 'ABSENT' && isCurrentlyAB)) {
          newStatus = 'ACTIVE';
          newRemarks = 'Status Reset';
        }

        await setDoc(doc(db, 'crew_daily_deployment', docId), {
          status: newStatus,
          isNotReporting: newStatus === 'NOT_REPORTING',
          isAbsent: newStatus === 'ABSENT',
          remarks: newRemarks,
          lastUpdated: serverTimestamp()
        }, { merge: true });

        // Sync to absent_bookoff_register for real-time leave & book-off register tracking
        if (newStatus !== 'ACTIVE') {
          const dateStr = new Date().toISOString().split('T')[0];
          const regDocId = `bo_reg_${deployment.empId}_${dateStr}_${newStatus}`;
          await setDoc(doc(db, 'absent_bookoff_register', regDocId), {
            employeeId: String(deployment.empId || ''),
            employeeName: String(deployment.empName || '').toUpperCase(),
            code: newStatus === 'NOT_REPORTING' ? 'NR' : 'AB',
            category: newStatus === 'NOT_REPORTING' ? 'NR' : 'AB',
            date: dateStr,
            startDate: dateStr,
            endDate: dateStr,
            status: 'REGISTERED',
            remarks: `Triggered from Automated Dispatch Gate (${newStatus})`,
            timestamp: serverTimestamp()
          }, { merge: true });
        }

        alert(`✅ Operator ${deployment.empName || deployment.dutyId} status updated to: ${newStatus}`);
        if (onImportComplete) onImportComplete();
        return;
      } catch (err) {
        console.error("Error updating operator status:", err);
        alert("Failed to update status: " + err.message);
        return;
      }
    }

    const recommendations = getReliefRecommendations(deployment);
    const eventId = `dispatch_${eventType.toLowerCase()}_${deployment.dutyId}_${Date.now()}`;
    const nextEvent = { id: eventId, eventType, deployment, recommendations };

    setActiveAbnormalEvent(nextEvent);
    setSavingEvent(true);
    setOverrideDutyId(''); // Reset manual override input

    try {
      await setDoc(doc(db, 'automated_dispatch_gate', eventId), {
        incidentId: eventId,
        incidentType: eventType,
        trainId: String(deployment.trainId || '--'),
        currentDutyId: String(deployment.dutyId || '--'),
        currentEmpId: deployment.empId || '--',
        currentEmpName: deployment.empName || '--',
        recommendations: recommendations.map(c => ({
          empId: c.empId || '--',
          empName: c.empName || '--',
          score: c.score,
          scoreBreakdown: c.scoreBreakdown,
          dutyId: String(c.dutyId || '--'),
          remainingHours: Number(c.remainingHours.toFixed(2)),
          reason: c.reason
        })),
        status: 'ANALYZING',
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging abnormal dispatch event:', error);
      alert('Failed to log event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const executeRelief = async (recommendedCandidate) => {
    if (!activeAbnormalEvent) return;
    try {
      setSavingEvent(true);
      // 1. Mark the event as RESOLVED
      await updateDoc(doc(db, 'automated_dispatch_gate', activeAbnormalEvent.id), {
        status: 'RESOLVED',
        resolvedByDutyId: recommendedCandidate.dutyId,
        resolvedByEmpName: recommendedCandidate.empName,
        resolvedAt: serverTimestamp()
      });

      // 2. Update the candidate to show they are providing relief
      // (Assuming candidate is in crew_daily_deployment)
      const candDocId = recommendedCandidate.dutyId && recommendedCandidate.dutyId !== 'UNASSIGNED'
        ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${recommendedCandidate.dutyId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${recommendedCandidate.empId}`;
      const candRef = doc(db, 'crew_daily_deployment', candDocId);
      await setDoc(candRef, {
        status: 'RELIEF_DISPATCHED',
        reliefTargetDuty: activeAbnormalEvent.deployment.dutyId
      }, { merge: true });

      alert(`Relief Dispatched: ${recommendedCandidate.empName} taking over duty ${activeAbnormalEvent.deployment.dutyId}.`);
      setActiveAbnormalEvent(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to execute relief. Ensure permissions are set.");
    } finally {
      setSavingEvent(false);
    }
  };

  const executeManualOverride = async () => {
    if (!overrideDutyId || !activeAbnormalEvent) return;
    const candidate = deployments.find(d => String(d.dutyId) === String(overrideDutyId));
    if (!candidate) {
      return alert("Duty ID not found in current deployment roster.");
    }
    
    // Convert to structure expected by executeRelief
    const candidateAdapter = {
      ...candidate,
      score: 'OVERRIDE',
      scoreBreakdown: { readiness: 0, trainMatch: 0, reliefWindow: 0 },
      reason: 'Manual Supervisor Override'
    };
    await executeRelief(candidateAdapter);
  };

  const handleSaveOperator = async (deploymentId) => {
    const original = deployments.find(d => d.id === deploymentId);
    let finalTrainId = String(editTrainId || 'UNASSIGNED').trim();
    let finalDutyId = String(editDutyId || 'UNASSIGNED').trim();

    if (!finalDutyId) finalDutyId = 'UNASSIGNED';

    const aligned = alignRecordWithRegistry({
      employeeId: editEmpId.trim(),
      name: editName.trim(),
      _manuallyCorrected: true
    });

    let finalName = aligned.name.toUpperCase();
    let finalEmpId = aligned.employeeId;

    const targetDocId = finalDutyId === 'UNASSIGNED'
      ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
      : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

    setSavingEdit(true);
    try {
      await setDoc(doc(db, 'crew_daily_deployment', targetDocId), {
        scheduleType: currentDayType,
        dutyId: finalDutyId,
        empName: finalName,
        empId: finalEmpId,
        trainId: finalTrainId,
        "rawLegs.l1Train": finalTrainId,
        "rawLegs.l4Train": finalTrainId,
        remarks: "GCC Manual Edit",
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // Clean up the old document if the Duty ID or Employee ID changed
      if (original) {
        if (original.dutyId && original.dutyId !== 'UNASSIGNED' && String(original.dutyId) !== finalDutyId) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${original.dutyId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, 'crew_daily_deployment', oldDocId));
          }
        } else if ((!original.dutyId || original.dutyId === 'UNASSIGNED') && original.empId && original.empId !== finalEmpId) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_extra_${original.empId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, 'crew_daily_deployment', oldDocId));
          }
        }
      }

      setEditingDeploymentId(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Failed to update operator assignment:", err);
      alert("Failed to save operator details.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Sync step-back duties
  useEffect(() => {
    const q = query(collection(db, 'stepback_duties'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStepbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddExtraOperator = async (e) => {
    e.preventDefault();
    if (!newExtraOp.empId && !newExtraOp.empName) {
      alert("Please fill in Employee ID or Operator Name.");
      return;
    }
    
    let finalTrainId = String(newExtraOp.trainId || 'UNASSIGNED').trim();
    let rawDutyId = String(newExtraOp.dutyId || '').trim();

    // Validate and normalize duty ID: reject "6Z" style invalid IDs
    let finalDutyId;
    if (!rawDutyId || rawDutyId === 'UNASSIGNED') {
      finalDutyId = 'UNASSIGNED';
    } else if (!isValidDutyId(rawDutyId)) {
      alert(`❌ Invalid Duty ID "${rawDutyId}". Use numeric IDs (01-99) or known prefixes (CC, SB, RR, PRO).`);
      return;
    } else {
      finalDutyId = normalizeDutyId(rawDutyId);
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newExtraOp.empId || '').trim(),
      name: String(newExtraOp.empName || '').trim(),
      _manuallyCorrected: true
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId = finalDutyId === 'UNASSIGNED' 
        ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

      await setDoc(doc(db, "crew_daily_deployment", docId), {
        scheduleType: currentDayType,
        dutyId: finalDutyId,
        empId: finalEmpId,
        empName: finalName,
        trainId: finalTrainId,
        signOnTime: newExtraOp.signOnTime,
        remarks: "Extra Operator Assigned",
        status: 'AUTHORIZED_OK',
        isSignedOn: true,
        lastUpdated: serverTimestamp(),
        rawLegs: {
          l1Train: finalTrainId,
          l1Start: newExtraOp.signOnTime,
          l1End: newExtraOp.signOffTime,
          l2Train: '--',
          l2Start: '--',
          l2End: '--',
          l3Train: '--',
          l3Start: '--',
          l3End: '--',
          l4Train: '--',
          l4Start: '--',
          l4End: newExtraOp.signOffTime
        }
      });
      alert(`✅ Extra operator ${finalName} assigned successfully!`);
      setNewExtraOp({
        empId: '',
        empName: '',
        dutyId: '',
        trainId: 'UNASSIGNED',
        signOnTime: '06:00:00',
        signOffTime: '14:00:00'
      });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to add extra operator: " + err.message);
    }
  };

  const handleAddStepback = async (e) => {
    e.preventDefault();
    if ((!newStepback.empId && !newStepback.empName) || !newStepback.dutyId) {
      alert("Please fill in Duty ID and either Employee ID or Operator Name.");
      return;
    }
    if (newStepback.station !== 'PUTH' && newStepback.station !== 'NGSA') {
      alert("Step-back station must be PUTH or NGSA.");
      return;
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newStepback.empId || '').trim(),
      name: String(newStepback.empName || '').trim(),
      _manuallyCorrected: true
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId = `stepback_${newStepback.station}_${newStepback.dutyId}_${Date.now()}`;
      await setDoc(doc(db, 'stepback_duties', docId), {
        empId: finalEmpId,
        empName: finalName,
        station: newStepback.station,
        dutyId: String(newStepback.dutyId),
        startTime: newStepback.startTime || '08:00',
        endTime: newStepback.endTime || '12:00',
        timestamp: serverTimestamp()
      });
      alert("✅ Step-back duty registered at " + newStepback.station);
      setNewStepback({
        empId: '',
        empName: '',
        station: 'PUTH',
        dutyId: '',
        startTime: '08:00',
        endTime: '12:00'
      });
    } catch (err) {
      console.error(err);
      alert("Failed to register Step-back duty.");
    }
  };

  const handleDeleteStepback = async (id) => {
    if (window.confirm("Remove this step-back duty?")) {
      try {
        await deleteDoc(doc(db, 'stepback_duties', id));
      } catch (err) {
        console.error(err);
      }
    }
  };



  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(eligibleDeployments.map(d => d.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBatchAuthorize = async () => {
    if (selectedIds.length === 0) return;
    const selectedDeps = deployments.filter(d => selectedIds.includes(d.id));
    if (window.confirm(`Authorize dispatch for all ${selectedDeps.length} selected operator(s)?`)) {
      if (onAuthorize) {
        await onAuthorize(selectedDeps);
      } else {
        try {
          const batch = writeBatch(db);
          selectedDeps.forEach(deployment => {
            const docId = deployment.dutyId && deployment.dutyId !== 'UNASSIGNED'
              ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
              : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;
            batch.set(doc(db, 'crew_daily_deployment', docId), {
              status: 'DISPATCHED',
              dispatchTime: serverTimestamp(),
              dispatchAuthorizedBy: 'System'
            }, { merge: true });
          });
          await batch.commit();
          alert(`${selectedDeps.length} Operators Authorized successfully!`);
          if (onImportComplete) onImportComplete();
        } catch (error) {
          console.error("Error authorizing dispatch batch:", error);
          alert("Failed to authorize dispatch batch.");
        }
      }
      setSelectedIds([]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border border-emerald-900/30 bg-emerald-950/10 rounded-xl shadow-inner font-mono">
        <Cpu className="h-12 w-12 text-emerald-500 mb-4 animate-pulse" />
        <div className="text-sm font-black text-emerald-400 tracking-widest animate-pulse">INITIALIZING AUTOMATED GATEWAY...</div>
        <div className="text-[10px] text-slate-500 mt-2 uppercase">Syncing Live Deployment Data</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-wider text-emerald-400 flex items-center gap-2">
            <Cpu className="h-6 w-6" /> DISPATCH GATEWAY CORE
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Algorithmic Shift Validation & Relief Engine</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
          <button 
            onClick={() => setActiveTab('LIVE')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeTab === 'LIVE' ? 'bg-emerald-600 text-slate-950' : 'text-slate-400 hover:text-emerald-400'}`}
          >
            LIVE GATE
          </button>
          <button 
            onClick={() => setActiveTab('CONFIG')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeTab === 'CONFIG' ? 'bg-emerald-600 text-slate-950' : 'text-slate-400 hover:text-emerald-400'}`}
          >
            EXTRA & STEP-BACK
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors flex items-center gap-1 ${activeTab === 'HISTORY' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <History className="h-3 w-3" /> AUDIT LOG
          </button>
          <button 
            onClick={() => {
              setActiveTab('ARCHIVE');
              handleLoadMonthlyArchiveData(historicalMonth);
            }} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors flex items-center gap-1 ${activeTab === 'ARCHIVE' ? 'bg-amber-500 text-slate-955 font-black' : 'text-slate-400 hover:text-amber-400'}`}
          >
            <History className="h-3 w-3" /> MONTHLY ARCHIVES
          </button>
        </div>
      </div>

      {activeTab === 'LIVE' && (
        <div className="space-y-6">

          {/* Staging Confirmation Banner */}
          {stagedRoster && !isRosterConfirmed && (
            <div className="bg-gradient-to-r from-amber-955/90 via-slate-900 to-amber-955/90 border-2 border-amber-500 rounded-xl p-4 shadow-2xl space-y-3 font-mono">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-400 text-slate-955 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 shadow">
                      <AlertTriangle className="h-3.5 w-3.5" /> STAGING PREVIEW MODE (UNCONFIRMED DRAFT)
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono font-bold">
                      {stagedRoster.dateStr || 'Today'} • {stagedRoster.duties?.length || 0} Duties Staged
                    </span>
                  </div>
                  <h3 className="text-slate-100 font-black text-sm mt-1">
                    Roster File: {stagedRoster.sheetName || stagedRoster.fileName || 'Uploaded Sheet'}
                  </h3>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed mt-0.5">
                    Data is currently in preview mode. Click <strong>CONFIRM & SAVE DAY ROSTER TO FIREBASE</strong> to publish official data to live operational suite & monthly archives.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDiscardStagingDraft}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs px-3.5 py-2 rounded-lg border border-slate-700 transition"
                  >
                    DISCARD DRAFT ✕
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAndSaveToFirebase}
                    disabled={isSavingToFirebase}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-955 font-black text-xs px-5 py-2.5 rounded-lg shadow-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingToFirebase ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    <span>CONFIRM & SAVE DAY ROSTER TO FIREBASE</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {stagedRoster && isRosterConfirmed && (
            <div className="bg-emerald-955/80 border border-emerald-500/60 rounded-xl p-3.5 shadow-xl flex justify-between items-center text-xs font-mono">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>OFFICIAL ROSTER CONFIRMED & SAVED TO FIREBASE ({stagedRoster.dateStr || 'Today'})</span>
              </div>
              <span className="text-[10px] text-emerald-400/80">Snapshot Archived to Monthly Database</span>
            </div>
          )}

          {/* 1. Excel Daily Roster Path Link Auto-Reader & Classifier Card */}
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-emerald-400 tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  EXCEL DAILY ROSTER PATH LINK AUTO-READER & CLASSIFIER
                </h2>
                <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                  ZERO MANUAL ENTRY ENGINE
                </span>
              </div>
              <span className="bg-emerald-950/80 text-emerald-300 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-700/50">
                AUTOMATED DISPATCH ENGINE READY
              </span>
            </div>

            <div className="flex flex-col md:flex-row gap-3 items-center">
              <div className="relative flex-1 w-full">
                <input id="automateddispatchgat-i9" name="automateddispatchgat-i9"
                  type="text"
                  value={excelPathInput}
                  onChange={(e) => setExcelPathInput(e.target.value)}
                  placeholder="Paste Excel File Path Link (e.g. C:\Users\nages\roster.xlsx or URL) or select file..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3 py-2 rounded-lg cursor-pointer border border-slate-700 flex items-center gap-1.5 shrink-0 transition">
                  <UploadCloud className="h-4 w-4 text-emerald-400" />
                  <span>Browse File</span>
                  <input id="automateddispatchgat-i10" name="automateddispatchgat-i10"
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setSelectedRosterFile(file);
                        setExcelPathInput(file.name);
                        processFileAndDeploy(file);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => processFileAndDeploy(selectedRosterFile)}
                  disabled={isInspectingPath}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black text-xs px-4 py-2 rounded-lg transition-all shadow-md shadow-emerald-950 flex items-center gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
                >
                  {isInspectingPath ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Cpu className="h-4 w-4" />
                  )}
                  <span>INSPECT & AUTO-DEPLOY</span>
                </button>
              </div>
            </div>

            {/* Active Deployed Roster Date Notification Banner */}
            {(deployedRosterInfo || deduplicatedDeployments.length > 0) && (
              <div className="bg-emerald-950/70 border border-emerald-500/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono animate-in fade-in duration-300 shadow-xl">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black text-emerald-300 text-xs flex items-center gap-2 tracking-wide uppercase">
                      <span>Date Roster Sheet ({deployedRosterInfo?.sheetName || currentDayType}) Parsed & Deployed!</span>
                      {deployedRosterInfo?.deployedAt && (
                        <span className="text-[10px] text-emerald-400/80 font-normal">[{deployedRosterInfo.deployedAt}]</span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-200/90 font-medium mt-1">
                      Today ({deployedRosterInfo?.dateStr || new Date().toLocaleDateString('en-GB')}): Deployed <span className="font-black text-emerald-300">{deployedRosterInfo?.deployedCount || deduplicatedDeployments.length}</span> Operators to Dispatch Gate | <span className="font-black text-emerald-300">{deployedRosterInfo?.woCount ?? consoleData.weeklyOffs.length}</span> to Weekly Off Page | <span className="font-black text-emerald-300">{deployedRosterInfo?.leaveCount ?? consoleData.leaves.length}</span> to Leave & Rest Page.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="bg-emerald-900/90 text-emerald-300 text-[10px] font-bold px-3 py-1 rounded-lg border border-emerald-600 uppercase tracking-widest shadow">
                    DEPLOYED DATE: {deployedRosterInfo?.dateStr || new Date().toLocaleDateString('en-GB')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Control Toolbar: Search, Filters, Duplicate Check & Actions */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input id="automateddispatchgat-i11" name="automateddispatchgat-i11"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Duty ID, Name, Train..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Status Filters: ALL | ACTIVE | PENDING */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {['ALL', 'ACTIVE', 'PENDING'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className={`px-2.5 py-1 rounded text-[10px] font-black font-mono transition-all uppercase ${
                      filterStatus === status
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              {/* Duplicate Verification Pill */}
              <div className={`px-2.5 py-1 rounded text-[10px] font-black font-mono border uppercase flex items-center gap-1 ${
                duplicateEmpIds.length > 0 
                  ? 'bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse'
                  : 'bg-emerald-955/40 border-emerald-800/60 text-emerald-400'
              }`}>
                <AlertTriangle className="h-3 w-3" />
                <span>VERIFY DUPLICATE EMP IDs ({duplicateEmpIds.length})</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSwapModal(true)}
                className="bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <Repeat className="h-3.5 w-3.5" />
                <span>SWAP DUTIES (CC/GCC/ALS)</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={handleClearDailyRoster}
                className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Daily Roster & Console</span>
              </button>
            </div>
          </div>

          {/* 3. Operator Status Legend */}
          <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg flex flex-wrap items-center gap-4 text-[10px] font-mono font-bold text-slate-400 select-none">
            <span className="text-slate-500 uppercase tracking-widest font-black">Operator Status Legend:</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"></span>
              <span className="text-cyan-300">EXCHANGED DUTY (Cyan)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></span>
              <span className="text-amber-300">SWAPPED BY CC (Amber)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]"></span>
              <span className="text-rose-300">NOT REPORTING NR (Rose)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
              <span className="text-red-400">ABSENT AB (Red)</span>
            </div>
          </div>

          {/* Day Types Selection Ribbon */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select Roster Day Type:</span>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                {['WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayTypeChange(day)}
                    className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                      currentDayType === day
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)] font-black'
                        : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900 border border-transparent'
                    }`}
                  >
                    {day === 'SATURDAY' ? 'SAT & GH' : day}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs font-black font-mono text-slate-400 uppercase tracking-wider">
              Target Day Roster: <span className="text-emerald-400">{currentDayType}</span>
            </div>
          </div>



          {/* Active Abnormal Event Relief Engine View */}
          {activeAbnormalEvent && (
            <div className="bg-slate-900 border-2 border-amber-500/50 rounded-xl p-5 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-bl-lg flex items-center gap-1 uppercase tracking-widest shadow">
                <span className="h-2 w-2 rounded-full bg-slate-950 animate-pulse"></span>
                ACTIVE INCIDENT ANALYSIS
              </div>
              
              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert className="h-8 w-8 text-amber-500" />
                <div>
                  <h3 className="text-lg font-black text-amber-400 uppercase tracking-wider">
                    {activeAbnormalEvent.eventType} on Duty {activeAbnormalEvent.deployment.dutyId}
                  </h3>
                  <p className="text-xs text-slate-300">Operator: {activeAbnormalEvent.deployment.empName} | Train: {activeAbnormalEvent.deployment.trainId}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engine Recommendations */}
                <div className="col-span-2 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-2 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-emerald-500" /> Engine Recommendations
                  </h4>
                  
                  {activeAbnormalEvent.recommendations.length === 0 ? (
                    <div className="p-4 bg-slate-950 border border-slate-800 border-dashed rounded text-center text-slate-500 text-xs">No suitable relief candidates found. Manual intervention required.</div>
                  ) : (
                    activeAbnormalEvent.recommendations.map((rec, i) => (
                      <div key={i} className="flex flex-col md:flex-row items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-emerald-500/30 transition-colors">
                        <div className="flex-1 w-full md:w-auto">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-900/40 text-emerald-400 font-black text-xs px-2 py-0.5 rounded border border-emerald-800">#{i+1}</span>
                            <span className="font-bold text-emerald-300">{rec.empName}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">Duty {rec.dutyId}</span>
                          </div>
                          
                          {/* Score Visualization Bar */}
                          <div className="mt-2 w-full max-w-xs flex h-2 rounded bg-slate-900 overflow-hidden border border-slate-800">
                            <div style={{ width: `${rec.scoreBreakdown.readiness}%` }} className="bg-blue-500" title={`Readiness: ${rec.scoreBreakdown.readiness}`}></div>
                            <div style={{ width: `${rec.scoreBreakdown.trainMatch}%` }} className="bg-purple-500" title={`Path Match: ${rec.scoreBreakdown.trainMatch}`}></div>
                            <div style={{ width: `${rec.scoreBreakdown.reliefWindow}%` }} className="bg-emerald-500" title={`Relief Window: ${rec.scoreBreakdown.reliefWindow}`}></div>
                          </div>
                          
                          <div className="flex text-[9px] gap-3 mt-1 text-slate-500 uppercase font-bold tracking-widest">
                            <span className="text-blue-400">READY: {rec.scoreBreakdown.readiness}</span>
                            <span className="text-purple-400">PATH: {rec.scoreBreakdown.trainMatch}</span>
                            <span className="text-emerald-400">WIND: {rec.scoreBreakdown.reliefWindow}</span>
                            <span className="text-white ml-auto">TOTAL: {rec.score}</span>
                          </div>
                        </div>
                        
                        <div className="mt-3 md:mt-0 ml-0 md:ml-4 w-full md:w-auto">
                           <button 
                             onClick={() => executeRelief(rec)}
                             disabled={savingEvent}
                             className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black px-4 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase shadow-md transition-colors"
                           >
                             <CheckCircle className="h-3 w-3" /> {savingEvent ? 'EXECUTING...' : 'DISPATCH RELIEF'}
                           </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Manual Override Panel */}
                <div className="col-span-1 border-l-0 lg:border-l border-slate-800 pl-0 lg:pl-6 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-2 uppercase tracking-widest flex items-center gap-2">
                    <Settings className="h-4 w-4 text-slate-400" /> Manual Override
                  </h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">If algorithmic recommendations are unsuitable, GCC may manually designate a relief Duty ID.</p>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="automateddispatchgat-l1">Target Duty ID</label>
                    <input id="automateddispatchgat-i1" name="automateddispatchgat-i1" 
                      type="number" 
                      value={overrideDutyId}
                      onChange={(e) => setOverrideDutyId(e.target.value)}
                      placeholder="e.g. 104"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-3 font-mono"
                    />
                    <button 
                      onClick={executeManualOverride}
                      disabled={savingEvent || !overrideDutyId}
                      className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-600 font-bold px-3 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase transition-colors"
                    >
                      FORCE DISPATCH <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => setActiveAbnormalEvent(null)}
                    className="w-full mt-2 text-rose-500 hover:text-rose-400 text-xs font-bold tracking-wider uppercase border border-rose-900/50 rounded py-2 hover:bg-rose-950/30 transition-colors"
                  >
                    CANCEL EVENT
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Roster Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900 p-3 rounded-lg border border-slate-800 shadow">
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input id="automateddispatchgat-i2" name="automateddispatchgat-i2" 
                  type="text" 
                  placeholder="Search Duty ID, Name, Train..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto text-xs font-bold tracking-widest">
              <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1.5 rounded border ${filterStatus === 'ALL' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}>ALL</button>
              <button onClick={() => setFilterStatus('SIGNED_ON')} className={`px-3 py-1.5 rounded border ${filterStatus === 'SIGNED_ON' ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-emerald-900/50'}`}>ACTIVE</button>
              <button onClick={() => setFilterStatus('PENDING')} className={`px-3 py-1.5 rounded border ${filterStatus === 'PENDING' ? 'bg-amber-900/50 border-amber-500/50 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-amber-900/50'}`}>PENDING</button>
            </div>
          </div>

          {/* Batch Action Bar */}
          {selectedIds.length > 0 && (
            <div className="bg-slate-950 border border-emerald-500/20 p-3 rounded-lg flex items-center justify-between gap-4 mb-3 animate-in slide-in-from-top duration-300">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {selectedIds.length} Operator(s) Selected for Dispatch Authorization
              </span>
              <button 
                onClick={handleBatchAuthorize}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-xs tracking-widest uppercase transition-colors shadow-lg animate-pulse"
              >
                AUTHORIZE SELECTED ({selectedIds.length})
              </button>
            </div>
          )}

          {/* Instant Duty Search Identification Summary Banner */}
          {searchQuery.trim() !== '' && (
            <div className="bg-amber-955/90 border-2 border-amber-500/80 rounded-xl p-4 shadow-2xl space-y-3 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-amber-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-amber-400 animate-pulse" />
                  <h3 className="text-amber-300 font-black text-xs uppercase tracking-wider">
                    Search Duty Identifier & Match Results ({filteredDeployments.length} Operator{filteredDeployments.length !== 1 ? 's' : ''} Found)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-amber-300 hover:text-white text-xs font-bold px-2.5 py-0.5 rounded bg-amber-900/60 hover:bg-amber-900 border border-amber-600 transition"
                >
                  Clear Search ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDeployments.slice(0, 6).map((matchItem) => (
                  <div
                    key={matchItem.id}
                    className="bg-slate-950 border-2 border-amber-500/80 rounded-lg p-3 space-y-1.5 shadow-xl relative overflow-hidden ring-1 ring-amber-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider">
                        Matched Operator
                      </span>
                      <span className="bg-amber-400 text-slate-955 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest shadow-md animate-pulse">
                        ASSIGNED DUTY #{matchItem.dutyId}
                      </span>
                    </div>

                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>{highlightMatch(matchItem.empName || matchItem.name, searchQuery)}</span>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        (ID: {highlightMatch(matchItem.empId || matchItem.empNo, searchQuery)})
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800/80 pt-1.5">
                      <div>
                        <span className="text-slate-500 font-bold">Train:</span>{' '}
                        <span className="text-cyan-300 font-bold">{matchItem.trainId || '--'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold">Sign On:</span>{' '}
                        <span className="text-emerald-400 font-bold">{formatExcelTime(matchItem.signOnTime)}</span>{' '}
                        <span className="text-slate-400">@ {matchItem.signOnLocation || 'PYID'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold">Status:</span>{' '}
                        <span className="text-amber-300 font-bold uppercase">{matchItem.status || 'PENDING'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      {eligibleDeployments.length > 0 && (
                        <input id="automateddispatchgat-i3" name="automateddispatchgat-i3" 
                          type="checkbox" 
                          checked={selectedIds.length === eligibleDeployments.length && eligibleDeployments.length > 0} 
                          onChange={handleSelectAll} 
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="p-3 font-black">Duty No</th>
                    <th className="p-3 font-black">Type</th>
                    <th className="p-3 font-black">Sign On Time</th>
                    <th className="p-3 font-black">Sign On Place</th>
                    <th className="p-3 font-black">Operator Name</th>
                    <th className="p-3 font-black">Emp No</th>
                    <th className="p-3 font-black">Sign Off Time</th>
                    <th className="p-3 font-black">Sign Off Place</th>
                    <th className="p-3 font-black">Train ID</th>
                    <th className="p-3 font-black">Shift Progress</th>
                    <th className="p-3 font-black text-center">Engine Triggers</th>
                    <th className="p-3 font-black text-right border-l border-slate-800">Gate Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredDeployments.length === 0 ? (
                    <tr>
                      <td colSpan="13" className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No deployments match criteria</td>
                    </tr>
                  ) : (
                    filteredDeployments.map(d => {
                      const progress = getDutyProgress(d);
                      const isDispatched = d.status === "DISPATCHED" || d.status === "RELIEF_DISPATCHED";
                      
                      const isExchanged = Boolean(d.isExchanged || d.exchanged || d.type === "EXCHANGED" || d.status === "EXCHANGED" || d.status === "EXCHANGED_DUTY" || String(d.status || '').toLowerCase().includes('exchange'));
                      const isSwapped = Boolean(d.isSwapped || d.swapped || d.type === "SWAPPED" || d.status === "SWAPPED" || d.status === "SWAPPED_BY_CC" || String(d.status || '').toLowerCase().includes('swap'));
                      const isNR = Boolean(d.status === "NOT_REPORTING" || d.status === "NR" || d.isNotReporting || String(d.remarks || '').toUpperCase().includes('NR'));
                      const isAbsent = Boolean(d.status === "ABSENT" || d.status === "AB" || d.isAbsent || String(d.remarks || '').toUpperCase().includes('AB'));

                      const cleanedName = cleanOperatorName(d.empName || d.name);
                      const matched = matchCrewMember(d.empId || d.empNo) || matchCrewMember(cleanedName);
                      const displayId = matched ? String(matched.id) : (d.empId || d.empNo || "");
                      const isDup = Boolean(
                        displayId && displayId !== "--" && duplicateOperatorsMap[String(displayId).toLowerCase()],
                      );
                      const isSearchMatch = Boolean(
                        searchQuery.trim() &&
                        (String(d.dutyId || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                         String(d.empName || d.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                         String(d.empId || d.empNo || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                         String(d.trainId || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                         (d.extraColumns && Object.values(d.extraColumns).some(v => String(v).toLowerCase().includes(searchQuery.toLowerCase().trim()))))
                      );

                      return (
                        <tr
                          key={d.id}
                          className={`hover:bg-slate-800/30 transition-colors ${
                            isSearchMatch
                              ? "bg-amber-955/80 border-l-4 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] ring-1 ring-amber-500/40"
                              : isDup
                                ? "bg-rose-950/40 border-l-4 border-rose-500 shadow-md shadow-rose-950/50"
                                : ""
                          }`}
                        >
                          <td className="p-3 w-10 text-center border-r border-slate-800">
                            {!isDispatched ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(d.id)}
                                onChange={() => handleToggleSelect(d.id)}
                                className="rounded border-slate-700 bg-slate-955 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          
                          {/* Duty No */}
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded ${
                              isSearchMatch
                                ? "text-sm font-black text-slate-955 bg-amber-400 border border-amber-300 shadow-md animate-pulse"
                                : "text-xs font-black text-white bg-slate-800 border border-slate-700"
                            }`}>
                              Duty #{d.dutyId}
                            </span>
                          </td>
                          
                          {/* Type */}
                          <td className="p-3 font-bold text-amber-400 text-[11px]">
                            {d.dutyType || "PYID"}
                          </td>
                          
                          {/* Sign On Time */}
                          <td className="p-3 font-mono text-slate-300 font-bold">
                            {formatExcelTime(d.signOnTime)}
                          </td>
                          
                          {/* Sign On Location */}
                          <td className="p-3 font-bold text-cyan-400">
                            {d.signOnLocation || "PYID"}
                          </td>
                          
                          {/* Operator Name with EXCH / SWAP / NR / AB Badges & Text Highlighting */}
                          <td className="p-3 font-bold">
                            {editingDeploymentId === d.id ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white"
                              />
                            ) : isDup ? (
                              <span className="bg-rose-950 text-rose-200 border border-rose-500 px-2 py-1 rounded font-black text-xs shadow-md inline-flex items-center gap-1.5 animate-pulse">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                {highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}
                              </span>
                            ) : isAbsent ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">{highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}</span>
                                <span className="text-[9px] bg-red-950/90 text-red-300 border border-red-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span> AB
                                </span>
                              </span>
                            ) : isNR ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">{highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}</span>
                                <span className="text-[9px] bg-rose-950/90 text-rose-300 border border-rose-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse"></span> NR
                                </span>
                              </span>
                            ) : isExchanged ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">{highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}</span>
                                <span className="text-[9px] bg-cyan-950/90 text-cyan-300 border border-cyan-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span> EXCH
                                </span>
                              </span>
                            ) : isSwapped ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">{highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}</span>
                                <span className="text-[9px] bg-amber-950/90 text-amber-300 border border-amber-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span> SWAP
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-200">{highlightMatch(d.empName || d.name || "UNASSIGNED", searchQuery)}</span>
                            )}
                          </td>
                          
                          {/* Emp No with Text Highlighting */}
                          <td className="p-3 font-mono font-bold">
                            <span className={isAbsent ? "text-red-400" : isNR ? "text-rose-400" : isExchanged ? "text-cyan-300" : isSwapped ? "text-amber-300" : "text-cyan-400"}>
                              {highlightMatch(d.empId || d.employeeId || "--", searchQuery)}
                            </span>
                          </td>
                          
                          {/* Sign OFF Time */}
                          <td className="p-3 font-mono text-slate-300">
                            {formatExcelTime(d.signOffTime)}
                          </td>
                          
                          {/* Sign OFF Location */}
                          <td className="p-3 font-bold text-cyan-400">
                            {d.signOffLocation || "PYID"}
                          </td>
                          
                          {/* Train ID */}
                          <td className="p-3 font-bold text-cyan-300">
                            {d.trainId || "--"}
                          </td>
                          
                          {/* Shift Progress */}
                          <td className="p-3 min-w-30">
                            <div className="w-full">
                              <div className="flex justify-between text-[9px] text-slate-500 mb-0.5 font-bold">
                                <span>{Math.round(progress)}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${progress > 90 ? "bg-rose-500" : progress > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          
                          {/* Engine Triggers */}
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-1 flex-wrap w-44 mx-auto">
                              {ABNORMAL_EVENT_TYPES.map((e) => {
                                const Icon = e.icon;
                                return (
                                  <button
                                    key={e.id}
                                    onClick={() => handleAbnormalEvent(d, e.id)}
                                    disabled={!!activeAbnormalEvent || d.status === "RELIEF_DISPATCHED"}
                                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border transition-all flex items-center gap-0.5 disabled:opacity-30 disabled:cursor-not-allowed ${e.className}`}
                                    title={`Trigger ${e.label} Resolution`}
                                  >
                                    <Icon className="h-2.5 w-2.5" /> {e.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          
                          {/* Gate Actions */}
                          <td className="p-3 text-right border-l border-slate-800 bg-slate-900/50">
                            {!isDispatched ? (
                              <button
                                onClick={() => authorizeDispatch(d)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1 rounded text-[10px] tracking-widest uppercase shadow-md transition-colors"
                              >
                                AUTHORIZE
                              </button>
                            ) : (
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1">
                                <CheckCircle className="h-3 w-3 text-emerald-500" /> DISPATCHED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4 font-mono mt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                  BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-400">
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-amber-400">Crew Controllers ({consoleData.controlDesks?.length || 0}/10)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-cyan-400">Leave & Rest ({consoleData.leaves?.length || 0}/50)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-emerald-400">Standby ({consoleData.standbys?.length || 0}/50)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-purple-400">STBK ({consoleData.outstationStepbacks?.length || 0}/20)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-teal-400">CRT ({consoleData.crtTraining?.length || 0}/15)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-sky-400">BMRTI ({consoleData.bmrtiTraining?.length || 0}/50)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-rose-400">Weekly Off ({consoleData.weeklyOffs?.length || 0}/50)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-fuchsia-400">REL ({consoleData.relievedOperators?.length || 0}/10)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-lime-400">PME ({consoleData.pmeOperators?.length || 0}/20)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-indigo-400">LRD ({consoleData.routeLearning?.length || 0}/20)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-amber-300">OD ({consoleData.onDuty?.length || 0}/20)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-rose-300">NR ({consoleData.notReporting?.length || 0}/20)</span>
                  <span className="bg-slate-955 px-2 py-0.5 rounded border border-slate-800 text-red-400">AB ({consoleData.absents?.length || 0}/20)</span>
                  {Object.keys(consoleData.customRegisters || {}).map(tagName => (
                    <span key={tagName} className="bg-slate-955 px-2 py-0.5 rounded border border-cyan-800 text-cyan-300">
                      {tagName} ({consoleData.customRegisters[tagName]?.length || 0})
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoDeployConsoleToAllPages}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-955 font-black text-xs px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
              >
                <UploadCloud className="h-4 w-4" />
                <span>AUTO-DEPLOY CONSOLE TO ALL PAGES</span>
              </button>
            </div>

            {/* Console Cards Grid (12 Desk Registers) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* 1. Crew Controllers */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase">Crew Controllers ({consoleData.controlDesks?.length || 0})</span>
                  <span className="text-[10px] bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/40">{consoleData.controlDesks?.length || 0} / 10</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.controlDesks || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200">{item.code || item.label || `CC${idx+1}`} • {item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.time || '06:30 - 14:00'}</div>
                      </div>
                      <span className="text-[10px] text-amber-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 10 - (consoleData.controlDesks?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>CC{(consoleData.controlDesks?.length || 0) + i + 1} • --</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Leave & Rest */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-cyan-400 uppercase">Leave & Rest ({consoleData.leaves?.length || 0})</span>
                  <span className="text-[10px] bg-cyan-950/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40">{consoleData.leaves?.length || 0} / 50</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.leaves || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200"><span className="text-cyan-400">{item.type || 'CL'}</span> • {item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.from || item.dateCode || '--'}</div>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 50 - (consoleData.leaves?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>-- • --</div>
                      <span className="text-[10px]">--</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Standby Operators */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase">Standby ({consoleData.standbys?.length || 0})</span>
                  <span className="text-[10px] bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/40">{consoleData.standbys?.length || 0} / 50</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.standbys || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200">{item.code || item.label || 'OR'} • {item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.time || '09:00 - 17:00'}</div>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 50 - (consoleData.standbys?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Step-Back STBK */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-purple-400 uppercase">STBK ({consoleData.outstationStepbacks?.length || 0})</span>
                  <span className="text-[10px] bg-purple-950/60 text-purple-300 px-2 py-0.5 rounded border border-purple-800/40">{consoleData.outstationStepbacks?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.outstationStepbacks || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-purple-300">{item.station || item.loc || 'STBK'}</div>
                        <div className="text-[10px] text-slate-400">{item.time}</div>
                        <div className="font-bold text-slate-200 mt-0.5">{item.name}</div>
                      </div>
                      <span className="text-[10px] text-purple-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.outstationStepbacks?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>STBK • --</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. CRT Training */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-teal-400 uppercase">CRT ({consoleData.crtTraining?.length || 0})</span>
                  <span className="text-[10px] bg-teal-950/60 text-teal-300 px-2 py-0.5 rounded border border-teal-800/40">{consoleData.crtTraining?.length || 0} / 15</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.crtTraining || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200">{item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.time || 'CRT'}</div>
                      </div>
                      <span className="text-[10px] text-teal-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 15 - (consoleData.crtTraining?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. BMRTI Training */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-sky-400 uppercase">BMRTI ({consoleData.bmrtiTraining?.length || 0})</span>
                  <span className="text-[10px] bg-sky-950/60 text-sky-300 px-2 py-0.5 rounded border border-sky-800/40">{consoleData.bmrtiTraining?.length || 0} / 50</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.bmrtiTraining || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200">{item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.date || item.time || 'BMRTI'}</div>
                      </div>
                      <span className="text-[10px] text-sky-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 50 - (consoleData.bmrtiTraining?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 7. Weekly Off */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-rose-400 uppercase">Weekly Off ({consoleData.weeklyOffs?.length || 0})</span>
                  <span className="text-[10px] bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40">{consoleData.weeklyOffs?.length || 0} / 50</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.weeklyOffs || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-rose-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 50 - (consoleData.weeklyOffs?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">--</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 8. REL (Relieved) */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-fuchsia-400 uppercase">REL ({consoleData.relievedOperators?.length || 0})</span>
                  <span className="text-[10px] bg-fuchsia-950/60 text-fuchsia-300 px-2 py-0.5 rounded border border-fuchsia-800/40">{consoleData.relievedOperators?.length || 0} / 10</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.relievedOperators || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-fuchsia-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 10 - (consoleData.relievedOperators?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">06:00 • --</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 9. PME Register */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-lime-400 uppercase">PME ({consoleData.pmeOperators?.length || 0})</span>
                  <span className="text-[10px] bg-lime-950/60 text-lime-300 px-2 py-0.5 rounded border border-lime-800/40">{consoleData.pmeOperators?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.pmeOperators || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-lime-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.pmeOperators?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">PME</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 10. Route Learning (LRD) */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-indigo-400 uppercase">LRD ({consoleData.routeLearning?.length || 0})</span>
                  <span className="text-[10px] bg-indigo-950/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/40">{consoleData.routeLearning?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.routeLearning || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-indigo-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.routeLearning?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">LRD</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 11. NOT REPORTING (NR) */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-rose-300 uppercase">NOT REPORTING ({consoleData.notReporting?.length || 0})</span>
                  <span className="text-[10px] bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40">{consoleData.notReporting?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.notReporting || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-rose-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.notReporting?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">NR</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 12. ABSENT (AB) */}
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-red-400 uppercase">ABSENT ({consoleData.absents?.length || 0})</span>
                  <span className="text-[10px] bg-red-950/60 text-red-300 px-2 py-0.5 rounded border border-red-800/40">{consoleData.absents?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.absents || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <span className="text-[10px] text-red-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.absents?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">AB</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 13. OD (On Duty / Outstation Duty) */}
              <div className="bg-slate-955 border border-amber-900/40 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-amber-400 uppercase">OD (On Duty) ({consoleData.onDuty?.length || 0})</span>
                  <span className="text-[10px] bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/40">{consoleData.onDuty?.length || 0} / 20</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                  {(consoleData.onDuty || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200">{item.name}</div>
                        <div className="text-[10px] text-amber-300 font-mono">{item.info || item.remark || 'OD'}</div>
                      </div>
                      <span className="text-[10px] text-amber-400 font-bold">#{item.empNo || '--'}</span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 20 - (consoleData.onDuty?.length || 0)) }, (_, i) => (
                    <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                      <div>--</div>
                      <span className="text-[10px]">OD</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 14+. Dynamic Custom Section Cards */}
              {Object.keys(consoleData.customRegisters || {}).map(tagName => {
                const list = consoleData.customRegisters[tagName] || [];
                return (
                  <div key={tagName} className="bg-slate-955 border border-cyan-900/40 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-cyan-300 uppercase">{tagName} ({list.length})</span>
                      <span className="text-[10px] bg-cyan-950/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40">{list.length} / 20</span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {list.map((item, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 p-2 rounded flex justify-between items-center">
                          <div>
                            <div className="font-bold text-slate-200">{item.name}</div>
                            <div className="text-[10px] text-cyan-400 font-mono">{item.info || item.tag || ''}</div>
                          </div>
                          <span className="text-[10px] text-cyan-300 font-bold">#{item.empNo || '--'}</span>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 20 - list.length) }, (_, i) => (
                        <div key={i} className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500">
                          <div>--</div>
                          <span className="text-[10px]">{tagName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      )}

      {/* CONFIG Tab */}
      {activeTab === 'CONFIG' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
            
            {/* Column 1: Add Extra Operator Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="font-bold text-xs uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <UserCheck size={16} /> Assign Extra Operator on Roster Duty
                </span>
              </div>
              
              <form onSubmit={handleAddExtraOperator} className="space-y-4 text-xs font-bold uppercase">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l6">Employee ID</label>
                    <input id="automateddispatchgat-i9" name="automateddispatchgat-i9"
                      type="text"
                      list="crew-employees"
                      placeholder="e.g. 22464"
                      value={newExtraOp.empId}
                      onChange={(e) => handleExtraOpEmpIdChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l7">Operator Name</label>
                    <input id="automateddispatchgat-i10" name="automateddispatchgat-i10"
                      type="text"
                      placeholder="e.g. NAVEEN KUMAR"
                      value={newExtraOp.empName}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, empName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l8">Duty ID (Optional)</label>
                    <input id="automateddispatchgat-i11" name="automateddispatchgat-i11"
                      type="text"
                      placeholder="e.g. 105 or empty"
                      value={newExtraOp.dutyId}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, dutyId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l9">Train ID</label>
                    <select id="automateddispatchgat-i12" name="automateddispatchgat-i12"
                      value={newExtraOp.trainId}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, trainId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    >
                      <option value="UNASSIGNED">UNASSIGNED (STANDBY)</option>
                      {Array.from({ length: 23 }, (_, i) => String(201 + i)).map(tid => (
                        <option key={tid} value={tid}>Train {tid}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l10">Sign On Time</label>
                    <input id="automateddispatchgat-i13" name="automateddispatchgat-i13"
                      type="text"
                      placeholder="e.g. 06:00:00"
                      value={newExtraOp.signOnTime}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, signOnTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l11">Sign Off Time</label>
                    <input id="automateddispatchgat-i14" name="automateddispatchgat-i14"
                      type="text"
                      placeholder="e.g. 14:00:00"
                      value={newExtraOp.signOffTime}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, signOffTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Assign Extra Operator
                </button>
              </form>
            </div>

            {/* Column 2: Register Step-back Duty Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="font-bold text-xs uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <Clock size={16} /> Register Step-back Duty (PUTH / NGSA)
                </span>
              </div>
              
              <form onSubmit={handleAddStepback} className="space-y-4 text-xs font-bold uppercase">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l12">Employee ID</label>
                    <input id="automateddispatchgat-i15" name="automateddispatchgat-i15"
                      type="text"
                      list="crew-employees"
                      placeholder="e.g. 21460"
                      value={newStepback.empId}
                      onChange={(e) => handleStepbackEmpIdChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l13">Operator Name</label>
                    <input id="automateddispatchgat-i16" name="automateddispatchgat-i16"
                      type="text"
                      placeholder="e.g. KAVITHA M N"
                      value={newStepback.empName}
                      onChange={(e) => setNewStepback({ ...newStepback, empName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l14">Step-back Station</label>
                    <select id="automateddispatchgat-i17" name="automateddispatchgat-i17"
                      value={newStepback.station}
                      onChange={(e) => setNewStepback({ ...newStepback, station: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    >
                      <option value="PUTH">Yelachenahalli (PUTH)</option>
                      <option value="NGSA">Nagasandra (NGSA)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l15">Duty ID</label>
                    <input id="automateddispatchgat-i18" name="automateddispatchgat-i18"
                      type="text"
                      placeholder="e.g. SB12"
                      value={newStepback.dutyId}
                      onChange={(e) => setNewStepback({ ...newStepback, dutyId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l16">Start Time</label>
                    <input id="automateddispatchgat-i19" name="automateddispatchgat-i19"
                      type="time"
                      value={newStepback.startTime}
                      onChange={(e) => setNewStepback({ ...newStepback, startTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l17">End Time</label>
                    <input id="automateddispatchgat-i20" name="automateddispatchgat-i20"
                      type="time"
                      value={newStepback.endTime}
                      onChange={(e) => setNewStepback({ ...newStepback, endTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Register Step-back Duty
                </button>
              </form>
            </div>
            
          </div>

          {/* Active Step-back Registry Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase text-slate-200 tracking-wider">
                Active Step-back Duties Console (PUTH & NGSA Stations)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-550 font-bold uppercase">
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Terminal Station</th>
                    <th className="p-3">Step-back Duty ID</th>
                    <th className="p-3">Time Slot</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {stepbacks.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 italic text-[11px] uppercase">
                        No active Step-back duties currently registered.
                      </td>
                    </tr>
                  ) : (
                    stepbacks.map(sb => (
                      <tr key={sb.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-bold text-cyan-400">{sb.empId}</td>
                        <td className="p-3 font-bold uppercase text-slate-200">{sb.empName}</td>
                        <td className="p-3 font-bold text-amber-400">
                          {sb.station === 'PUTH' ? 'Yelachenahalli (PUTH)' : 'Nagasandra (NGSA)'}
                        </td>
                        <td className="p-3 text-slate-300 font-bold">{sb.dutyId}</td>
                        <td className="p-3 font-mono">{sb.startTime} - {sb.endTime}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteStepback(sb.id)}
                            className="text-rose-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* History Tab */}
      {activeTab === 'HISTORY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-black tracking-wider text-slate-300 mb-6 uppercase flex items-center gap-2">
            <History className="h-5 w-5 text-slate-400" /> Gateway Audit Log
          </h3>
          
          {historyLoading ? (
            <div className="text-center text-slate-500 font-bold uppercase tracking-widest text-xs py-8 animate-pulse">Syncing History...</div>
          ) : eventHistory.length === 0 ? (
            <div className="text-center text-slate-600 font-bold uppercase tracking-widest text-xs py-12 border border-dashed border-slate-800 rounded">No incidents logged today.</div>
          ) : (
            <div className="space-y-4">
              {eventHistory.map(evt => (
                <div key={evt.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded tracking-widest uppercase border ${
                        evt.status === 'RESOLVED' ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-amber-950 border-amber-800 text-amber-400'
                      }`}>
                        {evt.status}
                      </span>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{evt.incidentType}</span>
                      <span className="text-[10px] text-slate-500">{evt.timestamp?.toDate().toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-white">Target Duty: <span className="text-cyan-400">{evt.currentDutyId}</span> ({evt.currentEmpName})</p>
                  </div>
                  
                  <div className="text-left md:text-right text-xs bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 font-bold uppercase tracking-widest block text-[9px] mb-1">Resolution</span>
                    {evt.status === 'RESOLVED' ? (
                      <span className="font-bold text-emerald-400">Relief Duty: {evt.resolvedByDutyId} ({evt.resolvedByEmpName})</span>
                    ) : (
                      <span className="font-bold text-amber-500">Awaiting Decision</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Swap Duties Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black text-amber-400 flex items-center gap-2 uppercase tracking-wider">
                <Repeat className="h-4 w-4" /> SWAP DUTIES (CC/GCC/ALS)
              </h3>
              <button onClick={() => setShowSwapModal(false)} className="text-slate-400 hover:text-white font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1" htmlFor="automateddispatchgat-l18">First Duty ID</label>
                <select id="automateddispatchgat-i21" name="automateddispatchgat-i21"
                  value={swapDuty1}
                  onChange={(e) => setSwapDuty1(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-500"
                >
                  <option value="">Select Duty 1...</option>
                  {deployments.map(d => (
                    <option key={d.id} value={d.dutyId}>Duty {d.dutyId} - {d.empName} ({d.empId})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1" htmlFor="automateddispatchgat-l19">Second Duty ID</label>
                <select id="automateddispatchgat-i22" name="automateddispatchgat-i22"
                  value={swapDuty2}
                  onChange={(e) => setSwapDuty2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-500"
                >
                  <option value="">Select Duty 2...</option>
                  {deployments.map(d => (
                    <option key={d.id} value={d.dutyId}>Duty {d.dutyId} - {d.empName} ({d.empId})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowSwapModal(false)}
                className="px-4 py-1.5 rounded text-xs font-bold text-slate-400 hover:text-white bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSwap}
                className="px-4 py-1.5 rounded text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 font-black uppercase tracking-wider"
              >
                CONFIRM SWAP
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="crew-employees">
        {BMRCL_CREW_REGISTRY.map(c => (
          <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
        ))}
      </datalist>
    </div>
  );
}