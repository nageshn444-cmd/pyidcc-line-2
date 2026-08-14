import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getChangeoverMappings } from '../../services/changeoverService';
import { Sliders, Shield, Save, Undo, Moon, Sun, Lock, Info, CheckCircle2, AlertCircle, Zap, Sparkles } from 'lucide-react';

const DAY_OPTIONS = [
  { value: 'WEEKDAY__SATURDAY',  label: 'Regular Weekday Night ➔ Saturday Morning' },
  { value: 'MONDAY__WEEKDAY',   label: 'Regular Monday Night ➔ Regular Weekday Morning' },
  { value: 'SATURDAY__SUNDAY',   label: 'Saturday Night ➔ Sunday Morning' },
  { value: 'SUNDAY__MONDAY',     label: 'Sunday Night ➔ Monday Morning' },
  { value: 'SUNDAY__MONDAY_GH',  label: 'Sunday Night ➔ Monday GH Morning' },
  { value: 'MONDAY_GH__WEEKDAY', label: 'Monday GH Night ➔ Regular Weekday Morning' },
  { value: 'SATURDAY__WEEKDAY',  label: 'Saturday Night ➔ Regular Weekday Morning' },
];

/* Helper to compute auto-selected key based on today's day of week */
const getAutoSelectedKey = () => {
  const day = new Date().getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  if (day === 0) return 'SUNDAY__MONDAY';
  if (day === 1) return 'MONDAY__WEEKDAY';
  if (day === 6) return 'SATURDAY__SUNDAY';
  return 'WEEKDAY__SATURDAY';
};

