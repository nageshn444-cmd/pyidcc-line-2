/* eslint-disable react/prop-types */
import React from 'react';
import { Users, Search, Train, ArrowRight, User, Clock } from 'lucide-react';

export default function ReliefTracking({ 
  trackerSearchTerm = '', 
  setTrackerSearchTerm = () => {}, 
  filteredTrackingKeys = [], 
  liveTrainTrackingMap = {} 
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono">
      {/* Ambient BG Glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-[60px] pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4 mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30">
            <Users className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-100 tracking-wider uppercase">Live Train Operator Relief Matrix</h3>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">Real-time tracking of previous, active, and upcoming operator handovers</p>
          </div>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search TID, Name, Duty..." 
            value={trackerSearchTerm} 
            onChange={(e) => setTrackerSearchTerm(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-1">
        {filteredTrackingKeys.map(tid => {
          const tracking = liveTrainTrackingMap[tid];
          const prev = tracking?.previous;
          const curr = tracking?.current;
          const next = tracking?.nextReliver; // Note: liveTrainTrackingMap keys are current, previous, nextReliver

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
                <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-900 flex flex-col gap-1 relative overflow-hidden">
                  <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-slate-500">
                    <span>Previous TO</span>
                    <span className="font-normal text-slate-600">Relieved</span>
                  </div>
                  {prev ? (
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-slate-500" />
                        {prev.empName} <span className="text-[9px] text-slate-600 font-normal">({prev.empId})</span>
                      </div>
                      <div className="text-[9px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-slate-650" />
                        Duty {prev.dutyId} | {prev.startStr} - {prev.endStr}
                      </div>
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
                <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex flex-col gap-1 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bottom-0 w-1 bg-emerald-500/40"></div>
                  <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-emerald-400">
                    <span>Current TO</span>
                    <span className="flex items-center gap-1 text-[8px] px-1 bg-emerald-500/10 rounded">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span> Active
                    </span>
                  </div>
                  {curr ? (
                    <div>
                      <div className="text-[11px] font-black text-emerald-300 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-emerald-400" />
                        {curr.empName} <span className="text-[9px] text-slate-400 font-normal">({curr.empId})</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-emerald-500/70" />
                        Duty {curr.dutyId} | {curr.startStr} - {curr.endStr}
                      </div>
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
                <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-900 flex flex-col gap-1 relative overflow-hidden">
                  <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-amber-500">
                    <span>Next TO (Reliever)</span>
                    <span className="font-normal text-amber-600/60">Upcoming</span>
                  </div>
                  {next ? (
                    <div>
                      <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-amber-500/70" />
                        {next.empName} <span className="text-[9px] text-slate-500 font-normal">({next.empId})</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-amber-500/50" />
                        Duty {next.dutyId} | {next.startStr} - {next.endStr}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-650 italic">No upcoming reliever scheduled</div>
                  )}
                </div>

              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}