import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getChangeoverMappings,
  enrichChangeoverTable,
  calculateStablingAndPdcSignOn,
  compileDynamicChangeoverLinks,
  findWttInductionForTrain,
  STABLING_LOCATIONS,
  PDC_DURATION_MINUTES,
  getTransitMinutes,
  CHANGEOVER_TABLE
} from '../../services/changeoverService';
import {
  Sliders,
  Shield,
  Save,
  Undo,
  Moon,
  Sun,
  Lock,
  Info,
  CheckCircle2,
  AlertCircle,
  Zap,
  Sparkles,
  Clock,
  Train,
  MapPin,
  RefreshCw,
  Compass,
  ArrowRight
} from 'lucide-react';

const DAY_OPTIONS = [
  { value: 'WEEKDAY__SATURDAY',  label: 'Regular Weekday Night ➔ Saturday Morning' },
  { value: 'MONDAY__WEEKDAY',   label: 'Regular Monday Night ➔ Regular Weekday Morning' },
  { value: 'SATURDAY__SUNDAY',   label: 'Saturday Night ➔ Sunday Morning' },
  { value: 'SUNDAY__MONDAY',     label: 'Sunday Night ➔ Monday Morning' },
  { value: 'SUNDAY__MONDAY_GH',  label: 'Sunday Night ➔ Monday GH Morning' },
  { value: 'MONDAY_GH__WEEKDAY', label: 'Monday GH Night ➔ Regular Weekday Morning' },
  { value: 'SATURDAY__WEEKDAY',  label: 'Saturday Night ➔ Regular Weekday Morning' },
  { value: 'WEEKDAY__WEEKDAY',   label: 'Weekday Night ➔ Weekday Morning' },
  { value: 'SATURDAY__SATURDAY',  label: 'Saturday Night ➔ Saturday Morning' },
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

// Check if a time string is STRICTLY above 20:00:01 (20:00:01 to 23:59:59)
const isNightSignOnTime = (tStr) => {
  const secs = toSec(tStr);
  return secs >= 72001;
};

export default function ChangeoverLink() {
  const [isAutoSelected, setIsAutoSelected] = useState(true);
  const [selectedKey, setSelectedKey] = useState(getAutoSelectedKey);
  const [allMappings, setAllMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [editedTable, setEditedTable] = useState({});
  const [statusMsg, setStatusMsg] = useState(null);

  // ── Stabling & PDC Calculator State ──
  const [calculatorDuty, setCalculatorDuty] = useState('64');
  const [calculatorTrain, setCalculatorTrain] = useState('210');
  const [actualStablingLoc, setActualStablingLoc] = useState('DEPOT');
  const [assignedStablingLoc, setAssignedStablingLoc] = useState('DEPOT');
  const [wttRevenueTime, setWttRevenueTime] = useState('05:15:00');
  const [calculatedResult, setCalculatedResult] = useState(null);

  // Modal for individual duty stabling override prompt
  const [stablingModalDuty, setStablingModalDuty] = useState(null);
  const [modalActualLoc, setModalActualLoc] = useState('DEPOT');

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
      // 1. Try fetching custom mappings from Firestore
      const snap = await getDoc(doc(db, 'system_settings', 'changeover_mappings'));
      let baseData = getChangeoverMappings();
      if (snap.exists()) {
        const firestoreData = snap.data();
        baseData = { ...baseData, ...firestoreData };
      }
      baseData = enrichChangeoverTable(baseData);

      // Sanitize all changeover night duty rows so signOnTime is strictly above 20:00:01
      Object.keys(baseData).forEach(k => {
        const tbl = baseData[k];
        if (tbl && typeof tbl === 'object') {
          Object.keys(tbl).forEach(dNo => {
            const r = tbl[dNo];
            if (r && typeof r === 'object') {
              if (!isNightSignOnTime(r.signOnTime)) {
                const staticSOn = CHANGEOVER_TABLE[k]?.[dNo]?.signOnTime || r.nightSignOnTime;
                if (isNightSignOnTime(staticSOn)) {
                  r.signOnTime = staticSOn;
                } else if (r.nightDepTime && isNightSignOnTime(r.nightDepTime)) {
                  r.signOnTime = toTimeStr(Math.max(72002, toSec(r.nightDepTime) - 1020));
                } else {
                  r.signOnTime = '21:30:00';
                }
              }
            }
          });
        }
      });

      setAllMappings(baseData);
      setEditedTable(JSON.parse(JSON.stringify(baseData[selectedKey] || {})));
    } catch (err) {
      console.error(err);
      const fallback = getChangeoverMappings();
      setAllMappings(fallback);
      setEditedTable(JSON.parse(JSON.stringify(fallback[selectedKey] || {})));
      setStatusMsg({ type: 'info', text: 'Loaded default Excel changeover template.' });
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

  // Derive target schedule day from selectedKey (e.g. "WEEKDAY__SATURDAY" -> "SATURDAY")
  const targetDayType = useMemo(() => {
    const parts = selectedKey.split('__');
    return parts[1] || 'SATURDAY';
  }, [selectedKey]);

  const sourceDayType = useMemo(() => {
    const parts = selectedKey.split('__');
    return parts[0] || 'WEEKDAY';
  }, [selectedKey]);

  // Sync calculator fields whenever duty changes or editedTable updates
  const handleSelectDutyForCalculator = useCallback((dutyNo) => {
    setCalculatorDuty(dutyNo);
    const row = editedTable[dutyNo];
    if (row) {
      const train = row.mornTrainNo || row.trainNo || '';
      setCalculatorTrain(train);
      const assigned = row.assignedStablingLocation || row.takeoverLocation || 'DEPOT';
      const actual = row.actualStablingLocation || row.takeoverLocation || assigned;
      setAssignedStablingLoc(assigned);
      setActualStablingLoc(actual);
      setWttRevenueTime(row.mornDepTime || '05:15:00');

      // Auto-run PDC calculation
      const res = calculateStablingAndPdcSignOn({
        trainId: train,
        stablingLocation: actual,
        assignedStablingLocation: assigned,
        revenueStartTime: row.mornDepTime || '05:15:00',
        targetScheduleType: targetDayType
      });
      setCalculatedResult(res);
    }
  }, [editedTable, targetDayType]);

  // Auto-fetch induction from WTT for calculator train
  const handleFetchWttInduction = () => {
    const hit = findWttInductionForTrain(calculatorTrain, targetDayType);
    if (hit) {
      setWttRevenueTime(hit.revenueStartTime);
      setAssignedStablingLoc(hit.inductionLocation);
      const res = calculateStablingAndPdcSignOn({
        trainId: calculatorTrain,
        stablingLocation: actualStablingLoc,
        assignedStablingLocation: hit.inductionLocation,
        revenueStartTime: hit.revenueStartTime,
        targetScheduleType: targetDayType
      });
      setCalculatedResult(res);
      setStatusMsg({
        type: 'info',
        text: `WTT Induction matched for Train ${calculatorTrain} on ${targetDayType}: Starts ${hit.revenueStartTime} at ${hit.inductionLocation}.`
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: `No WTT record found for Train ${calculatorTrain} on ${targetDayType}. Enter time manually.`
      });
    }
  };

  // Run PDC calculation manually from widget
  const handleRunPdcCalculation = () => {
    const res = calculateStablingAndPdcSignOn({
      trainId: calculatorTrain,
      stablingLocation: actualStablingLoc,
      assignedStablingLocation: assignedStablingLoc,
      revenueStartTime: wttRevenueTime,
      targetScheduleType: targetDayType
    });
    setCalculatedResult(res);
  };

  // Apply PDC calculator result directly to the current duty in editedTable
  const handleApplyPdcToRoster = () => {
    if (!calculatedResult || !calculatorDuty) return;

    let preservedNightSignOn = '21:30:00';
    setEditedTable(prev => {
      const copy = { ...prev };
      const current = copy[calculatorDuty] || {};
      const baseNightSignOn = CHANGEOVER_TABLE[selectedKey]?.[calculatorDuty]?.signOnTime || current.nightSignOnTime;
      preservedNightSignOn = isNightSignOnTime(current.signOnTime) ? current.signOnTime : (baseNightSignOn || '21:30:00');

      copy[calculatorDuty] = {
        ...current,
        signOnTime: preservedNightSignOn,
        nightSignOnTime: preservedNightSignOn,
        calculatedSignOnTime: calculatedResult.signOnTime,
        mornSignOnTime: calculatedResult.signOnTime,
        takeoverLocation: calculatedResult.actualStablingLocation,
        actualStablingLocation: calculatedResult.actualStablingLocation,
        assignedStablingLocation: calculatedResult.assignedStablingLocation,
        isAlternativeStabling: calculatedResult.isAlternativeStabling,
        transitMinutes: calculatedResult.transitMinutes,
        pdcMinutes: calculatedResult.pdcMinutes,
        mornDepTime: calculatedResult.revenueStartTime
      };
      return copy;
    });

    setStatusMsg({
      type: 'success',
      text: `Applied 40-Min PDC Sign-On (${calculatedResult.signOnTime}) to Morning Takeover for Duty ${calculatorDuty} (Stabling: ${calculatedResult.actualStablingLocation}). Leg 1 Night Sign-On preserved (${preservedNightSignOn}).`
    });
  };

  // Open single duty stabling override prompt modal
  const handleOpenStablingModal = (row) => {
    setStablingModalDuty(row);
    setModalActualLoc(row.actualStablingLocation || row.takeoverLocation || 'DEPOT');
  };

  // Confirm stabling override from modal
  const handleConfirmModalStabling = () => {
    if (!stablingModalDuty) return;
    const dutyNo = stablingModalDuty.dutyNo;
    const assigned = stablingModalDuty.assignedStablingLocation || stablingModalDuty.takeoverLocation || 'DEPOT';
    const revTime = stablingModalDuty.mornDepTime || '05:15:00';
    const trainNo = stablingModalDuty.mornTrainNo || stablingModalDuty.trainNo || '';

    const res = calculateStablingAndPdcSignOn({
      trainId: trainNo,
      stablingLocation: modalActualLoc,
      assignedStablingLocation: assigned,
      revenueStartTime: revTime,
      targetScheduleType: targetDayType
    });

    setEditedTable(prev => {
      const copy = { ...prev };
      const row = copy[dutyNo] || {};
      const baseNightSignOn = CHANGEOVER_TABLE[selectedKey]?.[dutyNo]?.signOnTime || row.nightSignOnTime;
      const preservedNightSignOn = isNightSignOnTime(row.signOnTime) ? row.signOnTime : (baseNightSignOn || '21:30:00');

      copy[dutyNo] = {
        ...row,
        signOnTime: preservedNightSignOn,
        nightSignOnTime: preservedNightSignOn,
        calculatedSignOnTime: res.signOnTime,
        mornSignOnTime: res.signOnTime,
        takeoverLocation: modalActualLoc,
        actualStablingLocation: modalActualLoc,
        assignedStablingLocation: assigned,
        isAlternativeStabling: res.isAlternativeStabling,
        transitMinutes: res.transitMinutes,
        pdcMinutes: res.pdcMinutes,
      };
      return copy;
    });

    setStablingModalDuty(null);
    setStatusMsg({
      type: 'success',
      text: `Duty ${dutyNo} updated: Stabled at ${modalActualLoc}. Morning Takeover PDC Sign-On: ${res.signOnTime} (${res.isAlternativeStabling ? `+${res.transitMinutes}m transit` : 'Assigned stabling'}).`
    });
  };

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

  // Auto-Compile entire changeover link for selected day transition
  const handleAutoCompile = async () => {
    setCompiling(true);
    setStatusMsg(null);
    try {
      const compiled = compileDynamicChangeoverLinks({
        fromDayType: sourceDayType,
        toDayType: targetDayType,
        stablingOverrides: {}
      });

      setEditedTable(JSON.parse(JSON.stringify(compiled)));
      setStatusMsg({
        type: 'success',
        text: `Dynamically compiled changeover matrix for ${sourceDayType} ➔ ${targetDayType} with 40-Min PDC engine.`
      });
    } catch (err) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Compilation failed: ' + err.message });
    } finally {
      setCompiling(false);
    }
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
      const updatedAll = {
        ...allMappings,
        [selectedKey]: editedTable
      };

      const docRef = doc(db, 'system_settings', 'changeover_mappings');
      await setDoc(docRef, updatedAll, { merge: true });

      setAllMappings(updatedAll);
      setStatusMsg({
        type: 'success',
        text: `Successfully saved changeover mappings & PDC stabling settings for ${DAY_OPTIONS.find(o => o.value === selectedKey)?.label}.`
      });
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
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Title row */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-slate-200 font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                <span>Dynamic Night Changeover &amp; Stabling PDC Terminal</span>
                <span className="text-[9px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded font-mono font-bold">
                  BMRCL LINE 2 CORE
                </span>
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">
                Automatic 40-Min Pre-Departure Check (PDC) Engine &amp; Day-Type Transition Compiler
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/fault-reporting"
              className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-200 px-3 py-1 rounded-lg text-[10px] font-bold font-mono tracking-wide uppercase transition shadow-sm"
              title="Open AI Faults & Incident Reporting Page"
            >
              <AlertCircle className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
              <span>AI Faults Report Page ➔</span>
            </Link>
            <div className="flex items-center gap-1 bg-slate-955/60 border border-slate-700 px-2 py-0.5 rounded text-[9px] font-mono font-bold text-slate-400">
              <Lock className="h-3 w-3 text-amber-500" /> CONTROLLER WRITE ACCESS
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          {/* Dropdown selection with Auto vs Manual indicator */}
          <div className="flex flex-col gap-2 max-w-xl flex-1">
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider" htmlFor="changeover-link-combo-select">
                Active Day-Type Transition Matrix
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoCompile}
              disabled={loading || compiling}
              className="flex items-center gap-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              title="Automatically recompile changeover links from Link Roster & WTT"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${compiling ? 'animate-spin' : ''}`} />
              {compiling ? 'Compiling...' : 'Auto-Compile Links'}
            </button>
            <button
              onClick={handleDiscard}
              disabled={loading || saving}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-slate-300 px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              <Undo className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={loading || saving}
              className="flex items-center gap-1.5 bg-linear-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-slate-800 disabled:to-slate-700 text-slate-955 disabled:text-slate-500 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md cursor-pointer"
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

      {/* ─── Alternative Stabling & 40-Min PDC Quick Control Engine ─── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 font-mono text-slate-200">
        <div className="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
              <Clock className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <span>Alternative Stabling &amp; 40-Min Pre-Departure Check (PDC) Engine</span>
              </h4>
              <p className="text-[10px] text-slate-400">
                Calculates mandatory Sign-On time = WTT Revenue Departure − 40 min PDC − Stabling Transit Offset
              </p>
            </div>
          </div>
          <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
            Rule: 40-Min PDC Mandatory
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-955 p-3.5 rounded-lg border border-slate-800/80 text-xs">
          {/* Duty Select */}
          <div>
            <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Select Duty No
            </label>
            <select
              value={calculatorDuty}
              onChange={(e) => handleSelectDutyForCalculator(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-emerald-300 font-bold focus:border-cyan-500 focus:outline-none"
            >
              {rows.map(r => (
                <option key={r.dutyNo} value={r.dutyNo}>Duty {r.dutyNo} (Morn Tr: {r.mornTrainNo || '--'})</option>
              ))}
            </select>
          </div>

          {/* Morning Train No */}
          <div>
            <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Morning Train No
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={calculatorTrain}
                onChange={(e) => setCalculatorTrain(e.target.value)}
                placeholder="210"
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-cyan-300 font-bold focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleFetchWttInduction}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 px-2 py-1 rounded text-[10px] font-bold transition shrink-0 cursor-pointer"
                title="Auto-fetch induction start time from WTT"
              >
                WTT 🔍
              </button>
            </div>
          </div>

          {/* Assigned Stabling Location */}
          <div>
            <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Assigned Stabling Loc
            </label>
            <select
              value={assignedStablingLoc}
              onChange={(e) => setAssignedStablingLoc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-amber-300 font-bold focus:border-cyan-500 focus:outline-none"
            >
              {Object.entries(
                STABLING_LOCATIONS.reduce((acc, loc) => {
                  const cat = loc.category || 'Other Locations';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(loc);
                  return acc;
                }, {})
              ).map(([cat, opts]) => (
                <optgroup key={cat} label={cat} className="bg-slate-900 text-cyan-400 font-bold">
                  {opts.map(loc => (
                    <option key={loc.code} value={loc.code} className="bg-slate-955 text-slate-200">{loc.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Actual Night Stabling Location */}
          <div>
            <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Actual Night Stabling
            </label>
            <select
              value={actualStablingLoc}
              onChange={(e) => setActualStablingLoc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-purple-300 font-bold focus:border-cyan-500 focus:outline-none"
            >
              {Object.entries(
                STABLING_LOCATIONS.reduce((acc, loc) => {
                  const cat = loc.category || 'Other Locations';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(loc);
                  return acc;
                }, {})
              ).map(([cat, opts]) => (
                <optgroup key={cat} label={cat} className="bg-slate-900 text-cyan-400 font-bold">
                  {opts.map(loc => (
                    <option key={loc.code} value={loc.code} className="bg-slate-955 text-slate-200">{loc.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* WTT Revenue Start Time */}
          <div>
            <label className="block text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              WTT Revenue Start
            </label>
            <input
              type="text"
              value={wttRevenueTime}
              onChange={(e) => setWttRevenueTime(e.target.value)}
              placeholder="05:15:00"
              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRunPdcCalculation}
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-2.5 px-4 rounded-lg tracking-wider uppercase shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-xs"
          >
            <Clock className="h-4 w-4" /> Calculate 40-Min PDC &amp; Sign-On Time
          </button>
          {calculatedResult && (
            <button
              type="button"
              onClick={handleApplyPdcToRoster}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-2.5 px-4 rounded-lg tracking-wider uppercase shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <CheckCircle2 className="h-4 w-4" /> Apply To Duty {calculatorDuty} Roster
            </button>
          )}
        </div>

        {/* Calculation Result Display */}
        {calculatedResult && (
          <div className="bg-slate-955 border border-cyan-500/40 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                PDC Calculation Result for Duty {calculatorDuty} (Train {calculatorTrain})
              </span>
              <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700 text-[10px] font-black px-2.5 py-0.5 rounded uppercase">
                Verified by WTT Engine
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[9.5px] block uppercase font-bold">Calculated Sign-On (S/ON)</span>
                <strong className="text-emerald-400 text-base">{calculatedResult.signOnTime}</strong>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[9.5px] block uppercase font-bold">Pre-Departure Check (PDC)</span>
                <strong className="text-cyan-300 text-base">{calculatedResult.pdcMinutes} Minutes</strong>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[9.5px] block uppercase font-bold">Stabling Transit Positioning</span>
                <strong className={calculatedResult.isAlternativeStabling ? "text-amber-400 font-bold text-base" : "text-slate-400 text-sm"}>
                  {calculatedResult.isAlternativeStabling ? `+${calculatedResult.transitMinutes} Mins Transit` : 'Standard Stabling (0m)'}
                </strong>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 text-[9.5px] block uppercase font-bold">Stabling Point</span>
                <strong className="text-purple-300 text-sm">
                  {calculatedResult.actualStablingLocation}
                  {calculatedResult.isAlternativeStabling && (
                    <span className="text-[10px] text-amber-400 block font-normal">
                      (Assigned: {calculatedResult.assignedStablingLocation})
                    </span>
                  )}
                </strong>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>{calculatedResult.calculationBreakdown}</span>
            </div>
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
            No changeover configuration found for this day combination. Click &quot;Auto-Compile Links&quot; above.
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <datalist id="changeover-stabling-locations">
              {STABLING_LOCATIONS.map(loc => (
                <option key={loc.code} value={loc.code}>{loc.name}</option>
              ))}
            </datalist>
            <table className="w-full text-[10px] font-mono border-collapse select-none">
              <thead className="sticky top-0 bg-slate-955 z-20">
                <tr className="bg-slate-955 border-b border-slate-800">
                  {/* General */}
                  <th className="px-2.5 py-2 text-left text-[8.5px] font-bold text-slate-500 uppercase tracking-wider border-r border-slate-800 bg-slate-955 sticky left-0 z-30 min-w-12.5">
                    Duty
                  </th>

                  {/* Stabling & PDC Engine */}
                  <th colSpan={3} className="px-2.5 py-2 text-center text-[8.5px] font-bold text-cyan-400 uppercase tracking-wider border-r border-cyan-900/40 bg-cyan-955/20">
                    <Clock className="h-2.5 w-2.5 inline mr-1 text-cyan-400" /> 40-Min PDC &amp; Stabling
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

                  {/* PDC & Stabling */}
                  <th className="px-2 py-1 bg-cyan-955/20 whitespace-nowrap text-cyan-300 font-bold">Stabling Loc</th>
                  <th className="px-2 py-1 bg-cyan-955/20 whitespace-nowrap text-cyan-300 font-bold">PDC / Transit</th>
                  <th className="px-2 py-1 bg-cyan-955/20 border-r border-cyan-900/40 whitespace-nowrap text-cyan-300 font-bold">Action</th>

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
                          list={field === 'takeoverLocation' ? 'changeover-stabling-locations' : undefined}
                          onChange={e => handleCellChange(row.dutyNo, field, e.target.value)}
                          className={`bg-slate-955/50 hover:bg-slate-955/90 focus:bg-slate-955 border border-transparent focus:border-amber-600/40 text-slate-200 text-center font-mono rounded px-1.5 py-0.5 text-[9.5px] transition focus:outline-none ${width}`}
                        />
                      </td>
                    );
                  };

                  const actualLoc = row.actualStablingLocation || row.takeoverLocation || 'DEPOT';
                  const isAlt = Boolean(row.isAlternativeStabling);

                  return (
                    <tr key={row.dutyNo} className={`${rowBg} hover:bg-slate-800/30 transition-colors group`}>
                      <td className={`px-2.5 py-1.5 sticky left-0 z-10 border-r border-slate-800 ${isEven ? 'bg-slate-900/90' : 'bg-slate-955/90'} group-hover:bg-slate-800/60 font-black text-slate-200`}>
                        {row.dutyNo}
                      </td>

                      {/* Stabling & PDC Columns */}
                      <td className="px-2 py-1.5 border-b border-slate-800 bg-cyan-955/5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded text-[9px] ${
                          isAlt ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300'
                        }`}>
                          <MapPin className="h-2.5 w-2.5" /> {actualLoc}
                        </span>
                      </td>

                      <td className="px-2 py-1.5 border-b border-slate-800 bg-cyan-955/5 whitespace-nowrap">
                        <div className="flex flex-col text-[8.5px]">
                          <span className="text-cyan-300 font-bold">40m PDC</span>
                          {isAlt ? (
                            <span className="text-amber-400 font-bold">+{row.transitMinutes || 20}m transit</span>
                          ) : (
                            <span className="text-slate-500">Std Stabling</span>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-1.5 border-b border-b-slate-800 bg-cyan-955/10 border-r border-r-cyan-900/40 whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenStablingModal(row)}
                          className="bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 px-2 py-0.5 rounded text-[8.5px] font-bold uppercase transition cursor-pointer"
                          title="Override actual night stabling location & recalculate Sign-On"
                        >
                          Override Loc
                        </button>
                      </td>

                      {/* Night columns */}
                      {renderInputCell('signOnTime', row.signOnTime || '--', 'w-14', 'bg-blue-955/5 font-bold text-emerald-300')}
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

      {/* ─── Stabling Override Modal Prompt ─── */}
      {stablingModalDuty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 font-mono text-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-black uppercase text-cyan-400 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Night Stabling Location Override
              </h3>
              <button
                onClick={() => setStablingModalDuty(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Duty Number:</span>
                  <strong className="text-emerald-400">{stablingModalDuty.dutyNo}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Morning Train ID:</span>
                  <strong className="text-cyan-300">{stablingModalDuty.mornTrainNo || '--'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">WTT Revenue Departure:</span>
                  <strong className="text-slate-200">{stablingModalDuty.mornDepTime || '05:15:00'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned Stabling Point:</span>
                  <strong className="text-amber-300">{stablingModalDuty.assignedStablingLocation || stablingModalDuty.takeoverLocation || 'DEPOT'}</strong>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Select Actual Night Stabling / Takeover Location (Up &amp; Dn Line):
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  <button
                    type="button"
                    onClick={() => setModalActualLoc('Depot (PYID)')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                      modalActualLoc.includes('Depot') || modalActualLoc.includes('DEPOT')
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-900 text-slate-300 hover:text-white border-slate-700'
                    }`}
                  >
                    ⚡ Depot (PYID)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActualLoc('NLC PKT')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                      modalActualLoc.includes('NLC PKT') || modalActualLoc === 'NLC_PT'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700'
                    }`}
                  >
                    ⚡ NLC PKT
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActualLoc('MHLI PKT')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                      modalActualLoc.includes('MHLI PKT') || modalActualLoc === 'MHLI_PT'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700'
                    }`}
                  >
                    ⚡ MHLI PKT
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActualLoc('NGSA PKT')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                      modalActualLoc.includes('NGSA PKT') || modalActualLoc === 'NPKT' || modalActualLoc === 'NGSA_PT'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                        : 'bg-slate-900 text-purple-400 hover:text-purple-200 border-slate-700'
                    }`}
                  >
                    ⚡ NGSA PKT
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalActualLoc('PYID RD3')}
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition border cursor-pointer ${
                      modalActualLoc.includes('RD3') || modalActualLoc.includes('Road 3')
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'bg-slate-900 text-emerald-400 hover:text-emerald-200 border-slate-700'
                    }`}
                  >
                    ⚡ PYID RD3
                  </button>
                </div>
                <select
                  value={modalActualLoc}
                  onChange={(e) => setModalActualLoc(e.target.value)}
                  className="w-full bg-slate-955 border border-slate-700 rounded-lg p-2.5 text-xs text-purple-300 font-bold focus:border-cyan-500 focus:outline-none"
                >
                  {Object.entries(
                    STABLING_LOCATIONS.reduce((acc, loc) => {
                      const cat = loc.category || 'Other Locations';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(loc);
                      return acc;
                    }, {})
                  ).map(([cat, opts]) => (
                    <optgroup key={cat} label={cat} className="bg-slate-900 text-cyan-400 font-bold">
                      {opts.map(loc => (
                        <option key={loc.code} value={loc.code} className="bg-slate-955 text-slate-200">{loc.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="bg-cyan-955/30 border border-cyan-800/40 p-2.5 rounded-lg text-[10px] text-cyan-300 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Automatic 40-Min PDC Calculation
                </div>
                <p className="text-slate-400">
                  The system will subtract 40 min Pre-Departure Check plus positioning transit time ({getTransitMinutes(modalActualLoc, stablingModalDuty.assignedStablingLocation || 'DEPOT')} mins) from revenue departure.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStablingModalDuty(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModalStabling}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-4 py-2 rounded-lg text-xs uppercase tracking-wider shadow-md transition cursor-pointer"
              >
                Apply Stabling &amp; PDC Sign-On
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 bg-slate-955/40 border border-slate-800 p-3.5 rounded-lg text-[10px] text-slate-500 font-mono">
        <Info className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-400">💡 Dynamic Night Changeover &amp; Stabling Guide:</span>
          <ul className="list-disc pl-4 space-y-0.5 mt-1">
            <li>Any alternative stabling location prompts the controller and automatically computes the Sign-On (S/ON) time including the mandatory 40-minute Pre-Departure Check (PDC).</li>
            <li>Transit positioning minutes are dynamically calculated using the BMRCL Line 2 station distance matrix between stabling points and induction stations.</li>
            <li>Clicking <strong className="text-amber-400">Save Mappings</strong> commits the configuration to Firestore (<code className="text-cyan-400">changeover_mappings</code>) so that Night Changeover Control on the Dispatch Gateway Core immediately utilizes the adjusted Sign-On times.</li>
            <li>Clicking <strong className="text-cyan-400">Auto-Compile Links</strong> recompiles all duties from the active Link Roster &amp; Working Time Table (WTT).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
