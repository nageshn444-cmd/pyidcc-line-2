import React, { useState, useEffect } from 'react';
import { Radio, RefreshCw, Train, Users, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function ViewerLayout({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay
}) {
  const [countdown, setCountdown] = useState(10);
  const { theme } = useTheme();
  const { logout } = useAuth();

  // 10 Second Auto-refresh logic
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchLiveData();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchLiveData]);

  const activeIncidents = liveIncidents.filter(inc => inc.status !== 'RESOLVED');

  return (
    <div className={`min-h-screen bg-slate-950 font-mono text-slate-100 flex flex-col p-6 space-y-6 ${theme}`}>
      
      {/* Kiosk Header */}
      <header className="bg-[var(--header-bg)] backdrop-blur-md border border-[var(--border-color)] p-5 rounded-xl flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-emerald-400 animate-pulse" />
          <div>
            <h2 className="text-sm font-black tracking-wider text-slate-200">BMRCL METRO PLATFORM KIOSK BOARD</h2>
            <p className="text-[10px] text-slate-500 uppercase">Peenya Industry Depot (PYID) | Station Controller Desk</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
            <span>Telemetry Refresh in: <strong className="text-cyan-400">{countdown}s</strong></span>
          </div>
          <button 
            onClick={logout}
            className="text-[10px] font-bold text-slate-500 border border-slate-800 px-3 py-1.5 rounded hover:bg-slate-800/50"
          >
            EXIT KIOSK
          </button>
        </div>
      </header>

      {/* Main Grid display */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Panel 1: Live Train Fleet Status */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col">
          <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
            <Train className="h-4 w-4" /> Live Fleet Tracking Status
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {Object.keys(liveTrainTrackingMap).length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-600 italic">No trains currently active on grid</div>
            ) : (
              Object.keys(liveTrainTrackingMap).map(tid => {
                const tracking = liveTrainTrackingMap[tid];
                return (
                  <div key={tid} className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200 text-xs">Train ID: {tid}</div>
                      <div className="text-[10px] text-slate-500 mt-1 uppercase">TO: {tracking?.current?.empName || 'standby'} ({tracking?.current?.empId || '--'})</div>
                    </div>
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                      Active
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel 2: Crew Deployments Reserve */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col">
          <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" /> Standby Relief Reserves
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {deployments.filter(d => d.status === 'STANDBY').length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-600 italic">No standby relief crew registered</div>
            ) : (
              deployments.filter(d => d.status === 'STANDBY').map(d => (
                <div key={d.id} className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{d.empName}</div>
                    <div className="text-[10px] text-slate-500 mt-1 uppercase">Employee ID: {d.empId}</div>
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                    STANDBY
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 3: Live Incident Status Board */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest border-b border-slate-800 pb-2 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Live Incidents Ticker
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {activeIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic space-y-2">
                <ShieldCheck className="h-10 w-10 text-emerald-500/70" />
                <span className="text-xs uppercase">No Active Line Delays</span>
              </div>
            ) : (
              activeIncidents.map(inc => (
                <div key={inc.id} className="border border-rose-500/20 bg-rose-950/10 p-3.5 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-rose-400">[TID {inc.trainId}] Delay Incident</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{inc.delayMinutes || inc.delay} Mins</span>
                  </div>
                  <p className="text-[10px] text-slate-350">{inc.reason || 'Operational delay'}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
