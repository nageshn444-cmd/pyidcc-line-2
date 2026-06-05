import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function IntegrityAudit({ rosterWarnings, manningStats }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-sm">
      {/* Metrics */}
      <div className="space-y-4 lg:col-span-1">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1">WTT Mapped Run Coverage</span>
          <span className="text-3xl font-black text-cyan-400">
            {manningStats.totalTrains - manningStats.unmannedTrains} 
            <span className="text-xs font-normal text-slate-500"> / {manningStats.totalTrains} Manned</span>
          </span>
        </div>
        <div className={`border p-4 rounded-xl shadow-md ${manningStats.unmannedTrains > 0 ? 'bg-amber-950/10 border-amber-500/30' : 'bg-slate-900 border-slate-800'}`}>
          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Unassigned Manning Gaps</span>
          <span className={`text-3xl font-black ${manningStats.unmannedTrains > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
            {manningStats.unmannedTrains}
          </span>
        </div>
      </div>

      {/* Logs */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 font-bold text-xs text-slate-300">
          ACTIVE INTEGRITY SAFETY ENGINE AUDIT TRAIL LOGS
        </div>
        <div className="p-4 max-h-[500px] overflow-y-auto space-y-3">
          {rosterWarnings.map((warn, index) => (
            <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border text-xs leading-relaxed ${warn.type.includes('CRITICAL') ? 'bg-rose-950/20 border-rose-500/20 text-rose-300' : 'bg-amber-950/20 border-amber-500/20 text-amber-300'}`}>
              <AlertTriangle className={`h-4 w-4 mt-0.5 ${warn.type.includes('CRITICAL') ? 'text-rose-500' : 'text-amber-500'}`} />
              <div>
                <span className="font-black uppercase tracking-wide block mb-1">[{warn.type}]</span>
                {warn.msg}
              </div>
            </div>
          ))}
          {rosterWarnings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Roster Conflict Free</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}