// Time math helpers
const toSec = (tStr) => {
  if (!tStr || tStr === "--" || tStr === "-" || tStr === "") return -1;
  const parts = String(tStr).trim().split(":").map(Number);
  if (parts.some(isNaN)) return -1;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const toTimeStr = (sec) => {
  if (sec < 0 || isNaN(sec)) return "--";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
};

export default function ChangeoverLink() {
  const [isAutoSelected, setIsAutoSelected] = useState(true);
  const [selectedKey, setSelectedKey] = useState(getAutoSelectedKey);
  const [allMappings, setAllMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedTable, setEditedTable] = useState({});
  const [statusMsg, setStatusMsg] = useState(null);

  // Handle manual dropdown selection
  const handleKeyChange = (val) => {
    setSelectedKey(val);
    setIsAutoSelected(false);
  };

  // Reset to auto selection mode
  const handleResetToAuto = () => {
    const autoKey = getAutoSelectedKey();
    setSelectedKey(autoKey);
    setIsAutoSelected(true);
    setStatusMsg({
      type: 'info',
      text: `Auto-selected changeover link for today's day transition: ${DAY_OPTIONS.find(o => o.value === autoKey)?.label}.`
    });
  };

  // Load all mappings from Firestore / fallback
  const loadMappings = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const data = await getChangeoverMappings();
      setAllMappings(data);
      setEditedTable(JSON.parse(JSON.stringify(data[selectedKey] || {})));
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to load changeover mappings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, []);

  // Update editedTable when selectedKey changes
  useEffect(() => {
    if (allMappings[selectedKey]) {
      setEditedTable(JSON.parse(JSON.stringify(allMappings[selectedKey])));
    } else {
      setEditedTable({});
    }
    setStatusMsg(null);
  }, [selectedKey, allMappings]);

  // Handle cell change and re-calculate derived metrics
  const handleCellChange = (dutyNo, field, val) => {
    setEditedTable(prev => {
      const copy = { ...prev };
      if (!copy[dutyNo]) {
        copy[dutyNo] = {};
      }
      copy[dutyNo][field] = val;

      const row = copy[dutyNo];
      const nK = Number(row.nightKms) || 0;
      const mK = Number(row.mornKms) || 0;
      if (nK > 0 || mK > 0) {
        row.totalKms = nK + mK;
      }

      return copy;
    });
  };

  // Revert changes for current key
  const handleDiscard = () => {
    if (!window.confirm('Discard your unsaved edits for this day transition?')) return;
    if (allMappings[selectedKey]) {
      setEditedTable(JSON.parse(JSON.stringify(allMappings[selectedKey])));
    }
    setStatusMsg({ type: 'info', text: 'Edits discarded. Reverted to last saved state.' });
  };

  // Save current key changes to Firestore
  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      // 1. Merge current edits back into allMappings
      const updatedAll = {
        ...allMappings,
        [selectedKey]: editedTable
      };

      // 2. Save entire changeover_mappings doc to Firestore
      const docRef = doc(db, 'system_settings', 'changeover_mappings');
      await setDoc(docRef, updatedAll);

      // 3. Update local state
      setAllMappings(updatedAll);
      setStatusMsg({ type: 'success', text: `Successfully saved mappings for ${DAY_OPTIONS.find(o => o.value === selectedKey)?.label}.` });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Failed to save mappings: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  // Sort rows numerically
  const rows = useMemo(() => {
    return Object.entries(editedTable)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dutyNo, data]) => ({ dutyNo, ...data }));
  }, [editedTable]);

  return (
    <div className="flex flex-col gap-4 p-1">
      {/* ─── Header Card ─── */}
      <div className="relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-2xl">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title row */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-slate-200 font-bold text-sm tracking-wide uppercase">Changeover Link Manager</h3>
              <p className="text-[10px] text-slate-500 font-mono">BMRCL Line 2 — Direct Mapping Excel Table Editor</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-slate-955/60 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-slate-400">
            <Lock className="h-3 w-3 text-amber-500" /> CONTROLLER WRITE ACCESS
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          {/* Dropdown selection with Auto vs Manual indicator */}
          <div className="flex flex-col gap-2 max-w-xl flex-1">
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider" htmlFor="changeover-link-combo-select">
                Select Roster Night Changeover Combo
              </label>
              <div className="flex items-center gap-2">
                {isAutoSelected ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[9.5px] font-mono font-bold">
                    <Zap className="h-3 w-3 text-emerald-400 animate-pulse" /> Auto-Selected (Today)
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[9.5px] font-mono font-bold">
                      ✏️ Manual Override
                    </span>
                    <button
                      onClick={handleResetToAuto}
                      className="inline-flex items-center gap-1 bg-emerald-955 hover:bg-emerald-900 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded text-[9.5px] font-mono font-bold transition cursor-pointer"
                      title="Reset to Auto Selection based on today's day transition"
                    >
                      <Sparkles className="h-3 w-3 text-emerald-400" /> Reset to Auto
                    </button>
                  </div>
                )}
              </div>
            </div>
            <select
              id="changeover-link-combo-select"
              value={selectedKey}
              onChange={e => handleKeyChange(e.target.value)}
              className="w-full bg-slate-955 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500 font-mono font-semibold cursor-pointer shadow-inner"
            >
              {DAY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleDiscard}
              disabled={loading || saving}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-slate-300 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition"
            >
              <Undo className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-slate-800 disabled:to-slate-700 text-slate-955 disabled:text-slate-500 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save Mappings'}
            </button>
          </div>
        </div>

        {/* Status banner */}
        {statusMsg && (
          <div className={`mt-3 p-3 rounded-lg border font-mono text-[11px] flex items-center gap-2 ${
            statusMsg.type === 'success' ? 'bg-emerald-955/40 border-emerald-700/40 text-emerald-300' :
            statusMsg.type === 'info'    ? 'bg-blue-955/40 border-blue-700/40 text-blue-300' :
                                           'bg-rose-955/40 border-rose-700/40 text-rose-400'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <div>{statusMsg.text}</div>
            <button onClick={() => setStatusMsg(null)} className="ml-auto text-slate-500 hover:text-slate-300">✕</button>
          </div>
        )}
      </div>

      {/* ─── Mappings Grid ─── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 font-mono text-xs">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
            Loading Changeover Mappings…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 font-mono text-xs gap-1.5">
            <Info className="h-6 w-6 text-slate-600" />
            No changeover configuration found for this day combination.
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-[10px] font-mono border-collapse select-none">
              <thead className="sticky top-0 bg-slate-955 z-20">
                <tr className="bg-slate-955 border-b border-slate-800">
                  {/* General */}
                  <th className="px-2.5 py-2 text-left text-[8.5px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-800 bg-slate-955 sticky left-0 z-30 min-w-[50px]">
                    Duty
                  </th>

                  {/* Night Side */}
                  <th colSpan={9} className="px-3 py-2 text-center text-[8.5px] font-bold text-blue-400 uppercase tracking-wider border-r border-blue-900/40 bg-blue-955/20">
                    <Moon className="h-2.5 w-2.5 inline mr-1 text-blue-400" /> Night Shift Side (Current Day)
                  </th>

                  {/* Morning Side */}
                  <th colSpan={9} className="px-3 py-2 text-center text-[8.5px] font-bold text-amber-400 uppercase tracking-wider border-r border-amber-900/30 bg-amber-955/15">
                    <Sun className="h-2.5 w-2.5 inline mr-1 text-amber-400" /> Morning Shift Side (Target Day)
                  </th>

                  {/* Summary */}
                  <th colSpan={4} className="px-3 py-2 text-center text-[8.5px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-955/15">
                    Roster Summary Metrics
                  </th>
                </tr>

                {/* Sub headers */}
                <tr className="bg-slate-955/80 border-b border-slate-800 text-[8px] text-slate-400">
                  <th className="px-2.5 py-1 text-left sticky left-0 bg-slate-955 z-30 border-r border-slate-800 text-slate-500">No.</th>
                  
                  {/* Night */}
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Sign On</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Sign On Loc</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Train No</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Time Frm</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Time To</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap text-cyan-300 font-bold">Trip Time</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap">Handover Loc</th>
                  <th className="px-2 py-1 bg-blue-955/10 whitespace-nowrap text-indigo-300 font-bold">Rest Break</th>
                  <th className="px-2 py-1 bg-blue-955/20 border-r border-blue-900/40 whitespace-nowrap font-bold text-blue-300">Night Kms</th>

                  {/* Morning */}
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap font-bold text-amber-300">Morn Kms</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Takeover Loc</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Train No</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Time Frm</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Time To</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap text-amber-300 font-bold">Trip Time</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Handover Loc</th>
                  <th className="px-2 py-1 bg-amber-955/10 whitespace-nowrap">Sign Off</th>
                  <th className="px-2 py-1 bg-amber-955/20 border-r border-amber-900/30 whitespace-nowrap">Sign Off Loc</th>

                  {/* Summary */}
                  <th className="px-2 py-1 bg-emerald-955/10 whitespace-nowrap text-emerald-300 font-bold">Total Kms</th>
                  <th className="px-2 py-1 bg-emerald-955/10 whitespace-nowrap text-slate-200 font-bold">Duty Hrs</th>
                  <th className="px-2 py-1 bg-emerald-955/10 whitespace-nowrap text-cyan-300 font-bold">Drive Hrs</th>
                  <th className="px-2 py-1 bg-emerald-955/20 whitespace-nowrap text-rose-300 font-bold">Break</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, idx) => {
                  const isEven = idx % 2 === 0;
                  const rowBg = isEven ? 'bg-slate-900/10' : 'bg-slate-955/10';

                  // Dynamic calculation of derived metrics for current row
                  const nDepSecs = toSec(row.nightDepTime);
                  const nArrSecs = toSec(row.nightArrTime);
                  let nTripSecs = -1;
                  if (nDepSecs >= 0 && nArrSecs >= 0) {
                    nTripSecs = nArrSecs < nDepSecs ? (nArrSecs + 86400 - nDepSecs) : (nArrSecs - nDepSecs);
                  }
                  const calcNightTripTime = (row.nightTripTime && row.nightTripTime !== '--') ? row.nightTripTime : toTimeStr(nTripSecs);

                  const mDepSecs = toSec(row.mornDepTime);
                  const mArrSecs = toSec(row.mornArrTime);
                  let mTripSecs = -1;
                  if (mDepSecs >= 0 && mArrSecs >= 0) {
                    mTripSecs = mArrSecs < mDepSecs ? (mArrSecs + 86400 - mDepSecs) : (mArrSecs - mDepSecs);
                  }
                  const calcMornTripTime = (row.mornTripTime && row.mornTripTime !== '--') ? row.mornTripTime : toTimeStr(mTripSecs);

                  let restBreakSecs = -1;
                  if (nArrSecs >= 0 && mDepSecs >= 0) {
                    restBreakSecs = mDepSecs < nArrSecs ? (mDepSecs + 86400 - nArrSecs) : (mDepSecs - nArrSecs);
                  }
                  const calcNightBreak = (row.nightBreak && row.nightBreak !== '--') ? row.nightBreak : toTimeStr(restBreakSecs);

                  const nK = Number(row.nightKms) || 0;
                  const mK = Number(row.mornKms) || 0;
                  const calcTotalKms = (row.totalKms && row.totalKms !== '--' && Number(row.totalKms) > 0)
                    ? Number(row.totalKms)
                    : (nK + mK > 0 ? nK + mK : (nK || mK || '--'));

                  const sOnSecs = toSec(row.signOnTime);
                  const sOffSecs = toSec(row.signOffTime);
                  let dutySecs = -1;
                  if (sOnSecs >= 0 && sOffSecs >= 0) {
                    dutySecs = sOffSecs < sOnSecs ? (sOffSecs + 86400 - sOnSecs) : (sOffSecs - sOnSecs);
                  }
                  const calcDutyHrs = (row.dutyHrs && row.dutyHrs !== '--') ? row.dutyHrs : toTimeStr(dutySecs);

                  let driveSecs = -1;
                  if (nTripSecs >= 0 || mTripSecs >= 0) {
                    driveSecs = (nTripSecs > 0 ? nTripSecs : 0) + (mTripSecs > 0 ? mTripSecs : 0);
                  }
                  const calcDrivingHrs = (row.drivingHrs && row.drivingHrs !== '--') ? row.drivingHrs : toTimeStr(driveSecs);

                  let breakSecs = -1;
                  if (dutySecs >= 0 && driveSecs >= 0) {
                    breakSecs = Math.max(0, dutySecs - driveSecs);
                  }
                  const calcBreakTime = (row.breakTime && row.breakTime !== '--') ? row.breakTime : toTimeStr(breakSecs);

                  const renderInputCell = (field, computedFallback, width = 'w-16', bg = '') => {
                    const rawVal = row[field];
                    const val = (rawVal !== undefined && rawVal !== '' && rawVal !== '--') ? rawVal : computedFallback;
                    return (
                      <td className={`p-1 border-b border-slate-800 ${bg}`}>
                        <input
                          type="text"
                          value={val === '--' ? '' : val}
                          placeholder="--"
                          onChange={e => handleCellChange(row.dutyNo, field, e.target.value)}
                          className={`bg-slate-955/50 hover:bg-slate-955/90 focus:bg-slate-955 border border-transparent focus:border-amber-600/40 text-slate-200 text-center font-mono rounded px-1.5 py-0.5 text-[9.5px] transition focus:outline-none ${width}`}
                        />
                      </td>
                    );
                  };

                  return (
                    <tr key={row.dutyNo} className={`${rowBg} hover:bg-slate-800/30 transition-colors group`}>
                      <td className={`px-2.5 py-1.5 sticky left-0 z-10 border-r border-slate-800 ${isEven ? 'bg-slate-900/90' : 'bg-slate-955/90'} group-hover:bg-slate-800/60 font-black text-slate-200`}>
                        {row.dutyNo}
                      </td>

                      {/* Night columns */}
                      {renderInputCell('signOnTime', row.signOnTime || '--', 'w-14', 'bg-blue-955/5')}
                      {renderInputCell('signOnLocation', row.signOnLocation || '--', 'w-20', 'bg-blue-955/5')}
                      {renderInputCell('nightTrainNo', row.nightTrainNo || '--', 'w-12', 'bg-blue-955/5')}
                      {renderInputCell('nightDepTime', row.nightDepTime || '--', 'w-14', 'bg-blue-955/5')}
                      {renderInputCell('nightArrTime', row.nightArrTime || '--', 'w-14', 'bg-blue-955/5')}
                      {renderInputCell('nightTripTime', calcNightTripTime, 'w-14', 'bg-blue-955/5 text-cyan-300 font-bold')}
                      {renderInputCell('nightHandoverLoc', row.nightHandoverLoc || '--', 'w-20', 'bg-blue-955/5')}
                      {renderInputCell('nightBreak', calcNightBreak, 'w-14', 'bg-blue-955/5 text-indigo-300 font-bold')}
                      {renderInputCell('nightKms', row.nightKms !== undefined ? row.nightKms : '--', 'w-12', 'bg-blue-955/15 border-r border-blue-900/40 font-bold text-blue-300')}

                      {/* Morning columns */}
                      {renderInputCell('mornKms', row.mornKms !== undefined ? row.mornKms : '--', 'w-12', 'bg-amber-955/5 font-bold text-amber-300')}
                      {renderInputCell('takeoverLocation', row.takeoverLocation || '--', 'w-20', 'bg-amber-955/5')}
                      {renderInputCell('mornTrainNo', row.mornTrainNo || '--', 'w-12', 'bg-amber-955/5')}
                      {renderInputCell('mornDepTime', row.mornDepTime || '--', 'w-14', 'bg-amber-955/5')}
                      {renderInputCell('mornArrTime', row.mornArrTime || '--', 'w-14', 'bg-amber-955/5')}
                      {renderInputCell('mornTripTime', calcMornTripTime, 'w-14', 'bg-amber-955/5 text-amber-300 font-bold')}
                      {renderInputCell('mornHandoverLoc', row.mornHandoverLoc || '--', 'w-20', 'bg-amber-955/5')}
                      {renderInputCell('signOffTime', row.signOffTime || '--', 'w-14', 'bg-amber-955/5')}
                      {renderInputCell('signOffLocation', row.signOffLocation || '--', 'w-20', 'bg-amber-955/15 border-r border-amber-900/30')}

                      {/* Roster Summary Metrics */}
                      {renderInputCell('totalKms', calcTotalKms, 'w-12', 'bg-emerald-955/5 font-bold text-emerald-300')}
                      {renderInputCell('dutyHrs', calcDutyHrs, 'w-16', 'bg-emerald-955/5 font-bold text-slate-200')}
                      {renderInputCell('drivingHrs', calcDrivingHrs, 'w-16', 'bg-emerald-955/5 font-bold text-cyan-300')}
                      {renderInputCell('breakTime', calcBreakTime, 'w-16', 'bg-emerald-955/10 font-bold text-rose-300')}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div className="flex items-start gap-2 bg-slate-955/40 border border-slate-800 p-3.5 rounded-lg text-[10px] text-slate-500 font-mono">
        <Info className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-400">💡 Excel Grid Edit Guide:</span>
          <ul className="list-disc pl-4 space-y-0.5 mt-1">
            <li>Any edits you make in the text boxes above will update local state immediately.</li>
            <li>Clicking <strong className="text-amber-400">Save Mappings</strong> commits the current day transition configuration directly to the database.</li>
            <li>Once saved, whenever a controller runs the Changeover Control execution for this combination, the roster generator will use your custom duty parameters.</li>
            <li>Total Kms, Duty Hrs, Driving Hrs, Trip Times, and Breaks are auto-computed from Night/Morning parameters inline!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
