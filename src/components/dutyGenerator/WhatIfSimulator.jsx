import React, { useState, useEffect } from 'react';
import { 
  Sparkles, AlertTriangle, ShieldCheck, TrendingDown, Users, Moon, 
  Train, CheckCircle2, RefreshCw, Calendar, ArrowRight, BarChart2, Activity,
  Clock, CalendarRange
} from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { DUTY_TEMPLATES_REGISTRY } from '../../data/dutyTemplatesRegistry';

// Helper: compute duration in days (inclusive)
function calcDuration(from, to) {
  if (!from || !to) return 1;
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
  return Math.floor((d2 - d1) / 86400000) + 1;
}

// Helper: format date "DD Mon YYYY"
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Helper: add days to an ISO date string
function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function WhatIfSimulator({
  targetDate = '2026-08-19',
  crewList = EMPLOYEE_MASTER_REGISTRY
}) {
  // Date and Time Range States
  const [fromDate, setFromDate] = useState(targetDate);
  const [fromTime, setFromTime] = useState('06:00');
  const [toDate, setToDate]     = useState(() => addDays(targetDate, 13)); // 14-day default
  const [toTime, setToTime]     = useState('23:59');

  // Simulation Parameters
  const [extraLeaveCount, setExtraLeaveCount]       = useState(4);
  const [extraNightNeeded, setExtraNightNeeded]     = useState(2);
  const [testTrackOperators, setTestTrackOperators] = useState(2);
  const [trainingCount, setTrainingCount]           = useState(3);
  const [simulationResult, setSimulationResult]     = useState(null);

  // Sync fromDate if targetDate changes
  useEffect(() => {
    if (targetDate) {
      setFromDate(targetDate);
      setToDate(addDays(targetDate, 13));
    }
  }, [targetDate]);

  const forecastHorizon = Math.max(1, Math.min(60, calcDuration(fromDate, toDate)));
  const activeTOs = crewList.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);

  const handleRunSimulation = () => {
    const totalTOs = activeTOs.length;
    const baseWOCount = Math.round(totalTOs / 7);
    const regularDuties = DUTY_TEMPLATES_REGISTRY.WEEKDAY.length;
    const available = totalTOs - baseWOCount - extraLeaveCount - testTrackOperators - trainingCount;
    const netShortage = Math.max(0, regularDuties - available);
    const standbyBuffer = Math.max(0, available - regularDuties);

    const riskLevel = netShortage > 0 ? 'CRITICAL' : standbyBuffer < 4 ? 'WARNING' : 'HEALTHY';

    // Generate day-by-day projected timeline for the selected date range
    const timeline = [];
    const baseDate = new Date(fromDate);

    for (let i = 0; i < forecastHorizon; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const dayName = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
      const reqDuties = isWeekend ? Math.round(regularDuties * 0.85) : regularDuties;
      
      // Dynamic simulated fluctuations across the timeline
      const dayLeaveSurge = Math.max(1, extraLeaveCount + (i % 3 === 0 ? 2 : i % 5 === 0 ? -1 : 0));
      const dayAvail = totalTOs - baseWOCount - dayLeaveSurge - testTrackOperators - trainingCount;
      const dayDeficit = Math.max(0, reqDuties - dayAvail);
      const dayBuffer = Math.max(0, dayAvail - reqDuties);

      timeline.push({
        dayIndex: i + 1,
        dateStr: d.toISOString().split('T')[0],
        dayName,
        isWeekend,
        reqDuties,
        dayLeaveSurge,
        dayAvail,
        dayDeficit,
        dayBuffer,
        status: dayDeficit > 0 ? 'DEFICIT' : dayBuffer < 3 ? 'TIGHT' : 'OK'
      });
    }

    setSimulationResult({
      totalTOs,
      baseWOCount,
      extraLeaveCount,
      extraNightNeeded,
      testTrackOperators,
      trainingCount,
      forecastHorizon,
      fromDate,
      fromTime,
      toDate,
      toTime,
      available,
      regularDuties,
      netShortage,
      standbyBuffer,
      riskLevel,
      timeline,
      recommendedActions: [
        netShortage > 0 
          ? `🔴 Critical: Projected deficit of ${netShortage} TOs. Cancel non-essential training slots or request voluntary OT from off-duty crew.` 
          : '🟢 Full Operational Coverage: 100% scheduled mainline duties covered.',
        extraNightNeeded > 0 
          ? `🌙 Night Balancing: Verify mandatory 8h00m continuous rest before transitioning day-shift operators to night duties.` 
          : '🌙 Night duty quotas stable and compliant.',
        standbyBuffer > 0 
          ? `🛡️ Standby Reserves: ${standbyBuffer} reserve operators available for immediate depot changeover / emergency relief.` 
          : '⚠️ Zero standby margin: Any sudden book-off will require immediate relief recall.'
      ]
    });
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner & Date/Time Range Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/25 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> What-If Scenario Simulator
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {fmtDate(fromDate)} → {fmtDate(toDate)}
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Predictive Manpower Shortage Simulator</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Simulate surge leaves, test track testing, and extra night requirements from{' '}
            <strong className="text-purple-300 font-mono">{fmtDate(fromDate)} {fromTime}</strong> to{' '}
            <strong className="text-purple-300 font-mono">{fmtDate(toDate)} {toTime}</strong> before committing to the actual roster.
          </p>
        </div>

        {/* Date & Time Range Pickers with Duration Presets */}
        <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5 min-w-[320px] sm:min-w-[420px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold text-purple-400 flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" /> Simulation Range &amp; Window
            </span>
            <div className="flex items-center gap-1">
              {[7, 14, 21, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setToDate(addDays(fromDate, days - 1))}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-900 hover:bg-purple-950/60 text-slate-400 hover:text-purple-300 border border-slate-800 hover:border-purple-500/40 transition-all"
                  title={`Quick preset: +${days} days`}
                >
                  +{days}d
                </button>
              ))}
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-mono text-[10px] font-bold">
                {forecastHorizon} Day{forecastHorizon > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* From Date & Time */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-9">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setFromDate(val);
                  if (val > toDate) setToDate(val);
                }}
                className="bg-transparent border-0 text-white font-mono text-xs font-bold focus:ring-0 focus:outline-none cursor-pointer flex-1"
              />
              <Clock className="w-3.5 h-3.5 text-slate-500 ml-0.5 shrink-0" />
              <input
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
                className="bg-slate-950 border border-slate-700/60 text-slate-200 font-mono text-xs rounded px-1.5 py-0.5 focus:outline-none"
              />
            </div>

            {/* To Date & Time */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-9">To:</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent border-0 text-white font-mono text-xs font-bold focus:ring-0 focus:outline-none cursor-pointer flex-1"
              />
              <Clock className="w-3.5 h-3.5 text-slate-500 ml-0.5 shrink-0" />
              <input
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
                className="bg-slate-950 border border-slate-700/60 text-slate-200 font-mono text-xs rounded px-1.5 py-0.5 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Control Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Simulated Emergency Leaves */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Simulated Emergency Leaves
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="0"
              max="15"
              value={extraLeaveCount}
              onChange={(e) => setExtraLeaveCount(parseInt(e.target.value, 10))}
              className="flex-1 accent-rose-500"
            />
            <span className="text-lg font-black text-rose-400 font-mono w-8">{extraLeaveCount}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Unexpected medical absences &amp; emergency book-offs.</p>
        </div>

        {/* 2. Extra Night Operators */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Extra Night Operators Needed
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="0"
              max="8"
              value={extraNightNeeded}
              onChange={(e) => setExtraNightNeeded(parseInt(e.target.value, 10))}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-lg font-black text-indigo-400 font-mono w-8">{extraNightNeeded}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Nighttime track maintenance &amp; testing blocks.</p>
        </div>

        {/* 3. Test Track Crew */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Test Track Crew Requirement
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="0"
              max="6"
              value={testTrackOperators}
              onChange={(e) => setTestTrackOperators(parseInt(e.target.value, 10))}
              className="flex-1 accent-purple-500"
            />
            <span className="text-lg font-black text-purple-400 font-mono w-8">{testTrackOperators}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Dedicated TOs for Peenya test track testing.</p>
        </div>

        {/* 4. Training / CRT Slots */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <label className="text-xs font-bold text-slate-300 block mb-1">
            Simulated Training / CRT Slots
          </label>
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="0"
              max="10"
              value={trainingCount}
              onChange={(e) => setTrainingCount(parseInt(e.target.value, 10))}
              className="flex-1 accent-cyan-500"
            />
            <span className="text-lg font-black text-cyan-400 font-mono w-8">{trainingCount}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Continuous refresher &amp; safety training slots.</p>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={handleRunSimulation}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-xl shadow-purple-600/30 transition-all flex items-center gap-2.5"
        >
          <Sparkles className="w-4 h-4" />
          Run Predictive Scenario Analysis ({forecastHorizon} Days • {fmtDate(fromDate)} to {fmtDate(toDate)})
        </button>
      </div>

      {/* Simulation Results */}
      {simulationResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 animate-fadeIn">
          
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Simulation Outcome ({fmtDate(simulationResult.fromDate)} {simulationResult.fromTime} → {fmtDate(simulationResult.toDate)} {simulationResult.toTime} • {simulationResult.forecastHorizon} Days)
              </span>
              <h3 className="text-lg font-black text-white">Projected Roster Resilience &amp; Manpower Capacity</h3>
            </div>

            <div>
              {simulationResult.riskLevel === 'HEALTHY' && (
                <span className="px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> HEALTHY CAPACITY
                </span>
              )}
              {simulationResult.riskLevel === 'WARNING' && (
                <span className="px-3.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> TIGHT STANDBY MARGIN
                </span>
              )}
              {simulationResult.riskLevel === 'CRITICAL' && (
                <span className="px-3.5 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> SHORTAGE DETECTED
                </span>
              )}
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Available Operators</span>
              <span className="text-2xl font-black text-white font-mono">{simulationResult.available}</span>
            </div>
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Required Duties</span>
              <span className="text-2xl font-black text-blue-400 font-mono">{simulationResult.regularDuties}</span>
            </div>
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Standby Buffer</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">+{simulationResult.standbyBuffer}</span>
            </div>
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Projected Shortage</span>
              <span className={`text-2xl font-black font-mono ${simulationResult.netShortage > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {simulationResult.netShortage}
              </span>
            </div>
          </div>

          {/* Day-by-Day Forecast Timeline */}
          <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-purple-400" />
                {simulationResult.forecastHorizon}-Day Projected Manpower Timeline
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                {simulationResult.timeline[0]?.dayName} → {simulationResult.timeline[simulationResult.timeline.length - 1]?.dayName}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 overflow-x-auto pb-1">
              {simulationResult.timeline.map((day) => (
                <div 
                  key={day.dayIndex}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    day.status === 'DEFICIT' 
                      ? 'bg-rose-950/30 border-rose-500/50' 
                      : day.status === 'TIGHT'
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-400 font-mono">{day.dayName}</div>
                  <div className={`text-base font-black font-mono my-1 ${
                    day.status === 'DEFICIT' ? 'text-rose-400' : day.status === 'TIGHT' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {day.dayDeficit > 0 ? `-${day.dayDeficit}` : `+${day.dayBuffer}`}
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono">
                    {day.dayAvail}/{day.reqDuties}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              AI Contingency Recommendations
            </h4>
            <div className="space-y-2">
              {simulationResult.recommendedActions.map((act, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
