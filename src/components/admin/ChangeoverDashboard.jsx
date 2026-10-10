import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  triggerChangeover,
  revertToNormalRoster,
  CHANGEOVER_TABLE,
  calculateStablingAndPdcSignOn,
  STABLING_LOCATIONS,
  getTransitMinutes
} from '../../services/changeoverService';
import { calculateDistance } from '../../utils/kmCalculator';

import { 
  RefreshCw, Play, Shield, Moon, Sun, CheckCircle2, 
  ChevronDown, ChevronUp, Eye, X, AlertCircle, User, AlertTriangle, 
  Search, Cpu, Zap, Clock, Route
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getOperatorForDuty } from '../../data/weekdayMasterDutyRoster';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import {
  checkDeploymentExists,
  validateDeploymentContext,
  formatOperationalDate,
  toIndianDateStr,
} from '../../services/deploymentService';

const DAY_OPTIONS = [
  { value: 'SUNDAY',    label: 'Sunday' },
  { value: 'MONDAY',    label: 'Monday Regular' },
  { value: 'MONDAY_GH', label: 'Monday GH' },
  { value: 'WEEKDAY',   label: 'Regular Weekday' },
  { value: 'SATURDAY',  label: 'Saturday / GH' },
];

const resolveDefaultDayType = (dateStr) => {
  if (!dateStr) return 'WEEKDAY';
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 0) return 'SUNDAY';
  if (day === 1) return 'MONDAY';
  if (day === 6) return 'SATURDAY';
  return 'WEEKDAY';
};

const getNextDateStr = (dateStr) => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const normalizeDutyNo = (val) => {
  if (val === undefined || val === null) return "";
  const cleaned = String(val).replace(/^Duty\s*/i, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? cleaned.toUpperCase() : String(num);
};

const normalizeSched = (s) => {
  const str = String(s || "").trim().toUpperCase();
  if (str === "SAT & GH" || str === "GH" || str === "SATURDAY & GH") return "SATURDAY";
  if (str === "MON" || str === "MONDAY REGULAR") return "MONDAY";
  return str;
};

// Parse time string 'HH:MM' or 'HH:MM:SS' to total seconds from 00:00:00 (0..86399)
const parseTimeToSeconds = (tStr) => {
  if (!tStr || typeof tStr !== 'string') return -1;
  const parts = tStr.trim().split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return -1;
  return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
};

// Check if a time string is STRICTLY above 20:00:01 (20:00:01 to 23:59:59)
// 20:00:01 in seconds = 20 * 3600 + 0 * 60 + 1 = 72001 seconds.
// Sign-on time before 20:00:01 (00:00:00 through 20:00:00, or seconds <= 72000) is NEVER considered as night shift!
const isNightSignOnTime = (tStr) => {
  const secs = parseTimeToSeconds(tStr);
  return secs >= 72001; // strictly above 20:00:01
};

// Check if an operational record or shift belongs to Morning or Afternoon (Shift A / Shift B)
const isMorningOrAfternoonShift = (item) => {
  if (!item) return false;

  // 1. Explicit shift codes
  const shift = String(item.shift || item.currentShift || item.shiftCode || "").trim().toUpperCase();
  if (shift === 'A' || shift === 'B' || shift === 'M' || shift === 'E') return true;
  if (shift === 'MORNING' || shift === 'AFTERNOON' || shift === 'EVENING') return true;

  // 2. Slot, shiftName, dutyGroup, or dutyType flags
  const slotOrType = String(
    item.slot || item.shiftName || item.dutyType || item.dutyGroup || item.dutyCategory || ""
  ).trim().toUpperCase();
  if (
    slotOrType.includes("MORNING") ||
    slotOrType.includes("AFTERNOON") ||
    slotOrType.includes("A SHIFT") ||
    slotOrType.includes("B SHIFT") ||
    slotOrType.includes("A-SHIFT") ||
    slotOrType.includes("B-SHIFT") ||
    slotOrType.startsWith("A ") ||
    slotOrType.startsWith("B ")
  ) {
    return true;
  }

  // 3. Check sign-on time:
  // Sign-on time before 20:00:01 (00:00:00 through 20:00:00) is Daytime / Morning / Afternoon shift.
  // ONLY sign-on times strictly above 20:00:01 are night shift.
  const sOn = String(item.signOnTime || item.sOnTime || item.signOn || item.sOn || "").trim();
  const sOnSecs = parseTimeToSeconds(sOn);
  if (sOnSecs >= 0 && sOnSecs < 72001 && shift !== 'N' && shift !== 'C' && !item.isNight) {
    return true;
  }

  return false;
};

// Check if an operational record strictly belongs to Night Shift duty
const isNightDutyRecord = (item) => {
  if (!item) return false;

  const sOn = String(item.signOnTime || item.sOnTime || item.signOn || item.sOn || "").trim();
  const sOnSecs = parseTimeToSeconds(sOn);

  // CRITICAL RULE: Sign-on time before 20:00:01 (<= 20:00:00) is NEVER considered as night shift!
  // Only sign-on times strictly above 20:00:01 (20:00:01 to 23:59:59) qualify as night shift.
  if (sOnSecs >= 0 && sOnSecs < 72001) {
    return false;
  }

  // Strict exclusion: NEVER allow morning or afternoon (A / B shift) operators
  if (isMorningOrAfternoonShift(item)) return false;

  // 1. Explicit night shift indicator
  const shift = String(item.shift || item.currentShift || item.shiftCode || "").trim().toUpperCase();
  if (shift === 'N' || shift === 'C' || item.isNight === true) return true;

  // 2. Sign-on time strictly above 20:00:01
  if (sOnSecs >= 72001) return true;

  // 3. Duty code or remarks containing night identifiers
  const code = String(
    item.dutyType || item.dutyCode || item.dutyId || item.remarks || item.slot || ""
  ).toUpperCase();
  if (
    code.includes("NIGHT") ||
    code.includes("NPRO") ||
    code.includes("NOST") ||
    code.includes("STBK-N") ||
    code.includes("N-SHIFT") ||
    code.includes("N SHIFT")
  ) {
    return true;
  }

  // 4. BMRCL Line 2 night duties (typically duties >= 64) are intrinsically night duties
  // (unless an explicit sign-on time < 20:00:01 was present, which was already rejected above)
  const num = parseInt(normalizeDutyNo(item.dutyId || item.dutyNo), 10);
  if (!isNaN(num) && num >= 64) {
    return true;
  }

  return false;
};

// Check if a shift exchange is strictly for night shift
const isExchangeNight = (ex, normTargetDuty) => {
  if (!ex) return false;
  if (ex.shift === 'A' || ex.shift === 'B') return false;
  if (isMorningOrAfternoonShift(ex)) return false;

  const sOn = String(ex.signOnTime || ex.sOnTime || "").trim();
  const sOnSecs = parseTimeToSeconds(sOn);
  if (sOnSecs >= 0 && sOnSecs < 72001) return false;

  const op1Shift = String(ex.operator1Shift || "").trim().toUpperCase();
  const op2Shift = String(ex.operator2Shift || "").trim().toUpperCase();
  const isOp1 = normalizeDutyNo(ex.operator1Duty) === normTargetDuty;
  const targetShift = isOp1 ? op1Shift : op2Shift;
  if (targetShift === 'A' || targetShift === 'B') return false;

  if (ex.shift === 'N' || ex.isNight || targetShift === 'N') return true;
  if (sOnSecs >= 72001) return true;

  const dutyNum = parseInt(normTargetDuty, 10);
  if (!isNaN(dutyNum) && dutyNum >= 64) return true;

  return false;
};

// Resolves strictly validated LEG 1 Night Shift Sign-On Time (> 20:00:01)
const resolveCanonicalLeg1NightSignOn = (dutyNo, row, baseRow, operator) => {
  if (isNightSignOnTime(row?.nightSignOnTime)) return row.nightSignOnTime;
  if (isNightSignOnTime(row?.signOnTime)) return row.signOnTime;
  if (isNightSignOnTime(baseRow?.signOnTime)) return baseRow.signOnTime;
  if (isNightSignOnTime(baseRow?.nightSignOnTime)) return baseRow.nightSignOnTime;
  if (isNightSignOnTime(operator?.signOnTime)) return operator.signOnTime;
  if (isNightSignOnTime(operator?.sOnTime)) return operator.sOnTime;

  for (const staticKey of ["WEEKDAY__SATURDAY", "WEEKDAY__WEEKDAY", "SUNDAY__MONDAY", "SATURDAY__SUNDAY", "SATURDAY__SATURDAY"]) {
    const sMatch = CHANGEOVER_TABLE[staticKey]?.[dutyNo] || CHANGEOVER_TABLE[staticKey]?.[String(Number(dutyNo))];
    if (sMatch && isNightSignOnTime(sMatch.signOnTime)) {
      return sMatch.signOnTime;
    }
  }

  const nDep = row?.nightDepTime || baseRow?.nightDepTime;
  if (nDep && isNightSignOnTime(nDep)) {
    const depSecs = parseTimeToSeconds(nDep);
    if (depSecs > 72001) {
      const sOnSecs = Math.max(72002, depSecs - (17 * 60));
      const h = Math.floor(sOnSecs / 3600);
      const m = Math.floor((sOnSecs % 3600) / 60);
      const s = sOnSecs % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }

  return "21:30:00";
};

// Helper to validate clean operator name (excludes placeholder / generic strings)
const isRealOperatorName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed === '--' || trimmed === '-' || trimmed.toUpperCase() === 'UNASSIGNED') return false;
  if (trimmed.toUpperCase().startsWith('DUTY ') || trimmed.toUpperCase() === 'TRAIN OPERATOR') return false;
  return true;
};

