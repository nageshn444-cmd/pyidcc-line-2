/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Users, Search, Train, ArrowRight, User, Clock, Filter } from 'lucide-react';

export default function ReliefTracking({ 
  trackerSearchTerm, 
  setTrackerSearchTerm, 
  filteredTrackingKeys, 
  liveTrainTrackingMap = {} 
}) {
  // Local fallback states
  const [localSearch, setLocalSearch] = useState('');
  const [dutySearch, setDutySearch] = useState('');

  // Fallbacks if props are not passed
  const searchTerm = trackerSearchTerm !== undefined ? trackerSearchTerm : localSearch;
  const setSearchTerm = setTrackerSearchTerm || setLocalSearch;

  // Filter keys based on search and duty inputs
  const finalTrackingKeys = useMemo(() => {
    const keys = filteredTrackingKeys || Object.keys(liveTrainTrackingMap);
    return keys.filter(tid => {
      const tracking = liveTrainTrackingMap[tid];
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

      // 2. Dedicated Duty ID search match (e.g. "D10")
      const matchesDuty = !dutyQuery || (
        String(prev?.dutyId || '').toLowerCase().includes(dutyQuery) ||
        String(curr?.dutyId || '').toLowerCase().includes(dutyQuery) ||
        String(next?.dutyId || '').toLowerCase().includes(dutyQuery)
      );

      return matchesGeneral && matchesDuty;
    });
  }, [liveTrainTrackingMap, filteredTrackingKeys, searchTerm, dutySearch]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono">
      {/* Ambient BG Glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-[60px] pointer-events-none"></div>

      {/* Header and Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-slate-800 pb-4 mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30">
            <Users className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-100 tracking-wider uppercase">Live Train Operator Relief Matrix</h3>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">Real-time tracking of previous, active, and upcoming operator handovers</p>
          </div>
        </div>
        
        {/* Search Input Bar Group */}
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
          {/* General Search */}
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search TID, Name..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
            />
          </div>

          {/* Dedicated Duty Search */}
          <div className="relative flex-1 sm:w-48">
            <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-cyan-500/70" />
            <input 
              type="text" 
              placeholder="Filter by Duty No (e.g. D10)" 
              value={dutySearch} 
              onChange={(e) => setDutySearch(e.target.value)} 
              className="w-full bg-slate-950 border border-cyan-900/40 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-cyan-300 placeholder-slate-650 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors" 
            />
          </div>
        </div>
      </div>

      {/* Grid listing */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
        {finalTrackingKeys.map(tid => {
          const tracking = liveTrainTrackingMap[tid];
          const prev = tracking?.previous;
          const curr = tracking?.current;
          const next = tracking?.nextReliver;

          // Check if specific operator matches the duty query for highlight
          const cleanQuery = dutySearch.trim().toLowerCase();
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
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider">
                    ACTIVE FLEET
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
                    <span className={prevMatchesDuty ? 'text-cyan-400' : ''}>Previous TO</span>
                    <span className="font-normal text-slate-650">Relieved</span>
                  </div>
                  {prev ? (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                        <User className={`h-3 w-3 ${prevMatchesDuty ? 'text-cyan-400' : 'text-slate-500'}`} />
                        {prev.empName} <span className="text-[9px] text-slate-600 font-normal">({prev.empId})</span>
                      </div>
                      <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${prevMatchesDuty ? 'text-cyan-300' : 'text-slate-500'}`}>
                        <Clock className="h-2.5 w-2.5 text-slate-650" />
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
                  <ArrowRight className="h-3.5 w-3.5 text-slate-850 rotate-90" />
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
                    <span>Current TO</span>
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
                        currMatchesDuty ? 'text-cyan-300' : 'text-slate-400'
                      }`}>
                        <Clock className={`h-2.5 w-2.5 ${currMatchesDuty ? 'text-cyan-455' : 'text-emerald-500/70'}`} />
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
                  <ArrowRight className="h-3.5 w-3.5 text-slate-850 rotate-90" />
                </div>

                {/* 3. NEXT OPERATOR */}
                <div className={`p-2 rounded-lg transition-colors flex flex-col gap-1 relative overflow-hidden ${
                  nextMatchesDuty 
                    ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse' 
                    : 'bg-slate-900/40 border border-slate-900'
                }`}>
                  <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-amber-500">
                    <span className={nextMatchesDuty ? 'text-cyan-400' : ''}>Next TO (Reliever)</span>
                    <span className="font-normal text-amber-600/60">Upcoming</span>
                  </div>
                  {next ? (
                    <div>
                      <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <User className={`h-3 w-3 ${nextMatchesDuty ? 'text-cyan-400' : 'text-amber-500/70'}`} />
                        {next.empName} <span className="text-[9px] text-slate-500 font-normal">({next.empId})</span>
                      </div>
                      <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${nextMatchesDuty ? 'text-cyan-300' : 'text-slate-400'}`}>
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
          <div className="col-span-full py-16 text-center text-slate-550 border border-dashed border-slate-800 rounded-xl italic font-bold">
            No active or relief operators matches query parameters.
          </div>
        )}
      </div>
    </div>
  );
}