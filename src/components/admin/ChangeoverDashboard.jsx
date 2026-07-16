import React, { useState, useEffect, useMemo } from 'react';
import { triggerChangeover, CHANGEOVER_TABLE } from '../../services/changeoverService';
import { RefreshCw, Play, ArrowRight, Shield, Moon, Sun, Train, Clock, MapPin, Hash, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

const DAY_OPTIONS = [
  { value: 'WEEKDAY',   label: 'Regular Weekday' },
  { value: 'MONDAY',    label: 'Monday Regular' },
  { value: 'MONDAY_GH', label: 'Monday GH' },
  { value: 'SATURDAY',  label: 'Saturday / GH' },
  { value: 'SUNDAY',    label: 'Sunday' },
];

// Which combinations have changeover data
const VALID_COMBOS = {
  'WEEKDAY__SATURDAY': true,
  'SATURDAY__SUNDAY':  true,
  'SUNDAY__MONDAY':    true,
  'SUNDAY__MONDAY_GH': true,
  'MONDAY_GH__WEEKDAY':true,
  'SATURDAY__WEEKDAY': true,
};

// Small badge
const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    green:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    slate:  'bg-slate-700/50 text-slate-300 border-slate-600/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${colors[color]}`}>
      {children}
    </span>
  );
};

const TimeCell = ({ t, dim }) => (
  <span className={`font-mono text-[10px] ${dim ? 'text-slate-500' : 'text-slate-200'}`}>
    {t && t !== '--' ? t.slice(0, 5) : <span className="text-slate-700">--:--</span>}
  </span>
);