// Enrich operator name and employee badge number from BMRCL Crew Registry
const enrichOperatorFromRegistry = (name, empId) => {
  const cleanId = String(empId || "").trim();
  const cleanN = String(name || "").trim();
  if (cleanId && cleanId !== "--" && cleanId !== "UNASSIGNED" && cleanId !== "0") {
    const byId = BMRCL_CREW_REGISTRY.find(c => String(c.id) === cleanId);
    if (byId) return { name: byId.name || cleanN, empId: String(byId.id) };
  }
  if (cleanN && isRealOperatorName(cleanN)) {
    const byName = BMRCL_CREW_REGISTRY.find(c => c.name && c.name.toLowerCase() === cleanN.toLowerCase());
    if (byName) return { name: byName.name, empId: String(byName.id) };
  }
  return { name: cleanN, empId: cleanId };
};

const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    slate:  'bg-slate-700/50 text-slate-300 border-slate-600/30',
    cyan:   'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

const TimeCell = ({ t, dim }) => (
  <span className={`font-mono text-[10px] ${dim ? 'text-slate-500' : 'text-slate-200'}`}>
    {t && t !== '--' ? String(t).slice(0, 5) : <span className="text-slate-700">--:--</span>}
  </span>
);

export default function ChangeoverDashboard({ onRefresh }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const initialDate = (() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem("pyidcc_target_deployment_date") || todayStr;
      }
    } catch (_) {}
    return todayStr;
  })();
  const tomorrowStr = getNextDateStr(initialDate);

  // ── Date & Schedule States ──
  const [currentDate, setCurrentDate] = useState(initialDate);
  const [nextDate, setNextDate] = useState(tomorrowStr);
  const [currentDay, setCurrentDay] = useState(() => resolveDefaultDayType(initialDate));
  const [nextDay, setNextDay] = useState(() => resolveDefaultDayType(tomorrowStr));

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [ghAccordionOpen, setGhAccordionOpen] = useState(false);

  // ── Live Dispatch Gateway Core Synchronized States ──
  const [liveDeployments, setLiveDeployments] = useState([]);
  const [currentDateDispatchDeployments, setCurrentDateDispatchDeployments] = useState([]);
  const [consoleData, setConsoleData] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = window.localStorage.getItem("pyidcc_roster_desk_console_cache");
        if (cached) return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Could not read local console cache", e);
    }
    return null;
  });
  const [changeoverOverrides, setChangeoverOverrides] = useState({});
  const [shiftExchanges, setShiftExchanges] = useState([]);
  // Authoritative live cache from DISPATCH GATEWAY CORE (AutomatedDispatchGate.jsx)
  const [dispatchDeployments, setDispatchDeployments] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = window.localStorage.getItem("pyidcc_active_dispatch_deployments");
        if (cached) return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Could not read pyidcc_active_dispatch_deployments cache", e);
    }
    return [];
  });

  const tableKey = `${currentDay}__${nextDay}`;

  // ── Search and Filter Controls ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, ASSIGNED, UNASSIGNED, RELIEF_SWAP, ABNORMAL
  const [expandedDutyNo, setExpandedDutyNo] = useState(null);
  const [dashboardStablingOverrides, setDashboardStablingOverrides] = useState({});
  const [stablingModalRow, setStablingModalRow] = useState(null);
  const [selectedStablingLoc, setSelectedStablingLoc] = useState('DEPOT');
  const [stablingSearch, setStablingSearch] = useState('');

  // Filtered and categorized stabling / takeover locations (All Line 2 stations with Up & Dn line + Depot)
  const filteredStablingOptions = useMemo(() => {
    if (!stablingSearch.trim()) return STABLING_LOCATIONS;
    const rawQ = stablingSearch.toLowerCase().trim();
    const cleanQ = rawQ.replace(/[\s_()/-]/g, "");
    return STABLING_LOCATIONS.filter(l => {
      const codeClean = (l.code || '').toLowerCase().replace(/[\s_()/-]/g, "");
      const nameClean = (l.name || '').toLowerCase().replace(/[\s_()/-]/g, "");
      const stnClean = (l.stationName || '').toLowerCase().replace(/[\s_()/-]/g, "");
      const catClean = (l.category || '').toLowerCase().replace(/[\s_()/-]/g, "");
      return codeClean.includes(cleanQ) || 
        nameClean.includes(cleanQ) || 
        stnClean.includes(cleanQ) || 
        catClean.includes(cleanQ) ||
        (l.code && l.code.toLowerCase().includes(rawQ)) ||
        (l.name && l.name.toLowerCase().includes(rawQ));
    });
  }, [stablingSearch]);

  const groupedStablingOptions = useMemo(() => {
    const groups = {};
    filteredStablingOptions.forEach(opt => {
      const cat = opt.category || 'Other Locations';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(opt);
    });
    return groups;
  }, [filteredStablingOptions]);

  const handleOpenStablingModal = (row) => {
    setStablingModalRow(row);
    setStablingSearch('');
    const currentLoc = dashboardStablingOverrides[row.dutyNo] || 
      (changeoverOverrides[tableKey] && changeoverOverrides[tableKey][row.dutyNo]?.takeoverLocation) ||
      (changeoverOverrides[tableKey] && changeoverOverrides[tableKey][row.dutyNo]?.actualStablingLocation) ||
      row.actualStablingLocation || 
      row.takeoverLocation || 
      'DEPOT';
    setSelectedStablingLoc(currentLoc);
  };

  const handleConfirmStabling = async () => {
    if (!stablingModalRow) return;
    const dutyNo = stablingModalRow.dutyNo;
    const chosenLoc = selectedStablingLoc;

    setDashboardStablingOverrides(prev => ({
      ...prev,
      [dutyNo]: chosenLoc
    }));

    // Persist stabling override & takeover location to Firestore system_settings/changeover_mappings
    try {
      const docRef = doc(db, 'system_settings', 'changeover_mappings');
      await setDoc(docRef, {
        [tableKey]: {
          [dutyNo]: {
            takeoverLocation: chosenLoc,
            actualStablingLocation: chosenLoc,
            assignedStablingLocation: stablingModalRow.assignedStablingLocation || stablingModalRow.takeoverLocation || 'DEPOT',
          }
        }
      }, { merge: true });
    } catch (err) {
      console.warn('Could not persist stabling override to Firestore:', err);
    }

    setStablingModalRow(null);
  };


  // ── Real-Time Sync with DISPATCH GATEWAY CORE & Settings ──
  useEffect(() => {
    let active = true;

    // 1. Load active roster configuration
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'system_settings', 'active_roster_config'));
        if (snap.exists() && active) {
          const data = snap.data();
          if (data.currentDay) setCurrentDay(data.currentDay);
          if (data.nextDay) setNextDay(data.nextDay);
        }
      } catch (err) {
        console.error('Failed to load active roster config:', err);
      }
    };
    fetchConfig();

    // 2. Real-time listener for DISPATCH GATEWAY CORE live deployments (crew_daily_deployment)
    const unsubDeployments = onSnapshot(
      collection(db, 'crew_daily_deployment'),
      (snap) => {
        if (!active) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLiveDeployments(docs);
      },
      (err) => console.warn('crew_daily_deployment sync warning:', err)
    );

    // 3. Real-time listener for DISPATCH GATEWAY CORE desk console (current)
    const unsubConsole = onSnapshot(
      doc(db, 'roster_desk_console', 'current'),
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          setConsoleData(data);
        }
      },
      (err) => console.warn('roster_desk_console sync warning:', err)
    );

    // 4. Real-time listener for custom changeover mappings from ChangeoverLink
    const unsubMappings = onSnapshot(
      doc(db, 'system_settings', 'changeover_mappings'),
      (snap) => {
        if (!active) return;
        if (snap.exists()) {
          setChangeoverOverrides(snap.data());
        }
      },
      (err) => console.warn('changeover_mappings sync warning:', err)
    );

    // 5. Real-time listener for DISPATCH GATEWAY CORE / Shift Exchanges
    const unsubExchanges = onSnapshot(
      collection(db, 'shift_exchanges'),
      (snap) => {
        if (!active) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setShiftExchanges(docs);
      },
      (err) => console.warn('shift_exchanges sync warning:', err)
    );

    // 6. Real-time listener for DISPATCH GATEWAY CORE active dispatch deployments
    const handleDispatchUpdate = (e) => {
      if (!active) return;
      if (e?.detail?.duties && Array.isArray(e.detail.duties)) {
        setDispatchDeployments(e.detail.duties);
      } else {
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            const raw = window.localStorage.getItem("pyidcc_active_dispatch_deployments");
            if (raw) setDispatchDeployments(JSON.parse(raw));
          }
        } catch (_err) {}
      }
    };
    window.addEventListener("pyidcc_dispatch_deployments_updated", handleDispatchUpdate);

    const handleActiveDayChanged = (e) => {
      if (!active || !e?.detail) return;
      if (e.detail.date) {
        setCurrentDate(e.detail.date);
        setCurrentDay(resolveDefaultDayType(e.detail.date));
        const autoNext = getNextDateStr(e.detail.date);
        setNextDate(autoNext);
        setNextDay(resolveDefaultDayType(autoNext));
      }
      if (e.detail.dayType) {
        setCurrentDay(normalizeSched(e.detail.dayType));
      }
    };
    window.addEventListener("pyidcc-active-day-changed", handleActiveDayChanged);

    const handleStorageChange = (e) => {
      if (e.key === 'pyidcc_active_dispatch_deployments' && e.newValue) {
        try {
          setDispatchDeployments(JSON.parse(e.newValue));
        } catch (_) {}
      }
      if (e.key === 'pyidcc_target_deployment_date' && e.newValue && active) {
        setCurrentDate(e.newValue);
        setCurrentDay(resolveDefaultDayType(e.newValue));
        const autoNext = getNextDateStr(e.newValue);
        setNextDate(autoNext);
        setNextDay(resolveDefaultDayType(autoNext));
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      active = false;
      unsubDeployments();
      unsubConsole();
      unsubMappings();
      unsubExchanges();
      window.removeEventListener("pyidcc_dispatch_deployments_updated", handleDispatchUpdate);
      window.removeEventListener("pyidcc-active-day-changed", handleActiveDayChanged);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // ── Sync Official Deployment for currentDate from dispatch_deployments, dispatch_excel_cache & roster_desk_console ──
  useEffect(() => {
    let active = true;
    const normDate = formatOperationalDate(currentDate);
    const altDate = toIndianDateStr(normDate);
    const targetSched = normalizeSched(currentDay);

    const handleDocs = (docs) => {
      if (!active || !docs || docs.length === 0) return false;
      const matched = docs.find(d => normalizeSched(d.dayType || d.scheduleType) === targetSched) || docs[0];
      if (matched && matched.rosterData && Array.isArray(matched.rosterData.duties) && matched.rosterData.duties.length > 0) {
        setCurrentDateDispatchDeployments(matched.rosterData.duties);
        return true;
      }
      return false;
    };

    // Listen to dispatch_deployments for normDate
    const qDep1 = query(
      collection(db, "dispatch_deployments"),
      where("deploymentDate", "==", normDate)
    );
    const unsubDateDep1 = onSnapshot(
      qDep1,
      (snap) => {
        if (!active) return;
        if (!snap.empty) {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (handleDocs(docs)) return;
        }
      },
      (err) => console.warn("Changeover normDate dispatch_deployments sync warning:", err)
    );

    // Listen to dispatch_deployments for altDate
    const qDep2 = query(
      collection(db, "dispatch_deployments"),
      where("deploymentDate", "==", altDate)
    );
    const unsubDateDep2 = onSnapshot(
      qDep2,
      (snap) => {
        if (!active) return;
        if (!snap.empty) {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          if (handleDocs(docs)) return;
        }
      },
      (err) => console.warn("Changeover altDate dispatch_deployments sync warning:", err)
    );

    // Also check direct document IDs in dispatch_deployments, dispatch_excel_cache and roster_desk_console
    const fetchDateCache = async () => {
      try {
        const isToday = normDate === formatOperationalDate(new Date());
        const docRefs = [
          doc(db, "dispatch_deployments", `${normDate}_${targetSched}`),
          doc(db, "dispatch_deployments", `${altDate}_${targetSched}`),
          doc(db, "dispatch_deployments", `${normDate}_WEEKDAY`),
          doc(db, "dispatch_deployments", `${altDate}_WEEKDAY`),
          doc(db, "dispatch_deployments", normDate),
          doc(db, "dispatch_deployments", altDate),
          doc(db, "dispatch_excel_cache", normDate),
          doc(db, "dispatch_excel_cache", altDate),
          doc(db, "roster_desk_console", `date_${normDate}`),
          doc(db, "roster_desk_console", `date_${altDate}`),
        ];

        if (isToday) {
          docRefs.push(
            doc(db, "roster_desk_console", "current"),
            doc(db, "roster_desk_console", "latest"),
            doc(db, "dispatch_excel_cache", "current")
          );
        }

        const snaps = await Promise.all(docRefs.map(r => getDoc(r).catch(() => null)));
        if (!active) return;

        for (const s of snaps) {
          if (!s || !s.exists()) continue;
          const data = s.data();
          const candidateDuties = data?.rosterData?.duties || data?.duties;
          if (Array.isArray(candidateDuties) && candidateDuties.length > 0) {
            setCurrentDateDispatchDeployments(candidateDuties);
            return;
          }
        }

        // Check local storage console caches
        if (typeof window !== "undefined" && window.localStorage) {
          for (const key of [
            `pyidcc_roster_desk_console_cache_${normDate}`,
            `pyidcc_roster_desk_console_cache_${altDate}`,
            "pyidcc_roster_desk_console_cache"
          ]) {
            const raw = window.localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.duties) && parsed.duties.length > 0) {
                  setCurrentDateDispatchDeployments(parsed.duties);
                  return;
                }
              } catch (_) {}
            }
          }
        }
      } catch (err) {
        console.warn("Changeover fetchDateCache warning:", err);
      }
    };
    fetchDateCache();

    return () => {
      active = false;
      unsubDateDep1();
      unsubDateDep2();
    };
  }, [currentDate, currentDay]);

  // ── Date Change Handlers ──
  const handleCurrentDateChange = (newDate) => {
    setCurrentDate(newDate);
    const resolvedCurrent = resolveDefaultDayType(newDate);
    setCurrentDay(resolvedCurrent);

    const autoNextDate = getNextDateStr(newDate);
    setNextDate(autoNextDate);
    setNextDay(resolveDefaultDayType(autoNextDate));

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("pyidcc_target_deployment_date", newDate);
        window.localStorage.setItem("pyidcc_active_day_override", resolvedCurrent);
      }
    } catch (_) {}
  };

  const handleNextDateChange = (newDate) => {
    setNextDate(newDate);
    setNextDay(resolveDefaultDayType(newDate));
  };

  // ── Algorithmic Shift Validation & Relief Engine Operator Resolver ──
  // Resolves STRICTLY AND EXCLUSIVELY Night Shift active on-duty Train Operator for the duty number & day type
  // Under NO circumstances allows Morning (A Shift) or Afternoon (B Shift) operators.
  const resolveNightShiftOperator = useCallback((dutyNo, targetDay, targetDate) => {
    const normTargetDuty = normalizeDutyNo(dutyNo);
    const targetSched = normalizeSched(targetDay);
    const normTDate = formatOperationalDate(targetDate);
    const altTDate = toIndianDateStr(normTDate);

    let activeDep = null;

    // 1. Direct match from currentDateDispatchDeployments (Synched directly from dispatch_deployments / dispatch_excel_cache for currentDate)
    if (currentDateDispatchDeployments && currentDateDispatchDeployments.length > 0) {
      activeDep = currentDateDispatchDeployments.find((d) => {
        const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
        return dNo === normTargetDuty;
      }) || null;
    }

    // 2. DISPATCH GATEWAY CORE In-Memory & LocalStorage Active Deployments (Real-time sync from AutomatedDispatchGate.jsx)
    if (!activeDep || !isRealOperatorName(activeDep.empName || activeDep.name || activeDep.operatorName)) {
      let liveList = dispatchDeployments;
      if (!liveList || liveList.length === 0) {
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            const raw = window.localStorage.getItem("pyidcc_active_dispatch_deployments");
            if (raw) liveList = JSON.parse(raw);
          }
        } catch (_) {}
      }

      if (liveList && liveList.length > 0) {
        const matchingDispatch = liveList.filter((d) => {
          const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
          if (dNo !== normTargetDuty) return false;
          const dDate = d.date || d.deploymentDate || d.targetDate;
          if (!dDate) return true;
          const dNorm = formatOperationalDate(dDate);
          return !normTDate || dNorm === normTDate;
        });
        const found = matchingDispatch.find(isNightDutyRecord) || matchingDispatch[0] || null;
        if (found && isRealOperatorName(found.empName || found.name || found.operatorName)) {
          activeDep = found;
        }
      }
    }

    // 3. Approved Shift / Duty Exchanges matching this duty (STRICTLY NIGHT SHIFT ONLY)
    const matchedExchange = (shiftExchanges || []).find((ex) => {
      const isApproved = ex.status === 'APPROVED' || ex.status === 'Operational' || Boolean(ex.isOperational);
      if (!isApproved) return false;
      const exDate = ex.exchangeDate || ex.date;
      const exNormDate = exDate ? formatOperationalDate(exDate) : "";
      const dateMatches = !normTDate || !exNormDate || exNormDate === normTDate;
      if (!dateMatches) return false;
      const d1 = normalizeDutyNo(ex.operator1Duty);
      const d2 = normalizeDutyNo(ex.operator2Duty);
      if (d1 !== normTargetDuty && d2 !== normTargetDuty) return false;
      return isExchangeNight(ex, normTargetDuty);
    });

    // 4. Search in consoleData duties (for targetDate)
    if ((!activeDep || !isRealOperatorName(activeDep.empName || activeDep.name || activeDep.operatorName)) && consoleData?.duties) {
      const consoleDate = consoleData.date || consoleData.targetDate || consoleData.deploymentDate;
      const consoleNormDate = consoleDate ? formatOperationalDate(consoleDate) : "";
      if (!consoleNormDate || !normTDate || consoleNormDate === normTDate) {
        const matchingConsole = (consoleData.duties || []).filter((d) => {
          const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
          return dNo === normTargetDuty;
        });
        const found = matchingConsole.find(isNightDutyRecord) || matchingConsole[0] || null;
        if (found && isRealOperatorName(found.empName || found.name || found.operatorName)) {
          activeDep = found;
        }
      }
    }

    // 5. Search in liveDeployments (from crew_daily_deployment in Firestore) — STRICT DATE ISOLATION! NO CROSS-DATE BLEED!
    if (!activeDep || !isRealOperatorName(activeDep.empName || activeDep.name || activeDep.operatorName)) {
      const matchingDeployments = (liveDeployments || []).filter((d) => {
        const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
        if (dNo !== normTargetDuty) return false;
        const dDate = d.date || d.deploymentDate || d.rosterDate;
        const dNormDate = dDate ? formatOperationalDate(dDate) : "";
        const docId = String(d.id || '');
        // STRICT DATE MATCH ONLY: Never allow unmatched dates to bleed into today!
        const dateMatches = (normTDate && dNormDate === normTDate) ||
                            (normTDate && docId.includes(normTDate)) ||
                            (altTDate && docId.includes(altTDate));
        return dateMatches;
      });

      if (matchingDeployments.length > 0) {
        const sortedDeployments = [...matchingDeployments].sort((a, b) => {
          const aIsSpecial = (a.isSwapped || a.isExchanged || a.status === 'SWAPPED_BY_CC' || a.status === 'EXCHANGED' || a.status === 'RELIEF_DISPATCHED') ? 1 : 0;
          const bIsSpecial = (b.isSwapped || b.isExchanged || b.status === 'SWAPPED_BY_CC' || b.status === 'EXCHANGED' || b.status === 'RELIEF_DISPATCHED') ? 1 : 0;
          if (aIsSpecial !== bIsSpecial) return bIsSpecial - aIsSpecial;
          const tA = a.lastUpdated?.toMillis?.() || (a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0);
          const tB = b.lastUpdated?.toMillis?.() || (b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0);
          return tB - tA;
        });
        activeDep = sortedDeployments.find(isNightDutyRecord) || sortedDeployments[0] || null;
      }
    }

    // 6. Fallback to Canonical Master Duty Roster (Exact same source of truth DISPATCH GATEWAY CORE uses)
    let canonicalOp = null;
    if (!activeDep || !isRealOperatorName(activeDep.empName || activeDep.name || activeDep.operatorName)) {
      canonicalOp = getOperatorForDuty(normTargetDuty);
    }

    // 7. Extract Active On-Duty Operator Name and Shift Validation Status
    const isRelieved =
      activeDep?.status === "RELIEF_DISPATCHED" ||
      Boolean(activeDep?.resolvedByEmpName) ||
      Boolean(activeDep?.isRelief);

    const isExchanged = Boolean(
      matchedExchange ||
      activeDep?.status === "EXCHANGED" ||
      activeDep?.status === "EXCHANGED_DUTY" ||
      activeDep?.status === "SHIFT_EXCHANGED" ||
      Boolean(activeDep?.isExchanged) ||
      Boolean(activeDep?.exchanged) ||
      Boolean(activeDep?.exchangeId) ||
      String(activeDep?.status || "").toUpperCase().includes("EXCHANGE") ||
      String(activeDep?.remarks || "").toUpperCase().includes("EXCHANGE")
    );

    const isSwapped = Boolean(
      activeDep?.status === "SWAPPED" ||
      activeDep?.status === "SWAPPED_BY_CC" ||
      Boolean(activeDep?.isSwapped) ||
      Boolean(activeDep?.swapped) ||
      String(activeDep?.status || "").toUpperCase().includes("SWAP") ||
      String(activeDep?.remarks || "").toUpperCase().includes("SWAP")
    );

    const isNR = activeDep?.status === "NOT_REPORTING" || activeDep?.status === "NR" || Boolean(activeDep?.isNotReporting);
    const isAB = activeDep?.status === "ABSENT" || activeDep?.status === "AB" || Boolean(activeDep?.isAbsent);

    let activeName = "UNASSIGNED";
    let activeEmpId = "--";

    if (matchedExchange) {
      const isOp1 = normTargetDuty === normalizeDutyNo(matchedExchange.operator1Duty);
      const candName = isOp1 ? matchedExchange.operator2Name : matchedExchange.operator1Name;
      const candId = isOp1 ? matchedExchange.operator2Id : matchedExchange.operator1Id;
      if (isRealOperatorName(candName)) {
        activeName = candName;
        activeEmpId = candId || "--";
      }
    } else if (isRelieved && isRealOperatorName(activeDep?.resolvedByEmpName)) {
      activeName = activeDep.resolvedByEmpName;
      activeEmpId = activeDep.resolvedByEmpId || activeDep.empId || activeDep.empNo || "--";
    } else if (activeDep && isRealOperatorName(activeDep.empName || activeDep.name || activeDep.operatorName)) {
      activeName = activeDep.empName || activeDep.name || activeDep.operatorName;
      activeEmpId = activeDep.empId || activeDep.empNo || activeDep.employeeId || activeDep.operatorId || "--";
    } else if (canonicalOp && isRealOperatorName(canonicalOp.empName)) {
      activeName = canonicalOp.empName;
      activeEmpId = canonicalOp.empId || "--";
    }

    const enriched = enrichOperatorFromRegistry(activeName, activeEmpId);
    activeName = enriched.name || activeName;
    activeEmpId = enriched.empId || activeEmpId;

    const isUnassigned = !isRealOperatorName(activeName);

    const exchangedWithInfo = matchedExchange
      ? (normTargetDuty === normalizeDutyNo(matchedExchange.operator1Duty) ? matchedExchange.operator1Name : matchedExchange.operator2Name)
      : "";

    return {
      empName: isUnassigned ? "UNASSIGNED" : activeName,
      empId: isUnassigned ? "--" : activeEmpId,
      status: activeDep?.status || (isExchanged ? "EXCHANGED" : isSwapped ? "SWAPPED_BY_CC" : (isUnassigned ? "UNASSIGNED" : "ACTIVE")),
      isRelief: isRelieved,
      isExchanged,
      isSwapped,
      isNR,
      isAB,
      isUnassigned,
      trainId: activeDep?.trainId || "--",
      remarks: activeDep?.remarks || (matchedExchange ? `Shift Exchanged with ${exchangedWithInfo}` : (isUnassigned ? "Night Shift TO Pending at Dispatch Gateway Core" : "")),
      swappedWith: activeDep?.swappedWith || "",
      swappedDutyId: activeDep?.swappedDutyId || "",
      exchangedWith: exchangedWithInfo,
      source: activeDep ? "DISPATCH_GATEWAY_CORE" : (canonicalOp ? "CANONICAL_ROSTER" : "UNASSIGNED"),
    };
  }, [currentDateDispatchDeployments, dispatchDeployments, shiftExchanges, liveDeployments, consoleData]);

  // ── Compute Preview Table Rows with Night Shift Train Operators & 40-Min PDC Engine ──
  const previewRows = useMemo(() => {
    const baseTable = CHANGEOVER_TABLE[tableKey] || {};
    const overrideTable = changeoverOverrides[tableKey] || {};
    const mergedTable = { ...baseTable, ...overrideTable };

    if (!Object.keys(mergedTable).length) return [];

    return Object.entries(mergedTable)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dutyNo, row]) => {
        const operator = resolveNightShiftOperator(dutyNo, currentDay, currentDate);
        const actualOverrideLoc = dashboardStablingOverrides[dutyNo] || 
          (changeoverOverrides[tableKey] && changeoverOverrides[tableKey][dutyNo]?.takeoverLocation) ||
          (changeoverOverrides[tableKey] && changeoverOverrides[tableKey][dutyNo]?.actualStablingLocation) ||
          row.actualStablingLocation;

        let effectiveRow = { ...row };
        const normDNo = normalizeDutyNo(dutyNo);

        // Always resolve Leg 1 Night Shift sign-on time strictly above 20:00:01
        const leg1NightSignOn = resolveCanonicalLeg1NightSignOn(dutyNo, row, baseTable[dutyNo], operator);
        effectiveRow.signOnTime = leg1NightSignOn;
        effectiveRow.nightSignOnTime = leg1NightSignOn;

        if (actualOverrideLoc) {
          const pdcCalc = calculateStablingAndPdcSignOn({
            trainId: row.mornTrainNo,
            stablingLocation: actualOverrideLoc,
            assignedStablingLocation: row.assignedStablingLocation || row.takeoverLocation || 'DEPOT',
            revenueStartTime: row.mornDepTime,
            targetScheduleType: nextDay
          });
          if (pdcCalc.calculatedByPdcEngine) {
            // Assign calculated morning PDC sign-on to Morning Takeover (Leg 3)
            // NEVER overwrite Leg 1 Night Shift sign-on time (effectiveRow.signOnTime)!
            effectiveRow.mornSignOnTime = pdcCalc.signOnTime;
            effectiveRow.calculatedSignOnTime = pdcCalc.signOnTime;
            effectiveRow.takeoverLocation = actualOverrideLoc;
            effectiveRow.actualStablingLocation = actualOverrideLoc;
            effectiveRow.isAlternativeStabling = pdcCalc.isAlternativeStabling;
            effectiveRow.transitMinutes = pdcCalc.transitMinutes;
            effectiveRow.pdcMinutes = pdcCalc.pdcMinutes;
          }
        }

        // Automatic station integrity & distance calculation for Morning Run
        let mKm = Number(effectiveRow.mornKms) || 0;
        if (mKm === 0 && effectiveRow.mornTrainNo && effectiveRow.mornTrainNo !== '--') {
          const fromLoc = effectiveRow.takeoverLocation || actualOverrideLoc;
          const toLoc = effectiveRow.mornHandoverLoc || effectiveRow.signOffLocation || 'PYID';
          if (fromLoc && toLoc) {
            const dist = calculateDistance(fromLoc, toLoc);
            if (dist > 0) {
              mKm = Math.round(dist);
            }
          }
        }

        // Canonical Station Integrity Protocol for Duty 69 Leg 3: Morning Run
        // Train #217 from BIET_BE (Buffer End SRMB) (-9.560 KM) to PYID (-3.020 KM)
        // Precise Actual Kms: 6.540 KM -> Round Off Kms: 7 KM (Takeover: BIET DnBE 06:30, Trip: 06:30 ➔ 07:27, Sign Off: 07:30 @ PYID)
        if (normDNo === '69') {
          mKm = 7;
          effectiveRow.mornTrainNo = (effectiveRow.mornTrainNo && effectiveRow.mornTrainNo !== '--') ? effectiveRow.mornTrainNo : '217';
          effectiveRow.takeoverLocation = (effectiveRow.takeoverLocation && effectiveRow.takeoverLocation !== '--') ? effectiveRow.takeoverLocation : 'BIET DnBE';
          effectiveRow.mornDepTime = (effectiveRow.mornDepTime && effectiveRow.mornDepTime !== '--') ? effectiveRow.mornDepTime : '06:30:00';
          effectiveRow.mornArrTime = (effectiveRow.mornArrTime && effectiveRow.mornArrTime !== '--') ? effectiveRow.mornArrTime : '07:27:00';
          effectiveRow.mornTripTime = (effectiveRow.mornTripTime && effectiveRow.mornTripTime !== '--') ? effectiveRow.mornTripTime : '00:57:00';
          effectiveRow.mornHandoverLoc = (effectiveRow.mornHandoverLoc && effectiveRow.mornHandoverLoc !== '--') ? effectiveRow.mornHandoverLoc : 'PYID Dn';
          effectiveRow.signOffTime = (effectiveRow.signOffTime && effectiveRow.signOffTime !== '--') ? effectiveRow.signOffTime : '07:30:00';
          effectiveRow.signOffLocation = (effectiveRow.signOffLocation && effectiveRow.signOffLocation !== '--') ? effectiveRow.signOffLocation : 'PYID';
          effectiveRow.drivingHrs = '02:45:00';
          effectiveRow.dutyHrs = '10:25:00';
        }

        effectiveRow.mornKms = mKm;
        effectiveRow.totalKms = (Number(effectiveRow.nightKms) || 0) + mKm;

        return {
          dutyNo,
          operator,
          ...effectiveRow,
        };
      });
  }, [tableKey, changeoverOverrides, dashboardStablingOverrides, currentDay, currentDate, nextDay, resolveNightShiftOperator]);

  const hasData = previewRows.length > 0;

  // ── Live Metrics and Statistics ──
  const stats = useMemo(() => {
    if (!previewRows.length) return null;
    const totalNightKm = previewRows.reduce((s, r) => s + (Number(r.nightKms) || 0), 0);
    const totalMornKm = previewRows.reduce((s, r) => s + (Number(r.mornKms) || 0), 0);
    const totalKm = previewRows.reduce((s, r) => s + (Number(r.totalKms) || ((Number(r.nightKms) || 0) + (Number(r.mornKms) || 0))), 0);
    return { duties: previewRows.length, totalNightKm, totalMornKm, totalKm };
  }, [previewRows]);

  const operatorStats = useMemo(() => {
    const total = previewRows.length;
    const assigned = previewRows.filter(r => !r.operator?.isUnassigned).length;
    const unassigned = total - assigned;
    const reliefCount = previewRows.filter(r => r.operator?.isRelief).length;
    const swapCount = previewRows.filter(r => r.operator?.isSwapped || r.operator?.isExchanged).length;
    const abnormalCount = previewRows.filter(r => r.operator?.isNR || r.operator?.isAB).length;
    return { total, assigned, unassigned, reliefCount, swapCount, abnormalCount };
  }, [previewRows]);

  // ── Filtered Rows by Search & Status Category ──
  const filteredRows = useMemo(() => {
    return previewRows.filter((r) => {
      // 1. Text Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const dNo = String(r.dutyNo).toLowerCase();
        const opName = String(r.operator?.empName || '').toLowerCase();
        const empId = String(r.operator?.empId || '').toLowerCase();
        const nTrain = String(r.nightTrainNo || '').toLowerCase();
        const mTrain = String(r.mornTrainNo || '').toLowerCase();
        const matches = dNo.includes(q) || opName.includes(q) || empId.includes(q) || nTrain.includes(q) || mTrain.includes(q);
        if (!matches) return false;
      }
      // 2. Status category filter
      if (statusFilter === 'ASSIGNED') return !r.operator?.isUnassigned;
      if (statusFilter === 'UNASSIGNED') return r.operator?.isUnassigned;
      if (statusFilter === 'RELIEF_SWAP') return r.operator?.isRelief || r.operator?.isSwapped || r.operator?.isExchanged;
      if (statusFilter === 'ABNORMAL') return r.operator?.isNR || r.operator?.isAB;
      return true;
    });
  }, [previewRows, searchQuery, statusFilter]);

  const fromLabel = DAY_OPTIONS.find(o => o.value === currentDay)?.label || currentDay;
  const toLabel = DAY_OPTIONS.find(o => o.value === nextDay)?.label || nextDay;

  // ── Perform Changeover with Real-Time Active Operators & 40-Min PDC Engine ──
  const handlePerformChangeover = async () => {
    if (!window.confirm(
      `Confirm Night Changeover:\n\n  Night Date & Roster: ${currentDate} (${fromLabel})\n  ➔\n  Target Morning Date & Roster: ${nextDate} (${toLabel})\n\nThis will merge night and morning duties into ACTIVE_RUN with ${operatorStats.assigned}/${operatorStats.total} active Night Shift Train Operators and 40-min PDC validation.`
    )) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      // Build operator assignments & stabling overrides maps
      const operatorMap = {};
      const stablingMap = {};
      previewRows.forEach(r => {
        if (r.operator && !r.operator.isUnassigned) {
          operatorMap[r.dutyNo] = r.operator;
        }
        if (r.actualStablingLocation || r.isAlternativeStabling || dashboardStablingOverrides[r.dutyNo]) {
          stablingMap[r.dutyNo] = dashboardStablingOverrides[r.dutyNo] || r.actualStablingLocation || r.takeoverLocation;
        }
      });

      // Validate deployment context if a dated deployment exists in dispatch_deployments
      try {
        const check = await checkDeploymentExists(currentDate, currentDay);
        if (check.exists && check.data) {
          validateDeploymentContext(currentDate, check.data);
        }
      } catch (valErr) {
        if (valErr.message && valErr.message.includes("DEPLOYMENT DATE MISMATCH")) {
          throw valErr;
        }
      }

      const result = await triggerChangeover(currentDay, nextDay, operatorMap, stablingMap);
      setStatusMsg({ type: 'success', title: `Changeover Complete: ${currentDay} ➔ ${nextDay}`, text: result });
      if (onRefresh) onRefresh();
    } catch (e) {
      setStatusMsg({ type: 'error', title: 'Changeover Error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Revert to Normal Roster ──
  const handleRevertRoster = async () => {
    if (!window.confirm("Revert ACTIVE_RUN roster back to standard timetable schedule?")) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const result = await revertToNormalRoster();
      setStatusMsg({ type: 'info', title: 'Roster Reverted', text: result });
      if (onRefresh) onRefresh();
    } catch (e) {
      setStatusMsg({ type: 'error', title: 'Revert Error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 font-mono">

      {/* ─── Header Card ─── */}
      <div className="relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title & Secure Badge */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="text-slate-200 font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                <span>Night Changeover Control</span>
                <span className="text-[9px] bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold tracking-wider inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-cyan-400" /> DISPATCH GATEWAY CORE SYNCED
                </span>
              </h3>
              <p className="text-[10px] text-slate-500">
                BMRCL Line 2 — Night to Morning Roster Merge · Live Active Night Train Operator Validation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1 rounded text-[9.5px] font-bold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> LIVE CORE ENGINE
            </div>
            <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-700 px-2.5 py-1 rounded text-[9px] font-bold text-slate-400">
              <Shield className="h-3 w-3 text-emerald-500" /> SECURE CONTROL
            </div>
          </div>
        </div>

        {/* Active Run Status Banner & Live Dispatch Statistics */}
        <div className="text-[10px] bg-slate-955/80 border border-slate-800 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-amber-400 uppercase tracking-wider">ACTIVE RUN: </span>
            <span className="text-slate-200 font-bold bg-slate-900 border border-slate-750 px-2 py-0.5 rounded">
              {currentDay} Night ({currentDate})
            </span>
            <span className="text-slate-500">➔</span>
            <span className="text-slate-200 font-bold bg-slate-900 border border-slate-750 px-2 py-0.5 rounded">
              {nextDay} Morning ({nextDate})
            </span>
          </div>

          {/* Engine Operator Assignment Badges */}
          <div className="flex items-center gap-2 flex-wrap text-[9.5px]">
            <span className="inline-flex items-center gap-1 bg-blue-950/40 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded font-bold">
              <User className="h-3 w-3" /> Night Operators: {operatorStats.assigned}/{operatorStats.total}
            </span>
            {operatorStats.unassigned > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-950/40 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-bold">
                <AlertTriangle className="h-3 w-3 text-amber-400" /> Pending: {operatorStats.unassigned}
              </span>
            )}
            {operatorStats.reliefCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-cyan-950/40 text-cyan-300 border border-cyan-800/60 px-2 py-0.5 rounded font-bold">
                <Zap className="h-3 w-3 text-cyan-400" /> Relief: {operatorStats.reliefCount}
              </span>
            )}
            {operatorStats.abnormalCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-rose-950/40 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded font-bold">
                <AlertCircle className="h-3 w-3 text-rose-400" /> NR/AB: {operatorStats.abnormalCount}
              </span>
            )}
            <span className="text-slate-500 ml-1">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Controls Grid: Date Pickers + Roster Selectors + Action Buttons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          
          {/* Current Night Date & Roster */}
          <div className="lg:col-span-5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Moon className="h-3 w-3 text-blue-400" /> Current Night Date & Roster (Source Schedule)
            </div>
            <div className="flex gap-2">
              <input id="changeoverdashboard-input-1" name="changeoverdashboard_input_1"
                type="date"
                value={currentDate}
                onChange={(e) => handleCurrentDateChange(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              />
              <select id="changeoverdashboard-select-2" name="changeoverdashboard_select_2"
                value={currentDay}
                onChange={(e) => setCurrentDay(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-bold"
              >
                {DAY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tomorrow Target Morning Date & Roster */}
          <div className="lg:col-span-5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Sun className="h-3 w-3 text-amber-400" /> Tomorrow — Target Morning Date & Roster
            </div>
            <div className="flex gap-2">
              <input id="changeoverdashboard-input-3" name="changeoverdashboard_input_3"
                type="date"
                value={nextDate}
                onChange={(e) => handleNextDateChange(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
              <select id="changeoverdashboard-select-4" name="changeoverdashboard_select_4"
                value={nextDay}
                onChange={(e) => setNextDay(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-bold"
              >
                {DAY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="lg:col-span-2 flex flex-col sm:flex-row lg:flex-col gap-2">
            <button
              onClick={handlePerformChangeover}
              disabled={loading || !hasData}
              className="w-full flex items-center justify-center gap-1.5 bg-linear-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:from-slate-800 disabled:to-slate-700 text-slate-950 disabled:text-slate-500 px-4 py-2 rounded-lg font-black uppercase text-[11px] tracking-wider transition shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Execute Changeover
            </button>
            <button
              onClick={handleRevertRoster}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/80 px-3 py-1.5 rounded-lg font-bold uppercase text-[10px] tracking-wider transition cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Revert to Normal Roster
            </button>
          </div>
        </div>

        {/* Dynamic Status Notification */}
        {statusMsg && (
          <div className={`p-3.5 rounded-lg border flex items-start gap-3 text-xs leading-relaxed ${
            statusMsg.type === 'error'
              ? 'bg-rose-950/50 border-rose-800 text-rose-300'
              : 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
          }`}>
            {statusMsg.type === 'error' ? <AlertCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <div>
              <div className="font-bold">{statusMsg.title}</div>
              <div className="text-[11px] opacity-90">{statusMsg.text}</div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Gazetted Holiday Dates Accordion Card ─── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => setGhAccordionOpen(!ghAccordionOpen)}
          className="w-full px-5 py-3 flex items-center justify-between text-left bg-slate-950/40 hover:bg-slate-950/70 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Gazetted Holiday Dates
            </span>
            <Badge color="violet">0 configured</Badge>
            <span className="text-[10px] text-slate-500 ml-1">
              — Used for auto-detection of Saturday/GH schedule
            </span>
          </div>
          {ghAccordionOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {ghAccordionOpen && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400">
            No specific Gazetted Holiday date overrides configured in active changeover table. Standard weekend/weekday rules apply automatically.
          </div>
        )}
      </div>

      {/* ─── Changeover Preview Table with Night Shift Train Operator ─── */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden space-y-3 p-4">
        
        {/* Table Header Controls, Search, Filters & KM Badges */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Eye className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-slate-200 font-bold text-xs uppercase tracking-wide">
                Changeover Preview &amp; Crew Link
              </span>
              <span className="ml-2 text-[10px] text-slate-500">
                {fromLabel} <span className="text-amber-400">➔</span> {toLabel}
              </span>
            </div>
            <Badge color="amber">{filteredRows.length} of {previewRows.length} night duties</Badge>
            <span className="text-[9.5px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Night Shift TOs Synchronized (Dispatch Gateway Core)
            </span>
          </div>

          {stats && (
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <div className="bg-blue-950/50 border border-blue-500/40 px-2.5 py-1 rounded-lg text-blue-300 font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
                <Moon className="h-3 w-3 text-blue-400" />
                <span>NIGHT LEG: <span className="text-white font-extrabold">{stats.totalNightKm}</span> KM</span>
              </div>
              <div className="bg-amber-950/50 border border-amber-500/40 px-2.5 py-1 rounded-lg text-amber-300 font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
                <Sun className="h-3 w-3 text-amber-400" />
                <span>MORN LEG: <span className="text-white font-extrabold">{stats.totalMornKm}</span> KM</span>
              </div>
              <div className="bg-emerald-950/60 border border-emerald-500/50 px-3 py-1 rounded-lg text-emerald-300 font-black text-[11px] flex items-center gap-1.5 shadow-sm">
                <Zap className="h-3 w-3 text-emerald-400" />
                <span>TOTAL CHANGEOVER: <span className="text-white font-black text-xs">{stats.totalKm}</span> KM</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-bold text-[10.5px] hidden sm:flex items-center gap-1">
                <span className="text-slate-500">AVG:</span>
                <span className="text-slate-200">{(stats.totalKm / (stats.duties || 1)).toFixed(1)} km/duty</span>
              </div>
            </div>
          )}
        </div>

        {/* Search Bar & Status Category Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          {/* Quick Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input id="changeoverdashboard-input-5" name="changeoverdashboard_input_5"
              type="text"
              placeholder="Search by Duty #, Operator Name, ID, Train..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                statusFilter === "ALL"
                  ? "bg-slate-700 text-slate-100"
                  : "bg-slate-950/80 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              All ({previewRows.length})
            </button>
            <button
              onClick={() => setStatusFilter("ASSIGNED")}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                statusFilter === "ASSIGNED"
                  ? "bg-emerald-600 text-slate-950 font-black"
                  : "bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/50 border border-emerald-800/40"
              }`}
            >
              Assigned ({operatorStats.assigned})
            </button>
            <button
              onClick={() => setStatusFilter("UNASSIGNED")}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                statusFilter === "UNASSIGNED"
                  ? "bg-amber-600 text-slate-950 font-black"
                  : "bg-amber-950/30 text-amber-400 hover:bg-amber-950/50 border border-amber-800/40"
              }`}
            >
              Pending ({operatorStats.unassigned})
            </button>
            {operatorStats.reliefCount > 0 && (
              <button
                onClick={() => setStatusFilter("RELIEF_SWAP")}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                  statusFilter === "RELIEF_SWAP"
                    ? "bg-cyan-600 text-slate-950 font-black"
                    : "bg-cyan-950/30 text-cyan-400 hover:bg-cyan-950/50 border border-cyan-800/40"
                }`}
              >
                Relief / Swap ({operatorStats.reliefCount + operatorStats.swapCount})
              </button>
            )}
            {operatorStats.abnormalCount > 0 && (
              <button
                onClick={() => setStatusFilter("ABNORMAL")}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition ${
                  statusFilter === "ABNORMAL"
                    ? "bg-rose-600 text-white font-black"
                    : "bg-rose-950/30 text-rose-400 hover:bg-rose-950/50 border border-rose-800/40"
                }`}
              >
                NR / AB ({operatorStats.abnormalCount})
              </button>
            )}
          </div>
        </div>

        {/* Table Grid */}
        {hasData ? (
          <div className="overflow-x-auto border border-slate-850 rounded-lg custom-scrollbar">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[9.5px] border-b border-slate-800 text-center font-bold">
                  <th className="px-2.5 py-2 border-r border-slate-800 w-13.75">Duty</th>
                  <th className="px-3 py-2 border-r border-slate-800 text-cyan-400 bg-cyan-950/20 text-left min-w-52.5">
                    Night Shift Train Operator (Dispatch Gateway Core)
                  </th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-blue-400 bg-blue-950/20">
                    <span className="inline-flex items-center gap-1.5"><Moon className="h-3 w-3 text-blue-400" /> Leg 1: Night Shift Run</span>
                  </th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-amber-400 bg-amber-950/20">
                    <span className="inline-flex items-center gap-1.5"><Sun className="h-3 w-3 text-amber-400" /> Leg 3: Morning Takeover Run</span>
                  </th>
                  <th colSpan="3" className="px-2.5 py-2 text-emerald-400 bg-emerald-950/20">
                    <span className="inline-flex items-center gap-1.5"><Zap className="h-3 w-3 text-emerald-400" /> Crew Link Totals</span>
                  </th>
                </tr>
                <tr className="bg-slate-955 text-slate-400 uppercase text-[9px] border-b border-slate-800 text-center">
                  <th className="px-2 py-1.5 border-r border-slate-800"># / Leg</th>
                  <th className="px-3 py-1.5 border-r border-slate-800 text-left text-cyan-300">Active Operator Name &amp; ID</th>
                  <th className="px-2 py-1.5">Sign On</th>
                  <th className="px-2 py-1.5">Loc</th>
                  <th className="px-2 py-1.5 text-blue-400 font-bold">Train</th>
                  <th className="px-2 py-1.5">Dep</th>
                  <th className="px-2 py-1.5">Arr</th>
                  <th className="px-2 py-1.5">Handover</th>
                  <th className="px-2 py-1.5 border-r border-slate-800 text-blue-300 font-bold bg-blue-950/40">Night Leg Km</th>
                  <th className="px-2 py-1.5">Takeover Loc</th>
                  <th className="px-2 py-1.5 text-amber-400 font-bold">Train</th>
                  <th className="px-2 py-1.5">Dep</th>
                  <th className="px-2 py-1.5">Arr</th>
                  <th className="px-2 py-1.5">Sign Off</th>
                  <th className="px-2 py-1.5">Off Loc</th>
                  <th className="px-2 py-1.5 border-r border-slate-800 text-amber-300 font-bold bg-amber-950/40">Morn Leg Km</th>
                  <th className="px-2 py-1.5 text-emerald-400 font-extrabold bg-emerald-950/40">Total Km</th>
                  <th className="px-2 py-1.5">Duty Hrs</th>
                  <th className="px-2 py-1.5">Drive Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-center">
                {filteredRows.map((r, idx) => {
                  const op = r.operator || {};
                  const isExpanded = expandedDutyNo === r.dutyNo;
                  return (
                    <React.Fragment key={r.dutyNo || idx}>
                      <tr
                        onClick={() => setExpandedDutyNo(isExpanded ? null : r.dutyNo)}
                        className={`hover:bg-slate-800/60 transition cursor-pointer select-none ${isExpanded ? 'bg-slate-850/80' : ''}`}
                        title="Click to view full Crew Link Leg Journey & Distance Details"
                      >
                        {/* Duty Number & Expand Toggle */}
                        <td className="px-2 py-2 font-bold text-slate-100 border-r border-slate-800">
                          <div className="flex items-center justify-center gap-1">
                            <span>{r.dutyNo}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 text-amber-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-slate-500 hover:text-slate-300" />
                            )}
                          </div>
                        </td>

                        {/* Active Night Shift Train Operator */}
                        <td className="px-3 py-2 text-left border-r border-slate-800 bg-slate-950/40">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg shrink-0 ${
                              op.isUnassigned ? 'bg-slate-800/80 text-slate-500' :
                              op.isRelief ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' :
                              op.isExchanged ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' :
                              op.isSwapped ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                              op.isNR ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                              op.isAB ? 'bg-red-500/20 text-red-300 border border-red-500/40' :
                              'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              <User className="h-3.5 w-3.5" />
                            </div>

                            <div className="flex flex-col min-w-0">
                              {/* Operator Name and Status Badges */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-bold truncate text-xs ${
                                  op.isUnassigned ? 'text-slate-500 italic' :
                                  op.isNR ? 'text-rose-300 font-black' :
                                  op.isAB ? 'text-red-300 font-black' :
                                  'text-slate-100'
                                }`}>
                                  {op.empName}
                                </span>

                                {op.isRelief && (
                                  <span className="bg-cyan-950/90 text-cyan-300 border border-cyan-500/80 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold tracking-wider inline-flex items-center gap-1 shadow">
                                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> RELIEF
                                  </span>
                                )}

                                {op.isExchanged && (
                                  <span className="bg-purple-950/90 text-purple-300 border border-purple-500/80 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold tracking-wider inline-flex items-center gap-1 shadow">
                                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" /> EXCH
                                  </span>
                                )}

                                {op.isSwapped && (
                                  <span className="bg-amber-950/90 text-amber-300 border border-amber-500/80 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold tracking-wider inline-flex items-center gap-1 shadow">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> SWAP
                                  </span>
                                )}

                                {op.isNR && (
                                  <span className="bg-rose-950/90 text-rose-300 border border-rose-500/80 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold tracking-wider inline-flex items-center gap-1 shadow">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" /> NR
                                  </span>
                                )}

                                {op.isAB && (
                                  <span className="bg-red-950/90 text-red-300 border border-red-500/80 px-1.5 py-0.2 rounded text-[8px] font-mono font-bold tracking-wider inline-flex items-center gap-1 shadow">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> AB
                                  </span>
                                )}
                              </div>

                              {/* Emp ID and Swap/Exchange Details */}
                              <div className="flex items-center gap-1.5 text-[9.5px] flex-wrap mt-0.5">
                                <span className="font-mono text-cyan-400 font-bold">
                                  {op.empId !== '--' ? `#${op.empId}` : 'ID: --'}
                                </span>

                                {op.isSwapped && (op.swappedWith || op.swappedDutyId || op.remarks) && (
                                  <span
                                    className="text-[8.5px] font-mono text-amber-300 font-bold bg-amber-950/60 border border-amber-500/40 px-1 py-0.2 rounded truncate max-w-47.5"
                                    title={op.remarks || `Swapped with ${op.swappedWith || op.swappedDutyId}`}
                                  >
                                    {op.swappedDutyId ? `⇄ Duty #${op.swappedDutyId}` : (op.swappedWith ? `⇄ ${op.swappedWith}` : '⇄ Swapped')}
                                  </span>
                                )}

                                {op.isExchanged && (op.exchangedWith || op.remarks) && (
                                  <span
                                    className="text-[8.5px] font-mono text-purple-300 font-bold bg-purple-950/60 border border-purple-500/40 px-1 py-0.2 rounded truncate max-w-47.5"
                                    title={op.remarks || `Exchanged with ${op.exchangedWith}`}
                                  >
                                    {op.exchangedWith ? `⇄ ${op.exchangedWith}` : (op.remarks && op.remarks.includes("Exchanged with") ? op.remarks : '⇄ Exchanged')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Night Step (Leg 1) Details */}
                        <td className="px-2 py-2 text-slate-300">
                          <TimeCell t={r.signOnTime} />
                        </td>
                        <td className="px-2 py-2 text-emerald-400 font-bold">{r.signOnLocation || '--'}</td>
                        <td className="px-2 py-2 text-blue-300 font-bold">{r.nightTrainNo || '--'}</td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightDepTime} /></td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightArrTime} /></td>
                        <td className="px-2 py-2 text-slate-400 text-[10px]">{r.nightHandoverLoc || '--'}</td>
                        <td className="px-2 py-2 border-r border-slate-800 bg-blue-950/15">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-500/40 text-blue-300 font-mono font-bold text-[11px] shadow-sm">
                            {r.nightKms || 0} km
                          </span>
                        </td>

                        {/* Morning Takeover (Leg 3) Details */}
                        <td className="px-2 py-2 text-slate-400 text-[10px]">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStablingModal(r);
                              }}
                              className="font-bold text-slate-200 hover:text-cyan-300 hover:underline cursor-pointer transition select-text"
                              title="Click to select takeover location (all stations Up / Dn line)"
                            >
                              {r.takeoverLocation || '--'}
                            </span>
                            {r.isAlternativeStabling && (
                              <span className="text-[7.5px] text-amber-300 bg-amber-950/90 border border-amber-500/40 rounded px-1 font-bold">
                                Alt Stable (+{r.transitMinutes || 20}m)
                              </span>
                            )}
                            {(r.mornSignOnTime || r.calculatedSignOnTime) && (
                              <span className="text-[7.5px] text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 rounded px-1 font-mono" title="Morning 40-Min PDC Sign-On Time">
                                PDC S/ON: {String(r.mornSignOnTime || r.calculatedSignOnTime).slice(0, 5)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStablingModal(r);
                              }}
                              className="text-[8px] text-cyan-400 hover:text-cyan-200 underline cursor-pointer"
                              title="Click to override night stabling location & recalculate 40-min PDC"
                            >
                              Stabling ✎
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-amber-300 font-bold">{r.mornTrainNo || '--'}</td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornDepTime} /></td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornArrTime} /></td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.signOffTime} /></td>
                        <td className="px-2 py-2 text-amber-400 font-bold">{r.signOffLocation || '--'}</td>
                        <td className="px-2 py-2 border-r border-slate-800 bg-amber-950/15">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-[11px] shadow-sm ${
                            Number(r.mornKms) > 0 ? 'bg-amber-950/80 border border-amber-500/40 text-amber-300' : 'bg-slate-900 border border-slate-750 text-slate-500'
                          }`}>
                            {r.mornKms || 0} km
                          </span>
                        </td>

                        {/* Summary Metrics */}
                        <td className="px-2 py-2 bg-emerald-950/15">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 font-mono font-extrabold text-xs shadow-sm">
                            {r.totalKms || ((Number(r.nightKms) || 0) + (Number(r.mornKms) || 0))} km
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-300"><TimeCell t={r.dutyHrs} /></td>
                        <td className="px-2 py-2 text-cyan-300 font-bold"><TimeCell t={r.drivingHrs} /></td>
                      </tr>

                      {/* Expandable Crew Link & Leg Breakdown Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-950/95 border-b border-amber-500/40">
                          <td colSpan={19} className="p-3 text-left">
                            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <Route className="h-4 w-4 text-amber-400" />
                                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                                    Duty #{r.dutyNo} Crew Link &amp; Leg Kilometers Breakdown
                                  </span>
                                  <Badge color="blue">Line-2 Peenya Depot</Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-mono font-bold">
                                  <span className="bg-blue-950/80 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded">
                                    Leg 1: {r.nightKms || 0} km
                                  </span>
                                  <span className="text-slate-500">+</span>
                                  <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded">
                                    Leg 3: {r.mornKms || 0} km
                                  </span>
                                  <span className="text-slate-500">=</span>
                                  <span className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 px-2.5 py-0.5 rounded font-black">
                                    Total: {r.totalKms || ((Number(r.nightKms) || 0) + (Number(r.mornKms) || 0))} km
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] font-mono">
                                {/* Leg 1: Night Drive */}
                                <div className="bg-blue-950/30 border border-blue-800/60 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-blue-300 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                      <Moon className="h-3.5 w-3.5 text-blue-400" /> Leg 1: Night Run
                                    </span>
                                    <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded font-black text-xs">
                                      {r.nightKms || 0} KM
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10.5px]">
                                    <div><span className="text-slate-500">Train:</span> <span className="text-blue-300 font-bold">#{r.nightTrainNo || '--'}</span></div>
                                    <div><span className="text-slate-500">Sign On:</span> {r.signOnTime} @ <span className="text-emerald-400 font-semibold">{r.signOnLocation}</span></div>
                                    <div><span className="text-slate-500">Trip:</span> {r.nightDepTime} ➔ {r.nightArrTime} ({r.nightTripTime})</div>
                                    <div><span className="text-slate-500">Handover:</span> <span className="text-slate-200 font-semibold">{r.nightHandoverLoc || '--'}</span></div>
                                  </div>
                                </div>

                                {/* Leg 2: Mid-Shift Rest Break */}
                                <div className="bg-indigo-950/30 border border-indigo-800/60 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-indigo-300 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5 text-indigo-400" /> Leg 2: Rest / Stabling
                                    </span>
                                    <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-black text-xs">
                                      0 KM (Break)
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10.5px]">
                                    <div><span className="text-slate-500">From:</span> {r.nightHandoverLoc || '--'}</div>
                                    <div><span className="text-slate-500">To:</span> {r.takeoverLocation || '--'}</div>
                                    <div><span className="text-slate-500">Duration:</span> <span className="text-indigo-300 font-bold">{r.nightBreak || '--'}</span></div>
                                    <div className="text-slate-500 italic text-[10px]">Station / Depot Layover</div>
                                  </div>
                                </div>

                                {/* Leg 3: Morning Takeover Drive */}
                                <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-amber-300 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                      <Sun className="h-3.5 w-3.5 text-amber-400" /> Leg 3: Morning Run
                                    </span>
                                    <span className={`px-2 py-0.5 rounded font-black text-xs ${
                                      Number(r.mornKms) > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-500 border border-slate-700'
                                    }`}>
                                      {r.mornKms || 0} KM
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10.5px]">
                                    <div><span className="text-slate-500">Train:</span> <span className="text-amber-300 font-bold">{r.mornTrainNo !== '--' ? `#${r.mornTrainNo}` : 'PDC / Standby'}</span></div>
                                    <div><span className="text-slate-500">Takeover:</span> <span className="text-slate-200 font-semibold">{r.takeoverLocation}</span> ({r.mornDepTime})</div>
                                    <div><span className="text-slate-500">Trip:</span> {r.mornDepTime} ➔ {r.mornArrTime} ({r.mornTripTime})</div>
                                    <div><span className="text-slate-500">Sign Off:</span> {r.signOffTime} @ <span className="text-amber-400 font-semibold">{r.signOffLocation}</span></div>
                                  </div>
                                </div>

                                {/* Total Crew Link Summary */}
                                <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-emerald-300 font-bold uppercase text-[10px] flex items-center gap-1.5">
                                      <Zap className="h-3.5 w-3.5 text-emerald-400" /> Shift Totals
                                    </span>
                                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-black text-xs">
                                      {r.totalKms || ((Number(r.nightKms) || 0) + (Number(r.mornKms) || 0))} KM
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-slate-300 text-[10.5px]">
                                    <div><span className="text-slate-500">Duty Hours:</span> <span className="text-slate-200 font-bold">{r.dutyHrs || '--'}</span></div>
                                    <div><span className="text-slate-500">Driving Hours:</span> <span className="text-cyan-300 font-bold">{r.drivingHrs || '--'}</span></div>
                                    <div><span className="text-slate-500">Operator:</span> <span className="text-white font-bold">{r.operator?.empName || '--'}</span></div>
                                    <div><span className="text-slate-500">Leg Split:</span> <span className="text-blue-300 font-semibold">{r.nightKms || 0}km</span> + <span className="text-amber-300 font-semibold">{r.mornKms || 0}km</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-rose-400 italic">
            No changeover table matrix configured for {fromLabel} ➔ {toLabel}.
          </div>
        )}

        {/* Stabling Override Modal Prompt for Changeover Dashboard */}
        {stablingModalRow && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 font-mono text-slate-200 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black uppercase text-cyan-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Night Stabling &amp; 40-Min PDC Override
                </h3>
                <button
                  onClick={() => setStablingModalRow(null)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-955 p-3 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Duty Number:</span>
                    <strong className="text-emerald-400">{stablingModalRow.dutyNo}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Morning Train ID:</span>
                    <strong className="text-cyan-300">{stablingModalRow.mornTrainNo || '--'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Assigned Stabling Point:</span>
                    <strong className="text-amber-300">{stablingModalRow.assignedStablingLocation || stablingModalRow.takeoverLocation || 'DEPOT'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">WTT Revenue Departure:</span>
                    <strong className="text-slate-200">{stablingModalRow.mornDepTime || '05:15:00'}</strong>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Select Takeover / Stabling Location (Up &amp; Dn Line):
                    </label>
                    <span className="text-[9px] font-mono text-cyan-400">
                      {filteredStablingOptions.length} available
                    </span>
                  </div>

                  {/* Search station filter */}
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search station (e.g. Depot(PYID), PUTH, APTS, Up, Dn)..."
                      value={stablingSearch}
                      onChange={(e) => setStablingSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    {stablingSearch && (
                      <button
                        type="button"
                        onClick={() => setStablingSearch("")}
                        className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Quick Shortcut Pills */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStablingLoc("Depot (PYID)");
                        setStablingSearch("Depot");
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                        selectedStablingLoc.includes("Depot") || selectedStablingLoc.includes("DEPOT")
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                          : "bg-slate-900 text-slate-300 hover:text-white border-slate-700"
                      }`}
                    >
                      ⚡ Depot (PYID)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStablingLoc("NLC PKT");
                        setStablingSearch("NLC");
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                        selectedStablingLoc.includes("NLC PKT") || selectedStablingLoc === "NLC_PT"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                          : "bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700"
                      }`}
                    >
                      ⚡ NLC PKT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStablingLoc("MHLI PKT");
                        setStablingSearch("MHLI");
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                        selectedStablingLoc.includes("MHLI PKT") || selectedStablingLoc === "MHLI_PT"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                          : "bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700"
                      }`}
                    >
                      ⚡ MHLI PKT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStablingLoc("NGSA PKT");
                        setStablingSearch("NGSA");
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                        selectedStablingLoc.includes("NGSA PKT") || selectedStablingLoc === "NPKT" || selectedStablingLoc === "NGSA_PT"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                          : "bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700"
                      }`}
                    >
                      ⚡ NGSA PKT
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStablingLoc("PYID RD3");
                        setStablingSearch("RD3");
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                        selectedStablingLoc.includes("RD3") || selectedStablingLoc.includes("Road 3")
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                          : "bg-slate-900 text-emerald-400 hover:text-emerald-200 border-slate-700"
                      }`}
                    >
                      ⚡ PYID RD3
                    </button>
                    <button
                      type="button"
                      onClick={() => setStablingSearch("Up")}
                      className="px-2 py-0.5 rounded text-[9px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 cursor-pointer"
                    >
                      Up Line
                    </button>
                    <button
                      type="button"
                      onClick={() => setStablingSearch("Dn")}
                      className="px-2 py-0.5 rounded text-[9px] font-mono text-blue-400 hover:text-blue-300 bg-blue-950/40 border border-blue-800/40 cursor-pointer"
                    >
                      Dn Line
                    </button>
                    <button
                      type="button"
                      onClick={() => setStablingSearch("")}
                      className="px-2 py-0.5 rounded text-[9px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-700 cursor-pointer"
                    >
                      All
                    </button>
                  </div>

                  <select
                    value={selectedStablingLoc}
                    onChange={(e) => setSelectedStablingLoc(e.target.value)}
                    className="w-full bg-slate-955 border border-slate-700 rounded-lg p-2 text-xs text-purple-300 font-bold focus:border-cyan-500 focus:outline-none custom-scrollbar"
                    size={stablingSearch ? Math.min(8, Math.max(3, filteredStablingOptions.length)) : 6}
                  >
                    {Object.entries(groupedStablingOptions).map(([cat, opts]) => (
                      <optgroup key={cat} label={cat} className="bg-slate-900 text-cyan-400 font-bold py-1">
                        {opts.map(loc => (
                          <option key={loc.code} value={loc.code} className="bg-slate-955 text-slate-200 py-0.5">
                            {loc.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  <div className="flex items-center justify-between text-[10px] mt-1.5 text-slate-400 font-mono">
                    <span>Chosen: <strong className="text-amber-300 font-bold bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.5 rounded">{selectedStablingLoc}</strong></span>
                    {stablingSearch && (
                      <button
                        type="button"
                        onClick={() => setStablingSearch("")}
                        className="text-cyan-400 hover:text-cyan-200 underline text-[9.5px]"
                      >
                        Show All
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-cyan-955/30 border border-cyan-800/40 p-2.5 rounded-lg text-[10px] text-cyan-300 space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> 40-Min PDC Auto-Recalculation
                  </div>
                  <p className="text-slate-400">
                    Sign-On time will be recalculated automatically: WTT Revenue Departure minus 40m PDC minus transit positioning offset ({getTransitMinutes(selectedStablingLoc, stablingModalRow.assignedStablingLocation || 'DEPOT')}m).
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStablingModalRow(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStabling}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-4 py-2 rounded-lg text-xs uppercase tracking-wider shadow-md transition cursor-pointer"
                >
                  Apply Stabling &amp; Recalculate S/ON
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
