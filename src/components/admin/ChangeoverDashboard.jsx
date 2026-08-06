import React, { useState, useEffect, useMemo } from 'react';
import { triggerChangeover, revertToNormalRoster, CHANGEOVER_TABLE } from '../../services/changeoverService';
import { RefreshCw, Play, Shield, Moon, Sun, Calendar, CheckCircle2, ChevronDown, ChevronUp, Eye, X, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

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

const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    slate:  'bg-slate-700/50 text-slate-300 border-slate-600/30',
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

  useEffect(() => {
    let active = true;
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
    return () => { active = false; };
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

  // ── Perform Changeover ──
  const handlePerformChangeover = async () => {
    const fromLabel = DAY_OPTIONS.find(o => o.value === currentDay)?.label || currentDay;
    const toLabel = DAY_OPTIONS.find(o => o.value === nextDay)?.label || nextDay;
    if (!window.confirm(
      `Confirm Night Changeover:\n\n  Night Date & Roster: ${currentDate} (${fromLabel})\n  ➔\n  Target Morning Date & Roster: ${nextDate} (${toLabel})\n\nThis will merge night and morning duties into ACTIVE_RUN.`
    )) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      const result = await triggerChangeover(currentDay, nextDay);
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

  // ── Compute Preview Table ──
  const tableKey = `${currentDay}__${nextDay}`;
  const previewRows = useMemo(() => {
    const table = CHANGEOVER_TABLE[tableKey];
    if (!table) return [];
    return Object.entries(table)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dutyNo, row]) => ({ dutyNo, ...row }));
  }, [tableKey]);

  const hasData = previewRows.length > 0;

  // Summary stats
  const stats = useMemo(() => {
    if (!previewRows.length) return null;
    const totalNightKm = previewRows.reduce((s, r) => s + (r.nightKms || 0), 0);
    const totalMornKm = previewRows.reduce((s, r) => s + (r.mornKms || 0), 0);
    return { duties: previewRows.length, totalNightKm, totalMornKm, totalKm: totalNightKm + totalMornKm };
  }, [previewRows]);

  const fromLabel = DAY_OPTIONS.find(o => o.value === currentDay)?.label || currentDay;
  const toLabel = DAY_OPTIONS.find(o => o.value === nextDay)?.label || nextDay;

  return (
    <div className="flex flex-col gap-4 font-mono">

      {/* ─── Header Card ─── */}
      <div className="relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title & Secure Badge */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="text-slate-200 font-bold text-sm tracking-wide uppercase">Night Changeover Control</h3>
              <p className="text-[10px] text-slate-500">BMRCL Line 2 — Night to Morning Roster Merge</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-700 px-2.5 py-1 rounded text-[9px] font-bold text-slate-400">
            <Shield className="h-3 w-3 text-emerald-500" /> SECURE CONTROL
          </div>
        </div>

        {/* Active Run Status Banner */}
        <div className="text-[10px] bg-slate-950/60 border border-slate-800 p-3 rounded-lg flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold text-amber-400 uppercase tracking-wider">ACTIVE RUN: </span>
            <span className="text-slate-200 font-bold">{currentDay} Night</span>
            <span className="text-slate-500 mx-1.5">➔</span>
            <span className="text-slate-200 font-bold">{nextDay} Morning</span>
          </div>
          <span className="text-[9.5px] text-slate-500">
            {new Date().toLocaleString()}
          </span>
        </div>

        {/* Controls Grid: Date Pickers + Roster Selectors + Action Buttons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          
          {/* Current Night Date & Roster */}
          <div className="lg:col-span-5 space-y-1.5">
            <label className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Moon className="h-3 w-3 text-blue-400" /> Current Night Date & Roster
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={currentDate}
                onChange={(e) => handleCurrentDateChange(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              />
              <select
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
            <label className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
              <Sun className="h-3 w-3 text-amber-400" /> Tomorrow — Target Morning Date & Roster
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={nextDate}
                onChange={(e) => handleNextDateChange(e.target.value)}
                className="w-1/2 bg-slate-950 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              />
              <select
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
              className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:from-slate-800 disabled:to-slate-700 text-slate-950 disabled:text-slate-500 px-4 py-2 rounded-lg font-black uppercase text-[11px] tracking-wider transition shadow-md"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Execute Changeover
            </button>
            <button
              onClick={handleRevertRoster}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/80 px-3 py-1.5 rounded-lg font-bold uppercase text-[10px] tracking-wider transition"
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
          className="w-full px-5 py-3 flex items-center justify-between text-left bg-slate-950/40 hover:bg-slate-950/70 transition"
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

      {/* ─── Changeover Preview Table ─── */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden space-y-3 p-4">
        
        {/* Table Header & KM Badges */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <Eye className="h-4 w-4 text-slate-400" />
            <div>
              <span className="text-slate-200 font-bold text-xs uppercase tracking-wide">
                Changeover Preview
              </span>
              <span className="ml-2 text-[10px] text-slate-500">
                {fromLabel} <span className="text-amber-400">➔</span> {toLabel}
              </span>
            </div>
            <Badge color="amber">{previewRows.length} night duties</Badge>
          </div>

          {stats && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="bg-blue-950/40 border border-blue-800/60 px-3 py-1 rounded text-blue-300 font-bold">
                NIGHT KM: {stats.totalNightKm}
              </div>
              <div className="bg-amber-950/40 border border-amber-800/60 px-3 py-1 rounded text-amber-300 font-bold">
                MORN KM: {stats.totalMornKm}
              </div>
              <div className="bg-emerald-950/40 border border-emerald-800/60 px-3 py-1 rounded text-emerald-300 font-extrabold">
                TOTAL KM: {stats.totalKm}
              </div>
            </div>
          )}
        </div>

        {/* Table Grid */}
        {hasData ? (
          <div className="overflow-x-auto border border-slate-850 rounded-lg custom-scrollbar">
            <table className="w-full text-left text-[11px] font-mono border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[9.5px] border-b border-slate-800 text-center font-bold">
                  <th className="px-2.5 py-2 border-r border-slate-800 w-[50px]">#</th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-blue-400 bg-blue-950/20">Night Step</th>
                  <th colSpan="7" className="px-2.5 py-2 border-r border-slate-800 text-amber-400 bg-amber-950/20">Morning Takeover</th>
                  <th colSpan="3" className="px-2.5 py-2 text-emerald-400 bg-emerald-950/20">Summary</th>
                </tr>
                <tr className="bg-slate-955 text-slate-400 uppercase text-[9px] border-b border-slate-800 text-center">
                  <th className="px-2 py-1.5 border-r border-slate-800">Duty</th>
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
                {previewRows.map((r, idx) => (
                  <tr key={r.dutyNo || idx} className="hover:bg-slate-850/50 transition">
                    <td className="px-2 py-2 font-bold text-slate-100 border-r border-slate-800">{r.dutyNo}</td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.signOnTime} /></td>
                    <td className="px-2 py-2 text-emerald-400 font-bold">{r.signOnLocation || '--'}</td>
                    <td className="px-2 py-2 text-blue-300 font-bold">{r.nightTrainNo || '--'}</td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightDepTime} /></td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.nightArrTime} /></td>
                    <td className="px-2 py-2 text-slate-400 text-[10px]">{r.nightHandoverLoc || '--'}</td>
                    <td className="px-2 py-2 text-blue-400 font-bold border-r border-slate-800">{r.nightKms || 0}</td>
                    <td className="px-2 py-2 text-slate-400 text-[10px]">{r.takeoverLocation || '--'}</td>
                    <td className="px-2 py-2 text-amber-300 font-bold">{r.mornTrainNo || '--'}</td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornDepTime} /></td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.mornArrTime} /></td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.signOffTime} /></td>
                    <td className="px-2 py-2 text-amber-400 font-bold">{r.signOffLocation || '--'}</td>
                    <td className="px-2 py-2 text-amber-400 font-bold border-r border-slate-800">{r.mornKms || 0}</td>
                    <td className="px-2 py-2 text-emerald-400 font-extrabold text-xs">{r.totalKms || (r.nightKms + r.mornKms) || 0}</td>
                    <td className="px-2 py-2 text-slate-300"><TimeCell t={r.dutyHrs} /></td>
                    <td className="px-2 py-2 text-cyan-300 font-bold"><TimeCell t={r.drivingHrs} /></td>
                  </tr>
                ))}
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
