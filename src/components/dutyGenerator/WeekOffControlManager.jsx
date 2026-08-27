import React, { useState } from 'react';
import { 
  Calendar, RefreshCw, Shuffle, ArrowRightLeft, ShieldCheck, AlertTriangle, 
  CheckCircle2, Search, Filter, Edit3, UserCheck, Save, Clock, ArrowRight, 
  Sparkles, Layers, Info, Check, RotateCcw
} from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { db } from '../../firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WeekOffControlManager({
  targetDate,
  crewList = EMPLOYEE_MASTER_REGISTRY,
  onUpdateCrewList,
  onOverrideWO
}) {
  // Working copy of crew week-offs for editing/shuffling before saving
  const [workingCrew, setWorkingCrew] = useState(() => {
    return crewList.map(e => ({ ...e }));
  });

  React.useEffect(() => {
    if (crewList && crewList.length > 0) {
      setWorkingCrew(crewList.map(e => ({ ...e })));
    }
  }, [crewList]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDayFilter, setSelectedDayFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // 'ALL', 'BMRCL_TO', 'JMD_TD', 'PINK'
  const [revisionCycle, setRevisionCycle] = useState('6_MONTHS'); // '6_MONTHS', '1_YEAR', 'QUARTERLY'
  const [cycleLabel, setCycleLabel] = useState('Cycle 2026-H2 (Aug 2026 – Jan 2027)');
  
  // Mutual Swap Modal State
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapOp1Id, setSwapOp1Id] = useState('');
  const [swapOp2Id, setSwapOp2Id] = useState('');

  // Bulk / Single Shuffle Modal State
  const [shuffleModalTO, setShuffleModalTO] = useState(null);
  const [targetWoDay, setTargetWoDay] = useState('Sunday');
  const [shuffleReason, setShuffleReason] = useState('6-Month Periodic Roster Revision');
  const [controllerName, setControllerName] = useState('Crew Controller (CC-1)');

  // Save Confirmation Toast
  const [savedSuccessMsg, setSavedSuccessMsg] = useState('');

  // Audit Log
  const [auditLog, setAuditLog] = useState([
    {
      id: 'AUDIT_01',
      empId: 21029,
      empName: 'Raghavendra K T',
      oldWo: 'Tuesday',
      newWo: 'Wednesday',
      reason: '6-Month Periodic Roster Balancing Revision',
      controller: 'Nagesh N (CC)',
      timestamp: '2026-08-17 18:20'
    },
    {
      id: 'AUDIT_02',
      empId: 20787,
      empName: 'Baskar S',
      oldWo: 'Sunday',
      newWo: 'Monday',
      reason: 'Periodic Line 2 Manpower Optimization',
      controller: 'Nagesh N (CC)',
      timestamp: '2026-08-16 14:10'
    }
  ]);

  const activeTOs = workingCrew.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);
  const totalActive = activeTOs.length;
  const jmdCount = activeTOs.filter(e => String(e.empId).startsWith('8')).length;
  const bmrclCount = Math.max(0, totalActive - jmdCount);
  const pinkCount = activeTOs.filter(e => e.gender === 'FEMALE' || e.specialProfile === 'PINK' || e.pinkDutyEligible).length;

  const targetPerDay = Math.round(totalActive / 7); // ~26 crew per day for 181 active crew

  const filteredTOs = activeTOs.filter(emp => {
    const name = (emp.name || '').toLowerCase();
    const empIdStr = String(emp.empId || '');
    const matchesSearch = !searchQuery || name.includes(searchQuery.toLowerCase()) || empIdStr.includes(searchQuery);
    const fixedWo = emp.fixedWo || 'Sunday';
    const matchesDay = selectedDayFilter === 'ALL' || fixedWo.toLowerCase() === selectedDayFilter.toLowerCase();
    
    let matchesCat = true;
    const isJmd = empIdStr.startsWith('8');
    if (categoryFilter === 'BMRCL_TO') matchesCat = !isJmd;
    else if (categoryFilter === 'JMD_TD') matchesCat = isJmd;
    else if (categoryFilter === 'PINK') matchesCat = emp.gender === 'FEMALE' || emp.specialProfile === 'PINK' || emp.pinkDutyEligible;

    return matchesSearch && matchesDay && matchesCat;
  });

  // Calculate day-wise distribution counts
  const dayDistribution = DAYS_OF_WEEK.map(day => {
    const dayCrew = activeTOs.filter(e => (e.fixedWo || '').toLowerCase() === day.toLowerCase());
    const count = dayCrew.length;
    const jmdInDay = dayCrew.filter(e => String(e.empId).startsWith('8')).length;
    const bmrclInDay = count - jmdInDay;

    return {
      day,
      count,
      jmdInDay,
      bmrclInDay,
      variance: count - targetPerDay
    };
  });

  // Handle single operator week-off change inline
  const handleInlineDayChange = (empId, newDay) => {
    const updated = workingCrew.map(e => {
      if (e.empId === empId) {
        return { ...e, fixedWo: newDay };
      }
      return e;
    });
    setWorkingCrew(updated);
  };

  // Handle single operator shuffle via modal with reason and audit log
  const handleConfirmSingleShuffle = (e) => {
    e.preventDefault();
    if (!shuffleModalTO) return;

    const oldWo = shuffleModalTO.fixedWo || 'Sunday';
    const updated = workingCrew.map(e => {
      if (e.empId === shuffleModalTO.empId) {
        return { ...e, fixedWo: targetWoDay };
      }
      return e;
    });

    setWorkingCrew(updated);

    const auditEntry = {
      id: 'AUDIT_' + Date.now(),
      empId: shuffleModalTO.empId,
      empName: shuffleModalTO.name,
      oldWo,
      newWo: targetWoDay,
      reason: shuffleReason || 'Periodic Roster Shuffling',
      controller: controllerName,
      timestamp: new Date().toLocaleString()
    };

    setAuditLog([auditEntry, ...auditLog]);
    setShuffleModalTO(null);
  };

  // Handle Mutual Week-Off Swap between two operators
  const handleConfirmMutualSwap = (e) => {
    e.preventDefault();
    if (!swapOp1Id || !swapOp2Id || swapOp1Id === swapOp2Id) return;

    const op1 = workingCrew.find(x => x.empId === parseInt(swapOp1Id, 10));
    const op2 = workingCrew.find(x => x.empId === parseInt(swapOp2Id, 10));
    if (!op1 || !op2) return;

    const op1OldWo = op1.fixedWo || 'Sunday';
    const op2OldWo = op2.fixedWo || 'Sunday';

    const updated = workingCrew.map(e => {
      if (e.empId === op1.empId) return { ...e, fixedWo: op2OldWo };
      if (e.empId === op2.empId) return { ...e, fixedWo: op1OldWo };
      return e;
    });

    setWorkingCrew(updated);

    const auditEntry1 = {
      id: 'AUDIT_' + Date.now(),
      empId: op1.empId,
      empName: op1.name,
      oldWo: op1OldWo,
      newWo: op2OldWo,
      reason: `Mutual Week-Off Swap with ${op2.name} (${op2.empId})`,
      controller: controllerName,
      timestamp: new Date().toLocaleString()
    };

    const auditEntry2 = {
      id: 'AUDIT_' + (Date.now() + 1),
      empId: op2.empId,
      empName: op2.name,
      oldWo: op2OldWo,
      newWo: op1OldWo,
      reason: `Mutual Week-Off Swap with ${op1.name} (${op1.empId})`,
      controller: controllerName,
      timestamp: new Date().toLocaleString()
    };

    setAuditLog([auditEntry1, auditEntry2, ...auditLog]);
    setIsSwapModalOpen(false);
    setSwapOp1Id('');
    setSwapOp2Id('');
  };

  // AI Auto-Balance / Auto-Distribute across 7 days evenly
  const handleAutoBalanceWeekOffs = () => {
    const active = [...workingCrew.filter(e => e.status === 'ACTIVE' && !e.isRelieved)];
    // Sort slightly by empId or gender to distribute diversely
    active.sort((a, b) => a.empId - b.empId);

    const balancedCrewMap = new Map();
    active.forEach((emp, index) => {
      const assignedDay = DAYS_OF_WEEK[index % 7];
      balancedCrewMap.set(emp.empId, assignedDay);
    });

    const updated = workingCrew.map(e => {
      if (balancedCrewMap.has(e.empId)) {
        return {
          ...e,
          fixedWo: balancedCrewMap.get(e.empId)
        };
      }
      return e;
    });

    setWorkingCrew(updated);

    const auditEntry = {
      id: 'AUDIT_' + Date.now(),
      empId: 0,
      empName: 'ALL ACTIVE OPERATORS',
      oldWo: 'Various',
      newWo: 'Evenly Distributed (~20/day)',
      reason: `AI Auto-Balancing for ${cycleLabel}`,
      controller: controllerName,
      timestamp: new Date().toLocaleString()
    };

    setAuditLog([auditEntry, ...auditLog]);
  };

  // Reset to original crewList
  const handleResetToCurrent = () => {
    setWorkingCrew(crewList.map(e => ({ ...e })));
  };

  // Save and Apply Revised Week-Off Schedule
  const handleSaveAndApply = async () => {
    if (onUpdateCrewList) {
      onUpdateCrewList(workingCrew);
    }

    try {
      const batch = writeBatch(db);
      workingCrew.forEach(emp => {
        const docRef = doc(db, 'crewRegistry', `crew_${emp.empId}`);
        batch.set(docRef, { fixedWo: emp.fixedWo, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      setSavedSuccessMsg(`Successfully saved and applied Week-Off roster revision to Firestore! Daily duty generator and dispatch consoles now use updated days.`);
    } catch (err) {
      console.warn("Firestore WO batch save error:", err);
      setSavedSuccessMsg(`Locally applied Week-Off roster revision for ${cycleLabel}.`);
    }

    setTimeout(() => setSavedSuccessMsg(''), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <Shuffle className="w-3.5 h-3.5" /> Dynamic 6-Month / 1-Year Revision
            </span>
            <span className="text-xs text-slate-400">
              Total Active: <strong className="text-emerald-400">{totalActive} Staff</strong> (<span className="text-blue-300">{bmrclCount} BMRCL TOs</span> + <span className="text-amber-300">{jmdCount} JMD TDs</span>) (~{targetPerDay} / day)
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Week-Off (WO) Dynamic Revision & Shuffle Desk</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Week-offs dynamically vary every 6 months to 1 year. Shuffle operators between days, perform mutual swaps, or run AI auto-balancing, then save and apply.
          </p>
        </div>

        {/* Global Actions: Auto-Balance, Mutual Swap, Save */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAutoBalanceWeekOffs}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
            title="Automatically distribute active crew equally across all 7 days"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            AI Auto-Balance ({targetPerDay}/day)
          </button>

          <button
            onClick={() => setIsSwapModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
            title="Swap Week-Offs between two Train Operators / Drivers"
          >
            <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
            Mutual Swap
          </button>

          <button
            onClick={handleResetToCurrent}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all"
            title="Reset unsaved edits back to active master"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            onClick={handleSaveAndApply}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20"
          >
            <Save className="w-4 h-4" />
            Save &amp; Apply Roster
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {savedSuccessMsg && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-300 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{savedSuccessMsg}</span>
          </div>
          <button onClick={() => setSavedSuccessMsg('')} className="text-emerald-400 hover:text-white font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Revision Cycle Selector & 7-Day Distribution Ribbon */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-bold">Roster Cycle Policy:</span>
            <select
              value={revisionCycle}
              onChange={(e) => {
                setRevisionCycle(e.target.value);
                setCycleLabel(
                  e.target.value === '6_MONTHS' ? 'Cycle 2026-H2 (Aug 2026 – Jan 2027)' :
                  e.target.value === '1_YEAR' ? 'Annual Cycle 2026–2027 (1 Year)' : 'Quarterly Cycle Q3-2026'
                );
              }}
              className="bg-slate-950 border border-slate-700 text-blue-300 font-bold px-3 py-1.5 rounded-lg text-xs"
            >
              <option value="6_MONTHS">6 Months Periodic Revision (Standard)</option>
              <option value="1_YEAR">1 Year Annual Revision</option>
              <option value="QUARTERLY">Quarterly Revision (3 Months)</option>
            </select>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Active Cycle: <strong className="text-white">{cycleLabel}</strong>
          </div>
        </div>

        {/* 7-Day Quota Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {dayDistribution.map(({ day, count, jmdInDay, bmrclInDay, variance }) => {
            const isSelected = selectedDayFilter.toLowerCase() === day.toLowerCase();
            const isBalanced = Math.abs(variance) <= 3;

            return (
              <button
                key={day}
                onClick={() => setSelectedDayFilter(isSelected ? 'ALL' : day)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected 
                    ? 'bg-blue-600/20 border-blue-500 shadow-md' 
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
                  <span>{day.substring(0, 3)}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isBalanced ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {count} Total
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-400">
                  <span className="text-blue-300 font-bold">TO: {bmrclInDay}</span>
                  <span className="text-amber-300 font-bold">TD: {jmdInDay}</span>
                </div>
                <div className="mt-1.5 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${isBalanced ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, (count / targetPerDay) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[9px] text-slate-500 font-mono flex justify-between">
                  <span>Target: {targetPerDay}</span>
                  <span className={variance > 0 ? 'text-amber-400' : variance < 0 ? 'text-cyan-400' : 'text-emerald-400'}>
                    {variance > 0 ? `+${variance}` : variance < 0 ? `${variance}` : '✓ Optimal'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search operator name or emp ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 mr-2">
            {[
              { id: 'ALL', label: `All (${totalActive})` },
              { id: 'BMRCL_TO', label: `BMRCL TOs (${bmrclCount})` },
              { id: 'JMD_TD', label: `JMD TDs (${jmdCount})` },
              { id: 'PINK', label: `🌸 Pink (${pinkCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  categoryFilter === tab.id 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedDayFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${selectedDayFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              All Days
            </button>
            {DAYS_OF_WEEK.map(d => (
              <button
                key={d}
                onClick={() => setSelectedDayFilter(d)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${selectedDayFilter === d ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {d.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Operator Table with Inline Day Shuffle Dropdowns */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            Active Crew Week-Off Dynamic Roster ({filteredTOs.length} Operators)
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Click dropdown or "Shuffle" to change Week-Off day
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Emp ID</th>
                <th className="px-4 py-3">Crew Member Name</th>
                <th className="px-4 py-3">Category &amp; Role</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Current Week-Off</th>
                <th className="px-4 py-3">Shuffle To Target Day</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredTOs.map(emp => {
                const currentDay = emp.fixedWo || 'Sunday';
                const isJmd = String(emp.empId).startsWith('8');

                return (
                  <tr key={emp.empId} className="hover:bg-slate-800/40 transition-colors">
                    <td className={`px-4 py-3 font-mono font-bold ${isJmd ? 'text-amber-400' : 'text-white'}`}>
                      #{emp.empId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-100 flex items-center gap-1.5">
                        {emp.name}
                        {emp.specialProfile === 'PINK' && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-pink-500/20 text-pink-300 rounded border border-pink-500/30">
                            🌸 Pink
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isJmd ? (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold">
                          TD (JMD Contract)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-[10px] font-bold">
                          TO (BMRCL Regular)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${emp.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-300' : 'bg-slate-800 text-slate-300'}`}>
                        {emp.gender}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold">
                        {currentDay}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={currentDay}
                        onChange={(e) => handleInlineDayChange(emp.empId, e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {DAYS_OF_WEEK.map(d => (
                          <option key={d} value={d}>
                            {d} {d === currentDay ? '(Current)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setShuffleModalTO(emp);
                          setTargetWoDay(currentDay);
                        }}
                        className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        Log Shuffle
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log & Revision History */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-blue-400" />
          Week-Off Reshuffle & Override Audit Trail
        </h3>
        
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {auditLog.map(log => (
            <div key={log.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-white">{log.empName}</span>
                {log.empId > 0 && <span className="font-mono text-slate-400 ml-1">({log.empId})</span>}
                <div className="text-slate-400 text-[11px] mt-0.5">
                  Changed from <strong className="text-rose-300">{log.oldWo}</strong> → <strong className="text-emerald-300">{log.newWo}</strong>
                  <span className="ml-2 italic text-slate-500">"{log.reason}"</span>
                </div>
              </div>
              <div className="text-right text-[10px] text-slate-500 font-mono">
                <div>By: {log.controller}</div>
                <div>{log.timestamp}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-Modal 1: Single TO Shuffle with Audit Log */}
      {shuffleModalTO && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 text-slate-100 font-sans">
            <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
              <Shuffle className="w-5 h-5 text-blue-400" />
              Shuffle Week-Off: {shuffleModalTO.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Current Week-Off: <strong className="text-emerald-400">{shuffleModalTO.fixedWo || 'Sunday'}</strong>. Select target day to shuffle.
            </p>

            <form onSubmit={handleConfirmSingleShuffle} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Target Week-Off Day
                </label>
                <select
                  value={targetWoDay}
                  onChange={(e) => setTargetWoDay(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  {DAYS_OF_WEEK.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Reason for Revision / Shuffle
                </label>
                <input
                  type="text"
                  value={shuffleReason}
                  onChange={(e) => setShuffleReason(e.target.value)}
                  required
                  placeholder="e.g. 6-Month Roster Revision / Manpower Rebalancing"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Crew Controller Name
                </label>
                <input
                  type="text"
                  value={controllerName}
                  onChange={(e) => setControllerName(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShuffleModalTO(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg"
                >
                  Apply Shuffle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Modal 2: Mutual Week-Off Swap */}
      {isSwapModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl w-full max-w-lg shadow-2xl p-6 text-slate-100 font-sans">
            <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
              Mutual Week-Off Swap
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Select two operators to mutually exchange their assigned Week-Off days.
            </p>

            <form onSubmit={handleConfirmMutualSwap} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  First Operator (Operator A)
                </label>
                <select
                  value={swapOp1Id}
                  onChange={(e) => setSwapOp1Id(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="">-- Select Operator A --</option>
                  {activeTOs.map(emp => (
                    <option key={emp.empId} value={emp.empId}>
                      {emp.name} ({emp.empId}) — Current WO: {emp.fixedWo || 'Sunday'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Second Operator (Operator B)
                </label>
                <select
                  value={swapOp2Id}
                  onChange={(e) => setSwapOp2Id(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="">-- Select Operator B --</option>
                  {activeTOs.filter(x => String(x.empId) !== swapOp1Id).map(emp => (
                    <option key={emp.empId} value={emp.empId}>
                      {emp.name} ({emp.empId}) — Current WO: {emp.fixedWo || 'Sunday'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSwapModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-lg"
                >
                  Execute Mutual Swap
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
