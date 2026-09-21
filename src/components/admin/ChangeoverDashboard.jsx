import React, { useState, useEffect, useMemo } from 'react';
import { triggerChangeover, revertToNormalRoster, CHANGEOVER_TABLE } from '../../services/changeoverService';
import { 
  RefreshCw, Play, Shield, Moon, Sun, Calendar, CheckCircle2, 
  ChevronDown, ChevronUp, Eye, X, AlertCircle, User, AlertTriangle, 
  Search, Cpu, Check, Filter, Zap, Radio
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, collection, onSnapshot, query } from 'firebase/firestore';

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

// Check if an operational record belongs to Night Shift
const isNightDutyRecord = (item) => {
  if (!item) return false;
  if (item.shift === 'N' || item.isNight === true) return true;
  const sOn = String(item.signOnTime || item.sOnTime || "");
  if (sOn) {
    const hr = parseInt(sOn.split(":")[0], 10);
    if (!isNaN(hr) && (hr >= 20 || hr < 5)) return true;
  }
  const code = String(item.dutyType || item.dutyCode || item.dutyId || "").toUpperCase();
  if (code.includes("NIGHT") || code.includes("NPRO")) return true;
  const num = parseInt(normalizeDutyNo(item.dutyId || item.dutyNo), 10);
  if (!isNaN(num) && num >= 64) return true;
  return false;
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
  const tomorrowStr = getNextDateStr(todayStr);

  // ── Date & Schedule States ──
  const [currentDate, setCurrentDate] = useState(todayStr);
  const [nextDate, setNextDate] = useState(tomorrowStr);
  const [currentDay, setCurrentDay] = useState(() => resolveDefaultDayType(todayStr));
  const [nextDay, setNextDay] = useState(() => resolveDefaultDayType(tomorrowStr));

  const [loading, setLoading] = useState(false);
  const [lastConfig, setLastConfig] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [ghAccordionOpen, setGhAccordionOpen] = useState(false);

  // ── Live Dispatch Gateway Core Synchronized States ──
  const [liveDeployments, setLiveDeployments] = useState([]);
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

  // ── Search and Filter Controls ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, ASSIGNED, UNASSIGNED, RELIEF_SWAP, ABNORMAL

  // ── Real-Time Sync with DISPATCH GATEWAY CORE & Settings ──
  useEffect(() => {
    let active = true;

    // 1. Load active roster configuration
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'system_settings', 'active_roster_config'));
        if (snap.exists() && active) {
          const data = snap.data();
          setLastConfig(data);
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

    return () => {
      active = false;
      unsubDeployments();
      unsubConsole();
      unsubMappings();
      unsubExchanges();
    };
  }, []);

  // ── Date Change Handlers ──
  const handleCurrentDateChange = (newDate) => {
    setCurrentDate(newDate);
    const resolvedCurrent = resolveDefaultDayType(newDate);
    setCurrentDay(resolvedCurrent);

    const autoNextDate = getNextDateStr(newDate);
    setNextDate(autoNextDate);
    setNextDay(resolveDefaultDayType(autoNextDate));
  };

  const handleNextDateChange = (newDate) => {
    setNextDate(newDate);
    setNextDay(resolveDefaultDayType(newDate));
  };

  // ── Algorithmic Shift Validation & Relief Engine Operator Resolver ──
  // Resolves ONLY Night Shift active on-duty Train Operator for the duty number & day type
  const resolveNightShiftOperator = (dutyNo, targetDay, targetDate) => {
    const normTargetDuty = normalizeDutyNo(dutyNo);
    const targetSched = normalizeSched(targetDay);

    // 1. Check Approved Shift / Duty Exchanges matching this duty
    const matchedExchange = (shiftExchanges || []).find((ex) => {
      const isApproved = ex.status === 'APPROVED' || ex.status === 'Operational' || Boolean(ex.isOperational);
      if (!isApproved) return false;
      const exDate = ex.exchangeDate || ex.date;
      const dateMatches = !targetDate || !exDate || exDate === targetDate;
      if (!dateMatches) return false;
      const d1 = normalizeDutyNo(ex.operator1Duty);
      const d2 = normalizeDutyNo(ex.operator2Duty);
      return d1 === normTargetDuty || d2 === normTargetDuty;
    });

    // 2. Search in liveDeployments (from crew_daily_deployment)
    const matchingDeployments = (liveDeployments || []).filter((d) => {
      const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
      if (dNo !== normTargetDuty) return false;
      const dSched = normalizeSched(d.scheduleType);
      const dDate = d.date || d.deploymentDate || d.rosterDate;
      const schedMatches =
        !dSched ||
        dSched === targetSched ||
        dSched === "ACTIVE_RUN" ||
        (targetDate && dDate === targetDate);
      return schedMatches;
    });

    // Prioritize deployments with special operational status (SWAP, EXCHANGE, RELIEF) and recent updates
    const sortedDeployments = [...matchingDeployments].sort((a, b) => {
      const aIsSpecial = (a.isSwapped || a.isExchanged || a.status === 'SWAPPED_BY_CC' || a.status === 'EXCHANGED' || a.status === 'RELIEF_DISPATCHED') ? 1 : 0;
      const bIsSpecial = (b.isSwapped || b.isExchanged || b.status === 'SWAPPED_BY_CC' || b.status === 'EXCHANGED' || b.status === 'RELIEF_DISPATCHED') ? 1 : 0;
      if (aIsSpecial !== bIsSpecial) return bIsSpecial - aIsSpecial;
      const tA = a.lastUpdated?.toMillis?.() || (a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0);
      const tB = b.lastUpdated?.toMillis?.() || (b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0);
      return tB - tA;
    });

    // Enforce Night Shift selection
    let activeDep = sortedDeployments.find(isNightDutyRecord) || sortedDeployments[0];

    // 3. Fallback to roster_desk_console current duties
    if (!activeDep && consoleData?.duties) {
      const matchingConsole = (consoleData.duties || []).filter((d) => {
        const dNo = normalizeDutyNo(d.dutyId || d.dutyNo);
        return dNo === normTargetDuty;
      });
      activeDep = matchingConsole.find(isNightDutyRecord) || matchingConsole[0];
    }

    // 4. Extract Active On-Duty Operator Name and Shift Validation Status
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
      activeName = isOp1 ? (matchedExchange.operator2Name || "UNASSIGNED") : (matchedExchange.operator1Name || "UNASSIGNED");
      activeEmpId = isOp1 ? (matchedExchange.operator2Id || "--") : (matchedExchange.operator1Id || "--");
    } else if (isRelieved && activeDep?.resolvedByEmpName) {
      activeName = activeDep.resolvedByEmpName;
      activeEmpId = activeDep.resolvedByEmpId || activeDep.empId || activeDep.empNo || "--";
    } else if (activeDep) {
      activeName = activeDep.empName || activeDep.name || activeDep.operatorName || "UNASSIGNED";
      activeEmpId = activeDep.empId || activeDep.empNo || activeDep.employeeId || "--";
    }

    const isUnassigned = !activeName || activeName === "UNASSIGNED" || activeName === "--";

    const exchangedWithInfo = matchedExchange
      ? (normTargetDuty === normalizeDutyNo(matchedExchange.operator1Duty) ? matchedExchange.operator1Name : matchedExchange.operator2Name)
      : "";

    return {
      empName: isUnassigned ? "UNASSIGNED" : activeName,
      empId: activeEmpId,
      status: activeDep?.status || (isExchanged ? "EXCHANGED" : isSwapped ? "SWAPPED_BY_CC" : (isUnassigned ? "PENDING" : "ACTIVE")),
      isRelief: isRelieved,
      isExchanged,
      isSwapped,
      isNR,
      isAB,
      isUnassigned,
      trainId: activeDep?.trainId || "--",
      remarks: activeDep?.remarks || (matchedExchange ? `Shift Exchanged with ${exchangedWithInfo}` : ""),
      swappedWith: activeDep?.swappedWith || "",
      swappedDutyId: activeDep?.swappedDutyId || "",
      exchangedWith: exchangedWithInfo,
      source: "DISPATCH_GATEWAY_CORE",
    };
  };

  // ── Compute Preview Table Rows with Night Shift Train Operators ──
  const tableKey = `${currentDay}__${nextDay}`;
  const previewRows = useMemo(() => {
    const baseTable = CHANGEOVER_TABLE[tableKey] || {};
    const overrideTable = changeoverOverrides[tableKey] || {};
    const mergedTable = { ...baseTable, ...overrideTable };

    if (!Object.keys(mergedTable).length) return [];

    return Object.entries(mergedTable)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dutyNo, row]) => {
        const operator = resolveNightShiftOperator(dutyNo, currentDay, currentDate);
        return {
          dutyNo,
          operator,
          ...row,
        };
      });
  }, [tableKey, changeoverOverrides, liveDeployments, consoleData, shiftExchanges, currentDay, currentDate]);

  const hasData = previewRows.length > 0;

  // ── Live Metrics and Statistics ──
  const stats = useMemo(() => {
    if (!previewRows.length) return null;
    const totalNightKm = previewRows.reduce((s, r) => s + (r.nightKms || 0), 0);
    const totalMornKm = previewRows.reduce((s, r) => s + (r.mornKms || 0), 0);
    return { duties: previewRows.length, totalNightKm, totalMornKm, totalKm: totalNightKm + totalMornKm };
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

  // ── Perform Changeover with Real-Time Active Operators ──
  const handlePerformChangeover = async () => {
    if (!window.confirm(
      `Confirm Night Changeover:\n\n  Night Date & Roster: ${currentDate} (${fromLabel})\n  ➔\n  Target Morning Date & Roster: ${nextDate} (${toLabel})\n\nThis will merge night and morning duties into ACTIVE_RUN with ${operatorStats.assigned}/${operatorStats.total} active Night Shift Train Operators from DISPATCH GATEWAY CORE.`
    )) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      // Build operator assignments map
      const operatorMap = {};
      previewRows.forEach(r => {
        if (r.operator && !r.operator.isUnassigned) {
          operatorMap[r.dutyNo] = r.operator;
        }
      });

      const result = await triggerChangeover(currentDay, nextDay, operatorMap);
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
              className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:from-slate-800 disabled:to-slate-700 text-slate-950 disabled:text-slate-500 px-4 py-2 rounded-lg font-black uppercase text-[11px] tracking-wider transition shadow-md cursor-pointer disabled:cursor-not-allowed"
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
              Night Shift Operators Synchronized
            </span>
          </div>

          {stats && (
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <div className="bg-blue-950/40 border border-blue-800/60 px-2.5 py-1 rounded text-blue-300 font-bold text-[11px]">
                NIGHT KM: {stats.totalNightKm}
              </div>
              <div className="bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded text-amber-300 font-bold text-[11px]">
                MORN KM: {stats.totalMornKm}
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/60 px-3 py-1 rounded text-emerald-300 font-extrabold text-[11px]">
                TOTAL KM: {stats.totalKm}
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
                  <th className="px-2.5 py-2 border-r border-slate-800 w-[45px]">#</th>
                  <th className="px-3 py-2 border-r border-slate-800 text-cyan-400 bg-cyan-950/20 text-left min-w-[210px]">
                    Night Shift Train Operator (Dispatch Gateway Core)
                  </th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-blue-400 bg-blue-950/20">Night Step</th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-amber-400 bg-amber-950/20">Morning Takeover</th>
                  <th colSpan="3" className="px-2.5 py-2 text-emerald-400 bg-emerald-950/20">Summary</th>
                </tr>
                <tr className="bg-slate-955 text-slate-400 uppercase text-[9px] border-b border-slate-800 text-center">
                  <th className="px-2 py-1.5 border-r border-slate-800">Duty</th>
                  <th className="px-3 py-1.5 border-r border-slate-800 text-left text-cyan-300">Active Operator Name &amp; ID</th>
                  <th className="px-2 py-1.5">Sign On</th>
                  <th className="px-2 py-1.5">Loc</th>
                  <th className="px-2 py-1.5 text-blue-400 font-bold">Train</th>
                  <th className="px-2 py-1.5">Dep</th>
                  <th className="px-2 py-1.5">Arr</th>
                  <th className="px-2 py-1.5">Handover</th>
                  <th className="px-2 py-1.5 border-r border-slate-800 text-blue-400">N.Km</th>
                  <th className="px-2 py-1.5">Takeover Loc</th>
                  <th className="px-2 py-1.5 text-amber-400 font-bold">Train</th>
                  <th className="px-2 py-1.5">Dep</th>
                  <th className="px-2 py-1.5">Arr</th>
                  <th className="px-2 py-1.5">Sign Off</th>
                  <th className="px-2 py-1.5">Off Loc</th>
                  <th className="px-2 py-1.5 border-r border-slate-800 text-amber-400">M.Km</th>
                  <th className="px-2 py-1.5 text-emerald-400 font-bold">Tot.Km</th>
                  <th className="px-2 py-1.5">Duty Hrs</th>
                  <th className="px-2 py-1.5">Drive Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-center">
                {filteredRows.map((r, idx) => {
                  const op = r.operator || {};
                  return (
                    <tr key={r.dutyNo || idx} className="hover:bg-slate-850/50 transition">
                      {/* Duty Number */}
                      <td className="px-2 py-2 font-bold text-slate-100 border-r border-slate-800">{r.dutyNo}</td>

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
                                  className="text-[8.5px] font-mono text-amber-300 font-bold bg-amber-950/60 border border-amber-500/40 px-1 py-0.2 rounded truncate max-w-[190px]"
                                  title={op.remarks || `Swapped with ${op.swappedWith || op.swappedDutyId}`}
                                >
                                  {op.swappedDutyId ? `⇄ Duty #${op.swappedDutyId}` : (op.swappedWith ? `⇄ ${op.swappedWith}` : '⇄ Swapped')}
                                </span>
                              )}

                              {op.isExchanged && (op.exchangedWith || op.remarks) && (
                                <span
                                  className="text-[8.5px] font-mono text-purple-300 font-bold bg-purple-950/60 border border-purple-500/40 px-1 py-0.2 rounded truncate max-w-[190px]"
                                  title={op.remarks || `Exchanged with ${op.exchangedWith}`}
                                >
                                  {op.exchangedWith ? `⇄ ${op.exchangedWith}` : (op.remarks && op.remarks.includes("Exchanged with") ? op.remarks : '⇄ Exchanged')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Night Step Details */}
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.signOnTime} /></td>
                      <td className="px-2 py-2 text-emerald-400 font-bold">{r.signOnLocation || '--'}</td>
                      <td className="px-2 py-2 text-blue-300 font-bold">{r.nightTrainNo || '--'}</td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightDepTime} /></td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightArrTime} /></td>
                      <td className="px-2 py-2 text-slate-400 text-[10px]">{r.nightHandoverLoc || '--'}</td>
                      <td className="px-2 py-2 text-blue-400 font-bold border-r border-slate-800">{r.nightKms || 0}</td>

                      {/* Morning Takeover Details */}
                      <td className="px-2 py-2 text-slate-400 text-[10px]">{r.takeoverLocation || '--'}</td>
                      <td className="px-2 py-2 text-amber-300 font-bold">{r.mornTrainNo || '--'}</td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornDepTime} /></td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornArrTime} /></td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.signOffTime} /></td>
                      <td className="px-2 py-2 text-amber-400 font-bold">{r.signOffLocation || '--'}</td>
                      <td className="px-2 py-2 text-amber-400 font-bold border-r border-slate-800">{r.mornKms || 0}</td>

                      {/* Summary Metrics */}
                      <td className="px-2 py-2 text-emerald-400 font-extrabold text-xs">{r.totalKms || (r.nightKms + r.mornKms) || 0}</td>
                      <td className="px-2 py-2 text-slate-300"><TimeCell t={r.dutyHrs} /></td>
                      <td className="px-2 py-2 text-cyan-300 font-bold"><TimeCell t={r.drivingHrs} /></td>
                    </tr>
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
      </div>
    </div>
  );
}
