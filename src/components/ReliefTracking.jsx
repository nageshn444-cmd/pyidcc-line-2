/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Live Train Operator Relief Matrix & Master Reliever ID Chart for WEEKDAY Link
 * dated 03/Sep/2026 (BIET-APTS)
 * 
 * Synced to Alstom ATS Relief Engine • Verified Reliever-Only Handover System
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Search, Train, ArrowRight, User, Clock, Filter, 
  Table, LayoutGrid, Calendar, ShieldCheck, Sparkles, Layers,
  CheckCircle2, Radio, AlertCircle
} from 'lucide-react';
import { 
  WEEKDAY_RELIEF_ID_CHART, 
  WEEKDAY_RELIEF_ID_CHART_META,
  WEEKDAY_DUTY_LEGS_FROM_ID_CHART,
  getReliefIdChartForDay,
  normalizeScheduleDay,
  timeStringToSeconds,
  normalizeTrackTrainId
} from '../data/weekdayReliefIdChartRegistry';

export default function ReliefTracking({ 
  trackerSearchTerm, 
  setTrackerSearchTerm, 
  filteredTrackingKeys, 
  liveTrainTrackingMap = {},
  activeDay = 'WEEKDAY',
  simulatedTime = null
}) {
  // View mode: 'CARDS' | 'ID_CHART' | 'DUTY_SUMMARY'
  const [viewMode, setViewMode] = useState('CARDS');

  // Dynamically resolve ID chart, metadata, and duty legs for the active day type
  const activeDayData = useMemo(() => {
    return getReliefIdChartForDay(activeDay);
  }, [activeDay]);

  const activeChart = activeDayData.chart;
  const activeMeta = activeDayData.meta;
  const activeDutyLegs = activeDayData.dutyLegs;

  // Local fallback states
  const [localSearch, setLocalSearch] = useState('');
  const [dutySearch, setDutySearch] = useState('');
  const [selectedTrainCol, setSelectedTrainCol] = useState('ALL');

  // Reset selected column filter when schedule day changes
  useEffect(() => {
    setSelectedTrainCol('ALL');
  }, [activeDay]);

  // Fallbacks if props are not passed
  const searchTerm = trackerSearchTerm !== undefined ? trackerSearchTerm : localSearch;
  const setSearchTerm = setTrackerSearchTerm || setLocalSearch;

  // Real-time evaluation seconds for active leg highlighting
  const [currentTimeSecs, setCurrentTimeSecs] = useState(() => {
    if (simulatedTime) return timeStringToSeconds(simulatedTime);
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  });

  useEffect(() => {
    if (simulatedTime) {
      setCurrentTimeSecs(timeStringToSeconds(simulatedTime));
      return;
    }
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeSecs(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, [simulatedTime]);

  // Train columns from the active schedule's official ID Chart
  const trainColumns = useMemo(() => {
    return activeMeta.trains || Object.keys(activeChart);
  }, [activeMeta, activeChart]);

  // Filter keys based on search and duty inputs for the CARDS view
  const finalTrackingKeys = useMemo(() => {
    return trainColumns.filter(tid => {
      const tracking = liveTrainTrackingMap[tid] || liveTrainTrackingMap[normalizeTrackTrainId(tid)];
      const prev = tracking?.previous;
      const curr = tracking?.current;
      const next = tracking?.nextReliver;

      const genQuery = searchTerm.toLowerCase().trim();
      const dutyQuery = dutySearch.toLowerCase().trim();

      // 1. General search match (Train ID, Operator Names)
      const matchesGeneral = !genQuery || (
        String(tid).toLowerCase().includes(genQuery) ||
        String(prev?.empName || '').toLowerCase().includes(genQuery) ||
        String(curr?.empName || '').toLowerCase().includes(genQuery) ||
        String(next?.empName || '').toLowerCase().includes(genQuery)
      );

      // 2. Dedicated Duty ID search match (e.g. "D10", "10", "09")
      const cleanDutyQuery = dutyQuery.replace(/^d/i, '');
      const matchesDuty = !dutyQuery || (
        String(prev?.dutyId || '').toLowerCase().includes(cleanDutyQuery) ||
        String(curr?.dutyId || '').toLowerCase().includes(cleanDutyQuery) ||
        String(next?.dutyId || '').toLowerCase().includes(cleanDutyQuery)
      );

      return matchesGeneral && matchesDuty;
    });
  }, [liveTrainTrackingMap, trainColumns, searchTerm, dutySearch]);

  // Filtered train columns for the ID CHART view
  const filteredIdChartColumns = useMemo(() => {
    return trainColumns.filter(trainId => {
      if (selectedTrainCol !== 'ALL' && selectedTrainCol !== trainId) return false;

      const genQuery = searchTerm.toLowerCase().trim();
      const dutyQuery = dutySearch.toLowerCase().trim().replace(/^d/i, '');

      const legs = activeChart[trainId] || [];

      // Check if any leg matches search
      const matchesGen = !genQuery || (
        trainId.toLowerCase().includes(genQuery) ||
        legs.some(l => {
          const normDuty = String(l.duty).padStart(2, '0');
          const trackingOp = liveTrainTrackingMap[trainId]?.current || liveTrainTrackingMap[trainId]?.nextReliver;
          return normDuty.includes(genQuery) || String(l.duty).includes(genQuery) ||
                 (trackingOp?.dutyId === normDuty && trackingOp.empName?.toLowerCase().includes(genQuery));
        })
      );

      const matchesDuty = !dutyQuery || legs.some(l => {
        const normDuty = String(l.duty).padStart(2, '0');
        return normDuty.includes(dutyQuery) || String(l.duty).includes(dutyQuery);
      });

      return matchesGen && matchesDuty;
    });
  }, [trainColumns, selectedTrainCol, searchTerm, dutySearch, liveTrainTrackingMap, activeChart]);

  // Dynamically compute the maximum number of rows needed across all visible columns
  const maxRowsInChart = useMemo(() => {
    let max = 10;
    filteredIdChartColumns.forEach(trainId => {
      const len = (activeChart[trainId] || []).length;
      if (len > max) max = len;
    });
    return Math.max(max, 10);
  }, [filteredIdChartColumns, activeChart]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xl relative overflow-hidden font-mono">
      {/* Ambient BG Glow */}
      <div className="absolute -top-24 -left-24 w-56 h-56 bg-cyan-500/10 rounded-full blur-[70px] pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-emerald-500/10 rounded-full blur-[70px] pointer-events-none"></div>

      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-4 mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30 text-cyan-400 shrink-0">
            <Users className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-100 tracking-wider uppercase">
                Live Train Operator Relief Matrix
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[9px] font-black uppercase font-mono">
                {activeMeta.badge || `${activeMeta.dayType} LINK`}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[9px] font-black uppercase font-mono flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-400" />
                ALSTOM ATS RELIEF ENGINE
              </span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{activeMeta.title}</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-bold">Verified Reliever-Only Handover System</span>
            </p>
          </div>
        </div>
        
        {/* View Mode Toggle Buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={() => setViewMode('CARDS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
              viewMode === 'CARDS'
                ? 'bg-cyan-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Real-time previous, active, and upcoming operator handovers"
          >
            <LayoutGrid size={13} />
            <span>Handover Cards</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('ID_CHART')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
              viewMode === 'ID_CHART'
                ? 'bg-cyan-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={`Official ${trainColumns.length}-column Master ID Chart for ${activeMeta.dayType}`}
          >
            <Table size={13} />
            <span>Master ID Chart</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('DUTY_SUMMARY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
              viewMode === 'DUTY_SUMMARY'
                ? 'bg-cyan-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title={`Duty-wise breakdown of assigned train legs from the official ${activeMeta.dayType} ID chart`}
          >
            <Layers size={13} />
            <span>Duty Roster</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 relative z-10">
        {/* General Search */}
        <div className="relative flex-1 sm:w-56">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input 
            id="relieftracking-i1" 
            name="relieftracking-i1" 
            type="text" 
            placeholder="Search TID, Driver Name..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
          />
        </div>

        {/* Dedicated Duty Search */}
        <div className="relative flex-1 sm:w-56">
          <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-cyan-500/70" />
          <input 
            id="relieftracking-i2" 
            name="relieftracking-i2" 
            type="text" 
            placeholder="Filter Duty (e.g. 71, 11, 09)" 
            value={dutySearch} 
            onChange={(e) => setDutySearch(e.target.value)} 
            className="w-full bg-slate-950 border border-cyan-900/40 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-cyan-300 placeholder-slate-650 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors" 
          />
        </div>

        {/* Train Filter Dropdown (ID Chart view) */}
        {viewMode === 'ID_CHART' && (
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300">
            <Train size={12} className="text-cyan-400" />
            <select
              value={selectedTrainCol}
              onChange={(e) => setSelectedTrainCol(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none font-bold text-xs cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                All Trains ({trainColumns.length > 0 ? `${trainColumns[0]}-${trainColumns[trainColumns.length - 1]}` : ''})
              </option>
              {trainColumns.map(t => (
                <option key={t} value={t} className="bg-slate-900 text-white">Train {t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 1: LIVE RELIEF HANDOVER CARDS                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'CARDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
          {finalTrackingKeys.map(tid => {
            const tracking = liveTrainTrackingMap[tid];
            const prev = tracking?.previous;
            const curr = tracking?.current;
            const next = tracking?.nextReliver;

            // Check if specific operator matches the duty query for highlight
            const cleanQuery = dutySearch.trim().toLowerCase().replace(/^d/i, '');
            const prevMatchesDuty = cleanQuery && String(prev?.dutyId || '').toLowerCase().includes(cleanQuery);
            const currMatchesDuty = cleanQuery && String(curr?.dutyId || '').toLowerCase().includes(cleanQuery);
            const nextMatchesDuty = cleanQuery && String(next?.dutyId || '').toLowerCase().includes(cleanQuery);

            return (
              <div key={tid} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all duration-200 shadow-md group">
                
                {/* Card Header */}
                <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Train className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                    <span className="font-black text-slate-100 text-xs tracking-wider">TRAIN ID: {tid}</span>
                  </div>
                  {curr && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span> ACTIVE FLEET
                    </span>
                  )}
                </div>

                {/* Operators Flow */}
                <div className="space-y-2.5">
                  
                  {/* 1. PREVIOUS OPERATOR */}
                  <div className={`p-2 rounded-lg transition-colors flex flex-col gap-1 relative overflow-hidden ${
                    prevMatchesDuty 
                      ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse' 
                      : 'bg-slate-900/40 border border-slate-900'
                  }`}>
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-slate-500">
                      <span className={prevMatchesDuty ? 'text-cyan-400 font-black' : ''}>Previous TO</span>
                      <span className="font-normal text-slate-600">Relieved</span>
                    </div>
                    {prev ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                          <User className={`h-3 w-3 ${prevMatchesDuty ? 'text-cyan-400' : 'text-slate-500'}`} />
                          {prev.empName} <span className="text-[9px] text-slate-600 font-normal">({prev.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${prevMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                          <Clock className="h-2.5 w-2.5 text-slate-600" />
                          Duty {prev.dutyId} | {prev.startStr} - {prev.endStr}
                        </div>
                        {prev.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {prev.originalEmpName} ({prev.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-650 italic">No previous operator scheduled</div>
                    )}
                  </div>

                  {/* Arrow Down */}
                  <div className="flex justify-center -my-1">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-800 rotate-90" />
                  </div>

                  {/* 2. CURRENT OPERATOR */}
                  <div className={`p-2.5 rounded-lg flex flex-col gap-1 relative overflow-hidden transition-all ${
                    currMatchesDuty
                      ? 'bg-cyan-500/15 border-2 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.45)] animate-pulse'
                      : 'bg-emerald-500/5 border border-emerald-500/20'
                  }`}>
                    <div className="absolute top-0 right-0 bottom-0 w-1 bg-emerald-500/40"></div>
                    <div className={`flex justify-between items-center text-[9px] uppercase tracking-wider font-bold ${
                      currMatchesDuty ? 'text-cyan-400' : 'text-emerald-400'
                    }`}>
                      <span>Current TO (At Controls)</span>
                      <span className="flex items-center gap-1 text-[8px] px-1 bg-emerald-500/10 rounded">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span> Active
                      </span>
                    </div>
                    {curr ? (
                      <div>
                        <div className={`text-[11px] font-black flex items-center gap-1.5 ${
                          currMatchesDuty ? 'text-cyan-300' : 'text-emerald-300'
                        }`}>
                          <User className={`h-3 w-3 ${currMatchesDuty ? 'text-cyan-400' : 'text-emerald-400'}`} />
                          {curr.empName} <span className="text-[9px] text-slate-400 font-normal">({curr.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${
                          currMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-400'
                        }`}>
                          <Clock className={`h-2.5 w-2.5 ${currMatchesDuty ? 'text-cyan-400' : 'text-emerald-500/70'}`} />
                          Duty {curr.dutyId} | {curr.startStr} - {curr.endStr}
                        </div>
                        {curr.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {curr.originalEmpName} ({curr.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-500/50 italic">No active operator on desk</div>
                    )}
                  </div>

                  {/* Arrow Down */}
                  <div className="flex justify-center -my-1">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-800 rotate-90" />
                  </div>

                  {/* 3. NEXT OPERATOR */}
                  <div className={`p-2 rounded-lg transition-colors flex flex-col gap-1 relative overflow-hidden ${
                    nextMatchesDuty 
                      ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse' 
                      : 'bg-slate-900/40 border border-slate-900'
                  }`}>
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-amber-500">
                      <span className={nextMatchesDuty ? 'text-cyan-400 font-black' : ''}>Next TO (Reliever)</span>
                      <span className="font-normal text-amber-600/60">Upcoming Handover</span>
                    </div>
                    {next ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                          <User className={`h-3 w-3 ${nextMatchesDuty ? 'text-cyan-400' : 'text-amber-500/70'}`} />
                          {next.empName} <span className="text-[9px] text-slate-500 font-normal">({next.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${nextMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>
                          <Clock className="h-2.5 w-2.5 text-amber-500/50" />
                          Duty {next.dutyId} | {next.startStr} - {next.endStr}
                        </div>
                        {next.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {next.originalEmpName} ({next.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-650 italic">No upcoming reliever scheduled</div>
                    )}
                  </div>

                </div>

              </div>
            );
          })}
          {finalTrackingKeys.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl italic font-bold">
              No active or relief operators match query parameters.
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 2: OFFICIAL MASTER WEEKDAY RELIEVER ID CHART TABLE (03/SEP/2026)*/}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'ID_CHART' && (
        <div className="space-y-3">
          {/* Header Banner */}
          <div className="bg-slate-950 border border-cyan-900/60 rounded-xl p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-black text-xs">
                OFFICIAL WTT LINK
              </span>
              <span className="text-xs text-white font-bold">
                {activeMeta.title}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-400 inline-block"></span>
                <span>Active Leg Now</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-950 border border-cyan-500 inline-block"></span>
                <span>Matched Search</span>
              </span>
              <span className="text-slate-500">Total Columns: {filteredIdChartColumns.length}</span>
            </div>
          </div>

          {/* Master Grid Table (Horizontally Scrollable) */}
          <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-[640px] custom-scrollbar bg-slate-950">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
                <tr>
                  {filteredIdChartColumns.map(trainId => (
                    <th key={`hdr-${trainId}`} colSpan={3} className="p-2 text-center border-r border-slate-800 bg-slate-900">
                      <div className="flex items-center justify-center gap-1.5">
                        <Train size={12} className="text-cyan-400" />
                        <span className="font-black text-white text-xs tracking-wider">{trainId}</span>
                      </div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-950/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  {filteredIdChartColumns.map(trainId => (
                    <React.Fragment key={`sub-${trainId}`}>
                      <th className="py-1 px-1.5 text-center text-slate-500 w-14">From</th>
                      <th className="py-1 px-1.5 text-center text-slate-500 w-14">To</th>
                      <th className="py-1 px-1.5 text-center text-cyan-400 w-14 border-r border-slate-800">Duty</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Find max rows in any column to render rows */}
                {Array.from({ length: maxRowsInChart }).map((_, rowIndex) => {
                  return (
                    <tr key={`row-${rowIndex}`} className="border-b border-slate-900/80 hover:bg-slate-900/40 transition-colors">
                      {filteredIdChartColumns.map(trainId => {
                        const legs = activeChart[trainId] || [];
                        const leg = legs[rowIndex];

                        if (!leg) {
                          return (
                            <React.Fragment key={`cell-${trainId}-${rowIndex}`}>
                              <td className="py-1.5 px-1.5 text-center text-slate-700">-</td>
                              <td className="py-1.5 px-1.5 text-center text-slate-700">-</td>
                              <td className="py-1.5 px-1.5 text-center text-slate-700 border-r border-slate-800">-</td>
                            </React.Fragment>
                          );
                        }

                        const startSec = timeStringToSeconds(leg.from);
                        let endSec = timeStringToSeconds(leg.to);
                        if (endSec < startSec) endSec += 24 * 3600;

                        const isActiveNow = currentTimeSecs >= startSec && currentTimeSecs <= endSec;
                        const normDuty = String(leg.duty).padStart(2, '0');
                        const isDutyMatched = dutySearch && normDuty.includes(dutySearch.trim().replace(/^d/i, ''));

                        // Look up operator name if available in live tracking
                        const tracking = liveTrainTrackingMap[trainId] || liveTrainTrackingMap[normalizeTrackTrainId(trainId)];
                        const matchedOp = (tracking?.current?.dutyId === normDuty) ? tracking.current
                                        : (tracking?.nextReliver?.dutyId === normDuty) ? tracking.nextReliver
                                        : (tracking?.previous?.dutyId === normDuty) ? tracking.previous
                                        : null;

                        return (
                          <React.Fragment key={`cell-${trainId}-${rowIndex}`}>
                            <td className={`py-1.5 px-1.5 text-center text-[10.5px] font-bold ${
                              isActiveNow ? 'bg-emerald-950/60 text-emerald-300 font-black' : 'text-slate-300'
                            }`}>
                              {leg.from}
                            </td>
                            <td className={`py-1.5 px-1.5 text-center text-[10.5px] font-bold ${
                              isActiveNow ? 'bg-emerald-950/60 text-emerald-300 font-black' : 'text-slate-300'
                            }`}>
                              {leg.to}
                            </td>
                            <td className={`py-1.5 px-1.5 text-center border-r border-slate-800 ${
                              isActiveNow 
                                ? 'bg-emerald-950/80 text-emerald-300 font-black' 
                                : isDutyMatched
                                ? 'bg-cyan-950 text-cyan-300 font-black'
                                : 'text-amber-400 font-black'
                            }`} title={matchedOp ? `Operator: ${matchedOp.empName} (${matchedOp.empId})` : `Duty ${leg.duty}`}>
                              <div className="flex flex-col items-center">
                                <span className="text-[11px] leading-tight">
                                  {leg.duty}
                                </span>
                                {isActiveNow && (
                                  <span className="text-[7.5px] uppercase tracking-tighter text-emerald-400 font-black flex items-center gap-0.5">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-ping"></span> LIVE
                                  </span>
                                )}
                                {matchedOp && (
                                  <span className="text-[7px] text-slate-400 truncate max-w-[55px]">
                                    {matchedOp.empName.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 3: DUTY-TO-TRAIN ROSTER SUMMARY                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'DUTY_SUMMARY' && (
        <div className="space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs">
            <span className="text-white font-bold">
              Duty Roster Leg Sequence (Derived from {activeMeta.title})
            </span>
            <span className="text-[10px] text-slate-400">
              Total Duties: {Object.keys(activeDutyLegs).length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
            {Object.keys(activeDutyLegs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(dutyNo => {
              const legs = activeDutyLegs[dutyNo] || [];
              const cleanDutyQuery = dutySearch.trim().toLowerCase().replace(/^d/i, '');
              const matchesDuty = !cleanDutyQuery || dutyNo.includes(cleanDutyQuery);

              if (!matchesDuty) return null;

              // Find active leg
              const activeLeg = legs.find(l => currentTimeSecs >= l.startSec && currentTimeSecs <= l.endSec);

              return (
                <div 
                  key={`duty-card-${dutyNo}`}
                  className={`p-3 rounded-xl border transition-all ${
                    activeLeg 
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30' 
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-2">
                    <span className="text-xs font-black text-cyan-400">
                      DUTY {dutyNo}
                    </span>
                    <span className="text-[9.5px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                      {legs.length} Leg{legs.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {legs.map((leg, idx) => {
                      const isLegActive = currentTimeSecs >= leg.startSec && currentTimeSecs <= leg.endSec;
                      return (
                        <div 
                          key={`leg-${dutyNo}-${idx}`}
                          className={`p-1.5 rounded-lg flex items-center justify-between text-[10px] ${
                            isLegActive 
                              ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40' 
                              : 'bg-slate-900/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Train size={11} className={isLegActive ? 'text-emerald-400' : 'text-slate-500'} />
                            <strong className="text-white">T-{leg.trainId}</strong>
                          </div>
                          <span className="font-mono text-[9px] text-slate-400">
                            {leg.from} ➔ {leg.to}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}