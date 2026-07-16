/**
 * MultiDayKMCalculator.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Proper multi-day Driving Hours & KM calculation for JMD use.
 *
 * Data sources (in priority order):
 *  1. CHANGEOVER_TABLE (from changeoverService.js) – authoritative for
 *     night→morning changeover duties: nightKms, mornKms, totalKms,
 *     drivingHrs, dutyHrs from the official Night Changeover.xlsx.
 *  2. crew_final_links (via dutiesByDayType already computed) – for
 *     day duties: reads leg times from the link roster.
 *  3. Station chainage fallback for any legs missing stored KM.
 *
 * Schedule type resolution:
 *  Monday    → MONDAY
 *  Tue–Fri   → WEEKDAY
 *  Saturday  → SATURDAY
 *  Sunday    → SUNDAY
 *  GH dates  → SATURDAY (user-marked overrides)
 * ─────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useCallback } from 'react';
import { CHANGEOVER_TABLE } from '../services/changeoverService';
import {
  Calendar, Play, Download, Plus, X, Moon, Sun, Clock,
  MapPin, TrendingUp, AlertTriangle, CheckCircle, RefreshCw
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
  if (secs < 0) return '--:--';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const legDurationHrs = (from, to) => {
  const s = parseSecs(from), e = parseSecs(to);
  if (s < 0 || e < 0) return 0;
  let diff = e - s;
  if (diff < 0) diff += 86400; // overnight
  return diff / 3600;
};

const legDurationSecs = (from, to) => {
  const s = parseSecs(from), e = parseSecs(to);
  if (s < 0 || e < 0) return 0;
  let diff = e - s;
  if (diff < 0) diff += 86400;
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

/* Schedule type from a date string "YYYY-MM-DD" */
const resolveScheduleType = (dateStr, ghDates = []) => {
  if (ghDates.includes(dateStr)) return 'SATURDAY';
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
const dateRange = (from, to) => {
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

/* Day name short */
const dayName = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase();

/* ─── Get changeover table key ───────────────────────────────────────── */
const getChangeoverKey = (currentType, nextType) => `${currentType}__${nextType}`;

/* ─── Calculate KM + hours for one day ──────────────────────────────── */
function computeDayRecord(dateStr, dutyNo, ghDates, dutiesByDayType) {
  const padded = String(dutyNo).trim().padStart(2, '0');
  const schedType = resolveScheduleType(dateStr, ghDates);
  const nextDateStr = nextDate(dateStr);
  const nextSchedType = resolveScheduleType(nextDateStr, ghDates);

  // Get the duty from the current day roster
  const dayDuties = dutiesByDayType[schedType] || [];
  const dutyObj = dayDuties.find(d => String(d.dutyId) === padded || String(d.dutyId) === String(dutyNo));
  const rawLink = dutyObj?.rawLink || null;

  // Determine if night duty by sign-on >= 19:00
  const signOnSecs = parseSecs(rawLink?.signOnTime || rawLink?.signOn);
  const isNight = signOnSecs >= 0 && signOnSecs >= 19 * 3600;

  // ── CHANGEOVER NIGHT: use CHANGEOVER_TABLE ────────────────────────
  if (isNight) {
    const tableKey = getChangeoverKey(schedType, nextSchedType);
    const table = CHANGEOVER_TABLE[tableKey];
    const changeoverRow = table?.[padded] || table?.[String(dutyNo)];

    if (changeoverRow) {
      // Authoritative data from changeover table
      const nightKm = Number(changeoverRow.nightKms) || 0;
      const mornKm = Number(changeoverRow.mornKms) || 0;
      const totalKm = Number(changeoverRow.totalKms) || (nightKm + mornKm);
      const drivingSecs = parseSecs(changeoverRow.drivingHrs);
      const dutySecs = parseSecs(changeoverRow.dutyHrs);

      return {
        dateStr,
        dayName: dayName(dateStr),
        schedType,
        nextSchedType,
        dutyNo: padded,
        isNight: true,
        isChangeover: true,
        signOn: changeoverRow.signOnTime || rawLink?.signOnTime || '--',
        signOff: changeoverRow.signOffTime || '--',
        signOnLoc: changeoverRow.signOnLocation || '--',
        signOffLoc: changeoverRow.signOffLocation || '--',
        // Night leg
        nightTrain: changeoverRow.nightTrainNo || '--',
        nightDep: changeoverRow.nightDepTime || '--',
        nightArr: changeoverRow.nightArrTime || '--',
        nightHandover: changeoverRow.nightHandoverLoc || '--',
        nightKm,
        // Morning leg
        mornTakeover: changeoverRow.takeoverLocation || '--',
        mornTrain: changeoverRow.mornTrainNo || '--',
        mornDep: changeoverRow.mornDepTime || '--',
        mornArr: changeoverRow.mornArrTime || '--',
        mornSignOff: changeoverRow.signOffTime || '--',
        mornKm,
        // Totals
        totalKm,
        drivingSecs: drivingSecs >= 0 ? drivingSecs : (nightKm + mornKm) * 60, // rough fallback
        dutySecs: dutySecs >= 0 ? dutySecs : 0,
        breakSecs: parseSecs(changeoverRow.breakTime) >= 0 ? parseSecs(changeoverRow.breakTime) : 0,
        source: 'CHANGEOVER_TABLE',
        // Leg breakdown
        legs: [
          { legNum: 1, train: changeoverRow.nightTrainNo, dep: changeoverRow.nightDepTime, arr: changeoverRow.nightArrTime, from: changeoverRow.signOnLocation, to: changeoverRow.nightHandoverLoc, km: nightKm, type: 'NIGHT' },
          { legNum: 2, train: changeoverRow.mornTrainNo, dep: changeoverRow.mornDepTime, arr: changeoverRow.mornArrTime, from: changeoverRow.takeoverLocation, to: changeoverRow.signOffLocation, km: mornKm, type: 'MORN' },
        ]
      };
    }
    // No changeover table entry — night duty but treated as regular
  }

  // ── REGULAR DAY DUTY: compute from link roster legs ───────────────
  if (!rawLink) {
    return {
      dateStr,
      dayName: dayName(dateStr),
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

  // Extract up to 4 legs from raw link
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
    // KM: try chainage calc from stations
    let km = tryKmFromStations(leg.from, leg.to);
    if (km === 0 && durSecs > 0) km = Math.round((durSecs / 3600) * 24); // ~24 km/h speed fallback
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
    dayName: dayName(dateStr),
    schedType,
    nextSchedType,
    dutyNo: padded,
    isNight: isNight,
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

/* ─── Badge component ────────────────────────────────────────────────── */
const Badge = ({ children, color = 'slate' }) => {
  const map = {
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    slate: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${map[color] || map.slate}`}>
      {children}
    </span>
  );
};

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
export default function MultiDayKMCalculator({ linkRoster, dutiesByDayType, secondsToHHMMSS }) {
  const today = new Date().toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [dutyNo, setDutyNo] = useState('');
  const [ghDateInput, setGhDateInput] = useState('');
  const [ghDates, setGhDates] = useState([]);
  const [results, setResults] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);

  /* Add a GH date */
  const addGhDate = () => {
    const d = ghDateInput.trim();
    if (!d) return;
    if (!ghDates.includes(d)) setGhDates(prev => [...prev, d].sort());
    setGhDateInput('');
  };

  /* Remove GH date */
  const removeGhDate = (d) => setGhDates(prev => prev.filter(x => x !== d));

  /* Run calculation */
  const runCalc = useCallback(() => {
    if (!dutyNo.trim()) return alert('Please enter a Duty Number.');
    if (fromDate > toDate) return alert('From date must be <= To date.');
    const dates = dateRange(fromDate, toDate);
    if (dates.length > 180) return alert('Maximum 180 days per calculation.');

    const rows = dates.map(d => computeDayRecord(d, dutyNo.trim(), ghDates, dutiesByDayType));
    setResults(rows);
    setExpandedDay(null);
  }, [dutyNo, fromDate, toDate, ghDates, dutiesByDayType]);

  /* Totals */
  const totals = useMemo(() => {
    if (!results) return null;
    return results.reduce((acc, r) => ({
      totalKm: acc.totalKm + r.totalKm,
      nightKm: acc.nightKm + (r.nightKm || 0),
      mornKm: acc.mornKm + (r.mornKm || 0),
      drivingSecs: acc.drivingSecs + r.drivingSecs,
      dutySecs: acc.dutySecs + r.dutySecs,
      changeovers: acc.changeovers + (r.isChangeover ? 1 : 0),
      daysWithData: acc.daysWithData + (r.source !== 'NO_DATA' ? 1 : 0),
    }), { totalKm: 0, nightKm: 0, mornKm: 0, drivingSecs: 0, dutySecs: 0, changeovers: 0, daysWithData: 0 });
  }, [results]);

  /* Excel export */
  const exportExcel = () => {
    if (!results) return;
    const sheetData = results.map(r => ({
      'Date': r.dateStr,
      'Day': r.dayName,
      'Schedule': r.schedType,
      'Duty No': r.dutyNo,
      'Type': r.isChangeover ? 'CHANGEOVER NIGHT' : r.isNight ? 'NIGHT' : 'DAY',
      'Sign On': r.signOn,
      'Sign On Loc': r.signOnLoc,
      'Sign Off': r.signOff,
      'Sign Off Loc': r.signOffLoc,
      'Night Train': r.isChangeover ? r.nightTrain : '--',
      'Night Dep': r.isChangeover ? r.nightDep : '--',
      'Night Arr': r.isChangeover ? r.nightArr : '--',
      'Night Handover': r.isChangeover ? r.nightHandover : '--',
      'Night KM': r.isChangeover ? r.nightKm : '--',
      'Morn Takeover Loc': r.isChangeover ? r.mornTakeover : '--',
      'Morn Train': r.isChangeover ? r.mornTrain : '--',
      'Morn Dep': r.isChangeover ? r.mornDep : '--',
      'Morn Arr': r.isChangeover ? r.mornArr : '--',
      'Morn KM': r.isChangeover ? r.mornKm : '--',
      'Total KM': r.totalKm,
      'Driving Hrs': secsToHHMM(r.drivingSecs),
      'Duty Hrs': secsToHHMM(r.dutySecs),
      'Source': r.source,
    }));

    // Summary row
    sheetData.push({});
    sheetData.push({
      'Date': 'TOTAL',
      'Day': `${results.length} days`,
      'Total KM': totals.totalKm,
      'Night KM (changeovers)': totals.nightKm,
      'Morn KM (changeovers)': totals.mornKm,
      'Driving Hrs': secsToHHMM(totals.drivingSecs),
      'Duty Hrs': secsToHHMM(totals.dutySecs),
      'Changeover Nights': totals.changeovers,
    });

    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Duty${dutyNo}_KM_Calc`);
    XLSX.writeFile(wb, `JMD_KM_Duty${dutyNo}_${fromDate}_to_${toDate}.xlsx`);
  };

  /* Schedule type color */
  const schedColor = (s) => ({
    WEEKDAY: 'cyan',
    MONDAY: 'violet',
    SATURDAY: 'amber',
    SUNDAY: 'emerald',
  }[s] || 'slate');

  /* Source pill */
  const sourceInfo = (src) => {
    if (src === 'CHANGEOVER_TABLE') return { label: 'Changeover Table ✓', color: 'emerald' };
    if (src === 'LINK_ROSTER') return { label: 'Link Roster', color: 'cyan' };
    return { label: 'No Data', color: 'rose' };
  };

  return (
    <div className="space-y-4">

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
        <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
          <TrendingUp className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-slate-200 font-black text-sm uppercase tracking-wide">Multi-Day KM & Driving Hours Calculator</h3>
          <p className="text-[10px] text-slate-500 font-mono">Uses Changeover Table (authoritative) + Link Roster data — all roster types & night duties</p>
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4">

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Duty Number */}
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1.5" htmlFor="multidaykmcalculator-field-1">
              Duty Number
            </label>
            <input id="multidaykmcalculator-i1" name="multidaykmcalculator-i1"
              type="text"
              value={dutyNo}
              onChange={e = id="multidaykmcalculator-field-1" name="multidaykmcalculator-field-1"> setDutyNo(e.target.value)}
              placeholder="e.g. 74"
              className="w-full bg-slate-950/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* From Date */}
          <div>
            <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1.5" htmlFor="multidaykmcalculator-field-2">
              <Calendar className="h-3 w-3" /> From Date
            </label>
            <input id="multidaykmcalculator-i2" name="multidaykmcalculator-i2"
              type="date"
              value={fromDate}
              onChange={e = id="multidaykmcalculator-field-2" name="multidaykmcalculator-field-2"> setFromDate(e.target.value)}
              className="w-full bg-slate-950/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1.5" htmlFor="multidaykmcalculator-field-3">
              <Calendar className="h-3 w-3" /> To Date
            </label>
            <input id="multidaykmcalculator-i3" name="multidaykmcalculator-i3"
              type="date"
              value={toDate}
              onChange={e = id="multidaykmcalculator-field-3" name="multidaykmcalculator-field-3"> setToDate(e.target.value)}
              className="w-full bg-slate-950/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Calculate */}
          <div className="flex flex-col justify-end">
            <button
              onClick={runCalc}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 px-5 py-2 rounded-lg font-black uppercase text-xs tracking-wider transition-all shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.35)]"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Calculate
            </button>
          </div>
        </div>

        {/* GH Date Manager */}
        <div className="border-t border-slate-800/60 pt-3 space-y-2">
          <label className="block text-[9px] text-amber-400 font-bold uppercase tracking-wider" htmlFor="multidaykmcalculator-field-4">
            Gazetted Holiday (GH) Dates — treated as Saturday schedule
          </label>
          <div className="flex gap-2">
            <input id="multidaykmcalculator-i4" name="multidaykmcalculator-i4"
              type="date"
              value={ghDateInput}
              onChange={e = id="multidaykmcalculator-field-4" name="multidaykmcalculator-field-4"> setGhDateInput(e.target.value)}
              className="flex-1 max-w-xs bg-slate-950/80 text-slate-200 border border-amber-700/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500 font-mono"
            />
            <button
              onClick={addGhDate}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600/20 text-amber-400 border border-amber-600/40 rounded-lg text-xs hover:bg-amber-600/30 transition font-bold"
            >
              <Plus className="h-3 w-3" /> Add GH
            </button>
          </div>
          {ghDates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ghDates.map(d => (
                <div key={d} className="flex items-center gap-1 px-2 py-0.5 bg-amber-950/40 text-amber-300 border border-amber-700/40 rounded text-[10px] font-mono">
                  {d}
                  <button onClick={() => removeGhDate(d)} className="text-amber-500 hover:text-amber-200 ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Results ─── */}
      {results && totals && (
        <div className="space-y-3">

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { label: 'Total KM', value: totals.totalKm, color: 'text-emerald-400', sub: `${totals.daysWithData}/${results.length} days data` },
              { label: 'Night KM', value: totals.nightKm, color: 'text-blue-400', sub: 'Changeover nights' },
              { label: 'Morn KM', value: totals.mornKm, color: 'text-amber-400', sub: 'Changeover mornings' },
              { label: 'Driving Hrs', value: secsToHHMM(totals.drivingSecs), color: 'text-cyan-400', sub: 'Total steering' },
              { label: 'Duty Hrs', value: secsToHHMM(totals.dutySecs), color: 'text-violet-400', sub: 'Sign on to off' },
              { label: 'Changeovers', value: totals.changeovers, color: 'text-rose-400', sub: 'Night→morning duties' },
            ].map(card => (
              <div key={card.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-0.5">
                <div className="text-[8.5px] text-slate-500 uppercase font-bold tracking-wider">{card.label}</div>
                <div className={`text-lg font-black font-mono ${card.color}`}>{card.value}</div>
                <div className="text-[8.5px] text-slate-600">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Export */}
          <div className="flex justify-end">
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-900/30 text-emerald-400 border border-emerald-700/50 rounded-lg text-[10px] font-bold hover:bg-emerald-900/50 transition"
            >
              <Download className="h-3.5 w-3.5" /> Export Excel
            </button>
          </div>

          {/* Detail Table */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800">
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Date</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Day</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Schedule</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Type</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Sign On</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Sign Off</th>
                    <th className="px-2 py-2 text-center text-[8.5px] text-blue-400 font-bold uppercase bg-blue-950/10">Night KM</th>
                    <th className="px-2 py-2 text-center text-[8.5px] text-amber-400 font-bold uppercase bg-amber-950/10">Morn KM</th>
                    <th className="px-2 py-2 text-center text-[8.5px] text-emerald-400 font-bold uppercase bg-emerald-950/10">Total KM</th>
                    <th className="px-2 py-2 text-center text-[8.5px] text-cyan-400 font-bold uppercase">Drive Hrs</th>
                    <th className="px-2 py-2 text-center text-[8.5px] text-violet-400 font-bold uppercase">Duty Hrs</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Source</th>
                    <th className="px-2 py-2 text-left text-[8.5px] text-slate-500 font-bold uppercase">Legs</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const isExpanded = expandedDay === r.dateStr;
                    const isEven = idx % 2 === 0;
                    const src = sourceInfo(r.source);
                    return (
                      <React.Fragment key={r.dateStr}>
                        <tr
                          className={`border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors cursor-pointer ${isEven ? 'bg-slate-900/20' : 'bg-slate-950/20'} ${r.isChangeover ? 'border-l-2 border-l-emerald-600/50' : ''}`}
                          onClick={() => setExpandedDay(isExpanded ? null : r.dateStr)}
                        >
                          <td className="px-2 py-1.5 font-bold text-slate-200">{r.dateStr}</td>
                          <td className="px-2 py-1.5 text-slate-400">{r.dayName}</td>
                          <td className="px-2 py-1.5">
                            <Badge color={schedColor(r.schedType)}>{r.schedType}</Badge>
                          </td>
                          <td className="px-2 py-1.5">
                            {r.isChangeover
                              ? <Badge color="emerald"><Moon className="h-2.5 w-2.5 inline mr-0.5" />Changeover</Badge>
                              : r.isNight
                              ? <Badge color="blue"><Moon className="h-2.5 w-2.5 inline mr-0.5" />Night</Badge>
                              : <Badge color="amber"><Sun className="h-2.5 w-2.5 inline mr-0.5" />Day</Badge>
                            }
                          </td>
                          <td className="px-2 py-1.5 text-slate-300">{r.signOn?.slice(0,5) || '--'}</td>
                          <td className="px-2 py-1.5 text-slate-300">{r.signOff?.slice(0,5) || '--'}</td>
                          <td className="px-2 py-1.5 text-center bg-blue-950/10 font-bold text-blue-300">
                            {r.isChangeover ? r.nightKm : <span className="text-slate-600">--</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center bg-amber-950/10 font-bold text-amber-300">
                            {r.isChangeover ? r.mornKm : <span className="text-slate-600">--</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center bg-emerald-950/10 font-bold text-emerald-300">
                            {r.totalKm > 0 ? r.totalKm : <span className="text-slate-600">0</span>}
                          </td>
                          <td className="px-2 py-1.5 text-center text-cyan-300 font-bold">
                            {r.drivingSecs > 0 ? secsToHHMM(r.drivingSecs) : '--'}
                          </td>
                          <td className="px-2 py-1.5 text-center text-violet-300 font-bold">
                            {r.dutySecs > 0 ? secsToHHMM(r.dutySecs) : '--'}
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge color={src.color}>{src.label}</Badge>
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 text-[9px]">
                            {r.legs.length > 0 ? `${r.legs.length} leg${r.legs.length > 1 ? 's' : ''} ▾` : '—'}
                          </td>
                        </tr>

                        {/* Expanded leg breakdown */}
                        {isExpanded && r.legs.length > 0 && (
                          <tr key={`${r.dateStr}-legs`} className="bg-slate-950/60">
                            <td colSpan={13} className="px-4 py-3">
                              <div className="space-y-1.5">
                                <div className="text-[9px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                                  <MapPin className="h-3 w-3" /> Leg-by-Leg Breakdown — Duty {r.dutyNo} on {r.dateStr}
                                </div>
                                <div className="grid gap-1.5">
                                  {r.legs.map(leg => (
                                    <div key={leg.legNum} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-[10px] font-mono ${leg.type === 'NIGHT' ? 'bg-blue-950/20 border-blue-800/30' : leg.type === 'MORN' ? 'bg-amber-950/20 border-amber-800/30' : 'bg-slate-900/40 border-slate-700/30'}`}>
                                      <span className={`font-black text-[9px] uppercase px-1.5 py-0.5 rounded ${leg.type === 'NIGHT' ? 'bg-blue-500/20 text-blue-300' : leg.type === 'MORN' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700/40 text-slate-300'}`}>
                                        LEG {leg.legNum}
                                      </span>
                                      <span className="text-slate-400">Train</span>
                                      <span className="font-bold text-slate-200">{leg.train || '--'}</span>
                                      <span className="text-slate-600">|</span>
                                      <span className="text-slate-400">{leg.from || '--'}</span>
                                      <span className="text-slate-600">→</span>
                                      <span className="text-slate-400">{leg.to || '--'}</span>
                                      <span className="text-slate-600">|</span>
                                      <span className="text-slate-400">{leg.dep?.slice(0,5) || '--'}</span>
                                      <span className="text-slate-600">–</span>
                                      <span className="text-slate-400">{leg.arr?.slice(0,5) || '--'}</span>
                                      <span className="text-slate-600">|</span>
                                      <span className={`font-black ${leg.type === 'NIGHT' ? 'text-blue-300' : leg.type === 'MORN' ? 'text-amber-300' : 'text-emerald-300'}`}>
                                        {leg.km} km
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {/* Day total */}
                                <div className="flex items-center justify-end gap-4 pt-1.5 border-t border-slate-800/40 text-[10px]">
                                  <span className="text-slate-500">Day Total:</span>
                                  <span className="font-black text-emerald-400">{r.totalKm} km</span>
                                  <span className="text-slate-500">Driving:</span>
                                  <span className="font-black text-cyan-400">{secsToHHMM(r.drivingSecs)}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                  <tr className="bg-slate-950/80 border-t-2 border-slate-700">
                    <td colSpan={6} className="px-2 py-2.5 text-[9px] font-black text-slate-400 uppercase">
                      TOTAL — Duty {dutyNo} · {results.length} days ({fromDate} → {toDate})
                    </td>
                    <td className="px-2 py-2.5 text-center bg-blue-950/20 font-black text-blue-300">{totals.nightKm}</td>
                    <td className="px-2 py-2.5 text-center bg-amber-950/20 font-black text-amber-300">{totals.mornKm}</td>
                    <td className="px-2 py-2.5 text-center bg-emerald-950/20 font-black text-emerald-300 text-sm">{totals.totalKm}</td>
                    <td className="px-2 py-2.5 text-center font-black text-cyan-300">{secsToHHMM(totals.drivingSecs)}</td>
                    <td className="px-2 py-2.5 text-center font-black text-violet-300">{secsToHHMM(totals.dutySecs)}</td>
                    <td colSpan={2} className="px-2 py-2.5 text-[9px] text-slate-500">{totals.changeovers} changeover night(s)</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/40">
            <span>🟢 Changeover Table = authoritative data from Night Changeover.xlsx</span>
            <span>🔵 Link Roster = computed from crew_final_links station data</span>
            <span>🔴 No Data = duty not found in loaded roster (check Firestore sync)</span>
            <span>Click any row to expand leg-by-leg breakdown</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-600 space-y-3">
          <TrendingUp className="h-10 w-10 opacity-30" />
          <p className="text-sm font-bold uppercase tracking-wide">Enter a duty number and date range, then click Calculate</p>
          <p className="text-[10px] text-slate-700 font-mono">Supports Weekday / Monday / Saturday / Sunday / GH duties + changeover night duties</p>
        </div>
      )}
    </div>
  );
}
