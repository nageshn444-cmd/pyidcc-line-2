/**
 * MultiDayKMCalculator.jsx
 * ─────────────────────────────────────────────────────────────────────
 * High-precision Multi-Day Driving Hours & KM Calculator for BMRCL Line 2 JMD.
 *
 * Data sources (in priority order):
 *  1. CHANGEOVER_TABLE (from changeoverService.js) – authoritative for
 *     night→morning changeover duties: nightKms, mornKms, totalKms,
 *     drivingHrs, dutyHrs from official BMRCL changeover matrix.
 *  2. crew_final_links (via dutiesByDayType) – for day duties: reads
 *     leg times and stations directly from link roster.
 *  3. Station chainage fallback for any legs missing stored KM.
 * ─────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { CHANGEOVER_TABLE } from '../services/changeoverService';
import {
  Calendar, Play, Download, Plus, X, Moon, Sun, Clock,
  MapPin, TrendingUp, AlertTriangle, CheckCircle, RefreshCw,
  CheckSquare, Square, Layers, ShieldCheck, Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculateDistance } from '../utils/kmCalculator';

/* ─── Helpers ───────────────────────────────────────────────────────── */
const parseSecs = (tStr) => {
  if (!tStr || tStr === '--' || tStr === '-' || tStr === '') return -1;
  const parts = String(tStr).split(':').map(Number);
  if (parts.some(isNaN)) return -1;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const secsToHHMM = (secs) => {
  if (secs < 0 || isNaN(secs)) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const secsToHHMMSS = (secs) => {
  if (secs < 0 || isNaN(secs)) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const legDurationSecs = (from, to) => {
  const s = parseSecs(from), e = parseSecs(to);
  if (s < 0 || e < 0) return 0;
  let diff = e - s;
  if (diff < 0) diff += 86400; // overnight
  return diff;
};

const tryKmFromStations = (fromLoc, toLoc) => {
  if (!fromLoc || !toLoc || fromLoc === '--' || toLoc === '--') return 0;
  try {
    const d = calculateDistance(fromLoc, toLoc);
    return Math.round(d);
  } catch {
    return 0;
  }
};

/* Resolve default schedule type from a date string "YYYY-MM-DD" */
const resolveDefaultScheduleType = (dateStr, ghDates = []) => {
  const ghMatch = ghDates.find(g => g.date === dateStr);
  if (ghMatch) return ghMatch.overrideSchedule || 'SATURDAY';
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 0) return 'SUNDAY';
  if (day === 1) return 'MONDAY';
  if (day === 6) return 'SATURDAY';
  return 'WEEKDAY';
};

/* Next date string */
const nextDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

/* All dates in range inclusive */
const generateDateRange = (from, to) => {
  const dates = [];
  let cur = from;
  let limit = 0;
  while (cur <= to && limit < 366) {
    dates.push(cur);
    cur = nextDate(cur);
    limit++;
  }
  return dates;
};

/* Short Day Name */
const getDayName = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();

/* Changeover Table Key Generator */
const getChangeoverKey = (currentType, nextType) => `${currentType}__${nextType}`;

/* Compute calculation record for one day and one duty */
function computeDayDutyRecord(dateStr, dutyNo, dayConfigs, ghDates, dutiesByDayType) {
  const padded = String(dutyNo).trim().padStart(2, '0');
  const customConfig = dayConfigs[dateStr] || {};
  const schedType = customConfig.scheduleType || resolveDefaultScheduleType(dateStr, ghDates);
  const nextDateStr = nextDate(dateStr);
  const nextCustomConfig = dayConfigs[nextDateStr] || {};
  const nextSchedType = nextCustomConfig.scheduleType || resolveDefaultScheduleType(nextDateStr, ghDates);

  // Get the duty from the active roster day type
  const dayDuties = dutiesByDayType[schedType] || [];
  const dutyObj = dayDuties.find(d => String(d.dutyId) === padded || String(d.dutyId) === String(dutyNo));
  const rawLink = dutyObj?.rawLink || null;

  // Sign-on time check
  const signOnSecs = parseSecs(rawLink?.signOnTime || rawLink?.signOn);
  const isNightDuty = (signOnSecs >= 0 && signOnSecs >= 19 * 3600) || customConfig.isChangeover === true;

  // ── 1. CHANGEOVER NIGHT: Use Authoritative CHANGEOVER_TABLE ──
  if (isNightDuty || customConfig.isChangeover) {
    const tableKey = getChangeoverKey(schedType, nextSchedType);
    const table = CHANGEOVER_TABLE[tableKey];
    const changeoverRow = table?.[padded] || table?.[String(dutyNo)];

    if (changeoverRow) {
      const nightKm = Number(changeoverRow.nightKms) || 0;
      const mornKm = Number(changeoverRow.mornKms) || 0;
      const totalKm = Number(changeoverRow.totalKms) || (nightKm + mornKm);
      const drivingSecs = parseSecs(changeoverRow.drivingHrs);
      const dutySecs = parseSecs(changeoverRow.dutyHrs);

      return {
        dateStr,
        dayName: getDayName(dateStr),
        schedType,
        nextSchedType,
        dutyNo: padded,
        isNight: true,
        isChangeover: true,
        signOn: changeoverRow.signOnTime || rawLink?.signOnTime || '--',
        signOff: changeoverRow.signOffTime || '--',
        signOnLoc: changeoverRow.signOnLocation || '--',
        signOffLoc: changeoverRow.signOffLocation || '--',
        nightTrain: changeoverRow.nightTrainNo || '--',
        nightDep: changeoverRow.nightDepTime || '--',
        nightArr: changeoverRow.nightArrTime || '--',
        nightHandover: changeoverRow.nightHandoverLoc || '--',
        nightKm,
        mornTakeover: changeoverRow.takeoverLocation || '--',
        mornTrain: changeoverRow.mornTrainNo || '--',
        mornDep: changeoverRow.mornDepTime || '--',
        mornArr: changeoverRow.mornArrTime || '--',
        mornSignOff: changeoverRow.signOffTime || '--',
        mornKm,
        totalKm,
        drivingSecs: drivingSecs >= 0 ? drivingSecs : (nightKm + mornKm) * 60,
        dutySecs: dutySecs >= 0 ? dutySecs : 0,
        breakSecs: parseSecs(changeoverRow.breakTime) >= 0 ? parseSecs(changeoverRow.breakTime) : 0,
        source: 'CHANGEOVER_TABLE',
        legs: [
          { legNum: 1, train: changeoverRow.nightTrainNo, dep: changeoverRow.nightDepTime, arr: changeoverRow.nightArrTime, from: changeoverRow.signOnLocation, to: changeoverRow.nightHandoverLoc, km: nightKm, type: 'NIGHT' },
          { legNum: 2, train: changeoverRow.mornTrainNo, dep: changeoverRow.mornDepTime, arr: changeoverRow.mornArrTime, from: changeoverRow.takeoverLocation, to: changeoverRow.signOffLocation, km: mornKm, type: 'MORN' },
        ]
      };
    }
  }

  // ── 2. REGULAR DAY DUTY: Compute from Link Roster legs ──
  if (!rawLink) {
    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: padded,
      isNight: false,
      isChangeover: false,
      signOn: '--',
      signOff: '--',
      signOnLoc: '--',
      signOffLoc: '--',
      legs: [],
      nightKm: 0, mornKm: 0, totalKm: 0,
      drivingSecs: 0, dutySecs: 0, breakSecs: 0,
      source: 'NO_DATA'
    };
  }

  const legs = [];
  const legDefs = [
    { n: 1, train: rawLink.trainId, dep: rawLink.leg1TimeFrom, arr: rawLink.leg1TimeTo, from: rawLink.signOnLocation, to: rawLink.leg1HandoverLoc },
    { n: 2, train: rawLink.leg2TrainNo, dep: rawLink.leg2DepTime, arr: rawLink.leg2ArrTime, from: rawLink.leg2DepLoc, to: rawLink.leg2ArrLoc },
    { n: 3, train: rawLink.leg3TrainNo, dep: rawLink.leg3DepTime, arr: rawLink.leg3ArrTime, from: rawLink.leg3DepLoc, to: rawLink.leg3ArrLoc },
    { n: 4, train: rawLink.leg4TrainNo, dep: rawLink.leg4FinalDepTime, arr: rawLink.leg4FinalArrTime, from: rawLink.leg4FinalDepLoc, to: rawLink.leg4FinalArrLoc },
  ];

  let totalKm = 0;
  let totalDrivingSecs = 0;

  legDefs.forEach(leg => {
    const trainId = String(leg.train || '').trim();
    if (!trainId || trainId === '--' || trainId === '-') return;
    const durSecs = legDurationSecs(leg.dep, leg.arr);
    let km = tryKmFromStations(leg.from, leg.to);
    if (km === 0 && durSecs > 0) km = Math.round((durSecs / 3600) * 24);
    totalKm += km;
    totalDrivingSecs += durSecs;
    if (durSecs > 0 || km > 0) {
      legs.push({ legNum: leg.n, train: trainId, dep: leg.dep, arr: leg.arr, from: leg.from, to: leg.to, km, type: 'DAY' });
    }
  });

  const signOnSecs2 = parseSecs(rawLink.signOnTime || rawLink.signOn);
  const signOffSecs2 = parseSecs(rawLink.signOffTime);
  let dutySecs = 0;
  if (signOnSecs2 >= 0 && signOffSecs2 >= 0) {
    dutySecs = signOffSecs2 - signOnSecs2;
    if (dutySecs < 0) dutySecs += 86400;
  }

  return {
    dateStr,
    dayName: getDayName(dateStr),
    schedType,
    nextSchedType,
    dutyNo: padded,
    isNight: isNightDuty,
    isChangeover: false,
    signOn: rawLink.signOnTime || rawLink.signOn || '--',
    signOff: rawLink.signOffTime || '--',
    signOnLoc: rawLink.signOnLocation || '--',
    signOffLoc: rawLink.signOffLocation || '--',
    legs,
    nightKm: 0, mornKm: 0, totalKm,
    drivingSecs: totalDrivingSecs, dutySecs, breakSecs: Math.max(0, dutySecs - totalDrivingSecs),
    source: 'LINK_ROSTER'
  };
}

/* Badge Component */
const Badge = ({ children, color = 'slate' }) => {
  const colorMap = {
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    slate: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${colorMap[color] || colorMap.slate}`}>
      {children}
    </span>
  );
};

export default function MultiDayKMCalculator({ linkRoster, dutiesByDayType }) {
  const today = new Date().toISOString().split('T')[0];

  // ── 1. States ──
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  // Gazetted Holiday Overrides
  const [ghDateInput, setGhDateInput] = useState(today);
  const [ghOverrideSchedule, setGhOverrideSchedule] = useState('SATURDAY');
  const [ghDates, setGhDates] = useState([
    { date: '2026-08-15', overrideSchedule: 'SATURDAY' },
    { date: '2026-10-02', overrideSchedule: 'SATURDAY' }
  ]);

  // Selected Duty Numbers Grid
  const availableDutiesList = useMemo(() => {
    const set = new Set();
    // Default standard BMRCL Line 2 duties 01 to 79
    for (let i = 1; i <= 79; i++) {
      set.add(String(i).padStart(2, '0'));
    }
    // Also include duties found in link roster
    if (Array.isArray(linkRoster)) {
      linkRoster.forEach(l => {
        if (l.dutyId) set.add(String(l.dutyId).padStart(2, '0'));
      });
    }
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [linkRoster]);

  const [selectedDuties, setSelectedDuties] = useState([]);

  // Per-date Configuration in Range
  const datesInRange = useMemo(() => {
    if (fromDate > toDate) return [];
    return generateDateRange(fromDate, toDate);
  }, [fromDate, toDate]);

  const [dayConfigs, setDayConfigs] = useState({});

  // Initialize dayConfigs when datesInRange changes
  useEffect(() => {
    const newConfigs = { ...dayConfigs };
    datesInRange.forEach(d => {
      if (!newConfigs[d]) {
        const defaultSched = resolveDefaultScheduleType(d, ghDates);
        newConfigs[d] = {
          scheduleType: defaultSched,
          isChangeover: false
        };
      }
    });
    setDayConfigs(newConfigs);
  }, [datesInRange, ghDates]);

  // Calculated Results
  const [results, setResults] = useState(null);
  const [expandedRowKey, setExpandedRowKey] = useState(null);

  // ── 2. Duty Selection Actions ──
  const toggleDutySelect = (dNo) => {
    if (selectedDuties.includes(dNo)) {
      setSelectedDuties(prev => prev.filter(x => x !== dNo));
    } else {
      setSelectedDuties(prev => [...prev, dNo]);
    }
  };

  const handleSelectAllDuties = () => {
    setSelectedDuties([...availableDutiesList]);
  };

  const handleClearAllDuties = () => {
    setSelectedDuties([]);
  };

  // ── 3. Gazetted Holiday Actions ──
  const handleAddGhDate = () => {
    if (!ghDateInput) return;
    if (ghDates.some(g => g.date === ghDateInput)) {
      return alert("This date is already marked as a Gazetted Holiday.");
    }
    setGhDates(prev => [...prev, { date: ghDateInput, overrideSchedule: ghOverrideSchedule }].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const handleRemoveGhDate = (dateToRemove) => {
    setGhDates(prev => prev.filter(g => g.date !== dateToRemove));
  };

  // ── 4. Day Config Actions ──
  const handleDayScheduleChange = (dateStr, newSched) => {
    setDayConfigs(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {}),
        scheduleType: newSched
      }
    }));
  };

  const handleDayChangeoverToggle = (dateStr) => {
    setDayConfigs(prev => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {}),
        isChangeover: !prev[dateStr]?.isChangeover
      }
    }));
  };

  const handleAutoSelectChangeovers = () => {
    const updated = { ...dayConfigs };
    datesInRange.forEach(dStr => {
      // Auto enable changeover if it's Friday night -> Sat morning or marked night
      const dayNameShort = getDayName(dStr);
      if (dayNameShort === 'FRI' || dayNameShort === 'SAT' || dayNameShort === 'SUN') {
        updated[dStr] = { ...(updated[dStr] || {}), isChangeover: true };
      }
    });
    setDayConfigs(updated);
  };

  const handleEnableAllChangeovers = () => {
    const updated = { ...dayConfigs };
    datesInRange.forEach(dStr => {
      updated[dStr] = { ...(updated[dStr] || {}), isChangeover: true };
    });
    setDayConfigs(updated);
  };

  const handleClearAllChangeovers = () => {
    const updated = { ...dayConfigs };
    datesInRange.forEach(dStr => {
      updated[dStr] = { ...(updated[dStr] || {}), isChangeover: false };
    });
    setDayConfigs(updated);
  };

  // ── 5. Main Calculation Execution ──
  const handleCalculateRange = useCallback(() => {
    if (selectedDuties.length === 0) {
      return alert("Please select at least one Duty Number from the grid.");
    }
    if (fromDate > toDate) {
      return alert("From Date must be less than or equal to To Date.");
    }

    const calculatedRecords = [];
    datesInRange.forEach(dateStr => {
      selectedDuties.forEach(dutyNo => {
        const rec = computeDayDutyRecord(dateStr, dutyNo, dayConfigs, ghDates, dutiesByDayType);
        calculatedRecords.push(rec);
      });
    });

    setResults(calculatedRecords);
    setExpandedRowKey(null);
  }, [selectedDuties, fromDate, toDate, datesInRange, dayConfigs, ghDates, dutiesByDayType]);

  // ── 6. Totals Summary ──
  const totalsSummary = useMemo(() => {
    if (!results || results.length === 0) return null;
    return results.reduce((acc, r) => ({
      totalKm: acc.totalKm + r.totalKm,
      nightKm: acc.nightKm + (r.nightKm || 0),
      mornKm: acc.mornKm + (r.mornKm || 0),
      drivingSecs: acc.drivingSecs + r.drivingSecs,
      dutySecs: acc.dutySecs + r.dutySecs,
      changeovers: acc.changeovers + (r.isChangeover ? 1 : 0),
      validDays: acc.validDays + (r.source !== 'NO_DATA' ? 1 : 0)
    }), { totalKm: 0, nightKm: 0, mornKm: 0, drivingSecs: 0, dutySecs: 0, changeovers: 0, validDays: 0 });
  }, [results]);

  // ── 7. Export Handlers ──
  const exportToExcel = () => {
    if (!results || results.length === 0) return;
    const exportRows = results.map(r => ({
      "Date": r.dateStr,
      "Day": r.dayName,
      "Schedule": r.schedType,
      "Duty No": r.dutyNo,
      "Duty Type": r.isChangeover ? "CHANGEOVER NIGHT" : r.isNight ? "NIGHT" : "DAY",
      "Sign On Time": r.signOn,
      "Sign On Location": r.signOnLoc,
      "Sign Off Time": r.signOff,
      "Sign Off Location": r.signOffLoc,
      "Night Train": r.isChangeover ? r.nightTrain : "--",
      "Night KM": r.isChangeover ? r.nightKm : "--",
      "Morn Train": r.isChangeover ? r.mornTrain : "--",
      "Morn KM": r.isChangeover ? r.mornKm : "--",
      "Total KM": r.totalKm,
      "Driving Hours": secsToHHMMSS(r.drivingSecs),
      "Duty Hours": secsToHHMMSS(r.dutySecs),
      "Data Source": r.source
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "JMD_MultiDay_Report");
    XLSX.writeFile(wb, `BMRCL_JMD_MultiDay_Calculation_${fromDate}_to_${toDate}.xlsx`);
  };

  const exportToCSV = () => {
    if (!results || results.length === 0) return;
    const headers = ["Date", "Day", "Schedule", "Duty No", "Duty Type", "Sign On", "Sign Off", "Night KM", "Morn KM", "Total KM", "Driving Hours", "Duty Hours", "Source"];
    const csvRows = [headers.join(',')];
    results.forEach(r => {
      csvRows.push([
        `"${r.dateStr}"`,
        `"${r.dayName}"`,
        `"${r.schedType}"`,
        `"${r.dutyNo}"`,
        `"${r.isChangeover ? 'CHANGEOVER' : r.isNight ? 'NIGHT' : 'DAY'}"`,
        `"${r.signOn}"`,
        `"${r.signOff}"`,
        r.nightKm || 0,
        r.mornKm || 0,
        r.totalKm || 0,
        `"${secsToHHMMSS(r.drivingSecs)}"`,
        `"${secsToHHMMSS(r.dutySecs)}"`,
        `"${r.source}"`
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BMRCL_JMD_MultiDay_Report_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">

      {/* ── CARD 1: BMRCL MANUAL GAZETTED HOLIDAY OVERRIDES ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Calendar className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-amber-400 font-bold text-sm tracking-wider uppercase">
              BMRCL 2026 Manual Gazetted Holiday Overrides
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Marking a date as a Gazetted Holiday automatically maps it to the selected day-type timetable schedule.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <div>
            <label className="block text-[9.5px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              Add GH Date
            </label>
            <input
              type="date"
              value={ghDateInput}
              onChange={(e) => setGhDateInput(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-[9.5px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              On Schedule Day-Type Override
            </label>
            <select
              value={ghOverrideSchedule}
              onChange={(e) => setGhOverrideSchedule(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="SATURDAY">Saturday Schedule (Default)</option>
              <option value="SUNDAY">Sunday Schedule</option>
              <option value="WEEKDAY">Weekday Schedule</option>
            </select>
          </div>

          <button
            onClick={handleAddGhDate}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-600/30 text-amber-300 border border-amber-500/50 rounded font-bold text-xs hover:bg-amber-600/50 transition"
          >
            <Plus className="h-4 w-4" /> Add Gazetted Holiday
          </button>
        </div>

        {/* Active GH Dates Badges */}
        {ghDates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Active GH Overrides:</span>
            {ghDates.map(g => (
              <div key={g.date} className="flex items-center gap-1.5 bg-amber-950/40 text-amber-300 border border-amber-700/50 px-2.5 py-1 rounded text-xs">
                <span>{g.date}</span>
                <span className="text-[9px] bg-amber-900/60 px-1 rounded text-amber-200 font-bold">({g.overrideSchedule})</span>
                <button onClick={() => handleRemoveGhDate(g.date)} className="text-amber-400 hover:text-amber-100 ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CARD 2: MULTI-DAY KM & DRIVING HOURS CALCULATOR ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <TrendingUp className="h-5 w-5 text-emerald-400" />
          <div>
            <h3 className="text-emerald-400 font-bold text-sm tracking-wider uppercase">
              Multi-Day KM & Driving Hours Calculator
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Uses Changeover Table (authoritative) + Link Roster data - all roster types & night duties
            </p>
          </div>
        </div>

        {/* Duty Selection Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-2">
              Select Duties ({selectedDuties.length} Selected)
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAllDuties}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[10px] font-bold border border-slate-700"
              >
                SELECT ALL
              </button>
              <button
                onClick={handleClearAllDuties}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[10px] font-bold border border-slate-700"
              >
                CLEAR ALL
              </button>
            </div>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 gap-1.5 bg-slate-950/80 p-3 rounded-lg border border-slate-850 max-h-48 overflow-y-auto custom-scrollbar">
            {availableDutiesList.map(dNo => {
              const isSelected = selectedDuties.includes(dNo);
              return (
                <button
                  key={dNo}
                  onClick={() => toggleDutySelect(dNo)}
                  className={`py-1.5 text-xs font-bold rounded transition border ${
                    isSelected
                      ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500 shadow-sm'
                      : 'bg-slate-900 hover:bg-slate-850 text-slate-400 border-slate-800'
                  }`}
                >
                  {dNo}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Range & Main Action Button */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-slate-950/60 p-4 rounded-lg border border-slate-800">
          <div>
            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <button
              onClick={handleCalculateRange}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 py-2 rounded-lg font-black text-xs uppercase tracking-wider shadow-lg transition"
            >
              <Play className="h-4 w-4 fill-current" /> Calculate Range
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD 3: CONFIGURE DAYS IN RANGE (MARK TIMETABLE HOLIDAYS OR FORCE CHANGEOVERS) ── */}
      {datesInRange.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-cyan-400 font-bold text-xs tracking-wider uppercase">
                Configure Days In Range (Mark Timetable Holidays or Force Changeovers)
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAutoSelectChangeovers}
                className="px-2.5 py-1 bg-cyan-950 text-cyan-300 border border-cyan-800 hover:bg-cyan-900 rounded text-[9.5px] font-bold uppercase"
              >
                Auto-Select Changeover Legs
              </button>
              <button
                onClick={handleEnableAllChangeovers}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[9.5px] font-bold uppercase border border-slate-700"
              >
                Enable All
              </button>
              <button
                onClick={handleClearAllChangeovers}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[9.5px] font-bold uppercase border border-slate-700"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {datesInRange.map(dStr => {
              const cfg = dayConfigs[dStr] || { scheduleType: 'WEEKDAY', isChangeover: false };
              const dName = getDayName(dStr);
              return (
                <div key={dStr} className="bg-slate-950 border border-slate-850 p-3 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-200">
                    <span>{dStr}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">({dName})</span>
                  </div>

                  <div>
                    <select
                      value={cfg.scheduleType}
                      onChange={(e) => handleDayScheduleChange(dStr, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-bold focus:outline-none"
                    >
                      <option value="WEEKDAY">Weekday</option>
                      <option value="SATURDAY">Saturday Schedule</option>
                      <option value="SUNDAY">Sunday Schedule</option>
                      <option value="MONDAY">Monday Schedule</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={Boolean(cfg.isChangeover)}
                      onChange={() => handleDayChangeoverToggle(dStr)}
                      className="rounded accent-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-[10px] font-bold">Changeover</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CARD 4: MULTI-DAY CALCULATION RESULTS & SUMMARY ── */}
      {results && totalsSummary && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
            <h3 className="text-slate-100 font-bold text-xs tracking-wider uppercase">
              Multi-Day Calculation Results & Summary ({results.length} Duty-Day Records)
            </h3>
            <div className="flex gap-2">
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900 rounded text-xs font-bold"
              >
                <Download className="h-3.5 w-3.5" /> Export Excel
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-750 rounded text-xs font-bold"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
          </div>

          {/* Metric Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Total KM</span>
              <div className="text-lg font-bold text-emerald-400">{totalsSummary.totalKm} KM</div>
            </div>
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Night KM</span>
              <div className="text-lg font-bold text-blue-400">{totalsSummary.nightKm} KM</div>
            </div>
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Morn KM</span>
              <div className="text-lg font-bold text-amber-400">{totalsSummary.mornKm} KM</div>
            </div>
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Driving Hrs</span>
              <div className="text-lg font-bold text-cyan-400">{secsToHHMMSS(totalsSummary.drivingSecs)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Duty Hrs</span>
              <div className="text-lg font-bold text-violet-400">{secsToHHMMSS(totalsSummary.dutySecs)}</div>
            </div>
            <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] text-slate-500 font-bold uppercase">Changeovers</span>
              <div className="text-lg font-bold text-rose-400">{totalsSummary.changeovers}</div>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto border border-slate-850 rounded-lg custom-scrollbar">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[9.5px]">
                <tr>
                  <th className="px-3 py-2.5 border-b border-slate-800">Date</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Day</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Schedule</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 font-bold text-slate-200">Duty No</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Duty Type</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Sign On</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Sign Off</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 text-right text-blue-400">Night KM</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 text-right text-amber-400">Morn KM</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 text-right text-emerald-400 font-bold">Total KM</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 text-right text-cyan-400">Drive Hrs</th>
                  <th className="px-3 py-2.5 border-b border-slate-800 text-right text-violet-400">Duty Hrs</th>
                  <th className="px-3 py-2.5 border-b border-slate-800">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {results.map((r, idx) => {
                  const rowKey = `${r.dateStr}_${r.dutyNo}`;
                  const isExpanded = expandedRowKey === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => setExpandedRowKey(isExpanded ? null : rowKey)}
                        className={`hover:bg-slate-850/60 transition cursor-pointer ${
                          r.isChangeover ? 'bg-emerald-950/15' : ''
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-300 font-bold">{r.dateStr}</td>
                        <td className="px-3 py-2 text-slate-400">{r.dayName}</td>
                        <td className="px-3 py-2">
                          <Badge color={r.schedType === 'SATURDAY' ? 'amber' : r.schedType === 'SUNDAY' ? 'emerald' : 'cyan'}>
                            {r.schedType}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-100 text-xs">Duty #{r.dutyNo}</td>
                        <td className="px-3 py-2">
                          {r.isChangeover ? (
                            <Badge color="emerald"><Moon className="h-2.5 w-2.5 inline mr-1" />Changeover</Badge>
                          ) : r.isNight ? (
                            <Badge color="blue"><Moon className="h-2.5 w-2.5 inline mr-1" />Night</Badge>
                          ) : (
                            <Badge color="amber"><Sun className="h-2.5 w-2.5 inline mr-1" />Day</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <span className="text-emerald-400 font-bold">{r.signOnLoc}</span> @ {r.signOn}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <span className="text-amber-400 font-bold">{r.signOffLoc}</span> @ {r.signOff}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-blue-400">
                          {r.isChangeover ? `${r.nightKm} KM` : '--'}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-amber-400">
                          {r.isChangeover ? `${r.mornKm} KM` : '--'}
                        </td>
                        <td className="px-3 py-2 text-right font-extrabold text-emerald-400 text-xs">
                          {r.totalKm} KM
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-cyan-400">
                          {secsToHHMM(r.drivingSecs)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-violet-400">
                          {secsToHHMM(r.dutySecs)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge color={r.source === 'CHANGEOVER_TABLE' ? 'emerald' : r.source === 'LINK_ROSTER' ? 'cyan' : 'rose'}>
                            {r.source === 'CHANGEOVER_TABLE' ? 'Changeover Table ✓' : r.source === 'LINK_ROSTER' ? 'Link Roster' : 'No Data'}
                          </Badge>
                        </td>
                      </tr>

                      {/* Expanded Legs Breakdown */}
                      {isExpanded && r.legs && r.legs.length > 0 && (
                        <tr className="bg-slate-950/90 border-b border-slate-800">
                          <td colSpan={13} className="px-4 py-3">
                            <div className="space-y-2 text-xs font-mono">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                                Leg Breakdown for Duty #{r.dutyNo} on {r.dateStr}:
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {r.legs.map((leg, lIdx) => (
                                  <div key={lIdx} className="bg-slate-900 border border-slate-800 rounded p-2.5 space-y-1">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-200">
                                      <span>Leg {leg.legNum}: Train {leg.train}</span>
                                      <span className="text-emerald-400">{leg.km} KM</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      {leg.dep} → {leg.arr} ({leg.from} → {leg.to})
                                    </div>
                                  </div>
                                ))}
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
        </div>
      )}
    </div>
  );
}