export default function ChangeoverDashboard({ onRefresh }) {
  const [currentDay, setCurrentDay] = useState('WEEKDAY');
  const [nextDay,    setNextDay]    = useState('SATURDAY');
  const [loading,    setLoading]    = useState(false);
  const [lastConfig, setLastConfig] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'system_settings', 'active_roster_config'));
        if (snap.exists() && active) {
          const data = snap.data();
          setLastConfig(data);
          if (data.currentDay) setCurrentDay(data.currentDay);
          if (data.nextDay)    setNextDay(data.nextDay);
        }
      } catch (err) {
        console.error('Failed to load active roster config:', err);
      }
    };
    fetchConfig();
    return () => { active = false; };
  }, []);

  const handlePerformChangeover = async () => {
    const fromLabel = DAY_OPTIONS.find(o => o.value === currentDay)?.label || currentDay;
    const toLabel   = DAY_OPTIONS.find(o => o.value === nextDay)?.label   || nextDay;
    if (!window.confirm(
      `Confirm Night Changeover:\n\n  Night Roster : ${fromLabel}\n  ➔\n  Morning Roster: ${toLabel}\n\nThis will create ACTIVE_RUN duties by merging both rosters.`
    )) return;

    setLoading(true);
    try {
      const result = await triggerChangeover(currentDay, nextDay);
      alert(`✅ ${result}`);
      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (e) {
      alert('Changeover failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Compute preview table
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
    const totalNightKm  = previewRows.reduce((s, r) => s + (r.nightKms || 0), 0);
    const totalMornKm   = previewRows.reduce((s, r) => s + (r.mornKms  || 0), 0);
    return { duties: previewRows.length, totalNightKm, totalMornKm, totalKm: totalNightKm + totalMornKm };
  }, [previewRows]);

  const fromLabel = DAY_OPTIONS.find(o => o.value === currentDay)?.label || currentDay;
  const toLabel   = DAY_OPTIONS.find(o => o.value === nextDay)?.label   || nextDay;

  return (
    <div className="flex flex-col gap-4">

      {/* ─── Header Card ─── */}
      <div className="relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-2xl">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title row */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="text-slate-200 font-bold text-sm tracking-wide uppercase">Night Changeover Control</h3>
              <p className="text-[10px] text-slate-500 font-mono">BMRCL Line 2 — Night to Morning Roster Merge</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-slate-400">
            <Shield className="h-3 w-3 text-emerald-500" /> SECURE CONTROL
          </div>
        </div>

        {/* Last changeover info */}
        {lastConfig && (
          <div className="mb-4 text-[10px] font-mono bg-slate-950/40 border border-slate-700/50 p-2.5 rounded-lg flex items-center justify-between gap-2">
            <div>
              <span className="font-bold text-amber-400/80 uppercase">Active Run: </span>
              <span className="text-slate-300">{lastConfig.currentDay} Night</span>
              <span className="text-slate-500 mx-1">➔</span>
              <span className="text-slate-300">{lastConfig.nextDay} Morning</span>
            </div>
            {lastConfig.lastChangeover && (
              <span className="text-[9px] text-slate-500">
                {new Date(lastConfig.lastChangeover.seconds * 1000).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Selectors + Button */}
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
            {/* Night roster selector */}
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1.5" htmlFor="changeoverdashboard-field-1">
                <Moon className="h-3 w-3 text-blue-400" />
                Current Night Roster
              </label>
              <select id="changeoverdashboard-i1" name="changeoverdashboard-i1"
                value={currentDay}
                onChange={e = id="changeoverdashboard-field-1" name="changeoverdashboard-field-1"> setCurrentDay(e.target.value)}
                className="w-full bg-slate-950/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono"
              >
                {DAY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Morning roster selector */}
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1.5" htmlFor="changeoverdashboard-field-2">
                <Sun className="h-3 w-3 text-amber-400" />
                Next Morning Roster
              </label>
              <select id="changeoverdashboard-i2" name="changeoverdashboard-i2"
                value={nextDay}
                onChange={e = id="changeoverdashboard-field-2" name="changeoverdashboard-field-2"> setNextDay(e.target.value)}
                className="w-full bg-slate-950/80 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-mono"
              >
                {DAY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Execute button */}
          <button
            onClick={handlePerformChangeover}
            disabled={loading || !hasData}
            className="w-full xl:w-auto shrink-0 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-slate-800 disabled:to-slate-700 text-slate-950 disabled:text-slate-500 px-6 py-2.5 rounded-lg font-black uppercase text-xs tracking-wider transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] disabled:shadow-none disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            {loading ? 'Processing…' : 'Execute Changeover'}
          </button>
        </div>

        {/* No data warning */}
        {!hasData && (
          <div className="mt-3 p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-lg text-[10px] text-rose-400 font-mono">
            ⚠ No changeover table found for <strong>{fromLabel} → {toLabel}</strong>.
            Supported: Weekday→Saturday, Saturday→Sunday, Sunday→Monday/Monday GH, Monday GH→Weekday, Saturday→Weekday.
          </div>
        )}
      </div>

      {/* ─── Preview Table ─── */}
      {hasData && (
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden">

          {/* Preview header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-slate-400" />
              <div>
                <span className="text-slate-200 font-bold text-xs uppercase tracking-wide">
                  Changeover Preview
                </span>
                <span className="ml-2 text-[10px] font-mono text-slate-500">
                  {fromLabel}
                  <span className="text-amber-500 mx-1">➔</span>
                  {toLabel}
                </span>
              </div>
              <Badge color="amber">{previewRows.length} night duties</Badge>
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-3">
              <div className="text-center">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Night Km</div>
                <div className="text-blue-300 font-mono font-bold text-xs">{stats.totalNightKm}</div>
              </div>
              <div className="w-px h-6 bg-slate-700" />
              <div className="text-center">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Morn Km</div>
                <div className="text-amber-300 font-mono font-bold text-xs">{stats.totalMornKm}</div>
              </div>
              <div className="w-px h-6 bg-slate-700" />
              <div className="text-center">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Total Km</div>
                <div className="text-emerald-300 font-mono font-bold text-xs">{stats.totalKm}</div>
              </div>
              <div className="w-px h-6 bg-slate-700" />
              <button
                onClick={() => setPreviewOpen(o => !o)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                {previewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {previewOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="bg-slate-950/60">
                    {/* Duty */}
                    <th className="px-2 py-2 text-left text-[8.5px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-800 sticky left-0 bg-slate-950/90 z-10 min-w-[44px]">Duty</th>
                    {/* Night Side */}
                    <th colSpan={7} className="px-3 py-2 text-center text-[8.5px] font-bold text-blue-400 uppercase tracking-wider border-r border-blue-900/40 bg-blue-950/20">
                      <Moon className="h-2.5 w-2.5 inline mr-1" />Night Side
                    </th>
                    {/* Morning Side */}
                    <th colSpan={7} className="px-3 py-2 text-center text-[8.5px] font-bold text-amber-400 uppercase tracking-wider border-r border-amber-900/30 bg-amber-950/10">
                      <Sun className="h-2.5 w-2.5 inline mr-1" />Morning Takeover
                    </th>
                    {/* Summary */}
                    <th colSpan={3} className="px-3 py-2 text-center text-[8.5px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-950/10">
                      Summary
                    </th>
                  </tr>
                  <tr className="bg-slate-950/40 border-b border-slate-800">
                    <th className="px-2 py-1.5 text-left sticky left-0 bg-slate-950/90 z-10 text-slate-500">#</th>
                    {/* Night columns */}
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Sign On</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Loc</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Train</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Dep</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Arr</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/10 whitespace-nowrap">Handover</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-blue-950/20 border-r border-blue-900/40 whitespace-nowrap">N.Km</th>
                    {/* Morning columns */}
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Takeover Loc</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Train</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Dep</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Arr</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Sign Off</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/10 whitespace-nowrap">Off Loc</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-amber-950/20 border-r border-amber-900/30 whitespace-nowrap">M.Km</th>
                    {/* Summary */}
                    <th className="px-2 py-1.5 text-slate-500 bg-emerald-950/10 whitespace-nowrap">Tot.Km</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-emerald-950/10 whitespace-nowrap">Duty Hrs</th>
                    <th className="px-2 py-1.5 text-slate-500 bg-emerald-950/10 whitespace-nowrap">Drive Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => {
                    const isEven = idx % 2 === 0;
                    const rowBg = isEven ? 'bg-slate-900/20' : 'bg-slate-950/20';
                    // Compute duty/driving hours on-the-fly if not in data
                    const totalKm    = (row.nightKms || 0) + (row.mornKms || 0);
                    return (
                      <tr key={row.dutyNo} className={`${rowBg} hover:bg-slate-800/30 transition-colors border-b border-slate-800/40 group`}>
                        {/* Duty No */}
                        <td className={`px-2 py-1.5 sticky left-0 z-10 border-r border-slate-800 ${rowBg} group-hover:bg-slate-800/30 font-bold text-slate-200`}>
                          {row.dutyNo}
                        </td>

                        {/* ── Night side ── */}
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <TimeCell t={row.signOnTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <span className="text-blue-300 text-[9px] whitespace-nowrap">{row.signOnLocation || '--'}</span>
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <Badge color="blue">{row.nightTrainNo || '--'}</Badge>
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <TimeCell t={row.nightDepTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <TimeCell t={row.nightArrTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/10">
                          <span className="text-slate-400 text-[9px] whitespace-nowrap">{row.nightHandoverLoc || '--'}</span>
                        </td>
                        <td className="px-2 py-1.5 bg-blue-950/20 border-r border-blue-900/40">
                          <span className="text-blue-300 font-bold">{row.nightKms || 0}</span>
                        </td>

                        {/* ── Morning side ── */}
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <span className="text-amber-300 text-[9px] whitespace-nowrap">{row.takeoverLocation || '--'}</span>
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <Badge color="amber">{row.mornTrainNo || '--'}</Badge>
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <TimeCell t={row.mornDepTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <TimeCell t={row.mornArrTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <TimeCell t={row.signOffTime} />
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/10">
                          <span className="text-slate-400 text-[9px] whitespace-nowrap">{row.signOffLocation || '--'}</span>
                        </td>
                        <td className="px-2 py-1.5 bg-amber-950/20 border-r border-amber-900/30">
                          <span className="text-amber-300 font-bold">{row.mornKms || 0}</span>
                        </td>

                        {/* ── Summary ── */}
                        <td className="px-2 py-1.5 bg-emerald-950/10">
                          <span className="text-emerald-300 font-bold">{totalKm || row.totalKms || '--'}</span>
                        </td>
                        <td className="px-2 py-1.5 bg-emerald-950/10">
                          <TimeCell t={row.dutyHrs} dim={!row.dutyHrs || row.dutyHrs === '--'} />
                        </td>
                        <td className="px-2 py-1.5 bg-emerald-950/10">
                          <TimeCell t={row.drivingHrs} dim={!row.drivingHrs || row.drivingHrs === '--'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                  <tr className="bg-slate-950/80 border-t border-slate-700">
                    <td className="px-2 py-2 text-[9px] font-bold text-slate-400 uppercase sticky left-0 bg-slate-950/90 z-10">Total</td>
                    <td colSpan={6} className="bg-blue-950/10" />
                    <td className="px-2 py-2 bg-blue-950/20 border-r border-blue-900/40 font-bold text-blue-300">{stats.totalNightKm}</td>
                    <td colSpan={6} className="bg-amber-950/10" />
                    <td className="px-2 py-2 bg-amber-950/20 border-r border-amber-900/30 font-bold text-amber-300">{stats.totalMornKm}</td>
                    <td className="px-2 py-2 bg-emerald-950/10 font-bold text-emerald-300">{stats.totalKm}</td>
                    <td colSpan={2} className="bg-emerald-950/10" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
