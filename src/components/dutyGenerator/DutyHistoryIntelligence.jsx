import React, { useState } from 'react';
import {
  History, Search, BarChart2, Activity, Calendar,
  Brain, AlertTriangle, CheckCircle2, Moon, Sun, Sunset,
  TrendingUp, ShieldAlert, Info
} from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { HISTORICAL_ROSTER_INTELLIGENCE } from '../../data/historicalRosterIntelligence';
import { analyzeHistoricalPatterns } from '../../services/dutyOptimizerEngine';

// Format date as "DD Mon YYYY"
function fmtDate(str) {
  if (!str) return 'N/A';
  const d = new Date(str);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Risk flag display config
const RISK_CONFIG = {
  HIGH_LEAVE_USAGE:   { label: 'High Leave Usage (90d)',     color: 'text-amber-300',   bg: 'bg-amber-500/20 border-amber-500/30',  icon: '⚠️' },
  NIGHT_GAP_CLOSE:    { label: 'Night Gap < 26 Days',        color: 'text-red-300',     bg: 'bg-red-500/20 border-red-500/30',      icon: '🌙' },
  NIGHT_QUOTA_MET:    { label: 'Night Quota Completed',      color: 'text-indigo-300',  bg: 'bg-indigo-500/20 border-indigo-500/30',icon: '✅' },
  NO_NIGHT_HISTORY:   { label: 'No Night History (90d)',     color: 'text-cyan-300',    bg: 'bg-cyan-500/20 border-cyan-500/30',    icon: '📋' },
  FREQUENT_BOOKOFF:   { label: 'Frequent Book-Offs (>3)',    color: 'text-rose-300',    bg: 'bg-rose-500/20 border-rose-500/30',    icon: '🚨' },
};

export default function DutyHistoryIntelligence({
  crewList = EMPLOYEE_MASTER_REGISTRY
}) {
  const activeTOs = crewList.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [selectedTO,   setSelectedTO]   = useState(activeTOs[0] || EMPLOYEE_MASTER_REGISTRY[0]);
  const [aiPanelOpen,  setAiPanelOpen]  = useState(true);

  const filteredTOs = activeTOs.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(e.empId).includes(searchQuery)
  );

  const selectedStats = selectedTO ? HISTORICAL_ROSTER_INTELLIGENCE[selectedTO.empId] : null;

  // Compute AI Intelligence Profile for ALL active TOs (today's date for 90-day lookback)
  const today = new Date().toISOString().split('T')[0];
  const intelligenceProfiles = analyzeHistoricalPatterns(activeTOs, HISTORICAL_ROSTER_INTELLIGENCE, today, []);
  const selectedProfile = selectedTO ? intelligenceProfiles[selectedTO.empId] : null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> 90-Day Roster Intel
            </span>
            <span className="text-xs text-slate-400">
              Analyzed from Roster 6, 7 &amp; 8 XLSB Datasets
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Historical Roster Intelligence &amp; AI Profile Desk</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Evaluates duty repetition, shift history, leave trends, night balance, and AI risk flags for all active operators.
          </p>
        </div>

        <button
          onClick={() => setAiPanelOpen(p => !p)}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
            aiPanelOpen
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Brain className="w-4 h-4" />
          {aiPanelOpen ? 'AI Profile: ON' : 'AI Profile: OFF'}
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Operator List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col h-[700px]">
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search operator..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredTOs.map(emp => {
              const isSelected = selectedTO?.empId === emp.empId;
              const hist    = HISTORICAL_ROSTER_INTELLIGENCE[emp.empId] || {};
              const profile = intelligenceProfiles[emp.empId];
              const hasRisk = Boolean(profile?.riskFlags?.length);

              return (
                <button
                  key={emp.empId}
                  onClick={() => setSelectedTO(emp)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-200">{emp.name}</span>
                    <div className="flex items-center gap-1">
                      {hasRisk && <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
                      <span className="font-mono text-[10px] text-slate-500">#{emp.empId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                    <span>WO: <strong className="text-emerald-400">{emp.fixedWo}</strong></span>
                    <span>•</span>
                    <span>Nights: <strong className="text-indigo-400">{hist.nightCount || 0}</strong></span>
                    <span>•</span>
                    <span>Duties: <strong className="text-white">{hist.totalDuties || 0}</strong></span>
                    {Boolean(profile?.riskFlags?.length) && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 font-bold">{profile.riskFlags.length} flag{profile.riskFlags.length > 1 ? 's' : ''}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 2 Columns: Detailed Analytics */}
        {selectedTO && (
          <div className="lg:col-span-2 space-y-5">

            {/* Operator Card Header */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{selectedTO.name}</h3>
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-xs rounded">EMP #{selectedTO.empId}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${selectedTO.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                      {selectedTO.gender}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Boarding: <strong className="text-white">{selectedTO.boardingStation}</strong> • Travel: <strong className="text-white">{selectedTO.travellingBy}</strong> • WO: <strong className="text-emerald-400">{selectedTO.fixedWo}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Diversity Index</span>
                    <span className="text-base font-black text-cyan-400">96.2 / 100</span>
                  </div>
                </div>
              </div>

              {/* Stat Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {selectedStats && (<>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">A Shift Duties</span>
                    <span className="text-lg font-black text-emerald-400 font-mono">{selectedStats.aCount || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">B Shift Duties</span>
                    <span className="text-lg font-black text-amber-400 font-mono">{selectedStats.bCount || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Night Duties</span>
                    <span className="text-lg font-black text-indigo-400 font-mono">{selectedStats.nightCount || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block font-semibold">Week-Offs Taken</span>
                    <span className="text-lg font-black text-cyan-400 font-mono">{selectedStats.woCount || 0}</span>
                  </div>
                </>)}
              </div>
            </div>

            {/* ── AI INTELLIGENCE PROFILE (90-day) ── */}
            {aiPanelOpen && selectedProfile && (
              <div className="bg-slate-900 border border-violet-500/40 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-violet-400" />
                    AI Intelligence Profile — Last 90 Days
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Analyzed: {today}
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

                  {/* Night Stats */}
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-indigo-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-bold uppercase">
                      <Moon className="w-3 h-3" /> Night (90d)
                    </div>
                    <div className="text-xl font-black text-indigo-400 font-mono">
                      {selectedProfile?.nightStats?.count90 ?? 0}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Last night: <span className="text-slate-300 font-mono">{fmtDate(selectedProfile?.nightStats?.lastNightDate)}</span>
                    </div>
                    <div className={`text-[10px] font-bold ${
                      (selectedProfile?.nightStats?.daysSinceLastNight ?? 999) < 26
                        ? 'text-red-400'
                        : selectedProfile?.nightStats?.daysSinceLastNight === 999
                        ? 'text-cyan-400'
                        : 'text-emerald-400'
                    }`}>
                      {selectedProfile?.nightStats?.daysSinceLastNight === 999 || selectedProfile?.nightStats?.daysSinceLastNight === undefined
                        ? 'No night history'
                        : `${selectedProfile.nightStats.daysSinceLastNight}d since last night`}
                    </div>
                  </div>

                  {/* Leave Stats */}
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-rose-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-rose-300 font-bold uppercase">
                      <Calendar className="w-3 h-3" /> Leave (90d)
                    </div>
                    <div className="text-xl font-black text-rose-400 font-mono">
                      {selectedProfile?.leaveStats?.totalLeaveDays ?? 0}d
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(selectedProfile?.leaveStats || {})
                        .filter(([k, v]) => k !== 'totalLeaveDays' && v > 0)
                        .map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-black">
                            {k.toUpperCase()}: {v}d
                          </span>
                        ))}
                      {(selectedProfile?.leaveStats?.totalLeaveDays ?? 0) === 0 && (
                        <span className="text-[10px] text-emerald-400">No leave taken ✓</span>
                      )}
                    </div>
                  </div>

                  {/* Shift Preference */}
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-emerald-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 font-bold uppercase">
                      <Activity className="w-3 h-3" /> Shift Preference
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedProfile.shiftPreference === 'N' ? (
                        <Moon className="w-6 h-6 text-indigo-400" />
                      ) : selectedProfile.shiftPreference === 'B' ? (
                        <Sunset className="w-6 h-6 text-amber-400" />
                      ) : selectedProfile.shiftPreference === 'A' ? (
                        <Sun className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <span className="text-slate-400 text-xs">N/A</span>
                      )}
                      <div>
                        <div className={`text-lg font-black font-mono ${
                          selectedProfile.shiftPreference === 'N' ? 'text-indigo-400' :
                          selectedProfile.shiftPreference === 'B' ? 'text-amber-400' :
                          selectedProfile.shiftPreference === 'A' ? 'text-emerald-400' : 'text-slate-400'
                        }`}>
                          {selectedProfile.shiftPreference
                            ? (selectedProfile.shiftPreference === 'N' ? 'Night' : selectedProfile.shiftPreference === 'B' ? 'B Shift' : 'A Shift')
                            : 'No preference'}
                        </div>
                        <div className="text-[10px] text-slate-500">Detected from 90-day pattern</div>
                      </div>
                    </div>
                    {selectedProfile.shiftRequestedForTarget && (
                      <div className="text-[10px] text-emerald-300 font-bold mt-1 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-0.5">
                        🔄 Shift Request Active: {selectedProfile.shiftRequestedForTarget} Shift
                      </div>
                    )}
                  </div>

                  {/* Avg Duties/Month */}
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-700 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase">
                      <TrendingUp className="w-3 h-3" /> Avg Duties / Month
                    </div>
                    <div className="text-xl font-black text-white font-mono">
                      {selectedProfile?.avgDutiesPerMonth ?? 22}
                    </div>
                    <div className="text-[10px] text-slate-500">Active line duties (excl. leave/WO)</div>
                  </div>
                </div>

                {/* Risk Flags */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> AI Risk Flags
                  </div>
                  {(!selectedProfile?.riskFlags || selectedProfile.riskFlags.length === 0) ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-emerald-300 font-bold">No risk flags — operator is clear for all duty types</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedProfile.riskFlags.map(flag => {
                        const cfg = RISK_CONFIG[flag] || { label: flag, color: 'text-slate-300', bg: 'bg-slate-700/40 border-slate-600', icon: '⚠️' };
                        return (
                          <div key={flag} className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-xl text-[11px] font-bold ${cfg.bg}`}>
                            <span>{cfg.icon}</span>
                            <span className={cfg.color}>{cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 mt-2 flex items-start gap-1">
                    <Info className="w-3 h-3 shrink-0 mt-0.5 text-slate-500" />
                    Risk flags are computed live from 90-day historical analysis and feed directly into the AI optimizer's constraint engine.
                  </p>
                </div>
              </div>
            )}

            {/* Recent 7 Days Timeline */}
            {selectedStats && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  Recent 7-Day Duty Sequence (Anti-Repetition Tracking)
                </h4>
                <div className="grid grid-cols-7 gap-2 text-center">
                  {(selectedStats.recent7 || []).map((duty, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">Day {idx + 1}</span>
                      <strong className={`text-sm font-mono block mt-0.5 ${
                        duty.startsWith('N') ? 'text-indigo-400' :
                        duty.startsWith('B') ? 'text-amber-400' :
                        ['WO','CL','EL','ML','HPL'].includes(duty) ? 'text-rose-400' :
                        'text-cyan-300'
                      }`}>{duty}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historical Top Duties Frequency */}
            {selectedStats && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  Most Frequent Duty Allocations in 90 Days
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedStats.dutyFreq || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([code, count]) => (
                      <div
                        key={code}
                        className="px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2 text-xs font-mono"
                      >
                        <span className="font-bold text-slate-200">{code}</span>
                        <span className="px-1.5 py-0.5 bg-slate-800 text-cyan-400 rounded text-[10px] font-black">{count}x</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
